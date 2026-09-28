/**
 * A plain word a step reported WITHOUT being asked is not a later step's
 * output when the run cannot have made it: reported before the recording's
 * first change, or the name of a control the page offers. GPT-6 Luna trial
 * (2026-09-28): openproject fwop31-luna exported "create a Task" as "create a
 * {{01-signin.work_packages_link_text}}" (unresolved on both replays, spec
 * refused unsourced-ref); odoo fwod102-luna's "Cancel the confirmed sales
 * order" became "{{05-verify.new_actions_4}} the confirmed sales order".
 */
import { describe, expect, it } from 'vitest';
import { buildFlow, mutatingIntent } from '../src/skills/flow.js';
import type { RecordedEntry } from '../src/daemon/recorder.js';

const OP = 'http://127.0.0.1:8090';
const OD = 'http://127.0.0.1:8069';

const opRecording = (ask: string): RecordedEntry[] => [
  { k: 'step', tool: 'goto', args: { url: `${OP}/` }, locators: {} },
  { k: 'instruction', text: `Sign in and, in Bench Project, report the subjects of the Seed: work packages${ask}. Do not edit them.`, url: `${OP}/login`, startText: '- heading "Sign in"' },
  { k: 'step', tool: 'click', args: { target: '@e2' }, locators: { target: { expr: 'x', verified: true, raw: '@e2', chain: [{ kind: 'role', role: 'button', name: 'Sign in' }] } }, diff: { url: `${OP}/projects/bench/work_packages`, alerts: [], added: ['- link "Work packages"', '- option "Task"'] } },
  { k: 'report', status: 'success', summary: 'Three seeds.', values: { seed_subject_1: 'Seed: triage inbox', work_packages_link_text: 'Task' }, skill: 's_seed' },
  { k: 'instruction', text: "In Bench Project create a Task titled exactly 'r1 Bench Work Package'. Do not modify any Seed: work packages.", url: `${OP}/projects/bench/work_packages`, startText: '- link "Work packages"' },
  { k: 'report', status: 'success', summary: 'Created #41.', values: { work_package_id: '41' }, skill: 's_create' },
];

const build = (entries: RecordedEntry[], origin: string) =>
  buildFlow(entries, { name: 'f', origin, startUrl: `${origin}/`, vars: { runid: 'r1' }, session: 's', now: '2026-09-28T00:00:00Z' })!;

describe('an unasked word the run cannot have made is not threaded', () => {
  it('openproject fwop31-luna: a word volunteered before the first change stays literal', () => {
    const flow = build(opRecording(''), OP);
    expect(flow.steps[1].instruction).toContain('create a Task titled');
    expect(JSON.stringify(flow)).not.toContain('work_packages_link_text}}');
  });

  it('the same word ASKED for is the step\'s subject and threads', () => {
    const flow = build(opRecording(' and the work packages link text'), OP);
    expect(flow.steps[1].instruction).toContain(`create a {{${flow.steps[0].id}.work_packages_link_text}} titled`);
  });

  it('odoo fwod102-luna: an unasked word that names a button stays literal, a record reported after changes began still threads', () => {
    const entries: RecordedEntry[] = [
      { k: 'step', tool: 'goto', args: { url: `${OD}/` }, locators: {} },
      { k: 'instruction', text: 'Confirm the open quotation into a sales order. Verify and report the order reference and the status.', url: `${OD}/odoo/sales/21`, startText: '- button "Confirm"' },
      { k: 'step', tool: 'click', args: { target: '@e1' }, locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name: 'Confirm' }] } }, diff: { url: `${OD}/odoo/sales/21`, alerts: [], added: ['- button "Create Invoice"', '- button "Cancel"', '- link "New (unsaved)"'] } },
      { k: 'report', status: 'success', summary: 'Confirmed.', values: { order_reference: 'S00021', status: 'Sales Order', new_actions_4: 'Cancel', draft_label: 'New (unsaved)' }, skill: 's_confirm' },
      { k: 'instruction', text: 'Cancel the confirmed sales order S00021, then open New (unsaved) and report its state.', url: `${OD}/odoo/sales/21`, startText: '- button "Cancel"' },
      { k: 'report', status: 'success', summary: 'Cancelled.', values: { final_status: 'Cancelled' }, skill: 's_cancel' },
    ];
    const flow = build(entries, OD);
    const [confirm, cancel] = flow.steps;
    expect(cancel.instruction.startsWith('Cancel the confirmed sales order')).toBe(true);
    expect(cancel.instruction).not.toContain('.new_actions_4}}');
    expect(cancel.instruction).toContain(`{{${confirm.id}.order_reference}}`);
    // a link, not a control, and reported after the run began changing things: a record, threaded
    expect(cancel.instruction).toContain(`open {{${confirm.id}.draft_label}}`);
  });

  it('a key built from the value it read is judged on its other words (kanboard fwkb34)', () => {
    const K = 'http://127.0.0.1:8085';
    const entries: RecordedEntry[] = [
      { k: 'step', tool: 'goto', args: { url: `${K}/` }, locators: {} },
      { k: 'instruction', text: "Open the board and report the board's column names.", url: `${K}/board` },
      { k: 'report', status: 'success', summary: 'Columns.', values: { board_column_work_in_progress: 'Work in progress' }, skill: 's_board' },
      { k: 'instruction', text: "Create a task and move it to the 'Work in progress' column.", url: `${K}/board` },
      { k: 'report', status: 'success', summary: 'Moved #4.', values: { task_id: '#4' }, skill: 's_move' },
    ];
    const flow = build(entries, K);
    expect(flow.steps[1].instruction).toContain(`'{{${flow.steps[0].id}.board_column_work_in_progress}}' column`);
  });
});

describe('a scoped prohibition does not make an instruction read-only', () => {
  it.each([
    ['Create a Task. Do not modify any Seed: work packages.', 'create'],
    ['Set the status without changing anything else.', 'set'],
    ['Cancel the order without changing any other field.', 'cancel'],
  ])('%s → %s', (text, verb) => expect(mutatingIntent(text)).toBe(verb));

  it.each(['Read-only check, do not change anything.', 'Open the order. Do not change any data.', 'Open it; do not modify any records.', 'Do not change anything.'])(
    'global: %s',
    (text) => expect(mutatingIntent(text)).toBeNull(),
  );
});
