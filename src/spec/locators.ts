/**
 * Locator candidates as Playwright SOURCE.
 *
 * `makeLocator` builds a live Locator from a recorded candidate; a compiled
 * spec has no sitelooper runtime, so the same candidate must arrive as text
 * that builds the identical Locator when the generated file runs. Every kind
 * is mirrored option for option - `exact: true` on role and text, `hasText`
 * on scoped, the trailing `.nth()` - because a spec that resolves a DIFFERENT
 * element than the replay did is worse than no spec at all: it passes or
 * fails for reasons the recording never observed.
 *
 * Nothing the runtime decides at resolve time is decided here. The chain goes
 * to the shared `resolveCandidates` (src/execution/resolve.ts, embedded in
 * the artifact) in STORED order with its stored indices; the order, the
 * identity guard, ambiguity and the wait are that policy's, in both runners.
 * What this module renders per candidate is the OBSERVATION the policy asks
 * for (`observationSource`): the live locator plus the compile-time facts.
 */
import type { LocatorCandidate } from '../daemon/recorder.js';
import { snapshotRefCandidate, structuralCandidate } from '../execution/resolve.js';
import { VOLATILE_TOKEN_SHAPE, WILDCARD, fieldByName, volatileMatcher } from '../shared/text.js';

export interface SourceOptions {
  /** expression for the page, default 'page' */
  page?: string;
  /** how a "{{vN}}"/"{{dN}}" slot renders inside a template literal; default s => '${p.' + s + '}' */
  slot?: (slot: string) => string;
}

const SLOT = /\{\{([vd]\d+)\}\}/;
const SLOT_G = new RegExp(SLOT.source, 'g');
const defaultSlot = (s: string) => '${p.' + s + '}';

/** The escapes a single-quoted and a template literal share. */
function escapeFor(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** A JS single-quoted string literal for `text`. */
function quote(text: string): string {
  return `'${escapeFor(text).replace(/'/g, "\\'")}'`;
}

/** Literal text inside a template literal: a backtick or a `${` would end it or open a hole. */
function escapeTemplate(text: string): string {
  return escapeFor(text).replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/** JS string source for recorded text: a single-quoted literal, or a template literal when it
 *  carries {{slots}}. */
export function stringSource(text: string, o: SourceOptions = {}): string {
  if (!SLOT.test(text)) return quote(text);
  const slot = o.slot ?? defaultSlot;
  // split() with one capture group alternates literal, slot name, literal...
  const body = text
    .split(SLOT_G)
    .map((p, i) => (i % 2 ? slot(p) : escapeTemplate(p)))
    .join('');
  return `\`${body}\``;
}

type Piece = { lit: string } | { slot: string };

// The \u0001 delimiters keep a sentinel's digits from fusing with neighbouring
// text into a clock or date token, and escapeRe leaves all three characters
// alone, so the sentinel comes back out of the pattern intact.
const SENTINEL = (i: number) => `\u0001${i}\u0001`;
const SENTINEL_G = /\u0001(\d+)\u0001/g;

/**
 * The pieces of the RegExp `volatileMatcher` would build, with the slots
 * pulled back out - or null when it would return a plain string.
 *
 * Built by asking volatileMatcher itself rather than restating its token
 * shape here: each slot is swapped for a sentinel that survives its escaping
 * untouched, and the sentinels are cut back out of the resulting `source`.
 * Duplicating the wildcard pattern would let the two drift, and the whole
 * point of this module is that they cannot.
 *
 * Volatility is judged with the slots still unbound, because a parameter is
 * unknown at compile time: a date arriving through `{{v1}}` stays an exact
 * match in the spec where replay would have wildcarded it. Stricter, never
 * looser - a spec that quietly matched another day's row would be a lie.
 */
function matcherPieces(text: string): Piece[] | null {
  const names: string[] = [];
  const probe = text.replace(SLOT_G, (_m, name: string) => {
    names.push(name);
    return SENTINEL(names.length - 1);
  });
  const matcher = volatileMatcher(probe);
  if (typeof matcher === 'string') return null;
  const pieces: Piece[] = [];
  let last = 0;
  for (const m of matcher.source.matchAll(SENTINEL_G)) {
    const at = m.index ?? 0;
    if (at > last) pieces.push({ lit: matcher.source.slice(last, at) });
    pieces.push({ slot: names[Number(m[1])] });
    last = at + m[0].length;
  }
  if (last < matcher.source.length) pieces.push({ lit: matcher.source.slice(last) });
  return pieces;
}

/** The expression inside a slot's interpolation, so it can be wrapped in escapeRe(). */
function slotExpr(name: string, o: SourceOptions): string | null {
  const rendered = (o.slot ?? defaultSlot)(name);
  return /^\$\{[\s\S]*\}$/.test(rendered) ? rendered.slice(2, -1) : null;
}

/** Source for the matcher makeLocator would build: stringSource, or a RegExp literal when
 *  volatileMatcher would return a RegExp (mirror its construction exactly; slots inside a
 *  regex become `${escapeRe(p.vN)}` via new RegExp(...) source). */
export function matcherSource(text: string, o: SourceOptions = {}): string {
  const pieces = matcherPieces(text);
  if (!pieces) return stringSource(text, o);
  if (!pieces.some((p) => 'slot' in p)) {
    const source = pieces.map((p) => (p as { lit: string }).lit).join('');
    // A literal keeps the generated file readable, and RegExp.source is
    // already literal-safe - it escapes the slashes that would end one, which
    // is why nothing is escaped again here. Only a line terminator has no
    // literal form, so that case goes through new RegExp.
    return /[\n\r\u2028\u2029]/.test(source) ? `new RegExp(${quote(source)})` : `/${source}/`;
  }
  // escapeRe is inlined into the generated file: a bound parameter is DATA, so
  // its own regex metacharacters must not become pattern - which is exactly
  // what volatileMatcher does to the recorded text before splicing in the
  // wildcards.
  const body = pieces
    .map((p) => {
      if ('lit' in p) return escapeTemplate(p.lit);
      const expr = slotExpr(p.slot, o);
      // A caller whose slot renderer is not an interpolation owns its own
      // escaping; there is no expression here to wrap.
      return expr === null ? (o.slot ?? defaultSlot)(p.slot) : '${escapeRe(' + expr + ')}';
    })
    .join('');
  return `new RegExp(\`${body}\`)`;
}

/** Regex SOURCE for one piece of recorded text: literals escaped, slots spliced in as
 *  `${escapeRe(p.vN)}` (a bound parameter is DATA, so its own metacharacters must not
 *  become pattern), all of it safe to sit inside a template literal. */
function patternBody(text: string, o: SourceOptions): string {
  return text
    .split(SLOT_G)
    .map((p, i) => {
      if (i % 2 === 0) return escapeTemplate(reEscape(p));
      const expr = slotExpr(p, o);
      return expr === null ? (o.slot ?? defaultSlot)(p) : '${escapeRe(' + expr + ')}';
    })
    .join('');
}

const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Source for a matcher over a recorded PAGE LINE - one whose volatile tokens the
 * STORE already replaced with `{{*}}` (maskVolatile), unlike a locator name, which
 * arrives verbatim and is masked here by `matcherSource`/`volatileMatcher`.
 *
 * Rendered as the literal string it looks like, `{{*}}` can never match anything:
 * kanboard's `textbox "{{*}} {{*}}"` (a due-date field the app names after the
 * current date and time) failed on every replay of the compiled spec. So each
 * wildcard becomes the token shape it stood for - NOT `.*`. The mask is only ever
 * applied to a clock or calendar token, so the token shape is exactly what was
 * masked out, and it is what `volatileMatcher` would have produced from the
 * unmasked line; `.*` would let `textbox "Due date"` satisfy an assertion recorded
 * for a dated field, which is an assertion looser than the evidence behind it.
 *
 * `anchor` mirrors the caller's `exact`: a presence check is a substring match
 * (Playwright ignores `exact` for a RegExp name, so the anchoring has to carry it),
 * while the already-in-effect guard reads presence as a reason NOT to act and must
 * stay line-exact. Null when the text is nothing BUT wildcards: that names no
 * element at all, and the caller leaves it as an observation.
 */
export function maskedMatcherSource(text: string, o: SourceOptions & { anchor?: boolean } = {}): string | null {
  if (!text.includes(WILDCARD)) return matcherSource(text, o);
  const parts = text.split(WILDCARD);
  if (!parts.some((p) => p.trim())) return null;
  // The shape goes through escapeTemplate too: it is regex source living inside
  // a template literal, and `\d` there is just "d".
  const body = parts.map((p) => patternBody(p, o)).join(escapeTemplate(VOLATILE_TOKEN_SHAPE));
  return `new RegExp(\`${o.anchor ? `^${body}$` : body}\`)`;
}

/** Playwright Locator expression for ONE candidate, mirroring makeLocator kind by kind
 *  (testid -> getByTestId / [attr="v"], role -> getByRole(role,{name,exact:true}), label,
 *  placeholder, text -> getByText(..,{exact:true}), id/css -> locator(sel), scoped ->
 *  locator(container,{hasText}).locator(sel), nth -> .nth(n)). Returns null for 'point'
 *  (not expressible without a runtime). */
export function candidateSource(c: LocatorCandidate, o: SourceOptions = {}): string | null {
  const page = o.page ?? 'page';
  let src: string;
  switch (c.kind) {
    case 'testid':
      src =
        c.attr === 'data-testid'
          ? `${page}.getByTestId(${stringSource(c.value, o)})`
          : `${page}.locator(${stringSource(`[${c.attr}=${JSON.stringify(c.value)}]`, o)})`;
      break;
    case 'role':
      // The same function makeLocator calls, embedded in the artifact (the
      // shared execution/text.ts): a role name is matched with roleName's
      // tolerance for what an accessible name carries and a recorded one
      // cannot — see it. Rendered as a call rather than a regex literal so
      // the artifact and the daemon cannot build two different matchers.
      // A bound slot is filled at run time, as replay fills it, so a clock or
      // calendar token arriving through a parameter is wildcarded in both.
      src = `${page}.getByRole(${quote(c.role)}, { name: roleName(${stringSource(c.name, o)}), exact: true })`;
      break;
    case 'label':
      src = `${page}.getByLabel(${matcherSource(c.label, o)})`;
      break;
    case 'placeholder':
      src = `${page}.getByPlaceholder(${matcherSource(c.placeholder, o)})`;
      break;
    case 'text':
      src = `${page}.getByText(${matcherSource(c.text, o)}, { exact: true })`;
      break;
    case 'id':
    case 'css': {
      src = `${page}.locator(${stringSource(c.selector, o)})`;
      // makeLocator's label fallback for a stored `role=…[name="…"]`
      // (fieldByName, the shared parse): same locator in both runners.
      const field = c.kind === 'css' ? fieldByName(c.selector) : null;
      if (field) {
        const scope = field.scope === null ? page : `${page}.locator(${stringSource(field.scope, o)})`;
        src += `.or(${scope}.getByRole(${JSON.stringify(field.role)}).and(${scope}.getByLabel(${stringSource(field.name, o)}, { exact: true })))`;
      }
      break;
    }
    case 'scoped':
      // hasText stays a plain substring match on the container, exactly as
      // makeLocator passes it: the recorded value names the RECORD.
      src = `${page}.locator(${stringSource(c.container, o)}, { hasText: ${stringSource(c.hasText, o)} })`;
      if (c.selector) src += `.locator(${stringSource(c.selector, o)})`;
      break;
    case 'point':
      // A point is resolved by marking the element under the recorded
      // coordinates first (markPoint, src/execution/point.ts) and naming the
      // mark; that is a two-move resolution the shared policy makes, not a
      // plain expression. See `observationSource`, which renders it with its
      // geometry. As a bare expression it has no form.
      return null;
  }
  return c.nth !== undefined ? `${src}.nth(${c.nth})` : src;
}

/**
 * The chain as a list of plain expressions in STORED order — every candidate
 * a bare expression can name, none guarded, none reordered, duplicates kept.
 * For a presence check (does anything of this chain exist?), not for a
 * resolution: an action resolves through `observationSources` and the shared
 * policy. Points have no bare form and are reported in `dropped`.
 */
export function candidateSources(chain: LocatorCandidate[], o: SourceOptions = {}): { sources: string[]; dropped: LocatorCandidate[] } {
  const dropped: LocatorCandidate[] = [];
  const sources: string[] = [];
  for (const c of chain) {
    const src = candidateSource(c, o);
    if (src === null) dropped.push(c);
    else sources.push(src);
  }
  return { sources, dropped };
}

/**
 * The whole chain as ONE `.or()` union, in stored order, points dropped.
 * Multi-line pretty form: one candidate per line, `.or(` continuation lines
 * indented by `indent`. A union expresses "any of these", never "the one the
 * recording meant" — presence checks only; an action goes through the policy.
 */
export function chainSource(chain: LocatorCandidate[], o: SourceOptions & { indent?: string } = {}): { source: string; dropped: LocatorCandidate[] } {
  const indent = o.indent ?? '  ';
  const { sources, dropped } = candidateSources(chain, o);
  const source = sources.length ? sources[0] + sources.slice(1).map((p) => `
${indent}.or(${p})`).join('') : '';
  return { source, dropped };
}

/** A number as source; the recorder measures finite pixels, and anything else renders as 0 rather than as `NaN`. */
const num = (n: unknown): string => (Number.isFinite(n) ? String(n) : '0');

/**
 * A stored value as a source literal that `JSON.stringify` will encode at run
 * time: strings through `stringSource` (slots become `${p.vN}`), everything
 * else as JSON would write it (a non-finite number as `null`, as
 * `JSON.stringify` itself renders one). Fields holding `undefined` are left
 * out, as `JSON.stringify` leaves them out.
 */
function literalSource(value: unknown, o: SourceOptions): string {
  if (typeof value === 'string') return stringSource(value, o);
  if (Array.isArray(value)) return `[${value.map((v) => literalSource(v, o)).join(', ')}]`;
  if (value !== null && typeof value === 'object') return objectSource(value as Record<string, unknown>, o);
  return JSON.stringify(value === undefined ? null : value);
}

function objectSource(obj: Record<string, unknown>, o: SourceOptions): string {
  const fields = Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${literalSource(v, o)}`);
  return fields.length ? `{ ${fields.join(', ')} }` : '{}';
}

/**
 * One candidate as the OBSERVATION the shared `resolveCandidates` takes
 * (`CandidateObservation`, src/execution/resolve.ts), rendered as an object
 * literal. What replay's `resolveChain` builds live, the artifact renders at
 * compile time, field for field:
 *
 *  - `locator`: the same expression `candidateSource` builds, with NO
 *    identity filter — identity is the policy's runtime rule; for a point,
 *    `pointLocator(page, { x, y })`, which names what `markPoint` tags.
 *  - `index`: the candidate's position in the STORED chain, so telemetry
 *    names the recorded candidate. Passed in by the caller, never recomputed.
 *  - `structural`: `structuralCandidate`, the shared rule, evaluated here and
 *    rendered as a boolean literal.
 *  - `kind`: as recorded.
 *  - `carries`: the candidate's JSON with its slots filled from `p` at run
 *    time — what the candidate itself NAMES, so an identity value found in it
 *    needs no guarding. Rendered as `JSON.stringify({ … })` over an object
 *    literal whose string fields are template literals, so the encoding
 *    happens AFTER the filling, at run time, in the daemon's own order
 *    (`JSON.stringify(candidate)` of the filled chain): a value carrying a
 *    `"` or `\` is escaped in both runners' text alike, and the guard runs
 *    for it in both. Replay evidence (`seen`) is not text the candidate
 *    names and is left out.
 *  - `nth`: the recorded match index, when there is one — on the locator
 *    AND on the observation, exactly as the daemon passes both.
 *  - `point`: the recorded geometry, for a point. The first point in a chain
 *    is also the plausibility yardstick for every positional guess in it.
 *
 * `retired` is deliberately absent: it is the daemon's evidence store, and an
 * artifact has none — a compiled chain is ordered by class and recorded
 * order alone.
 */
export function observationSource(c: LocatorCandidate, index: number, o: SourceOptions = {}): string {
  const page = o.page ?? 'page';
  const { seen: _seen, ...named } = c as LocatorCandidate & { seen?: unknown };
  void _seen;
  const fields = [
    `locator: ${c.kind === 'point' ? `pointLocator(${page}, { x: ${num(c.x)}, y: ${num(c.y)} })` : candidateSource(c, o)}`,
    `index: ${index}`,
    `structural: ${structuralCandidate(c)}`,
    `kind: ${quote(c.kind)}`,
    `carries: JSON.stringify(${objectSource(named as Record<string, unknown>, o)})`,
  ];
  if (c.nth !== undefined) fields.push(`nth: ${c.nth}`);
  // The shared rule, rendered as replay passes it: only when true.
  if (snapshotRefCandidate(c)) fields.push('ephemeral: true');
  if (c.kind === 'point') {
    // A recording without a role or tag is malformed, not a compile crash: an
    // empty tag matches nothing at markPoint, which is the honest miss.
    const role = c.role === null || c.role === undefined ? 'null' : quote(String(c.role));
    fields.push(`point: { x: ${num(c.x)}, y: ${num(c.y)}, w: ${num(c.w)}, h: ${num(c.h)}, role: ${role}, tag: ${quote(String(c.tag ?? ''))}, vw: ${num(c.vw)}, vh: ${num(c.vh)} }`);
  }
  return `{ ${fields.join(', ')} }`;
}

/** The whole chain as observations, one per candidate, in stored order with stored indices. */
export function observationSources(chain: LocatorCandidate[], o: SourceOptions = {}): string[] {
  return chain.map((c, index) => observationSource(c, index, o));
}
