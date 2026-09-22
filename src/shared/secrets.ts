/**
 * Secret interpolation: `{{env:NAME}}` markers resolve to environment
 * variables at the moment a tool executes, and ONLY there.
 *
 * The marker — not the value — is what travels everywhere else: the
 * instruction the model reads, the recorded steps, compiled skills, flows,
 * transcripts, and every artifact the bench publishes. The inner model
 * copies the marker into its fill/type call verbatim and never sees the
 * secret at all, so nothing upstream of the browser can leak it — the
 * provider included. Skills recorded this way also survive credential
 * rotation for free: replay re-resolves the marker each run.
 *
 * Scrubbing is the backstop for the one remaining channel: the PAGE. A form
 * that echoes a typed value (a visible username, a confirmation banner)
 * would put it into snapshots, reads, and diffs — so every tool result and
 * diff is passed back through `scrubSecrets`, which replaces any value the
 * session has resolved with its marker.
 *
 * The ledger is process-wide, which is session-wide by construction: one
 * daemon process per session.
 *
 * `{{totp:NAME}}` is the second kind of marker: the CURRENT one-time code for
 * the TOTP seed in NAME (execution/totp.ts, shared with the compiled
 * artifact). It resolves at the same place, asynchronously (a code generated
 * at a window's edge waits for the next window), and every code generated is
 * scrubbed for the rest of the session — a 6-digit code outlives its window
 * in a transcript.
 */
import { totpCode, type TotpClock } from '../execution/totp.js';

const SECRET_RE = /\{\{env:([A-Za-z_][A-Za-z0-9_]*)\}\}/g;
/** Either kind of marker, for the paths that resolve both (the dispatch). */
const ANY_SECRET_RE = /\{\{(env|totp):([A-Za-z_]\w*)\}\}/g;

/** Values resolved this session, value → the marker it came from (a totp marker keeps every code it produced). */
const ledger = new Map<string, string>();

/** Minimum value length the scrubber will replace: shorter values would
 * false-positive on ordinary page text ("1234" in a price). A secret this
 * short is unsafe for unrelated reasons; the resolver still resolves it. */
const MIN_SCRUB_LEN = 4;

export function hasSecretMarker(text: string): boolean {
  // Not ANY_SECRET_RE: `test` on a global regex leaves lastIndex set, and
  // matchAll starts from it.
  return /\{\{(?:env|totp):[A-Za-z_]\w*\}\}/.test(text);
}

/** Whether `text` carries a `{{totp:NAME}}` marker — a value to regenerate each time, never to reuse. */
export function hasTotpMarker(text: string): boolean {
  return /\{\{totp:\w+\}\}/.test(text);
}

/**
 * Replace every `{{env:NAME}}` in `text` with the environment's value.
 * Throws on an unset variable — a silently-unresolved marker would be typed
 * into the page literally, which is never what the caller meant.
 */
export function resolveSecrets(text: string): string {
  return text.replace(SECRET_RE, (_m, name: string) => {
    const value = process.env[name];
    if (value === undefined || value === '') {
      throw new Error(
        `secret {{env:${name}}} cannot be resolved — the environment variable ${name} is not set where the daemon runs. ` +
          `Set it and restart the session (sitelooper stop, then re-run with ${name} exported).`,
      );
    }
    ledger.set(value, `{{env:${name}}}`);
    return value;
  });
}

/**
 * resolveSecrets for both kinds of marker: `{{env:NAME}}` as above, and
 * `{{totp:NAME}}` as the code current at the moment of the call (waiting out
 * a window's last seconds first). The DISPATCH path; `clock` is a test seam.
 */
export async function resolveSecretsAsync(text: string, clock?: TotpClock): Promise<string> {
  if (!hasTotpMarker(text)) return resolveSecrets(text);
  let out = '';
  let last = 0;
  for (const m of text.matchAll(ANY_SECRET_RE)) {
    const at = m.index ?? 0;
    out += text.slice(last, at);
    last = at + m[0].length;
    if (m[1] === 'env') {
      out += resolveSecrets(m[0]);
      continue;
    }
    const code = await totpCode(process.env[m[2]], m[2], clock);
    ledger.set(code, m[0]);
    out += code;
  }
  return out + text.slice(last);
}

/** resolveSecretsAsync over every string field of a tool's args (non-mutating). */
export async function resolveSecretsDeepAsync<T>(value: T, clock?: TotpClock): Promise<T> {
  if (typeof value === 'string') return (hasSecretMarker(value) ? await resolveSecretsAsync(value, clock) : value) as T;
  if (Array.isArray(value)) return (await Promise.all(value.map((v) => resolveSecretsDeepAsync(v, clock)))) as T;
  if (value && typeof value === 'object') {
    const entries = await Promise.all(Object.entries(value as Record<string, unknown>).map(async ([k, v]) => [k, await resolveSecretsDeepAsync(v, clock)] as const));
    return Object.fromEntries(entries) as T;
  }
  return value;
}

/** resolveSecrets over every string field of a tool's args (non-mutating). */
export function resolveSecretsDeep<T>(value: T): T {
  if (typeof value === 'string') return (hasSecretMarker(value) ? resolveSecrets(value) : value) as T;
  if (Array.isArray(value)) return value.map((v) => resolveSecretsDeep(v)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, resolveSecretsDeep(v)])) as T;
  }
  return value;
}

/**
 * Replace every session-resolved secret VALUE in `text` with its marker.
 * Applied to tool results and page diffs — anything the page echoed back.
 */
export function scrubSecrets(text: string): string {
  let out = text;
  // Longest first: a shorter secret that is a substring of a longer one
  // (USER=james, PASS=james2024!) would otherwise split the longer value and
  // let its tail through.
  for (const [value, marker] of [...ledger].sort((a, b) => b[0].length - a[0].length)) {
    if (value.length < MIN_SCRUB_LEN) continue;
    if (out.includes(value)) out = out.split(value).join(marker);
  }
  return out;
}

/** scrubSecrets over every string in a structure (non-mutating). */
export function scrubSecretsDeep<T>(value: T): T {
  if (typeof value === 'string') return scrubSecrets(value) as T;
  if (Array.isArray(value)) return value.map((v) => scrubSecretsDeep(v)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, scrubSecretsDeep(v)])) as T;
  }
  return value;
}

/** Test seam: forget resolved values (a daemon process never needs this). */
export function clearSecretLedger(): void {
  ledger.clear();
}
