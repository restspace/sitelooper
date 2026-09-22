/**
 * Observations both execution targets take of a live page, so that a shared
 * verdict (./gates.ts) is asked the same question in the same dialect by the
 * daemon and by a compiled `.flow.ts` artifact. Self-contained: this module is
 * embedded verbatim in the artifact (spec/runtime-source.ts), so nothing but
 * a sibling shared module or a Playwright type may be imported.
 */
import type { Locator, Page } from 'playwright-core';
import { alertsComplete, capturePage, sweepPage, type LineDialect } from './snapshot.js';
import { clip, extractFramed } from './text.js';

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
 * A recorded `read` (one element) or `read_all` (every match), as the daemon's
 * read tools take it and a compiled artifact replays it. `read_all` reads
 * EVERY match: an artifact that took `inputValue()` threw Playwright's
 * strict-mode error on a selector made to match many (odoo's
 * `tr.o_data_row input`, four reads skipped on every compiled run of fwod41
 * while the daemon read them each time). Text is `innerText`, the rendered
 * text the recording saw, never `textContent` — and, for an element that
 * renders none, its name (RENDERED_NAME). A count is plural by nature,
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
      const texts = await loc.allInnerTexts();
      if (texts.every((t) => t.trim())) return texts;
      const names = await loc.evaluateAll((els) => els.map(RENDERED_NAME));
      return texts.map((t, i) => (t.trim() ? t : (names[i] ?? t)));
    }
    if (what === 'value') return await loc.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value ?? null));
    return await loc.evaluateAll((els, a) => els.map((e) => e.getAttribute(a)), attr);
  }
  if (what === 'text') {
    const text = await loc.innerText({ timeout });
    return text.trim() ? text : (await loc.evaluate(RENDERED_NAME, undefined, { timeout })) || text;
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
