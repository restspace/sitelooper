/**
 * Phase A hygiene, stage 0: what an eval RETURNED is kept on the recorded
 * step as `evalResult`. Until now the recorder kept `result` only for read and
 * read_all, so nobody could tell afterwards what the model learned by eval:
 * fwgt10's seed titles, fwsi7's "Click here to view" href and fwec12's
 * API-fetched ids were all inferred from the expression text.
 *
 * It is audit data and nothing else. It is size-bounded; a credential in it is
 * rewritten to its marker, or the result is withheld when the credential is
 * ambiguous; and it is NOT `result`, which ledger.ts shownIn, flow.ts
 * shownBefore/textMints and the read-back cascade all read. The fwsi7 and
 * fwrd85 invariants are in test/goto-landing.test.ts and
 * test/text-mint.test.ts.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EVAL_RESULT_MAX_CHARS, EVAL_RESULT_WITHHELD, evalResultForRecord } from '../src/daemon/eval-result.js';
import { ScriptRecorder } from '../src/daemon/recorder.js';
import { clearSecretLedger, markLiteralCredentialValue } from '../src/shared/secrets.js';

let tmpHome: string;
beforeAll(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-evalresult-'));
  process.env.SITELOOPER_HOME = tmpHome;
});
afterAll(() => {
  delete process.env.SITELOOPER_HOME;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});
afterEach(() => clearSecretLedger());

const mk = (tool: string, args: Record<string, unknown>) => ({ k: 'step' as const, tool, args, locators: {} });
const HREF = '["http://127.0.0.1:8098/hardware/4"]';

describe('the recorder keeps what an eval returned, as evalResult only', () => {
  it('an eval step carries evalResult and no result; a read keeps result and no evalResult', () => {
    const rec = new ScriptRecorder('evalresult');
    rec.commit(mk('eval', { expression: "[...document.querySelectorAll('a')].map(a => a.href)" }), HREF);
    rec.commit(mk('read', { target: '@e1', what: 'text' }), '"seen"');
    rec.commit(mk('click', { target: '@e1' }), 'clicked');
    // seq/t are recorder stage 0's stamps (step-evidence.ts), not this test's subject.
    const unstamped = rec.entries.map(({ seq: _s, t: _t, ...rest }) => rest);
    expect(unstamped).toEqual([
      { ...mk('eval', { expression: "[...document.querySelectorAll('a')].map(a => a.href)" }), evalResult: HREF },
      { ...mk('read', { target: '@e1', what: 'text' }), result: '"seen"' },
      mk('click', { target: '@e1' }),
    ]);
    // And it survives a reload from script.jsonl.
    expect(new ScriptRecorder('evalresult').entries[0]).toEqual(rec.entries[0]);
  });

  it('is bounded: a body dump keeps its head and says how much it cut', () => {
    const big = JSON.stringify('x'.repeat(10_000));
    const kept = evalResultForRecord(big, {});
    expect(kept.length).toBeLessThanOrEqual(EVAL_RESULT_MAX_CHARS + 40);
    expect(kept.startsWith(big.slice(0, EVAL_RESULT_MAX_CHARS))).toBe(true);
    expect(kept).toMatch(/… \(\+8002 chars\)$/);
    expect(evalResultForRecord('"short"', {})).toBe('"short"');
  });

  it('never holds a credential: an unambiguous one becomes its marker', () => {
    const env = { APP_PASSWORD: 's3cret-pass', APP_URL: 'http://localhost:3000' };
    expect(evalResultForRecord('{"pw":"s3cret-pass","user":"ada"}', env)).toBe('{"pw":"{{env:APP_PASSWORD}}","user":"ada"}');
  });

  it('never holds a credential: an ambiguous one withholds the whole result', () => {
    // odoo's `admin` is both APP_PASSWORD and the login (APP_EMAIL): which one
    // a bare "admin" is cannot be told from a string, so nothing is kept.
    const env = { APP_PASSWORD: 'admin', APP_EMAIL: 'admin' };
    expect(evalResultForRecord('{"user":"admin","fields":3}', env)).toBe(EVAL_RESULT_WITHHELD);
    expect(evalResultForRecord('{"fields":3}', env)).toBe('{"fields":3}');
  });

  it('a secret the session resolved from a marker is scrubbed, as a tool result is', () => {
    // markLiteralCredentialValue banks the value in the scrub ledger, as a
    // marker-bearing fill does at dispatch.
    markLiteralCredentialValue('s3cret-pass', true, { APP_PASSWORD: 's3cret-pass' });
    expect(evalResultForRecord('"typed s3cret-pass"', {})).toBe('"typed {{env:APP_PASSWORD}}"');
  });

  it('the recorder applies all of it', () => {
    const saved = process.env.APP_PASSWORD;
    process.env.APP_PASSWORD = 's3cret-pass';
    try {
      const rec = new ScriptRecorder('evalresult-secret');
      rec.commit(mk('eval', { expression: "document.querySelector('#pw').value" }), '"s3cret-pass"');
      expect(rec.entries[0]).toMatchObject({ evalResult: '"{{env:APP_PASSWORD}}"' });
      expect(fs.readFileSync(path.join(tmpHome, 'sessions', 'evalresult-secret', 'script.jsonl'), 'utf8')).not.toContain('s3cret-pass');
    } finally {
      if (saved === undefined) delete process.env.APP_PASSWORD;
      else process.env.APP_PASSWORD = saved;
    }
  });
});
