import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hotpCode, totpCode, totpMarkersIn, totpSeed, type TotpClock } from '../src/execution/totp.js';
import { clearSecretLedger, hasSecretMarker, resolveSecretsAsync, resolveSecretsDeepAsync, scrubSecrets } from '../src/shared/secrets.js';
import { unfilledStepVerdict, unresolvedArgMarkers } from '../src/execution/gates.js';

/**
 * `{{totp:NAME}}`: the current RFC 6238 code for the seed in NAME, generated
 * at dispatch and only there (src/execution/totp.ts, shared with the compiled
 * artifact; src/shared/secrets.ts for the daemon).
 */

/** A clock that stands still at `ms` and advances only when slept on. */
function fixedClock(ms: number): TotpClock & { slept: number[] } {
  let now = ms;
  const slept: number[] = [];
  return {
    slept,
    now: () => now,
    sleep: async (d) => {
      slept.push(d);
      now += d;
    },
  };
}

const b32 = (ascii: string): string => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of Buffer.from(ascii)) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
};

// RFC 6238 appendix B. The seeds are the ASCII strings the RFC uses, one per hash.
const SHA1 = b32('12345678901234567890');
const SHA256 = b32('12345678901234567890123456789012');
const SHA512 = b32('1234567890123456789012345678901234567890123456789012345678901234');
const VECTORS: Array<[number, string, string, string]> = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
];

describe('totp: RFC 6238 test vectors', () => {
  it('the SHA-1 seed decodes to the base32 the spec names', () => {
    expect(SHA1).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it('SHA-1, 6 digits (the default): T=59 is 287082, and the rest of the table', async () => {
    for (const [t, sha1] of VECTORS) {
      expect(await totpCode(SHA1, 'SEED', fixedClock(t * 1000), 0)).toBe(sha1.slice(2));
    }
  });

  it('8 digits and SHA-256 / SHA-512 through an otpauth URI', async () => {
    const uri = (secret: string, algorithm: string) => `otpauth://totp/Bench:user?secret=${secret}&issuer=Bench&digits=8&period=30&algorithm=${algorithm}`;
    for (const [t, sha1, sha256, sha512] of VECTORS) {
      const clock = () => fixedClock(t * 1000);
      expect(await totpCode(uri(SHA1, 'SHA1'), 'SEED', clock(), 0)).toBe(sha1);
      expect(await totpCode(uri(SHA256, 'SHA256'), 'SEED', clock(), 0)).toBe(sha256);
      expect(await totpCode(uri(SHA512, 'SHA512'), 'SEED', clock(), 0)).toBe(sha512);
    }
  });

  it('reads a seed the way an authenticator shows it: lower case, spaced, padded', async () => {
    const shown = SHA1.toLowerCase().replace(/(.{4})/g, '$1 ') + '====';
    expect(await hotpCode(totpSeed(shown, 'SEED'), 1)).toBe('287082');
  });
});

describe('totp: the window edge', () => {
  it('generates at once with time to spare', async () => {
    const clock = fixedClock(59_000 - 20_000); // 39 s: 21 s left in window 1
    expect(await totpCode(SHA1, 'SEED', clock)).toBe(await hotpCode(totpSeed(SHA1, 'SEED'), 1));
    expect(clock.slept).toEqual([]);
  });

  it('waits out the last seconds of a window and types the NEXT window\'s code', async () => {
    const clock = fixedClock(59_000); // 1 s left in window 1
    const code = await totpCode(SHA1, 'SEED', clock);
    expect(clock.slept).toEqual([1_050]);
    expect(code).toBe(await hotpCode(totpSeed(SHA1, 'SEED'), 2));
    expect(code).not.toBe('287082');
  });
});

describe('totp: refusals name the variable, never the value', () => {
  it('an unset or empty variable', async () => {
    await expect(totpCode(undefined, 'BENCH_TOTP')).rejects.toThrow(/BENCH_TOTP is not set/);
    await expect(totpCode('', 'BENCH_TOTP')).rejects.toThrow(/BENCH_TOTP is not set/);
  });

  it('a seed that is not base32', async () => {
    const bad = 'not-a-seed-1189!';
    const err = await totpCode(bad, 'BENCH_TOTP').catch((e: Error) => e);
    expect(String(err)).toMatch(/BENCH_TOTP is not a valid base32 TOTP secret/);
    expect(String(err)).not.toContain(bad);
  });

  it('an otpauth URI that is not a TOTP one, or names an unknown algorithm', () => {
    expect(() => totpSeed(`otpauth://hotp/x?secret=${SHA1}`, 'BENCH_TOTP')).toThrow(/BENCH_TOTP is not a totp URI/);
    expect(() => totpSeed(`otpauth://totp/x?secret=${SHA1}&algorithm=MD5`, 'BENCH_TOTP')).toThrow(/unsupported algorithm/);
  });
});

describe('totp at dispatch (the daemon path)', () => {
  let had: string | undefined;
  beforeEach(() => {
    had = process.env.BENCH_TOTP;
    process.env.BENCH_TOTP = SHA1;
    clearSecretLedger();
  });
  afterEach(() => {
    if (had === undefined) delete process.env.BENCH_TOTP;
    else process.env.BENCH_TOTP = had;
    clearSecretLedger();
  });

  it('resolves the marker to the current code, leaving the recorded args as they were', async () => {
    const args = { target: '@e3', value: '{{totp:BENCH_TOTP}}' };
    expect(hasSecretMarker(args.value)).toBe(true);
    const live = await resolveSecretsDeepAsync(args, fixedClock(59_000 - 10_000));
    expect(live.value).toBe('287082');
    expect(args.value).toBe('{{totp:BENCH_TOTP}}');
    expect(await resolveSecretsAsync('code {{totp:BENCH_TOTP}} ok', fixedClock(59_000 - 10_000))).toBe('code 287082 ok');
  });

  it('scrubs every code it generated from later results, for the session', async () => {
    await resolveSecretsAsync('{{totp:BENCH_TOTP}}', fixedClock(20_000)); // window 0
    const second = await resolveSecretsAsync('{{totp:BENCH_TOTP}}', fixedClock(59_000 - 10_000)); // window 1
    const first = await hotpCode(totpSeed(SHA1, 'X'), 0);
    expect(scrubSecrets(`typed ${second}; earlier ${first}`)).toBe('typed {{totp:BENCH_TOTP}}; earlier {{totp:BENCH_TOTP}}');
  });

  it('resolves env and totp markers side by side', async () => {
    process.env.BENCH_PW_T = 'pw-side-by-side';
    try {
      expect(await resolveSecretsAsync('{{env:BENCH_PW_T}}/{{totp:BENCH_TOTP}}', fixedClock(49_000))).toBe('pw-side-by-side/287082');
    } finally {
      delete process.env.BENCH_PW_T;
    }
  });

  it('the artifact\'s run-time twin gives the same code for a marker a slot carried', async () => {
    expect(await totpMarkersIn('{{totp:BENCH_TOTP}}', fixedClock(49_000))).toBe('287082');
    expect(await totpMarkersIn('no marker', fixedClock(49_000))).toBe('no marker');
  });

  it('is no unresolved reference to the step gate, and an unset seed is refused by name', () => {
    expect(unresolvedArgMarkers({ value: '{{v3}}' }, { v3: '{{totp:BENCH_TOTP}}' })).toEqual([]);
    expect(unfilledStepVerdict({ args: { value: '{{v3}}' } }, { v3: '{{totp:BENCH_TOTP}}' }, 'step 4')).toBeNull();
    delete process.env.BENCH_TOTP;
    expect(unfilledStepVerdict({ args: { value: '{{totp:BENCH_TOTP}}' } }, {}, 'step 4')).toMatch(/^step 4: .*BENCH_TOTP is not set/);
  });
});
