import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const cli = path.resolve('bin/sitelooper.js');
let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.resolve('test/.cli-acceptance-')); });
afterEach(() => {
  expect(path.dirname(dir)).toBe(path.resolve('test'));
  expect(path.basename(dir)).toMatch(/^\.cli-acceptance-/);
  fs.rmSync(dir, { recursive: true, force: true });
});
function run(args: string[], input?: string) {
  const result = spawnSync(process.execPath, [cli, ...args, '--json'], {
    cwd: dir, encoding: 'utf8', input,
    env: { ...process.env, SITELOOPER_HOME: path.join(dir, 'home') }, timeout: 20_000,
  });
  return { ...result, json: JSON.parse(result.stdout) };
}
function bundle(status = 'validated') {
  const file = path.join(dir, 'demo.json');
  fs.writeFileSync(file, JSON.stringify({
    kind: 'sitelooper-flow-bundle', schemaVersion: 1, compiler: { name: 'sitelooper', version: '0.3.0' }, exportedAt: new Date().toISOString(),
    flow: { name: 'demo', origin: 'https://example.test', startUrl: 'https://example.test', vars: [],
      provenance: { session: 'test', created: new Date().toISOString() },
      steps: [{ id: '01-open', instruction: 'open the app', skill: 's_demo', params: {}, outputs: [] }] },
    skills: [{ id: 's_demo', origin: 'https://example.test', template: 'open the app', params: {},
      preconditions: { urlPattern: '.*' }, steps: [{ tool: 'goto', args: { url: 'https://example.test' } }],
      stats: { uses: 4, successes: 1, failedAtStep: { '1': 3 }, lastFailedAt: 1 }, status }],
  }));
  return file;
}

describe('CLI subprocess contracts', () => {
  it('initializes once and reports invalid input as one versioned JSON document', () => {
    const first = run(['init']);
    expect(first.status).toBe(0);
    expect(first.json).toMatchObject({ schemaVersion: 1, stage: 'project', outcome: 'created' });
    const second = run(['init']);
    expect(second.status).toBe(2);
    expect(second.json.error.message).toContain('EEXIST');
    const typo = run(['compile', '--ovewrite-spec']);
    expect(typo.status).toBe(2);
    expect(typo.json.error.message).toContain('unknown option');
  });

  it('compiles a portable bundle without a home store and preserves user assertions', () => {
    const file = bundle();
    const first = run(['compile', file]);
    expect(first.status, first.stderr).toBe(0);
    expect(first.json).toMatchObject({ schemaVersion: 1, stage: 'compiled', outcome: 'compiled' });
    const spec = first.json.specFile;
    fs.appendFileSync(spec, '\n// my business assertion\n');
    const again = run(['compile', file]);
    expect(again.status, again.stderr).toBe(0);
    expect(fs.readFileSync(spec, 'utf8')).toContain('my business assertion');
    expect(run(['compile', file, '--force']).status).toBe(2);
    expect(run(['compile', file, '--overwrite-spec']).status).toBe(0);
    expect(fs.readFileSync(spec, 'utf8')).not.toContain('my business assertion');
  });

  it('allowing a demoted procedure never grants permission to overwrite user code', () => {
    const file = bundle();
    const first = run(['compile', file]);
    fs.appendFileSync(first.json.specFile, '\n// keep this assertion\n');
    bundle('demoted');
    const refused = run(['compile', file, '--overwrite-spec']);
    expect(refused.status).toBe(2);
    expect(refused.json.nextActions[0]).toMatchObject({ command: 'rerecord', args: [file, '01-open'] });
    const allowed = run(['compile', file, '--allow-demoted']);
    expect(allowed.status).toBe(0);
    expect(fs.readFileSync(first.json.specFile, 'utf8')).toContain('keep this assertion');
  });

  it('reports failed setup as unavailable with nonzero exit, never a green check', () => {
    const flow = path.join(dir, 'missing.flow.ts');
    fs.writeFileSync(flow, '// artifact');
    const checked = run(['check', flow]);
    expect(checked.status).toBe(2);
    expect(checked.json).toMatchObject({ schemaVersion: 1, outcome: 'unavailable', specCheck: { ran: false } });
    fs.writeFileSync(path.join(dir, 'missing.spec.ts'), '// scaffold');
    const reset = run(['check', flow, '--reset-cmd', 'exit 7']);
    expect(reset.status).toBe(2);
    expect(reset.json.specCheck.skipped).toContain('reset command exited 7');
  });

  it('rejects empty stdin and conflicting instruction sources before starting a session', () => {
    const empty = run(['do', '--stdin'], ' \n');
    expect(empty.status).toBe(2);
    expect(empty.json.error.message).toContain('empty');
    fs.writeFileSync(path.join(dir, 'instruction.md'), 'Create a record\nand verify it.');
    const conflict = run(['do', 'another ask', '--instruction-file', 'instruction.md']);
    expect(conflict.status).toBe(2);
    expect(conflict.json.error.message).toContain('only once');
    expect(fs.existsSync(path.join(dir, 'home/sessions'))).toBe(false);
  });
  it('reports an already stopped session as structured JSON without starting a browser', () => {
    const session = `stop-${path.basename(dir).replace(/[^a-zA-Z0-9-]/g, '')}`;
    const result = run(['--session', session, 'stop']);
    expect(result.status).toBe(0);
    expect(result.json).toMatchObject({ schemaVersion: 1, stage: 'recorded', sessions: [{ session, status: 'not-running' }] });
  });
  it('accepts a bundle diagnostic rerecord target and validates its step before touching the bundle', () => {
    const file = bundle('demoted');
    const original = fs.readFileSync(file, 'utf8');
    const result = run(['rerecord', file, 'nonexistent-step']);
    expect(result.status).toBe(2);
    expect(result.json.error.message).toContain('has no step');
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
    expect(fs.existsSync(path.join(dir, 'home/sessions'))).toBe(false);
  });
  it('build emits the artifact but refuses readiness before any browser run without fresh-state setup', () => {
    const result = run(['build', bundle()]);
    expect(result.status).toBe(2);
    expect(result.json).toMatchObject({ schemaVersion: 1, outcome: 'blocked', readiness: { executionVerified: false, runs: [] } });
    expect(result.json.readiness.blockers.join(' ')).toContain('fixtureIsolation');
    expect(fs.existsSync(result.json.compilation.flowFile)).toBe(true);
  });
});
