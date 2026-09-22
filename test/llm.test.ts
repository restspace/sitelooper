import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  OpenAICompatProvider,
  parseCompletion,
  PROVIDER_PRESETS,
  readGlobalConfig,
  resolveProviderConfig,
  writeGlobalConfig,
} from '../src/agent/llm.js';
import { SessionState } from '../src/daemon/state.js';

const ENV_VARS = [
  'SITELOOPER_HOME',
  'SITELOOPER_PROVIDER',
  'SITELOOPER_MODEL',
  'SITELOOPER_FALLBACK_MODEL',
  'SITELOOPER_BASE_URL',
  'SITELOOPER_EXTRA_BODY',
  'SITELOOPER_FALLBACK_EXTRA_BODY',
  'SITELOOPER_API_KEY',
  'GLM_API_KEY',
  'ZHIPU_API_KEY',
  'NOVITA_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
];

let saved: Record<string, string | undefined>;
let tmpHome: string;

beforeEach(() => {
  saved = Object.fromEntries(ENV_VARS.map((v) => [v, process.env[v]]));
  for (const v of ENV_VARS) delete process.env[v];
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-llm-'));
  process.env.SITELOOPER_HOME = tmpHome;
});

afterEach(() => {
  for (const v of ENV_VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe('provider resolution', () => {
  it('with no provider named and no key, defaults to the benchmarked openrouter pairing', () => {
    const cfg = resolveProviderConfig();
    expect(cfg.provider).toBe('openrouter');
    expect(cfg.providerSource).toMatch(/no API key/);
    expect(cfg.apiKey).toBe('');
  });

  it('OPENROUTER_API_KEY alone gets the benchmarked pairing: flash, glm-5.3 escalation, DeepSeek pin', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    const cfg = resolveProviderConfig();
    expect(cfg.provider).toBe('openrouter');
    expect(cfg.providerSource).toBe('default: OPENROUTER_API_KEY is set');
    expect(cfg.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(cfg.model).toBe('deepseek/deepseek-v4.1-flash');
    expect(cfg.fallbackModel).toBe('z-ai/glm-5.3');
    expect(cfg.apiKey).toBe('sk-or-test');
    expect(cfg.extraBody).toEqual({ provider: { only: ['DeepSeek'] } });
    expect(cfg.extraBodySource).toBe('preset');
    // The pin is main-model calibration: the escalation tier does not inherit it.
    expect(cfg.fallbackExtraBody).toBeUndefined();
  });

  it('the preset pin is dropped for another model or endpoint, and SITELOOPER_EXTRA_BODY replaces it', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    expect(resolveProviderConfig({ model: 'z-ai/glm-5.3' }).extraBody).toBeUndefined();
    expect(resolveProviderConfig({ baseUrl: 'http://localhost:9999/v1' }).extraBody).toBeUndefined();
    process.env.SITELOOPER_EXTRA_BODY = '{}';
    expect(resolveProviderConfig().extraBody).toEqual({});
    expect(resolveProviderConfig().extraBodySource).toBe('env');
    process.env.SITELOOPER_EXTRA_BODY = '{"provider":{"only":["Baidu"]}}';
    expect(resolveProviderConfig().extraBody).toEqual({ provider: { only: ['Baidu'] } });
  });

  it('a Z.ai key keeps the pre-0.4.0 zhipu default, even beside OPENROUTER_API_KEY', () => {
    process.env.GLM_API_KEY = 'glm-key';
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    const cfg = resolveProviderConfig();
    expect(cfg.provider).toBe('zhipu');
    expect(cfg.baseUrl).toBe(PROVIDER_PRESETS.zhipu.baseUrl);
    expect(cfg.model).toBe('glm-5.2');
    expect(cfg.apiKey).toBe('glm-key');
    expect(cfg.extraBody).toBeUndefined();
  });

  it('a generic key with no provider named keeps going to zhipu, as it always has', () => {
    process.env.SITELOOPER_API_KEY = 'generic';
    expect(resolveProviderConfig().provider).toBe('zhipu');
    delete process.env.SITELOOPER_API_KEY;
    writeGlobalConfig({ apiKey: 'from-file' });
    expect(resolveProviderConfig().provider).toBe('zhipu');
    // ...but OPENROUTER_API_KEY beats a generic key: it names its provider.
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    expect(resolveProviderConfig().provider).toBe('openrouter');
  });

  it("another provider's own key does not choose it; SITELOOPER_PROVIDER does", () => {
    process.env.OPENAI_API_KEY = 'sk-openai';
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    expect(resolveProviderConfig().provider).toBe('openrouter');
    process.env.SITELOOPER_PROVIDER = 'openai';
    const cfg = resolveProviderConfig();
    expect(cfg.provider).toBe('openai');
    expect(cfg.providerSource).toBe('SITELOOPER_PROVIDER');
    expect(cfg.apiKey).toBe('sk-openai');
    expect(cfg.extraBody).toBeUndefined();
  });

  it('an explicit provider (flag, env, config file) wins over the key-based default', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    writeGlobalConfig({ provider: 'zhipu' });
    expect(resolveProviderConfig().provider).toBe('zhipu');
    process.env.SITELOOPER_PROVIDER = 'novita';
    expect(resolveProviderConfig().provider).toBe('novita');
    expect(resolveProviderConfig({ provider: 'openai' }).providerSource).toBe('--provider flag');
  });

  it('SITELOOPER_MODEL still overrides the preset model, and then no pin is sent', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    process.env.SITELOOPER_MODEL = 'z-ai/glm-5.3';
    const cfg = resolveProviderConfig();
    expect(cfg.model).toBe('z-ai/glm-5.3');
    expect(cfg.extraBody).toBeUndefined();
  });

  it('novita preset carries its own base URL, model naming, and key env var', () => {
    process.env.NOVITA_API_KEY = 'nk-123';
    const cfg = resolveProviderConfig({ provider: 'novita' });
    expect(cfg.baseUrl).toBe('https://api.novita.ai/openai');
    expect(cfg.model).toBe('deepseek/deepseek-v4-flash');
    expect(cfg.apiKey).toBe('nk-123');
    expect(cfg.keyEnvVars).toContain('NOVITA_API_KEY');
  });

  it('novita preset supplies a stronger escalation model than its routine one', () => {
    const cfg = resolveProviderConfig({ provider: 'novita' });
    expect(cfg.fallbackModel).toBe('zai-org/glm-5.3');
    expect(cfg.fallbackModel).not.toBe(cfg.model);
  });

  it('presets without an escalation tier leave fallbackModel unset', () => {
    expect(resolveProviderConfig({ provider: 'zhipu' }).fallbackModel).toBeUndefined();
  });

  it('extraBody is main-model calibration: the fallback tier reads its own env var', () => {
    // The bench's Baidu routing pin was measured for deepseek-v4-flash; when
    // the glm-5.3 escalation tier inherited it, a 3.9s relabel call became
    // 25.5s and blew the 75s timebox on 3 of 4 live runs. So the two tiers
    // read separate env vars and neither inherits the other's.
    process.env.SITELOOPER_EXTRA_BODY = '{"provider":{"order":["Baidu"]}}';
    const cfg = resolveProviderConfig();
    expect(cfg.extraBody).toEqual({ provider: { order: ['Baidu'] } });
    expect(cfg.fallbackExtraBody).toBeUndefined();
    process.env.SITELOOPER_FALLBACK_EXTRA_BODY = '{"provider":{"order":["Novita"]}}';
    expect(resolveProviderConfig().fallbackExtraBody).toEqual({ provider: { order: ['Novita'] } });
  });

  it('a malformed fallback extra body fails loudly, naming its own env var', () => {
    process.env.SITELOOPER_FALLBACK_EXTRA_BODY = 'not json';
    expect(() => resolveProviderConfig()).toThrow('SITELOOPER_FALLBACK_EXTRA_BODY');
  });

  it('fallback model follows the same flag > env > file > preset precedence', () => {
    writeGlobalConfig({ provider: 'novita', fallbackModel: 'file-fallback' });
    expect(resolveProviderConfig().fallbackModel).toBe('file-fallback');
    process.env.SITELOOPER_FALLBACK_MODEL = 'env-fallback';
    expect(resolveProviderConfig().fallbackModel).toBe('env-fallback');
    expect(resolveProviderConfig({ fallbackModel: 'flag-fallback' }).fallbackModel).toBe('flag-fallback');
    delete process.env.SITELOOPER_FALLBACK_MODEL;
  });

  it('"none" disables escalation without needing to clear a config key', () => {
    for (const off of ['none', 'off', 'FALSE', '  ']) {
      expect(resolveProviderConfig({ provider: 'novita', fallbackModel: off }).fallbackModel).toBeUndefined();
    }
  });

  it('rejects unknown providers with the available list', () => {
    expect(() => resolveProviderConfig({ provider: 'nope' })).toThrow(/novita/);
  });

  it('precedence per field: flag > env > config file > preset', () => {
    writeGlobalConfig({ provider: 'novita', model: 'file-model' });
    // file only
    expect(resolveProviderConfig().provider).toBe('novita');
    expect(resolveProviderConfig().model).toBe('file-model');
    // env beats file
    process.env.SITELOOPER_MODEL = 'env-model';
    expect(resolveProviderConfig().model).toBe('env-model');
    // flag beats env; provider switch keeps the field overrides that were set
    const cfg = resolveProviderConfig({ provider: 'zhipu', model: 'flag-model' });
    expect(cfg.provider).toBe('zhipu');
    expect(cfg.model).toBe('flag-model');
    expect(cfg.baseUrl).toBe(PROVIDER_PRESETS.zhipu.baseUrl);
  });

  it('generic SITELOOPER_API_KEY works for any provider; preset var wins', () => {
    process.env.SITELOOPER_API_KEY = 'generic';
    expect(resolveProviderConfig({ provider: 'novita' }).apiKey).toBe('generic');
    process.env.NOVITA_API_KEY = 'specific';
    expect(resolveProviderConfig({ provider: 'novita' }).apiKey).toBe('specific');
  });
});

describe('global config file', () => {
  it('set merges, empty string clears, unknown keys rejected', () => {
    writeGlobalConfig({ provider: 'novita' });
    writeGlobalConfig({ model: 'm1' });
    expect(readGlobalConfig()).toEqual({ provider: 'novita', model: 'm1' });
    writeGlobalConfig({ model: '' });
    expect(readGlobalConfig()).toEqual({ provider: 'novita' });
    expect(() => writeGlobalConfig({ bogus: 'x' } as never)).toThrow(/unknown config key/);
  });

  it('missing or corrupt file reads as empty config', () => {
    expect(readGlobalConfig()).toEqual({});
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.writeFileSync(path.join(tmpHome, 'config.json'), '{not json');
    expect(readGlobalConfig()).toEqual({});
  });
});

describe('per-request reasoning effort', () => {
  const baseConfig = {
    baseUrl: 'https://example.test/api/v1',
    apiKey: 'k',
    model: 'm',
    keyEnvVars: ['X'],
    temperature: 0,
  };
  const stubFetch = () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = async (_url: unknown, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      };
    };
    return { bodies, fetchImpl };
  };

  it('openrouter maps effort to the reasoning field; user extraBody still wins', async () => {
    const { bodies, fetchImpl } = stubFetch();
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      const p = new OpenAICompatProvider({ ...baseConfig, provider: 'openrouter' } as never);
      await p.complete([{ role: 'user', content: 'hi' }], [], { effort: 'low' });
      expect(bodies[0].reasoning).toEqual({ effort: 'low' });
      const p2 = new OpenAICompatProvider({
        ...baseConfig,
        provider: 'openrouter',
        extraBody: { reasoning: { max_tokens: 9 } },
      } as never);
      await p2.complete([{ role: 'user', content: 'hi' }], [], { effort: 'low' });
      expect(bodies[1].reasoning).toEqual({ max_tokens: 9 });
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  // fwgt3 n1: DeepSeek 400s "content or tool_calls must be set" on an empty assistant turn.
  it('never sends an assistant message with neither content nor tool calls, and synthesizes none', async () => {
    const { bodies, fetchImpl } = stubFetch();
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      const p = new OpenAICompatProvider({ ...baseConfig, provider: 'openrouter' } as never);
      const call = { id: 'c1', type: 'function' as const, function: { name: 'snapshot', arguments: '{}' } };
      await p.complete(
        [
          { role: 'user', content: 'do it' },
          { role: 'assistant', content: null },
          { role: 'user', content: 'Reminder' },
          { role: 'assistant', content: '  ' },
          { role: 'assistant', content: null, tool_calls: [call] },
          { role: 'tool', tool_call_id: 'c1', content: 'ok' },
          { role: 'assistant', content: 'thinking aloud' },
        ],
        [],
      );
      const sent = bodies[0].messages as Array<{ role: string; content: string | null }>;
      expect(sent.map((m) => m.role)).toEqual(['user', 'user', 'assistant', 'tool', 'assistant']);
      expect(sent.filter((m) => m.role === 'assistant').every((m) => (m.content ?? '').trim() || 'tool_calls' in m)).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('other openai-compat hosts never see the field — unknown keys can 400', async () => {
    const { bodies, fetchImpl } = stubFetch();
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      const p = new OpenAICompatProvider({ ...baseConfig, provider: 'novita' } as never);
      await p.complete([{ role: 'user', content: 'hi' }], [], { effort: 'low' });
      expect('reasoning' in bodies[0]).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('served backend', () => {
  // A routing host bills one model id at different rates depending on which
  // backend it picked, so a run costed from a rate table is only an assertion
  // unless the backend it was served by is on record. fwrd48 pinned DeepSeek
  // and no artifact could show the pin held.
  it('records the backend OpenRouter names for a call', () => {
    const c = parseCompletion({
      provider: 'DeepSeek',
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    });
    expect(c.served).toBe('DeepSeek');
  });

  it('is null when the host names no backend, rather than inventing one', () => {
    const c = parseCompletion({ choices: [{ message: { content: 'ok' } }], usage: {} });
    expect(c.served).toBeNull();
  });

  it('a session keeps every distinct backend per model, without duplicates', () => {
    const state = new SessionState('t-served');
    state.recordServed('deepseek/deepseek-v4.1-flash', 'DeepSeek');
    state.recordServed('deepseek/deepseek-v4.1-flash', 'DeepSeek');
    // A second backend for the same id is exactly the case worth catching: the
    // pin did not hold and part of the run was billed at another rate.
    state.recordServed('deepseek/deepseek-v4.1-flash', 'Nebius');
    state.recordServed('deepseek/deepseek-v4.1-flash', null);
    expect(state.servedByModel).toEqual({ 'deepseek/deepseek-v4.1-flash': ['DeepSeek', 'Nebius'] });
  });
});
