import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs bench helper
import { bodyRetryReason } from '../bench/or-errors.mjs';

describe('bodyRetryReason (harness model calls)', () => {
  it('retries an upstream rate limit sent as a 200 body (abec17-sol, abod104-sol, absi31-sol)', () => {
    const body = { id: 'gen-1', error: { message: 'openai/gpt-6.1-sol is temporarily rate-limited upstream.', code: 429, metadata: { error_type: 'rate_limit_exceeded' } } };
    expect(bodyRetryReason(body)).toMatch(/^body error 429: openai\/gpt-6\.1-sol is temporarily rate-limited/);
    expect(bodyRetryReason({ error: { code: 502, message: 'bad gateway' } })).toMatch(/^body error 502/);
  });
  it('does not retry a normal reply, a request fault or a non-object', () => {
    expect(bodyRetryReason({ choices: [{ message: { content: 'ok' } }] })).toBeNull();
    expect(bodyRetryReason({ error: { code: 400, message: 'invalid request' } })).toBeNull();
    expect(bodyRetryReason({ choices: [{ message: {} }], error: { code: 429 } })).toBeNull();
    expect(bodyRetryReason({ choices: [], error: { code: 429 } })).toMatch(/^body error 429/);
    expect(bodyRetryReason(null)).toBeNull();
  });
});
