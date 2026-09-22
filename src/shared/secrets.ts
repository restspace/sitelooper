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

/*
 * LITERAL credentials, turned back into their markers (FIX AH, round 47).
 *
 * Everything above protects a value that arrived as a marker. Nothing
 * protected one that arrived as itself: fwrd83's caller ran
 * `sitelooper do "… password $APP_PASSWORD …"`, the shell expanded it, and
 * `bench-pass-1234` went into the flow, the skills, script.jsonl, the flow
 * runs and the compiled `v2: 'bench-pass-1234'` (requiredEnvNames []). fwod79's
 * model typed "password 'admin'" itself. So a literal that EQUALS the value of
 * a credential-named environment variable is rewritten to `{{env:NAME}}` —
 * in a `do` instruction (server.ts) and in a fill/type value (tools.ts) —
 * before any model, recorder or store sees it, and the value joins the scrub
 * ledger.
 *
 * Provenance decides, not shape: the environment says which values are
 * credentials, by the variable's NAME. A value some OTHER, non-credential
 * variable holds too (odoo's `admin` is APP_PASSWORD and APP_EMAIL) is
 * AMBIGUOUS: it is never rewritten in prose and never scrubbed (every "admin"
 * on the page would go), only in a fill whose field is a password field.
 */

/** A variable name that says it holds a credential — a name segment, so `APP_PASSWORD`, `GH_TOKEN`, `OPENAI_API_KEY`, `APP_TOTP`, never `PASSENGER_URL` or a bare `SORT_KEY`. */
const CREDENTIAL_NAME = /(?:^|_)(?:PASSWORD|PASSWD|PASS|PWD|SECRET|TOKEN|(?:API|PRIVATE|ACCESS)_?KEY|OTP|TOTP)(?:_|$)/i;

export interface CredentialVar {
  name: string;
  value: string;
  /** A non-credential variable holds the same value. */
  ambiguous: boolean;
}

/** The credential-named variables worth matching (value at least the scrub minimum), longest value first. */
export function credentialVars(env: NodeJS.ProcessEnv = process.env): CredentialVar[] {
  const plain = new Set<string>();
  for (const [name, value] of Object.entries(env)) if (value && !CREDENTIAL_NAME.test(name)) plain.add(value);
  const seen = new Set<string>();
  const out: CredentialVar[] = [];
  for (const name of Object.keys(env).sort()) {
    const value = env[name];
    if (!value || value.length < MIN_SCRUB_LEN || !CREDENTIAL_NAME.test(name) || seen.has(value)) continue;
    seen.add(value);
    out.push({ name, value, ambiguous: plain.has(value) });
  }
  return out.sort((a, b) => b.value.length - a.value.length);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `value` standing as a token of its own: not the middle of a longer word or number. */
const tokenRe = (value: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(value)}(?![\\p{L}\\p{N}])`, 'gu');

/**
 * `text` with every UNAMBIGUOUS credential value that stands as a token
 * rewritten to its `{{env:NAME}}` marker, and the names that were. Each
 * rewritten value joins the scrub ledger. The `do` instruction's path.
 */
export function markLiteralCredentials(text: string, env: NodeJS.ProcessEnv = process.env): { text: string; names: string[] } {
  let out = text;
  const names: string[] = [];
  for (const v of credentialVars(env)) {
    if (v.ambiguous || !out.includes(v.value)) continue;
    const re = tokenRe(v.value);
    if (!re.test(out)) continue;
    out = out.replace(tokenRe(v.value), `{{env:${v.name}}}`);
    ledger.set(v.value, `{{env:${v.name}}}`);
    names.push(v.name);
  }
  return { text: out, names };
}

/**
 * A fill/type value as it should be recorded: the whole value equal to a
 * credential becomes its marker — an ambiguous one only when the field is a
 * password field — and otherwise unambiguous credentials inside it are
 * rewritten as in prose.
 */
export function markLiteralCredentialValue(value: string, passwordField: boolean, env: NodeJS.ProcessEnv = process.env): { value: string; names: string[] } {
  const whole = credentialVars(env).find((v) => v.value === value && (!v.ambiguous || passwordField));
  if (whole) {
    if (!whole.ambiguous) ledger.set(whole.value, `{{env:${whole.name}}}`);
    return { value: `{{env:${whole.name}}}`, names: [whole.name] };
  }
  const marked = markLiteralCredentials(value, env);
  return { value: marked.text, names: marked.names };
}

/** Whether any value in `env` is a credential a literal could equal — the cheap guard in front of the rewrites. */
export function mayHoldLiteralCredential(text: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return credentialVars(env).some((v) => text.includes(v.value));
}

/**
 * Credential variables whose UNAMBIGUOUS value stands as a token in any
 * string of `value` — a compiled artifact or an exported flow that would
 * carry a secret in the clear. Names only, never values.
 */
export function literalCredentialsIn(value: unknown, env: NodeJS.ProcessEnv = process.env): string[] {
  const vars = credentialVars(env).filter((v) => !v.ambiguous);
  const found = new Set<string>();
  if (!vars.length) return [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      for (const c of vars) if (v.includes(c.value) && tokenRe(c.value).test(v)) found.add(c.name);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (v && typeof v === 'object') for (const item of Object.values(v as Record<string, unknown>)) walk(item);
  };
  walk(value);
  return [...found].sort();
}
