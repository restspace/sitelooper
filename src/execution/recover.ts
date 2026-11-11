/**
 * The two RECOVERY rungs both execution targets share: a navigation step whose
 * recorded affordance is gone reaching its recorded destination another way
 * (only a step recorded as navigation and nothing else, and only when the page
 * reached shows what the step was recorded putting there),
 * and a text wait that timed out on its resolved target while another recorded
 * candidate for that target already shows the text.
 *
 * Daemon replay (src/skills/replay.ts) calls these from runOneStep; a compiled
 * `.flow.ts` embeds this exact source (spec/runtime-source.ts) and calls them
 * from the same places in its step bodies. Each runner supplies only how it
 * clicks and navigates (its own tool layer, or the artifact's `click` adapter).
 * Self-contained: sibling shared modules and Playwright types only.
 */
import type { Locator, Page } from 'playwright-core';
import { outcomeLabel, outcomeOfError, settleDom } from './browser.js';
import { fillParams, urlMatches } from './url.js';
import { textHolds } from './text.js';
import { captureLines } from './snapshot.js';
import { expectedChangesVerdict } from './expect.js';

/** Tools whose miss can be substituted by navigating to the step's recorded destination: plain navigation clicks. */
const NAV_FALLBACK_TOOLS = new Set(['click', 'dblclick']);

/**
 * Whether a step whose target resolved nothing may fall back to its recorded
 * destination: a click, with a recorded url expectation the browser is not
 * already on, outside a loop body (a loop re-acts per record; navigating away
 * from the collection is never that). The run-time half of the rule: whether
 * the recording shows the click as a navigation at all is
 * recordedAsNavigation, which each runner asks first.
 */
export function mayNavigateToDestination(tool: string, destPattern: string | undefined, liveUrl: string, params: Record<string, string>, inLoopBody: boolean): destPattern is string {
  return Boolean(destPattern) && NAV_FALLBACK_TOOLS.has(tool) && !inLoopBody && !urlMatches(destPattern!, liveUrl, params);
}

/** What the fallback reads of a recorded step: its tool and args, and what the recording saw it do. */
export interface RecordedStepEvidence {
  tool: string;
  args?: Record<string, unknown>;
  expect?: {
    urlPattern?: string;
    addedContains?: readonly string[];
    alertContains?: string;
    removedContains?: readonly string[];
    goneContains?: readonly string[];
    removalRequired?: unknown;
    lineDialect?: number;
  };
  mints?: unknown;
  effect?: unknown;
}

/**
 * The url pattern step `index` was recorded STARTING on: where the nearest
 * earlier step ended (its own url expectation, or the url a goto was sent
 * to), else where the segment starts. Undefined when the recording does not
 * say — a `back`, whose landing no step carries.
 */
function recordedStart(steps: readonly RecordedStepEvidence[], index: number, segmentStart: string | undefined): string | undefined {
  for (let i = index - 1; i >= 0; i--) {
    const earlier = steps[i];
    if (earlier.expect?.urlPattern) return earlier.expect.urlPattern;
    if (earlier.tool === 'goto') return typeof earlier.args?.url === 'string' ? earlier.args.url : undefined;
    if (earlier.tool === 'back') return undefined;
  }
  return segmentStart;
}

/**
 * Whether the recording shows step `index` (0-based, in its segment) as a
 * NAVIGATION AND NOTHING ELSE — the only click another route to its
 * destination can stand in for.
 *
 * mayNavigateToDestination alone asks "a click with a recorded url the browser
 * is not on", and every diffed click carries a recorded url: the one it was on
 * afterwards, moved or not. So a Delete that redirected to its list qualified
 * as well as a plain link, a renamed Delete button was "replaced" by the
 * sidebar's link to the list, and the replay reported the delete as run with
 * the record still there (test/replay-false-pass.browser.test.ts). Reaching
 * the destination is evidence only of the going. So the recording must show:
 *  - the click MOVED: its recorded url is not the one it was recorded
 *    starting on (recordedStart; unknown is not moved);
 *  - nothing a navigation cannot have done by itself: no record minted
 *    (`mints`), none taken away (`goneContains`, `removedContains`,
 *    `removalRequired`), no alert raised (`alertContains` — the app
 *    answering a commit), no page opened or closed (`effect`).
 * What the click ADDED is not asked here — a link's landing adds lines too —
 * but of the page reached (arrivalStop).
 */
export function recordedAsNavigation(steps: readonly RecordedStepEvidence[], index: number, segmentStart: string | undefined): boolean {
  const step = steps[index];
  const e = step?.expect;
  if (!e?.urlPattern) return false;
  if (step.mints || step.effect || e.alertContains || e.removedContains?.length || e.goneContains?.length || e.removalRequired) return false;
  const from = recordedStart(steps, index, segmentStart);
  return from !== undefined && from !== e.urlPattern;
}

/** How long the page the fallback reached is given to show the step's recorded lines. */
export const ARRIVAL_WAIT_MS = 3_000;

/**
 * After the fallback arrived: does the page it reached show what the step was
 * recorded putting there? The stop's reason, or null.
 *
 * The shared effect verdict (expect.ts expectedChangesVerdict), asked of the
 * live page alone — a substitute route has no diff of the recorded action.
 * The lines carrying this run's own values are required: a Save recorded
 * landing on its record, replaced by a link to that record, arrives at a page
 * that never shows the saved title. The plain lines are not, as for any link
 * landing (ChangeContext.leftByLink): they may have been captured on the page
 * the click left.
 */
export async function arrivalStop(
  page: Page,
  step: RecordedStepEvidence,
  params: Record<string, string>,
  tag: string,
  counters?: readonly string[],
): Promise<string | null> {
  const recorded = step.expect?.addedContains;
  if (!recorded?.length) return null;
  const dialect = step.expect?.lineDialect === 2 ? 2 : 1;
  const deadline = Date.now() + ARRIVAL_WAIT_MS;
  for (;;) {
    const verdict = await expectedChangesVerdict(
      recorded,
      params,
      { tag, tool: step.tool, positionalResolution: false, counters, leftByLink: true },
      { added: [], live: (look) => captureLines(page, dialect, look) },
    );
    if (!verdict.stop) return null;
    if (Date.now() >= deadline) return verdict.stop;
    await new Promise((done) => setTimeout(done, 250));
  }
}

/**
 * How a runner acts during recovery: its own click on a locator, its own
 * navigation. A click that fails throws as the runner's click throws, with its
 * outcome on the error (browser.ts `actionFailure`): that is what decides
 * whether the direct navigation may follow it.
 */
export interface RecoveryHooks {
  /** `selector` is the css the locator was built from, for a runner that records what it clicked. */
  click(locator: Locator, selector: string): Promise<unknown>;
  goto(url: string): Promise<unknown>;
}

/**
 * The rungs a navigation step falls through when its recorded link is gone,
 * each testing how the app works for a HUMAN before the next is tried:
 *  (a) another link on the page to the same destination — click that,
 *      exercising the app's own navigation;
 *  (b) only then, and only when the destination is fully concrete
 *      (params/derived filled, nothing volatile left), navigate there
 *      directly — the last resort before recovery (the daemon's model, the
 *      artifact's stop).
 * Returns what got the browser there, or null when neither rung did — or,
 * when the rung (a) click failed without proof that nothing went out,
 * `unknown`: the click may have landed, so the direct navigation is NOT
 * tried after it (a second commit of whatever that link does), and the caller
 * stops with the note.
 */
export async function navigateToDestination(
  page: Page,
  destPattern: string,
  params: Record<string, string>,
  hooks: RecoveryHooks,
): Promise<{ used: string; note: string } | { unknown: true; note: string } | null> {
  // (a) Requires the matching anchors to agree on ONE destination —
  // ambiguity (a wildcard pattern matching many records) skips the rung.
  const link = await linkToDestination(page, destPattern, params);
  if (link) {
    try {
      await hooks.click(page.locator(link.selector).first(), link.selector);
      await settleDom(page);
      if (urlMatches(destPattern, page.url(), params)) {
        return { used: `click ${link.selector}`, note: `clicked another link to the recorded destination (${link.selector})` };
      }
    } catch (err) {
      // A click proven not to have gone out: that link did not work either —
      // try the direct navigation. Anything else may have landed.
      const outcome = outcomeOfError(err);
      if (outcome !== 'not-dispatched') {
        const message = (err instanceof Error ? err.message : String(err)).split('\n')[0].slice(0, 160);
        return {
          unknown: true,
          note: `clicked another link to the recorded destination (${link.selector}), but whether that click took effect is unknown (${message}) — not navigating there directly, which could repeat it ${outcomeLabel(outcome)}`,
        };
      }
    }
  }
  // (b)
  const dest = fillParams(destPattern, params);
  const concrete = dest && !dest.includes('{{') && !/[/=#](:id|:var)(?=[/&#]|$)/.test(dest);
  if (concrete && !urlMatches(destPattern, page.url(), params)) {
    try {
      await hooks.goto(dest);
      if (urlMatches(destPattern, page.url(), params)) {
        return { used: `goto ${dest}`, note: `navigated to the step's recorded destination instead (${dest})` };
      }
    } catch {
      // destination unreachable — the caller reports the original miss
    }
  }
  return null;
}

/**
 * A visible anchor on the page whose destination matches the recorded
 * pattern. Used by the navigation fallback's first rung: when the recorded
 * link is gone, another route to the same place may exist (a sidebar entry, a
 * search result, a breadcrumb). Returns null unless every matching anchor
 * agrees on ONE destination — a wildcard-heavy pattern matching several
 * records is ambiguity, not evidence.
 */
export async function linkToDestination(
  page: Page,
  pattern: string,
  params: Record<string, string>,
): Promise<{ selector: string; href: string } | null> {
  let anchors: { attr: string; abs: string }[];
  try {
    const raw = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .filter((a) => (a as HTMLElement).offsetParent !== null)
        .map((a) => ({ attr: a.getAttribute('href') ?? '', abs: (a as HTMLAnchorElement).href })),
    );
    anchors = Array.isArray(raw) ? raw : [];
  } catch {
    return null;
  }
  const hits = anchors.filter((a) => a.abs && urlMatches(pattern, a.abs, params));
  if (!hits.length || new Set(hits.map((h) => h.abs)).size !== 1) return null;
  return { selector: `a[href="${hits[0].attr.replace(/(["\\])/g, '\\$1')}"]`, href: hits[0].abs };
}

/** How long the fallback candidates are given to report their text, each. */
export const HELD_TEXT_READ_MS = 1_000;

/**
 * For a text wait that timed out: another recorded candidate for its target
 * that shows the text right now, if there is one. Candidates are tried in
 * STORED order after the primary (stored index 0 is never asked — it is what
 * the wait already judged, or what missed); a point is skipped (it names a
 * place, not an element with text), and a candidate must still match exactly
 * one element. The wait already gave the page its full timeout to paint.
 *
 * fwrd43's create step waited for the new ticket's title in `label "Tickets"
 * >> nth=1`, which on replay was an empty element, while the chain's own next
 * candidate — the tickets section — already showed it.
 */
export async function textHeldElsewhere(
  candidates: readonly { index: number; kind: string; locator: Locator }[],
  state: unknown,
  text: unknown,
): Promise<{ index: number; locator: Locator } | null> {
  if (typeof text !== 'string' || !text.trim()) return null;
  if (state !== 'text_contains' && state !== 'text_equals') return null;
  const ordered = [...candidates].filter((c) => c.index >= 1).sort((a, b) => a.index - b.index);
  for (const candidate of ordered) {
    if (candidate.kind === 'point') continue;
    try {
      if ((await candidate.locator.count()) !== 1) continue;
      // Rendered text, compared as the wait itself compares it (text.ts
      // textHolds): textContent missed "OVERVIEW" under text-transform (fwop10).
      const shown = await candidate.locator.innerText({ timeout: HELD_TEXT_READ_MS });
      if (textHolds(shown, state, text)) return { index: candidate.index, locator: candidate.locator };
    } catch {
      continue;
    }
  }
  return null;
}
