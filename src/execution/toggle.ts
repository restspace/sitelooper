import type { Page } from 'playwright-core';
import { DIALOG_LINE, SLOT_LINE, TRANSIENT_LINE, identifiesNothing, liveLines, type LiveLines } from './expect.js';
import { captureLines, lineShows, type LineDialect } from './snapshot.js';

/**
 * The DISCLOSURE TOGGLE rule both execution targets share. A step compiled
 * from a toggle pair (src/skills/toggles.ts: the recording hid a panel and
 * showed it again — fwsi1 05-change's "Show/Hide More Information") is one
 * click whose job is to leave the panel SHOWN. Clicking it on a page where
 * the panel is already shown would hide it, so it is skipped as already in
 * effect when everything it is recorded adding is showing — the popup opener
 * guard's rule, widened from popup lines to every line of this step, and
 * asked of EVERY line rather than any one: a disclosure's lines (a link, a
 * button) are far likelier than a dialog's to be on the page for other
 * reasons, and a wrong skip loses the state everything after it needs.
 *
 * Self-contained: sibling shared modules and Playwright types only.
 */

/** The recorded lines a toggle step's skip is decided on: its plain effects, neither transient nor carrying this run's own value. */
export function toggleEffectLines(addedContains: readonly string[] | undefined): string[] {
  return (addedContains ?? []).filter((l) => !TRANSIENT_LINE.test(l) && !SLOT_LINE.test(l));
}

/**
 * Whether a toggle step's effect is already in place: every one of its lines
 * (filled for this run) shows on one look at the page, in the step's dialect.
 * No lines, or a page that cannot be read, is no — the click then runs and
 * its own gates judge it.
 */
export async function toggleAlreadyShown(page: Page, lines: readonly string[], params: Record<string, string>, d: LineDialect = 1): Promise<boolean> {
  if (!lines.length) return false;
  const live = await captureLines(page, d);
  if (!live) return false;
  return liveLines(lines, params).every((line) => lineShows(live.lines, [line]));
}

/**
 * A HIDE: a click whose whole recorded effect was taking lines OFF the page —
 * no line added, no alert, nothing minted — compiled with those lines as its
 * `removedContains` (compile.ts expectationFor). vikunja fwvk8-n1 02-create's
 * FILTERS click closed the filter popup 01-open had left open (added [],
 * removed the popup's search box and date buttons). Compiled as a plain click
 * with no content check, it OPENED the popup on every replay whose page had
 * it closed, and passed; the open popup then swallowed the Add click. So both
 * runners treat such a click as the state it was recorded producing:
 *  - before it, hideAlreadyInEffect: none of those lines on a look that
 *    covered the page — the popup is already shut — skips it as in effect;
 *  - after it, hideVerdict: every one of them still showing is a stop, not a
 *    pass — the click did not take them away (or it opened what it was
 *    recorded closing, on a page the look could not prove it shut on).
 * A dialog's removal is left to the dismissal rule (expect.ts
 * dismissalAlreadyInEffect), which also requires a dismissal NAME: a
 * confirm is never skipped. Lines carrying this run's value, transient ones
 * and ones that identify nothing decide nothing here.
 */
export function hideEffectLines(step: {
  tool: string;
  mints?: unknown;
  expect?: { addedContains?: readonly string[]; alertContains?: string; removedContains?: readonly string[] };
}): string[] {
  if (step.tool !== 'click' || step.mints) return [];
  const e = step.expect;
  if (!e?.removedContains?.length || e.addedContains?.length || e.alertContains) return [];
  if (e.removedContains.some((l) => DIALOG_LINE.test(l))) return [];
  return e.removedContains.filter((l) => !TRANSIENT_LINE.test(l) && !SLOT_LINE.test(l) && !identifiesNothing(l));
}

/**
 * Whether a hide is already in effect: a look that covered the page shows
 * NONE of the lines it was recorded removing. A look that could not cover the
 * page proves nothing absent, so the click runs and hideVerdict judges it.
 */
export async function hideAlreadyInEffect(page: Page, lines: readonly string[], params: Record<string, string>, d: LineDialect = 1): Promise<boolean> {
  if (!lines.length) return false;
  const live = await captureLines(page, d);
  if (!live || !live.complete) return false;
  return !liveLines(lines, params).some((line) => lineShows(live.lines, [line]));
}

/**
 * What both runners do with a hide BEFORE its click: `skip` when it is
 * already in effect (hideAlreadyInEffect), unless its removal is REQUIRED
 * (StepExpectation.removalRequired: the segment filled into what it removes,
 * or opened it itself — a modal Save is a data write, not a state to reach).
 * A required hide whose lines a covered look does not show at all is a
 * `stop`: what the procedure put on the page, or the form it filled, is not
 * there, so an earlier step did not do what it recorded. Nothing otherwise:
 * the click runs and hideVerdict judges it after.
 */
export async function hideBefore(
  page: Page,
  lines: readonly string[],
  required: boolean,
  params: Record<string, string>,
  tag: string,
  d: LineDialect = 1,
): Promise<{ skip?: true; stop?: string }> {
  if (!(await hideAlreadyInEffect(page, lines, params, d))) return {};
  if (!required) return { skip: true };
  return { stop: `before step ${tag} the page shows none of what it was recorded closing (e.g. ${JSON.stringify(liveLines(lines, params)[0])}) — the form this procedure filled or opened is not there, so an earlier step did not do what it recorded` };
}

/**
 * The gate after a hide: every line it was recorded removing still showing on
 * the page is a stop — the click did not have its recorded effect. One gone is
 * enough to pass (a line can stand elsewhere on the page for reasons of its
 * own). A page that could not be read is reported unobserved.
 */
export function hideVerdict(
  lines: readonly string[],
  params: Record<string, string>,
  live: LiveLines | null,
  tag: string,
): { stop?: string; warnings: string[]; unobserved?: true } {
  if (!lines.length) return { warnings: [] };
  if (!live) return { warnings: [`step ${tag}: the page could not be read after the click — whether it took away what it was recorded removing is unknown`], unobserved: true };
  const filled = liveLines(lines, params);
  if (filled.every((line) => lineShows(live.lines, [line]))) {
    return { stop: `after step ${tag} the page still shows ${JSON.stringify(filled[0])}, which the click was recorded removing — it did not have its recorded effect`, warnings: [] };
  }
  return { warnings: [] };
}

/**
 * The recorded NO-EFFECT condition for a click marked `repeatIfNoEffect`
 * (SkillStep): after the press the url held, the page gained and lost no line
 * and raised no alert. Only then does either runner press once more — never
 * after a press that did anything, and never on a capture that failed (a
 * null `added`): "we could not see" is not "nothing happened". ghost
 * fwgh12-n1's link "Published" ignored its first press after the publish
 * flow; the recording pressed again and it navigated.
 */
export function pressHadNoEffect(o: {
  urlBefore: string;
  urlAfter: string;
  added: readonly string[] | null;
  removed?: readonly string[] | null;
  alerts?: readonly string[] | null;
}): boolean {
  if (o.added === null || o.urlBefore !== o.urlAfter) return false;
  return !o.added.length && !(o.removed ?? []).length && !(o.alerts ?? []).length;
}
