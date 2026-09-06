/**
 * Goal-state derivation (compile).
 *
 * fwod34: step 06-open asked for an order to be cancelled and its recording
 * struggled, so the orchestrator wrote 08-open to cancel it again. On replay
 * 06's learned skill cancels cleanly, 08's Cancel button no longer exists, and
 * the retry step FAILS — a step failing because its work was already done.
 *
 * The fix starts here: the recording's own before/after pair says which report
 * text the procedure brought into existence ("Cancelled"), and that becomes the
 * skill's goal. Everything these tests care about is the FALSE POSITIVE side —
 * a goal that would let a step be skipped when its work never happened.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import type { Skill } from '../src/skills/store.js';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-goal-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const ORIGIN = 'http://127.0.0.1:8069';

function step(tool: string, args: Record<string, unknown>, extra: Partial<RecordedStep> = {}): RecordedStep {
  return {
    k: 'step',
    tool,
    args,
    locators: args.target ? { target: { expr: 'x', verified: true, raw: String(args.target), chain: [{ kind: 'role', role: 'button', name: String(args.target) }] } } : {},
    ...extra,
  };
}

// 08-open, the retry step the orchestrator wrote after 06-open's recording
// struggled. Its own recording DID cancel the order.
const CANCEL =
  "The sales order S00021 (model sale.order, record id 21) is currently in 'Sales Order' status and needs to be cancelled. Click Cancel, confirm, and verify the status bar now shows Cancelled.";

/** The status bar as it read BEFORE the cancel: every reachable state but Cancelled. */
const BEFORE = '- heading "S00021"\n- button "Sales Order"\n- button "Quotation Sent"\n- button "Quotation"\n- button "Cancel"';

const CANCEL_REPORT = {
  status: 'success' as const,
  summary: 'Cancelled sales order S00021.',
  evidence: {
    values: {
      order_status: 'Cancelled',
      statusbar_text: 'Cancelled\nSales Order\nQuotation Sent\nQuotation',
      order_reference: 'S00021',
    },
  },
};

function cancelRecording(startText: string): RecordedEntry[] {
  return [
    { k: 'instruction', text: CANCEL, url: `${ORIGIN}/odoo/sales/21`, fingerprint: [1, 0, 0], startText },
    step('click', { target: 'Cancel' }),
    step('click', { target: 'Ok' }, { diff: { url: `${ORIGIN}/odoo/sales/21`, alerts: [], added: ['- button "Cancelled"'] } }),
    step('read', { target: '.o_statusbar_status', what: 'text' }, { label: 'statusbar_text', result: 'Cancelled\nSales Order\nQuotation Sent\nQuotation' }),
    step('read', { target: '.o_breadcrumb', what: 'text' }, { label: 'order_reference', result: 'S00021' }),
  ];
}

function compile(entries: RecordedEntry[], instruction: string, report: typeof CANCEL_REPORT, known?: Record<string, string>): Skill[] {
  return compileSkills({
    entries,
    instruction,
    report,
    session: 's',
    now: '2026-09-05T00:00:00.000Z',
    ...(known ? { knownValues: known } : {}),
  });
}

describe('goal derivation', () => {
  it('keeps the one report line the work brought into existence', () => {
    const [skill] = compile(cancelRecording(BEFORE), CANCEL, CANCEL_REPORT, { quotation_ref: 'S00021', current_status: 'Sales Order' });
    // "Sales Order"/"Quotation Sent"/"Quotation" were all on the page before the
    // click (Odoo's status bar lists every reachable state, which is exactly why
    // "the pre-state is gone" cannot be the test); "S00021" is the record's name,
    // not its state. Only "Cancelled" is new.
    expect(skill.goal).toEqual({ requireText: ['Cancelled'] });
  });

  it('gives a read-only procedure no goal', () => {
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Read the status of sales order S00021.', url: `${ORIGIN}/odoo/sales/21`, fingerprint: [1, 0, 0], startText: BEFORE },
      step('read', { target: '.o_statusbar_status', what: 'text' }, { label: 'statusbar_text', result: 'Cancelled\nSales Order' }),
    ];
    const [skill] = compile(entries, 'Read the status of sales order S00021.', {
      status: 'success',
      summary: 'Read the status.',
      evidence: { values: { statusbar_text: 'Cancelled\nSales Order', order_status: 'Cancelled', order_reference: 'S00021' } },
    });
    expect(skill.goal).toBeUndefined();
  });

  it('gives no goal to a create whose only new text is the ref the run minted', () => {
    const CREATE = 'Create a repair ticket and report its id.';
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: CREATE, url: `${ORIGIN}/#/tickets`, fingerprint: [1, 0, 0], startText: '- heading "Repair tickets"\n- button "New ticket"' },
      step('click', { target: 'New ticket' }),
      step('click', { target: 'Save' }, { diff: { url: `${ORIGIN}/#/tickets/t99`, alerts: [], added: ['- heading "t99"'] } }),
      step('read', { target: '.id', what: 'text' }, { label: 'ticket_id', result: 't99' }),
    ];
    const [skill] = compile(entries, CREATE, {
      status: 'success',
      summary: 'Created ticket t99.',
      evidence: { values: { ticket_id: 't99' } },
    });
    // The id is an identity this run MINTED, not a state: a later run makes its
    // own, and treating it as a goal would be a claim about the wrong record.
    expect(skill.goal).toBeUndefined();
  });

  it('never guesses when the recording captured no pre-state', () => {
    const [skill] = compile(cancelRecording(''), CANCEL, CANCEL_REPORT, { quotation_ref: 'S00021' });
    expect(skill.goal).toBeUndefined();
  });

  it('does not treat text the page already showed as a goal', () => {
    // The same recording, but the order was ALREADY cancelled when it began:
    // nothing in the report is new, so there is nothing to check for.
    const [skill] = compile(cancelRecording(`${BEFORE}\n- button "Cancelled"`), CANCEL, CANCEL_REPORT, { quotation_ref: 'S00021', current_status: 'Sales Order' });
    expect(skill.goal).toBeUndefined();
  });
});
