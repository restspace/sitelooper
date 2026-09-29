import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs bench helper
import { resolveEnvRefs } from '../bench/env-refs.mjs';

const env = { APP_PASSWORD: 'bench-admin-pass', OTHER: 'x' };

describe('resolveEnvRefs (agent-browser arm)', () => {
  it('fills the password reference, quoted or bare (abod104-luna typed it verbatim)', () => {
    expect(resolveEnvRefs("agent-browser --session a fill @e2 '{{env:APP_PASSWORD}}'", env)).toBe("agent-browser --session a fill @e2 'bench-admin-pass'");
    expect(resolveEnvRefs('agent-browser --session a fill @e2 {{env:APP_PASSWORD}}', env)).toBe('agent-browser --session a fill @e2 bench-admin-pass');
  });
  it('leaves names outside the allowed list, unset names and other text alone', () => {
    expect(resolveEnvRefs('x {{env:OTHER}} {{APP_EMAIL}}', env)).toBe('x {{env:OTHER}} {{APP_EMAIL}}');
    expect(resolveEnvRefs('x {{env:APP_PASSWORD}}', {})).toBe('x {{env:APP_PASSWORD}}');
  });
  it('refuses a value with shell metacharacters rather than splicing it', () => {
    expect(() => resolveEnvRefs('x {{env:APP_PASSWORD}}', { APP_PASSWORD: 'a;rm -rf /' })).toThrow(/metacharacters/);
  });
});
