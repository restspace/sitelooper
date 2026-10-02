import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChatMessage, Completion, Provider, ToolDef } from '../src/agent/llm.js';
import { runInstruction } from '../src/agent/loop.js';
import { ASSERT_RULES, OPERATING_RULES, buildSystemPrompt } from '../src/agent/prompt.js';
import { ASSERT_TOOLS, TOOL_DEFS, assertRefusal, executeTool, toolDefsFor } from '../src/agent/tools.js';
import type { BrowserSession } from '../src/daemon/browser.js';
import { ScriptRecorder } from '../src/daemon/recorder.js';
import { SessionState } from '../src/daemon/state.js';
import { ASSERT_ONLY_STATES } from '../src/execution/assert.js';

// `sitelooper assert`, record side (notes/CONTRACT-assert.md): the model may
// only look, states the condition as wait_for calls whose expected text the
// caller wrote, and a success that rests on no wait_for is a failure.

let tmpHome: string;
beforeAll(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-assert-'));
  process.env.SITELOOPER_HOME = tmpHome;
});
afterAll(() => {
  delete process.env.SITELOOPER_HOME;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

/** A page of fields and texts by selector: just what wait_for asks a locator. `asked` counts every locator made. */
function fakePage(o: { url?: string; values?: Record<string, string>; texts?: Record<string, string> }) {
  const page = {
    asked: 0,
    url: () => o.url ?? 'http://app.test/orders/7',
    locator(selector: string) {
      page.asked++;
      const has = selector in (o.values ?? {}) || selector in (o.texts ?? {});
      const loc = {
        count: async () => (has ? 1 : 0),
        first: () => loc,
        or: () => loc,
        inputValue: async () => {
          if (!(selector in (o.values ?? {}))) throw new Error('not an input');
          return o.values![selector];
        },
        innerText: async () => {
          if (!(selector in (o.texts ?? {}))) throw new Error('no element');
          return o.texts![selector];
        },
        waitFor: async ({ state }: { state: string }) => {
          if ((state === 'visible') !== has) throw new Error(`Timeout waiting for ${state}`);
        },
      };
      return loc;
    },
  };
  return page;
}

const sessionOn = (page: unknown, extra: Record<string, unknown> = {}) =>
  ({ dialogs: { drain: () => [] }, isOpen: false, getPage: async () => page, ...extra }) as unknown as BrowserSession;

/** A session with no browser at all: a call that slipped past a refusal would throw instead of returning it. */
const nullSession = () => ({}) as unknown as BrowserSession;

const asserting = (instruction: string) => ({ assert: { instruction } });

/** Provider stub that plays back scripted completions (the last one repeats), keeping the tools it was offered. */
function scriptedProvider(script: Array<{ name: string; args: Record<string, unknown> }[]>, offered: ToolDef[][] = [], systems: string[] = []): Provider {
  let i = 0;
  return {
    model: 'stub',
    async complete(messages: ChatMessage[], tools: ToolDef[]): Promise<Completion> {
      offered.push(tools);
      systems.push(String(messages[0]?.content ?? ''));
      const turn = i;
      const toolCalls = script[Math.min(i++, script.length - 1)].map((c, k) => ({ id: `c${turn}_${k}`, name: c.name, args: c.args, rawArgs: JSON.stringify(c.args) }));
      return {
        text: null,
        toolCalls,
        assistantMessage: {
          role: 'assistant',
          content: null,
          tool_calls: toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.rawArgs } })),
        },
        usage: { promptTokens: 10, completionTokens: 1, cachedTokens: 0 },
        served: null,
      };
    },
  };
}

const report = (status: string, summary: string) => ({ name: 'report', args: { status, summary } });
const loopOpts = { maxTurns: 6, timeoutMs: 30_000, screenshotDir: os.tmpdir(), assert: true as const };

describe('assert mode: the tools offered', () => {
  it('offers only the observing tools, and never run_skill even with a store attached', () => {
    const names = toolDefsFor({ learn: {} } as unknown as BrowserSession, { on: false }, { assert: true }).map((t) => t.name);
    expect(names.sort()).toEqual([...ASSERT_TOOLS].sort());
    expect(names).toEqual(expect.arrayContaining(['snapshot', 'read', 'read_all', 'wait_for', 'report']));
    for (const acting of ['click', 'fill', 'type', 'press', 'select', 'check', 'goto', 'back', 'eval', 'batch', 'run_skill', 'hover', 'drag', 'upload']) expect(names).not.toContain(acting);
  });

  it('gives wait_for the assert-only states in assert mode, with no target required', () => {
    const def = toolDefsFor(nullSession(), { on: false }, { assert: true }).find((t) => t.name === 'wait_for')!;
    const params = def.parameters as Record<string, any>;
    expect(params.properties.state.enum).toEqual(expect.arrayContaining(['visible', 'hidden', 'text_equals', 'text_contains', 'count', 'value_equals', 'url_contains']));
    expect(params.required).toEqual(['state']);
  });

  it('never offers an ordinary instruction the assert-only states', () => {
    for (const defs of [TOOL_DEFS, toolDefsFor(nullSession()), toolDefsFor({ learn: {} } as unknown as BrowserSession)]) {
      const text = JSON.stringify(defs);
      for (const state of ASSERT_ONLY_STATES) expect(text).not.toContain(state);
    }
  });

  it('adds the assert rules after the ordinary prompt, and only in assert mode', () => {
    const parts = { briefing: 'the app', notes: ['a note'] };
    const plain = buildSystemPrompt(parts);
    const assert = buildSystemPrompt(parts, { assert: true });
    expect(plain).not.toContain('ASSERT MODE');
    expect(plain.startsWith(OPERATING_RULES)).toBe(true);
    // The ordinary prompt is the assert prompt's prefix, byte for byte.
    expect(assert).toBe(`${plain}\n\n${ASSERT_RULES}`);
    expect(ASSERT_RULES).toMatch(/CONDITION TO CHECK/);
    expect(ASSERT_RULES).toMatch(/Never act/);
    expect(ASSERT_RULES).toMatch(/wait_for/);
    expect(ASSERT_RULES).toMatch(/report failure/);
  });
});

describe('assert mode: refusals', () => {
  it('refuses a mutating tool by name before anything runs', async () => {
    for (const [name, args] of [
      ['click', { target: '#save' }],
      ['fill', { target: '#name', value: 'x' }],
      ['goto', { url: 'http://app.test/' }],
      ['eval', { expression: 'document.title' }],
      ['batch', { steps: [{ tool: 'read', args: { target: 'h1', what: 'text' } }, { tool: 'click', args: { target: '#a' } }] }],
      ['run_skill', { id: 's_1', params: {} }],
    ] as const) {
      const out = await executeTool(nullSession(), name, args, os.tmpdir(), undefined, asserting('the order total is 370.00'));
      expect(out.isError).toBe(true);
      expect(out.refused).toBe(true);
      expect(out.result).toContain(`${name} is not available`);
      expect(out.result).toMatch(/assertion/);
    }
  });

  it('refuses a text expectation that is not written in the assertion (the stated-source rule)', async () => {
    const page = fakePage({ texts: { '#total': '412.50' } });
    // The model read 412.50 off the page and asks the page to agree with itself.
    const out = await executeTool(sessionOn(page), 'wait_for', { target: '#total', state: 'text_equals', text: '412.50' }, os.tmpdir(), undefined, asserting('the order total is correct'));
    expect(out.isError).toBe(true);
    expect(out.refused).toBe(true);
    expect(out.result).toMatch(/"412\.50" is not written in the assertion/);
    expect(out.result).toMatch(/no stated source/);
    expect(page.asked).toBe(0);
  });

  it('applies the rule to every text state and to none of the others', () => {
    const said = 'the status of "demo Test" is Open and the url has /orders/';
    for (const state of ['text_equals', 'text_contains', 'value_equals']) {
      expect(assertRefusal('wait_for', { target: '#x', state, text: 'Closed' }, said)).toMatch(/not written in the assertion/);
      // Case and whitespace runs are folded, as a rendered value is compared.
      expect(assertRefusal('wait_for', { target: '#x', state, text: 'demo  test' }, said)).toBeNull();
      expect(assertRefusal('wait_for', { target: '#x', state }, said)).toMatch(/needs text/);
    }
    expect(assertRefusal('wait_for', { state: 'url_contains', text: '/invoices/' }, said)).toMatch(/not written in the assertion/);
    expect(assertRefusal('wait_for', { state: 'url_contains', text: '/orders/' }, said)).toBeNull();
    for (const args of [{ target: '#x', state: 'visible' }, { target: '#x', state: 'hidden' }, { target: 'li', state: 'count', count: 3 }]) expect(assertRefusal('wait_for', args, said)).toBeNull();
    expect(assertRefusal('wait_for', { state: 'visible' }, said)).toMatch(/needs a target/);
    expect(assertRefusal('wait_for', { target: '#x', state: 'checked' }, said)).toMatch(/not one an assertion can state/);
    for (const looking of ['snapshot', 'read', 'read_all', 'screenshot']) expect(assertRefusal(looking, {}, said)).toBeNull();
  });

  it('does not run an assert-only state for an ordinary instruction, alone or in a batch', async () => {
    const page = fakePage({ values: { '#qty': '3' } });
    const alone = await executeTool(sessionOn(page), 'wait_for', { target: '#qty', state: 'value_equals', text: '3' }, os.tmpdir());
    expect(alone.isError).toBe(true);
    expect(alone.result).toMatch(/exists only for `sitelooper assert`/);
    const batched = await executeTool(nullSession(), 'batch', { steps: [{ tool: 'read', args: { target: 'h1', what: 'text' } }, { tool: 'wait_for', args: { state: 'url_contains', text: '/orders/' } }] }, os.tmpdir());
    expect(batched.isError).toBe(true);
    expect(batched.result).toMatch(/step 2: wait_for state "url_contains" exists only for `sitelooper assert`/);
    expect(page.asked).toBe(0);
  });
});

describe('assert mode: value_equals and url_contains', () => {
  it('value_equals holds on the field\'s current value, compared as text_equals compares text', async () => {
    const page = fakePage({ values: { '#qty': ' 3 ' } });
    const out = await executeTool(sessionOn(page), 'wait_for', { target: '#qty', state: 'value_equals', text: '3' }, os.tmpdir(), undefined, asserting('the quantity is 3'));
    expect(out.isError).toBe(false);
    expect(out.result).toMatch(/condition met: value=/);
  });

  it('value_equals misses on another value, saying what the field holds', async () => {
    const page = fakePage({ values: { '#qty': '4' } });
    const out = await executeTool(sessionOn(page), 'wait_for', { target: '#qty', state: 'value_equals', text: '3', timeout_ms: 300 }, os.tmpdir(), undefined, asserting('the quantity is 3'));
    expect(out.isError).toBe(true);
    expect(out.refused).toBeUndefined();
    expect(out.result).toMatch(/wait_for value_equals timed out after 300ms \(last: value="4"\)/);
  });

  it('value_equals never holds on an element with no value', async () => {
    const page = fakePage({ texts: { '#label': '3' } });
    const out = await executeTool(sessionOn(page), 'wait_for', { target: '#label', state: 'value_equals', text: '3', timeout_ms: 300 }, os.tmpdir(), undefined, asserting('the quantity is 3'));
    expect(out.isError).toBe(true);
    expect(out.result).toMatch(/no field value/);
  });

  it('url_contains reads the page url and resolves no element, even when handed a target', async () => {
    const page = fakePage({ url: 'http://app.test/orders/7?tab=lines' });
    const held = await executeTool(sessionOn(page), 'wait_for', { target: '#anything', state: 'url_contains', text: '/orders/7' }, os.tmpdir(), undefined, asserting('the url contains /orders/7'));
    expect(held.isError).toBe(false);
    expect(held.result).toMatch(/condition met: url="http:\/\/app\.test\/orders\/7\?tab=lines"/);
    const missed = await executeTool(sessionOn(page), 'wait_for', { state: 'url_contains', text: '/invoices/', timeout_ms: 300 }, os.tmpdir(), undefined, asserting('the url contains /invoices/'));
    expect(missed.isError).toBe(true);
    expect(missed.result).toMatch(/wait_for url_contains timed out after 300ms/);
    expect(page.asked).toBe(0);
  });

  it('records url_contains with no target and no locator', async () => {
    const page = fakePage({ url: 'http://app.test/orders/7' });
    const prepared: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const committed: Array<{ tool: string; args: Record<string, unknown>; locators: Record<string, unknown> }> = [];
    const script = {
      prepare: async (_page: unknown, tool: string, args: Record<string, unknown>) => {
        prepared.push({ tool, args });
        return { k: 'step', tool, args, locators: {} };
      },
      commit: (step: { tool: string; args: Record<string, unknown>; locators: Record<string, unknown> }) => committed.push(step),
      fail: () => {},
    };
    const session = sessionOn({ ...page, isClosed: () => false }, { script, listPages: async () => [page] });
    const out = await executeTool(session, 'wait_for', { target: 'body', state: 'url_contains', text: '/orders/7' }, os.tmpdir(), undefined, asserting('the url contains /orders/7'));
    expect(out.result).toMatch(/condition met: url=/);
    expect(committed).toHaveLength(1);
    expect(committed[0].args).toEqual({ state: 'url_contains', text: '/orders/7' });
    expect(committed[0].locators).toEqual({});
  });
});

describe('assert mode: the loop', () => {
  it('runs with the assert tools and prompt, and reports the checks that held', async () => {
    const page = fakePage({ texts: { '#status': 'Open' }, values: { '#qty': '3' } });
    const offered: ToolDef[][] = [];
    const systems: string[] = [];
    const provider = scriptedProvider(
      [
        [{ name: 'wait_for', args: { target: '#status', state: 'text_equals', text: 'Open' } }],
        [{ name: 'wait_for', args: { target: '#qty', state: 'value_equals', text: '3' } }],
        [report('success', 'the status is Open and the quantity is 3')],
      ],
      offered,
      systems,
    );
    const result = await runInstruction(provider, sessionOn(page), new SessionState('t-assert-ok'), 'the status is Open and the quantity is 3', loopOpts);
    expect(result.report.status).toBe('success');
    expect(result.assertions).toEqual([
      { state: 'text_equals', target: '#status', text: 'Open', held: true },
      { state: 'value_equals', target: '#qty', text: '3', held: true },
    ]);
    expect(offered[0].map((t) => t.name).sort()).toEqual([...ASSERT_TOOLS].sort());
    expect(systems[0]).toContain(ASSERT_RULES);
  });

  it('turns a success with no wait_for that held into "no checkable condition was recorded"', async () => {
    const state = new SessionState('t-assert-unchecked');
    const provider = scriptedProvider([[report('success', 'the total looks right')]]);
    const result = await runInstruction(provider, sessionOn(fakePage({})), state, 'the order total is correct', loopOpts);
    // Asked once to state the condition as a wait_for, then filed as the failure it is.
    expect(result.turns).toBe(2);
    expect(result.report.status).toBe('failure');
    expect(result.report.summary).toMatch(/^no checkable condition was recorded/);
    expect(result.assertions).toEqual([]);
    expect(JSON.stringify(state.messages)).toMatch(/report held — this is an assertion, and no wait_for has held/);
  });

  it('does not count a refused wait_for or a missed one as a check that held', async () => {
    const page = fakePage({ texts: { '#total': '412.50' } });
    const provider = scriptedProvider([
      // refused: 412.50 is the page's value, not the caller's
      [{ name: 'wait_for', args: { target: '#total', state: 'text_equals', text: '412.50' } }],
      // ran, and missed
      [{ name: 'wait_for', args: { target: '#total', state: 'text_equals', text: '370.00', timeout_ms: 300 } }],
      [report('success', 'the total is shown')],
    ]);
    const result = await runInstruction(provider, sessionOn(page), new SessionState('t-assert-missed'), 'the order total is 370.00', loopOpts);
    expect(result.report.status).toBe('failure');
    expect(result.report.summary).toMatch(/no checkable condition was recorded/);
    expect(result.assertions).toEqual([{ state: 'text_equals', target: '#total', text: '370.00', held: false }]);
  });

  it('keeps a failure report a failure, with the check that missed', async () => {
    const page = fakePage({ texts: { '#total': '412.50' } });
    const provider = scriptedProvider([
      [{ name: 'wait_for', args: { target: '#total', state: 'text_equals', text: '370.00', timeout_ms: 300 } }],
      [report('failure', 'the total shows 412.50, not 370.00')],
    ]);
    const result = await runInstruction(provider, sessionOn(page), new SessionState('t-assert-failed'), 'the order total is 370.00', loopOpts);
    expect(result.report).toMatchObject({ status: 'failure', summary: 'the total shows 412.50, not 370.00' });
    expect(result.turns).toBe(2);
    expect(result.assertions).toEqual([{ state: 'text_equals', target: '#total', text: '370.00', held: false }]);
  });

  it('refuses a mutating call the model writes anyway, and tells it why', async () => {
    const state = new SessionState('t-assert-click');
    const provider = scriptedProvider([[{ name: 'click', args: { target: '#recalculate' } }], [report('failure', 'the total is not 370.00')]]);
    // No getPage at all: the click would throw if it reached the browser.
    const browser = { dialogs: { drain: () => [] }, isOpen: false } as unknown as BrowserSession;
    const result = await runInstruction(provider, browser, state, 'the order total is 370.00', loopOpts);
    expect(result.report.status).toBe('failure');
    expect(JSON.stringify(state.messages)).toMatch(/click is not available: this instruction is an assertion/);
  });

  it('leaves an ordinary instruction without assertions, assert tools or assert rules', async () => {
    const offered: ToolDef[][] = [];
    const systems: string[] = [];
    const provider = scriptedProvider([[report('success', 'done')]], offered, systems);
    const { assert: _assert, ...plain } = loopOpts;
    const result = await runInstruction(provider, sessionOn(fakePage({})), new SessionState('t-plain'), 'do the thing', plain);
    expect(result.report.status).toBe('success');
    expect(result.assertions).toBeUndefined();
    expect(offered[0].map((t) => t.name)).toContain('click');
    expect(systems[0]).not.toContain('ASSERT MODE');
  });
});

describe('assert mode: the recording', () => {
  it('files the instruction entry with assert: true, and an ordinary one without', async () => {
    const recorder = new ScriptRecorder('t-assert-recorded');
    const browser = { dialogs: { drain: () => [] }, isOpen: false, script: recorder } as unknown as BrowserSession;
    const provider = scriptedProvider([[report('failure', 'no error banner element exists to check')]]);
    await runInstruction(provider, browser, new SessionState('t-assert-recorded'), 'no error banner is showing', loopOpts);
    const { assert: _assert, ...plain } = loopOpts;
    await runInstruction(provider, browser, new SessionState('t-assert-recorded-2'), 'open the orders list', plain);
    const instructions = recorder.entries.filter((e) => e.k === 'instruction');
    expect(instructions).toHaveLength(2);
    expect(instructions[0]).toMatchObject({ k: 'instruction', text: 'no error banner is showing', assert: true });
    expect(instructions[1]).toMatchObject({ k: 'instruction', text: 'open the orders list' });
    expect('assert' in instructions[1]).toBe(false);
    // On disk too: script.jsonl is what compile and export read.
    const onDisk = fs.readFileSync(path.join(tmpHome, 'sessions', 't-assert-recorded', 'script.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    expect(onDisk.filter((e) => e.k === 'instruction').map((e) => e.assert)).toEqual([true, undefined]);
  });

  it('carries the flag on an escalated resume, checked against the caller\'s sentence', async () => {
    const begun: Array<{ text: string; context: Record<string, unknown> }> = [];
    const script = { beginInstruction: (text: string, context: Record<string, unknown>) => begun.push({ text, context }), endInstruction: () => {} };
    const page = fakePage({ texts: { '#total': '370.00' } });
    const browser = sessionOn(page, { script: { ...script, prepare: async () => null, commit: () => {}, fail: () => {} } });
    const provider = scriptedProvider([
      // "999" appears only in the resume scaffold the model is shown, never in the caller's sentence
      [{ name: 'wait_for', args: { target: '#total', state: 'text_equals', text: '999' } }],
      [{ name: 'wait_for', args: { target: '#total', state: 'text_equals', text: '370.00' } }],
      [report('success', 'the total is 370.00')],
    ]);
    const result = await runInstruction(provider, browser, new SessionState('t-assert-resume'), 'You are RESUMING… it said the total was 999. The original instruction: the order total is 370.00', {
      ...loopOpts,
      recordAs: { text: 'the order total is 370.00', resume: true },
    });
    expect(begun[0]).toEqual({ text: 'the order total is 370.00', context: { resume: true, assert: true } });
    expect(result.report.status).toBe('success');
    expect(result.assertions).toEqual([{ state: 'text_equals', target: '#total', text: '370.00', held: true }]);
  });
});
