import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { clip } from './shared/text.js';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnthropicProvider, OpenAICompatProvider, globalConfigPath, resolveProviderConfig, writeGlobalConfig, type Provider } from './agent/llm.js';
import type { Report } from './agent/report.js';
import { encodeFrame, LineDecoder, type FlowRunResult, type Frame, type Request, type ResultFrame } from './shared/protocol.js';
import { aliasLegacyEnv, sessionsDir, socketPath, validateSessionName } from './shared/paths.js';
import { candidateExpr } from './daemon/recorder.js';
import { fillParams } from './skills/compile.js';
import { SkillStore, skillsDir, successRate, type Skill } from './skills/store.js';
import { listFlows, loadFlow, loadFlowFile, saveFlow, type Flow } from './skills/flow.js';
import { drainDrift, llmProposer, triage, type DrainSummary, type DriftTicket } from './skills/repair.js';
import { compileFlow } from './spec/index.js';
import { foldTicketEvidence, mintVars, notConverged, reorderByEvidence } from './spec/repair.js';
import { emitFlowFile } from './spec/emit.js';
import { flowToSpec, type SpecFlow } from './spec/ir.js';
import { LiftError, liftFlowFile } from './spec/lift.js';
import { diffSpecChanges, foldPatchedVariants, reloadStaged, rerecordDiagnostics, stageRepair } from './spec/repair.js';
import { diagnosticLine, formatDiagnostic, type Diagnostic } from './spec/diagnostics.js';
import { runSpecCheck, type SpecCheckResult } from './spec/check.js';
import { runReadinessCheck } from './spec/readiness.js';
import { applyProposal, saveProposal, sourceHash, stageProposal } from './spec/proposal.js';
import { loadProjectConfig } from './project.js';
import { exportFlowBundle } from './spec/index.js';
import { resolveRerecordInput, stageRerecordInput, persistRerecordInput } from './spec/rerecord-input.js';
import {
  backupFlowFile,
  formatRerecordDiagnostic,
  RerecordError,
  rerecordVerdict,
  stepLine,
  stepNote,
  stepOf,
  unpinStep,
  type RerecordRun,
} from './spec/rerecord.js';
import os from 'node:os';

const USAGE = `sitelooper ? author browser tests with an agent; run compiled tests with Playwright

Recommended test workflow:
  sitelooper init                           # create project configuration
  sitelooper --session test --learn open <url>
  sitelooper --session test var runid=demo
  sitelooper --session test do "<one outcome and its verification>"
  sitelooper --session test stop --save-flow <name>
  sitelooper flow export <name> --out .sitelooper/procedures.json
  sitelooper build <name-or-bundle> --var runid=test-{n} --fixture-isolation

Authoring:
  open <url>                               # deterministic navigation, no model
  do "<instruction>"                      # one logical, verifiable outcome
  do --instruction-file <file> | --stdin    # multiline input without shell quoting
  brief <file.md> [--append]                # optional app conventions
  note "<text>" | reset                   # session context; reset keeps browser state
  peek [--selector <css>] [--interactive]
  screenshot [path]
  var <name>=<value>
  session list | stop [--all] [--save-flow <name>]

Compile and verify (no daemon or model):
  compile <flow-or-bundle> [--out <dir>] [--allow-demoted] [--overwrite-spec]
  build <flow-or-bundle> [--out <dir>]       # compile, then readiness gate (3 clean runs)
  check <name.flow.ts>                      # one plain Playwright execution
  check <name.flow.ts> --ready [--runs N]    # readiness for an existing artifact
  flow list | show <name>
  flow export <flow> --out <bundle.json>    # portable flow plus pinned procedures

Verification options:
  --var k=v                               # repeatable; {n} supplies fresh per-run values
  --reset-cmd "<command>"                 # prepare fresh state before each execution
  --fixture-isolation                     # declare that project fixtures prepare fresh data
  --config <playwright.config.ts> --project <name>
  --target-url <url>                       # override the recorded entry URL
  --negative-spec <file.spec.ts>           # explicit test asserting failure detection
  --isolated                              # compiler smoke test; cannot establish readiness
  Readiness requires distinct inputs for parameterized flows, all required steps executed,
  no skipped tests, no already-satisfied shortcuts and no locator drift. Retries are disabled.
  Missing setup or dependencies means unavailable, never a successful check.

Repair:
  repair <name.flow.ts> --propose <proposal.json> [--converge N] [verification options]
  repair apply <proposal.json>             # apply the exact checked candidate; no browser run
  repair <name.flow.ts> [--out <file>] [--converge N] [--dry-run] [--no-check-spec]
  rerecord <flow> <step-id> [--instruction "<text>" | --instruction-file <file> | --stdin]
           [--runs N] [--var k=v] [--reset-cmd "<command>"]
  Repair performs 1 triage run, N convergence runs (default 1), then a compiled-spec check.
  --dry-run still executes against the app; it previews file changes. --propose stages a
  checked candidate for review. Repair never rewrites your .spec.ts. --force is rejected:
  use --allow-demoted or --overwrite-spec separately when compiling.

Advanced:
  run <flow> [--var k=v]                    # adaptive replay with agent recovery
  script [out.spec.ts] [--title T] [--clear] # exploratory raw action export; use build for tests
  skills list [--origin <origin>] | show <id> | rm <id> | clear --origin <origin> | --all
  skills repair --drift <file.json> [--dry-run] [--model M]
  doctor                                  # inspect browser, Node and provider setup
  config | config set <key> <value>         # provider/model defaults

Global options:
  --session <name> --json --progress --verbose --headed --record --learn --script
  --provider <name> --model <id> --fallback-model <id> --no-escalate
  --max-turns N --timeout S --turn-timeout S
  --json emits versioned results for authoring, compilation, checking and repair.
  Provider presets: zhipu, novita, openrouter, openai, anthropic.
  Credentials: use {{env:NAME}} in instructions; set NAME before starting the session.
  Project defaults: sitelooper.config.json (nearest ancestor); CLI flags override them.

Exit codes: 0 success ? 1 agent/recording failure ? 2 unavailable/invalid input
            ? 3 replay did not converge ? 4 compiled spec or readiness failed`;

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Map<string, string | boolean>;
}

function parseArgv(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();
  const valueFlags = new Set([
    'session',
    'max-turns',
    'timeout',
    'turn-timeout',
    'provider',
    'model',
    'fallback-model',
    'base-url',
    'selector',
    'title',
    'origin',
    'save-flow',
    'recovery-model',
    'drift',
    'var',
    'out',
    'converge',
    'reset-cmd',
    'instruction',
    'runs',
    'config',
    'project',
    'target-url',
    'negative-spec',
    'instruction-file',
    'propose',
  ]);
  /**
   * Every flag that takes no value. Unknown options are rejected rather than
   * assumed boolean: an unrecognised `--url http://…` used to set a phantom
   * boolean and drop the URL into the positionals, where `do` appended it to
   * the instruction. The run still worked, so nothing looked wrong — but the
   * compiled skill's template carried the URL and a slot for it, and no later
   * instruction could bind that template. A typo silently changing what the
   * agent was asked to do is not a defensible default for a tool whose
   * results are meant to be reproducible.
   */
  const booleanFlags = new Set([
    'all',
    'append',
    'clear',
    'dry-run',
    'force',
    'allow-demoted',
    'overwrite-spec',
    'ready',
    'isolated',
    'fixture-isolation',
    'stdin',
    'no-check-spec',
    'full-page',
    'headed',
    'help',
    'interactive',
    'check-spec',
    'json',
    'learn',
    'no-escalate',
    'progress',
    'record',
    'script',
    'verbose',
    'version',
  ]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      if (valueFlags.has(name)) {
        flags.set(name, argv[++i] ?? '');
      } else if (booleanFlags.has(name)) {
        flags.set(name, true);
      } else {
        const known = [...valueFlags, ...booleanFlags].sort();
        throw new Error(`unknown option "--${name}". Known options: ${known.map((f) => `--${f}`).join(' ')}`);
      }
    } else {
      positional.push(arg);
    }
  }
  const command = positional.shift() ?? '';
  return { command, positional, flags };
}

// --- daemon connection ---

function connect(sock: string, timeoutMs = 1000): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const conn = net.connect(sock);
    const timer = setTimeout(() => {
      conn.destroy();
      reject(new Error('connect timeout'));
    }, timeoutMs);
    conn.once('connect', () => {
      clearTimeout(timer);
      resolve(conn);
    });
    conn.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Connect and prove the daemon is alive with a ping round-trip (a pipe can
 * still accept connections while its daemon is shutting down). */
async function connectValidated(sock: string): Promise<net.Socket> {
  const conn = await connect(sock);
  try {
    await request(conn, 'ping', {}, undefined, 5_000);
    return conn;
  } catch (err) {
    conn.destroy();
    throw err;
  }
}

async function connectOrSpawn(
  session: string,
  opts: { headed: boolean; record: boolean; script: boolean; learn: boolean },
): Promise<net.Socket> {
  const sock = socketPath(session);
  try {
    return await connectValidated(sock);
  } catch {
    // not running — spawn the daemon detached and wait for the pipe
  }
  const serverPath = fileURLToPath(new URL('./daemon/server.js', import.meta.url));
  const args = [serverPath, '--session', session];
  if (opts.headed) args.push('--headed');
  if (opts.record) args.push('--record');
  if (opts.script) args.push('--script');
  if (opts.learn) args.push('--learn');
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: process.env,
  });
  child.unref();

  const deadline = Date.now() + 15_000;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      return await connectValidated(sock);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`daemon did not come up for session "${session}": ${(lastErr as Error)?.message}`);
}

/**
 * `timeoutMs` guards the control commands (ping/stop): a daemon that is wedged
 * — rather than merely busy — must not hang the CLI indefinitely. `do` passes
 * no timeout; the daemon enforces its own instruction deadline.
 */
function request(
  conn: net.Socket,
  command: Request['command'],
  args: Record<string, unknown>,
  onProgress?: (m: string) => void,
  timeoutMs?: number,
): Promise<ResultFrame> {
  return new Promise((resolve, reject) => {
    const req: Request = { id: Date.now() % 1_000_000, command, args };
    const decoder = new LineDecoder<Frame>();
    const timer = timeoutMs
      ? setTimeout(() => {
          cleanup();
          reject(new Error(`${command} timed out after ${timeoutMs}ms — daemon not responding`));
        }, timeoutMs)
      : undefined;
    const cleanup = () => {
      clearTimeout(timer);
      conn.removeListener('data', onData);
      conn.removeListener('error', onError);
      conn.removeListener('close', onClose);
    };
    const onData = (chunk: Buffer) => {
      let frames: Frame[];
      try {
        frames = decoder.push(chunk);
      } catch (err) {
        cleanup();
        return reject(err);
      }
      for (const frame of frames) {
        if (frame.type === 'progress') onProgress?.(frame.message);
        else {
          cleanup();
          resolve(frame);
        }
      }
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onClose = () => {
      cleanup();
      reject(new Error('connection closed before result'));
    };
    conn.on('data', onData);
    conn.on('error', onError);
    conn.on('close', onClose);
    conn.write(encodeFrame(req));
  });
}

// --- output helpers ---

let jsonWritten = false;
let activeCommand = 'command';
function emitJson(data: object, stage: string, outcome: string, nextActions: Array<{ command: string; args: string[]; step?: string }> = []): void {
  jsonWritten = true;
  console.log(JSON.stringify({ ...data, schemaVersion: 1, stage, outcome, nextActions }, null, 2));
}

function emitCommandJson(data: object): void {
  const value = data as Record<string, any>;
  const outcome = value.refused ? 'blocked' : value.converged === false ? 'not-converged' : value.dryRun ? 'previewed'
    : value.specCheck && !value.specCheck.ran ? 'unavailable' : value.specCheck && !value.specCheck.passed ? 'failed'
    : value.report?.status ?? value.status ?? (value.ok === false ? 'failed' : value.wrote ? 'written' : 'success');
  emitJson(data, activeCommand, outcome);
}

function fail(message: string, code: 1 | 2 = 2): never {
  if (process.argv.includes('--json') && !jsonWritten) emitJson({ error: { code: code === 2 ? 'unavailable' : 'failed', message } }, 'command', code === 2 ? 'unavailable' : 'failed');
  console.error(`sitelooper: ${message}`);
  process.exit(code);
}

function printResult(res: ResultFrame, json: boolean): unknown {
  if (!res.ok) fail(res.error ?? 'unknown error', res.errorKind === 'infra' ? 2 : 1);
  if (json) console.log(JSON.stringify(res.data, null, 2));
  return res.data;
}

// --- main ---

async function main(): Promise<void> {
  aliasLegacyEnv(); // honor legacy BROWSER_PILOT_* env vars — see paths.ts
  const { command, positional, flags } = parseArgv(process.argv.slice(2));
  activeCommand = command;
  if (!command || flags.has('help') || command === 'help') {
    console.log(USAGE);
    process.exit(command ? 0 : 2);
  }

  const session = validateSessionName(String(flags.get('session') ?? 'default'));
  const json = flags.has('json');
  const verbose = flags.has('verbose');
  // --progress streams the agent's actions to stderr without the full --verbose
  // token accounting, so it composes with --json (JSON stays clean on stdout).
  const onProgress = verbose || flags.has('progress') ? (m: string) => console.error(`  · ${m}`) : undefined;

  if (flags.has('force')) fail('--force was split: use --allow-demoted to permit a demoted pin, or --overwrite-spec to replace your spec', 2);
  if (flags.has('instruction-file') || flags.has('stdin')) {
    if (!['do', 'rerecord'].includes(command)) fail('--instruction-file and --stdin are supported by do and rerecord', 2);
    if (flags.has('instruction-file') && flags.has('stdin')) fail('choose --instruction-file or --stdin', 2);
    if ((command === 'do' && positional.length) || flags.has('instruction')) fail('supply the instruction only once', 2);
    const instruction = fs.readFileSync(flags.has('stdin') ? 0 : String(flags.get('instruction-file')), 'utf8').trim();
    if (!instruction) fail('instruction input is empty', 2);
    if (command === 'do') positional.push(instruction);
    else flags.set('instruction', instruction);
  }

  // Commands that don't need (or must not start) a daemon:
  if (command === 'init') {
    const file = path.resolve('sitelooper.config.json');
    const config = { vars: {}, requiredVars: [], outputDir: 'tests/sitelooper', snapshotFile: '.sitelooper/procedures.json', verificationRuns: 3, fixtureIsolation: false, playwright: {} };
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
    if (json) emitJson({ file, config }, 'project', 'created');
    else console.log(`created ${file}; configure resetCommand or fixtureIsolation before build`);
    return;
  }
  if (command === 'flow' && positional[0] === 'export') {
    if (!positional[1] || !flags.get('out')) fail('usage: flow export <flow> --out <bundle.json>', 2);
    const outFile = path.resolve(String(flags.get('out')));
    const result = exportFlowBundle(positional[1], { outFile });
    if (json) emitJson(result, 'recorded', result.missingSkills.length ? 'blocked' : 'exported');
    else console.log(`exported ${outFile}`);
    if (result.missingSkills.length) fail(`snapshot is incomplete; missing procedures: ${result.missingSkills.join(', ')}`, 2);
    return;
  }
  if (command === 'build') {
    await buildCommand(positional, flags, json, onProgress);
    return;
  }
  if (command === 'repair' && positional[0] === 'apply') {
    if (!positional[1]) fail('usage: repair apply <proposal.json>', 2);
    const result = applyProposal(positional[1]);
    if (json) emitJson(result, 'repair', 'applied');
    else console.log(`applied ${result.target}; no browser executions`);
    return;
  }
  if (command === 'config' && positional[0] === 'set') {
    const [, key, value] = positional;
    if (!key || value === undefined) fail('usage: config set <provider|model|fallbackModel|baseUrl|apiKey> <value>', 2);
    const merged = writeGlobalConfig({ [key]: value });
    const shown = { ...merged, ...(merged.apiKey ? { apiKey: '***' } : {}) };
    console.log(`${globalConfigPath()}: ${JSON.stringify(shown)}`);
    console.log('applies to the next instruction — running daemons re-read this file per call');
    return;
  }
  if (command === 'doctor') {
    const { runDoctor } = await import('./doctor.js');
    process.exit(await runDoctor(json));
  }
  if (command === 'skills' && positional[0] === 'repair') {
    await repairCommand(positional, flags, json);
    return;
  }
  if (command === 'skills') {
    skillsCommand(positional, flags, json);
    return;
  }
  if (command === 'flow' && positional[0] !== undefined && positional[0] !== 'run') {
    flowCommand(positional, json);
    return;
  }
  if (command === 'compile') {
    await compileCommand(positional, flags, json);
    return;
  }
  if (command === 'repair') {
    await repairFlowCommand(positional, flags, json, onProgress);
    return;
  }
  if (command === 'check') {
    checkSpecCommand(positional, flags, json, onProgress);
    return;
  }
  if (command === 'rerecord') {
    await rerecordFlowCommand(positional, flags, json, onProgress);
    return;
  }
  if (command === 'session') {
    if (positional[0] !== 'list') fail(`unknown subcommand "session ${positional[0] ?? ''}" (try: session list)`);
    await listSessions(json);
    return;
  }
  if (command === 'stop') {
    const names = flags.has('all') ? allSessionNames() : [session];
    const results: Array<{ session: string; status: string; error?: string; flow?: { path?: string }; [key: string]: unknown }> = [];
    for (const name of names) {
      let conn: net.Socket;
      try {
        conn = await connect(socketPath(name));
      } catch {
        results.push({ session: name, status: 'not-running' });
        if (!json && !flags.has('all')) console.log(`not running: ${name}`);
        continue;
      }
      try {
        // Generous: the daemon aborts any in-flight instruction and lets it
        // unwind before closing the browser. Reachable-but-unresponsive is a
        // real failure worth reporting, not a silent "not running".
        //
        // A --save-flow stop is doing real work, not just unwinding: flow
        // export includes the post-session relabel (an LLM call, time-boxed
        // daemon-side), read-back pinning and the flow lint. fwod26 hit the
        // old shared 20s budget mid-export — the client gave up, the sweep
        // read "flow was never saved" and SKIPPED both replays, while the
        // detached daemon finished writing a perfectly good flow seconds
        // later. Reachable-and-working must be allowed to finish.
        // 150s: the relabel pass inside stop may ride out a full OpenRouter
        // rate-limit wait (its own 100s timebox) and the export still needs room.
        const stopTimeout = flags.get('save-flow') ? 150_000 : 20_000;
        const res = await request(conn, 'stop', { saveFlow: flags.get('save-flow') || undefined }, undefined, stopTimeout);
        if (!res.ok) throw new Error(res.error ?? 'stop failed');
        const data = res.data as { preempted?: boolean; videos?: string[]; flow?: { path?: string; name?: string; steps?: number; vars?: string[]; warnings?: string[]; error?: string } } | undefined;
        results.push({ ...data, session: name, status: data?.flow?.error ? 'failed' : 'stopped' });
        if (!json) {
          console.log(`stopped: ${name}${data?.preempted ? ' (interrupted a running instruction)' : ''}`);
          for (const video of data?.videos ?? []) console.log(`  video: ${video}`);
          if (data?.flow?.error) console.error(`  flow not saved: ${data.flow.error}`);
          else if (data?.flow?.path) {
            console.log(`  flow "${data.flow.name}" saved: ${data.flow.steps} step(s)${data.flow.vars?.length ? `, vars ${data.flow.vars.join(', ')}` : ''} → ${data.flow.path}`);
            for (const w of data.flow.warnings ?? []) console.error(`  warning: ${w}`);
          }
        }
      } catch (err) {
        results.push({ session: name, status: 'failed', error: (err as Error).message });
        console.error(`sitelooper: could not stop ${name}: ${(err as Error).message}`);
      } finally {
        conn.destroy();
      }
    }
    const failed = results.some((result) => result.status === 'failed');
    if (json) emitJson({ sessions: results, artifacts: results.flatMap((r) => r.flow?.path ? [r.flow.path] : []) }, 'recorded', failed ? 'failed' : 'success');
    if (failed) process.exit(1);
    return;
  }

  const conn = await connectOrSpawn(session, {
    headed: flags.has('headed'),
    record: flags.has('record'),
    script: flags.has('script'),
    learn: flags.has('learn'),
  }).catch((err) => fail(err.message));

  try {
    switch (command) {
      case 'do': {
        const instruction = positional.join(' ').trim();
        if (!instruction) fail('do requires an instruction', 2);
        const res = await request(
          conn,
          'do',
          {
            instruction,
            maxTurns: flags.has('max-turns') ? Number(flags.get('max-turns')) : undefined,
            timeoutS: flags.has('timeout') ? Number(flags.get('timeout')) : undefined,
            turnTimeoutS: flags.has('turn-timeout') ? Number(flags.get('turn-timeout')) : undefined,
            provider: flags.get('provider') || undefined,
            model: flags.get('model') || undefined,
            baseUrl: flags.get('base-url') || undefined,
            fallbackModel: flags.get('fallback-model') || undefined,
            escalate: flags.has('no-escalate') ? false : undefined,
          },
          onProgress,
        );
        if (!res.ok) fail(res.error ?? 'unknown error', res.errorKind === 'infra' ? 2 : 1);
        const data = res.data as {
          report: Report;
          turns: number;
          usage: { promptTokens: number; completionTokens: number; cachedTokens: number };
          transcriptTail?: string[];
          actions?: { tool: string; args: string; ok: boolean }[];
          finalState?: { url: string; title?: string };
          screenshots: string[];
          model: string;
          fallbackModel?: string;
          escalation?: {
            from: string;
            to: string;
            reason: string;
            firstAttempt: {
              status: string;
              turns: number;
              usage: { promptTokens: number; completionTokens: number; cachedTokens: number };
            };
            rescued: boolean;
          };
          skill?: {
            listed: string[];
            invoked?: string;
            stepsReplayed: number;
            stepsTotal: number;
            repaired: boolean;
            refused: boolean;
            tier?: string;
            deterministicActions: number;
            totalActions: number;
          };
          learned?: { compiled?: string; merged?: string; variantOf?: string; superseded?: string; outcome?: { skill: string; status: string; ok: boolean } };
        };
        if (json) {
          emitCommandJson(data);
        } else {
          const mark = data.report.status === 'success' ? 'OK' : data.report.status.toUpperCase();
          console.log(`[${mark}] ${data.report.summary}`);
          if (data.escalation) {
            const e = data.escalation;
            console.log(
              `  escalated: ${e.from} blocked after ${e.firstAttempt.turns} turns → retried on ${e.to} (${e.rescued ? 'rescued' : 'still not resolved'})`,
            );
            console.log(`    blocked because: ${e.reason}`);
          }
          if (data.skill?.invoked) {
            const k = data.skill;
            console.log(
              `  skill: ${k.tier === 'A' ? 'replayed without the model' : 'replayed'} ${k.invoked} ${k.stepsReplayed}/${k.stepsTotal} steps${k.repaired ? ' — agent repaired the rest' : ''}${k.refused ? ' (refused)' : ''}`,
            );
          }
          if (data.learned) {
            const l = data.learned;
            const bits = [
              l.compiled ? `stored ${l.compiled}${l.variantOf ? ` (variant of ${l.variantOf})` : ''}` : '',
              l.merged ? `merged into ${l.merged}` : '',
              l.outcome ? `${l.outcome.skill} → ${l.outcome.status}` : '',
              l.superseded ? `${l.superseded} superseded` : '',
            ].filter(Boolean);
            if (bits.length) console.log(`  learned: ${bits.join('; ')}`);
          }
          if (data.report.details) console.log(data.report.details);
          if (data.report.evidence?.values) {
            for (const [k, v] of Object.entries(data.report.evidence.values)) console.log(`  ${k}: ${v}`);
          }
          if (data.report.evidence?.capturedDialogs?.length) {
            console.log(`  dialogs: ${data.report.evidence.capturedDialogs.join(' | ')}`);
          }
          if (data.screenshots.length) {
            console.log(`  screenshots: ${data.screenshots.length}`);
            for (const s of data.screenshots) console.log(`    ${s}`);
          }
          if (data.actions?.length) {
            // On bail-out: the state-changing actions that ran, so you can verify
            // before resuming rather than blindly repeating them.
            console.log('--- actions taken (verify before resuming) ---');
            for (const a of data.actions) console.log(`  ${a.ok ? '✓' : '✗'} ${a.tool} ${a.args}`);
          }
          if (data.transcriptTail?.length && !data.actions?.length) {
            // Nothing ran — the agent's own reasoning is the only evidence there is.
            console.log('--- transcript tail (no tool calls ran) ---');
            for (const line of data.transcriptTail) console.log(`  ${line}`);
          }
          if (data.finalState) {
            console.log(`--- browser left at: ${data.finalState.url}${data.finalState.title ? ` — "${data.finalState.title}"` : ''}`);
          }
        }
        if (verbose) {
          const u = data.usage;
          const fresh = u.promptTokens - u.cachedTokens;
          const hit = u.promptTokens ? Math.round((u.cachedTokens / u.promptTokens) * 100) : 0;
          const models = data.escalation ? `${data.escalation.from} → ${data.escalation.to}` : data.model;
          console.error(
            `  · ${data.turns} turns, ${u.promptTokens} prompt (${u.cachedTokens} cached / ${fresh} fresh, ${hit}% hit) + ${u.completionTokens} completion tokens (${models})`,
          );
        }
        process.exit(data.report.status === 'success' ? 0 : 1);
        break;
      }

      case 'var': {
        const spec = positional.join(' ');
        const eq = spec.indexOf('=');
        if (eq < 1) fail('usage: var <name>=<value>', 2);
        const data = printResult(await request(conn, 'var', { name: spec.slice(0, eq).trim(), value: spec.slice(eq + 1) }), json) as { vars: Record<string, string> };
        if (!json) console.log(`vars: ${Object.entries(data.vars).map(([k, v]) => `${k}=${v}`).join(', ')}`);
        break;
      }

      case 'run': {
        const flowName = positional[0];
        if (!flowName) fail('run requires a flow name (see: flow list)', 2);
        const vars: Record<string, string> = {};
        // --var k=v may repeat; parseArgv keeps only the last, so re-scan argv.
        for (let i = 0; i < process.argv.length - 1; i++) {
          if (process.argv[i] === '--var') {
            const kv = process.argv[i + 1];
            const eq = kv.indexOf('=');
            if (eq > 0) vars[kv.slice(0, eq)] = kv.slice(eq + 1);
          }
        }
        const res = await request(
          conn,
          'run',
          {
            name: flowName,
            vars,
            maxTurns: flags.has('max-turns') ? Number(flags.get('max-turns')) : undefined,
            timeoutS: flags.has('timeout') ? Number(flags.get('timeout')) : undefined,
            escalate: flags.has('no-escalate') ? false : undefined,
            recoveryModel: flags.get('recovery-model') || undefined,
          },
          onProgress,
        );
        if (!res.ok) fail(res.error ?? 'unknown error', res.errorKind === 'infra' ? 2 : 1);
        const data = res.data as {
          flow: string; status: string; passed: number; total: number; repinned: number; wallMs: number;
          steps: { id: string; status: string; summary?: string; tier?: string | null; replayed?: string | null; repaired?: boolean; turns?: number; repinned?: string; satisfied?: boolean }[];
        };
        if (json) emitCommandJson(data);
        else {
          for (const st of data.steps) {
            const mark = st.status === 'success' ? 'OK' : st.status.toUpperCase();
            // `satisfied` is not a cheaper replay, it is no replay at all: the
            // page already showed this step's goal for this record.
            const how = st.satisfied ? 'satisfied' : st.tier === 'A' ? 'replay' : st.replayed ? (st.repaired ? `replay+repair ${st.replayed}` : `replay ${st.replayed}`) : 'agent';
            console.log(`[${mark}] ${st.id}  (${how}${st.turns ? `, ${st.turns} turns` : ''})${st.repinned ? ` re-pinned ${st.repinned}` : ''}`);
            if (st.status !== 'success' && st.summary) console.log(`       ${st.summary}`);
          }
          console.log(`${data.flow}: ${data.passed}/${data.total} steps, ${(data.wallMs / 1000).toFixed(1)}s${data.repinned ? `, ${data.repinned} step(s) re-pinned` : ''} — ${data.status}`);
        }
        process.exit(data.status === 'success' ? 0 : 1);
        break;
      }

      case 'open': {
        if (!positional[0]) fail('open requires a URL', 2);
        const data = printResult(await request(conn, 'open', { url: positional[0] }, onProgress), json) as {
          url: string;
          title: string;
        };
        if (!json) console.log(`${data.title} — ${data.url}`);
        break;
      }

      case 'brief': {
        const file = positional[0];
        if (!file || !fs.existsSync(file)) fail(`brief requires an existing file (got: ${file ?? 'nothing'})`, 2);
        const text = fs.readFileSync(path.resolve(file), 'utf8');
        const data = printResult(await request(conn, 'brief', { text, append: flags.has('append') }), json) as {
          briefingChars: number;
        };
        if (!json) console.log(`briefing loaded (${data.briefingChars} chars)`);
        break;
      }

      case 'note': {
        const text = positional.join(' ').trim();
        if (!text) fail('note requires text', 2);
        const data = printResult(await request(conn, 'note', { text }), json) as { notes: number };
        if (!json) console.log(`noted (${data.notes} notes in session)`);
        break;
      }

      case 'reset': {
        const data = printResult(await request(conn, 'reset', {}), json) as { clearedMessages: number };
        if (!json) console.log(`conversation reset (${data.clearedMessages} message(s) cleared; browser, briefing, and notes kept)`);
        break;
      }

      case 'peek': {
        const data = printResult(
          await request(conn, 'peek', {
            selector: flags.get('selector') || undefined,
            interactiveOnly: flags.has('interactive'),
          }),
          json,
        ) as { url: string; title: string; snapshot: string };
        if (!json) {
          console.log(`${data.title} — ${data.url}`);
          console.log(data.snapshot);
        }
        break;
      }

      case 'script': {
        const data = printResult(
          await request(conn, 'script', {
            path: positional[0],
            title: flags.get('title') || undefined,
            clear: flags.has('clear'),
          }),
          json,
        ) as { path?: string; steps: number; instructions?: number; recording?: boolean; cleared?: boolean };
        if (!json) {
          if (data.path) {
            console.log(`${data.path} (${data.steps} action(s), ${data.instructions ?? 0} instruction(s))`);
            if (data.cleared) console.log('recording cleared');
            if (!data.recording) {
              console.log('note: this session is not recording — generated from previously recorded actions');
            }
          } else {
            console.log(`recording cleared (${data.steps} action(s) discarded)`);
          }
        }
        break;
      }

      case 'screenshot': {
        const data = printResult(
          await request(conn, 'screenshot', { path: positional[0], fullPage: flags.has('full-page') }),
          json,
        ) as { path: string };
        if (!json) console.log(data.path);
        break;
      }

      case 'config': {
        const data = printResult(await request(conn, 'config', {}), true);
        void data;
        break;
      }

      default:
        fail(`unknown command "${command}"\n\n${USAGE}`, 2);
    }
  } finally {
    conn.destroy();
  }
  process.exit(0);
}

// --- skills (reads the store directly; no daemon involved) ---

function skillsCommand(positional: string[], flags: Map<string, string | boolean>, json: boolean): void {
  const store = new SkillStore();
  const sub = positional[0] ?? 'list';
  const origin = flags.get('origin') ? String(flags.get('origin')) : undefined;
  switch (sub) {
    case 'list': {
      const skills = (origin ? store.list(origin) : store.all()).sort((a, b) => a.origin.localeCompare(b.origin) || b.stats.uses - a.stats.uses);
      if (json) {
        console.log(JSON.stringify(skills.map(skillSummary), null, 2));
        return;
      }
      if (!skills.length) {
        console.log(`no stored procedures${origin ? ` for ${origin}` : ''} (store: ${store.dir})`);
        return;
      }
      let last = '';
      for (const s of skills) {
        if (s.origin !== last) {
          console.log(`${s.origin}`);
          last = s.origin;
        }
        const pct = Math.round(successRate(s) * 100);
        console.log(
          `  ${s.id}  ${s.status.padEnd(11)} ${String(s.steps.length).padStart(2)} steps  ${s.stats.successes}/${s.stats.uses} (${pct}%)${s.variantOf ? `  variant of ${s.variantOf}` : ''}`,
        );
        console.log(`           ${clipText(s.template, 110)}`);
      }
      console.log(`store: ${store.dir}`);
      return;
    }
    case 'show': {
      const id = positional[1];
      if (!id) fail('usage: skills show <id>', 2);
      const s = store.get(id);
      if (!s) fail(`no skill ${id}`, 1);
      if (json) {
        console.log(JSON.stringify(s, null, 2));
        return;
      }
      console.log(`${s.id}  ${s.status}  ${s.origin}`);
      console.log(`template: ${s.template}`);
      console.log(`starts on: ${s.preconditions.urlPattern}`);
      const params = Object.entries(s.params);
      console.log(params.length ? `params: ${params.map(([k, p]) => `${k} = e.g. ${JSON.stringify(p.example)} (steps ${p.usedIn.join(',')})`).join('; ')}` : 'params: none');
      console.log(
        `stats: ${s.stats.successes}/${s.stats.uses} ok, ${s.stats.partial} partial, ${s.stats.fallthroughs} locator fallthrough(s)${
          Object.keys(s.stats.failedAtStep).length ? `, failed at step ${Object.entries(s.stats.failedAtStep).map(([k, v]) => `${k}×${v}`).join(', ')}` : ''
        }; created ${s.provenance.created} in session ${s.provenance.session}${s.provenance.model ? ` by ${s.provenance.model}` : ''}`,
      );
      if (s.variantOf) console.log(`variant of: ${s.variantOf}`);
      console.log('steps:');
      s.steps.forEach((st, i) => {
        const target = st.locators.target?.[0] ? candidateExpr(st.locators.target[0]) : st.args.target ? String(st.args.target) : '';
        const fallbacks = (st.locators.target?.length ?? 0) > 1 ? ` (+${st.locators.target!.length - 1} fallback)` : '';
        const args = Object.entries(st.args)
          .filter(([k]) => k !== 'target' && k !== 'source')
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(' ');
        const literal = Object.entries(st.args)
          .filter(([k, v]) => ['value', 'text', 'option'].includes(k) && typeof v === 'string' && !/\{\{v\d+\}\}/.test(v))
          .map(([, v]) => JSON.stringify(v));
        console.log(
          `  ${String(i + 1).padStart(2)}. ${st.tool.padEnd(14)} ${target}${fallbacks}${args ? '  ' + args : ''}${st.label ? `  → ${st.label}` : ''}${
            literal.length ? `  [literal value ${literal.join(', ')} — not a parameter]` : ''
          }${st.via ? `  (via ${st.via.skill} #${st.via.step})` : ''}`,
        );
        if (st.expect?.urlPattern) console.log(`      expect url ${st.expect.urlPattern}`);
      });
      if (s.reportTemplate?.summary) console.log(`report: ${clipText(fillParams(s.reportTemplate.summary, {}), 200)}`);
      return;
    }
    case 'rm': {
      const id = positional[1];
      if (!id) fail('usage: skills rm <id>', 2);
      if (!store.remove(id)) fail(`no skill ${id}`, 1);
      console.log(`removed ${id}`);
      return;
    }
    case 'clear': {
      if (flags.has('all')) {
        let n = 0;
        for (const o of store.origins()) n += store.clear(o);
        console.log(`cleared ${n} skill(s) across all origins`);
        return;
      }
      if (!origin) fail('usage: skills clear --origin <origin> | --all', 2);
      console.log(`cleared ${store.clear(origin)} skill(s) for ${origin}`);
      return;
    }
    default:
      fail(`unknown subcommand "skills ${sub}" (try: list, show <id>, rm <id>, clear)`, 2);
  }
}

function skillSummary(s: Skill) {
  return {
    id: s.id,
    origin: s.origin,
    status: s.status,
    template: s.template,
    steps: s.steps.length,
    params: Object.fromEntries(Object.entries(s.params).map(([k, p]) => [k, p.example])),
    uses: s.stats.uses,
    successes: s.stats.successes,
    partial: s.stats.partial,
    urlPattern: s.preconditions.urlPattern,
    ...(s.variantOf ? { variantOf: s.variantOf } : {}),
    created: s.provenance.created,
  };
}

function clipText(text: string, max: number): string {
  return clip(text.replace(/\s+/g, ' '), max);
}

function flowCommand(positional: string[], json: boolean): void {
  const op = positional[0] ?? 'list';
  if (op === 'list') {
    const flows = listFlows();
    if (json) console.log(JSON.stringify(flows.map((f) => ({ name: f.name, steps: f.steps.length, vars: f.vars, origin: f.origin })), null, 2));
    else if (!flows.length) console.log('no saved flows');
    else for (const f of flows) console.log(`${f.name}  ${f.steps.length} step(s)  ${f.vars.length ? `vars ${f.vars.join(', ')}` : 'no vars'}  ${f.origin}`);
    return;
  }
  if (op === 'show') {
    const flow = loadFlow(positional[1] ?? '');
    if (!flow) fail(`no flow "${positional[1] ?? ''}"`, 1);
    if (json) {
      console.log(JSON.stringify(flow, null, 2));
      return;
    }
    console.log(`${flow.name}  ${flow.origin}  (recorded ${flow.provenance.created} in session ${flow.provenance.session})`);
    console.log(`starts at: ${flow.startUrl}`);
    console.log(flow.vars.length ? `vars: ${flow.vars.join(', ')}` : 'vars: none');
    for (const st of flow.steps) {
      console.log(`  ${st.id}${st.skill ? ` [${st.skill}]` : ' [no skill]'}${st.outputs.length ? ` → ${st.outputs.join(', ')}` : ''}`);
      console.log(`     ${st.instruction.length > 120 ? st.instruction.slice(0, 120) + '…' : st.instruction}`);
    }
    return;
  }
  fail(`unknown "flow ${op}" (try: list, show <name>)`, 2);
}

// --- compile (reads the flow + skill store directly; no daemon involved) ---

async function compileCommand(positional: string[], flags: Map<string, string | boolean>, json: boolean): Promise<void> {
  const flowNameOrPath = positional[0];
  if (!flowNameOrPath) fail('usage: compile <flow-or-bundle> [--out <dir>] [--allow-demoted] [--overwrite-spec] [--json]', 2);
  const project = loadProjectConfig();
  const outDir = flags.get('out') ? String(flags.get('out')) : project.outputDir;
  let result: ReturnType<typeof compileFlow>;
  try {
    result = compileFlow(flowNameOrPath, { outDir, snapshotFile: fs.existsSync(project.snapshotFile) ? project.snapshotFile : undefined, allowDemoted: flags.has('allow-demoted'), overwriteSpec: flags.has('overwrite-spec') });
  } catch (err) {
    fail(`compile failed: ${(err as Error).message}`, 2);
  }
  if (json) {
    emitJson(result, 'compiled', result.refused || !result.compilable ? 'blocked' : 'compiled', result.diagnostics.flatMap((d) => d.action ? [d.action] : []));
  } else {
    // Diagnostics FIRST — what is wrong, the evidence, and the command that
    // fixes it — ahead of the file list, which is not what a caller needs when
    // the answer is "re-record 08-open".
    for (const d of result.diagnostics) console.error(formatDiagnostic(d));
    if (result.diagnostics.length) console.error('');
    if (result.refused) {
      console.error('nothing written: the error(s) above are about the RECORDING, not the app — a compiled spec would fail at a locator and read as drift.');
      console.error('re-record the step(s) with the fix command above, or pass --allow-demoted to compile the demoted pin anyway.');
    } else {
      console.log(`flow: ${result.flowFile}`);
      console.log(result.specFile ? `spec: ${result.specFile}` : 'spec: unchanged (already exists — pass --overwrite-spec to overwrite)');
    }
    // Anything the emitter said that no diagnostic above already carries.
    const reported = new Set(result.diagnostics.map(diagnosticLine));
    for (const w of result.warnings) if (!reported.has(w)) console.error(`  warning: ${w}`);
  }
  if (result.refused) {
    fail('refused: a step is pinned to a demoted skill — see the diagnostics above (--allow-demoted compiles it anyway)', 2);
  }
  if (!result.compilable) {
    fail(`not compilable: ${result.compileBlockers.join('; ')}`, 2);
  }
}

/**
 * `sitelooper check <name.flow.ts>` — run the emitted spec once, as a user would.
 *
 * The standalone half of `repair --check-spec`, and the same code underneath.
 * It exists on its own because the question ("does the compiled spec actually
 * pass under plain Playwright?") is worth asking about a file nobody is
 * repairing: after a `compile`, after a hand edit to the `.spec.ts`, or in CI
 * next to the sitelooper-free artifacts it is supposed to have produced.
 *
 * No daemon and no model are involved: this spawns `npx playwright test` over
 * a copy of the two files with a config of its own, and reports the report.
 */
function checkSpecCommand(
  positional: string[],
  flags: Map<string, string | boolean>,
  json: boolean,
  onProgress?: (m: string) => void,
): void {
  const file = positional[0];
  if (!file) fail('usage: check <name.flow.ts> [--var k=v ...] [--reset-cmd "<cmd>"] [--json]', 2);
  if (!fs.existsSync(file)) fail(`could not read ${file}`, 2);
  if (flags.has('ready')) {
    readinessCommand(file, flags, json, onProgress);
    return;
  }
  const result = runSpecCheck({
    flowFile: file,
    ...checkOptions(flags),
    liveReplayPassed: false,
    onProgress: onProgress ?? ((m) => console.error(m)),
  });
  if (json) emitJson({ file, specCheck: result }, 'spec-check', !result.ran ? 'unavailable' : result.passed ? 'passed' : 'failed');
  else {
    console.log(result.verdict);
    for (const d of result.drift) console.log(`  ${d}`);
    if (result.workspace) console.log(`  workspace: ${result.workspace}`);
  }
  if (!result.ran) process.exit(2);
  if (result.ran && !result.passed) process.exit(4);
}

function checkOptions(flags: Map<string, string | boolean>) {
  const config = loadProjectConfig();
  return {
    vars: { ...config.vars, ...varFlags() },
    resetCmd: flags.get('reset-cmd') ? String(flags.get('reset-cmd')) : config.resetCommand,
    configFile: flags.get('config') ? path.resolve(String(flags.get('config'))) : config.playwright.config,
    project: flags.get('project') ? String(flags.get('project')) : config.playwright.project,
    isolated: flags.has('isolated'),
    cwd: config.root,
    env: { ...(flags.get('target-url') || config.targetUrl ? { SITELOOPER_TARGET_URL: String(flags.get('target-url') || config.targetUrl) } : {}) },
  };
}

function readinessCommand(file: string, flags: Map<string, string | boolean>, json: boolean, onProgress?: (m: string) => void, compilation?: ReturnType<typeof compileFlow>): void {
  const config = loadProjectConfig();
  const result = runReadinessCheck({
    flowFile: file,
    ...checkOptions(flags),
    runs: flags.has('runs') ? Number(flags.get('runs')) : config.verificationRuns,
    fixtureIsolation: flags.has('fixture-isolation') || config.fixtureIsolation,
    requiredInputs: config.requiredVars,
    negativeSpec: flags.get('negative-spec') ? path.resolve(String(flags.get('negative-spec'))) : config.negativeSpec,
    onProgress: onProgress ?? ((m: string) => console.error(m)),
  });
  if (json) emitJson({ ...(compilation ? { compilation } : {}), readiness: result }, result.state, result.outcome);
  else {
    console.log(`readiness: ${result.outcome} (${result.runs.length} execution(s))`);
    console.log(`execution: ${result.executionVerified ? 'verified' : 'not verified'}`);
    for (const blocker of result.blockers) console.error(`  ${blocker}`);
    console.log(`failure detection: ${result.failureDetection}`);
  }
  if (result.outcome !== 'verified') process.exit(result.outcome === 'unavailable' || result.outcome === 'blocked' ? 2 : 4);
}

async function buildCommand(positional: string[], flags: Map<string, string | boolean>, json: boolean, onProgress?: (m: string) => void): Promise<void> {
  if (!positional[0]) fail('usage: build <flow-or-bundle> [--var k=v] [--reset-cmd <cmd> | --fixture-isolation] [--json]', 2);
  const config = loadProjectConfig();
  const result = compileFlow(positional[0], {
    outDir: flags.get('out') ? String(flags.get('out')) : config.outputDir,
    snapshotFile: fs.existsSync(config.snapshotFile) ? config.snapshotFile : undefined,
    allowDemoted: flags.has('allow-demoted'), overwriteSpec: flags.has('overwrite-spec'),
  });
  if (result.refused || !result.compilable || !result.flowFile) {
    if (json) emitJson({ compilation: result }, 'compiled', 'blocked', result.diagnostics.flatMap((d) => d.action ? [d.action] : []));
    else {
      for (const d of result.diagnostics) console.error(formatDiagnostic(d));
      for (const blocker of result.compileBlockers) console.error(`  ${blocker}`);
    }
    process.exit(2);
  }
  if (!json) console.log(`compiled ${result.flowFile}; verifying emitted Playwright code`);
  readinessCommand(result.flowFile, flags, json, onProgress, result);
}

function allSessionNames(): string[] {
  try {
    return fs
      .readdirSync(sessionsDir(), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

async function listSessions(json: boolean): Promise<void> {
  const names = allSessionNames();
  const rows: { session: string; running: boolean; pid?: number }[] = [];
  for (const name of names) {
    try {
      const conn = await connect(socketPath(name), 500);
      const res = await request(conn, 'ping', {}, undefined, 5_000);
      conn.destroy();
      const data = res.data as { pid: number };
      rows.push({ session: name, running: true, pid: data.pid });
    } catch {
      rows.push({ session: name, running: false });
    }
  }
  if (json) console.log(JSON.stringify(rows, null, 2));
  else if (!rows.length) console.log('no sessions');
  else for (const r of rows) console.log(`${r.session}  ${r.running ? `running (pid ${r.pid})` : 'stopped'}`);
}

main().catch((err) => fail(err?.message ?? String(err)));

// --- post-session repair (SLOW MODE) ---

/**
 * Drain one run's drift tickets, after the timed run is over:
 *  - localized drift that already self-healed (a fallback resolved) → promote
 *    that fallback to primary in the stored skill. Cheap, deterministic.
 *  - localized drift with a dead chain → ask the repair model to re-derive
 *    the moved control's locator on the live page, verify it resolves, and
 *    store the patched chain as a provisional VARIANT that must earn adoption
 *    through the normal lifecycle.
 *  - low similarity → broad redesign: flag for a fresh record run, never
 *    patch selectors.
 */
async function repairCommand(positional: string[], flags: Map<string, string | boolean>, json: boolean): Promise<void> {
  const file = String(flags.get('drift') ?? positional[1] ?? '');
  if (!file) fail('usage: skills repair --drift <run-drift.json> [--dry-run] [--model M]', 2);
  let tickets: DriftTicket[];
  try {
    tickets = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return fail(`could not read drift tickets from ${file}: ${(err as Error).message}`, 1);
  }
  const dryRun = flags.has('dry-run');
  const store = new SkillStore();
  // The COLD path: a browser of its own, signed into nothing. Kept for the
  // standalone case (a drift sidecar from a CI run, days later, with no
  // session to attach to) — `sitelooper repair <flow.ts>` drains the same
  // tickets inside the run's own session, on a page that is still signed in,
  // and should be preferred whenever the flow file is at hand.
  const wantsPage = !dryRun && triage(tickets).some((a) => a.kind === 'patch-segment');
  const model = flags.get('model') ? String(flags.get('model')) : undefined;
  let browser: import('./daemon/browser.js').BrowserSession | null = null;
  let summary: DrainSummary;
  try {
    let propose;
    let openPage;
    if (wantsPage) {
      const config = resolveProviderConfig({ model });
      const resolved = model ?? (config.fallbackModel && config.fallbackModel !== 'none' ? config.fallbackModel : config.model);
      const provider: Provider = config.provider === 'anthropic' ? new AnthropicProvider({ ...config, model: resolved }) : new OpenAICompatProvider({ ...config, model: resolved });
      propose = llmProposer(provider);
      const { BrowserSession } = await import('./daemon/browser.js');
      browser = new BrowserSession({ session: 'repair', persist: false });
      openPage = async (url: string) => {
        const page = await browser!.getPage();
        await page.goto(url, { waitUntil: 'load', timeout: 30_000 }).catch(() => {});
        return page;
      };
    }
    summary = await drainDrift(store, tickets, { dryRun, model, propose, openPage });
  } finally {
    await browser?.close();
  }

  if (json) {
    console.log(JSON.stringify({ tickets: tickets.length, ...summary }, null, 2));
    return;
  }
  console.log(`${tickets.length} drift ticket(s) → ${summary.promoted.length} fallback(s) promoted, ${summary.patched.length} segment(s) patched, ${summary.reRecord.length} flagged for re-record, ${summary.skipped.length} skipped`);
  for (const p of summary.promoted) console.log(`  promoted   ${p.skill} step ${p.step}: ${p.to}${p.dryRun ? ' (dry run)' : ''}`);
  for (const p of summary.patched) console.log(`  patched    ${p.skill} step ${p.step} → variant ${p.variant} (${p.locator})`);
  for (const p of summary.reRecord) console.log(`  re-record  ${p.skill} (${p.flow}/${p.step}): ${p.why}`);
  for (const p of summary.skipped) console.log(`  skipped    ${p.skill}${p.step ? ` step ${p.step}` : ''}: ${p.why}`);
}


// --- repair on a compiled spec (PLAN-self-updating-spec.md, phase 4) ---

/**
 * `--var k=v` may repeat, and `parseArgv` keeps only the last one, so the
 * repeats are re-scanned out of argv. Same rule `run` uses; shared so a flow
 * replayed by `repair` binds exactly what `run` would.
 */
function varFlags(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (let i = 0; i < process.argv.length - 1; i++) {
    if (process.argv[i] === '--var') {
      const kv = process.argv[i + 1];
      const eq = kv.indexOf('=');
      if (eq > 0) vars[kv.slice(0, eq)] = kv.slice(eq + 1);
    }
  }
  return vars;
}


/** Best-effort shutdown of a throwaway repair session (its browser is the only thing holding that profile open). */
async function stopSessionQuietly(name: string): Promise<void> {
  try {
    const conn = await connect(socketPath(name));
    try {
      await request(conn, 'stop', {}, undefined, 30_000);
    } finally {
      conn.destroy();
    }
  } catch {
    /* already gone */
  }
}

/**
 * Replay a staged flow through the daemon exactly as `sitelooper run` does —
 * same spawn, same `run` command, same recovery ladder — with the skill store
 * pointed at the staged temp dir so the run's re-pins, learned variants and
 * candidate evidence land there and nowhere near `~/.sitelooper`.
 *
 * A FRESH session per run, deliberately: the flow's first step signs in, and a
 * session still signed in from the previous run would send that step to model
 * recovery and make the convergence gate measure the wrong thing. The session
 * is stopped on the way out so a converge loop does not leave one browser per
 * iteration running.
 */
async function runStagedFlow(
  staged: { flowFile: string; skillsDir: string },
  vars: Record<string, string>,
  session: string,
  opts: {
    headed: boolean;
    onProgress?: (m: string) => void;
    /**
     * Drain the run's drift tickets on the SAME connection, before the session
     * stops. That is the point of doing it here rather than back in the CLI:
     * the daemon still holds a signed-in page at the url each miss happened
     * on, which is what patch-segment needs and what a cold browser of our own
     * could never have — it lands on the login screen for every authenticated
     * url, and cannot reach a page whose url carries an id this run minted.
     */
    drain?: { dryRun: boolean; model?: string };
  },
): Promise<{ run: FlowRunResult; drained?: DrainSummary }> {
  const prev = { skills: process.env.SITELOOPER_SKILLS, dir: process.env.SITELOOPER_SKILLS_DIR };
  process.env.SITELOOPER_SKILLS = '1';
  process.env.SITELOOPER_SKILLS_DIR = staged.skillsDir;
  try {
    const conn = await connectOrSpawn(session, { headed: opts.headed, record: false, script: false, learn: true });
    try {
      const res = await request(conn, 'run', { name: staged.flowFile, vars }, opts.onProgress);
      if (!res.ok) fail(res.error ?? 'the flow run failed', res.errorKind === 'infra' ? 2 : 1);
      const run = res.data as FlowRunResult;
      if (!opts.drain) return { run };
      const patched = await request(
        conn,
        'patch',
        { tickets: run.driftTickets ?? [], dryRun: opts.drain.dryRun, model: opts.drain.model },
        opts.onProgress,
      );
      if (!patched.ok) fail(patched.error ?? 'the drift drain failed', patched.errorKind === 'infra' ? 2 : 1);
      return { run, drained: patched.data as DrainSummary };
    } finally {
      conn.destroy();
    }
  } finally {
    if (prev.skills === undefined) delete process.env.SITELOOPER_SKILLS;
    else process.env.SITELOOPER_SKILLS = prev.skills;
    if (prev.dir === undefined) delete process.env.SITELOOPER_SKILLS_DIR;
    else process.env.SITELOOPER_SKILLS_DIR = prev.dir;
    await stopSessionQuietly(session);
    // A repair run's session is scratch: its browser profile exists for one
    // replay and a converge loop would otherwise leave one directory per
    // iteration behind. Best effort — a profile Chrome has not finished
    // releasing is left for the OS to clean up rather than failing the run.
    try {
      fs.rmSync(path.join(sessionsDir(), session), { recursive: true, force: true });
    } catch {
      /* still held open — harmless */
    }
  }
}

/**
 * Put the app back where every run of a converge loop expects to find it.
 *
 * `{n}`-minted vars solve half of the accumulation problem (each run works its
 * own records); they do not solve the other half, which is everything the
 * PREVIOUS run left behind — rows in a list a locator counts, a seeded fixture
 * a create step consumes, a queue that grows. A record-creating flow replayed
 * three times is three different apps unless something resets it, and the gate
 * would then be measuring the app's history rather than the spec's stability.
 *
 * Deliberately a shell command rather than anything sitelooper knows how to
 * do: the reset is the application's business (a fixture endpoint, a `docker
 * compose down -v`, a seed script), and the only thing this tool has an
 * opinion about is that a reset which FAILED must stop the run — a converge
 * pass over an un-reset app reports a verdict about nothing.
 */
function runResetCmd(cmd: string | undefined, label: string, say: (m: string) => void): void {
  if (!cmd) return;
  say(`  reset (${label}): ${cmd}`);
  const res = spawnSync(cmd, { shell: true, stdio: 'pipe', encoding: 'utf8' });
  if (res.error) fail(`--reset-cmd could not run: ${res.error.message}`, 2);
  if (res.status !== 0) {
    if (res.stderr?.trim()) console.error(res.stderr.trim());
    fail(`--reset-cmd exited ${res.status ?? 'by signal'} before ${label}; refusing to run against an app that was not reset`, 2);
  }
}

/**
 * `sitelooper repair <name.flow.ts>` — the self-updating half of the compiled
 * runner (PLAN-self-updating-spec.md, "The loop").
 *
 * Lift the owned file back to its IR, stage it into a THROWAWAY store and flow
 * file, replay it against the live app through the daemon (whose recovery
 * ladder is the agent adapting the flow — that is the point), drain the run's
 * drift tickets onto the staged store, re-derive the IR from what the run and
 * the drain left there, and print the difference as English a reviewer can
 * read. Only then, and only if the convergence gate passes, is the `.flow.ts`
 * re-emitted. The `.spec.ts` is never touched: it is the user's file.
 */
async function repairFlowCommand(
  positional: string[],
  flags: Map<string, string | boolean>,
  json: boolean,
  onProgress?: (m: string) => void,
): Promise<void> {
  const file = positional[0];
  if (!file) fail('usage: repair <name.flow.ts> [--var k=v ...] [--out <file>] [--converge <n>] [--reset-cmd "<cmd>"] [--dry-run] [--model M] [--json]', 2);
  let source: string;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return fail(`could not read ${file}: ${(err as Error).message}`, 2);
  }
  let before: SpecFlow;
  try {
    before = liftFlowFile(source).spec;
  } catch (err) {
    if (err instanceof LiftError) {
      return fail(`this file was edited by hand or is not a sitelooper flow file; refusing to repair — ${err.message}`, 2);
    }
    throw err;
  }

  const vars = { ...loadProjectConfig().vars, ...varFlags() };
  const missingVars = before.vars.filter((v) => !(v in vars));
  if (missingVars.length) fail(`flow "${before.name}" needs --var for: ${missingVars.join(', ')}`, 2);
  const converge = flags.has('converge') ? Number(flags.get('converge')) : 1;
  if (!Number.isInteger(converge) || converge < 0) fail('--converge takes a non-negative integer', 2);
  const dryRun = flags.has('dry-run');
  const resetCmd = flags.get('reset-cmd') ? String(flags.get('reset-cmd')) : loadProjectConfig().resetCommand;
  const proposalFile = flags.get('propose') ? path.resolve(String(flags.get('propose'))) : undefined;
  if (proposalFile && (dryRun || flags.has('out') || flags.has('no-check-spec'))) fail('--propose cannot be combined with --dry-run, --out or --no-check-spec', 2);
  if (proposalFile && fs.existsSync(proposalFile)) fail(`proposal already exists: ${proposalFile}`, 2);
  const outFile = flags.get('out') ? String(flags.get('out')) : file;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitelooper-repair-'));
  const staged = stageRepair(before, dir);
  const stamp = Date.now().toString(36);
  // Progress is never silent, only redirected: under --json stdout has to stay
  // parseable, so every line goes to stderr instead of being dropped. sp4od's
  // repair.log had nothing but the final ticket lines because these were
  // discarded, and the per-step tier/status of each run is exactly what a
  // reader of that log needs.
  const say = (m: string) => {
    if (json) console.error(m);
    else console.log(m);
  };
  say(`repairing ${file} (${before.steps.length} step(s)) in ${dir}`);

  // Every run this repair made, in order, with the per-step verdict that
  // decides the convergence gate. The prose version goes to stderr under
  // --json (see `say`); this is the same thing structured, so a reader does
  // not have to parse the log to learn which step needed the model and why.
  type RunReport = {
    label: string;
    passed: number;
    total: number;
    status: string;
    tickets: number;
    steps: Array<{
      id: string;
      status: string;
      tier: string | null;
      summary?: string;
      recovered: boolean;
      fellBack?: string;
      replayed?: string | null;
      repinned?: string;
    }>;
  };
  const runs: RunReport[] = [];
  const noteRun = (label: string, r: FlowRunResult, ticketCount: number): void => {
    runs.push({
      label,
      passed: r.passed,
      total: r.total,
      status: r.status,
      tickets: ticketCount,
      steps: r.steps.map((st) => ({
        id: st.id,
        status: st.status,
        tier: st.tier ?? null,
        ...(st.summary ? { summary: st.summary } : {}),
        recovered: Boolean(st.recovered),
        ...(st.fellBack ? { fellBack: st.fellBack } : {}),
        // WHICH procedure actually ran, not only how well it went. sp8od read
        // 9/9 tier A on a step whose pinned skill never ran at all, and the
        // run report had no field that could have said so.
        ...(st.replayed ? { replayed: st.replayed } : {}),
        ...(st.repinned ? { repinned: st.repinned } : {}),
      })),
    });
  };

  // Steps whose RECORDING is the problem — a demoted pin, or a pin the engine
  // silently replaced with another skill — by step id. Derived after run 1 and
  // after every converge run, because the pin can move under us and because
  // the evidence sentence names every run. See spec/repair.ts
  // `rerecordDiagnostics` for the rules and for the sp8od case that forced
  // them. Each one is printed FIRST, once, and refuses the write.
  const flagged = new Map<string, Diagnostic>();
  const refreshFlags = (): void => {
    let staleFlow: Flow;
    try {
      staleFlow = JSON.parse(fs.readFileSync(staged.flowFile, 'utf8')) as Flow;
    } catch {
      return;
    }
    const fresh = rerecordDiagnostics({
      // The .flow.ts the reviewer owns, not the staged JSON the run used: the
      // fix command has to name a file that will still be there tomorrow.
      flowFile: file,
      steps: staleFlow.steps,
      runs,
      store: new SkillStore(staged.skillsDir),
    });
    for (const [id, d] of fresh) {
      const seen = flagged.get(id);
      flagged.set(id, d);
      // Once per step, however many runs re-observe it — but the LATEST
      // evidence wins, so the sentence names every run that has happened.
      if (!seen) say(formatDiagnostic(d));
    }
  };

  // Every line the evidence codemod produced, across run 1 and every converge
  // run. Kept beside the IR diff rather than inside it because a retirement is
  // an observation ABOUT a chain, not a shape change the diff can see: a
  // candidate that dropped to the back of a chain reads, in the emitted file,
  // as a reordering with no reason attached.
  const evidenceLines: string[] = [];
  // One retirement, one line, however many runs re-observe it.
  const retirementsReported = new Set<string>();
  runResetCmd(resetCmd, 'run 1', say);

  const { run, drained } = await runStagedFlow(staged, mintVars(vars, 0), `repair-${stamp}-0`, {
    headed: flags.has('headed'),
    onProgress,
    // The drain runs even under --dry-run, but as TRIAGE only: the summary is
    // what a dry run is FOR, and it cannot be described without classifying
    // the tickets. --dry-run governs the irreversible things — reordering a
    // stored chain, storing a variant, writing the user's `.flow.ts`.
    drain: { dryRun, model: flags.get('model') ? String(flags.get('model')) : undefined },
  });
  const tickets = run.driftTickets ?? [];
  const summary: DrainSummary = drained ?? { promoted: [], patched: [], reRecord: [], skipped: [] };
  noteRun('run 1', run, tickets.length);
  say(`run 1: ${run.passed}/${run.total} step(s) ${run.status}, ${tickets.length} drift ticket(s)`);
  for (const st of run.steps) {
    say(`  [${st.status === 'success' ? 'OK' : st.status.toUpperCase()}] ${st.id} (tier ${st.tier ?? 'none'})${st.fellBack ? ` — fell back: ${st.fellBack}` : ''}${st.status === 'success' ? '' : ` — ${st.summary ?? ''}`}`);
  }

  // A patch the daemon verified on the live page is a proposal about THIS
  // spec, not a candidate for some future store's lifecycle: fold it into the
  // chain before anything reads the IR back, or the variant compiles as an
  // extra segment beside the drifted one it was meant to replace. The
  // convergence gate below is what it has to earn its place against.
  const folded = dryRun ? [] : foldPatchedVariants(staged.store, summary.patched);
  for (const line of folded) say(`  folded           ${line}`);

  // The cheap, no-model half of "what the agent is allowed to change": bank
  // the misses this run's tickets prove for the chains replay banks nothing
  // about (a dead chain, or one a structural path won), then reorder every
  // chain by that evidence. Run 1 files the first miss; the converge runs
  // below file the second, which is what `retired` needs.
  if (!dryRun) {
    foldTicketEvidence(staged.store, tickets);
    evidenceLines.push(...reorderByEvidence(staged.store, retirementsReported));
    for (const line of evidenceLines) say(`  evidence         ${line}`);
  }

  // Diagnostics before counts, before the change list, before anything: a
  // step the engine covered with someone else's skill makes every number
  // below it mean something different.
  refreshFlags();

  let diff = diffSpecChanges(before, reloadStaged(staged).spec);
  const printChanges = (heading: string, d: typeof diff) => {
    if (json) return;
    console.log(heading);
    for (const line of d.lines) console.log(`  ${line}`);
    for (const line of evidenceLines) console.log(`  ${line}`);
  };
  if (!json) {
    console.log(
      `${tickets.length} drift ticket(s) → ${summary.promoted.length} promoted, ${summary.patched.length} patched, ${summary.reRecord.length} need re-record, ${summary.skipped.length} skipped`,
    );
    for (const p of summary.patched) console.log(`  patched          ${p.skill} step ${p.step} → variant ${p.variant} (${p.locator}) on ${p.url}`);
    for (const p of summary.reRecord) console.log(`  needs re-record  ${p.skill} (${p.flow}/${p.step}): ${p.why}`);
    for (const p of summary.skipped) {
      // A no-proposal is only meaningful next to what the model was looking
      // at: 6 interactive rows means it was shown the login page, 40 means the
      // page really had nothing that fits.
      const seen = p.snapshotRows === undefined ? '' : ` [saw ${p.snapshotRows} interactive row(s), ${p.snapshotBytes} bytes, on ${p.url}; model replied ${JSON.stringify(p.modelReply)}]`;
      console.log(`  skipped          ${p.skill}${p.step ? ` step ${p.step}` : ''}: ${p.why}${seen}`);
    }
  }
  printChanges('--- changes ---', diff);

  // Filled in only by --check-spec, after the owned file is written: it is a
  // verdict about the EMITTED spec, which does not exist until then.
  let specCheck: SpecCheckResult | null = null;
  const report = () => ({
    schemaVersion: 1,
    stage: 'repair',
    liveExecutions: runs.length + (specCheck?.ran ? 1 : 0),
    file,
    flow: before.name,
    workspace: dir,
    run: { status: run.status, passed: run.passed, total: run.total, drift: tickets.length },
    // Every run, not just run 1: the gate is a verdict about the LAST run, and
    // "which step needed the model, on which pass, and why" is unanswerable
    // from a single aggregate.
    runs,
    // Every problem this repair found, in the shape every surface reports one
    // (spec/diagnostics.ts) — present in EVERY JSON shape the command prints,
    // refusal, gate failure, dry run and success alike.
    diagnostics: [...flagged.values()],
    // The tickets themselves, not just how many: "15 drift ticket(s)" cannot be
    // acted on, and the one question a stuck converge loop asks is WHICH
    // locator keeps missing and what won instead.
    tickets,
    ...summary,
    changes: [...diff.lines, ...evidenceLines],
    evidence: evidenceLines,
    droppedExpectations: diff.droppedExpectations,
    weakenedByVariant: diff.weakenedByVariant,
    specCheck,
  });

  // Never weaken an expectation: an assertion that no longer holds is a test
  // failure for a human, not drift (PLAN-self-updating-spec.md). The one
  // reported-not-refused case is a repair VARIANT — see SpecDiff for why that
  // is not a loophole.
  const gateExpectations = () => {
    for (const w of diff.weakenedByVariant) console.error(`  review: ${w}`);
    if (!diff.droppedExpectations.length) return;
    if (json) emitCommandJson({ ...report(), wrote: null, refused: 'expectation dropped' });
    for (const d of diff.droppedExpectations) console.error(`  expectation dropped: ${d}`);
    fail('refusing to write: the repair would drop an expectation — that is a test failure for a human, not drift', 1);
  };
  gateExpectations();

  /**
   * Refuse the write when a step's RECORDING is the problem.
   *
   * The step is not converged however clean its tier looked — sp8od went 9/9
   * tier A three times on a step whose demoted pin never ran once. No locator
   * edit reaches this, so there is nothing to write: the file stays as it was,
   * the exit code is the existing "needs re-record" 1, and what the reviewer
   * gets is the diagnostic block plus the command that fixes it.
   */
  const gateRerecord = (): void => {
    if (!flagged.size) return;
    const ds = [...flagged.values()];
    if (json) {
      emitCommandJson({ ...report(), wrote: null, converged: false, refused: 'needs re-record', notConverged: [...flagged.keys()] });
    } else {
      // Printed once more here, next to the refusal, because the block above
      // scrolled past several runs ago — and it is the whole reason for it.
      for (const d of ds) console.error(formatDiagnostic(d));
      printChanges('--- changes (not written) ---', diff);
      console.error(
        `refusing to write ${outFile}: ${ds.map((d) => d.step).join(', ')} need re-recording, not repair — the run only passed because another skill covered the step`,
      );
    }
    process.exit(1);
  };

  let changed = [...diff.lines.filter((l) => !l.endsWith(': no change')), ...evidenceLines];
  if (!changed.length && summary.reRecord.length) {
    if (json) emitCommandJson({ ...report(), wrote: null, refused: 'needs re-record' });
    else console.log('nothing could be repaired without re-recording — re-record the segment(s) listed above and compile again');
    process.exit(1);
  }

  for (let i = 1; i <= converge; i++) {
    runResetCmd(resetCmd, `converge ${i}/${converge}`, say);
    const { run: check } = await runStagedFlow(staged, mintVars(vars, i), `repair-${stamp}-${i}`, { headed: flags.has('headed'), onProgress });
    const checkTickets = check.driftTickets ?? [];
    // Fold and reorder BEFORE gating, not after: this run's misses are part of
    // the evidence this run is judged on. A candidate whose second miss lands
    // here is retired here, and the ticket that reported it is then exactly
    // what the codemod just recorded — a fact about the spec, not drift.
    if (!dryRun) {
      foldTicketEvidence(staged.store, checkTickets);
      const moved = reorderByEvidence(staged.store, retirementsReported);
      evidenceLines.push(...moved);
      for (const line of moved) say(`  evidence         ${line}`);
    }
    noteRun(`converge ${i}/${converge}`, check, checkTickets.length);
    for (const st of check.steps) {
      say(`  [${st.status === 'success' ? 'OK' : st.status.toUpperCase()}] ${st.id} (tier ${st.tier ?? 'none'})${st.fellBack ? ` — fell back: ${st.fellBack}` : ''}${st.status === 'success' ? '' : ` — ${st.summary ?? ''}`}`);
    }
    refreshFlags();
    const bad = notConverged(check, dryRun ? undefined : staged.store, flagged);
    // A flagged step is not converged, but it is not a CONVERGENCE failure
    // either: no further run can clear it and no locator edit can repair it,
    // so it exits through gateRerecord (1) below rather than the gate's own
    // exit 3 — with every converge run's evidence in the sentence, which is
    // why the loop is allowed to finish.
    const others = bad.filter((line) => ![...flagged.keys()].some((id) => line.startsWith(`${id} (`)));
    say(`converge ${i}/${converge}: ${check.passed}/${check.total} step(s) ${check.status}, ${checkTickets.length} drift ticket(s)${bad.length ? '' : ' — clean'}`);
    if (others.length) {
      if (json) emitCommandJson({ ...report(), wrote: null, converged: false, notConverged: bad, convergeTickets: checkTickets });
      // The tickets, not just the step ids: a gate failure is only actionable
      // if it names the locator that missed and what resolved instead.
      for (const t of checkTickets) {
        console.error(`  ticket: ${t.step} ${t.skill}${t.atStep ? `/${t.atStep}` : ''} ${t.key ?? ''}: ${t.missedLocator ?? t.reason ?? t.fellBack ?? 'recovered'}${t.fallbackUsed ? ` → used ${t.fallbackUsed}` : ' → nothing resolved'}`);
      }
      console.error(`not converged: ${bad.join(', ')}`);
      process.exit(3);
    }
  }

  // A convergence run is not only a check: a patch-segment variant is stored
  // PROVISIONAL and becomes the step's pin only when a run adopts it, so the
  // IR can legitimately move again between the drain and here. Re-diff rather
  // than emit a summary that predates the adoption.
  const finalSpec = reloadStaged(staged).spec;
  const finalDiff = diffSpecChanges(before, finalSpec);
  if (finalDiff.lines.join('\n') !== diff.lines.join('\n')) {
    diff = finalDiff;
    changed = [...diff.lines.filter((l) => !l.endsWith(': no change')), ...evidenceLines];
    printChanges('--- changes (after the convergence run(s) adopted what the repair proposed) ---', diff);
    gateExpectations();
  }

  // The last word before the write, and ahead of --dry-run's own report: a
  // dry run that says "0 change(s), nothing written" about a flow with a
  // demoted pin is the same silence sp8od shipped.
  gateRerecord();

  if (dryRun) {
    if (json) emitCommandJson({ ...report(), wrote: null, dryRun: true });
    else console.log(`dry run: ${changed.length} change(s), nothing written (would have written ${outFile})`);
    return;
  }

  // Re-emit from the repaired IR — the owned file is generated in full, every
  // time, so a promoted candidate shows up in the diff as a reordered chain in
  // both the FLOW constant and the generated step body.
  const emitted = emitFlowFile(finalSpec, { tier: 'plain' });
  if (proposalFile) {
    const candidate = stageProposal(file, emitted.source);
    try {
      specCheck = runSpecCheck({
        ...checkOptions(flags), flowFile: candidate.flowFile,
        vars: mintVars(vars, converge + 1), resetCmd, liveReplayPassed: true, flagged,
        onProgress: say,
      });
    } finally {
      // Candidate scaffolds must not accidentally join the user's normal test suite.
      fs.unlinkSync(candidate.specFile);
    }
    if (sourceHash(fs.readFileSync(candidate.originalSpec, 'utf8')) !== candidate.originalSpecHash) {
      fail('the user spec changed during proposal verification; create a new proposal', 2);
    }
    const proposal = saveProposal(proposalFile, {
      target: path.resolve(file), originalHash: sourceHash(source), source: emitted.source,
      specFile: candidate.originalSpec, candidateFile: candidate.flowFile, candidateSpec: candidate.specFile,
      changes: changed, liveExecutions: runs.length + (specCheck.ran ? 1 : 0), verification: specCheck,
    });
    const clean = specCheck.ran && specCheck.passed && !specCheck.driftCount && !specCheck.satisfied?.length;
    if (json) emitJson({ ...report(), proposal: proposalFile, candidate: candidate.flowFile, wrote: null, converged: true }, 'repair', clean ? 'proposed' : 'not-verified', clean ? [{ command: 'repair', args: ['apply', proposalFile] }] : []);
    else {
      say(`proposal: ${proposalFile} (${proposal.liveExecutions} live executions)`);
      say(specCheck.verdict);
      say(clean ? `review the candidate and changes, then: sitelooper repair apply "${proposalFile}"` : 'proposal saved for inspection; apply requires clean compiled-spec verification');
    }
    if (!clean) process.exit(specCheck.ran ? 4 : 2);
    return;
  }
  fs.writeFileSync(outFile, emitted.source);
  if (!json) {
    for (const w of emitted.warnings) console.error(`  warning: ${w}`);
    console.log(`wrote ${outFile} (${changed.length} change(s); the .spec.ts was not touched)`);
  }

  // The blind spot this closes: everything above ran the IR through the
  // DAEMON, so a defect in the emitter — a chain that lowers fine for replay
  // and transpiles to a Playwright call that never resolves — passes every
  // gate and still ships a spec that fails on the first run. The only way to
  // see it is to run the emitted spec the way a user will. It is one more real
  // run against the app, so it gets its own {n} slot and its own reset.
  if (!flags.has('no-check-spec')) {
    specCheck = runSpecCheck({
      ...checkOptions(flags),
      flowFile: outFile,
      vars: mintVars(vars, converge + 1),
      resetCmd,
      liveReplayPassed: true,
      // A failure at a step whose recording is the problem is NOT an emitter
      // defect, whatever the live replay reported (sp8od's --check-spec said
      // exactly that, and was wrong). Unreachable while gateRerecord refuses
      // the write, and passed anyway so the claim can never be made by accident.
      flagged,
      onProgress: (m) => (json ? console.error(m) : console.log(m)),
    });
  }

  if (json) emitCommandJson({ ...report(), wrote: outFile, converged: true });
  else if (specCheck) {
    console.log(specCheck.verdict);
    for (const d of specCheck.drift) console.log(`  ${d}`);
    if (specCheck.workspace) console.log(`  workspace: ${specCheck.workspace}`);
  }
  // The file STAYS written — the diff is the reviewer's, and a repair that
  // adapted a locator correctly is not undone by the emitter mis-spelling it.
  // What changes is the exit code, so a script cannot mistake this for a clean
  // repair.
  if (specCheck && !specCheck.ran) process.exit(2);
  if (specCheck?.ran && !specCheck.passed) {
    console.error(`the emitted spec fails under plain Playwright: ${specCheck.verdict}`);
    console.error(`${outFile} was still written — review the diff, then fix the emitter (not the app)`);
    process.exit(4);
  }
}

// --- rerecord one step of a saved flow (the recording is wrong, not the app) ---

/**
 * `sitelooper rerecord <flow> <step>` — the fix half of the diagnostics.
 *
 * `compile` and `repair` can both now SAY that a step's recording is the
 * problem (a demoted pin, or a step that only passes because the engine
 * replays a different skill than the one it is pinned to). Neither could do
 * anything about it: repair adapts locators, and no amount of locator
 * adaptation fixes a procedure whose first action was recorded against a state
 * the flow no longer reaches. The only repair for a wrong recording is another
 * recording — this command takes one, for one step, without re-recording the
 * whole session by hand.
 *
 * It owns no cleverness of its own: it unpins the step (spec/rerecord.ts
 * `unpinStep`), replays the flow the ordinary way in learning mode, and lets
 * the store's re-pin rule decide. The verdict is the bar a compiled spec has
 * to clear — the last run replays the step at tier A, with the pin the
 * re-recording made.
 */
async function rerecordFlowCommand(
  positional: string[],
  flags: Map<string, string | boolean>,
  json: boolean,
  onProgress?: (m: string) => void,
): Promise<void> {
  const usage =
    'usage: rerecord <flow-name-or-path> <step-id> [--instruction "<text>"] [--var k=v ...] [--runs n] [--reset-cmd "<cmd>"] [--json]';
  const [nameOrPath, stepId] = positional;
  if (!nameOrPath || !stepId) fail(usage, 2);

  const projectConfig = loadProjectConfig();
  const input = resolveRerecordInput(nameOrPath, fs.existsSync(projectConfig.snapshotFile) ? projectConfig.snapshotFile : undefined);
  const { flow, file } = input;

  const runsWanted = flags.has('runs') ? Number(flags.get('runs')) : 2;
  if (!Number.isInteger(runsWanted) || runsWanted < 1) fail('--runs takes a positive integer', 2);
  const instruction = flags.get('instruction') ? String(flags.get('instruction')) : undefined;
  const resetCmd = flags.get('reset-cmd') ? String(flags.get('reset-cmd')) : loadProjectConfig().resetCommand;

  // Everything that can refuse, refuses BEFORE a browser starts: an unknown
  // step id or a missing --var costs a daemon spawn and a sign-in otherwise,
  // and this command's runs are real runs against the app.
  const previous = flow.steps.find((s) => s.id === stepId);
  let patched: Flow;
  try {
    patched = unpinStep(flow, stepId, instruction);
  } catch (err) {
    if (err instanceof RerecordError) return fail(err.message, 2);
    throw err;
  }
  const vars = { ...loadProjectConfig().vars, ...varFlags() };
  const missingVars = flow.vars.filter((v) => !(v in vars));
  if (missingVars.length) fail(`flow "${flow.name}" needs --var for: ${missingVars.join(', ')}`, 2);

  const say = (m: string) => {
    if (json) console.error(m);
    else console.log(m);
  };

  const stamp = Date.now().toString(36);
  let backup: string;
  try {
    backup = backupFlowFile(file, stamp);
  } catch (err) {
    if (err instanceof RerecordError) return fail(err.message, 2);
    throw err;
  }
  const stagedInput = stageRerecordInput(input, patched);
  say(`re-recording ${flow.name} step ${stepId} (${runsWanted} run(s))`);
  say(`  unpinned ${previous?.skill ?? '(no procedure)'}${instruction ? ', with a new instruction' : ''}; old recording kept at ${backup}`);

  const runs: RerecordRun[] = [];
  for (let i = 0; i < runsWanted; i++) {
    const label = `run ${i + 1}`;
    runResetCmd(resetCmd, label, say);
    // The same path `sitelooper run` takes — daemon, recovery ladder, learning
    // mode — pointed at the REAL skill store, because the whole point is that
    // the procedure this records survives into it.
    // Whatever the daemon says about THIS step (a re-pin refusal above all)
    // is printed whether or not --progress is on, and kept for the verdict.
    const notes: string[] = [];
    const { run } = await runStagedFlow(stagedInput, mintVars(vars, i), `rerecord-${stamp}-${i}`, {
      headed: flags.has('headed'),
      onProgress: (m) => {
        const note = stepNote(m, stepId);
        if (note) {
          notes.push(note);
          say(`  ${label}: ${stepId}  ${note}`);
        }
        onProgress?.(m);
      },
    });
    const entry: RerecordRun = { label, step: stepOf(run.steps, stepId), ...(notes.length ? { notes } : {}) };
    runs.push(entry);
    say(stepLine(stepId, entry));
    say(`  ${run.flow}: ${run.passed}/${run.total} step(s) ${run.status}`);
  }

  const verdict = rerecordVerdict({ file, stepId, runs });
  // The daemon writes re-pins back into the flow file it was given, so the
  // authoritative answer to "what is this step pinned to now" is on disk.
  const after = loadFlowFile(stagedInput.flowFile)?.flow.steps.find((s) => s.id === stepId);
  const pinned = after?.skill ?? verdict.pinned;
  const skill = pinned ? stagedInput.store.get(pinned) : null;
  const persisted = persistRerecordInput(input, stagedInput, verdict.ok);
  const payload = {
    flow: flow.name,
    file,
    step: stepId,
    backup,
    workspace: stagedInput.workspace,
    wrote: input.kind === 'flow' || persisted.wrote,
    ok: verdict.ok,
    pinned: pinned ?? null,
    skill: skill ? { id: skill.id, status: skill.status, steps: skill.steps.length } : null,
    runs: runs.map((r) => ({
      label: r.label,
      status: r.step?.status ?? 'not-reached',
      tier: r.step?.tier ?? null,
      replayed: r.step?.replayed ?? null,
      repinned: r.step?.repinned ?? null,
      turns: r.step?.turns ?? null,
    })),
    diagnostics: verdict.ok ? [] : [verdict.diagnostic],
  };

  // Diagnostics first, before the counts and the file paths.
  if (!verdict.ok) say(formatRerecordDiagnostic(verdict.diagnostic));
  if (json) emitCommandJson(payload);
  else if (verdict.ok) {
    say(`${stepId}: pinned ${pinned}${skill ? ` (${skill.status}, ${skill.steps.length} action(s))` : ''}`);
    say(`${file} updated — the previous recording is at ${backup}`);
  } else {
    say(input.kind !== 'flow' && !persisted.wrote ? `${file} was preserved; inspect the attempted recording in ${stagedInput.workspace}` : `${file} holds the attempted recording; the previous version is at ${backup}`);
  }
  process.exit(verdict.ok ? 0 : 1);
}
