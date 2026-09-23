import { beforeEach, describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
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

  /**
   * fwrd85: the shell's PWD (`/home/user/sitelooper`) was read as a password,
   * the cwd inside recorded screenshot paths became `{{env:PWD}}`, and the
   * artifact required PWD — unset under PowerShell and on many CI runners.
   * The credential word must END the name, and the short forms need a
   * prefix (DB_PWD, DB_PASS); a value that is a filesystem path is never one.
   */
  it('never takes the shell, a pointer to a secret, or a path for the secret itself', () => {
    const names = credentialVars({
      PWD: '/home/user/sitelooper', OLDPWD: '/home/user', PASS: 'bare-pass-1', DB_PWD: 'db-secret-1',
      GITHUB_TOKEN_URL: 'https://example.test/token', GPG_TTY: '/dev/pts/0', XDG_RUNTIME_DIR: '/run/user/1000',
      PASSWORD_STORE_DIR: '/home/user/.password-store', SSH_KEY_FILE: '/home/user/.ssh/id', GPG_PRIVATE_KEYFILE: 'keys.asc',
      SSH_AUTH_SOCK: '/tmp/ssh-agent.sock', APP_PASSWORD: os.tmpdir(), WIN_PASSWORD: path.join(os.tmpdir(), '.'),
      SECRET_KEY: 'django-secret-1',
    }).map((v) => v.name);
    expect(names.sort()).toEqual(['DB_PWD', 'SECRET_KEY']);
  });

  it('a value equal to the working directory is never a credential', () => {
    expect(credentialVars({ APP_TOKEN: process.cwd() })).toEqual([]);
  });

  /**
   * A path is excluded only when it EXISTS here. `/Xy9!abc` is shaped like a
   * path and is almost certainly a password: excluding every path-SHAPED
   * value would leak it silently.
   */
  it('a path-shaped value that does not exist IS a credential, and is rewritten', () => {
    for (const value of ['/Xy9!abc', '~/Xy9!abc-no-such', 'C:\\Xy9!abc-no-such', '\\\\nohost-xy9\\share']) {
      const env = { APP_PASSWORD: value };
      expect(credentialVars(env).map((v) => v.name), value).toEqual(['APP_PASSWORD']);
      expect(markLiteralCredentialValue(value, false, env).value).toBe('{{env:APP_PASSWORD}}');
    }
    const env = { APP_PASSWORD: '/Xy9!abc' };
    expect(rewriteLiteralCredentials({ params: { v2: '/Xy9!abc' } }, env)).toEqual({ value: { params: { v2: '{{env:APP_PASSWORD}}' } }, names: ['APP_PASSWORD'] });
  });

  it('a password variable set to a directory that exists here is not a credential', () => {
    const env = { APP_PASSWORD: os.tmpdir() };
    expect(credentialVars(env)).toEqual([]);
    expect(markLiteralCredentialValue(os.tmpdir(), true, env).value).toBe(os.tmpdir());
    expect(rewriteLiteralCredentials({ path: `${os.tmpdir()}` }, env).names).toEqual([]);
  });
});

describe('PWD in a recorded screenshot path (fwrd85)', () => {
  const env = { PWD: '/home/user/sitelooper', APP_PASSWORD: 'bench-pass-1234', DB_PWD: 'db-secret-1' };
  const spec = {
    steps: [{
      instruction: 'sign in, then screenshot to /home/user/sitelooper/shots/a.png',
      params: { v1: 'bench-pass-1234', v2: 'db-secret-1' },
      segments: [{ steps: [{ tool: 'screenshot', args: { path: '/home/user/sitelooper/shots/a.png' } }] }],
    }],
  };

  it('rewrites the passwords, never the path, and never names PWD', () => {
    const out = rewriteLiteralCredentials(spec, env);
    expect(out.names).toEqual(['APP_PASSWORD', 'DB_PWD']);
    expect(JSON.stringify(out.value)).toContain('/home/user/sitelooper/shots/a.png');
    expect(JSON.stringify(out.value)).not.toContain('{{env:PWD}}');
    expect(literalCredentialsIn(spec, env)).not.toContain('PWD');
    expect(markLiteralCredentials('save to /home/user/sitelooper/out', env).text).toBe('save to /home/user/sitelooper/out');
  });

  it('never puts the path on the scrub ledger', () => {
    markLiteralCredentials('password bench-pass-1234 in /home/user/sitelooper', env);
    expect(scrubSecrets('wrote /home/user/sitelooper/shots/a.png')).toBe('wrote /home/user/sitelooper/shots/a.png');
  });

  it('the compiled script does not require PWD', () => {
    const flow: SpecFlow = {
      version: 1, name: 'shots', origin: 'http://app.test', startUrl: 'http://app.test/', vars: [],
      steps: [{
        id: '01-shot', instruction: 'screenshot', params: {}, outputs: [],
        segments: [{ id: 's_shot', template: 'screenshot', params: {}, preconditions: { urlPattern: 'http://app.test/' }, steps: [{ tool: 'screenshot', args: { path: '/home/user/sitelooper/shots/a.png' }, locators: {} }] }],
      }],
    };
    const had = process.env.PWD;
    process.env.PWD = '/home/user/sitelooper';
    try {
      const { value } = rewriteLiteralCredentials(flow, env);
      const { source } = emitFlowFile(value, { tier: 'plain' });
      expect(source).toContain('export const requiredEnvNames = [] as const;');
    } finally {
      if (had === undefined) delete process.env.PWD;
      else process.env.PWD = had;
    }
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
