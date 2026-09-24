/**
 * Vision for the recording model (SITELOOPER_VISION=on), off by default.
 *
 * What it must do: send a screenshot the model asked for as an
 * OpenAI-compatible image part (or an Anthropic image block), keep only the
 * newest few, never send one to a model that does not take images (the
 * escalation model, z-ai/glm-5.3, is text only), and change NOTHING with the
 * flag off. test/vision.browser.test.ts covers the capture and script.jsonl.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider, OpenAICompatProvider, sendableMessages, type ChatMessage, type ProviderConfig } from '../src/agent/llm.js';
import { TOOL_DEFS, toolDefsFor, VISION_SCREENSHOT_DESCRIPTION } from '../src/agent/tools.js';
import { OPERATING_RULES, buildSystemPrompt } from '../src/agent/prompt.js';
import { acceptsImages, clearCapabilityCache, clearImageStore, openAiWireMessages, storeImage, visionSettings } from '../src/agent/vision.js';
import { SessionState } from '../src/daemon/state.js';
import type { BrowserSession } from '../src/daemon/browser.js';

let home: string;
const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-vision-'));
  for (const k of ['SITELOOPER_HOME', 'SITELOOPER_VISION', 'SITELOOPER_VISION_AUTO', 'SITELOOPER_VISION_KEEP']) saved[k] = process.env[k];
  process.env.SITELOOPER_HOME = home;
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  fs.rmSync(home, { recursive: true, force: true });
});
beforeEach(() => {
  clearImageStore();
  clearCapabilityCache();
  delete process.env.SITELOOPER_VISION;
  delete process.env.SITELOOPER_VISION_AUTO;
  delete process.env.SITELOOPER_VISION_KEEP;
});
afterEach(() => vi.unstubAllGlobals());

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const b64 = JPEG.toString('base64');

const config = (model: string, provider = 'openrouter'): ProviderConfig => ({
  provider,
  baseUrl: 'https://openrouter.test/api/v1',
  apiKey: 'k',
  model,
  keyEnvVars: ['OPENROUTER_API_KEY'],
});

/** Capture the request body a provider sends; answer with a plain completion. */
function captureRequests(): { bodies: Array<Record<string, any>>; urls: string[] } {
  const seen = { bodies: [] as Array<Record<string, any>>, urls: [] as string[] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { body?: string }) => {
      seen.urls.push(String(url));
      if (String(url).endsWith('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'vendor/sees', architecture: { input_modalities: ['text', 'image'] } }, { id: 'vendor/blind', architecture: { input_modalities: ['text'] } }] }));
      }
      seen.bodies.push(JSON.parse(String(init?.body)));
      if (String(url).endsWith('/v1/messages')) return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } }));
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    }),
  );
  return seen;
}

/** One instruction's turn: a screenshot call and its result carrying an image. */
function history(images: string[][]): ChatMessage[] {
  const out: ChatMessage[] = [
    { role: 'system', content: 'rules' },
    { role: 'user', content: 'Open the dashboard and check the chart.' },
  ];
  images.forEach((ids, i) => {
    out.push({ role: 'assistant', content: null, tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'screenshot', arguments: '{}' } }] });
    out.push({ role: 'tool', tool_call_id: `c${i}`, content: `screenshot saved: /tmp/s${i}.jpg\n[image attached below]`, ...(ids.length ? { images: ids } : {}) });
  });
  return out;
}

describe('the request an OpenAI-compatible provider sends', () => {
  it('a screenshot result is followed by a user message with the image as an image_url part; the tool message carries no images field', async () => {
    const id = storeImage(JPEG, 'screenshot /tmp/s0.jpg');
    const seen = captureRequests();
    await new OpenAICompatProvider(config('xiaomi/mimo-v2.6-flash')).complete(history([[id]]), []);
    const msgs = seen.bodies[0].messages;
    expect(msgs.map((m: any) => m.role)).toEqual(['system', 'user', 'assistant', 'tool', 'user']);
    expect(msgs[3]).toEqual({ role: 'tool', tool_call_id: 'c0', content: 'screenshot saved: /tmp/s0.jpg\n[image attached below]' });
    expect(msgs[4]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: '[screenshot: screenshot /tmp/s0.jpg]' },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
      ],
    });
  });

  it('keeps only the newest two images; older ones become a text stub', async () => {
    const ids = [storeImage(JPEG, 'first'), storeImage(JPEG, 'second'), storeImage(JPEG, 'third')];
    const seen = captureRequests();
    await new OpenAICompatProvider(config('xiaomi/mimo-v2.6-flash')).complete(history([[ids[0]], [ids[1]], [ids[2]]]), []);
    const users = seen.bodies[0].messages.filter((m: any) => m.role === 'user' && Array.isArray(m.content));
    expect(users).toHaveLength(3);
    expect(users[0].content).toEqual([{ type: 'text', text: '[older screenshot (first) omitted — only the most recent ones are shown]' }]);
    expect(users[1].content.map((p: any) => p.type)).toEqual(['text', 'image_url']);
    expect(users[2].content.map((p: any) => p.type)).toEqual(['text', 'image_url']);
    process.env.SITELOOPER_VISION_KEEP = '1';
    const seen1 = captureRequests();
    await new OpenAICompatProvider(config('xiaomi/mimo-v2.6-flash')).complete(history([[ids[0]], [ids[1]], [ids[2]]]), []);
    expect(JSON.stringify(seen1.bodies[0]).match(/"type":"image_url"/g)).toHaveLength(1);
  });

  it('one user message per run of tool results, after the last of them', () => {
    const a = storeImage(JPEG, 'a');
    const b = storeImage(JPEG, 'b');
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'go' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'x', type: 'function', function: { name: 'click', arguments: '{}' } },
          { id: 'y', type: 'function', function: { name: 'click', arguments: '{}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'x', content: 'ok', images: [a] },
      { role: 'tool', tool_call_id: 'y', content: 'ok', images: [b] },
    ];
    const wire = openAiWireMessages(msgs, { allowed: true, keep: 2 }) as Array<Record<string, any>>;
    expect(wire.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'tool', 'user']);
    expect(wire[4].content.filter((p: any) => p.type === 'image_url')).toHaveLength(2);
  });
});

describe('the capability gate', () => {
  it('never sends an image to the text-only escalation model (z-ai/glm-5.3): stubs instead', async () => {
    const id = storeImage(JPEG, 'screenshot /tmp/s0.jpg');
    const seen = captureRequests();
    await new OpenAICompatProvider(config('z-ai/glm-5.3')).complete(history([[id]]), []);
    const body = JSON.stringify(seen.bodies[0]);
    expect(body).not.toContain('image_url');
    expect(body).not.toContain(b64);
    expect(body).toContain('not shown: this model does not take images');
  });

  it('asks OpenRouter /models for a model it does not know, caches it, and treats a failed lookup as no', async () => {
    const seen = captureRequests();
    expect(await acceptsImages('vendor/sees', 'openrouter', 'https://openrouter.test/api/v1')).toBe(true);
    expect(await acceptsImages('vendor/blind', 'openrouter', 'https://openrouter.test/api/v1')).toBe(false);
    expect(seen.urls.filter((u) => u.endsWith('/models'))).toHaveLength(1);
    expect(fs.existsSync(path.join(home, 'cache', 'openrouter-models.json'))).toBe(true);
    const lines: string[] = [];
    expect(await acceptsImages('some/model', 'openai', 'https://api.openai.test/v1', { log: (l) => lines.push(l) })).toBe(false);
    expect(await acceptsImages('some/model', 'openai', 'https://api.openai.test/v1', { log: (l) => lines.push(l) })).toBe(false);
    expect(lines).toEqual(['[vision] some/model (openai): image input support unknown, so screenshots are not sent to it']);
  });

  it('escalation: the history handed to the fallback loses its images when tool results are compacted', () => {
    const state = new SessionState();
    const id = storeImage(JPEG, 's');
    state.messages.push(...history([[id]]));
    state.compactToolResults(0);
    expect(state.messages.some((m) => m.role === 'tool' && m.images)).toBe(false);
    const next = new SessionState();
    next.messages.push(...history([[storeImage(JPEG, 't')]]));
    next.elidePriorToolResults();
    expect(next.messages.some((m) => m.role === 'tool' && m.images)).toBe(false);
  });

  it('Anthropic: the image goes inside the tool_result block, for a model that takes images', async () => {
    const id = storeImage(JPEG, 's');
    const seen = captureRequests();
    await new AnthropicProvider({ ...config('claude-sonnet-4-5', 'anthropic'), baseUrl: 'https://anthropic.test' }).complete(history([[id]]), []);
    const toolResult = seen.bodies[0].messages.find((m: any) => m.content.some((b: any) => b.type === 'tool_result')).content[0];
    expect(toolResult.content[1]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
  });
});

describe('with the flag off nothing changes', () => {
  it('is off by default', () => {
    expect(visionSettings({}).on).toBe(false);
    expect(visionSettings({ SITELOOPER_VISION_AUTO: 'on' }).auto).toBe(false);
    expect(visionSettings({ SITELOOPER_VISION: 'on', SITELOOPER_VISION_AUTO: 'on' })).toMatchObject({ on: true, auto: true, keep: 2 });
  });

  it('the tool definitions are the very same objects; on, only the screenshot description differs', () => {
    const session = { learn: {} } as unknown as BrowserSession;
    expect(toolDefsFor(session)).toBe(TOOL_DEFS);
    expect(toolDefsFor(session, { on: false })).toBe(TOOL_DEFS);
    expect(JSON.stringify(toolDefsFor(session, { on: false }))).toBe(JSON.stringify(TOOL_DEFS));
    const on = toolDefsFor(session, { on: true });
    expect(on.find((t) => t.name === 'screenshot')!.description).toBe(VISION_SCREENSHOT_DESCRIPTION);
    expect(JSON.stringify(on.filter((t) => t.name !== 'screenshot'))).toBe(JSON.stringify(TOOL_DEFS.filter((t) => t.name !== 'screenshot')));
    expect(TOOL_DEFS.find((t) => t.name === 'screenshot')!.description).toBe('Save a screenshot to disk and return its path (for evidence; you cannot see images).');
  });

  it('a history with no image is sent byte for byte as before, and the prompt is untouched', async () => {
    const msgs = history([[], []]);
    const seen = captureRequests();
    await new OpenAICompatProvider(config('xiaomi/mimo-v2.6-flash')).complete(msgs, []);
    expect(JSON.stringify(seen.bodies[0].messages)).toBe(JSON.stringify(sendableMessages(msgs)));
    expect(seen.urls.some((u) => u.endsWith('/models'))).toBe(false);
    expect(openAiWireMessages(msgs, { allowed: true, keep: 2 })).toBe(msgs);
    expect(buildSystemPrompt({ notes: [] })).toBe(OPERATING_RULES);
  });
});
