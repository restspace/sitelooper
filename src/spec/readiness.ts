import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isReadableFlowFile, liftFlowFile } from './lift.js';
import { liftReadableFlowFile } from './index.js';
import type { SpecFlow } from './ir.js';
import { assertionCounts } from './ir.js';
import { envName, runSpecCheck, inputEnvCollisions, removeCheckWorkspace, type SpecCheckOptions, type SpecCheckResult } from './check.js';
import { classifyDrift, describeDrift, type DriftFlow } from './drift-class.js';
import { SLOT_LINE } from '../execution/expect.js';
import type { SkillStep } from '../skills/store.js';

/**
 * Which actions the fault pass withholds, one run each:
 *  - 'step': one per flow step — its last gesture after which the recording saw
 *    the run's own work land (see planFaults);
 *  - 'all': every guarded gesture of the file.
 * Typing is never withheld: the emitter guards no fill (emit.ts observeAction).
 */
export type FaultMode = 'step' | 'all';

/** One entry of the artifact's `faultSites` export: a dispatch SITELOOPER_FAULT can withhold. */
export interface FaultSite {
  /** "<step> <segment>/<n>", the value SITELOOPER_FAULT takes and the `@step` anchor of the action. */
  site: string;
  step: string;
  segment: string;
  /** 1-based index of the recorded step in its segment. */
  index: number;
  tool: string;
}

/**
 * One fault run: the artifact executed with a single state-changing dispatch
 * withheld, everything else as in a clean run.
 *  - 'detected': the fault fired and the spec failed — at the withheld action
 *    itself ('action': its own effect gate), later in the same flow step
 *    ('step'), or in a later step or the flow's end checks ('later');
 *  - 'undetected': the fault fired and the spec still PASSED — nothing in the
 *    artifact checks what that action does;
 *  - 'not-reached': the spec passed without ever arriving at the action
 *    (conditional UI), so the run says nothing either way;
 *  - 'inconclusive': the run failed or could not run before the fault fired.
 */
export interface FaultCheck {
  site: string;
  step: string;
  tool: string;
  outcome: 'detected' | 'undetected' | 'not-reached' | 'inconclusive';
  detectedAt?: 'action' | 'step' | 'later';
  /** Where the failing run stopped (SpecCheckResult.anchor), when it failed. */
  anchor: string | null;
  error: string | null;
  durationMs: number;
}

const FAULT_ENTRY = /^(\S+) (\S+)\/(\d+) (\S+)$/;

/**
 * How strongly the recording says a gesture did the step's work: 2 when the
 * run's own values, a new record or an alert appeared after it, or a record
 * went (a save, a create, a delete); 1 when the page gained anything else (a
 * dialog opening, a navigation's new page); 0 when it recorded no change.
 */
function effectRank(step: SkillStep | undefined): 0 | 1 | 2 {
  const e = step?.expect;
  if (step?.mints || e?.alertContains || e?.goneContains?.length || e?.removalRequired || e?.addedContains?.some((l) => SLOT_LINE.test(l))) return 2;
  return e?.addedContains?.length ? 1 : 0;
}

/**
 * The fault runs for an artifact, from its own `faultSites` export — exactly
 * the guards the emitter wrote, in emit order — and, for 'step', the recording
 * behind it.
 *
 * 'step' picks ONE action per flow step: the last gesture of the highest
 * effect rank the step has (effectRank), so a step that saves and then walks
 * back to a list is tested on its save, and a step with no recorded effect at
 * all is still tested on its last gesture. A flow step with no gesture (only
 * typing, reads or checks) has no entry. Without the recording (`spec` null)
 * the last gesture of each step is taken.
 */
export function planFaults(entries: readonly string[], spec: SpecFlow | null, mode: FaultMode): FaultSite[] {
  const sites: FaultSite[] = [];
  for (const entry of entries) {
    const m = FAULT_ENTRY.exec(entry);
    if (m) sites.push({ site: `${m[1]} ${m[2]}/${m[3]}`, step: m[1], segment: m[2], index: Number(m[3]), tool: m[4] });
  }
  if (mode === 'all') return sites;
  const recorded = (f: FaultSite): SkillStep | undefined =>
    spec?.steps.find((s) => s.id === f.step)?.segments.find((g) => g.id === f.segment)?.steps[f.index - 1];
  const byStep = new Map<string, FaultSite[]>();
  for (const f of sites) byStep.set(f.step, [...(byStep.get(f.step) ?? []), f]);
  return [...byStep.values()].map((gestures) => {
    const ranked = gestures.map((f) => ({ f, rank: effectRank(recorded(f)) }));
    const best = Math.max(...ranked.map((r) => r.rank));
    return ranked.filter((r) => r.rank === best).pop()!.f;
  });
}

/** One fault run's result, read against the site it withheld. */
export function classifyFault(fault: FaultSite, result: SpecCheckResult): FaultCheck {
  const base = { site: fault.site, step: fault.step, tool: fault.tool, anchor: result.anchor ?? null, error: result.error ?? null, durationMs: result.durationMs };
  const fired = (result.faulted ?? []).some((line) => line.startsWith(`[sitelooper fault] ${fault.site}:`));
  if (!result.ran || result.outcome === 'unavailable') return { ...base, outcome: 'inconclusive', error: result.skipped ?? result.error ?? 'the fault run could not be executed' };
  if (result.passed) return { ...base, outcome: fired ? 'undetected' : 'not-reached', anchor: null, error: null };
  if (!fired) return { ...base, outcome: 'inconclusive' };
  const detectedAt = result.anchor === fault.site ? 'action' : result.anchor?.split(' ')[0] === fault.step ? 'step' : 'later';
  return { ...base, outcome: 'detected', detectedAt };
}

export interface ReadinessOptions extends SpecCheckOptions {
  runs?: number;
  datasets?: Record<string, string>[];
  /** Explicit confirmation that Playwright fixtures prepare fresh data for every run. */
  fixtureIsolation?: boolean;
  requiredInputs?: string[];
  requiredSteps?: string[];
  /** A user-authored test that asserts controlled failure detection; must pass. */
  negativeSpec?: string;
  /** Alternatively inject an explicit fault and require a specific assertion error. */
  negativeCheck?: { vars?: Record<string, string>; env?: Record<string, string>; expectedError: string };
  /**
   * Generated failure detection: after the clean runs, execute the artifact
   * once per chosen action with that action's dispatch withheld
   * (SITELOOPER_FAULT) and require each run to fail. See FaultMode.
   */
  faults?: FaultMode;
  evidenceFile?: string;
  /** The project snapshot: where a readable flow file's recording is looked for when its own bundle is missing. */
  snapshotFile?: string;
}

export interface ReadinessRun {
  index: number;
  datasetHash: string;
  result: SpecCheckResult;
  clean: boolean;
  blockers: string[];
  /** Locator fallbacks on reads that only feed the final report (drift-class.ts): reported, never blocking. */
  warnings: string[];
}

export interface ReadinessReport {
  schemaVersion: 1;
  stage: 'readiness';
  state: 'compiled' | 'spec-verified';
  /** Independent of the optional failure-detection check. */
  executionVerified: boolean;
  outcome: 'verified' | 'failed' | 'unavailable' | 'blocked';
  artifactHash: string;
  negativeArtifactHash?: string;
  verifiedAt: string | null;
  requiredRuns: number;
  distinctDatasets: number;
  runs: ReadinessRun[];
  blockers: string[];
  /**
   * What a clean run still logged that does not block the claim: a locator
   * fallback on a read whose value only feeds the final report (fwgt35-luna-cv,
   * the user's decision; drift-class.ts). `Run <n>: <drift line> — <why>`.
   */
  warnings: string[];
  failureDetection: 'verified' | 'not-configured' | 'failed';
  negativeResult?: SpecCheckResult;
  /** The fault pass (ReadinessOptions.faults): one row per withheld action. Absent when it was not asked for. */
  faults?: FaultCheck[];
  evidenceFile: string;
  /**
   * The assertions the compiled flow carries (`sitelooper assert`): how many of
   * its steps are assertions, and how many checks they hold between them. Each
   * is a condition the caller stated, which fails the run when it does not hold,
   * so a verified run with some is evidence about the app and not only about
   * the procedure. Evidence only: no outcome depends on it. Zero for a file
   * whose FLOW could not be read.
   */
  assertions: { steps: number; checks: number };
}

/** The TODO an older compiler wrote when it dropped a point candidate; the current one resolves the point instead. */
const LEGACY_POINT_TODO = '// TODO: dropped the recorded position fallback';

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Inspect JSON metadata without importing or executing the generated artifact. */
function metadata(source: string, name: string): string[] {
  const match = source.match(new RegExp(`export const ${name} = (\\[[^;]*?\\]) as const;`));
  if (!match) return [];
  try { const value: unknown = JSON.parse(match[1]); return Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : []; } catch { return []; }
}

export function artifactHash(flowFile: string, specFile?: string): string {
  const spec = specFile ?? flowFile.replace(/\.flow\.ts$/, '.spec.ts');
  return hash(fs.readFileSync(flowFile, 'utf8') + '\0' + fs.readFileSync(spec, 'utf8'));
}

/**
 * Verify only plain Playwright executions of the exact emitted artifact.
 * No replay, model recovery, retries, or implicit application mutations occur.
 * A supplied check runner is a dependency seam for deterministic orchestration tests.
 */
export function runReadinessCheck(o: ReadinessOptions, check: typeof runSpecCheck = runSpecCheck): ReadinessReport {
  const flowFile = path.resolve(o.flowFile);
  const specFile = o.specFile ? path.resolve(o.specFile) : flowFile.replace(/\.flow\.ts$/, '.spec.ts');
  const evidenceFile = path.resolve(o.evidenceFile ?? flowFile.replace(/\.flow\.ts$/, '.readiness.json'));
  const count = o.runs ?? 3;
  const report: ReadinessReport = {
    schemaVersion: 1, stage: 'readiness', state: 'compiled', executionVerified: false, outcome: 'blocked',
    artifactHash: '', verifiedAt: null, requiredRuns: count, distinctDatasets: 0,
    runs: [], blockers: [], warnings: [], failureDetection: 'not-configured', evidenceFile,
    assertions: { steps: 0, checks: 0 },
  };
  const unchanged = (): boolean => {
    try { return artifactHash(flowFile, specFile) === report.artifactHash; } catch { return false; }
  };
  const finish = (): ReadinessReport => {
    if (report.executionVerified && !unchanged()) {
      report.executionVerified = false;
      report.state = 'compiled';
      report.verifiedAt = null;
      report.outcome = 'blocked';
      report.blockers.push('The compiled artifact changed during verification; rerun readiness');
    }
    if (report.failureDetection === 'verified' && report.negativeArtifactHash && o.negativeSpec) {
      let same = false;
      try { same = artifactHash(flowFile, path.resolve(o.negativeSpec)) === report.negativeArtifactHash; } catch { /* removed */ }
      if (!same) {
        report.failureDetection = 'failed';
        report.outcome = 'blocked';
        report.blockers.push('The negative-check artifact changed during verification; rerun readiness');
      }
    }
    // Store dataset hashes, never a copy of supplied inputs or the environment.
    if (fs.existsSync(path.dirname(evidenceFile))) fs.writeFileSync(evidenceFile, JSON.stringify(report, null, 2) + '\n');
    return report;
  };
  if (!Number.isInteger(count) || count < 1) report.blockers.push('runs must be a positive integer');
  if (!fs.existsSync(flowFile) || !fs.existsSync(specFile)) {
    report.outcome = 'unavailable';
    report.blockers.push('Compile the flow and its spec before verification');
    return finish();
  }
  report.artifactHash = artifactHash(flowFile, specFile);
  if (o.negativeSpec) {
    if (!fs.existsSync(path.resolve(o.negativeSpec))) {
      report.outcome = 'unavailable';
      report.blockers.push('The configured negative spec does not exist');
      return finish();
    }
    report.negativeArtifactHash = artifactHash(flowFile, path.resolve(o.negativeSpec));
  }
  const source = fs.readFileSync(flowFile, 'utf8');
  const generatedInputs = metadata(source, 'requiredInputNames');
  const generatedSteps = metadata(source, 'flowStepIds');
  const requiredEnv = metadata(source, 'requiredEnvNames');
  const requiredInputs = [...new Set([...generatedInputs, ...(o.requiredInputs ?? [])])];
  const requiredSteps = [...new Set([...generatedSteps, ...(o.requiredSteps ?? [])])];
  // What each drift line's site is (gesture, consumed read, report-only read); without it every line blocks.
  let flow: DriftFlow | null = null;
  // A readable file has no FLOW constant: its recording is the bundle its
  // source line names. Its metadata exports, `// @step` markers and
  // `[sitelooper step]` lines are what the runs below read, so a recording that
  // cannot be found costs the assertion counts and step cross-check only.
  let spec: SpecFlow | null = null;
  if (isReadableFlowFile(source)) {
    try {
      const lifted = liftReadableFlowFile(flowFile, { snapshotFile: o.snapshotFile });
      spec = lifted.spec;
      report.warnings.push(...lifted.warnings);
    } catch (error) {
      report.warnings.push(`The recording behind this readable spec could not be loaded, so its assertions and steps were not cross-checked against it: ${(error as Error).message}`);
    }
  } else if (source.includes('// @sitelooper-flow-begin')) {
    try { spec = liftFlowFile(source).spec; } catch (error) { report.blockers.push(`Compiled metadata is invalid: ${(error as Error).message}`); }
  }
  if (spec) {
    flow = spec;
    report.assertions = assertionCounts(spec);
    for (const name of spec.vars) if (!requiredInputs.includes(name)) requiredInputs.push(name);
    for (const step of spec.steps) {
      if (!requiredSteps.includes(step.id)) requiredSteps.push(step.id);
      if (!step.segments.length || step.segments.some((segment) => !segment.steps.length)) report.blockers.push(`Step ${step.id} has no complete recorded procedure`);
    }
    if (!spec.steps.length) report.blockers.push('Compiled flow has no required steps');
  }
  if (!requiredSteps.length) report.blockers.push('Required-step metadata is missing; regenerate the compiled flow or supply requiredSteps');
  const todos = source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith('// TODO:'));
  // An artifact compiled before a recorded position could be resolved carries
  // this line for every chain that had a point. The current compiler resolves
  // the point and never writes it, so the artifact is not unsupported — it is
  // stale, and the fix is a regeneration, which the blocker says outright.
  if (todos.some((line) => line.startsWith(LEGACY_POINT_TODO))) {
    report.blockers.push('Compiled source was generated by an older version of sitelooper (it predates point resolution); regenerate it with `sitelooper compile`');
  }
  if (todos.some((line) => !line.startsWith(LEGACY_POINT_TODO))) {
    report.blockers.push('Compiled source contains unresolved or unsupported actions');
  }
  // A step that runs without checking its own effect passes for a reason
  // that has nothing to do with the app being right, and three green runs of
  // it are three runs of nothing. Readiness is the claim that the artifact
  // was executed AND verified, so an unverifiable step blocks the claim
  // rather than quietly lowering what it is worth.
  const unchecked = source.split(/\r?\n/).filter((line) => line.trim().startsWith('// UNCHECKED:')).length;
  if (unchecked) {
    report.blockers.push(
      `${unchecked} step(s) have a required expectation the compiler could not express, so the artifact does not verify their effect — re-record those steps or assert the outcome in your own spec`,
    );
  }
  // The fault pass withholds dispatches through the guards the runtime style
  // emits; a file without them cannot be asked, and saying so before three
  // clean runs is cheaper than after.
  if (o.faults) {
    if (isReadableFlowFile(source)) {
      report.blockers.push('Fault checks need a runtime-style flow file: a readable file carries no fault guard. Compile the runtime style (the default) to check failure detection');
    } else if (!source.includes('export const faultSites = ')) {
      report.blockers.push('Compiled source was generated by a version of sitelooper without fault guards; regenerate it with `sitelooper compile` to check failure detection');
    }
  }
  if (!o.resetCmd && !o.fixtureIsolation) report.blockers.push('Supply resetCmd or declare fixtureIsolation so every run prepares fresh state');
  if (o.isolated) report.blockers.push('An isolated compiler smoke test cannot establish project readiness');
  const datasetAt = (i: number): Record<string, string> => {
    const data = { ...(o.vars ?? {}), ...(o.datasets?.length ? o.datasets[i % o.datasets.length] : {}) };
    return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.replace(/\{n\}/g, String(i + 1))]));
  };
  const datasets = Array.from({ length: Number.isInteger(count) && count > 0 && count < 1000 ? count : 0 }, (_, i) => datasetAt(i));
  if (count >= 1000) report.blockers.push('runs must be fewer than 1000');
  for (let i = 0; i < datasets.length; i++) {
    report.blockers.push(...inputEnvCollisions(datasets[i]).map((collision) => `Run ${i + 1}: ${collision}`));
    const missing = requiredInputs.filter((name) => !datasets[i][name]);
    if (missing.length) report.blockers.push(`Run ${i + 1} is missing required inputs: ${missing.join(', ')}`);
    const environment = { ...process.env, ...o.env, ...Object.fromEntries(Object.entries(datasets[i]).map(([k, v]) => [envName(k), v])) };
    const missingEnv = requiredEnv.filter((name) => !environment[name]?.trim());
    if (missingEnv.length) report.blockers.push(`Run ${i + 1} is missing required environment inputs: ${missingEnv.join(', ')}`);
  }
  const datasetHash = (data: Record<string, string>) => hash(JSON.stringify(Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)))));
  const datasetHashes = datasets.map(datasetHash);
  const independenceHashes = datasets.map((data) => datasetHash(requiredInputs.length
    ? Object.fromEntries(requiredInputs.map((name) => [name, data[name] ?? ''])) : data));
  report.distinctDatasets = new Set(independenceHashes).size;
  if ((requiredInputs.length || Object.keys(o.vars ?? {}).length || o.datasets?.some((d) => Object.keys(d).length)) && report.distinctDatasets < 2) {
    report.blockers.push('Parameterized flows need at least two distinct datasets; use {n} in input values or supply datasets');
  }
  if (report.blockers.length) return finish();
  for (let i = 0; i < datasets.length; i++) {
    o.onProgress?.(`Readiness: execution ${i + 1}/${count}`);
    const result = check({ ...o, flowFile, specFile, vars: datasets[i] });
    const blockers: string[] = [];
    if (!result.ran || result.outcome === 'unavailable') blockers.push(result.skipped ?? 'Validation unavailable');
    else if (!result.passed) blockers.push(result.error ?? 'Spec failed');
    if (result.skippedCount) blockers.push(`${result.skippedCount} tests skipped`);
    if (result.satisfied?.length) blockers.push(`${result.satisfied.length} actions were already satisfied and did not execute`);
    // Converge asks the same question of its passing check (converge.ts), so a
    // spec it called converged is not refused here for the same fallback.
    const drift = classifyDrift(result.drift ?? [], flow);
    if (drift.blocking.length) blockers.push(describeDrift(drift.blocking));
    const unlined = (result.driftCount ?? 0) - (result.drift?.length ?? 0);
    if (unlined > 0) blockers.push(`${unlined} locator fallback events with no drift line to classify`);
    const warnings = drift.warnings.map((e) => `${e.line} — ${e.why}`);
    const missingSteps = requiredSteps.filter((step) => !result.executedSteps?.includes(step));
    if (missingSteps.length) blockers.push(`Required steps did not complete: ${missingSteps.join(', ')}`);
    report.runs.push({ index: i + 1, datasetHash: datasetHashes[i], result, clean: blockers.length === 0, blockers, warnings });
    report.warnings.push(...warnings.map((w) => `Run ${i + 1}: ${w}`));
    if (blockers.length) {
      report.outcome = !result.ran || result.outcome === 'unavailable' ? 'unavailable' : 'failed';
      report.blockers.push(...blockers.map((b) => `Run ${i + 1}: ${b}`));
      return finish();
    }
  }
  report.executionVerified = true;
  report.state = 'spec-verified';
  report.verifiedAt = new Date().toISOString();
  if (!unchanged()) return finish();
  if (o.negativeSpec || o.negativeCheck) {
    o.onProgress?.('Readiness: explicit failure-detection check');
    const negative = o.negativeCheck;
    const result = check({ ...o, flowFile, specFile: o.negativeSpec ?? specFile,
      vars: { ...datasets[datasets.length - 1], ...negative?.vars }, env: { ...o.env, ...negative?.env } });
    report.negativeResult = result;
    const valid = result.ran && !result.timedOut && (o.negativeSpec
      ? result.passed && !result.skippedCount
      : !result.passed && !!negative?.expectedError && !!result.error?.includes(negative.expectedError));
    report.failureDetection = valid ? 'verified' : 'failed';
    if (!valid) {
      report.outcome = !result.ran ? 'unavailable' : 'failed';
      report.blockers.push('The configured negative check did not demonstrate the expected failure detection');
      return finish();
    }
  }
  if (o.faults) {
    const plan = planFaults(metadata(source, 'faultSites'), spec, o.faults);
    report.faults = [];
    if (!plan.length) report.warnings.push('Fault checks: the flow has no gesture to withhold, so failure detection was not checked');
    for (let k = 0; k < plan.length; k++) {
      const fault = plan[k];
      o.onProgress?.(`Readiness: fault ${k + 1}/${plan.length} — withholding ${fault.site} (${fault.tool})`);
      // A fresh dataset per fault run ({n} goes on counting past the clean
      // runs), for a project whose fixtures isolate by input value.
      const result = check({ ...o, flowFile, specFile, vars: datasetAt(datasets.length + k), env: { ...o.env, SITELOOPER_FAULT: fault.site } });
      const row = classifyFault(fault, result);
      report.faults.push(row);
      // A failure that was asked for leaves nothing to debug: only a run that
      // went wrong some other way keeps its workspace.
      if (row.outcome === 'detected' && result.workspace) {
        try { removeCheckWorkspace(result.workspace, flowFile); } catch { /* not ours to remove */ }
      }
    }
    const of = (outcome: FaultCheck['outcome']) => report.faults!.filter((f) => f.outcome === outcome);
    for (const f of of('not-reached')) report.warnings.push(`Fault at ${f.site} (${f.tool}): the run passed without reaching that action, so it shows nothing about failure detection`);
    for (const f of of('undetected')) report.blockers.push(`Fault at ${f.site} (${f.tool}) was not detected: the spec passed with that action withheld, so nothing in it checks what the action does`);
    for (const f of of('inconclusive')) report.blockers.push(`Fault at ${f.site} (${f.tool}) was inconclusive: ${f.error ?? 'the run failed before the action was reached'}`);
    if (of('undetected').length || of('inconclusive').length) {
      report.failureDetection = 'failed';
      report.outcome = of('undetected').length ? 'failed' : 'unavailable';
      return finish();
    }
    if (of('detected').length) report.failureDetection = 'verified';
  }
  report.outcome = 'verified';
  return finish();
}
