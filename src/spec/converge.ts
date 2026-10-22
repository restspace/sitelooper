/**
 * `sitelooper build --converge`: compile → check → re-record as one command.
 *
 * bench/converge.mjs found out how far the EXISTING mechanisms take a
 * recording that does not compile to a passing model-free artifact: refused
 * compiles name steps to re-record, a failing spec names the step it died at,
 * and re-recording that step (the model works that one step; the rest
 * replays) usually clears it. This is that loop without the bench: the model
 * is only ever used by a re-record, and the artifact that ends the loop is
 * model-free.
 *
 * The rules are the bench's lessons, each paid for in model turns:
 *
 *  - A FAILURE names the step first. A `[sitelooper drift]` line on a failing
 *    check is a locator the artifact healed on its way past: fwsi14-cv2 spent
 *    207 turns re-recording 02-create (a healed drift) while the spec failed
 *    at 03-open every round. A failing check's drift is never read.
 *  - A PASSING check is converged only when readiness would call it clean:
 *    its drift lines go through the classifier readiness uses
 *    (drift-class.ts). A fallback on a gesture, or on a read a later step
 *    consumes, blocks — the round re-records the first step it names; one on
 *    a read that only feeds the final report is a warning. fwgt35-luna-cv
 *    printed "converged" and then readiness exited 4 on 5 such fallbacks.
 *  - A producer a failure names ("02-open needs {{01-signin.x}}") is the
 *    step to re-record, and what to read there: fwvk15-cv burned four rounds
 *    re-recording the consumer.
 *  - A check that only timed out is the emitted budget (MAX_BUDGET_MS), not a
 *    step failure (fwod88-cv4: the artifact had passed, then hit 300s).
 *  - A step whose re-record the re-pin rule refused twice does not replay
 *    clean; a third attempt is not made (fwop15-cv: four identical refusals,
 *    150 model turns). The second attempt gets a third run.
 *  - The last re-record is compiled and checked too: the loop must not end on
 *    an untested recording (fwgt15-cv2).
 *
 *  - Work the recording did that the flow left out (Flow.omitted, compile's
 *    `omitted-work`) is REDONE before the spec is checked: the instruction is
 *    inserted as a step where it was recorded and re-recorded like any other.
 *    A spec that passes without it proves nothing (kimai hbkm3: the order
 *    number was only ever set by a blocked instruction and its failed retry;
 *    the spec passed with none).
 *
 * Every effect is a seam, so the loop is driven with fakes in
 * test/build-converge.test.ts; src/cli.ts wires the real compile, spec check,
 * re-record and reset command.
 */
import type { Diagnostic } from './diagnostics.js';
import { messageAnchor } from './check.js';
import { classifyDrift, describeDrift, firstBlockingStep, type DriftFlow } from './drift-class.js';

/** What the loop needs of a compile: `CompileResult` satisfies it. */
export interface ConvergeCompile {
  refused: boolean;
  compilable: boolean;
  flowFile: string | null;
  diagnostics: Diagnostic[];
  compileBlockers: string[];
  /**
   * The flow's steps in order: the ids give the order a refusal's re-records
   * are taken in, and the segments say what a drift line's site is
   * (drift-class.ts). Without segments every drift line blocks.
   */
  spec?: DriftFlow;
}

/** What the loop needs of a spec check: `SpecCheckResult` satisfies it. */
export interface ConvergeCheck {
  ran: boolean;
  passed: boolean;
  timedOut: boolean;
  error: string | null;
  /** "04-open s_1e46d8/10": the nearest `// @step` above the failing line. */
  anchor: string | null;
  verdict?: string;
  /** `[sitelooper drift]` lines; read only on a passing check. */
  drift?: string[];
  driftCount?: number;
}

export interface ConvergeRerecord {
  ok: boolean;
  pinned: string | null;
  runs: Array<{ status: string; tier: string | null; turns: number | null }>;
  diagnostics: string[];
}

export interface ConvergeSeams {
  compile(): ConvergeCompile;
  /** Runs the compiled spec once; `reset` has already run. */
  check(flowFile: string): ConvergeCheck;
  /** Re-record one step. `outputs`: values a later step needs, to be read from the page. */
  rerecord(step: string, o: { runs: number; outputs: string[] }): Promise<ConvergeRerecord>;
  /**
   * Insert the omitted instruction as step `step` after `after` (null: first)
   * when the flow has no such step yet, then re-record it. On success the
   * flow's omitted entry goes. Absent: omitted work is left as a warning.
   */
  recover?(o: { step: string; after: string | null; instruction: string; runs: number }): Promise<ConvergeRerecord>;
  /** Puts the app back before every check (the `--reset-cmd`); absent when there is none. */
  reset?(): void;
  /** One progress line per event; the CLI prints them to stderr. */
  say?(line: string): void;
}

export interface ConvergeOptions {
  /** Rounds before the loop gives up (each may re-record one step). */
  maxRounds: number;
  /** Runs of a first re-record of a step; a second attempt at the same step gets at least three. */
  rerecordRuns: number;
  /** False when no model can be called: the loop compiles and checks, and stops `unavailable` where a re-record would be needed. */
  modelAvailable?: boolean;
}

export interface ConvergeRound {
  round: number;
  /** True for the check after the last round's re-record: it never re-records. */
  final?: boolean;
  compile: {
    refused: boolean;
    outcome: 'compiled' | 'refused';
    /** `code@step` of every error diagnostic. */
    codes: string[];
    /** Steps the refusal says to re-record, in flow order. */
    steps: string[];
    blockers: string[];
    flowFile: string | null;
  };
  check?: {
    ran: boolean; passed: boolean; timedOut: boolean; step: string | null; anchor: string | null; error: string | null;
    /** A passing check's locator fallbacks, as readiness classifies them; `step` is the first blocking one's. */
    drift?: { blocking: number; warnings: number; step: string | null };
  };
  rerecord?: { step: string; why: string; ok: boolean; attempt: number; runs: number; pinned: string | null; turns: number; diagnostics: string[] };
}

export type ConvergeStatus =
  | 'converged'
  | 'stuck'          // nothing names a step to re-record
  | 'stuck-repin'    // one step's re-record was refused twice
  | 'timed-out'      // the check only hit the runner's budget
  | 'unavailable'    // the spec could not be run at all
  | 'exhausted';     // the round cap

export interface ConvergeResult {
  status: ConvergeStatus;
  why: string;
  rounds: ConvergeRound[];
  /** The artifact that passed, when one did. */
  flowFile: string | null;
  modelTurns: number;
}

/** The outputs a refusal says nobody publishes, by producer step ("{{03-create.ref}}, and nothing has ever published"). */
function missingOutputs(diagnostics: Diagnostic[]): Map<string, string[]> {
  const missing = new Map<string, string[]>();
  for (const d of diagnostics) {
    if (d.severity !== 'error') continue;
    const m = /\{\{([\w-]+)\.([\w.-]+?)\}\}, and nothing has ever published/.exec(d.what ?? '');
    if (m) missing.set(m[1], [...new Set([...(missing.get(m[1]) ?? []), m[2]])]);
  }
  return missing;
}

/**
 * The steps a refused compile says to re-record, in FLOW order: an unsourced
 * reference names its producer (03-create) beside the consumer's own pin
 * (08-open), and re-recording the producer first usually clears the rest.
 * One re-record per round, then recompile — cheaper than re-recording every
 * named step on evidence the next compile will change.
 */
export function rerecordSteps(diagnostics: Diagnostic[], order: string[]): string[] {
  const at = new Map(order.map((id, i) => [id, i]));
  const named = diagnostics
    .filter((d) => d.severity === 'error' && d.action?.command === 'rerecord')
    .map((d) => d.action?.step ?? d.step)
    .filter((s): s is string => Boolean(s));
  return [...new Set(named)].sort((a, b) => (at.get(a) ?? 1e9) - (at.get(b) ?? 1e9));
}

/** The first omitted instruction a compile says `build` can redo (ir.ts omittedDiagnostics' `recover` action). */
export function omittedToRecover(diagnostics: Diagnostic[]): { step: string; after: string | null; instruction: string } | null {
  for (const d of diagnostics) {
    if (d.code !== 'omitted-work' || d.action?.command !== 'recover' || !d.action.step) continue;
    const [after, instruction] = d.action.args;
    if (instruction) return { step: d.action.step, after: after || null, instruction };
  }
  return null;
}

/** Playwright's own whole-test budget message, as opposed to a locator or expect timeout inside a step. */
const TEST_BUDGET = /\bTest timeout of \d+\s*ms exceeded\b/i;

/**
 * The step a failing spec check names, from the failure alone: the producer
 * of a value the failure says it needed, else the failure's own site.
 * Never a drift line. `null` when the failure names none.
 */
export function failingStep(check: Pick<ConvergeCheck, 'error' | 'anchor'>): { step: string | null; outputs: string[] } {
  const error = check.error ?? '';
  const producer = /needs \{\{([\w-]+)\.([\w.-]+?)\}\}/.exec(error);
  if (producer) {
    const outputs = [...new Set([...error.matchAll(new RegExp(`needs \\{\\{${producer[1]}\\.([\\w.-]+?)\\}\\}`, 'g'))].map((m) => m[1]))];
    return { step: producer[1], outputs };
  }
  // The checks the artifact makes after its last step (emit.ts runFlow) name
  // their step only in the message: "persistence: 01-create typed …" and
  // "PARTIAL: 01-create: …". They are thrown outside every step's anchor, so
  // an anchor here would be wrong — read the message first.
  const after = /^(?:Error: )?(?:persistence|PARTIAL): ([\w-]+)\b/m.exec(error);
  if (after) return { step: after[1], outputs: [] };
  // The artifact's own message leads with the site ("05-add s_f44792: …"), and
  // that beats the stack anchor, which names the nearest marker ABOVE the throw:
  // a start gate throws before its segment's first marker (fwen8; messageAnchor).
  const own = messageAnchor(error);
  if (own) return { step: own.split(/\s+/)[0], outputs: [] };
  const anchor = check.anchor?.trim().split(/\s+/)[0];
  if (anchor) return { step: anchor, outputs: [] };
  const site = /(?:^|[\s(:])([\w-]+) s_[0-9a-f]{6}(?:\/\d+)?\b/.exec(error);
  return { step: site?.[1] ?? null, outputs: [] };
}

/** Whether a failed check is the runner's budget and nothing else. */
export function budgetOnly(check: Pick<ConvergeCheck, 'timedOut' | 'error'>): boolean {
  return check.timedOut || TEST_BUDGET.test(check.error ?? '');
}

export async function converge(seams: ConvergeSeams, o: ConvergeOptions): Promise<ConvergeResult> {
  const say = seams.say ?? (() => {});
  const rounds: ConvergeRound[] = [];
  const refused = new Map<string, number>();
  let order: string[] = [];
  let modelTurns = 0;
  /** The last passing check that blocking drift kept from converging: the honest why when the budget runs out. */
  let lastShort: string | null = null;
  const done = (status: ConvergeStatus, why: string, flowFile: string | null = null): ConvergeResult => {
    say(`converge: ${status} — ${why}`);
    return { status, why, rounds, flowFile, modelTurns };
  };

  for (let k = 1; k <= o.maxRounds + 1; k++) {
    // Round maxRounds+1 only tests the last round's re-record; it never makes another.
    const final = k > o.maxRounds;
    const last = rounds.at(-1);
    if (final && !last?.rerecord?.ok) break;

    const c = seams.compile();
    if (c.spec?.steps.length) order = c.spec.steps.map((s) => s.id);
    const isRefused = c.refused || !c.compilable || !c.flowFile;
    const steps = isRefused ? rerecordSteps(c.diagnostics, order) : [];
    const round: ConvergeRound = {
      round: k,
      ...(final ? { final: true } : {}),
      compile: {
        refused: isRefused,
        outcome: isRefused ? 'refused' : 'compiled',
        codes: [...new Set(c.diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.code}@${d.step ?? '-'}`))],
        steps,
        blockers: c.compileBlockers.slice(0, 10),
        flowFile: c.flowFile,
      },
    };
    rounds.push(round);

    // A step to re-record: with the reason, the outputs a later step needs read there.
    const rerecordStep = async (step: string, why: string, outputs: string[], run: (runs: number) => Promise<ConvergeRerecord> = (runs) => seams.rerecord(step, { runs, outputs })): Promise<ConvergeResult | null> => {
      if (o.modelAvailable === false) {
        return done('unavailable', `${step} needs a re-record (${why}), and no model API key is configured: set one (see \`sitelooper doctor\`) and run build again, or pass --no-converge`);
      }
      const before = refused.get(step) ?? 0;
      if (before >= 2) {
        return done('stuck-repin', `${step} was re-recorded twice and the re-pin rule refused both: its procedure does not replay clean`);
      }
      const runs = before ? Math.max(o.rerecordRuns, 3) : o.rerecordRuns;
      say(`converge round ${k}: re-recording ${step} (${why}), ${runs} run(s)${before ? ' — refused before' : ''}`);
      const r = await run(runs);
      if (!r.ok) refused.set(step, before + 1);
      const turns = r.runs.reduce((n, x) => n + (x.turns ?? 0), 0);
      modelTurns += turns;
      round.rerecord = { step, why, ok: r.ok, attempt: refused.get(step) ?? 0, runs: r.runs.length, pinned: r.pinned, turns, diagnostics: r.diagnostics.slice(0, 5) };
      return null;
    };

    if (isRefused) {
      say(`converge round ${k}: compile refused (${round.compile.codes.join(', ') || 'no error code'}); re-record: ${steps.join(', ') || 'nothing named'}`);
      // Refused with no action is a compiler blocker: nothing to retry.
      if (!steps.length) return done('stuck', `compile refused with no re-record action${round.compile.blockers.length ? `: ${round.compile.blockers[0]}` : ''}`);
      if (final) return done('stuck', 'the last re-record did not clear the compile refusal');
      const stop = await rerecordStep(steps[0], `compile refusal${steps.length > 1 ? `; also named: ${steps.slice(1).join(', ')}` : ''}`, missingOutputs(c.diagnostics).get(steps[0]) ?? []);
      if (stop) return stop;
      continue;
    }

    // Work the flow left out is redone before the spec is asked anything: a
    // pass without it is not a pass of the recording's task.
    const lost = seams.recover ? omittedToRecover(c.diagnostics) : null;
    if (lost) {
      const quoted = `"${lost.instruction.slice(0, 70)}${lost.instruction.length > 70 ? '…' : ''}"`;
      say(`converge round ${k}: the recording's instruction ${quoted} is not in the flow; redoing it as ${lost.step}`);
      if (final) return done('exhausted', `${o.maxRounds} round(s); the recording's instruction ${quoted} changed the app and is still not in the flow`);
      const stop = await rerecordStep(lost.step, `omitted work, recorded after ${lost.after ?? 'the start'}`, [], (runs) => (seams.recover as NonNullable<ConvergeSeams['recover']>)({ ...lost, runs }));
      if (stop) return stop;
      continue;
    }

    seams.reset?.();
    const chk = seams.check(c.flowFile as string);
    const step = chk.passed ? null : failingStep(chk);
    round.check = { ran: chk.ran, passed: chk.passed, timedOut: chk.timedOut, step: step?.step ?? null, anchor: chk.anchor, error: chk.error ? chk.error.slice(0, 400) : null };
    if (!chk.ran) return done('unavailable', `the compiled spec could not be run${chk.verdict ? `: ${chk.verdict}` : ''}`);
    if (chk.passed) {
      // Readiness's own question (drift-class.ts): a pass that leaned on a
      // fallback where the run acted, or where it read a value it went on to
      // use, is not clean, and must not be called converged.
      const drift = classifyDrift(chk.drift ?? [], c.spec);
      const unlined = Math.max(0, (chk.driftCount ?? 0) - (chk.drift?.length ?? 0));
      const blockingCount = drift.blocking.length + unlined;
      const at = firstBlockingStep(drift.blocking, order);
      round.check.drift = { blocking: blockingCount, warnings: drift.warnings.length, step: at };
      const warned = drift.warnings.length ? ` (${drift.warnings.length} locator fallback warning(s) on report-only reads)` : '';
      if (!blockingCount) return done('converged', `round ${k}: the compiled spec passed${warned}`, c.flowFile);
      const short = drift.blocking.length
        ? `spec passes but ${describeDrift(drift.blocking, 'blocking locator fallbacks')}`
        : `spec passes but ${unlined} locator fallback events have no drift line to classify`;
      lastShort = `round ${k}: ${short}`;
      say(`converge round ${k}: the ${short}`);
      if (final) return done('exhausted', `${o.maxRounds} round(s); ${short}`);
      if (!at) return done('stuck', `round ${k}: ${short}, and none names a step to re-record`);
      if (order.length && !order.includes(at)) return done('stuck', `round ${k}: ${short}; ${at} is not a step of this flow`);
      const stop = await rerecordStep(at, `the spec passed but ${describeDrift(drift.blocking.filter((e) => e.step === at), 'blocking locator fallbacks')}`, []);
      if (stop) return stop;
      continue;
    }
    say(`converge round ${k}: the spec failed${step?.step ? ` at ${step.step}` : ''}${chk.error ? ` — ${chk.error.split('\n')[0].slice(0, 160)}` : ''}`);
    // The budget, not a recording: re-recording a step cannot lengthen it.
    if (budgetOnly(chk)) return done('timed-out', `round ${k}: the spec check only hit its time budget; no step failed (raise the runner's timeout or shorten the flow)`);
    if (final) return done('exhausted', `${o.maxRounds} round(s) and the last re-record still fail${step?.step ? ` at ${step.step}` : ''}`);
    if (!step?.step) return done('stuck', `round ${k}: the spec failed and the failure names no step to re-record`);
    if (order.length && !order.includes(step.step)) return done('stuck', `round ${k}: the failure names ${step.step}, which is not a step of this flow`);
    const stop = await rerecordStep(step.step, step.outputs.length ? 'a later step needs values it never published' : 'the spec failed at this step', step.outputs);
    if (stop) return stop;
  }
  return done('exhausted', lastShort && rounds.at(-1)?.check?.drift?.blocking
    ? `${o.maxRounds} round(s); ${lastShort} and its re-record did not replay clean`
    : `${o.maxRounds} round(s) without a passing compiled spec`);
}

export interface BuildConvergeInput {
  /** `--no-converge` was given. */
  noConverge: boolean;
  /** `--converge` was given: undefined when absent, '' when bare, else the raw round count. */
  convergeFlag: string | undefined;
  /** `--reset-cmd` or the project config's resetCommand. */
  resetCmd: string | undefined;
  /** The provider config resolves with an API key. */
  hasModelKey: boolean;
}

export type BuildConvergeDecision =
  | { mode: 'plain'; skipped: null }
  | { mode: 'plain'; skipped: string }
  | { mode: 'converge'; maxRounds: number; modelAvailable: boolean };

export const DEFAULT_BUILD_ROUNDS = 2;
export const DEFAULT_EXPLICIT_ROUNDS = 3;

export const NO_RESET_SKIP_MESSAGE = 'convergence skipped: no reset command is configured, so a failing spec cannot be re-checked against a clean app (pass --reset-cmd "<command>" or set resetCommand in the project config; --no-converge silences this)';

/**
 * What `build` does about convergence. An explicit --converge always converges
 * (a bare one takes 3 rounds); the default is 2 rounds, and only when a reset
 * command exists. An absent API key does not skip convergence: the loop still
 * compiles and checks, and stops `unavailable` where a re-record is needed.
 */
export function decideBuildConvergence(i: BuildConvergeInput): BuildConvergeDecision {
  if (i.noConverge) return { mode: 'plain', skipped: null };
  if (i.convergeFlag !== undefined) {
    const n = i.convergeFlag === '' ? DEFAULT_EXPLICIT_ROUNDS : Number(i.convergeFlag);
    return { mode: 'converge', maxRounds: n, modelAvailable: i.hasModelKey };
  }
  if (!i.resetCmd) return { mode: 'plain', skipped: NO_RESET_SKIP_MESSAGE };
  return { mode: 'converge', maxRounds: DEFAULT_BUILD_ROUNDS, modelAvailable: i.hasModelKey };
}

/** One line per round for the terminal. */
export function roundLine(r: ConvergeRound): string {
  const parts = [`round ${r.round}${r.final ? ' (final check)' : ''}: compile ${r.compile.outcome}${r.compile.codes.length ? ` (${r.compile.codes.join(', ')})` : ''}`];
  if (r.check) parts.push(`check ${!r.check.ran ? 'unavailable' : r.check.passed ? 'passed' : r.check.timedOut ? 'timed out' : `failed${r.check.step ? ` at ${r.check.step}` : ''}`}`
    + (r.check.drift?.blocking ? ` with ${r.check.drift.blocking} blocking locator fallback(s)${r.check.drift.step ? ` at ${r.check.drift.step}` : ''}` : '')
    + (r.check.drift?.warnings ? `, ${r.check.drift.warnings} report-only fallback warning(s)` : ''));
  if (r.rerecord) parts.push(`re-record ${r.rerecord.step} ${r.rerecord.ok ? 'ok' : `refused (attempt ${r.rerecord.attempt})`}, ${r.rerecord.turns} turn(s)`);
  return parts.join('; ');
}
