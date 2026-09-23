/**
 * Observations both execution targets take of a live page, so that a shared
 * verdict (./gates.ts) is asked the same question in the same dialect by the
 * daemon and by a compiled `.flow.ts` artifact. Self-contained: this module is
 * embedded verbatim in the artifact (spec/runtime-source.ts), so nothing but
 * a sibling shared module or a Playwright type may be imported.
 */
import type { Locator, Page } from 'playwright-core';
import { alertsComplete, capturePage, sweepPage, type LineDialect } from './snapshot.js';
import { clip, extractFramed, hasTextMatcher, implicitRoles, markFrame } from './text.js';
import { settleDom } from './browser.js';

/** What a recorded read takes off its element. A page url read has no element and is not one of these. */
export type ReadWhat = 'text' | 'value' | 'attr' | 'count';

export function isElementRead(what: unknown): what is ReadWhat {
  return what === 'text' || what === 'value' || what === 'attr' || what === 'count';
}

/** The part of a procedure step observedNothing looks at. */
export interface ObservingStep {
  tool: string;
  args?: Record<string, unknown>;
  locators?: Record<string, readonly unknown[] | undefined>;
  /** What the read publishes as; an unlabelled read is only an observation, and the artifact does not take it. */
  label?: string;
}

/** Tools that neither set nor select anything: a procedure of only these (and reads) is read-only. */
const LOOKING_TOOLS = new Set(['goto', 'back', 'wait_for', 'screenshot', 'scroll', 'hover']);

/**
 * A READ-ONLY procedure (navigation and reads, nothing that sets anything)
 * that took none of the reads it could take has not replayed: it looked at a
 * page and saw nothing it was recorded seeing. Each skipped read alone is an
 * observation lost, never a failure — but when every one of them is lost the
 * procedure is on the wrong page, and "ran" would be a false pass.
 *
 * fwop4-n2 08-open is that pass: s_c4a13c's goto kept run 1's work package
 * (41, deleted by the reset), all nine reads skipped, the step reported tier A
 * 10/10 and its report came from the template, naming run 2's record. Only
 * reads with a recorded way to find their element count: one whose chain is
 * empty is skipped on every run by design ("has no locator left"), and only
 * LABELLED reads, the ones both runners take (an unlabelled read is a comment
 * in the artifact).
 */
export function observedNothing(steps: readonly ObservingStep[], skippedReads: number): boolean {
  const reads = steps.filter(
    (s) => (s.tool === 'read' || s.tool === 'read_all') && Boolean(s.label) && isElementRead(s.args?.what ?? 'text') && (s.locators?.target?.length ?? 0) > 0,
  ).length;
  if (!reads || skippedReads < reads) return false;
  return steps.every((s) => s.tool === 'read' || s.tool === 'read_all' || LOOKING_TOOLS.has(s.tool));
}

/**
 * What an element that renders NO text is called: its aria-label, its title,
 * its own alt, else the alt of an image inside it — the accessible name the
 * recording located it by, where innerText has nothing. fwgt5 01-signin's
 * `org_link` read found gitea's image-only org link by its name "bench",
 * read innerText, and published "" on both replays and in the artifact.
 * Runs in the page, so it names nothing outside itself.
 */
const RENDERED_NAME = (el: Element): string =>
  (
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    el.getAttribute('alt') ||
    el.querySelector('img[alt]')?.getAttribute('alt') ||
    ''
  ).trim();

/**
 * RENDERED_NAME over every match, for a `read_all`. Its own copy of the rule,
 * because a function handed to the page is serialised ALONE: calling
 * RENDERED_NAME from inside an evaluateAll callback threw "RENDERED_NAME is
 * not defined" in the page and failed every plural text read with a blank
 * match (test/browser.test.ts, hidden `.ghost` rows).
 */
const RENDERED_NAMES = (els: Element[]): string[] =>
  els.map((el) =>
    (
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.getAttribute('alt') ||
      el.querySelector('img[alt]')?.getAttribute('alt') ||
      ''
    ).trim(),
  );

/**
 * A recorded `read` (one element) or `read_all` (every match), as the daemon's
 * read tools take it and a compiled artifact replays it. `read_all` reads
 * EVERY match: an artifact that took `inputValue()` threw Playwright's
 * strict-mode error on a selector made to match many (odoo's
 * `tr.o_data_row input`, four reads skipped on every compiled run of fwod41
 * while the daemon read them each time). Text is `innerText`, the rendered
 * text the recording saw, never `textContent`, edges trimmed — and, for an
 * element that renders none, its name (RENDERED_NAME). A count is plural by nature,
 * whichever tool asked.
 */
export async function readElements(
  loc: Locator,
  plural: boolean,
  what: ReadWhat,
  opts: { attr?: string; timeout?: number } = {},
): Promise<string | number | null | (string | null)[]> {
  const { attr = '', timeout } = opts;
  if (what === 'count') return await loc.count();
  if (plural) {
    if (what === 'text') {
      // Edges trimmed, as the singular read below (fwkb39).
      const texts = (await loc.allInnerTexts()).map((t) => t.trim());
      if (texts.every((t) => t)) return texts;
      const names = await loc.evaluateAll(RENDERED_NAMES);
      return texts.map((t, i) => (t ? t : (names[i] ?? t)));
    }
    if (what === 'value') return await loc.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value ?? null));
    return await loc.evaluateAll((els, a) => els.map((e) => e.getAttribute(a)), attr);
  }
  if (what === 'text') {
    // A text read is banked with its edge whitespace trimmed: kanboard fwkb39
    // published innerText "Backlog " (a trailing space inside the link), and
    // the value then travelled into an expectation line no snapshot matches.
    // Inner line breaks are the element's own and stay.
    const text = (await loc.innerText({ timeout })).trim();
    return text ? text : (await loc.evaluate(RENDERED_NAME, undefined, { timeout })) || text;
  }
  if (what === 'value') return await loc.inputValue({ timeout });
  return await loc.getAttribute(attr, { timeout });
}

/** A read as the one string a step publishes: every match of a `read_all`, in page order, joined by ` | `. */
export function flattenRead(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join(' | ') : String(value);
}

/**
 * A read as its step publishes it: the whole value, or — for a read recorded
 * with a FRAME (a read-back pinned by containment, text.ts FRAME_MARK) — only
 * the text at the frame's mark. A frame the element no longer shows THROWS,
 * so takeRead turns it into a skipped read: the value goes unpublished and a
 * reference to it goes to recovery, never out as the element's whole line
 * (fwvk3 n2 published "fwvk3-n2 Bench Task" for a runid). Both runners call
 * this inside takeRead, so they publish the same span or skip the same read.
 */
export function framedRead(value: unknown, frame: unknown): unknown {
  if (typeof frame !== 'string' || !frame) return value;
  const got = extractFramed(flattenRead(value), frame);
  if (got === null) throw new Error(`the element no longer shows the value where the recording saw it (${JSON.stringify(clip(frame, 80))})`);
  return got;
}

/**
 * What a slot-scoped read (skills/readscope.ts) carries, its slots already
 * resolved to this run's values: the recorded `frame`; `slotFrame`, the same
 * frame with its line written in a slot's value and no mark; `mark`, the value
 * of the slot the mark stands for; `within`, the value of the slot the read's
 * recorded value contained.
 */
export interface ReadScope {
  frame?: unknown;
  slotFrame?: unknown;
  mark?: unknown;
  within?: unknown;
}

/**
 * A read as its step publishes it once its SCOPE is applied — framedRead,
 * with the frame taken from this run's slot values when they place the mark
 * (text.ts markFrame; the recorded frame otherwise), and then the record check:
 * a read whose recorded value contained a slot's value must show THIS run's
 * value for that slot, or it resolved onto another record and THROWS, which
 * takeRead turns into a skipped read — absent, never another record's value.
 *
 * repairdesk fwrd87 04-add: s_9e190d, recorded adding Part A, replayed for
 * Part B. Its part_name reads had no candidate scoped by the part-name slot;
 * the positional primary matched both rows and the fallback was Part A's own
 * test hook, so both replays published Part A's name beside Part B's cost.
 * Both runners call this inside takeRead, so they publish the same value or
 * skip the same read. A slot this run did not bind asks nothing.
 */
export function scopedRead(value: unknown, scope: ReadScope): unknown {
  const placed =
    typeof scope.slotFrame === 'string' && scope.slotFrame && typeof scope.mark === 'string' ? markFrame(scope.slotFrame, scope.mark) : null;
  const got = framedRead(value, placed ?? scope.frame);
  const fold = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const within = typeof scope.within === 'string' ? fold(scope.within) : '';
  if (within && !fold(flattenRead(got)).includes(within)) {
    throw new Error(`the element shows another record than ${JSON.stringify(clip(String(scope.within), 80))} — not published`);
  }
  return got;
}

/**
 * Where a read's target is, for an OBSERVATION: the runner's own resolution,
 * and when that finds nothing, one sweep of the page and the resolution once
 * more with no wait (`again`), the wait having already been spent. A
 * virtualised page renders below-the-fold content only once it has been
 * scrolled to, and the agent's scrolls were evals, which never compile
 * (fwgr23 01-open lost the third panel heading without it). A page that
 * cannot be swept is not asked again.
 *
 * The runner supplies `resolve` because what it books around a resolution
 * differs (replay's candidate evidence and misses, the artifact's drift lines
 * and loop sink); WHEN it is asked, and how often, is this rule. Whatever
 * `resolve` throws (a loop progress guard stopping the pass) is not a miss and
 * propagates.
 */
export async function resolveForRead<H>(page: Page, resolve: (again: boolean) => Promise<H | null>): Promise<H | null> {
  const hit = await resolve(false);
  if (hit || !(await sweepPage(page))) return hit;
  return resolve(true);
}

export type ReadTaken = { ok: true; value: string } | { ok: false; message: string };

/**
 * A resolved read, taken. A read is an observation and never fails the step:
 * a read that throws (the element detached, a strict-mode match, a closed
 * page) comes back as `ok: false` with the error's first part, and the
 * runner skips it with that message. Values are flattened (flattenRead) so
 * both runners publish the same string for the same page.
 */
export async function takeRead(read: () => Promise<unknown>): Promise<ReadTaken> {
  try {
    return { ok: true, value: flattenRead(await read()) };
  } catch (err) {
    return { ok: false, message: (err instanceof Error ? err.message : String(err)).split('\nCall log:')[0] };
  }
}

/**
 * Where a count read looks: the container its candidate counts INSIDE, as a
 * locator both runners build from the root (`selector`, with the scoped
 * candidate's `hasText`), or `'root'` when the candidate counts across the
 * whole page or recorded frame.
 */
export type CountScope = 'root' | { selector: string; hasText?: string };

/**
 * One css selector's container: everything before its last top-level
 * combinator (`>`, `+`, `~` or a descendant space), outside brackets,
 * parentheses and quotes. `'root'` for a single compound (`#list`, `li.row`),
 * null for a selector list — a `,` at top level scopes nothing in particular.
 */
function cssContainer(selector: string): CountScope | null {
  let depth = 0;
  let quote = '';
  let cut = -1;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth--;
    else if (depth === 0 && ch === ',') return null;
    else if (depth === 0 && (ch === '>' || ch === '+' || ch === '~' || /\s/.test(ch))) cut = i;
  }
  if (cut < 0) return 'root';
  const prefix = selector.slice(0, cut).replace(/[\s>+~]+$/, '').trim();
  return prefix ? { selector: prefix } : 'root';
}

/**
 * The scope of each candidate of a COUNT read's chain (its params filled), or
 * null when one of them has a scope this rule cannot name — then a miss is
 * never read as a count of nothing. Points are left out: a place on the
 * page counts nothing.
 *
 *  - `scoped`: its container with its text (hasTextMatcher, as makeLocator
 *    builds it).
 *  - `css` / `id`: a Playwright chain (`a >> b`) is scoped by everything
 *    before its last segment (a trailing `nth=` is the element, not a scope);
 *    a single segment that is an engine selector (`role=alert`, `text=…`,
 *    an xpath) counts across the root; a css selector is scoped by what comes
 *    before its last combinator (`#list > li` by `#list`).
 *  - `role`, `testid`, `text`, `label`, `placeholder`: across the root.
 */
export function countScopes(chain: readonly { kind: string; selector?: string; container?: string; hasText?: string }[]): CountScope[] | null {
  const out: CountScope[] = [];
  for (const c of chain) {
    if (c.kind === 'point') continue;
    if (c.kind === 'scoped') {
      if (!c.container) return null;
      out.push({ selector: implicitRoles(c.container), hasText: c.hasText ?? '' });
      continue;
    }
    if (c.kind === 'css' || c.kind === 'id') {
      if (!c.selector) return null;
      const segments = implicitRoles(c.selector).split(' >> ').map((s) => s.trim());
      while (segments.length > 1 && /^nth=-?\d+$/.test(segments[segments.length - 1])) segments.pop();
      if (segments.length > 1) {
        out.push({ selector: segments.slice(0, -1).join(' >> ') });
        continue;
      }
      const only = segments[0];
      if (/^[a-z][\w-]*=/i.test(only) || only.startsWith('/') || only.startsWith('(')) {
        out.push('root');
        continue;
      }
      const scope = cssContainer(only);
      if (!scope) return null;
      out.push(scope);
      continue;
    }
    if (['role', 'testid', 'text', 'label', 'placeholder'].includes(c.kind)) out.push('root');
    else return null;
  }
  return out;
}

/**
 * Whether a COUNT read that resolved nothing observed a count of nothing —
 * "0", a value — rather than failing to look. repairdesk fwrd88 05-change:
 * s_4b0e31 counted `role=alert` after a status change and recorded "0"; on
 * replay nothing matched, and both runners skipped the read, so a correct,
 * observed answer went unpublished and the step read as partial.
 *
 * Asked only after the runner's full resolve wait and the page sweep
 * (resolveForRead). "Nothing" must be the page's answer, not a page that has
 * not drawn its list yet, so, once the DOM has gone quiet:
 *  - every candidate (points aside) matches no element at all — a miss for
 *    any other reason (identity, a thrown selector) is not a count;
 *  - every candidate's SCOPE (countScopes) is there: the whole root, or its
 *    container matching at least one element. A count of `#list > li`
 *    whose `#list` never rendered is a page that did not arrive, and the read
 *    is skipped as before.
 * Both runners call this with their own candidate locators and root, so they
 * publish "0" or skip on the same page.
 */
export async function countedNothing(
  page: Page,
  root: { locator(selector: string, options?: { hasText?: string | RegExp }): Locator },
  candidates: readonly { kind: string; locator: Locator }[],
  scopes: readonly CountScope[] | null,
): Promise<boolean> {
  if (!scopes) return false;
  const counted = candidates.filter((c) => c.kind !== 'point');
  if (!counted.length) return false;
  try {
    await settleDom(page);
    for (const c of counted) if ((await c.locator.count()) !== 0) return false;
    for (const scope of scopes) {
      if (scope === 'root') continue;
      const within = root.locator(scope.selector, scope.hasText !== undefined ? { hasText: hasTextMatcher(scope.hasText) } : undefined);
      if ((await within.count()) < 1) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * The visible live-region texts on the page right now — the alerts half of
 * the ONE page capture the daemon diffs (observeDocumentInPage under
 * SNAPSHOT_LIMITS, src/execution/snapshot.ts), rendered in the step's line
 * dialect: the same elements, visibility rule, caps and whitespace cleaning
 * by construction, not by a second copy kept in step. An alert the daemon
 * would diff is one the artifact sees. These are toasts and status lines, not
 * native `window.alert` dialogs. Null when the page cannot be read
 * (navigating, closed, not answering): "unobserved", never "no alert".
 */
export async function liveAlerts(page: Page, d: LineDialect = 1): Promise<string[] | null> {
  const captured = await capturePage(page, d);
  return captured ? captured.alerts : null;
}

/** Live-region texts with whether the look saw every one of them (alertsComplete) — what alertVerdict needs to tell "none raised" from "none seen". */
export interface ObservedAlerts {
  alerts: string[];
  complete: boolean;
}

/** liveAlerts, with its coverage: null when the page cannot be read. */
export async function liveAlertsObserved(page: Page, d: LineDialect = 1): Promise<ObservedAlerts | null> {
  const captured = await capturePage(page, d);
  return captured ? { alerts: captured.alerts, complete: alertsComplete(captured.coverage) } : null;
}
