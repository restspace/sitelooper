/**
 * SITE FACTS, URL ROUTES (stage 0, Piece D1 of the site-facts contract;
 * design-site-facts.md §2): what the runner OBSERVES about an app's urls, and
 * the SHADOW rows logged beside each route decision. Stage 1 moved the
 * fact-based verdicts themselves to src/execution/facts-route.ts (both runners
 * decide from them) and re-exports them here; this module reads the store and
 * hands a snapshot over (`ReplayFactsHook.snapshot`), and stamps `applied` on
 * a row whose fact decided what the runner did.
 *
 * Three observations:
 *  - `route.fragment` (hard): any url on the origin carries a fragment — a
 *    route (`#/a/b`, espo's `#Opportunity/view/<id>`), state (odoo's
 *    `#action=…`) or a bare in-page anchor (snipeit's `#history`);
 *  - `route.query` `state` (hard): one step changed exactly ONE query key of
 *    the url — added it, dropped it, or gave it another value — while the
 *    route, every record-shaped part of the url and the page itself stayed the
 *    same, and no write request went out (fwop15's `query_props`, grafana's
 *    `refresh`);
 *  - `route.query` `routing` (soft): two stored procedures start on the same
 *    route with preconditions that differ only in one query key's literal and
 *    pages that do not fingerprint alike (kanboard's `controller`).
 *
 * The recorder side notes urls in memory (a `RouteObserver` per skill store,
 * which is per daemon session) and the facts are written when the daemon
 * learns an instruction or finishes a flow run — never from the artifact.
 * Shadow rows are buffered the same way and written through `writeShadow`.
 */
import {
  emptyFacts,
  reliable,
  routeTemplateOf,
  type Fact,
  type FactValue,
  type Observation,
  type SiteFacts,
} from '../execution/facts.js';
import { originOf, urlShapeOf, type UrlShape } from '../execution/url.js';
import { cosine } from '../execution/fingerprint.js';
import { SOFT_MATCH_MIN_SIMILARITY, type FingerprintSimilarity, type MintedPosition } from '../execution/gates.js';
import {
  landingByFacts,
  literal,
  preconditionByFacts,
  routesAgreeByFacts,
  type RoutesAgree,
} from '../execution/facts-route.js';

// The pure decisions live in src/execution/facts-route.ts (both runners embed
// them); re-exported for the daemon-side callers that imported them from here.
export {
  disputedKeys,
  landingByFacts,
  landingVerdictWithFacts,
  literal,
  preconditionByFacts,
  preconditionVerdictWithFacts,
  queryFacts,
  queryKind,
  rewriteQuery,
  routesAgreeByFacts,
  type RoutesAgree,
} from '../execution/facts-route.js';
import { SiteFactStore } from './facts.js';
import { writeShadow, type ShadowRow } from './shadow.js';
import { takeFormatShadowRows } from './facts-format.js';
import type { Skill, SkillStore } from './store.js';

// ---------------------------------------------------------------------------
// url parts
// ---------------------------------------------------------------------------

const digitCount = (x: string): number => (x.match(/\d/g) ?? []).length;
const dominated = (x: string): boolean => digitCount(x) > 0 && digitCount(x) >= x.length - digitCount(x);

/** A path segment routeTemplateOf writes `*`: facts.ts `recordSeg`, copied (it is private there). */
function recordSeg(seg: string): boolean {
  if (digitCount(seg) >= 2) return true;
  return dominated(seg) || (/[-_]/.test(seg) && seg.split(/[-_]+/).some(dominated));
}

/**
 * A query (or fragment-state) value that names a record: all digits
 * (kanboard's `task_id=4`), or a short token with two or more digits that is
 * record-shaped (`S00023`, a uuid). Stricter than a path segment's rule on
 * purpose: grafana's `refresh=1m` is view state, and a JSON blob with a page
 * size in it (fwop15's `query_props`) is not a record either.
 */
function recordValue(v: string): boolean {
  if (/^\d+$/.test(v)) return true;
  return v.length <= 64 && !/[\s{}[\]"',:;]/.test(v) && digitCount(v) >= 2 && recordSeg(v);
}

/**
 * The IDENTITY parts of a url: every record-shaped path and fragment-path
 * segment and every record-shaped query or fragment-state value, labelled by
 * position (`p2=4`, `q.task_id=4`, `h1=…`, `hs.id=22`). Two urls on one route
 * with equal identity parts show the same record; the default the recorder
 * passes to `RouteObserver.noteUrl` (the ledger is not visible there).
 */
export function identityPartsOf(url: string): string[] {
  const shape = urlShapeOf(url);
  if (!shape) return [];
  const out: string[] = [];
  shape.path.forEach((seg, i) => {
    if (recordSeg(seg)) out.push(`p${i}=${seg}`);
  });
  for (const [k, v] of shape.query) if (recordValue(v)) out.push(`q.${k}=${v}`);
  if (shape.hashKind === 'path') {
    shape.hashPath.forEach((seg, i) => {
      if (recordSeg(seg)) out.push(`h${i}=${seg}`);
    });
  }
  for (const [k, v] of shape.hashState) if (recordValue(v)) out.push(`hs.${k}=${v}`);
  return out;
}

/**
 * Whether a step left the browser on the SAME page it found, by the two page
 * signatures the recorder already takes around it: the same document title
 * and at least half of the interactive lines kept. A query key a step changes
 * on the same page is view state; the same change that replaced the page
 * (kanboard's dashboard → project list, one `controller` apart) is routing.
 */
export function samePageOf(before: { title?: string; lines: readonly string[] }, after: { title?: string; lines: readonly string[] }): boolean {
  if ((before.title ?? '') !== (after.title ?? '')) return false;
  const was = new Set(before.lines);
  const kept = after.lines.filter((l) => was.has(l)).length;
  const most = Math.max(before.lines.length, after.lines.length);
  return most === 0 || kept / most >= 0.5;
}

const WRITES: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Whether a recorded step's journal (its own window and the gap before it)
 * saw a write request that was not the app polling: a record may have
 * changed, so a url difference across it is not view state. No journal is no
 * evidence either way, and reads as "maybe" (true).
 */
export function hasWriteRequest(j: { ev?: ReadonlyArray<{ k: string; m?: unknown; c?: unknown }>; gap?: { ev?: ReadonlyArray<{ k: string; m?: unknown; c?: unknown }> } } | undefined): boolean {
  if (!j) return true;
  const events = [...(j.ev ?? []), ...(j.gap?.ev ?? [])];
  return events.some((e) => {
    if (e.k !== 'req' || !WRITES.has(String(e.m ?? '').toUpperCase())) return false;
    const c = Array.isArray(e.c) ? e.c : [];
    return !(c[0] === 'app' && c[1] === 'poll');
  });
}

/** An evidence line that names a run (`fwop15-n1`, `fwkb41-n2l`) is dropped: the contract makes that the caller's job. */
const RUN_TOKEN = /\b[a-z]{2,}\d+[a-z0-9]*-n\d+[a-z0-9]*\b/i;

function safeEv(ev: string): string | undefined {
  return RUN_TOKEN.test(ev) ? undefined : ev;
}

// ---------------------------------------------------------------------------
// the observer
// ---------------------------------------------------------------------------

/** An observation before its session is known, and the origin it belongs to. */
export type PendingObservation = Omit<Observation, 'session'> & { origin: string };
/** An observation as `flush` hands it out: the store's Observation, plus its origin. */
export type OriginObservation = Observation & { origin: string };

interface Noted {
  url: string;
  route: string;
  parts: string;
  query: Map<string, string>;
}

const FRAGMENT_RANK = { anchor: 1, state: 2, path: 3 } as const;
type FragmentKind = keyof typeof FRAGMENT_RANK;

/**
 * Per session: the urls the daemon saw, in order, and the route facts they
 * prove. `noteUrl` at every recorded step's commit (the page url after the
 * step) and at every replay url expectation; `flush` hands out what is new.
 *
 * Each (kind, key, value) is observed at most once per observer, so a fact's
 * `n` counts sessions that proved it rather than steps that repeated it.
 * Fragments are ranked within a session (path over state over anchor): an
 * app that routes by fragment also shows the odd bare word (espo's
 * `#Opportunity` list beside `#Opportunity/view/<id>`), and the lesser kind is
 * not observed once the greater one has been.
 */
export class RouteObserver {
  private prev: Noted | null = null;
  private pending: PendingObservation[] = [];
  private readonly emitted = new Set<string>();
  private readonly fragment = new Map<string, FragmentKind>();

  constructor(public session: string = '') {}

  /**
   * One url the browser was on after a step. `identityParts`: the url's
   * record parts (identityPartsOf, or the ledger's). `mintedSinceLast`: a
   * record may have changed since the previous note. `samePage`: the step
   * demonstrably left the browser on the page it found (samePageOf) —
   * absent is unknown, and an unknown transition proves no `state` key.
   */
  noteUrl(url: string, identityParts: readonly string[], mintedSinceLast: boolean, samePage?: boolean): void {
    if (!/^https?:/i.test(url)) return;
    const shape = urlShapeOf(url);
    const origin = originOf(url);
    if (!shape || !origin) return;
    const route = routeTemplateOf(url, identityParts);
    this.noteFragment(origin, route, shape);
    const now: Noted = { url, route, parts: [...identityParts].sort().join('\u0001'), query: shape.query };
    const prev = this.prev;
    if (prev && prev.url === url) return;
    this.prev = now;
    if (!prev || mintedSinceLast || samePage !== true) return;
    if (prev.route !== route || prev.parts !== now.parts) return;
    const keys = new Set([...prev.query.keys(), ...now.query.keys()]);
    const changed = [...keys].filter((k) => prev.query.get(k) !== now.query.get(k));
    if (changed.length !== 1) return;
    const key = changed[0];
    const how = !prev.query.has(key) ? 'added' : !now.query.has(key) ? 'dropped' : 'given another value';
    this.emit({
      origin,
      k: 'route.query',
      key: `${route}?${key}`,
      v: 'state',
      hard: true,
      ev: safeEv(`${key} ${how} by one step on the same page, no write between`),
    });
  }

  private noteFragment(origin: string, route: string, shape: UrlShape): void {
    const kind: FragmentKind | null =
      shape.hashKind === 'state' ? 'state' : shape.hashKind === 'path' ? (shape.hashAnchor ? 'anchor' : 'path') : null;
    if (!kind) return;
    const best = this.fragment.get(origin);
    if (best && FRAGMENT_RANK[best] >= FRAGMENT_RANK[kind]) return;
    this.fragment.set(origin, kind);
    this.emit({ origin, k: 'route.fragment', key: '', v: kind, hard: true, ev: safeEv(`a ${kind} fragment on ${route}`) });
  }

  private emit(o: PendingObservation): void {
    const id = `${o.origin}\u0000${o.k}\u0000${o.key}\u0000${JSON.stringify(o.v)}`;
    if (this.emitted.has(id)) return;
    this.emitted.add(id);
    const at = new Date().toISOString();
    const { ev, ...rest } = o;
    this.pending.push({ ...rest, at, ...(ev !== undefined ? { ev } : {}) });
  }

  /** The observations noted since the last flush, stamped with the session, and forgotten here. */
  flush(session: string = this.session): OriginObservation[] {
    const out = this.pending.map((o) => ({ ...o, session }));
    this.pending = [];
    return out;
  }
}

/** Observations grouped by origin, for SiteFactStore.observe. */
function byOrigin(obs: readonly OriginObservation[]): Map<string, Observation[]> {
  const out = new Map<string, Observation[]>();
  for (const { origin, ...o } of obs) {
    const list = out.get(origin) ?? [];
    list.push(o);
    out.set(origin, list);
  }
  return out;
}

// ---------------------------------------------------------------------------
// per-session registries (a SkillStore object is one daemon session's)
// ---------------------------------------------------------------------------

const observers = new WeakMap<object, RouteObserver>();
const rowBuffers = new WeakMap<object, FactShadowRow[]>();
const factStores = new Map<string, SiteFactStore>();
/** Shadow rows one session holds before a flush: a daemon that never learns or runs a flow must not grow without bound. */
const MAX_BUFFERED_ROWS = 500;

/** The session's route observer, keyed by its skill store. */
export function routeObserverFor(store: object): RouteObserver {
  let o = observers.get(store);
  if (!o) {
    o = new RouteObserver();
    observers.set(store, o);
  }
  return o;
}

/** The fact store beside a skill store (same root), one per root. */
export function factStoreFor(dir: string): SiteFactStore {
  let s = factStores.get(dir);
  if (!s) {
    s = new SiteFactStore(dir);
    factStores.set(dir, s);
  }
  return s;
}

function factsAt(store: SkillStore, url: string): SiteFacts | null {
  const origin = originOf(url);
  return origin ? factStoreFor(store.dir).read(origin) : null;
}

/**
 * The recorder's commit hook (agent/tools.ts): the page url after a recorded
 * step. Never throws — observing must not fail the step it watches.
 */
export function noteRecordedUrl(store: SkillStore, urlOf: () => string, o: { minted: boolean; samePage?: boolean }): void {
  try {
    const url = urlOf();
    if (url) routeObserverFor(store).noteUrl(url, identityPartsOf(url), o.minted, o.samePage);
  } catch {
    // a fact the recorder could not note is only a fact not learned
  }
}

/** Write the session's pending route observations to the fact store. Never throws. */
export function flushRouteObservations(store: SkillStore | null | undefined, session: string): number {
  if (!store) return 0;
  try {
    const obs = observers.get(store)?.flush(session) ?? [];
    let written = 0;
    for (const [origin, list] of byOrigin(obs)) written += factStoreFor(store.dir).observe(origin, list).written;
    return written;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// shadow rows
// ---------------------------------------------------------------------------

/** The facts evidence of a shadow row: the one fact the verdict rests on. */
export interface FactEvidence {
  k: Fact['k'];
  key: string;
  v: FactValue;
  reliable: boolean;
}

/**
 * A `facts.*` shadow row: a plain ShadowRow whose `evidence` holds one JSON
 * string per fact consulted, each `{k, key, v, reliable}` (the convention
 * Pieces D3 and E share; `parseFactEvidence` reads one back).
 */
export type FactShadowRow = ShadowRow & {
  evidence: string[];
  /** Stage 1: the fact DECIDED the verdict the runner acted on (absent when today's rule did). */
  applied?: boolean;
};

function evidenceOf(f: Fact): string {
  const e: FactEvidence = { k: f.k, key: f.key, v: typeof f.v === 'string' ? f.v : { ...f.v }, reliable: reliable(f) };
  return JSON.stringify(e);
}

/** One evidence item of a `facts.*` row, parsed; null when it is not one. */
export function parseFactEvidence(item: string): FactEvidence | null {
  try {
    const e = JSON.parse(item) as FactEvidence;
    return e && typeof e.k === 'string' && typeof e.key === 'string' && typeof e.reliable === 'boolean' ? e : null;
  } catch {
    return null;
  }
}

/**
 * One row. `fact` is the fact-based decision, or 'none' when no RELIABLE fact
 * bears on it (only advisory ones: the decision falls back to today's rule,
 * so there is nothing to disagree with). `applied`: the caller acted on the
 * fact's verdict (stage 1), stamped `applied: true` only when it decided.
 */
function factRow(rule: string, step: string, decided: boolean, fact: string, heuristic: string, relevant: readonly Fact[], applied = false): FactShadowRow {
  const verdict = decided ? fact : 'none';
  return {
    rule,
    step: step.slice(0, 100),
    fact: verdict,
    heuristic,
    agree: verdict === 'none' || verdict === heuristic,
    evidence: [...new Set(relevant)].map(evidenceOf),
    ...(applied && decided ? { applied: true } : {}),
  };
}

/** Buffer one row for the session's next flush. */
export function bufferFactRow(store: object, row: FactShadowRow | null): void {
  if (!row) return;
  const rows = rowBuffers.get(store) ?? [];
  if (rows.length >= MAX_BUFFERED_ROWS) return;
  rows.push(row);
  rowBuffers.set(store, rows);
}

/** The session's buffered rows, handed out once. */
export function takeFactRows(store: object | null | undefined): ShadowRow[] {
  if (!store) return [];
  const rows = rowBuffers.get(store) ?? [];
  rowBuffers.delete(store);
  return rows;
}

/**
 * Where a flow run's outcome is recorded (daemon/server.ts): the session's
 * route observations to the fact store, and its buffered `facts.*` shadow
 * rows to `shadow.jsonl`. Never throws.
 */
export function flushSiteFacts(store: SkillStore | null | undefined, session: string, instruction: string): void {
  if (!store) return;
  flushRouteObservations(store, session);
  try {
    writeShadow(store.dir, { session, instruction }, [...takeFactRows(store), ...takeFormatShadowRows()]);
  } catch {
    // never breaks the run it shadows
  }
}

// ---------------------------------------------------------------------------
// consumer 1: routesAgree (learn.ts pinEndsElsewhere) — routesAgreeByFacts is in
// execution/facts-route.ts
// ---------------------------------------------------------------------------

/** The `facts.routesAgree` row beside today's verdict, or null when no fact bears on it. */
export function routesAgreeShadow(sf: SiteFacts, start: string, end: string, byFragment: boolean, today: RoutesAgree, heuristic: boolean, step: string, applied = false): FactShadowRow | null {
  const r = routesAgreeByFacts(sf, start, end, byFragment, today);
  if (!r) return null;
  const say = (x: boolean) => (x ? 'agree' : 'differ');
  return factRow('facts.routesAgree', step, r.decided, say(r.agree), say(heuristic), r.relevant, applied);
}

/** learn.ts's hook: the row for one routesAgree decision, buffered for the session's flush. Never throws. */
export function noteRoutesAgree(store: SkillStore, origin: string, start: string, end: string, byFragment: boolean, today: RoutesAgree, heuristic: boolean, step: string): void {
  try {
    bufferFactRow(store, routesAgreeShadow(factStoreFor(store.dir).read(origin), start, end, byFragment, today, heuristic, step));
  } catch {
    // a shadow row never breaks the decision it shadows
  }
}

// ---------------------------------------------------------------------------
// consumer 2: the goto landing and the precondition gate (replay.ts)
// ---------------------------------------------------------------------------

/** The `facts.landing` row for a goto landing; `applied`: the runner acted on landingVerdictWithFacts. */
export function landingShadow(sf: SiteFacts, target: string, landed: string, heuristicStop: boolean, step: string, applied = false): FactShadowRow | null {
  const r = landingByFacts(sf, target, landed);
  if (!r) return null;
  const say = (x: boolean) => (x ? 'stop' : 'pass');
  return factRow('facts.landing', step, r.decided, say(r.stop), say(heuristicStop), r.relevant, applied);
}

export function preconditionShadow(
  sf: SiteFacts,
  pattern: string,
  url: string,
  params: Record<string, string>,
  similarity: FingerprintSimilarity,
  mints: MintedPosition[],
  heuristicRefuse: boolean,
  step: string,
  applied = false,
): FactShadowRow | null {
  const r = preconditionByFacts(sf, pattern, url, params, similarity, mints);
  if (!r) return null;
  const say = (x: boolean) => (x ? 'refuse' : 'pass');
  return factRow('facts.landing', step, r.decided, say(r.refuse), say(heuristicRefuse), r.relevant, applied);
}

/**
 * What replay.ts is handed (ReplayOptions.facts) by the daemon's run_skill:
 * the url expectation hook, the two landing shadows, all buffered for the
 * session, and (stage 1) `snapshot(url)`, the live store's facts for the
 * url's origin, which the replay's goto landing and precondition gates decide
 * from (execution/facts-route.ts). A replay with no hook (tests, a caller
 * outside the daemon) decides from no facts, which is today's rule.
 *
 * `stop` / `refused` are TODAY's verdict (the heuristic column); `applied`
 * says the runner acted on the facts' verdict, and stamps the row when a
 * reliable fact decided it.
 */
export interface ReplayFactsHook {
  noteUrl(url: string, minted: boolean): void;
  landing(target: string, landed: string, stop: boolean, step: string, applied?: boolean): void;
  precondition(pattern: string, url: string, params: Record<string, string>, similarity: FingerprintSimilarity, mints: MintedPosition[], refused: boolean, step: string, applied?: boolean): void;
  snapshot(url: string): SiteFacts;
}

export function replayFactsFor(store: SkillStore): ReplayFactsHook {
  return {
    noteUrl(url, minted) {
      try {
        routeObserverFor(store).noteUrl(url, identityPartsOf(url), minted);
      } catch {
        /* never fails the replay */
      }
    },
    landing(target, landed, stop, step, applied) {
      try {
        const sf = factsAt(store, landed);
        if (sf) bufferFactRow(store, landingShadow(sf, target, landed, stop, step, applied));
      } catch {
        /* never fails the replay */
      }
    },
    precondition(pattern, url, params, similarity, mints, refused, step, applied) {
      try {
        const sf = factsAt(store, url);
        if (sf) bufferFactRow(store, preconditionShadow(sf, pattern, url, params, similarity, mints, refused, step, applied));
      } catch {
        /* never fails the replay */
      }
    },
    snapshot(url) {
      try {
        return factsAt(store, url) ?? emptyFacts(originOf(url) ?? '');
      } catch {
        return emptyFacts(originOf(url) ?? '');
      }
    },
  };
}

// ---------------------------------------------------------------------------
// the learn-time `routing` fact
// ---------------------------------------------------------------------------

function sameExceptQuery(a: UrlShape, b: UrlShape): boolean {
  if (a.origin !== b.origin || a.path.length !== b.path.length || a.path.some((s, i) => s !== b.path[i])) return false;
  if (a.hashKind !== b.hashKind || a.hashSlash !== b.hashSlash || a.hashPath.join('/') !== b.hashPath.join('/')) return false;
  const hs = (m: Map<string, string>) => [...m].map(([k, v]) => `${k}=${v}`).sort().join('&');
  return hs(a.hashState) === hs(b.hashState);
}

/**
 * `route.query` `routing` (soft) observations: every pair of procedures, one
 * of them just compiled (`fresh`), whose start patterns are the same url but
 * for ONE query key's literal (both sides literal, same key set) and whose
 * start pages do not fingerprint alike (cosine below the soft-match floor).
 * Kanboard's `?controller=BoardViewController` and
 * `?controller=TaskViewController` pages are two pages on one path.
 */
export function routingObservations(fresh: readonly Skill[], stored: readonly Skill[]): PendingObservation[] {
  const out: PendingObservation[] = [];
  const seen = new Set<string>();
  const others = [...stored, ...fresh];
  for (const s of fresh) {
    const a = urlShapeOf(s.preconditions.urlPattern);
    if (!a || !s.preconditions.fingerprint) continue;
    for (const t of others) {
      if (t === s || t.id === s.id || !t.preconditions.fingerprint) continue;
      const b = urlShapeOf(t.preconditions.urlPattern);
      if (!b || !sameExceptQuery(a, b)) continue;
      const keys = new Set([...a.query.keys(), ...b.query.keys()]);
      if ([...keys].some((k) => !a.query.has(k) || !b.query.has(k))) continue;
      const differ = [...keys].filter((k) => a.query.get(k) !== b.query.get(k));
      if (differ.length !== 1) continue;
      const k = differ[0];
      if (!literal(a.query.get(k)) || !literal(b.query.get(k))) continue;
      const sim = cosine(s.preconditions.fingerprint, t.preconditions.fingerprint);
      if (sim === null || sim >= SOFT_MATCH_MIN_SIMILARITY) continue;
      const key = `${routeTemplateOf(s.preconditions.urlPattern)}?${k}`;
      const origin = originOf(s.preconditions.urlPattern) ?? s.origin;
      if (seen.has(`${origin}\u0000${key}`)) continue;
      seen.add(`${origin}\u0000${key}`);
      const ev = safeEv(`${k}: two procedures' start pages one literal apart, similarity ${sim}`);
      out.push({ origin, k: 'route.query', key, v: 'routing', hard: false, ...(ev ? { ev } : {}) });
    }
  }
  return out;
}

/** learn.ts's hook after compileSkills: observe the `routing` facts the fresh procedures prove. Never throws. */
export function observeRouting(store: SkillStore, fresh: readonly Skill[], session: string): number {
  try {
    if (!fresh.length) return 0;
    const stored = [...new Set(fresh.map((s) => s.origin))].flatMap((o) => store.list(o));
    const obs = routingObservations(fresh, stored).map((o) => ({ ...o, session }));
    let written = 0;
    for (const [origin, list] of byOrigin(obs)) written += factStoreFor(store.dir).observe(origin, list).written;
    return written;
  } catch {
    return 0;
  }
}
