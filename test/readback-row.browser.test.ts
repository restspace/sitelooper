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
import { captureReadBack, makeLocator, setIdentityHints, type LocatorCandidate } from '../src/daemon/recorder.js';
import { pinPart } from '../src/agent/readback.js';

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
    // Round 57's part pinning counts rendered matches only; two RENDERED
    // records are still two, and still refused.
    expect(await pinPart(page, 'fwod9-n1 Bench Customer', 'customer')).toBeNull();
  });

  it('pins a part past a copy of it that is not rendered (fwkb41 column titles)', async () => {
    const page = await session.getPage();
    await page.setContent(`
      <table><tr><th><a href="#">Ready</a></th><th><a href="#">Done</a></th></tr>
      <tr><td><div style="display:none">Ready</div></td><td><div style="display:none">Done</div></td></tr></table>`);
    expect(await captureReadBack(page, 'Ready', 'col')).toBeNull(); // counted the hidden copy
    const step = await pinPart(page, 'Ready', 'col');
    expect(step).not.toBeNull();
    expect(step!.label).toBe('col');
    expect(JSON.parse(step!.result!)).toBe('Ready');
  });
});

/**
 * A read of the value the instruction itself typed, in the row that value
 * created (RepairDesk fwrd58/71/74/87). Recorded adding "Part A" — the only
 * row — the name cell's anchor `tr hasText "Part A"` was refused as circular,
 * so `part_name` fell to `tbody > tr > td:nth-of-type(1)`; replayed adding
 * "Part B" as a second row, it read the FIRST row and published Part A.
 */
const PARTS = (rows: string[]) => `
  <section><div><table><tbody>
    ${rows.map((r) => `<tr><td>${r}</td><td>12.50</td><td>25%</td></tr>`).join('')}
  </tbody></table></div></section>`;

d('captureReadBack: a typed value read from the row it created', () => {
  let session: BrowserSession;
  beforeAll(async () => {
    session = new BrowserSession({ session: `readback-echo-${Date.now()}`, persist: false });
  });
  afterAll(async () => {
    setIdentityHints([]);
    await session?.close();
  });

  it('anchors the read to the typed value’s row, so a second record re-binds to its own', async () => {
    const page = await session.getPage();
    await page.setContent(PARTS(['Part A']));
    setIdentityHints(['Part A']); // typed during the instruction
    const step = await captureReadBack(page, 'Part A', 'part_name');
    expect(step).not.toBeNull();
    const chain = step!.locators.target.chain ?? [];
    expect(chain[0].kind).toBe('scoped');
    expect((chain[0] as { hasText: string }).hasText).toBe('Part A');
    // Compile slots the typed value in the anchor; the next run adds Part B
    // BELOW Part A and must read Part B's row, not row 1.
    await page.setContent(PARTS(['Part A', 'Part B']));
    const replayed = { ...chain[0], hasText: 'Part B' } as LocatorCandidate;
    expect((await makeLocator(page, replayed).innerText()).trim()).toBe('Part B');
  });

  it('still refuses a row anchor naming a value nobody typed (the circularity rule)', async () => {
    const page = await session.getPage();
    await page.setContent(PARTS(['Part A']));
    setIdentityHints([]);
    const step = await captureReadBack(page, 'Part A', 'part_name');
    expect((step?.locators.target.chain ?? []).some((c) => c.kind === 'scoped')).toBe(false);
  });

  it('still refuses an anchor whose cell only CONTAINS a typed value', async () => {
    const page = await session.getPage();
    await page.setContent(PARTS(['fwrd58 Part A']));
    setIdentityHints(['fwrd58']); // the runid, not the whole value read
    const step = await captureReadBack(page, 'fwrd58 Part A', 'part_name');
    expect((step?.locators.target.chain ?? []).some((c) => c.kind === 'scoped')).toBe(false);
  });

  it('refuses the anchor when two rows show the typed value (an earlier run’s record)', async () => {
    const page = await session.getPage();
    await page.setContent(PARTS(['Part A', 'Part A']));
    setIdentityHints(['Part A']);
    expect(await captureReadBack(page, 'Part A', 'part_name')).toBeNull();
  });
});

/** The first css candidate of a pinned read, for a direct look (the chain's own resolution is replay's business). */
function resolveCss(step: NonNullable<Awaited<ReturnType<typeof captureReadBack>>>): string {
  const css = step.locators.target.chain?.find((c) => c.kind === 'css') as { selector: string; nth?: number } | undefined;
  if (!css) throw new Error(`no css candidate in ${JSON.stringify(step.locators.target.chain)}`);
  return css.nth ? `${css.selector} >> nth=${css.nth}` : css.selector;
}
