import fs from 'node:fs';
import path from 'node:path';
import { loadFlowFile } from '../skills/flow.js';
import { SkillStore } from '../skills/store.js';
import { emitFlowFile, emitSpecFile } from './emit.js';
import { flowToSpec, type SpecFlow } from './ir.js';
import { hasError, type Diagnostic } from './diagnostics.js';

export type { SpecFlow, SpecSegment, SpecStep } from './ir.js';
export type { Diagnostic, DiagnosticCode } from './diagnostics.js';
export { emitFlowFile, emitSpecFile } from './emit.js';
export { flowToSpec } from './ir.js';
export { formatDiagnostic, diagnosticLine, hasError } from './diagnostics.js';

/** Filename-safe form of a flow name; the same rule flow.ts uses for its own files. */
function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_') || 'flow';
}

export interface CompileResult {
  spec: SpecFlow;
  /** null when an ERROR diagnostic refused the write and `force` was not set. */
  flowFile: string | null;
  /** null when the scaffold existed already (or the whole write was refused) and `force` was not set. */
  specFile: string | null;
  warnings: string[];
  /** Every problem this compile found, in report order — see spec/diagnostics.ts. */
  diagnostics: Diagnostic[];
  /**
   * True when an ERROR diagnostic (today: a demoted pin) stopped the write.
   * `--force` compiles it anyway; the diagnostics are printed either way.
   */
  refused: boolean;
  compilable: boolean;
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
 * caller a spec that fails at a locator and reads as an app change. `force`
 * compiles it anyway, and the file then carries the diagnostic as a comment
 * block and in the failing step's own error message (see emit.ts).
 */
export function compileFlow(
  flowNameOrPath: string,
  o: { store?: SkillStore; outDir: string; tier?: 'plain'; force?: boolean },
): CompileResult {
  const found = loadFlowFile(flowNameOrPath);
  if (!found) throw new Error(`no flow named ${JSON.stringify(flowNameOrPath)} (looked in the flows dir and as a path)`);
  const { flow, file } = found;
  const store = o.store ?? new SkillStore();
  const { spec, warnings, diagnostics } = flowToSpec(flow, store, { flowFile: file });
  const emitted = emitFlowFile(spec, { tier: o.tier ?? 'plain', diagnostics });

  const refused = hasError(diagnostics) && !o.force;
  const base = safeName(spec.name);
  const result: CompileResult = {
    spec,
    flowFile: null,
    specFile: null,
    warnings: [...warnings, ...emitted.warnings],
    diagnostics,
    refused,
    compilable: spec.steps.every((s) => s.segments.length > 0),
  };
  if (refused) return result;

  fs.mkdirSync(o.outDir, { recursive: true });
  const flowFile = path.join(o.outDir, `${base}.flow.ts`);
  fs.writeFileSync(flowFile, emitted.source);
  result.flowFile = flowFile;

  const specPath = path.join(o.outDir, `${base}.spec.ts`);
  if (!fs.existsSync(specPath) || o.force) {
    fs.writeFileSync(specPath, emitSpecFile(spec));
    result.specFile = specPath;
  }
  return result;
}
