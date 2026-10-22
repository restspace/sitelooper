import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/mcp/server.js';
import { TOOL_NAMES, cliResult, slim } from '../src/mcp/tools.js';

const stub = path.resolve('test/fixture/mcp-stub-cli.mjs');
const clients: Client[] = [];

async function connect(opts: { allowResetCmd?: boolean } = {}) {
  const { server } = createMcpServer({ cliPath: stub, allowResetCmd: opts.allowResetCmd ?? false });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientSide);
  clients.push(client);
  return client;
}

afterEach(async () => {
  for (const c of clients.splice(0)) await c.close();
  delete process.env.STUB_PIDFILE;
  delete process.env.TEST_FAKE_API_KEY;
});

type Result = { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; isError?: boolean };

function text(r: Result): string {
  return r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n\n');
}

/** The stub's echo (or a job view): the first JSON document after the summary line. */
function echo(r: Result): any {
  const t = text(r);
  const start = t.indexOf('\n\n{');
  const end = t.indexOf('\n\nstderr (last lines)', start);
  return JSON.parse(t.slice(start + 2, end < 0 ? undefined : end).split('\n\nsitelooper ')[0]);
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  return (await client.callTool({ name, arguments: args })) as Result;
}

const S = ['--session', 'default'];

describe('sitelooper MCP server', () => {
  it('lists exactly the contracted tools, with descriptions', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const t of tools) expect(t.description!.length).toBeGreaterThan(30);
    const doTool = tools.find((t) => t.name === 'do')!;
    expect(doTool.description).toContain('{{env:NAME}}');
    expect(doTool.description).toMatch(/one verifiable outcome/i);
    expect(tools.find((t) => t.name === 'assert')!.description).toContain('{{env:NAME}}');
    for (const n of ['build_start', 'check', 'repair_propose', 'rerecord']) expect(tools.find((t) => t.name === n)!.description).toContain('job_status');
    // No tool takes an API key, a shell override or --force.
    for (const t of tools) {
      const props = Object.keys((t.inputSchema as { properties?: object }).properties ?? {});
      expect(props.some((p) => /key|token|force|shell|reset/i.test(p))).toBe(false);
    }
  });

  const cases: Array<[string, Record<string, unknown>, string[], string | null]> = [
    ['open', { url: 'http://app.test/', learn: true, headed: true, session: 't1' }, ['--session', 't1', '--learn', '--headed', 'open', 'http://app.test/', '--json', '--progress'], null],
    ['open', { url: 'http://app.test/' }, [...S, 'open', 'http://app.test/', '--json', '--progress'], null],
    ['do', { instruction: 'sign in with {{env:APP_PASSWORD}} and see "$0.00"', timeout_s: 90, max_turns: 12 }, [...S, 'do', '--stdin', '--json', '--progress', '--timeout', '90', '--max-turns', '12'], 'sign in with {{env:APP_PASSWORD}} and see "$0.00"'],
    ['assert', { condition: 'the list shows "k7 Demo"', timeout_s: 30, session: 't2' }, ['--session', 't2', 'assert', '--stdin', '--json', '--progress', '--timeout', '30'], 'the list shows "k7 Demo"'],
    ['set_var', { name: 'runid', value: 'demo x=1' }, [...S, 'var', 'runid=demo x=1', '--json'], null],
    ['peek', { selector: '#main', interactive: true }, [...S, 'peek', '--selector', '#main', '--interactive', '--json'], null],
    ['peek', {}, [...S, 'peek', '--json'], null],
    ['list_flows', {}, ['flow', 'list', '--json'], null],
    ['check', { flow_file: 'tests/a.flow.ts', vars: { runid: 'r{n}' } }, ['check', 'tests/a.flow.ts', '--var', 'runid=r{n}', '--json', '--progress'], null],
    ['repair_apply', { proposal_file: 'p.json' }, ['repair', 'apply', 'p.json', '--json'], null],
    ['sessions', {}, ['session', 'list', '--json'], null],
    ['stop', { session: 't1' }, ['--session', 't1', 'stop', '--json'], null],
    ['doctor', {}, ['doctor', '--json'], null],
  ];
  for (const [tool, args, argv, stdin] of cases) {
    it(`maps ${tool} ${JSON.stringify(args)}`, async () => {
      const client = await connect();
      const r = await call(client, tool, args);
      expect(r.isError).toBeFalsy();
      const e = echo(r);
      expect(e.argv).toEqual(argv);
      expect(e.stdin).toBe(stdin);
    });
  }

  const jobCases: Array<[string, Record<string, unknown>, string[], string | null]> = [
    ['build_start', { flow: 'demo', vars: { runid: 'test-{n}', who: 'a' }, fixture_isolation: true, converge: 2 }, ['build', 'demo', '--var', 'runid=test-{n}', '--var', 'who=a', '--fixture-isolation', '--converge', '2', '--json', '--progress'], null],
    ['build_start', { flow: 'demo', converge: true }, ['build', 'demo', '--converge', '--json', '--progress'], null],
    ['build_start', { flow: 'demo', converge: false }, ['build', 'demo', '--no-converge', '--json', '--progress'], null],
    ['check', { flow_file: 'a.flow.ts', ready: true, runs: 3, fixture_isolation: true }, ['check', 'a.flow.ts', '--ready', '--runs', '3', '--fixture-isolation', '--json', '--progress'], null],
    ['repair_propose', { flow_file: 'a.flow.ts', proposal_file: 'p.json', vars: { runid: 'x' } }, ['repair', 'a.flow.ts', '--propose', 'p.json', '--var', 'runid=x', '--json', '--progress'], null],
    ['rerecord', { flow: 'demo', step_id: '03-create', instruction: 'create it\nand verify', runs: 2 }, ['rerecord', 'demo', '03-create', '--stdin', '--runs', '2', '--json', '--progress'], 'create it\nand verify'],
    ['rerecord', { flow: 'demo', step_id: '03-create' }, ['rerecord', 'demo', '03-create', '--json', '--progress'], null],
  ];
  for (const [tool, args, argv, stdin] of jobCases) {
    it(`runs ${tool} ${JSON.stringify(args)} as a job`, async () => {
      const client = await connect();
      const started = await call(client, tool, args);
      expect(started.isError).toBeFalsy();
      const { job_id } = echo(started);
      expect(job_id).toMatch(/^job_/);
      const status = await call(client, 'job_status', { job_id, wait_s: 15 });
      expect(status.isError).toBeFalsy();
      const view = echo(status);
      expect(view.status).toBe('done');
      expect(view.exit_code).toBe(0);
      expect(view.result.argv).toEqual(argv);
      expect(view.result.stdin).toBe(stdin);
    });
  }

  it('job_status reports running, then the failed exit with progress lines', async () => {
    const client = await connect();
    const started = await call(client, 'build_start', { flow: 'demo', vars: { t: 'sleep=600 progress=3 exit=4' } });
    const { job_id } = echo(started);
    const early = await call(client, 'job_status', { job_id, wait_s: 0 });
    expect(echo(early).status).toBe('running');
    expect(early.isError).toBeFalsy();
    const final = await call(client, 'job_status', { job_id, wait_s: 15 });
    const view = echo(final);
    expect(view.status).toBe('failed');
    expect(view.exit_code).toBe(4);
    expect(view.meaning).toContain('compiled spec or readiness failed');
    expect(view.progress).toEqual(expect.arrayContaining(['  · step 1', '  · step 3']));
    expect(final.isError).toBe(true);
    const unknown = await call(client, 'job_status', { job_id: 'job_nope' });
    expect(unknown.isError).toBe(true);
  });

  it('save_flow stops with --save-flow, then exports the bundle under cwd', async () => {
    const client = await connect();
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-mcp-'));
    try {
      const r = await call(client, 'save_flow', { name: 'demo', session: 't1', cwd });
      expect(r.isError).toBeFalsy();
      const parts = r.content.map((c) => c.text!);
      expect(parts).toHaveLength(2);
      expect(echo({ content: [{ type: 'text', text: parts[0] }] }).argv).toEqual(['--session', 't1', 'stop', '--save-flow', 'demo', '--json']);
      const second = echo({ content: [{ type: 'text', text: parts[1] }] });
      expect(second.argv).toEqual(['flow', 'export', 'demo', '--out', path.join(cwd, '.sitelooper', 'procedures.json'), '--json']);
      expect(fs.realpathSync(second.cwd)).toBe(fs.realpathSync(cwd));
      // A failed stop does not export.
      const failed = await call(client, 'save_flow', { name: 'exit=1', cwd });
      expect(failed.isError).toBe(true);
      expect(failed.content).toHaveLength(1);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('screenshot returns the PNG as image content plus its path', async () => {
    const client = await connect();
    const r = await call(client, 'screenshot', { full_page: true });
    expect(r.isError).toBeFalsy();
    const e = echo(r);
    expect(e.argv.slice(0, 3)).toEqual([...S, 'screenshot']);
    expect(e.argv.slice(4)).toEqual(['--full-page', '--json']);
    const image = r.content.find((c) => c.type === 'image')!;
    expect(image.mimeType).toBe('image/png');
    expect(Buffer.from(image.data!, 'base64').subarray(1, 4).toString()).toBe('PNG');
    expect(text(r)).toContain(e.path);
    fs.rmSync(e.path, { force: true });
  });

  it('sets isError with the exit code meaning for exits 1-4', async () => {
    const client = await connect();
    for (const [code, meaning] of [[1, 'agent/recording failure'], [2, 'unavailable or invalid input'], [3, 'replay did not converge'], [4, 'compiled spec or readiness failed']] as const) {
      const r = await call(client, 'do', { instruction: `fail exit=${code}` });
      expect(r.isError).toBe(true);
      expect(text(r)).toContain(`exit ${code} (${meaning})`);
      expect(text(r)).toContain('stub failure');
    }
    const held = await call(client, 'assert', { condition: 'x exit=1' });
    expect(held.isError).toBe(true);
    expect(text(held)).toContain('condition did not hold');
    const ok = await call(client, 'do', { instruction: 'fine' });
    expect(ok.isError).toBeFalsy();
    expect(text(ok)).toContain('exit 0 (success)');
  });

  it('forwards stderr lines as progress notifications when a progressToken is sent', async () => {
    const client = await connect();
    const seen: Array<{ progress: number; message?: string }> = [];
    const r = await client.callTool({ name: 'do', arguments: { instruction: 'go progress=3' } }, undefined, { onprogress: (p) => seen.push(p) });
    expect((r as Result).isError).toBeFalsy();
    expect(seen.map((p) => p.message)).toEqual(['step 1', 'step 2', 'step 3']);
    expect(seen.map((p) => p.progress)).toEqual([1, 2, 3]);
  });

  it('kills the child when the request is cancelled', async () => {
    const client = await connect();
    const pidfile = path.join(os.tmpdir(), `sl-mcp-pid-${process.pid}-${Date.now()}`);
    process.env.STUB_PIDFILE = pidfile;
    const controller = new AbortController();
    const pending = client.callTool({ name: 'do', arguments: { instruction: 'wait sleep=20000' } }, undefined, { signal: controller.signal });
    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(pidfile) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    const pid = Number(fs.readFileSync(pidfile, 'utf8'));
    controller.abort();
    await expect(pending).rejects.toThrow();
    const gone = Date.now() + 5_000;
    let alive = true;
    while (alive && Date.now() < gone) {
      try {
        process.kill(pid, 0);
        await new Promise((r) => setTimeout(r, 50));
      } catch {
        alive = false;
      }
    }
    expect(alive).toBe(false);
    fs.rmSync(pidfile, { force: true });
  });

  it('rejects a cwd that is relative, missing or not a directory', async () => {
    const client = await connect();
    const rel = await call(client, 'doctor', { cwd: 'relative/dir' });
    expect(rel.isError).toBe(true);
    expect(text(rel)).toContain('absolute');
    const missing = await call(client, 'doctor', { cwd: path.join(os.tmpdir(), 'sl-mcp-does-not-exist-xyz') });
    expect(missing.isError).toBe(true);
    expect(text(missing)).toContain('does not exist');
    const file = await call(client, 'list_flows', { cwd: stub });
    expect(file.isError).toBe(true);
    expect(text(file)).toContain('not a directory');
    const good = await call(client, 'doctor', { cwd: os.tmpdir() });
    expect(good.isError).toBeFalsy();
    expect(fs.realpathSync(echo(good).cwd)).toBe(fs.realpathSync(os.tmpdir()));
  });

  it('refuses positional values that would parse as options, and unknown inputs', async () => {
    const client = await connect();
    expect((await call(client, 'open', { url: '--allow-shell-path' })).isError).toBe(true);
    expect((await call(client, 'build_start', { flow: '--force' })).isError).toBe(true);
    expect((await call(client, 'doctor', { api_key: 'sk-nope' })).isError).toBe(true);
    expect((await call(client, 'set_var', { name: '--x', value: 'y' })).isError).toBe(true);
  });

  it('accepts reset_cmd only when SITELOOPER_MCP_ALLOW_RESET_CMD is set', async () => {
    const closed = await connect({ allowResetCmd: false });
    const tools = (await closed.listTools()).tools;
    expect(Object.keys((tools.find((t) => t.name === 'build_start')!.inputSchema as any).properties)).not.toContain('reset_cmd');
    const refused = await call(closed, 'build_start', { flow: 'demo', reset_cmd: 'rm -rf /' });
    expect(refused.isError).toBe(true);
    expect(text(refused)).not.toContain('job_');

    const open = await connect({ allowResetCmd: true });
    const openTools = (await open.listTools()).tools;
    for (const n of ['build_start', 'check', 'repair_propose', 'rerecord']) {
      expect(Object.keys((openTools.find((t) => t.name === n)!.inputSchema as any).properties)).toContain('reset_cmd');
    }
    const started = await call(open, 'build_start', { flow: 'demo', reset_cmd: 'npm run db:reset' });
    const view = echo(await call(open, 'job_status', { job_id: echo(started).job_id, wait_s: 15 }));
    expect(view.result.argv).toEqual(['build', 'demo', '--reset-cmd', 'npm run db:reset', '--json', '--progress']);
    const checked = echo(await call(open, 'check', { flow_file: 'a.flow.ts', reset_cmd: 'reset.sh' }));
    expect(checked.argv).toEqual(['check', 'a.flow.ts', '--reset-cmd', 'reset.sh', '--json', '--progress']);
  });

  it('redacts secret-looking environment values from tool output', async () => {
    process.env.TEST_FAKE_API_KEY = 'sk-test-0123456789abcdef';
    const client = await connect();
    const r = await call(client, 'doctor', { cwd: os.tmpdir() });
    expect(text(r)).not.toContain('sk-test-0123456789abcdef');
    const leaked = await call(client, 'do', { instruction: 'leak' });
    expect(text(leaked)).not.toContain('sk-test-0123456789abcdef');
    expect(echo(leaked).leaked).toBe('***');
  });
});

describe('MCP result shaping', () => {
  it('drops the embedded compiled spec and fingerprints, and names blockers in the summary', () => {
    const json = {
      outcome: 'unavailable',
      compilation: { flowFile: '/p/tests/sitelooper/x.flow.ts', spec: { steps: [{ preconditions: { fingerprint: [0, 0.19] } }] }, diagnostics: [] },
      readiness: { blockers: ['Run 1: @playwright/test runner could not be resolved'], runs: [{ fingerprint: [1] }] },
    };
    const slimmed = slim(json) as any;
    expect(slimmed.compilation.spec).toBe('(compiled spec omitted; see /p/tests/sitelooper/x.flow.ts)');
    expect(JSON.stringify(slimmed)).not.toContain('fingerprint');
    const result = cliResult('build_start', ['build', 'x', '--json'], { exitCode: 2, stdout: '', stderr: '', json });
    const text = (result.content[0] as { text: string }).text;
    expect(text.split('\n')[0]).toContain('blockers: Run 1: @playwright/test runner could not be resolved');
    expect(result.isError).toBe(true);
  });
});
