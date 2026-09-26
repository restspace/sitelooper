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
});
