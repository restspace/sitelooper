/**
 * Round 53, repairdesk fwrd86 (GREEN on a441a86), two export defects the sweep
 * log showed and let through.
 *
 * 1. FROZEN OUTPUT KEY. 06-delete reported the archived row under
 *    `list_row_RD-1015`. Every replay republished the VALUE live (n2:
 *    `"list_row_RD-1015": "RD-1016 | …"`), but the KEY kept n1's ticket — in
 *    s_6532a2's reportTemplate, the flow's outputs and the compiled typed output
 *    `06-delete.list_row_RD-1015`. The leak scan printed
 *    `flow.steps[5].outputs[6]: "RD-1015" (output) in "list_row_RD-1015"` and
 *    exported it.
 * 2. SPURIOUS REFERENCE. 06-delete's wording "satisfying any preconditions such
 *    as requiring a Draft or Closed status first" was exported as "requiring a
 *    {{01-signin.ticket_status}} or Closed status" (and param v6), because
 *    01-signin reported `ticket_status = "Draft"`.
 *
 * The entries are the recording's own (fwrd86-n1-script.jsonl), trimmed.
 */
import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { buildFlow, textMints } from '../src/skills/flow.js';
import { applyRelabelToEntries, applyRelabelToSkills, runValueKeyRenames } from '../src/skills/relabel.js';
import type { Skill } from '../src/skills/store.js';

const ORIGIN = 'http://127.0.0.1:4180';
const LIST = `${ORIGIN}/#/tickets`;
const step = (tool: string, args: Record<string, unknown>, extra: Partial<RecordedStep> = {}): RecordedStep => ({
  k: 'step',
  tool,
  args,
  locators: args.target ? { target: { expr: 'x', verified: true, raw: String(args.target), chain: [{ kind: 'testid', attr: 'data-testid', value: String(args.target) }] } } : {},
  ...extra,
});
const at = (url: string, added: string[]) => ({ diff: { url, alerts: [], added, dialect: 2 as const } });

const SIGNIN =
  "Sign in at http://127.0.0.1:4180/ with email bench@example.com and password {{env:APP_PASSWORD}}, then create a repair ticket titled 'fwrd86-n1 RD Bench Ticket' with any required fields, and report the confirmation/what appeared.";
const OPEN = "On the repair ticket 'fwrd86-n1 RD Bench Ticket' (reference RD-1015), open the ticket detail and add a part named 'fwrd86-n1 RD Part A' with cost 100 and markup 25.";
const DELETE =
  "On ticket RD-1015 (currently Ready): delete both parts ('fwrd86-n1 RD Part A' and 'fwrd86-n1 RD Part B') via their Delete buttons, confirming any dialog, and waiting for the refresh after each delete so both are gone. Then archive the ticket so nothing from this run is left active (find and use whatever archive control or status the app provides, satisfying any preconditions such as requiring a Draft or Closed status first). Report the final state of the ticket (parts remaining, status/archived flag) and the list view.";

const ROW = 'RD-1015 | fwrd86-n1 RD Bench Ticket [Archived] | Customer: Not recorded | Status: Ready | Parts: 0 | Created: 2026-09-23';

function recording(deleteSteps: RecordedStep[] = []): RecordedEntry[] {
  return [
    { k: 'instruction', text: SIGNIN, url: `${ORIGIN}/#/login`, startText: '- heading "Sign in"\n- textbox "Email"', startDialect: 2 },
    step('click', { target: 'sign-in' }, at(LIST, ['- heading "Repair tickets"', '- button "New ticket"'])),
    step('fill', { target: 'field-title', value: 'fwrd86-n1 RD Bench Ticket' }, at(LIST, ['- textbox "Title *": fwrd86-n1 RD Bench Ticket'])),
    step('click', { target: 'modal-save' }, at(LIST, ['- row "RD-1015 fwrd86-n1 RD Bench Ticket Draft 0 2026-09-23"', '- cell "RD-1015"', '- link "RD-1015"', '- cell "Draft"'])),
    step('read', { target: '(read-back)', what: 'text' }, { label: 'ticket_reference', result: '"RD-1015"' }),
    {
      k: 'report',
      status: 'success',
      summary: 'Created RD-1015.',
      values: { signed_in_user: 'Bench User', ticket_reference: 'RD-1015', ticket_status: 'Draft', ticket_title: 'fwrd86-n1 RD Bench Ticket' },
      skill: 's_signin',
    },
    { k: 'instruction', text: OPEN, url: LIST },
    step('click', { target: 'ticket-link-t15' }, at(`${LIST}/t15`, ['- heading "fwrd86-n1 RD Bench Ticket"'])),
    { k: 'report', status: 'success', summary: 'Added part A.', values: { part_price: '$125.00' }, skill: 's_open' },
    { k: 'instruction', text: DELETE, url: `${LIST}/t15` },
    step('click', { target: 'archive' }, at(`${LIST}/t15`, ['- button "Unarchive ticket"'])),
    ...deleteSteps,
    step('read', { target: '(read-back)', what: 'text' }, { label: 'list_row_RD-1015', result: JSON.stringify(ROW) }),
    {
      k: 'report',
      status: 'success',
      summary: 'Archived RD-1015.',
      values: { ticket_reference: 'RD-1015', detail_status: 'Ready', 'list_row_RD-1015': ROW, list_default_count: 'Showing 1–10 of 13' },
      skill: 's_delete',
    },
  ];
}

const flowOf = (entries: RecordedEntry[], params: Record<string, Record<string, string>> = {}) =>
  buildFlow(entries, {
    name: 'fwrd86',
    origin: ORIGIN,
    startUrl: `${ORIGIN}/`,
    vars: { runid: 'fwrd86-n1' },
    session: 'fwrd86-n1',
    bind: (id) => params[id] ?? null,
  })!;

describe('an output key never embeds a value this run minted (fwrd86 list_row_RD-1015)', () => {
  it('renames the key by dropping the minted token', () => {
    const entries = recording();
    const plan = runValueKeyRenames(entries, textMints(entries));
    expect(plan.get(3)).toEqual({ 'list_row_RD-1015': 'list_row' });
  });

  it('renames it in the entries, the compiled skill and the flow alike', () => {
    const entries = recording();
    const plan = runValueKeyRenames(entries, textMints(entries));
    applyRelabelToEntries(entries, plan);
    const skill = {
      id: 's_6532a2',
      params: { v1: { example: 'RD-1015', usedIn: [], binding: 'output:i1:ticket_reference' } },
      steps: [{ tool: 'read', args: { target: '(read-back)', what: 'text' }, locators: { target: [] }, label: 'list_row_RD-1015' }],
      reportTemplate: { summary: '', values: { 'list_row_RD-1015': '{{v1}} | …', detail_status: 'Ready' } },
    } as unknown as Skill;
    expect(applyRelabelToSkills([skill], plan, new Map([['s_6532a2', 3]]))).toEqual(['s_6532a2']);
    expect(skill.steps[0].label).toBe('list_row');
    expect(Object.keys(skill.reportTemplate!.values)).toEqual(['list_row', 'detail_status']);
    const flow = flowOf(entries);
    const del = flow.steps[2];
    expect(del.outputs).toContain('list_row');
    expect(JSON.stringify(flow)).not.toContain('list_row_RD-1015');
  });

  it('keeps the new key unique within the report', () => {
    const entries = recording();
    const report = entries[entries.length - 1] as Extract<RecordedEntry, { k: 'report' }>;
    report.values = { ...report.values, list_row: 'something else' };
    expect(runValueKeyRenames(entries, ['RD-1015']).get(3)).toEqual({ 'list_row_RD-1015': 'list_row_2' });
  });

  it('leaves a key that carries no run value alone', () => {
    expect(runValueKeyRenames(recording(), ['RD-1016']).size).toBe(0);
  });
});

describe('a word named only as an alternative is not threaded (fwrd86 "a Draft or Closed status")', () => {
  it('keeps "Draft" literal in 06-delete\'s instruction and params, and still threads the ticket', () => {
    const flow = flowOf(recording(), { s_delete: { v1: 'RD-1015', v6: 'Draft' } });
    const del = flow.steps[2];
    expect(del.instruction).toContain('requiring a Draft or Closed status');
    expect(del.instruction).not.toContain('ticket_status');
    expect(del.instruction).toContain('On ticket {{01-signin.ticket_reference}} (currently Ready)');
    expect(del.params).toEqual({ v1: '{{01-signin.ticket_reference}}', v6: 'Draft' });
  });

  it('threads it when the procedure takes the value as data', () => {
    const chose = step('click', { target: 'Draft' }, { ...at(`${LIST}/t15`, ['- button "Mark Draft"']), locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name: 'Draft' }] } } });
    const flow = flowOf(recording([chose]));
    expect(flow.steps[2].instruction).toContain('requiring a {{01-signin.ticket_status}} or Closed status');
  });

  it('threads a value named outside any alternative', () => {
    const entries = recording();
    (entries[9] as Extract<RecordedEntry, { k: 'instruction' }>).text = DELETE.replace('requiring a Draft or Closed status', 'requiring the ticket to be Draft');
    expect(flowOf(entries).steps[2].instruction).toContain('requiring the ticket to be {{01-signin.ticket_status}}');
  });
});
