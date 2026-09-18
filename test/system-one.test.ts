import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeGlobalConfig } from '../src/agent/llm.js';
import {
  agreement,
  buildSystemOne,
  choice,
  mapReduce,
  minConfidence,
  noul,
  noulConfidence,
  parseAnswers,
  resolveSystemOneConfig,
  score,
  shardByTokens,
  topK,
  TypeSafeSystemOne,
  type AskResult,
  type Entry,
  type Questions,
  type SystemOne,
} from '../src/agent/system-one.js';
import { SessionState } from '../src/daemon/state.js';

const ENV_VARS = [
  'SITELOOPER_HOME',
  'SITELOOPER_JEV',
  'SITELOOPER_JEV_API_KEY',
  'SITELOOPER_JEV_MODEL',
  'SITELOOPER_JEV_BASE_URL',
  'TYPESAFE_API_KEY',
];

let saved: Record<string, string | undefined>;
let tmpHome: string;
let realFetch: typeof fetch;

beforeEach(() => {
  saved = Object.fromEntries(ENV_VARS.map((v) => [v, process.env[v]]));
  for (const v of ENV_VARS) delete process.env[v];
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-s1-'));
  process.env.SITELOOPER_HOME = tmpHome;
  realFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const v of ENV_VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

function reply(answers: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => ({ model: 'jev-1.13.0', answers, usage: { input_tokens: 120, output_tokens: 0 } }),
    text: async () => 'nope',
  };
}

function stubFetch(handler: (body: any, n: number) => ReturnType<typeof reply> | Promise<ReturnType<typeof reply>>) {
  const calls: Array<{ url: string; auth: string; body: any }> = [];
  globalThis.fetch = (async (url: unknown, init: { body: string; headers: Record<string, string>; signal?: AbortSignal }) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), auth: init.headers.authorization, body });
    return handler(body, calls.length);
  }) as unknown as typeof fetch;
  return calls;
}

describe('system-one resolution', () => {
  it('is off with no key: an install without TypeSafe behaves as before', () => {
    const cfg = resolveSystemOneConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.mode).toBe('auto');
    expect(buildSystemOne(cfg)).toBeNull();
  });

  it('a key alone turns it on, and the sitelooper-specific var outranks the vendor one', () => {
    process.env.TYPESAFE_API_KEY = 'ts-1';
    expect(resolveSystemOneConfig()).toMatchObject({ enabled: true, apiKey: 'ts-1', model: 'jev-latest' });
    process.env.SITELOOPER_JEV_API_KEY = 'sl-1';
    expect(resolveSystemOneConfig().apiKey).toBe('sl-1');
  });

  it('precedence is flag > env > config file', () => {
    writeGlobalConfig({ jevApiKey: 'file-key', jevModel: 'jev-preview' });
    expect(resolveSystemOneConfig()).toMatchObject({ enabled: true, apiKey: 'file-key', model: 'jev-preview' });
    process.env.SITELOOPER_JEV_MODEL = 'jev-env';
    expect(resolveSystemOneConfig().model).toBe('jev-env');
    expect(resolveSystemOneConfig({ model: 'jev-flag' }).model).toBe('jev-flag');
  });

  it('off wins over a present key, from env, file or flag', () => {
    process.env.TYPESAFE_API_KEY = 'ts-1';
    expect(resolveSystemOneConfig({ off: true }).enabled).toBe(false);
    process.env.SITELOOPER_JEV = 'off';
    expect(resolveSystemOneConfig()).toMatchObject({ enabled: false, mode: 'off' });
    delete process.env.SITELOOPER_JEV;
    writeGlobalConfig({ jev: 'off' });
    expect(resolveSystemOneConfig().enabled).toBe(false);
    process.env.SITELOOPER_JEV = 'auto'; // env outranks the file
    expect(resolveSystemOneConfig().enabled).toBe(true);
  });
});

describe('TypeSafeSystemOne.ask', () => {
  const client = (onUsage?: (m: string, u: { inputTokens: number; outputTokens: number }) => void) => {
    process.env.TYPESAFE_API_KEY = 'ts-1';
    return new TypeSafeSystemOne(resolveSystemOneConfig(), onUsage);
  };

  it('posts state + typed questions and returns typed answers, served model and usage', async () => {
    const calls = stubFetch(() =>
      reply({
        which: { type: 'choice', choice: 'e1', confidence: 0.93, probabilities: { e0: 0.04, e1: 0.93, none: 0.03 } },
        gone: { type: 'noul', noul: 0.02 },
        fit: { type: 'score', score: 1.8, confidence: 0.7, probabilities: { 0: 0.05, 1: 0.1, 2: 0.85 } },
      }),
    );
    const seen: string[] = [];
    const res = await client((m) => seen.push(m)).ask(
      { elements: ['Save', 'Cancel'] },
      {
        which: choice('which one saves', { e0: 'Cancel', e1: 'Save', none: null }),
        gone: noul('the control is gone'),
        fit: score('how relevant', ['not', 'somewhat', 'very']),
      },
    );
    expect(calls[0].url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(calls[0].auth).toBe('Bearer ts-1');
    expect(calls[0].body.model).toBe('jev-latest');
    expect(calls[0].body.questions.which).toEqual({ type: 'choice', instructions: 'which one saves', criteria: { e0: 'Cancel', e1: 'Save', none: null } });
    expect(res.answers.which.choice).toBe('e1');
    expect(res.answers.gone.noul).toBe(0.02);
    expect(res.model).toBe('jev-1.13.0');
    expect(res.usage).toEqual({ inputTokens: 120, outputTokens: 0 });
    expect(seen).toEqual(['jev-1.13.0']);
  });

  it('retries a 429 once, then gives up — never the LLM path’s five attempts', async () => {
    const calls = stubFetch((_b, n) => (n === 1 ? reply({}, 429) : reply({ q: { type: 'noul', noul: 0.9 } })));
    const res = await client().ask('s', { q: noul('?') });
    expect(res.answers.q.noul).toBe(0.9);
    expect(calls).toHaveLength(2);

    const again = stubFetch(() => reply({}, 529));
    await expect(client().ask('s', { q: noul('?') })).rejects.toThrow(/HTTP 529/);
    expect(again).toHaveLength(2);
  });

  it('does not retry a 4xx', async () => {
    const calls = stubFetch(() => reply({}, 422));
    await expect(client().ask('s', { q: noul('?') })).rejects.toThrow(/HTTP 422/);
    expect(calls).toHaveLength(1);
  });

  it('times out instead of waiting on a slow host', async () => {
    globalThis.fetch = ((_u: unknown, init: { signal: AbortSignal }) =>
      new Promise((_r, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    await expect(client().ask('s', { q: noul('?') }, { timeoutMs: 30 })).rejects.toThrow(/timed out/);
  });

  it('refuses a reply it does not understand rather than act on it', () => {
    const q = { which: choice('?', { a: null, b: null }) };
    expect(() => parseAnswers(q, { answers: { which: { type: 'choice', choice: 'c', confidence: 0.9 } } })).toThrow(/not offered/);
    expect(() => parseAnswers(q, { answers: { which: { type: 'noul', noul: 0.9 } } })).toThrow(/not a choice/);
    expect(() => parseAnswers(q, { answers: {} })).toThrow(/not a choice/);
    expect(() => parseAnswers({ n: noul('?') }, { answers: { n: { type: 'noul', noul: 1.4 } } })).toThrow(/out of range/);
  });
});

/** A scripted client, the System One twin of loop.test's scriptedProvider. */
function scriptedSystemOne(answer: (state: Entry, questions: Questions, n: number) => Record<string, unknown> | Promise<Record<string, unknown>>): SystemOne & { asks: number } {
  const self = {
    model: 'jev-test',
    asks: 0,
    async ask<Q extends Questions>(state: Entry, questions: Q): Promise<AskResult<Q>> {
      const n = ++self.asks;
      const answers = await answer(state, questions, n);
      return { ...parseAnswers(questions, { model: 'jev-test', answers, usage: { input_tokens: 10, output_tokens: 0 } }), ms: 1 };
    },
  };
  return self;
}

describe('mapReduce', () => {
  it('asks every shard concurrently and keeps shard order', async () => {
    const s1 = scriptedSystemOne(async (state) => {
      const n = Number(state);
      await new Promise((r) => setTimeout(r, (5 - n) * 5)); // later shards finish first
      return { rel: { type: 'score', score: n / 2, confidence: 0.8, probabilities: {} } };
    });
    const res = await mapReduce(s1, [0, 1, 2, 3, 4], (n) => ({ state: String(n), questions: { rel: score('relevant?', ['no', 'some', 'yes']) } }));
    expect(res!.shards.map((s) => s.shard)).toEqual([0, 1, 2, 3, 4]);
    expect(res!.requests).toBe(5);
    expect(res!.usage.inputTokens).toBe(50);
    expect(topK(res!.shards, (s) => s.answers.rel.score, 2).map((s) => s.shard)).toEqual([4, 3]);
  });

  it('is all-or-nothing: one failed shard defers the whole reduce', async () => {
    const s1 = scriptedSystemOne((state) => {
      if (state === '2') throw new Error('boom');
      return { q: { type: 'noul', noul: 0.5 } };
    });
    expect(await mapReduce(s1, ['0', '1', '2', '3'], (s) => ({ state: s, questions: { q: noul('?') } }), { concurrency: 1 })).toBeNull();
    expect(s1.asks).toBe(3); // the failure cuts the rest
  });

  it('respects the concurrency cap', async () => {
    let live = 0;
    let peak = 0;
    const s1 = scriptedSystemOne(async () => {
      peak = Math.max(peak, ++live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return { q: { type: 'noul', noul: 0.5 } };
    });
    await mapReduce(s1, Array.from({ length: 12 }, (_, i) => i), (n) => ({ state: String(n), questions: { q: noul('?') } }), { concurrency: 3 });
    expect(peak).toBe(3);
  });
});

describe('sharding and reducers', () => {
  it('packs items under a token budget, in order, and never drops an oversized one', () => {
    const small = 'x'.repeat(40); // ~10 tokens
    const huge = 'y'.repeat(4000);
    expect(shardByTokens([small, small, small, small, small], 25)).toEqual([[small, small], [small, small], [small]]);
    expect(shardByTokens([small, huge, small], 25)).toEqual([[small], [huge], [small]]);
    expect(shardByTokens([1, 2, 3, 4, 5], 1000, 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('min-confidence is the weakest answer; agreement needs every vote', () => {
    expect(minConfidence([0.99, 0.6, 0.95])).toBe(0.6);
    expect(minConfidence([])).toBe(0);
    expect(agreement(['e1', 'e1', 'e1'])).toBe('e1');
    expect(agreement(['e1', 'e2', 'e1'])).toBeNull();
    expect(agreement([])).toBeNull();
    expect(noulConfidence({ type: 'noul', noul: 0.5 })).toBe(0);
    expect(noulConfidence({ type: 'noul', noul: 0.05 })).toBeCloseTo(0.9);
  });
});

describe('session accounting', () => {
  it('keeps Jev usage out of usageByModel and logs decisions for calibration', () => {
    const state = new SessionState('s1-test');
    state.recordSystemOneUsage('jev-1.13.0', { inputTokens: 100, outputTokens: 0 });
    state.recordSystemOneUsage('jev-1.13.0', { inputTokens: 50, outputTokens: 0 });
    expect(state.systemOne).toEqual({ 'jev-1.13.0': { inputTokens: 150, outputTokens: 0, requests: 2 } });
    expect(state.usageByModel).toEqual({});
    expect(state.usage.promptTokens).toBe(0);

    state.recordSystemOneDecision({ site: 'repair.propose', model: 'jev-1.13.0', options: 12, chosen: 'e3', confidence: 0.94, outcome: 'acted' });
    state.recordSystemOneDecision({ site: 'repair.propose', model: 'jev-1.13.0', options: 9, chosen: 'none', confidence: 0.4, outcome: 'deferred', why: 'below gate' });
    expect(state.systemOneDecisions).toEqual({ decisions: 2, acted: 1 });
    const lines = fs.readFileSync(path.join(tmpHome, 'sessions', 's1-test', 'system-one.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.outcome)).toEqual(['acted', 'deferred']);
    expect(lines[0].ts).toBeTruthy();
  });
});
