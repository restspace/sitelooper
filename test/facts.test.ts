import { describe, expect, it } from 'vitest';
import {
  MAX_EV, MAX_FACTS, MAX_SESSIONS, SITE_FACTS_VERSION,
  advisory, emptyFacts, evict, factFor, factsFor, foldValue, formatFacts, fragmentFact, matchesShape,
  observeFact, pathPositionFact, reliable, renderings, routeQueryFact, routeTemplateOf, sameFactValue,
  shapeAgrees, shapeFact, shapeOf, summarise, valueClassFact, valueHash,
  type Fact, type Observation, type SiteFacts,
} from '../src/execution/facts.js';
import { parseExecutionSource } from '../src/spec/runtime-source.js';
import fs from 'node:fs';

const O = 'http://app.test';
const obs = (o: Partial<Observation> & Pick<Observation, 'k' | 'key' | 'v'>): Observation => ({ hard: false, session: 's1', at: '2026-09-26T10:00:00.000Z', ...o });
const fact = (f: Partial<Fact> & Pick<Fact, 'k' | 'key' | 'v'>): Fact => ({
  n: 1, sessions: ['s1'], contra: 0, hard: true, first: '2026-09-26T10:00:00.000Z', last: '2026-09-26T10:00:00.000Z', ...f,
});
const withFacts = (...facts: Fact[]): SiteFacts => ({ ...emptyFacts(O), facts });

describe('constants and empty', () => {
  it('matches the contract', () => {
    expect([SITE_FACTS_VERSION, MAX_FACTS, MAX_SESSIONS, MAX_EV]).toEqual([1, 2000, 8, 120]);
    expect(emptyFacts(O)).toEqual({ version: 1, origin: O, facts: [] });
  });
});

describe('routeTemplateOf', () => {
  it('drops the query: fwop15 query_props and kanboard controller routes', () => {
    expect(routeTemplateOf('http://op.test/projects/demo/work_packages?query_props=%7B%22c%22%3A%5B%22id%22%5D%7D')).toBe('http://op.test/projects/demo/work_packages');
    expect(routeTemplateOf('http://kb.test/?controller=TaskViewController&action=show&task_id=4')).toBe('http://kb.test/');
  });
  it('writes record segments and markers as *, and drops an anchor fragment (snipeit #history)', () => {
    expect(routeTemplateOf('http://si.test/hardware/4#history')).toBe('http://si.test/hardware/*');
    expect(routeTemplateOf('http://od.test/orders/S00023/edit')).toBe('http://od.test/orders/*/edit');
    expect(routeTemplateOf('http://gr.test/d/afw6yy5xx9/latency')).toBe('http://gr.test/d/*/latency');
    expect(routeTemplateOf('http://app.test/items/:id/{{v1}}')).toBe('http://app.test/items/*/*');
    expect(routeTemplateOf('http://app.test/form2/v2')).toBe('http://app.test/form2/*');
  });
  it('keeps a route-shaped fragment (espo) and drops a state fragment (odoo)', () => {
    expect(routeTemplateOf('http://espo.test/#Opportunity/view/abc')).toBe('http://espo.test/#Opportunity/view/abc');
    expect(routeTemplateOf('http://espo.test/#Opportunity/view/6512a3b4c5d6e7f80')).toBe('http://espo.test/#Opportunity/view/*');
    expect(routeTemplateOf('http://app.test/a/#/orders/12')).toBe('http://app.test/a#/orders/*');
    expect(routeTemplateOf('http://od.test/web#action=123&cids=1&menu_id=81')).toBe('http://od.test/web');
  });
  it('returns non-urls unchanged', () => {
    expect(routeTemplateOf('not a url')).toBe('not a url');
  });
});

describe('values: fold, hash, shape', () => {
  it('folds like flow.ts', () => {
    expect(foldValue('  Hello \n  World ')).toBe('hello world');
  });
  it('hashes the folded value as 16 hex FNV-1a', () => {
    // FNV-1a 64 reference vectors
    expect(valueHash('')).toBe('cbf29ce484222325');
    expect(valueHash('a')).toBe('af63dc4c8601ec8c');
    expect(valueHash('  A ')).toBe(valueHash('a'));
    expect(valueHash('FURN_7777')).toMatch(/^[0-9a-f]{16}$/);
    expect(valueHash('café')).not.toBe(valueHash('cafe'));
  });
  it('generalises digit runs and keeps the rest literal', () => {
    expect(shapeOf('S00023')).toBe('^S\\d+$');
    expect(shapeOf('S00023')).toBe(shapeOf('S00041'));
    expect(shapeOf('BA-00007')).toBe('^BA-\\d+$');
    expect(shapeOf('#4')).toBe('^#\\d+$');
    expect(shapeOf('a.b(1)')).toBe('^a\\.b\\(\\d+\\)$');
    expect(new RegExp(shapeOf('x+1')).test('x+42')).toBe(true);
    expect(shapeAgrees('S00023', 'S00041')).toBe(true);
    expect(shapeAgrees('S00023', 'SO0023')).toBe(false);
  });
  it('compares fact values', () => {
    expect(sameFactValue('state', 'state')).toBe(true);
    expect(sameFactValue('state', 'identity')).toBe(false);
    expect(sameFactValue({ kind: 'affix', tpl: '#{{=}}' }, { kind: 'affix', tpl: '#{{=}}' })).toBe(true);
    expect(sameFactValue({ kind: 'affix', tpl: '#{{=}}' }, { kind: 'affix', tpl: '{{=}} - Odoo' })).toBe(false);
    expect(sameFactValue({ kind: 'thousands' }, { kind: 'thousands' })).toBe(true);
    expect(sameFactValue({ re: '^S\\d+$', n: 2 }, { re: '^S\\d+$', n: 3 })).toBe(true);
    expect(sameFactValue({ re: '^S\\d+$', n: 2 }, 'x')).toBe(false);
  });
});

describe('observeFact', () => {
  const key = 'http://op.test/projects/*/work_packages?query_props';
  it('new, then confirmed: n, sessions (deduped), last, hard and ev follow', () => {
    const sf = emptyFacts(O);
    const a = observeFact(sf, obs({ k: 'route.query', key, v: 'state', ev: 'first' }));
    expect(a.outcome).toBe('new');
    expect(a.fact).toMatchObject({ n: 1, sessions: ['s1'], contra: 0, hard: false, ev: 'first' });
    expect(reliable(a.fact)).toBe(false);
    const b = observeFact(sf, obs({ k: 'route.query', key, v: 'state', at: '2026-09-26T11:00:00.000Z' }));
    expect(b.outcome).toBe('confirmed');
    expect(b.fact).toBe(a.fact);
    expect(b.fact).toMatchObject({ n: 2, sessions: ['s1'], last: '2026-09-26T11:00:00.000Z', first: '2026-09-26T10:00:00.000Z' });
    expect(b.fact.ev).toBeUndefined();
    observeFact(sf, obs({ k: 'route.query', key, v: 'state', session: 's2' }));
    expect(sf.facts).toHaveLength(1);
    expect(sf.facts[0].sessions).toEqual(['s1', 's2']);
    expect(reliable(sf.facts[0])).toBe(true);
    observeFact(sf, obs({ k: 'route.query', key, v: 'state', hard: true, session: 's2' }));
    expect(sf.facts[0].hard).toBe(true);
    observeFact(sf, obs({ k: 'route.query', key, v: 'state', hard: false, session: 's2' }));
    expect(sf.facts[0].hard).toBe(true);
  });
  it('caps sessions at MAX_SESSIONS, keeping the most recent, and clips ev', () => {
    const sf = emptyFacts(O);
    for (let i = 0; i < 12; i++) observeFact(sf, obs({ k: 'route.fragment', key: '', v: 'path', session: `s${i}`, ev: 'x'.repeat(300) }));
    expect(sf.facts[0].sessions).toHaveLength(MAX_SESSIONS);
    expect(sf.facts[0].sessions.at(-1)).toBe('s11');
    expect(sf.facts[0].n).toBe(12);
    expect(sf.facts[0].ev!.length).toBe(MAX_EV);
  });
  it('contradicted: both sides advisory; the value re-observed in a second session retires the other', () => {
    const sf = emptyFacts(O);
    observeFact(sf, obs({ k: 'route.query', key, v: 'state', hard: true }));
    expect(factFor(sf, 'route.query', key)?.v).toBe('state');
    const c = observeFact(sf, obs({ k: 'route.query', key, v: 'identity', hard: true, session: 's2' }));
    expect(c.outcome).toBe('contradicted');
    expect(factsFor(sf, 'route.query', key).map((f) => [f.v, f.contra])).toEqual([['state', 1], ['identity', 1]]);
    expect(factsFor(sf, 'route.query', key).every(advisory)).toBe(true);
    expect(factFor(sf, 'route.query', key)).toBeNull();
    // a second contradiction in the SAME session does not retire
    const same = observeFact(sf, obs({ k: 'route.query', key, v: 'identity', hard: true, session: 's2' }));
    expect(same.outcome).toBe('confirmed');
    expect(sf.facts.find((f) => f.v === 'state')!.contra).toBe(2);
    expect(sf.facts).toHaveLength(2);
    // ...one from another session does, and the survivor decides again
    const r = observeFact(sf, obs({ k: 'route.query', key, v: 'identity', hard: true, session: 's3' }));
    expect(r.outcome).toBe('retired');
    expect(r.retired.map((f) => f.v)).toEqual(['state']);
    expect(sf.facts.map((f) => f.v)).toEqual(['identity']);
    expect(sf.facts[0].contra).toBe(0);
    expect(factFor(sf, 'route.query', key)?.v).toBe('identity');
  });
  it('the original value re-observed retires the newcomer instead', () => {
    const sf = emptyFacts(O);
    observeFact(sf, obs({ k: 'route.fragment', key: '', v: 'path', hard: true }));
    observeFact(sf, obs({ k: 'route.fragment', key: '', v: 'anchor', hard: true, session: 's2' }));
    const r = observeFact(sf, obs({ k: 'route.fragment', key: '', v: 'path', hard: true, session: 's3' }));
    expect(r.outcome).toBe('retired');
    expect(sf.facts.map((f) => f.v)).toEqual(['path']);
    expect(fragmentFact(sf)).toBe('path');
  });
  it('a newcomer that outlived its rivals on one session stays advisory until a second session', () => {
    const sf = emptyFacts(O);
    const k = 'http://app.test/items/*#1';
    observeFact(sf, obs({ k: 'route.path', key: k, v: 'identity', hard: true }));
    observeFact(sf, obs({ k: 'route.path', key: k, v: 'constant', hard: true, session: 's2' }));
    observeFact(sf, obs({ k: 'route.path', key: k, v: 'constant', hard: true, session: 's2' }));
    expect(sf.facts).toHaveLength(2); // identity: two contradictions, but one session
    const third = emptyFacts(O);
    observeFact(third, obs({ k: 'value.class', key: 'h', v: 'constant', hard: true }));
    observeFact(third, obs({ k: 'value.class', key: 'h', v: 'mint', hard: true, session: 's2' }));
    const r = observeFact(third, obs({ k: 'value.class', key: 'h', v: 'credential', hard: true, session: 's3' }));
    // constant and mint each have contradictions from s2 and s3 → both retired
    expect(r.outcome).toBe('retired');
    expect(r.retired.map((f) => f.v)).toEqual(['constant', 'mint']);
    expect(third.facts.map((f) => [f.v, f.contra])).toEqual([['credential', 1]]);
    expect(factFor(third, 'value.class', 'h')).toBeNull();
    const m = observeFact(third, obs({ k: 'value.class', key: 'h', v: 'credential', hard: true, session: 's4' }));
    expect(m.outcome).toBe('confirmed');
    expect(m.fact).toMatchObject({ v: 'credential', contra: 0, sessions: ['s3', 's4'] });
    expect(m.fact.contraSessions).toBeUndefined();
    expect(factFor(third, 'value.class', 'h')?.v).toBe('credential');
  });
  it('a lone newcomer with one session is not cleared', () => {
    const sf = emptyFacts(O);
    observeFact(sf, obs({ k: 'route.fragment', key: '', v: 'path', hard: true }));
    observeFact(sf, obs({ k: 'route.fragment', key: '', v: 'state', hard: true, session: 's2' }));
    observeFact(sf, obs({ k: 'route.fragment', key: '', v: 'anchor', hard: true, session: 's3' }));
    // path and state retired; anchor stands alone on one session's word
    expect(sf.facts.map((f) => [f.v, f.contra])).toEqual([['anchor', 1]]);
    expect(fragmentFact(sf)).toBeNull();
    observeFact(sf, obs({ k: 'route.fragment', key: '', v: 'anchor', hard: true, session: 's3' }));
    expect(fragmentFact(sf)).toBeNull();
    observeFact(sf, obs({ k: 'route.fragment', key: '', v: 'anchor', hard: true, session: 's4' }));
    expect(fragmentFact(sf)).toBe('anchor');
  });
  it('formats of different kinds combine; two affixes compete', () => {
    const sf = emptyFacts(O);
    const k = 'http://espo.test/#Opportunity/edit/*|textbox|Amount';
    expect(observeFact(sf, obs({ k: 'format', key: k, v: { kind: 'thousands' }, hard: true })).outcome).toBe('new');
    expect(observeFact(sf, obs({ k: 'format', key: k, v: { kind: 'decimals' }, hard: true })).outcome).toBe('new');
    expect(formatFacts(sf, k)).toEqual([{ kind: 'thousands' }, { kind: 'decimals' }]);
    const t = 'http://od.test/web|title';
    observeFact(sf, obs({ k: 'format', key: t, v: { kind: 'affix', tpl: '{{=}} - Odoo' }, hard: true }));
    expect(observeFact(sf, obs({ k: 'format', key: t, v: { kind: 'affix', tpl: '{{=}} | Odoo' }, hard: true })).outcome).toBe('contradicted');
    expect(formatFacts(sf, t)).toEqual([]);
  });
  it('a shape confirms by its regex and keeps the larger count', () => {
    const sf = emptyFacts(O);
    const k = 'http://od.test/orders/*|p1';
    observeFact(sf, obs({ k: 'value.shape', key: k, v: { re: '^S\\d+$', n: 2 }, hard: true }));
    const c = observeFact(sf, obs({ k: 'value.shape', key: k, v: { re: '^S\\d+$', n: 3 }, hard: true }));
    expect(c.outcome).toBe('confirmed');
    expect(c.fact.v).toEqual({ re: '^S\\d+$', n: 3 });
  });
  it('evicts to MAX_FACTS by oldest last', () => {
    const sf = emptyFacts(O);
    const t = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString();
    for (let i = 0; i < MAX_FACTS; i++) sf.facts.push(fact({ k: 'value.class', key: `h${i}`, v: 'constant', last: t(i + 10) }));
    sf.facts[5].last = t(0);
    observeFact(sf, obs({ k: 'value.class', key: 'fresh', v: 'mint', at: t(99999) }));
    expect(sf.facts).toHaveLength(MAX_FACTS);
    expect(sf.facts.some((f) => f.key === 'h5')).toBe(false);
    expect(sf.facts.some((f) => f.key === 'fresh')).toBe(true);
    expect(evict(withFacts(fact({ k: 'value.class', key: 'a', v: 'mint' })), 0).facts).toEqual([]);
  });
});

describe('reliable, factFor', () => {
  it('hard at one session, soft at two, never with a contradiction', () => {
    expect(reliable(fact({ k: 'value.class', key: 'a', v: 'mint', hard: true }))).toBe(true);
    expect(reliable(fact({ k: 'value.class', key: 'a', v: 'mint', hard: false }))).toBe(false);
    expect(reliable(fact({ k: 'value.class', key: 'a', v: 'mint', hard: false, sessions: ['s1', 's2'] }))).toBe(true);
    expect(reliable(fact({ k: 'value.class', key: 'a', v: 'mint', hard: true, contra: 1 }))).toBe(false);
    expect(advisory(fact({ k: 'value.class', key: 'a', v: 'mint', hard: false }))).toBe(true);
  });
  it('two reliable facts under one key → null, never a guess', () => {
    const sf = withFacts(fact({ k: 'route.fragment', key: '', v: 'path' }), fact({ k: 'route.fragment', key: '', v: 'state' }));
    expect(factsFor(sf, 'route.fragment', '')).toHaveLength(2);
    expect(factFor(sf, 'route.fragment', '')).toBeNull();
    expect(fragmentFact(sf)).toBeNull();
    expect(factFor(emptyFacts(O), 'route.fragment', '')).toBeNull();
  });
  it('an advisory beside a reliable one leaves the reliable one', () => {
    const sf = withFacts(fact({ k: 'route.fragment', key: '', v: 'path' }), fact({ k: 'route.fragment', key: '', v: 'state', hard: false }));
    expect(fragmentFact(sf)).toBe('path');
  });
});

describe('readers', () => {
  it('route readers key by routeTemplateOf', () => {
    const url = 'http://op.test/projects/demo/work_packages/12?query_props=abc';
    const route = routeTemplateOf(url);
    const sf = withFacts(
      fact({ k: 'route.query', key: `${route}?query_props`, v: 'state' }),
      fact({ k: 'route.path', key: `${route}#3`, v: 'identity' }),
      fact({ k: 'route.path', key: `${route}#0`, v: 'constant', hard: false }),
    );
    expect(routeQueryFact(sf, 'http://op.test/projects/demo/work_packages/77', 'query_props')).toBe('state');
    expect(routeQueryFact(sf, url, 'other')).toBeNull();
    expect(pathPositionFact(sf, url, 3)).toBe('identity');
    expect(pathPositionFact(sf, url, 0)).toBeNull();
  });
  it('renderings: 12500 with thousands+decimals is 12,500.00', () => {
    const k = 'r|textbox|Amount';
    const sf = withFacts(fact({ k: 'format', key: k, v: { kind: 'thousands' } }), fact({ k: 'format', key: k, v: { kind: 'decimals' } }));
    expect(renderings(sf, k, '12500')).toEqual(['12,500.00']);
    expect(renderings(sf, k, '1234567.5')).toEqual(['1,234,567.50']);
    expect(renderings(sf, k, 'Widget')).toEqual(['Widget']);
  });
  it('renderings: affix, upper, trim; date/twice/counter add nothing; soft single-session formats are ignored', () => {
    const sf = withFacts(
      fact({ k: 'format', key: 'kb|title', v: { kind: 'affix', tpl: '#{{=}}' } }),
      fact({ k: 'format', key: 'od|title', v: { kind: 'affix', tpl: '{{=}} - Odoo' } }),
      fact({ k: 'format', key: 'od|title', v: { kind: 'upper' } }),
      fact({ k: 'format', key: 'kb|combobox|Column', v: { kind: 'trim' } }),
      fact({ k: 'format', key: 'x', v: { kind: 'date' } }),
      fact({ k: 'format', key: 'x', v: { kind: 'twice' } }),
      fact({ k: 'format', key: 'x', v: { kind: 'counter' } }),
      fact({ k: 'format', key: 'soft', v: { kind: 'upper' }, hard: false }),
    );
    expect(renderings(sf, 'kb|title', '4')).toEqual(['#4']);
    expect(renderings(sf, 'od|title', 'S00023 x')).toEqual(['S00023 X - Odoo', 'S00023 X']);
    expect(renderings(sf, 'kb|combobox|Column', 'Backlog ')).toEqual(['Backlog']);
    expect(renderings(sf, 'x', 'v')).toEqual([]);
    expect(renderings(sf, 'soft', 'v')).toEqual([]);
    expect(renderings(sf, 'none', 'v')).toEqual([]);
    expect(formatFacts(sf, 'x')).toEqual([{ kind: 'date' }, { kind: 'twice' }, { kind: 'counter' }]);
  });
  it('value class by hash of the folded value', () => {
    const sf = withFacts(fact({ k: 'value.class', key: valueHash('FURN_7777'), v: 'constant' }));
    expect(valueClassFact(sf, ' furn_7777 ')).toBe('constant');
    expect(valueClassFact(sf, 'FURN_7778')).toBeNull();
  });
  it('shapes', () => {
    const k = 'http://od.test/orders/*|p1';
    const sf = withFacts(fact({ k: 'value.shape', key: k, v: { re: shapeOf('S00023'), n: 2 } }), fact({ k: 'value.shape', key: 'bad', v: { re: '(', n: 2 } }));
    expect(shapeFact(sf, k)).toEqual({ re: '^S\\d+$' });
    expect(matchesShape(sf, k, 'S00041')).toBe(true);
    expect(matchesShape(sf, k, 'FURN_7777')).toBe(false);
    expect(matchesShape(sf, 'none', 'S1')).toBe(false);
    expect(matchesShape(sf, 'bad', '(')).toBe(false);
    expect(shapeFact(sf, 'none')).toBeNull();
  });
});

describe('summarise', () => {
  it('counts relied (hard + soft) and advisory', () => {
    const sf = withFacts(
      fact({ k: 'value.class', key: 'a', v: 'mint' }),
      fact({ k: 'value.class', key: 'b', v: 'mint' }),
      fact({ k: 'value.class', key: 'c', v: 'mint', hard: false, sessions: ['s1', 's2'] }),
      fact({ k: 'value.class', key: 'd', v: 'mint', hard: false }),
      fact({ k: 'value.class', key: 'e', v: 'mint', contra: 1 }),
    );
    expect(summarise(sf)).toEqual({ origin: O, relied: 3, advisory: 2, hard: 2, soft: 1 });
  });
});

describe('embedding', () => {
  it('is embeddable: only the url sibling, no node builtins', () => {
    const m = parseExecutionSource('facts', fs.readFileSync('src/execution/facts.ts', 'utf8'));
    expect(m.dependencies).toEqual(['url']);
    expect(m.tokens).toEqual(expect.arrayContaining(['observeFact(', 'routeTemplateOf(', 'SITE_FACTS_VERSION', 'MAX_FACTS', 'MAX_SESSIONS', 'MAX_EV']));
  });
});
