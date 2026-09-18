/**
 * The acting actor (src/agent/actor-act.ts) and its seam in the loop.
 *
 * What is pinned: what code refuses however confident Jev was, how a ballot
 * entry becomes a tool call, and the loop's contract — an actor's action is
 * written into the conversation before the model is asked, a failed action
 * hands the turn to the model, and a null or throwing actor leaves the loop
 * exactly as it was.
 */
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import type { ChatMessage, Completion, Provider, ToolDef, ToolCall } from '../src/agent/llm.js';
import type { BrowserSession } from '../src/daemon/browser.js';
import { runInstruction, type LoopActor } from '../src/agent/loop.js';
import { SessionState } from '../src/daemon/state.js';
import type { ActorCandidate, TaskValue } from '../src/agent/actor.js';
import { refusal, selectorsFor, toolCallFor } from '../src/agent/actor-act.js';

const call = (name: string, args: Record<string, unknown>, id = `c_${name}`): ToolCall => ({ id, name, args, rawArgs: JSON.stringify(args) });

const candidate = (over: Partial<ActorCandidate> & { name?: string }): ActorCandidate => ({
  id: 'a1',
  observationId: 'obs1',
  operation: 'click',
  target: { control: 'c1', identity: { tag: 'button', role: 'button', name: over.name ?? 'Save' } },
  description: 'click',
  ...over,
});

describe('what code refuses, whatever the confidence', () => {
  it('leaves done, read, wait and goto to the model', () => {
    for (const operation of ['done', 'read', 'wait', 'goto', 'observe'] as const) {
      expect(refusal(candidate({ operation }), 'save the ticket', undefined)).toMatch(/model's to take/);
    }
  });

  it('refuses a control named for destruction unless the task uses the word', () => {
    expect(refusal(candidate({ name: 'Delete part' }), 'add a part called Bolt', undefined)).toMatch(/destroys/);
    expect(refusal(candidate({ name: 'Delete part' }), 'delete the part called Bolt', undefined)).toBeNull();
  });

  it('refuses a pick whose kind disagrees with the turn kind', () => {
    const detail = { kindConflict: true } as Parameters<typeof refusal>[2];
    expect(refusal(candidate({}), 'save the ticket', detail)).toMatch(/disagree/);
  });

  it('takes an ordinary click', () => {
    expect(refusal(candidate({}), 'save the ticket', undefined)).toBeNull();
  });
});

describe('a ballot entry becomes a tool call', () => {
  const values: TaskValue[] = [{ ref: 'v0', text: 'Blue Fox Cafe', kind: 'text', source: 'quoted' }];

  it('fills with the exact string code holds, never one Jev produced', () => {
    const c = toolCallFor(candidate({ operation: 'fill', valueRef: 'v0' }), '#customer', values, 'j1');
    expect(c).toMatchObject({ name: 'fill', args: { target: '#customer', value: 'Blue Fox Cafe' } });
  });

  it('is null when the value ref names nothing', () => {
    expect(toolCallFor(candidate({ operation: 'fill', valueRef: 'v9' }), '#customer', values, 'j1')).toBeNull();
  });

  it('writes uncheck as check with checked:false', () => {
    expect(toolCallFor(candidate({ operation: 'uncheck' }), '#x', values, 'j1')!.args).toEqual({ target: '#x', checked: false });
  });

  it('orders selectors as the recorder does and escapes quotes', () => {
    expect(selectorsFor({ tag: 'button', role: 'button', name: 'Say "hi"', testid: 'go', elementId: 'go-btn' })).toEqual([
      '[data-testid="go"]',
      'role=button[name="Say \\"hi\\""]',
      '#go-btn',
    ]);
  });
});

// --- the seam in the loop ---------------------------------------------------------

function scriptedProvider(script: Array<{ toolCalls: ToolCall[] }>, seen: ChatMessage[][]): Provider {
  let i = 0;
  return {
    model: 'stub',
    async complete(messages: ChatMessage[], _t: ToolDef[]): Promise<Completion> {
      seen.push([...messages]);
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
const reportOnly = (seen: ChatMessage[][]) => scriptedProvider([{ toolCalls: [call('report', { status: 'success', summary: 'done' })] }], seen);

describe('an actor in the loop', () => {
  it('acts before the model is asked, and the model is told what it did', async () => {
    const seen: ChatMessage[][] = [];
    const observed: Array<{ name: string; ok: boolean }> = [];
    let asked = 0;
    const actor: LoopActor = {
      // The hollow browser fails every tool, so this one action errors — which
      // is also the hand-over being tested: one failure, then the model.
      next: async () => (asked++ === 0 ? { call: call('click', { target: '#save' }, 'jev_1_1'), ms: 1 } : null),
      observed: (c, o) => void observed.push({ name: c.name, ok: o.ok }),
    };
    const result = await runInstruction(reportOnly(seen), browserStub, new SessionState('t-act-a'), 'do it', { ...loopOpts, actor });
    expect(result.report.status).toBe('success');
    expect(result.turns).toBe(1);
    expect(result.timing.actorActs).toBe(1);
    expect(result.timing.turns[0].actorTools).toEqual(['click']);
    // The model's first prompt already carries the actor's call and its result.
    const first = seen[0];
    const assistant = first.find((m) => m.role === 'assistant');
    expect(assistant && 'tool_calls' in assistant && assistant.tool_calls?.[0].id).toBe('jev_1_1');
    expect(first.some((m) => m.role === 'tool' && m.tool_call_id === 'jev_1_1')).toBe(true);
    // A failed action ends the actor's turn: it was not asked a second time.
    expect(asked).toBe(1);
    expect(observed).toEqual([{ name: 'click', ok: false }]);
  });

  it('that says nothing, or throws, leaves the loop as it was', async () => {
    const plain = await runInstruction(reportOnly([]), browserStub, new SessionState('t-act-b'), 'do it', loopOpts);
    for (const actor of [
      { next: async () => null, observed() {} },
      {
        next: async () => {
          throw new Error('jev is down');
        },
        observed() {
          throw new Error('and so is its bookkeeping');
        },
      },
    ] as LoopActor[]) {
      const withActor = await runInstruction(reportOnly([]), browserStub, new SessionState('t-act-c'), 'do it', { ...loopOpts, actor });
      expect(withActor.report).toEqual(plain.report);
      expect(withActor.turns).toBe(plain.turns);
      expect(withActor.usage).toEqual(plain.usage);
      expect(withActor.timing.actorActs).toBeUndefined();
    }
  });
});
