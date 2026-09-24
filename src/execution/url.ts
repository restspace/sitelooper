/**
 * Url rules both execution targets share: how a url is reduced to the shape
 * that identifies its page, how a stored pattern is judged against a live url,
 * and how the addressable parts of a url are labelled for derived values.
 *
 * The daemon imports this module (through skills/compile.ts) and a compiled
 * `.flow.ts` artifact embeds its exact source (spec/runtime-source.ts), so it
 * must stay self-contained: nothing but a sibling shared module or a
 * Playwright type may be imported. `urlPattern`, which needs the slot
 * substitution and id-shape heuristics of compile.ts, deliberately stays there.
 */

/** Inverse of substitute(): fill "{{vN}}" (caller param) and "{{dN}}" (derived,
 * bound from the live run's own urls) markers from a param map. */
export function fillParams(text: string, params: Record<string, string>): string {
  return text.replace(/\{\{([vd]\d+)\}\}/g, (m, name: string) => (name in params ? params[name] : m));
}

export function fillParamsDeep(value: unknown, params: Record<string, string>): unknown {
  if (typeof value === 'string') return fillParams(value, params);
  if (Array.isArray(value)) return value.map((v) => fillParamsDeep(v, params));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, fillParamsDeep(v, params)]));
  }
  return value;
}

/**
 * The origin a url (or a stored url pattern) is "home" to: `http(s)://host`,
 * the opaque `file://` for a local page, null for anything else or for text
 * that is not a url. Both runners derive a step's `stayOnOrigin` from this —
 * the recorded url pattern first, the live page otherwise — so it lives here
 * rather than in the skill store, which re-exports it.
 */
export function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return u.protocol === 'file:' ? 'file://' : null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * A url decomposed for structural matching: origin, path segments, query
 * pairs, and the hash fragment as either route segments or state pairs.
 * Parses stored patterns (which may carry `:id` / `:var` / `{{…}}` markers)
 * and live urls alike.
 *
 * The query string used to be dropped, so `edit?id=123` and `edit?id=999`
 * were one page and kanboard's every `?controller=…&action=…` route read as
 * `/` (notes/ROBUSTNESS.md, finding 3). It is kept now, less the keys `noiseQueryKey`
 * names: tracking tags and cache busters say nothing about which page it is.
 */
export interface UrlShape {
  origin: string;
  path: string[];
  query: Map<string, string>;
  hashKind: 'none' | 'path' | 'state';
  hashPath: string[];
  hashState: Map<string, string>;
  /** Whether a path-shaped fragment began with '/', for round-tripping. */
  hashSlash: boolean;
  /**
   * The fragment is an in-page ANCHOR, not a route: one bare word, with no
   * '/' anywhere and no '=' (`#history`, a tab). Still kept as a one-segment
   * hash path, so a pattern that names it matches it; see urlDiff.
   */
  hashAnchor?: boolean;
}

/** A query key that never identifies a page: campaign tags, click ids, a cache buster. */
export function noiseQueryKey(key: string): boolean {
  return /^utm_/i.test(key) || /^(fbclid|gclid|msclkid|_|_t|cb)$/i.test(key);
}

/**
 * A url key whose value is a credential: OAuth tokens, codes, sessions,
 * signatures. Its value is masked wherever a url is shown, and a recorded
 * pattern stores it as a wildcard, never the value.
 */
export const CREDENTIAL_KEY = /token|secret|passw|session|auth|code|sig|key|credential|nonce|jwt/i;

/** The query string's pairs, decoded, noise keys dropped; a repeated key keeps every value, comma-joined. */
export function queryPairs(search: string): Map<string, string> {
  const out = new Map<string, string>();
  const body = search.startsWith('?') ? search.slice(1) : search;
  for (const pair of body.split('&').filter(Boolean)) {
    const eq = pair.indexOf('=');
    const key = safeDecode(eq < 0 ? pair : pair.slice(0, eq));
    if (!key || noiseQueryKey(key)) continue;
    const value = eq < 0 ? '' : safeDecode(pair.slice(eq + 1).replace(/\+/g, ' '));
    out.set(key, out.has(key) ? `${out.get(key)},${value}` : value);
  }
  return out;
}

export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function urlShapeOf(s: string): UrlShape | null {
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const origin = u.protocol === 'file:' ? 'file://' : u.origin;
  const shape: UrlShape = {
    origin,
    path: u.pathname.split('/').filter(Boolean).map(safeDecode),
    query: queryPairs(u.search),
    hashKind: 'none',
    hashPath: [],
    hashState: new Map(),
    hashSlash: false,
  };
  const body = u.hash && u.hash.length > 1 ? u.hash.slice(1).split('?')[0] : '';
  if (!body) return shape;
  if (body.startsWith('/') || !body.includes('=')) {
    shape.hashKind = 'path';
    shape.hashSlash = body.startsWith('/');
    shape.hashPath = body.split('/').filter(Boolean).map(safeDecode);
    if (!body.includes('/')) shape.hashAnchor = true;
    return shape;
  }
  shape.hashKind = 'state';
  for (const pair of body.split('&').filter(Boolean)) {
    const eq = pair.indexOf('=');
    if (eq < 0) shape.hashState.set(pair, '');
    else shape.hashState.set(pair.slice(0, eq), safeDecode(pair.slice(eq + 1)));
  }
  return shape;
}

export function serializeShape(s: UrlShape): string {
  let hash = '';
  if (s.hashKind === 'path') hash = '#' + (s.hashSlash ? '/' : '') + s.hashPath.join('/');
  else if (s.hashKind === 'state') {
    hash = '#' + [...s.hashState].map(([k, v]) => `${k}=${v}`).sort().join('&');
  }
  const query = s.query.size ? '?' + [...s.query].map(([k, v]) => `${k}=${v}`).sort().join('&') : '';
  return `${s.origin}/${s.path.join('/')}${query}${hash}`;
}

/** A pattern segment that stands for "any value here". */
export function isWildcardSeg(seg: string): boolean {
  return seg === ':id' || seg === ':var' || /\{\{[\w.-]+\}\}/.test(seg);
}

/**
 * A slot the run could not fill asks for no particular value. `fillParams`
 * substitutes on `name in params`, so a slot whose value is '' becomes an
 * empty literal, and an empty literal matches only emptiness. But '' is how
 * an unpublished reference reaches a call site — the artifact defaults one to
 * the empty string — so it means NEVER PUBLISHED, not "known to be empty".
 * Everything else that reads a bound slot already says so: boundQueryKeys,
 * markersBound, urlRecordParts, gotoLandingVerdict's `want !== ''`, and the
 * artifact's own `need`, whose message for '' is "this run never published it".
 *
 * fwgr45: a step reported the word "browser", the flow threaded it into
 * `timezone={{v5}}`, no read published it, so v5 filled to '' and the compiled
 * arm stopped on the RIGHT dashboard — `timezone=` against `timezone=browser`
 * — while both replays ran 7/7 at 0 turns.
 */
function unfilled(seg: string): boolean {
  return seg === '';
}

/** One segment where a pattern's literal disagrees with the live url. */
export interface UrlSegDiff {
  where: 'path' | 'query' | 'hashPath' | 'hashState';
  index?: number;
  key?: string;
  expected: string;
  actual: string;
}

/**
 * Structural comparison of a stored pattern against a live url: `null` when
 * the two are not even the same page shape (different origin, path length,
 * route, or a required state key missing), otherwise the list of segments
 * where a literal in the pattern disagrees with the live value — empty list
 * means a match. Wildcard segments (`:id`, `:var`, unfilled `{{…}}`) match
 * anything: matching consults the pattern's own markers, never a shape
 * heuristic on the live value (that is what made the url shape test load-bearing).
 *
 * A query-shaped fragment is application STATE, and state accumulates (Odoo
 * lands on "#cids=1" and has grown "#action=…&menu_id=…" by the next
 * segment) — so it is a necessary condition: every pair the pattern names
 * must be present, extra live pairs are allowed, and a pattern with no hash
 * requires nothing of a live state fragment. A path-shaped fragment is a
 * route and must match segment for segment.
 *
 * The query is judged on the keys BOTH urls carry: a value that disagrees
 * there is a segment that disagrees (`?status=success` against
 * `?status=failure`). A key only one side has is not evidence of a different
 * page — grafana adds and drops `refresh=1m` on the same dashboard, and a
 * recording can catch its url before or after the app rewrites it — with one
 * exception: a key in `boundKeys`, which the pattern fills from a caller or
 * derived value (`edit?id={{v1}}`), names the record, and a live url without
 * it is not that record. `urlMatches` and `softUrlMatch` pass those keys,
 * read off the pattern before its markers are filled.
 */
export function urlDiff(pattern: string, url: string, boundKeys: ReadonlySet<string> = new Set()): UrlSegDiff[] | null {
  const p = urlShapeOf(pattern);
  const l = urlShapeOf(url);
  if (!p || !l) return pattern === url ? [] : null;
  if (p.origin !== l.origin || p.path.length !== l.path.length) return null;
  const diffs: UrlSegDiff[] = [];
  p.path.forEach((seg, i) => {
    if (!isWildcardSeg(seg) && seg !== l.path[i]) diffs.push({ where: 'path', index: i, expected: seg, actual: l.path[i] });
  });
  for (const [key, val] of p.query) {
    if (!l.query.has(key)) {
      if (boundKeys.has(key)) return null;
      continue;
    }
    const lv = l.query.get(key)!;
    if (!isWildcardSeg(val) && !unfilled(val) && val !== lv) diffs.push({ where: 'query', key, expected: val, actual: lv });
  }
  if (p.hashKind === 'path') {
    if (l.hashKind !== 'path' || p.hashPath.length !== l.hashPath.length) return null;
    p.hashPath.forEach((seg, i) => {
      if (!isWildcardSeg(seg) && seg !== l.hashPath[i]) diffs.push({ where: 'hashPath', index: i, expected: seg, actual: l.hashPath[i] });
    });
  } else if (p.hashKind === 'state') {
    if (l.hashKind !== 'state') return null;
    for (const [key, val] of p.hashState) {
      // A key the pattern only knows as a wildcard (`:id`, a {{dN}} it never
      // learned a value for) is app-minted state, not identity: odoo adds
      // `cids=1` to a url on one run and not the next, and fwod32's sign-in
      // stopped on every replay because the live url lacked it. A missing
      // key with a LITERAL value is still a different page.
      if (!l.hashState.has(key)) {
        if (isWildcardSeg(val)) continue;
        return null;
      }
      const lv = l.hashState.get(key)!;
      if (!isWildcardSeg(val) && !unfilled(val) && val !== lv) diffs.push({ where: 'hashState', key, expected: val, actual: lv });
    }
  } else if (l.hashKind === 'path' && l.hashPath.length && !l.hashAnchor) {
    // Pattern names no route; the live url is on one. An in-page anchor is
    // not a route: snipeit fwsi2-n2's 04-create recovery ended on
    // `/hardware/5#history` (the History tab), and the next step's start gate
    // refused it against `/hardware/:id`. EspoCRM's `#Opportunity/view/<id>`
    // and `#/…` routes carry a '/', odoo's state carries '=': both still count.
    return null;
  }
  return diffs;
}

/**
 * The query keys only one side of a match carries, which urlDiff lets pass
 * (see its note): a literal-valued key the pattern names and the live url
 * lacks, and a key the live url has that the pattern does not name. Wildcard
 * pattern keys are app-minted state and not listed. These are the keys a
 * strict match took on trust — `editview=json-model` is one of them, and it is
 * a different VIEW of the dashboard, not the same page (fwgr36 04-open).
 */
export function oneSidedQueryKeys(pattern: string, url: string): string[] {
  const p = urlShapeOf(pattern);
  const l = urlShapeOf(url);
  if (!p || !l) return [];
  const out: string[] = [];
  for (const [key, val] of p.query) if (!l.query.has(key) && !isWildcardSeg(val)) out.push(key);
  for (const key of l.query.keys()) if (!p.query.has(key)) out.push(key);
  return out;
}

/** Whether a live url matches a stored pattern exactly (wildcards aside). */
export function urlMatches(pattern: string, url: string, params: Record<string, string> = {}): boolean {
  return urlDiff(fillParams(pattern, params), url, boundQueryKeys(pattern, params))?.length === 0;
}

/** The query keys a pattern fills from a marker `params` binds — see urlDiff. */
export function boundQueryKeys(pattern: string, params: Record<string, string>): Set<string> {
  const shape = urlShapeOf(pattern);
  // Typed on the binding, not the constructor: execution-echo.test.ts tells a
  // ledger-free artifact by the constructor spelling a ledger uses.
  const out: Set<string> = new Set();
  if (!shape) return out;
  for (const [key, val] of shape.query) {
    if ([...val.matchAll(/\{\{([vd]\d+)\}\}/g)].some((m) => params[m[1]])) out.add(key);
  }
  return out;
}

/**
 * The default soft-match budget: how many disagreeing positions a caller who
 * has nothing but the url will soften. It is a PROXY for "is this a different
 * page?" — many disagreements used to stand in for that question — and it is
 * the weakest thing in this module, so it is a default and not a law.
 *
 * What actually makes a softening safe is enforced PER DIFF in softUrlMatch,
 * not by this count: no WORD position (`/orders/success` against
 * `/orders/failure`), no position the pattern fills from a parameter. Those
 * hold at any budget.
 *
 * fwgr49: three positions disagreed on one grafana dashboard — the uid and the
 * two halves of a `from`/`to` range — and the count alone refused the segment,
 * while the SAME round's sibling skill carried the uid in a derived slot,
 * left two diffs, soft-matched and ran. Two vary and it works, three and it
 * collapses: the discriminator was the count, on a page measuring 0.994
 * similar to the recording. A caller that can ask the real question instead
 * passes its own budget (see preconditionVerdict).
 */
const MAX_SOFT_DIFFS = 2;

/**
 * Whether a url value has the shape of something an environment MINTS: one
 * unbroken token carrying a digit (`rec-1`, `afw6yy5xx9`, `133`), or with no
 * '-'/'_' at least twelve characters or eight hex letters. A word or a slug of
 * words (`edit`, `success`, `order-history`) is a route an application chose,
 * and a different one is a different page. The generous arm of
 * skills/shape.ts's `generatedToken`, restated because this module may import
 * nothing.
 */
export function mintedShape(value: string): boolean {
  if (!value || /\s/.test(value)) return false;
  if (/\d/.test(value)) return true;
  if (/[_-]/.test(value)) return false;
  return value.length >= 12 || /^[0-9a-f]{8,}$/i.test(value);
}

/**
 * Mechanism-2 tolerance (PLAN-replay-v2): the live url is the same page
 * SHAPE as the pattern but a few literal segments disagree — the signature of
 * an environment-minted identifier (a Grafana uid, an Odoo action id) that
 * this run minted differently. Returns the pattern with exactly the
 * disagreeing segments generalised to `:var`, for the caller to proceed
 * optimistically and PERSIST only once the run past this point succeeds —
 * the segment has then demonstrated volatility. Null when the urls differ in
 * shape, everything matched already, or a slot value broke segmentation.
 *
 * A disagreement alone is not evidence of volatility, so two kinds are never
 * soft (notes/ROBUSTNESS.md, finding 3):
 *  - a segment where either side is a WORD rather than a minted shape:
 *    `/orders/success` against `/orders/failure`, `/items/7/edit` against
 *    `/items/7/view`, are different pages, and generalising them to `:var`
 *    would have let the url gate — and every later run — accept either;
 *  - a segment the pattern fills from a PARAMETER (`{{v1}}`, a bound
 *    `{{d1}}`): the caller named that record, and a different value there is
 *    a different record, not a volatile one.
 *
 * `maxDiffs` is how many disagreeing positions this caller will soften,
 * defaulting to MAX_SOFT_DIFFS — see there for why it is a proxy and what a
 * caller has to hold to raise it. The two guards above are per diff and do not
 * move with it.
 */
export function softUrlMatch(
  pattern: string,
  url: string,
  params: Record<string, string> = {},
  maxDiffs: number = MAX_SOFT_DIFFS,
): { generalised: string; diffs: UrlSegDiff[] } | null {
  const filled = fillParams(pattern, params);
  const diffs = urlDiff(filled, url, boundQueryKeys(pattern, params));
  if (!diffs || !diffs.length || diffs.length > maxDiffs) return null;
  // Generalise in the ORIGINAL pattern (markers intact). A param value
  // containing '/' would shift segment positions between the two — bail.
  const orig = urlShapeOf(pattern);
  const fld = urlShapeOf(filled);
  if (!orig || !fld || orig.path.length !== fld.path.length || orig.hashPath.length !== fld.hashPath.length) return null;
  for (const d of diffs) {
    if (!mintedShape(d.expected) || !mintedShape(d.actual)) return null;
    const recorded =
      d.where === 'path' ? orig.path[d.index!] : d.where === 'hashPath' ? orig.hashPath[d.index!] : d.where === 'query' ? orig.query.get(d.key!) : orig.hashState.get(d.key!);
    if (recorded === undefined || recorded.includes('{{')) return null;
  }
  for (const d of diffs) {
    if (d.where === 'path') orig.path[d.index!] = ':var';
    else if (d.where === 'query') orig.query.set(d.key!, ':var');
    else if (d.where === 'hashPath') orig.hashPath[d.index!] = ':var';
    else orig.hashState.set(d.key!, ':var');
  }
  return { generalised: serializeShape(orig), diffs };
}

/**
 * The addressable parts of a url, labelled stably so a value observed at
 * record time can be re-extracted from the live run's url at the same
 * position: path segments `p<i>`, hash-route segments `h<i>`, hash-state
 * values `q.<key>`.
 */
export function urlParts(url: string): { label: string; value: string }[] {
  const s = urlShapeOf(url);
  if (!s) return [];
  const out: { label: string; value: string }[] = [];
  s.path.forEach((value, i) => out.push({ label: `p${i}`, value }));
  s.hashPath.forEach((value, i) => out.push({ label: `h${i}`, value }));
  for (const [k, value] of s.hashState) out.push({ label: `q.${k}`, value });
  return out;
}

/**
 * One labelled part of a url. A `q.<key>` label reads the hash state first,
 * as urlParts enumerates it, and otherwise the ordinary query string: a
 * record id minted into `?task_id=4` (kanboard fwkb41, ledger.ts
 * linkMintedParts) is bound, published and checked by this label in both
 * runners. urlParts itself still enumerates hash state only, so nothing that
 * walks every part starts seeing query values.
 */
export function urlPart(url: string, label: string): string | undefined {
  const hit = urlParts(url).find((p) => p.label === label)?.value;
  if (hit !== undefined || !label.startsWith('q.')) return hit;
  return urlShapeOf(url)?.query.get(label.slice(2));
}
