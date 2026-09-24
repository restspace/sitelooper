/**
 * Round 57, EspoCRM fwec10 02-create: n1 reported `stage: "Negotiation"`, but
 * only from an eval. The saved record's detail view shows the stage in its
 * `stage` field AND in the Stream entry ("… assigned to Bench Assignee /
 * Negotiation / 07:20"), so captureReadBack counted two, not in one row, not
 * a heading, no testid — and refused. The reported KEY names a field the page
 * itself labels: `[data-name="stage"]`, a dt/dd pair, a label beside its
 * value. The match inside that field is the value's own; the stream's is
 * narration.
 *
 * And the stage was chosen by clicking `.field[data-name="stage"]
 * .option[data-value="Negotiation"]` — an option with no role=option
 * candidate, whose click changed nothing selectionReadBack could see.
 * savedSelectionReadBack reads it from that field on the SAVED record, where
 * the finish found it.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/readback-field.browser.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import { captureReadBack, savedSelectionReadBack, type RecordedStep } from '../src/daemon/recorder.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

/** EspoCRM's detail view, cut down: labelled cells with a `.field[data-name]` each, and a stream panel. */
const DETAIL = `
  <h3><span>fwec10-n2 Bench Opportunity</span></h3>
  <div class="record"><div class="row">
    <div class="cell" data-name="account"><label class="control-label">Account</label><div class="field" data-name="account"><a href="#">Bench Account</a></div></div>
    <div class="cell" data-name="stage"><label class="control-label">Stage</label><div class="field" data-name="stage"><span>Negotiation</span></div></div>
    <div class="cell" data-name="amount"><label class="control-label">Amount</label><div class="field" data-name="amount"><span>$12,500.00</span></div></div>
  </div></div>
  <div class="panel stream"><h4>Stream</h4><ul>
    <li class="list-group-item"><a href="#">Admin</a> created this opportunity assigned to <a href="#">Bench Assignee</a> <span>Negotiation</span> <a href="#">07:20</a></li>
  </ul></div>`;

d('captureReadBack: the match inside the field the reported key names', () => {
  let session: BrowserSession;
  beforeAll(async () => {
    session = new BrowserSession({ session: `readback-field-${Date.now()}`, persist: false });
  });
  afterAll(async () => {
    await session?.close();
  });

  it('pins the stage in its [data-name="stage"] field, past the stream entry (fwec10)', async () => {
    const page = await session.getPage();
    await page.setContent(DETAIL);
    const step = await captureReadBack(page, 'Negotiation', 'stage');
    expect(step).not.toBeNull();
    expect(step!.label).toBe('stage');
    const first = step!.locators.target.chain![0] as { kind: string; selector: string };
    expect(first.kind).toBe('css');
    expect((await page.locator(first.selector).innerText()).trim()).toBe('Negotiation');
    expect(await page.locator(first.selector).count()).toBe(1);
  });

  it('pins by a dt/dd pair and by a label beside its value, case- and separator-insensitively', async () => {
    const page = await session.getPage();
    await page.setContent(`<dl><dt>Close date</dt><dd>Dec 31</dd><dt>Owner</dt><dd>Admin</dd></dl><p>Due Dec 31</p><p>x</p><div>Dec 31</div>`);
    expect(await captureReadBack(page, 'Dec 31', 'close_date')).not.toBeNull();
    await page.setContent(`<div class="form-row"><label>Status</label><span>Ready</span></div><div class="log">Ready</div>`);
    expect(await captureReadBack(page, 'Ready', 'status')).not.toBeNull();
  });

  it('still refuses when the key names no field on the page', async () => {
    const page = await session.getPage();
    await page.setContent(DETAIL);
    expect(await captureReadBack(page, 'Negotiation', 'opportunity_phase')).toBeNull();
    expect(await captureReadBack(page, 'Negotiation')).toBeNull();
  });
});

d('savedSelectionReadBack: an option clicked by its data-value, read from the saved field', () => {
  let session: BrowserSession;
  beforeAll(async () => {
    session = new BrowserSession({ session: `readback-saved-${Date.now()}`, persist: false });
  });
  afterAll(async () => {
    await session?.close();
  });

  // fwec10 step 32, verbatim.
  const click: RecordedStep = {
    k: 'step',
    tool: 'click',
    args: { target: '.field[data-name="stage"] .option[data-value="Negotiation"]' },
    locators: {
      target: {
        expr: 'x',
        verified: true,
        raw: 'x',
        chain: [
          { kind: 'css', selector: '.field[data-name="stage"] .option[data-value="Negotiation"]' },
          { kind: 'text', text: 'Negotiation' },
          { kind: 'css', selector: 'div:nth-of-type(1) > div > div > div:nth-of-type(2) > div > div:nth-of-type(4)' },
        ],
      },
    },
    diff: { url: 'http://127.0.0.1:8097/#Opportunity/create', alerts: [], added: ['- textbox "": 80'] },
  };

  it('reads the value from the field scope the option sat in, on the saved record', async () => {
    const page = await session.getPage();
    await page.setContent(DETAIL);
    const read = await savedSelectionReadBack(page, [click], 'Negotiation', 'stage');
    expect(read).not.toBeNull();
    expect(read!.label).toBe('stage');
    expect(read!.locators.target.chain![0]).toEqual({ kind: 'css', selector: '.field[data-name="stage"]' });
    expect(JSON.parse(read!.result!)).toBe('Negotiation');
  });

  it('reads nothing for a value the click did not choose, or where the saved field does not show it', async () => {
    const page = await session.getPage();
    await page.setContent(DETAIL);
    expect(await savedSelectionReadBack(page, [click], 'Proposal', 'stage')).toBeNull();
    await page.setContent(DETAIL.replace('<span>Negotiation</span></div></div>', '<span>Proposal</span></div></div>'));
    expect(await savedSelectionReadBack(page, [click], 'Negotiation', 'stage')).toBeNull();
  });
});
