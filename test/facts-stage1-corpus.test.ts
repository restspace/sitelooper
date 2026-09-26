/**
 * Site facts stage 1 (notes/design/site-facts-stage1-contract.md, Piece I):
 * one case per survey row from design-site-facts.md §2 ("Survey rows
 * decided"), driven through the PUBLIC decision functions only —
 * `preconditionVerdictWithFacts` / `landingVerdictWithFacts` /
 * `routesAgreeByFacts` (src/execution/facts-route.ts, Piece F),
 * `rewriteStoredPatterns` (src/skills/facts-rewrite.ts, Piece G), and
 * `addUrlIds` with a `facts` snapshot (src/skills/ledger.ts, Piece H).
 *
 * Every `SiteFacts` here is built BY HAND with `observeFact`
 * (src/execution/facts.ts) over TWO sessions with `hard: false` — the SOFT
 * path to `reliable()` (contra 0, sessions >= 2) — rather than the single
 * HARD observation a live recorder would actually produce for most of these
 * kinds. The point of this file is the CONSUMER, not the observer: whichever
 * way a fact became reliable, the same `reliable()` predicate feeds the same
 * decision functions, so building every fixture the same way (two soft
 * sessions) keeps the seven cases comparable.
 *
 * Each case shows the fact-aware verdict beside what the same call gives
 * with NO facts (`emptyFacts` or the plain gate/heuristic) — the contract's
 * "byte-identical fallback" promise — so a failure here says which side
 * broke: the fact stopped deciding, or the fallback stopped matching today's
 * rule.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { emptyFacts, observeFact, type Fact, type Observation, type SiteFacts } from '../src/execution/facts.js';
import { gotoLandingVerdict, preconditionVerdict } from '../src/execution/gates.js';
import {
  landingVerdictWithFacts,
  preconditionVerdictWithFacts,
  routesAgreeByFacts,
  type RoutesAgree,
} from '../src/execution/facts-route.js';
import { rewriteStoredPatterns } from '../src/skills/facts-rewrite.js';
import { RunLedger } from '../src/skills/ledger.js';
import { SkillStore, type Skill } from '../src/skills/store.js';

// ---------------------------------------------------------------------------
// shared fixture builders
// ---------------------------------------------------------------------------

/** One observation, defaulting to a fixed time so two calls only differ in session/value. */
const obs = (o: Partial<Observation> & Pick<Observation, 'k' | 'key' | 'v'>): Observation => ({
  hard: false,
  session: 's1',
  at: '2026-09-26T10:00:00.000Z',
  ...o,
});

/**
 * A `SiteFacts` built entirely from `observeFact`, TWO SESSIONS per fact, both
 * soft (`hard: false`) — exactly `reliable()`'s soft path. Every `add` here is
 * a pair of same-value observations under different session ids.
 */
function factsByHand(origin: string, adds: { k: Fact['k']; key: string; v: Fact['v'] }[]): SiteFacts {
  const sf = emptyFacts(origin);
  for (const a of adds) {
    observeFact(sf, obs({ ...a, session: 's1' }));
    observeFact(sf, obs({ ...a, session: 's2' }));
  }
  return sf;
}

let tmpDir: string;
function freshStore(): SkillStore {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-fs1-'));
  return new SkillStore(tmpDir);
}
function cleanup() {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
}

const mkSkill = (id: string, origin: string, urlPattern: string, stepUrl?: string): Skill =>
  ({
    id,
    origin,
    template: 't',
    params: {},
    preconditions: { urlPattern },
    steps: stepUrl ? [{ tool: 'click', args: { target: '@e1' }, locators: { css: '#b0' }, expect: { urlPattern: stepUrl } }] : [],
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'provisional',
    provenance: { session: 's', instruction: 't', created: 't' },
  }) as Skill;

// ---------------------------------------------------------------------------
// 1. fwop15-cv2: ?query_props is view state, not a record
// ---------------------------------------------------------------------------

describe('fwop15-cv2: preconditionVerdictWithFacts on a reliable route.query=state key (OpenProject query_props)', () => {
  const ROUTE = 'http://op.test/projects/demo/work_packages';
  const PATTERN = `${ROUTE}?query_props=%7B%22c%22%3A%5B%22id%22%5D%7D`;
  const LIVE = `${ROUTE}?query_props=%7B%22c%22%3A%5B%22t%22%2C%22id%22%5D%7D`;

  it('the plain heuristic only soft-matches on the differing query_props literal ("proceeding optimistically")', () => {
    const verdict = preconditionVerdict(PATTERN, LIVE, {}, null);
    expect(verdict.refuse).toBeUndefined();
    expect(verdict.soft).toBeDefined();
    expect(verdict.warnings.join(' ')).toContain('proceeding optimistically');
  });

  it('a reliable state fact widens query_props to :var and the gate passes cleanly, no soft match needed', () => {
    const sf = factsByHand('http://op.test', [{ k: 'route.query', key: `${ROUTE}?query_props`, v: 'state' }]);
    expect(sf.facts.every((f) => f.contra === 0 && f.sessions.length >= 2 && !f.hard)).toBe(true);
    const verdict = preconditionVerdictWithFacts(sf, PATTERN, LIVE, {}, null);
    expect(verdict.refuse).toBeUndefined();
    expect(verdict.soft).toBeUndefined();
    expect(verdict.warnings).toEqual([]);
    // byte-identical fallback: no facts at all reproduces the plain heuristic
    expect(preconditionVerdictWithFacts(emptyFacts('http://op.test'), PATTERN, LIVE, {}, null)).toEqual(preconditionVerdict(PATTERN, LIVE, {}, null));
  });
});

// ---------------------------------------------------------------------------
// 2. fwsi9 / fwsi14-cv3: #history is an anchor, not a route
// ---------------------------------------------------------------------------

describe('fwsi9 / fwsi14-cv3: a reliable route.fragment=anchor fact strips #history', () => {
  const SI = 'http://si.test';
  const PATTERN = `${SI}/hardware/:id#history`;
  const LIVE = `${SI}/hardware/4`;

  it('the plain gate refuses: the pattern asks for the #history anchor, the live url has none', () => {
    const verdict = preconditionVerdict(PATTERN, LIVE, { id: '4' }, null);
    expect(verdict.refuse).toBeDefined();
  });

  it('preconditionVerdictWithFacts strips the bare anchor from both sides and passes', () => {
    const sf = factsByHand(SI, [{ k: 'route.fragment', key: '', v: 'anchor' }]);
    const verdict = preconditionVerdictWithFacts(sf, PATTERN, LIVE, { id: '4' }, null);
    expect(verdict.refuse).toBeUndefined();
  });

  it('rewriteStoredPatterns rewrites the stored pattern itself, once, and the gate passes on the rewritten pattern with no facts', () => {
    const store = freshStore();
    try {
      store.put(mkSkill('s_03open', SI, `${SI}/hardware/:id#history`));
      const before = store.get('s_03open')!;
      const sf = factsByHand(SI, [{ k: 'route.fragment', key: '', v: 'anchor' }]);
      const rows = rewriteStoredPatterns(store, SI, sf);
      expect(rows).toEqual([{ skill: 's_03open', field: 'preconditions.urlPattern', from: `${SI}/hardware/:id#history`, to: `${SI}/hardware/:id` }]);
      const after = store.get('s_03open')!;
      expect(after.preconditions.urlPattern).toBe(`${SI}/hardware/:id`);
      expect(after.revision).toBe((before.revision ?? 0) + 1);
      expect(after.factRewrites).toEqual([{ k: 'route.fragment', key: '', at: expect.any(String) }]);
      // the rewritten (unanchored) pattern now passes plain preconditionVerdict directly, no facts needed
      expect(preconditionVerdict(after.preconditions.urlPattern, LIVE, { id: '4' }, null).refuse).toBeUndefined();
      // idempotent: a second pass finds nothing left to widen
      expect(rewriteStoredPatterns(store, SI, sf)).toEqual([]);
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. fwsi7: the goto landing gate
// ---------------------------------------------------------------------------

describe('fwsi7: landingVerdictWithFacts on a reliable route.query=state key', () => {
  const ROUTE = 'http://si.test/hardware/*';
  const TARGET = 'http://si.test/hardware/4?tab=list';
  const LANDED = 'http://si.test/hardware/4?tab=grid';

  it('the plain heuristic stops: tab asked for "list", the page landed on "grid"', () => {
    const verdict = gotoLandingVerdict(TARGET, LANDED, 'goto');
    expect(verdict).not.toBeNull();
    expect(verdict).toContain('navigated but landed on another view');
  });

  it('a reliable state fact drops tab from the comparison and the landing passes', () => {
    const sf = factsByHand('http://si.test', [{ k: 'route.query', key: `${ROUTE}?tab`, v: 'state' }]);
    const verdict = landingVerdictWithFacts(sf, TARGET, LANDED, 'goto');
    expect(verdict).toBeNull();
    // byte-identical fallback with no facts
    expect(landingVerdictWithFacts(emptyFacts('http://si.test'), TARGET, LANDED, 'goto')).toBe(gotoLandingVerdict(TARGET, LANDED, 'goto'));
  });
});

// ---------------------------------------------------------------------------
// 4. fwvk13: a reliable route.path identity fact admits a p1 that fails shape
// ---------------------------------------------------------------------------

describe('fwvk13: addUrlIds admits a p1 the shape/position rules alone would skip, on a reliable identity fact', () => {
  const VK = 'http://vk.test';
  const URL = `${VK}/projects/overview`; // 'overview': no digits, a plain word — looksLikeId is false, idPositionPart is false (label is p1, not q.id)

  it('with no facts, the part is never banked (fails shape and position)', () => {
    const l = new RunLedger();
    l.addUrlIds(URL, '04-open', [{ label: 'p1', value: 'overview' }]);
    expect(l.all().some((e) => e.value === 'overview')).toBe(false);
  });

  it('a reliable route.path identity fact admits it, vouched, on the first run', () => {
    // The key is generalised (p1 written *) because the ledger's own lookup
    // always tries the part AS an identity position first (urlFactVerdicts'
    // self-tag) — so this ONE fact applies to any record at this position on
    // this route, not only the specific url it was first observed on
    // ("another route's p1", the survey's own phrase for this case).
    const sf = factsByHand(VK, [{ k: 'route.path', key: `${VK}/projects/*#1`, v: 'identity' }]);
    const l = new RunLedger();
    const banked = l.addUrlIds(URL, '04-open', [{ label: 'p1', value: 'overview' }], {}, sf);
    expect(banked).toHaveLength(1);
    expect(banked[0]).toMatchObject({ value: 'overview', kind: 'identifier', basis: 'shape', binding: { from: 'url', label: 'p1', step: '04-open' } });
    expect(l.all().some((e) => e.value === 'overview')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. fwkb41: task_id=4 admitted on the first run
// ---------------------------------------------------------------------------

describe('fwkb41: addUrlIds admits a below-floor query id (task_id=4) on a reliable identity fact', () => {
  const KB = 'http://kb.test';
  const ROUTE = `${KB}/index.php`;
  const URL = `${ROUTE}?controller=TaskViewController&action=show&task_id=4`;
  const parts = [
    { label: 'q.controller', value: 'TaskViewController' },
    { label: 'q.action', value: 'show' },
    { label: 'q.task_id', value: '4' },
  ];

  it('with no facts, task_id=4 is skipped: a pure-digit query key below the length floor', () => {
    const l = new RunLedger();
    l.addUrlIds(URL, '05-open', parts);
    expect(l.all().some((e) => e.value === '4')).toBe(false);
  });

  it('a reliable identity fact on task_id admits it, banked positional (below MIN_ID_LEN, admitted on the fact alone)', () => {
    const sf = factsByHand(KB, [{ k: 'route.query', key: `${ROUTE}?task_id`, v: 'identity' }]);
    const l = new RunLedger();
    const banked = l.addUrlIds(URL, '05-open', parts, {}, sf);
    const task = banked.find((e) => e.value === '4');
    expect(task).toBeDefined();
    expect(task).toMatchObject({ kind: 'identifier', positional: true, binding: { label: 'q.task_id' } });
  });

  it('a reliable routing fact on the SAME key never admits it, whatever its digits', () => {
    const sf = factsByHand(KB, [{ k: 'route.query', key: `${ROUTE}?task_id`, v: 'routing' }]);
    const l = new RunLedger();
    const banked = l.addUrlIds(URL, '05-open', parts, {}, sf);
    expect(banked.some((e) => e.value === '4')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. fwgr74: a letters-only uid at p1 threads consistently as url.p1
// ---------------------------------------------------------------------------

describe('fwgr74: addUrlIds admits distinct grafana uids at p1 from the SAME identity fact (the fact names the position, not one value)', () => {
  const GR = 'http://gr.test';
  const ROUTE = `${GR}/d/*/overview`;

  it('with no facts, a short opaque p1 below both the shape and length bar is never banked', () => {
    const l = new RunLedger();
    l.addUrlIds(`${GR}/d/xk/overview`, '01-open', [{ label: 'p1', value: 'xk' }]);
    expect(l.all().some((e) => e.value === 'xk')).toBe(false);
  });

  it('the identity fact at p1 admits two DIFFERENT uids on two different calls — the fact names the position, not one value', () => {
    const sf = factsByHand(GR, [{ k: 'route.path', key: `${ROUTE}#1`, v: 'identity' }]);
    const l = new RunLedger();
    const first = l.addUrlIds(`${GR}/d/xk/overview`, '01-open', [{ label: 'p1', value: 'xk' }], {}, sf);
    const second = l.addUrlIds(`${GR}/d/yz/overview`, '03-open', [{ label: 'p1', value: 'yz' }], {}, sf);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]).toMatchObject({ value: 'xk', kind: 'identifier', binding: { label: 'p1' } });
    expect(second[0]).toMatchObject({ value: 'yz', kind: 'identifier', binding: { label: 'p1' } });
  });
});

// ---------------------------------------------------------------------------
// 7. odoo cids/menu_id: routesAgree decided by two state keys
// ---------------------------------------------------------------------------

/**
 * design-site-facts.md §2's survey lists "odoo's cids/menu_id" as a
 * route.query `state` case consumer 1 (routesAgree) decides. Odoo carries
 * both in the FRAGMENT as hash STATE (`#action=123&cids=1&menu_id=81`,
 * `urlShapeOf(...).hashState`), not the query string.
 *
 * As shipped, `disputedKeys` (src/execution/facts-route.ts) compares only
 * `UrlShape.query` (the `?...` search string) on both sides — it never reads
 * `.hashState`. So a `route.query` fact keyed on a hash-state key like
 * odoo's `cids`/`menu_id` is never looked up by `routesAgreeByFacts`,
 * `landingDecision` or `preconditionDecision`: `disputed.oneSided` /
 * `disputed.differing` can only ever name QUERY-STRING keys, and odoo's own
 * keys never appear in either list. `routesAgreeByFacts` returns null (see
 * "consumer 1 does not decide odoo's own case" below) even with a reliable
 * fact under exactly the key `design-site-facts.md §2`'s table describes,
 * matching Piece F's own fixture (test/facts-route.test.ts's
 * "no reliable fact: byte-identical to the old verdict" `landings` array
 * carries this exact odoo pair and never lists it as decided). This is a gap
 * against the contract's survey list — reported in the corpus review, not
 * fixed here (Piece F's file, out of Piece I's scope).
 */
describe('odoo cids/menu_id: routesAgreeByFacts drops two reliable state keys before comparing', () => {
  const OD = 'http://od.test';
  const START = `${OD}/web#action=123&cids=1&menu_id=81`;
  const END = `${OD}/web#action=123&cids=2&menu_id=82`;
  // A stand-in for "today's rule": exact string equality once query/fragment
  // state is stripped by the caller — the contract's own drop() does that
  // stripping before calling `today`, so this is a faithful stand-in for any
  // literal-comparing heuristic (routesByFragment et al.).
  const today: RoutesAgree = (a, b) => a === b;

  it('today, unaided, sees two different pages (cids/menu_id differ)', () => {
    expect(today(START, END, false)).toBe(false);
  });

  it('two reliable state facts on cids/menu_id make routesAgreeByFacts decide: hash state is read like the query string', () => {
    const ROUTE = `${OD}/web`;
    const sf = factsByHand(OD, [
      { k: 'route.query', key: `${ROUTE}?cids`, v: 'state' },
      { k: 'route.query', key: `${ROUTE}?menu_id`, v: 'state' },
    ]);
    const result = routesAgreeByFacts(sf, START, END, false, today);
    // Piece F reads hash state like the query string since the corpus review found it missing.
    expect(result).toMatchObject({ decided: true, agree: true });
  });

  it('byte-identical fallback: no facts, routesAgreeByFacts also returns null (nothing to decide)', () => {
    expect(routesAgreeByFacts(emptyFacts(OD), START, END, false, today)).toBeNull();
  });
});
