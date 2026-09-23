/**
 * Round 51, repairdesk fwrd85: a record number the run MINTED as page text.
 *
 * 02-create's save put the new ticket's number on the list page (the url stayed
 * `#/tickets`), its read-back reported it as `ticket_reference: "RD-1015"`, and
 * every later instruction named the ticket by it. Each replay made its own
 * (RD-1016, RD-1017; the compiled artifact RD-1018), yet the store froze the
 * recording's number in three places: 02-create's goal `requireText
 * ["RD-1015", …]`, 09-report's expectation lines (`- cell "RD-1015"`), and
 * 09-report's report template, which PUBLISHED `archived_search_result = "…
 * single row: RD-1015 | fwrd85-n2 …"` on n2 and n3 — a wrong reported value.
 *
 * The entries below are the recording's own (fwrd85-n1-script.jsonl, trimmed to
 * the lines that matter): instructions, the steps that showed the number, the
 * read-back and the reports.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { buildFlow, textMints } from '../src/skills/flow.js';
import { synthesizeReport } from '../src/skills/learn.js';
import { RunLedger, slotKnownRunValues } from '../src/skills/ledger.js';
import type { Skill } from '../src/skills/store.js';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-textmint-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const ORIGIN = 'http://127.0.0.1:4180';
const LIST = `${ORIGIN}/#/tickets`;

const step = (tool: string, args: Record<string, unknown>, extra: Partial<RecordedStep> = {}): RecordedStep => ({
  k: 'step',
  tool,
  args,
  locators: args.target ? { target: { expr: 'x', verified: true, raw: String(args.target), chain: [{ kind: 'role', role: 'button', name: String(args.target) }] } } : {},
  ...extra,
});
const at = (url: string, added: string[]) => ({ diff: { url, alerts: [], added, dialect: 2 as const } });

const LIST_START = [
  '- heading "Repair tickets"',
  '- button "New ticket"',
  '- checkbox "Show archived"',
  '- row "REF TITLE CUSTOMER STATUS PARTS CREATED"',
  '- row "RD-1014 Under-counter fridge door misaligned Marlow Bakery Draft 1 2026-01-23"',
  '- cell "RD-1014"',
  '- link "RD-1014"',
].join('\n');

const SIGNIN = 'Open http://127.0.0.1:4180/ and sign in with email bench@example.com and password {{env:APP_PASSWORD}}. Report what the landing page shows.';
const CREATE =
  "On the Repair Desk app, create a new ticket titled exactly 'fwrd85-n1 RD Bench Ticket'. Click 'New ticket', fill in the title and any other required fields the form demands, and submit. Report the ticket's reference code (like RD-xxxx), its status, and exactly which fields were required.";
const OPEN = "Open the ticket RD-1015 titled 'fwrd85-n1 RD Bench Ticket' in the Repair Desk app (click its row in the tickets list). On the ticket detail page, add a part named exactly 'fwrd85-n1 RD Part A' with cost 100 and markup 25.";
const REPORT =
  "Final verification in the Repair Desk app: go to the tickets list at http://127.0.0.1:4180/#/tickets with 'Show archived' UNCHECKED and confirm that no ticket whose title contains 'fwrd85-n1' appears in the active list. Also search for 'fwrd85-n1' in the search box (with Show archived checked) and report every row found, including its Ref, Title, Status, and whether it shows the Archived badge. Report exactly what you find.";

const signin: RecordedEntry[] = [
  { k: 'instruction', text: SIGNIN, url: `${ORIGIN}/#/login`, startText: '- heading "Sign in"\n- textbox "Email"\n- button "Sign in"', startDialect: 2 },
  step('fill', { target: 'Email', value: 'bench@example.com' }, at(`${ORIGIN}/#/login`, ['- textbox "Email": bench@example.com'])),
  // The sign-in LANDED on the list: the seed ticket RD-1014 appears here for
  // the first time, but on a page the click crossed to, not one it changed.
  step('click', { target: 'Sign in' }, at(LIST, LIST_START.split('\n'))),
  { k: 'report', status: 'success', summary: 'Signed in; the list shows RD-1014 first.', values: { signed_in_user: 'Bench User', first_ticket_ref: 'RD-1014' }, skill: 's_signin' },
];

const create: RecordedEntry[] = [
  { k: 'instruction', text: CREATE, url: LIST, startText: LIST_START, startDialect: 2, startTextComplete: true },
  step('click', { target: 'New ticket' }, at(LIST, ['- dialog "New ticket"', '- textbox "Title *"', '- textbox "Customer"', '- button "Create ticket"'])),
  step('fill', { target: 'Title *', value: 'fwrd85-n1 RD Bench Ticket' }, at(LIST, ['- textbox "Title *": fwrd85-n1 RD Bench Ticket'])),
  step('fill', { target: 'Customer', value: 'Bench Works Ltd' }, at(LIST, ['- textbox "Customer": Bench Works Ltd'])),
  step(
    'click',
    { target: 'Create ticket' },
    at(LIST, [
      '- row "RD-1015 fwrd85-n1 RD Bench Ticket Bench Works Ltd Draft 0 2026-09-23"',
      '- cell "RD-1015"',
      '- link "RD-1015"',
      '- cell "fwrd85-n1 RD Bench Ticket"',
      '- cell "Bench Works Ltd"',
      '- cell "2026-09-23"',
    ]),
  ),
  step('read', { target: '(read-back)', what: 'text' }, { label: 'ticket_reference', result: '"RD-1015"' }),
  step('read', { target: '(read-back)', what: 'text' }, { label: 'customer', result: '"Bench Works Ltd"' }),
  {
    k: 'report',
    status: 'success',
    summary: 'Created ticket RD-1015 "fwrd85-n1 RD Bench Ticket" for Bench Works Ltd.',
    values: { ticket_reference: 'RD-1015', title: 'fwrd85-n1 RD Bench Ticket', customer: 'Bench Works Ltd', status: 'Draft', created_date: '2026-09-23' },
    skill: 's_create',
  },
];

const open: RecordedEntry[] = [
  { k: 'instruction', text: OPEN, url: LIST, startText: LIST_START, startDialect: 2 },
  step('click', { target: 'RD-1015' }, at(`${LIST}/t15`, ['- heading "fwrd85-n1 RD Bench Ticket"', '- paragraph "RD-1015"'])),
  step('fill', { target: 'Part name', value: 'fwrd85-n1 RD Part A' }, at(`${LIST}/t15`, ['- textbox "Part name *": fwrd85-n1 RD Part A'])),
  // A part's price also first appears after its save and is read back — but
  // no instruction ever names a record by it.
  step('click', { target: 'Add part' }, at(`${LIST}/t15`, ['- row "fwrd85-n1 RD Part A $100.00 25% 1 No supplier $125.00"', '- cell "$125.00"'])),
  step('read', { target: '(read-back)', what: 'text' }, { label: 'part_price', result: '"$125.00"' }),
  { k: 'report', status: 'success', summary: 'Added part A to RD-1015; price $125.00.', values: { ref: 'RD-1015', part_price: '$125.00' }, skill: 's_open' },
];

const REPORT_VALUES = {
  active_search_fwrd85_result: "No tickets — table body text 'No tickets match the current filters.' (search fwrd85 with Show archived UNCHECKED)",
  archived_search_query: 'fwrd85-n1',
  archived_search_result: 'Showing 1–1 of 1, Page 1 of 1 — single row: RD-1015 | fwrd85-n1 RD Bench Ticket (Archived badge) | Bench Works Ltd | Ready | 0 parts | 2026-09-23',
  archived_badge_shown: "yes — 'Archived' badge rendered inside the Title cell of RD-1015",
  active_search_result_count: 'No tickets',
};

const reportEntries: RecordedEntry[] = [
  { k: 'instruction', text: REPORT, url: LIST, startText: LIST_START.replace('"Show archived"', '"Show archived" [checked]'), startDialect: 2 },
  step('check', { target: 'Show archived', checked: false }, at(LIST, ['- checkbox "Show archived"', '- row "RD-1005 Till printer jams on receipts Blue Fox Cafe Draft 2 2026-01-12"', '- cell "RD-1005"'])),
  step(
    'check',
    { target: 'Show archived', checked: true },
    at(LIST, [
      '- checkbox "Show archived" [checked]',
      '- row "RD-1015 fwrd85-n1 RD Bench Ticket Archived Bench Works Ltd Ready 0 2026-09-23"',
      '- cell "RD-1015"',
      '- link "RD-1015"',
      '- cell "fwrd85-n1 RD Bench Ticket Archived"',
    ]),
  ),
  step('fill', { target: 'Search', value: 'fwrd85-n1' }, at(LIST, ['- searchbox "Reference, title or customer": fwrd85-n1', '- button "Next" [disabled]'])),
  step('read', { target: '#list-summary', what: 'text', label: 'active_search_result_count' }, { label: 'active_search_result_count', result: '"No tickets"' }),
  { k: 'report', status: 'success', summary: 'Only the archived RD-1015 matches fwrd85-n1.', values: REPORT_VALUES, skill: 's_report' },
];

const recording: RecordedEntry[] = [...signin, ...create, ...open, ...reportEntries];

/** The run's values as the daemon's ledger banks them (server.ts noteMintedIds), keyed by origin. */
function ledgerOf(): RunLedger {
  const ledger = new RunLedger();
  ledger.add('fwrd85-n1', { from: 'var', name: 'runid' }, { vouched: true });
  ledger.add('RD-1014', { from: 'output', step: 'i1', name: 'first_ticket_ref' });
  ledger.add('RD-1015', { from: 'output', step: 'i2', name: 'ticket_reference' });
  ledger.add('Bench Works Ltd', { from: 'output', step: 'i2', name: 'customer' });
  ledger.add('$125.00', { from: 'output', step: 'i3', name: 'part_price' });
  return ledger;
}
const KNOWN_BEFORE_REPORT: Record<string, string> = {
  'var:runid': 'fwrd85-n1',
  'output:i1:first_ticket_ref': 'RD-1014',
  'output:i2:ticket_reference': 'RD-1015',
  'output:i2:customer': 'Bench Works Ltd',
  'output:i3:part_price': '$125.00',
};

const compileOf = (entries: RecordedEntry[], extra: Partial<Parameters<typeof compileSkills>[0]> = {}): Skill[] => {
  const head = entries[0] as Extract<RecordedEntry, { k: 'instruction' }>;
  const report = entries[entries.length - 1] as Extract<RecordedEntry, { k: 'report' }>;
  return compileSkills({
    entries: entries.slice(0, -1),
    instruction: head.text,
    report: { status: 'success', summary: report.summary, evidence: { values: report.values ?? {} } },
    session: 'fwrd85-n1',
    now: '2026-09-23T08:00:00.000Z',
    ...extra,
  });
};

describe('textMints: a record number the run minted as page text (fwrd85)', () => {
  it('marks RD-1015 — first shown by the save, read back, then named by 03-open', () => {
    expect(textMints(recording)).toEqual(['RD-1015']);
  });

  it('does not mark a seed ref first shown by a page the sign-in crossed to, nor a price no instruction names', () => {
    // RD-1014 appears first on the sign-in's landing; named later, it is
    // still the list's seed record.
    const named = [...recording, { k: 'instruction', text: 'Open ticket RD-1014 and report its status.', url: LIST } as RecordedEntry];
    expect(textMints(named)).not.toContain('RD-1014');
    expect(textMints(recording)).not.toContain('$125.00');
  });

  it('does not mark a record a listbox offered (odoo fwod28 `- option "[FURN_6666] …"`)', () => {
    const product = '[FURN_6666] Acoustic Bloc Screens';
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Add a line to the quotation and report the product.', url: `${ORIGIN}/odoo/sales/21`, startText: '- heading "S00021"' },
      step('click', { target: 'Add a product' }, at(`${ORIGIN}/odoo/sales/21`, ['- listbox "Products"', `- option "${product}"`])),
      step('click', { target: product }, at(`${ORIGIN}/odoo/sales/21`, [`- row "${product} 1.00 £ 90.00"`, `- cell "${product}"`])),
      { k: 'report', status: 'success', summary: 'added', values: { product } },
      { k: 'instruction', text: `Open the line for ${product}.`, url: `${ORIGIN}/odoo/sales/21` },
    ];
    expect(textMints(entries)).toEqual([]);
  });

  it('marks nothing before an instruction has named the ticket', () => {
    expect(textMints([...signin, ...create])).toEqual([]);
  });
});

describe('the exported 02-create goal (fwrd85 s_3d059b)', () => {
  it('does not wait for the recording run\'s ticket number', () => {
    const [skill] = compileOf(create, { knownValues: { 'var:runid': 'fwrd85-n1', 'output:i1:first_ticket_ref': 'RD-1014' } });
    // The export's provenance pass (server.ts, before the flow is saved).
    const exported = slotKnownRunValues(skill, ledgerOf(), new Set(textMints(recording)))?.skill ?? skill;
    expect(JSON.stringify(exported.goal ?? {})).not.toContain('RD-1015');
    expect(exported.goal?.requireText).toContain('Bench Works Ltd');
  });
});

describe('09-report (fwrd85 s_a0fc7c)', () => {
  const [skill] = compileOf(reportEntries, { knownValues: KNOWN_BEFORE_REPORT, mintedValues: textMints([...signin, ...create, ...open, ...reportEntries]) });
  const minted = Object.entries(skill.params).find(([, p]) => p.example === 'RD-1015');

  it('binds the ticket number to the output that captured it', () => {
    expect(minted?.[1].binding).toBe('output:i2:ticket_reference');
  });

  it('carries no frozen RD-1015 in any expectation line', () => {
    const lines = skill.steps.flatMap((s) => s.expect?.addedContains ?? []);
    expect(lines.join('\n')).not.toContain('RD-1015');
    expect(lines).toContain(`- cell "{{${minted?.[0]}}}"`);
  });

  it('publishes the live ticket number, never the recording\'s', () => {
    expect(JSON.stringify(skill.reportTemplate)).not.toContain('RD-1015');
    // n2: its own runid, and 02-create's live read-back of its own ticket.
    const report = synthesizeReport(skill, { v1: 'fwrd85-n2', [minted![0]]: 'RD-1016' }, { active_search_result_count: 'No tickets' });
    const published = report.evidence?.values ?? {};
    expect(published.archived_search_result).toContain('single row: RD-1016 | fwrd85-n2 RD Bench Ticket');
    expect(JSON.stringify(published)).not.toContain('RD-1015');
  });

  it('is bound in the flow to 02-create\'s published reference', () => {
    const flow = buildFlow(recording, {
      name: 'fwrd85',
      origin: ORIGIN,
      startUrl: `${ORIGIN}/`,
      vars: { runid: 'fwrd85-n1' },
      session: 'fwrd85-n1',
      bind: (id) => (id === 's_report' ? { v1: 'fwrd85-n1', [minted![0]]: 'RD-1015' } : null),
      origins: (id) => (id === 's_report' ? { v1: 'var:runid', [minted![0]]: 'output:i2:ticket_reference' } : null),
    });
    const last = flow!.steps[flow!.steps.length - 1];
    expect(last.params?.[minted![0]]).toBe('{{02-create.ticket_reference}}');
  });
});
