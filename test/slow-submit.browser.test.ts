/**
 * A click whose submit the server is slow to answer went out: Playwright logs
 * "click action done" and then waits for the navigation it scheduled, and a
 * timeout in that wait is not a click that failed.
 *
 * snipeit fwsi27-n2 02-create: Save POSTed /hardware, the server answered
 * after 26.5s, the 10s tier timed out and the deadline refusal reported
 * "click NOT dispatched" — inviting a second submit, which the forced tier
 * would have sent itself had budget been left.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/slow-submit.browser.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { BrowserSession } from '../src/daemon/browser.js';
import { robustClick } from '../src/execution/browser.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

const FORM = `<!doctype html><html><body>
<form method="post" action="/save"><input name="tag" value="BA-1"><button>Save</button></form>
</body></html>`;

d('a click whose submit is still loading', () => {
  let session: BrowserSession;
  let page: Page;
  let posts = 0;

  beforeAll(async () => {
    session = new BrowserSession({ session: `slow-submit-${Date.now()}`, persist: false });
    page = await session.getPage();
    await page.route('http://slow.test/**', async (route) => {
      if (route.request().method() === 'POST') {
        posts++;
        await new Promise((r) => setTimeout(r, 3_000));
        return route.fulfill({ contentType: 'text/html', body: '<p>saved</p>' });
      }
      return route.fulfill({ contentType: 'text/html', body: FORM });
    });
  }, 60_000);
  afterAll(async () => {
    await session?.close();
  });

  it('is reported as gone out, and Save is clicked once', async () => {
    await page.goto('http://slow.test/form');
    const result = await robustClick(page.getByRole('button', { name: 'Save' }), { timeout: 1_000 });
    expect(result).toMatch(/went out, but the page it started had not finished loading/);
    await page.waitForURL('http://slow.test/save', { timeout: 10_000 });
    expect(await page.locator('p').textContent()).toBe('saved');
    expect(posts).toBe(1);
  }, 30_000);
});
