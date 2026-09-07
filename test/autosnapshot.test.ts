import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { executeTool } from '../src/agent/tools.js';
import { BrowserSession } from '../src/daemon/browser.js';
import { resolveTarget } from '../src/daemon/refs.js';

/**
 * A diff line names a role and a name, and rule 4b tells the operator to turn
 * that into `role=button[name="Save"]` with no snapshot in between. That only
 * works if such a target reaches page.locator untouched, which is the whole of
 * what resolveTarget has to do with it.
 */
describe('resolveTarget passes role= selectors through', () => {
  const page = { locator: (s: string) => s } as unknown as Parameters<typeof resolveTarget>[0];

  it('hands a role selector to the locator engine verbatim', () => {
    expect(resolveTarget(page, 'role=button[name="Save"]')).toBe('role=button[name="Save"]');
    expect(resolveTarget(page, ' role=textbox[name="Order Reference"] ')).toBe('role=textbox[name="Order Reference"]');
  });

  it('still routes an @ref through the aria-ref engine', () => {
    expect(resolveTarget(page, '@e12')).toBe('aria-ref=e12');
    expect(resolveTarget(page, '@f1e2')).toBe('aria-ref=f1e2');
  });
});

/**
 * Browser-backed: needs an installed Chrome/Edge, so opt-in like diff.test.ts.
 *   BP_BROWSER_TESTS=1 npx vitest run test/autosnapshot.test.ts
 */
const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

// Served through page.route rather than data: URLs — Chromium refuses a
// top-level navigation to a data: URL, and a click that navigates is the whole
// point of this file.
const SECOND = `<!doctype html><html><head><title>Second</title></head><body>
<h1>Second page</h1>
<input id="ref" aria-label="Order Reference">
<button id="save">Save</button>
</body></html>`;

const FIRST = `<!doctype html><html><head><title>First</title></head><body>
<h1>First page</h1>
<button id="go">Go to second</button>
<button id="one-more">One more</button>
<button id="late">Late</button>
<ul id="rows"></ul>
<script>
  document.getElementById('go').addEventListener('click', () => {
    location.href = '/second';
  });
  let n = 0;
  document.getElementById('late').addEventListener('click', () => {
    setTimeout(() => {
      const p = document.createElement('p');
      p.setAttribute('role', 'status');
      p.textContent = 'Saved late!';
      document.body.appendChild(p);
    }, 300); // deferred, the way a real app answers a click
  });
  document.getElementById('one-more').addEventListener('click', () => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.textContent = 'Widget ' + (++n);
    document.getElementById('rows').appendChild(li);
  });
</script>
</body></html>`;

const ORIGIN = 'http://autosnap.test';
const firstUrl = `${ORIGIN}/first`;

d('observation folded into the action (real page)', () => {
  let session: BrowserSession;
  const run = (name: string, args: Record<string, unknown>) => executeTool(session, name, args, os.tmpdir());

  beforeAll(async () => {
    process.env.SITELOOPER_HOME = path.join(os.tmpdir(), `bp-autosnap-test-${Date.now()}`);
    session = new BrowserSession({ session: 'autosnap', persist: false });
    const page = await session.getPage();
    await page.route(`${ORIGIN}/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: route.request().url().endsWith('/second') ? SECOND : FIRST }),
    );
    await page.goto(firstUrl);
  }, 60_000);

  afterAll(async () => {
    await session?.close();
  });

  it('a click that navigates comes back with the new page and its refs', async () => {
    const out = await run('click', { target: '#go' });
    expect(out.isError).toBe(false);
    expect(out.result).toContain('[page:');
    expect(out.result).toMatch(/\[@e\d+\]/);
    expect(out.result).toContain('Save');
    // and it says so, so the loop can stale the snapshots it superseded
    expect(out.snapshotIncluded).toBe(true);
    // the url fact survives alongside the snapshot
    expect(out.result).toContain('[state:');
  }, 60_000);

  it('a ref from the folded-in snapshot resolves, and so does role= by name', async () => {
    const page = await session.getPage();
    const out = await run('click', { target: 'role=button[name="Save"]' });
    expect(out.isError).toBe(false);
    // a ref minted by the auto-snapshot is live
    const snap = await run('snapshot', {});
    const ref = /textbox "Order Reference".*?\[@(e\d+)\]/.exec(snap.result)?.[1];
    expect(ref, 'the folded-in snapshot should mint resolvable refs').toBeTruthy();
    await page.locator(`aria-ref=${ref}`).fill('SO-1');
    expect(await page.locator('#ref').inputValue()).toBe('SO-1');
  }, 60_000);

  it('goto reports the page it landed on, not just its url', async () => {
    const out = await run('goto', { url: firstUrl });
    expect(out.result).toContain('[page:');
    expect(out.result).toContain('Go to second');
    expect(out.snapshotIncluded).toBe(true);
  }, 60_000);

  // A diff taken before the app has answered says "no visible change" and
  // costs the agent the wait_for turn the diff exists to spare it.
  it('waits out a deferred effect instead of reporting no visible change', async () => {
    const out = await run('click', { target: '#late' });
    expect(out.result).not.toContain('no visible change');
    expect(out.result).toContain('Saved late!');
  }, 60_000);

  // The other half of the bargain: a small change must NOT re-mint refs, or an
  // agent halfway through filling a form by @ref loses every handle it holds.
  it('a small change keeps the old diff and leaves refs alone', async () => {
    const page = await session.getPage();
    const before = await run('snapshot', {});
    const ref = /button "One more".*?\[@(e\d+)\]/.exec(before.result)?.[1];
    expect(ref).toBeTruthy();

    const out = await run('click', { target: '#one-more' });
    expect(out.result).toContain('[state:');
    expect(out.result).toContain('Widget 1');
    expect(out.result).not.toContain('[page:');
    expect(out.snapshotIncluded).toBeFalsy();

    // the ref the agent was still holding survives the action
    await page.locator(`aria-ref=${ref}`).click({ timeout: 5_000 });
    expect(await page.locator('#rows li').count()).toBe(2);
  }, 60_000);
});
