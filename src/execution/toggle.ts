import type { Page } from 'playwright-core';
import { DIALOG_LINE, SLOT_LINE, TRANSIENT_LINE, identifiesNothing, liveLines, type LiveLines } from './expect.js';
import { captureLines, lineShows, presence, type LineDialect } from './snapshot.js';

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

/** How long a closing click gets to take the popup off the page (closeBeforeReopen). */
export const CLOSE_BEFORE_REOPEN_MS = 3_000;

/**
 * The CLOSED-BEFORE rule both execution targets share (SkillStep.closedBefore,
 * gitea fwgt11-n1 04-set). The step is a popup opener whose recorded diff
 * shows the popup was closed just before it: the dead instruction's earlier
 * opening shut unrecorded — which is when the app committed what was ticked
 * in it — and this click opened it again. A replay reaches it with that
 * popup still open, the tick still pending. Skipping it as already showing
 * (the opener guard) walks on into the pending tick, and a reload later
 * drops it: labels=[priority-high] where the recording applied bug too.
 *
 * So: when the popup shows, click the opener once to close it (`close`, the
 * step's own resolved target — the same control the recording opened it
 * with), and wait for its lines to go. Returns null when the popup was not
 * showing or went; otherwise the stop reason. Never skips: a close that did
 * not close, or a page that could not be read to prove it did, is a stop.
 */
export async function closeBeforeReopen(page: Page, lines: string[], d: LineDialect, close: () => Promise<unknown>, timeoutMs = CLOSE_BEFORE_REOPEN_MS): Promise<string | null> {
  if (!lines.length) return null;
  if ((await presence(page, lines, d)) !== 'present') return null;
  await close();
  const until = Date.now() + timeoutMs;
  let seen = await presence(page, lines, d);
  while (seen !== 'absent' && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 100));
    seen = await presence(page, lines, d);
  }
  if (seen === 'absent') return null;
  const line = lines[0].length > 60 ? `${lines[0].slice(0, 60)}…` : lines[0];
  return seen === 'present'
    ? `the popup this opener was recorded re-opening from closed (${line}) is still showing after a closing click — the recording shut it before re-opening, and going on would carry its pending selection past the point it was committed`
    : `could not confirm the popup this opener was recorded re-opening from closed (${line}) went after a closing click — the page could not be read whole — so its pending selection may not have been committed`;
}

/**
 * The APPLIED-PICK rule both execution targets share (round 61, gitea fwgt12
 * 03-set). A multi-select picker's item is a toggle: s_f54a5a clicked "bug"
 * in the Labels picker (steps 1-3), the picker shut and committed (7), it was
 * opened again (8), and step 9 clicked "bug" once more — recorded (n2's
 * recovery) with `link "bug"` UNIQUE on the page: "bug" was not applied then.
 * Which way steps 1-7 leave "bug" is timing (n1 and the artifact: applied;
 * n2 and n3: not). Where they applied it, step 9 found `link "bug"` twice —
 * the menu item and the label now in the sidebar — fell to its point, and
 * un-ticked it: the artifact committed priority-high alone.
 *
 * So a click is skipped as already in effect only with this run's own
 * evidence that what it would tick is applied:
 *   - statically (appliedPickCandidates): the step clicks a role+name its
 *     recording resolved uniquely (the primary is that role candidate, no
 *     nth); an EARLIER click of this segment named the same role+name; and a
 *     popup opener ran between them — the picker was shut (a commit) and
 *     opened again;
 *   - at replay (pickAlreadyApplied): that role+name now shows both INSIDE a
 *     popup (the item) and OUTSIDE every popup, and its line was not on the
 *     page when this segment started (pickBaseline) — the outside element is
 *     what this run's own pick and close put there, not page furniture that
 *     shares the name.
 * Anything else clicks, as before.
 */

/** A step as the applied-pick rule reads it (SkillStep, structurally). */
export interface PickStep {
  tool: string;
  locators?: { target?: readonly { kind: string; role?: string; name?: string; nth?: number }[] };
  expect?: { addedContains?: readonly string[] };
}

const POPUP_OPEN_LINE = /^-?\s*(dialog|alertdialog|menu|menubar|listbox)\b/;

/** The role+name a click names first, when its primary candidate is a role candidate without an nth (recorded unique). */
function uniqueRolePick(step: PickStep): { role: string; name: string } | null {
  if (step.tool !== 'click') return null;
  const primary = step.locators?.target?.[0];
  if (!primary || primary.kind !== 'role' || !primary.role || !primary.name || primary.nth !== undefined) return null;
  return { role: primary.role, name: primary.name };
}

/** Steps eligible for the applied-pick skip, by index, with the role+name (unfilled) each would tick. */
export function appliedPickCandidates(steps: readonly PickStep[]): Map<number, { role: string; name: string }> {
  const out = new Map<number, { role: string; name: string }>();
  const opens = (s: PickStep) => s.tool === 'click' && (s.expect?.addedContains ?? []).some((l) => POPUP_OPEN_LINE.test(l));
  const names = (s: PickStep, role: string, name: string) =>
    s.tool === 'click' && (s.locators?.target ?? []).some((c) => c.kind === 'role' && c.role === role && c.name === name);
  steps.forEach((step, i) => {
    const pick = uniqueRolePick(step);
    if (!pick) return;
    let reopened = false;
    for (let k = i - 1; k >= 0; k--) {
      if (reopened && names(steps[k], pick.role, pick.name)) {
        out.set(i, pick);
        return;
      }
      if (opens(steps[k])) reopened = true;
    }
  });
  return out;
}

/** A step that lands on another document: the applied-pick baseline is taken again after it. */
export function isNavigation(tool: string): boolean {
  return tool === 'goto' || tool === 'back';
}

/** The page's lines as this segment starts (and after each navigation), for pickAlreadyApplied; null when unread. */
export async function pickBaseline(page: Page): Promise<string[] | null> {
  return (await captureLines(page, 2))?.lines ?? null;
}

/** Whether `role`+`name` shows inside a popup and outside every popup, and was not on the segment's starting page. */
export async function pickAlreadyApplied(page: Page, role: string, name: string, baseline: readonly string[] | null): Promise<boolean> {
  if (!baseline || !name || name.includes('{{')) return false;
  const line = `- ${role} ${JSON.stringify(name)}`;
  if (baseline.some((l) => l.trim() === line || l.trim().startsWith(`${line}:`) || l.trim().startsWith(`${line} [`))) return false;
  const all = page.getByRole(role as Parameters<Page['getByRole']>[0], { name, exact: true });
  const count = Math.min(await all.count().catch(() => 0), 12);
  if (count < 2) return false;
  let inside = 0;
  let outside = 0;
  for (let i = 0; i < count; i++) {
    const el = all.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const inPopup = await el
      .evaluate((node) => Boolean((node as Element).closest('[role="listbox"], [role="menu"], [role="menubar"], [role="dialog"], [role="alertdialog"]')), undefined, { timeout: 2_000 })
      .catch(() => null);
    if (inPopup === true) inside++;
    else if (inPopup === false) outside++;
  }
  return inside >= 1 && outside >= 1;
}
