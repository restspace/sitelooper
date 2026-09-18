#!/usr/bin/env node
/**
 * Offline agreement probe for site A of PLAN-jev.md — the locator-repair
 * proposer (`repair.propose`). Live Jev calls, no browser.
 *
 *   node bench/jev-repair-probe.mjs
 *   node bench/jev-repair-probe.mjs --dist /tmp/dist-step1 --repeat 3 --json
 *
 * WHY THIS IS SYNTHETIC
 *
 * There is no replayable corpus for this site, and it is worth being precise
 * about why, because it looks like there should be. `bench/results-published`
 * holds 56 drift-ticket sidecars (89 distinct dead locator chains), and the
 * published skill stores hold the variants some of them were repaired into.
 * What NOTHING holds is the live page the proposal was made against: neither
 * `DriftTicket` nor the drain summary persists `interactiveSnapshot`'s rows,
 * and the pages are ephemeral app state behind a login. The question this site
 * answers is "which of THESE elements is the control", so with no element list
 * there is no question to replay — only a ticket with no ballot.
 *
 * So the cases below are synthetic, and labelled as such. What is real in them
 * is the part the repo does own: every dead locator chain is copied verbatim
 * from a published drift ticket (grafana fwgr16-25, the autotask fwat2/3 runs,
 * odoo and repairdesk/kanboard shapes from the corpus), and the element rows
 * are in the exact form `interactiveSnapshot` emits. The five shapes they
 * cover are the five ways this decision goes wrong:
 *
 *   renamed        the control is there under a new name        → pick it
 *   moved          same control, different container/kind rung  → pick it
 *   gone           deleted, and a plausible neighbour remains   → none
 *   decoy          same name, different KIND                    → none (or the right kind)
 *   duplicates     the same name several times in a table       → none, not a coin flip
 *
 * A case's grade is agreement with the labelled answer. The number that
 * matters for the GATE is not raw accuracy but the confidence at which the
 * wrong answers stop: the gate must sit above every wrong-but-confident case
 * and below as many right ones as possible. The table prints both.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const REPEAT = Number(arg('--repeat', 3));
const JSON_OUT = argv.includes('--json');
// The default is the repo's own build; --dist points at a private one so a
// probe run never has to race another process's `npm run build`.
const distRoot = path.resolve(here, String(arg('--dist', '../dist')));
const dist = (rel) => pathToFileURL(path.join(distRoot, rel)).href;

const s1 = await import(dist('agent/system-one.js'));
const decide = await import(dist('agent/decide.js'));
const { repairProposeSite, locatorFromRow } = await import(dist('skills/repair-jev.js'));
const { candidateExpr } = await import(dist('daemon/recorder.js'));

const config = s1.resolveSystemOneConfig();
if (!config.enabled) {
  console.error(`System One is not enabled (mode=${config.mode}): set ${config.keyEnvVars.join(' or ')}.`);
  process.exit(2);
}
const usage = { inputTokens: 0, requests: 0 };
const client = s1.buildSystemOne(config, (_m, u) => {
  usage.inputTokens += u.inputTokens;
  usage.requests += 1;
});

// --- the cases ----------------------------------------------------------------
//
// `rows` are SnapshotRows exactly as interactiveRows emits them. `want` is the
// index of the row the eventual repair should name, or null when the honest
// answer is "no element here serves that purpose".
//
// The chains are real LocatorCandidates rather than strings, so `candidateExpr`
// renders each one back into exactly the expression the published drift ticket
// recorded — the state Jev sees is the ticket's own text, not a paraphrase.

const T = (value) => ({ kind: 'testid', attr: 'data-testid', value });
const R = (role, name) => ({ kind: 'role', role, name });
const L = (label) => ({ kind: 'label', label });
const I = (selector) => ({ kind: 'id', selector });
const C = (selector) => ({ kind: 'css', selector });

const CASE = (c) => c;
const CASES = [
  CASE({
    id: 'gr-save-renamed',
    app: 'grafana',
    shape: 'renamed',
    why: 'fwgr20/fwgr25: "Save dashboard" became "Save changes" in the edit toolbar',
    template: 'save the dashboard',
    tool: 'click',
    kind: 'button',
    families: ['command'],
    chain: [T('data-testid Save dashboard button'), R('button', 'Save dashboard')],
    rows: [
      { tag: 'button', testid: 'data-testid Back to dashboard button', text: 'Back to dashboard' },
      { tag: 'button', text: 'Discard' },
      { tag: 'button', testid: 'data-testid Save changes button', text: 'Save changes' },
      { tag: 'button', testid: 'data-testid Edit dashboard button', text: 'Edit' },
      { tag: 'a', text: 'Dashboards' },
    ],
    want: 2,
  }),
  CASE({
    id: 'gr-panel-title-moved',
    app: 'grafana',
    shape: 'moved',
    why: 'fwgr17-n3: the panel-title input lost its testid and is now reachable by label only',
    template: 'rename the panel to {{v1}}',
    tool: 'fill',
    kind: 'textbox',
    families: ['text-input', 'select'],
    chain: [T('data-testid Panel editor option pane field input Title')],
    rows: [
      { tag: 'input', type: 'text', label: 'Panel title', placeholder: 'Panel Title' },
      { tag: 'textarea', label: 'Description' },
      { tag: 'input', type: 'text', label: 'Transparent background' },
      { tag: 'input', type: 'search', placeholder: 'Search options' },
    ],
    want: 0,
  }),
  CASE({
    id: 'gr-timepicker-gone',
    app: 'grafana',
    shape: 'gone',
    why: 'fwgr18: the time picker was removed from a kiosk-mode dashboard; a refresh button still sits where it was',
    template: 'set the dashboard time range to the last 6 hours',
    tool: 'click',
    kind: 'button',
    families: ['command'],
    chain: [C('[data-testid="data-testid TimePicker Open Button"] span'), R('button', 'Time range picker')],
    rows: [
      { tag: 'button', testid: 'data-testid RefreshPicker run button', text: 'Refresh' },
      { tag: 'a', text: 'Dashboards' },
      { tag: 'button', text: 'Panel menu' },
      { tag: 'button', label: 'Toggle menu' },
    ],
    want: null,
  }),
  CASE({
    id: 'gr-add-decoy',
    app: 'grafana',
    shape: 'decoy',
    why: 'fwgr19/fwgr24: the "Add" BUTTON is gone; an "Add" menu item of another kind remains',
    template: 'add a visualization to the dashboard',
    tool: 'click',
    kind: 'button',
    families: ['command'],
    chain: [T('data-testid Add button'), C('button:has-text("Add")')],
    rows: [
      { tag: 'input', type: 'text', label: 'Add', placeholder: 'Add a tag' },
      { tag: 'input', type: 'checkbox', label: 'Add to library' },
      { tag: 'input', type: 'text', placeholder: 'Search dashboards' },
    ],
    // Nothing of the recorded KIND is on the page at all, so the site should
    // never be asked — the pre-filter empties the ballot. Kept in the set as
    // the control case for that: a probe run that asks here is a bug.
    want: null,
    expectNoAsk: true,
  }),
  CASE({
    id: 'od-save-record',
    app: 'odoo',
    shape: 'renamed',
    why: 'round-21/26 odoo form: the cloud-icon save replaced the labelled Save button',
    template: 'save the quotation',
    tool: 'click',
    kind: 'button',
    families: ['command'],
    chain: [R('button', 'Save'), I('#o_form_button_save')],
    rows: [
      { tag: 'button', text: 'Discard' },
      { tag: 'button', label: 'Save record', testid: 'o_form_button_save' },
      { tag: 'button', text: 'Confirm' },
      { tag: 'button', text: 'Send by email' },
      { tag: 'a', text: 'Quotations' },
      { tag: 'a', text: 'Orders' },
      { tag: 'button', text: 'Add a product' },
    ],
    want: 1,
  }),
  CASE({
    id: 'od-customer-field',
    app: 'odoo',
    shape: 'moved',
    why: 'the customer autocomplete moved from a labelled input to a combobox in the same form',
    template: 'create a quotation for {{v1}}',
    tool: 'fill',
    kind: 'text input',
    families: ['text-input', 'select'],
    chain: [L('Customer'), I('#customer_id_0')],
    rows: [
      { tag: 'input', type: 'text', label: 'Customer', placeholder: 'Type to search a customer...' },
      { tag: 'input', type: 'text', label: 'Expiration' },
      { tag: 'input', type: 'text', label: 'Payment terms' },
      { tag: 'input', type: 'text', label: 'Order reference' },
    ],
    want: 0,
  }),
  CASE({
    id: 'od-confirm-decoy',
    app: 'odoo',
    shape: 'decoy',
    why: 'the order Confirm button is gone (the order is already confirmed); a Confirm in a delete dialog is not it',
    template: 'confirm the sales order',
    tool: 'click',
    kind: 'button',
    families: ['command'],
    chain: [R('button', 'Confirm'), C('button[name="action_confirm"]')],
    rows: [
      { tag: 'button', text: 'Create invoice' },
      { tag: 'button', text: 'Send by email' },
      { tag: 'button', text: 'Cancel' },
      { tag: 'button', text: 'Preview' },
      { tag: 'a', text: 'Sales Orders' },
    ],
    want: null,
  }),
  CASE({
    id: 'kb-add-task',
    app: 'kanboard',
    shape: 'renamed',
    why: 'round-24 kanboard: "Add a new task" became a "+" with an aria-label',
    template: 'add a task called {{v1}} to the board',
    tool: 'click',
    kind: 'link',
    families: ['command'],
    chain: [R('link', 'Add a new task')],
    rows: [
      { tag: 'a', label: 'Add a new task', text: '+' },
      { tag: 'a', text: 'Board' },
      { tag: 'a', text: 'Calendar' },
      { tag: 'a', text: 'Analytics' },
      { tag: 'button', text: 'Filters' },
    ],
    want: 0,
  }),
  CASE({
    id: 'kb-swimlane-duplicates',
    app: 'kanboard',
    shape: 'duplicates',
    why: 'every swimlane offers a "Add a new task" link; nothing on the page says which column',
    template: 'add a task to the Ready column',
    tool: 'click',
    kind: 'link',
    families: ['command'],
    chain: [C('#board td:nth-of-type(2) a.task-board-add')],
    rows: [
      { tag: 'a', label: 'Add a new task', text: '+' },
      { tag: 'a', label: 'Add a new task', text: '+' },
      { tag: 'a', label: 'Add a new task', text: '+' },
      { tag: 'a', label: 'Add a new task', text: '+' },
    ],
    // Four identical rows: any pick is a coin flip, and a coin flip that
    // resolves to four elements is refused by patchSegment anyway. The right
    // answer is to defer, whether by `none` or by a confidence under the gate.
    want: null,
    coinFlip: true,
  }),
  CASE({
    id: 'kb-close-task-gone',
    app: 'kanboard',
    shape: 'gone',
    why: 'the task was deleted, so its "Close this task" action is gone; the board still has plenty of links',
    template: 'close the task {{v1}}',
    tool: 'click',
    kind: 'link',
    families: ['command'],
    chain: [R('link', 'Close this task')],
    rows: [
      { tag: 'a', text: 'Board' },
      { tag: 'a', text: 'Dashboard' },
      { tag: 'a', text: 'Projects' },
      { tag: 'a', label: 'Add a new task', text: '+' },
      { tag: 'a', text: 'Settings' },
    ],
    want: null,
  }),
  CASE({
    id: 'rd-status-select',
    app: 'repairdesk',
    shape: 'moved',
    why: 'fwat2: #status became a labelled combobox after the ticket form was rebuilt',
    template: 'set the ticket status to {{v1}}',
    tool: 'select',
    kind: 'combobox',
    families: ['select'],
    chain: [I('#status'), L('Status')],
    rows: [
      { tag: 'select', label: 'Ticket status' },
      { tag: 'select', label: 'Assigned to' },
      { tag: 'input', type: 'text', label: 'Status note' },
      { tag: 'button', text: 'Update' },
    ],
    want: 0,
  }),
  CASE({
    id: 'rd-submit-renamed',
    app: 'repairdesk',
    shape: 'renamed',
    why: 'fwat2: getByTestId(\'form-submit\') is gone; the same action is now "Save & Close"',
    template: 'create a repair ticket for {{v1}}',
    tool: 'click',
    kind: 'button',
    families: ['command'],
    chain: [T('form-submit'), R('button', 'Submit')],
    rows: [
      { tag: 'button', text: 'Cancel' },
      { tag: 'button', testid: 'form-save-close', text: 'Save & Close' },
      { tag: 'button', text: 'Print' },
      { tag: 'a', text: 'Back to tickets' },
    ],
    want: 1,
  }),
  CASE({
    id: 'rd-cost-cell-duplicates',
    app: 'repairdesk',
    shape: 'duplicates',
    why: 'fwat3: every line item has a budgetCost input; the row anchor (an aria-label carrying the item name) is gone',
    template: 'set the budget cost of {{v1}} to {{v2}}',
    tool: 'fill',
    kind: 'text input',
    families: ['text-input', 'select'],
    chain: [C('[aria-label="fwat3-n2 MTP Item A - 1 - 150"] >> [data-column="budgetCost"] input')],
    rows: [
      { tag: 'input', type: 'number', label: 'Budget cost' },
      { tag: 'input', type: 'number', label: 'Budget cost' },
      { tag: 'input', type: 'number', label: 'Budget cost' },
      { tag: 'input', type: 'number', label: 'Markup' },
    ],
    want: null,
    coinFlip: true,
  }),
  CASE({
    id: 'rd-username-renamed',
    app: 'grafana',
    shape: 'renamed',
    why: 'fwgr16: the login field testid changed; the same field is labelled "Email or username"',
    template: 'sign in as {{v1}}',
    tool: 'fill',
    kind: 'textbox',
    families: ['text-input', 'select'],
    chain: [T('data-testid Username input field')],
    rows: [
      { tag: 'input', type: 'text', label: 'Email or username', placeholder: 'email or username' },
      { tag: 'input', type: 'password', label: 'Password', placeholder: 'password' },
      { tag: 'button', text: 'Log in' },
    ],
    want: 0,
  }),
  CASE({
    id: 'od-big-form-tournament',
    app: 'odoo',
    shape: 'renamed',
    why: 'a full odoo form: 52 same-kind candidates, so the site must run its tournament',
    template: 'save the quotation',
    tool: 'click',
    kind: 'button',
    families: ['command'],
    chain: [R('button', 'Save'), I('#o_form_button_save')],
    rows: [
      ...Array.from({ length: 30 }, (_, i) => ({ tag: 'a', text: `Menu item ${i + 1}` })),
      { tag: 'button', text: 'Discard' },
      { tag: 'button', label: 'Save record', testid: 'o_form_button_save' },
      ...Array.from({ length: 20 }, (_, i) => ({ tag: 'button', text: `Action ${i + 1}` })),
    ],
    want: 31,
  }),
];

// --- running ------------------------------------------------------------------

function contextFor(c) {
  return {
    skill: { template: c.template },
    ticket: { flow: 'probe', step: '01', skill: 's_probe', atStep: '4', key: 'target', similarity: 0.97, missedLocator: candidateExpr(c.chain[0]), fallbackUsed: null, recovered: false },
    chain: c.chain,
    rows: c.rows,
    snapshot: '',
    recordedKind: c.kind,
    recordedFamilies: c.families,
    tool: c.tool,
  };
}

async function runCase(c) {
  const input = contextFor(c);
  const started = Date.now();
  let reading = null;
  let error = null;
  try {
    reading = await repairProposeSite.run(client, input, {});
  } catch (err) {
    error = err.message;
  }
  const ms = Date.now() - started;
  const chose = reading?.chosen ?? (error ? 'throw' : 'no-ask');
  // What the site would actually DO: value non-null and over the gate.
  const gate = decide.gateFor('repair.propose');
  const acted = !!reading?.value && reading.confidence >= gate;
  // Graded on the LOCATOR, not the label: a tournament's final label indexes
  // the shortlist, so only the built candidate is comparable across paths.
  const wanted = c.want === null ? null : locatorFromRow(c.rows[c.want]);
  const agrees = c.want === null ? !reading?.value : JSON.stringify(reading?.value ?? null) === JSON.stringify(wanted);
  return {
    id: c.id, app: c.app, shape: c.shape, chose, agrees, confidence: reading?.confidence ?? 0, acted,
    got: reading?.value ? candidateExpr(reading.value) : null,
    why: reading?.why, ms, error, expectNoAsk: !!c.expectNoAsk, asked: reading !== null || !!error,
  };
}

const rows = [];
for (const c of CASES) {
  for (let r = 0; r < REPEAT; r++) rows.push(await runCase(c));
}

// --- reporting ----------------------------------------------------------------

if (JSON_OUT) {
  console.log(JSON.stringify({ model: config.model, repeat: REPEAT, usage, rows }, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\n${CASES.length} synthetic cases × ${REPEAT} (model ${config.model}, gate ${decide.gateFor('repair.propose')})\n`);
  console.log(`${pad('case', 26)}${pad('shape', 12)}${pad('agree', 7)}${pad('chose', 8)}${pad('conf', 18)}ms`);
  for (const c of CASES) {
    const mine = rows.filter((r) => r.id === c.id);
    const ok = mine.filter((r) => r.agrees).length;
    const confs = mine.map((r) => r.confidence.toFixed(2)).join('/');
    console.log(
      `${pad(c.id, 26)}${pad(c.shape, 12)}${pad(`${ok}/${mine.length}`, 7)}${pad(mine[0].chose, 8)}${pad(confs, 18)}${Math.round(mine.reduce((a, r) => a + r.ms, 0) / mine.length)}`,
    );
    for (const r of mine.filter((x) => !x.agrees)) console.log(`    MISS: chose ${r.chose} @ ${r.confidence.toFixed(2)} ${r.got ?? ''}${r.why ? ` (${r.why})` : ''}`);
  }
  const agree = rows.filter((r) => r.agrees).length;
  // The gate-setting numbers: the highest confidence a WRONG answer reached
  // (the gate must be above it) and the spread of the right ones.
  const wrong = rows.filter((r) => !r.agrees && r.confidence > 0);
  const rightPicks = rows.filter((r) => r.agrees && r.confidence > 0 && r.chose !== 'none');
  console.log(`\nagreement ${agree}/${rows.length} (${((100 * agree) / rows.length).toFixed(0)}%)`);
  console.log(`worst wrong-answer confidence: ${wrong.length ? Math.max(...wrong.map((r) => r.confidence)).toFixed(2) : 'n/a (no wrong answer carried confidence)'}`);
  if (rightPicks.length) {
    const cs = rightPicks.map((r) => r.confidence).sort((a, b) => a - b);
    console.log(`correct picks: min ${cs[0].toFixed(2)}  median ${cs[Math.floor(cs.length / 2)].toFixed(2)}  max ${cs[cs.length - 1].toFixed(2)}`);
  }
  console.log(`\n${usage.requests} requests, ${usage.inputTokens} input tokens ≈ $${((usage.inputTokens / 1e6) * 0.042).toFixed(4)}`);
}
