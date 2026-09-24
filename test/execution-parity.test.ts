/**
 * Differential harness: one procedure, two runners.
 *
 * Nearly every correctness finding in notes/CORRECTNESS_PLAN.md is a place where
 * daemon replay and the emitted Playwright artifact disagree — replay
 * advances a cursor where the spec calls `.first()`; replay has a progress
 * guard the spec had nothing like; a gate applies on one side and not the
 * other. Reviewing for those one at a time finds the ones somebody thought
 * to look for. Running the same contract through both against the same
 * application, and comparing what the APPLICATION says happened, finds them
 * mechanically.
 *
 * The oracle is deliberately not either runner's own report: the fixture
 * server keeps a mutation log that only it can write, so "both runners said
 * ok" can never stand in for "the right thing happened once".
 *
 * Opt-in on its own switch, BP_PARITY_TESTS=1 (`npm run test:parity`), not
 * with the other browser suites: a full run takes about nine minutes, so it
 * runs from time to time and before a change to shared execution is trusted,
 * not on every test run.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { executeTool } from '../src/agent/tools.js';
import { BrowserSession } from '../src/daemon/browser.js';
import { presentOnPage } from '../src/execution/snapshot.js';
import { recordedValueShown } from '../src/execution/snapshot.js';
import { recordedStandIn } from '../src/skills/flow.js';
import { fingerprintPage } from '../src/execution/fingerprint.js';
import { SOFT_MATCH_MIN_SIMILARITY, fillableChain, unfilledStepVerdict } from '../src/execution/gates.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';
import { goalSatisfied, type ReplayResult } from '../src/skills/replay.js';
import { replayReport } from '../src/skills/learn.js';
import { consumedReportedOutputs, ignorableRefs, resolveInstruction, resolveStepParams, type FlowStep } from '../src/skills/flow.js';
import type { Skill, SkillParam, SkillStep } from '../src/skills/store.js';
import type { LocatorCandidate, RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { captureReadBack, coreReadBack, selectionReadBack, visibleTextsWithin } from '../src/daemon/recorder.js';
import { pinPart } from '../src/agent/readback.js';
import { flattenContainedComposite, flattenProvenComposite, planContainedParts, type Report } from '../src/agent/report.js';
import { compileSkills } from '../src/skills/compile.js';
import { FIXTURE_TOTP_SEED, createFixtureServer, type FixtureServer } from './fixture/server.js';
import { hotpCode, totpSeed } from '../src/execution/totp.js';

const enabled = process.env.BP_PARITY_TESTS === '1';
const d = enabled ? describe : describe.skip;

/** What the emitted module exposes that the harness drives directly. */
interface FlowModule {
  FLOW: SpecFlow;
  flowStepIds: readonly string[];
  createFlowRun(): { outputs: Record<string, string | undefined>; drift: string[]; echoed: string[]; created: string[] };
  steps: Record<
    string,
    (page: unknown, p: Record<string, string>, outputs: Record<string, string | undefined>, run: { outputs: Record<string, string | undefined>; drift: string[]; echoed: string[]; created: string[] }) => Promise<void>
  >;
  runFlow(page: unknown, vars: Record<string, string>, options?: { startUrl?: string }): Promise<Record<string, string | undefined>>;
}

/** One run's verdict, in the shape both sides can be compared in. */
interface Outcome {
  ok: boolean;
  reason: string | null;
  outputs: Record<string, string>;
  /** Labels of reads that only echoed what the procedure set (replay's echoedValues; the artifact's run.echoed, step prefix stripped). */
  echoed?: string[];
  /** Record identifiers the run minted (replay's created; the artifact's run.created). */
  created?: string[];
  /** Steps that stood on a fallback after a better candidate failed (replay misses with a used locator; the artifact run.drift lines). */
  drift?: string[];
  /** What replay knows about its last state-changing action (ReplayResult.outcome). The artifact reports it in its error only. */
  outcome?: string;
  /** The run's warnings (replay's warnings; the artifact's `[sitelooper warn]` lines, prefix stripped). */
  warnings?: string[];
}

d('execution parity (daemon replay vs emitted artifact)', () => {
  let fx: FixtureServer;
  let origin: string;
  let home: string;
  let emitDir: string;
  let previousComponentsFile: string | undefined;

  beforeAll(async () => {
    fx = await createFixtureServer(10);
    origin = fx.origin;

    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-parity-'));
    process.env.SITELOOPER_HOME = home;
    process.env.SITELOOPER_SKILLS_DIR = path.join(home, 'skills');
    // The daemon's component store reads $SITELOOPER_COMPONENTS_FILE BEFORE
    // the home: a developer's or CI's own store (demoted seeds, learned
    // variants) must not decide what the daemon runs while the artifact runs
    // the seeds. A file inside this run's own temp home, fresh every run.
    previousComponentsFile = process.env.SITELOOPER_COMPONENTS_FILE;
    process.env.SITELOOPER_COMPONENTS_FILE = path.join(home, 'components.json');
    // The emitted module imports '@playwright/test', so it has to load from
    // somewhere node resolves the repo's node_modules.
    emitDir = fs.mkdtempSync(path.resolve('test/.parity-'));
    // See moduleOf: only `test.step` is stubbed, and only because it needs a
    // Playwright worker. Wrapping is all it does there, so running the callback
    // inline is what it means outside one.
    fs.writeFileSync(
      path.join(emitDir, 'pw-shim.mjs'),
      "export { expect } from '@playwright/test';\nexport const test = { step: async (_name, fn) => await fn() };\n",
    );
  }, 60_000);

  afterAll(async () => {
    await fx?.close();
    delete process.env.SITELOOPER_HOME;
    delete process.env.SITELOOPER_SKILLS_DIR;
    if (previousComponentsFile === undefined) delete process.env.SITELOOPER_COMPONENTS_FILE;
    else process.env.SITELOOPER_COMPONENTS_FILE = previousComponentsFile;
    fs.rmSync(home, { recursive: true, force: true });
    expect(path.basename(emitDir)).toMatch(/^\.parity-/);
    fs.rmSync(emitDir, { recursive: true, force: true });
  });

  const reset = (n: number) => fx.reset(n);
  beforeEach(() => reset(10));

  /** The one contract both runners execute. */
  const deleteLoop = (max: number, scope: 'observed' | 'drain' = 'drain'): SkillStep[] => {
    const target = [{ kind: 'role' as const, role: 'button', name: 'Remove' }];
    return [{ tool: 'loop', args: {}, locators: {}, body: [{ tool: 'click', args: { target: '@e1' }, locators: { target } }], while: target, max, scope }];
  };

  const skillOf = (steps: SkillStep[]): Skill => ({
    id: 's_parity',
    origin,
    template: 'clear the list',
    params: {},
    preconditions: { urlPattern: `${origin}/` },
    steps,
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'validated',
    provenance: { session: 'parity', instruction: 'clear the list', created: 't' },
  });

  const specOf = (steps: SkillStep[]): SpecFlow => ({
    version: 1,
    name: 'parity',
    origin,
    startUrl: `${origin}/`,
    vars: [],
    steps: [
      {
        id: '01-clear',
        instruction: 'clear the list',
        params: {},
        outputs: [],
        segments: [{ id: 's_parity', template: 'clear the list', params: {}, preconditions: { urlPattern: `${origin}/` }, steps }],
      },
    ],
  });

  /**
   * A flow whose segment carries both an identity and a goal, which is what
   * makes the emitter reach for the already-satisfied guard — and so for the
   * scope check the guard is built on. Nothing here is executed; the flow
   * exists to make the artifact carry that helper so it can be run directly.
   */
  const scopeFlow = (): SpecFlow => {
    const click: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Cancel' }] } };
    return {
      version: 1,
      name: 'parity-scope',
      origin,
      startUrl: `${origin}/`,
      vars: [],
      steps: [
        {
          id: '01-cancel',
          instruction: 'cancel the order {{v1}}',
          params: { v1: 'S00039' },
          outputs: ['order_status'],
          segments: [
            {
              id: 's_scope',
              template: 'cancel {{v1}}',
              params: { v1: { example: 'S00039', usedIn: [1], known: true } },
              preconditions: { urlPattern: `${origin}/`, requireText: ['{{v1}}'] },
              goal: { requireText: ['Cancelled'] },
              report: { summary: 'cancelled {{v1}}', values: { order_status: 'Cancelled' } },
              steps: [click],
            },
          ],
        },
      ],
    };
  };

  /**
   * C02. A SELF-NAVIGATING procedure: step 1 is the recorded goto, so the
   * recorded url carries the RECORDING run's record id — here rec-42, while
   * this run is about rec-77.
   */
  const RECORDED = 'rec-42';
  const MARK: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Mark' }] } };
  const selfNavSteps = (url: string): SkillStep[] => [{ tool: 'goto', args: { url }, locators: {} }, MARK];

  const recordSkill = (url: string): Skill => ({
    ...skillOf(selfNavSteps(url)),
    id: 's_record',
    template: 'mark record {{v1}}',
    params: { v1: { example: RECORDED, usedIn: [1], known: true } },
    preconditions: { urlPattern: `${origin}/record/:id`, requireText: ['Record {{v1}}'] },
  });

  const recordFlow = (url: string): SpecFlow => ({
    version: 1,
    name: 'parity-record',
    origin,
    startUrl: `${origin}/`,
    vars: [],
    steps: [
      {
        id: '01-mark',
        instruction: 'mark record {{v1}}',
        params: { v1: RECORDED },
        outputs: [],
        segments: [
          {
            id: 's_record',
            template: 'mark record {{v1}}',
            params: { v1: { example: RECORDED, usedIn: [1], known: true } },
            preconditions: { urlPattern: `${origin}/record/:id`, requireText: ['Record {{v1}}'] },
            steps: selfNavSteps(url),
          },
        ],
      },
    ],
  });

  /**
   * A hook on the page a leg is about to run on, before anything navigates —
   * for the one class of case the fixture server cannot express (a request the
   * network never answers) and for scaling a runner's own timeout down to
   * something a suite can wait for. Used by both legs, so whatever it does is
   * done to both.
   */
  type PageHook = (page: Awaited<ReturnType<BrowserSession['getPage']>>) => Promise<void>;

  /** Run a whole procedure through daemon replay, in its own browser session. */
  async function replayOf(skill: Skill, params: Record<string, string> = {}, onPage?: PageHook): Promise<Outcome> {
    const session = new BrowserSession({ session: `parity-replay-${Date.now()}`, persist: false, learn: true });
    try {
      const page = await session.getPage();
      if (onPage) await onPage(page);
      await page.goto(`${origin}/`);
      session.learn!.put(skill);
      const out = await executeTool(session, 'run_skill', { id: skill.id, params }, os.tmpdir());
      const replay = out.replay as ReplayResult | undefined;
      // No replay at all means the tool refused before running: surface that
      // rather than letting it read as an ordinary failure.
      if (!replay) return { ok: false, reason: `run_skill returned no replay: ${out.result}`, outputs: {}, echoed: [] };
      return { ok: replay.ok, reason: replay.reason ?? null, outputs: replay.values, echoed: replay.echoedValues, created: replay.created, drift: replay.misses.filter((m) => m.used).map((m) => m.step), outcome: replay.outcome, warnings: replay.warnings };
    } finally {
      await session.close();
    }
  }

  /**
   * Run the same contract through the artifact the compiler emits. Not
   * `runFlow`, which wraps each step in `test.step` and so needs a Playwright
   * worker: the harness drives `steps[id]` itself, which is the same emitted
   * body and keeps the comparison to one process.
   */
  /**
   * The emitted file, compiled and loaded. `test` is the only thing the
   * artifact uses that needs a Playwright worker, and it uses it for exactly
   * one thing — `test.step` around each call site — so it is shimmed and
   * everything else (the real `expect`, `expect.poll`) is the genuine article.
   * That is what lets `runFlow` itself be driven here, argument binding
   * included, rather than only the step bodies.
   */
  async function moduleOf(spec: SpecFlow): Promise<FlowModule> {
    const { source } = emitFlowFile(spec, { tier: 'plain' });
    const js = ts
      .transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      })
      .outputText.replace("from '@playwright/test'", "from './pw-shim.mjs'");
    const file = path.join(emitDir, `flow-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
    fs.writeFileSync(file, js);
    return (await import(`file://${file.split(path.sep).join('/')}`)) as FlowModule;
  }

  async function emittedOf(spec: SpecFlow, params: Record<string, string> = {}, onPage?: PageHook): Promise<Outcome> {
    const mod = await moduleOf(spec);

    const session = new BrowserSession({ session: `parity-spec-${Date.now()}`, persist: false });
    // The artifact's warnings go to the console — on STDOUT, so a killed run
    // still carries them (src/spec/emit.ts logWarning); keep them for the outcome.
    const warnings: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => {
      const line = args.map(String).join(' ');
      if (line.startsWith('[sitelooper warn] ')) warnings.push(line.slice('[sitelooper warn] '.length));
      log(...args);
    };
    try {
      const page = await session.getPage();
      if (onPage) await onPage(page);
      await page.goto(mod.FLOW.startUrl);
      const run = mod.createFlowRun();
      for (const id of mod.flowStepIds) {
        await mod.steps[id](page, params, run.outputs, run);
      }
      return { ok: true, reason: null, outputs: run.outputs as Record<string, string>, echoed: run.echoed.map((key) => key.slice(key.indexOf('.') + 1)), created: run.created, drift: [...run.drift], warnings };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err), outputs: {}, echoed: [], warnings };
    } finally {
      console.log = log;
      await session.close();
    }
  }

  /**
   * The artifact's helper block — everything between DRIFT and `steps`, the
   * embedded shared modules included — made callable, so a gate can be run
   * from the artifact against a real DOM rather than read as text. Nothing is
   * cut out of context: a helper runs against the very lineShows /
   * identitySource / scopeCheckInPage it will run against in a consumer's
   * Playwright project. (An earlier cut of this harness regex-cut single
   * functions and rebuilt them; a helper cut in isolation fails closed and
   * reads as a pass.)
   */
  function emittedHelpers(spec: SpecFlow): Record<string, (...args: unknown[]) => Promise<unknown>> {
    const { source } = emitFlowFile(spec, { tier: 'plain' });
    const block = /export const DRIFT: string\[\] = \[\];\n([\s\S]*?)\nexport const steps = \{/.exec(source);
    if (!block) throw new Error('helper block not found in the emitted source');
    const js = ts.transpileModule(block[1], { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const names = [...block[1].matchAll(/^(?:async )?function (\w+)/gm)].map((m) => m[1]);
    const build = new Function('DRIFT', 'console', `${js}\nreturn { ${names.join(', ')} };`) as (
      d: string[],
      c: unknown,
    ) => Record<string, (...args: unknown[]) => Promise<unknown>>;
    return build([], { warn: () => {}, log: () => {} });
  }

  /**
   * The whole emitted flow, driven through its own `runFlow` — call sites
   * included. `emittedOf` deliberately calls `steps[id]` itself, which skips
   * the argument binding; a defect that lives in the BINDING is invisible to
   * it, so this case needs the real thing.
   */
  async function emittedFlowOf(spec: SpecFlow, vars: Record<string, string> = {}): Promise<Outcome> {
    const mod = await moduleOf(spec);
    const session = new BrowserSession({ session: `parity-flow-${Date.now()}`, persist: false });
    try {
      const page = await session.getPage();
      const outputs = await mod.runFlow(page, vars, { startUrl: mod.FLOW.startUrl });
      return { ok: true, reason: null, outputs: outputs as Record<string, string> };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err), outputs: {}, echoed: [] };
    } finally {
      await session.close();
    }
  }

  /**
   * Two flow steps through DAEMON replay, with the flow runner's own
   * consumption gate between them.
   *
   * The gate is server.ts:1009-1024 verbatim in shape and in the functions it
   * calls — resolveInstruction / resolveStepParams / ignorableRefs are the
   * daemon's, not a restatement. What is not reproduced is what the daemon
   * does AFTER classifying a reference as blocking: it sends the step to
   * recovery on the strong model, which no offline suite can run. That is the
   * point being compared anyway — a blocking reference means the pinned
   * procedure does not replay, and the mutation log is what proves it didn't.
   */
  async function replayFlowOf(
    producer: Skill,
    consumer: Skill,
    step: FlowStep,
  ): Promise<{ outcome: Outcome; blocking: string[] }> {
    const first = await replayOf(producer);
    // Keyed by the producing step exactly as the flow runner keys them — the
    // values are whatever the producer's replay actually published, which for
    // a skipped read is nothing at all.
    const outputs = { '01-read': first.outputs };
    const { missing } = resolveInstruction(step, {}, outputs);
    const bound = resolveStepParams(step, {}, outputs);
    const allMissing = [...missing, ...(bound?.missing ?? [])];
    // The whole segment chain, as the daemon passes it: a slot unused by the
    // head but typed by a later segment is NOT ignorable (fwod56). These
    // fixtures are single-segment, so the chain is the consumer itself.
    const ignorable = ignorableRefs(allMissing, step, [consumer]);
    const blocking = allMissing.filter((r) => !ignorable.includes(r));
    if (blocking.length) {
      return {
        outcome: {
          ok: false,
          reason: `${step.id}: ${blocking.join(', ')} unresolved and used by the pinned procedure — the zero-model replay is skipped`,
          outputs: first.outputs,
        },
        blocking,
      };
    }
    return { outcome: await replayOf(consumer, bound?.params ?? {}), blocking };
  }

  /**
   * G03. The consuming step is the one that must stop.
   *
   * 01-read's locators miss, so the read is skipped and its value is left
   * empty — right on both runners, and not what is on trial. 02-mark then
   * binds a USED slot to `{{01-read.x}}`: replay classifies that reference as
   * blocking (ignorableRefs: the slot IS used) and never replays the pinned
   * procedure, while the artifact used to resolve it to `''`, navigate to
   * `/record/` with an empty id segment, mark whatever was there and report
   * success — fwgr27's failure exactly.
   *
   * The mutation log is the oracle: no `visit:` and no `mark:` means 02-mark
   * did not run at all, which no runner's own report can establish about
   * itself.
   */
  const readStep = (selector: string): SkillStep => ({
    tool: 'read',
    args: { target: '@e1', what: 'text' },
    locators: { target: [{ kind: 'id', selector }] },
    label: 'x',
  });
  // A second read that always resolves: the producer is then not a read-only
  // procedure that observed NOTHING (observedNothing, which fails it on both
  // runners before 02-mark is asked) — what is on trial here is only that a
  // missed value is never used.
  const seenStep: SkillStep = { tool: 'read', args: { target: '@e2', what: 'text' }, locators: { target: [{ kind: 'id', selector: '#target' }] }, label: 'seen' };
  // A function, not a constant: `origin` is only known once the fixture server
  // is listening, which is beforeAll — after this describe body has run.
  const markStep = (): SkillStep[] => [{ tool: 'goto', args: { url: `${origin}/record/{{v1}}` }, locators: {} }, MARK];

  const readSkill = (selector: string): Skill => ({
    ...skillOf([readStep(selector), seenStep]),
    id: 's_read',
    template: 'read the target',
  });
  const markSkill = (): Skill => ({
    ...skillOf(markStep()),
    id: 's_mark',
    template: 'mark record {{v1}}',
    params: { v1: { example: 'Item 9', usedIn: [1], known: true } },
  });
  const markFlowStep = (): FlowStep => ({
    id: '02-mark',
    instruction: 'mark record {{01-read.x}}',
    skill: 's_mark',
    params: { v1: '{{01-read.x}}' },
    outputs: [],
    recorded: {},
  });

  const readMarkFlow = (selector: string): SpecFlow => ({
    version: 1,
    name: 'parity-need',
    origin,
    startUrl: `${origin}/`,
    vars: [],
    steps: [
      {
        id: '01-read',
        instruction: 'read the target',
        params: {},
        outputs: ['x'],
        segments: [{ id: 's_read', template: 'read the target', params: {}, preconditions: { urlPattern: `${origin}/` }, steps: [readStep(selector), seenStep] }],
      },
      {
        id: '02-mark',
        instruction: 'mark record {{01-read.x}}',
        params: { v1: '{{01-read.x}}' },
        outputs: [],
        segments: [
          {
            id: 's_mark',
            template: 'mark record {{v1}}',
            params: { v1: { example: 'Item 9', usedIn: [1], known: true } },
            preconditions: { urlPattern: `${origin}/` },
            steps: markStep(),
          },
        ],
      },
    ],
  });

  it('neither runner binds a used slot to a value the producing read never captured', async () => {
    reset(2);
    const { outcome: replay, blocking } = await replayFlowOf(readSkill('#nope'), markSkill(), markFlowStep());
    const replayLog = [...fx.log];
    reset(2);
    const emitted = await emittedFlowOf(readMarkFlow('#nope'));
    const emittedLog = [...fx.log];

    // Replay's own classification: the slot is used, so the reference blocks.
    // Once from the instruction and once from the param binding, as the
    // daemon's own `allMissing` collects them.
    expect([...new Set(blocking)]).toEqual(['01-read.x']);

    // The oracle first: nothing of 02-mark ran on either side — no navigation
    // to the empty record id, and no mutation. A verdict is a runner's opinion
    // of itself; this is the application's account of what happened.
    expect(replayLog, 'replay must not replay a procedure whose used slot is blank').toEqual([]);
    expect(emittedLog, 'the artifact must not run 02-mark with a blank slot').toEqual([]);

    expect(replay.ok).toBe(false);
    expect(emitted.ok).toBe(false);
    expect(replay.reason).toContain('01-read.x');
    expect(emitted.reason).toContain('01-read.x');
    expect(emitted.reason).toContain('02-mark');
  }, 120_000);

  /**
   * Without this the case above is satisfied by a check that always refuses.
   * The same two steps with a read that resolves: the value threads through,
   * and both runners do the work on THAT record, once.
   */
  it('both runners proceed when the producing read did capture the value', async () => {
    reset(2);
    const { outcome: replay, blocking } = await replayFlowOf(readSkill('#target'), markSkill(), markFlowStep());
    const replayLog = [...fx.log];
    reset(2);
    const emitted = await emittedFlowOf(readMarkFlow('#target'));
    const emittedLog = [...fx.log];

    expect([...new Set(blocking)]).toEqual([]);
    expect(replay.ok, replay.reason ?? '').toBe(true);
    expect(emitted.ok, emitted.reason ?? '').toBe(true);
    expect(replayLog).toEqual(['visit:Item 2', 'mark:Item 2']);
    expect(emittedLog).toEqual(['visit:Item 2', 'mark:Item 2']);
  }, 120_000);

  /**
   * fwrd54 07-edit. The producing read misses again, but the consuming
   * procedure uses its slot only as the NAME of a button it clicks, recorded
   * "Remove" — the evidence (recordedStandIn's slotNamesControl) that the value
   * is the app's vocabulary, not record data — and the page the consumer starts
   * from shows it. Both runners resolve the reference to it (recordedStandIn,
   * then recordedValueShown against the live page), bank it, and click once.
   * The 'Item 9' case above stays a stop on both: there the slot is navigated
   * by (a goto url), which is data, so no stand-in is offered at all.
   *
   * The daemon half is runFlow's stand-in pass in the functions it calls, run
   * against a fresh page at the start url (where replayOf starts the consumer).
   */
  it('both runners resolve an unpublished control label to its recorded value when the page shows it', async () => {
    const pressSteps = (): SkillStep[] => [{ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: '{{v1}}' }] } }];
    const pressParams = (): Record<string, SkillParam> => ({ v1: { example: 'Remove', usedIn: [1], known: true } });
    const pressSkill = (): Skill => ({ ...skillOf(pressSteps()), id: 's_press', template: 'press {{v1}}', params: pressParams() });
    const pressStep: FlowStep = { id: '02-press', instruction: 'press {{01-read.x}}', skill: 's_press', params: { v1: '{{01-read.x}}' }, outputs: [], recorded: {} };
    const pressFlow = (): SpecFlow => {
      const flow = readMarkFlow('#nope');
      flow.steps[1] = {
        id: '02-press',
        instruction: 'press {{01-read.x}}',
        params: { v1: '{{01-read.x}}' },
        outputs: [],
        segments: [{ id: 's_press', template: 'press {{v1}}', params: pressParams(), preconditions: { urlPattern: `${origin}/` }, steps: pressSteps() }],
      };
      return flow;
    };

    reset(1);
    const first = await replayOf(readSkill('#nope'));
    const outputs: Record<string, Record<string, string>> = { '01-read': first.outputs };
    const standIn = recordedStandIn('01-read.x', pressStep.params, [pressSkill()], { recorded: undefined, differed: false });
    expect(standIn).toBe('Remove');
    const session = new BrowserSession({ session: `parity-standin-${Date.now()}`, persist: false });
    try {
      const page = await session.getPage();
      // The list page renders its rows from `fetch('/items')` AFTER `load`,
      // so a look taken the moment goto resolves can precede them: the first
      // cloud run of round 51 failed exactly so (both refs unresolved). The
      // runners never ask that early — runFlow's stand-in pass and the
      // artifact's needShown run on a page the previous step already settled
      // — so the harness waits for the fixture's own rows first, not for the
      // value under test. The delay makes the late render certain here.
      fx.faults.delay(1500, { pathPrefix: '/items' });
      await page.goto(`${origin}/`);
      await page.locator('#items li').first().waitFor({ timeout: 10_000 });
      if (await recordedValueShown(page, standIn!, [])) outputs['01-read'] = { ...outputs['01-read'], x: standIn! };
    } finally {
      await session.close();
    }
    const bound = resolveStepParams(pressStep, {}, outputs);
    const allMissing = [...resolveInstruction(pressStep, {}, outputs).missing, ...(bound?.missing ?? [])];
    expect(allMissing).toEqual([]);
    const replay = await replayOf(pressSkill(), bound?.params ?? {});
    const replayLog = [...fx.log];

    reset(1);
    const emitted = await emittedFlowOf(pressFlow());
    const emittedLog = [...fx.log];

    expect(replay.ok, replay.reason ?? '').toBe(true);
    expect(emitted.ok, emitted.reason ?? '').toBe(true);
    expect(replayLog).toEqual(['delete:Item 1']);
    expect(emittedLog).toEqual(['delete:Item 1']);
    expect(outputs['01-read'].x).toBe('Remove');
    expect(emitted.outputs['01-read.x']).toBe('Remove');
  }, 120_000);

  /**
   * fwrd86 06-delete. The report template filled this run's ticket id into
   * text the RECORDING saw — "Showing 1–10 of 13", "Created: 2026-09-23" — and
   * both replays published it as their own finding. Here the list is the
   * app's state (fixture /tickets: the count is the collection's size, the
   * date `listing.date`), and the template carries the recording's figures
   * around `{{v1}}`. When the page shows them both runners publish them; when
   * the app has moved on (a day later, three more tickets) both decline them,
   * and neither ever publishes the recording's text. The live read publishes
   * on both either way.
   *
   * The daemon half is the flow runner's own assembly (replayReport, after
   * run_skill's replay), run against the page the replay ended on.
   */
  /**
   * fwec8 02-create: the save segment minted the record id into the url
   * (derived d1), the TAIL segment reported it — and stored the recording's
   * id as a literal, so no replay ever published the one value the
   * instruction asked for. Now the tail's template says `{{d1}}`, and both
   * runners fill it with THIS run's id: the daemon threads derived values
   * across segments ({ ...match.params, ...derived }), the artifact keeps one
   * `p` per step. `"Mark ({{d1}})"` carries round 53's punctuation case too
   * (fwec8 close_date "Dec 31 ({{v5}})"): the page shows the word "Mark",
   * never "Mark (".
   */
  it('both runners publish a minted id the chain derived, in the tail’s report, with the live value', async () => {
    const derived = { d1: { step: 1, at: 'p1', example: 'rec-42' } };
    const values = { record_id: '{{d1}}', record_url: `${origin}/record/{{d1}}`, action: 'Mark ({{d1}})' };
    const head: Skill = { ...skillOf([{ tool: 'goto', args: { url: `${origin}/record/current-run` }, locators: {} }]), id: 's_mint0', template: 'create a record', derived, contract: 4 };
    const tail: Skill = { ...skillOf([MARK]), id: 's_mint1', template: 'create a record', preconditions: { urlPattern: `${origin}/record/{{d1}}` }, reportTemplate: { summary: '', values } };
    const spec: SpecFlow = {
      version: 1,
      name: 'parity-mint',
      origin,
      startUrl: `${origin}/`,
      vars: [],
      steps: [
        {
          id: '02-create',
          instruction: 'create a record',
          params: {},
          outputs: Object.keys(values),
          segments: [
            { id: head.id, template: head.template, params: {}, preconditions: head.preconditions, steps: head.steps, derived },
            { id: tail.id, template: tail.template, params: {}, preconditions: tail.preconditions, steps: tail.steps, report: { summary: '', values } },
          ],
        },
      ],
    };

    // The daemon: the chain as replayDirect walks it, then its report.
    reset(0);
    const session = new BrowserSession({ session: `parity-mint-${Date.now()}`, persist: false, learn: true });
    let daemon: Record<string, string> = {};
    try {
      const page = await session.getPage();
      await page.goto(`${origin}/`);
      session.learn!.put(head);
      session.learn!.put(tail);
      const threaded: Record<string, string> = {};
      let last: ReplayResult | undefined;
      for (const skill of [head, tail]) {
        const out = await executeTool(session, 'run_skill', { id: skill.id, params: { ...threaded } }, os.tmpdir());
        last = out.replay as ReplayResult;
        expect(last?.ok, last?.reason ?? String(out.result)).toBe(true);
        Object.assign(threaded, last.derivedValues ?? {});
      }
      const r = await replayReport(() => session.getPage(), tail, threaded, last!.values);
      daemon = r.report.evidence?.values as Record<string, string>;
    } finally {
      await session.close();
    }
    reset(0);
    const emitted = await emittedOf(spec, {});
    expect(emitted.ok, emitted.reason ?? '').toBe(true);
    const artifact = Object.fromEntries(Object.entries(emitted.outputs).filter(([k]) => k.startsWith('02-create.')).map(([k, v]) => [k.slice('02-create.'.length), v]));

    const want = { record_id: 'current-run', record_url: `${origin}/record/current-run`, action: 'Mark (current-run)' };
    expect(daemon).toEqual(want);
    expect(artifact).toEqual(want);
  }, 120_000);

  /**
   * Round 57, kanboard fwkb41: a record id minted into the ordinary query
   * string (`?task_id=4`) is derived at `q.task_id`, which urlPart now reads
   * from the query when the hash has no such key. Both runners bind the
   * derived value and publish it with the live id.
   */
  it('both runners derive and publish a minted id from a query-string position', async () => {
    const derived = { d1: { step: 1, at: 'q.rid', example: 'rec-42' } };
    const values = { record_id: '{{d1}}' };
    const head: Skill = { ...skillOf([{ tool: 'goto', args: { url: `${origin}/record/current-run?rid=current-run` }, locators: {} }]), id: 's_qmint0', template: 'create a record', derived, contract: 4 };
    const tail: Skill = { ...skillOf([MARK]), id: 's_qmint1', template: 'create a record', preconditions: { urlPattern: `${origin}/record/{{d1}}` }, reportTemplate: { summary: '', values } };
    const spec: SpecFlow = {
      version: 1,
      name: 'parity-qmint',
      origin,
      startUrl: `${origin}/`,
      vars: [],
      steps: [
        {
          id: '02-create',
          instruction: 'create a record',
          params: {},
          outputs: Object.keys(values),
          segments: [
            { id: head.id, template: head.template, params: {}, preconditions: head.preconditions, steps: head.steps, derived },
            { id: tail.id, template: tail.template, params: {}, preconditions: tail.preconditions, steps: tail.steps, report: { summary: '', values } },
          ],
        },
      ],
    };
    reset(0);
    const session = new BrowserSession({ session: `parity-qmint-${Date.now()}`, persist: false, learn: true });
    let daemon: Record<string, string> = {};
    try {
      const page = await session.getPage();
      await page.goto(`${origin}/`);
      session.learn!.put(head);
      session.learn!.put(tail);
      const threaded: Record<string, string> = {};
      let last: ReplayResult | undefined;
      for (const skill of [head, tail]) {
        const out = await executeTool(session, 'run_skill', { id: skill.id, params: { ...threaded } }, os.tmpdir());
        last = out.replay as ReplayResult;
        expect(last?.ok, last?.reason ?? String(out.result)).toBe(true);
        Object.assign(threaded, last.derivedValues ?? {});
      }
      const r = await replayReport(() => session.getPage(), tail, threaded, last!.values);
      daemon = r.report.evidence?.values as Record<string, string>;
    } finally {
      await session.close();
    }
    reset(0);
    const emitted = await emittedOf(spec, {});
    expect(emitted.ok, emitted.reason ?? '').toBe(true);
    const artifact = Object.fromEntries(Object.entries(emitted.outputs).filter(([k]) => k.startsWith('02-create.')).map(([k, v]) => [k.slice('02-create.'.length), v]));
    expect(daemon).toEqual({ record_id: 'current-run' });
    expect(artifact).toEqual({ record_id: 'current-run' });
  }, 120_000);

  /**
   * Round 56: fwgt8-n1 reported `seed_issue_1: "Seed: triage inbox (#1)"` and
   * fwsi8-n1 `asset_1: "Asset Tag SEED-0001 / Name Seed: Reception Laptop"`;
   * no element shows either whole, so no read was recorded and both apps'
   * replays published neither the titles nor the tags. Recorded against
   * fixture pages of the same markup, each composite now becomes one read per
   * element text it is made of (planContainedParts), compile keeps them, and
   * both runners re-read the same values from the page.
   */
  describe('composite report values carved into element reads (fwgt8, fwsi8)', () => {
    const cases = [
      {
        page: 'issue-list',
        instruction: "Navigate to the issues list of the repository bench/bench-repo and report the titles of all OPEN issues whose title starts with 'Seed:', exactly as displayed on the page, one per line.",
        values: { seed_issue_1: 'Seed: triage inbox (#1)', seed_issue_2: 'Seed: order missing parts (#2)', seed_issue_3: 'Seed: ship repaired device (#3)' },
        want: {
          seed_issue_1_1: 'Seed: triage inbox',
          seed_issue_1_2: '#1',
          seed_issue_2_1: 'Seed: order missing parts',
          seed_issue_2_2: '#2',
          seed_issue_3_1: 'Seed: ship repaired device',
          seed_issue_3_2: '#3',
        },
      },
      {
        page: 'asset-table',
        instruction: "List all assets whose name starts with 'Seed:' and report each asset's name and asset tag exactly as shown.",
        values: { asset_1: 'Asset Tag SEED-0001 / Name Seed: Reception Laptop', asset_2: 'Asset Tag SEED-0002 / Name Seed: Training Laptop', asset_3: 'Asset Tag SEED-0003 / Name Seed: Spare Laptop' },
        want: {
          asset_1_1: 'SEED-0001',
          asset_1_2: 'Seed: Reception Laptop',
          asset_2_1: 'SEED-0002',
          asset_2_2: 'Seed: Training Laptop',
          asset_3_1: 'SEED-0003',
          asset_3_2: 'Seed: Spare Laptop',
        },
      },
    ];

    for (const c of cases) {
      it(`both runners re-read each element a composite was made of (${c.page})`, async () => {
        const url = `${origin}/${c.page}`;
        // Record time: the loop's read-back pass, as finish() runs it.
        const session = new BrowserSession({ session: `parity-carve-${Date.now()}`, persist: false });
        const report: Report = { status: 'success', summary: 'reported', evidence: { values: { ...c.values } } };
        const reads: RecordedStep[] = [];
        try {
          const page = await session.getPage();
          await page.goto(url);
          for (const [key, value] of Object.entries(c.values)) {
            expect(await captureReadBack(page, value, key)).toBeNull(); // no element shows it whole
            const got = await flattenContainedComposite(report, key, await visibleTextsWithin(page, value), c.instruction, (part, name) => captureReadBack(page, part, name));
            expect(got.names.length, key).toBe(2);
            reads.push(...got.pinned);
          }
          // The hidden row is not something the page showed: it cannot complete a value.
          expect(planContainedParts('Seed: triage inbox (#1) assigned to nobody', await visibleTextsWithin(page, 'Seed: triage inbox (#1) assigned to nobody'), c.instruction)).toBeNull();
        } finally {
          await session.close();
        }
        expect(report.evidence?.values).toEqual(c.want);

        const entries: RecordedEntry[] = [
          { k: 'instruction', text: c.instruction, url },
          { k: 'step', tool: 'goto', args: { url }, locators: {}, diff: { url, alerts: [], added: [] } },
          ...reads,
        ];
        const [skill] = compileSkills({ entries, instruction: c.instruction, report, session: 'parity', knownValues: {} });
        expect(skill.steps.filter((s) => s.tool === 'read').map((s) => s.label).sort()).toEqual(Object.keys(c.want).sort());
        const spec: SpecFlow = {
          version: 1,
          name: 'parity-carve',
          origin,
          startUrl: `${origin}/`,
          vars: [],
          steps: [{ id: '01-open', instruction: c.instruction, params: {}, outputs: Object.keys(c.want), segments: [{ id: skill.id, template: skill.template, params: skill.params, preconditions: skill.preconditions, steps: skill.steps, ...(skill.reportTemplate ? { report: skill.reportTemplate } : {}) }] }],
        };

        reset(0);
        const replay = await replayOf(skill);
        reset(0);
        const emitted = await emittedOf(spec);
        expect(replay.ok, replay.reason ?? '').toBe(true);
        expect(emitted.ok, emitted.reason ?? '').toBe(true);
        for (const [key, value] of Object.entries(c.want)) {
          expect(replay.outputs[key], key).toBe(value);
          expect(emitted.outputs[`01-open.${key}`], key).toBe(value);
        }
      }, 120_000);
    }
  });

  /**
   * Round 57, kanboard fwkb41. n1 reported `board_columns_left_to_right:
   * "Backlog, Ready, Work in progress, Done"`; the list splitter planned the
   * four titles, but Kanboard renders each title twice — the header, and a
   * collapsed-column copy that is not rendered — and captureReadBack counted
   * both, refused, and the all-or-nothing split published none of them (obj 1
   * FAIL on both replays, "Ready, Done"). And `new_task_numeric_id: "4"` was
   * shown only as `#4`. Recorded against the same markup, the columns split
   * into four reads (pinPart: the code tier's rendered-only count) and the id
   * is read from `#4` framed at its core; both runners publish all of it —
   * and "5" once the board's newest card is #5.
   */
  it('both runners publish every column a split composite pinned past hidden duplicates, and an id read at its core', async () => {
    // The recording stood on the new task's own url, the id's provenance.
    const url = `${origin}/kanboard?task_id=4`;
    const instruction = "Open the 'Bench Board' project board and report its column titles left to right, and the new task's numeric id.";
    const report: Report = { status: 'success', summary: 'ok', evidence: { values: { board_columns_left_to_right: 'Backlog, Ready, Work in progress, Done', new_task_numeric_id: '4' } } };
    const reads: RecordedStep[] = [];
    reset(0);
    const session = new BrowserSession({ session: `parity-kb-${Date.now()}`, persist: false });
    try {
      const page = await session.getPage();
      await page.goto(url);
      // What round 56 did: every part through captureReadBack alone — refused.
      const before: Report = JSON.parse(JSON.stringify(report));
      expect((await flattenProvenComposite(before, 'board_columns_left_to_right', (part, name) => captureReadBack(page, part, name))).names).toEqual([]);
      const split = await flattenProvenComposite(report, 'board_columns_left_to_right', (part, name) => pinPart(page, part, name));
      expect(split.names).toEqual(['board_columns_left_to_right_1', 'board_columns_left_to_right_2', 'board_columns_left_to_right_3', 'board_columns_left_to_right_4']);
      reads.push(...split.pinned);
      const card = await captureReadBack(page, '#4', 'new_task_card_id_shown');
      expect(card).not.toBeNull();
      reads.push(card!);
      expect(await captureReadBack(page, '4', 'new_task_numeric_id')).toBeNull(); // no element shows "4" whole
      const landed: RecordedStep = { k: 'step', tool: 'goto', args: { url }, locators: {}, diff: { url, alerts: [], added: [] } };
      const core = coreReadBack([landed, ...reads], '4', 'new_task_numeric_id', report.evidence!.values);
      expect(core).not.toBeNull();
      reads.push(core!);
      (report.evidence!.values as Record<string, string>).new_task_card_id_shown = '#4';
    } finally {
      await session.close();
    }
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: instruction, url },
      { k: 'step', tool: 'goto', args: { url }, locators: {}, diff: { url, alerts: [], added: [] } },
      ...reads,
    ];
    const [skill] = compileSkills({ entries, instruction, report, session: 'parity', knownValues: {} });
    const spec: SpecFlow = {
      version: 1,
      name: 'parity-kb',
      origin,
      startUrl: `${origin}/`,
      vars: [],
      steps: [{ id: '01-open', instruction, params: {}, outputs: [], segments: [{ id: skill.id, template: skill.template, params: skill.params, preconditions: skill.preconditions, steps: skill.steps }] }],
    };
    const columns = { board_columns_left_to_right_1: 'Backlog', board_columns_left_to_right_2: 'Ready', board_columns_left_to_right_3: 'Work in progress', board_columns_left_to_right_4: 'Done' };

    for (const n of [4, 5]) {
      reset(0);
      fx.board.card = n;
      const replay = await replayOf(skill);
      reset(0);
      fx.board.card = n;
      const emitted = await emittedOf(spec);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      const want = { ...columns, new_task_card_id_shown: `#${n}`, new_task_numeric_id: String(n) };
      for (const [key, value] of Object.entries(want)) {
        expect(replay.outputs[key], `replay ${key} (#${n})`).toBe(value);
        expect(emitted.outputs[`01-open.${key}`], `artifact ${key} (#${n})`).toBe(value);
      }
    }
  }, 180_000);

  /**
   * Round 57, EspoCRM fwec10: `stage: "Negotiation"` shows in the record's
   * stage field and in the Stream entry narrating the save. captureReadBack
   * now pins the match inside the field the key names (fieldReadBack), and
   * both runners re-read the live stage from that field — never the stream's.
   */
  it('both runners re-read a value from the field its key names, past a narrating copy of it', async () => {
    const url = `${origin}/espo`;
    const instruction = 'Open the opportunity and report its stage.';
    reset(0);
    const session = new BrowserSession({ session: `parity-espo-${Date.now()}`, persist: false });
    let read: RecordedStep | null = null;
    try {
      const page = await session.getPage();
      await page.goto(url);
      read = await captureReadBack(page, 'Negotiation', 'stage');
    } finally {
      await session.close();
    }
    expect(read).not.toBeNull();
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: instruction, url },
      { k: 'step', tool: 'goto', args: { url }, locators: {}, diff: { url, alerts: [], added: [] } },
      read!,
    ];
    const report: Report = { status: 'success', summary: 'ok', evidence: { values: { stage: 'Negotiation' } } };
    const [skill] = compileSkills({ entries, instruction, report, session: 'parity', knownValues: {} });
    const spec: SpecFlow = {
      version: 1,
      name: 'parity-espo',
      origin,
      startUrl: `${origin}/`,
      vars: [],
      steps: [{ id: '02-create', instruction, params: {}, outputs: [], segments: [{ id: skill.id, template: skill.template, params: skill.params, preconditions: skill.preconditions, steps: skill.steps }] }],
    };
    for (const stage of ['Negotiation', 'Proposal']) {
      reset(0);
      fx.espo.stage = stage;
      const replay = await replayOf(skill);
      reset(0);
      fx.espo.stage = stage;
      const emitted = await emittedOf(spec);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replay.outputs.stage, stage).toBe(stage);
      expect(emitted.outputs['02-create.stage'], stage).toBe(stage);
    }
  }, 120_000);

  describe('report values (fwrd86)', () => {
    const READ_REF: SkillStep = { tool: 'read', args: { target: '(read-back)', what: 'text' }, locators: { target: [{ kind: 'id', selector: '#ref' }] }, label: 'ticket_reference' };
    const values = {
      ticket_reference: '{{v1}}',
      ticket_title: '{{v1}} Bench Ticket',
      list_row: '{{v1}} Bench Ticket created 2026-09-23',
      list_count: 'Showing 1–10 of 13 tickets, {{v1}} first',
    };
    const params = { v1: 'RD-1016' };
    const skillParams = (): Record<string, SkillParam> => ({ v1: { example: 'RD-1015', usedIn: [] } });
    const ticketSkill = (): Skill => ({
      ...skillOf([READ_REF]),
      id: 's_tickets',
      template: 'report the list for {{v1}}',
      params: skillParams(),
      preconditions: { urlPattern: `${origin}/tickets` },
      reportTemplate: { summary: '', values },
    });
    const ticketFlow = (): SpecFlow => ({
      version: 1,
      name: 'parity-report',
      origin,
      startUrl: `${origin}/tickets`,
      vars: [],
      steps: [
        {
          id: '06-delete',
          instruction: 'report the list for {{v1}}',
          params: { v1: 'RD-1016' },
          outputs: Object.keys(values),
          segments: [{ id: 's_tickets', template: 'report the list for {{v1}}', params: skillParams(), preconditions: { urlPattern: `${origin}/tickets` }, steps: [READ_REF], report: { summary: '', values } }],
        },
      ],
    });

    /** Daemon replay, then the report the flow runner publishes from it. */
    async function replayReportOf(skill: Skill): Promise<{ ok: boolean; reason: string | null; values: Record<string, string> }> {
      const session = new BrowserSession({ session: `parity-report-${Date.now()}`, persist: false, learn: true });
      try {
        const page = await session.getPage();
        await page.goto(`${origin}/tickets`);
        session.learn!.put(skill);
        const out = await executeTool(session, 'run_skill', { id: skill.id, params }, os.tmpdir());
        const replay = out.replay as ReplayResult | undefined;
        if (!replay?.ok) return { ok: false, reason: replay?.reason ?? String(out.result), values: {} };
        const { report } = await replayReport(() => session.getPage(), skill, params, replay.values);
        return { ok: true, reason: null, values: Object.fromEntries(Object.entries(report.evidence?.values ?? {}).map(([k, v]) => [k, String(v)])) };
      } finally {
        await session.close();
      }
    }

    /** The artifact's published values for the step, keys without the step prefix. */
    const published = (o: Outcome): Record<string, string> =>
      Object.fromEntries(Object.entries(o.outputs).filter(([k, v]) => k.startsWith('06-delete.') && v !== undefined).map(([k, v]) => [k.slice('06-delete.'.length), v]));

    it('both runners publish the recorded text where the page shows it', async () => {
      reset(13);
      const replay = await replayReportOf(ticketSkill());
      reset(13);
      const emitted = await emittedOf(ticketFlow(), params);

      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      const want = {
        ticket_reference: 'RD-1016',
        ticket_title: 'RD-1016 Bench Ticket',
        list_row: 'RD-1016 Bench Ticket created 2026-09-23',
        list_count: 'Showing 1–10 of 13 tickets, RD-1016 first',
      };
      expect(replay.values).toEqual(want);
      expect(published(emitted)).toEqual(want);
    }, 120_000);

    it("neither runner publishes the recording's date or count once the app has moved on", async () => {
      reset(16);
      fx.listing.date = '2026-09-24';
      const replay = await replayReportOf(ticketSkill());
      reset(16);
      fx.listing.date = '2026-09-24';
      const emitted = await emittedOf(ticketFlow(), params);

      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      const want = { ticket_reference: 'RD-1016', ticket_title: 'RD-1016 Bench Ticket' };
      expect(replay.values).toEqual(want);
      expect(published(emitted)).toEqual(want);
      for (const stale of ['2026-09-23', 'of 13']) {
        expect(JSON.stringify(replay.values)).not.toContain(stale);
        expect(JSON.stringify(published(emitted))).not.toContain(stale);
      }
    }, 120_000);

    /**
     * A later step CONSUMES the withheld value (fwod74 06-open ←
     * `"[FURN_6666] {{v7}}"`). Compile counts a one-slot template value as a
     * source (templateSource), so replay must give the consumer something on
     * every run — and never the recording's text. Both runners hand the
     * reference the slot's own value; the unconsumed list_row stays withheld
     * on both, and neither puts either into the report.
     */
    it('both runners give a consumer the one slot of a withheld value, and nothing of the recording', async () => {
      const heading: SkillStep = { tool: 'read', args: { target: '(read-back)', what: 'text' }, locators: { target: [{ kind: 'css', selector: 'h1' }] }, label: 'heading' };
      const flow = ticketFlow();
      flow.steps.push({
        id: '07-verify',
        instruction: 'verify {{06-delete.list_count}} is listed',
        params: {},
        outputs: ['heading'],
        segments: [{ id: 's_verify', template: 'verify the list', params: {}, preconditions: { urlPattern: `${origin}/tickets` }, steps: [heading] }],
      });
      const consumed = consumedReportedOutputs(
        flow.steps.map((s) => ({ id: s.id, instruction: s.instruction, params: s.params })),
        '06-delete',
      );
      expect(consumed).toEqual(['list_count']);

      reset(16);
      fx.listing.date = '2026-09-24';
      const session = new BrowserSession({ session: `parity-ref-${Date.now()}`, persist: false, learn: true });
      let daemonRefs: Record<string, string> = {};
      let daemonReport: Record<string, string> = {};
      try {
        const page = await session.getPage();
        await page.goto(`${origin}/tickets`);
        const skill = ticketSkill();
        session.learn!.put(skill);
        const out = await executeTool(session, 'run_skill', { id: skill.id, params }, os.tmpdir());
        const replay = out.replay as ReplayResult;
        expect(replay?.ok, replay?.reason ?? String(out.result)).toBe(true);
        const r = await replayReport(() => session.getPage(), skill, params, replay.values);
        daemonReport = r.report.evidence?.values as Record<string, string>;
        // The flow runner's banking: the report, then a consumed key's reference.
        daemonRefs = { ...daemonReport };
        for (const key of consumed) if (r.references[key] !== undefined && !(key in daemonRefs)) daemonRefs[key] = r.references[key];
      } finally {
        await session.close();
      }
      reset(16);
      fx.listing.date = '2026-09-24';
      const emitted = await emittedOf(flow, params);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);

      const want = { ticket_reference: 'RD-1016', ticket_title: 'RD-1016 Bench Ticket', list_count: 'RD-1016' };
      expect(daemonRefs).toEqual(want);
      expect(published(emitted)).toEqual(want);
      expect(daemonReport.list_count).toBeUndefined();
    }, 120_000);
  });

  /** Run one loop contract through both runners against separately reset state. */
  async function both(steps: SkillStep[], startWith = 10) {
    reset(startWith);
    const replay = await replayOf(skillOf(steps));
    const replayLog = [...fx.log];
    reset(startWith);
    const emitted = await emittedOf(specOf(steps));
    const emittedLog = [...fx.log];
    return { replay, emitted, replayLog, emittedLog };
  }

  /** The same, for a procedure given whole (its own preconditions and params). */
  async function bothOf(skill: Skill, spec: SpecFlow, params: Record<string, string>) {
    reset(0);
    const replay = await replayOf(skill, params);
    const replayLog = [...fx.log];
    reset(0);
    const emitted = await emittedOf(spec, params);
    const emittedLog = [...fx.log];
    return { replay, emitted, replayLog, emittedLog };
  }

  it('both runners enforce a back step URL gate before allowing the next mutation', async () => {
    const steps: SkillStep[] = [
      { tool: 'goto', args: { url: `${origin}/record/previous` }, locators: {} },
      { tool: 'goto', args: { url: `${origin}/record/current` }, locators: {} },
      { tool: 'back', args: {}, locators: {}, expect: { urlPattern: `${origin}/different/page/shape` } },
      MARK,
    ];
    const { replay, emitted, replayLog, emittedLog } = await both(steps, 0);

    // Navigation happened, but the failed postcondition must prevent Mark.
    // Checking the server's log catches a runner that silently omits the gate.
    for (const log of [replayLog, emittedLog]) {
      expect(log).toContain('visit:previous');
      expect(log).toContain('visit:current');
      expect(log.filter((entry) => entry.startsWith('mark:'))).toEqual([]);
    }
    expect(replay.ok, replay.reason ?? '').toBe(false);
    expect(emitted.ok, emitted.reason ?? '').toBe(false);
    expect(replay.reason).toMatch(/url/i);
    expect(emitted.reason).toMatch(/url/i);
  }, 120_000);

  it('both runners check a repeated URL expectation again after another action', async () => {
    const expected = `${origin}/record/current`;
    const steps: SkillStep[] = [
      { tool: 'goto', args: { url: expected }, locators: {}, expect: { urlPattern: expected } },
      { tool: 'goto', args: { url: `${origin}/` }, locators: {}, expect: { urlPattern: expected } },
      MARK,
    ];
    const { replay, emitted, replayLog, emittedLog } = await both(steps, 1);

    // The first action satisfied this URL. That is no evidence about where
    // the second action landed, even though their expectation strings agree.
    expect(replay.ok, replay.reason ?? '').toBe(false);
    expect(emitted.ok, emitted.reason ?? '').toBe(false);
    expect(replayLog.filter((entry) => entry.startsWith('mark:'))).toEqual([]);
    expect(emittedLog.filter((entry) => entry.startsWith('mark:'))).toEqual([]);
  }, 120_000);

  /**
   * fwod51 07-verify. The gate was RIGHT — a click had overshot onto another
   * record's list — and it said "expected url …&id={{d3}}&…", the literal text
   * of a marker no page ever shows. That sentence is written once, in the
   * shared gates module, and reaches a drift ticket from one runner and a
   * Playwright failure from the other, so both must say the same thing.
   *
   * The marker is never bound here (the procedure declares no params), which
   * is exactly the fwod51 condition. Both halves are pinned: an unfilled
   * marker still MATCHES, because to the matcher it is a wildcard, and when
   * the url really is another page the stop names the wildcard rather than
   * the marker.
   */
  it('both runners render an unfilled marker as the wildcard they matched it as', async () => {
    const pattern = `${origin}/record/{{v1}}`;
    const passing: SkillStep[] = [
      { tool: 'goto', args: { url: `${origin}/record/current` }, locators: {}, expect: { urlPattern: pattern } },
      MARK,
    ];
    const ok = await both(passing, 1);
    // Matching is unchanged: the marker stood for any record, so the step passed.
    expect(ok.replay.ok, ok.replay.reason ?? '').toBe(true);
    expect(ok.emitted.ok, ok.emitted.reason ?? '').toBe(true);
    expect(ok.replayLog.filter((e) => e.startsWith('mark:'))).toEqual(ok.emittedLog.filter((e) => e.startsWith('mark:')));
    expect(ok.replayLog.filter((e) => e.startsWith('mark:'))).not.toEqual([]);

    const stopping: SkillStep[] = [
      { tool: 'goto', args: { url: `${origin}/record/current` }, locators: {} },
      { tool: 'goto', args: { url: `${origin}/` }, locators: {}, expect: { urlPattern: pattern } },
      MARK,
    ];
    const stopped = await both(stopping, 1);
    expect(stopped.replay.ok).toBe(false);
    expect(stopped.emitted.ok).toBe(false);
    // The identical sentence from both runners, up to the name each gives the
    // step ("step 2" in the daemon, "<stepId> <segmentId>/2" in the artifact).
    const sentence = `expected url ${origin}/record/:var but browser is at ${origin}/`;
    expect(stopped.replay.reason).toContain(sentence);
    expect(stopped.emitted.reason).toContain(sentence);
    expect(stopped.replay.reason).not.toContain('{{');
    expect(stopped.emitted.reason).not.toContain('{{');
    expect(stopped.replayLog.filter((e) => e.startsWith('mark:'))).toEqual([]);
    expect(stopped.emittedLog.filter((e) => e.startsWith('mark:'))).toEqual([]);
  }, 120_000);

  it.each(['goto', 'back'] as const)('both runners bind a %s result before its own URL gate and later actions', async (tool) => {
    const destination = `${origin}/record/current-run`;
    const steps: SkillStep[] = tool === 'back'
      ? [
        { tool: 'goto', args: { url: destination }, locators: {} },
        { tool: 'goto', args: { url: `${origin}/record/away` }, locators: {} },
        { tool: 'back', args: {}, locators: {}, expect: { urlPattern: `${origin}/record/{{d1}}` } },
      ]
      : [{ tool: 'goto', args: { url: destination }, locators: {}, expect: { urlPattern: `${origin}/record/{{d1}}` } }];
    const derived = { d1: { step: steps.length, at: 'p1', example: 'recorded-run' } };
    steps.push({ tool: 'goto', args: { url: `${origin}/record/{{d1}}-copy` }, locators: {} }, MARK);
    const skill = { ...skillOf(steps), derived };
    const spec = specOf(steps);
    spec.steps[0].segments[0].derived = derived;

    const { replay, emitted, replayLog, emittedLog } = await bothOf(skill, spec, {});

    expect(replay.ok, replay.reason ?? '').toBe(true);
    expect(emitted.ok, emitted.reason ?? '').toBe(true);
    // Reading the recorded example, the page before Back, or an unbound slot
    // would each send the final mutation to a different record.
    expect(replayLog.filter((entry) => entry.startsWith('mark:'))).toEqual(['mark:current-run-copy']);
    expect(emittedLog.filter((entry) => entry.startsWith('mark:'))).toEqual(['mark:current-run-copy']);
  }, 120_000);

  /**
   * C01. Ten items, a loop the compiler capped at seven. Neither runner may
   * report success: the list is not cleared. What made this worth a harness
   * is that both used to return ok — for different reasons, from different
   * code — and no single-runner test could see the agreement was wrong.
   */
  it('neither runner calls a capped loop finished with items left', async () => {
    const { replay, emitted, replayLog, emittedLog } = await both(deleteLoop(7), 10);

    expect(replay.ok).toBe(false);
    expect(emitted.ok).toBe(false);
    expect(replay.reason).toMatch(/not finished|still matching/);
    expect(emitted.reason).toMatch(/not finished|still matching/);

    // And they did the same amount of real work, by the server's count.
    expect(replayLog).toHaveLength(7);
    expect(emittedLog).toHaveLength(7);
    expect(new Set(replayLog).size).toBe(7); // seven DIFFERENT items, not one item seven times
    expect(new Set(emittedLog).size).toBe(7);
    expect(fx.items).toHaveLength(3);
  }, 120_000);

  /**
   * The same contract over a list it can finish. Both runners drain it, and
   * each item is deleted exactly once — the property a mutation log can
   * establish and a green tick cannot.
   */
  it('both runners drain a list within the cap, deleting each item once', async () => {
    const { replay, emitted, replayLog, emittedLog } = await both(deleteLoop(10), 5);

    expect(replay.ok).toBe(true);
    expect(emitted.ok).toBe(true);
    expect(replayLog.sort()).toEqual(emittedLog.sort());
    expect(replayLog).toHaveLength(5);
    expect(new Set(replayLog).size).toBe(5);
    expect(fx.items).toHaveLength(0);
  }, 120_000);

  /**
   * C07. A loop bounded to the work that was observed — what the compiler now
   * produces unless the instruction says "all" — deletes exactly that many
   * records and leaves the rest. Records it was never given authority over
   * are not unfinished work, so both runners report success with items left.
   * The contrast with the drain case above is the whole point of the scope.
   */
  it('both runners do exactly the observed work for a bounded loop, and leave the rest', async () => {
    const { replay, emitted, replayLog, emittedLog } = await both(deleteLoop(2, 'observed'), 6);

    expect(replay.ok).toBe(true);
    expect(emitted.ok).toBe(true);
    expect(replayLog).toHaveLength(2);
    expect(emittedLog).toHaveLength(2);
    expect(new Set(replayLog).size).toBe(2);
    expect(new Set(emittedLog).size).toBe(2);
    expect(fx.items).toHaveLength(4);
  }, 120_000);

  /**
   * C01, the other half. An EDIT-IN-PLACE loop: each pass marks a record and
   * the collection does not shrink, so "act on the first match" works record
   * one over and over — three passes, three mutations, all on Item 1, and a
   * green result. The cursor is what makes the body visit each record once,
   * and both runners must now agree on that by the server's own count.
   */
  it('both runners visit each record once when the collection does not shrink', async () => {
    const target = [{ kind: 'role' as const, role: 'button', name: 'Mark' }];
    const markLoop: SkillStep[] = [
      { tool: 'loop', args: {}, locators: {}, while: target, max: 6, body: [{ tool: 'click', args: { target: '@e1' }, locators: { target } }] },
    ];
    const { replay, emitted, replayLog, emittedLog } = await both(markLoop, 3);

    expect(replay.ok).toBe(true);
    expect(emitted.ok).toBe(true);
    // Three records, marked once each — not one record marked three times.
    expect(replayLog.sort()).toEqual(['mark:Item 1', 'mark:Item 2', 'mark:Item 3']);
    expect(emittedLog.sort()).toEqual(['mark:Item 1', 'mark:Item 2', 'mark:Item 3']);
  }, 120_000);

  /**
   * C02. WHEN the identity check runs, not whether.
   *
   * A procedure whose first step is a goto used to be let past the gate on the
   * grounds that "step 1 decides the page". It does — and the recorded goto
   * carries the RECORDING run's record id, so it decides it to be the wrong
   * page, which is how fwod10 did a run's work on another run's records and
   * reported success. Asserting identity BEFORE the goto is no better: the
   * browser is still on the page being left, so the check either fails on a
   * page nobody claimed anything about, or passes on it and then navigates
   * somewhere unchecked.
   *
   * The only correct place is between the two, and both runners must put it
   * there. The server's visit log is the witness that the navigation actually
   * happened — no runner's report can establish that about itself.
   */
  it('neither runner gates on identity before its own goto, and both stop on the wrong record', async () => {
    const recorded = `${origin}/record/${RECORDED}`;
    const { replay, emitted, replayLog, emittedLog } = await bothOf(recordSkill(recorded), recordFlow(recorded), { v1: 'rec-77' });

    // The check did not fire against the page being left: both navigated.
    expect(replayLog, 'replay must run its own goto before judging the page').toContain(`visit:${RECORDED}`);
    expect(emittedLog, 'the artifact must run its own goto before judging the page').toContain(`visit:${RECORDED}`);

    // And neither then did this run's work on the record it landed on.
    expect(replay.ok).toBe(false);
    expect(emitted.ok).toBe(false);
    expect(replay.reason).toMatch(/different record|does not show/);
    expect(emitted.reason).toMatch(/identity/i);
    expect(replayLog.filter((l) => l.startsWith('mark:'))).toEqual([]);
    expect(emittedLog.filter((l) => l.startsWith('mark:'))).toEqual([]);
  }, 120_000);

  /**
   * The other half, without which the case above is satisfied by a gate that
   * always refuses: the same procedure with the record id in the goto's url,
   * so it navigates to THIS run's record. Both must then pass the deferred
   * check and do the work, once, on rec-77.
   */
  it("both runners proceed when the goto lands on this run's own record", async () => {
    const slotted = `${origin}/record/{{v1}}`;
    const { replay, emitted, replayLog, emittedLog } = await bothOf(recordSkill(slotted), recordFlow(slotted), { v1: 'rec-77' });

    expect(replay.ok, replay.reason ?? '').toBe(true);
    expect(emitted.ok, emitted.reason ?? '').toBe(true);
    expect(replayLog).toEqual(['visit:rec-77', 'mark:rec-77']);
    expect(emittedLog).toEqual(['visit:rec-77', 'mark:rec-77']);
  }, 120_000);

  /**
   * A navigation that never completes. Both runners must give it up and say
   * so; neither may sit on it.
   *
   * The daemon has always bounded its own goto (`{ waitUntil: 'load',
   * timeout: 30_000 }`, src/agent/tools.ts). The artifact emitted a bare
   * `page.goto(url)` — and under `@playwright/test` that is not the familiar
   * 30s, it is nothing at all: `navigationTimeout` defaults to 0 there, the
   * 30s belongs to playwright-core. odoo's artifact sat on one for the full
   * 600s the bench harness allows and was SIGKILLed, its log holding nothing
   * but `Running 1 test using 1 worker`.
   *
   * TWO injections, both applied to BOTH legs so neither is flattered:
   *  - the navigation is made to hang by routing it into a handler that never
   *    answers, rather than by a slow server — nothing then depends on how
   *    long the suite is willing to wait for a response that is not coming;
   *  - each runner's own bound is scaled down to NAV_BOUND_MS. The injector
   *    only ever SHRINKS a bound that was passed; a goto called with no
   *    timeout (or with Playwright's 0, which means "no timeout") is left
   *    exactly as unbounded as it was. So it cannot manufacture the property
   *    under test: before the fix this case does not fail fast, it hangs
   *    until the case's own timeout — which is what the defect does in the
   *    field, only smaller.
   */
  const NAV_BOUND_MS = 1_500;
  const hangNavigation: PageHook = async (page) => {
    // Never fulfilled, never aborted: the request is simply never answered,
    // so the server never sees it and its log stays the witness that it didn't.
    await page.route('**/record/**', () => {});
    const real = page.goto.bind(page);
    page.goto = ((url: string, opts?: { timeout?: number }) =>
      real(url, opts?.timeout ? { ...opts, timeout: Math.min(opts.timeout, NAV_BOUND_MS) } : opts)) as typeof page.goto;
  };

  it('both runners bound a navigation that never completes, and report it', async () => {
    const slotted = `${origin}/record/{{v1}}`;
    reset(0);
    const replay = await replayOf(recordSkill(slotted), { v1: 'rec-77' }, hangNavigation);
    const replayLog = [...fx.log];
    reset(0);
    const emitted = await emittedOf(recordFlow(slotted), { v1: 'rec-77' }, hangNavigation);
    const emittedLog = [...fx.log];

    // Neither reached the server, and neither went on to do the work: a runner
    // that read the dead navigation as an arrival would have marked something.
    expect(replayLog).toEqual([]);
    expect(emittedLog).toEqual([]);

    expect(replay.ok).toBe(false);
    expect(emitted.ok).toBe(false);
    expect(replay.reason).toMatch(/timeout/i);
    // The bound is the one the artifact itself passes — the injector only
    // shrank it. `Timeout 0ms`, or no timeout at all, would mean the emitted
    // goto is still being left to the test runner's zero default.
    expect(emitted.reason).toMatch(new RegExp(`Timeout ${NAV_BOUND_MS}ms exceeded`, 'i'));
  }, 90_000);

  /**
   * A LATER goto whose recorded target names the record the RECORDING ran on,
   * at a position this run has already watched vary. Step 1 goes to this run's
   * record and its recorded url expectation sees `rec-42→rec-77` — the segment
   * that is "treated as volatile". Step 2 is the recorded literal
   * `/record/rec-42`, and the shared retargetNavigation sends it to
   * `/record/rec-77` instead, on BOTH runners: the daemon rewrites the step's
   * own `args.url`, the artifact calls `navigationTarget` ahead of its
   * `page.goto`, and a rule only one of them applied would leave the other
   * marking the recording's record.
   *
   * fwgr41-n3 06-find is this exactly: step 6 warned "url segment(s) differ
   * from recorded (afyd7g0300dfkc→cfyd8hqymgfeoe) — treated as volatile", and
   * step 7's goto to the recorded uid landed on a dashboard Grafana had never
   * minted.
   */
  it('both runners send a later goto to the live value at a position this run has shown volatile', async () => {
    const steps: SkillStep[] = [
      { tool: 'goto', args: { url: `${origin}/record/{{v1}}` }, locators: {}, expect: { urlPattern: `${origin}/record/${RECORDED}` } },
      { tool: 'goto', args: { url: `${origin}/record/${RECORDED}` }, locators: {} },
      MARK,
    ];
    const skill: Skill = {
      ...skillOf(steps),
      id: 's_volatile',
      template: 'mark record {{v1}}',
      params: { v1: { example: RECORDED, usedIn: [1], known: true } },
      preconditions: { urlPattern: `${origin}/record/:id`, requireText: ['Record {{v1}}'] },
    };
    const spec: SpecFlow = {
      version: 1,
      name: 'parity-volatile',
      origin,
      startUrl: `${origin}/`,
      vars: [],
      steps: [
        {
          id: '01-mark',
          instruction: 'mark record {{v1}}',
          params: { v1: RECORDED },
          outputs: [],
          segments: [
            {
              id: 's_volatile',
              template: 'mark record {{v1}}',
              params: { v1: { example: RECORDED, usedIn: [1], known: true } },
              preconditions: { urlPattern: `${origin}/record/:id`, requireText: ['Record {{v1}}'] },
              steps,
            },
          ],
        },
      ],
    };
    const { replay, emitted, replayLog, emittedLog } = await bothOf(skill, spec, { v1: 'rec-77' });

    expect(replay.ok, replay.reason ?? '').toBe(true);
    expect(emitted.ok, emitted.reason ?? '').toBe(true);
    // The server is the oracle: neither runner ever asked for the recording's
    // record, and the work happened once, on this run's.
    expect(replayLog).toEqual(['visit:rec-77', 'visit:rec-77', 'mark:rec-77']);
    expect(emittedLog).toEqual(['visit:rec-77', 'visit:rec-77', 'mark:rec-77']);
    expect(replay.warnings?.some((w) => /already shown volatile/.test(w)), 'replay says why it retargeted').toBe(true);
    expect(emitted.warnings?.some((w) => /already shown volatile/.test(w)), 'the artifact says why it retargeted').toBe(true);
  }, 120_000);

  /**
   * The same self-navigating procedure, recorded from a blank tab: it looks at
   * the page (a wait for `body`) before its goto, as fwrd51's s_b1a0cd did.
   * It still navigates itself — the start url is not asked (the browser is on
   * `/`, not a record), and identity is asked after the goto, not before it.
   * The old rule was "step 1 is a goto", and refused it.
   */
  it('both runners treat a procedure that looks before its goto as navigating itself', async () => {
    const slotted = `${origin}/record/{{v1}}`;
    const look: SkillStep = { tool: 'wait_for', args: { target: '@e0', state: 'visible' }, locators: { target: [{ kind: 'css', selector: 'body' }] } };
    const skill = recordSkill(slotted);
    skill.steps = [look, ...skill.steps];
    const spec = recordFlow(slotted);
    spec.steps[0].segments[0].steps = [look, ...spec.steps[0].segments[0].steps];
    const { replay, emitted, replayLog, emittedLog } = await bothOf(skill, spec, { v1: 'rec-77' });

    expect(replay.ok, replay.reason ?? '').toBe(true);
    expect(emitted.ok, emitted.reason ?? '').toBe(true);
    expect(replayLog).toEqual(['visit:rec-77', 'mark:rec-77']);
    expect(emittedLog).toEqual(['visit:rec-77', 'mark:rec-77']);
  }, 120_000);

  /**
   * The same procedure again, with the look recorded as the recorder actually
   * enriches it: the root under two spellings and the coordinate it was at —
   * `[css body, css "html > body", point]`, fwrd68 s_bfc33c verbatim.
   *
   * The rungs are alternative ways to reach ONE element, so the chain still
   * says "the document root" and the step still looks at no page. Judged as a
   * conjunction it did not: `html > body` is not the `body` regex and a point
   * is not a css rung, so the gate moved ahead of the goto and asked the start
   * url of a browser the app's router had already moved — "not on the page
   * this procedure starts from", nothing of the segment run.
   *
   * Here because `segmentGate` is embedded verbatim in the artifact and called
   * by both runners: replays survived it in the sweeps by re-selecting around
   * the bad head once the store had grown, and the artifact could not, because
   * it compiles the pinned flow. The two legs must agree, and must both run.
   */
  it('both runners run a procedure whose look-before-the-goto names the root through an enriched chain', async () => {
    const slotted = `${origin}/record/{{v1}}`;
    const look: SkillStep = {
      tool: 'wait_for',
      args: { target: 'body', state: 'visible' },
      locators: {
        target: [
          { kind: 'css', selector: 'body' },
          { kind: 'css', selector: 'html > body' },
          { kind: 'point', x: 640, y: 450, w: 1264, h: 884, role: null, tag: 'body', vw: 1280, vh: 900 },
        ],
      },
    };
    const skill = recordSkill(slotted);
    skill.steps = [look, ...skill.steps];
    const spec = recordFlow(slotted);
    spec.steps[0].segments[0].steps = [look, ...spec.steps[0].segments[0].steps];
    const { replay, emitted, replayLog, emittedLog } = await bothOf(skill, spec, { v1: 'rec-77' });

    expect(replay.ok, replay.reason ?? '').toBe(true);
    expect(emitted.ok, emitted.reason ?? '').toBe(true);
    // The server is the oracle: the goto ran, and the work happened once.
    expect(replayLog).toEqual(['visit:rec-77', 'mark:rec-77']);
    expect(emittedLog).toEqual(['visit:rec-77', 'mark:rec-77']);
  }, 120_000);

  /**
   * Navigation seams (segmentGate). A segment's gate runs immediately before
   * its first page-dependent step, and a navigation is a seam.
   *
   * fwrd53 07-report: s_84b84b was recorded on a ticket DETAIL page (its
   * identity marker is the record's own heading), and its first step is a goto
   * to the LIST, where that record is not shown. The old deferred identity
   * check asked the list for the detail page's marker and refused "a different
   * record". This is the skill as it was stored — one segment, the goto inside
   * it — so the landing is judged by landedOnRecordedPage: another template,
   * whose page the markers never described, and neither runner asks them.
   */
  it('both runners run a detail-page skill whose goto lands on a list that does not show the record', async () => {
    const steps: SkillStep[] = [{ tool: 'goto', args: { url: `${origin}/` }, locators: {} }, MARK];
    const pre = { urlPattern: `${origin}/record/:id`, requireText: ['Record {{v1}}'] };
    const params = { v1: { example: RECORDED, usedIn: [], known: true as const } };
    const skill: Skill = { ...skillOf(steps), id: 's_detail', template: 'mark from the list', params, preconditions: pre };
    const spec = specOf(steps);
    Object.assign(spec.steps[0], { params: { v1: 'rec-77' } });
    Object.assign(spec.steps[0].segments[0], { id: 's_detail', params, preconditions: pre });
    reset(1);
    const replay = await replayOf(skill, { v1: 'rec-77' });
    const replayLog = [...fx.log];
    reset(1);
    const emitted = await emittedOf(spec, { v1: 'rec-77' });
    const emittedLog = [...fx.log];

    expect(replay.ok, replay.reason ?? '').toBe(true);
    expect(emitted.ok, emitted.reason ?? '').toBe(true);
    expect(replayLog).toEqual(['mark:Item 1']);
    expect(emittedLog).toEqual(['mark:Item 1']);
  }, 120_000);

  /**
   * The same procedure as newly compiled: the goto is a seam, so segment 1 is
   * the goto alone (never gated: nothing in it looks at a page) and segment 2
   * is gated on the page the goto landed on, its markers taken from there.
   * Both runners check them before segment 2's first acting step — and stop
   * when the recorded goto took the browser to the RECORDING run's record.
   */
  const seamSkills = (url: string): Skill[] => [
    { ...skillOf([{ tool: 'goto', args: { url }, locators: {} }]), id: 's_seam0', template: 'mark record {{v1}}', params: { v1: { example: RECORDED, usedIn: [], known: true } }, contract: 4 },
    {
      ...skillOf([MARK]),
      id: 's_seam1',
      template: 'mark record {{v1}}',
      params: { v1: { example: RECORDED, usedIn: [], known: true } },
      preconditions: { urlPattern: `${origin}/record/:id`, requireText: ['Record {{v1}}'] },
    },
  ];
  const seamFlow = (url: string): SpecFlow => {
    const [head, tail] = seamSkills(url);
    const seg = (s: Skill) => ({ id: s.id, template: s.template, params: s.params, preconditions: s.preconditions, steps: s.steps });
    return {
      version: 1,
      name: 'parity-seam',
      origin,
      startUrl: `${origin}/`,
      vars: [],
      steps: [{ id: '01-mark', instruction: 'mark record {{v1}}', params: { v1: 'rec-77' }, outputs: [], segments: [seg(head), seg(tail)] }],
    };
  };
  /** A chain of segments through daemon replay, one session, in order, stopping at the first that does not finish. */
  async function replayChainOf(skills: Skill[], params: Record<string, string>): Promise<Outcome> {
    const session = new BrowserSession({ session: `parity-chain-${Date.now()}`, persist: false, learn: true });
    try {
      const page = await session.getPage();
      await page.goto(`${origin}/`);
      for (const skill of skills) session.learn!.put(skill);
      let last: ReplayResult | undefined;
      for (const skill of skills) {
        const out = await executeTool(session, 'run_skill', { id: skill.id, params }, os.tmpdir());
        last = out.replay as ReplayResult | undefined;
        if (!last) return { ok: false, reason: `run_skill returned no replay: ${out.result}`, outputs: {} };
        if (!last.ok) return { ok: false, reason: last.reason ?? null, outputs: last.values, warnings: last.warnings };
      }
      return { ok: true, reason: null, outputs: last?.values ?? {}, warnings: last?.warnings };
    } finally {
      await session.close();
    }
  }

  it('both runners gate a segment after a goto seam on its landing, and stop on the wrong record before acting', async () => {
    const recorded = `${origin}/record/${RECORDED}`;
    reset(0);
    const replay = await replayChainOf(seamSkills(recorded), { v1: 'rec-77' });
    const replayLog = [...fx.log];
    reset(0);
    const emitted = await emittedOf(seamFlow(recorded), { v1: 'rec-77' });
    const emittedLog = [...fx.log];

    // segment 1 ran from wherever the browser was: no gate asked of `/`
    expect(replayLog).toEqual([`visit:${RECORDED}`]);
    expect(emittedLog).toEqual([`visit:${RECORDED}`]);
    expect(replay.ok).toBe(false);
    expect(emitted.ok).toBe(false);
    expect(replay.reason).toMatch(/different record|does not show/);
    expect(emitted.reason).toMatch(/identity/i);

    // and on this run's own record, both do the work once
    const slotted = `${origin}/record/{{v1}}`;
    reset(0);
    const replayOk = await replayChainOf(seamSkills(slotted), { v1: 'rec-77' });
    const replayOkLog = [...fx.log];
    reset(0);
    const emittedOk = await emittedOf(seamFlow(slotted), { v1: 'rec-77' });
    const emittedOkLog = [...fx.log];
    expect(replayOk.ok, replayOk.reason ?? '').toBe(true);
    expect(emittedOk.ok, emittedOk.reason ?? '').toBe(true);
    expect(replayOkLog).toEqual(['visit:rec-77', 'mark:rec-77']);
    expect(emittedOkLog).toEqual(['visit:rec-77', 'mark:rec-77']);
  }, 180_000);

  /**
   * A segment none of whose steps looks at the page is never gated: its url
   * and its markers describe a page it does nothing on.
   */
  it('both runners run a segment of only page-independent steps from any page', async () => {
    const steps: SkillStep[] = [
      { tool: 'wait_for', args: { target: '@e0', state: 'visible' }, locators: { target: [{ kind: 'css', selector: 'body' }] } },
      { tool: 'goto', args: { url: `${origin}/record/rec-5` }, locators: {} },
    ];
    const pre = { urlPattern: `${origin}/elsewhere/:id`, requireText: ['Record {{v1}}'] };
    const params = { v1: { example: 'zzz-1', usedIn: [], known: true as const } };
    const skill: Skill = { ...skillOf(steps), id: 's_blind', template: 'open', params, preconditions: pre };
    const spec = specOf(steps);
    Object.assign(spec.steps[0], { params: { v1: 'zzz-9' } });
    Object.assign(spec.steps[0].segments[0], { id: 's_blind', params, preconditions: pre });
    const { replay, emitted, replayLog, emittedLog } = await bothOf(skill, spec, { v1: 'zzz-9' });

    expect(replay.ok, replay.reason ?? '').toBe(true);
    expect(emitted.ok, emitted.reason ?? '').toBe(true);
    expect(replayLog).toEqual(['visit:rec-5']);
    expect(emittedLog).toEqual(['visit:rec-5']);
  }, 120_000);

  /**
   * C06. The NEIGHBOURING record: this run is about rec-7, and the page it
   * lands on shows rec-70.
   *
   * Matched by plain substring the identity marker `Record rec-7` is satisfied
   * by "Record rec-70", so the gate that exists to tell one record of a
   * template from another passes on the wrong one — and it is exactly on this
   * path that it is asked, because the url gate proceeds optimistically when a
   * single id segment disagrees and the fingerprint is close. Bare ids are the
   * commonest marker shape in the published stores, so this is the live case.
   *
   * The mutation log is the oracle: both runners may navigate (the gate sits
   * after a self-navigating procedure's own goto), and neither may mark.
   */
  it('neither runner accepts a neighbouring record whose id merely extends this run’s', async () => {
    const neighbour = `${origin}/record/rec-70`;
    const { replay, emitted, replayLog, emittedLog } = await bothOf(recordSkill(neighbour), recordFlow(neighbour), { v1: 'rec-7' });

    expect(replayLog, 'replay must run its own goto before judging the page').toContain('visit:rec-70');
    expect(emittedLog, 'the artifact must run its own goto before judging the page').toContain('visit:rec-70');

    expect(replay.ok, replay.reason ?? '').toBe(false);
    expect(emitted.ok, emitted.reason ?? '').toBe(false);
    expect(replay.reason).toMatch(/different record|does not show/);
    expect(emitted.reason).toMatch(/identity/i);
    expect(replayLog.filter((l) => l.startsWith('mark:')), 'replay marked a record it was never given').toEqual([]);
    expect(emittedLog.filter((l) => l.startsWith('mark:')), 'the artifact marked a record it was never given').toEqual([]);
  }, 120_000);

  /**
   * A STALE text marker (identityMarkerVerdict, src/execution/gates.ts).
   * fwgr39-n3 05-set: s_6108b1 refused the right dashboard — its url carried
   * this run's own slug — because a second marker, "Last 6 hours", was a
   * setting the page did not render. Where the url's param-filled parts name
   * this run's record, a missing marker warns and the work runs; where the
   * pattern names no record (`:id`), the markers still decide and both refuse.
   */
  it('both runners warn on a stale marker where the url names the record, and refuse where it cannot', async () => {
    const staleOf = (pattern: string) => {
      const pre = { urlPattern: pattern, requireText: ['Record {{v1}}', '{{v2}}'] };
      const params = { v1: { example: RECORDED, usedIn: [1], known: true as const }, v2: { example: 'Last 6 hours', usedIn: [], known: true as const } };
      const skill: Skill = { ...recordSkill(`${origin}/record/{{v1}}`), params, preconditions: pre };
      const spec = recordFlow(`${origin}/record/{{v1}}`);
      Object.assign(spec.steps[0], { params: { v1: RECORDED, v2: 'Last 6 hours' } });
      Object.assign(spec.steps[0].segments[0], { params, preconditions: pre });
      return { skill, spec };
    };
    const live = { v1: 'rec-77', v2: 'Last 6 hours' };

    const named = staleOf(`${origin}/record/{{v1}}`);
    const ok = await bothOf(named.skill, named.spec, live);
    expect(ok.replay.ok, ok.replay.reason ?? '').toBe(true);
    expect(ok.emitted.ok, ok.emitted.reason ?? '').toBe(true);
    expect(ok.replayLog).toEqual(['visit:rec-77', 'mark:rec-77']);
    expect(ok.emittedLog).toEqual(['visit:rec-77', 'mark:rec-77']);
    expect(ok.replay.warnings?.some((w) => /stale/.test(w))).toBe(true);
    expect(ok.emitted.warnings?.some((w) => /stale/.test(w))).toBe(true);

    const unnamed = staleOf(`${origin}/record/:id`);
    const refused = await bothOf(unnamed.skill, unnamed.spec, live);
    expect(refused.replay.ok).toBe(false);
    expect(refused.emitted.ok).toBe(false);
    expect(refused.replay.reason).toMatch(/different record|does not show/);
    expect(refused.emitted.reason).toMatch(/identity/i);
    expect(refused.replayLog.filter((l) => l.startsWith('mark:'))).toEqual([]);
    expect(refused.emittedLog.filter((l) => l.startsWith('mark:'))).toEqual([]);
  }, 180_000);

  /**
   * WHEN identity is judged, asked of a page that has not finished ARRIVING.
   *
   * fwgr47-n2 07-verify: step 1 `goto`-ed a bare dashboard url, Grafana
   * painted the title and normalised its own address bar a moment later, and
   * replay looked once — during the boot — and stopped the flow on the RIGHT
   * dashboard ("does not show 'fwgr47-n2 Bench Dashboard' … is a different
   * record"; that run's own verifier: obj 6 PASS, uid bfyfuaptu20aoa). It then
   * fell back 21 turns. The artifact never stopped there, because
   * `identityChecks` polls IDENTITY_WAIT_MS. A rule only ONE runner applies is
   * the class this harness exists to catch, so replay polls the same budget
   * (checkIdentity, src/skills/replay.ts) and both must mark the record.
   *
   * `/booting/<id>` is that page: "Loading" first, the record's name and its
   * Mark button at 700ms, and a url the page rewrites for itself. The server's
   * own mark log is the witness — no runner's report can establish it.
   */
  it('both runners wait for a page that has not finished arriving before judging its record', async () => {
    const pre = { urlPattern: `${origin}/booting/:id`, requireText: ['Record {{v1}}'] };
    const params = { v1: { example: RECORDED, usedIn: [1], known: true as const } };
    const steps = selfNavSteps(`${origin}/booting/{{v1}}`);
    const skill: Skill = { ...recordSkill(`${origin}/booting/{{v1}}`), preconditions: pre, steps };
    const spec = recordFlow(`${origin}/booting/{{v1}}`);
    Object.assign(spec.steps[0], { params: { v1: RECORDED } });
    Object.assign(spec.steps[0].segments[0], { params, preconditions: pre, steps });

    const { replay, emitted, replayLog, emittedLog } = await bothOf(skill, spec, { v1: 'rec-77' });
    expect(replay.ok, replay.reason ?? '').toBe(true);
    expect(emitted.ok, emitted.reason ?? '').toBe(true);
    // The work happened once, on this run's record, on both sides.
    expect(replayLog).toEqual(['visit:rec-77', 'mark:rec-77']);
    expect(emittedLog).toEqual(['visit:rec-77', 'mark:rec-77']);
  }, 180_000);

  /**
   * The OTHER half of that window, and the divergence the wait itself
   * introduced: the marker never renders AND the url only names the record
   * after the wait.
   *
   * Daemon replay reads the url again once its budget is spent, so the escape
   * hatch a stale marker has (urlRecordParts, identityMarkerVerdict) is
   * available to it. The artifact used to compute `urlRecordParts` BEFORE its
   * poll and, when the poll never saw the marker, throw — it never asked the
   * url again, so it stopped exactly where replay warns and proceeds. That is
   * fwgr47-n2's cause taken to its end: the hatch was shut at the first look
   * only because the app had not yet written the pattern's bound query key
   * (`rec`) into its address, which is a reason that expires.
   *
   * `/silent/<id>` is that page: "Loading" forever, its work offered from the
   * start, and its own url rewritten to `?rec=<id>` at 700ms. The server's
   * mark log is the witness.
   */
  it('both runners ask the url again once the identity wait is spent', async () => {
    const pattern = `${origin}/silent/:id?rec={{v1}}`;
    const pre = { urlPattern: pattern, requireText: ['Record {{v1}}'] };
    const params = { v1: { example: RECORDED, usedIn: [1], known: true as const } };
    const steps = selfNavSteps(`${origin}/silent/{{v1}}`);
    const skill: Skill = { ...recordSkill(`${origin}/silent/{{v1}}`), preconditions: pre, steps };
    const spec = recordFlow(`${origin}/silent/{{v1}}`);
    Object.assign(spec.steps[0], { params: { v1: RECORDED } });
    Object.assign(spec.steps[0].segments[0], { params, preconditions: pre, steps });

    const { replay, emitted, replayLog, emittedLog } = await bothOf(skill, spec, { v1: 'rec-77' });
    expect(replay.ok, replay.reason ?? '').toBe(true);
    expect(emitted.ok, emitted.reason ?? '').toBe(true);
    // Not silently: both say the marker is stale and the url answered instead.
    expect(replay.warnings?.some((w) => /stale/.test(w)), replay.warnings?.join(' | ')).toBe(true);
    expect(emitted.warnings?.some((w) => /stale/.test(w)), emitted.warnings?.join(' | ')).toBe(true);
    expect(replayLog).toEqual(['visit:rec-77', 'mark:rec-77']);
    expect(emittedLog).toEqual(['visit:rec-77', 'mark:rec-77']);
  }, 180_000);

  /**
   * F. A slot the run COULD NOT FILL, asked of a step that acts.
   *
   * `bindSkill` now leaves two adjacent slots unbound rather than guess where
   * one ends, so `fillParams` leaves `{{v2}}` standing in a step's args — and
   * "asks for no particular value", which is right for every marker CHECK
   * here, would have a `type` put those five characters into a live field.
   * The rule is one shared predicate; what each runner does about it differs
   * (replay falls back to the model, the artifact refuses at compile time),
   * which is the ordinary tier-A/tier-B split. The predicate itself must not
   * differ, so it is asked of both copies — the daemon's import and the
   * artifact's embedded source — with the same step and the same params.
   */
  it('both runners find the same unfilled slots in a step that acts', async () => {
    const emitted = emittedHelpers(scopeFlow());
    const verdict = async (step: unknown, params: Record<string, string>): Promise<string | null> => {
      const daemon = unfilledStepVerdict(step as never, params, 'step 2');
      const artifact = (await emitted.unfilledStepVerdict(step, params, 'step 2')) as string | null;
      expect(artifact, `the artifact must agree with the daemon about ${JSON.stringify(step)} / ${JSON.stringify(params)}`).toEqual(daemon);
      return daemon;
    };
    const chain = async (rungs: unknown[], params: Record<string, string>): Promise<unknown[]> => {
      const daemon = fillableChain(rungs, params);
      const artifact = (await emitted.fillableChain(rungs, params)) as unknown[];
      expect(artifact, `the artifact must agree about ${JSON.stringify(rungs)}`).toEqual(daemon);
      return daemon;
    };

    const role = { kind: 'role', role: 'textbox', name: 'e.g. Brandom Freeman' };
    const dead = { kind: 'id', selector: '#name_{{d2}}' };

    // THE FATAL CASE: the value the step acts WITH. There is no second choice —
    // the step would put the five characters `{{v2}}` into a live field.
    expect(await verdict({ args: { target: '@e1', value: '{{v2}}' }, locators: { target: [role] } }, { v1: 'a' })).toMatch(/left unbound/);
    expect(await verdict({ args: { target: '@e1', value: '{{v2}}' } }, { v2: 'Beta' })).toBeNull();
    // Bound to '' is BOUND: an unpublished reference, whose own rule is
    // url.ts's `unfilled`. The evidence is membership in params, not the text.
    expect(await verdict({ args: { value: '{{v2}}' } }, { v2: '' })).toBeNull();
    // A flow reference IS one, once it reaches the value a step acts with.
    // `fillParams` is a single pass, so `{{v2}}` bound to `{{02-create.uid}}`
    // leaves that text standing in the args — and it used to pass here, which
    // is exactly the hole fwod56 witnessed. Both readings of it agree on both
    // sides: the marker the run arrived with, and the one a param resolved to.
    expect(await verdict({ args: { url: '{{02-create.uid}}' } }, {})).toMatch(/still unresolved/);
    expect(await verdict({ args: { url: '{{v2}}' } }, { v2: '{{02-create.uid}}' })).toMatch(/\{\{02-create\.uid\}\} is still unresolved/);
    // A `{{env:NAME}}` secret is resolved at dispatch, never an unresolved
    // reference; one the environment cannot resolve is named, on both sides.
    const hadPw = process.env.BENCH_PW;
    try {
      process.env.BENCH_PW = 'pw-parity-1';
      expect(await verdict({ args: { value: '{{v2}}' } }, { v2: '{{env:BENCH_PW}}' })).toBeNull();
      expect(await verdict({ args: { value: '{{env:BENCH_PW}}' } }, {})).toBeNull();
      delete process.env.BENCH_PW;
      expect(await verdict({ args: { value: '{{v2}}' } }, { v2: '{{env:BENCH_PW}}' })).toMatch(/BENCH_PW is not set/);
    } finally {
      if (hadPw === undefined) delete process.env.BENCH_PW;
      else process.env.BENCH_PW = hadPw;
    }
    // The price of expect.ts's reading, taken knowingly and identically on
    // both sides: text that legitimately doubles a brace reads as a marker.
    // In replay that is a fallback to the model, and the artifact never calls
    // this at run time (emit.ts's unfillableStep is its compile-time twin), so
    // the cost is one recovery turn on a step no bench recording has.
    expect(await verdict({ args: { text: 'function f() {{ return 1 }}' } }, {})).toMatch(/still unresolved/);

    // THE CHAIN: a preference order. fwod34 s_eee5b1 step 2's own shape — the
    // dead rung drops, the role rung takes the step, nothing refuses.
    expect(await chain([dead, role], {})).toEqual([role]);
    expect(await verdict({ args: { target: '@e1', value: 'Beta' }, locators: { target: [dead, role] } }, {})).toBeNull();
    // Only a chain with no rung left is fatal, and then for want of a target.
    expect(await verdict({ args: { target: '@e1', value: 'Beta' }, locators: { target: [dead] } }, {})).toMatch(/no way left to name the element/);
  }, 120_000);

  /**
   * F2 (fwod56). A step whose arg RESOLVES to a placeholder, run for real.
   *
   * The witness: `10-verify` pinned the head of a 5-segment chain whose `v4`
   * held `{{05-open.quotation_reference}}`, and segment 3 of that chain types
   * `{{v4}}`. `server.ts` replays each later segment with
   * `{ ...match.params, ...derived }`, so the placeholder arrives at the
   * segment as a bound param — which is what this case hands replay directly,
   * `v1: '{{01-read.x}}'`, no flow gate in the way. `fillParams` is a single
   * pass, so the goto's url becomes `/record/{{01-read.x}}` and the old guard
   * (`name in params`) could not see it: v1 IS bound.
   *
   * Neither runner acts, EACH BY ITS OWN ROUTE, which is the ordinary
   * tier-A/tier-B split and not a divergence:
   *  - the daemon refuses at run time, from the shared verdict, and falls back
   *    to the model (no model here, so the replay simply stops);
   *  - the artifact refuses at COMPILE time with `unsourced-ref` — its
   *    `usedSlot` is chain-aware, so it sees that 02-mark's used slot is bound
   *    to an output no procedure can publish, and no artifact is written at all.
   *
   * The mutation log is the oracle on the daemon side: no `visit:` and no
   * `mark:` means nothing was dispatched, which no runner's own report can
   * establish about itself.
   */
  it('neither runner acts on a step whose arg resolves to an unpublished reference', async () => {
    // 01-read declares `x` and its procedure reads nothing — the commoner half
    // of unsourcedRef ('none'), fwkb15 and fwod52's shape.
    const blindFlow = (): SpecFlow => {
      const flow = readMarkFlow('#target');
      flow.steps[0].segments[0].steps = [MARK];
      return flow;
    };

    reset(2);
    const replay = await replayOf(markSkill(), { v1: '{{01-read.x}}' });
    const replayLog = [...fx.log];

    // The daemon: stopped before the goto, by the shared verdict.
    expect(replayLog, 'replay must not navigate to a url carrying a marker').toEqual([]);
    expect(replay.ok).toBe(false);
    expect(replay.reason, replay.reason ?? '').toMatch(/\{\{01-read\.x\}\}/);
    expect(replay.reason, replay.reason ?? '').toMatch(/still unresolved|nothing was dispatched/);

    // The artifact: refused where there is still somebody to tell.
    const { diagnostics } = emitFlowFile(blindFlow(), { tier: 'plain' });
    const unsourced = diagnostics.filter((dg) => dg.code === 'unsourced-ref');
    expect(unsourced.map((dg) => [dg.step, dg.severity]), JSON.stringify(diagnostics)).toEqual([['02-mark', 'error']]);
    expect(unsourced[0].what).toContain('{{01-read.x}}');

    // And the counterfactual, so this is not satisfied by a compiler that
    // refuses everything: the same flow with a read that CAN publish compiles.
    expect(emitFlowFile(readMarkFlow('#target'), { tier: 'plain' }).diagnostics.filter((dg) => dg.severity === 'error')).toEqual([]);
  }, 120_000);

  /**
   * C06, the identity gate on both sides, run as code against a real DOM.
   *
   * The artifact's identity gate is `presentOnPage(page, [marker], { whole })`
   * — the SAME function the daemon's checkIdentity calls, embedded — over a
   * snapshot capture whose lines carry a field's VALUE after the colon (an odoo
   * form in edit mode shows the marker only as an <input>'s value; cloud run
   * sp5odb died on exactly that when the artifact asked getByText instead).
   * Both runners are asked the same questions of the same page, from their own
   * copy: the daemon's import, and the artifact's embedded source.
   */
  it('both runners bound an identity marker the same way, in text and in a field value', async () => {
    const emitted = emittedHelpers(scopeFlow());
    const shows = (page: unknown, marker: string, whole: boolean) => emitted.presentOnPage(page, [marker], { whole });

    const session = new BrowserSession({ session: `parity-present-${Date.now()}`, persist: false });
    try {
      const page = await session.getPage();
      const both = async (marker: string, whole: boolean) => {
        const daemon = await presentOnPage(page, [marker], { whole });
        const artifact = await shows(page, marker, whole);
        expect(artifact, `the artifact must agree with the daemon about ${JSON.stringify(marker)} (whole=${whole})`).toBe(daemon);
        return daemon;
      };

      await page.setContent('<table><tr><td>312</td></tr></table>');
      expect(await both('12', true), '312 is not order 12').toBe(false);
      expect(await both('12', false), 'the unbounded dialect is unchanged').toBe(true);

      await page.setContent('<table><tr><td>Order 12</td></tr></table>');
      expect(await both('Order 12', true)).toBe(true);
      await page.setContent('<table><tr><td>Order\n   12</td></tr></table>');
      expect(await both('Order 12', true), 'whitespace-insensitive on both sides').toBe(true);

      // The field dialect: the marker is only an <input>'s value, and the DOM
      // has no text node for it at all. The snapshot line carries it.
      await page.setContent('<label>Name <input value="12"></label>');
      expect(await both('12', true)).toBe(true);
      await page.setContent('<label>Name <input value="312"></label>');
      expect(await both('12', true)).toBe(false);

      // The shape this defect actually takes on the published stores.
      await page.setContent('<table><tr><td>fwgr25-n10 Bench Customer</td></tr></table>');
      expect(await both('fwgr25-n1', true)).toBe(false);
      await page.setContent('<table><tr><td>fwgr25-n1 Bench Customer</td></tr></table>');
      expect(await both('fwgr25-n1', true)).toBe(true);

      // And the dialect itself: a marker in a role-less <div> is NOT on the
      // page in the snapshot dialect — the daemon never saw such text, and the
      // artifact's old getByText-based `present` did. Same answer now.
      await page.setContent('<div>fwgr25-n1 Bench Customer</div>');
      expect(await both('fwgr25-n1', true), 'no roled line shows it').toBe(false);
    } finally {
      await session.close();
    }
  }, 120_000);

  /**
   * C06, as a parity case rather than a replay case.
   *
   * "Is this record already in the goal state?" is a gate, not an action, so
   * no mutation log can catch a disagreement about it — and the two runners
   * did disagree. Replay learned to require the identity and the goal to hold
   * inside ONE record's container; the emitted artifact went on checking both
   * page-wide, so a compiled spec skipped a step because some OTHER row had
   * reached the state this one was supposed to reach.
   *
   * The artifact's whole guard (`satisfied`, run from the artifact with the
   * embedded snapshot module it is built on) and the daemon's `goalSatisfied`
   * are run against the same live DOM and must return the same answer. A gate
   * that only one runner applies is the same class of defect as an action only
   * one runner performs.
   */
  it('both runners refuse a goal satisfied by a different record on the same list', async () => {
    const emitted = emittedHelpers(scopeFlow());
    const emittedSatisfied = (page: unknown, identity: string[], goal: string[]) => emitted.satisfied(page, identity, goal) as Promise<boolean>;

    const session = new BrowserSession({ session: `parity-scope-${Date.now()}`, persist: false });
    try {
      const page = await session.getPage();
      await page.goto(`${origin}/`);
      await page.evaluate(() => {
        const table = document.createElement('table');
        table.id = 'orders';
        table.innerHTML =
          '<tbody>' +
          '<tr><td>S00039</td><td>Pending</td></tr>' +
          '<tr><td>S00040</td><td>Cancelled</td></tr>' +
          '</tbody>';
        document.body.append(table);
      });
      // Named apart from the harness's own skillOf, which builds the loop
      // contract: this one is just the identity/goal pair the gate reads.
      const orderSkill = {
        preconditions: { urlPattern: `${origin}/`, requireText: ['{{v1}}'] },
        goal: { requireText: ['Cancelled'] },
      };

      // S00039 is Pending. Only S00040 is Cancelled.
      const replayPending = (await goalSatisfied(page, orderSkill, { v1: 'S00039' })).satisfied;
      const emittedPending = await emittedSatisfied(page, ['S00039'], ['Cancelled']);
      expect(replayPending).toBe(false);
      expect(emittedPending).toBe(false);

      // S00040 genuinely is, in its own row — neither may refuse that.
      const replayDone = (await goalSatisfied(page, orderSkill, { v1: 'S00040' })).satisfied;
      const emittedDone = await emittedSatisfied(page, ['S00040'], ['Cancelled']);
      expect(replayDone).toBe(true);
      expect(emittedDone).toBe(true);

      // A neighbouring id: S0004 is not S00040 on either side.
      expect((await goalSatisfied(page, orderSkill, { v1: 'S0004' })).satisfied).toBe(false);
      expect(await emittedSatisfied(page, ['S0004'], ['Cancelled'])).toBe(false);

      // A detail page is not a list: nothing repeats, so page-wide agreement
      // is the right answer and both must give it.
      await page.evaluate(() => {
        document.getElementById('orders')?.remove();
        const h = document.createElement('h2');
        h.textContent = 'Order S00039';
        const status = document.createElement('button');
        status.type = 'button';
        status.textContent = 'Cancelled';
        document.body.append(h, status);
      });
      expect((await goalSatisfied(page, orderSkill, { v1: 'S00039' })).satisfied).toBe(true);
      expect(await emittedSatisfied(page, ['S00039'], ['Cancelled'])).toBe(true);
    } finally {
      await session.close();
    }
  }, 120_000);

  // -------------------------------------------------------------------------
  // loops
  // -------------------------------------------------------------------------

  /**
   * C05 / gap 7. A loop guard is an ORDERED chain, not a union.
   *
   * The recorded guard's primary names the records this run is about — the two
   * rows the recording worked — and its fallback is the generic `button
   * "Mark"` on every row. Replay resolves the chain first-match: the primary
   * matches, so the guard counts two and the loop marks two. The artifact used
   * to emit the chain as `primary.or(fallback)` and count the UNION, which is
   * every row on the page — so the same contract drained rows the recording
   * never claimed, and the two runners disagreed about how much work the
   * procedure was.
   *
   * The mutation log is the oracle: the property under test is WHICH records
   * were marked, which neither runner's own report can establish about itself.
   */
  it('both runners take a loop guard at its first matching candidate, not the union', async () => {
    const target = [
      { kind: 'css' as const, selector: '.mark[data-id="Item 1"], .mark[data-id="Item 2"]' },
      { kind: 'role' as const, role: 'button', name: 'Mark' },
    ];
    const markLoop: SkillStep[] = [
      { tool: 'loop', args: {}, locators: {}, while: target, max: 6, body: [{ tool: 'click', args: { target: '@e1' }, locators: { target } }] },
    ];
    const { replay, emitted, replayLog, emittedLog } = await both(markLoop, 3);

    expect(replay.ok, replay.reason ?? '').toBe(true);
    expect(emitted.ok, emitted.reason ?? '').toBe(true);
    // Item 3 matches the generic fallback and nothing else: a union guard
    // would have counted it, visited it, and marked it.
    expect(replayLog.sort()).toEqual(['mark:Item 1', 'mark:Item 2']);
    expect(emittedLog.sort()).toEqual(['mark:Item 1', 'mark:Item 2']);
  }, 120_000);

  // -------------------------------------------------------------------------
  // gates
  // -------------------------------------------------------------------------

  /**
   * One shared verdict per gate (src/execution/gates.ts), called by both
   * runners. Each case below is a rule that used to apply on one side only —
   * the artifact ran on with a rejection toast showing, ran a segment on
   * whatever page it was given, and stopped where replay proceeds on a
   * volatile url segment. The mutation log is the oracle throughout.
   */
  /** A procedure with its own start pattern, as both runners see it. */
  const startingAt = (urlPattern: string, steps: SkillStep[]): { skill: Skill; spec: SpecFlow } => {
    const skill: Skill = { ...skillOf(steps), preconditions: { urlPattern } };
    const spec = specOf(steps);
    spec.steps[0].segments[0].preconditions = { urlPattern };
    return { skill, spec };
  };

  /** Daemon replay with the browser started at `startAt`; the replay's warnings come back too. */
  async function replayAt(skill: Skill, startAt: string): Promise<Outcome & { warnings: string[]; similarity?: number | null }> {
    const session = new BrowserSession({ session: `parity-gate-replay-${Date.now()}`, persist: false, learn: true });
    try {
      const page = await session.getPage();
      await page.goto(startAt);
      session.learn!.put(skill);
      const out = await executeTool(session, 'run_skill', { id: skill.id, params: {} }, os.tmpdir());
      const replay = out.replay as ReplayResult | undefined;
      if (!replay) return { ok: false, reason: `run_skill returned no replay: ${out.result}`, outputs: {}, warnings: [] };
      return { ok: replay.ok, reason: replay.reason ?? null, outputs: replay.values, warnings: replay.warnings, similarity: replay.similarity };
    } finally {
      await session.close();
    }
  }

  /**
   * The artifact's step bodies with the browser started at `startAt`. Its
   * soft findings are `[sitelooper warn]` console lines (logWarning), the
   * one shape the file reports them in; they are collected here so a
   * "continued with a warning" verdict can be compared with replay's.
   */
  async function emittedAt(spec: SpecFlow, startAt: string): Promise<Outcome & { warnings: string[] }> {
    const mod = await moduleOf(spec);
    const warnings: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => {
      const line = args.map(String).join(' ');
      if (line.startsWith('[sitelooper warn]')) warnings.push(line);
      else log(...args);
    };
    const session = new BrowserSession({ session: `parity-gate-spec-${Date.now()}`, persist: false });
    try {
      const page = await session.getPage();
      await page.goto(startAt);
      const run = mod.createFlowRun();
      for (const id of mod.flowStepIds) {
        await mod.steps[id](page, {}, run.outputs, run);
      }
      return { ok: true, reason: null, outputs: run.outputs as Record<string, string>, warnings };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err), outputs: {}, warnings };
    } finally {
      console.log = log;
      await session.close();
    }
  }

  /**
   * The recorded page fingerprint, taken the way the recorder takes it: the
   * shared fingerprintPage on the live fixture page (src/agent/loop.ts at an
   * instruction's start, src/agent/tools.ts at a seam).
   */
  async function fingerprintOf(url: string): Promise<number[]> {
    const session = new BrowserSession({ session: `parity-fp-${Date.now()}`, persist: false });
    try {
      const page = await session.getPage();
      await page.goto(url);
      const vector = await fingerprintPage(page);
      if (!vector) throw new Error(`could not fingerprint ${url}`);
      return vector;
    } finally {
      await session.close();
    }
  }

  /** `startingAt`, with the recorded fingerprint on both the skill and the spec segment. */
  const fingerprintedAt = (urlPattern: string, fingerprint: number[], steps: SkillStep[]): { skill: Skill; spec: SpecFlow } => {
    const { skill, spec } = startingAt(urlPattern, steps);
    skill.preconditions = { urlPattern, fingerprint };
    spec.steps[0].segments[0].preconditions = { urlPattern, fingerprint };
    return { skill, spec };
  };

  describe('gates', () => {
    /** On a one-item list page the Mark and Remove buttons are each unique. */
    const REMOVE: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Remove' }] } };

    /**
     * G01. An UNRECORDED alert stops the step before the next mutation.
     *
     * The server refuses the Mark and the page raises a `[role=alert]` toast
     * the recording never saw; the page is otherwise untouched, so a runner
     * judging by its recorded effects alone sees nothing wrong and goes on to
     * Remove the item. The daemon's unrecordedAlert gate stopped there; the
     * artifact had only a comment. Both must now stop, and the log — no
     * `mark:` (refused) and no `delete:` — is the proof that neither pressed on.
     */
    it('both runners stop on an alert the recording never saw, before the next mutation', async () => {
      const steps = [MARK, REMOVE];

      reset(1);
      fx.faults.rejectWrite(409, { pathPrefix: '/mark/' });
      const replay = await replayOf(skillOf(steps));
      const replayLog = [...fx.log];
      reset(1);
      fx.faults.rejectWrite(409, { pathPrefix: '/mark/' });
      const emitted = await emittedOf(specOf(steps));
      const emittedLog = [...fx.log];

      expect(replayLog, 'replay must not act past a rejection toast').toEqual([]);
      expect(emittedLog, 'the artifact must not act past a rejection toast').toEqual([]);
      expect(fx.items).toHaveLength(1);
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      expect(replay.reason).toMatch(/raised an alert the recording never saw: Mark rejected: Item 1/);
      expect(emitted.reason).toMatch(/raised an alert the recording never saw: Mark rejected: Item 1/);

      // Without which the case is satisfied by a gate that always stops: the
      // same two steps with the write accepted raise no toast, and both runners
      // do both mutations, once each.
      const clear = await both(steps, 1);
      expect(clear.replay.ok, clear.replay.reason ?? '').toBe(true);
      expect(clear.emitted.ok, clear.emitted.reason ?? '').toBe(true);
      expect(clear.replayLog).toEqual(['mark:Item 1', 'delete:Item 1']);
      expect(clear.emittedLog).toEqual(['mark:Item 1', 'delete:Item 1']);
    }, 180_000);

    /**
     * G01b. The refusal a step exists to provoke is EXPECTED, once compile
     * keeps it (repairdesk fwrd83-n1 06-change). The recording saw the toast
     * and read it back, its first line published on its own; FIX P's cut once
     * took that line for a value inside the alert, cut the expectation to
     * nothing, and both runners then stopped on the refusal as an alert the
     * recording never saw. Compiled from such a recording, the Mark's alert
     * is expected, and both runners go on to Remove.
     */
    it('both runners expect a recorded refusal whose first line the reads published', async () => {
      const url = `${origin}/`;
      const alertRead = (label: string | undefined, result: unknown, tool = 'read'): RecordedStep => ({
        k: 'step',
        tool,
        args: { target: '[role=alert]', what: 'text', ...(label ? { label } : {}) },
        locators: { target: { expr: 'x', verified: true, raw: '[role=alert]', chain: [{ kind: 'css', selector: '[role=alert]' }] } },
        result: JSON.stringify(result),
        ...(label ? { label } : {}),
      });
      const click = (name: string, alerts: string[] = []): RecordedStep => ({
        k: 'step',
        tool: 'click',
        args: { target: '@e1' },
        locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name }] } },
        diff: { url, alerts, added: [], dialect: 2 },
      });
      const entries: RecordedEntry[] = [
        { k: 'instruction', text: 'mark the item, report the refusal, then remove it', url },
        click('Mark', ['Mark rejected: Item 1']),
        alertRead(undefined, ['Mark rejected:\nItem 1'], 'read_all'),
        alertRead('refusal_head', 'Mark rejected:'),
        click('Remove'),
      ];
      const compiled = compileSkills({ entries, instruction: 'mark the item, report the refusal, then remove it', report: { status: 'success', summary: 'refused', evidence: { values: { refusal_head: 'Mark rejected:' } } }, session: 's' });
      const steps = compiled.flatMap((sk) => sk.steps);
      expect(steps[0].expect?.alertContains).toBe('Mark rejected: Item 1');

      reset(1);
      fx.faults.rejectWrite(409, { pathPrefix: '/mark/' });
      const replay = await replayOf(skillOf(steps));
      const replayLog = [...fx.log];
      reset(1);
      fx.faults.rejectWrite(409, { pathPrefix: '/mark/' });
      const emitted = await emittedOf(specOf(steps));
      const emittedLog = [...fx.log];
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual(['delete:Item 1']);
      expect(emittedLog).toEqual(['delete:Item 1']);
    }, 180_000);

    /**
     * G00. A dismissal of a dialog NOTHING in the procedure opened (fwop1:
     * OpenProject's first-login "Welcome" dialog, raised by sign-in, closed by
     * the next segment's first click). Recorded with the removal it made, the
     * Close is conditional: skipped as already in effect when the dialog is
     * not on the page, clicked when it is — and a confirm is never skipped
     * that way, missing dialog or not. The Mark log proves each leg went on,
     * or stopped, before the next mutation.
     */
    it('both runners skip a dismissal whose dialog is not open, click it when it is, and never skip a confirm', async () => {
      const dismiss = (name: string, dialog: string): SkillStep => ({
        tool: 'click',
        args: { target: '@e9' },
        locators: { target: [{ kind: 'role', role: 'button', name }] },
        expect: { urlPattern: `${origin}/`, removedContains: [`- dialog "${dialog}"`, `- button "${name}"`] },
      });
      const CLOSE = dismiss('Close', 'Welcome to the app');

      const absent = await both([CLOSE, MARK], 1);
      expect(absent.replay.ok, absent.replay.reason ?? '').toBe(true);
      expect(absent.emitted.ok, absent.emitted.reason ?? '').toBe(true);
      expect(absent.replayLog).toEqual(['mark:Item 1']);
      expect(absent.emittedLog).toEqual(['mark:Item 1']);
      expect(absent.replay.warnings?.join(' ')).toMatch(/closes the dialog "Welcome to the app".*already in effect/);

      // The dialog on the page: the Close is clicked (and removes it), not skipped.
      const withDialog: PageHook = (page) =>
        page.addInitScript(() => {
          document.addEventListener('DOMContentLoaded', () => {
            const dialog = document.createElement('div');
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-label', 'Welcome to the app');
            const close = document.createElement('button');
            close.type = 'button';
            close.textContent = 'Close';
            close.addEventListener('click', () => dialog.remove());
            dialog.append(close);
            document.body.append(dialog);
          });
        });
      reset(1);
      const replayPresent = await replayOf(skillOf([CLOSE, MARK]), {}, withDialog);
      const replayPresentLog = [...fx.log];
      reset(1);
      const emittedPresent = await emittedOf(specOf([CLOSE, MARK]), {}, withDialog);
      const emittedPresentLog = [...fx.log];
      expect(replayPresent.ok, replayPresent.reason ?? '').toBe(true);
      expect(emittedPresent.ok, emittedPresent.reason ?? '').toBe(true);
      expect(replayPresent.warnings?.join(' ')).not.toMatch(/already in effect/);
      expect(replayPresentLog).toEqual(['mark:Item 1']);
      expect(emittedPresentLog).toEqual(['mark:Item 1']);

      // A confirm whose dialog did not appear is a stop in both, before Mark.
      const confirm = await both([dismiss('Remove permanently', 'Remove this item?'), MARK], 1);
      expect(confirm.replay.ok).toBe(false);
      expect(confirm.emitted.ok).toBe(false);
      expect(confirm.replayLog).toEqual([]);
      expect(confirm.emittedLog).toEqual([]);
    }, 180_000);

    /**
     * G01b. An unrecorded alert beside a CONFIRMED effect is reported, and the
     * run goes on. fwgr34: the page a step landed on rendered an alert its
     * recording's after-look had come too early to see. An alert alone cannot
     * say whether it is the app refusing the step or ambient page content, so
     * the step's own state evidence decides: Mark's recorded "Marked Item 1"
     * appeared in what the action added, so both runners warn and mark again.
     * The same page with Mark refused shows the alert and no heading: the
     * page-change gate stops that, before the second Mark. And the same step
     * with nothing recorded to confirm it still stops on the alert (G01).
     */
    /**
     * G01c. A NAVIGATION that raises an alert the recording never saw. The
     * executor diffs no goto, and replay read that as "no alert": fwod45-n3's
     * goto to a record the reset had deleted landed on the list under "Can't
     * fetch record(s) 22" and ran on at tier A, reading garbage off the list,
     * while the compiled script stopped. Both runners must stop before Mark.
     */
    it('both runners stop on an alert a goto raised that the recording never saw, before the next mutation', async () => {
      const goto: SkillStep = { tool: 'goto', args: { url: `${origin}/gone` }, locators: {} };
      const { replay, emitted, replayLog, emittedLog } = await both([goto, MARK], 0);
      expect(replayLog, 'replay must not act past an alert its goto raised').toEqual([]);
      expect(emittedLog, 'the artifact must not act past an alert its goto raised').toEqual([]);
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      const said = /raised an alert the recording never saw: Can't fetch record\(s\) 22/;
      expect(replay.reason).toMatch(said);
      expect(emitted.reason).toMatch(said);
    }, 120_000);

    /**
     * G01d. A goto the app answered with ANOTHER VIEW, silently: sent to the
     * form, landed on the list. Both runners stop before Mark; a goto whose
     * landing only differs by a redirect elsewhere in the url goes on.
     */
    it('both runners stop when a goto lands on another view of what it asked for, before the next mutation', async () => {
      const goto: SkillStep = { tool: 'goto', args: { url: `${origin}/views#view_type=form&id=22` }, locators: {} };
      const { replay, emitted, replayLog, emittedLog } = await both([goto, MARK], 0);
      expect(replayLog, 'replay must not act on the view it was not given').toEqual([]);
      expect(emittedLog, 'the artifact must not act on the view it was not given').toEqual([]);
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      const said = /navigated but landed on another view: view_type=list where it was sent to view_type=form/;
      expect(replay.reason).toMatch(said);
      expect(emitted.reason).toMatch(said);
    }, 120_000);

    it("both runners report an unrecorded alert and go on when the step's recorded change confirmed it, and stop when nothing does", async () => {
      const markAmbient = (expectHeading: boolean): SkillStep => ({
        tool: 'click',
        args: { target: '@e1' },
        locators: { target: [{ kind: 'role', role: 'button', name: 'Mark' }] },
        ...(expectHeading ? { expect: { addedContains: ['- heading "Marked Item 1"'] } } : {}),
      });
      const goto: SkillStep = { tool: 'goto', args: { url: `${origin}/ambient` }, locators: {} };

      const confirmed = await both([goto, markAmbient(true), markAmbient(false)], 0);
      expect(confirmed.replay.ok, confirmed.replay.reason ?? '').toBe(true);
      expect(confirmed.emitted.ok, confirmed.emitted.reason ?? '').toBe(true);
      expect(confirmed.replayLog).toEqual(['mark:Item 1', 'mark:Item 1']);
      expect(confirmed.emittedLog).toEqual(['mark:Item 1', 'mark:Item 1']);
      const reported = /raised an alert the recording never saw: Error loading feed — reported, not stopped/;
      expect(confirmed.replay.warnings?.some((w) => reported.test(w)), JSON.stringify(confirmed.replay.warnings)).toBe(true);
      expect(confirmed.emitted.warnings?.some((w) => reported.test(w)), JSON.stringify(confirmed.emitted.warnings)).toBe(true);

      // Refused: the alert again, and the recorded heading nowhere — the page-change gate stops it.
      reset(0);
      fx.faults.rejectWrite(409, { pathPrefix: '/mark/' });
      const refusedReplay = await replayOf(skillOf([goto, markAmbient(true), markAmbient(false)]));
      const refusedReplayLog = [...fx.log];
      reset(0);
      fx.faults.rejectWrite(409, { pathPrefix: '/mark/' });
      const refusedEmitted = await emittedOf(specOf([goto, markAmbient(true), markAmbient(false)]));
      const refusedEmittedLog = [...fx.log];
      expect(refusedReplay.ok).toBe(false);
      expect(refusedEmitted.ok).toBe(false);
      expect(refusedReplay.reason).toMatch(/none of the 1 recorded page change\(s\) appeared/);
      expect(refusedEmitted.reason).toMatch(/the recorded page change did not appear|none of the 1 recorded page change\(s\) appeared/);
      expect(refusedReplayLog).toEqual([]);
      expect(refusedEmittedLog).toEqual([]);

      // Nothing recorded to confirm the step: the alert is the only evidence, and it stops.
      const unconfirmed = await both([goto, markAmbient(false), markAmbient(false)], 0);
      expect(unconfirmed.replay.ok).toBe(false);
      expect(unconfirmed.emitted.ok).toBe(false);
      expect(unconfirmed.replay.reason).toMatch(/raised an alert the recording never saw: Error loading feed/);
      expect(unconfirmed.emitted.reason).toMatch(/raised an alert the recording never saw: Error loading feed/);
      expect(unconfirmed.replayLog).toEqual(['mark:Item 1']);
      expect(unconfirmed.emittedLog).toEqual(['mark:Item 1']);
    }, 240_000);

    /**
     * G02. A segment started on the WRONG page is refused before its first
     * step acts. The procedure starts from a record's edit page; the browser is
     * on the list, which shows a Mark button of its own — so a runner that
     * skipped the precondition would resolve the locator and mark the wrong
     * thing. Replay refused; the artifact had the precondition as a comment.
     */
    it('both runners refuse a segment started on the wrong page, with no mutation', async () => {
      const { skill, spec } = startingAt(`${origin}/record/:id/edit`, [MARK]);
      reset(1);
      const replay = await replayAt(skill, `${origin}/`);
      const replayLog = [...fx.log];
      reset(1);
      const emitted = await emittedAt(spec, `${origin}/`);
      const emittedLog = [...fx.log];

      expect(replayLog, 'replay must not act on a page the procedure does not start from').toEqual([]);
      expect(emittedLog, 'the artifact must not act on a page the procedure does not start from').toEqual([]);
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      const refused = /not on the page this procedure starts from \(expects \S+\/record\/:id\/edit, browser is at \S+\/\)/;
      expect(replay.reason).toMatch(refused);
      expect(emitted.reason).toMatch(refused);
      expect(emitted.reason).toContain('01-clear s_parity');
    }, 120_000);

    /**
     * G03. A SOFT url mismatch — one literal segment differs, same page shape —
     * is an environment-minted id, not a wrong page: replay proceeds on it with
     * a warning (mechanism 2), and the artifact must proceed exactly there
     * rather than refuse. No fingerprint on either side, so the url decides
     * alone. Both do the work, once, on the record the browser is actually on,
     * and both say why they went on.
     */
    it('both runners continue past a one-segment url mismatch, with a warning, and act on the live record', async () => {
      const { skill, spec } = startingAt(`${origin}/record/rec-1`, [MARK]);
      reset(0);
      const replay = await replayAt(skill, `${origin}/record/rec-2`);
      const replayLog = [...fx.log];
      reset(0);
      const emitted = await emittedAt(spec, `${origin}/record/rec-2`);
      const emittedLog = [...fx.log];

      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual(['visit:rec-2', 'mark:rec-2']);
      expect(emittedLog).toEqual(['visit:rec-2', 'mark:rec-2']);
      const said = /start url differs from the recorded pattern in 1 segment\(s\) \(rec-1→rec-2\) — proceeding optimistically/;
      expect(replay.warnings.some((w) => said.test(w)), replay.warnings.join('\n')).toBe(true);
      expect(emitted.warnings.some((w) => said.test(w) && w.startsWith('[sitelooper warn] 01-clear s_parity:')), emitted.warnings.join('\n')).toBe(true);
    }, 120_000);

    /**
     * G04. The same one-segment url mismatch as G03, but the recording KEPT a
     * page fingerprint — of the record page itself. Replay measures the live
     * page against it and, the structure agreeing, proceeds with a warning;
     * the artifact carries the vector, takes the same measurement with the
     * embedded fingerprintPage, and must proceed too. (Before the vector
     * travelled the artifact refused here, 'unmeasured', while replay went on.)
     */
    it('both runners continue past a one-segment url mismatch on a structurally identical page, measured against the recorded fingerprint', async () => {
      reset(0);
      const recorded = await fingerprintOf(`${origin}/record/rec-1`);
      const { skill, spec } = fingerprintedAt(`${origin}/record/rec-1`, recorded, [MARK]);
      reset(0);
      const replay = await replayAt(skill, `${origin}/record/rec-2`);
      const replayLog = [...fx.log];
      reset(0);
      const emitted = await emittedAt(spec, `${origin}/record/rec-2`);
      const emittedLog = [...fx.log];

      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual(['visit:rec-2', 'mark:rec-2']);
      expect(emittedLog).toEqual(['visit:rec-2', 'mark:rec-2']);
      const said = /start url differs from the recorded pattern in 1 segment\(s\) \(rec-1→rec-2\) — proceeding optimistically/;
      expect(replay.warnings.some((w) => said.test(w)), replay.warnings.join('\n')).toBe(true);
      expect(emitted.warnings.some((w) => said.test(w) && w.startsWith('[sitelooper warn] 01-clear s_parity:')), emitted.warnings.join('\n')).toBe(true);
      // Measured, not merely unmeasurable: a silent null measurement lets the
      // url alone decide, and a soft match proceeds just the same. Replay's
      // number is on its ReplayResult; the artifact's proceed warning carries
      // none (G05 proves both runners produce the same number from this vector).
      expect(typeof replay.similarity, 'replay must have measured the live page against the recorded fingerprint').toBe('number');
      expect(replay.similarity!).toBeGreaterThanOrEqual(SOFT_MATCH_MIN_SIMILARITY);
    }, 180_000);

    /**
     * G05. The same mismatch, but the recorded fingerprint is of a DIFFERENT
     * template (the fixture's project form): the url shape is close, the page
     * structure is not. Both runners must refuse before Mark, name the same
     * similarity, and the log must hold nothing but the harness's own visit.
     */
    it('both runners refuse the same url mismatch when the page structure differs from the recorded fingerprint, with no mutation', async () => {
      reset(0);
      const recorded = await fingerprintOf(`${origin}/project/open`);
      const { skill, spec } = fingerprintedAt(`${origin}/record/rec-1`, recorded, [MARK]);
      reset(0);
      const replay = await replayAt(skill, `${origin}/record/rec-2`);
      const replayLog = [...fx.log];
      reset(0);
      const emitted = await emittedAt(spec, `${origin}/record/rec-2`);
      const emittedLog = [...fx.log];

      expect(replayLog, 'replay must not act on a page of another template').toEqual(['visit:rec-2']);
      expect(emittedLog, 'the artifact must not act on a page of another template').toEqual(['visit:rec-2']);
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      const refused = /not on the page this procedure starts from \(expects \S+\/record\/rec-1, browser is at \S+\/record\/rec-2; the url shape is close but the page structure is not — similarity (\d(?:\.\d+)?)\)/;
      expect(replay.reason).toMatch(refused);
      expect(emitted.reason).toMatch(refused);
      expect(emitted.reason).toContain('01-clear s_parity');
      // one measurement, one number: the same similarity on both sides, under the threshold
      const replaySimilarity = Number(refused.exec(replay.reason!)![1]);
      expect(Number(refused.exec(emitted.reason!)![1])).toBe(replaySimilarity);
      expect(replaySimilarity).toBeLessThan(SOFT_MATCH_MIN_SIMILARITY);
    }, 180_000);

    /**
     * G05b. A STRICT url match that only holds because the query rule lets a
     * one-sided key pass: the recording started in another view of the page
     * (`?view=json`, as fwgr36's s_c0cdad started in grafana's
     * `editview=json-model`) and its fingerprint is of a different template.
     * The key is taken on trust only while the page measures close; here it
     * does not, so both refuse before Mark and name the key.
     */
    it('both runners refuse a strict url match that holds only by a one-sided query key when the page structure differs', async () => {
      reset(0);
      const recorded = await fingerprintOf(`${origin}/project/open`);
      const { skill, spec } = fingerprintedAt(`${origin}/record/rec-1?view=json`, recorded, [MARK]);
      reset(0);
      const replay = await replayAt(skill, `${origin}/record/rec-1`);
      const replayLog = [...fx.log];
      reset(0);
      const emitted = await emittedAt(spec, `${origin}/record/rec-1`);
      const emittedLog = [...fx.log];

      expect(replayLog, 'replay must not act on another view of the page').toEqual(['visit:rec-1']);
      expect(emittedLog, 'the artifact must not act on another view of the page').toEqual(['visit:rec-1']);
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      const refused = /the urls differ only in query key\(s\) view, and the page structure is not the recorded one — similarity (\d(?:\.\d+)?), so this is another view of the page\)/;
      expect(replay.reason).toMatch(refused);
      expect(emitted.reason).toMatch(refused);
      expect(Number(refused.exec(emitted.reason!)![1])).toBe(Number(refused.exec(replay.reason!)![1]));
    }, 180_000);

    /**
     * G05c. fwgr49 03-open: THREE positions disagree on the same page — the
     * record id in the path and both halves of a `from`/`to` range — and the
     * recording kept a fingerprint of that very page. url.ts's default budget
     * of two refused this on the COUNT alone, while the same round's sibling
     * skill, which carried the id in a derived slot and so had two diffs,
     * soft-matched and ran. The count is a proxy for "is this a different
     * page?"; preconditionVerdict holds the real measurement and requires it,
     * so it spends more of the budget. Both runners must now proceed here, and
     * act on the record the browser is actually on.
     */
    it('both runners continue past a three-position url mismatch on a structurally identical page, measured against the recorded fingerprint', async () => {
      const recordedRange = 'from=1758041804986&to=1758063404986';
      const liveRange = 'from=1758043192873&to=1758064792873';
      // The fixture's record page takes everything after /record/ as the id, so
      // the live id — and the log lines — carry the query with them.
      const liveId = `rec-2?${liveRange}`;
      reset(0);
      const recorded = await fingerprintOf(`${origin}/record/rec-1?${recordedRange}`);
      const { skill, spec } = fingerprintedAt(`${origin}/record/rec-1?${recordedRange}`, recorded, [MARK]);
      reset(0);
      const replay = await replayAt(skill, `${origin}/record/${liveId}`);
      const replayLog = [...fx.log];
      reset(0);
      const emitted = await emittedAt(spec, `${origin}/record/${liveId}`);
      const emittedLog = [...fx.log];

      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual([`visit:${liveId}`, `mark:${liveId}`]);
      expect(emittedLog).toEqual([`visit:${liveId}`, `mark:${liveId}`]);
      const said = /start url differs from the recorded pattern in 3 segment\(s\) \(rec-1→rec-2, 1758041804986→1758043192873, 1758063404986→1758064792873\) — proceeding optimistically/;
      expect(replay.warnings.some((w) => said.test(w)), replay.warnings.join('\n')).toBe(true);
      expect(emitted.warnings.some((w) => said.test(w) && w.startsWith('[sitelooper warn] 01-clear s_parity:')), emitted.warnings.join('\n')).toBe(true);
      // Measured, and measured as the same page: the larger budget is spent
      // only because this verdict required the structure to agree.
      expect(typeof replay.similarity, 'replay must have measured the live page against the recorded fingerprint').toBe('number');
      expect(replay.similarity!).toBeGreaterThanOrEqual(SOFT_MATCH_MIN_SIMILARITY);
    }, 180_000);

    /**
     * G05d. The negative the budget must never reach: three positions again,
     * but one of them is a WORD the application chose (`success` against
     * `failure`), which softUrlMatch refuses PER DIFF, at any budget. Both
     * runners must refuse before Mark — a generalisation here would teach the
     * gate to accept either outcome page forever after. No fingerprint on
     * either side, so the url is refusing this on its own, and the message
     * carries no structural `because`.
     */
    it('both runners still refuse a url mismatch at a WORD position, however many positions the budget allows', async () => {
      const { skill, spec } = startingAt(`${origin}/outcome/success?from=1000&to=2000`, [MARK]);
      reset(0);
      const replay = await replayAt(skill, `${origin}/outcome/failure?from=1100&to=2100`);
      const replayLog = [...fx.log];
      reset(0);
      const emitted = await emittedAt(spec, `${origin}/outcome/failure?from=1100&to=2100`);
      const emittedLog = [...fx.log];

      expect(replayLog, 'replay must not mark the outcome page it was not recorded on').toEqual([]);
      expect(emittedLog, 'the artifact must not mark the outcome page it was not recorded on').toEqual([]);
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      const refused = /not on the page this procedure starts from \(expects \S+\/outcome\/success\?from=1000&to=2000, browser is at \S+\/outcome\/failure\?from=1100&to=2100\)/;
      expect(replay.reason).toMatch(refused);
      expect(emitted.reason).toMatch(refused);
      expect(emitted.reason).toContain('01-clear s_parity');
    }, 120_000);
  });

  // -------------------------------------------------------------------------
  // content expectations
  // -------------------------------------------------------------------------

  /**
   * One content-expectation verdict (expectedChangesVerdict, src/execution/
   * expect.ts) over one observation dialect (capturePageLines, src/execution/
   * snapshot.ts), called by both runners. The artifact used to rebuild each
   * recorded line as a Playwright locator and assert it visible — a check that
   * never looked past the line's NAME — and had no notion of a recorded dialog
   * that legitimately did not open. The mutation log is the oracle throughout:
   * what the application did, not what either runner said about itself.
   */
  describe('content expectations', () => {
    /** A procedure with its own params, navigating to its own page, as both runners see it. */
    const procedure = (id: string, template: string, steps: SkillStep[], startPattern: string): { skill: Skill; spec: SpecFlow } => {
      const params: Record<string, SkillParam> = { v1: { example: 'Gamma', usedIn: [2], known: true } };
      const skill: Skill = { ...skillOf(steps), id, template, params, preconditions: { urlPattern: startPattern } };
      const spec: SpecFlow = {
        version: 1,
        name: `parity-${id}`,
        origin,
        startUrl: `${origin}/`,
        vars: [],
        steps: [{ id: '01-do', instruction: template, params: { v1: 'Beta' }, outputs: [], segments: [{ id, template, params, preconditions: { urlPattern: startPattern }, steps }] }],
      };
      return { skill, spec };
    };

    /**
     * (a) The slot sits in the control's VALUE. `/project/<mode>`: a Project
     * picker and a Save button; in `locked` mode the app reverts every choice
     * to Alpha in its change handler — the select action itself succeeds, the
     * control is visible and named Project, and only the value after the
     * colon says the choice did not land. The recorded effect line is
     * `- combobox "Project": {{v1}}`. Neither runner may then Save.
     */
    const projectSteps = (mode: 'open' | 'locked'): SkillStep[] => [
      { tool: 'goto', args: { url: `${origin}/project/${mode}` }, locators: {} },
      {
        tool: 'select',
        args: { target: '@e1', option: '{{v1}}' },
        locators: { target: [{ kind: 'role', role: 'combobox', name: 'Project' }] },
        expect: { addedContains: ['- combobox "Project": {{v1}}'] },
      },
      { tool: 'click', args: { target: '@e2' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Save project' }] } },
    ];
    const project = (mode: 'open' | 'locked') => procedure('s_project', 'pick project {{v1}}', projectSteps(mode), `${origin}/project/:id`);

    it('both runners stop on a hard line whose slot is the control\'s value, when only the name matches', async () => {
      const { skill, spec } = project('locked');
      const { replay, emitted, replayLog, emittedLog } = await bothOf(skill, spec, { v1: 'Beta' });

      // The oracle first: the picker was visited but nothing was saved on either side.
      expect(replayLog.filter((l) => l.startsWith('save:')), 'replay saved past a value the app refused').toEqual([]);
      expect(emittedLog.filter((l) => l.startsWith('save:')), 'the artifact saved past a value the app refused').toEqual([]);

      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      // The same verdict, in the same words, from the same function: the whole
      // line, value included, is what did not show.
      const said = /did not show "- combobox \\"Project\\": Beta" as it did when recorded/;
      expect(replay.reason).toMatch(said);
      expect(emitted.reason, emitted.reason ?? '').toMatch(/the recorded page change did not appear|did not show "- combobox \\"Project\\": Beta"/);
    }, 120_000);

    /**
     * Without which the case above is satisfied by a gate that always stops:
     * the same procedure on the page that keeps the choice. Both proceed, and
     * both save the value this run chose — not the recorded example.
     */
    it('both runners proceed when the value after the colon matches, and save this run\'s own value', async () => {
      const { skill, spec } = project('open');
      const { replay, emitted, replayLog, emittedLog } = await bothOf(skill, spec, { v1: 'Beta' });

      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog.filter((l) => l.startsWith('save:'))).toEqual(['save:Beta']);
      expect(emittedLog.filter((l) => l.startsWith('save:'))).toEqual(['save:Beta']);
    }, 120_000);

    /**
     * A store minted before compile dropped lines that identify no element
     * (fwod47-n3 04-open stopped on `- textbox "": null`): the select step
     * also carries unnamed, valueless lines the /project page never shows.
     * Both runners skip them in the shared verdict (identifiesNothing), still
     * judge the named line, and save.
     */
    it('both runners ignore a recorded line that identifies no element, and still judge the named one', async () => {
      const steps = projectSteps('open');
      steps[1] = { ...steps[1], expect: { addedContains: ['- combobox "Project": {{v1}}', '- textbox "": {{*}}', '- cell ""', '- generic ""'] } };
      const { skill, spec } = procedure('s_project', 'pick project {{v1}}', steps, `${origin}/project/:id`);
      const { replay, emitted, replayLog, emittedLog } = await bothOf(skill, spec, { v1: 'Beta' });

      expect(replayLog.filter((l) => l.startsWith('save:'))).toEqual(['save:Beta']);
      expect(emittedLog.filter((l) => l.startsWith('save:'))).toEqual(['save:Beta']);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
    }, 120_000);

    /**
     * (a bis) A slot this run could not fill at all — and the one place the two
     * runners silently disagreed about it.
     *
     * fwod49-n2: 02-open never published `product_name`, so the reference
     * reached the consuming step AS the param's value. No step uses that slot
     * (SkillParam.usedIn is empty), so neither the daemon's ignorableRefs nor
     * the artifact's usedSlot blocks the step — and from there the two parted:
     * the daemon keeps the marker (resolveRefs 'keep'), so its gate searched
     * the live page for the literal text "{{02-open.product_name}}", stopped
     * every replay of s_78eaaf and s_32409f, and demoted both; the artifact
     * resolves the same reference to '' (callArgs → `outputs[…] ?? ''`), which
     * leaves `- heading ""`, a line identifying nothing, and passed in silence.
     *
     * One verdict now: a line still carrying a `{{…}}` marker after the params
     * are in (unfilledSlot) is dropped with a warning on both sides, the
     * fillable line beside it is still judged, and both save this run's value.
     */
    const unfillableParams = (): Record<string, SkillParam> => ({
      v1: { example: 'Gamma', usedIn: [2], known: true },
      // named only by the expectation and the template: no step types or
      // locates by it, which is why neither runner's consumption gate stops
      v2: { example: 'Order 41', usedIn: [], known: true },
    });

    it('neither runner judges a step on a slot this run could not fill', async () => {
      const steps = projectSteps('open');
      steps[1] = { ...steps[1], expect: { addedContains: ['- combobox "Project": {{v1}}', '- heading "{{v2}}"'] } };
      const consumer: Skill = {
        ...skillOf(steps),
        id: 's_project',
        template: 'pick project {{v1}} on {{v2}}',
        params: unfillableParams(),
        preconditions: { urlPattern: `${origin}/project/:id` },
      };
      const pick: FlowStep = {
        id: '02-pick',
        instruction: 'pick project Beta on {{01-read.x}}',
        skill: 's_project',
        params: { v1: 'Beta', v2: '{{01-read.x}}' },
        outputs: [],
        recorded: {},
      };
      const spec: SpecFlow = {
        version: 1,
        name: 'parity-unfillable',
        origin,
        startUrl: `${origin}/`,
        vars: [],
        steps: [
          {
            id: '01-read',
            instruction: 'read the target',
            params: {},
            outputs: ['x'],
            segments: [{ id: 's_read', template: 'read the target', params: {}, preconditions: { urlPattern: `${origin}/` }, steps: [readStep('#nope'), seenStep] }],
          },
          {
            id: '02-pick',
            instruction: 'pick project Beta on {{01-read.x}}',
            params: { v1: 'Beta', v2: '{{01-read.x}}' },
            outputs: [],
            segments: [{ id: 's_project', template: 'pick project {{v1}} on {{v2}}', params: unfillableParams(), preconditions: { urlPattern: `${origin}/project/:id` }, steps }],
          },
        ],
      };

      reset(0);
      const { outcome: replay, blocking } = await replayFlowOf(readSkill('#nope'), consumer, pick);
      const replayLog = [...fx.log];
      reset(0);
      const emitted = await emittedFlowOf(spec);
      const emittedLog = [...fx.log];

      // the reference is not blocking on either side: no step uses the slot
      expect(blocking).toEqual([]);
      // the oracle: both ran the procedure and saved THIS run's value
      expect(replayLog.filter((l) => l.startsWith('save:')), 'replay stopped on a line it could not fill').toEqual(['save:Beta']);
      expect(emittedLog.filter((l) => l.startsWith('save:')), 'the artifact stopped on a line it could not fill').toEqual(['save:Beta']);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      // ...and the daemon says the line went unchecked rather than staying silent
      expect((replay.warnings ?? []).join(' ')).toContain('could not fill');
    }, 120_000);

    /**
     * (b) A recorded dialog that does not open. `/discard/<mode>`: Exit opens
     * "Discard changes?" only when the page is dirty. The recording was dirty,
     * so Exit recorded `- dialog "Discard changes?"` and `- button "Discard"`,
     * and the next step clicks Discard. On a clean page no dialog opens — the
     * app working, not the step failing — so both runners continue, skip the
     * Discard click as the dialog's own (namesDialogControl, proven against the
     * dialog's recorded subtree), and still run Mark, a step of the page's own.
     * The artifact used to fail the Exit step outright on the missing dialog.
     */
    const discardSteps = (mode: 'dirty' | 'clean'): SkillStep[] => [
      { tool: 'goto', args: { url: `${origin}/discard/${mode}` }, locators: {} },
      {
        tool: 'click',
        args: { target: '@e1' },
        locators: { target: [{ kind: 'role', role: 'button', name: 'Exit' }] },
        expect: { addedContains: ['- dialog "Discard changes?"', '- button "Discard"'] },
      },
      { tool: 'click', args: { target: '@e2' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Discard' }] } },
      MARK,
    ];
    const discard = (mode: 'dirty' | 'clean') => procedure('s_discard', 'leave the editor', discardSteps(mode), `${origin}/discard/:id`);

    it('both runners continue past a plain dialog line that did not open, skip its own control, and still run the next step', async () => {
      const { skill, spec } = discard('clean');
      const { replay, emitted, replayLog, emittedLog } = await bothOf(skill, spec, { v1: 'Beta' });

      // The oracle: Mark ran on both sides, and nothing confirmed a discard
      // that was never offered.
      expect(replayLog, 'replay must skip the dialog\'s control and still mark').toEqual(['mark:editor']);
      expect(emittedLog, 'the artifact must skip the dialog\'s control and still mark').toEqual(['mark:editor']);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
    }, 120_000);

    /**
     * The other half: on a dirty page the dialog does open, both click its
     * Discard, and both then Mark. Same contract, opposite state, both
     * mutations in order — which is what proves the skip above was the
     * dialog's absence and not a step that never works.
     */
    it('both runners act inside the dialog when it does open', async () => {
      const { skill, spec } = discard('dirty');
      const { replay, emitted, replayLog, emittedLog } = await bothOf(skill, spec, { v1: 'Beta' });

      expect(replayLog).toEqual(['discard:confirmed', 'mark:editor']);
      expect(emittedLog).toEqual(['discard:confirmed', 'mark:editor']);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
    }, 120_000);
  });

  // -------------------------------------------------------------------------
  // locator resolution
  // -------------------------------------------------------------------------

  /**
   * ONE resolution policy (resolveCandidates, src/execution/resolve.ts), called
   * by replay's `resolveChain` and by the artifact's `pick`/`resolveTarget`
   * over the same observations and the same policy inputs. Each case below is a
   * rule the emitted `pick` used not to have — the identity guard from known
   * params (gap B8), the origin guard (gap 14), and the loop cursor narrowing
   * only an AMBIGUOUS candidate (an unconditional `.nth(cursor)` before). The
   * mutation log is the oracle throughout: which record was acted on, which no
   * runner's own report can establish about itself.
   */
  describe('locator resolution', () => {
    /** Both runners on a list of `count` items, the procedure given whole with its params. */
    async function bothOn(skill: Skill, spec: SpecFlow, params: Record<string, string>, count: number) {
      reset(count);
      const replay = await replayOf(skill, params);
      const replayLog = [...fx.log];
      reset(count);
      const emitted = await emittedOf(spec, params);
      const emittedLog = [...fx.log];
      return { replay, emitted, replayLog, emittedLog };
    }

    /** A one-step procedure with its own `v1` param, on the list page, as both runners see it. */
    const withParam = (step: SkillStep, param: SkillParam): { skill: Skill; spec: SpecFlow } => {
      const params: Record<string, SkillParam> = { v1: param };
      const skill: Skill = { ...skillOf([step]), id: 's_ident', template: 'mark record {{v1}}', params };
      const spec: SpecFlow = {
        version: 1,
        name: 'parity-identity',
        origin,
        startUrl: `${origin}/`,
        vars: [],
        steps: [{ id: '01-do', instruction: 'mark record {{v1}}', params: { v1: 'Item 3' }, outputs: [], segments: [{ id: 's_ident', template: 'mark record {{v1}}', params, preconditions: { urlPattern: `${origin}/` }, steps: [step] }] }],
      };
      return { skill, spec };
    };

    /**
     * B8's cell. The chain: a primary that names the record by this run's
     * KNOWN value in a role name — and misses, because the page names its
     * buttons "Mark", not "Mark Item 3"; a handle fallback pinned to the
     * RECORDED run's record id (`.mark[data-id="Item 1"]`), which resolves to
     * exactly one element, the wrong one; and a handle fallback carrying the
     * run's own value. No `scoped` candidate anywhere.
     *
     * The daemon derived the identity guard from the known slot in the role
     * name, rejected the pinned fallback (its text bears no "Item 3") and took
     * the carrying one. The artifact guarded only the `hasText` of a `scoped`
     * candidate, so with none in the chain it took the pinned fallback and
     * marked the recorded run's record. Both must now mark Item 3 and only it.
     */
    const identityChain = (): SkillStep => ({
      tool: 'click',
      args: { target: '@e1' },
      locators: {
        target: [
          { kind: 'role', role: 'button', name: 'Mark {{v1}}' },
          { kind: 'css', selector: '.mark[data-id="Item 1"]' },
          { kind: 'css', selector: '.mark[data-id="{{v1}}"]' },
        ],
      },
    });

    it('both runners guard a fallback by a known value carried in a role name, with no scoped candidate', async () => {
      const { skill, spec } = withParam(identityChain(), { example: 'Item 1', usedIn: [1], known: true });
      const { replay, emitted, replayLog, emittedLog } = await bothOn(skill, spec, { v1: 'Item 3' }, 3);

      // The oracle: this run's record, once, and never the recorded run's.
      expect(replayLog, 'replay must not act on the recorded run\'s pinned record').toEqual(['mark:Item 3']);
      expect(emittedLog, 'the artifact must not act on the recorded run\'s pinned record').toEqual(['mark:Item 3']);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
    }, 120_000);

    /**
     * Without which the case above is satisfied by a guard that always rejects
     * the pinned fallback: the SAME chain with the slot NOT known carries no
     * identity in either runner (identityOfPrimary reads known slots only), so
     * both take the pinned fallback — the same wrong record, which is what
     * parity is, and what makes the known slot the thing that guarded above.
     */
    it('neither runner guards on a slot the caller never vouched for, and both take the pinned fallback', async () => {
      const { skill, spec } = withParam(identityChain(), { example: 'Item 1', usedIn: [1] });
      const { replay, emitted, replayLog, emittedLog } = await bothOn(skill, spec, { v1: 'Item 3' }, 3);

      expect(replayLog).toEqual(['mark:Item 1']);
      expect(emittedLog).toEqual(['mark:Item 1']);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
    }, 120_000);

    /**
     * Gap 14's cell. The recorded primary is gone; the only element the
     * fallback names sits inside a link to ANOTHER origin. A guessed fallback
     * that leaves the recorded origin cannot be the recorded control
     * (diaggr1's replay of fwgr26 fell to a footer link to grafana.com this
     * way), so the daemon refused it; the emitted `pick` took the first unique
     * match. Both must now stop with nothing marked — and, on the same page
     * with the link pointing home, both must act, or the rule is "refuse".
     */
    const awaySteps = (mode: 'foreign' | 'home'): SkillStep[] => [
      { tool: 'goto', args: { url: `${origin}/away/${mode}` }, locators: {} },
      { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#mark-main' }, { kind: 'role', role: 'button', name: 'Mark' }] } },
    ];

    it('neither runner takes a fallback whose only match sits under a link to another origin', async () => {
      const { replay, emitted, replayLog, emittedLog } = await both(awaySteps('foreign'), 0);

      expect(replayLog, 'replay must not click a control inside a foreign link').toEqual([]);
      expect(emittedLog, 'the artifact must not click a control inside a foreign link').toEqual([]);
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      expect(replay.reason).toMatch(/no element matched any known locator/);
      expect(emitted.reason).toMatch(/none of 2 recorded locators resolved/);

      const home = await both(awaySteps('home'), 0);
      expect(home.replayLog).toEqual(['mark:away']);
      expect(home.emittedLog).toEqual(['mark:away']);
      expect(home.replay.ok, home.replay.reason ?? '').toBe(true);
      expect(home.emitted.ok, home.emitted.reason ?? '').toBe(true);
    }, 180_000);

    /**
     * The loop cursor narrows an AMBIGUOUS candidate only. An edit-in-place
     * loop over three Mark buttons whose body primary is pinned to one record
     * (`.mark[data-id="Item 2"]`) resolves to exactly ONE element on every
     * pass. The daemon's rule: a unique candidate is acted on as itself, the
     * cursor being for a candidate that matched several — so pass two acts on
     * Item 2 again, and the shared progress guard then stops the loop, because
     * the pass resolved the same element with the count unchanged. The
     * artifact used to put `.nth(cursor)` on every body target unconditionally
     * and, on pass two, timed out clicking match 1 of a one-match locator — a
     * different failure, after different work. Both must now do the same work
     * and stop for the same reason.
     *
     * notes/ROBUSTNESS.md finding 1: the progress guard used to be judged after the
     * body, so both runners marked Item 2 TWICE before noticing. It is now
     * asked once the pass's targets resolve and before they are acted on, so
     * Item 2 is marked once.
     */
    it('both runners act on a loop body target that is unique on the second pass, and stop on the progress guard together, before acting again', async () => {
      const guard = [{ kind: 'role' as const, role: 'button', name: 'Mark' }];
      const body: SkillStep = {
        tool: 'click',
        args: { target: '@e1' },
        locators: { target: [{ kind: 'css', selector: '.mark[data-id="Item 2"]' }, ...guard] },
      };
      const loop: SkillStep[] = [{ tool: 'loop', args: {}, locators: {}, while: guard, max: 2, body: [body] }];
      const { replay, emitted, replayLog, emittedLog } = await both(loop, 3);

      expect(replayLog).toEqual(['mark:Item 2']);
      expect(emittedLog).toEqual(['mark:Item 2']);
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      expect(replay.reason).toMatch(/re-acting on one record/);
      expect(emitted.reason).toMatch(/re-acting on one record/);
    }, 180_000);

    /**
     * Review C6, F1. An absence wait (`wait_for hidden`) resolves its chain
     * with ambiguity ALLOWED in both runners. Two visible Mark buttons have
     * not gone; a resolver that read the policy's 'ambiguous' miss as
     * "nothing matched → condition met" proceeded to the next mutation with
     * the elements visibly there — on both sides, by construction. Both must
     * now stop at the wait, and the log must be empty. And with a chain that
     * genuinely matches nothing, both must proceed and mark — or the rule
     * under test is "refuse", not "wait".
     *
     * The leading presence wait is the harness's: the list renders from a
     * fetch after load, and an absence wait resolves with NO wait, so both
     * runners are held on the first row before the chain under test is asked.
     */
    const absenceSteps = (chain: SkillStep['locators']['target']): SkillStep[] => [
      { tool: 'wait_for', args: { target: '@e1', state: 'visible' }, locators: { target: [{ kind: 'css', selector: '.mark[data-id="Item 1"]' }] } },
      { tool: 'wait_for', args: { target: '@e2', state: 'hidden', timeout_ms: 1_000 }, locators: { target: chain } },
      { tool: 'click', args: { target: '@e3' }, locators: { target: [{ kind: 'css', selector: '.mark[data-id="Item 1"]' }] } },
    ];

    it('both runners refuse an absence wait whose chain still matches two visible elements, and neither reaches the next mutation', async () => {
      const still = await both(absenceSteps([{ kind: 'role', role: 'button', name: 'Mark' }]), 2);

      expect(still.replayLog, 'replay must not proceed past a wait for two visible elements to be hidden').toEqual([]);
      expect(still.emittedLog, 'the artifact must not proceed past a wait for two visible elements to be hidden').toEqual([]);
      expect(still.replay.ok).toBe(false);
      expect(still.emitted.ok).toBe(false);
      // the wait's own failure in each runner's words: replay dispatches
      // `locator.first().waitFor({ state: 'hidden' })`, the artifact
      // `expect(locator.first()).toBeHidden()` — both time out, neither
      // reports "nothing matched"
      expect(still.replay.reason).toMatch(/^wait_for failed: .*Timeout 1000ms exceeded/);
      // Playwright has worded this two ways across versions: "Timed out 1000ms
      // waiting for expect(locator).toBeHidden()" and, more recently,
      // "expect(locator).toBeHidden() failed … Timeout: 1000ms". Either is the
      // same verdict: the elements were still visible when the budget ran out.
      expect(still.emitted.reason).toMatch(/expect\(locator\)\.toBeHidden\(\)/);
      expect(still.emitted.reason).toMatch(/(Timed out 1000ms|Timeout:\s+1000ms)/);
      expect(still.emitted.reason).not.toMatch(/nothing matched/i);

      const gone = await both(absenceSteps([{ kind: 'css', selector: '.mark[data-id="Item 9"]' }]), 2);
      expect(gone.replayLog).toEqual(['mark:Item 1']);
      expect(gone.emittedLog).toEqual(['mark:Item 1']);
      expect(gone.replay.ok, gone.replay.reason ?? '').toBe(true);
      expect(gone.emitted.ok, gone.emitted.reason ?? '').toBe(true);
    }, 180_000);

    /**
     * grafana fwgr43. "May match several" follows the DISPATCH, not the tool
     * name: BOTH runners dispatch a wait as `.first()` (tools.ts waitFor), so
     * a wait whose chain matches two elements has met its condition when the
     * first one has — it is `hidden` that was an instance of the rule, not
     * the rule itself.
     *
     * Before this, only an absence wait resolved with ambiguity allowed. A
     * presence wait was held to exactly one element, so `wait_for h2
     * state:visible` on a dashboard showing three panels stopped both replays
     * and failed the compiled arm 0/6 — on a heading that was plainly there.
     * Both runners must now meet the wait and reach the next mutation, and
     * they must say the same thing.
     *
     * The rule is "first of several", not "anything goes": with a chain that
     * matches NOTHING both must still stop, with no mark in the log.
     */
    const presenceSteps = (chain: SkillStep['locators']['target'], state = 'visible'): SkillStep[] => [
      { tool: 'wait_for', args: { target: '@e1', state, ...(state === 'visible' ? {} : { text: 'Mark' }), timeout_ms: 5_000 }, locators: { target: chain } },
      { tool: 'click', args: { target: '@e2' }, locators: { target: [{ kind: 'css', selector: '.mark[data-id="Item 1"]' }] } },
    ];

    it('both runners meet a singular wait whose chain matches several, and both reach the next mutation', async () => {
      const ambiguous: SkillStep['locators']['target'] = [{ kind: 'role', role: 'button', name: 'Mark' }];
      const several = await both(presenceSteps(ambiguous), 2);

      expect(several.replayLog, 'replay must meet a visible wait that two elements satisfy').toEqual(['mark:Item 1']);
      expect(several.emittedLog, 'the artifact must meet a visible wait that two elements satisfy').toEqual(['mark:Item 1']);
      expect(several.replay.ok, several.replay.reason ?? '').toBe(true);
      expect(several.emitted.ok, several.emitted.reason ?? '').toBe(true);

      // the same for a TEXT wait, the other singular state: it reads
      // `locator.first().innerText()` in replay and asserts on
      // `expect(locator.first())` in the artifact
      const text = await both(presenceSteps(ambiguous, 'text_contains'), 2);
      expect(text.replayLog).toEqual(['mark:Item 1']);
      expect(text.emittedLog).toEqual(['mark:Item 1']);
      expect(text.replay.ok, text.replay.reason ?? '').toBe(true);
      expect(text.emitted.ok, text.emitted.reason ?? '').toBe(true);

      // a chain that names nothing is still a stop in both runners
      const missing = await both(presenceSteps([{ kind: 'css', selector: '.mark[data-id="Item 9"]' }]), 2);
      expect(missing.replayLog, 'replay must not act after a wait that resolved nothing').toEqual([]);
      expect(missing.emittedLog, 'the artifact must not act after a wait that resolved nothing').toEqual([]);
      expect(missing.replay.ok).toBe(false);
      expect(missing.emitted.ok).toBe(false);
      expect(missing.replay.reason).toMatch(/no element matched any known locator/);
      expect(missing.emitted.reason).toMatch(/none of 1 recorded locators resolved/);
    }, 240_000);
  });

  // -------------------------------------------------------------------------
  // editor recipes
  // -------------------------------------------------------------------------

  /**
   * ONE recipe runner (src/execution/recipes.ts) — recognition, the seed
   * procedures, execution, verification and the fill/type/select ladders —
   * called by tools.ts's `fill`/`type`/`select` cases over the ComponentStore
   * and by the artifact's adapters over a compile-time snapshot of it (C7).
   * The artifact used to carry its own transcription of the fill ladder and
   * drive `type` and `select` past the recipe entirely. Both runners here use
   * the shipped seeds: $SITELOOPER_COMPONENTS_FILE points into the parity
   * home, where no components.json exists yet, so the daemon's store merges
   * the seeds in, and the spec carries no snapshot, so the artifact embeds
   * them.
   *
   * The oracle is the fixture's commit log (`/editor`): each Save button posts
   * what the APP holds, not what the runner reported. The monaco-shaped editor
   * updates its model only on a real edit (an `input` event with an
   * `inputType`, as keyboard insertText fires), so a runner that reached the
   * native value setter instead would commit the INITIAL model text and the
   * log would say so — which no runner's own success report can.
   */
  describe('editor recipes', () => {
    const editorSteps = (action: SkillStep, save: string): SkillStep[] => [
      { tool: 'goto', args: { url: `${origin}/editor` }, locators: {} },
      action,
      { tool: 'click', args: { target: '@e2' }, locators: { target: [{ kind: 'role', role: 'button', name: save }] } },
    ];

    /**
     * (a) A `fill` into the monaco-shaped editor, targeted as a recording
     * targets it — the inner textarea the focus lands in. Both runners
     * recognise the `.monaco-editor` root, run the set-value seed (click,
     * select-all, insertText, settle, Escape, blur the textarea, settle) and
     * verify the payload on `.view-lines`; the app then commits this run's
     * text. A native fill would leave the model at its initial text.
     */
    it('both runners set a monaco-shaped editor through the recipe, and the app commits the value', async () => {
      const fillEditor: SkillStep = { tool: 'fill', args: { target: '@e1', value: 'notes for run x77' }, locators: { target: [{ kind: 'css', selector: '#mon textarea' }] } };
      const { replay, emitted, replayLog, emittedLog } = await both(editorSteps(fillEditor, 'Save editor'), 0);

      expect(replayLog, 'replay must commit the text the recipe set, not the initial model').toEqual(['commit:editor:notes for run x77']);
      expect(emittedLog, 'the artifact must commit the text the recipe set, not the initial model').toEqual(['commit:editor:notes for run x77']);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
    }, 120_000);

    /**
     * (b) A `type` into the contenteditable. The recording typed; the daemon
     * drives a recognised contenteditable through the same set-value recipe a
     * fill takes, and the artifact used to `pressSequentially` straight into
     * it — which appends to the starting content rather than replacing it.
     * Both must now commit the typed text alone.
     */
    it('both runners type into a contenteditable through the recipe, replacing its content', async () => {
      const typeNote: SkillStep = { tool: 'type', args: { target: '@e1', text: 'typed body x88' }, locators: { target: [{ kind: 'css', selector: '#ce' }] } };
      const { replay, emitted, replayLog, emittedLog } = await both(editorSteps(typeNote, 'Save note'), 0);

      expect(replayLog, 'replay must commit the typed text and nothing of the starting content').toEqual(['commit:note:typed body x88']);
      expect(emittedLog, 'the artifact must commit the typed text and nothing of the starting content').toEqual(['commit:note:typed body x88']);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
    }, 120_000);

    /**
     * (d) A `fill` into a contenteditable the recording located by its TEXT
     * (`[contenteditable="true"]` with hasText "draft body"). The recipe
     * replaces that text, so the target stops matching halfway through the
     * recipe. The component root is pinned when the widget is recognised,
     * so the blur and the verification read still act on the editor that was
     * recognised. A root re-derived from the target on every step would find
     * nothing after insertText: the blur would time out, the attempt would be
     * recorded as a failure, and the native fallback would wait on a target
     * that no longer exists. Both runners must commit the new value.
     */
    it('both runners commit a contenteditable whose text-located target stops matching once the recipe replaces it', async () => {
      const fillDraft: SkillStep = {
        tool: 'fill',
        args: { target: '@e1', value: 'rewritten draft x99' },
        locators: { target: [{ kind: 'scoped', container: '[contenteditable="true"]', hasText: 'draft body' }] },
      };
      const { replay, emitted, replayLog, emittedLog } = await both(editorSteps(fillDraft, 'Save draft'), 0);

      expect(replayLog, 'replay must commit the new draft text').toEqual(['commit:draft:rewritten draft x99']);
      expect(emittedLog, 'the artifact must commit the new draft text').toEqual(['commit:draft:rewritten draft x99']);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
    }, 120_000);

    /**
     * (c) The control: a `select` on a native <select>, outside every recipe
     * family. Both runners' ladders recognise nothing and go native
     * (reactSafeSelect, by label), and the app commits the choice — which is
     * what proves the two cases above went through the recipe because the
     * widget asked for it, and not because the ladder always does.
     */
    it('both runners select on a native select natively, and the app commits the choice', async () => {
      const choose: SkillStep = { tool: 'select', args: { target: '@e1', option: 'Beta' }, locators: { target: [{ kind: 'role', role: 'combobox', name: 'Choice' }] } };
      const { replay, emitted, replayLog, emittedLog } = await both(editorSteps(choose, 'Save choice'), 0);

      expect(replayLog).toEqual(['commit:choice:Beta']);
      expect(emittedLog).toEqual(['commit:choice:Beta']);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
    }, 120_000);
  });

  /**
   * `{{env:NAME}}` credentials, the README's sign-in (a CLI user's report:
   * such a flow never replayed). The unresolved-marker guard read the secret
   * marker as an unpublished reference, so replay fell back to the model on
   * every run. The fixture's log is the oracle: signed in once, with the
   * environment's value, by both runners — and a run without the variable
   * signs in with nothing and names BENCH_PW.
   */
  describe('env secrets', () => {
    const SECRET = 'pw-env-x44';
    const had = process.env.BENCH_PW;
    const restore = () => {
      if (had === undefined) delete process.env.BENCH_PW;
      else process.env.BENCH_PW = had;
    };
    const signIn = (password: string, page = `${origin}/reload-login/plain`): SkillStep[] => [
      { tool: 'goto', args: { url: page }, locators: {} },
      { tool: 'fill', args: { target: '@e1', value: '{{v1}}' }, locators: { target: [{ kind: 'label', label: 'Username' }] } },
      { tool: 'fill', args: { target: '@e2', value: password }, locators: { target: [{ kind: 'css', selector: '#password' }] } },
      { tool: 'click', args: { target: '@e3' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Sign in' }] } },
    ];
    const flowStep = (): FlowStep => ({
      id: '01-sign-in',
      instruction: 'Sign in as admin using {{env:BENCH_PW}}',
      params: { v1: 'admin', v2: '{{env:BENCH_PW}}' },
      outputs: [],
    } as unknown as FlowStep);
    const signInSkill = (): Skill => ({
      ...skillOf(signIn('{{v2}}')),
      id: 's_signin',
      template: 'sign in as {{v1}} using {{v2}}',
      params: { v1: { example: 'admin', usedIn: [2], known: true }, v2: { example: '{{env:BENCH_PW}}', usedIn: [3], known: true } },
    });
    const signInFlow = (): SpecFlow => {
      const spec = specOf(signIn('{{v2}}'));
      Object.assign(spec.steps[0], { id: '01-sign-in', params: { v1: 'admin', v2: '{{env:BENCH_PW}}' } });
      Object.assign(spec.steps[0].segments[0], { id: 's_signin', params: signInSkill().params });
      return spec;
    };

    it('both runners sign in with a slot bound to {{env:NAME}}, replay at tier A', async () => {
      process.env.BENCH_PW = SECRET;
      try {
        // The params exactly as the daemon's flow runner binds them.
        const bound = resolveStepParams(flowStep(), {}, {});
        expect(bound?.params.v2).toBe('{{env:BENCH_PW}}');
        expect(bound?.missing).toEqual([]);
        reset(0);
        const replay = await replayOf(signInSkill(), bound!.params);
        const replayLog = [...fx.log];
        reset(0);
        const emitted = await emittedFlowOf(signInFlow());
        const emittedLog = [...fx.log];
        expect(replay.ok, replay.reason ?? '').toBe(true);
        expect(emitted.ok, emitted.reason ?? '').toBe(true);
        expect(replayLog).toEqual([`commit:login:admin:${SECRET}`]);
        expect(emittedLog).toEqual([`commit:login:admin:${SECRET}`]);
        expect(JSON.stringify([replay, emitted])).not.toContain(SECRET);
        const { source } = emitFlowFile(signInFlow(), { tier: 'plain' });
        expect(source).toContain("process.env['BENCH_PW']");
        expect(source).not.toContain(SECRET);
      } finally {
        restore();
      }
    }, 120_000);

    it('both runners refill a rebuilt form with the secret, never with its marker', async () => {
      process.env.BENCH_PW = SECRET;
      try {
        const steps = signIn('{{env:BENCH_PW}}', `${origin}/relogin`).map((s) =>
          s.tool === 'fill' && s.args.value === '{{v1}}' ? { ...s, args: { ...s.args, value: 'admin' }, locators: { target: [{ kind: 'role' as const, role: 'textbox', name: 'Username' }] } } : s,
        );
        const { replay, emitted, replayLog, emittedLog } = await both(steps, 0);
        expect(replayLog, 'replay must refill with the value').toEqual([`commit:login:admin:${SECRET}`]);
        expect(emittedLog, 'the artifact must refill with the value').toEqual([`commit:login:admin:${SECRET}`]);
        expect(replay.ok, replay.reason ?? '').toBe(true);
        expect(emitted.ok, emitted.reason ?? '').toBe(true);
        expect(JSON.stringify([replay, emitted])).not.toContain(SECRET);
      } finally {
        restore();
      }
    }, 120_000);

    it('both runners refuse a sign-in whose variable is unset, naming it, and sign in with nothing', async () => {
      delete process.env.BENCH_PW;
      try {
        const bound = resolveStepParams(flowStep(), {}, {});
        reset(0);
        const replay = await replayOf(signInSkill(), bound!.params);
        const replayLog = [...fx.log];
        reset(0);
        const emitted = await emittedFlowOf(signInFlow());
        const emittedLog = [...fx.log];
        expect(replay.ok).toBe(false);
        expect(emitted.ok).toBe(false);
        expect(replay.reason).toMatch(/BENCH_PW/);
        expect(emitted.reason).toMatch(/BENCH_PW/);
        expect(replayLog.filter((e) => e.startsWith('commit:'))).toEqual([]);
        expect(emittedLog.filter((e) => e.startsWith('commit:'))).toEqual([]);
      } finally {
        restore();
      }
    }, 120_000);
  });

  /**
   * `{{totp:NAME}}` (src/execution/totp.ts): the fixture's second-factor page
   * checks the code SERVER-side, against its own RFC 6238 over the same seed,
   * and logs only `totp:ok` / `totp:rejected`. Both runners must pass it with
   * the code current at dispatch — the marker in the recorded args, or bound
   * to a slot by the flow step — and the artifact must carry neither the
   * seed nor a code.
   */
  describe('totp codes', () => {
    const had = process.env.BENCH_TOTP;
    const restore = () => {
      if (had === undefined) delete process.env.BENCH_TOTP;
      else process.env.BENCH_TOTP = had;
    };
    const verify = (code: string): SkillStep[] => [
      { tool: 'goto', args: { url: `${origin}/totp-login` }, locators: {} },
      { tool: 'fill', args: { target: '@e1', value: code }, locators: { target: [{ kind: 'label', label: 'Authentication code' }] } },
      { tool: 'click', args: { target: '@e2' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Verify' }] }, expect: { urlPattern: `${origin}/signed-in` } },
    ];
    const totpSkill = (): Skill => ({
      ...skillOf(verify('{{v1}}')),
      id: 's_totp',
      template: 'verify with {{v1}}',
      params: { v1: { example: '{{totp:BENCH_TOTP}}', usedIn: [2], known: true } },
    });
    const totpFlow = (): SpecFlow => {
      const spec = specOf(verify('{{v1}}'));
      Object.assign(spec.steps[0], { id: '01-verify', params: { v1: '{{totp:BENCH_TOTP}}' } });
      Object.assign(spec.steps[0].segments[0], { id: 's_totp', params: totpSkill().params });
      return spec;
    };
    const flowStep = (): FlowStep => ({ id: '01-verify', instruction: 'verify with {{totp:BENCH_TOTP}}', params: { v1: '{{totp:BENCH_TOTP}}' }, outputs: [] }) as unknown as FlowStep;
    /** Every code the seed could have produced around now: none may appear in the artifact. */
    const codesAroundNow = async (): Promise<string[]> => {
      const seed = totpSeed(FIXTURE_TOTP_SEED, 'BENCH_TOTP');
      const step = Math.floor(Date.now() / 30_000);
      return Promise.all([step - 2, step - 1, step, step + 1].map((c) => hotpCode(seed, c)));
    };

    it('both runners pass a server-checked code from the marker in the recorded args', async () => {
      process.env.BENCH_TOTP = FIXTURE_TOTP_SEED;
      try {
        const { replay, emitted, replayLog, emittedLog } = await both(verify('{{totp:BENCH_TOTP}}'), 0);
        expect(replay.ok, replay.reason ?? '').toBe(true);
        expect(emitted.ok, emitted.reason ?? '').toBe(true);
        expect(replayLog).toEqual(['totp:ok']);
        expect(emittedLog).toEqual(['totp:ok']);
        const { source } = emitFlowFile(specOf(verify('{{totp:BENCH_TOTP}}')), { tier: 'plain' });
        expect(source).toContain("totpCode(process.env['BENCH_TOTP'], 'BENCH_TOTP')");
        expect(source).not.toContain(FIXTURE_TOTP_SEED);
        for (const code of await codesAroundNow()) expect(source).not.toContain(code);
      } finally {
        restore();
      }
    }, 120_000);

    it('both runners pass it through a slot the flow step binds to {{totp:NAME}}, replay at tier A', async () => {
      process.env.BENCH_TOTP = FIXTURE_TOTP_SEED;
      try {
        const bound = resolveStepParams(flowStep(), {}, {});
        expect(bound?.params.v1).toBe('{{totp:BENCH_TOTP}}');
        reset(0);
        const replay = await replayOf(totpSkill(), bound!.params);
        const replayLog = [...fx.log];
        reset(0);
        const emitted = await emittedFlowOf(totpFlow());
        const emittedLog = [...fx.log];
        expect(replay.ok, replay.reason ?? '').toBe(true);
        expect(emitted.ok, emitted.reason ?? '').toBe(true);
        expect(replayLog).toEqual(['totp:ok']);
        expect(emittedLog).toEqual(['totp:ok']);
        const { source } = emitFlowFile(totpFlow(), { tier: 'plain' });
        expect(source).not.toContain(FIXTURE_TOTP_SEED);
        for (const code of await codesAroundNow()) expect(source).not.toContain(code);
      } finally {
        restore();
      }
    }, 120_000);

    it('both runners refill a rebuilt form with a code made at the refill, never the marker', async () => {
      process.env.BENCH_TOTP = FIXTURE_TOTP_SEED;
      try {
        const steps: SkillStep[] = [
          { tool: 'goto', args: { url: `${origin}/relogin` }, locators: {} },
          { tool: 'fill', args: { target: '@e1', value: 'admin' }, locators: { target: [{ kind: 'role', role: 'textbox', name: 'Username' }] } },
          { tool: 'fill', args: { target: '@e2', value: '{{totp:BENCH_TOTP}}' }, locators: { target: [{ kind: 'css', selector: '#password' }] } },
          { tool: 'click', args: { target: '@e3' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Sign in' }] } },
        ];
        const { replay, emitted, replayLog, emittedLog } = await both(steps, 0);
        expect(replay.ok, replay.reason ?? '').toBe(true);
        expect(emitted.ok, emitted.reason ?? '').toBe(true);
        const valid = await codesAroundNow();
        for (const log of [replayLog, emittedLog]) {
          expect(log).toHaveLength(1);
          const sent = log[0].replace('commit:login:admin:', '');
          expect(valid, `refilled with ${sent}`).toContain(sent);
        }
      } finally {
        restore();
      }
    }, 120_000);

    it('both runners refuse the step when the seed is unset, naming it, and send no code', async () => {
      delete process.env.BENCH_TOTP;
      try {
        const bound = resolveStepParams(flowStep(), {}, {});
        reset(0);
        const replay = await replayOf(totpSkill(), bound!.params);
        const replayLog = [...fx.log];
        reset(0);
        const emitted = await emittedFlowOf(totpFlow());
        const emittedLog = [...fx.log];
        expect(replay.ok).toBe(false);
        expect(emitted.ok).toBe(false);
        expect(replay.reason).toMatch(/BENCH_TOTP/);
        expect(emitted.reason).toMatch(/BENCH_TOTP/);
        expect(replayLog.filter((e) => e.startsWith('totp:'))).toEqual([]);
        expect(emittedLog.filter((e) => e.startsWith('totp:'))).toEqual([]);
      } finally {
        restore();
      }
    }, 120_000);
  });

  /**
   * Standing fills (the shared src/execution/refill.ts). fwvk1 n3 01-open:
   * the login fills passed their own checks, the app then rebuilt the form
   * (its service worker reloaded /login), and the Login click submitted it
   * empty. The fixture's form is replaced by an empty one 150ms after both
   * fields first hold a value; Sign in posts what the fields hold at the
   * click. Both runners must refill the emptied fields before the click, so
   * the app is signed in once, with this run's values.
   */
  describe('standing fills', () => {
    it('both runners refill a form the page emptied after its fills were checked, before the click that submits it', async () => {
      const steps: SkillStep[] = [
        { tool: 'goto', args: { url: `${origin}/relogin` }, locators: {} },
        { tool: 'fill', args: { target: '@e1', value: 'admin' }, locators: { target: [{ kind: 'role', role: 'textbox', name: 'Username' }] } },
        { tool: 'fill', args: { target: '@e2', value: 'pass-x42' }, locators: { target: [{ kind: 'css', selector: '#password' }] } },
        { tool: 'click', args: { target: '@e3' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Sign in' }] } },
      ];
      const { replay, emitted, replayLog, emittedLog } = await both(steps, 0);

      expect(replayLog, 'replay must submit the refilled form').toEqual(['commit:login:admin:pass-x42']);
      expect(emittedLog, 'the artifact must submit the refilled form').toEqual(['commit:login:admin:pass-x42']);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      // Said, and never with the values: one of them is a password.
      expect(replay.warnings?.some((w) => /empty again before this click/.test(w)), JSON.stringify(replay.warnings)).toBe(true);
      expect(emitted.warnings?.some((w) => /empty again before this click/.test(w)), JSON.stringify(emitted.warnings)).toBe(true);
      expect(JSON.stringify([replay.warnings, emitted.warnings])).not.toContain('pass-x42');
    }, 120_000);

    /**
     * fwvk2 n2 01-open: the same login, the form lost to a RELOAD (a new
     * document at the same url) rather than a rebuild. (a) The reload lands
     * 100ms after the fills, while or before the click's own check looks; (b)
     * it lands between the click and its answer, so the click submits nothing
     * and its url gate fails on the empty form. Both runners must sign in
     * once, with this run's values.
     */
    const reloadSteps = (mode: string): SkillStep[] => [
      { tool: 'goto', args: { url: `${origin}/reload-login/${mode}` }, locators: {} },
      { tool: 'fill', args: { target: '@e1', value: 'admin' }, locators: { target: [{ kind: 'label', label: 'Username' }] } },
      { tool: 'fill', args: { target: '@e2', value: 'pass-x43' }, locators: { target: [{ kind: 'css', selector: '#password' }] } },
      { tool: 'click', args: { target: '@e3' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Sign in' }] }, expect: { urlPattern: `${origin}/signed-in` } },
    ];

    it('both runners refill a form whose page reloaded itself after the fills, before the click that submits it', async () => {
      const { replay, emitted, replayLog, emittedLog } = await both(reloadSteps('fill'), 0);
      expect(replayLog, 'replay must submit the refilled form').toEqual(['commit:login:admin:pass-x43']);
      expect(emittedLog, 'the artifact must submit the refilled form').toEqual(['commit:login:admin:pass-x43']);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replay.warnings?.some((w) => /replaced its document after the fills ran/.test(w)), JSON.stringify(replay.warnings)).toBe(true);
      expect(emitted.warnings?.some((w) => /replaced its document after the fills ran/.test(w)), JSON.stringify(emitted.warnings)).toBe(true);
    }, 120_000);

    /**
     * fwec2 n1 03-create: a formatted-number widget keeps its own copy of the
     * value from key events and rebuilds the field from it at blur, so a
     * native fill is gone as soon as focus moves. Both runners must save the
     * amount — typed key by key once the native refill is seen dropped — and
     * leave the plain field beside it as it was filled.
     */
    const amountSteps = (order: 'amount-first' | 'amount-last'): SkillStep[] => {
      const amount: SkillStep = { tool: 'fill', args: { target: '@e1', value: '12500' }, locators: { target: [{ kind: 'label', label: 'Amount' }] } };
      const note: SkillStep = { tool: 'fill', args: { target: '@e2', value: 'note x61' }, locators: { target: [{ kind: 'label', label: 'Note' }] } };
      return [
        { tool: 'goto', args: { url: `${origin}/amount` }, locators: {} },
        ...(order === 'amount-first' ? [amount, note] : [note, amount]),
        { tool: 'click', args: { target: '@e3' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Save' }] } },
      ];
    };

    for (const order of ['amount-first', 'amount-last'] as const) {
      it(`both runners save a value a key-driven widget dropped at blur, typed key by key (${order})`, async () => {
        const { replay, emitted, replayLog, emittedLog } = await both(amountSteps(order), 0);
        expect(replayLog).toEqual(['commit:opportunity:12,500.00|note x61']);
        expect(emittedLog).toEqual(['commit:opportunity:12,500.00|note x61']);
        expect(replay.ok, replay.reason ?? '').toBe(true);
        expect(emitted.ok, emitted.reason ?? '').toBe(true);
        // only the widget was refilled; the plain field kept its native fill
        for (const warnings of [replay.warnings, emitted.warnings]) {
          expect(warnings?.some((w) => /1 field\(s\) this procedure filled were empty again .*1 of them kept only a value typed key by key/.test(w)), JSON.stringify(warnings)).toBe(true);
        }
      }, 120_000);
    }

    it('both runners repeat a submit the page reloaded away, once, after refilling its form', async () => {
      const { replay, emitted, replayLog, emittedLog } = await both(reloadSteps('submit'), 0);
      expect(replayLog, 'replay must sign in once').toEqual(['commit:login:admin:pass-x43']);
      expect(emittedLog, 'the artifact must sign in once').toEqual(['commit:login:admin:pass-x43']);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replay.warnings?.some((w) => /repeated once after a refill/.test(w)), JSON.stringify(replay.warnings)).toBe(true);
      expect(emitted.warnings?.some((w) => /repeated once after a refill/.test(w)), JSON.stringify(emitted.warnings)).toBe(true);
      expect(JSON.stringify([replay.warnings, emitted.warnings])).not.toContain('pass-x43');
    }, 120_000);
  });

  /**
   * Disclosure toggles (the shared src/execution/toggle.ts). fwsi1 05-change
   * recorded a hide-then-show pair on "Show/Hide More Information"; compile
   * folds it to one click flagged `toggle`, which must leave the panel SHOWN:
   * skipped when the panel already shows, clicked when it does not. The log
   * counts the clicks that landed.
   */
  describe('disclosure toggles', () => {
    const toggleSteps = (state: string, toggle = true): SkillStep[] => [
      { tool: 'goto', args: { url: `${origin}/disclosure/${state}` }, locators: {} },
      {
        tool: 'click',
        args: { target: '@e1' },
        locators: { target: [{ kind: 'role', role: 'button', name: 'Show/Hide More Information' }] },
        ...(toggle ? { toggle: true as const } : {}),
        expect: { addedContains: ['- link "Model One"', '- link "Maker One"'], lineDialect: 2 },
      },
    ];

    it('both runners skip a toggle whose panel already shows, and leave it shown', async () => {
      const { replay, emitted, replayLog, emittedLog } = await both(toggleSteps('open'), 0);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual([]);
      expect(emittedLog).toEqual([]);
    }, 120_000);

    it('both runners click a toggle whose panel is hidden, once', async () => {
      const { replay, emitted, replayLog, emittedLog } = await both(toggleSteps('closed'), 0);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual(['commit:panel:shown']);
      expect(emittedLog).toEqual(['commit:panel:shown']);
    }, 120_000);

    it('without the flag, both runners click a shown panel shut and stop on its missing effect', async () => {
      const { replay, emitted, replayLog, emittedLog } = await both(toggleSteps('open', false), 0);
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      expect(replayLog).toEqual(['commit:panel:hidden']);
      expect(emittedLog).toEqual(['commit:panel:hidden']);
    }, 120_000);
  });

  /**
   * Gap 10. A read that returns only what the procedure itself typed confirms
   * the control, not that the app kept it. Replay flags it (echoedValues) and
   * the flow runner drops it from its confident values; the artifact had no
   * echo notion and published it as a finding. Both now list the same labels —
   * the editor's own display of the filled text, and NOT the page heading,
   * which is the control that proves the rule is not "every read".
   */
  describe('a stored [role=…] scope on a native element (fwrd82)', () => {
    it('both runners resolve an old store’s `[role=dialog] >> …` inside a native <dialog>', async () => {
      // n1 acted on `[role=dialog] >> …` live (resolveTarget's implicitRoles);
      // the store kept the selector as written, which as css matches nothing
      // in a <dialog>. Both runners now rewrite it as the action resolved it.
      const steps: SkillStep[] = [
        { tool: 'goto', args: { url: `${origin}/discard/dirty` }, locators: {} },
        { tool: 'click', args: { target: '#exit' }, locators: { target: [{ kind: 'css', selector: '#exit' }] } },
        { tool: 'click', args: { target: '[role=dialog] >> #discard' }, locators: { target: [{ kind: 'css', selector: '[role=dialog] >> #discard' }] } },
      ];
      const { replay, emitted, replayLog, emittedLog } = await both(steps, 0);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog.filter((e) => e === 'discard:confirmed')).toHaveLength(1);
      expect(emittedLog.filter((e) => e === 'discard:confirmed')).toHaveLength(1);
    }, 120_000);
  });

  describe('a text read of an element that renders no text (fwgt5)', () => {
    it('both runners publish an image-only link’s name, not ""', async () => {
      // gitea's org link: title and img alt "bench", innerText "". The read
      // resolved, published "", and the empty value retired its locator.
      const steps: SkillStep[] = [
        { tool: 'goto', args: { url: `${origin}/imagelink` }, locators: {} },
        { tool: 'read', args: { target: '@e1', what: 'text' }, label: 'org_link', locators: { target: [{ kind: 'role', role: 'link', name: 'bench' }] } },
        // the plural read takes the same fallback, per match (its page-side function is serialised alone)
        { tool: 'read_all', args: { target: '#org', what: 'text' }, label: 'org_links', locators: { target: [{ kind: 'css', selector: '#org' }] } },
      ];
      const { replay, emitted } = await both(steps, 0);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replay.outputs.org_link).toBe('bench');
      expect(emitted.outputs['01-clear.org_link']).toBe('bench');
      expect(replay.outputs.org_links).toBe('bench');
      expect(emitted.outputs['01-clear.org_links']).toBe('bench');
    }, 120_000);
  });

  describe('framed reads', () => {
    it('both runners publish only the span at a contained read-back’s frame, and skip one whose frame is gone', async () => {
      // fwvk3 / fwgh5 s_5ee393: a runid read-back pinned by containment to its
      // heading published the whole heading on every replay.
      const h1 = [{ kind: 'css' as const, selector: 'h1' }];
      const steps: SkillStep[] = [
        { tool: 'goto', args: { url: `${origin}/record/rec-77` }, locators: {} },
        { tool: 'read', args: { target: '(read-back)', what: 'text', frame: 'Record {{=}}' }, label: 'ref', locators: { target: h1 } },
        { tool: 'read', args: { target: '(read-back)', what: 'text', frame: '{{=}} Bench Task' }, label: 'gone', locators: { target: h1 } },
      ];
      const { replay, emitted } = await both(steps, 0);

      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replay.outputs.ref).toBe('rec-77');
      expect(emitted.outputs['01-clear.ref']).toBe('rec-77');
      // A frame the element no longer shows publishes nothing, never the line.
      expect(replay.outputs.gone ?? '').toBe('');
      expect(emitted.outputs['01-clear.gone'] ?? '').toBe('');
    }, 120_000);
  });

  describe('a minted key that arrived with others is no creation (fwod78 01-open)', () => {
    /**
     * odoo fwod78: the recording's login landed on `/web#cids=1` before Odoo
     * wrote its default action into the hash, and the next click coincided
     * with `action=123&menu_id=81` arriving — compiled as a `q.action` mint,
     * `sole: false`. Every replay's login landed on the full url, and
     * mintedAhead refused it as past its start. Here the page carries
     * `action=9` before the procedure starts; a sole mint (fwod66's shape, or
     * a store compiled before the flag) still refuses, in both runners.
     */
    const withHash: PageHook = async (page) => {
      await page.addInitScript(() => {
        if (location.pathname === '/' && !location.hash) history.replaceState(null, '', '/#action=9&cids=1&menu_id=4');
      });
    };
    const procedure = (mints: SkillStep['mints']): { skill: Skill; spec: SpecFlow } => {
      const steps: SkillStep[] = [{ ...MARK, mints }];
      const preconditions = { urlPattern: `${origin}/#cids=:id` };
      const spec = specOf(steps);
      spec.steps[0].segments[0].preconditions = preconditions;
      return { skill: { ...skillOf(steps), preconditions }, spec };
    };
    const run = async (mints: SkillStep['mints']) => {
      const { skill, spec } = procedure(mints);
      reset(1);
      const replay = await replayOf(skill, {}, withHash);
      const replayLog = [...fx.log];
      reset(1);
      const emitted = await emittedOf(spec, {}, withHash);
      return { replay, emitted, replayLog, emittedLog: [...fx.log] };
    };

    it('both runners start a procedure whose q.action mint was not sole on a page already carrying action', async () => {
      const { replay, emitted, replayLog, emittedLog } = await run({ at: 'q.action', sole: false });
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      await new Promise((r) => setTimeout(r, 300));
      expect(replayLog).toEqual(['mark:Item 1']);
      expect(emittedLog).toEqual(['mark:Item 1']);
    }, 120_000);

    it('both runners still refuse it as past its start when the mint was sole', async () => {
      const { replay, emitted, replayLog, emittedLog } = await run({ at: 'q.action', sole: true });
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      expect(replay.reason).toMatch(/already carries action=9/);
      expect(emitted.reason).toMatch(/already carries action=9/);
      expect(replayLog).toEqual([]);
      expect(emittedLog).toEqual([]);
    }, 120_000);
  });

  describe('a set value the save never showed (round 51, fwrd84 05-edit)', () => {
    /**
     * repairdesk fwrd84-n1 05-edit filled Cost 150 and saved; its reads
     * published "$150.00" and "$187.50", compile wildcarded both in the Save's
     * expected row, and n3 saved an unchanged form at tier A, 0 turns. The
     * same shape on `/price`: compiled from a recording, the Save's row keeps
     * the cost the procedure SET (`${{v1}}{{*}}`). On `/price?stuck=1` the
     * Save posts and redraws nothing, and both runners must stop there; on
     * `/price` both must pass.
     */
    const compiledPrice = (): { steps: SkillStep[]; params: Record<string, SkillParam> } => {
      const url = `${origin}/price`;
      const target = (name: string, role: string) => ({ target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role' as const, role, name }] } });
      const cell = (label: string, result: string, id: string): RecordedStep => ({
        k: 'step',
        tool: 'read',
        args: { target: '(read-back)', what: 'text' },
        locators: { target: { expr: 'x', verified: true, raw: '(read-back)', chain: [{ kind: 'css', selector: `#${id}` }] } },
        result: JSON.stringify(result),
        label,
      });
      const entries: RecordedEntry[] = [
        { k: 'instruction', text: "set Part A's cost to 150 and save", url },
        { k: 'step', tool: 'goto', args: { url }, locators: {}, diff: { url, alerts: [], added: [], dialect: 2 } },
        { k: 'step', tool: 'fill', args: { target: '@e1', value: '150' }, locators: target('Cost', 'spinbutton'), diff: { url, alerts: [], added: ['- spinbutton "Cost": 150'], dialect: 2 } },
        {
          k: 'step',
          tool: 'click',
          args: { target: '@e2' },
          locators: target('Save part', 'button'),
          diff: { url, alerts: [], added: ['- row "Part A $150.00 $187.50"', '- cell "$150.00"', '- cell "$187.50"'], removed: ['- row "Part A $100.00 $125.00"', '- cell "$100.00"', '- cell "$125.00"'], dialect: 2 },
        },
        cell('part_cost', '$150.00', 'cost'),
        cell('part_price', '$187.50', 'price'),
      ];
      const [skill] = compileSkills({ entries, instruction: "set Part A's cost to 150 and save", report: { status: 'success', summary: 'saved', evidence: { values: { part_cost: '$150.00', part_price: '$187.50' } } }, session: 's' });
      return { steps: skill.steps, params: skill.params };
    };
    const procedure = (stuck: boolean): { skill: Skill; spec: SpecFlow; values: Record<string, string> } => {
      const { steps: compiled, params } = compiledPrice();
      const steps = compiled.map((st) => (st.tool === 'goto' && stuck ? { ...st, args: { ...st.args, url: `${origin}/price?stuck=1` } } : st));
      const values = Object.fromEntries(Object.entries(params).map(([k, p]) => [k, p.example]));
      const skill: Skill = { ...skillOf(steps), id: 's_price', template: "set Part A's cost to {{v1}} and save", params };
      const spec: SpecFlow = {
        version: 1,
        name: 'parity-price',
        origin,
        startUrl: `${origin}/`,
        vars: [],
        steps: [{ id: '01-price', instruction: "set Part A's cost to {{v1}} and save", params: values, outputs: [], segments: [{ id: 's_price', template: "set Part A's cost to {{v1}} and save", params, preconditions: { urlPattern: `${origin}/` }, steps }] }],
      };
      return { skill, spec, values };
    };

    it('both runners stop a save that never showed the cost the procedure set, and pass one that did', async () => {
      const { steps } = compiledPrice();
      const save = steps.find((st) => st.tool === 'click')!;
      expect(save.expect?.addedContains?.some((l) => /\$\{\{v1\}\}/.test(l)), JSON.stringify(save.expect)).toBe(true);

      const stuck = procedure(true);
      const bad = await bothOf(stuck.skill, stuck.spec, stuck.values);
      expect(bad.replay.ok, 'replay passed a save that never showed the cost').toBe(false);
      expect(bad.emitted.ok, 'the artifact passed a save that never showed the cost').toBe(false);
      expect(bad.replay.reason).toMatch(/Part A \$150/);

      const good = procedure(false);
      const ok = await bothOf(good.skill, good.spec, good.values);
      expect(ok.replay.ok, ok.replay.reason ?? '').toBe(true);
      expect(ok.emitted.ok, ok.emitted.reason ?? '').toBe(true);
      expect(ok.replayLog).toEqual(['commit:cost:150']);
      expect(ok.emittedLog).toEqual(['commit:cost:150']);
    }, 240_000);
  });

  describe('a click whose whole recorded effect was a removal (round 56, fwvk8 02-create)', () => {
    /**
     * vikunja fwvk8-n1 02-create's FILTERS click closed the filter popup
     * 01-open had left open (added [], removed its lines). With no line to
     * check it opened the popup on replays that started with it shut, and
     * passed. Compiled from such a recording, both runners now skip it when
     * the popup is shut, click it (and pass) when it is open, and stop when
     * the click leaves every recorded line on the page.
     */
    const hideSteps = (url: string): SkillStep[] => {
      const entries: RecordedEntry[] = [
        { k: 'instruction', text: 'close the filters and add a task', url },
        { k: 'step', tool: 'goto', args: { url }, locators: {}, diff: { url, alerts: [], added: [], dialect: 2 } },
        {
          k: 'step',
          tool: 'click',
          args: { target: '@e1' },
          locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name: 'Filters' }] } },
          diff: { url, alerts: [], added: [], removed: ['- textbox "Type a search or filter query…"', '- button "Custom"'], dialect: 2 },
        },
        {
          k: 'step',
          tool: 'click',
          args: { target: '@e2' },
          locators: { target: { expr: 'x', verified: true, raw: '@e2', chain: [{ kind: 'role', role: 'button', name: 'Add' }] } },
          diff: { url, alerts: [], added: [], removed: [], dialect: 2 },
        },
      ];
      return compileSkills({ entries, instruction: 'close the filters and add a task', report: { status: 'success', summary: 'ok' }, session: 's' }).flatMap((sk) => sk.steps);
    };

    it('both runners skip the hide when it is in effect, click it when not, and stop when the click leaves the lines', async () => {
      const compiled = hideSteps(`${origin}/filters?open=1`);
      expect(compiled.find((st) => st.args.target === '@e1')?.expect?.removedContains).toEqual(['- textbox "Type a search or filter query…"', '- button "Custom"']);
      const at = (url: string) => compiled.map((st) => (st.tool === 'goto' ? { ...st, args: { url } } : st));

      const shut = await both(at(`${origin}/filters`), 0);
      expect(shut.replay.ok, shut.replay.reason ?? '').toBe(true);
      expect(shut.emitted.ok, shut.emitted.reason ?? '').toBe(true);
      await new Promise((r) => setTimeout(r, 300));
      expect(shut.replayLog, 'replay clicked a hide already in effect').toEqual(['commit:add:task']);
      expect(shut.emittedLog, 'the artifact clicked a hide already in effect').toEqual(['commit:add:task']);

      const open = await both(at(`${origin}/filters?open=1`), 0);
      expect(open.replay.ok, open.replay.reason ?? '').toBe(true);
      expect(open.emitted.ok, open.emitted.reason ?? '').toBe(true);
      await new Promise((r) => setTimeout(r, 300));
      expect(open.replayLog).toEqual(['commit:filters:toggle', 'commit:add:task']);
      expect(open.emittedLog).toEqual(['commit:filters:toggle', 'commit:add:task']);

      const stuck = await both(at(`${origin}/filters?open=1&stuck=1`), 0);
      expect(stuck.replay.ok, 'replay passed a hide that left every line').toBe(false);
      expect(stuck.emitted.ok, 'the artifact passed a hide that left every line').toBe(false);
      expect(stuck.replay.reason).toMatch(/still shows/);
      expect(stuck.emitted.reason).toMatch(/still shows/);
      await new Promise((r) => setTimeout(r, 300));
      expect(stuck.replayLog).toEqual(['commit:filters:toggle']);
      expect(stuck.emittedLog).toEqual(['commit:filters:toggle']);
    }, 240_000);

    it('a Save whose only recorded effect was its form closing is a write: clicked when open, a stop when the form is not there', async () => {
      // The segment filled the form, so the Save's removal is REQUIRED
      // (compile.ts markRequiredRemovals): never "already in effect". Before
      // this, with the fill gone wrong, the Save was skipped and the step
      // passed with nothing written.
      const url = `${origin}/modal?open=1`;
      const entries: RecordedEntry[] = [
        { k: 'instruction', text: 'fill in the task form and save it', url },
        { k: 'step', tool: 'goto', args: { url }, locators: {}, diff: { url, alerts: [], added: [], dialect: 2 } },
        {
          k: 'step',
          tool: 'fill',
          args: { target: '@e1', value: 'Bench' },
          locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'textbox', name: 'Title' }] } },
          diff: { url, alerts: [], added: ['- textbox "Title": Bench'], dialect: 2 },
        },
        {
          k: 'step',
          tool: 'click',
          args: { target: '@e2' },
          locators: { target: { expr: 'x', verified: true, raw: '@e2', chain: [{ kind: 'role', role: 'button', name: 'Save' }] } },
          diff: { url, alerts: [], added: [], removed: ['- heading "Edit task"', '- textbox "Title": Bench'], dialect: 2 },
        },
      ];
      const compiled = compileSkills({ entries, instruction: 'fill in the task form and save it', report: { status: 'success', summary: 'ok' }, session: 's' }).flatMap((sk) => sk.steps);
      const save = compiled.find((st) => st.tool === 'click')!;
      expect(save.expect?.removalRequired).toBe(true);

      const open = await both(compiled, 0);
      expect(open.replay.ok, open.replay.reason ?? '').toBe(true);
      expect(open.emitted.ok, open.emitted.reason ?? '').toBe(true);
      await new Promise((r) => setTimeout(r, 300));
      expect(open.replayLog).toEqual(['commit:save:Bench']);
      expect(open.emittedLog).toEqual(['commit:save:Bench']);

      // The form not open when the Save comes (an earlier step went wrong): a stop, never a skip.
      const missing = compiled.filter((st) => st.tool !== 'fill').map((st) => (st.tool === 'goto' ? { ...st, args: { url: `${origin}/modal` } } : st));
      const shut = await both(missing, 0);
      expect(shut.replay.ok, 'replay passed a Save whose form was not there').toBe(false);
      expect(shut.emitted.ok, 'the artifact passed a Save whose form was not there').toBe(false);
      expect(shut.replay.reason).toMatch(/shows none of what it was recorded closing/);
      expect(shut.emitted.reason).toMatch(/shows none of what it was recorded closing/);
      await new Promise((r) => setTimeout(r, 300));
      expect(shut.replayLog).toEqual([]);
      expect(shut.emittedLog).toEqual([]);
    }, 240_000);
  });

  describe('a click the app ignored once (round 57, fwgh12 03-publish)', () => {
    /**
     * ghost fwgh12-n1: after the publish flow the first click on link
     * "Published" did nothing (url held, nothing added), a read and a
     * screenshot followed, and the identical click navigated. Compiled from
     * such a recording, the click is kept once, marked repeatIfNoEffect; both
     * runners press again when a press changes nothing, and both still stop
     * when the second press does nothing either.
     */
    const ignoredSteps = (): SkillStep[] => {
      const url = `${origin}/ignored`;
      const link = { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role' as const, role: 'link', name: 'Published' }] };
      const entries: RecordedEntry[] = [
        { k: 'instruction', text: 'open the published posts', url },
        { k: 'step', tool: 'goto', args: { url }, locators: {}, diff: { url, alerts: [], added: [], dialect: 2 } },
        { k: 'step', tool: 'click', args: { target: '@e1' }, locators: { target: link }, diff: { url, alerts: [], added: [], removed: [], dialect: 2 } },
        { k: 'step', tool: 'read_all', args: { target: '#list h2', what: 'text' }, locators: { target: { expr: 'x', verified: true, raw: '#list h2', chain: [{ kind: 'css', selector: '#list h2' }] } }, result: '[]' },
        { k: 'step', tool: 'click', args: { target: '@e1' }, locators: { target: link }, diff: { url: `${url}#/posts?type=published`, alerts: [], added: ['- heading "Seed: Welcome to the bench"'], dialect: 2 } },
      ];
      return compileSkills({ entries, instruction: 'open the published posts', report: { status: 'success', summary: 'ok' }, session: 's' }).flatMap((sk) => sk.steps);
    };

    it('both runners press again after a press that changed nothing, and stop when that does nothing either', async () => {
      const compiled = ignoredSteps();
      const clicks = compiled.filter((st) => st.tool === 'click');
      expect(clicks).toHaveLength(1);
      expect(clicks[0].repeatIfNoEffect).toBe(true);

      const ok = await both(compiled, 0);
      expect(ok.replay.ok, ok.replay.reason ?? '').toBe(true);
      expect(ok.emitted.ok, ok.emitted.reason ?? '').toBe(true);
      await new Promise((r) => setTimeout(r, 300));
      expect(ok.replayLog).toEqual(['commit:list:published']);
      expect(ok.emittedLog).toEqual(['commit:list:published']);

      const dead = await both(compiled.map((st) => (st.tool === 'goto' ? { ...st, args: { url: `${origin}/ignored?dead=1` } } : st)), 0);
      expect(dead.replay.ok, 'replay passed a link that never moved').toBe(false);
      expect(dead.emitted.ok, 'the artifact passed a link that never moved').toBe(false);
      expect(dead.replayLog).toEqual([]);
      expect(dead.emittedLog).toEqual([]);
    }, 240_000);
  });

  describe('list reads split per element (fwop7 02-open)', () => {
    it('both runners publish each value a read_all was the one-to-one source of', async () => {
      // openproject fwop7-n1: the seed subjects were read only through a
      // read_all, every element one reported value; compile now splits it into
      // per-element reads (compile.ts expandListReads).
      const entries: RecordedEntry[] = [
        { k: 'instruction', text: 'List the items', url: `${origin}/rows` },
        { k: 'step', tool: 'goto', args: { url: `${origin}/rows` }, locators: {} },
        {
          k: 'step',
          tool: 'read_all',
          args: { target: 'li.item', what: 'text' },
          locators: { target: { expr: "page.locator('li.item')", verified: true, raw: 'li.item', chain: [{ kind: 'css', selector: 'li.item' }] } },
          result: JSON.stringify(['Item 1 Open', 'Item 2 Open', 'Item 3 Open']),
        },
      ];
      const values = { first_item: 'Item 1 Open', second_item: 'Item 2 Open', third_item: 'Item 3 Open' };
      const [compiled] = compileSkills({ entries, instruction: 'List the items', report: { status: 'success', summary: 'ok', evidence: { values } }, session: 's' });
      expect(compiled.steps.filter((st) => st.tool === 'read').map((st) => st.label)).toEqual(['first_item', 'second_item', 'third_item']);
      const { replay, emitted } = await both(compiled.steps, 3);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      for (const [key, want] of Object.entries(values)) {
        expect(replay.outputs[key]?.replace(/\s+/g, ' ').trim()).toBe(want);
        expect(emitted.outputs[`01-clear.${key}`]?.replace(/\s+/g, ' ').trim()).toBe(want);
      }
    }, 120_000);
  });

  describe('echo reads', () => {
    it('both runners flag a read that echoes the filled value, and only that read', async () => {
      const steps: SkillStep[] = [
        { tool: 'goto', args: { url: `${origin}/editor` }, locators: {} },
        { tool: 'fill', args: { target: '@e1', value: 'echoed notes x61' }, locators: { target: [{ kind: 'css', selector: '#mon textarea' }] } },
        { tool: 'read', args: { target: '@e2', what: 'text', label: 'shown' }, label: 'shown', locators: { target: [{ kind: 'css', selector: '#mon .view-lines' }] } },
        { tool: 'read', args: { target: '@e3', what: 'text', label: 'heading' }, label: 'heading', locators: { target: [{ kind: 'css', selector: 'h1' }] } },
      ];
      const { replay, emitted } = await both(steps, 0);

      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      // The values are still published on both sides: an echo is a confidence finding, not a gate.
      expect(replay.outputs.shown?.replace(/ /g, ' ')).toBe('echoed notes x61');
      expect(emitted.outputs['01-clear.shown']?.replace(/ /g, ' ')).toBe('echoed notes x61');
      expect(replay.echoed).toEqual(['shown']);
      expect(emitted.echoed).toEqual(['shown']);
    }, 120_000);

    /**
     * fwrd86 01-signin: "read 'ticket_title' returned a value the skill itself
     * set … dropped from the report's confident values" — and the daemon's
     * report then carried ticket_title all the same, refilled from the
     * template's "{{v4}}". The artifact never did: the echoed read sets the
     * key, the template only fills an unset one, and run.echoed marks it. So
     * the confident report differed by one key. Both now withhold the echo
     * from the confident report and both still give it to a later reference.
     */
    it('neither runner reports an echo as confident, though the template carries it; both still publish it for references', async () => {
      const steps: SkillStep[] = [
        { tool: 'goto', args: { url: `${origin}/editor` }, locators: {} },
        { tool: 'fill', args: { target: '@e1', value: '{{v1}}' }, locators: { target: [{ kind: 'css', selector: '#mon textarea' }] } },
        { tool: 'read', args: { target: '@e2', what: 'text', label: 'shown' }, label: 'shown', locators: { target: [{ kind: 'css', selector: '#mon .view-lines' }] } },
        { tool: 'read', args: { target: '@e3', what: 'text', label: 'heading' }, label: 'heading', locators: { target: [{ kind: 'css', selector: 'h1' }] } },
      ];
      const params = { v1: 'echoed notes x62' };
      const skillParams = (): Record<string, SkillParam> => ({ v1: { example: 'echoed notes x61', usedIn: [2] } });
      const report = { summary: '', values: { shown: '{{v1}}' } };
      const skill: Skill = { ...skillOf(steps), params: skillParams(), reportTemplate: report };
      const spec = specOf(steps);
      spec.steps[0].params = { v1: 'echoed notes x62' };
      spec.steps[0].segments[0] = { ...spec.steps[0].segments[0], params: skillParams(), report };

      // The daemon: run_skill, then the flow runner's own report assembly
      // (replayDirect: the confident values without the echoes, then replayReport).
      reset(0);
      const session = new BrowserSession({ session: `parity-echo-${Date.now()}`, persist: false, learn: true });
      let replay: ReplayResult;
      let confident: Record<string, string>;
      try {
        const page = await session.getPage();
        await page.goto(`${origin}/`);
        session.learn!.put(skill);
        const out = await executeTool(session, 'run_skill', { id: skill.id, params }, os.tmpdir());
        replay = out.replay as ReplayResult;
        expect(replay?.ok, replay?.reason ?? String(out.result)).toBe(true);
        const live = Object.fromEntries(Object.entries(replay.values).filter(([k]) => !replay.echoedValues.includes(k)));
        confident = (await replayReport(() => session.getPage(), skill, params, live, { withhold: replay.echoedValues })).report.evidence?.values as Record<string, string>;
      } finally {
        await session.close();
      }
      reset(0);
      const emitted = await emittedOf(spec, params);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      const emittedConfident = Object.keys(emitted.outputs)
        .filter((k) => k.startsWith('01-clear.') && !emitted.echoed!.includes(k.slice('01-clear.'.length)))
        .map((k) => k.slice('01-clear.'.length));

      expect(replay.echoedValues).toEqual(['shown']);
      expect(emitted.echoed).toEqual(['shown']);
      expect(Object.keys(confident).sort()).toEqual(['heading']);
      expect(emittedConfident.sort()).toEqual(['heading']);
      // For a later step's reference, both still carry the read.
      expect(replay.values.shown?.replace(/\s/g, ' ')).toBe('echoed notes x62');
      expect(emitted.outputs['01-clear.shown']?.replace(/\s/g, ' ')).toBe('echoed notes x62');
    }, 120_000);
  });

  /**
   * Gaps 15a/15b. Two recovery rungs replay had and the artifact did not: the
   * artifact failed where replay recovered. Both now run the shared
   * src/execution/recover.ts, so both recover — and both still refuse where
   * the rung does not apply.
   */
  describe('recovery rungs', () => {
    // Built per case: `origin` is only known once the fixture server is up.
    const openLink = (urlPattern = `${origin}/record/r7`): SkillStep => ({
      tool: 'click',
      args: { target: '@e1' },
      locators: { target: [{ kind: 'role', role: 'link', name: 'Open record r7' }] },
      expect: { urlPattern },
    });
    const openVia = (mode: string, step: SkillStep = openLink()): SkillStep[] => [{ tool: 'goto', args: { url: `${origin}/nav/${mode}` }, locators: {} }, step, MARK];

    it('both runners reach a gone link’s recorded destination through another link to it, and go on', async () => {
      const { replay, emitted, replayLog, emittedLog } = await both(openVia('other'), 0);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual(['visit:r7', 'mark:r7']);
      expect(emittedLog).toEqual(['visit:r7', 'mark:r7']);
    }, 120_000);

    it('both runners navigate straight to a concrete recorded destination when no link to it is left', async () => {
      const { replay, emitted, replayLog, emittedLog } = await both(openVia('none'), 0);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual(['visit:r7', 'mark:r7']);
      expect(emittedLog).toEqual(['visit:r7', 'mark:r7']);
    }, 120_000);

    it('neither runner guesses a destination that is not concrete, and both stop before the next mutation', async () => {
      const wildcard = openLink(`${origin}/record/:id`);
      const { replay, emitted, replayLog, emittedLog } = await both(openVia('none', wildcard), 0);
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      expect(replay.reason).toMatch(/no element matched/);
      expect(emitted.reason).toMatch(/none of 1 recorded locators resolved/);
      expect(replayLog).toEqual([]);
      expect(emittedLog).toEqual([]);
    }, 120_000);

    const waitTicket: SkillStep = {
      tool: 'wait_for',
      args: { target: '@e1', state: 'text_contains', text: 'T-9 created', timeout_ms: 1000 },
      locators: { target: [{ kind: 'id', selector: '#status' }, { kind: 'role', role: 'region', name: 'Tickets' }] },
    };
    const heldSteps = (mode: string): SkillStep[] => [{ tool: 'goto', args: { url: `${origin}/held/${mode}` }, locators: {} }, waitTicket, MARK];

    it('both runners pass a text wait whose text another recorded candidate already shows, and go on', async () => {
      const { replay, emitted, replayLog, emittedLog } = await both(heldSteps('yes'), 0);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual(['mark:held']);
      expect(emittedLog).toEqual(['mark:held']);
    }, 120_000);

    it('both runners stop on a text wait no recorded candidate shows, before the next mutation', async () => {
      const { replay, emitted, replayLog, emittedLog } = await both(heldSteps('no'), 0);
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      expect(replayLog).toEqual([]);
      expect(emittedLog).toEqual([]);
    }, 120_000);
  });

  /**
   * Gap 9's residual. A step recorded to mint `{{d1}}` off its url lands, this
   * run, on a url that does not carry the part. Replay leaves `d1` unset, so a
   * later url expectation naming `{{d1}}` reads it as a wildcard; the artifact
   * used to bind '' and then required an EMPTY segment there, stopping where
   * replay went on. Both now leave it unset — and both still stop when the
   * later url is a different page shape, which no wildcard can excuse.
   */
  describe('a derived value the url never carried', () => {
    const procedure = (later: string): { skill: Skill; spec: SpecFlow } => {
      const steps: SkillStep[] = [
        { tool: 'goto', args: { url: `${origin}/` }, locators: {} },
        { tool: 'goto', args: { url: later }, locators: {}, expect: { urlPattern: `${origin}/record/{{d1}}` } },
        MARK,
      ];
      const derived = { d1: { step: 1, at: 'p1', example: '42' } };
      const skill: Skill = { ...skillOf(steps), id: 's_unminted', derived };
      const spec = specOf(steps);
      spec.steps[0].segments[0] = { ...spec.steps[0].segments[0], id: 's_unminted', derived };
      return { skill, spec };
    };

    it('both runners treat the unminted marker as a wildcard in a later url expectation, and go on', async () => {
      const { skill, spec } = procedure(`${origin}/record/abc`);
      const { replay, emitted, replayLog, emittedLog } = await bothOf(skill, spec, {});
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual(['visit:abc', 'mark:abc']);
      expect(emittedLog).toEqual(['visit:abc', 'mark:abc']);
    }, 120_000);

    it('both runners still stop when the later url is another page shape, before the next mutation', async () => {
      const { skill, spec } = procedure(`${origin}/editor`);
      const { replay, emitted, replayLog, emittedLog } = await bothOf(skill, spec, {});
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      expect(replay.reason).toMatch(/expected url/);
      expect(emitted.reason).toMatch(/expected url/);
      expect(replayLog).toEqual([]);
      expect(emittedLog).toEqual([]);
    }, 120_000);
  });

  /**
   * B9-residual. A record-creating step inside a loop body mints once per
   * pass. Replay accumulates every identifier (`created`); the artifact kept
   * only the last in `<step>.minted`. It now also accumulates them in
   * `run.created`, and the two lists must agree record for record.
   */
  it('both runners keep every record a loop body minted, in order', async () => {
    const open = [{ kind: 'role' as const, role: 'link', name: 'Open' }];
    const steps: SkillStep[] = [
      { tool: 'goto', args: { url: `${origin}/rows` }, locators: {} },
      {
        tool: 'loop', args: {}, locators: {}, while: open, max: 5, scope: 'drain',
        body: [
          { tool: 'click', args: { target: '@e1' }, locators: { target: open }, mints: { at: 'p1' } },
          { tool: 'goto', args: { url: `${origin}/rows` }, locators: {} },
        ],
      },
    ];
    const { replay, emitted, replayLog, emittedLog } = await both(steps, 3);
    expect(replay.ok, replay.reason ?? '').toBe(true);
    expect(emitted.ok, emitted.reason ?? '').toBe(true);
    expect(replayLog).toEqual(['visit:Item 1', 'visit:Item 2', 'visit:Item 3']);
    expect(emittedLog).toEqual(['visit:Item 1', 'visit:Item 2', 'visit:Item 3']);
    expect(replay.created).toEqual(['Item 1', 'Item 2', 'Item 3']);
    expect(emitted.created).toEqual(['Item 1', 'Item 2', 'Item 3']);
    // the single-record handle stays the latest one
    expect(emitted.outputs['01-clear.minted']).toBe('Item 3');
  }, 120_000);

  /** The log entries of one kind (`mark:`, `tick:` …), in order. */
  const entries = (log: string[], kind: string) => log.filter((entry) => entry.startsWith(`${kind}:`) || entry === kind);

  // -------------------------------------------------------------------------
  // step effects
  // -------------------------------------------------------------------------

  /**
   * The shared step gates on the cells the earlier sections left open: a
   * plain page-change line (not a dialog) that never appeared, a url
   * expectation over a query-shaped fragment, the already-in-effect opener
   * skip in both its halves, an absence wait that still owes its
   * postconditions, a read of nothing, and a rejected record-creating click.
   * The mutation log is the oracle throughout.
   */
  describe('false successes (notes/ROBUSTNESS.md)', () => {
    /**
     * Finding 2. Approve is disabled: Playwright's own click waits for it to
     * be enabled and gives up, and the forced tier used to "succeed" on a
     * button whose handler never runs — and with no recorded effect to miss,
     * both runners went on as though it had been approved.
     */
    const gateSteps = (mode: string): SkillStep[] => [
      { tool: 'goto', args: { url: `${origin}/gate/${mode}` }, locators: {} },
      { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Approve' }] } },
    ];

    it('neither runner reports a click on a disabled control as done', async () => {
      const { replay, emitted, replayLog, emittedLog } = await both(gateSteps('disabled'), 0);
      expect(replayLog).toEqual([]);
      expect(emittedLog).toEqual([]);
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      expect(replay.reason).toMatch(/NOT dispatched: the control is disabled/);
      expect(emitted.reason).toMatch(/NOT dispatched: the control is disabled/);
      // ...and both say so as an OUTCOME, carried on the error, not only in its words.
      expect(replay.outcome).toBe('not-dispatched');
      expect(replay.reason).toMatch(/\[outcome: not dispatched\]$/);
      expect(emitted.reason).toMatch(/\[outcome: not dispatched\]/);

      const enabled = await both(gateSteps('enabled'), 0);
      expect(enabled.replay.ok, enabled.replay.reason ?? '').toBe(true);
      expect(enabled.emitted.ok, enabled.emitted.reason ?? '').toBe(true);
      expect(enabled.replayLog).toEqual(['mark:approve']);
      expect(enabled.emittedLog).toEqual(['mark:approve']);
    }, 180_000);

    // fwgr39-n3: a control disabled only while the page settles is timing, not a
    // wrong procedure — both runners wait it out and click it, once.
    it('both runners click a button that is enabled shortly after load, once', async () => {
      const { replay, emitted, replayLog, emittedLog } = await both(gateSteps('late'), 0);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual(['mark:approve']);
      expect(emittedLog).toEqual(['mark:approve']);
    }, 180_000);

    /**
     * Finding 6. Title saves 200ms after typing stops and answers 300ms later,
     * while an event stream the page opened never closes. Neither runner may
     * read the fill's effect before the save lands, nor sit out the stream:
     * both wait for the recorded "Saved: <value>" and save exactly once.
     */
    it('both runners wait for a debounced save beside an open event stream, and save once', async () => {
      const steps: SkillStep[] = [
        { tool: 'goto', args: { url: `${origin}/debounce?live=1` }, locators: {} },
        {
          tool: 'fill',
          args: { target: '@e1', value: '{{v1}}' },
          locators: { target: [{ kind: 'role', role: 'textbox', name: 'Title' }] },
          expect: { addedContains: ['- heading "Saved: {{v1}}"'], lineDialect: 2 },
        },
      ];
      const params: Record<string, SkillParam> = { v1: { example: 'Draft A', usedIn: [2], known: true } };
      const skill: Skill = { ...skillOf(steps), id: 's_debounce', template: 'title the draft {{v1}}', params };
      const spec: SpecFlow = {
        ...specOf(steps),
        steps: [{ id: '01-title', instruction: 'title the draft {{v1}}', params: { v1: 'Draft B' }, outputs: [], segments: [{ id: 's_debounce', template: 'title the draft {{v1}}', params, preconditions: { urlPattern: `${origin}/` }, steps }] }],
      };
      const { replay, emitted, replayLog, emittedLog } = await bothOf(skill, spec, { v1: 'Draft B' });
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replay.outcome).toBe('effect-verified');
      expect(replayLog).toEqual(['feed:open', 'save:Draft B']);
      expect(emittedLog).toEqual(['feed:open', 'save:Draft B']);
    }, 180_000);

    /**
     * Finding 3. The recording paid and landed on `/outcome/success`. This run
     * lands on `/outcome/failure`: same shape, one segment different, which
     * the url gate used to call a volatile value — warn, generalise to
     * `/outcome/:var`, and Mark on the failure page.
     */
    const payThenMark = (result: string, byQuery = false): SkillStep[] => [
      { tool: 'goto', args: { url: `${origin}/checkout${byQuery ? '-q' : ''}/${result}` }, locators: {} },
      {
        tool: 'click',
        args: { target: '@e1' },
        locators: { target: [{ kind: 'role', role: 'button', name: 'Pay' }] },
        expect: { urlPattern: byQuery ? `${origin}/outcome?result=success` : `${origin}/outcome/success` },
      },
      MARK,
    ];

    it('neither runner treats a different WORD route as a volatile url segment', async () => {
      const { replay, emitted, replayLog, emittedLog } = await both(payThenMark('failure'), 0);
      expect(replayLog, 'replay must not mark on the failure page').toEqual([]);
      expect(emittedLog, 'the artifact must not mark on the failure page').toEqual([]);
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      const said = /expected url \S+\/outcome\/success but browser is at \S+\/outcome\/failure/;
      expect(replay.reason).toMatch(said);
      expect(emitted.reason).toMatch(said);

      const paid = await both(payThenMark('success'), 0);
      expect(paid.replay.ok, paid.replay.reason ?? '').toBe(true);
      expect(paid.emitted.ok, paid.emitted.reason ?? '').toBe(true);
      expect(paid.replayLog).toEqual(['mark:outcome']);
      expect(paid.emittedLog).toEqual(['mark:outcome']);
    }, 180_000);

    /** Finding 3, the query half: the same outcome carried as `?result=`, which the url model used to drop. */
    it('neither runner treats a different QUERY value as the same page', async () => {
      const { replay, emitted, replayLog, emittedLog } = await both(payThenMark('failure', true), 0);
      expect(replayLog, 'replay must not mark on the failure page').toEqual([]);
      expect(emittedLog, 'the artifact must not mark on the failure page').toEqual([]);
      const said = /expected url \S+\/outcome\?result=success but browser is at \S+\/outcome\?result=failure/;
      expect(replay.reason).toMatch(said);
      expect(emitted.reason).toMatch(said);

      const paid = await both(payThenMark('success', true), 0);
      expect(paid.replay.ok, paid.replay.reason ?? '').toBe(true);
      expect(paid.emitted.ok, paid.emitted.reason ?? '').toBe(true);
      expect(paid.replayLog).toEqual(['mark:outcome']);
      expect(paid.emittedLog).toEqual(['mark:outcome']);
    }, 180_000);
  });

  describe('observation dialects (notes/ROBUSTNESS.md finding 4)', () => {
    /** A procedure with a v1 param, run from `/` through its own goto, as both runners see it. */
    const dialectProcedure = (id: string, steps: SkillStep[]): { skill: Skill; spec: SpecFlow } => {
      const params: Record<string, SkillParam> = { v1: { example: 'a@b.test', usedIn: [2], known: true } };
      const skill: Skill = { ...skillOf(steps), id, template: 'pay as {{v1}}', params };
      const spec: SpecFlow = {
        version: 1,
        name: `parity-${id}`,
        origin,
        startUrl: `${origin}/`,
        vars: [],
        steps: [{ id: '01-pay', instruction: 'pay as {{v1}}', params: { v1: 'a@b.test' }, outputs: [], segments: [{ id, template: 'pay as {{v1}}', params, preconditions: { urlPattern: `${origin}/` }, steps }] }],
      };
      return { skill, spec };
    };
    const fillEmail = (line: string, lineDialect?: 2): SkillStep => ({
      tool: 'fill',
      args: { target: '@e1', value: '{{v1}}' },
      locators: { target: [{ kind: 'role', role: 'textbox', name: 'Email' }] },
      expect: { addedContains: [line], ...(lineDialect ? { lineDialect } : {}) },
    });
    const embedMark: SkillStep = { tool: 'click', args: { target: '@e9' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Mark' }] } };

    /**
     * (a) A store compiled before dialects: its fill recorded `- textbox "":
     * {{v1}}` for an input named only by `<label for>`, and carries no dialect
     * tag. Both runners must still render the live page in dialect 1 — where
     * that input IS `""` — and pass, marking once. Tagged as dialect 1 but
     * written the dialect-2 way (`"Email"`), the same line must stop both: the
     * tag, not a union of the two renderings, decides.
     */
    it('both runners judge an untagged (dialect 1) step in dialect 1, and only in dialect 1', async () => {
      const v1 = dialectProcedure('s_dialect1', [{ tool: 'goto', args: { url: `${origin}/embed/ok` }, locators: {} }, fillEmail('- textbox "": {{v1}}'), embedMark]);
      const { replay, emitted, replayLog, emittedLog } = await bothOf(v1.skill, v1.spec, { v1: 'a@b.test' });
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual(['mark:embed']);
      expect(emittedLog).toEqual(['mark:embed']);

      const misread = dialectProcedure('s_dialect1x', [{ tool: 'goto', args: { url: `${origin}/embed/ok` }, locators: {} }, fillEmail('- textbox "Email": {{v1}}'), embedMark]);
      const wrong = await bothOf(misread.skill, misread.spec, { v1: 'a@b.test' });
      expect(wrong.replayLog, 'replay judged a dialect-1 step in dialect 2').toEqual([]);
      expect(wrong.emittedLog, 'the artifact judged a dialect-1 step in dialect 2').toEqual([]);
      expect(wrong.replay.reason).toMatch(/did not show "- textbox \\"Email\\": a@b\.test" as it did when recorded/);
      expect(wrong.emitted.reason).toMatch(/the recorded page change did not appear|did not show "- textbox \\"Email\\": a@b\.test"/);
    }, 240_000);

    /**
     * (b) A dialect-2 step whose recorded effect is a button that appears
     * INSIDE an iframe. Dialect 1 walked no frame, so no runner could have
     * verified it; both now see it and Mark once. On the page where Open
     * payment does nothing, both stop before Mark — the independent half: the
     * gate is not simply always passing.
     */
    it('both runners see a dialect-2 effect inside an iframe, and stop when it does not appear', async () => {
      const steps = (mode: string): SkillStep[] => [
        { tool: 'goto', args: { url: `${origin}/embed/${mode}` }, locators: {} },
        {
          tool: 'click',
          args: { target: '@e2' },
          locators: { target: [{ kind: 'role', role: 'button', name: 'Open payment' }] },
          expect: { addedContains: ['- button "Confirm payment"'], lineDialect: 2 },
        },
        embedMark,
      ];
      const ok = dialectProcedure('s_frame', steps('ok'));
      const { replay, emitted, replayLog, emittedLog } = await bothOf(ok.skill, ok.spec, { v1: 'a@b.test' });
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual(['mark:embed']);
      expect(emittedLog).toEqual(['mark:embed']);

      const broken = dialectProcedure('s_frame_broken', steps('broken'));
      const none = await bothOf(broken.skill, broken.spec, { v1: 'a@b.test' });
      expect(none.replayLog, 'replay marked past an effect that never appeared').toEqual([]);
      expect(none.emittedLog, 'the artifact marked past an effect that never appeared').toEqual([]);
      expect(none.replay.reason).toMatch(/none of the 1 recorded page change\(s\) appeared \(e\.g\. "- button \\"Confirm payment\\""\)/);
      expect(none.emitted.ok).toBe(false);
    }, 240_000);
  });

  describe('frame and page context (notes/ROBUSTNESS.md finding 5)', () => {
    /** One self-navigating procedure, stamped with the contract its steps need, as both runners see it. */
    const contextProcedure = (id: string, steps: SkillStep[]): { skill: Skill; spec: SpecFlow } => {
      const skill: Skill = { ...skillOf(steps), id, template: id, contract: 3, stats: { ...skillOf(steps).stats, verifiedContract: 3 } };
      const spec: SpecFlow = {
        version: 2,
        name: `parity-${id}`,
        origin,
        startUrl: `${origin}/`,
        vars: [],
        steps: [{ id: '01-context', instruction: id, params: {}, outputs: [], segments: [{ id, template: id, params: {}, preconditions: { urlPattern: `${origin}/` }, steps }] }],
      };
      return { skill, spec };
    };
    const role = (name: string, r = 'button') => [{ kind: 'role' as const, role: r, name }];

    /**
     * `/frames` has a Save of its own (POST /note) and a Payment iframe with an
     * identical Save (POST /frame-save). The procedure was recorded on the
     * frame's Save; a page-rooted chain resolves the page's Save first time,
     * uniquely, and presses it. On `/frames/renamed` nothing recorded names the
     * frame any more, and both must stop with nothing pressed — not fall back
     * to the page.
     */
    it('both runners press the in-frame Save, not the identical main-page one', async () => {
      const save = (page: string): SkillStep[] => [
        { tool: 'goto', args: { url: `${origin}${page}` }, locators: {} },
        {
          tool: 'click',
          args: { target: '@f1e2' },
          locators: { target: role('Save') },
          contexts: { target: { frame: [{ selectors: ['iframe[title="Payment"]', 'iframe[src*="/frames/inner"]'], title: 'Payment' }] } },
        },
      ];
      const ok = contextProcedure('s_frame_save', save('/frames'));
      const { replay, emitted, replayLog, emittedLog } = await bothOf(ok.skill, ok.spec, {});
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      await new Promise((r) => setTimeout(r, 300));
      expect(replayLog).toEqual(['frame-save']);
      expect(emittedLog).toEqual(['frame-save']);

      const gone = contextProcedure('s_frame_gone', save('/frames/renamed'));
      const none = await bothOf(gone.skill, gone.spec, {});
      expect(none.replayLog, 'replay pressed something without its frame').toEqual([]);
      expect(none.emittedLog, 'the artifact pressed something without its frame').toEqual([]);
      expect(none.replay.reason).toMatch(/recorded frame iframe\[title="Payment"\] not found/);
      expect(none.emitted.reason).toMatch(/recorded frame iframe\[title="Payment"\] not found/);
    }, 240_000);

    /**
     * `/opener` opens `/popup/child` in a new tab; its Approve posts /approve
     * and closes the window; After (POST /after) is back on the opener. A
     * runner that does not follow the popup looks for Approve on the opener and
     * stops with nothing approved; one that does not return to the opener
     * looks for After on a closed page.
     */
    it('both runners follow a recorded popup and return to the opener', async () => {
      const steps: SkillStep[] = [
        { tool: 'goto', args: { url: `${origin}/opener` }, locators: {} },
        { tool: 'click', args: { target: '@e1' }, locators: { target: role('Open approval', 'link') }, effect: { kind: 'popup', urlPattern: `${origin}/popup/child` } },
        { tool: 'click', args: { target: '@e2' }, locators: { target: role('Approve') }, page: 1, effect: { kind: 'close' } },
        { tool: 'click', args: { target: '@e3' }, locators: { target: role('After') } },
      ];
      const flow = contextProcedure('s_popup_flow', steps);
      const { replay, emitted, replayLog, emittedLog } = await bothOf(flow.skill, flow.spec, {});
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      await new Promise((r) => setTimeout(r, 300));
      expect(replayLog).toEqual(['approve', 'after']);
      expect(emittedLog).toEqual(['approve', 'after']);
    }, 240_000);

    /**
     * ghost fwgh6-n1 step 63: the tab its click opened arrived after the
     * capture, so the recording wrote no popup effect, only the later steps'
     * `page: 1`. Compile credits the popup to the click (creditUncreditedPopups),
     * with no url pattern, and both runners must follow whatever tab it raises.
     */
    it('both runners follow a popup compile credited from the page index alone', async () => {
      const recorded = (tool: string, chain: LocatorCandidate[], extra: Partial<RecordedStep> = {}): RecordedStep => ({
        k: 'step',
        tool,
        args: { target: '@e1' },
        locators: { target: { expr: 'x', verified: true, raw: '@e1', chain } },
        ...extra,
      });
      const entries: RecordedEntry[] = [
        { k: 'instruction', text: 'approve the order in its popup, then press After', url: `${origin}/opener` },
        recorded('click', role('Open approval', 'link')),
        recorded('click', role('Approve'), { page: 1, effect: { kind: 'close' }, afterUrl: `${origin}/opener` }),
        recorded('click', role('After')),
      ];
      const compiled = compileSkills({ entries, instruction: 'approve the order in its popup, then press After', report: { status: 'success', summary: 'ok' }, session: 's' });
      const steps = compiled.flatMap((sk) => sk.steps);
      expect(steps[0].effect).toEqual({ kind: 'popup' });
      const flow = contextProcedure('s_popup_credited', [{ tool: 'goto', args: { url: `${origin}/opener` }, locators: {} }, ...steps]);
      const { replay, emitted, replayLog, emittedLog } = await bothOf(flow.skill, flow.spec, {});
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      await new Promise((r) => setTimeout(r, 300));
      expect(replayLog).toEqual(['approve', 'after']);
      expect(emittedLog).toEqual(['approve', 'after']);
    }, 240_000);
  });

  describe('step effects', () => {
    /**
     * Cell 1. `/stamp`: Stamp's recorded effect is `- button "Revert"`, a plain
     * line — no slot, no dialog. The server refuses the stamp and the page says
     * nothing (no toast, so the alert gate is silent), so the line is neither
     * in the step's diff nor on the page. Without the plain-group rule a runner
     * sees an action that dispatched cleanly and goes on to Mark: the log would
     * then hold a mark on a document that was never stamped.
     */
    const stampSteps = (): SkillStep[] => [
      { tool: 'goto', args: { url: `${origin}/stamp` }, locators: {} },
      {
        tool: 'click',
        args: { target: '@e1' },
        locators: { target: [{ kind: 'role', role: 'button', name: 'Stamp' }] },
        expect: { addedContains: ['- button "Revert"'] },
      },
      MARK,
    ];

    it('both runners stop on a plain recorded change that neither the diff nor the page shows, before the next mutation', async () => {
      reset(0);
      fx.faults.rejectWrite(409, { pathPrefix: '/stamp/' });
      const replay = await replayOf(skillOf(stampSteps()));
      const replayLog = [...fx.log];
      reset(0);
      fx.faults.rejectWrite(409, { pathPrefix: '/stamp/' });
      const emitted = await emittedOf(specOf(stampSteps()));
      const emittedLog = [...fx.log];

      expect(replayLog, 'replay must not mark past a stamp that did not land').toEqual([]);
      expect(emittedLog, 'the artifact must not mark past a stamp that did not land').toEqual([]);
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      expect(replay.reason).toMatch(/none of the 1 recorded page change\(s\) appeared \(e\.g\. "- button \\"Revert\\""\)/);
      expect(emitted.reason).toMatch(/the recorded page change did not appear|none of the 1 recorded page change\(s\) appeared/);

      // The control: the same steps with the stamp accepted show the line, and
      // both runners go on to Mark — so the stop above was the missing effect.
      const clear = await both(stampSteps(), 0);
      expect(clear.replay.ok, clear.replay.reason ?? '').toBe(true);
      expect(clear.emitted.ok, clear.emitted.reason ?? '').toBe(true);
      expect(clear.replayLog).toEqual(['stamp:doc', 'mark:stamp']);
      expect(clear.emittedLog).toEqual(['stamp:doc', 'mark:stamp']);
    }, 180_000);

    /**
     * Cell 2. `/hash`: the app's state lives in `#cids=1&action=9&menu_id=4`.
     * A query-shaped fragment is unordered STATE (urlDiff): the recorded
     * `#action=9&cids=1` holds on it — other key order, an extra key — and
     * `#action=7&cids=3&menu_id=8` (three literals wrong, past the two-segment
     * soft tolerance) does not. The emitter used to build its own regex for this
     * shape; a regex over the recorded string would refuse the reordered live
     * hash and stop where replay went on, or accept a wrong one replay refused.
     */
    const hashSteps = (tool: 'click' | 'goto', urlPattern: string): SkillStep[] =>
      tool === 'click'
        ? [
          { tool: 'goto', args: { url: `${origin}/hash` }, locators: {} },
          { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Open action' }] }, expect: { urlPattern } },
          MARK,
        ]
        : [
          { tool: 'goto', args: { url: `${origin}/hash#cids=1&action=9&menu_id=4` }, locators: {}, expect: { urlPattern } },
          MARK,
        ];

    it.each(['click', 'goto'] as const)('both runners pass a %s whose query-shaped hash holds the recorded state in another order, with extra keys', async (tool) => {
      const { replay, emitted, replayLog, emittedLog } = await both(hashSteps(tool, `${origin}/hash#action=9&cids=1`), 0);

      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual(['mark:hash']);
      expect(emittedLog).toEqual(['mark:hash']);
    }, 120_000);

    it.each(['click', 'goto'] as const)('both runners stop a %s whose query-shaped hash disagrees past the soft tolerance, before the next mutation', async (tool) => {
      const { replay, emitted, replayLog, emittedLog } = await both(hashSteps(tool, `${origin}/hash#action=7&cids=3&menu_id=8`), 0);

      expect(replayLog, 'replay must not mark on the wrong application state').toEqual([]);
      expect(emittedLog, 'the artifact must not mark on the wrong application state').toEqual([]);
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      // One verdict, one message: the live state is described sorted, by the shared describeUrl.
      const said = /expected url \S+\/hash#action=7&cids=3&menu_id=8 but browser is at \S+\/hash#action=9&cids=1&menu_id=4/;
      expect(replay.reason).toMatch(said);
      expect(emitted.reason).toMatch(said);
    }, 120_000);

    /**
     * Cell 3. `/menu/<mode>`: Actions is a toggle recorded to open `- menu "Row
     * actions"`, and Archive is the step inside it. (a) With the menu already
     * showing, a click would shut it: both runners skip Actions as already in
     * effect — the log has no `toggle:` — and Archive still runs. The control
     * (`closed`) toggles and archives. (b) With the Actions button gone and the
     * menu showing, the guard must not be asked at all: a guard ahead of
     * resolution would report "skipped" and go on to Archive, where the
     * daemon's order stops on the missing target.
     */
    const menuSteps = (mode: 'open' | 'closed' | 'gone'): SkillStep[] => [
      { tool: 'goto', args: { url: `${origin}/menu/${mode}` }, locators: {} },
      {
        tool: 'click',
        args: { target: '@e1' },
        locators: { target: [{ kind: 'role', role: 'button', name: 'Actions' }] },
        expect: { addedContains: ['- menu "Row actions"', '- menuitem "Archive"'] },
      },
      { tool: 'click', args: { target: '@e2' }, locators: { target: [{ kind: 'role', role: 'menuitem', name: 'Archive' }] } },
    ];

    it('both runners skip a toggle whose recorded popup is already showing, and still act inside it', async () => {
      const open = await both(menuSteps('open'), 0);
      expect(open.replayLog, 'replay must not toggle an open menu shut').toEqual(['archive:row']);
      expect(open.emittedLog, 'the artifact must not toggle an open menu shut').toEqual(['archive:row']);
      expect(open.replay.ok, open.replay.reason ?? '').toBe(true);
      expect(open.emitted.ok, open.emitted.reason ?? '').toBe(true);

      const closed = await both(menuSteps('closed'), 0);
      expect(closed.replayLog).toEqual(['toggle:actions', 'archive:row']);
      expect(closed.emittedLog).toEqual(['toggle:actions', 'archive:row']);
      expect(closed.replay.ok, closed.replay.reason ?? '').toBe(true);
      expect(closed.emitted.ok, closed.emitted.reason ?? '').toBe(true);
    }, 180_000);

    it('both runners stop, not skip, a toggle whose target no longer resolves although its popup is showing', async () => {
      const { replay, emitted, replayLog, emittedLog } = await both(menuSteps('gone'), 0);

      expect(replayLog, 'replay must not reach Archive past an unresolved click').toEqual([]);
      expect(emittedLog, 'the artifact must not reach Archive past an unresolved click').toEqual([]);
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      expect(replay.reason).toMatch(/no element matched any known locator/);
      expect(emitted.reason).toMatch(/none of 1 recorded locators resolved/);
    }, 120_000);

    /**
     * Cell 4. An absence wait whose chain resolves nothing has met its
     * condition — and still owes the step's own postconditions. Here the wait
     * also recorded where the browser should be, and it is not there. A runner
     * that returned from the met absence early (the shape of the old
     * early-return) would skip the url gate and mark; both must stop. The
     * control is the same wait with a url that holds, which marks.
     */
    const absentWait = (urlPattern: string): SkillStep[] => [
      { tool: 'wait_for', args: { target: '@e1', state: 'visible' }, locators: { target: [{ kind: 'css', selector: '.mark[data-id="Item 1"]' }] } },
      { tool: 'wait_for', args: { target: '@e2', state: 'hidden', timeout_ms: 1_000 }, locators: { target: [{ kind: 'css', selector: '.mark[data-id="Item 9"]' }] }, expect: { urlPattern } },
      { tool: 'click', args: { target: '@e3' }, locators: { target: [{ kind: 'css', selector: '.mark[data-id="Item 1"]' }] } },
    ];

    it('both runners still judge a met absence wait by its own url expectation, and stop on a wrong one', async () => {
      const wrong = await both(absentWait(`${origin}/record/elsewhere`), 2);
      expect(wrong.replayLog, 'replay must run the absence wait\'s postconditions').toEqual([]);
      expect(wrong.emittedLog, 'the artifact must run the absence wait\'s postconditions').toEqual([]);
      expect(wrong.replay.ok).toBe(false);
      expect(wrong.emitted.ok).toBe(false);
      const said = /expected url \S+\/record\/elsewhere but browser is at \S+\//;
      expect(wrong.replay.reason).toMatch(said);
      expect(wrong.emitted.reason).toMatch(said);

      const right = await both(absentWait(`${origin}/`), 2);
      expect(right.replayLog).toEqual(['mark:Item 1']);
      expect(right.emittedLog).toEqual(['mark:Item 1']);
      expect(right.replay.ok, right.replay.reason ?? '').toBe(true);
      expect(right.emitted.ok, right.emitted.reason ?? '').toBe(true);
    }, 180_000);

    /**
     * Cell 5. A read is an observation and never fatal. `#nope` is genuinely
     * absent: both runners finish, both leave that label empty, and both still
     * make the mutation after it; `#target` in the same run is present and both
     * publish its text, so "empty" is the absence and not a read that never
     * reads. The two represent "empty" differently — replay leaves the label
     * out of its values, the artifact publishes `''` — and every consumer reads
     * the two alike (`need` and the daemon's consumption gate both refuse a
     * blank; the first case in this file runs that through both runners).
     */
    it('both runners finish past a read of an absent target, leave it empty, and still act after it', async () => {
      const steps: SkillStep[] = [
        { tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target: [{ kind: 'id', selector: '#nope' }] }, label: 'gone' },
        { tool: 'read', args: { target: '@e2', what: 'text' }, locators: { target: [{ kind: 'id', selector: '#target' }] }, label: 'shown' },
        { tool: 'click', args: { target: '@e3' }, locators: { target: [{ kind: 'css', selector: '.mark[data-id="Item 1"]' }] } },
      ];
      const { replay, emitted, replayLog, emittedLog } = await both(steps, 2);

      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual(['mark:Item 1']);
      expect(emittedLog).toEqual(['mark:Item 1']);
      expect(replay.outputs.gone, 'replay publishes nothing for a read it skipped').toBeUndefined();
      expect(emitted.outputs['01-clear.gone'], 'the artifact publishes the empty value').toBe('');
      expect(replay.outputs.gone ?? '').toBe(emitted.outputs['01-clear.gone']);
      expect(replay.outputs.shown).toBe('Item 2');
      expect(emitted.outputs['01-clear.shown']).toBe('Item 2');
    }, 120_000);

    /**
     * fwop4-n2 08-open: a read-only procedure on the wrong page skipped every
     * read and reported ok. The shared observedNothing fails it — in both
     * runners, after the same steps, and before anything later could use its
     * blank values. (One read taken is enough to pass: the case above.)
     */
    it('both runners fail a read-only procedure that skipped every read it could take', async () => {
      const steps: SkillStep[] = [
        { tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target: [{ kind: 'id', selector: '#nope' }] }, label: 'a' },
        { tool: 'read', args: { target: '@e2', what: 'text' }, locators: { target: [{ kind: 'id', selector: '#nope-too' }] }, label: 'b' },
      ];
      const { replay, emitted } = await both(steps, 2);

      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      expect(replay.reason).toContain('every read of this read-only procedure was skipped');
      expect(emitted.reason).toContain('every read of this read-only procedure was skipped');
    }, 120_000);

    /**
     * A read_all is plural by design. fwod41's odoo recording read
     * `tr.o_data_row input` values: replay published every match, while the
     * artifact took `inputValue()` on the many-element locator, threw strict
     * mode and skipped the read on all five compiled runs. `/controls` has
     * two inputs (#qty = 1, #fruit empty); both runners publish the same
     * joined value, and a text read_all over two headings-and-buttons does too.
     */
    it('both runners read every match of a read_all, and attribute and count reads alike', async () => {
      const steps: SkillStep[] = [
        { tool: 'goto', args: { url: `${origin}/controls` }, locators: {} },
        { tool: 'read_all', args: { target: 'input', what: 'value' }, locators: { target: [{ kind: 'css', selector: 'input' }] }, label: 'inputs' },
        { tool: 'read_all', args: { target: 'button[id^="save-"]', what: 'text' }, locators: { target: [{ kind: 'css', selector: 'button[id^="save-"]' }] }, label: 'saves' },
        // attribute and count reads, which the artifact once refused to compile
        { tool: 'read', args: { target: '#qty', what: 'attr', attr: 'aria-label' }, locators: { target: [{ kind: 'id', selector: '#qty' }] }, label: 'qtyLabel' },
        { tool: 'read_all', args: { target: 'input', what: 'attr', attr: 'id' }, locators: { target: [{ kind: 'css', selector: 'input' }] }, label: 'ids' },
        { tool: 'read_all', args: { target: 'button[id^="save-"]', what: 'count' }, locators: { target: [{ kind: 'css', selector: 'button[id^="save-"]' }] }, label: 'saveCount' },
      ];
      const { replay, emitted } = await both(steps, 2);

      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replay.outputs.inputs).toBe('1 | ');
      expect(emitted.outputs['01-clear.inputs']).toBe(replay.outputs.inputs);
      expect(replay.outputs.saves).toBe('Save code | Save quantity | Save fruit');
      expect(emitted.outputs['01-clear.saves']).toBe(replay.outputs.saves);
      expect(replay.outputs.qtyLabel).toBe('Quantity');
      expect(emitted.outputs['01-clear.qtyLabel']).toBe(replay.outputs.qtyLabel);
      expect(replay.outputs.ids).toBe('qty | fruit');
      expect(emitted.outputs['01-clear.ids']).toBe(replay.outputs.ids);
      expect(replay.outputs.saveCount).toBe('3');
      expect(emitted.outputs['01-clear.saveCount']).toBe(replay.outputs.saveCount);
    }, 120_000);

    /**
     * Drift is a better candidate that FAILED, not a stored index. The primary
     * here is positional (an agent-typed `>> nth=0`, like grafana's
     * `div.css-qpkbik:has-text("Stat") >> nth=0`), so the policy ranks the name
     * behind it first; the name wins on the first try and nothing missed. Both
     * runners act, and neither files drift for it (fwod41 07-change was filed on
     * every run).
     */
    it('neither runner reports drift when a positional primary is only ranked behind the name that won', async () => {
      const steps: SkillStep[] = [
        { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'css', selector: 'li > button.mark >> nth=0' }, { kind: 'css', selector: '.mark[data-id="Item 1"]' }] } },
      ];
      const { replay, emitted, replayLog, emittedLog } = await both(steps, 2);

      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual(['mark:Item 1']);
      expect(emittedLog).toEqual(['mark:Item 1']);
      expect(replay.drift).toEqual([]);
      expect(emitted.drift).toEqual([]);
    }, 120_000);

    /**
     * Cell 6. `/create/form`: Create is declared record-minting at the url's
     * second path part. The server refuses it, no toast shows, and the page
     * stays on `/create/form` — whose `form` is the part a runner reading the
     * url unconditionally would publish as this run's new record. Both must
     * publish nothing (changedCreation: only a part the step CHANGED). The
     * control accepts the write, lands on `/record/r-new`, and both publish
     * `r-new`.
     */
    const createSteps = (): SkillStep[] => [
      { tool: 'goto', args: { url: `${origin}/create/form` }, locators: {} },
      { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Create' }] }, mints: { at: 'p1' } },
    ];

    it('neither runner publishes a record for a rejected create whose url part did not change', async () => {
      reset(0);
      fx.faults.rejectWrite(409, { pathPrefix: '/create/' });
      const replay = await replayOf(skillOf(createSteps()));
      const replayLog = [...fx.log];
      reset(0);
      fx.faults.rejectWrite(409, { pathPrefix: '/create/' });
      const emitted = await emittedOf(specOf(createSteps()));
      const emittedLog = [...fx.log];

      expect(replayLog).toEqual([]);
      expect(emittedLog).toEqual([]);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replay.created, 'replay must not name /create/form\'s "form" as a created record').toEqual([]);
      expect(emitted.created, 'the artifact must not name /create/form\'s "form" as a created record').toEqual([]);
      expect(emitted.outputs['01-clear.minted']).toBeUndefined();

      const made = await both(createSteps(), 0);
      expect(made.replay.ok, made.replay.reason ?? '').toBe(true);
      expect(made.emitted.ok, made.emitted.reason ?? '').toBe(true);
      expect(made.replayLog).toEqual(['create:r-new', 'visit:r-new']);
      expect(made.emittedLog).toEqual(['create:r-new', 'visit:r-new']);
      expect(made.replay.created).toEqual(['r-new']);
      expect(made.emitted.created).toEqual(['r-new']);
      expect(made.emitted.outputs['01-clear.minted']).toBe('r-new');
    }, 180_000);
  });

  // -------------------------------------------------------------------------
  // derived values across a second redirect
  // -------------------------------------------------------------------------

  /**
   * Cell 7. A derived value (`{{d1}}`) is bound off the url a step navigated
   * to. `/hop/start-5` exposes the part and, 300ms later with nothing on the
   * page changing, replaces itself with `/hop/final-5`. Which of the two a
   * runner binds decides which record the next step goes to — `visit:start-5`
   * or `visit:final-5` in the log — and a runner that binds one while the
   * other binds the second would do the same procedure's work on different
   * records. Both must bind the same value and agree on the verdict.
   */
  describe('derived values across a second redirect', () => {
    const hopSteps = (tool: 'goto' | 'click'): { skill: Skill; spec: SpecFlow } => {
      const steps: SkillStep[] = tool === 'goto'
        ? [{ tool: 'goto', args: { url: `${origin}/hop/start-5` }, locators: {}, expect: { urlPattern: `${origin}/hop/{{d1}}` } }]
        : [
          { tool: 'goto', args: { url: `${origin}/hopper` }, locators: {} },
          { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'link', name: 'Go' }] }, expect: { urlPattern: `${origin}/hop/{{d1}}` } },
        ];
      const derived = { d1: { step: steps.length, at: 'p1', example: 'final-1' } };
      steps.push({ tool: 'goto', args: { url: `${origin}/record/{{d1}}` }, locators: {} }, MARK);
      const skill = { ...skillOf(steps), derived };
      const spec = specOf(steps);
      spec.steps[0].segments[0].derived = derived;
      return { skill, spec };
    };

    it.each(['goto', 'click'] as const)('both runners bind the same value off a %s whose destination redirects once more', async (tool) => {
      const { skill, spec } = hopSteps(tool);
      const { replay, emitted, replayLog, emittedLog } = await bothOf(skill, spec, {});

      const replayMarks = entries(replayLog, 'mark');
      const emittedMarks = entries(emittedLog, 'mark');
      expect(replayMarks, `replay log: ${replayLog.join(', ')}`).toHaveLength(1);
      expect(emittedMarks, `the artifact log: ${emittedLog.join(', ')}`).toEqual(replayMarks);
      expect(entries(emittedLog, 'visit')).toEqual(entries(replayLog, 'visit'));
      expect(entries(replayLog, 'hop')[0]).toBe('hop:start-5');
      expect(entries(emittedLog, 'hop')[0]).toBe('hop:start-5');
      // A click is followed until its url holds still (the shared
      // urlHeldStill, in both runners), so the second hop was served and it
      // is the final record both went on to. The artifact used to settle the
      // DOM only, bind start-5 while replay bound final-5, and mark a
      // different record from the same procedure. A goto whose landing binds
      // a derived value is followed the same way: it used to bind at once,
      // and the result was a race with the 300ms redirect — round 46's cloud
      // run sent the artifact's goto to /record/start-5 just as the redirect
      // fired, which cancelled it (log: hop:start-5, visit:start-5,
      // hop:final-5, no mark), while the local runs passed.
      expect(replayMarks).toEqual(['mark:final-5']);
      expect(entries(replayLog, 'hop')).toContain('hop:final-5');
      expect(entries(emittedLog, 'hop')).toContain('hop:final-5');
      expect(emitted.ok, emitted.reason ?? '').toBe(replay.ok);
      expect(replay.ok, replay.reason ?? '').toBe(true);
    }, 120_000);
  });

  // -------------------------------------------------------------------------
  // native controls and the portal combobox
  // -------------------------------------------------------------------------

  /**
   * Cell 8. Three controls on `/controls`, each committed by what the APP
   * holds. (a) A recorded `select` whose label the app has renamed: only the
   * recorded `optionValue` finds the option — a runner that stopped at the
   * label fails, one that took the value picks `b-2`. (b) A `fill` into a
   * number input whose app commits on `change`: a runner firing only `input`
   * commits the old 1. (c) A `select` on a portal-rendered ARIA combobox: a
   * native `selectOption` cannot drive an <input>; only the aria-combobox
   * select-option recipe (type, then click the portal option) sets it.
   */
  describe('native controls and the portal combobox', () => {
    const controlSteps = (action: SkillStep, save: string): SkillStep[] => [
      { tool: 'goto', args: { url: `${origin}/controls` }, locators: {} },
      action,
      { tool: 'click', args: { target: '@e2' }, locators: { target: [{ kind: 'role', role: 'button', name: save }] } },
    ];

    it('both runners fall back to the recorded option value when the label misses', async () => {
      const choose: SkillStep = { tool: 'select', args: { target: '@e1', option: 'Bravo', optionValue: 'b-2' }, locators: { target: [{ kind: 'role', role: 'combobox', name: 'Code' }] } };
      const { replay, emitted, replayLog, emittedLog } = await both(controlSteps(choose, 'Save code'), 0);

      expect(replayLog).toEqual(['commit:code:b-2']);
      expect(emittedLog).toEqual(['commit:code:b-2']);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
    }, 120_000);

    it('both runners deliver change to a number input, and the app commits the filled quantity', async () => {
      const fillQty: SkillStep = { tool: 'fill', args: { target: '@e1', value: '7' }, locators: { target: [{ kind: 'role', role: 'spinbutton', name: 'Quantity' }] } };
      const { replay, emitted, replayLog, emittedLog } = await both(controlSteps(fillQty, 'Save quantity'), 0);

      expect(replayLog, 'replay must commit 7, not the quantity the app last saw a change for').toEqual(['commit:qty:7']);
      expect(emittedLog, 'the artifact must commit 7, not the quantity the app last saw a change for').toEqual(['commit:qty:7']);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
    }, 120_000);

    /**
     * Round 56, odoo fwod82 02-create: the product was the option the step
     * clicked, and the click's own diff showed the combobox holding it — the
     * one place the page named it once. selectionReadBack reads it there,
     * right after the click. It echoes what the step selected, so both runners
     * keep it out of the confident values (echoed) and still publish it for a
     * later step's reference (fwod82's 04-change binds v2 to it).
     */
    it('both runners re-read the option a step selected from the control it filled, as an echo that still publishes', async () => {
      const combobox = { kind: 'role' as const, role: 'combobox', name: 'Fruit' };
      const recorded: RecordedStep[] = [
        { k: 'step', tool: 'goto', args: { url: `${origin}/controls` }, locators: {} },
        { k: 'step', tool: 'type', args: { target: '@e1', text: 'ban' }, locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [combobox] } } },
        {
          k: 'step',
          tool: 'click',
          args: { target: 'role=option[name="banana x2"]' },
          locators: { target: { expr: 'x', verified: true, raw: 'x', chain: [{ kind: 'role', role: 'option', name: 'banana x2' }] } },
          diff: { url: `${origin}/controls`, alerts: [], added: ['- combobox "Fruit": banana x2'] },
        },
        { k: 'step', tool: 'click', args: { target: '@e2' }, locators: { target: { expr: 'x', verified: true, raw: '@e2', chain: [{ kind: 'role', role: 'button', name: 'Save fruit' }] } } },
      ];
      const selected = selectionReadBack(recorded, 'banana x2', 'fruit');
      expect(selected).not.toBeNull();
      const withRead = [...recorded];
      withRead.splice(withRead.indexOf(selected!.after) + 1, 0, selected!.read);
      const steps: SkillStep[] = withRead.map((s) => ({
        tool: s.tool,
        args: s.args,
        locators: s.locators.target ? { target: s.locators.target.chain ?? [] } : {},
        ...(s.label ? { label: s.label } : {}),
      }));
      const { replay, emitted, replayLog, emittedLog } = await both(steps, 0);

      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual(['commit:fruit:banana x2']);
      expect(emittedLog).toEqual(['commit:fruit:banana x2']);
      expect(replay.outputs.fruit).toBe('banana x2');
      expect(emitted.outputs['01-clear.fruit']).toBe('banana x2');
      expect(replay.echoed).toContain('fruit');
      expect(emitted.echoed).toContain('fruit');
    }, 120_000);

    it('both runners select on a portal-rendered ARIA combobox through the recipe, and the app commits the option', async () => {
      const pick: SkillStep = { tool: 'select', args: { target: '@e1', option: 'banana x2' }, locators: { target: [{ kind: 'role', role: 'combobox', name: 'Fruit' }] } };
      const { replay, emitted, replayLog, emittedLog } = await both(controlSteps(pick, 'Save fruit'), 0);

      expect(replayLog, 'replay must choose the option the app sets on click').toEqual(['commit:fruit:banana x2']);
      expect(emittedLog, 'the artifact must choose the option the app sets on click').toEqual(['commit:fruit:banana x2']);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
    }, 120_000);
  });

  // -------------------------------------------------------------------------
  // loops with a longer body
  // -------------------------------------------------------------------------

  /**
   * Cell 9. An edit-in-place loop whose body is TWO steps: Tick the record at
   * the cursor, recorded to show `- button "All good"`, then Note. Every
   * earlier loop case has a one-step body, so nothing pinned that both runners
   * run the whole body each pass, in order, and judge the first step's own
   * expectation on every pass rather than once. On pass 2 the server refuses
   * the tick: the confirmation the first pass showed is cleared and not shown
   * again, and both runners must stop there — no Note for that pass, no third
   * tick. The control runs all three passes.
   */
  describe('loops with a longer body', () => {
    const tickLoop = (): SkillStep[] => {
      const tick = [{ kind: 'role' as const, role: 'button', name: 'Tick' }];
      return [
        { tool: 'goto', args: { url: `${origin}/tick` }, locators: {} },
        {
          tool: 'loop', args: {}, locators: {}, while: tick, max: 3, scope: 'drain',
          body: [
            { tool: 'click', args: { target: '@e1' }, locators: { target: tick }, expect: { addedContains: ['- button "All good"'] } },
            { tool: 'click', args: { target: '@e2' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Note' }] } },
          ],
        },
      ];
    };

    it('both runners run every step of a two-step body on every pass, judging the body step\'s own expectation', async () => {
      const { replay, emitted, replayLog, emittedLog } = await both(tickLoop(), 3);
      const all = ['tick:Item 1', 'note', 'tick:Item 2', 'note', 'tick:Item 3', 'note'];
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual(all);
      expect(emittedLog).toEqual(all);
    }, 180_000);

    it('both runners stop a two-step body on the pass whose own expectation fails', async () => {
      reset(3);
      fx.faults.rejectWrite(409, { pathPrefix: '/tick/Item%202' });
      const replay = await replayOf(skillOf(tickLoop()));
      const replayLog = [...fx.log];
      reset(3);
      fx.faults.rejectWrite(409, { pathPrefix: '/tick/Item%202' });
      const emitted = await emittedOf(specOf(tickLoop()));
      const emittedLog = [...fx.log];

      expect(replayLog, 'replay must stop at the refused tick, before its Note and the next record').toEqual(['tick:Item 1', 'note']);
      expect(emittedLog, 'the artifact must stop at the refused tick, before its Note and the next record').toEqual(['tick:Item 1', 'note']);
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      expect(replay.reason).toMatch(/none of the 1 recorded page change\(s\) appeared/);
      expect(emitted.reason).toMatch(/the recorded page change did not appear|none of the 1 recorded page change\(s\) appeared/);
    }, 180_000);
  });

  // -------------------------------------------------------------------------
  // recorded points
  // -------------------------------------------------------------------------

  /**
   * Cell 10. A `point` candidate — where the element was, and what kind of
   * thing it was — resolved by both runners on a real page (`/far`), and the
   * plausibility rule it arms. The chain's primary is gone; a structural
   * fallback `#far > button:nth-of-type(1)` resolves at once, to a Mark button
   * 3000px from the recorded box; the point names the near one. With the point
   * in the chain, both refuse the far guess as implausible and act on the near
   * button. Without it there is no yardstick: both take the structural guess
   * and mark `far` — which is what makes the point the thing that guarded.
   */
  describe('recorded points', () => {
    /** The near Mark button's recorded geometry, measured as the recorder measures it. */
    async function nearPoint(): Promise<LocatorCandidate> {
      const session = new BrowserSession({ session: `parity-point-${Date.now()}`, persist: false });
      try {
        const page = await session.getPage();
        await page.goto(`${origin}/far`);
        const geom = await page.evaluate(() => {
          const r = document.getElementById('near')!.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2 + window.scrollX), y: Math.round(r.top + r.height / 2 + window.scrollY), w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
        });
        return { kind: 'point', ...geom, role: 'button', tag: 'button' };
      } finally {
        await session.close();
      }
    }

    const farSteps = (chain: LocatorCandidate[]): SkillStep[] => [
      { tool: 'goto', args: { url: `${origin}/far` }, locators: {} },
      { tool: 'click', args: { target: '@e1' }, locators: { target: chain } },
    ];
    const gone: LocatorCandidate = { kind: 'role', role: 'button', name: 'Gone' };
    const farGuess: LocatorCandidate = { kind: 'css', selector: '#far > button:nth-of-type(1)' };

    it('both runners resolve a recorded point to the element of the recorded kind under it', async () => {
      const point = await nearPoint();
      const { replay, emitted, replayLog, emittedLog } = await both(farSteps([gone, point]), 0);

      expect(replayLog).toEqual(['mark:near']);
      expect(emittedLog).toEqual(['mark:near']);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);

      // The same place recorded as a LINK is not the same kind of thing: nothing resolves, and both stop.
      const asLink = await both(farSteps([gone, { ...point, role: 'link', tag: 'a' } as LocatorCandidate]), 0);
      expect(asLink.replayLog).toEqual([]);
      expect(asLink.emittedLog).toEqual([]);
      expect(asLink.replay.ok).toBe(false);
      expect(asLink.emitted.ok).toBe(false);
    }, 180_000);

    it('both runners refuse a structural guess far from the recorded point, and take it when no point was recorded', async () => {
      const point = await nearPoint();
      const guarded = await both(farSteps([gone, farGuess, point]), 0);
      expect(guarded.replayLog, 'replay must not act on a guess 3000px from the recorded box').toEqual(['mark:near']);
      expect(guarded.emittedLog, 'the artifact must not act on a guess 3000px from the recorded box').toEqual(['mark:near']);
      expect(guarded.replay.ok, guarded.replay.reason ?? '').toBe(true);
      expect(guarded.emitted.ok, guarded.emitted.reason ?? '').toBe(true);

      const unguarded = await both(farSteps([gone, farGuess]), 0);
      expect(unguarded.replayLog).toEqual(['mark:far']);
      expect(unguarded.emittedLog).toEqual(['mark:far']);
      expect(unguarded.replay.ok, unguarded.replay.reason ?? '').toBe(true);
      expect(unguarded.emitted.ok, unguarded.emitted.reason ?? '').toBe(true);
    }, 240_000);
  });

  // -------------------------------------------------------------------------
  // an unmeasurable fingerprint
  // -------------------------------------------------------------------------

  /**
   * Cell 11. A soft-matching start url (`/stall/rec-2` against the recorded
   * `/stall/rec-1`) whose recording kept a fingerprint of a DIFFERENT template
   * (the project form). Measured, the page refuses: similarity under the
   * threshold, exactly as G05. With `?slow=1` the page cannot be fingerprinted
   * in time (its structural walk takes 3s, past FINGERPRINT_CAPTURE_TIMEOUT_MS),
   * so `fingerprintPage` gives null, and null means the url alone decides —
   * the soft match proceeds, with the warning, in both. A runner that read an
   * unreadable page as 'unmeasured' (refuse) or as a pass of the structural
   * check would part from the other here; a runner that measured anyway would
   * refuse, which is what the control shows the measurement does.
   */
  describe('an unmeasurable fingerprint', () => {
    it('both runners fall back to the url alone when the page cannot be fingerprinted in time, and refuse once it can', async () => {
      reset(0);
      const recorded = await fingerprintOf(`${origin}/project/open`);
      const { skill, spec } = fingerprintedAt(`${origin}/stall/rec-1`, recorded, [MARK]);

      reset(0);
      const replay = await replayAt(skill, `${origin}/stall/rec-2?slow=1`);
      const replayLog = [...fx.log];
      reset(0);
      const emitted = await emittedAt(spec, `${origin}/stall/rec-2?slow=1`);
      const emittedLog = [...fx.log];

      expect(replay.similarity, 'replay must have failed to measure the page, not measured it').toBeNull();
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog).toEqual(['mark:rec-2']);
      expect(emittedLog).toEqual(['mark:rec-2']);
      const said = /start url differs from the recorded pattern in 1 segment\(s\) \(rec-1→rec-2\) — proceeding optimistically/;
      expect(replay.warnings.some((w) => said.test(w)), replay.warnings.join('\n')).toBe(true);
      expect(emitted.warnings.some((w) => said.test(w) && w.startsWith('[sitelooper warn] 01-clear s_parity:')), emitted.warnings.join('\n')).toBe(true);

      // The control: the same page, measurable. Both measure it against the
      // other template's fingerprint and refuse before Mark, naming the same
      // similarity — so the proceed above was the missing measurement.
      // A fresh procedure: the replay above confirmed its soft match and widened the stored pattern.
      const fresh = fingerprintedAt(`${origin}/stall/rec-1`, recorded, [MARK]);
      reset(0);
      const measuredReplay = await replayAt(fresh.skill, `${origin}/stall/rec-2`);
      const measuredReplayLog = [...fx.log];
      reset(0);
      const measuredEmitted = await emittedAt(fresh.spec, `${origin}/stall/rec-2`);
      const measuredEmittedLog = [...fx.log];
      expect(measuredReplayLog).toEqual([]);
      expect(measuredEmittedLog).toEqual([]);
      expect(measuredReplay.ok).toBe(false);
      expect(measuredEmitted.ok).toBe(false);
      const refused = /the url shape is close but the page structure is not — similarity (\d(?:\.\d+)?)\)/;
      expect(measuredReplay.reason).toMatch(refused);
      expect(measuredEmitted.reason).toMatch(refused);
      expect(Number(refused.exec(measuredEmitted.reason!)![1])).toBe(Number(refused.exec(measuredReplay.reason!)![1]));
      expect(measuredReplay.similarity!).toBeLessThan(SOFT_MATCH_MIN_SIMILARITY);
    }, 240_000);
  });

  /**
   * Round 55, group runners: the daemon and the artifact read the same page
   * the same way. Each procedure carries its own params, given to both.
   */
  describe('round 55: one page, one reading', () => {
    const withParams = (steps: SkillStep[], params: Record<string, SkillParam>): { skill: Skill; spec: SpecFlow } => {
      const skill: Skill = { ...skillOf(steps), params };
      const base = specOf(steps);
      const spec: SpecFlow = { ...base, steps: [{ ...base.steps[0], segments: [{ ...base.steps[0].segments[0], params }] }] };
      return { skill, spec };
    };

    it('both runners compare a text wait against rendered text, CSS text-transform included (fwop10)', async () => {
      // openproject fwop10: the recording's wait saw innerText "OVERVIEW"
      // (text-transform: uppercase over "Overview"); the artifact compared
      // textContent and failed where the daemon passed.
      const tab = [{ kind: 'css' as const, selector: '#tab' }];
      const steps: SkillStep[] = [
        { tool: 'goto', args: { url: `${origin}/transform` }, locators: {} },
        { tool: 'wait_for', args: { target: '@e1', state: 'text_contains', text: 'OVERVIEW', timeout_ms: 2000 }, locators: { target: tab } },
        { tool: 'wait_for', args: { target: '@e1', state: 'text_equals', text: 'OVERVIEW', timeout_ms: 2000 }, locators: { target: tab } },
        // the held-elsewhere rung reads its fallback the same way (recover.ts textHeldElsewhere)
        {
          tool: 'wait_for',
          args: { target: '@e2', state: 'text_contains', text: 'OVERVIEW', timeout_ms: 1500 },
          locators: { target: [{ kind: 'css', selector: '#blank' }, ...tab] },
        },
      ];
      const { replay, emitted } = await both(steps, 0);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
    }, 120_000);

    it('both runners trim a text read, and fill a slotted line with the value normalised (fwkb39)', async () => {
      // kanboard fwkb39: a read published "Backlog " and the slotted line
      // `- link "{{v5}}"` became `- link "Backlog "`, which no snapshot name
      // (whitespace collapsed and trimmed) ever shows.
      const steps: SkillStep[] = [
        { tool: 'goto', args: { url: `${origin}/board` }, locators: {} },
        { tool: 'read', args: { target: '@e1', what: 'text' }, label: 'column', locators: { target: [{ kind: 'css', selector: '#col' }] } },
        {
          tool: 'click',
          args: { target: '@e2' },
          locators: { target: [{ kind: 'role', role: 'button', name: 'Show more' }] },
          expect: { addedContains: ['- link "{{v1}}"'] },
        },
      ];
      const { skill, spec } = withParams(steps, { v1: { example: 'Ready', usedIn: [], known: true } });
      const { replay, emitted } = await bothOf(skill, spec, { v1: 'Ready ' });
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replay.outputs.column).toBe('Backlog');
      expect(emitted.outputs['01-clear.column']).toBe('Backlog');
    }, 120_000);

    it('neither runner publishes a read that fell back onto another record than its slot names (fwrd87)', async () => {
      // repairdesk fwrd87 04-add: s_9e190d was recorded adding Part A and
      // replayed for Part B. Its part_name read had no candidate scoped by
      // {{v4}}: the positional primary matched both rows, the fallback was
      // Part A's own test hook, and both runners published Part A's name.
      const positional = { kind: 'css' as const, selector: 'section > div > table > tbody > tr > td:nth-of-type(1)' };
      const bookmark = { kind: 'css' as const, selector: '[data-testid="part-row-p18"] td', nth: 0 };
      const steps: SkillStep[] = [
        { tool: 'goto', args: { url: `${origin}/parts` }, locators: {} },
        // compiled before round 55: no slot-scoped candidate, scoped by v1 all the same
        { tool: 'read', args: { target: '(read-back)', what: 'text', scopedBy: 'v1' }, label: 'part_name', locators: { target: [positional, bookmark] } },
        // compiled since: the recorded value IS the slot's, so the slot finds it
        {
          tool: 'read',
          args: { target: '(read-back)', what: 'text', scopedBy: 'v1' },
          label: 'part_name_2',
          locators: { target: [{ kind: 'text', text: '{{v1}}' }, positional, bookmark] },
        },
        // a frame whose line is the slot's value, marked where the runid slot sits
        {
          tool: 'read',
          args: { target: '(read-back)', what: 'text', frame: '{{=}} RD Part A', slotFrame: '{{v1}}', frameMark: 'v2' },
          label: 'bench_run_tag',
          locators: { target: [{ kind: 'scoped', container: 'tr', hasText: '{{v1}}', selector: 'td:nth-of-type(1)' }, positional, bookmark] },
        },
        {
          tool: 'read',
          args: { target: '(read-back)', what: 'text' },
          label: 'part_cost',
          locators: { target: [{ kind: 'scoped', container: 'tr', hasText: '{{v1}}', selector: 'td:nth-of-type(2)' }] },
        },
      ];
      const { skill, spec } = withParams(steps, {
        v1: { example: 'run-1 RD Part A', usedIn: [3, 4, 5], known: true },
        v2: { example: 'run-1', usedIn: [], known: true },
      });
      const { replay, emitted } = await bothOf(skill, spec, { v1: 'run-2 RD Part B', v2: 'run-2' });
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      // Part A's name is never published beside Part B's cost…
      expect(replay.outputs.part_name ?? '').toBe('');
      expect(emitted.outputs['01-clear.part_name'] ?? '').toBe('');
      // …the slot-scoped read finds Part B…
      expect(replay.outputs.part_name_2).toBe('run-2 RD Part B');
      expect(emitted.outputs['01-clear.part_name_2']).toBe('run-2 RD Part B');
      // …and the frame is this run's line, marked at this run's runid.
      expect(replay.outputs.bench_run_tag).toBe('run-2');
      expect(emitted.outputs['01-clear.bench_run_tag']).toBe('run-2');
      expect(replay.outputs.part_cost).toBe('$200.00');
      expect(emitted.outputs['01-clear.part_cost']).toBe('$200.00');
    }, 120_000);
  });

  /**
   * Round 56, repairdesk fwrd88 05-change: s_4b0e31 step 11 is `read_all
   * role=alert what:count`, recorded "0" after a status change that raised no
   * alert. On replay nothing matched after the full wait and a sweep, and both
   * runners SKIPPED the read, so a correctly observed "0" went unpublished.
   * A count read whose scope is on the settled page and whose every candidate
   * matches nothing publishes "0"; a count whose container never rendered, or
   * a text read, still skips.
   */
  describe('a count of nothing (round 56, fwrd88)', () => {
    const count = (label: string, target: LocatorCandidate[], what = 'count'): SkillStep => ({
      tool: 'read_all',
      args: { target: '@e1', what },
      label,
      locators: { target },
    });
    const alerts = [{ kind: 'css' as const, selector: 'role=alert' }];
    const rows = [{ kind: 'css' as const, selector: '#list > li' }];
    const scopedRows = [{ kind: 'scoped' as const, container: 'section', hasText: 'Parts', selector: 'li' }];
    const status = { tool: 'read', args: { target: '@e2', what: 'text' }, label: 'status', locators: { target: [{ kind: 'css' as const, selector: '#status' }] } } as SkillStep;

    it('both runners publish "0" for a count whose scope is on the page and matches nothing', async () => {
      const steps: SkillStep[] = [
        { tool: 'goto', args: { url: `${origin}/counts` }, locators: {} },
        status,
        count('alerts', alerts),
        count('rows', rows),
        // a text read of nothing is still no observation
        count('row_texts', rows, 'text'),
      ];
      const { replay, emitted } = await both(steps, 0);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replay.outputs.alerts).toBe('0');
      expect(emitted.outputs['01-clear.alerts']).toBe('0');
      expect(replay.outputs.rows).toBe('0');
      expect(emitted.outputs['01-clear.rows']).toBe('0');
      expect(replay.outputs.row_texts ?? '').toBe('');
      expect(emitted.outputs['01-clear.row_texts'] ?? '').toBe('');
    }, 120_000);

    it('both runners still skip a count whose container never rendered', async () => {
      const steps: SkillStep[] = [
        { tool: 'goto', args: { url: `${origin}/counts?nolist=1` }, locators: {} },
        status,
        count('alerts', alerts),
        count('rows', rows),
        count('scoped_rows', scopedRows),
      ];
      const { replay, emitted } = await both(steps, 0);
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replay.outputs.alerts).toBe('0');
      expect(emitted.outputs['01-clear.alerts']).toBe('0');
      expect(replay.outputs.rows ?? '').toBe('');
      expect(emitted.outputs['01-clear.rows'] ?? '').toBe('');
      expect(replay.outputs.scoped_rows ?? '').toBe('');
      expect(emitted.outputs['01-clear.scoped_rows'] ?? '').toBe('');
    }, 120_000);
  });

  /**
   * Round 56, vikunja fwvk8 01-open: the login page replaced its document
   * after a username fill, before that fill's own echo check looked, so the
   * check found the field empty and s_f454b1 stopped at step 3. The standing-
   * fill ledger protects a SUBMIT, not a fill's own check. Both runners now
   * repeat a fill, once, when its check failed and the document it ran in was
   * replaced at the same url (refill.ts fillLost); a value the page refused
   * on an unchanged document still stops.
   */
  describe("a fill whose document was replaced under its own check (round 56, fwvk8)", () => {
    const echoSteps = (mode: string): SkillStep[] => [
      { tool: 'goto', args: { url: `${origin}/reload-login/${mode}` }, locators: {} },
      {
        tool: 'fill',
        args: { target: '@e1', value: '{{v1}}' },
        locators: { target: [{ kind: 'label', label: 'Username' }] },
        expect: { addedContains: ['- textbox "Username": {{v1}}'], lineDialect: 2 },
      },
      { tool: 'fill', args: { target: '@e2', value: 'pass-x44' }, locators: { target: [{ kind: 'css', selector: '#password' }] } },
      { tool: 'click', args: { target: '@e3' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Sign in' }] }, expect: { urlPattern: `${origin}/signed-in` } },
    ];

    const run = (mode: string) => {
      const steps = echoSteps(mode);
      const params: Record<string, SkillParam> = { v1: { example: 'admin', usedIn: [2], known: true } };
      const skill: Skill = { ...skillOf(steps), params };
      const base = specOf(steps);
      const spec: SpecFlow = { ...base, steps: [{ ...base.steps[0], params: { v1: 'admin' }, segments: [{ ...base.steps[0].segments[0], params }] }] };
      return bothOf(skill, spec, { v1: 'admin' });
    };

    it('both runners refill a fill once when the page replaced its document before the fill was checked', async () => {
      const { replay, emitted, replayLog, emittedLog } = await run('echo');
      expect(replay.ok, replay.reason ?? '').toBe(true);
      expect(emitted.ok, emitted.reason ?? '').toBe(true);
      expect(replayLog, 'replay must sign in once').toEqual(['commit:login:admin:pass-x44']);
      expect(emittedLog, 'the artifact must sign in once').toEqual(['commit:login:admin:pass-x44']);
      for (const warnings of [replay.warnings, emitted.warnings]) {
        expect(warnings?.some((w) => /replaced its document under this fill/.test(w)), JSON.stringify(warnings)).toBe(true);
      }
    }, 120_000);

    it('both runners still stop a fill whose value the page refused without a reload', async () => {
      const { replay, emitted, replayLog, emittedLog } = await run('reject');
      expect(replay.ok).toBe(false);
      expect(emitted.ok).toBe(false);
      expect(replay.reason).toMatch(/did not show "- textbox \\"Username\\": admin"/);
      expect(emitted.reason ?? '').toMatch(/the recorded page change did not appear|did not show/);
      expect(replayLog).toEqual([]);
      expect(emittedLog).toEqual([]);
    }, 120_000);
  });
});
