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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { totpCode, type TotpClock } from '../execution/totp.js';
import { valueHash } from '../execution/facts.js';

const SECRET_RE = /\{\{env:([A-Za-z_][A-Za-z0-9_]*)\}\}/g;
/** Either kind of marker, for the paths that resolve both (the dispatch). */
const ANY_SECRET_RE = /\{\{(env|totp):([A-Za-z_]\w*)\}\}/g;

/** Values resolved this session, value → the marker it came from (a totp marker keeps every code it produced). */
const ledger = new Map<string, string>();

/**
 * Resolved values that are AMBIGUOUS — another, non-credential variable holds
 * the same value — value → marker. Scrubbed only inside a password field's own
 * line (passwordLines), never in page text. fwkb39: kanboard's password is its
 * username ("admin" is APP_PASSWORD and APP_EMAIL); on the main ledger every
 * line naming the user was rewritten, and the recorded post-login heading
 * became `- heading "KB Dashboard for {{env:APP_PASSWORD}}"`, a check that
 * matched anything.
 */
const ambiguousLedger = new Map<string, string>();

/**
 * valueHash (execution/facts.ts) of every value this session filed as an
 * AMBIGUOUS credential — resolved from a marker onto ambiguousLedger, or met
 * as a literal in a password field (markLiteralCredentialValue). Hashes only:
 * the site-facts observer (skills/facts-value.ts) files each as a
 * `value.class` `credential` fact, and the value itself never leaves this
 * module. Read by nothing that scrubs, so it changes no scrubbing.
 */
const ambiguousHashes = new Set<string>();

/** The hashes of this session's ambiguous credential values (see ambiguousHashes), for the site-facts observer. */
export function ambiguousCredentialHashes(): string[] {
  return [...ambiguousHashes];
}

/** Snapshot lines of password fields a secret was typed into this session (`textbox "Password": admin`). */
const passwordLines = new Set<string>();

/** Whether a variable OTHER than `name`, and not itself credential-named, holds `value`. */
function heldByPlainVariable(name: string, value: string, env: NodeJS.ProcessEnv = process.env): boolean {
  for (const [k, v] of Object.entries(env)) if (k !== name && v === value && !CREDENTIAL_NAME.test(k)) return true;
  return false;
}

/**
 * File a resolved env value on the ledger its ambiguity decides. Only a
 * CREDENTIAL's value can be ambiguous: a non-credential marker ({{env:TEST_USER}})
 * is scrubbed everywhere, as it always was, whatever else holds its value.
 */
function bankResolved(name: string, value: string): void {
  if (CREDENTIAL_NAME.test(name) && heldByPlainVariable(name, value)) {
    ambiguousLedger.set(value, `{{env:${name}}}`);
    ambiguousHashes.add(valueHash(value));
  } else ledger.set(value, `{{env:${name}}}`);
}

/**
 * The snapshot line of a password field a secret was just typed into, as the
 * page shows it (`textbox "Password": admin`). An AMBIGUOUS secret is scrubbed
 * inside this line, and only there. tools.ts calls this after a fill or type
 * whose value carried a marker lands in a password field.
 */
export function notePasswordFieldLine(line: string): void {
  if (line.trim()) passwordLines.add(line.trim());
}

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
    bankResolved(name, value);
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
  // An ambiguous value: only as the VALUE of a password field's own line.
  for (const line of passwordLines) {
    for (const [value, marker] of ambiguousLedger) {
      if (value.length < MIN_SCRUB_LEN || !line.endsWith(`: ${value}`) || !out.includes(line)) continue;
      out = out.split(line).join(line.slice(0, -value.length) + marker);
    }
  }
  return out;
}

/**
 * Site facts, stage 3 consumer 4 (design-site-facts.md §4): valueHash of every
 * value the origin holds a RELIABLE `credential` fact about, as the daemon's
 * value observer last handed them (setKnownCredentialHashes). An AMBIGUOUS
 * credential (the password that is also the username, fwgr68/fwkb39) whose
 * hash is here is one the app is known to show, so the recorder's line scrub
 * rewrites it in ANY line of a step's diff, not only its password field's own
 * (scrubSecretsDeep's `knownCredentials`). Empty: the scrub is today's.
 */
let knownCredentialHashes = new Set<string>();
/** The environment's ambiguous credential values whose hash is known, value → marker (computed once per hand-over: it reads the environment). */
let knownCredentialValues = new Map<string, string>();

/**
 * Hand the scrub the hashes of this origin's reliable credential facts
 * (skills/facts-value.ts ValueFactObserver.credentialHashes). Replaces the
 * previous set. Hashes only: the values are this session's (ambiguousLedger)
 * or the environment's own credential variables, matched by hash.
 */
export function setKnownCredentialHashes(hashes: Iterable<string>, env: NodeJS.ProcessEnv = process.env): void {
  knownCredentialHashes = new Set(hashes);
  knownCredentialValues = new Map();
  if (!knownCredentialHashes.size) return;
  for (const v of credentialVars(env)) {
    if (v.ambiguous && knownCredentialHashes.has(valueHash(v.value))) knownCredentialValues.set(v.value, `{{env:${v.name}}}`);
  }
}

/**
 * `text` with every ambiguous credential value whose hash has a reliable
 * credential fact (setKnownCredentialHashes) rewritten to its marker wherever
 * it stands as a token — the value itself, not the middle of a longer word
 * ("admin" goes, "administrator" stays). Longest first, as scrubSecrets.
 */
function scrubKnownCredentials(text: string): string {
  if (!knownCredentialHashes.size) return text;
  const known = new Map<string, string>(knownCredentialValues);
  for (const [value, marker] of ambiguousLedger) if (knownCredentialHashes.has(valueHash(value)) && !known.has(value)) known.set(value, marker);
  let out = text;
  for (const [value, marker] of [...known].sort((a, b) => b[0].length - a[0].length)) {
    if (value.length < MIN_SCRUB_LEN || !out.includes(value)) continue;
    out = out.replace(tokenRe(value), () => marker);
  }
  return out;
}

/**
 * scrubSecrets over every string in a structure (non-mutating).
 * `knownCredentials`: the recorder's line scrub of a step's diff (agent/tools.ts)
 * also rewrites the ambiguous credentials a reliable site fact says the app
 * shows (scrubKnownCredentials), in any line. Off everywhere else: what the
 * model reads is scrubbed as it always was.
 */
export function scrubSecretsDeep<T>(value: T, opts: { knownCredentials?: boolean } = {}): T {
  if (typeof value === 'string') {
    const scrubbed = scrubSecrets(value);
    return (opts.knownCredentials ? scrubKnownCredentials(scrubbed) : scrubbed) as T;
  }
  if (Array.isArray(value)) return value.map((v) => scrubSecretsDeep(v, opts)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, scrubSecretsDeep(v, opts)])) as T;
  }
  return value;
}

/** Test seam: forget resolved values (a daemon process never needs this). */
export function clearSecretLedger(): void {
  ledger.clear();
  ambiguousLedger.clear();
  ambiguousHashes.clear();
  passwordLines.clear();
  knownCredentialHashes = new Set();
  knownCredentialValues = new Map();
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
//
// The credential word must END the name: APP_PASSWORD holds a password,
// PASSWORD_STORE_DIR, GITHUB_TOKEN_URL and SSH_KEY_FILE hold where one is or
// how to get one — never the secret. The short forms PWD and PASS need a
// prefix (DB_PWD, DB_PASS): bare `PWD` is the shell's working directory, and
// fwrd85 read `/home/user/sitelooper` as a password — compile rewrote the cwd
// inside recorded screenshot paths to `{{env:PWD}}` and the artifact required
// a variable PowerShell and many CI runners never set.
const CREDENTIAL_NAME = /(?:(?:^|_)(?:PASSWORD|PASSWD|SECRET|TOKEN|(?:API|PRIVATE|ACCESS|SECRET)_?KEY|OTP|TOTP)|_(?:PASS|PWD))$/i;

/**
 * A value that is a path ON THIS FILESYSTEM: the working directory, or a
 * path-shaped value (absolute POSIX `/…`, home-relative `~/…`, a Windows
 * drive `C:\…`/`C:/…` or UNC `\\host\…`) that EXISTS here. Whatever its
 * variable is called, a directory or file that exists is where something
 * lives, not the secret — and inlined as a marker it would tie a recording to
 * one machine's layout. A value-shape rule, so a new `*_PASSWORD_FILE`-style
 * name needs no entry in any list.
 *
 * Existence, not shape alone: `/Xy9!abc` is shaped like a path and is almost
 * certainly a password. Excluding every path-SHAPED value would leak such a
 * password silently, and silence is the one failure this feature must not
 * have; a path-shaped value that does not exist is kept as a possible secret.
 */
function isPathValue(value: string): boolean {
  if (value === process.cwd()) return true;
  if (!/^(?:\/|~\/|[A-Za-z]:[\\/]|\\\\)/.test(value)) return false;
  // A network (UNC) path is never probed: existsSync on `\\host\share` waits on
  // a network lookup — seconds, on every credential scan (round 56: the unit
  // test for it timed out at 5s). Unproven, it stays a possible secret, the
  // side this rule errs on.
  if (value.startsWith('\\\\')) return false;
  try {
    return fs.existsSync(value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value);
  } catch {
    return false;
  }
}

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
    // The existence check last, once per distinct value: it touches the filesystem.
    if (!value || value.length < MIN_SCRUB_LEN || !CREDENTIAL_NAME.test(name) || seen.has(value) || isPathValue(value)) continue;
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
    else ambiguousHashes.add(valueHash(whole.value));
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

/**
 * `value` (any JSON-shaped structure) with every UNAMBIGUOUS credential value
 * standing as a token rewritten to its `{{env:NAME}}` marker — the compiler's
 * repair of a flow recorded before its caller used the marker (round 48's
 * corpus: fwsi1-6 carry `bench-admin-pass` in the clear). Non-mutating; the
 * names rewritten, never the values. Ambiguous values are left alone: which of
 * two variables a bare `admin` meant is not a question a string can answer.
 */
export function rewriteLiteralCredentials<T>(value: T, env: NodeJS.ProcessEnv = process.env): { value: T; names: string[] } {
  const vars = credentialVars(env).filter((v) => !v.ambiguous);
  const names = new Set<string>();
  if (!vars.length) return { value, names: [] };
  const map = (v: unknown): unknown => {
    if (typeof v === 'string') {
      let out = v;
      for (const c of vars) {
        if (!out.includes(c.value)) continue;
        const next = out.replace(tokenRe(c.value), `{{env:${c.name}}}`);
        if (next !== out) names.add(c.name);
        out = next;
      }
      return out;
    }
    if (Array.isArray(v)) return v.map(map);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, map(x)]));
    return v;
  };
  return { value: map(value) as T, names: [...names].sort() };
}

/** Credential variables whose AMBIGUOUS value stands as a token somewhere in `value` (names only). */
export function ambiguousCredentialsIn(value: unknown, env: NodeJS.ProcessEnv = process.env): string[] {
  const vars = credentialVars(env).filter((v) => v.ambiguous);
  const found = new Set<string>();
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
  if (vars.length) walk(value);
  return [...found].sort();
}

/** The credential variable an AMBIGUOUS value belongs to, when it is one (a password field's fill decides it). */
export function ambiguousCredentialFor(value: string, env: NodeJS.ProcessEnv = process.env): string | null {
  return credentialVars(env).find((v) => v.ambiguous && v.value === value)?.name ?? null;
}
