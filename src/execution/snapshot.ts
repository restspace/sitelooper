import type { Page } from 'playwright-core';
import { WILDCARD, escapeRe, identityRe } from './text.js';
import { settleDom } from './browser.js';

/**
 * The page-observation dialect both execution targets share: the snapshot
 * line (`- role "name": value`) the daemon records and diffs, the capture that
 * produces it, and the matchers that read it. The daemon imports this module
 * (through daemon/diff.ts and skills/replay.ts); a compiled `.flow.ts`
 * artifact embeds its exact source (spec/runtime-source.ts), so both runners
 * ask their effect and identity questions of the same lines. It must stay
 * self-contained: nothing but a sibling shared module or a Playwright type may
 * be imported.
 */

/** What a capture is allowed to walk and return — passed INTO the page, since describeInPage is serialised. */
export const SNAPSHOT_LIMITS = { maxAlerts: 5, maxAlertChars: 200, maxNodes: 4_000, maxLines: 400 };

/** A capture that has not answered in this long is a navigating or hung page: null, never a wait. */
export const CAPTURE_TIMEOUT_MS = 2_000;

/**
 * Runs in the page: an aria-snapshot-shaped list of the roles, names and values
 * currently on screen, plus live-region text. Deliberately hand-rolled rather
 * than delegated to ariaSnapshot — see daemon/diff.ts capture(). Everything it
 * needs is passed in: it is serialised into the page, so nothing at module
 * level is in scope there.
 */
export function describeInPage(opts: {
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

const INTERACTIVE_ROLES =
  /\b(button|link|textbox|searchbox|combobox|checkbox|radio|switch|slider|spinbutton|menu|menubar|menuitem|option|tab|listbox|grid|row|cell|dialog|alertdialog|heading|alert|status)\b/;

/**
 * The per-line heuristic behind the daemon's filterInteractive; shared with
 * signature capture, so the lines a step is judged against are the same lines
 * the recording kept. Matches any ref, in-frame ones included — testing for
 * "[@e" silently dropped every line inside an iframe, so an embedded editor or
 * payment form was invisible in the snapshot the agent works from.
 */
export function isInteractiveLine(line: string): boolean {
  return line.includes('[@') || INTERACTIVE_ROLES.test(line);
}

/**
 * One look at the live page in the recorded dialect — every line describeInPage
 * produces, unfiltered, and the live-region alerts — or null when the page
 * cannot be read (navigating, closed, a renderer that does not answer within
 * CAPTURE_TIMEOUT_MS). Null is "unavailable", never "empty": a caller deciding
 * whether an effect landed, or whether an alert was raised, must not read a
 * failed look as a clean one. The single capture both `capturePageLines` and
 * the alert observation (observe.ts liveAlerts) are views of, so the selector,
 * the caps and the timeout exist once.
 */
export async function capturePage(page: Page): Promise<{ lines: string[]; alerts: string[] } | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const captured = await Promise.race([
      page.evaluate(describeInPage, SNAPSHOT_LIMITS),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS);
      }),
    ]);
    // A page that answered with something other than a capture (a frame torn
    // down mid-evaluate) is as unreadable as one that did not answer.
    return captured && Array.isArray(captured.lines) && Array.isArray(captured.alerts) ? captured : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The lines the page shows right now, in the recorded dialect, or null when
 * the page cannot be read (see capturePage).
 */
export async function capturePageLines(page: Page): Promise<string[] | null> {
  const captured = await capturePage(page);
  return captured ? captured.lines.filter(isInteractiveLine) : null;
}

/** How many added lines a step diff keeps — the recorder's own cap, so a replay diff and an artifact diff carry the same evidence. */
export const MAX_ADDED_LINES = 20;

/**
 * The lines a step ADDED, as the recorder diffs its before/after signatures:
 * every after-line not present before, capped. Null when either capture
 * failed — a diff needs both legs, and a missing leg is not an empty change.
 */
export function addedLines(before: string[] | null, after: string[] | null): string[] | null {
  if (before === null || after === null) return null;
  return after.filter((l) => !before.includes(l)).slice(0, MAX_ADDED_LINES);
}

export interface LineShowsOptions {
  /**
   * Identity matching: the want must sit at a letter/digit boundary on both
   * sides (see IDENTITY_EDGE) instead of anywhere inside a longer run of
   * characters. Only for "is this the right RECORD" — the effect gate asks
   * whether a change LANDED, which is a substring question and stays one.
   */
  whole?: boolean;
}

const normWs = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Does any of `wants` appear in `haystack` (recorded page lines, or a diff's
 * added lines)? Whitespace-insensitive on both sides — a marker copied with
 * a trailing space is the same word — and a `{{*}}` wildcard (see
 * maskVolatile) matches anything within one line.
 *
 * `opts.whole` switches to the IDENTITY rule: same wildcards, but bounded at
 * both edges so `fwgr25-n1` is no longer satisfied by `fwgr25-n10`. Only the
 * identity callers pass it; the effect gate asks a different question.
 */
export function lineShows(haystack: string[], wants: string[], opts: LineShowsOptions = {}): boolean {
  const all = haystack.map(normWs).join('\n');
  return wants.some((raw) => {
    const want = normWs(raw);
    if (!want) return false;
    if (opts.whole) return identityRe(want).test(all);
    if (!want.includes(WILDCARD)) return all.includes(want);
    const re = new RegExp(want.split(WILDCARD).map(escapeRe).join('[^\\n]*?'));
    return re.test(all);
  });
}

/**
 * A parameterised line that did not *appear* may still be *there*: filling a
 * field with the value it already held produces no diff. One fresh look at the
 * live page settles it; a page that cannot be read shows nothing.
 */
export async function presentOnPage(page: Page, lines: string[], opts: LineShowsOptions = {}): Promise<boolean> {
  const live = await capturePageLines(page);
  if (!live) return false;
  return lineShows(live, lines, opts);
}

/**
 * Runs in the page: do the identity and the goal hold of the SAME record?
 *
 * The record's container is the OUTERMOST ancestor of the goal text that is
 * one of several siblings of its kind — the row among rows, the card among
 * cards. Outermost, not nearest: a cell is one of several cells too, and
 * stopping there would ask whether the identity is inside the status cell,
 * which it never is. The row above it is the scope the page itself asserts is
 * one record, and it is what a `scoped` locator names. If the goal text has
 * no repeated ancestor at all the page is not listing records, and page-wide
 * agreement is the right answer there (a detail page's heading and its status
 * field share no small container).
 *
 * `identity` arrives as regex SOURCE (identitySource), already bounded: this
 * function is serialised into the page, so it cannot call identityRe, and a
 * second hand-written copy of the boundary rule here would be free to drift.
 */
export function scopeCheckInPage(opts: { identity: string[]; goal: string[] }): boolean {
  const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
  const textOf = (el: Element) => norm((el as HTMLElement).innerText || el.textContent);
  const all = Array.from(document.querySelectorAll('*'));

  // The smallest elements that show a goal string: a container shows it too,
  // and starting from the container would skip the record scope below it.
  const holders: Element[] = [];
  for (const raw of opts.goal) {
    const want = norm(raw);
    if (!want) continue;
    const hits = all.filter((el) => textOf(el).includes(want));
    for (const el of hits) if (!hits.some((other) => other !== el && el.contains(other))) holders.push(el);
  }
  if (!holders.length) return false;

  // Siblings of a kind means STRUCTURALLY alike, not merely same-tag: two
  // unrelated buttons that happen to sit side by side are not a record list,
  // and treating them as one would scope a lone control to itself. Rows of a
  // list are rendered by one template and carry the same classes.
  const kindOf = (el: Element) => `${el.tagName}.${norm(el.getAttribute('class'))}`;
  const oneOfSeveral = (el: Element): boolean => {
    const parent = el.parentElement;
    // A direct child of <body> is a section of the page, not a record: a list
    // of records sits inside something. Without this, two unrelated top-level
    // controls make either of them its own "record" scope.
    if (!parent || parent === document.body) return false;
    const kind = kindOf(el);
    let same = 0;
    for (const sib of Array.from(parent.children)) if (kindOf(sib) === kind) same++;
    return same >= 2;
  };

  for (const holder of holders) {
    let node: Element | null = holder;
    let record: Element | null = null;
    while (node && node !== document.body) {
      if (oneOfSeveral(node)) record = node;
      node = node.parentElement;
    }
    if (!record) return true; // not a list: the whole page is about one record
    const inside = textOf(record);
    if (opts.identity.some((src) => new RegExp(src, 'iu').test(inside))) return true;
  }
  return false;
}

/**
 * Scroll the page end to end so a virtualised or lazily rendered UI paints
 * everything it has, then let the DOM settle. Returns false when the page
 * cannot be scripted (gone, cross-origin frame), in which case the caller
 * simply does not retry.
 */
export async function sweepPage(page: Page): Promise<boolean> {
  try {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await settleDom(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await settleDom(page);
    return true;
  } catch {
    return false;
  }
}
