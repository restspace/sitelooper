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
 * Opt-in like the other browser suites: BP_BROWSER_TESTS=1.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { executeTool } from '../src/agent/tools.js';
import { BrowserSession } from '../src/daemon/browser.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';
import { goalSatisfied, type ReplayResult } from '../src/skills/replay.js';
import { ignorableRefs, resolveInstruction, resolveStepParams, type FlowStep } from '../src/skills/flow.js';
import type { Skill, SkillStep } from '../src/skills/store.js';
import { createFixtureServer, type FixtureServer } from './fixture/server.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

/** What the emitted module exposes that the harness drives directly. */
interface FlowModule {
  FLOW: SpecFlow;
  flowStepIds: readonly string[];
  createFlowRun(): { outputs: Record<string, string | undefined>; drift: string[] };
  steps: Record<
    string,
    (page: unknown, p: Record<string, string>, outputs: Record<string, string | undefined>, run: { outputs: Record<string, string | undefined>; drift: string[] }) => Promise<void>
  >;
  runFlow(page: unknown, vars: Record<string, string>, options?: { startUrl?: string }): Promise<Record<string, string | undefined>>;
}

/** One run's verdict, in the shape both sides can be compared in. */
interface Outcome {
  ok: boolean;
  reason: string | null;
  outputs: Record<string, string>;
}

d('execution parity (daemon replay vs emitted artifact)', () => {
  let fx: FixtureServer;
  let origin: string;
  let home: string;
  let emitDir: string;

  beforeAll(async () => {
    fx = await createFixtureServer(10);
    origin = fx.origin;

    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-parity-'));
    process.env.SITELOOPER_HOME = home;
    process.env.SITELOOPER_SKILLS_DIR = path.join(home, 'skills');
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
      if (!replay) return { ok: false, reason: `run_skill returned no replay: ${out.result}`, outputs: {} };
      return { ok: replay.ok, reason: replay.reason ?? null, outputs: replay.values };
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
    try {
      const page = await session.getPage();
      await page.goto(mod.FLOW.startUrl);
      const run = mod.createFlowRun();
      for (const id of mod.flowStepIds) {
        await mod.steps[id](page, params, run.outputs, run);
      }
      return { ok: true, reason: null, outputs: run.outputs as Record<string, string> };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err), outputs: {} };
    } finally {
      await session.close();
    }
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
      return { ok: false, reason: err instanceof Error ? err.message : String(err), outputs: {} };
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
   * C06, the emitted half, run as code rather than read as source.
   *
   * `present` is the artifact's whole identity gate, and it answers in two
   * dialects the daemon's snapshot collapses into one: visible TEXT, and the
   * live VALUE of a field, which `getByText` can never see (cloud run sp5odb
   * died on exactly that). Both halves have to carry the boundary rule, so
   * both are exercised here against a real DOM.
   */
  it('the emitted present helper bounds an identity marker in text and in a field value', async () => {
    const source = emitFlowFile(scopeFlow(), { tier: 'plain' }).source;
    const cuts = [/\nfunction escapeRe\([\s\S]*?\n\}\n/, /\nfunction identityRe\([\s\S]*?\n\}\n/, /\nasync function present\(page: Page[\s\S]*?\n\}\n/];
    const parts = cuts.map((re) => {
      const m = re.exec(source);
      expect(m, `the artifact must carry ${String(re)}`).not.toBeNull();
      return m![0];
    });
    const js = ts.transpileModule(parts.join('\n'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const emittedPresent = new Function(`${js}\nreturn present;`)() as (page: unknown, text: string, whole?: boolean) => Promise<boolean>;

    const session = new BrowserSession({ session: `parity-present-${Date.now()}`, persist: false });
    try {
      const page = await session.getPage();

      await page.setContent('<table><tr><td>312</td></tr></table>');
      expect(await emittedPresent(page, '12', true), '312 is not order 12').toBe(false);
      expect(await emittedPresent(page, '12'), 'the unbounded dialect is unchanged').toBe(true);

      await page.setContent('<table><tr><td>Order 12</td></tr></table>');
      expect(await emittedPresent(page, 'Order 12', true)).toBe(true);
      // Playwright tests a RegExp against text that is NOT whitespace-normalised,
      // which is why a literal space has to match any run of whitespace.
      await page.setContent('<table><tr><td>Order\n   12</td></tr></table>');
      expect(await emittedPresent(page, 'Order 12', true)).toBe(true);

      // The field dialect: an odoo form in edit mode shows the marker only as
      // an <input>'s value, and the DOM has no text node for it at all.
      await page.setContent('<input value="12">');
      expect(await emittedPresent(page, '12', true)).toBe(true);
      await page.setContent('<input value="312">');
      expect(await emittedPresent(page, '12', true)).toBe(false);

      // The shape this defect actually takes on the published stores.
      await page.setContent('<table><tr><td>fwgr25-n10 Bench Customer</td></tr></table>');
      expect(await emittedPresent(page, 'fwgr25-n1', true)).toBe(false);
      await page.setContent('<table><tr><td>fwgr25-n1 Bench Customer</td></tr></table>');
      expect(await emittedPresent(page, 'fwgr25-n1', true)).toBe(true);
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
   * Both predicates are therefore run against the same live DOM and must
   * return the same answer. A gate that only one runner applies is the same
   * class of defect as an action only one runner performs.
   */
  it('both runners refuse a goal satisfied by a different record on the same list', async () => {
    const flow = scopeFlow();
    const source = emitFlowFile(flow, { tier: 'plain' }).source;
    // sharesScope bounds its identity half through identityRe (C06), so the
    // helpers it is built on come out with it — cutting it alone would load a
    // function that throws on every call and silently "refuses" everything.
    const cut = [/\nfunction escapeRe\([\s\S]*?\n\}\n/, /\nfunction identityRe\([\s\S]*?\n\}\n/, /\nasync function sharesScope\(page: Page[\s\S]*?\n\}\n/].map((re) => {
      const m = re.exec(source);
      expect(m, `the artifact must carry ${String(re)}`).not.toBeNull();
      return m![0];
    });
    const js = ts.transpileModule(cut.join('\n'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const emittedScope = new Function(`${js}\nreturn sharesScope;`)() as (
      page: unknown,
      identity: string[],
      goal: string[],
    ) => Promise<boolean>;

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
      const emittedPending = await emittedScope(page, ['S00039'], ['Cancelled']);
      expect(replayPending).toBe(false);
      expect(emittedPending).toBe(false);

      // S00040 genuinely is, in its own row — neither may refuse that.
      const replayDone = (await goalSatisfied(page, orderSkill, { v1: 'S00040' })).satisfied;
      const emittedDone = await emittedScope(page, ['S00040'], ['Cancelled']);
      expect(replayDone).toBe(true);
      expect(emittedDone).toBe(true);

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
      expect(await emittedScope(page, ['S00039'], ['Cancelled'])).toBe(true);
    } finally {
      await session.close();
    }
  }, 120_000);
});
