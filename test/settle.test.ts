import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import { waitForContent } from '../src/daemon/refs.js';
import { inFlightRequests, installRequestTracking, settleDom, settlePage } from '../src/daemon/settle.js';

/**
 * Browser-gated, as test/diff.test.ts:
 *   BP_BROWSER_TESTS=1 npx vitest run test/settle.test.ts
 * The point of every case here is a wait that USED to be a fixed sleep: the
 * assertions are about elapsed time as much as about the result, because a
 * condition that resolves correctly but no faster is not the fix.
 */
const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

describe('request tracking (no browser)', () => {
  it('reads a page it never tracked as idle', () => {
    expect(inFlightRequests({} as never)).toBe(0);
  });
});

const STATIC = `<!doctype html><html><head><title>Static</title></head><body>
<h1>Static</h1><button id="go">Go</button><button id="poll">Poll</button>
<div id="out"></div>
<script>
  document.getElementById('go').addEventListener('click', () => {
    fetch('/slow').then((r) => r.text()).then((t) => { document.getElementById('out').textContent = t; });
  });
  document.getElementById('poll').addEventListener('click', () => { fetch('/longpolling/poll'); });
</script>
</body></html>`;

const EMPTY = `<!doctype html><html><head><title>Late</title></head><body><script>
  setTimeout(() => { document.body.innerHTML = '<button id="late">Late</button>'; }, 300);
</script></body></html>`;

d('settle (real page)', () => {
  let session: BrowserSession;
  const BASE = 'http://settle.test/';

  // A routed origin rather than a data: URL: relative fetches ('/slow') need a
  // real base to resolve against, and the point of these cases is the fetch.
  const serve = async (page: import('playwright-core').Page) => {
    await page.route('http://settle.test/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: STATIC });
      if (url.pathname === '/late') return route.fulfill({ status: 200, contentType: 'text/html', body: EMPTY });
      if (url.pathname === '/slow') {
        await new Promise((r) => setTimeout(r, 600));
        return route.fulfill({ status: 200, contentType: 'text/plain', body: 'answered' });
      }
      // /longpolling/poll and /stuck are never answered, exactly like the real thing
      if (url.pathname === '/longpolling/poll' || url.pathname === '/stuck') return;
      return route.fulfill({ status: 404, body: '' });
    });
  };

  beforeAll(async () => {
    process.env.SITELOOPER_HOME = path.join(os.tmpdir(), `bp-settle-test-${Date.now()}`);
    session = new BrowserSession({ session: 'settle', persist: false });
    await serve(await session.getPage());
  }, 60_000);

  afterAll(async () => {
    await session?.close();
  });

  it('settleDom on a static page costs the probe, not the quiet window', async () => {
    const page = await session.getPage();
    await page.goto(BASE);
    await settleDom(page); // the first one may catch the load's own mutations
    const t0 = Date.now();
    await settleDom(page);
    expect(Date.now() - t0).toBeLessThan(200);
  }, 30_000);

  it('settlePage waits for a fetch the click starts, and returns when it lands', async () => {
    const page = await session.getPage();
    await page.goto(BASE);
    installRequestTracking(page);
    const t0 = Date.now();
    await page.click('#go');
    await settlePage(page, { maxMs: 3_000 });
    const elapsed = Date.now() - t0;
    expect(await page.locator('#out').textContent()).toBe('answered');
    expect(elapsed).toBeGreaterThan(400); // it really waited for the answer
    expect(elapsed).toBeLessThan(3_500); // and it is bounded
  }, 30_000);

  it('does not wait out a long-poll', async () => {
    const page = await session.getPage();
    await page.goto(BASE);
    installRequestTracking(page);
    await page.click('#poll');
    const t0 = Date.now();
    await settlePage(page);
    expect(Date.now() - t0).toBeLessThan(1_000); // no 2s deadline paid
  }, 30_000);

  it('settlePage is bounded when the page never stops asking', async () => {
    const page = await session.getPage();
    await page.goto(BASE);
    installRequestTracking(page);
    await page.evaluate(() => {
      void fetch('/stuck');
    });
    const t0 = Date.now();
    await settlePage(page, { maxMs: 800 });
    expect(Date.now() - t0).toBeLessThan(1_800);
  }, 30_000);

  it('waitForContent returns as soon as content appears, not at a poll tick', async () => {
    const page = await session.getPage();
    const t0 = Date.now();
    await page.goto(BASE + 'late');
    await waitForContent(page, 5_000);
    const elapsed = Date.now() - t0;
    expect(await page.locator('#late').count()).toBe(1);
    expect(elapsed).toBeLessThan(1_500);
  }, 30_000);

  it('waitForContent returns immediately on a page that already has content', async () => {
    const page = await session.getPage();
    await page.goto(BASE);
    const t0 = Date.now();
    await waitForContent(page, 5_000);
    expect(Date.now() - t0).toBeLessThan(200);
  }, 30_000);
});
