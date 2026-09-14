/**
 * Differential harness: one procedure, two runners.
 *
 * Nearly every correctness finding in CORRECTNESS_PLAN.md is a place where
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
import { fingerprintPage } from '../src/execution/fingerprint.js';
import { SOFT_MATCH_MIN_SIMILARITY } from '../src/execution/gates.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';
import { goalSatisfied, type ReplayResult } from '../src/skills/replay.js';
import { ignorableRefs, resolveInstruction, resolveStepParams, type FlowStep } from '../src/skills/flow.js';
import type { Skill, SkillParam, SkillStep } from '../src/skills/store.js';
import type { LocatorCandidate } from '../src/daemon/recorder.js';
import { createFixtureServer, type FixtureServer } from './fixture/server.js';

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

  /** Run a whole procedure through daemon replay, in its own browser session. */
  async function replayOf(skill: Skill, params: Record<string, string> = {}): Promise<Outcome> {
    const session = new BrowserSession({ session: `parity-replay-${Date.now()}`, persist: false, learn: true });
    try {
      const page = await session.getPage();
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

  async function emittedOf(spec: SpecFlow, params: Record<string, string> = {}): Promise<Outcome> {
    const mod = await moduleOf(spec);

    const session = new BrowserSession({ session: `parity-spec-${Date.now()}`, persist: false });
    // The artifact's warnings go to the console; keep them for the outcome.
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => {
      const line = args.map(String).join(' ');
      if (line.startsWith('[sitelooper warn] ')) warnings.push(line.slice('[sitelooper warn] '.length));
      warn(...args);
    };
    try {
      const page = await session.getPage();
      await page.goto(mod.FLOW.startUrl);
      const run = mod.createFlowRun();
      for (const id of mod.flowStepIds) {
        await mod.steps[id](page, params, run.outputs, run);
      }
      return { ok: true, reason: null, outputs: run.outputs as Record<string, string>, echoed: run.echoed.map((key) => key.slice(key.indexOf('.') + 1)), created: run.created, drift: [...run.drift], warnings };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err), outputs: {}, echoed: [], warnings };
    } finally {
      console.warn = warn;
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
    const ignorable = ignorableRefs(allMissing, step, consumer);
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
  // A function, not a constant: `origin` is only known once the fixture server
  // is listening, which is beforeAll — after this describe body has run.
  const markStep = (): SkillStep[] => [{ tool: 'goto', args: { url: `${origin}/record/{{v1}}` }, locators: {} }, MARK];

  const readSkill = (selector: string): Skill => ({
    ...skillOf([readStep(selector)]),
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
        segments: [{ id: 's_read', template: 'read the target', params: {}, preconditions: { urlPattern: `${origin}/` }, steps: [readStep(selector)] }],
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
    const warn = console.warn;
    console.warn = (...args: unknown[]) => {
      const line = args.map(String).join(' ');
      if (line.startsWith('[sitelooper warn]')) warnings.push(line);
      else warn(...args);
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
      console.warn = warn;
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
     * ROBUSTNESS.md finding 1: the progress guard used to be judged after the
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
   * Gap 10. A read that returns only what the procedure itself typed confirms
   * the control, not that the app kept it. Replay flags it (echoedValues) and
   * the flow runner drops it from its confident values; the artifact had no
   * echo notion and published it as a finding. Both now list the same labels —
   * the editor's own display of the filled text, and NOT the page heading,
   * which is the control that proves the rule is not "every read".
   */
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
  describe('false successes (ROBUSTNESS.md)', () => {
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

  describe('observation dialects (ROBUSTNESS.md finding 4)', () => {
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

  describe('frame and page context (ROBUSTNESS.md finding 5)', () => {
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
      if (tool === 'click') {
        // A click is followed until its url holds still (the shared
        // urlHeldStill, in both runners), so the second hop was served and it
        // is the final record both went on to. The artifact used to settle the
        // DOM only, bind start-5 while replay bound final-5, and mark a
        // different record from the same procedure.
        expect(replayMarks).toEqual(['mark:final-5']);
        expect(entries(replayLog, 'hop')).toContain('hop:final-5');
        expect(entries(emittedLog, 'hop')).toContain('hop:final-5');
      }
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
});
