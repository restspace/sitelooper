/**
 * Observations both execution targets take of a live page, so that a shared
 * verdict (./gates.ts) is asked the same question in the same dialect by the
 * daemon and by a compiled `.flow.ts` artifact. Self-contained: this module is
 * embedded verbatim in the artifact (spec/runtime-source.ts), so nothing but
 * a sibling shared module or a Playwright type may be imported.
 */
import type { Locator, Page } from 'playwright-core';
import { capturePage, sweepPage } from './snapshot.js';

/** What a recorded read takes off its element. A page url read has no element and is not one of these. */
export type ReadWhat = 'text' | 'value' | 'attr' | 'count';

export function isElementRead(what: unknown): what is ReadWhat {
  return what === 'text' || what === 'value' || what === 'attr' || what === 'count';
}

/**
 * A recorded `read` (one element) or `read_all` (every match), as the daemon's
 * read tools take it and a compiled artifact replays it. `read_all` reads
 * EVERY match: an artifact that took `inputValue()` threw Playwright's
 * strict-mode error on a selector made to match many (odoo's
 * `tr.o_data_row input`, four reads skipped on every compiled run of fwod41
 * while the daemon read them each time). Text is `innerText`, the rendered
 * text the recording saw, never `textContent`. A count is plural by nature,
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
    if (what === 'text') return await loc.allInnerTexts();
    if (what === 'value') return await loc.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value ?? null));
    return await loc.evaluateAll((els, a) => els.map((e) => e.getAttribute(a)), attr);
  }
  if (what === 'text') return await loc.innerText({ timeout });
  if (what === 'value') return await loc.inputValue({ timeout });
  return await loc.getAttribute(attr, { timeout });
}

/** A read as the one string a step publishes: every match of a `read_all`, in page order, joined by ` | `. */
export function flattenRead(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join(' | ') : String(value);
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
 * the ONE page capture the daemon diffs (describeInPage under SNAPSHOT_LIMITS,
 * src/execution/snapshot.ts): the same elements, visibility rule, caps and
 * whitespace cleaning by construction, not by a second copy kept in step. An
 * alert the daemon would diff is one the artifact sees. These are toasts and
 * status lines, not native `window.alert` dialogs. Null when the page cannot
 * be read (navigating, closed, not answering): "unobserved", never "no alert".
 */
export async function liveAlerts(page: Page): Promise<string[] | null> {
  const captured = await capturePage(page);
  return captured ? captured.alerts : null;
}
