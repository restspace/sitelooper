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
}

export interface SpecCheckResult {
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

/** Every `[sitelooper drift] …` line `pick()` warned for one test result. */
function driftLines(result: Record<string, unknown> | undefined): string[] {
  const chunks = [...((result?.stdout as unknown[]) ?? []), ...((result?.stderr as unknown[]) ?? [])];
  return chunks
    .map(chunkText)
    .join('')
    .split(/\r?\n/)
    .map((l) => plain(l).trim())
    .filter((l) => l.startsWith('[sitelooper drift]'));
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
        ok: t.status === 'expected',
        durationMs: typeof r?.duration === 'number' ? r.duration : null,
        error: message,
        errorStack: typeof err?.stack === 'string' ? plain(err.stack) : null,
        errorFile: sites[0]?.file ?? null,
        errorLine: sites[0]?.line ?? null,
        errorSites: sites,
        drift: driftLines(r),
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
  const stats = root.stats as { duration?: unknown } | undefined;
  const durationMs =
    typeof stats?.duration === 'number' ? stats.duration : tests.reduce((n, t) => n + (t.durationMs ?? 0), 0);
  return {
    tests,
    passed: tests.length > 0 && tests.every((t) => t.ok),
    durationMs,
    drift: tests.flatMap((t) => t.drift),
    error: failing?.error ?? null,
    errorFile: failing?.errorFile ?? null,
    errorLine: failing?.errorLine ?? null,
    errorSites: failing?.errorSites ?? [],
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
 * The verdict, in one paragraph.
 *
 * The "emitter defect, not drift" clause is the whole point of the sentence
 * and is only earned in the repair path: there, the same procedure has just
 * replayed cleanly through the daemon N times, so a failure HERE cannot be the
 * app moving — it is the compilation of that procedure into Playwright. The
 * standalone `check` command has no such evidence and does not claim it.
 */
export function verdictFor(r: Omit<SpecCheckResult, 'verdict'>, liveReplayPassed: boolean): string {
  if (!r.ran) return `spec check: skipped — ${r.skipped ?? 'the spec was not run'}`;
  const secs = Math.max(1, Math.round(r.durationMs / 1000));
  if (r.passed) return `spec check: passed in ${secs} s, ${r.driftCount} drift`;
  const where = r.anchor ? ` at @step ${r.anchor}` : r.errorLine ? ` at ${path.basename(r.errorFile ?? '')}:${r.errorLine}` : '';
  const why = liveReplayPassed
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
  vars?: Record<string, string>;
  /** Shell command run once before the spec, e.g. an app reset endpoint. */
  resetCmd?: string;
  /** Wall clock for the whole `npx playwright test` invocation. */
  timeoutMs?: number;
  /** Only the repair path may claim "the live replay passed this step". */
  liveReplayPassed?: boolean;
  onProgress?: (m: string) => void;
}

/**
 * Run the emitted spec once under plain `@playwright/test`, in a temp dir with
 * a minimal config, and report what happened.
 *
 * Copies rather than running in place, for the same reason spec-replay.mjs
 * does: the config names its own `testDir`/`testMatch`, so nothing in the
 * user's project (a root playwright.config, another spec, a global setup) can
 * change what this measures. Reset-command failure is fatal to the CHECK only
 * — it comes back as a skip, not a spec failure, because a spec that never ran
 * has said nothing about the emitter.
 */
export function runSpecCheck(o: SpecCheckOptions): SpecCheckResult {
  const flowFile = path.resolve(o.flowFile);
  const say = o.onProgress ?? (() => {});
  const base = path.basename(flowFile).replace(/\.flow\.ts$/, '');
  const dir = path.dirname(flowFile);
  const specSrc = path.join(dir, `${base}.spec.ts`);
  const empty: Omit<SpecCheckResult, 'verdict'> = {
    ran: false,
    skipped: null,
    passed: false,
    durationMs: 0,
    exitCode: null,
    timedOut: false,
    error: null,
    anchor: null,
    errorFile: null,
    errorLine: null,
    drift: [],
    driftCount: 0,
    workspace: null,
    specFile: null,
  };
  const skip = (why: string): SpecCheckResult => {
    const r = { ...empty, skipped: why };
    return { ...r, verdict: verdictFor(r, o.liveReplayPassed ?? false) };
  };

  if (!fs.existsSync(specSrc)) return skip(`no ${base}.spec.ts beside ${path.basename(flowFile)} — compile it first`);
  const pw = resolvePlaywrightTest(dir);
  if (!pw) {
    return skip(
      '@playwright/test could not be resolved from this project (`npm install -D @playwright/test`); the emitted spec imports it directly, so it was not run',
    );
  }

  // Beside the owned file, NOT in os.tmpdir(): the copies have to keep the same
  // node_modules ancestry as the original, or the spec's own first import fails
  // and the check reports a module error as if it were an emitter defect. The
  // directory is removed again when the spec passes, and kept when it does not
  // — a failure is exactly when someone wants the config, the log and the trace.
  const work = fs.mkdtempSync(path.join(dir, '.sitelooper-check-'));
  const flowCopy = path.join(work, `${base}.flow.ts`);
  const specCopy = path.join(work, `${base}.spec.ts`);
  fs.copyFileSync(flowFile, flowCopy);
  fs.copyFileSync(specSrc, specCopy);
  const reportFile = path.join(work, 'pw-report.json');
  const configFile = path.join(work, 'playwright.config.mjs');
  // No `defineConfig` import: a plain object is a valid config module, and
  // this way the config itself never depends on resolving @playwright/test
  // from the temp dir. Same shape as bench/spec-replay.mjs.
  fs.writeFileSync(
    configFile,
    `// GENERATED by sitelooper --check-spec — safe to delete.
export default {
  testDir: ${JSON.stringify(work)},
  testMatch: ${JSON.stringify(`${base}.spec.ts`)},
  timeout: 600_000,
  retries: 0,
  workers: 1,
  reporter: [['json', { outputFile: ${JSON.stringify(reportFile)} }], ['list']],
  use: { headless: true },
};
`,
  );

  if (o.resetCmd) {
    say(`  spec check reset: ${o.resetCmd}`);
    const reset = spawnSync(o.resetCmd, { shell: true, encoding: 'utf8', timeout: 120_000 });
    if (reset.error || reset.status !== 0) {
      return skip(`the --reset-cmd exited ${reset.status ?? reset.error?.message ?? 'by signal'} before the spec check could run`);
    }
  }

  // The scaffold reads every run var from process.env under its uppercased
  // name (emitSpecFile), so that is the only channel the values have.
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [k, v] of Object.entries(o.vars ?? {})) env[envName(k)] = v;

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const cmd = pw.cli ? [process.execPath, pw.cli] : [npx, 'playwright'];
  const argv = [...cmd.slice(1), 'test', '--config', configFile];
  say(`  spec check: ${cmd[0]} ${argv.join(' ')}`);
  const started = Date.now();
  const run = spawnSync(cmd[0], argv, {
    encoding: 'utf8',
    cwd: work,
    env,
    timeout: o.timeoutMs ?? 900_000,
    shell: !pw.cli && process.platform === 'win32',
  });
  const wallMs = Date.now() - started;
  fs.writeFileSync(path.join(work, 'run.log'), `${run.stdout ?? ''}${run.stderr ?? ''}`);

  let report: unknown = null;
  try {
    report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  } catch {
    /* the spec crashed before the reporter could write — handled below */
  }
  const parsed = parseSpecReport(report, [flowCopy, specCopy]);
  const timedOut = run.status === null;
  // No report at all is a failure with the runner's own output as the message:
  // a module that would not load never reaches the reporter.
  const error =
    parsed.error ??
    (parsed.tests.length
      ? null
      : shortError(plain(`${run.stderr ?? ''}${run.stdout ?? ''}`).trim() || 'playwright wrote no JSON report'));
  // The frame worth naming is the first with a `// @step` above it, not the
  // topmost: pick() throws from the helper block at the top of the flow file,
  // and "fwrd42.flow.ts:3981" tells a reviewer nothing.
  let anchor: string | null = null;
  let site = parsed.errorSites[0] ?? null;
  const sources = new Map<string, string>();
  const read = (f: string): string => {
    if (!sources.has(f)) {
      try {
        sources.set(f, fs.readFileSync(f, 'utf8'));
      } catch {
        sources.set(f, '');
      }
    }
    return sources.get(f) ?? '';
  };
  for (const frame of parsed.errorSites) {
    const found = findStepAnchor(read(frame.file.endsWith('.spec.ts') ? specCopy : flowCopy), frame.line);
    if (found) {
      anchor = found;
      site = frame;
      break;
    }
  }
  const r: Omit<SpecCheckResult, 'verdict'> = {
    ran: true,
    skipped: null,
    passed: parsed.passed && run.status === 0,
    durationMs: parsed.durationMs || wallMs,
    exitCode: run.status,
    timedOut,
    error: parsed.passed && run.status === 0 ? null : error,
    anchor,
    errorFile: site?.file ?? null,
    errorLine: site?.line ?? null,
    drift: parsed.drift,
    driftCount: parsed.drift.length,
    workspace: work,
    specFile: specSrc,
  };
  if (r.passed) {
    try {
      fs.rmSync(work, { recursive: true, force: true });
    } catch {
      /* left behind is harmless; it is dot-prefixed and named */
    }
  }
  return { ...r, verdict: verdictFor(r, o.liveReplayPassed ?? false), workspace: r.passed ? null : work };
}
