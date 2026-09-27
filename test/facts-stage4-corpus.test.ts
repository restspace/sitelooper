/**
 * Site facts stage 4 (notes/design/site-facts-stage4-contract.md, Piece T):
 * one case per named survey row from the contract (fwop24, fwgt17, fwkb35,
 * a count row, mint-wins), driven through the PUBLIC decision functions only
 * — `seedNameFact` / `valueRoleFact` (src/execution/facts.ts, Piece R),
 * `seedFragmentOf` / `roleVerdict` / `valueVerdict` / `ledgerRow`
 * (src/skills/facts-value.ts, Piece R), `RunLedger.add` (src/skills/ledger.ts,
 * Piece R) and `buildFlow` (src/skills/flow.ts, Piece S).
 *
 * As facts-stage1/2/3-corpus.test.ts did: every `SiteFacts` here is built BY
 * HAND with `observeFact` (src/execution/facts.ts) — TWO SESSIONS (soft;
 * every stage 4 fact is soft) — the point is the CONSUMER, not the observer.
 *
 * Pieces R and S landed the shared vocabulary this file needs (polled for
 * throughout the build with short `grep` calls: seedNameFact/valueRoleFact
 * in execution/facts.ts, seedFragmentOf/roleVerdict/the valueVerdict seed and
 * role arms in facts-value.ts, the ledger's consultation of them, buildFlow's
 * opts.facts threading exclusions, compile.ts's roleSlots identity-marker
 * withholding, and sourcing.ts's state-role hold release) — every case below
 * is a real assertion, none left `it.todo`.
 */
import { describe, expect, it } from 'vitest';
import { emptyFacts, observeFact, seedNameFact, valueHash, valueRoleFact, type Fact, type Observation, type SiteFacts } from '../src/execution/facts.js';
import { roleVerdict, seedFragmentOf, shapeKeyOf, valueVerdict } from '../src/skills/facts-value.js';
import { RunLedger, type Binding } from '../src/skills/ledger.js';
import { buildFlow } from '../src/skills/flow.js';
import { compileSkills, type CompileInput } from '../src/skills/compile.js';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';

// ---------------------------------------------------------------------------
// shared fixture builders (the stage 1/2/3 corpus files' own pattern)
// ---------------------------------------------------------------------------

const obs = (o: Partial<Observation> & Pick<Observation, 'k' | 'key' | 'v'>): Observation => ({
  hard: false,
  session: 's1',
  at: '2026-09-27T10:00:00.000Z',
  ...o,
});

/** A SiteFacts with TWO soft sessions per add: every stage 4 fact is soft. */
function softFacts(origin: string, adds: { k: Fact['k']; key: string; v: Fact['v'] }[]): SiteFacts {
  const sf = emptyFacts(origin);
  for (const a of adds) {
    observeFact(sf, obs({ ...a, session: 's1' }));
    observeFact(sf, obs({ ...a, session: 's2' }));
  }
  return sf;
}

/** A SiteFacts with only ONE session per add: below the soft threshold — advisory, not reliable. */
function oneSessionFacts(origin: string, adds: { k: Fact['k']; key: string; v: Fact['v'] }[]): SiteFacts {
  const sf = emptyFacts(origin);
  for (const a of adds) observeFact(sf, obs({ ...a, session: 's1' }));
  return sf;
}

const outputBinding = (step: string, name: string): Binding => ({ from: 'output', step, name });

// ---------------------------------------------------------------------------
// 1. fwop24 (round 70, openproject): the seed admin's display name "Bench
//    Admin" is shown before any run changed anything; a reported value that
//    is a fragment of it ("Bench") is not threaded, even where the
//    punctuation rule (quoted-literal.test.ts) is not what stops it — the
//    "created by Bench in the project" case, OUTSIDE quotes, that today
//    threads.
// ---------------------------------------------------------------------------

describe('fwop24: "Bench" is a fragment of the reliable seed name "Bench Admin" — not threaded outside quotes either', () => {
  const OP = 'http://127.0.0.1:8090';
  const SEED_NAME = 'Bench Admin';
  const FRAGMENT = 'Bench';

  function recording(): RecordedEntry[] {
    return [
      { k: 'step', tool: 'goto', args: { url: `${OP}/` }, locators: {} },
      { k: 'instruction', text: "Sign in to OpenProject with username 'admin' and password {{env:APP_PASSWORD}}. Verify you are signed in and report the admin's first name.", url: `${OP}/login`, startText: '- textbox "Username"\n- button "Sign in"' },
      { k: 'step', tool: 'click', args: { target: '@e1' }, locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name: 'Sign in' }] } }, diff: { url: `${OP}/`, alerts: [], added: ['- button "Bench Admin"', '- heading "Welcome to OpenProject"'] } },
      { k: 'report', status: 'success', summary: 'Signed in as Bench Admin.', values: { admin_first_name: FRAGMENT, signed_in_as: SEED_NAME }, skill: 's_signin' },
      { k: 'instruction', text: "Open the work package created by Bench in the 'Bench Project' project.", url: `${OP}/`, startText: '- button "Bench Admin"\n- link "Bench Project"' },
      { k: 'report', status: 'success', summary: 'Opened.', values: { subject: 'fx1 Bench Work Package' }, skill: 's_open' },
    ];
  }

  it('seedNameFact is reliable at two sessions for the whole element name, not at one', () => {
    const two = softFacts(OP, [{ k: 'value.class', key: valueHash(SEED_NAME), v: 'seed' }]);
    expect(seedNameFact(two, SEED_NAME)).toBe(true);
    const one = oneSessionFacts(OP, [{ k: 'value.class', key: valueHash(SEED_NAME), v: 'seed' }]);
    expect(seedNameFact(one, SEED_NAME)).toBe(false);
  });

  it('mint wins: a reliable mint fact of the same hash beats a reliable seed fact', () => {
    const sf = emptyFacts(OP);
    observeFact(sf, obs({ k: 'value.class', key: valueHash(SEED_NAME), v: 'seed', session: 's1' }));
    observeFact(sf, obs({ k: 'value.class', key: valueHash(SEED_NAME), v: 'seed', session: 's2' }));
    // a hard, single-observation mint fact contradicts the stored 'seed' value,
    // which is exactly what a real mint admission would do on the same hash
    observeFact(sf, obs({ k: 'value.class', key: valueHash(SEED_NAME), v: 'mint', hard: true, session: 's3' }));
    expect(seedNameFact(sf, SEED_NAME)).toBe(false);
  });

  it('seedFragmentOf finds "Bench" as a proper fragment of the seed element name "Bench Admin"; "Bench Admin" itself is not its own fragment', () => {
    const sf = softFacts(OP, [{ k: 'value.class', key: valueHash(SEED_NAME), v: 'seed' }]);
    const lines = ['- button "Bench Admin"', '- heading "Welcome to OpenProject"'];
    // elementNameOf folds the a11y name (foldValue): the returned name is folded too.
    expect(seedFragmentOf(sf, FRAGMENT, lines)).toBe(SEED_NAME.toLowerCase());
    expect(seedFragmentOf(sf, SEED_NAME, lines)).toBeNull(); // the whole name is seedNameFact's case, not a fragment of itself
    expect(seedFragmentOf(sf, 'enc', lines)).toBeNull(); // "enc" is inside "bench" but not a whole token
  });

  it('with no facts (or only one session) seedFragmentOf finds nothing', () => {
    const lines = ['- button "Bench Admin"'];
    expect(seedFragmentOf(undefined, FRAGMENT, lines)).toBeNull();
    const one = oneSessionFacts(OP, [{ k: 'value.class', key: valueHash(SEED_NAME), v: 'seed' }]);
    expect(seedFragmentOf(one, FRAGMENT, lines)).toBeNull();
  });

  it('buildFlow does not thread admin_first_name="Bench" into a LATER instruction once the seed fact is reliable, inside quotes AND outside them', () => {
    const sf = softFacts(OP, [{ k: 'value.class', key: valueHash(SEED_NAME), v: 'seed' }]);
    const flow = buildFlow(recording(), { name: 'op', origin: OP, startUrl: `${OP}/`, vars: {}, session: 's', now: '2026-09-27T00:00:00Z', facts: sf })!;
    expect(flow).toBeTruthy();
    // not threaded: no reference to the earlier instruction's output, in any form
    expect(flow.steps[1].instruction).not.toContain('admin_first_name');
    expect(flow.steps[1].instruction).not.toContain('{{01-signin.admin_first_name}}');
    // the instruction's own authored word is untouched
    expect(flow.steps[1].instruction).toContain('created by Bench in');
  });

  it('with the seed fact only ADVISORY (one session), the word still threads outside quotes — only the punctuation rule stops the quoted case', () => {
    const one = oneSessionFacts(OP, [{ k: 'value.class', key: valueHash(SEED_NAME), v: 'seed' }]);
    const flow = buildFlow(recording(), { name: 'op', origin: OP, startUrl: `${OP}/`, vars: {}, session: 's', now: '2026-09-27T00:00:00Z', facts: one })!;
    expect(flow.steps[1].instruction).toContain('{{01-signin.admin_first_name}}');
  });
});

// ---------------------------------------------------------------------------
// 2. fwgt17 (gitea): a "Labels" picker's reported state ("closed") has a
//    reliable `value.role` = 'state' fact under its shapeKey; the ledger does
//    not bank it as an identifier and the export does not make it a
//    `requireText` identity marker, even on a page line that does not show
//    the word (today's only path to catching this class).
// ---------------------------------------------------------------------------

describe("fwgt17: a labels-picker STATE label with a reliable role fact is never banked or marked, page line or none", () => {
  const ORIGIN = 'http://gt.test';
  const URL_ = `${ORIGIN}/issue`;
  const KEY = shapeKeyOf(URL_, 'labels_picker_state');
  const VALUE = 'closed';

  it("today, unaided: a short lowercase word with no page line naming it is banked as identifier-shaped text below the id floor, or kept as an ordinary value — no rule excludes a STATE word by itself", () => {
    const ledger = new RunLedger();
    const entry = ledger.add(VALUE, outputBinding('i1', 'labels_picker_state'));
    // today, with no facts and no shape evidence, a plain word is text — the
    // gap the contract names is that nothing DECIDES it is a state, only that
    // nothing today marks it as data either; the point is what the fact adds.
    expect(entry?.kind).toBe('text');
  });

  it('valueRoleFact is reliable at two sessions and null while only advisory (one session)', () => {
    const two = softFacts(ORIGIN, [{ k: 'value.role', key: KEY, v: 'state' }]);
    expect(valueRoleFact(two, KEY)).toBe('state');
    const one = oneSessionFacts(ORIGIN, [{ k: 'value.role', key: KEY, v: 'state' }]);
    expect(valueRoleFact(one, KEY)).toBeNull();
  });

  it('roleVerdict returns { role: "state" } for a reliable state role under the key, and null for a "name" role', () => {
    const state = softFacts(ORIGIN, [{ k: 'value.role', key: KEY, v: 'state' }]);
    expect(roleVerdict(state, KEY)).toMatchObject({ role: 'state' });
    const NAME_KEY = shapeKeyOf(URL_, 'issue_author');
    const named = softFacts(ORIGIN, [{ k: 'value.role', key: NAME_KEY, v: 'name' }]);
    expect(roleVerdict(named, NAME_KEY)).toBeNull(); // a name role never decides
  });

  it('valueVerdict gains the role arm: a reliable state role under shapeKey is not-identifier, after the mint/shape arms (mint still wins)', () => {
    const state = softFacts(ORIGIN, [{ k: 'value.role', key: KEY, v: 'state' }]);
    expect(valueVerdict(state, VALUE, KEY)).toMatchObject({ kind: 'not-identifier' });
    // mint wins: add a reliable mint class fact for the SAME value and it decides identifier instead
    const withMint = softFacts(ORIGIN, [
      { k: 'value.role', key: KEY, v: 'state' },
      { k: 'value.class', key: valueHash(VALUE), v: 'mint' },
    ]);
    expect(valueVerdict(withMint, VALUE, KEY)).toMatchObject({ kind: 'identifier' });
  });

  it("RunLedger.add(..., facts) banks the value text, not identifier, once the state role fact is reliable", () => {
    const sf = softFacts(ORIGIN, [{ k: 'value.role', key: KEY, v: 'state' }]);
    const ledger = new RunLedger();
    const entry = ledger.add(VALUE, outputBinding('i1', 'labels_picker_state'), { shapeKey: KEY }, sf);
    expect(entry).toMatchObject({ kind: 'text' });
    expect(entry?.vouched).toBeFalsy();
  });

  it('compile does not make a slot whose origin report carries this reliable state role a requireText identity marker', () => {
    const stepOf = (tool: string, args: Record<string, unknown>, chain: RecordedStep['locators']['target']['chain'] = []): RecordedStep => ({
      k: 'step',
      tool,
      args,
      locators: args.target ? { target: { expr: 'x', verified: true, raw: String(args.target), chain } } : {},
    });
    const INSTR = "Confirm the labels picker for issue 42 shows 'closed' and close the dialog.";
    const entries = (startText: string): RecordedEntry[] => [
      { k: 'instruction', text: INSTR, url: URL_, fingerprint: [1, 0, 0], startText },
      stepOf('click', { target: '@e1' }, [{ kind: 'role', role: 'button', name: 'Close dialog' }]),
    ];
    const REPORT = { status: 'success' as const, summary: 'Confirmed.', evidence: { values: {} } };
    const known = { 'output:i1:labels_picker_state': VALUE };
    const compile = (facts?: SiteFacts): CompileInput =>
      ({ entries: entries('- text "closed"\n- heading "Issue 42"'), instruction: INSTR, report: REPORT, session: 's', now: '2026-09-27T00:00:00.000Z', knownValues: known, ...(facts ? { facts } : {}) });

    const [withoutFacts] = compileSkills(compile());
    expect(withoutFacts.preconditions.requireText?.length).toBeGreaterThan(0); // today: the value is a marker

    const sf = softFacts(ORIGIN, [{ k: 'value.role', key: KEY, v: 'state' }]);
    const [withFacts] = compileSkills(compile(sf));
    expect(withFacts.preconditions.requireText).toBeUndefined(); // withheld once the state role is reliable
  });
});

// ---------------------------------------------------------------------------
// 3. fwkb35 (kanboard): the seed task title "Seed: triage inbox" — a WHOLE
//    seed name (not a fragment) — is `seedNameFact` true at two sessions, and
//    the ledger files a value equal to it as text, not an identifier.
// ---------------------------------------------------------------------------

describe('fwkb35: the seed task title "Seed: triage inbox" is a reliable whole seed name — ledger files it text', () => {
  const ORIGIN = 'http://kb.test';
  const TITLE = 'Seed: triage inbox';

  it('today, unaided: the title is ordinary text (no id-shaped characters, no facts) — already text', () => {
    const ledger = new RunLedger();
    const entry = ledger.add(TITLE, outputBinding('i1', 'task_title'));
    expect(entry?.kind).toBe('text');
  });

  it('seedNameFact is true for the whole title at two sessions, false at one', () => {
    const two = softFacts(ORIGIN, [{ k: 'value.class', key: valueHash(TITLE), v: 'seed' }]);
    expect(seedNameFact(two, TITLE)).toBe(true);
    const one = oneSessionFacts(ORIGIN, [{ k: 'value.class', key: valueHash(TITLE), v: 'seed' }]);
    expect(seedNameFact(one, TITLE)).toBe(false);
  });

  it('valueVerdict gains the seed arm: a reliable seed class of the value is not-identifier, after mint/shape (mint wins)', () => {
    const sf = softFacts(ORIGIN, [{ k: 'value.class', key: valueHash(TITLE), v: 'seed' }]);
    expect(valueVerdict(sf, TITLE)).toMatchObject({ kind: 'not-identifier' });
    // a hard mint observation contradicts and overrides the stored seed value on the same hash
    observeFact(sf, obs({ k: 'value.class', key: valueHash(TITLE), v: 'mint', hard: true, session: 's3' }));
    expect(valueVerdict(sf, TITLE)).toMatchObject({ kind: 'identifier' });
  });

  it('RunLedger.add(..., facts) banks the SAME title text, unvouched, once the seed fact is reliable', () => {
    const sf = softFacts(ORIGIN, [{ k: 'value.class', key: valueHash(TITLE), v: 'seed' }]);
    const ledger = new RunLedger();
    const entry = ledger.add(TITLE, outputBinding('i1', 'task_title'), {}, sf);
    expect(entry).toMatchObject({ kind: 'text', value: TITLE });
    expect(entry?.vouched).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// 4. a count under `open_issues_count` = "3" with a page line '"3 Open"' —
//    role count decides text, never an identifier, even under another
//    label's reliable `^\d+$` shape fact.
// ---------------------------------------------------------------------------

describe('a count value ("3", with "3 Open" on the page) is never an identifier, even under a shared digit shape', () => {
  const ORIGIN = 'http://gh.test';
  const URL_ = `${ORIGIN}/issues`;
  const COUNT_KEY = shapeKeyOf(URL_, 'open_issues_count');
  const OTHER_SHAPE_KEY = shapeKeyOf(URL_, 'issue_id'); // a DIFFERENT label whose shape is reliable
  const VALUE = '3';

  it('today, unaided: below MIN_ID_LEN, the ledger refuses to bank the bare digit at all', () => {
    const ledger = new RunLedger();
    expect(ledger.add(VALUE, outputBinding('i1', 'open_issues_count'))).toBeNull();
  });

  it('a reliable digits-only shape fact under a DIFFERENT label would otherwise bank "3" as a positional identifier (the stage 3 rule, fwkb41)', () => {
    const sf = emptyFacts(ORIGIN);
    observeFact(sf, obs({ k: 'value.shape', key: OTHER_SHAPE_KEY, v: { re: '^\\d+$', n: 2 }, hard: true, session: 's1' }));
    const ledger = new RunLedger();
    const entry = ledger.add(VALUE, outputBinding('i1', 'issue_id'), { shapeKey: OTHER_SHAPE_KEY }, sf);
    expect(entry).toMatchObject({ kind: 'identifier', positional: true });
  });

  it('valueRoleFact is reliable "count" under open_issues_count\'s own key at two sessions', () => {
    const two = softFacts(ORIGIN, [{ k: 'value.role', key: COUNT_KEY, v: 'count' }]);
    expect(valueRoleFact(two, COUNT_KEY)).toBe('count');
  });

  it('under open_issues_count\'s OWN key, a reliable count role banks "3" as text, never an identifier, even though the digits-only shape fact exists under the OTHER label', () => {
    const sf = emptyFacts(ORIGIN);
    observeFact(sf, obs({ k: 'value.shape', key: OTHER_SHAPE_KEY, v: { re: '^\\d+$', n: 2 }, hard: true, session: 's1' }));
    observeFact(sf, obs({ k: 'value.role', key: COUNT_KEY, v: 'count', session: 's1' }));
    observeFact(sf, obs({ k: 'value.role', key: COUNT_KEY, v: 'count', session: 's2' }));
    expect(valueVerdict(sf, VALUE, COUNT_KEY)).toMatchObject({ kind: 'not-identifier' });
    const ledger = new RunLedger();
    const entry = ledger.add(VALUE, outputBinding('i1', 'open_issues_count'), { shapeKey: COUNT_KEY }, sf);
    // not-identifier means never vouched past the length floor — a bare "3" is below MIN_ID_LEN and stays unbanked, never identifier
    expect(entry).toBeNull();
    // the OTHER label's shape fact, under its OWN key, still banks identifier — the role spoke only under its own key
    const ledger2 = new RunLedger();
    const entryOther = ledger2.add(VALUE, outputBinding('i2', 'issue_id'), { shapeKey: OTHER_SHAPE_KEY }, sf);
    expect(entryOther).toMatchObject({ kind: 'identifier', positional: true });
  });
});

// ---------------------------------------------------------------------------
// 5. byte-identical fallback: with no facts at all, valueVerdict and
//    seedNameFact/valueRoleFact decide nothing — the contract's promise
//    (principle: fallback byte-identical).
// ---------------------------------------------------------------------------

describe('byte-identical fallback: no facts, nothing about seed or role decides', () => {
  const ORIGIN = 'http://none.test';

  it('seedNameFact and valueRoleFact are both empty-safe', () => {
    const empty = emptyFacts(ORIGIN);
    expect(seedNameFact(empty, 'Bench Admin')).toBe(false);
    expect(valueRoleFact(empty, shapeKeyOf(`${ORIGIN}/x`, 'y'))).toBeNull();
  });

  it('valueVerdict returns null with no facts', () => {
    expect(valueVerdict(emptyFacts(ORIGIN), 'anything')).toBeNull();
  });

  it('seedFragmentOf and roleVerdict return null with no/undefined facts', () => {
    expect(seedFragmentOf(undefined, 'Bench', ['- button "Bench Admin"'])).toBeNull();
    expect(seedFragmentOf(emptyFacts(ORIGIN), 'Bench', ['- button "Bench Admin"'])).toBeNull();
    expect(roleVerdict(undefined, 'anykey')).toBeNull();
    expect(roleVerdict(emptyFacts(ORIGIN), shapeKeyOf(`${ORIGIN}/x`, 'y'))).toBeNull();
  });
});
