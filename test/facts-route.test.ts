/**
 * Site facts stage 1, Piece F: the url gates decide from reliable facts in
 * both runners (src/execution/facts-route.ts), and fall back to today's
 * verdict byte for byte wherever no reliable fact decides.
 */
import { describe, expect, it } from 'vitest';
import { emptyFacts, observeFact, type FactKind, type SiteFacts } from '../src/execution/facts.js';
import {
  landingByFacts,
  landingVerdictWithFacts,
  preconditionByFacts,
  preconditionVerdictWithFacts,
  rewriteQuery,
} from '../src/execution/facts-route.js';
import { gotoLandingVerdict, preconditionVerdict, type FingerprintSimilarity, type MintedPosition } from '../src/execution/gates.js';
import { EXECUTION_MODULES, executionClosure } from '../src/spec/runtime-source.js';

const OP = 'http://127.0.0.1:8090';
const WP = `${OP}/projects/bench-project/work_packages`;
const KB = 'http://127.0.0.1:8093';
const SI = 'http://127.0.0.1:8000';
const G = 'http://127.0.0.1:3000';
const OD = 'http://127.0.0.1:8069';

/** A SOFT fact made reliable the way the store makes one: observed in two sessions. */
function factsOf(origin: string, obs: { k: FactKind; key: string; v: string }[], sessions: string[] = ['s1', 's2']): SiteFacts {
  const sf = emptyFacts(origin);
  for (const session of sessions) for (const o of obs) observeFact(sf, { ...o, hard: false, session, at: '2026-09-26T00:00:00Z' });
  return sf;
}

const JSON_A = encodeURIComponent('{"c":["id","subject"],"pp":20,"pa":1}');
const JSON_B = encodeURIComponent('{"c":["id","subject","status"],"pp":50,"pa":1}');

describe('fwop15 ?query_props (state): the precondition passes with the key absent or different', () => {
  const sf = factsOf(OP, [{ k: 'route.query', key: `${WP}?query_props`, v: 'state' }]);
  const cases: [string, string][] = [
    [`${WP}?query_props=${JSON_A}`, WP], // the pattern names it, the page lacks it
    [WP, `${WP}?query_props=${JSON_A}`], // the page carries it, the pattern does not
    [`${WP}?query_props=${JSON_A}`, `${WP}?query_props=${JSON_B}`], // two literals
  ];
  for (const [pattern, url] of cases) {
    it(`${pattern.slice(OP.length)} at ${url.slice(OP.length)}`, () => {
      // today: a measured page off the recording refuses a key it took on trust or a soft match
      expect(preconditionVerdict(pattern, url, {}, 0.6).refuse).toBeDefined();
      expect(preconditionVerdictWithFacts(sf, pattern, url, {}, 0.6).refuse).toBeUndefined();
      expect(preconditionByFacts(sf, pattern, url, {}, 0.6, [])).toMatchObject({ refuse: false, decided: true });
    });
  }
  it('still refuses another page on the same route', () => {
    expect(preconditionVerdictWithFacts(sf, `${WP}?query_props=${JSON_A}`, `${OP}/projects/bench-project/boards`, {}, 1).refuse).toBeDefined();
  });
});

describe("kanboard ?controller= (routing): a key one side carries alone refuses", () => {
  const sf = factsOf(KB, [{ k: 'route.query', key: `${KB}/?controller`, v: 'routing' }]);
  it('the pattern names it, the page lacks it', () => {
    const pattern = `${KB}/?controller=BoardViewController&action=show&project_id=1`;
    const url = `${KB}/?action=show&project_id=1`;
    expect(preconditionVerdict(pattern, url, {}, null).refuse).toBeUndefined(); // today: taken on trust
    const v = preconditionVerdictWithFacts(sf, pattern, url, {}, null);
    expect(v.refuse).toMatch(/^not on the page this procedure starts from \(expects .*; by fact: query key controller \(the procedure names it, the page lacks it\) selects the page on this route — route\.query routing — and only one side carries it\)$/);
  });
  it('the page carries it, the pattern does not', () => {
    const v = preconditionVerdictWithFacts(sf, `${KB}/?project_id=1`, `${KB}/?controller=TaskViewController&project_id=1`, {}, null);
    expect(v.refuse).toMatch(/by fact: query key controller \(the page carries it, the procedure does not name it\)/);
  });
  it('both sides carry it: judged as today (two literals are already compared)', () => {
    const pattern = `${KB}/?controller=BoardViewController&project_id=1`;
    const url = `${KB}/?controller=BoardViewController&project_id=1`;
    expect(preconditionVerdictWithFacts(sf, pattern, url, {}, null)).toEqual(preconditionVerdict(pattern, url, {}, null));
  });
  it('the goto landing stops by fact where today passes', () => {
    const target = `${KB}/?controller=BoardViewController&project_id=1`;
    const landed = `${KB}/?project_id=1`;
    expect(gotoLandingVerdict(target, landed, 'step 02-open s_x/1')).toBeNull();
    expect(landingVerdictWithFacts(sf, target, landed, 'step 02-open s_x/1')).toBe(
      'by fact: step 02-open s_x/1 navigated but landed on another view: controller=(absent) where it was sent to controller=BoardViewController (route.query controller selects the page on this route) — the page it asked for was not given',
    );
    expect(landingByFacts(sf, target, landed)).toMatchObject({ stop: true, decided: true });
  });
});

describe("snipeit #history (anchor): stripped from both sides", () => {
  const sf = factsOf(SI, [{ k: 'route.fragment', key: '', v: 'anchor' }]);
  it('a stored pattern with the anchor passes on the page without it', () => {
    const pattern = `${SI}/hardware/:id#history`;
    const url = `${SI}/hardware/4`;
    expect(preconditionVerdict(pattern, url, {}, null).refuse).toBeDefined();
    expect(preconditionVerdictWithFacts(sf, pattern, url, {}, null)).toEqual({ warnings: [] });
    expect(preconditionByFacts(sf, pattern, url, {}, null, [])).toMatchObject({ refuse: false, decided: true });
  });
  it('both sides anchored, and the live anchor alone, pass', () => {
    expect(preconditionVerdictWithFacts(sf, `${SI}/hardware/:id#history`, `${SI}/hardware/4#history`, {}, null)).toEqual({ warnings: [] });
    expect(preconditionVerdictWithFacts(sf, `${SI}/hardware/:id`, `${SI}/hardware/4#history`, {}, null)).toEqual({ warnings: [] });
  });
  it('another record page is still refused, and another origin gets no anchor fact', () => {
    expect(preconditionVerdictWithFacts(sf, `${SI}/hardware/:id#history`, `${SI}/users/4/edit`, {}, null).refuse).toBeDefined();
    const other = 'http://127.0.0.1:9999';
    const pattern = `${other}/hardware/:id#history`;
    expect(preconditionVerdictWithFacts(sf, pattern, `${other}/hardware/4`, {}, null)).toEqual(preconditionVerdict(pattern, `${other}/hardware/4`, {}, null));
  });
});

describe('grafana ?refresh (state)', () => {
  const sf = factsOf(G, [{ k: 'route.query', key: `${G}/d/*/latency?refresh`, v: 'state' }]);
  it('the goto landing passes on another refresh where today stops', () => {
    const target = `${G}/d/abc12/latency?orgId=1&refresh=off`;
    const landed = `${G}/d/abc12/latency?orgId=1&refresh=auto`;
    expect(gotoLandingVerdict(target, landed, 'step 1')).not.toBeNull();
    expect(landingVerdictWithFacts(sf, target, landed, 'step 1')).toBeNull();
  });
  it('a landing that is another view on another key still stops, prefixed by fact', () => {
    const target = `${G}/d/abc12/latency?orgId=1&refresh=5s&viewPanel=edit`;
    const landed = `${G}/d/abc12/latency?orgId=1&refresh=1m&viewPanel=list`;
    expect(landingVerdictWithFacts(sf, target, landed, 'step 1')).toBe(`by fact: ${gotoLandingVerdict(`${G}/d/abc12/latency?orgId=1&viewPanel=edit`, landed, 'step 1')}`);
  });
  it('the precondition passes with the key dropped, added or changed', () => {
    const pattern = `${G}/d/abc12/latency?orgId=1&refresh=5s`;
    for (const url of [`${G}/d/abc12/latency?orgId=1`, `${G}/d/abc12/latency?orgId=1&refresh=1m`]) {
      expect(preconditionVerdict(pattern, url, {}, 0.5).refuse).toBeDefined();
      expect(preconditionVerdictWithFacts(sf, pattern, url, {}, 0.5).refuse).toBeUndefined();
    }
    expect(preconditionVerdictWithFacts(sf, `${G}/d/abc12/latency?orgId=1`, `${G}/d/abc12/latency?orgId=1&refresh=1m`, {}, 0.5).refuse).toBeUndefined();
  });
});

describe('odoo cids / menu_id (state, in the hash): the precondition passes with other literals', () => {
  const sf = factsOf(OD, [
    { k: 'route.query', key: `${OD}/web?cids`, v: 'state' },
    { k: 'route.query', key: `${OD}/web?menu_id`, v: 'state' },
  ]);
  const pattern = `${OD}/web#action=123&cids=1&menu_id=81&model=sale.order&view_type=list`;
  it('two literals apart on both keys: today refuses a measured page off the recording, the facts pass', () => {
    const url = `${OD}/web#action=123&cids=2&menu_id=94&model=sale.order&view_type=list`;
    expect(preconditionVerdict(pattern, url, {}, 0.5).refuse).toBeDefined();
    expect(preconditionVerdict(pattern, url, {}, null).soft).toBeDefined(); // today: a soft match at best
    expect(preconditionVerdictWithFacts(sf, pattern, url, {}, 0.5)).toEqual({ warnings: [] });
    expect(preconditionByFacts(sf, pattern, url, {}, 0.5, [])).toMatchObject({ refuse: false, decided: true });
  });
  it('the key absent from the live hash: today refuses, the facts pass', () => {
    const url = `${OD}/web#action=123&menu_id=94&model=sale.order&view_type=list`;
    expect(preconditionVerdict(pattern, url, {}, null).refuse).toBeDefined();
    expect(preconditionVerdictWithFacts(sf, pattern, url, {}, null)).toEqual({ warnings: [] });
  });
  it('another model is still another page', () => {
    const url = `${OD}/web#action=123&cids=2&menu_id=94&model=res.partner&view_type=form`;
    expect(preconditionVerdictWithFacts(sf, pattern, url, {}, 0.5).refuse).toBeDefined();
  });
  it('rewriteQuery rewrites hash-state pairs in their #a=b&c=d shape, leaves route and anchor fragments', () => {
    expect(rewriteQuery(pattern, (k, v) => (k === 'cids' || k === 'menu_id' ? ':var' : v))).toBe(`${OD}/web#action=123&cids=:var&menu_id=:var&model=sale.order&view_type=list`);
    expect(rewriteQuery(`${OD}/web?debug=1#cids=1`, (k, v) => (k === 'cids' ? null : v))).toBe(`${OD}/web?debug=1`);
    expect(rewriteQuery(`${SI}/hardware/4#history`, () => null)).toBe(`${SI}/hardware/4#history`);
    expect(rewriteQuery('http://app.test/a#/orders/12?x=1', () => null)).toBe('http://app.test/a#/orders/12?x=1');
  });
});

describe('no reliable fact: byte-identical to the old verdict', () => {
  const pre: [string, string, Record<string, string>, FingerprintSimilarity, MintedPosition[]][] = [
    [`${WP}?query_props=${JSON_A}`, WP, {}, 0.6, []],
    [`${WP}?query_props=${JSON_A}`, `${WP}?query_props=${JSON_B}`, {}, null, []],
    [`${KB}/?controller=BoardViewController&project_id=1`, `${KB}/?project_id=1`, {}, null, []],
    [`${SI}/hardware/:id#history`, `${SI}/hardware/4`, {}, null, []],
    [`${G}/d/abc12/latency?orgId=1&refresh=5s`, `${G}/d/abc12/latency?orgId=1&refresh=1m`, {}, 'unmeasured', []],
    ['http://app.test/items/7', 'http://app.test/items/8', {}, null, []],
    ['http://app.test/items/{{v1}}', 'http://app.test/?token=s3cret', { v1: '7' }, null, []],
    [`${OD}/web#action=123&cids=1&menu_id=81&model=sale.order&view_type=list`, `${OD}/web#action=123&cids=2&menu_id=94&model=sale.order&view_type=list`, {}, 0.5, []],
    [`${OD}/web#action=123&cids=1&menu_id=81&model=sale.order&view_type=list`, `${OD}/web#action=123&menu_id=94&model=sale.order&view_type=list`, {}, null, []],
    ['http://app.test/web#action=:id&model=sale.order&view_type=form', 'http://app.test/web#action=9&model=sale.order&view_type=form&id=44', {}, 1, [{ at: 'q.id', step: 3 }]],
  ];
  const landings: [string, string][] = [
    [`${G}/d/abc12/latency?refresh=5s`, `${G}/d/abc12/latency?refresh=1m`],
    [`${KB}/?controller=BoardViewController&project_id=1`, `${KB}/?project_id=1`],
    ['http://odoo/web#cids=1&action=316&model=sale.order&view_type=form&id=22', 'http://odoo/web#action=316&model=sale.order&view_type=list&cids=1'],
    ['not a url', 'nor this'],
  ];
  const advisory = (origin: string): SiteFacts => {
    // one session only (soft, not yet reliable), and a contradicted pair
    const sf = factsOf(origin, [
      { k: 'route.query', key: `${WP}?query_props`, v: 'state' },
      { k: 'route.query', key: `${KB}/?controller`, v: 'routing' },
      { k: 'route.query', key: `${G}/d/*/latency?refresh`, v: 'state' },
      { k: 'route.fragment', key: '', v: 'anchor' },
      { k: 'route.query', key: `${OD}/web?cids`, v: 'state' },
      { k: 'route.query', key: `${OD}/web?menu_id`, v: 'state' },
    ], ['s1']);
    observeFact(sf, { k: 'route.fragment', key: '', v: 'path', hard: false, session: 's2' });
    return sf;
  };
  const snapshots: [string, (origin: string) => SiteFacts][] = [
    ['empty', (o) => emptyFacts(o)],
    ['advisory only', advisory],
    ['reliable, but about other keys', (o) => factsOf(o, [{ k: 'route.query', key: `${WP}?columns`, v: 'state' }, { k: 'route.query', key: `${KB}/?task_id`, v: 'identity' }])],
    ['a reliable anchor fact and no anchor on either side', (o) => factsOf(o, [{ k: 'route.fragment', key: '', v: 'anchor' }])],
  ];
  for (const [label, make] of snapshots) {
    it(`precondition, ${label}`, () => {
      for (const [pattern, url, params, similarity, mints] of pre) {
        const sf = make(new URL(url.startsWith('http') ? url : 'http://x.test').origin);
        const old = preconditionVerdict(pattern, url, params, similarity, mints);
        const got = preconditionVerdictWithFacts(sf, pattern, url, params, similarity, mints);
        if (label.startsWith('a reliable anchor') && (pattern.includes('#history') || url.includes('#history'))) continue;
        expect(JSON.stringify(got)).toBe(JSON.stringify(old));
      }
    });
    it(`goto landing, ${label}`, () => {
      for (const [target, landed] of landings) {
        const origin = landed.startsWith('http') ? new URL(landed).origin : '';
        const sf = make(origin);
        expect(landingVerdictWithFacts(sf, target, landed, 'step 3')).toBe(gotoLandingVerdict(target, landed, 'step 3'));
      }
    });
  }
});

describe('embedding', () => {
  it('facts-route is a shipped module, carried after facts and gates', () => {
    expect(EXECUTION_MODULES).toContain('facts-route');
    expect(EXECUTION_MODULES.indexOf('facts-route')).toBe(EXECUTION_MODULES.indexOf('facts') + 1);
    const closure = executionClosure(['facts-route']).map((m) => m.name);
    expect(closure.slice(-1)).toEqual(['facts-route']);
    expect(closure).toEqual(expect.arrayContaining(['facts', 'url', 'gates']));
    const mod = executionClosure(['facts-route']).find((m) => m.name === 'facts-route')!;
    expect(mod.dependencies.sort()).toEqual(['facts', 'gates', 'url']);
    expect(mod.tokens).toEqual(expect.arrayContaining(['landingVerdictWithFacts(', 'preconditionVerdictWithFacts(', 'routesAgreeByFacts(', 'rewriteQuery(']));
  });
});

describe('the daemon side: the live snapshot and the applied stamp', () => {
  it('replayFactsFor: snapshot(url) reads the url origin, and a decided row is stamped applied', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { SkillStore } = await import('../src/skills/store.js');
    const { SiteFactStore } = await import('../src/skills/facts.js');
    const { replayFactsFor, takeFactRows } = await import('../src/skills/facts-url.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-facts-route-'));
    try {
      const store = new SkillStore(dir);
      new SiteFactStore(store.dir).observe(KB, [{ k: 'route.query', key: `${KB}/?controller`, v: 'routing', hard: true, session: 'r1' }]);
      const hook = replayFactsFor(store);
      expect(hook.snapshot(`${KB}/?project_id=1`).facts).toHaveLength(1);
      expect(hook.snapshot(`${OP}/x`)).toEqual(emptyFacts(OP));
      expect(hook.snapshot('not a url')).toEqual(emptyFacts(''));
      hook.landing(`${KB}/?controller=BoardViewController&project_id=1`, `${KB}/?project_id=1`, false, 'goto step 1', true);
      // a fact that does not decide (no reliable kind for the disputed key) is not stamped
      new SiteFactStore(store.dir).observe(KB, [{ k: 'route.query', key: `${KB}/?view`, v: 'state', hard: false, session: 'r1' }]);
      hook.landing(`${KB}/?view=a`, `${KB}/?view=b`, true, 'goto step 2', true);
      // not applied by the caller: never stamped
      hook.landing(`${KB}/?controller=BoardViewController&project_id=1`, `${KB}/?project_id=1`, false, 'goto step 3');
      const rows = takeFactRows(store) as { fact: string; applied?: boolean }[];
      expect(rows.map((r) => [r.fact, r.applied])).toEqual([['stop', true], ['none', undefined], ['stop', undefined]]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
