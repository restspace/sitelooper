import fs from 'node:fs';
import path from 'node:path';
import { loadFlowFile } from '../skills/flow.js';
import { SkillStore } from '../skills/store.js';
import { emitFlowFile, emitSpecFile } from './emit.js';
import { flowToSpec, type SpecFlow } from './ir.js';
import { hasError, type Diagnostic } from './diagnostics.js';
import {
  BundleSkillStore,
  compilerProvenance,
  exportFlowBundle,
  isFlowBundle,
  loadFlowBundle,
  type CompilerProvenance,
  type FlowBundle,
} from './bundle.js';

export type { SpecFlow, SpecSegment, SpecStep } from './ir.js';
export type { Diagnostic, DiagnosticCode } from './diagnostics.js';
export { emitFlowFile, emitSpecFile } from './emit.js';
export { flowToSpec } from './ir.js';
export { formatDiagnostic, diagnosticLine, hasError } from './diagnostics.js';
export { BundleSkillStore, compilerProvenance, exportFlowBundle, isFlowBundle, loadFlowBundle } from './bundle.js';
export type { CompilerProvenance, ExportFlowBundleResult, FlowBundle } from './bundle.js';

/** Filename-safe form of a flow name; the same rule flow.ts uses for its own files. */
function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_') || 'flow';
}

export interface CompileResult {
  compiler: CompilerProvenance;
  spec: SpecFlow;
  /** null when an ERROR diagnostic refused the write and `allowDemoted` was not set. */
  flowFile: string | null;
  /** null when the scaffold existed already (or the whole write was refused) and `overwriteSpec` was not set. */
  specFile: string | null;
  warnings: string[];
  /** Every problem this compile found, in report order — see spec/diagnostics.ts. */
  diagnostics: Diagnostic[];
  /**
   * True when an ERROR diagnostic (today: a demoted pin) stopped the write.
   * `--allow-demoted` compiles it anyway; the diagnostics are printed either way.
   */
  refused: boolean;
  compilable: boolean;
  /** Reasons the emitted artifact is not ready to execute, independent of diagnostic refusal. */
  compileBlockers: string[];
}

function compilationBlockers(spec: SpecFlow, source: string): string[] {
  const blockers: string[] = [];
  if (!spec.steps.length) blockers.push('the flow has no steps');
  const missing = spec.steps.filter((step) => !step.segments.length).map((step) => step.id);
  if (missing.length) blockers.push(`${missing.length} step(s) have no converged procedure: ${missing.join(', ')}`);
  for (const step of spec.steps) {
    if (step.segments.some((segment) => !segment.steps.length)) blockers.push(`step ${step.id} contains an empty procedure`);
  }
  const todos = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('// TODO:') && !line.startsWith('// TODO: dropped the recorded position fallback'));
  for (const todo of [...new Set(todos)]) blockers.push(todo.replace(/^\/\/\s*/, ''));
  return blockers;
}

/**
 * Compile a converged flow to a reviewable Playwright spec.
 *
 * The `.flow.ts` is rewritten every time — it is generated, and the FLOW
 * constant inside it is what `repair` reads back. The `.spec.ts` is written
 * only when it is absent: it is the user's file, and silently regenerating
 * it would delete the assertions that make the spec theirs.
 *
 * An ERROR diagnostic writes NOTHING. A demoted pin is not drift the emitter
 * can express — the recording itself is wrong (fwod34's 08-open asks to cancel
 * an order step 06 already cancelled) — so emitting the file would hand the
 * caller a spec that fails at a locator and reads as an app change. `allowDemoted`
 * compiles it anyway, and the file then carries the diagnostic as a comment
 * block and in the failing step's own error message (see emit.ts).
 */
export function compileFlow(
  flowNameOrPath: string,
  o: {
    store?: SkillStore;
    /** A portable bundle to use instead of the user-level procedure store. */
    snapshotFile?: string;
    outDir?: string;
    tier?: 'plain';
    /** Permit compilation with an ERROR diagnostic. Does not overwrite user code. */
    allowDemoted?: boolean;
    /** Replace the user-owned .spec.ts scaffold. Does not relax diagnostics. */
    overwriteSpec?: boolean;
  },
): CompileResult {
  let bundle: FlowBundle | undefined;
  if (fs.existsSync(flowNameOrPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(flowNameOrPath, 'utf8')) as unknown;
      if (isFlowBundle(parsed)) bundle = parsed;
    } catch {
      // The normal flow loader below owns errors for ordinary flow files.
    }
  }
  const found = bundle ? { flow: bundle.flow, file: flowNameOrPath } : loadFlowFile(flowNameOrPath);
  const snapshot = bundle ?? (o.snapshotFile ? loadFlowBundle(o.snapshotFile) : undefined);
  if (!fs.existsSync(flowNameOrPath) && snapshot && snapshot.flow.name === flowNameOrPath) {
    bundle = snapshot;
  }
  const source = bundle ? { flow: bundle.flow, file: fs.existsSync(flowNameOrPath) ? flowNameOrPath : o.snapshotFile! } : found;
  if (!source) throw new Error(`no flow named ${JSON.stringify(flowNameOrPath)} (looked in the flows dir, as a path, and in the procedure snapshot)`);
  const { flow, file } = source;
  const store = o.store ?? (snapshot ? new BundleSkillStore(snapshot) : new SkillStore());
  const { spec, warnings, diagnostics } = flowToSpec(flow, store, { flowFile: file });
  const emitted = emitFlowFile(spec, { tier: o.tier ?? 'plain', diagnostics });

  const refused = hasError(diagnostics) && !o.allowDemoted;
  const base = safeName(spec.name);
  const compiler = compilerProvenance();
  const compileBlockers = compilationBlockers(spec, emitted.source);
  const result: CompileResult = {
    compiler,
    spec,
    flowFile: null,
    specFile: null,
    warnings: [...warnings, ...emitted.warnings],
    diagnostics,
    refused,
    compilable: compileBlockers.length === 0,
    compileBlockers,
  };
  if (refused) return result;

  const outDir = o.outDir ?? '.';
  fs.mkdirSync(outDir, { recursive: true });
  const flowFile = path.join(outDir, `${base}.flow.ts`);
  fs.writeFileSync(flowFile, `// Generated by ${compiler.name} ${compiler.version}\n${emitted.source}`);
  result.flowFile = flowFile;

  const specPath = path.join(outDir, `${base}.spec.ts`);
  if (!fs.existsSync(specPath) || o.overwriteSpec) {
    fs.writeFileSync(specPath, emitSpecFile(spec));
    result.specFile = specPath;
  }
  return result;
}
