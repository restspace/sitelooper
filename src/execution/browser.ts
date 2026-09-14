import type { Locator, Page } from 'playwright-core';

/** Browser execution shared by replay and the standalone spec bundle. */

/**
 * What is known about an action once it has been attempted (ROBUSTNESS.md
 * finding 2). The four are different facts, and every caller that decides
 * whether something may be tried again needs to tell them apart:
 *  - `not-dispatched`: there is PROOF nothing reached the app (Playwright's
 *    actionability wait gave up before the pointer event, the control is
 *    disabled, the deadline ran out before a tier began). Another attempt
 *    repeats nothing.
 *  - `dispatched`: the action went out; whether it had its effect is for the
 *    effect gates to say.
 *  - `effect-verified`: it went out and its expected effect was seen.
 *  - `unknown`: it may or may not have reached the app (the page was torn down
 *    under it, or the failure carries no proof either way). Never repeat it.
 *
 * Carried on the error a failed action throws (`actionFailure`), never parsed
 * out of its words: the message is written for a model and a person, and is
 * free to change.
 */
export type ActionOutcome = 'not-dispatched' | 'dispatched' | 'effect-verified' | 'unknown';

/** Which way a dispatched action went out. */
export type DispatchVia = 'actionable' | 'forced' | 'synthetic' | 'rerender-window' | 'native';

/** Why an action failed, for a caller that wants more than its outcome. */
export type ActionFailureReason = 'disabled' | 'teardown' | 'strict' | 'never-attached' | 'rerender' | 'timeout' | 'deadline';

/** An error that says what is known about the action that threw it. */
export interface ActionFailure extends Error {
  actionOutcome: 'not-dispatched' | 'unknown';
  actionReason: ActionFailureReason;
}

/**
 * Tag a failure with its outcome. Given an Error, that same object is tagged
 * and returned — a caller that compares identity (or reads Playwright's own
 * message) sees the error it would have seen untagged.
 */
export function actionFailure(outcome: 'not-dispatched' | 'unknown', reason: ActionFailureReason, error: string | Error): ActionFailure {
  const failure = (typeof error === 'string' ? new Error(error) : error) as ActionFailure;
  failure.actionOutcome = outcome;
  failure.actionReason = reason;
  return failure;
}

/**
 * The outcome a thrown error establishes. Only a tagged failure can say
 * `not-dispatched`: anything else carries no proof that nothing happened, so
 * it is `unknown`, the direction that never repeats an action.
 */
export function outcomeOfError(err: unknown): 'not-dispatched' | 'unknown' {
  const tagged = err && typeof err === 'object' ? (err as Partial<ActionFailure>).actionOutcome : undefined;
  return tagged === 'not-dispatched' ? 'not-dispatched' : 'unknown';
}

/** The outcome as it reads beside a failure: `[outcome: not dispatched]`. */
export function outcomeLabel(outcome: ActionOutcome): string {
  return `[outcome: ${outcome.replace(/-/g, ' ')}]`;
}

/**
 * What a click is told about the action it belongs to (src/execution/action.ts
 * `beginAction`): how much of the action's deadline is left, which clamps every
 * tier, and where to report the way the click went out.
 */
export interface ClickObservation {
  remaining(): number;
  dispatched?(via: DispatchVia): void;
}

type ClickOpts = { timeout: number; dbl?: boolean; obs?: ClickObservation };
type ClickAct = (o: { timeout: number; force?: boolean }) => Promise<void>;

/**
 * One way to land a click. `note` is appended to the result so the agent (and
 * a post-mortem) can see which tier did the work.
 */
interface ClickTier {
  note: string;
  via: DispatchVia;
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
  { note: '', via: 'actionable', run: (_loc, opts, act) => act({ timeout: opts.timeout }) },
  // Scroll into view and skip the checks: a control under a sticky header,
  // or one an overlay covers in a way the app treats as fine.
  {
    note: ' (forced past actionability checks)',
    via: 'forced',
    run: async (loc, opts, act) => {
      await loc.scrollIntoViewIfNeeded({ timeout: opts.timeout }).catch(() => {});
      await act({ timeout: opts.timeout, force: true });
    },
  },
  // A synthetic event straight at the element: React's delegated handlers see
  // it even when the element is not "clickable" by Playwright's rules.
  { note: ' (dispatched DOM event — element was not normally clickable)', via: 'synthetic', run: (loc, opts) => loc.evaluate(fireClick, Boolean(opts.dbl), { timeout: opts.timeout }) },
];

/**
 * The budget one tier (or the window tier) may spend: its own timeout, cut to
 * what is left of the action's deadline. Never 0 — Playwright reads a zero
 * timeout as "no timeout" — so a spent deadline is reported by the caller
 * before the tier starts, not passed down.
 */
function tierBudget(opts: ClickOpts): number {
  const left = opts.obs ? Math.floor(opts.obs.remaining()) : Infinity;
  return Math.min(opts.timeout, left);
}

/** The refusal for a deadline that ran out before the next way of clicking could start: nothing was dispatched. */
function deadlineSpent(label: string, because: string): ActionFailure {
  const cause = because ? ` (after: ${because.split('\n')[0].slice(0, 120)})` : '';
  return actionFailure(
    'not-dispatched',
    'deadline',
    `${label === 'clicked' ? 'click' : 'double-click'} NOT dispatched: the action's deadline ran out before the control could be clicked${cause}. Observe the page — something it was waiting on (an overlay, a load) never finished.`,
  );
}

export async function robustClick(loc: Locator, opts: ClickOpts): Promise<string> {
  const label = opts.dbl ? 'double-clicked' : 'clicked';
  const act: ClickAct = (o) => (opts.dbl ? loc.dblclick(o) : loc.click(o));
  let firstFailure = '';
  for (const tier of CLICK_TIERS) {
    // Every tier before this one failed in a way that proves nothing went out
    // (the throws below end the loop otherwise), so a deadline spent here is
    // a click that was never dispatched.
    const budget = tierBudget(opts);
    if (budget < 1) throw deadlineSpent(label, firstFailure);
    try {
      await tier.run(loc, { ...opts, timeout: budget }, act);
      opts.obs?.dispatched?.(tier.via);
      return `${label}${tier.note}`;
    } catch (err) {
      const failure = err instanceof Error ? err.message : String(err);
      firstFailure ||= failure;
      // Two or more matches is the agent's problem to fix, not a tier's.
      if (/strict mode violation/i.test(failure)) throw err instanceof Error ? actionFailure('not-dispatched', 'strict', err) : err;
      // A DISABLED control refused the click by design, and the tiers below
      // do not get past that: a forced click on a disabled button dispatches
      // nothing the app handles, yet returned "clicked (forced past
      // actionability checks)". Asked only once Playwright's own click has
      // failed, so an ordinary click costs nothing extra; an element that
      // cannot be asked (gone, re-rendering) goes on down the tiers as before.
      if (tier === CLICK_TIERS[0] && (await loc.isDisabled({ timeout: DISABLED_PROBE_MS }).catch(() => false))) {
        throw actionFailure(
          'not-dispatched',
          'disabled',
          `${label === 'clicked' ? 'click' : 'double-click'} NOT dispatched: the control is disabled, so the app would ignore it. ` +
            'Make whatever enables it true first (a required field, a selection, a finished load), then click it.',
        );
      }
      // The page went out from under the click. Whether it landed is unknown,
      // so no further tier may fire: see UNCERTAIN_DISPATCH.
      if (UNCERTAIN_DISPATCH.test(failure)) {
        throw actionFailure(
          'unknown',
          'teardown',
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
export async function fireWhenAttached(loc: Locator, opts: ClickOpts, label = 'clicked', because = ''): Promise<string> {
  // The first line of the failure that sent us here rides along in the
  // result, so a post-mortem can see WHY a click took this route.
  const cause = because ? ` after: ${because.split('\n')[0].slice(0, 120)}` : '';
  // Cut to the action's deadline like every tier before it; one already spent
  // means no window was ever tried.
  const budget = tierBudget(opts);
  if (budget < 1) throw deadlineSpent(label, because);
  const deadline = Date.now() + budget;
  let polls = 0;
  let attached = 0;
  while (Date.now() < deadline) {
    polls++;
    const handle = await loc.elementHandle({ timeout: 100 }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof Error && /strict mode violation/i.test(message)) throw actionFailure('not-dispatched', 'strict', err);
      if (err instanceof Error && UNCERTAIN_DISPATCH.test(message)) throw actionFailure('unknown', 'teardown', err);
      if (/strict mode violation/i.test(message) || UNCERTAIN_DISPATCH.test(message)) throw err;
      return null;
    });
    if (handle) {
      attached++;
      try {
        await handle.evaluate(fireClick, Boolean(opts.dbl));
        opts.obs?.dispatched?.('rerender-window');
        return `${label} (dispatched during a re-render window${cause} — the element re-mounts continuously, so a normal click could not land; if the app did not respond, it may need a keyboard route or a wait_for on the state that settles it)`;
      } catch (err) {
        // The element going again between resolve and fire is the ordinary
        // case: nothing was dispatched, so the next window is safe. A context
        // that was DESTROYED is not — the click may have landed and navigated
        // the page, and polling on would fire it a second time.
        const message = err instanceof Error ? err.message : String(err);
        if (UNCERTAIN_DISPATCH.test(message)) {
          throw actionFailure(
            'unknown',
            'teardown',
            `${label === 'clicked' ? 'click' : 'double-click'} outcome UNKNOWN: dispatched into a page that was being torn down (${message.split('\n')[0].slice(0, 160)}). It may already have taken effect. Do not repeat it — observe the app's state and continue from what you find.`,
          );
        }
      } finally {
        await handle.dispose().catch(() => {});
      }
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  // Every window either never came or was gone before the event fired: nothing went out.
  throw actionFailure(
    'not-dispatched',
    attached ? 'rerender' : 'never-attached',
    attached
      ? `target re-rendered continuously: attached on ${attached} of ${polls} polls but never long enough to click. The app re-mounts it on every render. Do not repeat this click — wait_for an element that appears once the state settles, or drive it by keyboard (focus a stable neighbour, Tab to it, press Enter).`
      : `target was never attached during ${Math.round(budget / 1000)}s of polling after an initial detach — it was removed by a re-render. Re-snapshot and locate it afresh rather than repeating this click.`,
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

/**
 * The window a session records in when it is given no other: `--viewport` and
 * `--device` choose another (daemon/browser.ts `resolveBrowserProfile`).
 */
export const RECORDING_VIEWPORT = { width: 1280, height: 900 } as const;

/**
 * The browser a flow was recorded in: its window, and for an emulated device
 * the rest of what Playwright's device descriptor sets. Stored on the flow
 * (`Flow.browser`), carried into the compiled artifact (`RECORDED_BROWSER`),
 * and judged at run time by `profileMismatch`.
 *
 * WHY IT TRAVELS. A page's layout is part of what a recording captured: a
 * `point` candidate is coordinates in this window, and an app that lays out by
 * size (Odoo's list columns and form panes, a responsive nav that becomes a
 * menu button) renders a different page in another one — a different
 * procedure, not merely different pixels. Playwright Test's default window is
 * 1280×720, and fwod39's compiled spec ran there: its 02-create reads found
 * nothing, a click fell to a point candidate, and 03-open resolved no quantity
 * input — steps daemon replay ran cleanly twice at 1280×900. A mobile flow is
 * the same problem from the other side, and a desktop default would override
 * the device a caller's project configured to exercise it.
 *
 * `device` is the Playwright device name it was resolved from, for people;
 * the other fields are what was applied. Chromium only: a descriptor's
 * `defaultBrowserType` (webkit, for iPhones) is not honoured.
 */
export interface BrowserProfile {
  device?: string;
  viewport: { width: number; height: number };
  deviceScaleFactor?: number;
  isMobile?: boolean;
  hasTouch?: boolean;
  userAgent?: string;
}

/** What a flow recorded before profiles were stored was recorded in. */
export const DEFAULT_BROWSER_PROFILE: BrowserProfile = { viewport: { ...RECORDING_VIEWPORT } };

/** What a runner can observe of the browser it was handed. `null` viewport: the page has none (it follows the window). */
export interface LiveBrowser {
  viewport: { width: number; height: number } | null;
  userAgent?: string;
  hasTouch?: boolean;
}

/**
 * The device facts profileMismatch compares, read off the live page the same
 * way by both runners. A page that cannot be evaluated yet (about:blank before
 * the first navigation evaluates fine; a crashed one does not) gives only its
 * size, and the facts it could not read are not compared.
 */
export async function readLiveBrowser(page: Pick<Page, 'viewportSize' | 'evaluate'>): Promise<LiveBrowser> {
  const facts = await page
    .evaluate(() => ({ userAgent: navigator.userAgent, hasTouch: navigator.maxTouchPoints > 0 }))
    .catch(() => ({}));
  return { viewport: page.viewportSize(), ...facts };
}

/**
 * Why the browser a flow is about to run in is not the one it was recorded in,
 * or null when it is. Width and height, the user agent and touch support are
 * compared — the device facts a page can act on; scale factor and `isMobile`
 * cannot be read back from a page and are applied, never judged. A field the
 * recording did not set is not compared.
 *
 * Both runners warn with it and neither refuses: a flow run at another size
 * may still work (role and text candidates survive most reflows), and when it
 * does not, the failure then says why.
 */
export function profileMismatch(recorded: BrowserProfile, live: LiveBrowser): string | null {
  const diffs: string[] = [];
  const size = (v: { width: number; height: number }) => `${v.width}x${v.height}`;
  if (live.viewport && (live.viewport.width !== recorded.viewport.width || live.viewport.height !== recorded.viewport.height)) {
    diffs.push(`window ${size(live.viewport)} (recorded ${size(recorded.viewport)})`);
  }
  if (recorded.userAgent !== undefined && live.userAgent !== undefined && live.userAgent !== recorded.userAgent) {
    diffs.push('a different user agent');
  }
  if (recorded.hasTouch !== undefined && live.hasTouch !== undefined && live.hasTouch !== recorded.hasTouch) {
    diffs.push(live.hasTouch ? 'touch input (recorded without)' : 'no touch input (recorded with)');
  }
  if (!diffs.length) return null;
  const was = recorded.device ? ` on ${recorded.device}` : '';
  return `the browser has ${diffs.join(', ')} — the flow was recorded${was} at ${size(recorded.viewport)}, and locators that depend on layout may not hold`;
}

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

/** Resolve once no DOM mutation has happened for SETTLE_QUIET_MS, or after `maxMs` (SETTLE_MAX_MS). */
export async function settleDom(page: Page, maxMs: number = SETTLE_MAX_MS): Promise<void> {
  await domQuiet(page, { maxMs });
}

/**
 * settleDom that says what it saw: whether the DOM mutated at all while it
 * watched, and how long before it returned the last mutation was. An action's
 * observation (src/execution/action.ts) reads the second as evidence — a page
 * that changed a moment ago may be about to ask the server for something.
 * Null when the page could not be evaluated (navigating, detached, closed).
 */
export async function domQuiet(
  page: Page,
  timing: { probeMs?: number; quietMs?: number; maxMs?: number } = {},
): Promise<{ mutated: boolean; sinceMs: number } | null> {
  try {
    return await page.evaluate(
      ({ probe, quiet, max }) =>
        new Promise<{ mutated: boolean; sinceMs: number }>((resolve) => {
          let last = 0;
          const finish = () => {
            observer.disconnect();
            clearTimeout(timer);
            clearTimeout(stop);
            resolve({ mutated: last > 0, sinceMs: last > 0 ? Date.now() - last : 0 });
          };
          let timer = setTimeout(finish, probe);
          const stop = setTimeout(finish, max);
          const observer = new MutationObserver(() => {
            last = Date.now();
            clearTimeout(timer);
            timer = setTimeout(finish, quiet);
          });
          observer.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
        }),
      { probe: timing.probeMs ?? SETTLE_PROBE_MS, quiet: timing.quietMs ?? SETTLE_QUIET_MS, max: timing.maxMs ?? SETTLE_MAX_MS },
    );
  } catch {
    // navigating / detached — the locator resolution will report it
    return null;
  }
}

