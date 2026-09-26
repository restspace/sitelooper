import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emptyFacts, type Fact, type FactKind, type SiteFacts } from '../src/execution/facts.js';
import {
  RouteObserver,
  flushRouteObservations,
  flushSiteFacts,
  hasWriteRequest,
  identityPartsOf,
  landingShadow,
  noteRecordedUrl,
  parseFactEvidence,
  preconditionShadow,
  replayFactsFor,
  rewriteQuery,
  routesAgreeByFacts,
  routingObservations,
  samePageOf,
  takeFactRows,
} from '../src/skills/facts-url.js';
import { SiteFactStore } from '../src/skills/facts.js';
import { pinEndsElsewhere } from '../src/skills/learn.js';
import { SkillStore, type Skill } from '../src/skills/store.js';

const KB = 'http://127.0.0.1:8093';
const OP = 'http://127.0.0.1:8090';
const WP = `${OP}/projects/bench-project/work_packages`;

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-facts-url-'));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function fact(k: FactKind, key: string, v: string, o: { hard?: boolean; sessions?: string[]; contra?: number } = {}): Fact {
  return { k, key, v, n: 1, sessions: o.sessions ?? ['s1'], contra: o.contra ?? 0, hard: o.hard ?? true, first: 't', last: 't' };
}

function sfOf(origin: string, facts: Fact[]): SiteFacts {
  return { ...emptyFacts(origin), facts };
}

/** today's learn.ts routesAgree, restated for the pure tests (learn.ts keeps it private). */
function today(start: string, end: string, byFragment: boolean): boolean {
  const strip = (u: string) => (byFragment ? u : u.replace(/#.*$/, ''));
  const route = (u: string) => strip(u).replace(/\{\{[^{}]*\}\}|:id\b|:var\b/g, '*');
  return route(start) === route(end);
}

describe('url parts', () => {
  it('identityPartsOf: record-shaped path segments and query values, never view state', () => {
    expect(identityPartsOf(`${KB}/?controller=TaskViewController&action=show&task_id=4&project_id=1`)).toEqual(['q.task_id=4', 'q.project_id=1']);
    expect(identityPartsOf(`${OP}/work_packages/42/activity`)).toEqual(['p1=42']);
    expect(identityPartsOf(`${WP}?query_props=${encodeURIComponent('{"pp":20,"pa":1}')}`)).toEqual([]);
    expect(identityPartsOf('http://g:3000/d/abc?refresh=1m')).toEqual([]);
  });

  it('samePageOf: same title and at least half the lines kept', () => {
    const lines = ['a', 'b', 'c', 'd'];
    expect(samePageOf({ title: 'WP', lines }, { title: 'WP', lines: ['a', 'b', 'x', 'y'] })).toBe(true);
    expect(samePageOf({ title: 'WP', lines }, { title: 'WP', lines: ['a', 'x', 'y', 'z'] })).toBe(false);
    expect(samePageOf({ title: 'Dashboard', lines }, { title: 'Projects', lines })).toBe(false);
  });

  it('hasWriteRequest: a write that is not a poll; no journal is "maybe"', () => {
    expect(hasWriteRequest(undefined)).toBe(true);
    expect(hasWriteRequest({ ev: [{ k: 'req', m: 'GET' }] })).toBe(false);
    expect(hasWriteRequest({ ev: [{ k: 'req', m: 'POST', c: ['app', 'poll'] }] })).toBe(false);
    expect(hasWriteRequest({ gap: { ev: [{ k: 'req', m: 'PATCH', c: ['w', 3] }] } })).toBe(true);
  });

  it('rewriteQuery keeps markers and the fragment as written', () => {
    expect(rewriteQuery(`${WP}?query_props=abc&id={{v1}}#x`, (k, v) => (k === 'query_props' ? ':var' : v))).toBe(`${WP}?query_props=:var&id={{v1}}#x`);
    expect(rewriteQuery(`${WP}?query_props=abc`, () => null)).toBe(WP);
  });
});

describe('RouteObserver', () => {
  it('route.fragment, hard, once per session, the greater kind winning', () => {
    const o = new RouteObserver('rec');
    o.noteUrl('http://es:8097/#Opportunity', [], false);
    o.noteUrl('http://es:8097/#Account', [], false);
    o.noteUrl('http://es:8097/#Opportunity/view/abc123', [], false);
    o.noteUrl('http://es:8097/#Opportunity', [], false);
    const obs = o.flush();
    expect(obs.map((x) => [x.k, x.key, x.v, x.hard, x.session, x.origin])).toEqual([
      ['route.fragment', '', 'anchor', true, 'rec', 'http://es:8097'],
      ['route.fragment', '', 'path', true, 'rec', 'http://es:8097'],
    ]);
    expect(o.flush()).toEqual([]);
  });

  it('route.query state: one step changed one key on the same page, no write (fwop15 query_props)', () => {
    const o = new RouteObserver();
    const json = encodeURIComponent('{"c":["id","subject"],"pp":20,"pa":1}');
    o.noteUrl(WP, identityPartsOf(WP), false, true);
    o.noteUrl(`${WP}?query_props=${json}`, identityPartsOf(`${WP}?query_props=${json}`), false, true);
    const obs = o.flush('fwop-a');
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({ k: 'route.query', key: `${WP}?query_props`, v: 'state', hard: true, session: 'fwop-a', origin: OP });
  });

  it('no state fact across a write, an unknown or different page, a record key, or two keys at once', () => {
    const run = (a: string, b: string, minted: boolean, samePage: boolean | undefined) => {
      const o = new RouteObserver();
      o.noteUrl(a, identityPartsOf(a), false, true);
      o.noteUrl(b, identityPartsOf(b), minted, samePage);
      return o.flush('s').filter((x) => x.k === 'route.query');
    };
    const g = 'http://g:3000/d/abc/board';
    expect(run(g, `${g}?refresh=1m`, false, true)).toHaveLength(1);
    expect(run(g, `${g}?refresh=1m`, true, true)).toHaveLength(0);
    expect(run(g, `${g}?refresh=1m`, false, undefined)).toHaveLength(0);
    // kanboard: dashboard → project list is one controller apart, and another page
    expect(run(`${KB}/?controller=DashboardController&action=show`, `${KB}/?controller=ProjectListController&action=show`, false, false)).toHaveLength(0);
    // a record key never reads as view state
    expect(run(`${KB}/?controller=TaskViewController&task_id=4`, `${KB}/?controller=TaskViewController&task_id=5`, false, true)).toHaveLength(0);
    expect(run(g, `${g}?refresh=1m&kiosk=1`, false, true)).toHaveLength(0);
  });

  it('noteRecordedUrl + flushRouteObservations write the session\'s facts beside the skill store', () => {
    const store = new SkillStore(path.join(tmp, 'observe'));
    noteRecordedUrl(store, () => `${KB}/task/4#comments`, { minted: false });
    noteRecordedUrl(store, () => {
      throw new Error('page gone');
    }, { minted: false });
    expect(flushRouteObservations(store, 'fwkb-n1')).toBe(1);
    const sf = new SiteFactStore(store.dir).read(KB);
    expect(sf.facts.map((f) => [f.k, f.v, f.sessions])).toEqual([['route.fragment', 'anchor', ['fwkb-n1']]]);
    expect(flushRouteObservations(store, 'fwkb-n1')).toBe(0);
  });
});

describe('routing (soft) from two stored procedures', () => {
  const mk = (id: string, urlPattern: string, fingerprint: number[] | undefined): Skill => ({
    id, origin: KB, template: 't', params: {}, preconditions: { urlPattern, ...(fingerprint ? { fingerprint } : {}) }, steps: [],
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'provisional', provenance: { session: 's', instruction: 't', created: 't' },
  });
  it('one literal apart and unlike pages: routing; alike pages or two keys apart: nothing', () => {
    const board = mk('s_board', `${KB}/?controller=BoardViewController&action=show&project_id=:id`, [1, 0, 0]);
    const task = mk('s_task', `${KB}/?controller=TaskViewController&action=show&project_id=:id`, [0, 1, 0]);
    const obs = routingObservations([task], [board]);
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({ k: 'route.query', key: `${KB}/?controller`, v: 'routing', hard: false, origin: KB });
    const alike = mk('s_alike', `${KB}/?controller=BoardViewController&action=list&project_id=:id`, [1, 0, 0]);
    expect(routingObservations([alike], [board])).toEqual([]);
    const two = mk('s_two', `${KB}/?controller=TaskViewController&action=edit&project_id=:id`, [0, 0, 1]);
    expect(routingObservations([two], [board])).toEqual([]);
    expect(routingObservations([mk('s_nofp', task.preconditions.urlPattern, undefined)], [board])).toEqual([]);
  });
});

describe('fact-based verdicts beside today\'s', () => {
  it('routesAgree: a reliable state key is ignored, a reliable routing key one side carries splits, no fact is no row', () => {
    const state = sfOf(OP, [fact('route.query', `${WP}?query_props`, 'state')]);
    const start = `${WP}?query_props=:var`;
    const end = `${WP}?query_props={"pp":20}`;
    expect(routesAgreeByFacts(emptyFacts(OP), start, end, false, today)).toBeNull();
    expect(routesAgreeByFacts(state, start, WP, false, today)).toMatchObject({ agree: true, decided: true });
    const routing = sfOf(KB, [fact('route.query', `${KB}/?controller`, 'routing', { hard: false, sessions: ['a', 'b'] })]);
    expect(routesAgreeByFacts(routing, `${KB}/`, `${KB}/?controller=BoardViewController`, false, today)).toMatchObject({ agree: false, decided: true });
    // advisory only (one session, soft): the verdict is 'none'
    const soft = sfOf(KB, [fact('route.query', `${KB}/?controller`, 'routing', { hard: false })]);
    expect(routesAgreeByFacts(soft, `${KB}/`, `${KB}/?controller=BoardViewController`, false, today)).toMatchObject({ decided: false });
  });

  it('routesAgree: a reliable anchor fragment fact overrides routesByFragment', () => {
    const SI = 'http://si:8000';
    const sf = sfOf(SI, [fact('route.fragment', '', 'anchor')]);
    expect(routesAgreeByFacts(sf, `${SI}/hardware/:id`, `${SI}/hardware/:id#history`, true, today)).toMatchObject({ agree: true, decided: true });
  });

  it('landing: a state key with two literals passes where today stops; a routing key the landing lacks stops', () => {
    const G = 'http://g:3000';
    const sf = sfOf(G, [fact('route.query', `${G}/d/*?refresh`, 'state')]);
    const row = landingShadow(sf, `${G}/d/abc12?refresh=5s`, `${G}/d/abc12?refresh=1m`, true, 'goto step 1');
    expect(row).toMatchObject({ rule: 'facts.landing', fact: 'pass', heuristic: 'stop', agree: false });
    expect(row!.evidence).toEqual([JSON.stringify({ k: 'route.query', key: `${G}/d/*?refresh`, v: 'state', reliable: true })]);
    expect(parseFactEvidence(row!.evidence[0])).toEqual({ k: 'route.query', key: `${G}/d/*?refresh`, v: 'state', reliable: true });
    const kb = sfOf(KB, [fact('route.query', `${KB}/?controller`, 'routing')]);
    expect(landingShadow(kb, `${KB}/?controller=BoardViewController&project_id=1`, `${KB}/?project_id=1`, false, 'goto step 2')).toMatchObject({ fact: 'stop', heuristic: 'pass', agree: false });
    expect(landingShadow(emptyFacts(KB), `${KB}/?controller=A`, `${KB}/`, false, 'goto')).toBeNull();
  });

  it('precondition: the state key widened to :var, judged by the same verdict', () => {
    const sf = sfOf(OP, [fact('route.query', `${WP}?query_props`, 'state')]);
    const row = preconditionShadow(sf, `${WP}?query_props=a`, `${WP}?query_props=b`, {}, null, [], true, 'gate s_x step 1');
    expect(row).toMatchObject({ rule: 'facts.landing', fact: 'pass', heuristic: 'refuse', agree: false });
  });
});

describe('the hooks write through the session\'s flush', () => {
  const mk = (id: string, urlPattern: string, endPattern: string): Skill => ({
    id, origin: OP, template: 't', params: {}, preconditions: { urlPattern },
    steps: [{ tool: 'click', args: { target: '@e1' }, locators: {}, expect: { urlPattern: endPattern } }],
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'provisional', provenance: { session: 's', instruction: 't', created: 't' },
  });

  it('pinEndsElsewhere: a facts.routesAgree row beside an unchanged verdict, flushed to shadow.jsonl', () => {
    const store = new SkillStore(path.join(tmp, 'repin'));
    store.put(mk('s_next', `${WP}?query_props=a`, `${WP}?query_props=a`));
    store.put(mk('s_lit', WP, `${WP}?query_props=b`));
    store.put(mk('s_bare', WP, WP));
    // no facts: no row, and the verdict is today's (two literals: two pages)
    const said = pinEndsElsewhere(store, 's_lit', 's_next');
    expect(said).toMatch(/ends on .*query_props=b/);
    expect(takeFactRows(store)).toEqual([]);
    new SiteFactStore(store.dir).observe(OP, [{ k: 'route.query', key: `${WP}?query_props`, v: 'state', hard: true, session: 'r1' }]);
    // the verdict is unchanged (stage 0 is shadow only); the facts say the same page
    expect(pinEndsElsewhere(store, 's_lit', 's_next')).toBe(said);
    // a one-sided key today already takes on trust: fact and heuristic agree
    expect(pinEndsElsewhere(store, 's_bare', 's_next')).toBeNull();
    flushSiteFacts(store, 'fwop-n2', 'flow fwop');
    const rows = fs.readFileSync(path.join(store.dir, 'shadow.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(rows.map((r) => [r.rule, r.fact, r.heuristic, r.agree])).toEqual([
      ['facts.routesAgree', 'agree', 'differ', false],
      ['facts.routesAgree', 'agree', 'agree', true],
    ]);
    expect(rows[0]).toMatchObject({
      session: 'fwop-n2',
      instruction: 'flow fwop',
      step: 'pinEndsElsewhere s_lit -> s_next',
      evidence: [JSON.stringify({ k: 'route.query', key: `${WP}?query_props`, v: 'state', reliable: true })],
    });
    expect(takeFactRows(store)).toEqual([]);
  });

  it('replayFactsFor: landing rows buffered per store, the url note observed at flush', () => {
    const store = new SkillStore(path.join(tmp, 'replay'));
    new SiteFactStore(store.dir).observe(KB, [{ k: 'route.query', key: `${KB}/?controller`, v: 'routing', hard: true, session: 'r1' }]);
    const hook = replayFactsFor(store);
    hook.landing(`${KB}/?controller=BoardViewController&project_id=1`, `${KB}/?project_id=1`, false, 'goto step 1');
    hook.landing('not a url', 'nor this', false, 'goto step 2');
    hook.noteUrl(`${KB}/board/1#/list`, false);
    flushSiteFacts(store, 'fwkb-n2', 'flow fwkb');
    const rows = fs.readFileSync(path.join(store.dir, 'shadow.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(rows.map((r) => [r.rule, r.fact, r.heuristic, r.agree])).toEqual([['facts.landing', 'stop', 'pass', false]]);
    const sf = new SiteFactStore(store.dir).read(KB);
    expect(sf.facts.find((f) => f.k === 'route.fragment')).toMatchObject({ v: 'path', sessions: ['fwkb-n2'] });
  });
});
