/**
 * Url positions the APP minted, read off one recording.
 *
 * ERPNext (Frappe desk) opens every new document at a url it makes up for that
 * form instance: `goto /app/sales-order/new` lands on
 * `/app/sales-order/new-sales-order-rxojnkvnht`, and `/app/customer/new` is
 * rewritten to `/app/customer/new-customer-uqaxhomexe` a moment after it loads.
 * fwen1-luna froze n1's value into every url pattern of the create procedures,
 * so both replays refused their own fresh form at the start gate ("expects
 * …/new-sales-order-rxojnkvnht, browser is at …/new-sales-order-odmclosvvb").
 * The soft match could not rescue it, rightly: `new-sales-order-…` is a slug
 * of words, and a word position is never softened on its look.
 *
 * EVIDENCE, NOT SHAPE (notes/PLAN-evidence-over-shape.md). Nothing here reads
 * what a value looks like. A position is the app's when the recording watched
 * the app put a value there that the procedure never asked for:
 *
 *  - a `goto` the procedure addressed to one url LANDED on another that
 *    differs from it at exactly one path (or hash-route) position — the
 *    procedure typed `new`, the app answered `new-sales-order-rxojnkvnht`;
 *  - or the url changed at exactly one such position during a `fill` or
 *    `type`, a step that cannot navigate — the page was rewritten under the
 *    procedure, not by it (`/app/customer/new` → `new-customer-uqaxhomexe`).
 *
 * And the value the app put there must be new to the recording: never part of
 * any url the run had seen before that step, nor carrying a value the step
 * itself typed (a search box that routes to `/search/<term>` routes to what the
 * procedure typed — that is the procedure's value). The position must sit on a
 * route, below at least one segment the two urls share: a root that sends
 * `/login` to `/home` is the app choosing a different PAGE, and generalising
 * the first segment would make every one-segment url match every other.
 *
 * What it buys: every url pattern of the compiled procedure that carries one
 * of the two values (the one asked for and the one given) at that route and
 * position is written `:var` — the wildcard the replay gate, urlDiff and the
 * compiled artifact (which embeds execution/url.ts) already honour. Only those
 * two values: another record's url on the same route (`/app/customer/<name>`,
 * a slot or a literal) keeps its identity.
 */
import type { RecordedStep } from '../daemon/recorder.js';
import { originOf, routeAt, safeDecode, urlPart, urlParts, urlShapeOf } from '../execution/url.js';

/** One url position the app minted: the route it sits on (url.ts routeAt), its label, and the values seen there. */
export interface AppMintedPosition {
  route: string;
  label: string;
  /** How many route parts (path and hash-route segments) the url had: the evidence is about that template, not a deeper one. */
  parts: number;
  /** The value the procedure asked for (or stood on) and the value the app put there instead. */
  values: string[];
}

const VALUE_ENTRY = new Set(['fill', 'type']);

/** The route-bearing parts of a url: path `p<i>` and hash-route `h<i>` labels — never query or state, nor an in-page anchor (`#history`, url.ts hashAnchor). */
function routeParts(url: string): { label: string; value: string }[] {
  const anchor = urlShapeOf(url)?.hashAnchor === true;
  return urlParts(url).filter((p) => !p.label.startsWith('q.') && !(anchor && p.label.startsWith('h')));
}

/**
 * The single route position where `asked` and `got` disagree, when they are
 * the same route shape (origin, path and hash-route lengths) and disagree at
 * exactly one position below at least one shared segment. Null otherwise.
 */
function oneRedirectedPosition(asked: string, got: string): { label: string; from: string; to: string } | null {
  if (!originOf(asked) || originOf(asked) !== originOf(got)) return null;
  const a = routeParts(asked);
  const g = routeParts(got);
  if (a.length !== g.length || a.some((p, i) => p.label !== g[i].label)) return null;
  const diffs = a.map((p, i) => ({ label: p.label, from: p.value, to: g[i].value, i })).filter((d) => d.from !== d.to);
  if (diffs.length !== 1) return null;
  const d = diffs[0];
  // Below at least one shared route segment: never the first one.
  if (d.i === 0 || !d.from || !d.to) return null;
  return { label: d.label, from: d.from, to: d.to };
}

/** What the step itself typed: its fill `value` / type `text`. */
function typedBy(step: RecordedStep): string[] {
  return [step.args?.value, step.args?.text].filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim().toLowerCase());
}

/**
 * Every route position the app minted in this recording (see the module note),
 * walked in order from `startUrl`. Steps without a url diff move nothing.
 */
export function appMintedPositions(startUrl: string | undefined, steps: readonly RecordedStep[]): AppMintedPosition[] {
  const out: AppMintedPosition[] = [];
  const seen = new Set<string>();
  const see = (url: string | undefined) => {
    if (url) for (const p of urlParts(url)) seen.add(p.value);
  };
  let current = startUrl;
  see(current);
  for (const step of steps) {
    const landed = step.diff?.url;
    let asked: string | undefined;
    if (step.tool === 'goto' && typeof step.args?.url === 'string') {
      try {
        asked = new URL(step.args.url, current).href;
      } catch {
        asked = undefined;
      }
    } else if (VALUE_ENTRY.has(step.tool)) asked = current;
    if (landed && asked) {
      const d = oneRedirectedPosition(asked, landed);
      const typed = typedBy(step);
      const route = d ? routeAt(landed, d.label) : null;
      if (d && route && routeAt(asked, d.label) === route && !seen.has(d.to) && !typed.some((t) => d.to.toLowerCase().includes(t))) {
        const parts = routeParts(landed).length;
        const known = out.find((m) => m.route === route && m.label === d.label && m.parts === parts);
        if (known) {
          for (const v of [d.from, d.to]) if (!known.values.includes(v)) known.values.push(v);
        } else out.push({ route, label: d.label, parts, values: [d.from, d.to] });
      }
    }
    // A navigation's address is something the procedure asked for: seen from here on.
    if (step.tool === 'goto' && typeof step.args?.url === 'string') {
      try {
        see(new URL(step.args.url, current).href);
      } catch {
        /* not a url */
      }
    }
    if (landed) {
      see(landed);
      current = landed;
    }
  }
  return out;
}

/**
 * `pattern` (a stored url pattern: markers, `:id`, `:var` and all) with every
 * app-minted position written `:var` — only where the pattern sits on that
 * position's route, at the same depth, and carries one of the values the
 * recording saw there.
 * Anything else, including a marker at that position, is left as it is.
 */
export function generaliseAppMinted(pattern: string, positions: readonly AppMintedPosition[]): string {
  if (!positions.length) return pattern;
  const m = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(pattern);
  if (!m) return pattern;
  const origin = m[1];
  let path = m[2];
  const query = m[3] ?? '';
  let hash = m[4] ?? '';
  for (const pos of positions) {
    const value = urlPart(pattern, pos.label);
    if (value === undefined || !pos.values.includes(value) || routeAt(pattern, pos.label) !== pos.route || routeParts(pattern).length !== pos.parts) continue;
    const n = Number(pos.label.slice(1));
    if (pos.label.startsWith('p')) path = replaceNth(path, n, value);
    else if (pos.label.startsWith('h')) {
      const body = hash.slice(1);
      const cut = body.indexOf('?');
      hash = '#' + (cut < 0 ? replaceNth(body, n, value) : replaceNth(body.slice(0, cut), n, value) + body.slice(cut));
    }
  }
  return `${origin}${path}${query}${hash}`;
}

/** `/`-separated `text` with its n-th non-empty segment — which must decode to `value` — written `:var`. */
function replaceNth(text: string, n: number, value: string): string {
  const segs = text.split('/');
  let k = -1;
  for (let i = 0; i < segs.length; i++) {
    if (!segs[i]) continue;
    k++;
    if (k !== n) continue;
    if (safeDecode(segs[i]) === value) segs[i] = ':var';
    break;
  }
  return segs.join('/');
}

/**
 * Every `urlPattern` held anywhere in `value` (a skill's preconditions, a
 * step's expectation, a popup effect, a folded loop's body) rewritten by
 * generaliseAppMinted, in place.
 */
export function generaliseAppMintedDeep(value: unknown, positions: readonly AppMintedPosition[]): void {
  if (!positions.length || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const v of value) generaliseAppMintedDeep(v, positions);
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const [key, v] of Object.entries(obj)) {
    if (key === 'urlPattern' && typeof v === 'string') obj[key] = generaliseAppMinted(v, positions);
    else if (v && typeof v === 'object') generaliseAppMintedDeep(v, positions);
  }
}
