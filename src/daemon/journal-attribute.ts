/**
 * Causal attribution for the recorder journal (design-recorder-evidence §2.3).
 * Pure: windows and events in, each event with ONE cause out. Shadow mode: the
 * causes are recorded on the step and read only by the shadow report
 * (skills/shadow.ts); nothing that replays, compiles or exports reads them.
 *
 * The rules, first match wins:
 *   1. inside a gesture or eval window            → ['in', w, kind]
 *   2. a hide of a landmark some window showed     → ['undo', w, blur|req|timer]
 *   3. after a request a window caused (300 ms)    → ['late', w, 'req']
 *   4. a request or url change soon after an input → ['late', w, 'debounce']
 *   5. a new page after the last gesture on it     → ['late', w, 'page']
 *   6. a request to an endpoint the app polls      → ['app', 'poll'] (and what it answers)
 *   7. inside a daemon or observation window        → ['daemon', w] / ['in', w, 'observe']
 *   8. otherwise                                    → ['unknown']
 * An event that another window could also have caused (an overlap) carries
 * `also`: every consumer must treat it as ambiguous, never as a fact.
 */

export type WindowKind = 'gesture' | 'eval' | 'observe' | 'daemon';

export type Cause =
  | ['in', number, WindowKind]
  | ['late', number, 'req' | 'debounce' | 'page']
  | ['undo', number, 'blur' | 'req' | 'timer']
  | ['app', 'poll' | 'timer' | 'req']
  | ['daemon', number]
  | ['unknown'];

export interface JournalWindow {
  w: number;
  kind: WindowKind;
  tool: string;
  start: number;
  /** Absent while the window is still open. */
  end?: number;
  /** An input tool (fill, type, press, select, check): its app may debounce a request after it. */
  input?: boolean;
}

/** One journal event. `t` is epoch ms; the other fields depend on `k`. */
export interface JournalEvent {
  t: number;
  k: 'req' | 'nav' | 'page+' | 'page-' | 'dlg' | 'show' | 'hide' | 'txt' | 'state' | 'val' | 'foc' | 'hit';
  c?: Cause;
  /** Another window that could equally have caused it. */
  also?: number;
  [field: string]: unknown;
}

/** Slack at a window's start: an event stamped a hair before dispatch is still the action's. */
export const WINDOW_SLACK_MS = 20;
/** A change within this long after a request's answer is that request's consequence. */
export const LINEAGE_MS = 300;
/**
 * How much earlier than the daemon hears of it a page may already act on an
 * answer: Playwright's requestfinished reaches node tens of ms after the page
 * ran the response handler (the page's clock and ours are the same clock).
 */
export const ANSWER_SLOP_MS = 150;
/** A request or url change within this long after an input window may be its debounced save. */
export const DEBOUNCE_MS = 1_500;
/** An endpoint asked this many times outside any gesture, within POLL_SPAN_MS, is the app polling. */
export const POLL_COUNT = 3;
export const POLL_SPAN_MS = 30_000;

const ACTIVE: ReadonlySet<WindowKind> = new Set(['gesture', 'eval']);

function within(w: JournalWindow, t: number): boolean {
  return t >= w.start - WINDOW_SLACK_MS && t <= (w.end ?? Infinity);
}

/** The innermost (latest-started) window of the given kinds holding t. */
function windowAt(windows: readonly JournalWindow[], t: number, kinds: ReadonlySet<WindowKind>): JournalWindow | undefined {
  let best: JournalWindow | undefined;
  for (const w of windows) if (kinds.has(w.kind) && within(w, t) && (!best || w.start >= best.start)) best = w;
  return best;
}

/** Whether any gesture or eval window STARTED in (from, to]. */
function activeStartedBetween(windows: readonly JournalWindow[], from: number, to: number): JournalWindow | undefined {
  return windows.find((w) => ACTIVE.has(w.kind) && w.start > from && w.start <= to);
}

/** The window a cause names, when it names one. */
export function causeWindow(c: Cause | undefined): number | undefined {
  if (!c) return undefined;
  return c[0] === 'in' || c[0] === 'late' || c[0] === 'undo' || c[0] === 'daemon' ? (c[1] as number) : undefined;
}

/** The windows a request event is chained from (its own cause), for lineage. */
function reqOwner(e: JournalEvent): number | undefined {
  const c = e.c;
  if (!c) return undefined;
  if (c[0] === 'in' && (c[2] === 'gesture' || c[2] === 'eval')) return c[1];
  if (c[0] === 'late') return c[1];
  return undefined;
}

export interface AttributionState {
  /** Requests already attributed (earlier drains included), newest last: the lineage rules look back at them. */
  requests: JournalEvent[];
  /** How often each endpoint (method + path) was asked outside any gesture or eval window. */
  idleAsks: Map<string, number[]>;
  /** Each tab's arrival and the window it is attributed to: the tab's first moments are that window's too. */
  pages: Map<number, { t: number; w?: number }>;
}

/** How long after a tab arrives its own loading (navigations, requests) is still the arrival's consequence. */
export const PAGE_ARRIVAL_MS = 3_000;

export function newAttributionState(): AttributionState {
  return { requests: [], idleAsks: new Map(), pages: new Map() };
}

const MAX_REMEMBERED_REQUESTS = 300;

/**
 * Attribute `events` (any order) against `windows`, in time order. Requests
 * are attributed first, so the other events can follow their lineage. Mutates
 * each event's `c`/`also` and returns the events sorted by time.
 */
export function attribute(events: JournalEvent[], windows: readonly JournalWindow[], state: AttributionState = newAttributionState()): JournalEvent[] {
  const sorted = [...events].sort((a, b) => a.t - b.t);
  const reqs = sorted.filter((e) => e.k === 'req');
  for (const r of reqs) {
    r.c = requestCause(r, windows, state);
    state.requests.push(r);
    if (state.requests.length > MAX_REMEMBERED_REQUESTS) state.requests.shift();
  }
  const focus = sorted.filter((e) => e.k === 'foc');
  for (const e of sorted) {
    if (e.k === 'req') continue;
    const { c, also } = eventCause(e, windows, state, focus);
    e.c = c;
    if (also !== undefined) e.also = also;
    if (e.k === 'page+' && typeof e.pg === 'number') state.pages.set(e.pg, { t: e.t, ...(c[0] === 'in' || c[0] === 'late' ? { w: c[1] as number } : {}) });
  }
  return sorted;
}

function endpointKey(e: JournalEvent): string {
  return `${String(e.m ?? 'GET')} ${String(e.e ?? '')}`;
}

function requestCause(r: JournalEvent, windows: readonly JournalWindow[], state: AttributionState): Cause {
  // An endpoint already known to be polled is the app's even inside a
  // gesture's window: the poll that happens to fire during a click is noise.
  const key = endpointKey(r);
  if (polled(state, key, r.t)) return ['app', 'poll'];
  const active = windowAt(windows, r.t, ACTIVE);
  if (active) return ['in', active.w, active.kind];
  // Outside any gesture: one more idle ask of this endpoint. Asked often
  // enough, close enough together, it is the app polling (and so is this one).
  const asks = [...(state.idleAsks.get(key) ?? []), r.t].filter((t) => r.t - t <= POLL_SPAN_MS);
  state.idleAsks.set(key, asks);
  if (asks.length >= POLL_COUNT) return ['app', 'poll'];
  // A request chained on one a window caused DIRECTLY (a POST, then the GET
  // that re-reads what it saved), to another endpoint, nothing active started
  // in between. Only one link deep: a chain of chains is how a poll loop looks.
  const parent = [...state.requests]
    .reverse()
    .find((p) => typeof p.t1 === 'number' && (p.t1 as number) - ANSWER_SLOP_MS <= r.t && r.t - (p.t1 as number) <= LINEAGE_MS && directOwner(p) !== undefined && endpointKey(p) !== key);
  if (parent && !activeStartedBetween(windows, parent.t, r.t)) return ['late', directOwner(parent)!, 'req'];
  const debounced = debounceWindow(windows, r.t);
  if (debounced) return ['late', debounced.w, 'debounce'];
  const quiet = windowAt(windows, r.t, new Set<WindowKind>(['observe']));
  if (quiet) return ['in', quiet.w, 'observe'];
  // The daemon's own looks (captures, snapshots) ask the server nothing: a
  // request during one is the app's, like any other outside a gesture.
  // Outside every window, chained on nothing, debounced from nothing: the
  // app asked on its own (a timer, an autosave, a push).
  return ['app', 'timer'];
}

/** Whether an endpoint has been asked POLL_COUNT times outside any gesture within POLL_SPAN_MS of t. */
function polled(state: AttributionState, key: string, t: number): boolean {
  return (state.idleAsks.get(key) ?? []).filter((x) => t - x <= POLL_SPAN_MS).length >= POLL_COUNT;
}

/** The window that started a request itself (in its window, or its debounced input), not through a chain. */
function directOwner(e: JournalEvent): number | undefined {
  const c = e.c;
  if (!c) return undefined;
  if (c[0] === 'in' && (c[2] === 'gesture' || c[2] === 'eval')) return c[1];
  if (c[0] === 'late' && c[2] === 'debounce') return c[1];
  return undefined;
}

/** The input window a request or url change at t may be the debounced consequence of. */
function debounceWindow(windows: readonly JournalWindow[], t: number): JournalWindow | undefined {
  let best: JournalWindow | undefined;
  for (const w of windows) {
    if (w.kind !== 'gesture' || !w.input || w.end === undefined || w.end > t || t - w.end > DEBOUNCE_MS) continue;
    if (!best || w.end > best.end!) best = w;
  }
  if (!best || activeStartedBetween(windows, best.end!, t)) return undefined;
  return best;
}

function eventCause(e: JournalEvent, windows: readonly JournalWindow[], state: AttributionState, focus: readonly JournalEvent[]): { c: Cause; also?: number } {
  // A late answer to an earlier window's request: its consequence, when no window holds the change.
  const answered = [...state.requests].reverse().find((r) => typeof r.t1 === 'number' && (r.t1 as number) - ANSWER_SLOP_MS <= e.t && e.t - (r.t1 as number) <= LINEAGE_MS && reqOwner(r) !== undefined);
  const active = windowAt(windows, e.t, ACTIVE);
  if (active) {
    // Any answer this window did not ask for, landing with the change, makes it
    // ambiguous: `also` names that request's window, or 0 when the app asked
    // on its own (an autosave's answer inside a click: vikunja fwvk12 #23).
    const landed = (r: JournalEvent) => typeof r.t1 === 'number' && (r.t1 as number) - ANSWER_SLOP_MS <= e.t && e.t - (r.t1 as number) <= LINEAGE_MS;
    const foreign = [...state.requests].reverse().find((r) => landed(r) && !(r.c?.[0] === 'app' && r.c[1] === 'poll') && reqOwner(r) !== active.w);
    const other = foreign ? (reqOwner(foreign) ?? 0) : undefined;
    return { c: ['in', active.w, active.kind], ...(other !== undefined && other !== active.w && e.k !== 'hit' && e.k !== 'foc' ? { also: other } : {}) };
  }
  if (e.k === 'hide' && typeof e.sa === 'number') {
    const shower = windowAt(windows, e.sa as number, ACTIVE) ?? windowAt(windows, e.sa as number, new Set<WindowKind>(['observe', 'daemon']));
    if (shower) {
      const blur = focus.some((f) => f.dir === 'out' && f.t <= e.t && e.t - f.t <= LINEAGE_MS);
      const req = state.requests.some((r) => typeof r.t1 === 'number' && (r.t1 as number) - ANSWER_SLOP_MS <= e.t && e.t - (r.t1 as number) <= LINEAGE_MS);
      return { c: ['undo', shower.w, blur ? 'blur' : req ? 'req' : 'timer'] };
    }
  }
  if (answered) {
    const owner = reqOwner(answered)!;
    const between = activeStartedBetween(windows, answered.t, e.t);
    return { c: ['late', owner, 'req'], ...(between && between.w !== owner ? { also: between.w } : {}) };
  }
  if (e.k === 'nav') {
    const debounced = debounceWindow(windows, e.t);
    if (debounced) return { c: ['late', debounced.w, 'debounce'] };
  }
  // A new tab's own loading is its arrival's consequence (ghost fwgh6: the
  // public post the card opened), not whatever the daemon was doing then.
  if (e.k !== 'page+' && typeof e.pg === 'number') {
    const arrived = state.pages.get(e.pg);
    if (arrived?.w !== undefined && e.t >= arrived.t && e.t - arrived.t <= PAGE_ARRIVAL_MS) return { c: ['late', arrived.w, 'page'] };
  }
  if (e.k === 'page+') {
    const last = [...windows].filter((w) => ACTIVE.has(w.kind) && w.end !== undefined && w.end <= e.t).sort((a, b) => b.end! - a.end!)[0];
    if (last && !activeStartedBetween(windows, last.end!, e.t)) return { c: ['late', last.w, 'page'] };
  }
  // What follows an answer the app asked for itself (a poll, a timer's save) is the app's.
  const appAnswer = [...state.requests].reverse().find((r) => r.c?.[0] === 'app' && typeof r.t1 === 'number' && (r.t1 as number) - ANSWER_SLOP_MS <= e.t && e.t - (r.t1 as number) <= LINEAGE_MS);
  if (appAnswer) return { c: ['app', appAnswer.c![1] === 'poll' ? 'poll' : 'req'] };
  const quiet = windowAt(windows, e.t, new Set<WindowKind>(['observe']));
  if (quiet) return { c: ['in', quiet.w, 'observe'] };
  const daemon = windowAt(windows, e.t, new Set<WindowKind>(['daemon']));
  if (daemon) return { c: ['daemon', daemon.w] };
  return { c: ['unknown'] };
}

/** Relative importance when a step's events must be capped: facts first, focus and hit-tests last. */
const PRIORITY: Record<string, number> = { req: 0, nav: 0, 'page+': 0, 'page-': 0, dlg: 0, show: 1, hide: 1, txt: 1, state: 1, val: 1, hit: 2, foc: 3 };

/** At most `max` events, the least important dropped first, time order kept. */
export function capEvents(events: readonly JournalEvent[], max: number): { kept: JournalEvent[]; dropped: number } {
  if (events.length <= max) return { kept: [...events], dropped: 0 };
  const ranked = events.map((e, i) => ({ e, i, p: PRIORITY[e.k] ?? 2 })).sort((a, b) => a.p - b.p || a.i - b.i);
  const keep = new Set(ranked.slice(0, max).map((r) => r.i));
  return { kept: events.filter((_, i) => keep.has(i)), dropped: events.length - max };
}

/** FNV-1a over UTF-16 code units, as hex: the in-page journal hashes field values the same way. */
export function valueHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}
