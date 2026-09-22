import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSecretLedger,
  credentialVars,
  literalCredentialsIn,
  markLiteralCredentialValue,
  markLiteralCredentials,
  scrubSecrets,
  rewriteLiteralCredentials,
  ambiguousCredentialsIn,
} from '../src/shared/secrets.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';
import type { SkillStep } from '../src/skills/store.js';
import { liveLines, unfilledSlot } from '../src/execution/expect.js';

/**
 * FIX AH (round 47). A credential that arrives as ITSELF — fwrd83's shell
 * expanded `$APP_PASSWORD` inside double quotes, fwod79's model typed
 * "password 'admin'" — is turned back into its `{{env:NAME}}` marker before
 * any model, recorder or store sees it. The environment says what is a
 * credential, by the variable's NAME; a value a non-credential variable holds
 * too is ambiguous and only ever rewritten in a password field.
 */
const ENV = { APP_PASSWORD: 's3cret-pass', APP_USER: 'ada', APP_URL: 'http://localhost:3000', PATH: '/usr/bin' };

beforeEach(() => clearSecretLedger());

describe('which variables are credentials', () => {
  it('reads the NAME, by segment', () => {
    const names = credentialVars({
      APP_PASSWORD: 'aaaa1', GH_TOKEN: 'bbbb2', OPENAI_API_KEY: 'cccc3', APP_TOTP: 'dddd4', DB_PASS: 'eeee5', CLIENT_SECRET: 'ffff6',
      PASSENGER_URL: 'gggg7', SORT_KEY: 'hhhh8', APP_EMAIL: 'iiii9', SHORT_PASSWORD: 'abc',
    }).map((v) => v.name);
    expect(names.sort()).toEqual(['APP_PASSWORD', 'APP_TOTP', 'CLIENT_SECRET', 'DB_PASS', 'GH_TOKEN', 'OPENAI_API_KEY']);
  });
});

describe('a `do` instruction', () => {
  it('records the marker, not the password a shell expanded into it', () => {
    const out = markLiteralCredentials('sign in as ada with password s3cret-pass and open the dashboard', ENV);
    expect(out.text).toBe('sign in as ada with password {{env:APP_PASSWORD}} and open the dashboard');
    expect(out.names).toEqual(['APP_PASSWORD']);
  });

  it('never rewrites a non-credential variable, nor a value inside a longer token', () => {
    const text = 'open http://localhost:3000 and search for s3cret-passage';
    expect(markLiteralCredentials(text, ENV).text).toBe(text);
  });

  it('never rewrites an AMBIGUOUS value in prose (odoo: admin is the password and the login)', () => {
    const env = { APP_PASSWORD: 'admin', APP_EMAIL: 'admin' };
    expect(markLiteralCredentials("sign in as admin with password 'admin'", env).text).toBe("sign in as admin with password 'admin'");
  });

  it('puts the value on the scrub ledger, so a page echoing it is scrubbed', () => {
    expect(scrubSecrets('Welcome back — your password s3cret-pass')).toContain('s3cret-pass');
    markLiteralCredentials('password s3cret-pass', ENV);
    expect(scrubSecrets('Welcome back — your password s3cret-pass')).toBe('Welcome back — your password {{env:APP_PASSWORD}}');
  });
});

describe('a fill/type value', () => {
  it('a whole value equal to an unambiguous credential is its marker, in any field', () => {
    expect(markLiteralCredentialValue('s3cret-pass', false, ENV).value).toBe('{{env:APP_PASSWORD}}');
  });

  it('an ambiguous value is rewritten ONLY in a password field, and never scrubbed', () => {
    const env = { APP_PASSWORD: 'admin', APP_EMAIL: 'admin' };
    expect(markLiteralCredentialValue('admin', false, env).value).toBe('admin');
    expect(markLiteralCredentialValue('admin', true, env).value).toBe('{{env:APP_PASSWORD}}');
    expect(scrubSecrets('Signed in as admin')).toBe('Signed in as admin');
  });

  it('a non-credential variable is never rewritten', () => {
    expect(markLiteralCredentialValue('http://localhost:3000', true, ENV).value).toBe('http://localhost:3000');
  });
});

describe('compile and export: a credential in the clear', () => {
  const specWith = (value: string, params: Record<string, string>): SpecFlow => {
    const step: SkillStep = { tool: 'fill', args: { target: '@e2', value }, locators: { target: [{ kind: 'css', selector: '#password' }] } };
    return {
      version: 1, name: 'login', origin: 'http://app.test', startUrl: 'http://app.test/', vars: [],
      steps: [{
        id: '01-sign-in', instruction: 'sign in', params, outputs: [],
        segments: [{ id: 's_login', template: 'sign in with {{v2}}', params: { v2: { example: 'x', usedIn: [1] } }, preconditions: { urlPattern: 'http://app.test/' }, steps: [step] }],
      }],
    };
  };

  it('names the variable whose value a flow param or a recorded fill carries, never the value', () => {
    expect(literalCredentialsIn(specWith('{{v2}}', { v2: 's3cret-pass' }), ENV)).toEqual(['APP_PASSWORD']);
    expect(literalCredentialsIn(specWith('s3cret-pass', {}), ENV)).toEqual(['APP_PASSWORD']);
    expect(literalCredentialsIn(specWith('{{v2}}', { v2: '{{env:APP_PASSWORD}}' }), ENV)).toEqual([]);
    // ambiguous values are not judged here: `admin` is also a login
    expect(literalCredentialsIn(specWith('{{v2}}', { v2: 'admin' }), { APP_PASSWORD: 'admin', APP_EMAIL: 'admin' })).toEqual([]);
  });

  it('the rewritten recording compiles to a script that REQUIRES the variable and carries no value', () => {
    // What the flow holds once `do "… password s3cret-pass"` was rewritten: the marker.
    const spec = specWith('{{v2}}', { v2: markLiteralCredentials('s3cret-pass', ENV).text });
    const { source } = emitFlowFile(spec, { tier: 'plain' });
    expect(source).toContain('export const requiredEnvNames = ["APP_PASSWORD"] as const;');
    expect(source).not.toContain('s3cret-pass');
  });
});

describe('recorded page changes carrying a secret marker (fwgh9)', () => {
  it('look for the marker as the wildcard, never as text the page cannot show', () => {
    expect(liveLines(['- textbox "Password": {{env:APP_PASSWORD}}', '- text: Code {{totp:APP_TOTP}} accepted'], {})).toEqual([
      '- textbox "Password": {{*}}',
      '- text: Code {{*}} accepted',
    ]);
    // through a param bound to a marker, too
    expect(liveLines(['- textbox "Password": {{v2}}'], { v2: '{{env:APP_PASSWORD}}' })).toEqual(['- textbox "Password": {{*}}']);
    expect(unfilledSlot(liveLines(['- banner: {{env:APP_PASSWORD}}'], {})[0])).toBe(false);
  });
});

describe('the compiler repairs a credential in the clear (round 48)', () => {
  it('rewrites every unambiguous token to its marker, non-mutating, naming only the variable', () => {
    const spec = { steps: [{ instruction: 'sign in with s3cret-pass', params: { v2: 's3cret-pass', v3: 's3cret-passage' } }] };
    const out = rewriteLiteralCredentials(spec, ENV);
    expect(out.names).toEqual(['APP_PASSWORD']);
    expect(out.value.steps[0].instruction).toBe('sign in with {{env:APP_PASSWORD}}');
    expect(out.value.steps[0].params).toEqual({ v2: '{{env:APP_PASSWORD}}', v3: 's3cret-passage' });
    expect(spec.steps[0].params.v2).toBe('s3cret-pass');
  });

  it('leaves an ambiguous value, and reports it separately', () => {
    const env = { APP_PASSWORD: 'admin', APP_EMAIL: 'admin' };
    const spec = { params: { v1: 'admin' } };
    expect(rewriteLiteralCredentials(spec, env)).toEqual({ value: spec, names: [] });
    expect(ambiguousCredentialsIn(spec, env)).toEqual(['APP_PASSWORD']);
  });
});
