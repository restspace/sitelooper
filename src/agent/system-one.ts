import { readGlobalConfig } from './llm.js';

/**
 * Optional "System One" tier: TypeSafe's Jev model (https://docs.typesafe.ai).
 *
 * NOT a `Provider`, on purpose. Jev generates no text and makes no tool calls:
 * it answers typed questions — choice, score, noul (yes/no) — about a `state`,
 * with calibrated probabilities. It cannot drive the agent loop; it can only
 * pick among options that code enumerated, which code then verifies. See
 * notes/PLAN-jev.md for the rule ("code enumerates, Jev picks, code verifies") and
 * the sites it serves.
 *
 * The contract every caller relies on: Jev absent, Jev slow and Jev failing
 * are the SAME outcome — `ask` throws, `mapReduce` returns null — and the
 * caller falls through to whatever it did before this tier existed. Nothing
 * here may turn a working path into a failing one.
 */

// --- wire types (field names follow typesafe-sdk-js v0.6.0 src/types.ts) ------

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
/** Text, a JSON object or array: what `state`, `instructions` and criteria accept. */
export type Entry = string | { [key: string]: JsonValue } | JsonValue[] | null;

export interface ChoiceQuestion<L extends string = string> {
  type: 'choice';
  instructions?: Entry;
  /** Label → description; null leaves a label undescribed. */
  criteria: Record<L, Entry>;
}
export interface ScoreQuestion {
  type: 'score';
  instructions?: Entry;
  /** At least two level descriptions, indexed by score from zero. */
  criteria: readonly Entry[];
}
export interface NoulQuestion {
  type: 'noul';
  instructions?: Entry;
  criteria?: { true?: Entry; false?: Entry } | null;
}
export type Question = ChoiceQuestion | ScoreQuestion | NoulQuestion;
export type Questions = Record<string, Question>;

export interface ChoiceAnswer<L extends string = string> {
  type: 'choice';
  choice: L;
  confidence: number;
  probabilities: Record<L, number>;
}
export interface ScoreAnswer {
  type: 'score';
  /** Probability-weighted expectation over the levels — NOT an integer level. */
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
}
/** A probability in 0..1. A noul carries no separate confidence: see `noulConfidence`. */
export interface NoulAnswer {
  type: 'noul';
  noul: number;
}

export type AnswerFor<Q extends Question> = Q extends ChoiceQuestion<infer L>
  ? ChoiceAnswer<L>
  : Q extends ScoreQuestion
    ? ScoreAnswer
    : NoulAnswer;
export type Answers<Q extends Questions> = { [K in keyof Q]: AnswerFor<Q[K]> };

export function choice<L extends string>(instructions: Entry, criteria: Record<L, Entry>): ChoiceQuestion<L> {
  return { type: 'choice', instructions, criteria };
}
export function score(instructions: Entry, criteria: readonly Entry[]): ScoreQuestion {
  return { type: 'score', instructions, criteria };
}
export function noul(instructions: Entry, criteria?: { true?: Entry; false?: Entry }): NoulQuestion {
  return { type: 'noul', instructions, ...(criteria ? { criteria } : {}) };
}

/**
 * How far a noul is from a coin flip, on the 0..1 scale choice/score
 * confidence uses. Code-side convenience only: the docs are explicit that
 * thresholds do not transfer between primitives, so a site calibrates its noul
 * gate on nouls.
 */
export function noulConfidence(a: NoulAnswer): number {
  return Math.abs(a.noul - 0.5) * 2;
}

// --- config -------------------------------------------------------------------

export const SYSTEM_ONE_BASE_URL = 'https://api.typesafe.ai';
export const SYSTEM_ONE_DEFAULT_MODEL = 'jev-latest';
export const SYSTEM_ONE_KEY_ENV_VARS = ['SITELOOPER_JEV_API_KEY', 'TYPESAFE_API_KEY'];

/** One request, retry included. A slow Jev must never cost more than it could save. */
export const SYSTEM_ONE_TIMEOUT_MS = 3_000;
/** A whole fan-out: as slow as its slowest shard, so stragglers are cut, not awaited. */
export const SYSTEM_ONE_FANOUT_TIMEOUT_MS = 5_000;
/**
 * In-flight requests per fan-out. Measured 2026-09-18 on 200 shards
 * (bench/jev-probe.mjs): 32 → 2.4s, 64 → 1.2s, 128 → 1.1s, 200 → 1.4s. 64 is
 * the knee; past it the floor is the host's, not ours. The host allows 1,200
 * req/min, so a site fanning out wider than that per minute must pace itself.
 */
export const SYSTEM_ONE_CONCURRENCY = 64;
/**
 * State budget per request, in estimated tokens. The host's ceiling is 32k for
 * state + the longest question; the working budget is far lower because Jev's
 * accuracy falls with irrelevant state — a shard this big is already a smell.
 */
export const SYSTEM_ONE_SHARD_TOKENS = 4_000;

export interface SystemOneConfig {
  /** True iff the tier should be used: not switched off AND a key resolved. */
  enabled: boolean;
  mode: 'auto' | 'off';
  apiKey: string;
  model: string;
  baseUrl: string;
  keyEnvVars: string[];
}

export interface SystemOneOverrides {
  /** `--no-jev`: off for this call regardless of env and config. */
  off?: boolean;
  apiKey?: string;
  model?: string;
}

/**
 * Same precedence as resolveProviderConfig: flag > env > config file > default.
 * The default is `auto` — on iff a key resolves — so an install with no
 * TypeSafe key behaves exactly as it did before this tier existed.
 */
export function resolveSystemOneConfig(overrides: SystemOneOverrides = {}): SystemOneConfig {
  const file = readGlobalConfig();
  const raw = (overrides.off ? 'off' : process.env.SITELOOPER_JEV || file.jev || 'auto').trim().toLowerCase();
  const mode = /^(off|none|false|0|no)$/.test(raw) ? 'off' : 'auto';
  const apiKey =
    overrides.apiKey || SYSTEM_ONE_KEY_ENV_VARS.map((v) => process.env[v]).find(Boolean) || file.jevApiKey || '';
  return {
    enabled: mode === 'auto' && Boolean(apiKey),
    mode,
    apiKey,
    model: overrides.model || process.env.SITELOOPER_JEV_MODEL || file.jevModel || SYSTEM_ONE_DEFAULT_MODEL,
    baseUrl: process.env.SITELOOPER_JEV_BASE_URL || SYSTEM_ONE_BASE_URL,
    keyEnvVars: SYSTEM_ONE_KEY_ENV_VARS,
  };
}

// --- client -------------------------------------------------------------------

export interface SystemOneUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AskResult<Q extends Questions> {
  /** The model that actually served — `jev-latest` is a moving alias, so calibration records this. */
  model: string;
  answers: Answers<Q>;
  usage: SystemOneUsage;
  ms: number;
}

export interface AskOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface SystemOne {
  readonly model: string;
  ask<Q extends Questions>(state: Entry, questions: Q, opts?: AskOptions): Promise<AskResult<Q>>;
}

/** Called once per completed request — the daemon folds these into session usage. */
export type UsageSink = (model: string, usage: SystemOneUsage) => void;

export class TypeSafeSystemOne implements SystemOne {
  readonly model: string;

  constructor(
    private config: SystemOneConfig,
    private onUsage?: UsageSink,
  ) {
    this.model = config.model;
  }

  async ask<Q extends Questions>(state: Entry, questions: Q, opts: AskOptions = {}): Promise<AskResult<Q>> {
    if (!this.config.apiKey) {
      throw new Error(`no TypeSafe API key: set ${this.config.keyEnvVars.join(' or ')} (or \`sitelooper config set jevApiKey <key>\`)`);
    }
    const keys = Object.keys(questions);
    if (!keys.length) throw new Error('system-one: no questions');
    const deadline = AbortSignal.timeout(opts.timeoutMs ?? SYSTEM_ONE_TIMEOUT_MS);
    const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline;
    const url = this.config.baseUrl.replace(/\/$/, '') + '/v1/systemone';
    const body = JSON.stringify({ model: this.config.model, state, questions });
    const started = Date.now();

    // ONE retry, not the LLM path's five: this tier only exists to be faster
    // than the model behind it, and every caller has that model to fall to.
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal.aborted) break;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${this.config.apiKey}` },
          body,
          signal,
        });
        // 529 is TypeSafe's "overloaded"; covered by >= 500.
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`system-one HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
          await sleep(retryDelayMs(res), signal);
          continue;
        }
        if (!res.ok) throw new Error(`system-one HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const out = parseAnswers(questions, (await res.json()) as Record<string, any>);
        this.onUsage?.(out.model, out.usage);
        return { ...out, ms: Date.now() - started };
      } catch (err) {
        if (signal.aborted) break;
        if (err instanceof Error && /^system-one (HTTP 4|reply)/.test(err.message)) throw err;
        lastErr = err as Error;
      }
    }
    if (signal.aborted) throw new Error(opts.signal?.aborted ? 'system-one request aborted' : 'system-one request timed out');
    throw lastErr ?? new Error('system-one request failed');
  }
}

/**
 * A client when the tier is enabled, else null. The null is for the
 * COMPOSITION ROOT only (the daemon, the repair CLI), which uses it to decide
 * whether a Jev decider joins a site's cascade — see decide.ts. No call site
 * checks availability: it calls one decider and cannot tell what is behind it.
 */
export function buildSystemOne(config: SystemOneConfig, onUsage?: UsageSink): SystemOne | null {
  return config.enabled ? new TypeSafeSystemOne(config, onUsage) : null;
}

/**
 * Validate a reply against the questions that were asked. Strict on purpose:
 * an answer of the wrong shape is a reply we do not understand, and acting on
 * a misread probability is worse than not having asked. Every key asked must
 * come back, as the type asked, with its numbers in range.
 */
export function parseAnswers<Q extends Questions>(
  questions: Q,
  json: Record<string, any>,
): { model: string; answers: Answers<Q>; usage: SystemOneUsage } {
  const bad = (why: string) => new Error(`system-one reply: ${why}`);
  const raw = json?.answers;
  if (!raw || typeof raw !== 'object') throw bad('no answers');
  const unit = (n: unknown) => typeof n === 'number' && n >= 0 && n <= 1;
  const answers: Record<string, unknown> = {};
  for (const [key, q] of Object.entries(questions)) {
    const a = raw[key];
    if (!a || a.type !== q.type) throw bad(`"${key}" is not a ${q.type} answer`);
    if (q.type === 'noul') {
      if (!unit(a.noul)) throw bad(`"${key}" noul out of range`);
      answers[key] = { type: 'noul', noul: a.noul };
    } else if (q.type === 'choice') {
      if (typeof a.choice !== 'string' || !(a.choice in q.criteria)) throw bad(`"${key}" chose a label that was not offered`);
      if (!unit(a.confidence)) throw bad(`"${key}" confidence out of range`);
      answers[key] = { type: 'choice', choice: a.choice, confidence: a.confidence, probabilities: a.probabilities ?? {} };
    } else {
      if (typeof a.score !== 'number' || a.score < 0 || a.score > q.criteria.length - 1) throw bad(`"${key}" score out of range`);
      if (!unit(a.confidence)) throw bad(`"${key}" confidence out of range`);
      answers[key] = { type: 'score', score: a.score, confidence: a.confidence, probabilities: a.probabilities ?? {} };
    }
  }
  return {
    model: typeof json.model === 'string' ? json.model : '',
    answers: answers as Answers<Q>,
    usage: { inputTokens: json.usage?.input_tokens ?? 0, outputTokens: json.usage?.output_tokens ?? 0 },
  };
}

function retryDelayMs(res: { headers: { get(name: string): string | null } }): number {
  const retryAfter = Number(res.headers.get('retry-after'));
  // Capped under the request deadline: a hint longer than that is a "no".
  return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, SYSTEM_ONE_TIMEOUT_MS) : 250;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

// --- the decision record -------------------------------------------------------

/** One System One decision, as logged for calibration (see recordSystemOneDecision). */
export interface SystemOneDecision {
  /** Which call site asked, e.g. 'repair.propose'. Thresholds are per site. */
  site: string;
  /** The served model version — `jev-latest` moves, so a calibration shift must be attributable. */
  model: string;
  /** How many options/shards the question ranged over. */
  options: number;
  chosen: string | null;
  confidence: number;
  /** What the site did with the answer: cleared its gate, or left it to the model path (and why). */
  outcome: 'acted' | 'deferred';
  why?: string;
  /** Whether the deterministic verifier later agreed — the label calibration needs. */
  verified?: boolean;
  /**
   * Shadow mode only (decide.ts `shadow`): whether Jev agreed with the
   * authoritative decider it ran beside. The disagreements are the dataset.
   */
  agrees?: boolean;
  /** Site-specific context worth keeping beside the numbers (the value, the line, the rule's answer). */
  detail?: JsonValue;
  ms?: number;
}

// --- map/reduce ---------------------------------------------------------------

/** Rough token estimate (chars/4): for budgeting shards, never for billing. */
export function estimateTokens(value: unknown): number {
  return Math.ceil((typeof value === 'string' ? value : JSON.stringify(value ?? '')).length / 4);
}

/**
 * Pack items into shards under a token budget, order preserved. An item over
 * the budget gets a shard to itself rather than being dropped — the host's own
 * limit is the backstop, and a refused shard fails the fan-out honestly.
 */
export function shardByTokens<T>(items: readonly T[], budget = SYSTEM_ONE_SHARD_TOKENS, maxItems = Infinity): T[][] {
  const shards: T[][] = [];
  let cur: T[] = [];
  let used = 0;
  for (const item of items) {
    const cost = estimateTokens(item);
    if (cur.length && (used + cost > budget || cur.length >= maxItems)) {
      shards.push(cur);
      cur = [];
      used = 0;
    }
    cur.push(item);
    used += cost;
  }
  if (cur.length) shards.push(cur);
  return shards;
}

export interface MapReduceOptions {
  signal?: AbortSignal;
  /** Deadline for the WHOLE fan-out. */
  timeoutMs?: number;
  concurrency?: number;
}

export interface MapReduceResult<S, Q extends Questions> {
  shards: Array<{ shard: S; answers: Answers<Q> }>;
  usage: SystemOneUsage;
  requests: number;
  ms: number;
}

/**
 * Ask about many small states at once: `map` turns each shard into one
 * request, requests run concurrently under one deadline, and the caller
 * reduces the answers in code.
 *
 * Shard the STATE, fan the QUESTIONS: several questions on one shard ride in
 * one request for free, while a big state split into shards is both what the
 * 32k limit needs and what Jev's accuracy needs (it degrades with irrelevant
 * state). Wall-clock stays about one call.
 *
 * All-or-nothing: returns null if ANY shard failed or missed the deadline. A
 * reduce over a partial map is a guess — the missing shard may have held the
 * answer — so the caller defers to its model path instead.
 */
export async function mapReduce<S, Q extends Questions>(
  client: SystemOne,
  shards: readonly S[],
  map: (shard: S, index: number) => { state: Entry; questions: Q },
  opts: MapReduceOptions = {},
): Promise<MapReduceResult<S, Q> | null> {
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? SYSTEM_ONE_FANOUT_TIMEOUT_MS;
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline;
  const out: Array<{ shard: S; answers: Answers<Q> }> = new Array(shards.length);
  const usage: SystemOneUsage = { inputTokens: 0, outputTokens: 0 };
  // The first failure cuts the rest: their answers can no longer be used.
  const cut = new AbortController();
  const each = AbortSignal.any([signal, cut.signal]);
  let next = 0;
  let failed = false;

  const worker = async () => {
    while (!failed && next < shards.length) {
      const i = next++;
      try {
        const { state, questions } = map(shards[i], i);
        const res = await client.ask(state, questions, { signal: each, timeoutMs });
        out[i] = { shard: shards[i], answers: res.answers };
        usage.inputTokens += res.usage.inputTokens;
        usage.outputTokens += res.usage.outputTokens;
      } catch {
        failed = true;
        cut.abort();
      }
    }
  };
  const width = Math.max(1, Math.min(opts.concurrency ?? SYSTEM_ONE_CONCURRENCY, shards.length));
  await Promise.all(Array.from({ length: width }, worker));
  if (failed) return null;
  return { shards: out, usage, requests: shards.length, ms: Date.now() - started };
}

// --- reducers: plain code over answers ----------------------------------------

/** The k best-scoring items, best first. */
export function topK<T>(items: readonly T[], scoreOf: (item: T) => number, k: number): T[] {
  return [...items].sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, k);
}

/**
 * Confidence of a decision made of several answers: its weakest, not their
 * product. One wrong argument spoils the call however sure the others were.
 */
export function minConfidence(values: readonly number[]): number {
  return values.length ? Math.min(...values) : 0;
}

/**
 * The label every vote agrees on, or null. Asking the same thing k ways
 * (rephrased, options reordered) and requiring agreement is the cheap lever
 * for reliability at this price, and the defence against position bias.
 */
export function agreement<L extends string>(votes: readonly L[]): L | null {
  return votes.length && votes.every((v) => v === votes[0]) ? votes[0] : null;
}
