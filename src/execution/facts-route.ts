/**
 * SITE FACTS, URL ROUTE DECISIONS (stage 1, Piece F of the stage 1 contract;
 * design-site-facts.md §2 consumers 1-2): the pure verdicts the url route
 * consumers take from the facts, moved here from skills/facts-url.ts so that
 * BOTH runners decide identically — the daemon's replay from the live store's
 * snapshot, the compiled artifact from the snapshot it carries
 * (`siteFactsAt(url)`). The artifact embeds this exact source
 * (spec/runtime-source.ts), so it imports its siblings and nothing else.
 *
 * Reliable or nothing: every verdict here reads the facts through
 * `routeQueryFact` / `fragmentFact`, which only ever return a RELIABLE fact.
 * Where no reliable fact decides, the `…WithFacts` forms return today's
 * verdict, computed by the very call they replace — byte-identical.
 */
import { factsFor, fragmentFact, reliable, routeQueryFact, routeTemplateOf, type Fact, type SiteFacts } from './facts.js';
import { isWildcardSeg, originOf, safeDecode, urlShapeOf, type UrlShape } from './url.js';
import {
  describeUrl,
  gotoLandingVerdict,
  preconditionVerdict,
  shownPattern,
  type FingerprintSimilarity,
  type MintedPosition,
  type PreconditionVerdict,
} from './gates.js';

// ---------------------------------------------------------------------------
// query rewriting and key comparison
// ---------------------------------------------------------------------------

/** `a=1&b=2` with `fn` applied to each pair, textually: an unchanged pair is kept exactly as written. */
function rewritePairs(text: string, fn: (key: string, value: string) => string | null): string[] {
  const kept: string[] = [];
  for (const pair of text.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const rawKey = eq < 0 ? pair : pair.slice(0, eq);
    const value = eq < 0 ? '' : pair.slice(eq + 1);
    const next = fn(safeDecode(rawKey), safeDecode(value));
    if (next === null) continue;
    kept.push(next === safeDecode(value) ? pair : `${rawKey}=${next}`);
  }
  return kept;
}

/**
 * Rewrite a url's (or url pattern's) query AND its hash state in place,
 * textually, so slot markers, a route or anchor fragment and every untouched
 * pair are left exactly as written: `fn` returns the new value for a key, or
 * null to drop the pair. A state fragment (odoo's `#action=123&cids=1`) is
 * query-like and is rewritten the same way, keeping its `#a=b&c=d` shape (and
 * dropped whole when no pair is left); a route (`#/a/b`) or an anchor
 * (`#history`) fragment is not a set of keys and is left alone.
 */
export function rewriteQuery(url: string, fn: (key: string, value: string) => string | null): string {
  const hashAt = url.indexOf('#');
  const head = hashAt >= 0 ? url.slice(0, hashAt) : url;
  let hash = hashAt >= 0 ? url.slice(hashAt) : '';
  const body = hash.slice(1);
  const stateEnd = body.indexOf('?') >= 0 ? body.indexOf('?') : body.length;
  const state = body.slice(0, stateEnd);
  if (state && !state.startsWith('/') && state.includes('=')) {
    const kept = rewritePairs(state, fn);
    const tail = body.slice(stateEnd);
    hash = kept.length || tail ? `#${kept.join('&')}${tail}` : '';
  }
  const q = head.indexOf('?');
  if (q < 0) return `${head}${hash}`;
  const kept = rewritePairs(head.slice(q + 1), fn);
  return `${head.slice(0, q)}${kept.length ? `?${kept.join('&')}` : ''}${hash}`;
}

/** A query value that asks for one particular value: not empty, not a wildcard, not a slot. */
export function literal(v: string | undefined): v is string {
  return v !== undefined && v !== '' && !isWildcardSeg(v) && !/\{\{/.test(v);
}

/**
 * A key's value on a url: its query value, else its hash-state value. Odoo
 * keeps its view state in the fragment (`#action=123&cids=1&menu_id=81`), and
 * its facts are keyed `${route}?${key}` exactly as a query key's are.
 */
function keyValue(s: UrlShape, k: string): string | undefined {
  return s.query.get(k) ?? s.hashState.get(k);
}

/** A url names the key, in its query or its hash state. */
function hasKey(s: UrlShape, k: string): boolean {
  return s.query.has(k) || s.hashState.has(k);
}

/** Query (and hash-state) keys the two urls do not agree on: one side only, or two literals. */
export function disputedKeys(a: UrlShape, b: UrlShape): { oneSided: string[]; differing: string[] } {
  const oneSided: string[] = [];
  const differing: string[] = [];
  for (const k of new Set([...a.query.keys(), ...a.hashState.keys(), ...b.query.keys(), ...b.hashState.keys()])) {
    const x = keyValue(a, k);
    const y = keyValue(b, k);
    if (x === undefined || y === undefined) oneSided.push(k);
    else if (literal(x) && literal(y) && x !== y) differing.push(k);
  }
  return { oneSided, differing };
}

/** Every route.query fact about `key` on either url's route, each once. */
export function queryFacts(sf: SiteFacts, urls: readonly string[], key: string): Fact[] {
  const routes = [...new Set(urls.map((u) => routeTemplateOf(u)))];
  return routes.flatMap((r) => factsFor(sf, 'route.query', `${r}?${key}`));
}

/** The reliable route.query verdict for a key on either url's route (the first url's route first). */
export function queryKind(sf: SiteFacts, urls: readonly string[], key: string): 'state' | 'identity' | 'routing' | null {
  for (const u of urls) {
    const kind = routeQueryFact(sf, u, key);
    if (kind) return kind;
  }
  return null;
}

// ---------------------------------------------------------------------------
// consumer 1: routesAgree (learn.ts pinEndsElsewhere)
// ---------------------------------------------------------------------------

export type RoutesAgree = (start: string, end: string, byFragment: boolean) => boolean;

/**
 * routesAgree decided by facts, with today's rule (`today`) for everything a
 * fact does not settle: a query key of reliable `state` is dropped from both
 * sides (it never separates routes), a key of reliable `routing` that only
 * one side carries as a literal separates them (both sides' literals are
 * already compared by today's rule), and a reliable `route.fragment` replaces
 * routesByFragment's guess (a `path` or `state` fragment is a route, an
 * `anchor` is not). Null when no fact, reliable or not, bears on the pair.
 */
export function routesAgreeByFacts(sf: SiteFacts, start: string, end: string, byFragment: boolean, today: RoutesAgree): { agree: boolean; decided: boolean; relevant: Fact[] } | null {
  const a = urlShapeOf(start);
  const b = urlShapeOf(end);
  const relevant: Fact[] = [];
  const fragmented = start.includes('#') || end.includes('#');
  if (fragmented) relevant.push(...factsFor(sf, 'route.fragment', ''));
  const disputed = a && b ? disputedKeys(a, b) : { oneSided: [], differing: [] };
  const keys = [...disputed.oneSided, ...disputed.differing];
  for (const k of keys) relevant.push(...queryFacts(sf, [start, end], k));
  if (!relevant.length) return null;
  const frag = fragmented ? fragmentFact(sf) : null;
  const byFragmentF = frag ? frag !== 'anchor' : byFragment;
  const kinds = new Map(keys.map((k) => [k, queryKind(sf, [start, end], k)] as const));
  const decided = relevant.some(reliable) && (frag !== null || [...kinds.values()].some((v) => v === 'state' || v === 'routing'));
  const routingSplit = disputed.oneSided.some((k) => kinds.get(k) === 'routing' && (literal(keyValue(a!, k)) || literal(keyValue(b!, k))));
  if (routingSplit) return { agree: false, decided, relevant };
  const drop = (u: string) => rewriteQuery(u, (k, v) => (kinds.get(k) === 'state' ? null : v));
  return { agree: today(drop(start), drop(end), byFragmentF), decided, relevant };
}

// ---------------------------------------------------------------------------
// consumer 2a: the goto landing (replay.ts gotoLanding, the artifact's goto check)
// ---------------------------------------------------------------------------

/** At most 40 characters of a value in a message, as gates.ts clips one. */
function shown40(v: string | undefined): string {
  if (v === undefined) return '(absent)';
  return v.length > 40 ? `${v.slice(0, 39)}…` : v;
}

interface LandingDecision {
  stop: boolean;
  decided: boolean;
  relevant: Fact[];
  /** The stop's message when the facts decided it, unprefixed; null when the landing passes. */
  message: string | null;
}

function landingDecision(sf: SiteFacts, target: string, landed: string, where: string): LandingDecision | null {
  const t = urlShapeOf(target);
  const l = urlShapeOf(landed);
  if (!t || !l || t.origin !== l.origin) return null;
  const { oneSided, differing } = disputedKeys(t, l);
  const keys = [...oneSided, ...differing];
  const relevant = keys.flatMap((k) => queryFacts(sf, [landed, target], k));
  if (!relevant.length) return null;
  const kinds = new Map(keys.map((k) => [k, queryKind(sf, [landed, target], k)] as const));
  const decided = [...kinds.values()].some((v) => v === 'state' || v === 'routing');
  const split = oneSided.filter((k) => kinds.get(k) === 'routing' && (literal(keyValue(t, k)) || literal(keyValue(l, k))));
  const asked = rewriteQuery(target, (k, v) => (kinds.get(k) === 'state' ? null : v));
  const byRule = gotoLandingVerdict(asked, landed, where);
  let message = byRule;
  if (message === null && split.length) {
    const said = split.map((k) => `${k}=${shown40(keyValue(l, k))} where it was sent to ${k}=${shown40(keyValue(t, k))}`).join(', ');
    message = `${where} navigated but landed on another view: ${said} (route.query ${split.join(', ')} selects the page on this route) — the page it asked for was not given`;
  }
  return { stop: message !== null, decided, relevant, message };
}

/**
 * gotoLandingVerdict decided by facts: a key of reliable `state` never makes
 * a landing "another view", whatever its two literals; a key of reliable
 * `routing` the target asked for (a literal) and the landing lacks, or the
 * landing carries and the target did not ask for, does. Null when no
 * route.query fact exists for a disputed key.
 */
export function landingByFacts(sf: SiteFacts, target: string, landed: string): { stop: boolean; decided: boolean; relevant: Fact[] } | null {
  const d = landingDecision(sf, target, landed, '');
  return d ? { stop: d.stop, decided: d.decided, relevant: d.relevant } : null;
}

/**
 * Where a goto landed, as both runners judge it: `gotoLandingVerdict` unless
 * a reliable `route.query` fact decides a key the two urls dispute — then the
 * facts' verdict (landingByFacts), its stop written as gotoLandingVerdict
 * would write it and prefixed "by fact: ". Byte-identical to
 * gotoLandingVerdict when no reliable fact decides.
 */
export function landingVerdictWithFacts(sf: SiteFacts, target: string, landed: string, where: string): string | null {
  const d = landingDecision(sf, target, landed, where);
  if (!d || !d.decided) return gotoLandingVerdict(target, landed, where);
  return d.message === null ? null : `by fact: ${d.message}`;
}

// ---------------------------------------------------------------------------
// consumer 2b: the precondition gate (replay.ts passGate, the artifact's runFlow)
// ---------------------------------------------------------------------------

/** The url without its fragment when the fragment is a bare in-page anchor (`#history`); otherwise unchanged. */
function withoutAnchor(url: string): string {
  const shape = urlShapeOf(url);
  if (!shape || shape.hashKind !== 'path' || !shape.hashAnchor) return url;
  const at = url.indexOf('#');
  return at >= 0 ? url.slice(0, at) : url;
}

/** The pattern with `key=:var` appended for each key, ahead of any fragment. */
function withWildKeys(pattern: string, keys: readonly string[]): string {
  if (!keys.length) return pattern;
  const hashAt = pattern.indexOf('#');
  const head = hashAt >= 0 ? pattern.slice(0, hashAt) : pattern;
  const hash = hashAt >= 0 ? pattern.slice(hashAt) : '';
  const pairs = keys.map((k) => `${encodeURIComponent(k)}=:var`).join('&');
  const sep = !head.includes('?') ? '?' : head.endsWith('?') || head.endsWith('&') ? '' : '&';
  return `${head}${sep}${pairs}${hash}`;
}

interface PreconditionDecision {
  verdict: PreconditionVerdict;
  decided: boolean;
  relevant: Fact[];
}

function preconditionDecision(
  sf: SiteFacts,
  pattern: string,
  url: string,
  params: Record<string, string>,
  similarity: FingerprintSimilarity,
  mints: MintedPosition[],
): PreconditionDecision | null {
  const p = urlShapeOf(pattern);
  const l = urlShapeOf(url);
  if (!p || !l || p.origin !== l.origin) return null;
  const { oneSided, differing } = disputedKeys(p, l);
  const keys = [...oneSided, ...differing];
  const relevant = keys.flatMap((k) => queryFacts(sf, [url, pattern], k));
  // A bare anchor on either side, on an origin whose fragments are known anchors.
  const anchored = (p.hashKind === 'path' && Boolean(p.hashAnchor)) || (l.hashKind === 'path' && Boolean(l.hashAnchor));
  const sameOrigin = sf.origin === originOf(url);
  if (anchored && sameOrigin) relevant.push(...factsFor(sf, 'route.fragment', ''));
  if (!relevant.length) return null;
  const kinds = new Map(keys.map((k) => [k, queryKind(sf, [url, pattern], k)] as const));
  const anchor = anchored && sameOrigin && fragmentFact(sf) === 'anchor';
  const decided = anchor || [...kinds.values()].some((v) => v === 'state' || v === 'routing');
  // Widen: every reliable `state` key the pattern names (query or hash state)
  // becomes `:var`, and a query key only the live url carries is named as
  // `:var` — view state never separates pages, on either side. (A hash-state
  // key only the live url carries already passes: state accumulates.)
  const state = (k: string) => kinds.get(k) === 'state';
  let widened = rewriteQuery(pattern, (k, v) => (state(k) ? ':var' : v));
  widened = withWildKeys(widened, oneSided.filter((k) => state(k) && !hasKey(p, k) && l.query.has(k)));
  const judged = anchor ? withoutAnchor(url) : url;
  if (anchor) widened = withoutAnchor(widened);
  const verdict = preconditionVerdict(widened, judged, params, similarity, mints);
  const split = oneSided.filter((k) => kinds.get(k) === 'routing' && (literal(keyValue(p, k)) || literal(keyValue(l, k))));
  if (verdict.refuse || !split.length) return { verdict, decided, relevant };
  const shown = shownPattern(pattern, params);
  const sides = split.map((k) => `${k} (${hasKey(p, k) ? 'the procedure names it, the page lacks it' : 'the page carries it, the procedure does not name it'})`).join(', ');
  return {
    verdict: {
      warnings: [],
      refuse: `not on the page this procedure starts from (expects ${shown}, browser is at ${describeUrl(url, shown)}; by fact: query key ${sides} selects the page on this route — route.query routing — and only one side carries it)`,
    },
    decided,
    relevant,
  };
}

/**
 * The precondition gate decided by facts: the pattern with every reliable
 * `state` key written `:var` (stage 1's pattern rewrite), and a bare anchor
 * stripped from both sides on an origin whose fragments are reliable anchors,
 * judged by the same preconditionVerdict; then a reliable `routing` key one
 * side carries alone refuses. Null when no fact bears on a disputed key or an
 * anchor.
 */
export function preconditionByFacts(
  sf: SiteFacts,
  pattern: string,
  url: string,
  params: Record<string, string>,
  similarity: FingerprintSimilarity,
  mints: MintedPosition[],
): { refuse: boolean; decided: boolean; relevant: Fact[] } | null {
  const d = preconditionDecision(sf, pattern, url, params, similarity, mints);
  return d ? { refuse: Boolean(d.verdict.refuse), decided: d.decided, relevant: d.relevant } : null;
}

/**
 * Where a segment starts, as both runners judge it: `preconditionVerdict`
 * unless a reliable `route.query` (`state`, `routing`) or `route.fragment`
 * (`anchor`) fact decides — then preconditionByFacts' verdict, in full
 * (warnings, `soft`, `past`). Byte-identical to preconditionVerdict when no
 * reliable fact decides.
 */
export function preconditionVerdictWithFacts(
  sf: SiteFacts,
  pattern: string,
  url: string,
  params: Record<string, string>,
  similarity: FingerprintSimilarity,
  mints: MintedPosition[] = [],
): PreconditionVerdict {
  const d = preconditionDecision(sf, pattern, url, params, similarity, mints);
  if (!d || !d.decided) return preconditionVerdict(pattern, url, params, similarity, mints);
  return d.verdict;
}
