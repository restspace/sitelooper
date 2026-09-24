/**
 * WHERE a persistent target lives, and what a step does to the page it runs
 * on (notes/ROBUSTNESS.md, finding 5), shared by daemon replay and embedded
 * verbatim in the standalone artifact.
 *
 * A live `@f1e2` ref reaches into an iframe, so an agent's in-frame click
 * works. A recorded chain did not: every candidate was rebuilt from `Page`,
 * so a Save button inside a payment frame either never verified at record
 * time (and fell to a frame-local css path the main page may also match) or,
 * worse, resolved at replay to the page's OWN Save. And a step that opened a
 * popup, closed its window or switched tabs left no trace, so replay kept
 * acting on the page it was pinned to. This module is the one model both
 * runners use for both facts:
 *
 *  - a `FramePath` says which frame, top-down, as ranked selectors each
 *    verified at record time to match exactly that iframe; `rootFor` finds it
 *    again or says why not. It NEVER falls back to the main page — a Save
 *    found on the page when the recorded Save was in a frame is a different
 *    control, and pressing it is the defect this exists to stop;
 *  - a `PageEffect` says a step opened a popup, closed its page, or switched
 *    tabs, so both runners follow it: the listener is attached BEFORE the
 *    action dispatches, and a recorded popup that does not open is a stop.
 *
 * Self-contained: sibling shared modules and Playwright types only.
 */
import type { Locator, Page } from 'playwright-core';
import { urlMatches } from './url.js';

/** One level of a frame path: how to find one iframe inside the root above it. */
export interface FrameHop {
  /**
   * Ranked selectors, each verified at record time to match exactly this
   * iframe in its parent: `iframe[name="x"]`, `iframe[title="x"]`,
   * `iframe#stableId`, `iframe[src*="/path"]` (the path only), and
   * `iframe >> nth=i` as the last resort. The first that matches exactly one
   * element wins.
   */
  selectors: string[];
  name?: string;
  title?: string;
  /** The frame's url pattern, required to match when the positional `nth` selector is what found it. */
  urlPattern?: string;
}

/** Top-down; empty or absent means the main frame. */
export type FramePath = FrameHop[];

/** A target's context beside its locator chain (SkillStep.contexts, keyed like locators). */
export interface TargetContext {
  frame?: FramePath;
}

/**
 * What a step did to the page itself, beyond its locator's element:
 * `popup` opened a new page the procedure continues on, `close` closed the
 * page it ran on (the procedure returns to its opener), `switch` made
 * another open tab the active one. `navigate` names an ordinary same-page
 * navigation; the url expectation already carries that, so it is never
 * recorded, only reserved.
 */
export type PageEffect =
  | { kind: 'navigate' }
  | { kind: 'popup'; urlPattern?: string }
  | { kind: 'close' }
  | { kind: 'switch'; to: number };

/**
 * An iframe's content, as a locator root. Typed off `Locator` so an artifact
 * imports nothing past `Page` and `Locator`.
 */
export type FrameRoot = ReturnType<Locator['contentFrame']>;

/** What a chain's candidates are built from: the page, or a frame inside it. Page and FrameLocator share getBy*() and locator(). */
export type Root = Page | FrameRoot;

/** How long both runners wait for a recorded popup to open, or a recorded close to happen. */
export const POPUP_WAIT_MS = 5_000;

/** How often rootFor re-walks a path that did not resolve inside its wait. */
export const FRAME_POLL_MS = 100;

/** The frame a hop names, as it reads in a message: its title, its name, else its first selector. */
export function describeFrameHop(hop: FrameHop): string {
  if (hop.title) return `iframe[title=${JSON.stringify(hop.title)}]`;
  if (hop.name) return `iframe[name=${JSON.stringify(hop.name)}]`;
  return hop.selectors[0] ?? 'iframe';
}

export function describeFramePath(frame: FramePath): string {
  return frame.map(describeFrameHop).join(' > ');
}

/** Whether two recorded frame paths name the same frame the same way. Absent and empty are both the main frame. */
export function framesEqual(a?: FramePath, b?: FramePath): boolean {
  const norm = (f?: FramePath) => JSON.stringify((f ?? []).map((h) => [h.selectors, h.name ?? null, h.title ?? null, h.urlPattern ?? null]));
  return norm(a) === norm(b);
}

/** Whether two steps' target contexts agree for every key either carries. */
export function contextsEqual(a?: Partial<Record<string, TargetContext>>, b?: Partial<Record<string, TargetContext>>): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const key of keys) if (!framesEqual(a?.[key]?.frame, b?.[key]?.frame)) return false;
  return true;
}

/**
 * The page effect a step carries. A recorded `tabs` switch is one whether or
 * not its recording wrote the effect down: a store written before effects
 * existed has the tool and its index, and both runners follow it the same way.
 */
export function stepEffect(step: { tool: string; args?: Record<string, unknown>; effect?: PageEffect }): PageEffect | undefined {
  if (step.effect) return step.effect;
  const to = step.args?.switch_to;
  return step.tool === 'tabs' && typeof to === 'number' ? { kind: 'switch', to } : undefined;
}

/**
 * A step recorded on page `expected` of the browser's open pages, asked of the
 * page the procedure is on now: null when they agree (or nothing was
 * recorded), else the stop. A step that ran on a popup must not run on the
 * page that opened it because the popup never came.
 */
export function pageIndexVerdict(page: Page, expected: number | undefined, where: string): string | null {
  if (expected === undefined) return null;
  const pages = page.context().pages().filter((p) => !p.isClosed());
  const at = pages.indexOf(page);
  if (at === expected) return null;
  return `${where} was recorded on page ${expected} of the browser, but the procedure is on page ${at} of ${pages.length} — the page it expects (a popup or tab opened earlier) is not open here`;
}

/**
 * Arm what a step's page effect needs BEFORE its action dispatches, and hand
 * back the question to ask once it has: where does the procedure continue?
 *
 *  - popup: the listener is attached now — a target=_blank click can raise its
 *    popup before the click call returns, and a listener attached after it
 *    misses it. None within POPUP_WAIT_MS is a stop: the recording opened one.
 *  - close: the opener is read now, while the page can still answer. The page
 *    must then close within the wait; the procedure continues on its opener
 *    (else on the first page still open).
 *  - switch: the recorded tab index, among the pages open after the action.
 *
 * `null` for a step with no effect to follow — it stays on its page.
 */
export async function armPageEffect(
  page: Page,
  effect: PageEffect | undefined,
  where: string,
  waitMs = POPUP_WAIT_MS,
): Promise<() => Promise<{ page: Page } | { error: string } | null>> {
  if (!effect || effect.kind === 'navigate') return async () => null;
  if (effect.kind === 'popup') {
    // The recorder's rule (tools.ts pageContextOf), not the page's `popup`
    // event alone: a tab a Ctrl+click or a `rel=noopener` link opens has no
    // opener, so that event never reaches this page — snipe-it fwsi9 step 12
    // reported "none opened" with two pages open, and ran everything after on
    // page 0. The popup is the one page that appeared on the context since
    // the action was armed; of several, only one this page opened.
    const context = page.context();
    const before = new Set(context.pages());
    const appeared = context.waitForEvent('page', { timeout: waitMs }).catch(() => null);
    return async () => {
      await appeared;
      const fresh = context.pages().filter((p) => !before.has(p) && !p.isClosed());
      let opened: Page | null = fresh.length === 1 ? fresh[0] : null;
      for (const p of fresh.length > 1 ? fresh : []) {
        if ((await p.opener().catch(() => null)) === page) {
          opened = p;
          break;
        }
      }
      if (!opened) {
        return {
          error: fresh.length
            ? `${where} was recorded opening a popup, and ${fresh.length} pages opened, none of them by this page`
            : `${where} was recorded opening a popup, and none opened within ${waitMs}ms`,
        };
      }
      await opened.waitForLoadState('domcontentloaded', { timeout: waitMs }).catch(() => {});
      return { page: opened };
    };
  }
  if (effect.kind === 'close') {
    const opener = await page.opener().catch(() => null);
    return async () => {
      if (!page.isClosed()) await page.waitForEvent('close', { timeout: waitMs }).catch(() => {});
      if (!page.isClosed()) return { error: `${where} was recorded closing its page, and the page is still open after ${waitMs}ms` };
      const next = opener && !opener.isClosed() ? opener : page.context().pages().find((p) => !p.isClosed());
      return next ? { page: next } : { error: `${where} closed its page, and no page is left to continue on` };
    };
  }
  const to = effect.to;
  return async () => {
    const pages = page.context().pages().filter((p) => !p.isClosed());
    const next = pages[to];
    if (!next) return { error: `${where} was recorded switching to tab ${to}, but only ${pages.length} tab(s) are open` };
    await next.bringToFront().catch(() => {});
    return { page: next };
  };
}

const NTH_SELECTOR =/>>\s*nth=\d+\s*$/;

/** The root a hop names inside `parent`, or why it could not be found this look. */
async function hopRoot(parent: Root, hop: FrameHop): Promise<{ root: FrameRoot } | { missing: string } | { ambiguous: string }> {
  let ambiguous: string | null = null;
  for (const selector of hop.selectors) {
    try {
      const loc = parent.locator(selector);
      const count = await loc.count();
      if (count > 1) {
        ambiguous ??= `${count} matches for ${selector}`;
        continue;
      }
      if (count !== 1) continue;
      if (NTH_SELECTOR.test(selector)) {
        // A position names whichever frame sits there; only the recorded url
        // makes it the recorded one. With no url recorded, it names nothing.
        if (!hop.urlPattern) continue;
        const handle = await loc.elementHandle({ timeout: 1_000 }).catch(() => null);
        const frame = handle ? await handle.contentFrame().catch(() => null) : null;
        const url = frame ? frame.url() : '';
        if (handle) await handle.dispose().catch(() => {});
        if (!url || !urlMatches(hop.urlPattern, url)) continue;
      }
      return { root: loc.contentFrame() };
    } catch {
      // a selector that cannot be asked on this root is simply not a match
    }
  }
  return ambiguous ? { ambiguous } : { missing: hop.selectors.join(', ') };
}

/**
 * The root a recorded frame path names on the live page: the page itself for
 * an absent or empty path, else the frame each hop leads to, top-down. Polls
 * the whole path for `waitMs` (a payment frame is often injected a beat after
 * the page settles). Never the main page in place of a frame that is not
 * there: `missing` says no recorded selector found the frame, `ambiguous`
 * that one found several.
 */
export async function rootFor(
  page: Page,
  frame: FramePath | undefined,
  waitMs: number,
  pollMs = FRAME_POLL_MS,
): Promise<{ root: Root } | { error: string; missing: boolean }> {
  if (!frame?.length) return { root: page };
  const deadline = Date.now() + Math.max(0, waitMs);
  for (;;) {
    let root: Root = page;
    let failure: { error: string; missing: boolean } | null = null;
    for (const hop of frame) {
      const found = await hopRoot(root, hop);
      if ('root' in found) {
        root = found.root;
        continue;
      }
      failure =
        'ambiguous' in found
          ? { error: `recorded frame ${describeFrameHop(hop)} is ambiguous (${found.ambiguous})`, missing: false }
          : { error: `recorded frame ${describeFrameHop(hop)} not found (tried: ${found.missing})`, missing: true };
      break;
    }
    if (!failure) return { root };
    if (Date.now() >= deadline) return failure;
    // A plain timer: this path runs when the page has not answered yet, and a
    // navigating page makes its own clock throw.
    await new Promise((r) => setTimeout(r, Math.max(1, Math.min(pollMs, deadline - Date.now()))));
  }
}
