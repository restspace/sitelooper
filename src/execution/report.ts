import { fillParams } from './url.js';

/**
 * REPORT-TEMPLATE VALUES, the rule both execution targets share. A zero-model
 * run reports what it read live, and — standing in for the recording's report
 * — every value of the skill's report template built from the caller's own
 * `{{vN}}` parameters, filled for this run. A recorded literal (run 1's record
 * id) is stale on any later run and is never published.
 *
 * The daemon applies it in synthesizeReport (src/skills/learn.ts) to the last
 * segment of the chain it replayed; a compiled artifact applies it after the
 * last segment of the step, for every value no live read of the step has
 * already published. fwgh4's artifact refused to compile over a value only the
 * daemon published: 03-open consumed `{{02-create.post_title_element_text}}`,
 * the template's `"{{v2}}"`, and the artifact carried the template only for a
 * goal guard.
 *
 * Self-contained: sibling shared modules and Playwright types only.
 */

/** Whether a template value is built from the caller's parameters at all (a recorded literal is not). */
export function derivesFromParams(template: string): boolean {
  return /\{\{v\d+\}\}/.test(template);
}

/**
 * The value a template entry publishes on this run, or null when it publishes
 * nothing: a recorded literal; a value that still asks for something once
 * filled (a slot left unbound, or a param that itself still holds a
 * `{{step.output}}` reference — fwod56); or one that fills to nothing (a slot
 * bound to '' — round 26's rule J: an empty value is unfilled, not a value).
 */
export function templateValue(template: string, params: Record<string, string>): string | null {
  if (!derivesFromParams(template)) return null;
  const filled = fillParams(template, params);
  if (!filled || /\{\{/.test(filled)) return null;
  return filled;
}
