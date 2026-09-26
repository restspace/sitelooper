/**
 * SITE FACTS: what the runner has OBSERVED about an app, per origin, with
 * counts and provenance, so a judgment about the app is made once from
 * evidence and then relied on (notes/design/design-site-facts.md).
 *
 * The survey behind it (rounds 54-65): about two thirds of the non-green rows
 * were decided by a fixed heuristic about the APP while the run already held
 * the evidence to decide it by observation — fwop15-cv2 refused five whole
 * recordings of 01-open on `?query_props` alone (view state, not a record);
 * espo rendered a typed 12500 as "12,500"; odoo's FURN_7777 is a catalogue
 * code, not something the run minted. Each fix so far was one more heuristic,
 * recomputed from one recording and thrown away. A fact is kept.
 *
 * Two rules decide whether a fact DECIDES anything (`reliable`):
 *  - a HARD fact is a structural proof by the runner (the app rendered this
 *    typed value as that text at this control) and is relied on from its first
 *    observation; a SOFT fact is statistical and needs two sessions;
 *  - either way a contradiction drops it to ADVISORY (logged, never deciding),
 *    and contradictions in two sessions retire it.
 *
 * Everything here is pure over a `SiteFacts` document: skills/facts.ts owns
 * the files, the daemon's observers write through it, and compile freezes the
 * origin's facts into the artifact (`FLOW.facts`) so both runners read the
 * same snapshot through these same functions — no parity gap can come from the
 * store. The artifact embeds this exact source (spec/runtime-source.ts), so it
 * must stay self-contained: the sibling url module and nothing else, no node
 * builtins (the value hash is FNV-1a over BigInt, not node:crypto).
 */
import { isWildcardSeg, urlShapeOf } from './url.js';

export type FactKind = 'route.fragment' | 'route.query' | 'route.path' | 'format' | 'value.class' | 'value.shape';
export type FormatKind = 'thousands' | 'decimals' | 'affix' | 'upper' | 'date' | 'trim' | 'twice' | 'counter';
export type FactValue = string | { kind: FormatKind; tpl?: string } | { re: string; n: number };

export interface Fact {
  k: FactKind;
  /** Per kind: a route template with a suffix, a field key, a value hash (see the stage 0 contract). */
  key: string;
  v: FactValue;
  /** Observations of exactly this value under this key. */
  n: number;
  /** Distinct sessions (a recording's daemon session, a replay's run id), most recent last, capped at MAX_SESSIONS. */
  sessions: string[];
  /** Observations of another value under this key since this one was first seen. */
  contra: number;
  /** A structural proof: relied on from one observation. */
  hard: boolean;
  /** ISO times of the first and the last observation. */
  first: string;
  last: string;
  /** One short line of evidence for the last observation, at most MAX_EV characters. */
  ev?: string;
  /**
   * The sessions the contradictions came from (deduped, capped at
   * MAX_SESSIONS): retirement needs two of them, and `contra` alone cannot say
   * whether two contradictions were one session's flake or two sessions'
   * agreement. Absent while `contra` is 0.
   */
  contraSessions?: string[];
}

export interface SiteFacts { version: 1; origin: string; facts: Fact[] }

export interface Observation { k: FactKind; key: string; v: FactValue; hard: boolean; session: string; at?: string; ev?: string }

export type ObserveOutcome = 'new' | 'confirmed' | 'contradicted' | 'retired';

export const SITE_FACTS_VERSION = 1;
/** Facts one origin keeps; the least recently observed go first, so a busy app cannot grow the file without bound. */
export const MAX_FACTS = 2000;
/** Sessions a fact remembers: the count is what matters, and two is what `reliable` asks for. */
export const MAX_SESSIONS = 8;
/** Longest `ev` line. Dropping one that names a run-specific token is the caller's job; the length is this module's. */
export const MAX_EV = 120;

export function emptyFacts(origin: string): SiteFacts {
  return { version: SITE_FACTS_VERSION, origin, facts: [] };
}

/**
 * The same folding flow.ts:2240 applies before comparing two displayed values
 * — whitespace collapsed, trimmed, lower-cased — copied rather than imported
 * because flow.ts is not an embeddable module.
 */
export function foldValue(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/** UTF-8 bytes without TextEncoder or Buffer, so the hash is the same in every runtime the artifact meets. */
function utf8(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return out;
}

/**
 * The key of a `value.class` fact: 64-bit FNV-1a of the folded value, as 16
 * hex characters. The file never holds the text of a value that might be a
 * secret or a person's name (fwgr68/fwkb39: the password was the username),
 * only this — enough to recognise the value again, not to recover it.
 */
export function valueHash(s: string): string {
  let h = FNV_OFFSET;
  for (const b of utf8(foldValue(s))) {
    h ^= BigInt(b);
    h = (h * FNV_PRIME) & MASK_64;
  }
  return h.toString(16).padStart(16, '0');
}

/**
 * A value's SHAPE, as an anchored regex source: every digit run is `\d+`,
 * letters and punctuation stay literal (escaped). Two distinct minted values
 * under one label that share a shape are what a `value.shape` fact records —
 * odoo's S00023 and S00041 are both `^S\d+$`, so the next S000xx under that
 * label is recognisably the same kind of record id at its first sighting.
 */
export function shapeOf(s: string): string {
  const body = s
    .split(/(\d+)/)
    .map((part, i) => (i % 2 === 1 ? '\\d+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return `^${body}$`;
}

/** Two values share a shape. */
export function shapeAgrees(a: string, b: string): boolean {
  return shapeOf(a) === shapeOf(b);
}

/**
 * A url segment that stands for a record rather than a page: digit-dominant
 * as shape.ts `digitDominant` reads it (at least as many digits as anything
 * else, or one '-'/'_' piece that is — "4", "S00023", "fwrd24l-n1"), or any
 * segment with two or more digits whatever its letters (an espo or grafana
 * id, "afw6yy5xx9"). A route key over-merging two pages is the weaker
 * direction; one key per record is useless as a key.
 */
function recordSeg(seg: string): boolean {
  const digits = (x: string) => (x.match(/\d/g) ?? []).length;
  const dominated = (x: string) => digits(x) > 0 && digits(x) >= x.length - digits(x);
  if (digits(seg) >= 2) return true;
  return dominated(seg) || (/[-_]/.test(seg) && seg.split(/[-_]+/).some(dominated));
}

/**
 * The ROUTE a url is on, the stem of every url-derived key: origin and path,
 * every wildcard marker (`:id`, `:var`, `{{v1}}`) and every record-shaped
 * segment written `*`, no query and no fragment — except a fragment that is
 * itself a route (`#/orders/12`, espo's `#Opportunity/view/<id>`), which is
 * appended the same way. A bare-word fragment is an in-page anchor (snipeit's
 * `/hardware/4#history`, fwsi9) and a `k=v` fragment is state (odoo): neither
 * names the page. This is compile.ts `urlPattern(url, {query: false})` with
 * the markers normalised, reimplemented over urlShapeOf because compile.ts is
 * not embeddable. Text that is not a url is its own route.
 */
export function routeTemplateOf(url: string): string {
  const shape = urlShapeOf(url);
  if (!shape) return url;
  const seg = (s: string) => (isWildcardSeg(s) || s === '*' || recordSeg(s) ? '*' : s);
  let out = `${shape.origin}/${shape.path.map(seg).join('/')}`;
  if (shape.hashKind === 'path' && !shape.hashAnchor) out += `#${shape.hashSlash ? '/' : ''}${shape.hashPath.map(seg).join('/')}`;
  return out;
}

/**
 * Whether two observed values are the same fact value. A shape compares by
 * its regex only: its `n` is a running count of the values that agreed, not
 * part of what was observed.
 */
export function sameFactValue(a: FactValue, b: FactValue): boolean {
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if ('re' in a || 're' in b) return 're' in a && 're' in b && a.re === b.re;
  return a.kind === b.kind && (a.tpl ?? '') === (b.tpl ?? '');
}

/**
 * Whether two facts under one key compete. Everywhere but `format` a key has
 * one true value, so any other value contradicts it. A field's formats
 * COMBINE — espo renders 12500 as "12,500.00", a `thousands` and a `decimals`
 * fact under one key — so only two formats of the same kind (two affix
 * templates) compete.
 */
function competes(a: Fact | Observation, b: Fact | Observation): boolean {
  if (a.k !== b.k || a.key !== b.key || sameFactValue(a.v, b.v)) return false;
  if (a.k !== 'format') return true;
  const kind = (v: FactValue) => (typeof v === 'object' && 'kind' in v ? v.kind : '');
  return kind(a.v) === kind(b.v);
}

function clipEv(ev: string | undefined): string | undefined {
  if (ev === undefined) return undefined;
  return ev.length > MAX_EV ? `${ev.slice(0, MAX_EV - 1)}…` : ev;
}

function addSession(list: string[], session: string): string[] {
  const out = list.filter((s) => s !== session);
  out.push(session);
  return out.length > MAX_SESSIONS ? out.slice(out.length - MAX_SESSIONS) : out;
}

/** Drop the least recently observed facts past MAX_FACTS. Mutates and returns `sf`. */
export function evict(sf: SiteFacts, max: number = MAX_FACTS): SiteFacts {
  if (sf.facts.length <= max) return sf;
  const keep = new Set(
    [...sf.facts].sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0)).slice(0, max),
  );
  sf.facts = sf.facts.filter((f) => keep.has(f));
  return sf;
}

/**
 * Merge one observation into `sf` (in place) and say what it did:
 *  - `new`: nothing was known under the key;
 *  - `confirmed`: the same value was known: `n`, the session, `last`, `hard`
 *    (a proof, once seen, stays a proof) and `ev` are brought up to date;
 *  - `contradicted`: another value was known: the new value is recorded;
 *  - `retired`: as either of the two above, and a competing fact reached two
 *    contradictions from two sessions and was removed (listed in `retired`).
 *
 * A contradiction is SYMMETRIC: every observation of a value counts against
 * every competing value under the key, whether it is new or confirmed, and a
 * new value arriving over a stored one starts with the stored one's evidence
 * against it (`contra` 1). So neither side decides while the dispute lasts
 * (both advisory: never guess), and the dispute ends the way the design asks
 * — the value that is re-observed in two sessions retires the other. A fact
 * left with no rival under its key has outlived every contradiction it had,
 * so once it has been seen in two sessions they are cleared and it decides
 * again on its own evidence (a newcomer that won on one session's word stays
 * advisory until a second session sees it).
 *
 * Then the origin is evicted to MAX_FACTS by oldest `last`.
 */
export function observeFact(sf: SiteFacts, o: Observation): { fact: Fact; outcome: ObserveOutcome; retired: Fact[] } {
  const at = o.at ?? new Date().toISOString();
  const rivals = sf.facts.filter((f) => competes(f, o));
  let fact = sf.facts.find((f) => f.k === o.k && f.key === o.key && sameFactValue(f.v, o.v));
  let outcome: ObserveOutcome;
  if (fact) {
    fact.n += 1;
    fact.sessions = addSession(fact.sessions, o.session);
    fact.last = at;
    fact.hard ||= o.hard;
    // a shape's n is the running count of values that agreed on it
    if (typeof fact.v === 'object' && 're' in fact.v && typeof o.v === 'object' && 're' in o.v) {
      fact.v = { re: fact.v.re, n: Math.max(fact.v.n, o.v.n) };
    }
    const ev = clipEv(o.ev);
    if (ev === undefined) delete fact.ev;
    else fact.ev = ev;
    outcome = 'confirmed';
  } else {
    fact = {
      k: o.k, key: o.key, v: typeof o.v === 'string' ? o.v : { ...o.v },
      n: 1, sessions: [o.session], contra: 0, hard: o.hard, first: at, last: at,
    };
    const ev = clipEv(o.ev);
    if (ev !== undefined) fact.ev = ev;
    if (rivals.length) {
      fact.contra = 1;
      fact.contraSessions = [o.session];
    }
    sf.facts.push(fact);
    outcome = rivals.length ? 'contradicted' : 'new';
  }
  const retired: Fact[] = [];
  for (const rival of rivals) {
    rival.contra += 1;
    rival.contraSessions = addSession(rival.contraSessions ?? [], o.session);
    if (rival.contra >= 2 && rival.contraSessions.length >= 2) retired.push(rival);
  }
  if (retired.length) {
    sf.facts = sf.facts.filter((f) => !retired.includes(f));
    outcome = 'retired';
  }
  if (fact.contra > 0 && fact.sessions.length >= 2 && !sf.facts.some((f) => competes(f, fact!))) {
    fact.contra = 0;
    delete fact.contraSessions;
  }
  evict(sf);
  return { fact, outcome, retired };
}

/** Relied on: never contradicted, and either proven or seen in two sessions. */
export function reliable(f: Fact): boolean {
  return f.contra === 0 && (f.hard || f.sessions.length >= 2);
}

/** Present but not relied on: logged beside today's heuristic, never deciding. */
export function advisory(f: Fact): boolean {
  return !reliable(f);
}

export function factsFor(sf: SiteFacts, k: FactKind, key: string): Fact[] {
  return sf.facts.filter((f) => f.k === k && f.key === key);
}

/**
 * The one reliable fact under a key, or null. Two reliable facts under one key
 * is a contradiction the observer missed: null, never a guess between them.
 */
export function factFor(sf: SiteFacts, k: FactKind, key: string): Fact | null {
  const relied = factsFor(sf, k, key).filter(reliable);
  return relied.length === 1 ? relied[0] : null;
}

function stringFact<T extends string>(sf: SiteFacts, k: FactKind, key: string, allowed: readonly T[]): T | null {
  const v = factFor(sf, k, key)?.v;
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

/** What a fragment is on this origin: a route, application state, or an in-page anchor. */
export function fragmentFact(sf: SiteFacts): 'path' | 'state' | 'anchor' | null {
  return stringFact(sf, 'route.fragment', '', ['path', 'state', 'anchor'] as const);
}

/** What a query key is on the url's route: view state (fwop15's `query_props`), a record, or a page selector (kanboard's `controller`). */
export function routeQueryFact(sf: SiteFacts, url: string, key: string): 'state' | 'identity' | 'routing' | null {
  return stringFact(sf, 'route.query', `${routeTemplateOf(url)}?${key}`, ['state', 'identity', 'routing'] as const);
}

/** What a path position is on the url's route: a record id or a constant. `index` is the 0-based path index, urlParts' `p<index>`. */
export function pathPositionFact(sf: SiteFacts, url: string, index: number): 'identity' | 'constant' | null {
  return stringFact(sf, 'route.path', `${routeTemplateOf(url)}#${index}`, ['identity', 'constant'] as const);
}

/** Every reliable display format of a field. Formats combine, so this is a list, never factFor. */
export function formatFacts(sf: SiteFacts, key: string): { kind: FormatKind; tpl?: string }[] {
  return factsFor(sf, 'format', key)
    .filter(reliable)
    .map((f) => f.v)
    .filter((v): v is { kind: FormatKind; tpl?: string } => typeof v === 'object' && 'kind' in v)
    .map((v) => (v.tpl === undefined ? { kind: v.kind } : { kind: v.kind, tpl: v.tpl }));
}

/** "12500" → "12,500": group the integer part of a plain number; anything else is left alone. */
function groupThousands(s: string): string {
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(s);
  if (!m) return s;
  return `${m[1]}${m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${m[3] ?? ''}`;
}

/** "12,500" → "12,500.00": a `.00` tail on a whole number, a one-digit fraction padded. */
function withDecimals(s: string): string {
  if (/^-?[\d,]+$/.test(s) && /\d/.test(s)) return `${s}.00`;
  if (/^-?[\d,]+\.\d$/.test(s)) return `${s}0`;
  return s;
}

/**
 * How the app would SHOW `value` in this field, from its reliable formats:
 * the value with every transformation applied (numbers, then case and
 * whitespace, then the affix), and, when there is an affix, the same without
 * it — a read may meet the bare core (espo's "12,500.00") or the framed title
 * (kanboard's "#4"). `date`, `twice` and `counter` describe the field without
 * saying how to spell a value, so they add nothing. Empty when no reliable
 * format applies.
 */
export function renderings(sf: SiteFacts, key: string, value: string): string[] {
  const formats = formatFacts(sf, key);
  const has = (kind: FormatKind) => formats.some((f) => f.kind === kind);
  let core = value;
  let changed = false;
  const apply = (kind: FormatKind, fn: (s: string) => string) => {
    if (!has(kind)) return;
    core = fn(core);
    changed = true;
  };
  apply('thousands', groupThousands);
  apply('decimals', withDecimals);
  apply('trim', (s) => s.trim());
  apply('upper', (s) => s.toUpperCase());
  const framed = formats
    .filter((f) => f.kind === 'affix' && f.tpl?.includes('{{=}}'))
    .map((f) => f.tpl!.split('{{=}}').join(core));
  if (!changed && !framed.length) return [];
  return [...new Set([...framed, ...(changed ? [core] : [])])];
}

/** What this value is on this origin: a catalogue constant, a run's mint, or a credential. */
export function valueClassFact(sf: SiteFacts, value: string): 'constant' | 'mint' | 'credential' | null {
  return stringFact(sf, 'value.class', valueHash(value), ['constant', 'mint', 'credential'] as const);
}

/** The reliable shape of the values minted under a label (`${route}|${label}`). */
export function shapeFact(sf: SiteFacts, key: string): { re: string } | null {
  const v = factFor(sf, 'value.shape', key)?.v;
  return typeof v === 'object' && 're' in v ? { re: v.re } : null;
}

/** The value has the label's reliable mint shape. False when there is none, or it does not compile. */
export function matchesShape(sf: SiteFacts, key: string, value: string): boolean {
  const shape = shapeFact(sf, key);
  if (!shape) return false;
  try {
    return new RegExp(shape.re).test(value);
  } catch {
    return false;
  }
}

/**
 * The counts `compile --json` reports per origin: `relied` facts (of which
 * `hard` were proven and `soft` counted across sessions) and `advisory` ones.
 * `hard + soft === relied`.
 */
export function summarise(sf: SiteFacts): { origin: string; relied: number; advisory: number; hard: number; soft: number } {
  const relied = sf.facts.filter(reliable);
  return {
    origin: sf.origin,
    relied: relied.length,
    advisory: sf.facts.length - relied.length,
    hard: relied.filter((f) => f.hard).length,
    soft: relied.filter((f) => !f.hard).length,
  };
}
