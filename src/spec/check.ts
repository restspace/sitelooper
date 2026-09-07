// Does the file we just wrote actually WORK?
//
// `sitelooper repair` answers a narrower question than it looks like it does.
// It lifts the owned `.flow.ts` back to IR, replays that IR through the daemon,
// folds what the recovery ladder learned back in, and re-emits the file. Every
// one of those steps runs on the IR — so a defect in the EMITTER (a locator
// expression that lowers correctly for replay but transpiles to a Playwright
// call that never resolves, a step body emitted in the wrong order, a var that
// reaches the scaffold under a name nothing sets) is invisible to it. Cloud set
// 2 is the proof: repair reported "converged, 5/5, no changes" on kanboard and
// wrote the file, while the emitted spec failed deterministically under plain
// Playwright on the very first assertion.
//
// This module closes that blind spot the only way it can be closed: by running
// the emitted spec as a user would — the Playwright test runner over the two files,
// with no sitelooper runtime anywhere in the process — and reporting what came
// back. It is a CHECK, not a gate on the write: the diff is still the
// reviewer's, and a spec that fails here is information they need, not a reason
// to throw the repair away. What it does change is the exit code (4) and the
// sentence the reviewer reads.
//
// The split below is the usual one: everything that parses (the Playwright JSON
// report, an error's stack, the `@step` anchor above a source line) is pure and
// unit-tested against fixture strings; the one impure function spawns the
// runner. `bench/spec-replay.mjs` is the source of the config/reporter shape —
// this deliberately mirrors it rather than inventing a second convention.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import type { Diagnostic } from './diagnostics.js';

/** One test result from the Playwright JSON reporter, flattened. */
export interface SpecTestRow {
  title: string;
  /** 'expected' | 'unexpected' | 'flaky' | 'skipped' */
  status: string;
  ok: boolean;
  durationMs: number | null;
  error: string | null;
  errorStack: string | null;
  /** Where Playwright says the failure happened, when it says. */
  errorFile: string | null;
  errorLine: number | null;
  /**
   * Every frame of the failure that lands in the emitted files, topmost first.
   *
   * More than one, because the topmost is usually the WRONG one to name: the
   * `pick()` helper throws from the top of the flow file, far above the first
   * `// @step` marker, and the frame a reviewer needs is its caller — the
   * emitted gesture. `runSpecCheck` walks these until one has a marker above it.
   */
  errorSites: Array<{ file: string; line: number }>;
  drift: string[];
  /** Every `[sitelooper satisfied] …` line this test logged. */
  satisfied: string[];
  executedSteps?: string[];
}

export interface ParsedSpecReport {
  tests: SpecTestRow[];
  /** Every test ran and every test passed. An empty report is NOT a pass. */
  passed: boolean;
  durationMs: number;
  drift: string[];
  /** The first failing test's error message, trimmed to one readable line. */
  error: string | null;
  errorFile: string | null;
  errorLine: number | null;
  errorSites: Array<{ file: string; line: number }>;
  /**
   * Every `[sitelooper satisfied] …` line the run logged: a step that did
   * NOTHING because the page already showed its goal for this record. A pass
   * with one of these is a different fact from a pass without — the procedure
   * itself was never exercised — so it is counted rather than swallowed.
   */
  satisfied: string[];
  executedSteps?: string[];
}

export interface SpecCheckResult {
  /** Missing prerequisites are unavailable, never a successful validation. */
  outcome?: 'passed' | 'failed' | 'unavailable';
  tests?: SpecTestRow[];
  skippedCount?: number;
  executedSteps?: string[];
  /** false when the check was skipped (no @playwright/test) — never a failure. */
  ran: boolean;
  /** Why it was skipped, when it was. */
  skipped: string | null;
  passed: boolean;
  durationMs: number;
  exitCode: number | null;
  timedOut: boolean;
  error: string | null;
  /** "04-open s_1e46d8/10", the nearest `// @step` above the failing line. */
  anchor: string | null;
  errorFile: string | null;
  errorLine: number | null;
  drift: string[];
  driftCount: number;
  /**
   * The steps that did nothing because their goal was already showing (the
   * emitted `satisfied()` guard). Optional: a caller that builds this object
   * by hand — and every result written before goals existed — has none.
   */
  satisfied?: string[];
  /** The one-paragraph sentence the CLI prints. */
  verdict: string;
  /** The scratch dir the run happened in — kept ONLY on failure, where the
   * config, the log and the report are what a reader needs next. */
  workspace: string | null;
  specFile: string | null;
}

/** Strip the ANSI colouring Playwright puts in `error.message`. */
function plain(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * One stdout/stderr chunk from the JSON reporter as text. Playwright records
 * each console write as `{ text }` or, for binary writes, `{ buffer }`
 * (base64) — a compiled spec never writes binary, but decode it anyway rather
 * than dropping a chunk that happens to take that shape. (Same rule as
 * bench/spec-replay.mjs; the two must agree or a drift line counted there
 * would go missing here.)
 */
function chunkText(c: unknown): string {
  if (typeof c === 'string') return c;
  const o = c as { text?: unknown; buffer?: unknown } | null;
  if (typeof o?.text === 'string') return o.text;
  if (typeof o?.buffer === 'string') {
    try {
      return Buffer.from(o.buffer, 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
  return '';
}

/** Every `[sitelooper <tag>] …` line one test result logged, on either stream. */
function taggedLines(result: Record<string, unknown> | undefined, tag: string): string[] {
  const chunks = [...((result?.stdout as unknown[]) ?? []), ...((result?.stderr as unknown[]) ?? [])];
  return chunks
    .map(chunkText)
    .join('')
    .split(/\r?\n/)
    .map((l) => plain(l).trim())
    .filter((l) => l.startsWith(`[sitelooper ${tag}]`));
}

/** A filename, as a regex literal. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse a stack frame (or a Playwright `error.location`) out of one error.
 *
 * Only frames in the flow/spec files themselves are of interest: the top of a
 * Playwright failure stack is usually inside the runner, and the line a reader
 * needs is the emitted gesture that asked for the locator.
 */
export function errorSites(
  error: { message?: unknown; stack?: unknown; location?: unknown } | undefined,
  files: string[],
): Array<{ file: string; line: number }> {
  const wanted = files.map((f) => path.basename(f));
  const out: Array<{ file: string; line: number }> = [];
  const add = (file: string, line: number) => {
    if (!out.some((s) => s.file === file && s.line === line)) out.push({ file, line });
  };
  const loc = error?.location as { file?: unknown; line?: unknown } | undefined;
  const locFile = typeof loc?.file === 'string' ? loc.file : null;
  if (locFile && typeof loc?.line === 'number' && wanted.some((w) => locFile.endsWith(w))) add(locFile, loc.line);
  const text = plain(`${typeof error?.stack === 'string' ? error.stack : ''}\n${typeof error?.message === 'string' ? error.message : ''}`);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    for (const w of wanted) {
      // Matches both "at fn (C:\…\x.flow.ts:41:22)" and a bare "…/x.flow.ts:41:22".
      const m = line.match(new RegExp(`([^\\s()]*${escapeRe(w)}):(\\d+)(?::(\\d+))?`));
      if (m) add(m[1], Number(m[2]));
    }
  }
  return out;
}

/** The topmost frame of the failure that lands in the emitted files. */
export function errorSite(
  error: { message?: unknown; stack?: unknown; location?: unknown } | undefined,
  files: string[],
): { file: string; line: number } | null {
  return errorSites(error, files)[0] ?? null;
}

/**
 * The nearest `// @step <id> <segment>/<index>` marker at or above `line`.
 *
 * The emitter writes one of these above every gesture precisely so a stack
 * line can be turned back into something a reviewer recognises — see
 * src/spec/emit.ts. `line` is 1-based, the way stacks and Playwright count.
 */
export function findStepAnchor(source: string, line: number): string | null {
  const lines = source.split(/\r?\n/);
  for (let i = Math.min(line, lines.length) - 1; i >= 0; i--) {
    const m = lines[i]?.match(/^\s*\/\/\s*@step\s+(.+?)\s*$/);
    if (m) return m[1];
  }
  return null;
}

/** Walk the Playwright JSON reporter's suite tree, flattening to one row per test. */
function flattenTests(suite: Record<string, unknown>, files: string[], acc: SpecTestRow[] = []): SpecTestRow[] {
  for (const s of (suite.suites as Record<string, unknown>[]) ?? []) flattenTests(s, files, acc);
  for (const spec of (suite.specs as Record<string, unknown>[]) ?? []) {
    for (const t of (spec.tests as Record<string, unknown>[]) ?? []) {
      const r = ((t.results as Record<string, unknown>[]) ?? [])[0];
      const err = (r?.error ?? ((r?.errors as Record<string, unknown>[]) ?? [])[0]) as
        | { message?: unknown; stack?: unknown; location?: unknown }
        | undefined;
      const sites = errorSites(err, files);
      const message = typeof err?.message === 'string' ? plain(err.message).trim() : null;
      acc.push({
        title: String(spec.title ?? ''),
        status: String(t.status ?? ''),
        ok: t.status === 'expected' && (!r?.status || r.status === 'passed') && (!t.expectedStatus || t.expectedStatus === 'passed'),
        durationMs: typeof r?.duration === 'number' ? r.duration : null,
        error: message,
        errorStack: typeof err?.stack === 'string' ? plain(err.stack) : null,
        errorFile: sites[0]?.file ?? null,
        errorLine: sites[0]?.line ?? null,
        errorSites: sites,
        drift: taggedLines(r, 'drift'),
        satisfied: taggedLines(r, 'satisfied'),
        executedSteps: taggedLines(r, 'step').map((line) => line.slice('[sitelooper step]'.length).trim()),
      });
    }
  }
  return acc;
}

/**
 * The JSON reporter's output, reduced to the handful of facts a verdict needs.
 *
 * An empty report is deliberately NOT a pass: a spec whose module failed to
 * load (the emitter's most likely way to be wrong) produces a report with no
 * test results at all, and calling that "0 failures" is the exact blind spot
 * this module exists to close.
 */
export function parseSpecReport(report: unknown, files: string[] = []): ParsedSpecReport {
  const root = (report ?? {}) as Record<string, unknown>;
  const tests = flattenTests(root, files);
  const failing = tests.find((t) => !t.ok && t.status !== 'skipped') ?? null;
  const reportError = ((root.errors as Record<string, unknown>[]) ?? [])[0];
  const reportSites = errorSites(reportError, files);
  const stats = root.stats as { duration?: unknown } | undefined;
  const durationMs =
    typeof stats?.duration === 'number' ? stats.duration : tests.reduce((n, t) => n + (t.durationMs ?? 0), 0);
  return {
    tests,
    passed: tests.length > 0 && tests.every((t) => t.ok),
    durationMs,
    drift: tests.flatMap((t) => t.drift),
    satisfied: tests.flatMap((t) => t.satisfied),
    executedSteps: tests.flatMap((t) => t.executedSteps ?? []),
    error: failing?.error ?? (typeof reportError?.message === 'string' ? plain(reportError.message) : null),
    errorFile: failing?.errorFile ?? reportSites[0]?.file ?? null,
    errorLine: failing?.errorLine ?? reportSites[0]?.line ?? null,
    errorSites: failing?.errorSites ?? reportSites,
  };
}

/** One line of the failure, short enough to read in a terminal. */
function shortError(message: string | null): string {
  if (!message) return 'the spec failed with no error message';
  const first = message
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ');
  return first.length > 200 ? `${first.slice(0, 197)}…` : first;
}

/**
 * The diagnostic for the step a failing anchor names, if it has one.
 *
 * An anchor is `"08-open s_c86522/1"` — step id, pinned skill, step index —
 * so the step id is its first token, and that is what the flagged map is
 * keyed by.
 */
function flaggedStep(anchor: string | null, flagged?: ReadonlyMap<string, Diagnostic>): Diagnostic | null {
  if (!anchor || !flagged?.size) return null;
  return flagged.get(anchor.split(/\s+/)[0]) ?? null;
}

/**
 * The verdict, in one paragraph.
 *
 * The "emitter defect, not drift" clause is the whole point of the sentence
 * and is only earned in the repair path: there, the same procedure has just
 * replayed cleanly through the daemon N times, so a failure HERE cannot be the
 * app moving — it is the compilation of that procedure into Playwright. The
 * standalone `check` command has no such evidence and does not claim it.
 *
 * And it is not claimed AT ALL for a step repair has already flagged as
 * needing a re-record. sp8od is why: 08-open's demoted pin never ran, a
 * read-only skill covered it, the live replay went 9/9 tier A — and this
 * sentence then told the reviewer to go and fix the emitter. When `flagged`
 * carries the failing anchor's step, the verdict names the recording instead.
 */
export function verdictFor(
  r: Omit<SpecCheckResult, 'verdict'>,
  liveReplayPassed: boolean,
  flagged?: ReadonlyMap<string, Diagnostic>,
): string {
  if (!r.ran) return `spec check: unavailable — ${r.skipped ?? 'the spec was not run'}`;
  const secs = Math.max(1, Math.round(r.durationMs / 1000));
  // A pass that skipped a step because its work was already done is not the
  // same pass as one that ran everything, and the reader has to be told which
  // it was: the procedure under test never executed for that step.
  const already = r.satisfied?.length ? `, ${r.satisfied.length} already satisfied` : '';
  if (r.passed) return `spec check: passed in ${secs} s, ${r.driftCount} drift${already}`;
  const where = r.anchor ? ` at @step ${r.anchor}` : r.errorLine ? ` at ${path.basename(r.errorFile ?? '')}:${r.errorLine}` : '';
  const why = flaggedStep(r.anchor, flagged)
    ? ` — the step's recording is the problem, not the emitter: ${flaggedStep(r.anchor, flagged)!.what}`
    : liveReplayPassed
      ? ' — this is an emitter defect, not drift: the live replay passed this step'
      : ' — run it yourself with the config in the workspace below to see the full trace';
  const timeout = r.timedOut ? ' (the runner was killed on timeout)' : '';
  return `spec check: FAILED${where} — ${shortError(r.error)}${why}${timeout}`;
}

/** The env var a run var reaches the scaffold under, per emitSpecFile. */
export function envName(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
}

/**
 * Is `@playwright/test` resolvable from where the spec will run, and where is
 * its runner?
 *
 * Both halves matter. The emitted files `import { expect } from
 * '@playwright/test'`, so Node has to resolve that package from the directory
 * the spec sits in — which is why the check runs beside the owned file rather
 * than in the system temp dir, where nothing resolves. And the runner is
 * spawned as `node <pkg>/cli.js` rather than `npx playwright`: npx run from a
 * directory that cannot see the package DOWNLOADS a fresh copy of playwright
 * and then fails anyway on the missing `@playwright/test`, which reads as a
 * spec failure and is not one.
 */
export function resolvePlaywrightTest(fromDir: string): { main: string; cli: string | null } | null {
  for (const base of [fromDir, process.cwd()]) {
    try {
      const main = createRequire(path.join(base, 'noop.cjs')).resolve('@playwright/test');
      const cli = path.join(path.dirname(main), 'cli.js');
      return { main, cli: fs.existsSync(cli) ? cli : null };
    } catch {
      /* try the next root */
    }
  }
  return null;
}

export interface SpecCheckOptions {
  /** The owned `<name>.flow.ts`; its sibling `<name>.spec.ts` is what runs. */
  flowFile: string;
  /** Optional separately authored spec, e.g. an explicit negative check. */
  specFile?: string;
  /** Existing project config; otherwise discover one above the original spec. */
  configFile?: string;
  project?: string;
  cwd?: string;
  /** Explicit compiler smoke test: copy files and ignore project fixtures/config. */
  isolated?: boolean;
  env?: Record<string, string>;
  vars?: Record<string, string>;
  /** Shell command run once before the spec, e.g. an app reset endpoint. */
  resetCmd?: string;
  /** Wall clock for the whole `npx playwright test` invocation. */
  timeoutMs?: number;
  /** Only the repair path may claim "the live replay passed this step". */
  liveReplayPassed?: boolean;
  /**
   * Steps repair has already judged to need a re-record, by step id. A failure
   * at one of these is a fact about the RECORDING, and the verdict says so
   * instead of blaming the emitter.
   */
  flagged?: ReadonlyMap<string, Diagnostic>;
  onProgress?: (m: string) => void;
}

/** The scaffold uses normalized environment names; aliases cannot carry different inputs. */
export function inputEnvCollisions(vars: Record<string, string>): string[] {
  const names = new Map<string, string>();
  const collisions: string[] = [];
  for (const name of Object.keys(vars)) {
    const env = envName(name);
    const previous = names.get(env);
    if (previous !== undefined && previous !== name) collisions.push(`inputs ${previous} and ${name} both map to environment variable ${env}`);
    names.set(env, name);
  }
  return collisions;
}

/** Find the nearest Playwright configuration without changing the spec's imports. */
export function findPlaywrightConfig(fromDir: string): string | null {
  let dir = path.resolve(fromDir);
  while (true) {
    for (const ext of ['ts', 'js', 'mts', 'mjs', 'cts', 'cjs']) {
      const candidate = path.join(dir, `playwright.config.${ext}`);
      if (fs.existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Run the original spec with project fixtures/configuration and zero retries. */
export function runSpecCheck(o: SpecCheckOptions): SpecCheckResult {
  const flowFile = path.resolve(o.flowFile);
  const say = o.onProgress ?? (() => {});
  const base = path.basename(flowFile).replace(/\.flow\.ts$/, '');
  const dir = path.dirname(flowFile);
  const specSrc = o.specFile ? path.resolve(o.specFile) : path.join(dir, `${base}.spec.ts`);
  const empty: Omit<SpecCheckResult, 'verdict'> = {
    outcome: 'unavailable', ran: false, skipped: null, passed: false, durationMs: 0,
    exitCode: null, timedOut: false, error: null, anchor: null, errorFile: null,
    errorLine: null, drift: [], driftCount: 0, satisfied: [], executedSteps: [],
    tests: [], skippedCount: 0, workspace: null, specFile: specSrc,
  };
  const unavailable = (why: string, work: string | null = null): SpecCheckResult => {
    const r = { ...empty, skipped: why, workspace: work };
    return { ...r, verdict: verdictFor(r, o.liveReplayPassed ?? false, o.flagged) };
  };
  if (!fs.existsSync(flowFile)) return unavailable('the compiled flow does not exist; compile it first');
  if (!fs.existsSync(specSrc)) return unavailable(`no ${path.basename(specSrc)}; compile it first`);
  const collisions = inputEnvCollisions(o.vars ?? {});
  if (collisions.length) return unavailable(collisions.join('; '));
  const pw = resolvePlaywrightTest(dir);
  if (!pw?.cli) return unavailable('@playwright/test runner could not be resolved from this project; install @playwright/test');
  const projectConfig = o.isolated ? null : o.configFile ? path.resolve(o.configFile) : findPlaywrightConfig(dir);
  if (projectConfig && !fs.existsSync(projectConfig)) return unavailable(`Playwright config does not exist: ${projectConfig}`);
  const cwd = path.resolve(o.cwd ?? (projectConfig ? path.dirname(projectConfig) : dir));
  const env: NodeJS.ProcessEnv = { ...process.env, ...o.env };
  for (const [k, v] of Object.entries(o.vars ?? {})) env[envName(k)] = v;
  if (o.resetCmd) {
    say('  spec check: preparing fresh application state');
    const reset = spawnSync(o.resetCmd, { shell: true, encoding: 'utf8', timeout: 120_000, cwd, env });
    if (reset.error || reset.status !== 0) return unavailable(`the reset command exited ${reset.status ?? reset.error?.message ?? 'by signal'} before validation`);
  }
  const work = fs.mkdtempSync(path.join(dir, '.sitelooper-check-'));
  let checkedFlow = flowFile;
  let checkedSpec = specSrc;
  if (o.isolated) {
    checkedFlow = path.join(work, path.basename(flowFile));
    checkedSpec = path.join(work, path.basename(specSrc));
    fs.copyFileSync(flowFile, checkedFlow);
    fs.copyFileSync(specSrc, checkedSpec);
  }
  const reportFile = path.join(work, 'pw-report.json');
  let configFile = projectConfig;
  if (!configFile) {
    configFile = path.join(work, 'playwright.config.mjs');
    fs.writeFileSync(configFile, `export default ${JSON.stringify({
      testDir: o.isolated ? work : dir, testMatch: path.basename(checkedSpec),
      timeout: 600_000, retries: 0, workers: 1, use: { headless: true },
    }, null, 2)};\n`);
  }
  env.PLAYWRIGHT_JSON_OUTPUT_FILE = reportFile;
  // Playwright's positional filters are regular expressions against file paths.
  const filter = escapeRe(checkedSpec.replace(/\\/g, '/')) + '$';
  const argv = [pw.cli, 'test', filter, '--config', configFile, '--retries=0', '--repeat-each=1', '--workers=1', '--reporter=json', '--trace=retain-on-failure', '--output', path.join(work, 'test-results')];
  if (o.project) argv.push('--project', o.project);
  say(`  spec check: ${o.isolated ? 'isolated smoke test' : 'project test'} ${path.basename(specSrc)}${o.project ? ` (${o.project})` : ''}`);
  const started = Date.now();
  const run = spawnSync(process.execPath, argv, { encoding: 'utf8', cwd, env, timeout: o.timeoutMs ?? 900_000, maxBuffer: 16 * 1024 * 1024 });
  const wallMs = Date.now() - started;
  fs.writeFileSync(path.join(work, 'run.log'), `${run.stdout ?? ''}${run.stderr ?? ''}`);
  if (run.error && (run.error as NodeJS.ErrnoException).code !== 'ETIMEDOUT') return unavailable(`could not start Playwright: ${run.error.message}`, work);
  let report: unknown = null;
  try { report = JSON.parse(fs.readFileSync(reportFile, 'utf8')); } catch { /* report unavailable */ }
  const parsed = parseSpecReport(report, [checkedFlow, checkedSpec]);
  const timedOut = (run.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT';
  const output = plain(`${run.stderr ?? ''}${run.stdout ?? ''}`).trim();
  const error = parsed.error ?? (parsed.tests.length ? parsed.passed ? null : 'required tests did not all execute successfully' : shortError(output || 'Playwright wrote no test results'));
  // Missing browser installations and global setup/config failures do not exercise the artifact.
  const missingBrowser = /Executable doesn.t exist|Please run the following command to download new browsers/.test(JSON.stringify(report));
  const artifactLoadFailure = parsed.errorSites.length > 0 || [path.basename(checkedFlow), path.basename(checkedSpec)].some((file) => parsed.error?.includes(file));
  if ((!parsed.tests.length && !timedOut && !artifactLoadFailure) || missingBrowser) return unavailable(error ?? 'Playwright setup did not complete', work);
  let anchor: string | null = null;
  let site = parsed.errorSites[0] ?? null;
  for (const frame of parsed.errorSites) {
    const source = fs.readFileSync(frame.file.endsWith('.spec.ts') ? checkedSpec : checkedFlow, 'utf8');
    const found = findStepAnchor(source, frame.line);
    if (found) { anchor = found; site = frame; break; }
  }
  const passed = parsed.passed && run.status === 0;
  const r: Omit<SpecCheckResult, 'verdict'> = {
    outcome: passed ? 'passed' : 'failed', ran: true, skipped: null, passed,
    durationMs: parsed.durationMs || wallMs, exitCode: run.status, timedOut,
    error: passed ? null : error, anchor, errorFile: site?.file ?? null,
    errorLine: site?.line ?? null, drift: parsed.drift, driftCount: parsed.drift.length,
    satisfied: parsed.satisfied, executedSteps: parsed.executedSteps, tests: parsed.tests,
    skippedCount: parsed.tests.filter((t) => t.status === 'skipped').length,
    workspace: work, specFile: specSrc,
  };
  if (passed) {
    // work is an absolute mkdtemp child of dir; never remove a computed project path.
    if (path.dirname(work) !== dir || !path.basename(work).startsWith('.sitelooper-check-')) throw new Error('Invalid check workspace');
    fs.rmSync(work, { recursive: true, force: true });
  }
  return { ...r, verdict: verdictFor(r, o.liveReplayPassed ?? false, o.flagged), workspace: passed ? null : work };
}
