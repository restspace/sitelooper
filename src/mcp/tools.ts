import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { CallToolResult, ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import { runCli, type RunCliResult } from './run-cli.js';
import { JobTable, type Job } from './jobs.js';

/**
 * The sitelooper MCP tools. Each one maps to one CLI invocation (two for
 * save_flow) run as a child process with --json; see run-cli.ts. Tool
 * descriptions are what the calling model reads, so they say exactly what the
 * tool does, what it needs and what a result means.
 */

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export interface ToolContext {
  /** The CLI entry script (tests point this at a stub); default bin/sitelooper.js. */
  cliPath?: string;
  jobs: JobTable;
  /** SITELOOPER_MCP_ALLOW_RESET_CMD=1: accept a `reset_cmd` input on build_start, check, repair_propose and rerecord. */
  allowResetCmd: boolean;
}

export const TOOL_NAMES = [
  'open', 'do', 'assert', 'set_var', 'peek', 'screenshot', 'save_flow', 'list_flows',
  'build_start', 'check', 'repair_propose', 'repair_apply', 'rerecord', 'job_status',
  'sessions', 'stop', 'doctor',
] as const;

const EXIT_MEANING: Record<number, string> = {
  0: 'success',
  1: 'agent/recording failure',
  2: 'unavailable or invalid input',
  3: 'replay did not converge',
  4: 'compiled spec or readiness failed',
};

const MAX_TEXT = 60_000;

// --- input pieces ---

/** A positional CLI argument: one starting with "-" would be parsed as an option. */
const positional = (what: string) =>
  z.string().min(1).refine((v) => !v.startsWith('-'), { message: `${what} must not start with "-"` });

const sessionField = z
  .string()
  .regex(/^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/, 'letters, digits, - and _ (not leading -), at most 64')
  .optional()
  .describe('Browser session name (default "default"). Each session is its own browser and daemon.');

const cwdField = z
  .string()
  .optional()
  .describe('Project directory (absolute) the command runs in; sitelooper.config.json is found from here. Default: the server\'s working directory.');

const varsField = z
  .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'variable names are letters, digits and _'), z.string())
  .optional()
  .describe('Flow variables, passed as repeated --var k=v. "{n}" in a value is replaced per run with a fresh value. Never a secret: use {{env:NAME}} markers in instructions instead.');

const resetCmdField = z
  .string()
  .min(1)
  .optional()
  .describe('Shell command that resets app state before each execution (--reset-cmd). Accepted because SITELOOPER_MCP_ALLOW_RESET_CMD=1; otherwise only sitelooper.config.json resetCommand is used.');

const CREDENTIALS =
  'Credentials: write each secret as one {{env:NAME}} marker ({{totp:NAME}} for a one-time code), exactly as written: the marker alone, never the value and never $NAME. NAME must be set in the environment the MCP server was started with. Never ask the user for a secret value.';

// --- results ---

/** Environment values that look like secrets, so no output can echo one. */
function secretValues(): string[] {
  return Object.entries(process.env)
    .filter(([k, v]) => v && v.length >= 8 && /(API_?KEY|TOKEN|SECRET|PASSW(OR)?D|CREDENTIAL|_PAT$)/i.test(k))
    .map(([, v]) => v as string)
    .sort((a, b) => b.length - a.length);
}

export function redact(text: string): string {
  let out = text;
  for (const secret of secretValues()) out = out.split(secret).join('***');
  return out;
}

function clipText(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n…[truncated ${text.length - MAX_TEXT} characters]` : text;
}

function exitLine(r: RunCliResult, tool: string): string {
  if (r.exitCode === null) {
    return r.killed === 'aborted' ? 'cancelled (child process killed)' : r.killed === 'timeout' ? 'timed out (child process killed)' : `could not start the CLI: ${r.spawnError ?? 'unknown error'}`;
  }
  const meaning = tool === 'assert' && r.exitCode === 1 ? 'condition did not hold' : EXIT_MEANING[r.exitCode] ?? 'unexpected exit code';
  return `exit ${r.exitCode} (${meaning})`;
}

function outcomeOf(json: unknown): string | undefined {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return undefined;
  const v = json as Record<string, any>;
  const blockers: unknown[] = [...(v.readiness?.blockers ?? []), ...(v.blockers ?? []), ...(v.compilation?.compileBlockers ?? [])];
  const bits = [
    v.outcome,
    v.report?.status && v.report.status !== v.outcome ? v.report.status : undefined,
    typeof v.report?.summary === 'string' ? v.report.summary : undefined,
    blockers.length ? `blockers: ${blockers.slice(0, 3).map(String).join('; ')}${blockers.length > 3 ? ` (+${blockers.length - 3} more)` : ''}` : undefined,
  ].filter(Boolean);
  return bits.length ? bits.join(' — ') : undefined;
}

/**
 * The result JSON without what a calling model can't use: build/compile embed
 * the whole compiled spec (tens of KB, mostly page fingerprints) that is
 * already on disk as the .flow.ts, and it buried the blockers under ~100 KB.
 */
export function slim(json: unknown): unknown {
  return JSON.parse(JSON.stringify(json, function (key, value) {
    if (key === 'fingerprint') return undefined;
    if (key === 'spec' && this && typeof this === 'object' && 'flowFile' in this && value && typeof value === 'object') {
      return `(compiled spec omitted; see ${(this as { flowFile?: string }).flowFile ?? 'the .flow.ts file'})`;
    }
    return value;
  }));
}

function body(r: RunCliResult): string {
  const parts: string[] = [];
  if (r.json !== undefined) parts.push(JSON.stringify(slim(r.json), null, 2));
  else if (r.stdout.trim()) parts.push(r.stdout.trim());
  if (r.exitCode !== 0 && r.stderr.trim()) {
    const tail = r.stderr.trim().split(/\r?\n/).slice(-20).join('\n');
    parts.push(`stderr (last lines):\n${tail}`);
  }
  return parts.join('\n\n');
}

export function cliResult(tool: string, argv: string[], r: RunCliResult): CallToolResult {
  const outcome = outcomeOf(r.json);
  const summary = `sitelooper ${argv.join(' ')}: ${exitLine(r, tool)}${outcome ? ` — ${outcome}` : ''}`;
  const text = redact(clipText([summary, body(r)].filter(Boolean).join('\n\n')));
  return { content: [{ type: 'text', text }], ...(r.exitCode === 0 ? {} : { isError: true }) };
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function jobView(job: Job) {
  const r = job.result;
  return {
    job_id: job.id,
    tool: job.tool,
    command: `sitelooper ${job.argv.join(' ')}`,
    status: job.status,
    elapsed_s: Math.round(((job.finishedAt ?? Date.now()) - job.startedAt) / 1000),
    ...(r ? { exit_code: r.exitCode, meaning: exitLine(r, job.tool) } : {}),
    progress: job.progress,
    ...(r ? (r.json !== undefined ? { result: slim(r.json) } : { stdout: r.stdout.trim().slice(-4000) }) : {}),
    ...(r && r.exitCode !== 0 && r.stderr.trim() ? { stderr_tail: r.stderr.trim().split(/\r?\n/).slice(-20) } : {}),
  };
}

// --- plumbing ---

/** `cwd` must name an existing absolute directory. Returns the directory, or an error result. */
export function resolveCwd(cwd: string | undefined): { cwd: string } | { error: CallToolResult } {
  if (cwd === undefined) return { cwd: process.cwd() };
  if (!path.isAbsolute(cwd)) return { error: errorResult(`cwd must be an absolute path (got "${cwd}")`) };
  let stat: fs.Stats;
  try {
    stat = fs.statSync(cwd);
  } catch {
    return { error: errorResult(`cwd does not exist: ${cwd}`) };
  }
  if (!stat.isDirectory()) return { error: errorResult(`cwd is not a directory: ${cwd}`) };
  return { cwd };
}

/** Forward stderr lines as notifications/progress, when the request asked for progress. */
function progressSink(extra: Extra): ((line: string) => void) | undefined {
  const token = extra._meta?.progressToken;
  if (token === undefined) return undefined;
  let n = 0;
  return (line) => {
    const message = redact(line.replace(/^\s*·\s*/, '').trim());
    if (!message) return;
    extra.sendNotification({ method: 'notifications/progress', params: { progressToken: token, progress: ++n, message } }).catch(() => {});
  };
}

const sessionArgs = (session: string | undefined) => ['--session', session ?? 'default'];

function varArgs(vars: Record<string, string> | undefined): string[] {
  return Object.entries(vars ?? {}).flatMap(([k, v]) => ['--var', `${k}=${v}`]);
}

function resetArgs(ctx: ToolContext, args: { reset_cmd?: string }): string[] {
  return ctx.allowResetCmd && args.reset_cmd ? ['--reset-cmd', args.reset_cmd] : [];
}

type Handler = (args: any, extra: Extra) => Promise<CallToolResult>;

function register(
  server: McpServer,
  name: (typeof TOOL_NAMES)[number],
  description: string,
  shape: Record<string, z.ZodType>,
  handler: Handler,
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean } = {},
): void {
  server.registerTool(
    name,
    { description, inputSchema: z.strictObject(shape), annotations },
    (async (args: unknown, extra: Extra) => handler(args, extra)) as any,
  );
}

// --- the tools ---

export function registerTools(server: McpServer, ctx: ToolContext): void {
  const run = (argv: string[], cwd: string, extra: Extra, stdin?: string) =>
    runCli(argv, { cwd, signal: extra.signal, onStderrLine: progressSink(extra), stdin, cliPath: ctx.cliPath });

  /** Run one CLI command synchronously and report it. */
  const sync = (tool: string, build: (args: any) => { argv: string[]; stdin?: string }): Handler => async (args, extra) => {
    const where = resolveCwd(args.cwd);
    if ('error' in where) return where.error;
    const { argv, stdin } = build(args);
    return cliResult(tool, argv, await run(argv, where.cwd, extra, stdin));
  };

  /** Start one CLI command as a background job; job_status reports it. */
  const job = (tool: string, build: (args: any) => { argv: string[]; stdin?: string }): Handler => async (args) => {
    const where = resolveCwd(args.cwd);
    if ('error' in where) return where.error;
    const { argv, stdin } = build(args);
    const started = ctx.jobs.start(tool, argv, { cwd: where.cwd, stdin, cliPath: ctx.cliPath });
    const view = { job_id: started.id, status: started.status, command: `sitelooper ${argv.join(' ')}` };
    return {
      content: [{ type: 'text', text: redact(`started ${started.id}: ${view.command}\nPoll job_status with job_id "${started.id}" until status is done or failed.\n\n${JSON.stringify(view, null, 2)}`) }],
    };
  };

  const reset: Record<string, z.ZodType> = ctx.allowResetCmd ? { reset_cmd: resetCmdField } : {};

  register(
    server,
    'open',
    'Navigate a browser session to a URL (no model involved); starts the session if it is not running. ' +
      'learn and headed apply only when this call starts the session: learn=true records every later do/assert as a reusable flow step (needed before save_flow). ' +
      'Typical authoring: open (learn) → set_var → do/assert per outcome → save_flow → build_start.',
    {
      url: positional('url').describe('The URL to open.'),
      learn: z.boolean().optional().describe('Record a flow in this session (--learn). Only takes effect when the session starts.'),
      headed: z.boolean().optional().describe('Show the browser window (--headed). Only takes effect when the session starts.'),
      session: sessionField,
      cwd: cwdField,
    },
    sync('open', (a) => ({ argv: [...sessionArgs(a.session), ...(a.learn ? ['--learn'] : []), ...(a.headed ? ['--headed'] : []), 'open', a.url, '--json', '--progress'] })),
    { openWorldHint: true },
  );

  register(
    server,
    'do',
    'Have the agent perform ONE verifiable outcome in the session\'s browser and verify it, e.g. "create a customer named {{runid}} and confirm it appears in the list". ' +
      'One verifiable outcome per do: split multi-part tasks into several calls. State expected values in the sentence. ' +
      `${CREDENTIALS} ` +
      'Needs a model API key in the server environment. Returns the report (status, summary, evidence values). Exit 1 = the agent could not complete it.',
    {
      instruction: z.string().min(1).describe('The outcome to achieve and how to verify it (sent on stdin, so any text is safe).'),
      timeout_s: z.number().int().positive().optional().describe('Overall deadline in seconds (--timeout).'),
      max_turns: z.number().int().positive().optional().describe('Agent turn budget (--max-turns).'),
      session: sessionField,
      cwd: cwdField,
    },
    sync('do', (a) => ({
      argv: [...sessionArgs(a.session), 'do', '--stdin', '--json', '--progress', ...(a.timeout_s ? ['--timeout', String(a.timeout_s)] : []), ...(a.max_turns ? ['--max-turns', String(a.max_turns)] : [])],
      stdin: a.instruction,
    })),
    { openWorldHint: true },
  );

  register(
    server,
    'assert',
    'Check a condition on the current page now; never acts. State the expected text in the sentence, e.g. "the order list shows a row with total 42.00". ' +
      'In a learn session a passing assert becomes a flow step that fails the run when it does not hold. ' +
      `${CREDENTIALS} ` +
      'isError with exit 1 = the condition did not hold; exit 2 = could not be checked.',
    {
      condition: z.string().min(1).describe('The condition to check (sent on stdin).'),
      timeout_s: z.number().int().positive().optional().describe('Deadline in seconds (--timeout).'),
      session: sessionField,
      cwd: cwdField,
    },
    sync('assert', (a) => ({
      argv: [...sessionArgs(a.session), 'assert', '--stdin', '--json', '--progress', ...(a.timeout_s ? ['--timeout', String(a.timeout_s)] : [])],
      stdin: a.condition,
    })),
    { openWorldHint: true },
  );

  register(
    server,
    'set_var',
    'Set a session variable that later instructions reference as {{name}}; in a learn session it becomes a flow variable that build/check bind with vars. Not for secrets (use {{env:NAME}} markers).',
    {
      name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'letters, digits and _').describe('Variable name.'),
      value: z.string().describe('Variable value.'),
      session: sessionField,
      cwd: cwdField,
    },
    sync('set_var', (a) => ({ argv: [...sessionArgs(a.session), 'var', `${a.name}=${a.value}`, '--json'] })),
  );

  register(
    server,
    'peek',
    'Return the session page\'s URL, title and an accessibility snapshot (no model, no actions).',
    {
      selector: z.string().min(1).optional().describe('Limit the snapshot to this CSS selector (--selector).'),
      interactive: z.boolean().optional().describe('Only interactive elements (--interactive).'),
      session: sessionField,
      cwd: cwdField,
    },
    sync('peek', (a) => ({ argv: [...sessionArgs(a.session), 'peek', ...(a.selector ? ['--selector', a.selector] : []), ...(a.interactive ? ['--interactive'] : []), '--json'] })),
    { readOnlyHint: true },
  );

  register(
    server,
    'screenshot',
    'Capture the session page as a PNG; returns the image and the file path it was saved to.',
    {
      full_page: z.boolean().optional().describe('Capture the full scrollable page (--full-page).'),
      session: sessionField,
      cwd: cwdField,
    },
    async (a, extra) => {
      const where = resolveCwd(a.cwd);
      if ('error' in where) return where.error;
      const dir = path.join(os.tmpdir(), 'sitelooper-mcp');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `screenshot-${Date.now().toString(36)}.png`);
      const argv = [...sessionArgs(a.session), 'screenshot', file, ...(a.full_page ? ['--full-page'] : []), '--json'];
      const r = await run(argv, where.cwd, extra);
      const result = cliResult('screenshot', argv, r);
      if (r.exitCode !== 0) return result;
      const saved = (r.json as { path?: string } | undefined)?.path ?? file;
      try {
        const data = fs.readFileSync(saved).toString('base64');
        result.content.push({ type: 'image', data, mimeType: 'image/png' });
      } catch (err) {
        return errorResult(`screenshot reported ${saved} but it could not be read: ${(err as Error).message}`);
      }
      return result;
    },
    { readOnlyHint: true },
  );

  register(
    server,
    'save_flow',
    'Stop a learn session, save what it recorded as a named flow, then export the flow with its pinned procedures to a bundle file (default .sitelooper/procedures.json in cwd). ' +
      'Closes the session\'s browser. Then call build_start with the flow name.',
    {
      name: z.string().regex(/^[A-Za-z0-9_][A-Za-z0-9._-]*$/, 'letters, digits, ., - and _').describe('Flow name.'),
      bundle: positional('bundle').optional().describe('Bundle path, relative to cwd or absolute (default .sitelooper/procedures.json).'),
      session: sessionField,
      cwd: cwdField,
    },
    async (a, extra) => {
      const where = resolveCwd(a.cwd);
      if ('error' in where) return where.error;
      const stopArgv = [...sessionArgs(a.session), 'stop', '--save-flow', a.name, '--json'];
      const stopped = await run(stopArgv, where.cwd, extra);
      if (stopped.exitCode !== 0) return cliResult('save_flow', stopArgv, stopped);
      const bundle = path.resolve(where.cwd, a.bundle ?? '.sitelooper/procedures.json');
      const exportArgv = ['flow', 'export', a.name, '--out', bundle, '--json'];
      const exported = await run(exportArgv, where.cwd, extra);
      const first = cliResult('save_flow', stopArgv, stopped);
      const second = cliResult('save_flow', exportArgv, exported);
      return { content: [...first.content, ...second.content], ...(second.isError ? { isError: true } : {}) };
    },
    { destructiveHint: false },
  );

  register(
    server,
    'list_flows',
    'List saved flows with their step counts, variables and origin.',
    { cwd: cwdField },
    sync('list_flows', () => ({ argv: ['flow', 'list', '--json'] })),
    { readOnlyHint: true },
  );

  register(
    server,
    'build_start',
    'Start a background job that compiles a saved flow (or bundle) into a Playwright .flow.ts/.spec.ts and verifies it (readiness: clean runs). ' +
      'With a reset command (sitelooper.config.json resetCommand) it first converges, re-recording failing steps with the model. ' +
      'Readiness needs a reset command or fixture_isolation. Returns a job_id at once: poll job_status until done/failed (minutes).',
    {
      flow: positional('flow').describe('Flow name or bundle path.'),
      vars: varsField,
      fixture_isolation: z.boolean().optional().describe('Declare that project fixtures prepare fresh data (--fixture-isolation).'),
      converge: z
        .union([z.boolean(), z.number().int().min(1)])
        .optional()
        .describe('true = --converge (default rounds), N = --converge N rounds, false = --no-converge (compile and readiness only).'),
      ...reset,
      cwd: cwdField,
    },
    job('build_start', (a) => ({
      argv: [
        'build', a.flow, ...varArgs(a.vars),
        ...(a.fixture_isolation ? ['--fixture-isolation'] : []),
        ...(a.converge === true ? ['--converge'] : typeof a.converge === 'number' ? ['--converge', String(a.converge)] : a.converge === false ? ['--no-converge'] : []),
        ...resetArgs(ctx, a), '--json', '--progress',
      ],
    })),
    { openWorldHint: true },
  );

  register(
    server,
    'check',
    'Run a compiled <name>.flow.ts once under plain Playwright (no model) and report pass/fail (exit 4 = failed, 2 = could not run). ' +
      'With ready=true it runs the readiness gate (several clean runs) as a background job: the call returns a job_id; poll job_status.',
    {
      flow_file: positional('flow_file').describe('Path to the .flow.ts file, relative to cwd or absolute.'),
      ready: z.boolean().optional().describe('Readiness check (--ready), run as a job.'),
      runs: z.number().int().min(1).optional().describe('Readiness executions (--runs), with ready.'),
      fixture_isolation: z.boolean().optional().describe('Declare that project fixtures prepare fresh data (--fixture-isolation), with ready.'),
      vars: varsField,
      ...reset,
      cwd: cwdField,
    },
    async (a, extra) => {
      const build = (x: any) => ({
        argv: [
          'check', x.flow_file, ...(x.ready ? ['--ready'] : []),
          ...(x.ready && x.runs ? ['--runs', String(x.runs)] : []),
          ...(x.ready && x.fixture_isolation ? ['--fixture-isolation'] : []),
          ...varArgs(x.vars), ...resetArgs(ctx, x), '--json', '--progress',
        ],
      });
      return a.ready ? job('check', build)(a, extra) : sync('check', build)(a, extra);
    },
    { openWorldHint: true },
  );

  register(
    server,
    'repair_propose',
    'Start a background job that replays a compiled .flow.ts against the app, repairs drifted steps and stages a checked candidate as a proposal file for review (repair --propose); never rewrites the spec. ' +
      'Returns a job_id: poll job_status. Apply a good proposal with repair_apply.',
    {
      flow_file: positional('flow_file').describe('Path to the .flow.ts file.'),
      proposal_file: positional('proposal_file').describe('Where to write the proposal JSON (must not exist yet).'),
      vars: varsField,
      ...reset,
      cwd: cwdField,
    },
    job('repair_propose', (a) => ({ argv: ['repair', a.flow_file, '--propose', a.proposal_file, ...varArgs(a.vars), ...resetArgs(ctx, a), '--json', '--progress'] })),
    { openWorldHint: true },
  );

  register(
    server,
    'repair_apply',
    'Apply a proposal staged by repair_propose to its flow file exactly as checked (no browser run).',
    {
      proposal_file: positional('proposal_file').describe('The proposal JSON path.'),
      cwd: cwdField,
    },
    sync('repair_apply', (a) => ({ argv: ['repair', 'apply', a.proposal_file, '--json'] })),
  );

  register(
    server,
    'rerecord',
    'Start a background job that re-records one step of a flow with the agent (optionally with a new instruction), then verifies it over several runs and re-pins it. ' +
      `Needs a model API key. ${CREDENTIALS} Returns a job_id: poll job_status.`,
    {
      flow: positional('flow').describe('Flow name, bundle or .flow.ts path.'),
      step_id: positional('step_id').describe('Step id, e.g. "03-create".'),
      instruction: z.string().min(1).optional().describe('Replacement instruction for the step (sent on stdin). Omit to keep the recorded one.'),
      runs: z.number().int().min(1).optional().describe('Verification runs (--runs, default 2).'),
      vars: varsField,
      ...reset,
      cwd: cwdField,
    },
    job('rerecord', (a) => ({
      argv: ['rerecord', a.flow, a.step_id, ...(a.instruction ? ['--stdin'] : []), ...(a.runs ? ['--runs', String(a.runs)] : []), ...varArgs(a.vars), ...resetArgs(ctx, a), '--json', '--progress'],
      stdin: a.instruction,
    })),
    { openWorldHint: true },
  );

  register(
    server,
    'job_status',
    'Report a background job started by build_start, check (ready), repair_propose or rerecord: status running|done|failed, the last progress lines, and the final JSON result and exit code when finished. ' +
      'Waits up to wait_s seconds for the job to finish before answering.',
    {
      job_id: z.string().min(1).describe('The job_id a job-starting tool returned.'),
      wait_s: z.number().min(0).max(50).optional().describe('Long-poll: wait up to this many seconds for completion (default 25, max 50).'),
    },
    async (a, extra) => {
      if (!ctx.jobs.get(a.job_id)) return errorResult(`no job "${a.job_id}" (jobs live only as long as this server process)`);
      const found = (await ctx.jobs.wait(a.job_id, (a.wait_s ?? 25) * 1000, extra.signal))!;
      const view = jobView(found);
      const summary = found.status === 'running'
        ? `${found.id} running for ${view.elapsed_s}s; call job_status again`
        : `${found.id} ${found.status}: ${exitLine(found.result!, found.tool)}${outcomeOf(found.result!.json) ? ` — ${outcomeOf(found.result!.json)}` : ''}`;
      return {
        content: [{ type: 'text', text: redact(clipText(`${summary}\n\n${JSON.stringify(view, null, 2)}`)) }],
        ...(found.status === 'failed' ? { isError: true } : {}),
      };
    },
    { readOnlyHint: true },
  );

  register(
    server,
    'sessions',
    'List browser sessions and whether each is running.',
    { cwd: cwdField },
    sync('sessions', () => ({ argv: ['session', 'list', '--json'] })),
    { readOnlyHint: true },
  );

  register(
    server,
    'stop',
    'Stop a browser session (closes its browser and daemon) without saving a flow. Use save_flow instead to keep a learn session\'s recording.',
    { session: sessionField, cwd: cwdField },
    sync('stop', (a) => ({ argv: [...sessionArgs(a.session), 'stop', '--json'] })),
    { destructiveHint: true },
  );

  register(
    server,
    'doctor',
    'Inspect the setup: browser, Node, and which model provider/API key is in use and why (never shows the key).',
    { cwd: cwdField },
    sync('doctor', () => ({ argv: ['doctor', '--json'] })),
    { readOnlyHint: true },
  );
}
