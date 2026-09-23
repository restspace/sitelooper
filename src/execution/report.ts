import type { Page } from 'playwright-core';
import { captureLines, lineShows } from './snapshot.js';
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
 * A PARAM DOES NOT VOUCH FOR THE TEXT AROUND IT. fwrd86's 06-delete template
 * held `list_row_RD-1015: "{{v1}} | {{v4}} RD Bench Ticket [Archived] | … |
 * Created: 2026-09-23"` and `list_default_count: "Showing 1–10 of 13 ({{v1}}
 * hidden …)"`. Each carries a slot, so each was "built from the caller's
 * params", and both replays published the recording's date and the
 * recording's counts as their own findings — n2 archived a second ticket and
 * still reported "of 15". The slot is this run's; the text between the slots
 * is the recording's. So every literal of a template value must stand on THIS
 * run's page before the value is published (unshownLiterals), and a value
 * whose literal the page does not show is withheld, in both runners, rather
 * than reported from memory.
 *
 * Self-contained: sibling shared modules and Playwright types only.
 */

/** Whether a template value is built from the caller's parameters at all (a recorded literal is not). */
export function derivesFromParams(template: string): boolean {
  return /\{\{v\d+\}\}/.test(template);
}

/**
 * The recording's own text in a template value: what stands between its
 * slots, whitespace collapsed. A run holding no letter or digit — the ` | `
 * or `%` the report joined its slots with — states nothing about the page and
 * is not a literal to observe.
 */
export function templateLiterals(template: string): string[] {
  return template
    .split(/\{\{[^{}]*\}\}/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

/**
 * The literals of `template` this run's page does not show. `shown` is the
 * page as shownForReport captured it once the step's work was done; null (the
 * page could not be read) observed nothing, so every literal is unshown. A
 * whole-page substring question, the goal half of goalSatisfied: the text is
 * on the page or it is not, and a look that could not cover the page only
 * ever withholds.
 */
export function unshownLiterals(template: string, shown: readonly string[] | null | undefined): string[] {
  const literals = templateLiterals(template);
  if (!shown) return literals;
  const lines = [...shown];
  return literals.filter((literal) => !lineShows(lines, [literal]));
}

/**
 * The value a template entry publishes on this run, or null when it publishes
 * nothing: a recorded literal; a value that still asks for something once
 * filled (a slot left unbound, or a param that itself still holds a
 * `{{step.output}}` reference — fwod56); one that fills to nothing (a slot
 * bound to '' — round 26's rule J: an empty value is unfilled, not a value);
 * or one whose recorded text this run's page does not show (fwrd86, above).
 *
 * `opts.literal` admits a template with no slot at all, held to the same page
 * test: the already-satisfied guard publishes the values its skipped
 * read-backs would have, and there the page it just judged is the only
 * observation there is.
 */
export function templateValue(template: string, params: Record<string, string>, shown: readonly string[] | null | undefined, opts: { literal?: boolean } = {}): string | null {
  if (!opts.literal && !derivesFromParams(template)) return null;
  const filled = fillParams(template, params);
  if (!filled || /\{\{/.test(filled)) return null;
  if (unshownLiterals(template, shown).length) return null;
  return filled;
}

/** Does any of these template values need the page to decide it — a value with recorded text to observe? */
export function reportNeedsPage(templates: readonly string[]): boolean {
  return templates.some((t) => templateLiterals(t).length > 0);
}

/**
 * The page a report's literals are observed on, taken once the step's work is
 * done — the daemon after the chain's last segment, the artifact after the
 * step's. Two looks: the dialect-2 lines (every control's name and value,
 * frames and open shadow roots included) and the document's rendered text,
 * line by line. The lines alone carry only interactive roles, and fwrd86's
 * "Showing 1–10 of 13" is plain text: a figure the page does show would be
 * withheld on every run. Null only when neither look could read the page.
 */
export async function shownForReport(page: Page): Promise<string[] | null> {
  const lines = (await captureLines(page, 2).catch(() => null))?.lines ?? null;
  const text = await page
    .evaluate(() => document.body?.innerText ?? '')
    .then((t) => t.split('\n'))
    .catch(() => null);
  if (!lines && !text) return null;
  return [...(lines ?? []), ...(text ?? [])];
}
