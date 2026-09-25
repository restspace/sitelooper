/**
 * Vision for the recording model, behind a flag (SITELOOPER_VISION=on).
 *
 * Off by default, and with it off nothing here runs: no image is captured, no
 * message carries one, the tool definitions and the request bodies are byte for
 * byte what they were. On, a `screenshot` call also shows the model the page
 * (the viewport, downscaled JPEG), and with SITELOOPER_VISION_AUTO=on so does
 * every state-changing action, smaller.
 *
 * How an image travels. A tool message keeps `images`: ids into an in-memory
 * store, never bytes. The history is measured and trimmed by its JSON size
 * (state.ts trimHistory), which a base64 JPEG would blow straight through, and
 * the recorder never sees tool messages at all: script.jsonl keeps the
 * screenshot step's args (its path), as before. At send time
 * (`imageParts`) each run of tool messages whose results carry images is
 * followed by ONE user message holding them as OpenAI-compatible `image_url`
 * parts: tool messages take text only on most hosts, and a user message after
 * the last tool result of a turn is valid everywhere. Only the last
 * `keep` images (default 2) are sent; older ones become a one-line stub.
 *
 * Only a model that takes images gets them (`acceptsImages`): a small known
 * map, then OpenRouter's /models list (cached for a day). Unknown means no, and
 * says so once. The escalation model (z-ai/glm-5.3, text only) is a different
 * provider with its own model, so the same check strips the images from the
 * whole history it is sent.
 *
 * Provider pinning (checked 2026-09-24, OpenRouter endpoints API): Xiaomi and
 * DeepInfra serve xiaomi/mimo-v2.6-flash at one price; Xiaomi answered in
 * 1-9s, DeepInfra in 44-65s and misread a small test image. Pin it with
 * SITELOOPER_EXTRA_BODY='{"provider":{"only":["Xiaomi"]}}', not the bench's
 * DeepSeek pin (that backend does not serve it). The escalation tier takes
 * SITELOOPER_FALLBACK_EXTRA_BODY, not this (llm.ts ProviderConfig).
 *
 * Credentials: a filled password field is drawn as bullets (showsCredential);
 * a page that shows a credential variable's value is never sent. What a
 * screenshot does send is everything else the page shows, which the snapshot
 * and read tools already send as text: the same data, now also as pixels, to
 * the same provider.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { rootDir } from '../shared/paths.js';
import { credentialVars } from '../shared/secrets.js';
import type { ChatMessage } from './llm.js';
import { readGlobalConfig } from './llm.js';

export interface VisionSettings {
  /** Show `screenshot` results to the model. */
  on: boolean;
  /** Also attach a small screenshot to every state-changing action's result. */
  auto: boolean;
  /** How many images the conversation keeps; older ones are stubbed. */
  keep: number;
  /** Width a screenshot is scaled down to (never up), CSS pixels. */
  maxWidth: number;
  /** Width of an auto-attached screenshot. */
  autoMaxWidth: number;
  /** JPEG quality, 1-100. */
  quality: number;
}

const ON = /^(on|1|true|yes)$/i;

/** Flag > env > config file (`sitelooper config set vision on`) > off. Read per call: cheap, and a `config set` takes effect without a restart. */
export function visionSettings(env: NodeJS.ProcessEnv = process.env): VisionSettings {
  const file = readGlobalConfig();
  const on = ON.test((env.SITELOOPER_VISION ?? file.vision ?? '').trim());
  const auto = on && ON.test((env.SITELOOPER_VISION_AUTO ?? file.visionAuto ?? '').trim());
  const keep = Number.parseInt(env.SITELOOPER_VISION_KEEP ?? '', 10);
  return {
    on,
    auto,
    keep: Number.isFinite(keep) && keep >= 0 ? keep : 2,
    maxWidth: 1280,
    autoMaxWidth: 800,
    quality: 60,
  };
}

// --- the image store ---------------------------------------------------------

/** Images by id, oldest first. Bounded: nothing older than the kept window is ever sent. */
const store = new Map<string, { mime: string; base64: string; label: string }>();
const STORE_MAX = 16;
let nextId = 0;

/** File an image for the conversation; returns the id a tool message carries. */
export function storeImage(bytes: Buffer, label: string, mime = 'image/jpeg'): string {
  const id = `img${++nextId}`;
  store.set(id, { mime, base64: bytes.toString('base64'), label });
  while (store.size > STORE_MAX) store.delete(store.keys().next().value as string);
  return id;
}

/** Test seam. */
export function clearImageStore(): void {
  store.clear();
}

export function storedImage(id: string): { mime: string; base64: string; label: string } | undefined {
  return store.get(id);
}

// --- capture -----------------------------------------------------------------

/**
 * Whether the page shows a credential the model must not be sent a picture of.
 * A filled password field is not one: Chromium draws `input[type=password]`
 * as bullets whatever the page's CSS says (checked: an author
 * `-webkit-text-security: none` still renders bullets; see
 * test/vision.browser.test.ts), and every browser the daemon launches is
 * Chromium. What is one: the VALUE of an unambiguous credential variable in the
 * page text or in a field shown as text (a "show password" toggle turns the
 * input into type=text; an API-token page prints the token). Ambiguous values
 * (a password that is also the username) are not looked for: the page shows
 * them as the username anyway. A secret known only as a resolved marker is not
 * checked here: it is always a credential variable's value too.
 */
export async function showsCredential(page: Page, secrets: readonly string[] = credentialVars().filter((v) => !v.ambiguous).map((v) => v.value)): Promise<boolean> {
  return page
    .evaluate((values: string[]) => {
      if (!values.length) return false;
      const texts = [document.body?.innerText ?? ''];
      for (const el of Array.from(document.querySelectorAll('input:not([type="password"]), textarea'))) texts.push((el as HTMLInputElement).value ?? '');
      return texts.some((t) => values.some((v) => t.includes(v)));
    }, [...secrets])
    .catch(() => true); // could not look: do not send
}

/**
 * The viewport as a JPEG no wider than `maxWidth` CSS pixels. Chromium's
 * captureScreenshot scales in the renderer (clip.scale); elsewhere the CSS-pixel
 * screenshot is used as it is.
 */
export async function captureForModel(page: Page, maxWidth: number, quality: number): Promise<Buffer> {
  const size = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
  const scale = Math.min(1, maxWidth / Math.max(1, size.width));
  try {
    const cdp = await page.context().newCDPSession(page);
    try {
      const shot = (await cdp.send('Page.captureScreenshot', {
        format: 'jpeg',
        quality,
        clip: { x: 0, y: 0, width: size.width, height: size.height, scale },
      })) as { data: string };
      return Buffer.from(shot.data, 'base64');
    } finally {
      await cdp.detach().catch(() => {});
    }
  } catch {
    return await page.screenshot({ type: 'jpeg', quality, scale: 'css' });
  }
}

/**
 * The image to attach to a tool result, or a note saying why there is none.
 * Never throws: vision is an aid, and a capture that fails leaves the result
 * as it was.
 */
export async function imageForResult(page: Page, label: string, opts: { maxWidth: number; quality: number }): Promise<{ id?: string; note?: string }> {
  try {
    if (await showsCredential(page)) return { note: '[image withheld: the page shows a credential value]' };
    const bytes = await captureForModel(page, opts.maxWidth, opts.quality);
    return { id: storeImage(bytes, label) };
  } catch {
    return {};
  }
}

// --- capability --------------------------------------------------------------

/** Models known either way, so the common cases never wait on a network lookup. */
const KNOWN: Record<string, boolean> = {
  'xiaomi/mimo-v2.6-flash': true,
  'z-ai/glm-5.3': false,
  'deepseek/deepseek-v4-flash': false,
  'deepseek/deepseek-v4.1-flash': false,
};

const CACHE_TTL_MS = 24 * 3600_000;
const verdicts = new Map<string, boolean>();
const warned = new Set<string>();

function cacheFile(): string {
  return path.join(rootDir(), 'cache', 'openrouter-models.json');
}

/** OpenRouter's image-input models, from the cache when it is fresh, else the /models endpoint. */
async function openRouterImageModels(baseUrl: string, fetchImpl: typeof fetch): Promise<Map<string, boolean> | null> {
  try {
    const cached = JSON.parse(fs.readFileSync(cacheFile(), 'utf8')) as { at: number; models: Record<string, boolean> };
    if (Date.now() - cached.at < CACHE_TTL_MS) return new Map(Object.entries(cached.models));
  } catch {
    /* no cache yet */
  }
  try {
    const res = await fetchImpl(baseUrl.replace(/\/$/, '') + '/models', { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { id: string; architecture?: { input_modalities?: string[] } }[] };
    const models: Record<string, boolean> = {};
    for (const m of json.data ?? []) models[m.id] = Boolean(m.architecture?.input_modalities?.includes('image'));
    fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
    fs.writeFileSync(cacheFile(), JSON.stringify({ at: Date.now(), models }));
    return new Map(Object.entries(models));
  } catch {
    return null;
  }
}

/**
 * Whether `model` takes image input. Known models answer at once; an OpenRouter
 * model is looked up in /models (cached). Anything else, or a failed lookup,
 * is NO, logged once per model: an image sent to a text-only model is a 400 on
 * some hosts and silently dropped on others.
 */
export async function acceptsImages(model: string, provider: string, baseUrl: string, opts: { fetchImpl?: typeof fetch; log?: (line: string) => void } = {}): Promise<boolean> {
  const key = `${provider}|${model}`;
  const hit = verdicts.get(key);
  if (hit !== undefined) return hit;
  let verdict: boolean | undefined = KNOWN[model];
  if (verdict === undefined && provider === 'anthropic') verdict = /^claude-/.test(model);
  if (verdict === undefined && provider === 'openrouter') verdict = (await openRouterImageModels(baseUrl, opts.fetchImpl ?? fetch))?.get(model);
  const log = opts.log ?? visionLog;
  if (verdict === undefined) {
    if (!warned.has(key)) {
      warned.add(key);
      log(`[vision] ${model} (${provider}): image input support unknown, so screenshots are not sent to it`);
    }
    verdict = false;
  } else if (!verdict && !warned.has(key)) {
    warned.add(key);
    log(`[vision] ${model} (${provider}) takes no images: screenshots in its history are sent as text stubs`);
  }
  verdicts.set(key, verdict);
  return verdict;
}

/**
 * Where a capability decision is written: the daemon runs with its stdio
 * ignored, so a console line would be lost. One line per model per daemon.
 */
function visionLog(line: string): void {
  try {
    fs.mkdirSync(rootDir(), { recursive: true });
    fs.appendFileSync(path.join(rootDir(), 'vision.log'), `${new Date().toISOString()} ${line}
`);
  } catch {
    /* best-effort */
  }
}

/** Test seam. */
export function clearCapabilityCache(): void {
  verdicts.clear();
  warned.clear();
}

// --- the wire ----------------------------------------------------------------

export function carriesImages(messages: readonly ChatMessage[]): boolean {
  return messages.some((m) => m.role === 'tool' && Boolean(m.images?.length));
}

const OLDER_STUB = (label: string) => `[older screenshot (${label}) omitted — only the most recent ones are shown]`;
const TEXT_ONLY_STUB = (label: string) => `[screenshot (${label}) not shown: this model does not take images]`;

/**
 * The history as an OpenAI-compatible request sends it. With no images in it,
 * the SAME array comes back (the flag-off path is untouched). Otherwise each
 * tool message loses its `images` field, and after each run of tool messages
 * one user message carries the run's images: the newest `keep` of the whole
 * history as `image_url` parts, the rest as text stubs. With `allowed` false
 * every image is a stub.
 */
export function openAiWireMessages(messages: ChatMessage[], opts: { allowed: boolean; keep: number }): ChatMessage[] | Array<Record<string, unknown>> {
  if (!carriesImages(messages)) return messages;
  const shown = shownIds(messages, opts);
  const out: Array<Record<string, unknown>> = [];
  let pending: Array<Record<string, unknown>> = [];
  const flush = () => {
    if (pending.length) out.push({ role: 'user', content: pending });
    pending = [];
  };
  for (const m of messages) {
    if (m.role !== 'tool') flush();
    if (m.role === 'tool' && m.images?.length) {
      const { images, ...rest } = m;
      out.push(rest);
      for (const id of images) {
        const img = storedImage(id);
        const label = img?.label ?? `call ${m.tool_call_id}`;
        if (img && shown.has(id)) {
          pending.push({ type: 'text', text: `[screenshot: ${label}]` });
          pending.push({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.base64}` } });
        } else {
          pending.push({ type: 'text', text: opts.allowed ? OLDER_STUB(label) : TEXT_ONLY_STUB(label) });
        }
      }
      continue;
    }
    out.push(m as unknown as Record<string, unknown>);
  }
  flush();
  return out;
}

/** The ids of the newest `keep` images still in the store, when images may be sent at all. */
function shownIds(messages: readonly ChatMessage[], opts: { allowed: boolean; keep: number }): Set<string> {
  const shown = new Set<string>();
  if (!opts.allowed) return shown;
  for (let i = messages.length - 1; i >= 0 && shown.size < opts.keep; i--) {
    const m = messages[i];
    if (m.role !== 'tool' || !m.images) continue;
    for (let j = m.images.length - 1; j >= 0 && shown.size < opts.keep; j--) if (storedImage(m.images[j])) shown.add(m.images[j]);
  }
  return shown;
}

/** The same for the Anthropic Messages API: images go inside the tool_result block. */
export function anthropicImageBlocks(images: readonly string[] | undefined, shown: ReadonlySet<string>, allowed: boolean): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  for (const id of images ?? []) {
    const img = storedImage(id);
    const label = img?.label ?? 'screenshot';
    if (img && shown.has(id)) blocks.push({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.base64 } });
    else blocks.push({ type: 'text', text: allowed ? OLDER_STUB(label) : TEXT_ONLY_STUB(label) });
  }
  return blocks;
}

export { shownIds };
