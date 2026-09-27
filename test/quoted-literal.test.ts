import { describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { buildFlow, threadIntoLiteral, threadOutsideQuotes } from '../src/skills/flow.js';
import { emptyFacts, observeFact, valueHash, type SiteFacts } from '../src/execution/facts.js';
import type { ValueShadowRow } from '../src/skills/facts-value.js';

const OP = 'http://127.0.0.1:8090';

/**
 * openproject fwop24 (round 70): 01-signin reported `admin_first_name =
 * "Bench"` (the seed admin's display name is "Bench Admin", shown in the user
 * menu), and buildFlow threaded the word into every later instruction's own
 * quoted names: 'Bench Project', '{{runid}} Bench Work Package'. No read
 * publishes a first name, so the compile refused the flow (unsourced-ref) and
 * both replays went to recovery at every step.
 */
function recording(): RecordedEntry[] {
  return [
    { k: 'step', tool: 'goto', args: { url: `${OP}/` }, locators: {} },
    { k: 'instruction', text: "Sign in to OpenProject with username 'admin' and password {{env:APP_PASSWORD}}. Verify you are signed in and report the admin's first name.", url: `${OP}/login`, startText: '- textbox "Username"\n- button "Sign in"' },
    { k: 'step', tool: 'click', args: { target: '@e1' }, locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name: 'Sign in' }] } }, diff: { url: `${OP}/`, alerts: [], added: ['- button "Bench Admin"', '- heading "Welcome to OpenProject"'] } },
    { k: 'report', status: 'success', summary: 'Signed in as Bench Admin.', values: { admin_first_name: 'Bench', signed_in_as: 'Bench Admin' }, skill: 's_signin' },
    { k: 'instruction', text: "Navigate to the project named 'Bench Project' and create a work package with subject exactly 'fx1 Bench Work Package'; report its id.", url: `${OP}/`, startText: '- button "Bench Admin"\n- link "Bench Project"' },
    { k: 'step', tool: 'fill', args: { target: '@e2', value: 'fx1 Bench Work Package' }, locators: { target: { expr: 'x', verified: true, raw: '@e2', chain: [{ kind: 'label', label: 'Subject' }] } } },
    { k: 'report', status: 'success', summary: 'Created #41.', values: { wp_id: '41' }, skill: 's_create' },
    { k: 'instruction', text: "Open the work package created by Bench in the 'Bench Project' project and confirm its subject is 'fx1 Bench Work Package'.", url: `${OP}/projects/bench-project/work_packages/41`, startText: '- heading "fx1 Bench Work Package"' },
    { k: 'report', status: 'success', summary: 'Confirmed.', values: { subject: 'fx1 Bench Work Package' }, skill: 's_open' },
  ];
}

describe('a reported word is not threaded inside the author\'s quoted names (openproject fwop24)', () => {
  const flow = buildFlow(recording(), { name: 'op', origin: OP, startUrl: `${OP}/`, vars: { runid: 'fx1' }, session: 's', now: '2026-09-26T00:00:00Z' })!;

  it('keeps the quoted project and subject names literal', () => {
    expect(flow.steps[1].instruction).toContain("'Bench Project'");
    expect(flow.steps[1].instruction).toContain("'{{runid}} Bench Work Package'");
    expect(flow.steps[1].instruction).not.toContain('admin_first_name');
  });

  it('still threads the word where it stands on its own outside quotes', () => {
    expect(flow.steps[2].instruction).toContain('created by {{01-signin.admin_first_name}} in');
    expect(flow.steps[2].instruction).toContain("'Bench Project'");
  });
});

describe('threadOutsideQuotes and threadIntoLiteral', () => {
  const M = '{{s.v}}';
  it('threads outside quotes, leaves a quoted name that merely contains the word', () => {
    expect(threadOutsideQuotes("made by Bench for 'Bench Project'", 'Bench', M, false)).toBe(`made by ${M} for 'Bench Project'`);
  });
  it('threads a quoted literal that IS the value, straight or curly quotes', () => {
    expect(threadOutsideQuotes("the column 'Backlog' and “Backlog”", 'Backlog', M, false)).toBe(`the column '${M}' and “${M}”`);
  });
  it('threads anywhere for a run-made value (id-shaped, run-specific, var-bearing)', () => {
    expect(threadOutsideQuotes("open quotation 'S00023 (draft)'", 'S00023', M, true)).toBe(`open quotation '${M} (draft)'`);
  });
  it('a bound literal is replaced only whole unless the value is run-made', () => {
    expect(threadIntoLiteral('Bench Project', 'Bench', M, false)).toBe('Bench Project');
    expect(threadIntoLiteral('Bench', 'Bench', M, false)).toBe(M);
    expect(threadIntoLiteral('Quotation S00023', 'S00023', M, true)).toBe(`Quotation ${M}`);
  });
});

/**
 * Site facts stage 4: the same recording, decided by MEANING. With a
 * reliable seed fact for the admin's display name "Bench Admin" (two
 * sessions saw it before any run changed anything), the reported fragment
 * "Bench" is the app's data and is threaded nowhere — not even where it
 * stands outside the author's quotes, where the punctuation rule lets it
 * through. One session's word is advisory and decides nothing.
 */
describe('a seed-name fragment is not threaded anywhere once the seed fact is reliable (stage 4)', () => {
  const seedFacts = (sessions: string[]): SiteFacts => {
    const sf = emptyFacts(OP);
    for (const session of sessions) observeFact(sf, { k: 'value.class', key: valueHash('Bench Admin'), v: 'seed', hard: false, session });
    return sf;
  };
  const build = (facts: SiteFacts) => {
    const rows: ValueShadowRow[] = [];
    const flow = buildFlow(recording(), { name: 'op', origin: OP, startUrl: `${OP}/`, vars: { runid: 'fx1' }, session: 's', now: '2026-09-26T00:00:00Z', facts, onFactRow: (r) => rows.push(r) })!;
    return { flow, rows, first: rows.find((r) => r.rule === 'facts.seed' && r.step === 'export admin_first_name') };
  };

  it('two sessions: the word outside quotes stays literal, and the facts.seed row is applied', () => {
    const { flow, first } = build(seedFacts(['a', 'b']));
    expect(flow.steps[2].instruction).toContain('created by Bench in');
    expect(JSON.stringify(flow)).not.toContain('admin_first_name}}');
    expect(first).toMatchObject({ fact: 'seed-fragment', heuristic: 'threaded', agree: false, applied: true });
  });

  it('the whole seed name is a seed too (not threaded, row applied)', () => {
    const { rows } = build(seedFacts(['a', 'b']));
    expect(rows.find((r) => r.step === 'export signed_in_as')).toMatchObject({ fact: 'seed', applied: true });
  });

  it('one session: advisory, the word still threads and the row is not applied', () => {
    const { flow, first } = build(seedFacts(['a']));
    expect(flow.steps[2].instruction).toContain('created by {{01-signin.admin_first_name}} in');
    expect(first).toMatchObject({ fact: 'none', heuristic: 'threaded', agree: true });
    expect(first?.applied).toBeUndefined();
  });

  it('a reliable mint of the value wins over the seed name', () => {
    const sf = seedFacts(['a', 'b']);
    for (const session of ['a', 'b']) observeFact(sf, { k: 'value.class', key: valueHash('Bench'), v: 'mint', hard: false, session });
    const { flow } = build(sf);
    expect(flow.steps[2].instruction).toContain('created by {{01-signin.admin_first_name}} in');
  });

  it('no facts: byte-identical to the flow built without the option', () => {
    const plain = buildFlow(recording(), { name: 'op', origin: OP, startUrl: `${OP}/`, vars: { runid: 'fx1' }, session: 's', now: '2026-09-26T00:00:00Z' });
    const empty = build(emptyFacts(OP)).flow;
    expect(JSON.stringify(empty)).toBe(JSON.stringify(plain));
  });
});
