import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { emptyFacts, observeFact, shapeOf, valueHash, type SiteFacts } from '../src/execution/facts.js';
import { SiteFactStore } from '../src/skills/facts.js';
import {
  ValueFactObserver,
  admissionStrength,
  factKind,
  ledgerRow,
  mintEv,
  shapeable,
  shapeKeyOf,
  sourcingRow,
  stripRow,
  urlFactKey,
} from '../src/skills/facts-value.js';
import { taskConstantArms, taskConstants } from '../src/skills/flow.js';
import { RunLedger, type LedgerEntry } from '../src/skills/ledger.js';
import { urlParts } from '../src/skills/compile.js';
import { valueVerdict as verdictOf } from '../src/skills/facts-value.js';
import { ambiguousCredentialHashes, clearSecretLedger, markLiteralCredentialValue, resolveSecrets, scrubSecrets } from '../src/shared/secrets.js';

const KB = 'http://kb.test';
const OD = 'http://od.test';

function entry(over: Partial<LedgerEntry>): LedgerEntry {
  return { value: 'x', binding: { from: 'url', step: 'i1', label: 'p1' }, kind: 'identifier', basis: 'shape', firstSeen: { instruction: 1, step: 0 }, ...over };
}

function shadowRows(dir: string): Record<string, unknown>[] {
  const f = path.join(dir, 'shadow.jsonl');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
}

const end = (entries: RecordedEntry[], ledger: RunLedger, script: RecordedEntry[] = entries, vars: string[] = []) => ({
  script,
  entries,
  ledger: ledger.all(),
  vars,
});

describe('admissionStrength: what the ledger admission proves', () => {
  it('position and landing and link-minted are hard, variance soft, shape nothing', () => {
    expect(admissionStrength(entry({ value: '44', binding: { from: 'url', step: 'i1', label: 'q.id' }, basis: 'position' }))).toBe('hard');
    expect(admissionStrength(entry({ value: 'afw6yy5xx9', basis: 'variance' }))).toBe('soft');
    expect(admissionStrength(entry({ value: 'abc123', basis: 'shape' }))).toBeNull();
    expect(admissionStrength(entry({ value: '4', basis: 'shape' }), { landed: true })).toBe('hard');
    expect(admissionStrength(entry({ value: '4', binding: { from: 'url', step: 'i1', label: 'p1' }, basis: 'shape' }), { landedLabels: ['p1'] })).toBe('hard');
    expect(admissionStrength(entry({ value: '4', binding: { from: 'url', step: 'i1', label: 'q.task_id' } }), { linkMinted: [{ label: 'q.task_id', value: '4' }] })).toBe('hard');
    // a reported value: variance only
    expect(admissionStrength(entry({ value: 'S00023', binding: { from: 'output', step: 'i1', name: 'ref' }, basis: 'variance' }))).toBe('soft');
    expect(admissionStrength(entry({ value: 'S00023', binding: { from: 'output', step: 'i1', name: 'ref' }, basis: 'shape' }))).toBeNull();
  });
});

describe('urlFactKey and shapeKeyOf', () => {
  it('path, hash-route and query labels', () => {
    expect(urlFactKey('http://si.test/hardware/4', 'p1')).toEqual({ k: 'route.path', key: 'http://si.test/hardware/*#1' });
    expect(urlFactKey('http://es.test/#Opportunity/view/abc123', 'h2')).toEqual({ k: 'route.path', key: 'http://es.test/#Opportunity/view/*#h2' });
    expect(urlFactKey(`${KB}/?controller=TaskViewController&action=show&task_id=4`, 'q.task_id')).toEqual({ k: 'route.query', key: `${KB}/?task_id` });
    expect(urlFactKey('not a url', 'p1')).toBeNull();
    expect(shapeKeyOf('http://si.test/hardware/4', 'p1')).toBe('http://si.test/hardware/*|p1');
  });

  it('identity parts key the route: a letters-only uid is `*` once the ledger admitted it (fwgr78)', () => {
    const gr = 'http://gr.test/d/afzexqoxkzoqod/bench';
    expect(urlFactKey(gr, 'p1')).toEqual({ k: 'route.path', key: `${gr}#1` });
    expect(urlFactKey(gr, 'p1', ['p1=afzexqoxkzoqod'])).toEqual({ k: 'route.path', key: 'http://gr.test/d/*/bench#1' });
    expect(urlFactKey(`${gr}?refresh=5s`, 'q.refresh', ['p1=afzexqoxkzoqod'])).toEqual({ k: 'route.query', key: 'http://gr.test/d/*/bench?refresh' });
    expect(shapeKeyOf(gr, 'p1', ['p1=afzexqoxkzoqod'])).toBe('http://gr.test/d/*/bench|p1');
    // a part named for another value, or another position, stars nothing
    expect(urlFactKey(gr, 'p1', ['p1=other', 'p2=afzexqoxkzoqod'])).toEqual({ k: 'route.path', key: `${gr}#1` });
  });
});

describe('shapeable and mintEv: evidence never carries a value in clear', () => {
  it('only digit-run values with few letters', () => {
    expect(shapeable('S00023')).toBe(true);
    expect(shapeable('#4')).toBe(true);
    expect(shapeable('RD-1015')).toBe(true);
    expect(shapeable('Order Alpha')).toBe(false);
    expect(shapeable('afw6yy5xx9')).toBe(false);
  });
  it('ev is the shape, and dropped when it carries a run var', () => {
    expect(mintEv('http://od.test/odoo/*|q.id', '44')).toBe(`http://od.test/odoo/*|q.id ${shapeOf('44')}`);
    expect(mintEv('k', 'Order Alpha')).toBeUndefined();
    expect(mintEv('k', 'n12-44', ['n12'])).toBeUndefined();
    expect(mintEv('x'.repeat(130), '44')).toBeUndefined();
  });
});

describe('taskConstantArms', () => {
  const fixture = (): RecordedEntry[] =>
    fs
      .readFileSync(path.join(__dirname, 'fixture', 'fwod84-n1-03-open.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as RecordedEntry);

  it('FURN_7777 is offered (fwod84) and the same values as taskConstants', () => {
    const es = fixture();
    const values = ['FURN_7777', '[FURN_7777] Office Chair', 'fwod84-n1'];
    const arms = taskConstantArms(es, values, ['fwod84-n1']);
    expect(arms.get('FURN_7777')).toBe('offered');
    expect([...arms.keys()]).toEqual([...taskConstants(es, values, ['fwod84-n1'])]);
  });

  it('a value an instruction stated before any report is `stated`', () => {
    const url = 'http://si.test/';
    const es: RecordedEntry[] = [
      { k: 'instruction', text: "Check the asset out to 'Bench Assignee'", url },
      { k: 'report', status: 'success', summary: 'done', values: { assignee: 'Bench Assignee' } },
    ];
    expect(taskConstantArms(es, ['Bench Assignee']).get('Bench Assignee')).toBe('stated');
    expect(taskConstants(es, ['Bench Assignee']).has('Bench Assignee')).toBe(true);
  });
});

describe('ValueFactObserver', () => {
  let dir: string;
  let store: SiteFactStore;
  const saved = { ...process.env };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitelooper-facts-value-'));
    store = new SiteFactStore(dir);
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    clearSecretLedger();
    process.env = { ...saved };
  });

  it('a link-minted query id: value.class mint and route.query identity, both hard (kanboard fwkb41)', () => {
    const ledger = new RunLedger();
    const url = `${KB}/?controller=TaskViewController&action=show&task_id=4`;
    const parts = urlParts(url);
    const opts = { landed: true, landedLabels: [], linkMinted: [{ label: 'q.task_id', value: '4' }] };
    const admitted = ledger.addUrlIds(url, 'i1', parts, opts);
    const obs = new ValueFactObserver(store, 'n1', dir);
    obs.noteUrl(url, parts, opts, admitted);
    obs.endInstruction(end([{ k: 'instruction', text: 'Create a task', url }], ledger));
    const sf = store.read(KB);
    const mint = sf.facts.find((f) => f.k === 'value.class' && f.key === valueHash('4'));
    expect(mint).toMatchObject({ v: 'mint', hard: true, sessions: ['n1'] });
    expect(sf.facts.find((f) => f.k === 'route.query')).toMatchObject({ key: `${KB}/?task_id`, v: 'identity', hard: true });
  });

  it('an odoo `#id=` is a position admission: hard; a variance admission is soft', () => {
    const ledger = new RunLedger();
    ledger.seedVariance(['afw6yy5xx9']);
    const url = `${OD}/web#id=44&model=sale.order`;
    const gr = 'http://gr.test/d/afw6yy5xx9/bench';
    const obs = new ValueFactObserver(store, 'n2', dir);
    for (const u of [url, gr]) {
      const parts = urlParts(u);
      obs.noteUrl(u, parts, {}, ledger.addUrlIds(u, 'i1', parts, {}));
    }
    obs.endInstruction(end([{ k: 'instruction', text: 'open', url }], ledger));
    const od = store.read(OD).facts;
    expect(od.find((f) => f.k === 'value.class')).toMatchObject({ key: valueHash('44'), v: 'mint', hard: true });
    expect(od.find((f) => f.k === 'route.query')).toMatchObject({ key: `${OD}/web?id`, v: 'identity', hard: true });
    const g = store.read('http://gr.test').facts;
    expect(g.find((f) => f.k === 'value.class')).toMatchObject({ key: valueHash('afw6yy5xx9'), v: 'mint', hard: false });
    expect(g.find((f) => f.k === 'value.class')?.ev).toBeUndefined(); // a uid's shape would spell it out
    expect(g.find((f) => f.k === 'route.path')).toMatchObject({ key: 'http://gr.test/d/*/bench#1', v: 'identity', hard: false });
  });

  it('grafana letters-only uids: two sessions key one route.path fact once p1 is an identity part (fwgr78)', () => {
    for (const [session, uid] of [['n1', 'afzexqoxkzoqod'], ['n2', 'bqwertyuiopzxc']] as const) {
      const ledger = new RunLedger();
      ledger.seedVariance([uid]);
      const url = `http://gr.test/d/${uid}/bench`;
      const parts = urlParts(url);
      const obs = new ValueFactObserver(store, session, dir);
      obs.noteUrl(url, parts, {}, ledger.addUrlIds(url, 'i1', parts, {}));
      obs.endInstruction(end([{ k: 'instruction', text: 'open', url }], ledger));
    }
    const paths = store.read('http://gr.test').facts.filter((f) => f.k === 'route.path');
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatchObject({ key: 'http://gr.test/d/*/bench#1', v: 'identity', hard: false, sessions: ['n1', 'n2'], contra: 0 });
  });

  it('snapshot: the origin’s facts as the store holds them, undefined for a non-url', () => {
    const obs = new ValueFactObserver(store, 'n1', dir);
    expect(obs.snapshot('http://gr.test/d/x/bench')).toEqual(emptyFacts('http://gr.test'));
    expect(obs.snapshot('not a url')).toBeUndefined();
  });

  it('a shape-only admission files nothing', () => {
    const ledger = new RunLedger();
    const url = 'http://rd.test/#/tickets/t15abc';
    const parts = urlParts(url);
    const obs = new ValueFactObserver(store, 'n1', dir);
    obs.noteUrl(url, parts, {}, ledger.addUrlIds(url, 'i1', parts, {}));
    obs.endInstruction(end([{ k: 'instruction', text: 'open', url }], ledger));
    expect(store.read('http://rd.test').facts).toEqual([]);
  });

  it('two distinct reported ids of one shape in one session: value.shape hard', () => {
    const ledger = new RunLedger();
    const url = `${OD}/odoo/sales`;
    const obs = new ValueFactObserver(store, 'n1', dir);
    for (const [i, v] of ['S00023', 'S00041'].entries()) {
      const es: RecordedEntry[] = [{ k: 'instruction', text: `create order ${i}`, url }, { k: 'report', status: 'success', summary: 'ok', values: { order: v } }];
      obs.noteReport(url, 'order', v, ledger.add(v, { from: 'output', step: `i${i}`, name: 'order' }));
      obs.endInstruction(end(es, ledger));
    }
    const shape = store.read(OD).facts.find((f) => f.k === 'value.shape');
    expect(shape).toMatchObject({ key: `${OD}/odoo/sales|order`, v: { re: shapeOf('S00023') }, hard: true });
  });

  it('two sessions meet through the mint facts’ ev', () => {
    const url = (id: string) => `${OD}/web#id=${id}&model=sale.order`;
    for (const [session, id] of [['n1', '44'], ['n2', '45']] as const) {
      const ledger = new RunLedger();
      const obs = new ValueFactObserver(store, session, dir);
      const parts = urlParts(url(id));
      obs.noteUrl(url(id), parts, {}, ledger.addUrlIds(url(id), 'i1', parts, {}));
      obs.endInstruction(end([{ k: 'instruction', text: 'open', url: url(id) }], ledger));
      const shapes = store.read(OD).facts.filter((f) => f.k === 'value.shape');
      expect(shapes.length).toBe(session === 'n1' ? 0 : 1);
    }
    expect(store.read(OD).facts.find((f) => f.k === 'value.shape')).toMatchObject({ key: `${OD}/web|q.id`, v: { re: '^\\d+$' }, hard: true, sessions: ['n2'] });
  });

  it('task constants: offered hard, stated soft, once per session', () => {
    const ledger = new RunLedger();
    const url = 'http://si.test/';
    const es: RecordedEntry[] = [
      { k: 'instruction', text: "Check the asset out to 'Bench Assignee'", url },
      { k: 'report', status: 'success', summary: 'done', values: { assignee: 'Bench Assignee' } },
    ];
    ledger.add('Bench Assignee', { from: 'output', step: 'i1', name: 'assignee' });
    const obs = new ValueFactObserver(store, 'n1', dir);
    obs.endInstruction(end(es, ledger));
    obs.endInstruction(end(es, ledger));
    const f = store.read('http://si.test').facts.find((x) => x.k === 'value.class');
    expect(f).toMatchObject({ key: valueHash('Bench Assignee'), v: 'constant', hard: false, n: 1 });
    expect(f?.ev).toBeUndefined();
  });

  it('an ambiguous credential is filed by hash, hard, with no evidence, and never in clear', () => {
    process.env.APP_PASSWORD = 'kb-admin-pw';
    process.env.APP_USER = 'kb-admin-pw';
    expect(resolveSecrets('{{env:APP_PASSWORD}}')).toBe('kb-admin-pw');
    expect(ambiguousCredentialHashes()).toEqual([valueHash('kb-admin-pw')]);
    expect(scrubSecrets('hello kb-admin-pw')).toBe('hello kb-admin-pw'); // ambiguous: scrubbing unchanged
    const ledger = new RunLedger();
    const url = `${KB}/dashboard`;
    const obs = new ValueFactObserver(store, 'n1', dir);
    obs.endInstruction(end([{ k: 'instruction', text: 'sign in', url }], ledger));
    const f = store.read(KB).facts.find((x) => x.k === 'value.class');
    expect(f).toMatchObject({ key: valueHash('kb-admin-pw'), v: 'credential', hard: true });
    expect(f?.ev).toBeUndefined();
    expect(fs.readFileSync(store.path(KB), 'utf8')).not.toContain('kb-admin-pw');
  });

  it('a literal ambiguous credential in a password field is filed too', () => {
    process.env.APP_PASSWORD = 'admin-literal';
    process.env.APP_USER = 'admin-literal';
    markLiteralCredentialValue('admin-literal', true);
    expect(ambiguousCredentialHashes()).toContain(valueHash('admin-literal'));
  });

  it('facts.ledger: a reliable constant disagrees with a shape-kinded identifier, judged before this instruction’s own facts', () => {
    const url = `${OD}/odoo/sales/new`;
    // session 1 learned FURN_7777 is a constant the app offered
    const seeded = new SiteFactStore(dir);
    seeded.observe(OD, [{ k: 'value.class', key: valueHash('FURN_7777'), v: 'constant', hard: true, session: 'n1' }]);
    const ledger = new RunLedger();
    const banked = ledger.add('FURN_7777', { from: 'output', step: 'i3', name: 'ref_2' });
    expect(banked?.kind).toBe('identifier');
    const obs = new ValueFactObserver(store, 'n2', dir);
    obs.noteReport(url, 'ref_2', 'FURN_7777', banked);
    const es: RecordedEntry[] = [{ k: 'instruction', text: 'add the chair', url }, { k: 'report', status: 'success', summary: 'ok', values: { ref_2: 'FURN_7777' } }];
    const rows = obs.endInstruction(end(es, ledger));
    expect(rows).toEqual([expect.objectContaining({ rule: 'facts.ledger', fact: 'not-identifier', heuristic: 'identifier', agree: false })]);
    const written = shadowRows(dir);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ rule: 'facts.ledger', session: 'n2', instruction: 'add the chair' });
    expect(JSON.stringify(written)).not.toContain('FURN_7777');
    // the same instruction ended twice writes its rows once
    obs.noteReport(url, 'ref_2', 'FURN_7777', null);
    obs.endInstruction(end(es, ledger));
    expect(shadowRows(dir)).toHaveLength(1);
  });

  it('facts.sourcing (stage 3): the row of a key the hold held on the fact alone is applied', () => {
    const url = `${OD}/odoo/sales`;
    store.observe(OD, [{ k: 'value.shape', key: shapeKeyOf(url, 'ref'), v: { re: shapeOf('S00023'), n: 2 }, hard: true, session: 'n1' }]);
    const ledger = new RunLedger();
    const obs = new ValueFactObserver(store, 'n2', dir);
    const es: RecordedEntry[] = [
      { k: 'instruction', text: 'Open the quotation list and report the customer of the newest quotation.', url, fingerprint: [1, 0, 0] },
      { k: 'report', status: 'success', summary: 'ok', values: { customer: 'Bench Customer', ref: 'S00031' }, sourcingAsk: { asked: ['ref'], readsAdded: 0, labelled: [], gesturesAfter: [], byFact: ['ref'] } },
    ];
    const rows = obs.endInstruction({ ...end(es, ledger), sourcingHold: true });
    expect(rows.filter((r) => r.rule === 'facts.sourcing')).toEqual([expect.objectContaining({ step: 'report ref', fact: 'held', heuristic: 'held', agree: true, applied: true })]);
  });

  it('no fact about a value: no row', () => {
    const ledger = new RunLedger();
    const obs = new ValueFactObserver(store, 'n1', dir);
    const url = `${OD}/odoo/sales`;
    obs.noteReport(url, 'ref', 'S00023', ledger.add('S00023', { from: 'output', step: 'i1', name: 'ref' }));
    expect(obs.endInstruction(end([{ k: 'instruction', text: 'x', url }], ledger))).toEqual([]);
    expect(shadowRows(dir)).toEqual([]);
  });

  it('facts.strip rows, keyed by the label the value was met under', () => {
    store.observe(OD, [{ k: 'value.class', key: valueHash('S00023'), v: 'mint', hard: true, session: 'n1' }]);
    const ledger = new RunLedger();
    const url = `${OD}/odoo/sales`;
    const obs = new ValueFactObserver(store, 'n2', dir);
    const e = ledger.add('S00023', { from: 'output', step: 'i1', name: 'ref' })!;
    obs.noteReport(url, 'ref', 'S00023', e);
    const rows = obs.stripRows([e], new Set(['S00023']));
    expect(rows).toEqual([expect.objectContaining({ rule: 'facts.strip', fact: 'strip', heuristic: 'strip', agree: true })]);
    expect(obs.stripRows([e], new Set(['S00023']))).toEqual([]); // the same row again: written once per session
    expect(obs.stripRows([e], new Set())).toEqual([expect.objectContaining({ fact: 'strip', heuristic: 'keep', agree: false })]);
    expect(shadowRows(dir).map((r) => r.rule)).toEqual(['facts.strip', 'facts.strip']);
  });

  it('beginSession resets the memory', () => {
    const obs = new ValueFactObserver(store, 'n1', dir);
    obs.beginSession('n1/flow@t');
    expect(obs.session).toBe('n1/flow@t');
  });
});

describe('pure rows', () => {
  const sf = (): SiteFacts => {
    const s = emptyFacts(OD);
    observeFact(s, { k: 'value.shape', key: `${OD}/odoo/sales|ref`, v: { re: shapeOf('S00023'), n: 2 }, hard: true, session: 'n1' });
    observeFact(s, { k: 'value.class', key: valueHash('4'), v: 'mint', hard: true, session: 'n1' });
    return s;
  };

  it('factKind: shape and class', () => {
    expect(factKind(sf(), 'S00099', `${OD}/odoo/sales|ref`)).toBe('identifier');
    expect(factKind(sf(), 'hello', `${OD}/odoo/sales|ref`)).toBe('none');
    expect(factKind(sf(), '4', undefined)).toBe('identifier');
  });

  it('ledgerRow: an unbanked short id the shape would admit disagrees', () => {
    expect(ledgerRow(sf(), '4', undefined, undefined)).toMatchObject({ fact: 'identifier', heuristic: 'not-identifier', agree: false });
    expect(ledgerRow(emptyFacts(OD), '4', undefined, undefined)).toBeNull();
  });

  it('stripRow: a fact that does not speak agrees', () => {
    expect(stripRow(sf(), 'hello', `${OD}/odoo/sales|ref`, true)).toMatchObject({ fact: 'none', agree: true });
  });

  it('sourcingRow: an unasked value of a known mint shape would be held', () => {
    expect(sourcingRow(sf(), 'ref', 'S00099', `${OD}/odoo/sales|ref`, false, false)).toMatchObject({ rule: 'facts.sourcing', fact: 'held', heuristic: 'not-held', agree: false });
    expect(sourcingRow(sf(), 'ref', 'S00099', `${OD}/odoo/sales|ref`, true, true)).toMatchObject({ fact: 'held', agree: true });
    expect(sourcingRow(sf(), 'ref', 'no', `${OD}/odoo/sales|ref`, false, false)).toMatchObject({ fact: 'none', agree: true });
    expect(sourcingRow(sf(), 'other', 'S00099', `${OD}/odoo/sales|other`, false, false)).toBeNull();
  });

  it('sourcingRow (stage 3): applied when the hold held the key on the fact alone, and only then', () => {
    expect(sourcingRow(sf(), 'ref', 'S00099', `${OD}/odoo/sales|ref`, true, false, true)).toMatchObject({ fact: 'held', heuristic: 'held', agree: true, applied: true });
    expect(sourcingRow(sf(), 'ref', 'S00099', `${OD}/odoo/sales|ref`, true, false)).not.toHaveProperty('applied');
    // a fact that does not speak never stamps applied
    expect(sourcingRow(sf(), 'ref', 'no', `${OD}/odoo/sales|ref`, true, false, true)).not.toHaveProperty('applied');
    // the value's own reliable mint class speaks too (valueVerdict), with no shape under the key
    expect(sourcingRow(sf(), 'n', '4', `${OD}/odoo/sales|n`, false, false)).toMatchObject({ fact: 'held', heuristic: 'not-held' });
  });

  it('taskConstantArms (stage 3): a fact-only constant is the third arm, `fact`', () => {
    const es: RecordedEntry[] = [
      { k: 'instruction', text: 'Add the chair and report its code.', url: `${OD}/odoo/sales/7`, fingerprint: [1, 0, 0] },
      { k: 'report', status: 'success', summary: 'ok', values: { code: 'FURN_7777' } },
    ];
    const s = emptyFacts(OD);
    observeFact(s, { k: 'value.class', key: valueHash('FURN_7777'), v: 'constant', hard: true, session: 'n1' });
    expect([...taskConstantArms(es, ['FURN_7777'], [], undefined, s)]).toEqual([['FURN_7777', 'fact']]);
    expect([...taskConstantArms(es, ['FURN_7777'])]).toEqual([]);
  });
});

describe('valueVerdict (stage 3): reliable facts only, with the deciding fact', () => {
  const KEY = `${OD}/odoo/sales|ref`;
  const facts = (...obs: Omit<Parameters<typeof observeFact>[1], 'session'>[]): SiteFacts => {
    const s = emptyFacts(OD);
    for (const o of obs) observeFact(s, { ...o, session: 'n1' });
    return s;
  };

  it('no facts, or none about the value: null', () => {
    expect(verdictOf(undefined, 'S00023', KEY)).toBeNull();
    expect(verdictOf(emptyFacts(OD), 'S00023', KEY)).toBeNull();
    expect(verdictOf(facts({ k: 'value.class', key: valueHash('x1'), v: 'mint', hard: true }), 'S00023', KEY)).toBeNull();
  });

  it('a mint is an identifier, a constant and a credential are not; the deciding fact rides along', () => {
    const mint = verdictOf(facts({ k: 'value.class', key: valueHash('S00023'), v: 'mint', hard: true }), 'S00023');
    expect(mint).toMatchObject({ kind: 'identifier', by: { k: 'value.class', v: 'mint' } });
    expect(verdictOf(facts({ k: 'value.class', key: valueHash('FURN_7777'), v: 'constant', hard: true }), 'FURN_7777')).toMatchObject({
      kind: 'not-identifier',
      by: { k: 'value.class', v: 'constant' },
    });
    expect(verdictOf(facts({ k: 'value.class', key: valueHash('admin'), v: 'credential', hard: true }), ' Admin ')).toMatchObject({
      kind: 'not-identifier',
      by: { v: 'credential' },
    });
  });

  it('the key’s reliable mint shape makes an identifier at first sighting, whatever its length', () => {
    const s = facts({ k: 'value.shape', key: `${KB}/*|task_id`, v: { re: shapeOf('41'), n: 2 }, hard: true });
    expect(verdictOf(s, '4', `${KB}/*|task_id`)).toMatchObject({ kind: 'identifier', by: { k: 'value.shape', key: `${KB}/*|task_id` } });
    expect(verdictOf(s, '4', `${KB}/*|other`)).toBeNull();
    expect(verdictOf(s, 'four', `${KB}/*|task_id`)).toBeNull();
  });

  it('a constant the key’s mint shape matches is an identifier (mint wins); a credential never is', () => {
    const shape = { k: 'value.shape' as const, key: KEY, v: { re: shapeOf('S00023'), n: 2 }, hard: true };
    expect(verdictOf(facts(shape, { k: 'value.class', key: valueHash('S00099'), v: 'constant', hard: true }), 'S00099', KEY)).toMatchObject({
      kind: 'identifier',
      by: { k: 'value.shape' },
    });
    expect(verdictOf(facts(shape, { k: 'value.class', key: valueHash('S00099'), v: 'credential', hard: true }), 'S00099', KEY)).toMatchObject({
      kind: 'not-identifier',
    });
  });

  it('an advisory fact decides nothing: soft in one session, or contradicted', () => {
    expect(verdictOf(facts({ k: 'value.class', key: valueHash('S00023'), v: 'mint', hard: false }), 'S00023')).toBeNull();
    const both = facts(
      { k: 'value.class', key: valueHash('S00023'), v: 'mint', hard: true },
      { k: 'value.class', key: valueHash('S00023'), v: 'constant', hard: true },
    );
    expect(verdictOf(both, 'S00023')).toBeNull();
    expect(factKind(both, 'S00023', undefined)).toBe('none');
  });

  it('rows: applied only when asked and the fact speaks', () => {
    const s = facts({ k: 'value.class', key: valueHash('FURN_7777'), v: 'constant', hard: true });
    expect(ledgerRow(s, 'FURN_7777', undefined, 'text', true)).toMatchObject({ fact: 'not-identifier', heuristic: 'not-identifier', agree: true, applied: true });
    expect(ledgerRow(s, 'FURN_7777', undefined, 'text')).not.toHaveProperty('applied');
    expect(stripRow(s, 'FURN_7777', undefined, false, true)).toMatchObject({ fact: 'keep', heuristic: 'keep', applied: true });
    const soft = facts({ k: 'value.class', key: valueHash('FURN_7777'), v: 'constant', hard: false });
    expect(stripRow(soft, 'FURN_7777', undefined, false, true)).toMatchObject({ fact: 'none' });
    expect(stripRow(soft, 'FURN_7777', undefined, false, true)).not.toHaveProperty('applied');
  });
});

describe('ValueFactObserver (stage 3): the consumers’ side', () => {
  let dir: string;
  let store: SiteFactStore;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitelooper-facts-value3-'));
    store = new SiteFactStore(dir);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('a report banked on the snapshot writes an applied facts.ledger row (fwod84 FURN_7777)', () => {
    store.observe(OD, [{ k: 'value.class', key: valueHash('FURN_7777'), v: 'constant', hard: true, session: 'n1' }]);
    const obs = new ValueFactObserver(store, 'n2', dir);
    const url = `${OD}/odoo/sales/7`;
    const ledger = new RunLedger();
    const e = ledger.add('FURN_7777', { from: 'output', step: 'i1', name: 'code' }, { shapeKey: shapeKeyOf(url, 'code') }, obs.snapshot(url));
    expect(e).toMatchObject({ kind: 'text' });
    obs.noteReport(url, 'code', 'FURN_7777', e);
    const rows = obs.endInstruction(end([{ k: 'instruction', text: 'x', url }], ledger));
    expect(rows).toEqual([expect.objectContaining({ rule: 'facts.ledger', fact: 'not-identifier', heuristic: 'not-identifier', agree: true, applied: true })]);
  });

  it('stripVerdicts: by the key a value was met under, or by class on the fallback origin; silent without a reliable fact', () => {
    store.observe(OD, [
      { k: 'value.class', key: valueHash('FURN_7777'), v: 'constant', hard: true, session: 'n1' },
      { k: 'value.class', key: valueHash('seed-7'), v: 'mint', hard: true, session: 'n1' },
    ]);
    const obs = new ValueFactObserver(store, 'n2', dir);
    const url = `${OD}/odoo/sales/7`;
    const ledger = new RunLedger();
    const a = ledger.add('FURN_7777', { from: 'output', step: 'i1', name: 'code' })!;
    const b = ledger.add('seed-7', { from: 'output', step: 'i1', name: 'seed' })!;
    const c = ledger.add('S00041', { from: 'output', step: 'i1', name: 'ref' })!;
    obs.noteReport(url, 'code', 'FURN_7777', a);
    const v = obs.stripVerdicts([a, b, c], OD);
    expect(v.get('FURN_7777')).toMatchObject({ kind: 'not-identifier' });
    expect(v.get('seed-7')).toMatchObject({ kind: 'identifier' }); // never met under a key: the flow's origin, by class
    expect(v.has('S00041')).toBe(false);
    expect(obs.stripVerdicts([b])).toEqual(new Map()); // no fallback origin: nowhere to ask
    const rows = obs.stripRows([a, b], new Set(['seed-7']), 'strip f', { values: new Set(v.keys()), origin: OD });
    expect(rows).toEqual([
      expect.objectContaining({ rule: 'facts.strip', fact: 'keep', heuristic: 'keep', applied: true }),
      expect.objectContaining({ rule: 'facts.strip', fact: 'strip', heuristic: 'strip', applied: true }),
    ]);
  });

  it('credentialHashes: the reliable credential facts of the url’s origin, hashes only', () => {
    store.observe(OD, [{ k: 'value.class', key: valueHash('admin'), v: 'credential', hard: true, session: 'n1' }]);
    store.observe(OD, [{ k: 'value.class', key: valueHash('softcred'), v: 'credential', hard: false, session: 'n1' }]);
    store.observe(OD, [{ k: 'value.class', key: valueHash('S00023'), v: 'mint', hard: true, session: 'n1' }]);
    const obs = new ValueFactObserver(store, 'n2', dir);
    expect(obs.credentialHashes(`${OD}/web/login`)).toEqual(new Set([valueHash('admin')]));
    expect(obs.credentialHashes(`${KB}/login`)).toEqual(new Set());
    expect(obs.credentialHashes('not a url')).toEqual(new Set());
  });
});
