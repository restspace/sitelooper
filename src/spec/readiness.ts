import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { liftFlowFile } from './lift.js';
import { envName, runSpecCheck, inputEnvCollisions, type SpecCheckOptions, type SpecCheckResult } from './check.js';

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
  evidenceFile?: string;
}

export interface ReadinessRun {
  index: number;
  datasetHash: string;
  result: SpecCheckResult;
  clean: boolean;
  blockers: string[];
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
  failureDetection: 'verified' | 'not-configured' | 'failed';
  negativeResult?: SpecCheckResult;
  evidenceFile: string;
}

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
    runs: [], blockers: [], failureDetection: 'not-configured', evidenceFile,
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
  if (source.includes('// @sitelooper-flow-begin')) {
    try {
      const { spec } = liftFlowFile(source);
      for (const name of spec.vars) if (!requiredInputs.includes(name)) requiredInputs.push(name);
      for (const step of spec.steps) {
        if (!requiredSteps.includes(step.id)) requiredSteps.push(step.id);
        if (!step.segments.length || step.segments.some((segment) => !segment.steps.length)) report.blockers.push(`Step ${step.id} has no complete recorded procedure`);
      }
      if (!spec.steps.length) report.blockers.push('Compiled flow has no required steps');
    } catch (error) { report.blockers.push(`Compiled metadata is invalid: ${(error as Error).message}`); }
  }
  if (!requiredSteps.length) report.blockers.push('Required-step metadata is missing; regenerate the compiled flow or supply requiredSteps');
  if (source.split(/\r?\n/).some((line) => line.trim().startsWith('// TODO:') && !line.trim().startsWith('// TODO: dropped the recorded position fallback'))) {
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
  if (!o.resetCmd && !o.fixtureIsolation) report.blockers.push('Supply resetCmd or declare fixtureIsolation so every run prepares fresh state');
  if (o.isolated) report.blockers.push('An isolated compiler smoke test cannot establish project readiness');
  const datasets = Array.from({ length: Number.isInteger(count) && count > 0 && count < 1000 ? count : 0 }, (_, i) => {
    const data = { ...(o.vars ?? {}), ...(o.datasets?.length ? o.datasets[i % o.datasets.length] : {}) };
    return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.replace(/\{n\}/g, String(i + 1))]));
  });
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
    if (result.driftCount) blockers.push(`${result.driftCount} locator fallback events`);
    const missingSteps = requiredSteps.filter((step) => !result.executedSteps?.includes(step));
    if (missingSteps.length) blockers.push(`Required steps did not complete: ${missingSteps.join(', ')}`);
    report.runs.push({ index: i + 1, datasetHash: datasetHashes[i], result, clean: blockers.length === 0, blockers });
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
  report.outcome = 'verified';
  return finish();
}
