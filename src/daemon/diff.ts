import type { Page } from 'playwright-core';
import { clip } from '../shared/text.js';
import {
  CAPTURE_TIMEOUT_MS,
  CURRENT_DIALECT,
  SNAPSHOT_LIMITS,
  alertsComplete,
  coverageComplete,
  describeCoverage,
  observePage,
  renderAlerts,
  renderLines,
  type PageObservation,
} from '../execution/snapshot.js';
import { truncate } from './refs.js';

/**
 * A cheap, comparable fingerprint of what the page currently shows. Captured
 * before and after each state-changing action so the action's own result can
 * carry a summary of what visibly changed, sparing the agent an observe turn.
 */
export interface PageSignature {
  url: string;
  title: string;
  /** Interactive lines in CURRENT_DIALECT — what new recordings are written in. */
  lines: string[];
  alerts: string[];
  /**
   * The structured observation the lines were rendered from: a replay renders
   * it again in an older recorded step's dialect, and its coverage says whether
   * a line missing from `lines` is absent from the page. Absent on a signature
   * built by hand (tests, the site model's fixtures): read as complete.
   */
  observation?: PageObservation;
}

const CAPTURE_TIMEOUT = CAPTURE_TIMEOUT_MS;
const MAX_ALERT_CHARS = SNAPSHOT_LIMITS.maxAlertChars;
const MAX_LINE_CHARS = 120;
const LIST_LINE_BUDGET = 12;
const DIFF_BUDGET = 700;

/**
 * Fingerprint the live page, or null if it could not be read in time (a
 * navigating/closing page, a busy renderer). Diffing is a convenience layered
 * on top of an action that already succeeded, so a failed capture must degrade
 * to "no diff", never to an error.
 */
export async function captureSignature(page: Page): Promise<PageSignature | null> {
  try {
    // NOT ariaSnapshot(): every call to it — mode:'ai' *or* plain — re-mints
    // Playwright's [ref=eN] registry, and a plain call leaves it empty, so the
    // @refs the agent holds from its last explicit snapshot stop resolving.
    // This runs after every action, so it walks the DOM itself instead.
    // observePage is the shared observation (src/execution/snapshot.ts): the
    // same page function the compiled artifact embeds, with the same limits
    // and its own deadline (the main document, then what is left for frames).
    const observation = await observePage(page);
    if (!observation) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const title = await Promise.race([
      page.title(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), CAPTURE_TIMEOUT);
      }),
    ]).finally(() => clearTimeout(timer));
    if (title === null) return null;
    return {
      url: observation.url || page.url(),
      title,
      lines: renderLines(observation, CURRENT_DIALECT),
      alerts: renderAlerts(observation, CURRENT_DIALECT),
      observation,
    };
  } catch {
    return null;
  }
}

/** Whether a signature's look covered the page (a hand-built one, with no observation, is taken as complete). */
function covered(sig: PageSignature): boolean {
  return !sig.observation || (coverageComplete(sig.observation.coverage) && alertsComplete(sig.observation.coverage));
}

/**
 * Compact description of what changed between two signatures. Lines are
 * compared as a multiset, so reordering alone is not a change — only content
 * appearing or disappearing is worth spending the agent's attention on.
 */
export function diffSignatures(
  before: PageSignature,
  after: PageSignature,
  /** A batch's combined diff spans several actions, so it raises this. */
  lineBudget: number = LIST_LINE_BUDGET,
): string {
  return describeChange(before, after, lineBudget).text;
}

/**
 * The same diff, with the two facts a caller needs in order to decide whether
 * the text is enough on its own: whether the page moved wholesale (so the
 * agent's @refs and its mental model are both stale, and a fresh snapshot is
 * worth more than a list of differences) and whether the url changed.
 */
export interface ChangeReport {
  /** The full summary, as `[state: …]` has always carried it. */
  text: string;
  /**
   * The url/alert facts only, plus a note that the page moved wholesale —
   * what to say when a fresh snapshot is being attached and the line list
   * would only duplicate it.
   */
  headline: string;
  /** More lines differ than can usefully be listed. */
  substantial: boolean;
  urlChanged: boolean;
  /**
   * The two signatures are identical AND both looks covered the page: the page
   * has not reacted (yet). A look that stopped at a cap or could not read a
   * visible frame has not shown that nothing changed, only that nothing
   * changed in what it saw — that is `noVisibleChange` without this.
   */
  nothingChanged: boolean;
  /** Nothing differs between the two signatures as captured, however much of the page they covered. */
  noVisibleChange: boolean;
}

export function describeChange(
  before: PageSignature,
  after: PageSignature,
  lineBudget: number = LIST_LINE_BUDGET,
): ChangeReport {
  const head: string[] = [];
  const urlChanged = before.url !== after.url;

  if (urlChanged) {
    head.push(`url → ${after.url}` + (before.title !== after.title ? ` — ${JSON.stringify(after.title)}` : ''));
  }

  for (const alert of surplus(after.alerts, before.alerts)) {
    head.push(`alert: ${JSON.stringify(clip(alert, MAX_ALERT_CHARS))}`);
  }

  // Collapse BEFORE the substantial-change decision: a table that repainted
  // its twenty rows is one fact ("the list refreshed"), not twenty, and left
  // uncollapsed it blew the line budget and demoted the whole diff to
  // "re-snapshot" — the expensive answer to the cheapest kind of change.
  const added = collapseRuns(surplus(after.lines, before.lines));
  const removed = collapseRuns(surplus(before.lines, after.lines));
  const changed = added.length + removed.length;
  const substantial = changed > lineBudget;

  const parts = [...head];
  if (substantial) {
    parts.push(`page changed substantially (~${changed} lines differ) — re-snapshot to see the new state`);
  } else {
    for (const line of added) parts.push(`+ ${clip(line, MAX_LINE_CHARS)}`);
    for (const line of removed) parts.push(`- ${clip(line, MAX_LINE_CHARS)}`);
  }

  const complete = covered(before) && covered(after);
  const partly = [before, after].map((s) => (s.observation ? describeCoverage(s.observation.coverage) : '')).find(Boolean);
  const text = parts.length
    ? truncate(parts.join('; '), DIFF_BUDGET)
    : complete
      ? 'no visible change'
      : `no visible change in what could be observed (capture incomplete: ${clip(partly ?? 'coverage unknown', 160)})`;
  const headParts = substantial
    ? [...head, `page changed substantially (~${changed} lines differ)`]
    : head;
  return {
    text,
    headline: headParts.length ? truncate(headParts.join('; '), DIFF_BUDGET) : text,
    substantial,
    urlChanged,
    nothingChanged: parts.length === 0 && complete,
    noVisibleChange: parts.length === 0,
  };
}

/** More than this many lines of one role is repeated structure, not news. */
const RUN_THRESHOLD = 6;
/** How many of a collapsed run are still shown by name. */
const RUN_KEEP = 3;

/**
 * Fold a run of same-role lines down to its first few plus a count. A grid
 * that repaints emits one line per cell whose names differ only by the value
 * in them; listing all of them says nothing the first three did not, and
 * costs the budget that a genuinely new control further down would have used.
 * Order is preserved and lines of any other role are untouched.
 */
function collapseRuns(lines: string[]): string[] {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const role = roleOfLine(line);
    if (role) counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  const shown = new Map<string, number>();
  const out: string[] = [];
  for (const line of lines) {
    const role = roleOfLine(line);
    const total = role ? (counts.get(role) ?? 0) : 0;
    if (!role || total <= RUN_THRESHOLD) {
      out.push(line);
      continue;
    }
    const seen = (shown.get(role) ?? 0) + 1;
    shown.set(role, seen);
    if (seen <= RUN_KEEP) out.push(line);
    else if (seen === RUN_KEEP + 1) out.push(`… and ${total - RUN_KEEP} more ${role}`);
  }
  return out;
}

/** `- cell "Widget 4": 12` → `cell`; anything not shaped like a line → null. */
function roleOfLine(line: string): string | null {
  return /^-\s+([a-z][a-z0-9-]*)/i.exec(line)?.[1] ?? null;
}

/** Items of `a` not matched one-for-one by an occurrence in `b`. */
function surplus(a: string[], b: string[]): string[] {
  const counts = new Map<string, number>();
  for (const item of b) counts.set(item, (counts.get(item) ?? 0) + 1);
  const out: string[] = [];
  for (const item of a) {
    const left = counts.get(item) ?? 0;
    if (left > 0) counts.set(item, left - 1);
    else out.push(item);
  }
  return out;
}
