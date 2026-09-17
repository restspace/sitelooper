/**
 * One observation per action (ROBUSTNESS.md finding 6): begun BEFORE the
 * action dispatches, it owns the action's whole deadline, its baseline of the
 * page's traffic, and what it expects to see, and it says afterwards how the
 * action ended — not dispatched, dispatched, effect verified, or unknown.
 *
 * It replaces two request trackers that disagreed about what "busy" means
 * (every request since the page was adopted, in the old shared counter;
 * fetch/XHR minus paths NAMED like streams, in the daemon's settle). Traffic
 * is recorded once per page here, and whether a request is long-lived is
 * decided by what it does — its transport, its content type, a body that
 * keeps streaming, a request that was already open before the action, one
 * that has waited far longer than an answer takes — never by its url. An app
 * whose ordinary endpoint is called `/api/notifications` is waited for like
 * any other; an event stream on `/api/save` is not.
 *
 * Waiting is evidence, not a sleep: the DOM going quiet, requests the action
 * started landing, a request that starts in the moment after an input (a
 * debounced save), the url holding still after a navigating action, and the
 * expected effect when the caller has one. Completion is the expectation when
 * there is one; quiet alone never verifies an effect.
 *
 * Daemon: tools.ts runStep, around every state-changing tool. Artifact: the
 * emitted step, around its action. Self-contained: sibling shared modules and
 * Playwright types only. Every port (clock, page events, DOM) can be faked, so
 * the policy is tested without a browser or a wall clock.
 */
import type { Page } from 'playwright-core';
import { LATE_NAV_MS, domQuiet, outcomeOfError, urlHeldStill, type ActionOutcome, type DispatchVia } from './browser.js';

/**
 * What counts as an action's traffic, and when an open request stops being
 * something to wait for.
 *  - `countedTypes`: resource types an action can be waiting on. Images,
 *    fonts, media and beacons are recorded but never waited for.
 *  - `streamBodyMs`: a fetch/XHR whose headers arrived and whose body is
 *    still open this long later is streaming, not answering.
 *  - `longOpenMs`: a fetch/XHR open this long with no answer at all is a
 *    long-poll, not a save.
 *  - `recentMs`: a request started this long or less before the action began
 *    may still be the action's (a click handler's fetch races the click call
 *    returning); an older one still open is the page's own.
 */
export interface TrafficPolicy {
  countedTypes: readonly string[];
  streamBodyMs: number;
  longOpenMs: number;
  recentMs: number;
}

export const DEFAULT_TRAFFIC_POLICY: TrafficPolicy = {
  countedTypes: ['fetch', 'xhr', 'document', 'script'],
  streamBodyMs: 1_000,
  longOpenMs: 5_000,
  recentMs: 300,
};

/** Why an open request is not one an action waits for. */
export type LongLivedWhy = 'transport' | 'event-stream' | 'streaming-body' | 'open-at-baseline' | 'open-too-long' | 'known-long-poll';

/** One request as the page's traffic recorded it. Times are the traffic clock's. */
export interface RequestRecord {
  type: string;
  method: string;
  /** origin + pathname: the endpoint, without the query a poll varies. */
  endpoint: string;
  url: string;
  startedAt: number;
  responseAt?: number;
  contentType?: string;
  finishedAt?: number;
}

export interface ActionClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

/** The page events traffic is recorded from — a Playwright Page, or a fake. */
export interface PageEventsPort {
  on(event: string, listener: (arg: never) => void): unknown;
  off(event: string, listener: (arg: never) => void): unknown;
  url(): string;
  mainFrame?(): unknown;
}

/** The DOM as an action's observation asks it: go quiet within `maxMs`, and say when it last changed. */
export interface DomPort {
  quiet(quietMs: number, maxMs: number): Promise<{ mutated: boolean; lastMutationAt?: number }>;
  /**
   * What the page's live regions are announcing right now: the visible text of
   * every `aria-live` region and `status`/`alert` role. Optional — a port that
   * cannot say announces nothing, and the observation waits on nothing.
   */
  announced?(): Promise<string[]>;
}

/** An action's expected effect: true when it holds, false when it does not, null when it could not be observed. */
export interface ActionExpectation {
  holds(): Promise<boolean | null>;
}

/** One page's recorded traffic, installed once and shared by every action on that page. */
export interface PageTraffic {
  readonly policy: TrafficPolicy;
  readonly clock: ActionClock;
  /** Requests still open, in start order. */
  pending(): RequestRecord[];
  /** When a counted request last finished (-Infinity before any did). */
  lastFinish(): number;
  /** Endpoints (`METHOD origin/path`) that have behaved as long-polls or streams on this page. */
  readonly knownLongPoll: ReadonlySet<string>;
  /** classifyLongLived over this page's learned endpoints; learns the endpoint of a request that proves long-lived by behaviour. */
  classify(r: RequestRecord, now: number, baselineAt: number): LongLivedWhy | null;
  /** Called on every request, response, finish and main-frame navigation; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

const realClock: ActionClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms))),
};

/** The endpoint key a long-poll is remembered by. */
function endpointKey(r: Pick<RequestRecord, 'method' | 'endpoint'>): string {
  return `${r.method} ${r.endpoint}`;
}

/** Transports a poll or a stream rides on: the only ones judged by how long they stay open. */
function polling(r: RequestRecord): boolean {
  return r.type === 'fetch' || r.type === 'xhr';
}

/**
 * Whether an open request is long-lived, and why — in this order:
 *  1. a stream transport (`eventsource`, `websocket`);
 *  2. a response that says it streams (`text/event-stream`,
 *     `multipart/x-mixed-replace`);
 *  3. a fetch/XHR whose headers came and whose body has stayed open past
 *     `streamBodyMs`;
 *  4. a request older than the action (started more than `recentMs` before
 *     `baselineAt`) and still open at it: the page's, not the action's;
 *  5. a fetch/XHR open past `longOpenMs` with no answer;
 *  6. a fetch/XHR to an endpoint this page has already shown to be a
 *     long-poll or a stream (`known`).
 * Null: an ordinary request, whatever its url says.
 */
export function classifyLongLived(
  r: RequestRecord,
  now: number,
  baselineAt: number,
  policy: TrafficPolicy = DEFAULT_TRAFFIC_POLICY,
  known: ReadonlySet<string> = new Set(),
): LongLivedWhy | null {
  if (r.type === 'eventsource' || r.type === 'websocket') return 'transport';
  if (r.contentType && /^\s*(text\/event-stream|multipart\/x-mixed-replace)/i.test(r.contentType)) return 'event-stream';
  if (polling(r) && r.responseAt !== undefined && r.finishedAt === undefined && now - r.responseAt > policy.streamBodyMs) return 'streaming-body';
  if (r.startedAt < baselineAt - policy.recentMs && (r.finishedAt === undefined || r.finishedAt > baselineAt)) return 'open-at-baseline';
  if (polling(r) && r.responseAt === undefined && r.finishedAt === undefined && now - r.startedAt > policy.longOpenMs) return 'open-too-long';
  if (polling(r) && known.has(endpointKey(r))) return 'known-long-poll';
  return null;
}

const traffics = new WeakMap<object, PageTraffic>();

/** A Playwright request/response, as far as traffic reads one. */
interface RequestLike {
  resourceType(): string;
  method(): string;
  url(): string;
}
interface ResponseLike {
  request(): RequestLike;
  headers(): Record<string, string>;
}

/**
 * The page's traffic, recorded from its own request events: installed on the
 * first call for a page and returned as-is after that, so the daemon installs
 * it when its session adopts a page and every action (daemon or artifact)
 * reads the same record. A page with no request events (a test stub) reads as
 * idle. `opts` apply only to the call that installs it.
 */
export function pageTraffic(page: Page | PageEventsPort, opts: { policy?: TrafficPolicy; clock?: ActionClock } = {}): PageTraffic {
  const port = page as unknown as PageEventsPort;
  const existing = traffics.get(port);
  if (existing) return existing;
  const policy = opts.policy ?? DEFAULT_TRAFFIC_POLICY;
  const clock = opts.clock ?? realClock;
  const open = new Map<unknown, RequestRecord>();
  const known: Set<string> = new Set();
  const listeners = new Set<() => void>();
  let lastFinish = -Infinity;
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  // A request that proved long-lived by what it did is remembered by its
  // endpoint, so the next poll to it is not waited out for `longOpenMs` again.
  // Only the behavioural rules teach: a request that was merely open before an
  // action says nothing about its endpoint.
  const learn = (r: RequestRecord, why: LongLivedWhy | null) => {
    if (polling(r) && (why === 'event-stream' || why === 'streaming-body' || why === 'open-too-long')) known.add(endpointKey(r));
  };
  const traffic: PageTraffic = {
    policy,
    clock,
    pending: () => [...open.values()],
    lastFinish: () => lastFinish,
    knownLongPoll: known,
    classify: (r, now, baselineAt) => {
      const why = classifyLongLived(r, now, baselineAt, policy, known);
      learn(r, why);
      return why;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  traffics.set(port, traffic);
  if (typeof port.on !== 'function') return traffic;
  port.on('request', (req: RequestLike) => {
    let url = '';
    let endpoint = '';
    try {
      url = req.url();
      const parsed = new URL(url);
      endpoint = `${parsed.origin}${parsed.pathname}`;
    } catch {
      endpoint = url;
    }
    open.set(req, { type: req.resourceType(), method: req.method(), endpoint, url, startedAt: clock.now() });
    notify();
  });
  port.on('response', (res: ResponseLike) => {
    const r = open.get(res.request());
    if (!r) return;
    // Judged once as it stood unanswered (a long-poll's wait), then as answered.
    const now = clock.now();
    learn(r, classifyLongLived(r, now, -Infinity, policy));
    r.responseAt = now;
    try {
      r.contentType = res.headers()['content-type'];
    } catch {
      // headers unreadable: judged by behaviour alone
    }
    learn(r, classifyLongLived(r, r.responseAt, -Infinity, policy));
    notify();
  });
  const done = (req: unknown) => {
    const r = open.get(req);
    if (!r) return;
    open.delete(req);
    const now = clock.now();
    // Judged at the moment before it finished: a body that streamed for
    // seconds, or an answer that took a long-poll's time, taught something.
    learn(r, classifyLongLived(r, now, -Infinity, policy));
    r.finishedAt = now;
    if (policy.countedTypes.includes(r.type)) lastFinish = now;
    notify();
  };
  port.on('requestfinished', done);
  port.on('requestfailed', done);
  // A navigation abandons the old document's requests; without this a stale
  // entry would hold the next action to its cap.
  port.on('framenavigated', (frame: unknown) => {
    if (typeof port.mainFrame === 'function' && frame !== port.mainFrame()) return;
    for (const [req, r] of open) if (r.type !== 'document') open.delete(req);
    notify();
  });
  return traffic;
}

/**
 * How many ordinary requests `page` has in flight: counted types, not
 * long-lived by behaviour. 0 for a page whose traffic was never installed.
 */
export function inFlightRequests(page: Page | PageEventsPort): number {
  const traffic = traffics.get(page as unknown as object);
  if (!traffic) return 0;
  const now = traffic.clock.now();
  return traffic.pending().filter((r) => traffic.policy.countedTypes.includes(r.type) && traffic.classify(r, now, -Infinity) === null).length;
}

export interface ActionOptions {
  /** The whole action — dispatch, every wait, the effect — ends by this long after beginAction. */
  deadlineMs: number;
  /** When given, completion: polled after the page settles, within `effectWaitMs`. */
  expect?: ActionExpectation;
  /** A tool whose effect may be a navigation: the url is waited on to hold still (urlHeldStill). */
  navigating?: boolean;
  /**
   * An input (fill, type, press, select, check): the start grace runs from
   * the dispatch itself, because an input's own save is commonly debounced
   * and changes nothing on the page before it asks. Otherwise the grace runs
   * only from a mutation or a request finishing.
   */
  graceFromDispatch?: boolean;
  /** How long after the last evidence a request may still start and be the action's. */
  startGraceMs?: number;
  /** The most one network wait may cost. */
  networkCapMs?: number;
  /** The most the expected effect is polled for. */
  effectWaitMs?: number;
  clock?: ActionClock;
  dom?: DomPort;
  policy?: TrafficPolicy;
}

/** How an action ended, and what its settle waited on. */
export interface SettleVerdict {
  outcome: ActionOutcome;
  /** Where the page is once the action settled. */
  url: string;
  via?: DispatchVia;
  waited: { domMs: number; networkMs: number; urlMs: number; effectMs: number };
  /** Open requests that were not waited for, and why. */
  ignored: { url: string; why: LongLivedWhy }[];
  /** A wait was cut short by the action's deadline. */
  deadlineHit: boolean;
}

export interface ActionObservation {
  /** Milliseconds left of the action's deadline (never negative). */
  remaining(): number;
  /** The action went out, this way. */
  dispatched(via: DispatchVia): void;
  /** The action threw: its outcome is what the error proves (outcomeOfError), and the error is rethrown. */
  failed(err: unknown): never;
  /** Wait for the action's evidence; the same promise on a second call. */
  settle(): Promise<SettleVerdict>;
  /** Stop every wait now and release what the observation subscribed to. */
  cancel(): void;
}

/** DOM quiet window an action's settle demands once a mutation shows (settleDom's). */
export const ACTION_QUIET_MS = 250;
/** The most one DOM settle may cost inside an action (settleDom's). */
export const ACTION_DOM_MAX_MS = 2_000;
/** How long after the last evidence a request may start and still be the action's. */
export const ACTION_START_GRACE_MS = 250;
/** The most one network wait may cost (the old settlePage deadline). */
export const ACTION_NETWORK_CAP_MS = 2_000;
/** The most an expected effect is polled for once the page has settled. */
export const ACTION_EFFECT_WAIT_MS = 3_000;
/** How often an expected effect is asked again while nothing else is happening. */
export const ACTION_EFFECT_POLL_MS = 100;
/** Settle rounds (DOM, network, grace) before the observation stops looking for more. */
const MAX_SETTLE_ROUNDS = 8;
/**
 * The most an action waits, in total, on an announcement it raised.
 *
 * A LIVE REGION THE ACTION LIT IS THE PAGE'S OWN WORD THAT IT IS BUSY. The
 * bench app confirms a delete, closes the dialog, announces "Refreshing…" in
 * its polite region and repaints the table 600ms later; the recording model
 * read the announcement and waited, the replay did not. Its DOM went quiet
 * at once, no request was open, the 250ms start grace passed with nothing,
 * and the next step's Delete click landed on the row the first delete had
 * just removed — the confirm then deleted that part again and the app
 * answered "No such part: p18" (fwrd69, both replays, the pin demoted).
 *
 * So an announcement that appeared after the dispatch and is still showing
 * holds the settle: when it is withdrawn or replaced the page has moved, and
 * the round starts over — the repaint's request and mutations are then the
 * action's, as they always were. Bounded, because an announcement can be a
 * message that stays ("Saved."): the wait costs at most this once, and the
 * text is never read for what it says. Evidence, not a sleep, and not a
 * string rule: the region's role is what makes it a promise.
 */
export const ACTION_ANNOUNCE_WAIT_MS = 2_000;
/** How often a standing announcement is looked at again. */
const ACTION_ANNOUNCE_POLL_MS = 100;

/** The page's own DOM, through the shared settle: the load event first, then quiet. */
function pageDom(page: Page, clock: ActionClock): DomPort {
  return {
    quiet: async (quietMs, maxMs) => {
      const started = clock.now();
      if (typeof page.waitForLoadState === 'function') {
        await page.waitForLoadState('domcontentloaded', { timeout: Math.max(1, maxMs) }).catch(() => {});
      }
      const left = maxMs - (clock.now() - started);
      if (left <= 0) return { mutated: false };
      const seen = await domQuiet(page, { quietMs, maxMs: left });
      return seen && seen.mutated ? { mutated: true, lastMutationAt: clock.now() - seen.sinceMs } : { mutated: false };
    },
    announced: async () => {
      try {
        return await page.evaluate(() => {
          const out: string[] = [];
          const regions = document.querySelectorAll('[aria-live="polite"], [aria-live="assertive"], [role="status"], [role="alert"]');
          for (const el of Array.from(regions)) {
            const h = el as HTMLElement;
            if (!h.getClientRects().length) continue; // not rendered: nothing announced to a reader either
            const text = (h.textContent ?? '').replace(/\s+/g, ' ').trim();
            if (text) out.push(text);
          }
          return out;
        });
      } catch {
        return []; // navigating / detached — the round's other evidence decides
      }
    },
  };
}

/**
 * Begin observing an action. Call it BEFORE the action dispatches — the
 * baseline is this moment, and a request the action starts must not be
 * mistaken for one that was already open — then dispatch, then `settle()`.
 * A page opener's popup listener (context.ts armPageEffect) is armed before
 * this too; the two share nothing but the moment.
 */
export function beginAction(page: Page, opts: ActionOptions): ActionObservation {
  const clock = opts.clock ?? realClock;
  const port = page as unknown as PageEventsPort;
  const traffic = pageTraffic(port, { policy: opts.policy, clock });
  const policy = traffic.policy;
  const dom = opts.dom ?? pageDom(page, clock);
  const baselineAt = clock.now();
  const deadline = baselineAt + opts.deadlineMs;
  const startGraceMs = opts.startGraceMs ?? ACTION_START_GRACE_MS;
  const networkCapMs = opts.networkCapMs ?? ACTION_NETWORK_CAP_MS;
  const effectWaitMs = opts.effectWaitMs ?? ACTION_EFFECT_WAIT_MS;
  const readUrl = () => {
    try {
      return port.url();
    } catch {
      return '';
    }
  };
  const urlBefore = readUrl();
  // What the live regions already said before the action: only NEW text is
  // the action's announcement. Taken now, ahead of the dispatch; a port that
  // cannot say leaves the set empty and the announcement wait inert.
  const baselineAnnounced: Set<string> = new Set();
  const baselineTaken = dom.announced
    ? dom.announced().then((texts) => { for (const t of texts) baselineAnnounced.add(t); }, () => {})
    : Promise.resolve();
  let via: DispatchVia | undefined;
  let dispatchedAt: number | undefined;
  let failedOutcome: 'not-dispatched' | 'unknown' | undefined;
  let cancelled = false;
  let settling: Promise<SettleVerdict> | null = null;
  const wakers = new Set<() => void>();
  const remaining = () => Math.max(0, deadline - clock.now());

  // A wait that ends at `ms`, at the next traffic event, or on cancel —
  // whichever is first. The event is only a reason to look again.
  const wake = (ms: number) =>
    new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        unsubscribe();
        wakers.delete(finish);
        resolve();
      };
      const unsubscribe = traffic.subscribe(finish);
      wakers.add(finish);
      void clock.sleep(Math.max(1, ms)).then(finish);
    });

  const run = async (): Promise<SettleVerdict> => {
    await baselineTaken;
    const waited = { domMs: 0, networkMs: 0, urlMs: 0, effectMs: 0 };
    const ignored = new Map<RequestRecord, LongLivedWhy>();
    let deadlineHit = false;
    let lastMutationAt = -Infinity;
    const dispatchEnd = dispatchedAt ?? clock.now();

    // Open requests this action waits for: counted types, not long-lived.
    const relevant = (): RequestRecord[] => {
      const now = clock.now();
      const out: RequestRecord[] = [];
      for (const r of traffic.pending()) {
        if (!policy.countedTypes.includes(r.type)) continue;
        const why = traffic.classify(r, now, baselineAt);
        if (why) ignored.set(r, why);
        else out.push(r);
      }
      return out;
    };

    const quietDom = async () => {
      if (cancelled) return;
      const left = remaining();
      const budget = Math.min(ACTION_DOM_MAX_MS, left);
      if (budget <= 0) {
        deadlineHit = true;
        return;
      }
      const started = clock.now();
      const seen = await dom.quiet(ACTION_QUIET_MS, budget).catch(() => ({ mutated: false, lastMutationAt: undefined }));
      const took = clock.now() - started;
      waited.domMs += took;
      if (seen.mutated && seen.lastMutationAt !== undefined) lastMutationAt = Math.max(lastMutationAt, seen.lastMutationAt);
      if (left < ACTION_DOM_MAX_MS && took >= budget) deadlineHit = true;
    };

    // Wait while a request the action may be waiting on is open. Woken by any
    // traffic event, and by a timer at the moment the earliest open request
    // would turn long-lived, so a stream is let go as soon as it shows itself.
    // `networkCapMs` is ONE budget for the whole settle, not per wait: an app
    // that never stops asking costs it once. 'capped': requests were still
    // open when the budget or the deadline ran out.
    let networkSpent = 0;
    const waitNetwork = async (): Promise<'idle' | 'waited' | 'capped'> => {
      const started = clock.now();
      const capEnd = started + Math.max(0, networkCapMs - networkSpent);
      let state: 'idle' | 'waited' | 'capped' = 'idle';
      for (;;) {
        if (cancelled) break;
        const open = relevant();
        if (!open.length) break;
        const now = clock.now();
        const end = Math.min(capEnd, deadline);
        if (now >= end) {
          if (deadline <= capEnd) deadlineHit = true;
          state = 'capped';
          break;
        }
        let next = end;
        for (const r of open) {
          if (!polling(r)) continue;
          next = Math.min(next, r.responseAt !== undefined ? r.responseAt + policy.streamBodyMs + 1 : r.startedAt + policy.longOpenMs + 1);
        }
        await wake(next - now);
        state = 'waited';
      }
      const took = clock.now() - started;
      networkSpent += took;
      waited.networkMs += took;
      return state;
    };

    // The debounce: shortly after the last evidence (a mutation, a request
    // landing, or — for an input — the dispatch itself) a request may still
    // start and be the action's. Wait out what is left of that grace for one;
    // true when one started.
    const graceStart = async (): Promise<boolean> => {
      const finished = traffic.lastFinish();
      const anchor = Math.max(lastMutationAt, finished >= baselineAt ? finished : -Infinity, opts.graceFromDispatch ? dispatchEnd : -Infinity);
      const started = clock.now();
      let startedOne = false;
      for (;;) {
        if (cancelled) break;
        if (relevant().length) {
          startedOne = true;
          break;
        }
        const left = Math.min(anchor + startGraceMs - clock.now(), remaining());
        if (left <= 0) break;
        await wake(left);
      }
      waited.networkMs += clock.now() - started;
      return startedOne;
    };

    // An announcement the action raised (see ACTION_ANNOUNCE_WAIT_MS): a live
    // region showing text it did not show at the baseline. Held until it is
    // withdrawn or replaced, at most the budget once for the whole settle.
    let announceSpent = 0;
    const holdAnnouncement = async (): Promise<boolean> => {
      if (!dom.announced) return false;
      const started = clock.now();
      let moved = false;
      for (;;) {
        if (cancelled) break;
        const now = clock.now();
        const raised = (await dom.announced().catch(() => [] as string[])).filter((t) => !baselineAnnounced.has(t));
        if (!raised.length) break;
        const left = Math.min(ACTION_ANNOUNCE_WAIT_MS - announceSpent - (now - started), remaining());
        if (left <= 0) break;
        await clock.sleep(Math.min(ACTION_ANNOUNCE_POLL_MS, left));
        moved = true;
      }
      const took = clock.now() - started;
      announceSpent += took;
      waited.domMs += took;
      return moved;
    };

    for (let round = 0; round < MAX_SETTLE_ROUNDS && !cancelled && remaining() > 0; round++) {
      await quietDom();
      const network = await waitNetwork();
      if (network === 'capped') break;
      // An answer landed: let the DOM take it, then look again.
      if (network === 'waited') continue;
      if (await graceStart()) continue;
      // The page said it was busy and has since moved on: look again.
      if (await holdAnnouncement()) continue;
      break;
    }

    if (opts.navigating && !cancelled) {
      const started = clock.now();
      const lateNavMs = Math.min(LATE_NAV_MS, remaining());
      const settledUrl = readUrl();
      const seen = await urlHeldStill(port, urlBefore, () => relevant().length, { lateNavMs });
      waited.urlMs += clock.now() - started;
      if (lateNavMs < LATE_NAV_MS && clock.now() - started >= lateNavMs) deadlineHit = true;
      if (seen !== settledUrl) {
        await quietDom();
        await waitNetwork();
      }
    }

    let verified = false;
    let observed = false;
    if (opts.expect && !cancelled) {
      const started = clock.now();
      const end = Math.min(started + effectWaitMs, deadline);
      for (;;) {
        const holds = await opts.expect.holds().catch(() => null);
        if (holds === true) {
          verified = true;
          observed = true;
          break;
        }
        if (holds === false) observed = true;
        if (cancelled) break;
        const now = clock.now();
        if (now >= end) {
          if (deadline < started + effectWaitMs) deadlineHit = true;
          break;
        }
        // Traffic still open is the effect still on its way: wait on it
        // (within what is left of the network budget) rather than on the clock.
        if (relevant().length && (await waitNetwork()) === 'waited') {
          await quietDom();
          continue;
        }
        await clock.sleep(Math.min(ACTION_EFFECT_POLL_MS, end - now));
      }
      waited.effectMs += clock.now() - started;
    }

    const outcome: ActionOutcome = failedOutcome ?? (verified ? 'effect-verified' : opts.expect && !observed ? 'unknown' : 'dispatched');
    return {
      outcome,
      url: readUrl(),
      ...(via ? { via } : {}),
      waited,
      ignored: [...ignored].map(([r, why]) => ({ url: r.url, why })),
      deadlineHit,
    };
  };

  return {
    remaining,
    dispatched: (how) => {
      via ??= how;
      dispatchedAt ??= clock.now();
    },
    failed: (err) => {
      failedOutcome = outcomeOfError(err);
      throw err;
    },
    settle: () => (settling ??= run()),
    cancel: () => {
      cancelled = true;
      for (const finish of [...wakers]) finish();
    },
  };
}
