import type { Page } from 'playwright-core';
import { SLOT_LINE, TRANSIENT_LINE, liveLines } from './expect.js';
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
