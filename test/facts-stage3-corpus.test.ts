/**
 * Site facts stage 3 (notes/design/site-facts-stage3-contract.md, Piece P):
 * one case per named survey row from design-site-facts.md §4 ("Survey rows
 * decided"), driven through the PUBLIC decision functions only —
 * `RunLedger.add` (src/skills/ledger.ts, Piece M), `valueVerdict` /
 * `ledgerRow` / `stripRow` / `sourcingRow` (src/skills/facts-value.ts, Piece
 * M), `setKnownCredentialHashes` / `scrubSecretsDeep` (src/shared/secrets.ts,
 * Piece M), `taskConstants` / `taskConstantArms` (src/skills/flow.ts, Piece
 * N) and `decideSourcingHold` (src/agent/sourcing.ts, Piece N).
 *
 * As facts-stage1-corpus.test.ts and facts-stage2-corpus.test.ts did: every
 * `SiteFacts` here is built BY HAND with `observeFact`
 * (src/execution/facts.ts) — a single `hard: true` observation where the
 * design's own table (§4) calls the observation a structural proof, TWO
 * SESSIONS with `hard: false` where the row is a SOFT kind — the point is the
 * CONSUMER, not the observer.
 *
 * Each fact-aware case is shown beside the plain call it replaces (the
 * contract's "fallback byte-identical" promise: `emptyFacts`/no facts
 * reproduces today's rule exactly) so a failure here says which side broke.
 */
import { describe, expect, it } from 'vitest';
import { emptyFacts, observeFact, shapeOf, valueHash, type Fact, type Observation, type SiteFacts } from '../src/execution/facts.js';
import { ledgerRow, shapeKeyOf, sourcingRow, stripRow, valueVerdict } from '../src/skills/facts-value.js';
import { RunLedger, type Binding } from '../src/skills/ledger.js';
import { MIN_ID_LEN, looksLikeId } from '../src/skills/shape.js';
import { taskConstantArms, taskConstants } from '../src/skills/flow.js';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { decideSourcingHold, isDataShaped, type SourcingFacts } from '../src/agent/sourcing.js';
import { ambiguousCredentialHashes, clearSecretLedger, notePasswordFieldLine, resolveSecrets, scrubSecretsDeep, setKnownCredentialHashes } from '../src/shared/secrets.js';

// ---------------------------------------------------------------------------
// shared fixture builders (the stage 1/2 corpus files' own pattern)
// ---------------------------------------------------------------------------

const obs = (o: Partial<Observation> & Pick<Observation, 'k' | 'key' | 'v'>): Observation => ({
  hard: false,
  session: 's1',
  at: '2026-09-26T10:00:00.000Z',
  ...o,
});

/** A SiteFacts with one HARD observation per add: the structural-proof path to `reliable()`. */
function hardFacts(origin: string, adds: { k?: Fact['k']; key: string; v: Fact['v'] }[]): SiteFacts {
  const sf = emptyFacts(origin);
  for (const a of adds) observeFact(sf, obs({ k: 'value.class', ...a, hard: true, session: 's1' }));
  return sf;
}

/** A SiteFacts with TWO soft sessions per add: the statistical path to `reliable()`. */
function softFacts(origin: string, adds: { k?: Fact['k']; key: string; v: Fact['v'] }[]): SiteFacts {
  const sf = emptyFacts(origin);
  for (const a of adds) {
    observeFact(sf, obs({ k: 'value.class', ...a, session: 's1' }));
    observeFact(sf, obs({ k: 'value.class', ...a, session: 's2' }));
  }
  return sf;
}

const outputBinding = (step: string, name: string): Binding => ({ from: 'output', step, name });

// ---------------------------------------------------------------------------
// 1. fwod84: FURN_7777 — a reliable `constant` value.class fact makes the
//    ledger bank it as text, never an identifier, however its characters
//    look; stripRow then says KEEP the locator candidates naming it (§4
//    consumers 1, 2).
// ---------------------------------------------------------------------------

describe('fwod84: FURN_7777 is a reliable constant — ledger banks it text, strip keeps the candidate', () => {
  const ORIGIN = 'http://od.test';
  const VALUE = 'FURN_7777';

  it("today, unaided: the ledger's shape prior banks it as an identifier (its characters look generated)", () => {
    const ledger = new RunLedger();
    const entry = ledger.add(VALUE, outputBinding('i1', 'code'));
    expect(entry?.kind).toBe('identifier');
    expect(looksLikeId(VALUE, 'first-run')).toBe(true);
  });

  it('a reliable constant class fact makes the SAME add() bank it as text, unvouched', () => {
    const sf = hardFacts(ORIGIN, [{ key: valueHash(VALUE), v: 'constant' }]);
    expect(sf.facts[0].hard && sf.facts[0].contra === 0).toBe(true);
    const ledger = new RunLedger();
    const entry = ledger.add(VALUE, outputBinding('i1', 'code'), {}, sf);
    expect(entry).toMatchObject({ kind: 'text', value: VALUE });
    expect(entry?.value && !('vouched' in (entry as object))).toBe(true);
  });

  it("stripRow says KEEP once the fact is reliable, disagreeing with a heuristic that would have stripped it as an identifier", () => {
    const sf = hardFacts(ORIGIN, [{ key: valueHash(VALUE), v: 'constant' }]);
    const row = stripRow(sf, VALUE, undefined, /* stripped today */ true, /* applied */ true);
    expect(row).toMatchObject({ rule: 'facts.strip', fact: 'keep', heuristic: 'strip', agree: false, applied: true });
  });

  it('byte-identical fallback: no facts, valueVerdict and ledgerRow decide nothing', () => {
    const empty = emptyFacts(ORIGIN);
    expect(valueVerdict(empty, VALUE)).toBeNull();
    expect(ledgerRow(empty, VALUE, undefined, 'identifier')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. fwkb41: "4" under task_id's reliable shape is an identifier — banked
//    POSITIONAL (below MIN_ID_LEN) where today's length floor drops it
//    entirely.
// ---------------------------------------------------------------------------

describe("fwkb41: \"4\" under task_id's reliable shape is an identifier, positional — the length floor waived", () => {
  const ORIGIN = 'http://kb.test';
  const URL_ = `${ORIGIN}/task`;
  const KEY = shapeKeyOf(URL_, 'task_id');
  const VALUE = '4';

  it("today, unaided: below MIN_ID_LEN and not vouched — the ledger refuses to bank it", () => {
    expect(VALUE.length).toBeLessThan(MIN_ID_LEN);
    const ledger = new RunLedger();
    expect(ledger.add(VALUE, outputBinding('i1', 'task_id'))).toBeNull();
  });

  it('a reliable value.shape fact under the key banks it as a POSITIONAL identifier', () => {
    const sf = emptyFacts(ORIGIN);
    observeFact(sf, obs({ k: 'value.shape', key: KEY, v: { re: '^\\d+$', n: 2 }, hard: true, session: 's1' }));
    const ledger = new RunLedger();
    const entry = ledger.add(VALUE, outputBinding('i1', 'task_id'), { shapeKey: KEY }, sf);
    expect(entry).toMatchObject({ kind: 'identifier', value: VALUE, positional: true });
  });

  it('byte-identical fallback: no facts, add() still refuses the bare digit', () => {
    const ledger = new RunLedger();
    expect(ledger.add(VALUE, outputBinding('i1', 'task_id'), { shapeKey: KEY }, emptyFacts(ORIGIN))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. fwec8: a uid minted from a JSON body — a HARD mint class fact (a
//    structural proof: the ledger's own provenance admission) makes the
//    ledger bank it as a vouched identifier from its first sighting.
// ---------------------------------------------------------------------------

describe('fwec8: a uid minted from a JSON response body — a hard mint fact banks it identifier, vouched, from n=1', () => {
  const ORIGIN = 'http://ec.test';
  // No digits, no '-'/'_', under 12 characters and not all-hex letters: the
  // shape prior's `generatedToken` test (skills/shape.ts) misses it entirely.
  const VALUE = 'billinguid';

  it("today, unaided: the shape prior does not call this token an identifier (no digit, too short, not all hex letters)", () => {
    expect(looksLikeId(VALUE, 'first-run')).toBe(false);
    const ledger = new RunLedger();
    const entry = ledger.add(VALUE, outputBinding('i1', 'uid'));
    expect(entry?.kind).toBe('text');
  });

  it("a single HARD mint observation (one session) is reliable and banks the SAME value identifier, vouched — the shape prior missed it, the fact does not", () => {
    const sf = hardFacts(ORIGIN, [{ key: valueHash(VALUE), v: 'mint' }]);
    expect(sf.facts[0].sessions.length).toBe(1);
    expect(valueVerdict(sf, VALUE)).toMatchObject({ kind: 'identifier' });
    const ledger = new RunLedger();
    const entry = ledger.add(VALUE, outputBinding('i1', 'uid'), {}, sf);
    expect(entry).toMatchObject({ kind: 'identifier', value: VALUE });
  });
});

// ---------------------------------------------------------------------------
// 4. fwgh14 / fwsi14: a minted tag's shape (BA-00006-style) is an
//    identifier — where two candidates were met under one label, the fact
//    (keyed on the LABEL's shape) decides each on its own merits: the
//    correctly-minted one is identifier, and so is a wrong-looking second
//    one that shares the shape — the FACT's word wins over which one the
//    run happened to see first.
// ---------------------------------------------------------------------------

describe('fwgh14 / fwsi14: a reliable mint SHAPE under the label decides each of two banked values by the fact, not by banking order', () => {
  const ORIGIN = 'http://si.test';
  const URL_ = `${ORIGIN}/hardware`;
  const KEY = shapeKeyOf(URL_, 'asset_tag');
  const RIGHT = 'BA-00006';
  const WRONG_LOOKING = 'BA-00007'; // shares the same shape; the survey's "wrong of two banked"

  it('a reliable shape fact (two distinct minted values agreeing) makes BOTH values identifiers under this key', () => {
    const sf = emptyFacts(ORIGIN);
    observeFact(sf, obs({ k: 'value.shape', key: KEY, v: { re: shapeOf(RIGHT), n: 2 }, hard: true, session: 's1' }));
    expect(valueVerdict(sf, RIGHT, KEY)).toMatchObject({ kind: 'identifier' });
    expect(valueVerdict(sf, WRONG_LOOKING, KEY)).toMatchObject({ kind: 'identifier' });
    const ledger = new RunLedger();
    const first = ledger.add(RIGHT, outputBinding('i1', 'asset_tag'), { shapeKey: KEY }, sf);
    const second = ledger.add(WRONG_LOOKING, outputBinding('i2', 'asset_tag'), { shapeKey: KEY }, sf);
    expect(first?.kind).toBe('identifier');
    expect(second?.kind).toBe('identifier');
  });

  it("a value NOT matching the shape (a different label's shape) is not swept in — the fact speaks only under its own key", () => {
    const sf = emptyFacts(ORIGIN);
    observeFact(sf, obs({ k: 'value.shape', key: KEY, v: { re: shapeOf(RIGHT), n: 2 }, hard: true, session: 's1' }));
    expect(valueVerdict(sf, RIGHT, shapeKeyOf(URL_, 'serial'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. fwod88: a read locator names its own mint — stripRow says STRIP once
//    the class fact is reliable, disagreeing with today's KEEP.
// ---------------------------------------------------------------------------

describe('fwod88: a read locator naming its own mint — stripRow says STRIP once the mint fact is reliable', () => {
  const ORIGIN = 'http://od.test';
  const VALUE = 'S00042';

  it('today, unaided (below the length floor / no shape evidence): the candidate is kept', () => {
    const row = stripRow(emptyFacts(ORIGIN), VALUE, undefined, false);
    expect(row).toBeNull(); // no facts speak about it at all: not a decision the facts take part in
  });

  it('a reliable mint class fact strips the candidate, disagreeing with a heuristic that kept it, applied when the strip acted on it', () => {
    const sf = hardFacts(ORIGIN, [{ key: valueHash(VALUE), v: 'mint' }]);
    const row = stripRow(sf, VALUE, undefined, /* stripped today */ false, /* applied */ true);
    expect(row).toMatchObject({ rule: 'facts.strip', fact: 'strip', heuristic: 'keep', agree: false, applied: true });
  });
});

// ---------------------------------------------------------------------------
// 6. fwgr68 / fwkb39: password = username — a reliable credential fact
//    scrubs the ambiguous value in ANY line, not only the password field's
//    own.
// ---------------------------------------------------------------------------

describe('fwgr68 / fwkb39: a reliable credential fact scrubs the username line too, not only the password field', () => {
  const USER = 'admin';

  it('today, unaided: the ambiguous value is scrubbed ONLY inside its own password-field line', () => {
    clearSecretLedger();
    try {
      process.env.APP_PASSWORD = USER;
      process.env.APP_EMAIL = USER; // a plain (non-credential) variable holds the same value: ambiguous
      resolveSecrets('login {{env:APP_PASSWORD}}'); // banks it onto ambiguousLedger, not the main ledger
      notePasswordFieldLine(`textbox "Password": ${USER}`);
      const headingLine = `heading "Dashboard for ${USER}"`;
      expect(scrubSecretsDeep(`textbox "Password": ${USER}`, { knownCredentials: true })).toBe('textbox "Password": {{env:APP_PASSWORD}}');
      // outside the password field, the ambiguous value is untouched today
      expect(scrubSecretsDeep(headingLine, { knownCredentials: true })).toBe(headingLine);
    } finally {
      clearSecretLedger();
      delete process.env.APP_PASSWORD;
      delete process.env.APP_EMAIL;
    }
  });

  it('once a reliable credential fact hands back the hash, the SAME value is scrubbed in a line outside the password field too', () => {
    clearSecretLedger();
    try {
      process.env.APP_PASSWORD = USER;
      process.env.APP_EMAIL = USER;
      resolveSecrets('login {{env:APP_PASSWORD}}');
      notePasswordFieldLine(`textbox "Password": ${USER}`);
      // the site-facts observer would file value.class `credential` for this
      // hash and hand it back through setKnownCredentialHashes (secrets.ts)
      expect(ambiguousCredentialHashes()).toEqual([valueHash(USER)]);
      setKnownCredentialHashes(ambiguousCredentialHashes());
      const headingLine = `heading "Dashboard for ${USER}"`;
      expect(scrubSecretsDeep(headingLine, { knownCredentials: true })).toBe('heading "Dashboard for {{env:APP_PASSWORD}}"');
    } finally {
      clearSecretLedger();
      delete process.env.APP_PASSWORD;
      delete process.env.APP_EMAIL;
    }
  });

  it('byte-identical fallback: knownCredentials without setKnownCredentialHashes scrubs nothing outside the password line', () => {
    clearSecretLedger();
    try {
      const headingLine = `heading "Dashboard for ${USER}"`;
      expect(scrubSecretsDeep(headingLine, { knownCredentials: true })).toBe(headingLine);
    } finally {
      clearSecretLedger();
    }
  });
});

// ---------------------------------------------------------------------------
// 7. fwvk15 / fwsi16: unasked list columns — a value the app OFFERED before
//    it was reported is a task constant by a reliable constant fact (not
//    threaded as a literal into a later step); a value of a reliable MINT
//    shape that nothing asked for and nothing read is held for a read
//    anyway (sourcing.ts consumer 3).
// ---------------------------------------------------------------------------

describe('fwvk15 / fwsi16: unasked list columns — task constants by fact, and the unasked mint-shaped hold', () => {
  const X = 'http://si.test';
  const URL_ = `${X}/hardware`;

  it("fwsi16: 'model'/'status' were unasked list-column text — a reliable constant class fact makes them task constants when the heuristic arms miss them", () => {
    // The signin instruction never asked for these; a later instruction
    // states them as literals with nothing publishing them first, which is
    // what round 65 refused to compile (unsourced-ref).
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Sign in and open the assets list.', url: `${X}/`, fingerprint: [1, 0, 0] },
      { k: 'report', status: 'success', summary: 'Signed in.', values: { model: 'MacBook Pro', status: 'Ready to Deploy' } },
    ];
    // Neither the "offered before reported" nor the "stated before reported"
    // arm caught these (nothing offered them on the page in this recorded
    // slice, and no instruction named them before the report did):
    expect([...taskConstants(entries, ['MacBook Pro', 'Ready to Deploy'])]).toEqual([]);

    const sf = emptyFacts(X);
    observeFact(sf, obs({ k: 'value.class', key: valueHash('MacBook Pro'), v: 'constant', hard: true, session: 's1' }));
    observeFact(sf, obs({ k: 'value.class', key: valueHash('Ready to Deploy'), v: 'constant', hard: true, session: 's1' }));
    const withFacts = taskConstants(entries, ['MacBook Pro', 'Ready to Deploy'], [], undefined, sf);
    expect([...withFacts]).toEqual(['MacBook Pro', 'Ready to Deploy']);
    const arms = taskConstantArms(entries, ['MacBook Pro', 'Ready to Deploy'], [], undefined, sf);
    expect([...arms]).toEqual([
      ['MacBook Pro', 'fact'],
      ['Ready to Deploy', 'fact'],
    ]);
  });

  it('fwsi16: an unasked, unread value of a reliable MINT shape is still held for a read (byFact)', async () => {
    const factsOf = (sf: SiteFacts): SourcingFacts => ({ verdict: (value, key) => valueVerdict(sf, value, shapeKeyOf(URL_, key)) });
    const shaped = emptyFacts(X);
    observeFact(shaped, obs({ k: 'value.shape', key: shapeKeyOf(URL_, 'asset_tag'), v: { re: shapeOf('BA-00006'), n: 2 }, hard: true, session: 's1' }));

    const instruction = 'Open the assets list and report the total count.';
    const values = { total: '12', asset_tag: 'BA-00042' };
    expect(isDataShaped(values.asset_tag)).toBe(true);

    const noFacts = await decideSourcingHold({
      instruction,
      values,
      alreadyRead: new Set<string>(),
      alertTexts: [],
      verdict: async () => 'absent',
    });
    // today: asset_tag was not asked, so it is never held
    expect(noFacts.held.some((h) => h.key === 'asset_tag')).toBe(false);

    const withFacts = await decideSourcingHold({
      instruction,
      values,
      alreadyRead: new Set<string>(),
      alertTexts: [],
      verdict: async () => 'absent',
      facts: factsOf(shaped),
    });
    expect(withFacts.held).toContainEqual({ key: 'asset_tag', value: 'BA-00042', verdict: 'absent', byFact: true });
  });
});
