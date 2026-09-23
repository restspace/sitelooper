/**
 * Ambiguity within ONE record is not ambiguity (round 56, odoo fwod82).
 *
 * An Odoo order line shows its product twice — the product column and the
 * description column — so captureReadBack's text match counted 2, found no
 * row anchor that was not the value itself, and refused. fwod82 04-change
 * reported `line1_product: "[FURN_1118] Corner Desk Left Sit"` and nothing
 * pinned it. Every match inside the same row is one record showing one
 * value twice: pinned there. fwod9's hazard — the same text in two DIFFERENT
 * records, an earlier run's and this run's — still refuses.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/readback-row.browser.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import { captureReadBack } from '../src/daemon/recorder.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

const ORDER_LINES = `
  <h1>S00021</h1>
  <table class="o_list_table"><tbody>
    <tr class="o_data_row"><td>[FURN_1118] Corner Desk Left Sit</td><td>[FURN_1118] Corner Desk Left Sit</td><td>5.00</td><td>85.00</td></tr>
    <tr class="o_data_row"><td>[FURN_7777] Office Chair</td><td>[FURN_7777] Office Chair</td><td>2.00</td><td>70.00</td></tr>
  </tbody></table>`;

d('captureReadBack: one record showing one value twice', () => {
  let session: BrowserSession;
  beforeAll(async () => {
    session = new BrowserSession({ session: `readback-row-${Date.now()}`, persist: false });
  });
  afterAll(async () => {
    await session?.close();
  });

  it('pins a value every match of which sits in the same row (fwod82 line1_product)', async () => {
    const page = await session.getPage();
    await page.setContent(ORDER_LINES);
    const step = await captureReadBack(page, '[FURN_1118] Corner Desk Left Sit', 'line1_product');
    expect(step).not.toBeNull();
    expect(step!.label).toBe('line1_product');
    // The pinned chain re-reads the product of THAT row, not the chair's.
    const loc = page.locator(resolveCss(step!));
    expect((await loc.first().innerText()).trim()).toBe('[FURN_1118] Corner Desk Left Sit');
  });

  it('still refuses the same text in two different records (fwod9)', async () => {
    const page = await session.getPage();
    await page.setContent(`
      <table><tbody>
        <tr><td>fwod9-n1 Bench Customer</td><td>Benchville</td></tr>
        <tr><td>fwod9-n1 Bench Customer</td><td>Otherton</td></tr>
      </tbody></table>`);
    expect(await captureReadBack(page, 'fwod9-n1 Bench Customer', 'customer')).toBeNull();
  });
});

/** The first css candidate of a pinned read, for a direct look (the chain's own resolution is replay's business). */
function resolveCss(step: NonNullable<Awaited<ReturnType<typeof captureReadBack>>>): string {
  const css = step.locators.target.chain?.find((c) => c.kind === 'css') as { selector: string; nth?: number } | undefined;
  if (!css) throw new Error(`no css candidate in ${JSON.stringify(step.locators.target.chain)}`);
  return css.nth ? `${css.selector} >> nth=${css.nth}` : css.selector;
}
