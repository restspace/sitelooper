/**
 * A key press submits FROM the field that has focus, so the pre-submit check
 * leaves focus where the recording left it (the shared restoreStandingFills,
 * which the daemon's replay and the compiled artifact both run).
 *
 * snipeit fwsi26 03-create: the recording clicked Purchase Date (its date
 * picker opened), filled it and pressed Enter 60ms later with focus never
 * leaving the field, and the form submitted. The replay's check blurred the
 * field, the press focused it again, and the picker, opened afresh by that
 * focus, took the Enter: no POST. The widget below is a MODEL of that shape,
 * not Snipe-IT's picker: it takes the first Enter after focus arrives unless
 * a value was entered since.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/press-focus.browser.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { BrowserSession } from '../src/daemon/browser.js';
import { noteFill, restoreStandingFills, standingFills } from '../src/execution/refill.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

const PAGE = `<!doctype html><html><body>
<form id="f"><input id="date" aria-label="Purchase Date"><button id="save">Save</button></form>
<div id="picker" hidden>March 2026</div>
<script>
const date = document.getElementById('date');
const picker = document.getElementById('picker');
let fresh = false;
date.addEventListener('focus', () => { picker.hidden = false; fresh = true; });
date.addEventListener('blur', () => { picker.hidden = true; });
date.addEventListener('input', () => { fresh = false; });
date.addEventListener('keydown', (e) => { if (e.key === 'Enter' && fresh) { e.preventDefault(); fresh = false; picker.hidden = true; } });
document.getElementById('f').addEventListener('submit', (e) => { e.preventDefault(); document.body.dataset.submitted = 'yes'; });
</script>
</body></html>`;

d('a key press after the pre-submit check', () => {
  let session: BrowserSession;
  let page: Page;

  beforeAll(async () => {
    session = new BrowserSession({ session: `press-focus-${Date.now()}`, persist: false });
    page = await session.getPage();
  }, 60_000);
  afterAll(async () => {
    await session?.close();
  });
  beforeEach(async () => {
    await page.setContent(PAGE);
  });

  /** The recording's gestures: click the field, fill it, then the check the replay runs before the key, then the key. */
  const replay = async (tool: string) => {
    const date = page.locator('#date');
    await date.click();
    await date.fill('2026-03-15');
    const ledger = standingFills();
    await noteFill(ledger, date, '2026-03-15', page);
    await restoreStandingFills(page, ledger, tool, 'step 16');
    await date.press('Enter');
    return page.evaluate(() => document.body.dataset.submitted ?? 'no');
  };

  it('submits, as the recording did: the check before a press leaves the field focused', async () => {
    expect(await replay('press')).toBe('yes');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('date');
  });

  it('the old blur loses the Enter to the widget (the mechanism fwsi26 hit)', async () => {
    expect(await replay('click')).toBe('no');
  });
});
