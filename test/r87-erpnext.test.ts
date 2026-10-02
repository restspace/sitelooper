/**
 * Round 87: what the sixth ERPNext sweep (fwen6-luna) exposed on 02-find,
 * "Find existing ERPNext Sales Orders whose customer name starts with 'Seed:'
 * and report the customer names exactly as shown", judged on slices of the
 * published run: the recording (test/fixture/fwen6-luna-n1-02-find.jsonl, n1
 * entries 11–34), the exported flow step and what replay n2 returned for it
 * (test/fixture/fwen6-luna-02-find.json), and the replays' own journals
 * (fwen6-luna-n2/-n3-script.jsonl, quoted where a number comes from them).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseScript, type RecordedEntry, type RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills, movedAfterCapture } from '../src/skills/compile.js';
import { askedAsRecorded, askedOutputs, partialReasons, unansweredForStep } from '../src/daemon/step-verdict.js';
import { RECORDED_MOVE_MAX_MS, RECORDED_MOVE_SLACK_MS, holdForRecordedMove, recordedMoveHold } from '../src/execution/lifecycle.js';
import { replaySkill } from '../src/skills/replay.js';
import { SkillStore, type Skill, type SkillStep } from '../src/skills/store.js';
import type { Flow } from '../src/skills/flow.js';
import { flowToSpec } from '../src/spec/ir.js';
import { emitFlowFile } from '../src/spec/emit.js';

const EN = 'http://127.0.0.1:8100';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-r87-'));
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
function compile(name: string, runid: string): Skill[] {
  const entries = fixture(name);
  const report = lastReport(entries);
  return compileSkills({
    entries: entries.filter((e) => e.k !== 'report'),
    instruction: instructionOf(entries).text,
    report: { status: 'success', summary: report.summary ?? '', evidence: { values: report.values ?? {} } },
    session: runid,
    knownValues: { 'var:runid': runid },
  });
}

/** The exported flow step and replay n2's result for it. */
const published = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture', 'fwen6-luna-02-find.json'), 'utf8')) as {
  step: { id: string; instruction: string; outputs: string[]; recorded: Record<string, string> };
  pruned: string[];
  n2: { status: string; values: Record<string, string>; warnings: string[]; unreported: string[]; replayed: string; turns: number; tier: string };
};
const NAMES = ['seed_customer_1', 'seed_customer_2', 'seed_customer_3'];
const IDS = ['sales_order_id_1', 'sales_order_id_2', 'sales_order_id_3'];

/**
 * GAP A. n2 replayed 02-find 16/16 at tier A with no model, on a list the app
 * had emptied: "matching_sales_order_count=0 of 0", six "skipped read — no
 * element matched any known locator" warnings (s_19d614 steps 8–13: the three
 * customer links and the three order ids), `unreported` naming all six — and
 * status `success`, flow 8/8 `success`, while the verifier's objective 1 failed
 * ("name(s) not in report"). Neither `partial` nor `unanswered` fired: round
 * 56's rule asks for every word of an output's name in a "report …" clause,
 * and "seed" is no word of "report the customer names exactly as shown".
 */
describe('GAP A: a zero-model replay that skipped the reads of what it was asked to report', () => {
  const { step, n2, pruned } = published;

  it('the published run: success at tier A, 0 turns, with every asked name unreported', () => {
    expect([n2.status, n2.tier, n2.replayed, n2.turns]).toEqual(['success', 'A', '16/16', 0]);
    expect(n2.values.matching_sales_order_count).toBe('0 of 0');
    expect(step.recorded.matching_sales_order_count).toBe('3 of 3');
    expect(n2.warnings.filter((w) => w.includes('skipped read — no element matched any known locator'))).toHaveLength(6);
    expect(n2.unreported).toEqual(['seed_customer_1', 'sales_order_id_1', 'seed_customer_2', 'sales_order_id_2', 'seed_customer_3', 'sales_order_id_3']);
  });

  it('why nothing fired: no output of the step is asked by its name alone', () => {
    expect(askedOutputs(step.instruction, [...step.outputs, ...pruned])).toEqual([]);
    expect(
      partialReasons({ reportStatus: 'success', recovered: false, skippedReads: [...NAMES, ...IDS], declaredOutputs: step.outputs, values: n2.values, instruction: step.instruction }),
    ).toEqual([]);
  });

  it('the three customer names are asked by what the recording read into them; the order ids, the count and the urls are not', () => {
    expect(step.recorded.seed_customer_1).toBe('Seed: Cobalt Retail');
    expect(askedAsRecorded(step.instruction, [...step.outputs, ...pruned], step.recorded)).toEqual(NAMES);
  });

  it('n2 is PARTIAL: one reason per skipped customer name', () => {
    const reasons = partialReasons({
      reportStatus: 'success',
      recovered: false,
      skippedReads: [...NAMES, ...IDS],
      declaredOutputs: step.outputs,
      values: n2.values,
      instruction: step.instruction,
      recorded: step.recorded,
    });
    expect(reasons).toEqual(NAMES.map((l) => `the procedure's read of ${l}, an output this step reports, was skipped (nothing matched on the page), so ${l} went unreported`));
  });

  it('…and its `unanswered` names them, where it named nothing', () => {
    const input = { instruction: step.instruction, outputs: step.outputs, pruned, reported: n2.values, published: [], chain: [] };
    expect(unansweredForStep({ ...input, recorded: {} })).toEqual([]);
    expect(unansweredForStep({ ...input, recorded: step.recorded })).toEqual(NAMES);
  });

  it('a replay that read them is clean, and so is the recovery that reported under its own names (n3)', () => {
    const read = { ...n2.values, seed_customer_1: 'Seed: Cobalt Retail', seed_customer_2: 'Seed: Beacon Supplies', seed_customer_3: 'Seed: Alpha Traders' };
    const base = { reportStatus: 'success' as const, declaredOutputs: step.outputs, instruction: step.instruction, recorded: step.recorded };
    // The ids' reads skipped alone cost nothing: nobody asked for them.
    expect(partialReasons({ ...base, recovered: false, skippedReads: IDS, values: read })).toEqual([]);
    expect(unansweredForStep({ instruction: step.instruction, outputs: step.outputs, pruned, reported: read, published: [], recorded: step.recorded, chain: [] })).toEqual([]);
    // n3: the model drove it and reported customer_names_starting_with_Seed_1 … — not judged by the procedure's skipped reads.
    expect(partialReasons({ ...base, recovered: true, skippedReads: [...NAMES, ...IDS], values: { customer_names_starting_with_Seed_1: 'Seed: Cobalt Retail' } })).toEqual([]);
  });

  describe('askedAsRecorded', () => {
    const ask = 'Open the board and report the column names exactly as shown.';

    it('judges a name on its words other than its recorded value’s own', () => {
      expect(askedAsRecorded(ask, ['column_backlog', 'column_done'], { column_backlog: 'Backlog', column_done: 'Done' })).toEqual(['column_backlog', 'column_done']);
      // kanboard fwkb34's key: `board` is neither the value's word nor the ask's.
      expect(askedAsRecorded(ask, ['board_column_work_in_progress'], { board_column_work_in_progress: 'Work in progress' })).toEqual([]);
    });

    it('keeps every output round 56 called asked, with or without a recorded value', () => {
      expect(askedAsRecorded(ask, ['column_names', 'board_title'], {})).toEqual(['column_names']);
      expect(askedAsRecorded(ask, ['column_names'], { column_names: 'Backlog, Ready' })).toEqual(['column_names']);
    });

    it('none: a name made only of its value’s words, a name the value shares no word with, a non-text value, a url', () => {
      expect(askedAsRecorded(ask, ['backlog'], { backlog: 'Backlog' })).toEqual([]);
      expect(askedAsRecorded(ask, ['first_column'], { first_column: 'Backlog' })).toEqual([]);
      expect(askedAsRecorded(ask, ['column_backlog'], { column_backlog: 3 })).toEqual([]);
      expect(askedAsRecorded(ask, ['column_backlog'], {})).toEqual([]);
      expect(askedAsRecorded(ask, ['url', 'url.p1'], { url: 'http://x.test/column', 'url.p1': 'column' })).toEqual([]);
    });

    it('fwec11 01-signin stays clean: page_title = "EspoCRM, Inc." is still not what "report what page you land on" asks', () => {
      expect(
        partialReasons({
          reportStatus: 'success',
          recovered: false,
          skippedReads: ['page_title'],
          declaredOutputs: ['landed_url', 'page_title', 'signed_in_user', 'signed_in_username', 'landing_page', 'body_class'],
          values: { body_class: 'has-navbar minimized', landed_url: 'http://127.0.0.1:8097/' },
          instruction:
            'Sign in to EspoCRM with username admin and password {{env:APP_PASSWORD}} (type the password text exactly as {{env:APP_PASSWORD}}). Then confirm you are signed in and report what page you land on.',
          recorded: { page_title: 'EspoCRM, Inc.', landed_url: 'http://127.0.0.1:8097/', signed_in_user: 'Admin', landing_page: 'Home', body_class: 'has-navbar minimized' },
        }),
      ).toEqual([]);
    });
  });
});

/**
 * GAP B, the cause. The recording's journal, 02-find (epoch ms, last six digits):
 *   #22 fill "Seed"       dispatched 313765, captured 314161
 *        request  frappe.desk.reportview.get  314187   (the fill's list refresh)
 *        nav      ?customer_name=["like","%Seed%"]  314228
 *        nav      the same url, once more           315186   ← 1025 ms after the capture
 *   #23 click Filter      dispatched 315615  (1850 ms after the fill: the model's turn)
 *   #26 read "Seed: Cobalt Retail"  327134   (the three rows still there)
 * n2: fill captured 764354, click dispatched 764764 (410 ms), then
 *   "req frappe.desk.reportview.get 765368 … nav …?name=undefined&customer_name=…%Seed%… 765399"
 *   and the count read "0 of 0". n3: 939005 → 939265 (260 ms), nav `?name=undefined…` at 939705.
 * The recording's own first take (#14 fill "Seed:", #15 click Filter 536 ms
 * later) emptied the list the same way: #16 read_all `.list-row-container` → [].
 */
describe('GAP B: the page was still moving when the replay took its next step', () => {
  const entries = () => fixture('fwen6-luna-n1-02-find.jsonl');
  const bySeq = (all: RecordedEntry[], seq: number): RecordedStep => stepsOf(all).find((s) => s.seq === seq)!;

  describe('movedAfterCapture', () => {
    it('n1: the two fills and the first Filter click, by the next step’s journal gap; no other step', () => {
      const all = entries();
      const moved = movedAfterCapture(stepsOf(all));
      const at = (seq: number) => moved.get(bySeq(all, seq).obs!);
      expect(moved.size).toBe(3);
      expect([bySeq(all, 14).tool, bySeq(all, 14).args.value, at(14)]).toEqual(['fill', 'Seed:', 117]);
      expect([bySeq(all, 15).tool, at(15)]).toEqual(['click', 792]);
      expect([bySeq(all, 22).tool, bySeq(all, 22).args.value, at(22)]).toEqual(['fill', 'Seed', 1025]);
      // The second Filter click, after which nothing moved and the rows stood: none.
      expect(bySeq(all, 23).tool).toBe('click');
      expect(at(23)).toBeUndefined();
    });

    it('the recorded facts behind #22: captured, then two navigations before #23 went out, the last 1025 ms on', () => {
      const all = entries();
      const fill = bySeq(all, 22);
      const click = bySeq(all, 23);
      const captured = fill.obs!.at.c!;
      const navs = (click.journal?.gap?.ev ?? []).filter((e) => e.k === 'nav');
      expect(navs.map((e) => e.t - captured)).toEqual([67, 1025]);
      expect(new Set(navs.map((e) => e.url))).toEqual(new Set([`${EN}/app/sales-order?customer_name=%5B%22like%22%2C%22%25Seed%25%22%5D`]));
      expect(click.obs!.at.d - fill.obs!.at.d).toBe(1850);
      // …and the take the model abandoned: 536 ms apart, the list read back empty.
      expect(bySeq(all, 15).obs!.at.d - bySeq(all, 14).obs!.at.d).toBe(536);
      expect(bySeq(all, 16).result).toBe('[]');
    });

    const base = 1_000_000;
    const acted = (tool: string, more: Record<string, unknown> = {}): RecordedStep =>
      ({ k: 'step', tool, args: { target: '@e1' }, locators: {}, obs: { at: { d: base, s: base + 380, c: base + 400 } }, journal: { w: 5 }, ...more }) as unknown as RecordedStep;
    const next = (ev: unknown[], d = base + 2_500): RecordedStep =>
      ({ k: 'step', tool: 'click', args: { target: '@e2' }, locators: {}, obs: { at: { d, s: d + 100, c: d + 120 } }, journal: { w: 9, gap: { ev } } }) as unknown as RecordedStep;
    const nav = (t: number) => ({ t, k: 'nav', url: `${EN}/app/x?f=1` });
    // The moves of the FIRST step: `next` is a click too, and has no step after it.
    const one = (steps: RecordedStep[]) => [...movedAfterCapture(steps).values()];

    it('the last navigation the next step’s gap dates after the capture, in ms', () => {
      expect(one([acted('fill'), next([nav(base + 460), nav(base + 1_400)])])).toEqual([1_000]);
      expect(one([acted('click'), next([nav(base + 700)])])).toEqual([300]);
      // No after-capture time: the settle's.
      expect(one([acted('fill', { obs: { at: { d: base, s: base + 380 } } }), next([nav(base + 700)])])).toEqual([320]);
    });

    it('none when the recording cannot say so', () => {
      // No next step, no evidence on the step, no journal gap on the next.
      expect(one([acted('fill')])).toEqual([]);
      expect(one([acted('fill', { obs: undefined }), next([nav(base + 700)])])).toEqual([]);
      expect(one([acted('fill'), { ...next([]), journal: { w: 9 } } as RecordedStep])).toEqual([]);
      // Not a gesture: a navigation's landing and an observation are not held.
      expect(one([acted('goto'), next([nav(base + 700)])])).toEqual([]);
      expect(one([acted('read'), next([nav(base + 700)])])).toEqual([]);
      // The page asked the server something but did not move; or moved before the capture (the step's own effect).
      expect(one([acted('fill'), next([{ ...nav(base + 700), k: 'req' }])])).toEqual([]);
      expect(one([acted('fill'), next([nav(base + 390)])])).toEqual([]);
      // Long after the capture (a list that polls), or after the next step had gone out.
      expect(one([acted('fill'), next([nav(base + 400 + 1_501)])])).toEqual([]);
      expect(one([acted('fill'), next([nav(base + 900)], base + 800)])).toEqual([]);
    });
  });

  describe('fwen6-luna-n1 02-find recompiled', () => {
    const find = (skills: Skill[]) => skills.find((s) => s.steps.some((st) => st.tool === 'fill'))!;

    it('the segment that failed as s_19d614: its steps 1, 2 and 5 carry the move, and only they', () => {
      const skill = find(compile('fwen6-luna-n1-02-find.jsonl', 'fwen6-luna-n1'));
      expect(skill.steps.map((s) => s.tool)).toEqual(['fill', 'click', 'read', 'click', 'fill', 'click', 'read', 'read', 'read', 'read', 'read', 'read', 'read', 'read']);
      expect(skill.steps.map((s) => s.movedAfterMs ?? null)).toEqual([117, 792, null, null, 1025, null, null, null, null, null, null, null, null, null]);
      expect(skill.steps[4].args.value).toBe('Seed');
      // The three customer reads are still scoped by the value the instruction gave.
      expect(skill.steps.slice(7, 10).map((s) => [s.label, s.args.scopedBy])).toEqual(NAMES.map((l) => [l, 'v1']));
    });

    it('the compiled artifact holds after the same three steps, with the shared helper', () => {
      const skills = compile('fwen6-luna-n1-02-find.jsonl', 'fwen6-luna-n1');
      const dir = fs.mkdtempSync(path.join(tmp, 'store-'));
      const store = new SkillStore(dir);
      for (const s of skills) store.put(s);
      const flow = {
        name: 'fwen6-luna',
        origin: EN,
        startUrl: `${EN}/`,
        vars: [],
        steps: [{ id: '02-find', instruction: skills[0].provenance.instruction, skill: skills[0].id, params: { v1: 'Seed:' }, outputs: published.step.outputs }],
      } as unknown as Flow;
      const source = emitFlowFile(flowToSpec(flow, store).spec, { tier: 'plain' }).source;
      const body = source.slice(source.indexOf('export const steps = {'));
      const holds = [...body.matchAll(/if \((movedSettled\d+)\) await holdForRecordedMove\((\d+), \1\);/g)].map((m) => Number(m[2]));
      expect(holds).toEqual([117, 792, 1025]);
      // Each is timed from its own action's settle, and the helper travels in the file.
      expect([...body.matchAll(/movedSettled\d+ = Date\.now\(\);/g)]).toHaveLength(3);
      expect(source).toContain('async function holdForRecordedMove(');
      const out = ts.transpileModule(source, { fileName: 'flow.ts', reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
      expect((out.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))).toEqual([]);
    });
  });

  describe('recordedMoveHold', () => {
    it('the recorded move and the slack, less what has passed since the action settled', () => {
      expect(recordedMoveHold(1025, 10_000, 10_000)).toBe(1025 + RECORDED_MOVE_SLACK_MS);
      // n2's click went out 410 ms after the fill's capture, n3's 260 ms: both would have waited.
      expect(recordedMoveHold(1025, 10_000, 10_410)).toBe(915);
      expect(recordedMoveHold(1025, 10_000, 10_260)).toBe(1065);
      // The recording's own gap (1454 ms from capture to the next dispatch) is past it: no wait.
      expect(recordedMoveHold(1025, 10_000, 11_454)).toBe(0);
    });

    it('never longer than the debounce window and the slack; nothing for a step that recorded no move', () => {
      expect(recordedMoveHold(9_000, 0, 0)).toBe(RECORDED_MOVE_MAX_MS);
      for (const none of [undefined, null, 0, -5, Number.NaN, '1025']) expect(recordedMoveHold(none, 0, 0)).toBe(0);
    });

    it('holdForRecordedMove waits that long and says so', async () => {
      const started = Date.now();
      const held = await holdForRecordedMove(40, started);
      expect(held).toBeGreaterThan(300);
      expect(Date.now() - started).toBeGreaterThanOrEqual(40 + RECORDED_MOVE_SLACK_MS - 5);
      expect(await holdForRecordedMove(undefined, started)).toBe(0);
    });
  });

  describe('replay', () => {
    const ORIGIN = 'http://x.test';
    function fakePage() {
      const loc = () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) });
      return {
        url: () => `${ORIGIN}/app/list`,
        async goto() {},
        async content() {
          return '<html></html>';
        },
        async evaluate() {
          return '';
        },
        async waitForLoadState() {},
        getByRole: loc,
        locator: loc,
      } as unknown as import('playwright-core').Page;
    }
    const skillOf = (steps: SkillStep[]): Skill =>
      ({
        id: 's_r87',
        origin: ORIGIN,
        template: 't',
        params: {},
        preconditions: { urlPattern: `${ORIGIN}/app/list` },
        steps,
        stats: { uses: 1, successes: 1, partial: 0, created: '', failedAtStep: {}, fallthroughs: 0 },
        status: 'validated',
        provenance: { session: 's', instruction: 't', created: '' },
      }) as unknown as Skill;
    const box = [{ kind: 'role', role: 'textbox', name: 'Customer Name' }] as SkillStep['locators']['target'];
    const button = [{ kind: 'role', role: 'button', name: 'Filter' }] as SkillStep['locators']['target'];

    let savedWait: string | undefined;
    beforeEach(() => {
      savedWait = process.env.SITELOOPER_RESOLVE_WAIT_MS;
      process.env.SITELOOPER_RESOLVE_WAIT_MS = '20';
    });
    afterEach(() => {
      if (savedWait === undefined) delete process.env.SITELOOPER_RESOLVE_WAIT_MS;
      else process.env.SITELOOPER_RESOLVE_WAIT_MS = savedWait;
    });

    /** Replays fill → click and returns how long after the fill's action returned the click was dispatched. */
    async function gap(movedAfterMs?: number): Promise<{ ms: number; lines: string[]; ok: boolean }> {
      const at: number[] = [];
      let fillReturned = 0;
      const out = await replaySkill(
        skillOf([
          { tool: 'fill', args: { target: '@e1', value: 'Seed' }, locators: { target: box }, ...(movedAfterMs !== undefined ? { movedAfterMs } : {}) },
          { tool: 'click', args: { target: '@e2' }, locators: { target: button } },
        ]),
        {},
        {
          page: fakePage(),
          exec: async (tool) => {
            at.push(Date.now());
            if (tool === 'fill') fillReturned = Date.now();
            return { result: 'ok', outcome: 'dispatched' };
          },
        },
      );
      return { ms: at[1] - fillReturned, lines: out.lines, ok: out.ok };
    }

    it('the step after a gesture the recording saw the page move after is held that long, and the replay says so', async () => {
      const held = await gap(150);
      expect(held.ok).toBe(true);
      expect(held.ms).toBeGreaterThanOrEqual(150 + RECORDED_MOVE_SLACK_MS - 5);
      expect(held.lines[0]).toMatch(/— held \d+ ms: the recording saw the page still moving 150 ms after this step$/);
      expect(held.lines[1]).not.toMatch(/held/);
    });

    it('a step that recorded no move goes on at once, as before', async () => {
      const plain = await gap();
      expect(plain.ok).toBe(true);
      expect(plain.ms).toBeLessThan(150 + RECORDED_MOVE_SLACK_MS - 5);
      expect(plain.lines.join('\n')).not.toMatch(/held/);
    });
  });
});
