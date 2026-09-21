/**
 * An input action whose target cannot take the keys fails BEFORE it touches
 * the page (the shared reactSafeFill and typeWithRecipe, which the daemon's
 * tools and the compiled artifact both run). fwsi1 03-create: a `type` into
 * select2's rendered <span> sent its keys to the field that still had focus
 * (the asset name), and a failed `fill` on that span had first CLICKED it
 * open, a side effect the recording never saw.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/input-target.browser.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { BrowserSession } from '../src/daemon/browser.js';
import { reactSafeFill } from '../src/execution/browser.js';
import { snapshotBook, typeWithRecipe } from '../src/execution/recipes.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

const PAGE = `<!doctype html><html><body>
<input id="name" aria-label="Name" value="Asset">
<div id="sel" role="combobox" aria-label="Model"><span id="shown" class="rendered">Select a model</span></div>
<div id="opener">Pick one</div>
<ul id="popup" hidden><li>Option</li></ul>
<div id="ce" contenteditable="true"></div>
<div id="wrap" tabindex="-1"><input id="inner" aria-label="Inner"></div>
<label id="lab"><span id="caption">Serial</span> <input id="serial"></label>
<script>
document.getElementById('opener').addEventListener('click', () => { document.getElementById('popup').hidden = false; });
document.getElementById('shown').addEventListener('click', () => { document.getElementById('popup').hidden = false; });
// a combobox wrapper that hands its focus to the field inside it
document.getElementById('wrap').addEventListener('focus', () => document.getElementById('inner').focus());
</script>
</body></html>`;

/** No recipe at all: the ladders go straight to the native primitive, as they do for select2 (no set-value recipe for aria-combobox). */
const NO_RECIPES = snapshotBook({ version: 1, recipes: [] });

d('an input action on a target that cannot take the keys', () => {
  let session: BrowserSession;
  let page: Page;

  beforeAll(async () => {
    session = new BrowserSession({ session: `input-target-${Date.now()}`, persist: false });
    page = await session.getPage();
  }, 60_000);
  afterAll(async () => {
    await session?.close();
  });
  beforeEach(async () => {
    await page.setContent(PAGE);
  });

  const value = (sel: string) => page.locator(sel).evaluate((el) => (el as HTMLInputElement).value ?? (el as HTMLElement).innerText);
  const popupOpen = () => page.locator('#popup').isVisible();

  it('type into a non-focusable span fails, and the field that had focus keeps its value', async () => {
    await page.locator('#name').focus();
    await expect(typeWithRecipe(page, page.locator('#shown'), 'Bench Laptop Model', NO_RECIPES, { timeout: 5_000 })).rejects.toThrow(
      /cannot take keyboard focus/,
    );
    expect(await value('#name')).toBe('Asset');
  });

  it('fill on a div whose click opens a popup fails without clicking it', async () => {
    await expect(reactSafeFill(page.locator('#opener'), 'x')).rejects.toThrow(/not a field that can be filled/);
    expect(await popupOpen()).toBe(false);
    await expect(reactSafeFill(page.locator('#shown'), 'x')).rejects.toThrow(/<span>/);
    expect(await popupOpen()).toBe(false);
  });

  it('still types into a contenteditable, a wrapper whose focus lands inside it, and a plain input', async () => {
    await typeWithRecipe(page, page.locator('#ce'), 'typed body', NO_RECIPES, { timeout: 5_000 });
    expect((await value('#ce')).trim()).toBe('typed body');
    await typeWithRecipe(page, page.locator('#wrap'), 'inner text', NO_RECIPES, { timeout: 5_000 });
    expect(await value('#inner')).toBe('inner text');
    await typeWithRecipe(page, page.locator('#serial'), 'SN-2', NO_RECIPES, { timeout: 5_000 });
    expect(await value('#serial')).toBe('SN-2');
  });

  it('still fills an input, a contenteditable, and the caption inside a label (its control)', async () => {
    await reactSafeFill(page.locator('#name'), 'Renamed');
    expect(await value('#name')).toBe('Renamed');
    await reactSafeFill(page.locator('#ce'), 'filled body');
    expect((await value('#ce')).trim()).toBe('filled body');
    await reactSafeFill(page.locator('#caption'), 'SN-1');
    expect(await value('#serial')).toBe('SN-1');
  });
});
