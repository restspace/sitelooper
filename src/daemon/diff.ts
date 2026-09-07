import type { Page } from 'playwright-core';
import { clip } from '../shared/text.js';
import { isInteractiveLine, truncate } from './refs.js';

/**
 * A cheap, comparable fingerprint of what the page currently shows. Captured
 * before and after each state-changing action so the action's own result can
 * carry a summary of what visibly changed, sparing the agent an observe turn.
 */
export interface PageSignature {
  url: string;
  title: string;
  lines: string[];
  alerts: string[];
}

const CAPTURE_TIMEOUT = 2_000;
const MAX_ALERTS = 5;
const MAX_ALERT_CHARS = 200;
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      capture(page),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), CAPTURE_TIMEOUT);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function capture(page: Page): Promise<PageSignature> {
  // NOT ariaSnapshot(): every call to it — mode:'ai' *or* plain — re-mints
  // Playwright's [ref=eN] registry, and a plain call leaves it empty, so the
  // @refs the agent holds from its last explicit snapshot stop resolving.
  // This runs after every action, so it walks the DOM itself instead.
  // Everything describeInPage needs is passed in: it is serialised into the
  // page, so module-level constants are not in scope there.
  const { lines, alerts } = await page.evaluate(describeInPage, {
    maxAlerts: MAX_ALERTS,
    maxAlertChars: MAX_ALERT_CHARS,
    maxNodes: 4_000,
    maxLines: 400,
  });
  return {
    url: page.url(),
    title: await page.title(),
    lines: lines.filter(isInteractiveLine),
    alerts,
  };
}

/**
 * Runs in the page: an aria-snapshot-shaped list of the roles, names and values
 * currently on screen, plus live-region text. Deliberately hand-rolled rather
 * than delegated to ariaSnapshot — see capture().
 */
function describeInPage(opts: {
  maxAlerts: number;
  maxAlertChars: number;
  maxNodes: number;
  maxLines: number;
}): { lines: string[]; alerts: string[] } {
  const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

  const roleOf = (el: Element): string | null => {
    const explicit = clean(el.getAttribute('role'));
    if (explicit) return explicit.split(' ')[0];
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a') return el.hasAttribute('href') ? 'link' : null;
    if (tag === 'select') return el.hasAttribute('multiple') ? 'listbox' : 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'option') return 'option';
    if (tag === 'td' || tag === 'th') return 'cell';
    if (tag === 'tr') return 'row';
    if (tag === 'dialog') return 'dialog';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'input') {
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'range') return 'slider';
      if (type === 'search') return 'searchbox';
      if (type === 'number') return 'spinbutton';
      if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
      if (type === 'hidden' || type === 'file') return null;
      return 'textbox';
    }
    return null;
  };

  const nameOf = (el: Element): string => {
    const labelledBy = el.getAttribute('aria-labelledby');
    const fromIds = labelledBy
      ? labelledBy
          .split(/\s+/)
          .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
          .join(' ')
      : '';
    const own = clean(
      el.getAttribute('aria-label') ||
        fromIds ||
        el.getAttribute('alt') ||
        el.getAttribute('title') ||
        el.getAttribute('placeholder'),
    );
    if (own) return own.slice(0, 80);
    const label = clean(el.closest('label')?.textContent);
    if (label) return label.slice(0, 80);
    // Only a short subtree reads as this element's own name; anything longer is
    // a container's text and would make the line churn on unrelated changes.
    const text = clean((el as HTMLElement).innerText);
    return text.length <= 80 ? text : '';
  };

  const lines: string[] = [];
  const all = Array.from(document.querySelectorAll('*')).slice(0, opts.maxNodes);
  for (const el of all) {
    if (lines.length >= opts.maxLines) break;
    const role = roleOf(el);
    if (!role) continue;
    if (el.getClientRects().length === 0) continue;
    let line = `- ${role} ${JSON.stringify(nameOf(el))}`;
    const input = el as HTMLInputElement;
    if (input.type === 'checkbox' || input.type === 'radio') {
      line += input.checked ? ' [checked]' : '';
    } else if (typeof input.value === 'string' && input.value) {
      line += `: ${clean(input.value).slice(0, 80)}`;
    }
    lines.push(line);
  }

  const alerts = Array.from(document.querySelectorAll('[role=alert],[role=status]'))
    .filter((el) => el.getClientRects().length > 0)
    .slice(0, opts.maxAlerts)
    .map((el) => clean((el as HTMLElement).innerText).slice(0, opts.maxAlertChars))
    .filter((text) => text.length > 0);

  return { lines, alerts };
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
  /** The two signatures are identical: the page has not reacted (yet). */
  nothingChanged: boolean;
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

  const text = parts.length ? truncate(parts.join('; '), DIFF_BUDGET) : 'no visible change';
  const headParts = substantial
    ? [...head, `page changed substantially (~${changed} lines differ)`]
    : head;
  return {
    text,
    headline: headParts.length ? truncate(headParts.join('; '), DIFF_BUDGET) : text,
    substantial,
    urlChanged,
    nothingChanged: parts.length === 0,
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
