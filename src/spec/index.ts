import fs from 'node:fs';
import path from 'node:path';
import { loadFlowFile } from '../skills/flow.js';
import { ComponentStore } from '../skills/components.js';
import { SkillStore } from '../skills/store.js';
import { emitFlowFile, emitSpecFile } from './emit.js';
import { flowToSpec, type SpecFlow } from './ir.js';
import { hasError, type Diagnostic } from './diagnostics.js';
import { ambiguousCredentialFor, ambiguousCredentialsIn, rewriteLiteralCredentials } from '../shared/secrets.js';
import type { SkillStep } from '../skills/store.js';
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

/**
 * A recording that carries a credential IN THE CLEAR, repaired rather than
 * refused (FIX AH, round 48). Round 47's rule refused it, and round 48's
 * corpus showed what that costs: every store recorded before the bench tasks
 * passed `{{env:APP_PASSWORD}}` (fwsi1-6, …) stopped compiling the moment the
 * variable was set — as every existing user flow with a typed password would
 * on upgrade. The artifact can always be made safe, so it is:
 *
 *  - an UNAMBIGUOUS value (only credential-named variables hold it) is
 *    rewritten to `{{env:NAME}}` wherever it stands as a token — flow params,
 *    recorded args, expectations, instructions — so the artifact reads
 *    `process.env['NAME']`, lists NAME in requiredEnvNames, and carries no
 *    value. A `literal-credential` WARNING names the variable.
 *  - an AMBIGUOUS value (a non-credential variable holds it too — odoo's
 *    `admin` is APP_PASSWORD and APP_EMAIL) is rewritten only where a fill
 *    puts it into a field the recording shows is a password field, as the
 *    daemon's tool layer does (tools.ts markCredentialArgs): the value in the
 *    fill's own args, or the flow param its slot is bound to. Anything else
 *    is left as recorded, with a warning — a bare `admin` is a login as often
 *    as it is a password.
 *
 * Nothing here is an error: there is no case the rewrite cannot make safe.
 * An ambiguous value left in place is not a secret the artifact leaks beyond
 * what the non-credential variable already publishes.
 */
function withCredentialMarkers(recorded: SpecFlow, diagnostics: Diagnostic[]): SpecFlow {
  const { value: spec, names } = rewriteLiteralCredentials(recorded);
  for (const name of names) {
    diagnostics.push({
      code: 'literal-credential',
      what: `the recording carries the value of ${name} in the clear; the artifact reads it from the environment instead`,
      why:
        `a flow param, a recorded value or an expectation equals the value of the credential-named environment variable ${name} (typically a shell expanded $${name} inside double quotes at record time, fwrd83), ` +
        `so compile rewrote it to {{env:${name}}}: the artifact reads process.env['${name}'] and requires ${name} to run`,
      fix: `re-record the step(s) passing {{env:${name}}} in single quotes (never $${name}) so the flow and its procedures stop carrying the value`,
      severity: 'warning',
    });
  }
  // Ambiguous values: only a fill into a field the recording shows is a password field.
  const passwordField = (step: SkillStep): boolean =>
    (step.locators?.target ?? []).some((c) => {
      const text = JSON.stringify(c);
      return /type=\\?["']?password|autocomplete[^,}]*(current|new)-password/i.test(text);
    });
  const repaired = new Set<string>();
  for (const flowStep of spec.steps) {
    for (const segment of flowStep.segments) {
      for (const step of segment.steps) {
        if (step.tool !== 'fill' || typeof step.args?.value !== 'string' || !passwordField(step)) continue;
        const value = step.args.value;
        const direct = ambiguousCredentialFor(value);
        if (direct) {
          step.args.value = `{{env:${direct}}}`;
          repaired.add(direct);
          continue;
        }
        const slot = /^\{\{([vd]\d+)\}\}$/.exec(value)?.[1];
        const bound = slot ? flowStep.params[slot] : undefined;
        const name = bound !== undefined ? ambiguousCredentialFor(bound) : null;
        if (slot && name) {
          flowStep.params[slot] = `{{env:${name}}}`;
          const param = segment.params[slot];
          if (param && typeof param.example === 'string' && ambiguousCredentialFor(param.example) === name) param.example = `{{env:${name}}}`;
          repaired.add(name);
        }
      }
    }
  }
  for (const name of repaired) {
    diagnostics.push({
      code: 'literal-credential',
      what: `a password field is filled with the value of ${name} in the clear; the artifact reads it from the environment instead`,
      why: `the value is also held by a non-credential variable, so compile rewrote it only where the recording shows a password field (the fill's own value, or the flow param its slot is bound to)`,
      fix: `re-record the sign-in passing {{env:${name}}} in single quotes (never $${name})`,
      severity: 'warning',
    });
  }
  for (const name of ambiguousCredentialsIn(spec)) {
    diagnostics.push({
      code: 'literal-credential',
      what: `the recording carries a value equal to ${name} that compile left as recorded`,
      why: `a non-credential environment variable holds the same value, so it may be a login or other copy rather than the secret, and no password field shows it is ${name}`,
      fix: `if it is the credential, re-record the step passing {{env:${name}}} in single quotes (never $${name})`,
      severity: 'warning',
    });
  }
  return spec;
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
    .filter((line) => line.startsWith('// TODO:'));
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
    /**
     * The component store whose recipe choices the artifact snapshots. The
     * default is the one the daemon reads (`$SITELOOPER_COMPONENTS_FILE`, else
     * `<home>/components.json`), so the artifact carries what a replay on this
     * machine would have driven the widgets with.
     */
    components?: ComponentStore;
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
  const { spec: recorded, warnings, diagnostics } = flowToSpec(flow, store, { flowFile: file, components: o.components ?? new ComponentStore() });
  const spec = withCredentialMarkers(recorded, diagnostics);
  const emitted = emitFlowFile(spec, { tier: o.tier ?? 'plain', diagnostics });

  // `--allow-demoted` is about demoted pins and nothing else. It used to
  // clear EVERY error, so any future error-severity diagnostic would be
  // waivable by a flag that says nothing about it — a contract refusal
  // bypassed by an unrelated option is not a refusal.
  // Emission's own errors refuse too. `unsourced-ref` is found only while
  // the call sites are written — nothing before emission knows which slot a
  // reference is bound into — and a refusal the writer does not honour is not
  // a refusal (fwkb14, fwod52: both compiled clean and stopped at 1/6 and
  // 3/6).
  const refused = [...diagnostics, ...emitted.diagnostics].some(
    (d) => d.severity === 'error' && !(d.code === 'demoted-pin' && o.allowDemoted),
  );
  const base = safeName(spec.name);
  const compiler = compilerProvenance();
  const compileBlockers = compilationBlockers(spec, emitted.source);
  const result: CompileResult = {
    compiler,
    spec,
    flowFile: null,
    specFile: null,
    warnings: [...warnings, ...emitted.warnings],
    // Emission finds problems compile cannot: a capability the standalone
    // artifact has no form for is known only once the body is written.
    diagnostics: [...diagnostics, ...emitted.diagnostics],
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
