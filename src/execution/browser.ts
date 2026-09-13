import type { Locator, Page } from 'playwright-core';

/** Browser execution shared by replay and the standalone spec bundle. */

type ClickOpts = { timeout: number; dbl?: boolean };
type ClickAct = (o: { timeout: number; force?: boolean }) => Promise<void>;

/**
 * One way to land a click. `note` is appended to the result so the agent (and
 * a post-mortem) can see which tier did the work.
 */
interface ClickTier {
  note: string;
  run: (loc: Locator, opts: ClickOpts, act: ClickAct) => Promise<void>;
}

/**
 * The tiers a click falls through, in order. Each is tried when the one
 * before it failed; the window tier (fireWhenAttached) comes last and its own
 * error is what the agent sees, because it is the only tier that can explain
 * WHY nothing landed.
 */
const CLICK_TIERS: ClickTier[] = [
  // Playwright's own click, actionability checks and all.
  { note: '', run: (_loc, opts, act) => act({ timeout: opts.timeout }) },
  // Scroll into view and skip the checks: a control under a sticky header,
  // or one an overlay covers in a way the app treats as fine.
  {
    note: ' (forced past actionability checks)',
    run: async (loc, opts, act) => {
      await loc.scrollIntoViewIfNeeded({ timeout: opts.timeout }).catch(() => {});
      await act({ timeout: opts.timeout, force: true });
    },
  },
  // A synthetic event straight at the element: React's delegated handlers see
  // it even when the element is not "clickable" by Playwright's rules.
  { note: ' (dispatched DOM event — element was not normally clickable)', run: (loc, opts) => loc.evaluate(fireClick, Boolean(opts.dbl)) },
];

export async function robustClick(loc: Locator, opts: ClickOpts): Promise<string> {
  const label = opts.dbl ? 'double-clicked' : 'clicked';
  const act: ClickAct = (o) => (opts.dbl ? loc.dblclick(o) : loc.click(o));
  let firstFailure = '';
  for (const tier of CLICK_TIERS) {
    try {
      await tier.run(loc, opts, act);
      return `${label}${tier.note}`;
    } catch (err) {
      const failure = err instanceof Error ? err.message : String(err);
      firstFailure ||= failure;
      // Two or more matches is the agent's problem to fix, not a tier's.
      if (/strict mode violation/i.test(failure)) throw err;
      // A DISABLED control refused the click by design, and the tiers below
      // do not get past that: a forced click on a disabled button dispatches
      // nothing the app handles, yet returned "clicked (forced past
      // actionability checks)". Asked only once Playwright's own click has
      // failed, so an ordinary click costs nothing extra; an element that
      // cannot be asked (gone, re-rendering) goes on down the tiers as before.
      if (tier === CLICK_TIERS[0] && (await loc.isDisabled({ timeout: DISABLED_PROBE_MS }).catch(() => false))) {
        throw new Error(
          `${label === 'clicked' ? 'click' : 'double-click'} NOT dispatched: the control is disabled, so the app would ignore it. ` +
            'Make whatever enables it true first (a required field, a selection, a finished load), then click it.',
        );
      }
      // The page went out from under the click. Whether it landed is unknown,
      // so no further tier may fire: see UNCERTAIN_DISPATCH.
      if (UNCERTAIN_DISPATCH.test(failure)) {
        throw new Error(
          `${label === 'clicked' ? 'click' : 'double-click'} outcome UNKNOWN: the page was torn down during the action (${failure.split('\n')[0].slice(0, 160)}). It may already have taken effect. Do not repeat it — observe the app's state and continue from what you find.`,
        );
      }
      // A control the app re-mounts on every render never passes the
      // attached→visible→stable check, and a forced click needs it attached
      // at the instant of the action just the same — so both tiers lose the
      // race and burn their full timeout (rpgr4-r2 spent 74 turns on
      // grafana's viz-picker toggle this way). Only Playwright's own detach
      // evidence sends a click straight to the window tier: its generic
      // timeout log reads "waiting for element to be visible, enabled and
      // stable" for EVERY stalled click, and matching on that routed 15
      // ordinary replay clicks per run past the tiers that had been landing
      // them (rpgr5).
      if (DETACHED.test(failure)) break;
    }
  }
  return fireWhenAttached(loc, opts, label, firstFailure);
}

/** How long robustClick asks whether a control that refused a click is disabled. */
const DISABLED_PROBE_MS = 500;

/** Playwright's own words for an element that left the DOM mid-action — never its generic actionability wording. */
const DETACHED = /element was detached|not attached to the DOM|element is not attached|element is not stable/i;

/**
 * Failures that mean the PAGE moved, not that the element was unready: the
 * context went away, the frame detached, the tab closed. Escalating through
 * the click tiers is safe only because an actionability timeout proves
 * Playwright never dispatched — it waits for visible/enabled/stable BEFORE
 * the pointer event, so nothing happened and trying harder repeats nothing.
 * These failures carry no such proof. They are the shape a click that
 * committed and then tore its own page down leaves behind, and a second,
 * forced, synthetic click would be a second commit. Stop instead, and say the
 * outcome is unknown rather than guessing either way.
 */
const UNCERTAIN_DISPATCH =
  /execution context was destroyed|target.*(?:has been|was) closed|target closed|browser has been closed|frame was detached|navigating and changing the content|page closed/i;

/** Runs in the page: a synthetic click (React's delegated handlers see it). */
function fireClick(el: Element, dbl: boolean): void {
  const fire = (type: string) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  fire('click');
  if (dbl) {
    fire('click');
    fire('dblclick');
  }
}

/**
 * Click a control that keeps re-mounting. Polls for the element and, the
 * moment a handle resolves, dispatches the click in the same tick — no
 * actionability wait at all. A flickering element is attached for a good
 * fraction of every cycle; the normal tiers never act inside that window.
 * If no window is found within the budget, the error says what the agent is
 * fighting and what to try instead of the same click again.
 */
export async function fireWhenAttached(loc: Locator, opts: { timeout: number; dbl?: boolean }, label = 'clicked', because = ''): Promise<string> {
  // The first line of the failure that sent us here rides along in the
  // result, so a post-mortem can see WHY a click took this route.
  const cause = because ? ` after: ${because.split('\n')[0].slice(0, 120)}` : '';
  const deadline = Date.now() + opts.timeout;
  let polls = 0;
  let attached = 0;
  while (Date.now() < deadline) {
    polls++;
    const handle = await loc.elementHandle({ timeout: 100 }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (/strict mode violation/i.test(message) || UNCERTAIN_DISPATCH.test(message)) throw err;
      return null;
    });
    if (handle) {
      attached++;
      try {
        await handle.evaluate(fireClick, Boolean(opts.dbl));
        return `${label} (dispatched during a re-render window${cause} — the element re-mounts continuously, so a normal click could not land; if the app did not respond, it may need a keyboard route or a wait_for on the state that settles it)`;
      } catch (err) {
        // The element going again between resolve and fire is the ordinary
        // case: nothing was dispatched, so the next window is safe. A context
        // that was DESTROYED is not — the click may have landed and navigated
        // the page, and polling on would fire it a second time.
        const message = err instanceof Error ? err.message : String(err);
        if (UNCERTAIN_DISPATCH.test(message)) {
          throw new Error(
            `${label === 'clicked' ? 'click' : 'double-click'} outcome UNKNOWN: dispatched into a page that was being torn down (${message.split('\n')[0].slice(0, 160)}). It may already have taken effect. Do not repeat it — observe the app's state and continue from what you find.`,
          );
        }
      } finally {
        await handle.dispose().catch(() => {});
      }
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(
    attached
      ? `target re-rendered continuously: attached on ${attached} of ${polls} polls but never long enough to click. The app re-mounts it on every render. Do not repeat this click — wait_for an element that appears once the state settles, or drive it by keyboard (focus a stable neighbour, Tab to it, press Enter).`
      : `target was never attached during ${Math.round(opts.timeout / 1000)}s of polling after an initial detach — it was removed by a re-render. Re-snapshot and locate it afresh rather than repeating this click.`,
  );
}

/**
 * React-safe input helpers (friction #5). Plain `locator.fill()` bypasses the
 * native value setter, so React controlled components never see the change
 * (or number inputs end up appending). We set the value through the native
 * prototype setter and dispatch input/change so React's synthetic event
 * system picks it up. Invisible to the agent: `fill` just works.
 */
export async function reactSafeFill(locator: Locator, value: string): Promise<void> {
  await locator.waitFor({ state: 'visible', timeout: 10_000 });
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click({ timeout: 5_000 }).catch(() => {}); // focus; some widgets need it
  const handled = await locator.evaluate((el, val) => {
    const input = el as HTMLInputElement | HTMLTextAreaElement;
    if (!('value' in input)) return false;
    const proto =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : input instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : null;
    if (!proto) return false;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (!setter) return false;
    setter.call(input, ''); // clear-then-set: number inputs otherwise append
    input.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(input, val);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, value);
  if (!handled) {
    // contenteditable or non-standard widget — fall back to Playwright fill
    await locator.fill(value);
  }
}

/**
 * Select an option and fire change through the native setter, for React
 * controlled <select> elements.
 */
export async function reactSafeSelect(locator: Locator, value: string, fallbackValue?: string): Promise<string[]> {
  // Look before waiting: an option present NOW is chosen at once, and the
  // recorded fallback value is tried without first sitting out the label's
  // full timeout. Only when nothing matches yet does the label wait for
  // options that may still be loading.
  const present = await locator
    .evaluate(
      (el, [v, f]) => {
        if (!(el instanceof HTMLSelectElement)) return null;
        const opts = Array.from(el.options);
        if (opts.some((o) => o.label.trim() === v)) return 'label';
        if (opts.some((o) => o.value === v)) return 'value';
        if (f && opts.some((o) => o.value === f)) return 'fallback';
        return null;
      },
      [value, fallbackValue ?? ''] as [string, string],
    )
    .catch(() => null);
  if (present === 'fallback') return locator.selectOption(fallbackValue!);
  if (present === 'value') return locator.selectOption(value);
  const result = await locator.selectOption({ label: value }).catch(() => null);
  if (result) return result;
  return locator.selectOption(value); // fall back to value/index matching
}

/**
 * Hover with synthetic mouse events for autocomplete/listbox widgets that key
 * off mouseenter rather than CSS :hover.
 */
export async function syntheticHover(locator: Locator): Promise<void> {
  await locator.hover().catch(() => {});
  await locator.evaluate((el) => {
    for (const type of ['pointerover', 'mouseover', 'mouseenter', 'mousemove']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: type !== 'mouseenter' }));
    }
  });
}

/**
 * Tools whose effect may be a navigation the app performs on the answer to a
 * request — or a second one after the first (an app that routes to a
 * placeholder id and then replaces it with the real one). Daemon replay waits
 * on the url after each of them before it reads the step's effect (tools.ts
 * runStep, for the state-changing ones); the artifact waits in the step's
 * settle phase. Both through `urlHeldStill` below.
 */
export const NAVIGATING_ACTIONS: readonly string[] = ['click', 'dblclick', 'press', 'submit', 'select'];

export function isNavigatingAction(tool: string): boolean {
  return NAVIGATING_ACTIONS.includes(tool);
}

/** How long a click's late navigation is given before its effect is captured as final. */
export const LATE_NAV_MS = 1_500;
/** A url that has not moved for this long, after moving, is where the step left the page. */
export const URL_STILL_MS = 500;
/**
 * How long "no request in flight" must hold before it means "no navigation
 * coming". Zero: the DOM settle that precedes this wait (≥250ms quiet) is the
 * grace, and a request the click started is already counted by then.
 */
export const LATE_NAV_GRACE_MS = 0;

/**
 * Requests in flight per page, so a runner can tell "the click did nothing"
 * from "the click asked the server and will route on the answer" without
 * waiting a fixed time for both. Counted from the page's own request events,
 * so a page never tracked reads as idle. The daemon starts counting when its
 * session adopts a page; the artifact when its first step settles.
 */
const inFlight = new WeakMap<Page, number>();

export function trackRequests(page: Page): void {
  // A minimal page (a test stub with only url/evaluate) has no request events: it reads as idle.
  if (inFlight.has(page) || typeof page.on !== 'function') return;
  inFlight.set(page, 0);
  const bump = (delta: number) => () => inFlight.set(page, Math.max(0, (inFlight.get(page) ?? 0) + delta));
  page.on('request', bump(1));
  page.on('requestfinished', bump(-1));
  page.on('requestfailed', bump(-1));
}

/** How many requests `page` has in flight right now (0 for a page not tracked). */
export function inFlightRequests(page: Page): number {
  return inFlight.get(page) ?? 0;
}

/**
 * Where a navigating tool left the url once it has held still. A late
 * navigation rides on a request the tool started, so a page with no request
 * in flight and the url it began on is not going anywhere: the wait ends
 * there rather than at the deadline. Set 30's zero-model replays ran at
 * twice set 28's wall clock because every non-navigating click sat out the
 * full LATE_NAV_MS (78 actions, ~30s of nothing on repairdesk).
 *
 * A url that moved and then moves AGAIN is followed: the value a step's
 * derived binding needs is on the url the step settles on, and a DOM settle
 * alone cannot see a redirect that changes nothing on the page first.
 */
export async function urlHeldStill(
  page: Pick<Page, 'url'>,
  beforeUrl: string,
  inFlightNow: () => number,
  timing: { lateNavMs?: number; stillMs?: number; graceMs?: number; pollMs?: number } = {},
): Promise<string> {
  const lateNavMs = timing.lateNavMs ?? LATE_NAV_MS;
  const stillMs = timing.stillMs ?? URL_STILL_MS;
  const graceMs = timing.graceMs ?? LATE_NAV_GRACE_MS;
  const pollMs = timing.pollMs ?? 100;
  const start = Date.now();
  const deadline = start + lateNavMs;
  let seen = page.url();
  let stillSince = start;
  // Check first, sleep after: the caller has already let the DOM settle, so
  // a request the click started is registered by now, and the common case
  // (a click that navigates nowhere) should cost nothing here.
  for (;;) {
    const now = page.url();
    if (now !== seen) {
      seen = now;
      stillSince = Date.now();
    } else if (now !== beforeUrl) {
      if (Date.now() - stillSince >= stillMs) break;
    } else if (Date.now() - start >= graceMs && inFlightNow() === 0) {
      break; // nothing asked of the server, so nothing to route on
    }
    if (Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return seen;
}

const SETTLE_QUIET_MS = 250;
const SETTLE_MAX_MS = 2_000;
/**
 * How long a page gets to show it is busy before it is called quiet. The
 * quiet window used to be the floor too — 250ms per step even on a static
 * page, ~20s across an 80-step replay that was otherwise at the engine's
 * floor. Now the full quiet window is demanded only once a mutation shows.
 */
const SETTLE_PROBE_MS = 60;

/** Resolve once no DOM mutation has happened for SETTLE_QUIET_MS, or after SETTLE_MAX_MS. */
export async function settleDom(page: Page): Promise<void> {
  try {
    await page.evaluate(
      ({ probe, quiet, max }) =>
        new Promise<void>((resolve) => {
          const finish = () => {
            observer.disconnect();
            clearTimeout(timer);
            clearTimeout(stop);
            resolve();
          };
          let timer = setTimeout(finish, probe);
          const stop = setTimeout(finish, max);
          const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(finish, quiet);
          });
          observer.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
        }),
      { probe: SETTLE_PROBE_MS, quiet: SETTLE_QUIET_MS, max: SETTLE_MAX_MS },
    );
  } catch {
    // navigating / detached — the locator resolution will report it
  }
}

