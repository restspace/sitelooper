/**
 * A click on a link whose app fetches the next page and only then pushes its
 * url (Turbo Drive), against a server slower than the settle's network budget:
 * the click's action observation waits for the navigation the link's own href
 * promises (src/execution/action.ts LINK_NAV_WAIT_MS). fwop2-n1 recorded
 * OpenProject's "Bench Project" link as landing on the project list it was
 * clicked on, and both replays were refused for arriving at the project.
 * Browser-gated:
 *   BP_BROWSER_TESTS=1 npx vitest run test/linknav.browser.test.ts --pool=forks --poolOptions.forks.maxForks=1
 */
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { executeTool } from '../src/agent/tools.js';
import { BrowserSession } from '../src/daemon/browser.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

/** How long the server takes to answer the project page: past the 2s network cap and the 5s long-open cutoff. */
const SLOW_MS = 6_000;

const LIST = `<!doctype html><html><head><title>Projects</title></head><body>
<main><h1>Projects</h1><a id="bench" href="/projects/bench-project">Bench Project</a>
<a id="modal" href="/projects/bench-project/modal">Details</a></main>
<script>
  // Turbo Drive, in miniature: fetch the page, and only once it answers, push the url.
  document.getElementById('bench').addEventListener('click', async (e) => {
    e.preventDefault();
    const href = e.currentTarget.href;
    const html = await (await fetch(href)).text();
    history.pushState({}, '', href);
    document.body.innerHTML = html;
  });
  // A link its page handles itself: nothing is asked of the server.
  document.getElementById('modal').addEventListener('click', (e) => {
    e.preventDefault();
    const d = document.createElement('div');
    d.setAttribute('role', 'dialog');
    d.textContent = 'Details';
    document.body.append(d);
  });
</script></body></html>`;

d('a link whose navigation commits only after the server answers (real page)', () => {
  let server: http.Server;
  let origin = '';
  let home = '';
  let session: BrowserSession;
  const dir = os.tmpdir();

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/projects/bench-project') {
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end('<main><h1>Bench Project</h1><a href="/projects/bench-project/work_packages">Work packages</a></main>');
        }, SLOW_MS);
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(LIST);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-linknav-'));
    process.env.SITELOOPER_HOME = home;
    process.env.SITELOOPER_SKILLS_DIR = path.join(home, 'skills');
    process.env.SITELOOPER_COMPONENTS_FILE = path.join(home, 'components.json');
    session = new BrowserSession({ session: `linknav-${Date.now()}`, persist: false, learn: true });
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (home) fs.rmSync(home, { recursive: true, force: true });
  });

  it('the click settles on the page the link points to, not the one it left', async () => {
    const page = await session.getPage();
    await page.goto(`${origin}/projects`);
    const started = Date.now();
    const out = await executeTool(session, 'click', { target: '#bench' }, dir);
    expect(out.isError, out.result).toBe(false);
    expect(page.url()).toBe(`${origin}/projects/bench-project`);
    expect(Date.now() - started).toBeGreaterThanOrEqual(SLOW_MS - 500);
    expect(out.result).not.toContain('had not committed');
    expect(await page.locator('h1').textContent()).toBe('Bench Project');
  }, 60_000);

  it('a link its page handles without asking the server settles at once', async () => {
    const page = await session.getPage();
    await page.goto(`${origin}/projects`);
    const started = Date.now();
    const out = await executeTool(session, 'click', { target: '#modal' }, dir);
    expect(out.isError, out.result).toBe(false);
    expect(page.url()).toBe(`${origin}/projects`);
    expect(Date.now() - started).toBeLessThan(4_000);
  }, 60_000);
});
