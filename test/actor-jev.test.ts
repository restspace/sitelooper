/**
 * Step 5 of notes/PLAN-jev.md, the measuring half: the shadow actor.
 *
 * Two things are under test, and the second matters more than the first.
 *
 *  1. That the instrument reads correctly — agreement, position-order
 *     disagreement, a coverage miss, an unmatchable turn, a batch — against a
 *     SCRIPTED System One, because CI has no key and the tier's whole contract
 *     is that its absence is indistinguishable from its silence.
 *  2. That it cannot affect what it measures. A shadow that throws, or that
 *     hangs, or that is absent entirely must leave the loop's result, its turn
 *     count, its messages and its timing exactly as they were.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChatMessage, Completion, Provider, ToolDef, ToolCall } from '../src/agent/llm.js';
import type { BrowserSession } from '../src/daemon/browser.js';
import { runInstruction, type LoopShadow } from '../src/agent/loop.js';
import { SessionState } from '../src/daemon/state.js';
import { parseAnswers, type AskResult, type Entry, type Questions, type SystemOne, type SystemOneDecision } from '../src/agent/system-one.js';
import { buildCandidates, type ActorObservation, type ActorControl } from '../src/agent/actor.js';
import {
  actorShadow,
  actorTurnSite,
  buildTurnState,
  chainMatches,
  matchModelAction,
  modelActionOf,
  type ModelAction,
} from '../src/agent/actor-jev.js';
import type { LocatorCandidate, RecordedEntry } from '../src/daemon/recorder.js';

let tmpHome: string;
beforeAll(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-actor-'));
  process.env.SITELOOPER_HOME = tmpHome;
});
afterAll(() => {
  delete process.env.SITELOOPER_HOME;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

/** The System One twin of loop.test's scriptedProvider (see test/repair-jev.test.ts). */
function scriptedSystemOne(
  answer: (state: Entry, questions: Questions, n: number) => Record<string, unknown>,
): SystemOne & { asks: number; states: Entry[] } {
  const self = {
    model: 'jev-test',
    asks: 0,
    states: [] as Entry[],
    async ask<Q extends Questions>(state: Entry, questions: Q): Promise<AskResult<Q>> {
      const n = ++self.asks;
      self.states.push(state);
      return { ...parseAnswers(questions, { model: 'jev-test', answers: answer(state, questions, n) }), ms: 1 };
    },
  };
  return self;
}

const pick = (label: string, confidence = 0.96) => ({ type: 'choice', choice: label, confidence, probabilities: {} });
const answers = (label: string, kind = 'act', confidence = 0.96) => ({
  pick: pick(label, confidence),
  pickReversed: pick(label, confidence),
  kind: pick(kind, 0.9),
});

function control(over: Partial<ActorControl> & { id: string; role: string }): ActorControl {
  return { tag: 'button', ...over } as ActorControl;
}

const PAGE: ActorObservation = {
  id: 'obs1',
  url: 'http://127.0.0.1:4180/#/tickets',
  controls: [
    control({ id: 'c0', role: 'button', name: 'New ticket' }),
    control({ id: 'c1', role: 'button', name: 'Delete', context: { row: 'RD-1013 Blue Fox Cafe' } }),
    control({ id: 'c2', role: 'textbox', tag: 'input', type: 'text', name: 'Customer' }),
  ],
};

const INSTRUCTION = 'create a ticket for "Blue Fox Cafe"';
const ballot = () => buildCandidates({ observation: PAGE, instruction: INSTRUCTION });

/** A tool call as the provider emits one. */
function call(name: string, args: Record<string, unknown>): ToolCall {
  return { id: `t-${name}`, name, args, rawArgs: JSON.stringify(args) };
}

/** A recorded step as the recorder files one, with the chain it derived from the live element. */
function recordedStep(tool: string, chain: LocatorCandidate[]): RecordedEntry {
  return {
    k: 'step',
    tool,
    args: {},
    locators: { target: { expr: 'x', verified: true, raw: '@e1', chain } },
  } as RecordedEntry;
}

describe('the state put in front of the decision', () => {
  it('is the task, its values, the page and what has been done — never the transcript', () => {
    const { candidates, values } = ballot();
    const state = buildTurnState({
      instruction: INSTRUCTION,
      observation: PAGE,
      candidates,
      values,
      history: [{ tool: 'click', summary: '{"target":"@e4"}', ok: true }],
    }) as Record<string, unknown>;
    expect(Object.keys(state).sort()).toEqual(['actions', 'doneSoFar', 'page', 'task', 'values']);
    expect(state.values).toEqual({ v0: 'Blue Fox Cafe' });
    expect(String(JSON.stringify(state))).not.toContain('tool_call');
    // Nothing that looks like a tool RESULT: a snapshot in state is the prompt
    // this tier exists to replace.
    expect(JSON.stringify(state).length).toBeLessThan(4000);
  });

  it('says outright when the page was only partly listed, so absence is never asserted', () => {
    const { candidates, values } = ballot();
    const state = buildTurnState({
      instruction: INSTRUCTION,
      observation: { ...PAGE, truncated: true },
      candidates,
      values,
      history: [],
    }) as { page: Record<string, unknown> };
    expect(String(state.page.note)).toContain('more of this page exists');
  });
});

describe('reading one turn', () => {
  const run = async (answer: (q: Questions) => Record<string, unknown>) => {
    const { candidates, values } = ballot();
    const s1 = scriptedSystemOne((_s, q) => answer(q));
    const reading = await actorTurnSite.run(s1, { instruction: INSTRUCTION, observation: PAGE, candidates, values, history: [] }, {});
    return { reading, s1, candidates };
  };

  it('both option orders and the turn-type question ride in ONE request', async () => {
    const { reading, s1, candidates } = await run(() => answers('a0'));
    expect(s1.asks).toBe(1);
    expect(reading!.value).toBe(candidates[0]);
    expect(reading!.confidence).toBeCloseTo(0.96, 5);
  });

  it('the two orders disagreeing defers — position bias is not a reading', async () => {
    const { reading } = await run(() => ({ pick: pick('a0'), pickReversed: pick('a1'), kind: pick('act', 0.9) }));
    expect(reading!.value).toBeNull();
    expect(reading!.why).toMatch(/option orders disagreed/);
  });

  it('an abstention is a deferral with its reason, not a decision', async () => {
    const { candidates } = ballot();
    const escalate = candidates.find((c) => c.operation === 'escalate')!;
    const { reading } = await run(() => answers(escalate.id));
    expect(reading!.value).toBeNull();
    expect(reading!.why).toBe('escalate');
  });

  it('flags — but does not veto — a pick whose kind contradicts the kind question', async () => {
    const { candidates } = ballot();
    const click = candidates.find((c) => c.operation === 'click')!;
    const { reading } = await run(() => answers(click.id, 'read'));
    expect(reading!.value).toEqual(click);
    expect((reading!.detail as { kindConflict?: boolean }).kindConflict).toBe(true);
  });

  it('a page with nothing on it is not asked about at all', async () => {
    const s1 = scriptedSystemOne(() => answers('a0'));
    const reading = await actorTurnSite.run(s1, { instruction: 'x', observation: PAGE, candidates: [], values: [], history: [] }, {});
    expect(reading).toBeNull();
    expect(s1.asks).toBe(0);
  });
});

describe('matching the model to the ballot', () => {
  const { candidates } = ballot();
  const deleteRow: LocatorCandidate[] = [{ kind: 'role', role: 'button', name: 'Delete' }];

  it('matches the element the recorder described, by the recorder\'s own chain', () => {
    const m = matchModelAction(candidates, { tool: 'click', operation: 'click', chain: deleteRow });
    expect(m.coverage).toBe('matched');
    expect(m.targetChecked).toBe(true);
    expect(candidates.find((c) => c.id === m.ids[0])!.target!.control).toBe('c1');
  });

  it('a control the ballot never carried is a COVERAGE miss, not a disagreement', () => {
    const m = matchModelAction(candidates, { tool: 'click', operation: 'click', chain: [{ kind: 'role', role: 'button', name: 'Export CSV' }] });
    expect(m.coverage).toBe('not-offered');
    expect(m.ids).toEqual([]);
  });

  it('an operation the generator does not enumerate is a coverage miss too, and says so', () => {
    const m = matchModelAction(candidates, { tool: 'press', operation: null });
    expect(m.coverage).toBe('not-offered');
    expect(m.why).toMatch(/does not enumerate/);
  });

  it('a tool outside the candidate model is neither agreement nor miss', () => {
    expect(matchModelAction(candidates, { tool: 'eval', operation: null }).coverage).toBe('non-candidate-tool');
    expect(matchModelAction(candidates, { tool: 'screenshot', operation: null }).coverage).toBe('non-candidate-tool');
  });

  it('an element nothing could identify is UNMATCHABLE — never counted either way', () => {
    // A chain of nothing but css paths and a point says where the element was,
    // not what it is; it cannot confirm a match and cannot refuse one.
    const m = matchModelAction(candidates, {
      tool: 'click',
      operation: 'click',
      chain: [{ kind: 'css', selector: 'div > div:nth-child(3) > button' }],
    });
    expect(m.coverage).toBe('unmatchable');
    expect(chainMatches({ tag: 'button', role: 'button', name: 'Delete' }, [{ kind: 'css', selector: 'x' }])).toBeNull();
  });

  it('two candidates naming one control are ambiguous, not a match', () => {
    const twins = buildCandidates({
      observation: { ...PAGE, controls: [control({ id: 'c0', role: 'button', name: 'Delete' }), control({ id: 'c1', role: 'button', name: 'Delete' })] },
      instruction: INSTRUCTION,
    });
    const m = matchModelAction(twins.candidates, { tool: 'click', operation: 'click', chain: deleteRow });
    expect(m.coverage).toBe('ambiguous');
    expect(m.ids).toHaveLength(2);
  });

  it('a read, a wait and a report are matched at the level of the MOVE, and say so', () => {
    for (const [tool, op] of [['read', 'read'], ['wait_for', 'wait'], ['report', 'done'], ['snapshot', 'observe']] as const) {
      const m = matchModelAction(candidates, { tool, operation: op });
      expect(m.coverage).toBe('matched');
      expect(m.targetChecked).toBe(false);
    }
  });

  it('a batch is scored on its FIRST step, and records how many decisions it was', () => {
    const batch = call('batch', {
      steps: [
        { tool: 'fill', args: { target: '@e3', value: 'Blue Fox Cafe' } },
        { tool: 'click', args: { target: '@e1' } },
      ],
    });
    const action = modelActionOf(batch, [recordedStep('fill', [{ kind: 'role', role: 'textbox', name: 'Customer' }])]);
    expect(action.tool).toBe('fill');
    expect(action.batchSize).toBe(2);
    const m = matchModelAction(candidates, action);
    expect(m.coverage).toBe('matched');
    expect(candidates.find((c) => c.id === m.ids[0])!.target!.control).toBe('c2');
  });

  it('reads check/uncheck off the argument, not the tool name', () => {
    expect(modelActionOf(call('check', { target: '@e1', checked: false }), []).operation).toBe('uncheck');
    expect(modelActionOf(call('check', { target: '@e1' }), []).operation).toBe('check');
  });
});

// --- the shadow beside a real loop ------------------------------------------------

function scriptedProvider(script: Array<{ toolCalls: ToolCall[] }>): Provider {
  let i = 0;
  return {
    model: 'stub',
    async complete(_m: ChatMessage[], _t: ToolDef[]): Promise<Completion> {
      const step = script[Math.min(i++, script.length - 1)];
      return {
        text: null,
        toolCalls: step.toolCalls,
        assistantMessage: {
          role: 'assistant',
          content: null,
          tool_calls: step.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.rawArgs } })),
        },
        usage: { promptTokens: 100, completionTokens: 10, cachedTokens: 0 },
        served: null,
      };
    },
  };
}

const browserStub = { dialogs: { drain: () => [] } } as unknown as BrowserSession;
const loopOpts = { maxTurns: 5, timeoutMs: 30_000, screenshotDir: os.tmpdir() };
/** A snapshot turn then a report: the snapshot fails on the hollow browser, which is fine — a turn ran. */
const twoTurns = () =>
  scriptedProvider([
    { toolCalls: [call('snapshot', {})] },
    { toolCalls: [call('report', { status: 'success', summary: 'done' })] },
  ]);

describe('a shadow cannot affect what it shadows', () => {
  it('absent, the result and the turn count are identical', async () => {
    const a = await runInstruction(twoTurns(), browserStub, new SessionState('t-actor-a'), 'do it', loopOpts);
    const b = await runInstruction(twoTurns(), browserStub, new SessionState('t-actor-b'), 'do it', {
      ...loopOpts,
      shadow: { onTurnStart() {}, onTurnDecided() {}, onToolExecuted() {} },
    });
    expect(b.report).toEqual(a.report);
    expect(b.turns).toBe(a.turns);
    expect(b.usage).toEqual(a.usage);
    expect(b.actions).toEqual(a.actions);
  });

  it('a shadow that throws on every hook changes nothing', async () => {
    const throwing: LoopShadow = {
      onTurnStart() {
        throw new Error('observer exploded');
      },
      onTurnDecided() {
        throw new Error('observer exploded');
      },
      onToolExecuted() {
        throw new Error('observer exploded');
      },
    };
    const plain = await runInstruction(twoTurns(), browserStub, new SessionState('t-actor-c'), 'do it', loopOpts);
    const shadowed = await runInstruction(twoTurns(), browserStub, new SessionState('t-actor-d'), 'do it', { ...loopOpts, shadow: throwing });
    expect(shadowed.report).toEqual(plain.report);
    expect(shadowed.turns).toBe(plain.turns);
  });

  it('a shadow whose own work never finishes does not delay or fail the run', async () => {
    let started = 0;
    const slow: LoopShadow = {
      onTurnStart() {
        started++;
        // Never resolves, and is never awaited by the loop.
        void new Promise(() => {});
      },
      onTurnDecided() {},
    };
    const result = await runInstruction(twoTurns(), browserStub, new SessionState('t-actor-e'), 'do it', { ...loopOpts, shadow: slow });
    expect(result.report.status).toBe('success');
    expect(result.turns).toBe(2);
    expect(started).toBe(2);
  });

  it('is told every turn, its calls, and the model ms that weights it', async () => {
    const turns: Array<{ turn: number; tools: string[]; modelMs: number }> = [];
    const watcher: LoopShadow = {
      onTurnStart() {},
      onTurnDecided(ctx, calls, timing) {
        turns.push({ turn: ctx.turn, tools: calls.map((c) => c.name), modelMs: timing.modelMs });
      },
    };
    await runInstruction(twoTurns(), browserStub, new SessionState('t-actor-f'), 'do it', { ...loopOpts, shadow: watcher });
    expect(turns.map((t) => t.tools)).toEqual([['snapshot'], ['report']]);
    expect(turns.every((t) => t.modelMs >= 0)).toBe(true);
  });
});

describe('the rows the shadow writes', () => {
  /** The shadow with a page it can actually look at: one stubbed evaluate. */
  function browserOn(controls: ActorControl[], recorded: RecordedEntry[] = []): BrowserSession {
    return {
      ...browserStub,
      isOpen: true,
      getPage: async () => ({
        evaluate: async () => ({
          controls: controls.map(({ id: _id, ...rest }) => rest),
          alerts: [],
          truncated: false,
          url: PAGE.url,
          title: 'Tickets',
        }),
      }),
      script: {
        mark: () => 0,
        entriesSince: () => recorded,
        beginInstruction: () => {},
        endInstruction: () => {},
        addStep: () => {},
        readsThisInstruction: () => [],
        readResultsThisInstruction: () => new Set<string>(),
      },
    } as unknown as BrowserSession;
  }

  const rowsFor = async (
    answer: (q: Questions) => Record<string, unknown>,
    browser: BrowserSession,
    calls: ToolCall[],
  ): Promise<SystemOneDecision[]> => {
    const rows: SystemOneDecision[] = [];
    const shadow = actorShadow(scriptedSystemOne((_s, q) => answer(q)), { sink: (d) => rows.push(d) });
    await runInstruction(
      scriptedProvider([{ toolCalls: calls }, { toolCalls: [call('report', { status: 'success', summary: 'done' })] }]),
      browser,
      new SessionState(`t-actor-rows-${Math.random().toString(36).slice(2)}`),
      INSTRUCTION,
      { ...loopOpts, shadow },
    );
    await shadow.drain(2_000);
    return rows;
  };

  it('logs agreement when Jev picked the control the model clicked', async () => {
    const browser = browserOn(PAGE.controls, [recordedStep('click', [{ kind: 'role', role: 'button', name: 'New ticket' }])]);
    // The ballot's click on c0 — whatever id it lands on, it is the one whose
    // description names "New ticket".
    const rows = await rowsFor((q) => {
      const options = Object.entries((q.pick as { criteria: Record<string, string> }).criteria);
      const wanted = options.find(([, d]) => d.includes('New ticket'))![0];
      return answers(wanted);
    }, browser, [call('click', { target: '@e1' })]);
    const row = rows.find((r) => r.detail && (r.detail as { modelTool?: string }).modelTool === 'click')!;
    expect(row.site).toBe('actor.turn');
    expect(row.agrees).toBe(true);
    const detail = row.detail as Record<string, unknown>;
    expect(detail.coverage).toBe('matched');
    expect(detail.targetChecked).toBe(true);
    expect(detail.turnType).toBe('act');
    expect(typeof detail.modelMs).toBe('number');
    expect(typeof detail.jevMs).toBe('number');
  });

  it('logs a coverage miss without calling it a disagreement', async () => {
    const browser = browserOn(PAGE.controls, [recordedStep('click', [{ kind: 'role', role: 'button', name: 'Export CSV' }])]);
    const rows = await rowsFor(() => answers('a0'), browser, [call('click', { target: '@e9' })]);
    const row = rows.find((r) => (r.detail as { modelTool?: string }).modelTool === 'click')!;
    expect((row.detail as { coverage: string }).coverage).toBe('not-offered');
    expect(row.agrees).toBeUndefined();
  });

  it('scores the report turn as a finish, and records the turn even with no browser action', async () => {
    const browser = browserOn(PAGE.controls);
    const rows = await rowsFor((q) => {
      const options = Object.entries((q.pick as { criteria: Record<string, string> }).criteria);
      const done = options.find(([, d]) => d.includes('report the outcome'))![0];
      return answers(done, 'finish');
    }, browser, [call('report', { status: 'success', summary: 'done' })]);
    const row = rows[0];
    expect((row.detail as { modelTool: string }).modelTool).toBe('report');
    expect((row.detail as { coverage: string }).coverage).toBe('matched');
    expect(row.agrees).toBe(true);
  });

  it('a Jev that throws writes no row and leaves the run untouched', async () => {
    const rows: SystemOneDecision[] = [];
    const s1: SystemOne = {
      model: 'jev-test',
      ask() {
        throw new Error('503');
      },
    };
    const shadow = actorShadow(s1, { sink: (d) => rows.push(d) });
    const result = await runInstruction(twoTurns(), browserOn(PAGE.controls), new SessionState('t-actor-throw'), INSTRUCTION, {
      ...loopOpts,
      shadow,
    });
    await shadow.drain(2_000);
    expect(rows).toEqual([]);
    expect(result.report.status).toBe('success');
    expect(result.turns).toBe(2);
  });
});

/** Nothing above resolves a ModelAction by hand; this keeps the type honest. */
const _typecheck: ModelAction = { tool: 'click', operation: 'click' };
void _typecheck;
