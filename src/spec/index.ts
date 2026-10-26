import fs from 'node:fs';
import path from 'node:path';
import { loadFlowFile } from '../skills/flow.js';
import { ComponentStore } from '../skills/components.js';
import { SkillStore } from '../skills/store.js';
import { emitFlowFile, emitSpecFile } from './emit.js';
import { emitReadableFlowFile } from './emit-readable.js';
import { flowFileStyle, LiftError, readableSource, readableSpecHash, type FlowFileStyle } from './lift.js';
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
export { flowFileStyle, isReadableFlowFile, readableSource, readableSpecHash } from './lift.js';
export type { FlowFileStyle, ReadableSource } from './lift.js';
export { BundleSkillStore, compilerProvenance, exportFlowBundle, isFlowBundle, loadFlowBundle } from './bundle.js';
export type { CompilerProvenance, ExportFlowBundleResult, FlowBundle } from './bundle.js';

/** Filename-safe form of a flow name; the same rule flow.ts uses for its own files. */
function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_') || 'flow';
}

/** The two output styles of `compile`: the self-healing runtime file, or plain Playwright code (emit-readable.ts). */
export type SpecStyle = FlowFileStyle;

export function isSpecStyle(value: unknown): value is SpecStyle {
  return value === 'runtime' || value === 'readable';
}

/** The style of the flow file at `file`, or null when there is none (or it is not a sitelooper flow file). */
export function existingStyle(file: string): SpecStyle | null {
  try {
    return flowFileStyle(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Which style a compile writes. `--style` decides when given; otherwise a
 * file already on disk keeps the style it was generated in (a project that
 * switched one flow to readable does not have it switched back by the next
 * recompile); otherwise the project config's `style`; otherwise runtime.
 */
export function resolveStyle(o: { explicit?: SpecStyle; existing?: SpecStyle | null; configured?: SpecStyle }): SpecStyle {
  return o.explicit ?? o.existing ?? o.configured ?? 'runtime';
}

export interface CompileResult {
  compiler: CompilerProvenance;
  /** The style the flow file was (or would have been) written in. */
  style: SpecStyle;
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

/** Where a compile's recording comes from, and the SpecFlow built from it. */
export interface RecordedSpec {
  spec: SpecFlow;
  warnings: string[];
  diagnostics: Diagnostic[];
  /** The bundle the procedures were read from (absolute), or null for the user-level store. */
  bundleFile: string | null;
}

/**
 * Build the SpecFlow a compile emits, from a bundle path, a flow name/path, or
 * a flow named by the project snapshot. The one place this happens: compile
 * uses it, and so does lifting a readable flow file (liftReadableFlowFile),
 * so a lifted spec is the spec the file was emitted from.
 */
export function recordedSpec(
  flowNameOrPath: string,
  o: { store?: SkillStore; snapshotFile?: string; components?: ComponentStore } = {},
): RecordedSpec {
  let bundle: FlowBundle | undefined;
  if (fs.existsSync(flowNameOrPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(flowNameOrPath, 'utf8')) as unknown;
      if (isFlowBundle(parsed)) bundle = parsed;
    } catch {
      // The normal flow loader below owns errors for ordinary flow files.
    }
  }
  const bundleFromPath = Boolean(bundle);
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
  // The bundle a readable file names on its source line: the file the
  // procedures came from, when they came from one.
  const bundleFile = o.store ? null : bundleFromPath ? path.resolve(flowNameOrPath) : snapshot && o.snapshotFile ? path.resolve(o.snapshotFile) : null;
  return { spec, warnings, diagnostics, bundleFile };
}

/** What a readable flow file's source line resolves to: the recording to compile or lift. */
export interface ReadableTarget {
  /** The flow name the file was generated from. */
  flow: string;
  /** What to hand compileFlow / recordedSpec: a bundle path, or the flow name. */
  target: string;
  /** The bundle in use (absolute), or null for the user-level store. */
  bundleFile: string | null;
  specHash: string;
}

/**
 * Find the recording behind a readable flow file: the bundle its source line
 * names (relative to the file), else the project snapshot when it holds that
 * flow, else the flow of that name in the user-level store.
 */
export function readableTarget(file: string, o: { snapshotFile?: string } = {}): ReadableTarget {
  const meta = readableSource(fs.readFileSync(file, 'utf8'));
  if (meta.bundle) {
    const named = path.resolve(path.dirname(path.resolve(file)), meta.bundle);
    if (fs.existsSync(named)) return { flow: meta.flow, target: named, bundleFile: named, specHash: meta.specHash };
  }
  if (o.snapshotFile && fs.existsSync(o.snapshotFile)) {
    let holds = false;
    try {
      holds = loadFlowBundle(o.snapshotFile).flow.name === meta.flow;
    } catch {
      // An unreadable snapshot is not this file's recording; the user store is next.
    }
    if (holds) {
      const snapshot = path.resolve(o.snapshotFile);
      return { flow: meta.flow, target: snapshot, bundleFile: snapshot, specHash: meta.specHash };
    }
  }
  if (loadFlowFile(meta.flow)) return { flow: meta.flow, target: meta.flow, bundleFile: null, specHash: meta.specHash };
  throw new LiftError(
    `cannot find the recording of flow "${meta.flow}" behind ${file}: ` +
      `${meta.bundle ? `its bundle ${meta.bundle} is missing, ` : ''}the project snapshot does not hold it, and the user store has no flow of that name`,
  );
}

/**
 * Lift a readable flow file back to the SpecFlow it was emitted from, by
 * loading its recording (readableTarget) and rebuilding the spec the way
 * compileFlow does (recordedSpec). The stored specHash is checked against the
 * rebuilt spec: a mismatch means the recording moved on since the file was
 * written (a rerecord without a recompile, or another machine's component or
 * site-facts store), and is a warning, not a refusal: the bundle is the recording.
 */
export function liftReadableFlowFile(
  file: string,
  o: { snapshotFile?: string; store?: SkillStore; components?: ComponentStore } = {},
): { spec: SpecFlow; warnings: string[]; target: ReadableTarget } {
  const target = readableTarget(file, o);
  const built = recordedSpec(target.target, { store: o.store, components: o.components });
  const warnings: string[] = [];
  if (readableSpecHash(built.spec) !== target.specHash) {
    const where = target.bundleFile ? path.relative(process.cwd(), target.bundleFile) || target.bundleFile : `the user store (flow "${target.flow}")`;
    warnings.push(
      `${path.basename(file)} is stale: the recording in ${where} no longer matches the spec the file was generated from; ` +
        `using the recording. Regenerate it with \`sitelooper compile ${file} --style readable\``,
    );
  }
  return { spec: built.spec, warnings, target };
}

/** A path relative to `fromDir`, with forward slashes, for a line written into a generated file. */
function relativeFrom(fromDir: string, file: string): string {
  const rel = path.relative(path.resolve(fromDir), path.resolve(file)).split(path.sep).join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
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
    /** Permit compilation despite a `demoted-pin` or `unproven-pin` error. Does not overwrite user code. */
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
    /**
     * `--standalone` (readable style only): write the file without the regenerate
     * header and source line, handing it over as the user's own code.
     */
    standalone?: boolean;
    /** `--style`: the style to write, whatever the file on disk is. */
    style?: SpecStyle;
    /** The project config's `style`: used for a file that does not exist yet. */
    defaultStyle?: SpecStyle;
  },
): CompileResult {
  // A readable flow file names its own recording (`// @sitelooper-source`):
  // compiling it again compiles that recording, next to the file.
  let outDir = o.outDir;
  if (/\.ts$/.test(flowNameOrPath) && existingStyle(flowNameOrPath) === 'readable') {
    const target = readableTarget(flowNameOrPath, { snapshotFile: o.snapshotFile });
    outDir ??= path.dirname(flowNameOrPath);
    flowNameOrPath = target.target;
  }
  const { spec, warnings, diagnostics, bundleFile } = recordedSpec(flowNameOrPath, { store: o.store, snapshotFile: o.snapshotFile, components: o.components });
  const base = safeName(spec.name);
  outDir ??= '.';
  const flowFile = path.join(outDir, `${base}.flow.ts`);
  const style = resolveStyle({ explicit: o.style, existing: existingStyle(flowFile), configured: o.defaultStyle });
  const compiler = compilerProvenance();
  const emitted: { source: string; warnings: string[]; diagnostics: Diagnostic[] } =
    style === 'readable'
      ? (() => {
          // The readable file carries its own "Generated by" header and the
          // source line that leads lift, rerecord and repair back to the bundle.
          const readable: { source: string; warnings: string[]; diagnostics?: Diagnostic[] } =
            emitReadableFlowFile(spec, { compilerVersion: compiler.version, bundleRelPath: bundleFile ? relativeFrom(outDir, bundleFile) : null, standalone: o.standalone });
          return { source: readable.source, warnings: readable.warnings, diagnostics: readable.diagnostics ?? [] };
        })()
      : (() => {
          const runtime = emitFlowFile(spec, { tier: o.tier ?? 'plain', diagnostics });
          return { ...runtime, source: `// Generated by ${compiler.name} ${compiler.version}\n${runtime.source}` };
        })();

  // `--allow-demoted` is about demoted pins and nothing else. It used to
  // clear EVERY error, so any future error-severity diagnostic would be
  // waivable by a flag that says nothing about it — a contract refusal
  // bypassed by an unrelated option is not a refusal.
  // Emission's own errors refuse too. `unsourced-ref` is found only while
  // the call sites are written — nothing before emission knows which slot a
  // reference is bound into — and a refusal the writer does not honour is not
  // a refusal (fwkb14, fwod52: both compiled clean and stopped at 1/6 and
  // 3/6).
  // …and about unproven pins (`unproven-pin`), the same fact one step earlier:
  // a pin whose stops were forgiven as harmless rather than counted as strikes
  // (notes/CONTRACT-spec-reliability.md item 1).
  const refused = [...diagnostics, ...emitted.diagnostics].some(
    (d) => d.severity === 'error' && !((d.code === 'demoted-pin' || d.code === 'unproven-pin') && o.allowDemoted),
  );
  const compileBlockers = compilationBlockers(spec, emitted.source);
  const result: CompileResult = {
    compiler,
    style,
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

  // A .flow.ts sitelooper did not write (a --standalone file handed over, or
  // hand-written code that took the name) is the user's: never overwritten.
  if (fs.existsSync(flowFile) && existingStyle(flowFile) === null) {
    throw new Error(`${flowFile} exists and is not a sitelooper-generated flow file (a --standalone file is yours to edit); move it or pass --out <dir>`);
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(flowFile, emitted.source);
  result.flowFile = flowFile;

  const specPath = path.join(outDir, `${base}.spec.ts`);
  if (!fs.existsSync(specPath) || o.overwriteSpec) {
    fs.writeFileSync(specPath, emitSpecFile(spec));
    result.specFile = specPath;
  }
  return result;
}
