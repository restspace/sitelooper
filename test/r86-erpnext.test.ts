/**
 * Round 86: the two gaps the fourth ERPNext sweep (fwen4-luna) left, each
 * judged on slices of the published recordings (test/fixture/fwen4-luna-*)
 * and on what the replays' own browsers showed (fwen4-luna-n2/-n3-flowrun.json,
 * fwen4-luna-spec-spec-result.json).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseScript, shownReadBack, type RecordedEntry, type RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills, takenBackLines } from '../src/skills/compile.js';
import { appMintedPositions } from '../src/skills/app-minted-url.js';
import { preconditionVerdict, urlEffectVerdict } from '../src/execution/gates.js';
import { urlMatches } from '../src/execution/url.js';
import { SkillStore, type Skill } from '../src/skills/store.js';
import type { Flow } from '../src/skills/flow.js';
import { flowToSpec } from '../src/spec/ir.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { Report } from '../src/agent/report.js';

const EN = 'http://127.0.0.1:8100';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-r86-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const fixture = (name: string): RecordedEntry[] => parseScript(fs.readFileSync(path.join(__dirname, 'fixture', name), 'utf8')).entries;
const stepsOf = (entries: RecordedEntry[]): RecordedStep[] => entries.filter((e): e is RecordedStep => e.k === 'step');
const instructionOf = (entries: RecordedEntry[]) => entries[0] as Extract<RecordedEntry, { k: 'instruction' }>;
const lastReport = (entries: RecordedEntry[]) => entries.filter((e): e is Extract<RecordedEntry, { k: 'report' }> => e.k === 'report').at(-1)!;

/** One recorded instruction, compiled as the daemon compiled it. */
function compile(name: string | RecordedEntry[], runid: string, extra: Partial<Parameters<typeof compileSkills>[0]> = {}): Skill[] {
  const entries = typeof name === 'string' ? fixture(name) : name;
  const report = lastReport(entries);
  return compileSkills({
    entries: entries.filter((e) => e.k !== 'report'),
    instruction: instructionOf(entries).text,
    report: { status: 'success', summary: report.summary ?? '', evidence: { values: report.values ?? {} } },
    session: runid,
    knownValues: { 'var:runid': runid },
    ...extra,
  });
}

/** The emitted artifact for one flow step pinned to `skills`' chain head. */
function emitStep(skills: Skill[], id: string, params: Record<string, string>, vars: string[] = []): string {
  const dir = fs.mkdtempSync(path.join(tmp, 'store-'));
  const store = new SkillStore(dir);
  for (const s of skills) store.put(s);
  const flow = {
    name: 'fwen4-luna',
    origin: EN,
    startUrl: `${EN}/`,
    vars,
    steps: [{ id, instruction: skills[0].provenance.instruction, skill: skills[0].id, params, outputs: [] }],
  } as unknown as Flow;
  return emitFlowFile(flowToSpec(flow, store).spec, { tier: 'plain' }).source;
}
const stepBodies = (source: string): string => source.slice(source.indexOf('export const steps = {'));
function syntaxErrors(source: string): string[] {
  const out = ts.transpileModule(source, { fileName: 'flow.ts', reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return (out.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
}

const patterns = (chain: Skill[]): string[] =>
  chain.flatMap((s) => [s.preconditions.urlPattern, ...s.steps.map((st) => st.expect?.urlPattern)]).filter((p): p is string => typeof p === 'string');

const step = (tool: string, args: Record<string, unknown>, url?: string, more: Record<string, unknown> = {}): RecordedStep =>
  ({ k: 'step', tool, args, locators: {}, ...(url ? { diff: { url, added: [], removed: [], alerts: [] } } : {}), ...more }) as unknown as RecordedStep;
/** A journal window with one answered write request that carried the typed values of `carries`. */
const saved = (w: number, carries: number[]) => ({
  journal: { w, ev: [{ t: 1, k: 'req', m: 'POST', e: `${EN}/api/method/frappe.desk.form.save.savedocs`, rt: 'xhr', carries, s: 200, c: ['in', w, 'gesture'] }] },
});

/**
 * GAP A. fwen4-luna 04-create reached the new Sales Order form by a CLICK:
 * n1 #76 `click role=link[name="New Sales Order"]`, the awesomebar's item — an
 * `<a>` with no href (its settle recorded no link, where #12's "Sales Order
 * List" recorded `link: {href: …/app/sales-order}`) — landed on
 * `/app/sales-order/new-sales-order-uzdrpbgnbt`. Round 83's rule admits a goto
 * the app redirected or a url rewritten under a fill; a click was neither, so
 * s_bdb054 step 3 and all of s_742fcc froze n1's form instance:
 *   n2: "s_bdb054 stopped at step 3 — after step 3 expected url
 *        …/new-sales-order-uzdrpbgnbt but browser is at …/new-sales-order-hjgezxdvos"
 *   n3: "s_cdd0dc stopped at step 3 — … expected …/new-sales-order-hjgezxdvos
 *        but browser is at …/new-sales-order-ismjutpfny" (n2's re-pin froze its own).
 */
describe('GAP A: a form instance a click opened (provisional url position)', () => {
  describe('appMintedPositions: the app renamed the page when the procedure saved what it typed there', () => {
    const opened = `${EN}/app/sales-order/new-sales-order-uzdrpbgnbt`;
    const recording = (over: { save?: Record<string, unknown>; open?: Record<string, unknown>; saveTool?: string } = {}) => [
      step('click', { target: 'role=link[name="New Sales Order"]' }, opened, over.open ?? {}),
      step('type', { target: '@e1', text: 'Bench Customer' }, opened, { journal: { w: 253 } }),
      step('fill', { target: '@e2', value: '2026-12-31' }, opened, { journal: { w: 272 } }),
      step(over.saveTool ?? 'click', { target: '@e3' }, `${EN}/app/sales-order/SAL-ORD-2026-00004`, over.save ?? saved(369, [10, 253, 272])),
    ];

    it('the value the click landed on, and only that one', () => {
      expect(appMintedPositions(`${EN}/app/customer`, recording())).toEqual([
        { route: `${EN} p0=app p1=sales-order`, label: 'p2', parts: 3, values: ['new-sales-order-uzdrpbgnbt'] },
      ]);
    });

    it('none without a journal, a write, an accepted answer, or a typed value carried from that page', () => {
      const start = `${EN}/app/customer`;
      expect(appMintedPositions(start, recording({ save: {} }))).toEqual([]);
      const get = saved(369, [253]);
      get.journal.ev[0].m = 'GET';
      expect(appMintedPositions(start, recording({ save: get }))).toEqual([]);
      const refused = saved(369, [253]);
      refused.journal.ev[0].s = 417;
      expect(appMintedPositions(start, recording({ save: refused }))).toEqual([]);
      // Carried only what an EARLIER page typed (window 10): nothing entered on this form was saved.
      expect(appMintedPositions(start, recording({ save: saved(369, [10]) }))).toEqual([]);
      // The write belongs to another step's window.
      expect(appMintedPositions(start, recording({ save: saved(400, [253]) }).map((s, i) => (i === 3 ? { ...s, journal: { ...s.journal!, w: 369 } } : s)))).toEqual([]);
    });

    it('none when the procedure navigated away itself, or the url moved at more than one position', () => {
      expect(appMintedPositions(`${EN}/app/customer`, recording({ saveTool: 'goto' }))).toEqual([]);
      const far = recording();
      far[3] = step('click', { target: '@e3' }, `${EN}/app/customer/SAL-ORD-2026-00004`, saved(369, [253]));
      expect(appMintedPositions(`${EN}/app/customer`, far)).toEqual([]);
    });

    it('a normal click to a RECORD page is an identity, even when a later save renames it', () => {
      const record = `${EN}/app/sales-order/SAL-ORD-2026-00003`;
      const amended = `${EN}/app/sales-order/SAL-ORD-2026-00003-1`;
      const edit = (open: RecordedStep): RecordedStep[] => [
        open,
        step('fill', { target: '@e2', value: '2027-01-15' }, record, { journal: { w: 20 } }),
        step('click', { target: '@e3' }, amended, saved(30, [20])),
      ];
      // The list link named it.
      expect(
        appMintedPositions(`${EN}/app/sales-order`, edit(step('click', { target: '@e9' }, record, { locators: { target: { expr: '', verified: true, raw: '@e9', chain: [{ kind: 'role', role: 'link', name: 'SAL-ORD-2026-00003' }] } } }))),
      ).toEqual([]);
      // Its href named it (the click's settle recorded the link).
      expect(
        appMintedPositions(
          `${EN}/app/sales-order`,
          edit(step('click', { target: '@e9' }, record, { obs: { at: { d: 1, s: 2 }, settle: { outcome: 'dispatched', link: { from: `${EN}/app/sales-order`, href: record }, waited: { domMs: 0, networkMs: 0, urlMs: 0, effectMs: 0 } } } })),
        ),
      ).toEqual([]);
      // The page it opened showed it.
      const shows = step('click', { target: '@e9' }, record);
      shows.diff!.added.push('- heading "SAL-ORD-2026-00003"');
      expect(appMintedPositions(`${EN}/app/sales-order`, edit(shows))).toEqual([]);
      // An earlier page listed it, the caller named it, or the procedure typed it.
      const listed = step('click', { target: '@e1' }, `${EN}/app/sales-order`);
      listed.diff!.added.push('- link "SAL-ORD-2026-00003"');
      expect(appMintedPositions(`${EN}/app/home`, [listed, ...edit(step('click', { target: '@e9' }, record))])).toEqual([]);
      expect(appMintedPositions(`${EN}/app/sales-order`, edit(step('click', { target: '@e9' }, record)), ['Open Sales Order SAL-ORD-2026-00003 and move its delivery date'])).toEqual([]);
      expect(appMintedPositions(`${EN}/app/sales-order`, [step('fill', { target: '@e0', value: 'SAL-ORD-2026-00003' }, `${EN}/app/sales-order`), ...edit(step('click', { target: '@e9' }, record))])).toEqual([]);
      // And a record page the procedure only edits and saves in place moves nothing.
      expect(
        appMintedPositions(`${EN}/app/sales-order`, [
          step('click', { target: '@e9' }, record),
          step('fill', { target: '@e2', value: '2027-01-15' }, record, { journal: { w: 20 } }),
          step('click', { target: '@e3' }, record, saved(30, [20])),
        ]),
      ).toEqual([]);
    });

    it('a clicked link whose href the app redirected at one position: the goto evidence, asked by the element', () => {
      const link = (href: string) => ({ obs: { at: { d: 1, s: 2 }, settle: { outcome: 'dispatched', link: { from: `${EN}/app/sales-order`, href }, waited: { domMs: 0, networkMs: 0, urlMs: 0, effectMs: 0 } } } });
      expect(appMintedPositions(`${EN}/app/sales-order`, [step('click', { target: '@e5' }, opened, link(`${EN}/app/sales-order/new`))])).toEqual([
        { route: `${EN} p0=app p1=sales-order`, label: 'p2', parts: 3, values: ['new', 'new-sales-order-uzdrpbgnbt'] },
      ]);
      // It went where it points: nothing minted.
      expect(appMintedPositions(`${EN}/app/sales-order`, [step('click', { target: '@e5' }, `${EN}/app/sales-order/SAL-ORD-2026-00003`, link(`${EN}/app/sales-order/SAL-ORD-2026-00003`))])).toEqual([]);
      // Recorded before its navigation committed (the landing is the page it left): nothing minted.
      expect(appMintedPositions(`${EN}/app/sales-order/SAL-ORD-2026-00002`, [step('click', { target: '@e5' }, `${EN}/app/sales-order/SAL-ORD-2026-00002`, link(`${EN}/app/sales-order/SAL-ORD-2026-00003`))])).toEqual([]);
    });
  });

  /** n1 script #73-#108 verbatim. */
  describe('fwen4-luna-n1 04-create recompiled', () => {
    const chain = () => compile('fwen4-luna-n1-04-create.jsonl', 'fwen4-luna-n1');

    it('the recording holds the evidence: #76 landed on the slug, #100 saved the typed values and moved that position', () => {
      const entries = fixture('fwen4-luna-n1-04-create.jsonl');
      const steps = stepsOf(entries);
      const click = steps.find((s) => s.seq === 76)!;
      expect(click.tool).toBe('click');
      expect(click.obs?.settle?.link).toBeUndefined();
      expect(click.diff?.url).toBe(`${EN}/app/sales-order/new-sales-order-uzdrpbgnbt`);
      expect(appMintedPositions(instructionOf(entries).url, steps, [instructionOf(entries).text])).toEqual([
        { route: `${EN} p0=app p1=sales-order`, label: 'p2', parts: 3, values: ['new-sales-order-uzdrpbgnbt'] },
      ]);
    });

    it('no pattern pins the form instance; the click step and the next segment accept n2 and n3 forms', () => {
      const skills = chain();
      const ps = patterns(skills);
      expect(ps.some((p) => p.includes('new-sales-order-'))).toBe(false);
      expect(JSON.stringify(skills)).not.toContain('uzdrpbgnbt');
      expect(ps).toContain(`${EN}/app/sales-order/:var`);
      // The click that opens the form: its url expectation, against both replays' browsers.
      const opener = skills.flatMap((s) => s.steps).find((st) => st.tool === 'click' && JSON.stringify(st.locators.target).includes('New '))!;
      expect(opener.expect?.urlPattern).toBe(`${EN}/app/sales-order/:var`);
      for (const live of [`${EN}/app/sales-order/new-sales-order-hjgezxdvos`, `${EN}/app/sales-order/new-sales-order-ismjutpfny`]) {
        expect(urlEffectVerdict(opener.expect?.urlPattern, live, {}, 'step 3').stop).toBeUndefined();
        // ...and the segment that fills the form starts there.
        const next = skills.find((s) => preconditionVerdict(s.preconditions.urlPattern, live, {}, null).refuse === undefined && urlMatches(s.preconditions.urlPattern, live));
        expect(next).toBeDefined();
        expect(next!.steps.some((st) => st.tool === 'type' || st.tool === 'fill')).toBe(true);
      }
      // A different page is still refused there.
      expect(urlEffectVerdict(opener.expect?.urlPattern, `${EN}/app/sales-order`, {}, 'step 3').stop).toBeDefined();
      expect(urlEffectVerdict(opener.expect?.urlPattern, `${EN}/app/customer/new-customer-abc`, {}, 'step 3').stop).toBeDefined();
    });

    it('the saved order keeps its minted identity', () => {
      const ps = patterns(chain());
      expect(ps.some((p) => p.endsWith('/app/sales-order/{{d1}}'))).toBe(true);
      expect(ps.some((p) => p.includes('SAL-ORD-2026-00004'))).toBe(false);
    });
  });

  /**
   * n2 script #68-#105 verbatim: s_bdb054 replayed (#69-#71, `via`), stopped at
   * its step 3 on n2's own form, and the model finished the order (two takes).
   * The re-pin compiled from this recording was s_cdd0dc → s_7b2a56, both
   * frozen on `new-sales-order-hjgezxdvos`.
   */
  describe('fwen4-luna-n2 04-create: the re-pin learned on the replay', () => {
    it('gets the same treatment: n3 is not refused its own form', () => {
      const skills = compile('fwen4-luna-n2-04-create.jsonl', 'fwen4-luna-n2', { variantOf: 's_bdb054', stoppedAt: { skill: 's_bdb054', step: 3 } });
      expect(skills.length).toBeGreaterThan(0);
      const ps = patterns(skills);
      expect(ps.some((p) => p.includes('new-sales-order-'))).toBe(false);
      expect(JSON.stringify(skills)).not.toContain('hjgezxdvos');
      expect(ps).toContain(`${EN}/app/sales-order/:var`);
      const live = `${EN}/app/sales-order/new-sales-order-ismjutpfny`;
      for (const p of ps.filter((x) => x.endsWith('/:var'))) expect(urlMatches(p, live)).toBe(true);
      expect(ps.some((p) => p.endsWith('/app/sales-order/{{d1}}'))).toBe(true);
    });
  });
});

/**
 * GAP B. fwen4-luna 02-find (n1 #9-#55), a read-only task the model spent 44
 * gestures and reads on: it set the list's Customer Name filter four ways and
 * opened the Filter popover after each. ERPNext's popover opens with a blank
 * `ID =` row; the list's NEXT refresh — Frappe spaces them a second apart —
 * applies it (`?name=undefined&…`) and the list is empty until the popover
 * closes. So every state "filter typed, popover open, three rows showing"
 * lasted under a second, in the recording and on every replay:
 *   n1 #16 click Filter  d=41020 c=41986  added the three "Seed: …" links
 *      gap (in #17): req reportview.get 42106, nav 42141 `?name=undefined&…`
 *      #17 read_all → [], #18 count → 0
 *      #19's gap diff (since #16's window): removed the three links.
 * The report was made on the emptied list, so the composite
 * matching_customer_names was split by shownReadBack and read "where it was
 * shown": right after #16. Replays (tier A, 0 turns, `partial`):
 *   "s_1e98e5: step 6: skipped read — no element matched … 'Seed: Beacon Supplies'"
 *   "s_1e98e5: step 7: skipped read — … 'Seed: Cobalt Retail'"
 * (n2: step 5 read Alpha Traders 107 ms after the click's capture; the list
 * emptied 85 ms later.) The compiled spec, whose click opened the popover
 * BEFORE the fill's debounced refresh, never saw the rows at all:
 *   "after step 02-find s_1e98e5/4 the page did not show "- link \"Seed:
 *    Cobalt Retail\"" / … as it did when recorded".
 * Not leaked app state: every run's reset cleared the saved list settings and
 * n2/n3 began on the same unfiltered list n1 did.
 */
describe('GAP B: a page change the app took back before the next gesture', () => {
  const entries = () => fixture('fwen4-luna-n1-02-find.jsonl');
  const bySeq = (all: RecordedEntry[], seq: number): RecordedStep => stepsOf(all).find((s) => s.seq === seq)!;
  const LINKS = ['- link "Seed: Cobalt Retail"', '- link "Seed: Beacon Supplies"', '- link "Seed: Alpha Traders"'];

  describe('takenBackLines', () => {
    it("n1 #16: the three links and the select-all box, by #19's gap diff; no other step of the recording", () => {
      const all = entries();
      const taken = takenBackLines(stepsOf(all));
      const click = bySeq(all, 16);
      expect(bySeq(all, 19).journal?.gap?.since).toBe(click.journal?.w);
      expect([...taken.keys()]).toEqual([click.diff]);
      expect([...taken.get(click.diff!)!]).toEqual(['- checkbox "Select All"', '- checkbox ""', ...LINKS]);
      // What the click itself did stays its effect.
      expect(click.diff!.added.filter((l) => !taken.get(click.diff!)!.has(l.trim())).slice(-3)).toEqual(['- button "+ Add a Filter"', '- button "Clear Filters"', '- button "Apply Filters"']);
    });

    const base = 1_000_000;
    const added = (lines: string[], w: number, more: Record<string, unknown> = {}): RecordedStep =>
      ({ k: 'step', tool: 'click', args: { target: '@e1' }, locators: {}, diff: { url: `${EN}/app/x`, added: lines, alerts: [] }, obs: { at: { d: base, s: base + 400, c: base + 420 } }, journal: { w }, ...more }) as unknown as RecordedStep;
    const next = (gap: Record<string, unknown>): RecordedStep =>
      ({ k: 'step', tool: 'click', args: { target: '@e2' }, locators: {}, diff: { url: `${EN}/app/x`, added: [], alerts: [] }, journal: { w: 9, gap } }) as unknown as RecordedStep;
    const nav = (t: number) => ({ t, k: 'nav', url: `${EN}/app/x?name=undefined`, c: ['late', 5, 'req'] });
    const read = (gap?: Record<string, unknown>): RecordedStep => ({ k: 'step', tool: 'read_all', args: { target: '.row' }, locators: {}, result: '[]', journal: { w: 7, ...(gap ? { gap } : {}) } }) as unknown as RecordedStep;

    it('fires on the three recorded facts: the gap is measured from this step, lists the line, and the page moved by itself within the debounce', () => {
      const s = added(['- link "A"', '- button "Open"'], 5);
      // The journal files the self-navigation with the read in between, as n1's #17 carries #16's.
      const taken = takenBackLines([s, read({ ev: [nav(base + 540)] }), next({ since: 5, url: `${EN}/app/x?name=undefined`, removed: ['- link "A"'] })]);
      expect([...taken.get(s.diff!)!]).toEqual(['- link "A"']);
    });

    it('none when the recording cannot say so', () => {
      const s = () => added(['- link "A"', '- button "Open"'], 5);
      const gone = { since: 5, url: `${EN}/app/x?name=undefined`, removed: ['- link "A"'], ev: [nav(base + 540)] };
      expect(takenBackLines([s(), next(gone)]).size).toBe(1);
      // No journal on the step, or no capture time.
      expect(takenBackLines([added(['- link "A"'], 5, { journal: undefined }), next(gone)]).size).toBe(0);
      expect(takenBackLines([added(['- link "A"'], 5, { obs: undefined }), next(gone)]).size).toBe(0);
      // The gap was measured from another step's capture.
      expect(takenBackLines([s(), next({ ...gone, since: 4 })]).size).toBe(0);
      // The next diffed step carries no gap diff: the page in between was not compared.
      expect(takenBackLines([s(), next({ ev: [nav(base + 540)] }), next(gone)]).size).toBe(0);
      // The line is not among what the page lost.
      expect(takenBackLines([s(), next({ ...gone, removed: ['- link "B"'] })]).size).toBe(0);
      // An eval ran in between: the procedure's own hand.
      expect(takenBackLines([s(), read({ ev: [nav(base + 540)] }), { ...read(), tool: 'eval' } as RecordedStep, next({ ...gone, ev: [] })]).size).toBe(0);
      // The page did not move by itself (a toast that faded: grafana's "Dashboard saved"), or only long after
      // the capture (a list that polls): the step's effect while a replay looked.
      expect(takenBackLines([s(), next({ since: 5, removed: ['- link "A"'] })]).size).toBe(0);
      expect(takenBackLines([s(), next({ ...gone, url: undefined })]).size).toBe(0);
      expect(takenBackLines([s(), next({ ...gone, ev: [] })]).size).toBe(0);
      expect(takenBackLines([s(), next({ ...gone, ev: [nav(base + 30_000)] })]).size).toBe(0);
      expect(takenBackLines([s(), next({ ...gone, ev: [{ ...nav(base + 540), k: 'req' }] })]).size).toBe(0);
    });
  });

  describe('fwen4-luna-n1 02-find recompiled', () => {
    const find = (skills: Skill[]) => skills.find((s) => s.steps.some((st) => st.tool === 'fill'))!;

    it('step 4 expects what its click did — the filter popover — not the list the app emptied', () => {
      const skill = find(compile('fwen4-luna-n1-02-find.jsonl', 'fwen4-luna-n1'));
      const step4 = skill.steps[3];
      expect(step4.tool).toBe('click');
      expect(step4.expect?.addedContains).toEqual(['- button "+ Add a Filter"', '- button "Clear Filters"', '- button "Apply Filters"']);
      expect(skill.provenance.transforms?.filter((n) => n.name === 'takenBackLines').map((n) => n.at)).toEqual([4]);
      // No step of the procedure requires a "Seed: …" row as its page change.
      for (const st of skill.steps) expect((st.expect?.addedContains ?? []).some((l) => /Cobalt Retail|Beacon Supplies|Alpha Traders/.test(l))).toBe(false);
    });

    it('the compiled artifact carries the same expectation', () => {
      const skills = compile('fwen4-luna-n1-02-find.jsonl', 'fwen4-luna-n1');
      const source = emitStep(skills, '02-find', { v1: 'Seed:' });
      expect(syntaxErrors(source)).toEqual([]);
      expect(stepBodies(source)).toContain(`['- button "+ Add a Filter"', '- button "Clear Filters"', '- button "Apply Filters"']`);
      // The three rows remain only as what the READS locate ("{{v1}} Cobalt Retail"), never as a page change to
      // require — the published artifact's `effectExpectation(page, ['- link "{{v1}} Cobalt Retail"', …`.
      expect(source).toContain('"name": "{{v1}} Cobalt Retail"');
      for (const spelled of ['- link "{{v1}}', '- link \\"{{v1}}']) expect(source).not.toContain(spelled);
    });

    it("never the whole evidence of a step that may be committing work: had the app taken back all #16 added, its lines stay", () => {
      const all = entries();
      // A click right after a fill (commitsWork).
      bySeq(all, 19).journal!.gap!.removed = bySeq(all, 16).diff!.added.map((l) => l);
      const step4 = find(compile(all, 'fwen4-luna-n1')).steps[3];
      expect(step4.expect?.addedContains?.some((l) => l.includes('Cobalt Retail'))).toBe(true);
    });
  });

  /**
   * The recorder's side: where the split composite is read. The published
   * script holds the three reads where shownReadBack filed them (#51-#53,
   * after #16); taken out, and the report's composite restored (its parts
   * joined in their own order), this is what the function was asked.
   */
  describe('shownReadBack: read where the value STAYED shown', () => {
    const asked = () => {
      const all = entries();
      const steps = stepsOf(all).filter((s) => ![51, 52, 53, 54].includes(s.seq ?? -1));
      const values: Record<string, string> = { matching_customer_names: 'Seed: Alpha Traders, Seed: Beacon Supplies, Seed: Cobalt Retail' };
      const report = { status: 'success', summary: lastReport(all).summary ?? '', evidence: { values } } as unknown as Report;
      return { all, steps, report, instruction: instructionOf(all).text };
    };

    it('not after #16, whose links the app took back: after the list came back and stood (#30 → #33, before #34)', async () => {
      const { steps, report, instruction } = asked();
      const got = await shownReadBack(steps, report, 'matching_customer_names', instruction);
      expect(got).not.toBeNull();
      expect(got!.after.seq).toBe(33);
      // #34's gap diff, measured from "Clear all filters" (#30), is the sighting.
      const s34 = steps.find((s) => s.seq === 34)!;
      expect(s34.journal?.gap?.since).toBe(steps.find((s) => s.seq === 30)!.journal?.w);
      expect(s34.journal?.gap?.added).toEqual(expect.arrayContaining(LINKS));
      expect(got!.reads.map((r) => [r.label, r.result, JSON.stringify(r.locators.target.chain)])).toEqual([
        ['matching_customer_names_1', '"Seed: Alpha Traders"', '[{"kind":"role","role":"link","name":"Seed: Alpha Traders"}]'],
        ['matching_customer_names_2', '"Seed: Beacon Supplies"', '[{"kind":"role","role":"link","name":"Seed: Beacon Supplies"}]'],
        ['matching_customer_names_3', '"Seed: Cobalt Retail"', '[{"kind":"role","role":"link","name":"Seed: Cobalt Retail"}]'],
      ]);
      expect(report.evidence?.values).toEqual({ matching_customer_names_1: 'Seed: Alpha Traders', matching_customer_names_2: 'Seed: Beacon Supplies', matching_customer_names_3: 'Seed: Cobalt Retail' });
    });

    it('filed there, the procedure reads the three names after the unfiltered list was read and before the page-size click, where n2 and n3 read all three rows', async () => {
      const { all, steps, report, instruction } = asked();
      const got = (await shownReadBack(steps, report, 'matching_customer_names', instruction))!;
      const kept = all.filter((e) => e.k !== 'step' || ![51, 52, 53].includes(e.seq ?? -1));
      kept.splice(kept.indexOf(got.after) + 1, 0, ...got.reads);
      const skill = compile(kept, 'fwen4-luna-n1').find((s) => s.steps.some((st) => st.tool === 'fill'))!;
      const labels = skill.steps.map((st) => st.label);
      const first = labels.indexOf('matching_customer_names_1');
      expect(labels.slice(first, first + 3)).toEqual(['matching_customer_names_1', 'matching_customer_names_2', 'matching_customer_names_3']);
      expect(skill.steps[first - 1].label).toBe('sales_order_list_url');
      expect(skill.steps[first + 3].tool).toBe('click');
      // Step 4, the click whose links went, is followed by its own next gesture now.
      expect(skill.steps[4].tool).toBe('click');
    });

    it('a recording without the gap diff reads where it always did: after the newest step that showed the parts', async () => {
      const { steps, report, instruction } = asked();
      const bare = steps.map((s) => ({ ...s, journal: undefined }));
      const got = await shownReadBack(bare, report, 'matching_customer_names', instruction);
      expect(got!.after.seq).toBe(16);
    });
  });
});

describe('GAP A in the compiled artifact', () => {
  it('04-create emits the generalised form url and no form instance', () => {
    const skills = compile('fwen4-luna-n1-04-create.jsonl', 'fwen4-luna-n1');
    const source = emitStep(skills, '04-create', { v1: '{{runid}}', v2: 'Sales Order', v3: '{{runid}} Bench Customer', v4: '2026-12-31' }, ['runid']);
    expect(syntaxErrors(source)).toEqual([]);
    const body = stepBodies(source);
    expect(body).not.toContain('new-sales-order-');
    expect(body).toContain(`${EN}/app/sales-order/:var`);
  });
});
