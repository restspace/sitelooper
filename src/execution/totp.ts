/**
 * `{{totp:NAME}}`: the CURRENT one-time code for the TOTP seed held in the
 * environment variable NAME (RFC 6238 — HMAC-SHA-1, a 30 s step and 6 digits
 * unless an `otpauth://` URI says otherwise, the defaults authenticator apps
 * and otplib use).
 *
 * Resolved where `{{env:NAME}}` is resolved and only there — at dispatch
 * (shared/secrets.ts for the daemon, the emitted `totpCode` call for the
 * artifact). The marker is what every recording, skill, flow and compiled
 * source carries; the seed and the code never are.
 *
 * Shared by both runners, so it imports nothing: the HMAC is Node's own
 * WebCrypto (`globalThis.crypto.subtle`, which is `node:crypto`'s webcrypto),
 * present in every Node the artifact and the daemon run on. The clock is
 * injectable so the window-edge wait is testable without waiting.
 */

/** A seed as the code generator needs it. */
export interface TotpSeed {
  key: Uint8Array;
  digits: number;
  period: number;
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512';
}

/** The time source a code is generated against (ms since the epoch, and a way to wait). */
export interface TotpClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

/** Fewer than this many ms left in the window at dispatch: wait for the next one, so the server never sees a code that expired in flight. */
export const TOTP_EDGE_MS = 3_000;

const SYSTEM_CLOCK: TotpClock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * The seed in `value` (the environment variable `name` holds it): a base32
 * secret (spaces, dashes and padding ignored, any case), or an
 * `otpauth://totp/...?secret=…&digits=…&period=…&algorithm=…` URI. Every
 * error names the VARIABLE and never the value.
 */
export function totpSeed(value: string, name: string): TotpSeed {
  let secret = value.trim();
  let digits = 6;
  let period = 30;
  let algorithm: TotpSeed['algorithm'] = 'SHA-1';
  if (/^otpauth:/i.test(secret)) {
    let url: URL;
    try {
      url = new URL(secret);
    } catch {
      throw new Error(`{{totp:${name}}}: the environment variable ${name} holds an otpauth URI that does not parse`);
    }
    if (url.host.toLowerCase() !== 'totp') throw new Error(`{{totp:${name}}}: the otpauth URI in ${name} is not a totp URI`);
    secret = url.searchParams.get('secret') ?? '';
    const d = url.searchParams.get('digits');
    const p = url.searchParams.get('period');
    const a = (url.searchParams.get('algorithm') ?? 'SHA1').toUpperCase().replace('-', '');
    if (d !== null) digits = Number(d);
    if (p !== null) period = Number(p);
    if (a === 'SHA1') algorithm = 'SHA-1';
    else if (a === 'SHA256') algorithm = 'SHA-256';
    else if (a === 'SHA512') algorithm = 'SHA-512';
    else throw new Error(`{{totp:${name}}}: the otpauth URI in ${name} names an unsupported algorithm`);
    if (!Number.isInteger(digits) || digits < 6 || digits > 10) throw new Error(`{{totp:${name}}}: the otpauth URI in ${name} has an invalid digits value`);
    if (!Number.isInteger(period) || period < 1) throw new Error(`{{totp:${name}}}: the otpauth URI in ${name} has an invalid period`);
  }
  const clean = secret.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let acc = 0;
  for (const ch of clean) {
    const v = BASE32.indexOf(ch);
    if (v < 0) throw new Error(`{{totp:${name}}}: the environment variable ${name} is not a valid base32 TOTP secret`);
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >>> bits) & 0xff);
    }
  }
  if (!bytes.length) throw new Error(`{{totp:${name}}}: the environment variable ${name} holds no TOTP secret`);
  return { key: new Uint8Array(bytes), digits, period, algorithm };
}

/** The code for time step `counter` (RFC 4226 dynamic truncation). */
export async function hotpCode(seed: TotpSeed, counter: number): Promise<string> {
  const message = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    message[i] = c % 256;
    c = Math.floor(c / 256);
  }
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', seed.key as BufferSource, { name: 'HMAC', hash: seed.algorithm }, false, ['sign']);
  const mac = new Uint8Array(await subtle.sign('HMAC', key, message as BufferSource));
  const at = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[at] & 0x7f) << 24) | (mac[at + 1] << 16) | (mac[at + 2] << 8) | mac[at + 3];
  return String(bin % 10 ** seed.digits).padStart(seed.digits, '0');
}

/**
 * The code to type NOW for the seed in `value` (the variable `name`). When
 * fewer than `edgeMs` remain in the current window it first waits for the
 * next window: a code generated at 29.5 s would reach the server expired.
 */
export async function totpCode(value: string | undefined, name: string, clock: TotpClock = SYSTEM_CLOCK, edgeMs = TOTP_EDGE_MS): Promise<string> {
  if (!value) {
    throw new Error(`{{totp:${name}}} cannot be resolved — the environment variable ${name} is not set where this runs. Set it to the account's base32 TOTP secret (or otpauth:// URI).`);
  }
  const seed = totpSeed(value, name);
  const periodMs = seed.period * 1000;
  let now = clock.now();
  const left = periodMs - (now % periodMs);
  if (left < edgeMs) {
    await clock.sleep(left + 50);
    now = clock.now();
  }
  return hotpCode(seed, Math.floor(now / periodMs));
}

/**
 * Every `{{totp:NAME}}` in a RUN-TIME value replaced by its current code —
 * the artifact's twin of the daemon's dispatch-time resolution, for a marker
 * that reaches an action through a slot (a flow step's param bound to
 * `{{totp:NAME}}`), which the emitter cannot see in the recorded text.
 */
export async function totpMarkersIn(text: string, clock?: TotpClock): Promise<string> {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(/\{\{totp:(\w+)\}\}/g)) {
    const at = m.index ?? 0;
    out += text.slice(last, at) + (await totpCode(process.env[m[1]], m[1], clock));
    last = at + m[0].length;
  }
  return out + text.slice(last);
}
