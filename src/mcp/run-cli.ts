import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * One sitelooper CLI invocation, as a child process.
 *
 * The MCP server is a thin wrapper: every tool runs `node bin/sitelooper.js
 * ... --json` and reports what the CLI said. No shell is involved (shell:false,
 * argv passed as an array), so nothing in a tool argument is ever expanded.
 */
export interface RunCliOptions {
  cwd?: string;
  signal?: AbortSignal;
  /** Each complete stderr line, as it arrives (progress). */
  onStderrLine?: (line: string) => void;
  timeoutMs?: number;
  /** Written to the child's stdin, which is then closed. Without it stdin is ignored. */
  stdin?: string;
  /** The CLI entry script to run with process.execPath; defaults to SITELOOPER_MCP_CLI, then bin/sitelooper.js. */
  cliPath?: string;
}

export interface RunCliResult {
  /** null when the child was killed (abort, timeout) or did not start. */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** stdout parsed as JSON, when --json was passed and it parsed. */
  json?: unknown;
  /** Why there is no exit code, when there is none. */
  killed?: 'aborted' | 'timeout' | 'spawn-error';
  spawnError?: string;
}

/** bin/sitelooper.js, from src/mcp (vitest) or dist/mcp (installed): both are two levels below the package root. */
export function defaultCliPath(): string {
  return process.env.SITELOOPER_MCP_CLI || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bin/sitelooper.js');
}

const MAX_CAPTURE = 8 * 1024 * 1024;

/** Every child still running, so a server shutdown can kill them (by handle, never by process name). */
const live = new Set<import('node:child_process').ChildProcess>();

export function killAllChildren(): void {
  for (const child of live) child.kill();
}

export function runCli(args: string[], opts: RunCliOptions = {}): Promise<RunCliResult> {
  const cli = opts.cliPath ?? defaultCliPath();
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let pending = '';
    let killed: RunCliResult['killed'];
    let settled = false;

    if (opts.signal?.aborted) {
      resolve({ exitCode: null, stdout, stderr, killed: 'aborted' });
      return;
    }

    const child = spawn(process.execPath, [cli, ...args], {
      cwd: opts.cwd,
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: [opts.stdin !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });

    live.add(child);
    const kill = (why: 'aborted' | 'timeout') => {
      if (killed || child.exitCode !== null) return;
      killed = why;
      child.kill();
    };
    const onAbort = () => kill('aborted');
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = opts.timeoutMs ? setTimeout(() => kill('timeout'), opts.timeoutMs) : undefined;

    const finish = (result: RunCliResult) => {
      if (settled) return;
      settled = true;
      live.delete(child);
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (pending.trim()) opts.onStderrLine?.(pending);
      pending = '';
      resolve(result);
    };

    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => {
      if (stdout.length < MAX_CAPTURE) stdout += chunk;
    });
    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (chunk: string) => {
      if (stderr.length < MAX_CAPTURE) stderr += chunk;
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) opts.onStderrLine?.(line);
    });

    if (opts.stdin !== undefined) {
      child.stdin!.on('error', () => { /* child exited before reading: its exit code says why */ });
      child.stdin!.end(opts.stdin, 'utf8');
    }

    child.on('error', (err) => {
      finish({ exitCode: null, stdout, stderr, killed: 'spawn-error', spawnError: err.message });
    });
    child.on('close', (code) => {
      const result: RunCliResult = { exitCode: killed ? null : code, stdout, stderr };
      if (killed) result.killed = killed;
      if (args.includes('--json')) {
        const text = stdout.trim();
        if (text) {
          try {
            result.json = JSON.parse(text);
          } catch {
            /* not JSON: the caller reports stdout as text */
          }
        }
      }
      finish(result);
    });
  });
}
