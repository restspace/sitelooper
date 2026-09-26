/**
 * Site facts stage 1, Piece G: the learn-time consumers.
 *  - consumer 5, skills/facts-rewrite.ts: a reliable `state` query key widens
 *    stored patterns to `key=:var`, a reliable `anchor` fragment strips a
 *    bare-word fragment; patterns only, revision bumped, idempotent;
 *  - consumer 4, flow.ts referencablePart / identityPosition and
 *    spec/rerecord.ts rethreadUrlRefs: a reliable `route.path` identity
 *    position;
 *  - consumer 1, learn.ts pinStartsElsewhere: a reliable fact's verdict.
 * With no reliable fact every one of them is today's rule.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emptyFacts, observeFact, type Observation, type SiteFacts } from '../src/execution/facts.js';
import { factStoreFor, takeFactRows } from '../src/skills/facts-url.js';
import { rewriteOrigins, rewriteStoredPatterns, widenPattern } from '../src/skills/facts-rewrite.js';
import { identityPosition, referencablePart, type Flow } from '../src/skills/flow.js';
import { pinStartsElsewhere } from '../src/skills/learn.js';
import { SkillStore, type Skill } from '../src/skills/store.js';
import { rethreadUrlRefs } from '../src/spec/rerecord.js';

const OP = 'http://127.0.0.1:8090';
const SI = 'http://127.0.0.1:8098';
const GR = 'http://127.0.0.1:3000';
const WP = `${OP}/projects/bench-project/work_packages`;

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-frw-'));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const storeOf = (skills: Skill[]): SkillStore => {
  const store = new SkillStore(path.join(tmp, `s${n++}`));
  for (const s of skills) store.put(structuredClone(s));
  return store;
};

const mk = (id: string, origin: string, urlPattern: string, ends: (string | undefined)[] = []): Skill => ({
  id, origin, template: 't', params: {}, preconditions: { urlPattern },
  steps: ends.map((u, i) => ({ tool: 'click', args: { target: `@e${i + 1}` }, locators: { css: `#b${i}` }, ...(u ? { expect: { urlPattern: u } } : {}) })),
  stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
  status: 'provisional', provenance: { session: 's', instruction: 't', created: 't' },
} as Skill);

const obs = (k: Observation['k'], key: string, v: string, hard: boolean, session = 'r1'): Observation => ({ k, key, v, hard, session, at: '2026-09-26T00:00:00.000Z' });
const factsOf = (origin: string, list: Observation[]): SiteFacts => {
  const sf = emptyFacts(origin);
  for (const o of list) observeFact(sf, o);
  return sf;
};
const stateFact = (hard = true, session = 'r1') => obs('route.query', `${WP}?query_props`, 'state', hard, session);

describe('rewriteStoredPatterns: a reliable state key is written key=:var (fwop15-cv2 query_props)', () => {
  const JSONQ = '{"c":["id","subject"],"pp":20}';
  const skills = () => [
    mk('s_a', OP, `${WP}?query_props=${encodeURIComponent(JSONQ)}&type=4`, [`${WP}?query_props=${encodeURIComponent(JSONQ)}`, undefined, `${OP}/projects/bench-project`]),
    mk('s_wide', OP, `${WP}?query_props=:var`, [`${WP}/create_new?query_props=:var`]),
    mk('s_other_route', OP, `${OP}/projects/bench-project/boards?query_props=x`),
  ];

  it('widens the precondition and a step expectation, bumps the revision, notes the fact; steps and locators untouched', () => {
    const store = storeOf(skills());
    const before = store.get('s_a')!;
    const rows = rewriteStoredPatterns(store, OP, factsOf(OP, [stateFact()]));
    expect(rows).toEqual([
      { skill: 's_a', field: 'preconditions.urlPattern', from: before.preconditions.urlPattern, to: `${WP}?query_props=:var&type=4` },
      { skill: 's_a', field: 'steps.0.expect.urlPattern', from: before.steps[0].expect!.urlPattern, to: `${WP}?query_props=:var` },
    ]);
    const after = store.get('s_a')!;
    expect(after.preconditions.urlPattern).toBe(`${WP}?query_props=:var&type=4`);
    expect(after.steps[0].expect?.urlPattern).toBe(`${WP}?query_props=:var`);
    expect(after.steps[2].expect?.urlPattern).toBe(`${OP}/projects/bench-project`);
    expect(after.steps.map((s) => [s.tool, s.args, s.locators])).toEqual(before.steps.map((s) => [s.tool, s.args, s.locators]));
    expect(after.revision).toBe((before.revision ?? 0) + 1);
    expect(after.factRewrites).toEqual([{ k: 'route.query', key: `${WP}?query_props`, at: expect.any(String) }]);
    // already wide, and another route: untouched
    expect(store.get('s_wide')!.revision).toBe(1);
    expect(store.get('s_other_route')!.preconditions.urlPattern).toBe(`${OP}/projects/bench-project/boards?query_props=x`);
  });

  it('is idempotent: a second pass writes nothing', () => {
    const store = storeOf(skills());
    const sf = factsOf(OP, [stateFact()]);
    expect(rewriteStoredPatterns(store, OP, sf)).toHaveLength(2);
    const rev = store.get('s_a')!.revision;
    expect(rewriteStoredPatterns(store, OP, sf)).toEqual([]);
    expect(store.get('s_a')!.revision).toBe(rev);
    expect(store.get('s_a')!.factRewrites).toHaveLength(1);
  });

  it('no reliable fact is no rewrite, byte for byte: a soft fact of one session, a contradicted one, an identity or routing key', () => {
    const store = storeOf(skills());
    const file = path.join(store.dir, fs.readdirSync(store.dir)[0], 's_a.json');
    const bytes = fs.readFileSync(file, 'utf8');
    const contradicted = factsOf(OP, [stateFact(true, 'r1'), obs('route.query', `${WP}?query_props`, 'identity', true, 'r2')]);
    for (const sf of [
      emptyFacts(OP),
      factsOf(OP, [stateFact(false, 'r1')]),
      contradicted,
      factsOf(OP, [obs('route.query', `${WP}?query_props`, 'routing', false, 'r1'), obs('route.query', `${WP}?query_props`, 'routing', false, 'r2')]),
    ]) {
      expect(rewriteStoredPatterns(store, OP, sf)).toEqual([]);
    }
    expect(fs.readFileSync(file, 'utf8')).toBe(bytes);
  });

  it('a soft state fact seen in two sessions is reliable and rewrites', () => {
    const store = storeOf(skills());
    expect(rewriteStoredPatterns(store, OP, factsOf(OP, [stateFact(false, 'r1'), stateFact(false, 'r2')]))).toHaveLength(2);
  });

  it("another origin's patterns are never touched", () => {
    const store = storeOf([mk('s_far', 'http://127.0.0.1:9999', 'http://127.0.0.1:9999/projects/bench-project/work_packages?query_props=x')]);
    expect(rewriteStoredPatterns(store, 'http://127.0.0.1:9999', factsOf(OP, [stateFact()]))).toEqual([]);
  });
});

describe('rewriteStoredPatterns: a reliable anchor fragment is stripped (fwsi9/fwsi14 #history)', () => {
  const skills = () => [
    mk('s_hist', SI, `${SI}/hardware/:id#history`, [`${SI}/hardware/{{v2}}#history`]),
    mk('s_plain', SI, `${SI}/hardware/:id`),
  ];
  const anchor = obs('route.fragment', '', 'anchor', true);

  it('strips the bare-word fragment from both patterns', () => {
    const store = storeOf(skills());
    const rows = rewriteStoredPatterns(store, SI, factsOf(SI, [anchor]));
    expect(rows.map((r) => r.to)).toEqual([`${SI}/hardware/:id`, `${SI}/hardware/{{v2}}`]);
    expect(store.get('s_hist')!.factRewrites).toEqual([{ k: 'route.fragment', key: '', at: expect.any(String) }]);
    expect(store.get('s_plain')!.revision).toBe(1);
    expect(rewriteStoredPatterns(store, SI, factsOf(SI, [anchor]))).toEqual([]);
  });

  it('a path or state fragment fact strips nothing, and an anchor fact never strips a routed fragment', () => {
    const store = storeOf(skills());
    expect(rewriteStoredPatterns(store, SI, factsOf(SI, [obs('route.fragment', '', 'path', true)]))).toEqual([]);
    expect(widenPattern(factsOf(SI, [anchor]), SI, `${SI}/#Opportunity/view/:id`).to).toBe(`${SI}/#Opportunity/view/:id`);
    expect(widenPattern(factsOf(SI, [anchor]), SI, `${SI}/web#action=9&cids=1`).to).toBe(`${SI}/web#action=9&cids=1`);
  });

  it('rewriteOrigins reads the store\'s own fact file', () => {
    const store = storeOf(skills());
    factStoreFor(store.dir).observe(SI, [anchor]);
    expect(rewriteOrigins(store, [SI, SI, null])).toHaveLength(2);
    expect(rewriteOrigins(null, [SI])).toEqual([]);
  });
});

describe('consumer 4: a reliable route.path identity position (fwgr74: a uid at p1 that no shape rule admits)', () => {
  // a word-shaped uid: neither the shape arm nor the position arm admits it
  const URL_ = `${GR}/d/sales/bench-dash`;
  const part = { label: 'p1', value: 'sales' };
  // the observer that knew p1 was a record wrote the uid `*`
  const identity = (hard: boolean, session = 'r1') => obs('route.path', `${GR}/d/*/bench-dash#1`, 'identity', hard, session);

  it('referencablePart admits it only with a reliable fact and the url', () => {
    expect(referencablePart(part)).toBe(false);
    expect(referencablePart(part, undefined, factsOf(GR, [identity(true)]), URL_)).toBe(true);
    expect(referencablePart(part, undefined, factsOf(GR, [identity(false)]), URL_)).toBe(false);
    expect(referencablePart(part, undefined, factsOf(GR, [identity(false, 'r1'), identity(false, 'r2')]), URL_)).toBe(true);
    expect(referencablePart(part, undefined, factsOf(GR, [identity(true)]))).toBe(false);
    expect(referencablePart(part, undefined, factsOf(GR, [obs('route.path', `${GR}/d/*/bench-dash#1`, 'constant', true)]), URL_)).toBe(false);
    // …and another position on the route is not this one
    expect(identityPosition(factsOf(GR, [identity(true)]), URL_, { label: 'p2', value: 'bench-dash' })).toBe(false);
  });

  it('rethreadUrlRefs threads to the identity position when the value sits at two', () => {
    const url = `${GR}/d/bench/bench`;
    const flow = {
      name: 'f', origin: GR, startUrl: `${GR}/`, vars: [], provenance: { session: 's', created: 't' },
      steps: [
        { id: '01-open', instruction: 'open', skill: 's_x', outputs: ['uid'], recorded: { uid: 'bench' } },
        { id: '02-use', instruction: 'use {{01-open.uid}}', skill: 's_y', outputs: [], recorded: {} },
      ],
    } as unknown as Flow;
    const today = rethreadUrlRefs(flow, '01-open', url);
    expect(today.flow.steps[1].instruction).toBe('use {{01-open.url.p1}}');
    const sf = factsOf(GR, [obs('route.path', `${GR}/d/bench/*#2`, 'identity', true)]);
    expect(rethreadUrlRefs(flow, '01-open', url, sf).flow.steps[1].instruction).toBe('use {{01-open.url.p2}}');
    // no reliable fact: byte-identical to today
    expect(rethreadUrlRefs(flow, '01-open', url, emptyFacts(GR))).toEqual(today);
  });
});

describe('consumer 1: pinStartsElsewhere decides from a reliable fact', () => {
  it('a state key the head demands as a literal no longer separates the start page (applied row); without the fact, today', () => {
    const skills = [mk('s_head', OP, `${WP}?query_props=A`)];
    const plain = storeOf(skills);
    expect(pinStartsElsewhere(plain, 's_head', `${WP}?query_props=B`)).toMatch(/starts on/);
    expect(takeFactRows(plain)).toEqual([]);
    const store = storeOf(skills);
    factStoreFor(store.dir).observe(OP, [stateFact()]);
    expect(pinStartsElsewhere(store, 's_head', `${WP}?query_props=B`)).toBeNull();
    const rows = takeFactRows(store);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rule: 'facts.routesAgree', fact: 'agree', heuristic: 'differ', agree: false, applied: true });
  });

  it('a reliable routing key one side carries alone refuses a start today would take', () => {
    const KB = 'http://127.0.0.1:8081';
    const store = storeOf([mk('s_head', KB, `${KB}/?action=show`)]);
    expect(pinStartsElsewhere(store, 's_head', `${KB}/?action=show`)).toBeNull();
    factStoreFor(store.dir).observe(KB, [obs('route.query', `${KB}/?controller`, 'routing', false, 'r1'), obs('route.query', `${KB}/?controller`, 'routing', false, 'r2')]);
    takeFactRows(store);
    expect(pinStartsElsewhere(store, 's_head', `${KB}/?action=show&controller=TaskViewController`)).toMatch(/starts on/);
  });
});
