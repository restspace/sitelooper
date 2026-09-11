import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLASS_HASH_HEX_RUN,
  GENERATED_ID_HEX_RUN,
  digitDominant,
  looksLikeId,
  skeleton,
  tokenPattern,
  type ShapePrior,
} from '../src/skills/shape.js';

/**
 * THE GREP GATE (PLAN-evidence-over-shape.md, "How we will know it worked").
 *
 * Reading a value's characters to guess whether it is an identifier is a
 * whole-product policy question, not a local one: each of the seven leaks in
 * PLAN-provenance.md was a correct, narrow fix to a rule that had no home, and
 * the rate of discovery did not fall. So the rule gets a home (src/skills/
 * shape.ts) and this test is its fence.
 *
 * Three things are pinned:
 *
 *  1. The shape tests exist ONCE: the predicate, the token boundary and the
 *     skeleton are defined in shape.ts and nowhere else.
 *  2. Every call site is inventoried by the QUESTION it asks, with the
 *     direction a wrong answer fails in. The counts are exact, so a new site
 *     fails this test until someone writes it down — which is the moment to
 *     ask whether evidence could decide it.
 *  3. Every other character-class regex in src/ that could re-implement one
 *     of them — an alphanumeric class that is quantified, or used as a token
 *     boundary — is on an allowlist that says what question it answers.
 *
 * This test is a ratchet, not a ban. Lowering a count is always fine. Raising
 * one is a decision that should be argued for in the commit message.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = 'src/skills/shape.ts';

/** Every .ts file under src/, repo-relative, forward-slashed. */
function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts')) out.push(path.relative(ROOT, p).split(path.sep).join('/'));
    }
  };
  walk(path.join(ROOT, 'src'));
  return out.sort();
}

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * Source with comments stripped. The rule is about CODE: a comment naming
 * `looksLikeId()` is documentation, and counting it would move the inventory
 * whenever someone explains a site rather than adds one.
 */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

type Fn = 'digitDominant' | 'looksLikeId' | 'tokenPattern' | 'skeleton';
const FNS: Fn[] = ['digitDominant', 'looksLikeId', 'tokenPattern', 'skeleton'];
/** The two that take a ShapePrior; the other two are built on them. */
const PREDICATES: Fn[] = ['digitDominant', 'looksLikeId'];

const callsIn = (src: string, fn: Fn) => [...code(src).matchAll(new RegExp(`\\b${fn}\\s*\\(`, 'g'))].length;

/**
 * The complete inventory, by question (decision 5C).
 *
 * `fails` is the direction a WRONG answer sends the run, and it is the whole
 * point of the column: a site that fails toward COST spends a recovery turn,
 * which the next run gets back. A site that fails toward SILENCE acts on the
 * recording run's record and reports success — a green run that did the wrong
 * work — and those are the sites worth converting to evidence next.
 *
 * Which function a site calls follows from its direction. Where an ID answer
 * GENERALISES (a `:id`, a `*`, a demotion, a proposed ref) a false yes is the
 * silent one, so the site takes the narrow `digitDominant`. Where an ID
 * answer ADMITS (a banked value, a threaded reference, a split boundary) a
 * false no is the silent one, so the site takes the generous `looksLikeId`.
 */
const INVENTORY: { file: string; fn: Fn; calls: number; question: string; fails: 'cost' | 'silence'; note: string }[] = [
  {
    file: 'src/skills/ledger.ts',
    fn: 'looksLikeId',
    calls: 2,
    question: 'is this value run-scoped enough to bank?',
    fails: 'silence',
    note:
      'add() kinds an entry, and addUrlIds() admits url parts. An unbanked url ' +
      'id is one no leak guard can see (fwod27). Both are LAST resorts: ' +
      'seedVariance and idPositionPart decide first, so the characters decide ' +
      'only on a first recording.',
  },
  {
    file: 'src/skills/flow.ts',
    fn: 'looksLikeId',
    calls: 2,
    question: 'is this url part / json leaf a reference?',
    fails: 'silence',
    note:
      'referencablePart (shared by buildFlow minting and urlOutputs) and ' +
      'jsonLeaves. Both consult runSpecific first. The reported-VALUE path ' +
      'beside them references everything and lets evidence demote.',
  },
  {
    file: 'src/skills/compile.ts',
    fn: 'looksLikeId',
    calls: 1,
    question: 'did this post-nav url part get minted?',
    fails: 'cost',
    note: 'discoverMinted. A missed mint costs a soft-match comparison (softUrlMatch generalises on evidence).',
  },
  {
    file: 'src/skills/compile.ts',
    fn: 'digitDominant',
    calls: 3,
    question: 'is this url segment / name a record rather than a route or control?',
    fails: 'cost',
    note:
      'urlPattern (path and hash state) proposes `:id`, softUrlMatch corrects ' +
      'on observed variance; stableFirst demotes a name that is only an id.',
  },
  {
    file: 'src/agent/report.ts',
    fn: 'digitDominant',
    calls: 1,
    question: 'is this prose token the run\'s record reference?',
    fails: 'cost',
    note:
      'proseIdentifiers proposes (cap 3); captureReadBack adjudicates each on ' +
      'the live page before it is published as `ref`.',
  },
  {
    file: 'src/skills/compile.ts',
    fn: 'tokenPattern',
    calls: 3,
    question: 'where does this known value stand as a whole token?',
    fails: 'cost',
    note: 'derivesFromKnown, countTokenOccurrences, substitute (whose numeric branch only narrows it).',
  },
  {
    file: 'src/skills/ledger.ts',
    fn: 'tokenPattern',
    calls: 1,
    question: 'where does this known value stand as a whole token?',
    fails: 'cost',
    note: 'occursAsToken — the leak scanner, runValuesIn, and compile\'s slot discovery and stripper through it.',
  },
  {
    file: 'src/skills/flow.ts',
    fn: 'tokenPattern',
    calls: 1,
    question: 'where does this known value stand as a whole token?',
    fails: 'cost',
    note: 'replaceToken (coincidental() is gone: the boundary itself now refuses a word inside a compound).',
  },
  {
    file: 'src/agent/report.ts',
    fn: 'tokenPattern',
    calls: 1,
    question: 'where does this known value stand as a whole token?',
    fails: 'cost',
    note: 'cites(), with elastic whitespace.',
  },
  {
    file: 'src/daemon/recorder.ts',
    fn: 'skeleton',
    calls: 1,
    question: 'does this test hook name a role on the page, or a record?',
    fails: 'cost',
    note:
      'captureReadBack pins an ambiguous value to its one stable-hooked match. A hook ' +
      'wrongly judged per-record is refused (the value is still published unpinned and ' +
      'goes through recovery); one wrongly judged stable still has to be the ONLY hooked ' +
      'match, so a list with the hook on every row refuses either way.',
  },
  {
    file: 'src/skills/compile.ts',
    fn: 'skeleton',
    calls: 8,
    question: 'are these two locators the same procedure on different records?',
    fails: 'silence',
    note:
      'bookmarked and stableFirst only demote (cost). locatorShape and ' +
      'candSkeleton feed sameProcedure and loopEquivalent, where over-merging ' +
      'is silent — which is why the skeleton blanks only digit-dominant tokens.',
  },
];

describe('the shape rule has one home', () => {
  it('defines the shape tests in shape.ts and nowhere else', () => {
    const names = [...FNS, 'looksLikeIdSegment', 'isDateOrTime', 'isDecimal', 'coincidental', 'stripIds'];
    for (const name of names) {
      const defs = sources().filter((f) => new RegExp(`\\bfunction\\s+${name}\\b|\\b(?:const|let)\\s+${name}\\s*=`).test(code(read(f))));
      expect(defs, `${name} defined outside ${HOME}`).toEqual(name === 'looksLikeIdSegment' || name === 'coincidental' || name === 'stripIds' ? [] : [HOME]);
    }
  });

  it('lets no caller reach a predicate without naming a prior', () => {
    for (const f of sources()) {
      if (f === HOME) continue;
      const src = code(read(f));
      for (const fn of PREDICATES) {
        for (const m of src.matchAll(new RegExp(`\\b${fn}\\s*\\(`, 'g'))) {
          const tail = src.slice(m.index ?? 0, (m.index ?? 0) + 400);
          expect(tail, `${f}: ${fn} called without a ShapePrior`).toMatch(/'(?:first-run|ordering|proposal|diagnostic)'/);
        }
      }
    }
  });

  it('offers no way to spell a verdict', () => {
    expect(read(HOME)).not.toMatch(/\| 'verdict'/);
  });

  it('keeps the page-side hex literals equal to their constants', () => {
    // Decision 3C: the hex rules stay separate because they answer different
    // questions, but each has ONE threshold. Page-side code cannot import, so
    // its literal is held equal to the constant here.
    expect(code(read('src/daemon/recorder.ts'))).toContain(`/${GENERATED_ID_HEX_RUN.source}/i`);
    expect(code(read('src/daemon/fingerprint.ts'))).toContain(CLASS_HASH_HEX_RUN.source);
  });
});

/**
 * The census (decision 5B): an alphanumeric character class that is either
 * quantified or used as a lookaround boundary. That is the shape of every
 * id test and every token boundary this codebase has ever grown — and also of
 * a handful of honest syntax parsers, which is why it is an allowlist and not
 * a ban. Each entry says what question its regex answers.
 */
const CENSUS = /\[(?!\^)([^\]\n]*)\](?:[+*]|\{\d)|\(\?<?[!=]\[\^?[^\]\n]*(?:A-Z|a-z|0-9)[^\]\n]*\]/g;

function census(src: string): string[] {
  const out: string[] = [];
  for (const m of code(src).matchAll(CENSUS)) {
    const lookaround = m[0].startsWith('(?');
    const inner = m[1] ?? '';
    if (!lookaround && !(/0-9|\\d/.test(inner) && /[a-zA-Z]-[a-zA-Z]/.test(inner))) continue;
    out.push(m[0]);
  }
  return out.sort();
}

const ALLOWLIST: Record<string, { hits: string[]; answers: string }> = {
  'src/agent/report.ts': {
    hits: ['[A-Za-z0-9._-]*', '[a-z0-9+.-]*'],
    answers: 'tokenises prose for proseIdentifiers (digitDominant judges each token), and skips a url scheme (syntax) so a host is never cited',
  },
  'src/daemon/diff.ts': { hits: ['[a-z0-9-]*'], answers: 'parses an aria-snapshot role name (syntax)' },
  'src/daemon/fingerprint.ts': { hits: ['[0-9a-f]{6'], answers: 'CLASS_HASH_HEX_RUN, page-side (decision 3C)' },
  'src/daemon/recorder.ts': {
    hits: ['[0-9a-f]{8', '[0-9a-z]{1', '[0-9a-z]{1'],
    answers: 'GENERATED_ID_HEX_RUN page-side (3C); React useId `_r8b_`, node- and page-side — framework ids, only demoted',
  },
  'src/shared/paths.ts': { hits: ['[A-Za-z0-9_-]{1'], answers: 'validates a session/file name (syntax)' },
  'src/shared/secrets.ts': { hits: ['[A-Za-z0-9_]*'], answers: 'parses {{env:NAME}} (syntax)' },
  'src/skills/compile.ts': {
    hits: ['(?![A-Za-z0-9)]', '(?<![A-Za-z0-9(=]'],
    answers: 'substitute\'s numeric branch: tokenPattern plus the nth-index and dotted-number guards',
  },
  'src/skills/relabel.ts': { hits: ['[a-zA-Z0-9_]{0'], answers: 'validates an output name (syntax)' },
  'src/spec/emit.ts': {
    hits: ['[A-Za-z0-9_$]*', '[A-Za-z0-9_$]*', '[A-Za-z0-9_]*', '[A-Za-z0-9_]*'],
    answers: 'JS identifier and {{env:NAME}} syntax in generated code',
  },
};

describe('no second copy under another name', () => {
  it('fences every alphanumeric class outside shape.ts behind the allowlist', () => {
    const found: Record<string, string[]> = {};
    for (const f of sources()) {
      if (f === HOME) continue;
      const hits = census(read(f));
      if (hits.length) found[f] = hits;
    }
    const expected = Object.fromEntries(Object.entries(ALLOWLIST).map(([f, e]) => [f, [...e.hits].sort()]));
    expect(
      found,
      'A character class that reads alphanumerics appeared (or moved) outside shape.ts. If it asks ' +
        '"is this an id?" or "is this a whole token?", call digitDominant/looksLikeId/tokenPattern/skeleton ' +
        'instead. If it is honest syntax, add it to ALLOWLIST with the question it answers.',
    ).toEqual(expected);
  });
});

describe('the shape inventory is pinned', () => {
  it('accounts for every file that calls a shape function', () => {
    for (const fn of FNS) {
      const callers = sources().filter((f) => f !== HOME && callsIn(read(f), fn) > 0);
      expect(callers.sort(), `${fn} callers`).toEqual(INVENTORY.filter((e) => e.fn === fn).map((e) => e.file).sort());
    }
  });

  for (const entry of INVENTORY) {
    it(`${entry.file} ${entry.fn}: ${entry.calls} site(s) — "${entry.question}", fails toward ${entry.fails}`, () => {
      const calls = callsIn(read(entry.file), entry.fn);
      expect(
        calls,
        `${entry.file} now has ${calls} ${entry.fn} call site(s), inventoried at ${entry.calls}.\n` +
          'Before raising the number, ask what evidence could decide this instead — ' +
          'position (idPositionPart), provenance (RunLedger), or cross-run variance ' +
          `(noteOutputEvidence). See ${HOME} and PLAN-evidence-over-shape.md.\n` +
          `This site's population: ${entry.note}`,
      ).toBe(entry.calls);
    });
  }

  it('does not grow the predicate total', () => {
    const total = INVENTORY.filter((e) => PREDICATES.includes(e.fn)).reduce((n, e) => n + e.calls, 0);
    // 17 on 2026-09-10; 15 on 2026-09-11 morning (learn.ts's honesty gate
    // deleted, flow.ts's two url admissions made one). 9 on 2026-09-11
    // evening: looksLikeIdSegment folded into the one predicate, coincidental
    // deleted, and every skeleton/boundary site now reaches the predicate
    // through skeleton()/tokenPattern(), which are pinned separately above.
    expect(total).toBeLessThanOrEqual(9);
  });

  it('leaves the silence-direction sites reachable only where no run could judge', () => {
    const flow = read('src/skills/flow.ts');
    expect(flow, 'referencablePart must admit on evidence before reaching shape').toMatch(
      /return Boolean\(runSpecific\?\.\(part\.value\)\) \|\| \(part\.value\.length >= MIN_ID_LEN && looksLikeId/,
    );
    expect(flow, 'jsonLeaves must admit on evidence before reaching shape').toMatch(
      /if \(!runSpecific\?\.\(value\) && !\(value\.length >= MIN_ID_LEN && looksLikeId\(value, 'first-run'\)\)\) return;/,
    );
    const ledger = read('src/skills/ledger.ts');
    expect(ledger, 'add() must kind on evidence before reaching the shape prior').toMatch(
      /kind: opts\.kind \?\? \(runSpecific \|\| looksLikeId\(v, 'first-run'\)/,
    );
    expect(ledger, 'addUrlIds must admit on evidence before reaching shape').toMatch(
      /if \(!runSpecific && !looksLikeId\(part\.value, 'first-run'\) && !idPositionPart\(part\)\) continue;/,
    );
  });

  it('gives evidence no way to say a value is NOT run-specific', () => {
    // A bench app reset between runs reproduces a minted record id exactly, so
    // agreement across runs is not evidence the app owns the value — and
    // acting on it would UNBANK a record id, which is the silent direction.
    expect(read('src/skills/flow.ts')).toMatch(/export type RunSpecific = \(value: string\) => boolean;/);
    expect(read('src/skills/ledger.ts')).toMatch(/private variance = new Set<string>\(\);/);
    for (const f of sources()) {
      expect(code(read(f)), `${f}: a variance verdict must never suppress`).not.toMatch(/runSpecific[^\n]*===\s*'text'/);
    }
  });
});

describe('the shape rule answers the cases that cost us runs', () => {
  const p: ShapePrior = 'proposal';

  it('digitDominant: digits at least as many as everything else', () => {
    for (const v of ['S00021', 'RD-1015', 't15', 'x7', '44', '1042', 'a1b2c3d4', '12-34-56', 'fwrd24l-n1', '127.0.0.1']) {
      expect(digitDominant(v, p), v).toBe(true);
    }
    for (const v of ['form', 'form2', 'tickets', 'bench-service-health', 'o_form_view_group', 'New (unsaved)', 'cfwcsdxqdjabkf', 'afw6yy5xx9', 'notifications']) {
      expect(digitDominant(v, p), v).toBe(false);
    }
  });

  it('refuses measured quantities and real dates and times, everywhere', () => {
    for (const v of ['125.00', '$125.00', '4,550.00', '5.00', '3.14', '2026-09-01', '01/09/2026', '09/03/2026 07:22', '2026-09-01T14:30:00Z', '14:30', '14:30:05', '2:30pm', '1 Sep 2026', 'Sep 1, 2026']) {
      expect(digitDominant(v, p), v).toBe(false);
      expect(looksLikeId(v, 'first-run'), v).toBe(false);
    }
  });

  it('looksLikeId admits the generated tokens digitDominant is too narrow to see', () => {
    for (const v of ['afw6yy5xx9', 'cfwcsdxqdjabkf', 'afwfbbc2of6rkf', 'deadbeef', 'form2', 'fr1']) expect(looksLikeId(v, 'first-run'), v).toBe(true);
    for (const v of ['bench-service-health', 'o_form_view_group', 'Ticket is not ready', 'tickets', 'new']) expect(looksLikeId(v, 'first-run'), v).toBe(false);
  });

  it('is one rule in two directions: everything numeric is identifier-like', () => {
    for (const v of ['S00021', 'RD-1015', 't15', 'x7', '44', 'a1b2c3d4', '12-34-56', 'fwrd24l-n1', '12 34']) {
      expect(digitDominant(v, p) ? looksLikeId(v, 'first-run') : true, v).toBe(true);
    }
  });

  it('tokenPattern: a word binds on - and _, an identifier splits', () => {
    expect(tokenPattern('form').test('o_form_view_group')).toBe(false);
    expect(tokenPattern('bench').test('fr1-bench-dashboard')).toBe(false);
    expect(tokenPattern('fr1').test('fr1-bench-dashboard')).toBe(true);
    expect(tokenPattern('t15').test('ticket-link-t15')).toBe(true);
    expect(tokenPattern('RD-1015').test('RD-10159')).toBe(false);
    expect(tokenPattern('£ 1,599.00', '', { elasticSpace: true }).test('total £1,599.00 due')).toBe(true);
  });

  it('skeleton: blanks numeric tokens, never an index, a marker or a word', () => {
    expect(skeleton('#row-1042 > a')).toBe('#row-* > a');
    expect(skeleton('ticket-link-t15')).toBe('ticket-link-*');
    expect(skeleton('#del-1')).toBe('#del-*');
    expect(skeleton('tbody > tr:nth-of-type(3) > td')).toBe('tbody > tr:nth-of-type(3) > td');
    expect(skeleton('row-{{v1}}')).toBe('row-{{v1}}');
    expect(skeleton('Administration')).toBe('Administration');
    expect(skeleton('Configuration')).toBe('Configuration');
  });
});
