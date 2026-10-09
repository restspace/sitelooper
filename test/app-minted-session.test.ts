/**
 * Hard-5 fix 2: url positions the app minted under an EARLIER instruction of
 * the same session (skills/app-minted-url.ts sessionAppMintedPositions).
 *
 * erpnext fwen8-luna n1: 04-create's `goto /app/sales-order/new` landed on
 * `/app/sales-order/new-sales-order-uxvwbpigvk`, its Save failed (no items);
 * 05-add added the rows on that same unsaved form and saved it. 04-create's
 * skill s_538e35 got `/app/sales-order/:var`; 05-add's s_f44792 froze
 * `new-sales-order-uxvwbpigvk` into its start precondition and every step
 * expectation, and n2, n3 and the compiled spec all refused at its start gate.
 * Fixture: n1 script lines 53-118 verbatim (04-create and 05-add).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseScript, type RecordedEntry, type RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { appMintedPositions, generaliseAppMinted, sessionAppMintedPositions } from '../src/skills/app-minted-url.js';
import { preconditionVerdict } from '../src/execution/gates.js';
import { urlMatches } from '../src/execution/url.js';
import type { Skill } from '../src/skills/store.js';

const EN = 'http://127.0.0.1:8100';
const N1_FORM = `${EN}/app/sales-order/new-sales-order-uxvwbpigvk`;

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-minted-session-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const step = (tool: string, args: Record<string, unknown>, url?: string, more: Record<string, unknown> = {}): RecordedStep =>
  ({ k: 'step', tool, args, locators: {}, ...(url ? { diff: { url, added: [], removed: [], alerts: [] } } : {}), ...more }) as unknown as RecordedStep;
const instruction = (text: string, url?: string): RecordedEntry => ({ k: 'instruction', text, ...(url ? { url } : {}) }) as RecordedEntry;
const saved = (w: number, carries: number[]) => ({
  journal: { w, ev: [{ t: 1, k: 'req', m: 'POST', e: `${EN}/api/method/frappe.desk.form.save.savedocs`, rt: 'xhr', carries, s: 200, c: ['in', w, 'gesture'] }] },
});

const patterns = (chain: Skill[]): string[] =>
  chain.flatMap((s) => [s.preconditions.urlPattern, ...s.steps.map((st) => st.expect?.urlPattern)]).filter((p): p is string => typeof p === 'string');
const startsOn = (chain: Skill[], live: string): Skill | undefined =>
  chain.find((s) => preconditionVerdict(s.preconditions.urlPattern, live, {}, null).refuse === undefined && urlMatches(s.preconditions.urlPattern, live));

describe('fwen8-luna-n1 05-add recompiled with the session before it', () => {
  const all = parseScript(fs.readFileSync(path.join(__dirname, 'fixture', 'fwen8-luna-n1-04-05.jsonl'), 'utf8')).entries;
  const at = all.findIndex((e, i) => i > 0 && e.k === 'instruction');
  const before04 = all.slice(0, at);
  const group05 = all.slice(at);
  const report = group05.find((e): e is Extract<RecordedEntry, { k: 'report' }> => e.k === 'report')!;
  // s_f44792's params: what the ledger handed this compile.
  const knownValues = {
    'output:i4:role_option': 'Sales',
    'output:i3:customer_record_name': 'fwen8-luna-n1 Bench Customer',
    runid: 'fwen8-luna-n1',
    'output:i4:so_delivery_date_field': '2026-12-31',
  };
  const compile = (before?: RecordedEntry[]): Skill[] =>
    compileSkills({
      entries: group05.filter((e) => e.k !== 'report'),
      instruction: (group05[0] as Extract<RecordedEntry, { k: 'instruction' }>).text,
      report: { status: 'success', summary: report.summary ?? '', evidence: { values: report.values ?? {} } },
      session: 'fwen8-luna-n1',
      knownValues,
      ...(before ? { before } : {}),
    });

  it('the fixture is 04-create then 05-add, 05-add starting on the form 04-create was given', () => {
    expect(before04[0].k).toBe('instruction');
    expect((group05[0] as Extract<RecordedEntry, { k: 'instruction' }>).url).toBe(N1_FORM);
  });

  it('without the session (the bug): the n1 form instance is frozen into the start gate', () => {
    const chain = compile();
    expect(chain[0].preconditions.urlPattern).toBe(N1_FORM);
    expect(urlMatches(chain[0].preconditions.urlPattern, `${EN}/app/sales-order/new-sales-order-qkzjwmdfta`)).toBe(false);
  });

  it('with it: the start precondition and every step expectation on the unsaved form are :var; the saved order keeps its minted id', () => {
    const chain = compile(before04);
    const ps = patterns(chain);
    expect(chain[0].preconditions.urlPattern).toBe(`${EN}/app/sales-order/:var`);
    expect(ps.some((p) => p.includes('new-sales-order-'))).toBe(false);
    // The Save that renamed the form: SAL-ORD-2026-00004 keeps its identity.
    expect(ps.some((p) => p.endsWith('/app/sales-order/{{d1}}'))).toBe(true);
    expect(ps).not.toContain(`${EN}/app/sales-order/SAL-ORD-2026-00004`);
    // n2's and n3's own fresh forms are accepted at the start gate.
    for (const live of [`${EN}/app/sales-order/new-sales-order-qkzjwmdfta`, `${EN}/app/sales-order/new-sales-order-hbtvvqzrel`]) expect(startsOn(chain.slice(0, 1), live)).toBeDefined();
  });

  it('negative: a form instance the session had already been shown at that address stays literal', () => {
    // An earlier visit put n1's form address in front of the run before 04-create's goto landed there.
    const shownFirst: RecordedEntry[] = [instruction('Open the draft', `${EN}/app/home`), step('goto', { url: N1_FORM }, N1_FORM), ...before04];
    expect(compile(shownFirst)[0].preconditions.urlPattern).toBe(N1_FORM);
  });
});

describe('sessionAppMintedPositions: the earlier instructions widen the window, never the rule', () => {
  const FORM = `${EN}/app/sales-order/new-sales-order-abcdefghij`;
  const later = [step('fill', { target: '@e1', value: '3' }, FORM)];

  it('the goto evidence under an earlier instruction is applied to this one', () => {
    const before = [instruction('Create a sales order', `${EN}/app/home`), step('goto', { url: `${EN}/app/sales-order/new` }, FORM)];
    expect(appMintedPositions(FORM, later)).toEqual([]);
    const got = sessionAppMintedPositions(before, FORM, later);
    expect(got).toEqual([{ route: `${EN} p0=app p1=sales-order`, label: 'p2', parts: 3, values: ['new', 'new-sales-order-abcdefghij'] }]);
    expect(generaliseAppMinted(FORM, got)).toBe(`${EN}/app/sales-order/:var`);
  });

  it('a provisional value an earlier click opened is judged with this instruction\'s save (fwen4 shape across instructions)', () => {
    const before = [instruction('Open a new sales order', `${EN}/app/home`), step('click', { target: 'role=link[name="New Sales Order"]' }, FORM)];
    const steps = [step('type', { target: '@e1', text: 'Bench Customer' }, FORM, { journal: { w: 20 } }), step('click', { target: '@e3' }, `${EN}/app/sales-order/SAL-ORD-2026-00004`, saved(30, [20]))];
    expect(sessionAppMintedPositions(before, FORM, steps)).toEqual([{ route: `${EN} p0=app p1=sales-order`, label: 'p2', parts: 3, values: ['new-sales-order-abcdefghij'] }]);
  });

  it('negative: the value was in a url the session had seen before the goto landed there', () => {
    const before = [instruction('Look at the draft', `${EN}/app/home`), step('goto', { url: FORM }, FORM), step('goto', { url: `${EN}/app/sales-order/new` }, FORM)];
    expect(sessionAppMintedPositions(before, FORM, later)).toEqual([]);
  });

  it('negative: the url carries what an earlier step typed (a search routing to the term)', () => {
    const before = [instruction('Search for widget', `${EN}/app/search/all`), step('fill', { target: '@e1', value: 'widget' }, `${EN}/app/search/widget`)];
    expect(sessionAppMintedPositions(before, `${EN}/app/search/widget`, [step('click', { target: '@e2' }, `${EN}/app/search/widget`)])).toEqual([]);
  });

  it('negative: a provisional value the earlier page showed (a link naming it), or an earlier instruction named, is an identity', () => {
    const steps = [step('type', { target: '@e1', text: 'Bench Customer' }, FORM, { journal: { w: 20 } }), step('click', { target: '@e3' }, `${EN}/app/sales-order/SAL-ORD-2026-00004`, saved(30, [20]))];
    const listed = step('goto', { url: `${EN}/app/sales-order` }, `${EN}/app/sales-order`);
    listed.diff!.added.push('- link "new-sales-order-abcdefghij"');
    expect(sessionAppMintedPositions([instruction('Find the draft', `${EN}/app/home`), listed, step('click', { target: '@e9' }, FORM)], FORM, steps)).toEqual([]);
    expect(sessionAppMintedPositions([instruction('Open draft new-sales-order-abcdefghij', `${EN}/app/home`), step('click', { target: '@e9' }, FORM)], FORM, steps)).toEqual([]);
  });

  it('nothing before: exactly the instruction\'s own positions', () => {
    const steps = [step('goto', { url: `${EN}/app/sales-order/new` }, FORM)];
    expect(sessionAppMintedPositions(undefined, `${EN}/app/home`, steps)).toEqual(appMintedPositions(`${EN}/app/home`, steps));
    expect(sessionAppMintedPositions([], `${EN}/app/home`, steps)).toEqual(appMintedPositions(`${EN}/app/home`, steps));
  });
});
