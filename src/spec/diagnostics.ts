/**
 * One problem, said once, in the same shape everywhere the tool reports one.
 *
 * WHY THIS EXISTS. The odoo flow fwod34 pinned step 08-open to a DEMOTED
 * skill: the recording orchestrator asked it to cancel an order step 06 had
 * already cancelled, so the skill's first step clicks a Cancel button that is
 * never there on replay. Every fact needed to say "re-record 08-open" was in
 * hand, and four different surfaces said four different partial things —
 * compile a quiet one-liner with no reason and no fix, the emitted spec a bare
 * locator error that reads as drift, repair "9/9 tier A, no change" (because
 * the engine silently replayed a DIFFERENT, read-only skill), and
 * `repair --check-spec` "this is an emitter defect", which was simply wrong.
 *
 * A Diagnostic is the fix: what is wrong, the evidence for it, and the exact
 * command that repairs it — carried as data, printed identically by compile,
 * repair, check and rerecord, and included verbatim in every `--json`.
 *
 * Every surface prints its diagnostics FIRST (before counts, file lists and
 * change lists) as `formatDiagnostic` blocks, and puts them in its JSON under
 * `diagnostics`. `diagnosticLine` is the one-line legacy form, so a caller
 * that still prints `warning: ...` lines — and every test that asserts on
 * those exact strings — keeps working.
 */

export type DiagnosticCode =
  | 'demoted-pin' // the step's pinned skill is demoted
  | 'covered-pin' // repair: every converge run replayed the step with a skill other than its pin
  | 'noop-step' // record time: a mutating instruction changed nothing and its outcome matched the pre-state
  | 'contradicted-step' // record time: a read-only step read a value contradicting the previous mutating step's report
  | 'satisfied-step' // informational: a run/repair found a step already satisfied (goal-state) — repair's JSON only
  | 'needs-rerecord' // repair's verdict when the above mean a recording, not the app, is wrong
  | 'unthreaded-param' // compile could not rethread a literal param (existing warning, now typed)
  | 'missing-skill' // step refers to a skill not in the store
  | 'no-procedure'; // step has no converged procedure

export interface Diagnostic {
  code: DiagnosticCode;
  /** Flow step id, e.g. "08-open"; omitted for flow-level diagnostics. */
  step?: string;
  /** One sentence: what is wrong, in the user's terms. */
  what: string;
  /** One or two sentences: the evidence (stats, tiers, skill ids). */
  why: string;
  /** The exact command or action that fixes it, when there is one. */
  fix?: string;
  severity: 'warning' | 'error';
  /**
   * The verbatim one-line warning this diagnostic replaces, when it replaces
   * one. Not part of the reported shape — it exists so a warning string a
   * caller (or a test) already asserts on survives being typed, without
   * `what`/`why` having to be reverse-engineered back into it.
   */
  line?: string;
}

/** One diagnostic as terminal text: `<severity> <step>: <what>\n  why: ...\n  fix: ...` */
export function formatDiagnostic(d: Diagnostic): string {
  const head = `${d.severity} ${d.step ? `${d.step}: ` : ''}${d.what}`;
  const lines = [head, `  why: ${d.why}`];
  if (d.fix) lines.push(`  fix: ${d.fix}`);
  return lines.join('\n');
}

/** The legacy one-line warning string for callers that still print `warning: ...` lines. */
export function diagnosticLine(d: Diagnostic): string {
  if (d.line) return d.line;
  return `${d.step ? `step ${d.step} ` : ''}${d.what}`;
}

/** True when any diagnostic is severe enough to stop a surface from writing. */
export function hasError(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

/**
 * A diagnostic as ONE line, for places with no room for a block: the note a
 * flagged step's thrown error carries, or a comment in generated source.
 */
export function diagnosticNote(d: Diagnostic): string {
  return `${d.what}${d.fix ? ` — fix: ${d.fix}` : ''}`;
}

/** The `sitelooper rerecord ...` command that repairs a step (agent C's command). */
export function rerecordFix(flowFile: string, stepId: string, instruction?: string): string {
  const tail = instruction ? ` --instruction ${JSON.stringify(instruction)}` : '';
  return `sitelooper rerecord ${quoteArg(flowFile)} ${stepId}${tail}`;
}

/** A shell-safe-enough argument: quoted only when it needs it. */
function quoteArg(text: string): string {
  return /[\s"']/.test(text) ? JSON.stringify(text) : text;
}
