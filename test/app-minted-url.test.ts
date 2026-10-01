import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseScript, type RecordedEntry, type RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { appMintedPositions, generaliseAppMinted } from '../src/skills/app-minted-url.js';
import { preconditionVerdict } from '../src/execution/gates.js';
import { urlMatches } from '../src/execution/url.js';
import type { Skill } from '../src/skills/store.js';

const EN = 'http://127.0.0.1:8100';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-minted-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const step = (tool: string, args: Record<string, unknown>, url?: string): RecordedStep =>
  ({ k: 'step', tool, args, locators: {}, ...(url ? { diff: { url, added: [], removed: [], alerts: [] } } : {}) }) as unknown as RecordedStep;

describe('appMintedPositions: the app put a value in the url the procedure never asked for', () => {
  it('a goto that landed somewhere else at one position (ERPNext new sales order)', () => {
    const got = appMintedPositions(`${EN}/app/customer`, [step('goto', { url: `${EN}/app/sales-order/new` }, `${EN}/app/sales-order/new-sales-order-rxojnkvnht`)]);
    expect(got).toEqual([{ route: `${EN} p0=app p1=sales-order`, label: 'p2', parts: 3, values: ['new', 'new-sales-order-rxojnkvnht'] }]);
  });

  it('a url rewritten during a fill, which cannot navigate (ERPNext new customer)', () => {
    const got = appMintedPositions(`${EN}/app/sales-order`, [
      step('goto', { url: `${EN}/app/customer/new` }, `${EN}/app/customer/new`),
      step('fill', { target: '@e97', value: 'fwen1-luna-n1 Bench Customer' }, `${EN}/app/customer/new-customer-uqaxhomexe`),
    ]);
    expect(got).toEqual([{ route: `${EN} p0=app p1=customer`, label: 'p2', parts: 3, values: ['new', 'new-customer-uqaxhomexe'] }]);
  });

  it('a hash route the app completes', () => {
    const got = appMintedPositions('http://h.test/', [step('goto', { url: 'http://h.test/#/orders/new' }, 'http://h.test/#/orders/n-8f3k2')]);
    expect(got).toEqual([{ route: 'http://h.test h0=orders', label: 'h1', parts: 2, values: ['new', 'n-8f3k2'] }]);
  });

  it('none when a CLICK moved the url: the procedure chose that page', () => {
    expect(appMintedPositions(`${EN}/items/7/view`, [step('click', { target: '@e1' }, `${EN}/items/7/history`)])).toEqual([]);
  });

  it('none for the first segment: a root routing /login to /home is another page', () => {
    expect(appMintedPositions('http://a.test/', [step('goto', { url: 'http://a.test/login' }, 'http://a.test/home')])).toEqual([]);
  });

  it('none when the landed value was seen earlier in the recording', () => {
    expect(
      appMintedPositions('http://a.test/admin/dashboard', [step('goto', { url: 'http://a.test/admin/login' }, 'http://a.test/admin/dashboard')]),
    ).toEqual([]);
  });

  it('none when the url carries what the step typed', () => {
    expect(appMintedPositions('http://a.test/search/all', [step('fill', { target: '@e1', value: 'widget' }, 'http://a.test/search/widget')])).toEqual([]);
  });

  it('none when more than one position, or the route length, changed', () => {
    expect(appMintedPositions('http://a.test/', [step('goto', { url: 'http://a.test/a/b/c' }, 'http://a.test/a/x/y')])).toEqual([]);
    expect(appMintedPositions('http://a.test/', [step('goto', { url: 'http://a.test/d/abc' }, 'http://a.test/d/abc/my-dashboard')])).toEqual([]);
    expect(appMintedPositions('http://a.test/', [step('goto', { url: 'http://a.test/app/x' }, 'http://b.test/app/y')])).toEqual([]);
  });

  it('none when the goto landed where it was sent', () => {
    expect(appMintedPositions('http://a.test/', [step('goto', { url: 'http://a.test/app/x/new' }, 'http://a.test/app/x/new')])).toEqual([]);
  });
});

describe('generaliseAppMinted: only the values seen there, only on that route', () => {
  const pos = [{ route: `${EN} p0=app p1=sales-order`, label: 'p2', parts: 3, values: ['new', 'new-sales-order-rxojnkvnht'] }];
  it('writes the asked and the given value :var', () => {
    expect(generaliseAppMinted(`${EN}/app/sales-order/new-sales-order-rxojnkvnht`, pos)).toBe(`${EN}/app/sales-order/:var`);
    expect(generaliseAppMinted(`${EN}/app/sales-order/new`, pos)).toBe(`${EN}/app/sales-order/:var`);
    expect(generaliseAppMinted(`${EN}/app/sales-order/new-sales-order-rxojnkvnht?x=1#t`, pos)).toBe(`${EN}/app/sales-order/:var?x=1#t`);
  });
  it('keeps another record, a marker, another route and another position', () => {
    for (const p of [
      `${EN}/app/sales-order/SAL-ORD-2026-00004`,
      `${EN}/app/sales-order/{{d1}}`,
      `${EN}/app/customer/new-sales-order-rxojnkvnht`,
      `${EN}/app/sales-order`,
      `${EN}/app/sales-order/new/extra`,
    ]) {
      expect(generaliseAppMinted(p, pos)).toBe(p);
    }
  });
  it('a hash-route position', () => {
    const h = [{ route: 'http://h.test h0=orders', label: 'h1', parts: 2, values: ['new', 'n-8f3k2'] }];
    expect(generaliseAppMinted('http://h.test/#/orders/n-8f3k2', h)).toBe('http://h.test/#/orders/:var');
    expect(generaliseAppMinted('http://h.test/#/orders/77', h)).toBe('http://h.test/#/orders/77');
  });
});

/**
 * erpnext fwen1-luna-n1 03-create and 04-create, n1 script lines 42-96
 * verbatim. Both procedures froze n1's form-instance url, and both replays
 * refused their own fresh form: s_442bcf against `/app/customer/new` with the
 * browser on `new-customer-ebrkqbfevl`, s_d95522 against
 * `new-sales-order-rxojnkvnht` with the browser on `new-sales-order-odmclosvvb`
 * (n2) and `-rjotjrekcg` (n3).
 */
describe('fwen1-luna recompiled: no procedure pins the form instance n1 was given', () => {
  const text = fs.readFileSync(path.join(__dirname, 'fixture', 'fwen1-luna-n1-03-04-create.jsonl'), 'utf8');
  const all = parseScript(text).entries;
  const groups: RecordedEntry[][] = [];
  for (const e of all) {
    if (e.k === 'instruction') groups.push([e]);
    else groups.at(-1)!.push(e);
  }
  const compile = (g: RecordedEntry[]): Skill[] => {
    const report = g.find((e): e is Extract<RecordedEntry, { k: 'report' }> => e.k === 'report')!;
    const instruction = (g[0] as Extract<RecordedEntry, { k: 'instruction' }>).text;
    return compileSkills({
      entries: g.filter((e) => e.k !== 'report'),
      instruction,
      report: { status: 'success', summary: report.summary ?? '', evidence: { values: report.values ?? {} } },
      session: 'fwen1-luna-n1',
      knownValues: { runid: 'fwen1-luna-n1', customer: 'fwen1-luna-n1 Bench Customer' },
    });
  };
  const patterns = (chain: Skill[]): string[] =>
    chain.flatMap((s) => [s.preconditions.urlPattern, ...s.steps.map((st) => st.expect?.urlPattern)]).filter((p): p is string => typeof p === 'string');
  const startsOn = (chain: Skill[], live: string): Skill | undefined =>
    chain.find((s) => preconditionVerdict(s.preconditions.urlPattern, live, {}, null).refuse === undefined && urlMatches(s.preconditions.urlPattern, live));

  it('03-create (customer): the redirected new form is one page, and n3 starts on its own', () => {
    expect(groups.length).toBe(2);
    const chain = compile(groups[0]);
    const ps = patterns(chain);
    expect(ps.length).toBeGreaterThan(0);
    expect(ps.some((p) => p.includes('new-customer-'))).toBe(false);
    expect(ps.some((p) => p.endsWith('/app/customer/new'))).toBe(false);
    expect(ps).toContain(`${EN}/app/customer/:var`);
    // n3's browser, which s_442bcf refused.
    expect(startsOn(chain, `${EN}/app/customer/new-customer-ebrkqbfevl`)).toBeDefined();
    // The saved record is still the record the run named, not a wildcard.
    expect(ps.some((p) => /\/app\/customer\/\{\{v\d+\}\}$/.test(p))).toBe(true);
  });

  it('04-create (sales order): every segment on the unsaved form accepts n2 and n3 forms; the saved order keeps its minted id', () => {
    const chain = compile(groups[1]);
    const ps = patterns(chain);
    expect(ps.some((p) => p.includes('new-sales-order-'))).toBe(false);
    expect(ps).toContain(`${EN}/app/sales-order/:var`);
    expect(ps.some((p) => p.endsWith('/app/sales-order/{{d1}}'))).toBe(true);
    for (const live of [`${EN}/app/sales-order/new-sales-order-odmclosvvb`, `${EN}/app/sales-order/new-sales-order-rjotjrekcg`]) {
      expect(startsOn(chain, live)).toBeDefined();
    }
    // The goto still asks for the stable address.
    expect(chain.flatMap((s) => s.steps).some((st) => st.tool === 'goto' && st.args.url === `${EN}/app/sales-order/new`)).toBe(true);
  });
});
