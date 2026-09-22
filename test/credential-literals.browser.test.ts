/**
 * FIX AH through the real tool layer: a fill whose value is a credential in
 * the clear is RECORDED as its marker (the browser still gets the value), an
 * ambiguous value only in a password field, a non-credential value never; the
 * compiled skill and the emitted script carry the marker and require the
 * variable; a page that echoes the value is scrubbed.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/credential-literals.browser.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import { executeTool } from '../src/agent/tools.js';
import type { RecordedStep } from '../src/daemon/recorder.js';
import { clearSecretLedger, markLiteralCredentials } from '../src/shared/secrets.js';
import { compileSkill } from '../src/skills/compile.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

const LOGIN = `<!doctype html><html><head><title>Sign in</title></head><body>
<label for="user">Username</label><input id="user">
<label for="pw">Password</label><input id="pw" type="password">
<label for="site">Site</label><input id="site">
<button id="go" type="button" onclick="document.getElementById('echo').textContent = 'Signed in as ' + document.getElementById('user').value + ' with ' + document.getElementById('pw').value">Sign in</button>
<p id="echo"></p>
</body></html>`;

const VARS = { APP_PASSWORD: 's3cret-pass', APP_ADMIN_PASSWORD: 'admin', APP_EMAIL: 'admin', APP_URL: 'http://localhost:3000' };

d('literal credentials at the tool layer', () => {
  let home: string;
  let session: BrowserSession;
  const saved: Record<string, string | undefined> = {};
  const run = (name: string, args: Record<string, unknown>) => executeTool(session, name, args, os.tmpdir());
  const recordedFills = () => session.script!.entries.filter((e): e is RecordedStep => e.k === 'step' && e.tool === 'fill');

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-literal-'));
    process.env.SITELOOPER_HOME = home;
    for (const [k, v] of Object.entries(VARS)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    clearSecretLedger();
    session = new BrowserSession({ session: 'literal-credentials', persist: false, learn: true });
    const page = await session.getPage();
    const file = path.join(home, 'login.html');
    fs.writeFileSync(file, LOGIN);
    await page.goto(pathToFileURL(file).href);
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    delete process.env.SITELOOPER_HOME;
    clearSecretLedger();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('records a password typed in the clear as its marker, compiles to a script that requires the variable, and scrubs the echo', async () => {
    const page = await session.getPage();
    const recorder = session.script!;
    const mark = recorder.mark();
    // What server.ts's `do` does with a shell-expanded instruction.
    const instruction = markLiteralCredentials('sign in as ada with password s3cret-pass').text;
    expect(instruction).toBe('sign in as ada with password {{env:APP_PASSWORD}}');
    recorder.beginInstruction(instruction, { url: page.url() });
    await run('fill', { target: '#user', value: 'ada' });
    await run('fill', { target: '#pw', value: 's3cret-pass' });
    expect(await page.inputValue('#pw')).toBe('s3cret-pass');
    const pw = recordedFills().at(-1)!;
    expect(pw.args.value).toBe('{{env:APP_PASSWORD}}');
    expect(JSON.stringify(recorder.entriesSince(mark))).not.toContain('s3cret-pass');

    await run('click', { target: '#go' });
    const read = await run('read', { target: '#echo', what: 'text' });
    expect(read.result).toContain('{{env:APP_PASSWORD}}');
    expect(read.result).not.toContain('s3cret-pass');

    const skill = compileSkill({ entries: recorder.entriesSince(mark), instruction, report: { status: 'success', summary: 'signed in' }, session: 'literal-credentials' })!;
    expect(skill).toBeTruthy();
    expect(JSON.stringify(skill)).not.toContain('s3cret-pass');
    const params = Object.fromEntries(Object.entries(skill.params).map(([k, p]) => [k, String(p.example ?? '')]));
    const spec: SpecFlow = {
      version: 1, name: 'login', origin: skill.origin, startUrl: skill.preconditions.urlPattern, vars: [],
      steps: [{ id: '01-sign-in', instruction, params, outputs: [], segments: [{ id: skill.id, template: skill.template, params: skill.params, preconditions: skill.preconditions, steps: skill.steps }] }],
    };
    const { source } = emitFlowFile(spec, { tier: 'plain' });
    expect(source).toContain('export const requiredEnvNames = ["APP_PASSWORD"] as const;');
    expect(source).not.toContain('s3cret-pass');
  }, 60_000);

  it('an ambiguous value (also a non-credential variable) is rewritten only in the password field', async () => {
    await run('fill', { target: '#user', value: 'admin' });
    expect(recordedFills().at(-1)!.args.value).toBe('admin');
    await run('fill', { target: '#pw', value: 'admin' });
    expect(recordedFills().at(-1)!.args.value).toBe('{{env:APP_ADMIN_PASSWORD}}');
    const page = await session.getPage();
    expect(await page.inputValue('#pw')).toBe('admin');
  });

  it('a non-credential variable is never rewritten, even into a password field', async () => {
    await run('fill', { target: '#site', value: 'http://localhost:3000' });
    expect(recordedFills().at(-1)!.args.value).toBe('http://localhost:3000');
    await run('fill', { target: '#pw', value: 'http://localhost:3000' });
    expect(recordedFills().at(-1)!.args.value).toBe('http://localhost:3000');
  });
});
