/**
 * The READABLE style: a compiled flow as ordinary Playwright code.
 *
 * The runtime style (emit.ts) carries the execution engine, the FLOW
 * constant and every candidate of every chain, so a run can heal itself; the
 * Snipe-IT pilot's four steps came out at 17,700 lines. This style gives all
 * of that up on purpose and writes what a person would: one locator per
 * action, an `expect` where the recording saw the page move, the values later
 * steps need and nothing else. The recording stays in the bundle
 * (`.sitelooper/procedures.json`), which the `// @sitelooper-source` line
 * names, and sitelooper regenerates this file from it on every compile,
 * rerecord and repair.
 *
 * What it keeps from the runtime is what other tools read: the metadata
 * exports readiness parses, the `// @step <id> <segment>/<n>` marker above
 * every action (check.ts findStepAnchor), the `[sitelooper step]` line after
 * every step (readiness executedSteps), the scaffold's import names, and the
 * input rules (vars, `{{env:…}}`, `{{totp:…}}`, `{{step.output}}`).
 *
 * What it gives up: locator fallback, drift lines, goal/satisfied guards,
 * detours, recipes, site facts, fingerprints. Each recorded SkillStep becomes
 * ONE Playwright call; one that cannot be written as one is a `// TODO:`
 * line, a throw and a diagnostic — never left out in silence.
 *
 * Pure: the same SpecFlow gives byte-identical source.
 */
import type { LocatorCandidate } from '../daemon/recorder.js';
import type { SkillStep } from '../skills/store.js';
import { retired } from '../skills/repair.js';
import { routeAt } from '../execution/url.js';
import type { Diagnostic } from './diagnostics.js';
import type { SpecFlow, SpecSegment, SpecStep } from './ir.js';
import { candidateSource, knownCandidate, stringSource } from './locators.js';
import { readableSpecHash } from './lift.js';

export interface ReadableEmitOptions {
  compilerVersion: string;
  /** The bundle the flow was compiled from, relative to the emitted file; null when it came from the user store. */
  bundleRelPath: string | null;
  /**
   * Hand the file over: no regenerate instruction, no style marker and no source
   * line, so sitelooper treats it as the user's own code from then on. For a spec
   * contributed to a project that will not carry the recording (`compile --standalone`).
   */
  standalone?: boolean;
}

export interface ReadableEmitResult {
  source: string;
  warnings: string[];
  /** What could not be written as plain Playwright, in the shape every surface reports (spec/diagnostics.ts). */
  diagnostics: Diagnostic[];
}

/** The marker every tool detects the style by (lift.ts READABLE_MARKER). */
export const READABLE_MARKER_LINE = '// @sitelooper-readable v1';

/** Said once per file: what this style gives up. */
export const NO_FALLBACK_WARNING =
  'readable style: each action uses one recorded locator and has no run-time fallback — when the app changes, re-record the step (sitelooper rerecord) and compile again';

const BUDGET_BASE_MS = 30_000;
const BUDGET_PER_ACTION_MS = 5_000;
/** A stuck action fails in this long instead of waiting out the test budget (RECORDED_USE.actionTimeout). */
const ACTION_TIMEOUT_MS = 15_000;
const NAVIGATION_TIMEOUT_MS = 30_000;
const BUDGET_MAX_MS = 600_000;

/** First synthetic slot number: far above any recorded `{{vN}}`, so the two never meet. */
const SYNTH_BASE = 900_000;

// --- small source helpers ----------------------------------------------------

/** A single-quoted JS string literal for `text`, `{{…}}` and all (stringSource would read `{{vN}}` as a slot). */
function quote(text: string): string {
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `'${escaped}'`;
}
const IDENT = /^[A-Za-z_$][\w$]*$/;
const RESERVED = new Set(
  'break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await async page vars env outputs ctx expect test'.split(' '),
);

/** `vars.name`, or `vars['9-name']` when the name is no identifier. */
function member(obj: string, name: string): string {
  return IDENT.test(name) ? `${obj}.${name}` : `${obj}[${quote(name)}]`;
}

/** An object key: bare when it can be. */
function key(name: string): string {
  return IDENT.test(name) ? name : quote(name);
}

/** A readable local name from free text: `asset_name` → `assetName`. */
function camel(text: string): string {
  const words = text.split(/[^A-Za-z0-9]+/).filter(Boolean);
  let name = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w[0].toLowerCase() + w.slice(1))).join('');
  if (!name) name = 'value';
  if (/^\d/.test(name)) name = `v${name}`;
  if (RESERVED.has(name)) name = `${name}Value`;
  return name;
}

/** A url path segment as the noun it names: `hardware` → `hardware`, `tasks` → `task`. */
function singular(word: string): string {
  if (/ies$/.test(word) && word.length > 4) return word.slice(0, -3) + 'y';
  if (/[^s]s$/.test(word) && word.length > 3) return word.slice(0, -1);
  return word;
}

/** One line of comment text: no line breaks, no comment terminator. */
const commentText = (s: string) => String(s).replace(/\s+/g, ' ').replace(/\*\//g, '* /').trim();

/** Regex source for literal text inside a `/…/` literal. */
const reLiteral = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** The env var a run var is read from by the scaffold (emit.ts envName). */
const envName = (name: string) => name.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();

/** A stored candidate without the replay evidence, for comparing two chains. */
const bare = (chain: readonly LocatorCandidate[] | undefined) => JSON.stringify((chain ?? []).map(({ seen: _seen, ...c }) => c));

const isRead = (tool: string) => tool === 'read' || tool === 'read_all';

// --- url patterns ------------------------------------------------------------

interface UrlParts {
  origin: string;
  path: string[];
  query: [string, string][];
  hash: string;
}

/** A stored url pattern split without URL(): its `{{slots}}` and `:id` stay as written. */
function parseUrl(url: string): UrlParts | null {
  const m = /^([a-z][\w+.-]*:\/\/[^/?#]*)(.*)$/i.exec(url);
  if (!m) return null;
  let rest = m[2];
  let hash = '';
  const h = rest.indexOf('#');
  if (h >= 0) {
    hash = rest.slice(h + 1);
    rest = rest.slice(0, h);
  }
  let query = '';
  const qm = rest.indexOf('?');
  if (qm >= 0) {
    query = rest.slice(qm + 1);
    rest = rest.slice(0, qm);
  }
  return {
    origin: m[1],
    path: rest.split('/').filter(Boolean),
    query: query
      .split('&')
      .filter(Boolean)
      .map((pair) => {
        const eq = pair.indexOf('=');
        return eq < 0 ? [pair, ''] : [pair.slice(0, eq), pair.slice(eq + 1)];
      }),
    hash,
  };
}

const wildSeg = (seg: string) => seg === ':id' || seg === ':var' || seg.includes('{{');

/**
 * Two recorded url patterns name the same page: same origin and path shape,
 * every literal segment equal where neither side is a wildcard (`:id`, a
 * `{{slot}}`), the same literal query values on the keys both carry, the same
 * fragment. The question "did this action navigate?" — a precondition
 * `/hardware/{{v4}}/checkout` and an expectation `/hardware/:id/checkout` are
 * one page.
 */
function samePage(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  if (a === b) return true;
  const pa = parseUrl(a);
  const pb = parseUrl(b);
  if (!pa || !pb) return false;
  if (pa.origin !== pb.origin || pa.path.length !== pb.path.length) return false;
  if (pa.path.some((seg, i) => !wildSeg(seg) && !wildSeg(pb.path[i]) && seg !== pb.path[i])) return false;
  const qb = new Map(pb.query);
  if (pa.query.some(([k, v]) => qb.has(k) && !wildSeg(v) && !wildSeg(qb.get(k)!) && v !== qb.get(k))) return false;
  return pa.hash === pb.hash || wildSeg(pa.hash) || wildSeg(pb.hash);
}

// --- per-file and per-step state ----------------------------------------------

interface FileState {
  spec: SpecFlow;
  warnings: string[];
  diagnostics: Diagnostic[];
  helpers: Set<'need' | 'visit' | 'pick' | 'totp' | 'escapeRe'>;
  /** `{{<step>.<output>}}` references the flow's params make, by key. */
  consumed: Set<string>;
  /** Whether a step moves the procedure to another page (a popup, a close, a tab switch). */
  followsPages: boolean;
  actions: number;
}

interface Scope {
  file: FileState;
  step: SpecStep;
  segment?: SpecSegment;
  /** Synthetic slot → the expression it stands for. */
  synth: Map<string, string>;
  synthByExpr: Map<string, string>;
  /** `{{dN}}` → the local holding this run's minted value. */
  captured: Map<string, string>;
  /** `<step>.<output>` reference → the local `need(...)` binds it to. */
  refs: Map<string, string>;
  locals: Set<string>;
  uses: { vars: boolean; env: boolean; outputs: boolean };
  /** Set while resolving one piece of text: a slot it names that nothing can fill. */
  unfilled: string[];
  /** Lines that must stop the step before anything runs (an unbound slot). */
  blockers: string[];
  /** Flow-step slots already reported, so each problem is said once. */
  reported: Set<string>;
  /** Inside a folded loop (depth). */
  inLoop?: number;
}

function newScope(file: FileState, step: SpecStep): Scope {
  return { file, step, synth: new Map(), synthByExpr: new Map(), captured: new Map(), refs: new Map(), locals: new Set(), uses: { vars: false, env: false, outputs: false }, unfilled: [], blockers: [], reported: new Set() };
}

function local(scope: Scope, wanted: string): string {
  let name = camel(wanted);
  for (let i = 2; scope.locals.has(name); i++) name = `${camel(wanted)}${i}`;
  scope.locals.add(name);
  return name;
}

/** A synthetic `{{vN}}` slot for an expression, so the shared stringSource / candidateSource interpolate it. */
function synth(scope: Scope, expr: string): string {
  const known = scope.synthByExpr.get(expr);
  if (known) return `{{${known}}}`;
  const name = `v${SYNTH_BASE + scope.synth.size}`;
  scope.synth.set(name, expr);
  scope.synthByExpr.set(expr, name);
  return `{{${name}}}`;
}

const slotOption = (scope: Scope) => ({ slot: (s: string) => '${' + (scope.synth.get(s) ?? `''`) + '}' });

/** JS source for `text` once every slot in it is resolved: a quoted literal or a template literal. */
function str(scope: Scope, text: string): string {
  const resolved = resolveText(scope, text);
  // A value that is one run-time expression and nothing else is that expression, not `${…}` in a template.
  const whole = /^\{\{(v\d+)\}\}$/.exec(resolved)?.[1];
  const expr = whole ? scope.synth.get(whole) : undefined;
  if (expr && !expr.includes('??')) return expr;
  return stringSource(resolved, slotOption(scope));
}

/**
 * The name a `{{<step>.url.pN}}` value goes by: the noun of the path segment
 * before it on the producing step's end url (`/hardware/{{d1}}` → `hardwareId`).
 */
function urlPartName(pattern: string | null, label: string): string {
  const m = /^p(\d+)$/.exec(label);
  const parts = pattern ? parseUrl(pattern) : null;
  if (m && parts) {
    const before = parts.path[Number(m[1]) - 1];
    if (before && !wildSeg(before)) return `${singular(before)} id`;
  }
  return `url ${label}`;
}

/** The url a flow step ends on, as recorded: the last landing any of its actions recorded, else its last segment's start. */
function endPattern(step: SpecStep): string | null {
  let end: string | null = null;
  for (const segment of step.segments) {
    end = segment.preconditions.urlPattern ?? end;
    for (const s of segment.steps) {
      if (s.tool === 'goto' && typeof s.args?.url === 'string') end = s.args.url;
      else if (s.expect?.urlPattern) end = s.expect.urlPattern;
    }
  }
  return end;
}

/** One `{{name}}` token of a flow param or recorded arg as resolved text (literal, or a synthetic slot). */
function refToken(scope: Scope, name: string, depth: number): string {
  const { file, step } = scope;
  if (/^[vd]\d+$/.test(name)) {
    if (name.startsWith('d')) {
      const captured = scope.captured.get(name);
      if (captured) return synth(scope, captured);
      scope.unfilled.push(name);
      return '';
    }
    const bound = step.params[name];
    if (bound !== undefined) return depth > 3 ? '' : resolveTemplate(scope, bound, depth + 1);
    const example = step.segments.map((s) => s.params[name]?.example).find((e) => typeof e === 'string');
    const origin = step.segments.map((s) => s.params[name]?.binding).find((b) => typeof b === 'string' && b);
    if (origin || example === undefined) {
      if (!scope.reported.has(name)) {
        scope.reported.add(name);
        const what = origin ? `slot ${name} (origin ${origin}) has no flow binding, and ${step.id} acts by it` : `slot ${name} has no flow binding and no recorded value, and ${step.id} acts by it`;
        file.diagnostics.push({
          code: 'unbound-slot',
          step: step.id,
          what,
          why: origin
            ? `the flow binds nothing to ${name}, and its recorded example is run 1's value of ${origin}, not this run's; a plain Playwright file has no model to ask for it.`
            : `nothing gives ${name} a value, so the step would act on an empty string.`,
          fix: `re-record ${step.id} (\`sitelooper rerecord <flow file> ${step.id}\`)`,
          action: { command: 'rerecord', args: [step.id], step: step.id },
          severity: 'error',
          line: `step ${step.id} slot ${name} has no flow binding and a step acts by it`,
        });
        scope.blockers.push(
          `// TODO: ${commentText(what)} — re-record ${step.id}.`,
          `throw new Error(${quote(`${step.id}: slot ${name} has no flow binding — re-record this step`)});`,
        );
      }
      return '';
    }
    if (!scope.reported.has(name)) {
      scope.reported.add(name);
      file.warnings.push(`${step.id}: slot ${name} has no flow binding — the recorded value is inlined`);
    }
    return depth > 3 ? '' : resolveTemplate(scope, example, depth + 1);
  }
  const env = /^env:([A-Za-z_]\w*)$/.exec(name);
  if (env) {
    scope.uses.env = true;
    return synth(scope, member('env', env[1]));
  }
  const totp = /^totp:([A-Za-z_]\w*)$/.exec(name);
  if (totp) {
    scope.uses.env = true;
    file.helpers.add('totp');
    return synth(scope, `await totp(${member('env', totp[1])}, ${quote(totp[1])})`);
  }
  if (name === '*' || name === '=') return `{{${name}}}`;
  if (name.includes('.')) {
    let bound = scope.refs.get(name);
    if (!bound) {
      const dot = name.indexOf('.');
      const producer = file.spec.steps.find((s) => s.id === name.slice(0, dot));
      const output = name.slice(dot + 1);
      bound = local(scope, output.startsWith('url.') ? urlPartName(producer ? endPattern(producer) : null, output.slice(4)) : output.split('#')[0]);
      scope.refs.set(name, bound);
    }
    scope.uses.outputs = true;
    file.helpers.add('need');
    return synth(scope, bound);
  }
  if (file.spec.vars.includes(name)) {
    scope.uses.vars = true;
    return synth(scope, member('vars', name));
  }
  scope.uses.vars = true;
  file.warnings.push(`${step.id}: {{${name}}} names no declared flow var — it resolves to an empty string unless the caller passes it`);
  return synth(scope, `(vars as Record<string, string>)[${quote(name)}] ?? ''`);
}

/** A flow param template (`{{runid}} E2E Laptop`) as resolved text. */
function resolveTemplate(scope: Scope, template: string, depth: number): string {
  return template.replace(/\{\{([^{}]+)\}\}/g, (_m, name: string) => refToken(scope, name, depth));
}

/** Recorded text with every `{{vN}}`, `{{dN}}`, `{{env:…}}` and `{{totp:…}}` resolved for this step. */
function resolveText(scope: Scope, text: string): string {
  return resolveTemplate(scope, text, 0);
}

/** Whether a slot resolves to literal text alone (no run-time value). */
function literalOf(scope: Scope, text: string): string | null {
  const probe: Scope = { ...scope, synth: new Map(scope.synth), synthByExpr: new Map(scope.synthByExpr), unfilled: [], blockers: [], reported: new Set(scope.reported), uses: { ...scope.uses }, refs: new Map(scope.refs), locals: new Set(scope.locals), file: { ...scope.file, warnings: [], diagnostics: [], helpers: new Set() } };
  const out = resolveText(probe, text);
  return /\{\{v\d+\}\}/.test(out) || probe.unfilled.length ? null : out;
}

// --- url regexes ---------------------------------------------------------------

/**
 * A recorded url pattern as the regex `toHaveURL` checks, RELATIVE to the
 * flow's origin when it is on it, so the file runs wherever the run is
 * pointed. `:id` and a run-time slot match one path segment; a slot bound to
 * literal text matches that text; each `{{dN}}` in `capture` becomes a group,
 * in path order (returned in `groups`).
 */
function urlRegex(scope: Scope, pattern: string, capture: readonly string[] = [], example: (slot: string) => string = () => ''): { re: string; groups: string[] } {
  const parts = parseUrl(pattern);
  if (!parts) return { re: `/${reLiteral(pattern)}/`, groups: [] };
  const groups: string[] = [];
  const segment = (seg: string): string => {
    if (seg === ':id' || seg === ':var') return '[^/]+';
    return seg
      .split(/(\{\{[^{}]+\}\})/)
      .map((piece) => {
        const slot = /^\{\{([^{}]+)\}\}$/.exec(piece)?.[1];
        if (!slot) return reLiteral(piece);
        if (capture.includes(slot)) {
          groups.push(slot);
          return /^\d+$/.test(example(slot)) ? '(\\d+)' : '([^/]+)';
        }
        if (/^[vd]\d+$/.test(slot)) {
          const literal = literalOf(scope, piece);
          if (literal !== null && literal !== '') return reLiteral(literal);
        }
        return '[^/]+';
      })
      .join('');
  };
  const relative = parts.origin === scope.file.spec.origin;
  let path = parts.path.length ? parts.path.map((seg) => `\\/${segment(seg)}`).join('') : '';
  if (!path) path = relative ? ':\\/\\/[^/]+\\/' : '\\/';
  const head = relative ? '' : `^${reLiteral(parts.origin)}`;
  const hashPath = parts.hash && (parts.hash.startsWith('/') || !parts.hash.includes('='));
  let tail: string;
  let ahead = '';
  if (hashPath) tail = `(?:\\?[^#]*)?#${parts.hash.split('/').map((s) => (s ? segment(s) : '')).join('\\/')}$`;
  else if (!parts.query.length && !parts.hash) tail = '$';
  else {
    tail = '(?:[?#].*)?$';
    const pairs: [string, string, string][] = [...parts.query.map(([k, v]) => ['[?&]', k, v] as [string, string, string])];
    if (parts.hash) for (const pair of parts.hash.split('&').filter(Boolean)) {
      const eq = pair.indexOf('=');
      pairs.push(['[#&]', eq < 0 ? pair : pair.slice(0, eq), eq < 0 ? '' : pair.slice(eq + 1)]);
    }
    ahead = pairs.map(([lead, k, v]) => `(?=.*${lead}${reLiteral(k)}=${wildSeg(v) ? '' : `${reLiteral(v)}(?:[&#]|$)`})`).join('');
    if (ahead) ahead = `^${ahead}.*`;
  }
  return { re: `/${ahead}${head}${path}${tail}/`, groups };
}

/** A url to open: a path on the run's own origin (`visit`), or the absolute url of another origin. */
function gotoLine(scope: Scope, url: string): string {
  const parts = parseUrl(url);
  if (parts && parts.origin === scope.file.spec.origin) {
    scope.file.helpers.add('visit');
    const rest = url.slice(parts.origin.length) || '/';
    return `await visit(page, ${str(scope, rest)});`;
  }
  return `await page.goto(${str(scope, url)});`;
}

/** This run's value of url part `label` (urlParts labels: pN, hN, q.key), read off `page.url()` as `pattern` lays it out. */
function urlPartExpr(scope: Scope, label: string, pattern: string | null): string {
  const p = /^p(\d+)$/.exec(label);
  if (p && pattern) {
    const parts = parseUrl(pattern);
    const at = Number(p[1]);
    if (parts && parts.path.length > at) {
      const marked = [...parts.path];
      marked[at] = '{{__part}}';
      const rebuilt = `${parts.origin}/${marked.join('/')}${parts.query.length ? '?' + parts.query.map(([k, v]) => `${k}=${v}`).join('&') : ''}${parts.hash ? '#' + parts.hash : ''}`;
      const { re } = urlRegex(scope, rebuilt, ['__part']);
      return `page.url().match(${re})?.[1] ?? ''`;
    }
  }
  if (p) return `new URL(page.url()).pathname.split('/').filter(Boolean)[${p[1]}] ?? ''`;
  const q = /^q\.(.+)$/.exec(label);
  if (q) return `new URL(page.url()).searchParams.get(${quote(q[1])}) ?? ''`;
  const h = /^h(\d+)$/.exec(label);
  if (h) return `new URL(page.url()).hash.replace(/^#\\/?/, '').split('/')[${h[1]}] ?? ''`;
  return "''";
}

// --- locators ------------------------------------------------------------------

/** Readability order: role > label > placeholder > test id > text > scoped > id > css. */
const RANK: Record<string, number> = { role: 0, label: 1, placeholder: 2, testid: 3, text: 4, scoped: 5, id: 6, css: 7 };

/** A stored `role=button[name="Save"] >> nth=0` selector, as the role and name it names. */
function roleSelector(selector: string): { role: string; name: string; nth?: number } | null {
  const m = /^role=([a-z]+)\[name="((?:[^"\\]|\\.)*)"\](?: >> nth=(\d+))?$/.exec(selector.trim());
  if (!m) return null;
  return { role: m[1], name: m[2].replace(/\\(.)/g, '$1'), ...(m[3] !== undefined ? { nth: Number(m[3]) } : {}) };
}

/**
 * The candidates the recording SAW resolve to the element, readably ordered.
 *
 * Evidence, not shape: the chain's first live candidate is the one the
 * recorder checked against the element it acted on (recorder.ts
 * verifiedChain — its `nth` says it matched several); any other is evidenced
 * only by later runs having resolved it (`seen.hit`). A stored Playwright role
 * selector (`role=button[name="Login"]`) that is evidenced vouches for the
 * plain role candidate naming the same role and name, which is the same
 * element by the same name: the recorder wrote that candidate from the
 * element's own accessible name.
 */
function evidenced(chain: readonly LocatorCandidate[]): LocatorCandidate[] {
  const live = chain.filter((c) => knownCandidate(c) && c.kind !== 'point' && !retired(c));
  const out: LocatorCandidate[] = [];
  live.forEach((c, i) => {
    if (i === 0 || (c.seen?.hit ?? 0) > 0) out.push(c);
  });
  for (const c of [...out]) {
    if (c.kind !== 'css') continue;
    const sel = roleSelector(c.selector);
    if (!sel) continue;
    const twin = live.find((r) => r.kind === 'role' && r.role === sel.role && r.name === sel.name);
    if (twin) out.push({ kind: 'role', role: sel.role, name: sel.name, ...((sel.nth ?? c.nth ?? twin.nth) !== undefined ? { nth: sel.nth ?? c.nth ?? twin.nth } : {}) });
  }
  return out.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}

/** A candidate with every string field resolved for this step (slots → literal text or synthetic slots). */
function resolvedCandidate(scope: Scope, c: LocatorCandidate): LocatorCandidate {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) out[k] = typeof v === 'string' && k !== 'kind' ? resolveText(scope, v) : v;
  return out as LocatorCandidate;
}

/** Playwright source for one candidate, as a person writes it: `getByRole(…, { name, exact: true })`, `.first()`, `.nth(i)`. */
function locatorSource(scope: Scope, c: LocatorCandidate, root: string): string | null {
  const r = resolvedCandidate(scope, c);
  const o = { ...slotOption(scope), page: root };
  let src: string | null;
  if (r.kind === 'role') {
    src = `${root}.getByRole(${quote(r.role)}, { name: ${stringSource(r.name, o)}, exact: true })`;
    if (r.nth !== undefined) src += `.nth(${r.nth})`;
  } else if ((r.kind === 'css' || r.kind === 'id') && / >> nth=\d+$/.test(r.selector) && r.nth === undefined) {
    // `.select2-container >> nth=1` is the same locator as `.locator('.select2-container').nth(1)`.
    const at = r.selector.lastIndexOf(' >> nth=');
    src = candidateSource({ ...r, selector: r.selector.slice(0, at) }, o);
    if (src) src += `.nth(${r.selector.slice(at + ' >> nth='.length)})`;
  } else src = candidateSource(r, o);
  if (src === null) return null;
  if (src.includes('escapeRe(')) scope.file.helpers.add('escapeRe');
  // A template literal that is one interpolation and nothing else is that expression.
  const out = src.replace(/`\$\{([^`{}]+)\}`/g, '$1').replace(/\.nth\(0\)$/, '.first()');
  // Inside a folded loop each pass acts on the first record still matching.
  return scope.inLoop && !/\.(?:first\(\)|nth\(\d+\))$/.test(out) ? `${out}.first()` : out;
}

/** The root a recorded frame path names: `page.frameLocator(…)` per hop, its best recorded selector. */
function rootFor(scope: Scope, step: SkillStep, which: 'target' | 'source'): string {
  const frame = step.contexts?.[which]?.frame;
  if (!frame?.length) return 'page';
  return frame.reduce((root, hop) => `${root}.frameLocator(${quote(hop.selectors[0] ?? 'iframe')})`, 'page');
}

/**
 * ONE locator for a recorded target: the most readable candidate the
 * recording saw resolve, its slots filled. Null when the chain has nothing a
 * plain locator can name (only a recorded point, or every candidate naming a
 * value nothing fills).
 */
function chooseLocator(scope: Scope, step: SkillStep, which: 'target' | 'source', where: string): string | null {
  const chain = step.locators?.[which] ?? [];
  const root = rootFor(scope, step, which);
  const tryAll = (cands: LocatorCandidate[]): string | null => {
    for (const c of cands) {
      const before = scope.unfilled.length;
      const src = locatorSource(scope, c, root);
      if (scope.unfilled.length > before) {
        scope.unfilled.length = before;
        continue;
      }
      if (src) return src;
    }
    return null;
  };
  const best = tryAll(evidenced(chain));
  if (best) return best;
  const fallback = tryAll(chain.filter((c) => knownCandidate(c) && c.kind !== 'point').sort((a, b) => RANK[a.kind] - RANK[b.kind]));
  if (fallback) scope.file.warnings.push(`${where}: no recorded candidate for the ${which} has resolve evidence — using ${fallback}`);
  return fallback;
}

// --- noise pruning ---------------------------------------------------------------

interface Planned {
  segment: SpecSegment;
  /** 1-based, as the `@step` marker and `derived.step` count. */
  index: number;
  step: SkillStep;
  /** The url pattern the page was on before this step, as recorded (null: not known). */
  before: string | null;
  /** Dropped by a pruning rule; the rule's name. */
  pruned?: string;
  /** A read this file emits. */
  keptRead?: boolean;
  /** A click on an unlabelled link, written as a visit to where it went (rule 1). */
  visit?: { url: string; selector: string };
}

const landing = (s: SkillStep): string | undefined => (s.tool === 'goto' && typeof s.args?.url === 'string' ? s.args.url : s.expect?.urlPattern);
const sideEffects = (p: Planned) => Boolean(p.step.expect?.alertContains || p.step.mints || p.step.effect || Object.values(p.segment.derived ?? {}).some((d) => d.step === p.index));

/**
 * (a) A toggle opened and closed again with nothing between: A's recorded
 * effect added lines X, B — the same click on the same target, next — took
 * exactly X off again, and neither moved the url. The page is where it was.
 */
function toggledBack(a: Planned, b: Planned): boolean {
  if (a.step.tool !== 'click' || b.step.tool !== 'click') return false;
  if (bare(a.step.locators?.target) !== bare(b.step.locators?.target) || !(a.step.locators?.target ?? []).length) return false;
  if (JSON.stringify(a.step.contexts ?? null) !== JSON.stringify(b.step.contexts ?? null)) return false;
  const added = [...(a.step.expect?.addedContains ?? [])].sort();
  const removed = [...(b.step.expect?.removedContains ?? [])].sort();
  if (!added.length || JSON.stringify(added) !== JSON.stringify(removed)) return false;
  if (sideEffects(a) || sideEffects(b)) return false;
  const stays = (p: Planned) => !p.step.expect?.urlPattern || p.before === null || samePage(p.before, p.step.expect.urlPattern);
  return stays(a) && stays(b);
}

/**
 * (b) A navigation away and a goto straight back, with no action on the page
 * in between: A moved the url off S and B, next, is a goto to S itself.
 */
function wentAndCameBack(a: Planned, b: Planned): boolean {
  if (b.step.tool !== 'goto' || typeof b.step.args?.url !== 'string') return false;
  if (a.step.tool !== 'click' && a.step.tool !== 'goto') return false;
  const away = landing(a.step);
  if (!away || a.before === null || samePage(a.before, away)) return false;
  if (sideEffects(a) || sideEffects(b)) return false;
  const norm = (u: string) => u.replace(/\/+$/, '');
  return norm(b.step.args.url) === norm(a.before);
}

/** A candidate that names its element in words a reader recognises (a role selector counts). */
const named = (c: LocatorCandidate) =>
  c.kind === 'role' || c.kind === 'label' || c.kind === 'placeholder' || c.kind === 'testid' || c.kind === 'text' || c.kind === 'scoped' || ((c.kind === 'css' || c.kind === 'id') && roleSelector(c.selector) !== null);

/** A url with nothing run-dependent in it: no `{{slot}}`, no `:id`/`:var`, no wildcard. */
const literalUrl = (url: string) => !/\{\{|\/:(?:id|var)(?=[/?#]|$)|\*/.test(url);

/**
 * (1) A click on an unlabelled link that went to a literal page: no candidate
 * names the element (css, id, a recorded point only), the point — when there
 * is one — is a link, an `<a>` or has no role, the recorded effect is a
 * navigation to a url with nothing run-dependent in it, and the click did
 * nothing else the steps after it could depend on (no alert, no mint, no
 * minted value, no page effect). Going to that url is the same step, readably.
 */
function anonymousLink(p: Planned): Planned['visit'] | undefined {
  if (p.step.tool !== 'click' || p.step.contexts?.target?.frame?.length) return undefined;
  const chain = (p.step.locators?.target ?? []).filter((c) => knownCandidate(c));
  if (!chain.length || chain.some(named)) return undefined;
  const pt = chain.find((c) => c.kind === 'point');
  if (pt && pt.kind === 'point' && !(pt.role === 'link' || pt.tag === 'a' || pt.role === null || pt.role === undefined)) return undefined;
  const to = p.step.expect?.urlPattern;
  if (!to || !literalUrl(to) || p.before === null || samePage(p.before, to)) return undefined;
  if (sideEffects(p) || p.step.expect?.removedContains?.length) return undefined;
  const sel = chain.find((c) => c.kind === 'css' || c.kind === 'id');
  return { url: to, selector: sel && (sel.kind === 'css' || sel.kind === 'id') ? sel.selector : 'a recorded position' };
}

const MENU_LINE = /^- (?:link|menuitem|menuitemcheckbox|menuitemradio|menu|listbox|option|button)\b/;
const LISTBOX_LINE = /^- (?:listbox|option)\b/;
const isGoto = (p: Planned) => p.step.tool === 'goto' || Boolean(p.visit);
/** A click whose recorded effect stayed on its page. */
const stayed = (p: Planned) => !p.step.expect?.urlPattern || (p.before !== null && samePage(p.before, p.step.expect.urlPattern));

/**
 * (3) An opener left with nothing to open for: a click that stayed on its
 * page, added only menu or link lines, and whose next step — the one that
 * acted in what it opened — is now a visit or was left out.
 */
function orphanedOpener(a: Planned, next: Planned | undefined): boolean {
  if (!next || a.step.tool !== 'click' || a.visit || !stayed(a) || sideEffects(a)) return false;
  const added = a.step.expect?.addedContains ?? [];
  if (!added.length || !added.every((l) => MENU_LINE.test(l))) return false;
  return Boolean(next.visit || (next.pruned && next.pruned !== 'detour'));
}

/**
 * (4) A dropdown opened and dismissed: a click that stayed on its page and
 * added only a listbox and its options, then Escape (no target), and the step
 * after does not act on an option.
 */
function dismissedDropdown(a: Planned, b: Planned, after: Planned | undefined): boolean {
  if (a.step.tool !== 'click' || a.visit || !stayed(a) || sideEffects(a)) return false;
  const added = a.step.expect?.addedContains ?? [];
  if (!added.length || !added.every((l) => LISTBOX_LINE.test(l))) return false;
  if (b.step.tool !== 'press' || b.step.args?.key !== 'Escape' || b.step.args?.target || (b.step.locators?.target ?? []).length) return false;
  const inList = (after?.step.locators?.target ?? []).some((c) => (c.kind === 'role' && c.role === 'option') || ((c.kind === 'css' || c.kind === 'id') && /option|results/.test(c.selector)));
  return !inList;
}

/** (2) A visit straight after another visit: the first one's page is never used. */
function deadVisit(a: Planned, b: Planned): boolean {
  return isGoto(a) && isGoto(b) && !sideEffects(a);
}

/**
 * Noise pruning, only on recorded proof, within one flow step. Rule (1)
 * rewrites first; then, to a fixed point, the pair rules (toggle, round trip,
 * orphaned opener, dismissed dropdown) and — only when none of them applies —
 * the dead visit, so an opener between two visits goes before the first visit.
 * Returns each drop, in the order it was made.
 */
function prune(planned: Planned[]): string[] {
  const notes: string[] = [];
  const where = (p: Planned) => `${p.segment.id}/${p.index}`;
  const emitted = (p: Planned) => (!isRead(p.step.tool) || p.keptRead) && p.step.tool !== 'screenshot';
  for (const p of planned) {
    if (p.pruned || !emitted(p)) continue;
    const visit = anonymousLink(p);
    if (visit) {
      p.visit = visit;
      notes.push(`${where(p)} recorded as a click on an unlabelled link (${visit.selector}) — written as a visit to where it went`);
    }
  }
  const drop = (ps: Planned[], rule: string) => {
    for (const p of ps) p.pruned = rule;
    notes.push(`left out ${ps.map(where).join(', ')} (${rule})`);
  };
  for (;;) {
    const seq = planned.filter((p) => !p.pruned && emitted(p));
    let fired = false;
    for (let i = 0; i < seq.length && !fired; i++) {
      const [a, b, c] = [seq[i], seq[i + 1], seq[i + 2]];
      // The step after `a` as recorded, whatever has been done to it since.
      const next = planned.slice(planned.indexOf(a) + 1).find(emitted);
      if (b && !a.visit && !b.visit && toggledBack(a, b)) drop([a, b], 'toggle opened and closed again: the recording shows it changed nothing');
      else if (b && !b.visit && wentAndCameBack(a, b)) drop([a, b], 'navigated away and straight back with nothing done between');
      else if (orphanedOpener(a, next)) drop([a], 'opened a menu only for the step after it, which is now a visit');
      else if (b && dismissedDropdown(a, b, c)) drop([a, b], 'opened a dropdown and dismissed it with Escape, choosing nothing');
      else continue;
      fired = true;
    }
    for (let i = 0; i + 1 < seq.length && !fired; i++) {
      if (!deadVisit(seq[i], seq[i + 1])) continue;
      drop([seq[i]], 'a visit followed at once by another visit');
      fired = true;
    }
    if (!fired) return notes;
  }
}

// --- reads ---------------------------------------------------------------------

/** Steps a value reads back what the flow typed: a value read of a field this flow step filled, typed or selected. */
function echoRead(step: SkillStep, earlier: readonly SkillStep[]): boolean {
  if (step.args?.what !== 'value') return false;
  const target = bare(step.locators?.target?.slice(0, 1));
  return earlier.some((s) => (s.tool === 'fill' || s.tool === 'type' || s.tool === 'select') && bare(s.locators?.target?.slice(0, 1)) === target);
}

/**
 * Whether a read is emitted: its value is one a later step uses, or one the
 * step mints, or a declared output of the step that is not report-only. A
 * read-back pinned for the report (`(read-back)`), the page title and a read
 * of what the flow itself typed are report-only.
 */
function keepRead(file: FileState, stepId: string, segment: SpecSegment, index: number, step: SkillStep, earlier: readonly SkillStep[], outputs: readonly string[]): boolean {
  const label = step.label;
  if (!label) return false;
  if (file.consumed.has(`${stepId}.${label}`)) return true;
  if (Object.values(segment.derived ?? {}).some((d) => d.step === index && d.read === label)) return true;
  if (step.args?.target === '(read-back)' || step.args?.what === 'title') return false;
  if (echoRead(step, earlier)) return false;
  return outputs.includes(label);
}

function readExpr(scope: Scope, step: SkillStep, loc: string): string | null {
  const what = String(step.args?.what ?? 'text');
  const all = step.tool === 'read_all';
  const attr = typeof step.args?.attr === 'string' ? step.args.attr : '';
  if (what === 'count') return `String(await ${loc}.count())`;
  if (all) {
    if (what === 'text') return `(await ${loc}.allInnerTexts()).map((t) => t.trim()).join(' | ')`;
    if (what === 'value') return `(await ${loc}.evaluateAll((els) => els.map((e) => (e as { value?: string }).value ?? ''))).join(' | ')`;
    if (what === 'attr' && attr) return `(await ${loc}.evaluateAll((els, name) => els.map((e) => e.getAttribute(name) ?? ''), ${quote(attr)})).join(' | ')`;
    return null;
  }
  if (what === 'text') return `(await ${loc}.innerText()).trim()`;
  if (what === 'value') return `await ${loc}.inputValue()`;
  if (what === 'attr' && attr) return `(await ${loc}.getAttribute(${quote(attr)})) ?? ''`;
  void scope;
  return null;
}

// --- one SkillStep ---------------------------------------------------------------

/** The TODO line readiness and compile read as a blocker, the throw that stops a run, and the diagnostic. */
function unsupported(scope: Scope, where: string, what: string, fix: string): string[] {
  const line = `${where} ${what}`;
  scope.file.diagnostics.push({ code: 'unsupported-capability', step: scope.step.id, what, why: 'The readable style writes each recorded step as one plain Playwright call, and this one has no such form.', fix, severity: 'warning', line });
  scope.file.warnings.push(line);
  return [`// TODO: ${commentText(what)} — ${commentText(fix)}.`, `throw new Error(${quote(`${where}: ${what}`)});`];
}

/** Text an alert check can wait for: the longest run of the recorded alert before any volatile part, split at the close glyph. */
function stableAlert(alert: string): string | null {
  const head = alert.split('{{')[0];
  const pieces = head.split('×').map((p) => p.trim()).filter(Boolean);
  const best = pieces.reduce((a, b) => (b.length > a.length ? b : a), '');
  return best.length >= 3 ? best : null;
}

/** An action that submits: it navigated, it pressed Enter, or it pressed a button. */
function submitLike(step: SkillStep, navigated: boolean, loc: string | null): boolean {
  if (navigated) return true;
  if (step.tool === 'press' && step.args?.key === 'Enter') return true;
  return Boolean(loc && (/getByRole\('button'/.test(loc) || /button|type="submit"|\[type=submit\]/.test(loc)));
}

interface Emitted {
  lines: string[];
}

function waitLines(scope: Scope, step: SkillStep, loc: string | null, where: string, message: string | null): string[] {
  const args = step.args ?? {};
  const state = String(args.state ?? 'visible');
  const timeout = typeof args.timeout_ms === 'number' ? args.timeout_ms : undefined;
  const opt = (extra: string[] = []) => {
    const fields = [...extra, ...(timeout ? [`timeout: ${timeout}`] : [])];
    return fields.length ? `{ ${fields.join(', ')} }` : '';
  };
  const subject = (target: string) => (message ? `expect(${target}, ${message})` : `expect(${target})`);
  if (state === 'url_contains') {
    const o = [...(message ? [`message: ${message}`] : []), ...(timeout ? [`timeout: ${timeout}`] : [])];
    return [`await expect.poll(() => page.url()${o.length ? `, { ${o.join(', ')} }` : ''}).toContain(${str(scope, String(args.text ?? ''))});`];
  }
  if (!loc) return unsupported(scope, where, `(wait_for ${state}) has no locator a plain Playwright file can express`, `re-record ${scope.step.id} so its target is named`);
  const text = () => str(scope, String(args.text ?? ''));
  switch (state) {
    case 'visible':
      return [`await ${subject(loc)}.toBeVisible(${opt()});`];
    case 'hidden':
      return [`await ${subject(loc)}.toBeHidden(${opt()});`];
    case 'text_equals':
      return [`await ${subject(loc)}.toHaveText(${text()}, ${opt(['useInnerText: true'])});`];
    case 'text_contains':
      return [`await ${subject(loc)}.toContainText(${text()}, ${opt(['useInnerText: true'])});`];
    case 'count':
      return [`await ${subject(loc)}.toHaveCount(${Number(args.count ?? 0)}${opt() ? `, ${opt()}` : ''});`];
    case 'value_equals':
      return [`await ${subject(loc)}.toHaveValue(${text()}${opt() ? `, ${opt()}` : ''});`];
    default:
      return unsupported(scope, where, `waits for state ${state}, which has no plain Playwright form`, `re-record ${scope.step.id}`);
  }
}

/** Every tool this style writes (or, for screenshot, deliberately leaves out with a warning). */
const KNOWN_TOOLS = new Set([
  'read', 'read_all', 'goto', 'back', 'set_viewport', 'set_offline', 'eval', 'dialog_expect', 'tabs', 'press', 'wait_for',
  'click', 'dblclick', 'right_click', 'modifier_click', 'fill', 'type', 'select', 'check', 'hover', 'scroll_into_view',
  'upload', 'download', 'drag', 'loop', 'screenshot',
]);

/** The lines for one recorded step, `@step` marker first. */
function emitStep(scope: Scope, p: Planned, message: string | null, outputs: readonly string[]): Emitted {
  const { step, segment, index } = p;
  const stepId = scope.step.id;
  const where = `${stepId} ${segment.id}/${index}`;
  const args = step.args ?? {};
  const out: string[] = [`// @step ${where}`];
  scope.file.actions += 1;
  const s = (name: string) => String(args[name] ?? '');
  if (p.visit) {
    return { lines: [...out, `// recorded as a click on an unlabelled link (${commentText(p.visit.selector)})`, gotoLine(scope, p.visit.url)] };
  }
  if (!KNOWN_TOOLS.has(step.tool)) {
    return { lines: [...out, ...unsupported(scope, where, `uses tool ${step.tool}, which has no plain Playwright form`, `re-record ${stepId}, or use the runtime style for this flow`)] };
  }

  if (scope.step.kind === 'assert' || segment.assert) {
    if (step.tool !== 'wait_for') return { lines: [...out, ...unsupported(scope, where, `(${step.tool}) sits inside an assertion, which may only check`, `re-record the assertion ${stepId}`)] };
  }

  // Reads publish; everything else acts or checks.
  if (isRead(step.tool)) {
    const key = quote(`${stepId}.${step.label ?? ''}`);
    scope.uses.outputs = true;
    if (args.what === 'url') return { lines: [...out, `outputs[${key}] = page.url();`] };
    if (args.what === 'title') return { lines: [...out, `outputs[${key}] = (await page.title()).trim();`] };
    if (args.frame || args.slotFrame || args.frameMark || args.scopedBy) {
      return { lines: [...out, ...unsupported(scope, where, `reads ${step.label} through a recorded frame or scope, which the readable style cannot extract`, `use the runtime style for this flow, or re-record ${stepId} as a plain text read`)] };
    }
    const loc = chooseLocator(scope, step, 'target', where);
    const expr = loc ? readExpr(scope, step, loc) : null;
    if (!expr) return { lines: [...out, ...unsupported(scope, where, `(${step.tool} ${String(args.what ?? 'text')}) has no plain Playwright form`, `re-record ${stepId} as a text read`)] };
    if (step.unproven) scope.file.warnings.push(`${where}: the read of ${step.label} was synthesized and no run has resolved it yet`);
    return { lines: [...out, `outputs[${key}] = ${expr};`] };
  }

  const pageLevel = (lines: string[]) => ({ lines: [...out, ...lines] });
  switch (step.tool) {
    case 'goto':
      return pageLevel([gotoLine(scope, s('url'))]);
    case 'back':
      return pageLevel(['await page.goBack();']);
    case 'set_viewport':
      return pageLevel([`await page.setViewportSize({ width: ${Number(args.width ?? 0)}, height: ${Number(args.height ?? 0)} });`]);
    case 'set_offline':
      return pageLevel([`await page.context().setOffline(${Boolean(args.offline)});`]);
    case 'eval':
      return pageLevel([`await page.evaluate(${str(scope, s('expression'))});`]);
    case 'dialog_expect': {
      const action = args.action === 'accept' ? 'accept' : 'dismiss';
      const text = action === 'accept' && args.prompt_text ? str(scope, s('prompt_text')) : '';
      const count = typeof args.count === 'number' ? args.count : 1;
      return pageLevel([`page.${count > 1 ? 'on' : 'once'}('dialog', ${text.includes('await ') ? 'async ' : ''}(dialog) => dialog.${action}(${text}));`]);
    }
    case 'tabs': {
      const to = args.switch_to;
      if (typeof to !== 'number') return pageLevel(['// the recording listed the open tabs here; nothing to do']);
      return pageLevel([`page = ctx.page = page.context().pages()[${to}];`, 'await page.bringToFront();']);
    }
    default:
      break;
  }
  if (step.tool === 'press' && !args.target && !(step.locators?.target ?? []).length) {
    return finishAction(scope, p, out, `await page.keyboard.press(${str(scope, s('key'))});`, null, outputs);
  }
  if (step.tool === 'wait_for' && args.state === 'url_contains') return { lines: [...out, ...waitLines(scope, step, null, where, message)] };

  const loc = chooseLocator(scope, step, 'target', where);
  if (step.tool === 'wait_for') return { lines: [...out, ...waitLines(scope, step, loc, where, message)] };
  if (!loc) return { lines: [...out, ...unsupported(scope, where, `(${step.tool}) has no locator a plain Playwright file can express (the recording kept only a position)`, `re-record ${stepId} so the target is named`)] };

  let action: string;
  switch (step.tool) {
    case 'click':
      action = `await ${loc}.click();`;
      break;
    case 'dblclick':
      action = `await ${loc}.dblclick();`;
      break;
    case 'right_click':
      action = `await ${loc}.click({ button: 'right' });`;
      break;
    case 'modifier_click': {
      const mods = Array.isArray(args.modifiers) ? (args.modifiers as unknown[]).map(String) : [];
      action = `await ${loc}.click({ modifiers: [${mods.map(quote).join(', ')}] });`;
      break;
    }
    case 'fill':
      action = `await ${loc}.fill(${str(scope, s('value'))});`;
      break;
    case 'type':
      action = `await ${loc}.pressSequentially(${str(scope, s('text'))}${typeof args.delay_ms === 'number' ? `, { delay: ${args.delay_ms} }` : ''});`;
      break;
    case 'press':
      action = `await ${loc}.press(${str(scope, s('key'))});`;
      break;
    case 'select':
      // A string option matches an <option> by its value or its label.
      action = `await ${loc}.selectOption(${str(scope, s('option') || s('optionValue'))});`;
      break;
    case 'check':
      action = `await ${loc}.${args.checked === false ? 'uncheck' : 'check'}();`;
      break;
    case 'hover':
      action = `await ${loc}.hover();`;
      break;
    case 'scroll_into_view':
      action = `await ${loc}.scrollIntoViewIfNeeded();`;
      break;
    case 'upload': {
      const paths = Array.isArray(args.paths) ? (args.paths as unknown[]).map((x) => str(scope, String(x))) : [];
      action = `await ${loc}.setInputFiles([${paths.join(', ')}]);`;
      break;
    }
    case 'download': {
      const name = local(scope, 'download');
      const save = args.save_path ? str(scope, s('save_path')) : `\`downloads/\${(await ${name}).suggestedFilename()}\``;
      action = [`const ${name} = page.waitForEvent('download');`, `await ${loc}.click();`, `await (await ${name}).saveAs(${save});`].join('\n');
      break;
    }
    case 'drag': {
      const source = chooseLocator(scope, step, 'source', where);
      if (!source) return { lines: [...out, ...unsupported(scope, where, '(drag) has no locator a plain Playwright file can express for its source', `re-record ${stepId}`)] };
      action = `await ${source}.dragTo(${loc});`;
      break;
    }
    default:
      return { lines: [...out, ...unsupported(scope, where, `uses tool ${step.tool}, which has no plain Playwright form`, `re-record ${stepId}, or use the runtime style for this flow`)] };
  }
  return finishAction(scope, p, out, action, loc, outputs);
}

/**
 * An action with what the recording proves about it: a page effect followed
 * (popup, close), the url it navigated to checked — with this run's minted
 * values captured from it — an alert a submit raised waited for, and a late
 * page move held.
 */
function finishAction(scope: Scope, p: Planned, out: string[], action: string, loc: string | null, outputs: readonly string[]): Emitted {
  const { step, segment, index } = p;
  const stepId = scope.step.id;
  const effect = step.effect;
  if (effect?.kind === 'popup') {
    const name = local(scope, 'popup');
    out.push(`const ${name} = page.waitForEvent('popup');`, ...action.split('\n'), `page = ctx.page = await ${name};`, "await page.waitForLoadState();");
  } else if (effect?.kind === 'close') {
    const name = local(scope, 'opener');
    out.push(`const ${name} = await page.opener();`, ...action.split('\n'), `if (${name}) page = ctx.page = ${name};`);
  } else if (effect?.kind === 'switch') {
    out.push(...action.split('\n'), `page = ctx.page = page.context().pages()[${effect.to}];`, 'await page.bringToFront();');
  } else out.push(...action.split('\n'));

  const derived = Object.entries(segment.derived ?? {}).filter(([, d]) => d.step === index && !d.read);
  const to = step.expect?.urlPattern;
  const navigated = Boolean(to && !samePage(p.before, to));
  const mintedSlots = derived.map(([slot]) => slot);
  if (to && (navigated || derived.length || step.mints)) {
    const example = (slot: string) => segment.derived?.[slot]?.example ?? '';
    const { re, groups } = urlRegex(scope, to, mintedSlots, example);
    out.push(`await expect(page).toHaveURL(${re});`);
    if (groups.length === 1) {
      const name = local(scope, urlPartName(to, segment.derived![groups[0]].at));
      out.push(`const ${name} = page.url().match(${re})![1];`);
      scope.captured.set(groups[0], name);
    } else if (groups.length > 1) {
      const names = groups.map((slot) => local(scope, urlPartName(to, segment.derived![slot].at)));
      out.push(`const [, ${names.join(', ')}] = page.url().match(${re})!;`);
      groups.forEach((slot, i) => scope.captured.set(slot, names[i]));
    }
  }
  // A minted value the landing pattern does not carry at its slot: read off the url by its part.
  for (const [slot, d] of derived) {
    if (scope.captured.has(slot)) continue;
    const name = local(scope, urlPartName(to ?? null, d.at));
    out.push(`const ${name} = ${urlPartExpr(scope, d.at, to ?? null)};`);
    scope.captured.set(slot, name);
  }
  if (step.mints) {
    const bound = derived.find(([, d]) => d.at === step.mints!.at)?.[0];
    const value = bound ? scope.captured.get(bound)! : urlPartExpr(scope, step.mints.at, to ?? null);
    scope.uses.outputs = true;
    out.push(`outputs[${quote(`${stepId}.minted`)}] = ${value}; // the record this step created`);
  }
  const alert = step.expect?.alertContains ? stableAlert(step.expect.alertContains) : null;
  if (alert && submitLike(step, navigated, loc)) out.push(`await expect(page.getByText(${quote(alert)})).toBeVisible();`);
  if (typeof step.movedAfterMs === 'number' && step.movedAfterMs > 0) {
    out.push(`await page.waitForTimeout(${Math.round(step.movedAfterMs)}); // the recording saw the page keep moving this long after this step`);
  }
  void outputs;
  return { lines: out };
}

// --- a loop ----------------------------------------------------------------------

function emitLoop(scope: Scope, p: Planned, outputs: readonly string[]): Emitted {
  const { step, segment, index } = p;
  const where = `${scope.step.id} ${segment.id}/${index}`;
  const body = step.body ?? [];
  const guardStep: SkillStep = { tool: 'click', args: {}, locators: { target: step.while ?? body[0]?.locators?.target ?? [] }, ...(step.whileContext ? { contexts: { target: step.whileContext } } : {}) };
  const guard = chooseLocator(scope, guardStep, 'target', where);
  if (!guard || !body.length) {
    return { lines: [`// @step ${where}`, ...unsupported(scope, where, `is a loop with no ${guard ? 'body' : 'guard a plain locator can express'}`, `re-record ${scope.step.id}`)] };
  }
  const max = step.max ?? 20;
  const drain = (step.scope ?? 'drain') === 'drain';
  const pass = local(scope, 'pass');
  const lines = [
    `// @step ${where}`,
    `// The recording repeated these steps record after record: again while one still matches${drain ? ' (all of them must go)' : ''}, at most ${max} times.`,
    `for (let ${pass} = 0; ${pass} < ${max} && (await ${guard}.count()) > 0; ${pass}++) {`,
  ];
  scope.inLoop = (scope.inLoop ?? 0) + 1;
  for (const inner of body) {
    const e = inner.tool === 'loop' ? emitLoop(scope, { ...p, step: inner }, outputs) : emitStep(scope, { ...p, step: inner }, null, outputs);
    lines.push(...e.lines.map((l) => `  ${l}`));
  }
  scope.inLoop -= 1;
  lines.push('}');
  if (drain) lines.push(`await expect(${guard}).toHaveCount(0);`);
  return { lines };
}

// --- dropdowns: opener and option as one pick --------------------------------------

interface EmittedItem {
  p: Planned;
  /** The segment comment that goes above this item, when it starts a segment. */
  header?: string;
  lines: string[];
}

/** Lines a listbox or menu shows when it opens. */
const OPENS_LIST = /^- (?:listbox|option|menu|menuitem|menuitemcheckbox|menuitemradio)\b/;
/** …and, for a typed-search dropdown, the box the search is typed into. */
const OPENS_SEARCH = /^- (?:listbox|option|menu|menuitem|combobox|searchbox|textbox)\b/;
const CLICK_LINE = /^await (.+)\.click\(\);$/;
const OPTION_TARGET = /getByRole\('(?:option|menuitem|menuitemcheckbox|menuitemradio)'/;

/** A plain click (marker + one call, nothing after) that opened something, stayed on its page and did nothing else. */
function openerOf(item: EmittedItem, lines: RegExp): string | null {
  const s = item.p.step;
  if (s.tool !== 'click' || item.p.visit || !stayed(item.p) || sideEffects(item.p) || item.lines.length !== 2) return null;
  if (!(s.expect?.addedContains ?? []).some((l) => lines.test(l))) return null;
  return CLICK_LINE.exec(item.lines[1])?.[1] ?? null;
}

/** A click on an option or menu item: its locator, when the item is marker + the click (+ whatever follows it). */
function optionOf(item: EmittedItem | undefined): string | null {
  if (!item || item.header || item.p.step.tool !== 'click' || item.p.visit || item.lines.length < 2) return null;
  const target = CLICK_LINE.exec(item.lines[1])?.[1];
  return target && OPTION_TARGET.test(target) ? target : null;
}

/**
 * An opener and the option chosen from it, as one `pick(...)`: the opener's
 * click can land before the page's script has wired the dropdown up (Snipe-IT
 * select2, 1 run in 5 on sie2e3), and a plain second line would then wait out
 * the whole budget for an option that never comes. Only when the recording
 * shows the click opening a list (its added lines) and the very next action
 * picking an option; a typed-search dropdown (opener, typing, option) the same
 * way. Both `@step` markers stay above the call.
 */
function mergePicks(items: EmittedItem[], file: FileState, stepId: string): EmittedItem[] {
  const out: EmittedItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const [a, b, c] = [items[i], items[i + 1], items[i + 2]];
    const direct = openerOf(a, OPENS_LIST);
    const option = optionOf(b);
    if (direct && option) {
      file.helpers.add('pick');
      out.push({ p: a.p, header: a.header, lines: [a.lines[0], b.lines[0], `await pick(page, ${direct}, ${option});`, ...b.lines.slice(2)] });
      i += 1;
      continue;
    }
    const opener = openerOf(a, OPENS_SEARCH);
    const typed = b && !b.header && b.lines.length === 2 ? typedSearch(b) : null;
    const searched = optionOf(c);
    if (opener && typed && searched) {
      file.helpers.add('pick');
      out.push({ p: a.p, header: a.header, lines: [a.lines[0], b.lines[0], c!.lines[0], `await pick(page, ${opener}, ${searched}, ${typed});`, ...c!.lines.slice(2)] });
      i += 2;
      continue;
    }
    out.push(a);
  }
  void stepId;
  return out;
}

/** A fill or a typed search into a box, as pick's `search` argument. */
function typedSearch(item: EmittedItem): string | null {
  const s = item.p.step;
  if ((s.tool !== 'fill' && s.tool !== 'type') || sideEffects(item.p) || (s.expect?.urlPattern && !stayed(item.p))) return null;
  const fill = /^await (.+)\.fill\((.+)\);$/.exec(item.lines[1]);
  if (fill) return `{ search: ${fill[1]}, text: ${fill[2]} }`;
  const typed = /^await (.+)\.pressSequentially\((.+?)(?:, \{ delay: (\d+) \})?\);$/.exec(item.lines[1]);
  if (typed) return `{ search: ${typed[1]}, text: ${typed[2]}, delay: ${typed[3] ?? 0} }`;
  return null;
}

// --- one flow step ---------------------------------------------------------------

interface StepCode {
  id: string;
  fn: string;
  lines: string[];
  uses: Scope['uses'];
}

function functionName(id: string, taken: Set<string>): string {
  const base = `step${id
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('')}`;
  let name = IDENT.test(base) ? base : 'step';
  for (let i = 2; taken.has(name); i++) name = `${base}${i}`;
  taken.add(name);
  return name;
}

/** The url a segment's page is described by in its comment: the path, slots shown as the values they are bound to. */
function describePage(scope: Scope, pattern: string): string {
  const parts = parseUrl(pattern);
  const rest = parts ? pattern.slice(parts.origin.length) || '/' : pattern;
  const shown = rest.replace(/\{\{([vd]\d+)\}\}/g, (m, slot: string) => {
    const captured = scope.captured.get(slot);
    if (captured) return `<${captured}>`;
    const lit = literalOf(scope, m);
    if (lit !== null && lit !== '') return lit;
    const bound = /^\{\{(v\d+)\}\}$/.exec(resolveText(scope, m))?.[1];
    const expr = bound ? scope.synth.get(bound) : undefined;
    return expr && IDENT.test(expr) ? `<${expr}>` : ':id';
  });
  return parts && parts.origin !== scope.file.spec.origin ? `${parts.origin}${shown}` : shown;
}

function emitFlowStep(file: FileState, step: SpecStep, fn: string): StepCode {
  const scope = newScope(file, step);
  const lines: string[] = [];
  const outputs = step.outputs ?? [];
  if (!step.segments.length) {
    lines.push(
      `// TODO: no converged procedure for ${JSON.stringify(commentText(step.instruction))} — record it with sitelooper, then compile again.`,
      `throw new Error(${quote(`step ${step.id} has no converged procedure — record it with sitelooper, then compile again`)});`,
    );
    file.warnings.push(`${step.id}: no converged procedure`);
    return { id: step.id, fn, lines, uses: scope.uses };
  }

  // Plan: every recorded step in order, the page each started on, which reads are kept.
  const planned: Planned[] = [];
  let before: string | null = step.segments[0].preconditions.urlPattern ?? null;
  const earlier: SkillStep[] = [];
  for (const [si, segment] of step.segments.entries()) {
    const detour = segment.detour && !segment.assert && step.kind !== 'assert' && si > 0 && si < step.segments.length - 1;
    for (const [i, s] of segment.steps.entries()) {
      const p: Planned = { segment, index: i + 1, step: s, before };
      if (detour) p.pruned = 'detour';
      if (isRead(s.tool)) p.keptRead = keepRead(file, step.id, segment, i + 1, s, earlier, outputs);
      planned.push(p);
      earlier.push(s);
      const to = landing(s);
      if (to) before = to;
      else if (s.tool === 'back') before = null;
    }
  }
  for (const note of prune(planned)) file.warnings.push(`${step.id}: ${note}`);
  for (const segment of step.segments) {
    if (planned.some((p) => p.segment === segment && p.pruned === 'detour')) {
      file.warnings.push(`${step.id}: segment ${segment.id} is a detour the recording took when a goto was redirected; the readable style does not emit detours`);
    }
  }
  const screenshots = planned.filter((p) => p.step.tool === 'screenshot' && !p.pruned);
  if (screenshots.length) file.warnings.push(`${step.id}: ${screenshots.length} screenshot(s) the recording took for its report are not emitted`);

  // An assertion's checks all raise its sentence.
  const assertMessage = (s: SkillStep): string | null => {
    if (!s.assert?.message && step.kind !== 'assert') return null;
    return s.assert?.message ? str(scope, `assertion failed: ${s.assert.message}`) : null;
  };
  const messages = [...new Set(planned.filter((p) => p.step.tool === 'wait_for').map((p) => (p.step.assert?.message ? `assertion failed: ${p.step.assert.message}` : '')).filter(Boolean))];
  let sharedMessage: string | null = null;
  const body: string[] = [];
  if (messages.length === 1 && planned.filter((p) => p.step.assert).length > 1) {
    sharedMessage = local(scope, 'failed');
    body.push(`const ${sharedMessage} = ${str(scope, messages[0])};`);
  }

  let current: SpecSegment | null = null;
  const items: EmittedItem[] = [];
  for (const p of planned) {
    if (p.pruned) continue;
    if (isRead(p.step.tool) && !p.keptRead) continue;
    if (p.step.tool === 'screenshot') continue;
    let header: string | undefined;
    if (p.segment !== current) {
      current = p.segment;
      scope.segment = current;
      header = `// ${current.id} — recorded on ${describePage(scope, current.preconditions.urlPattern)}`;
    }
    const message = p.step.assert ? (sharedMessage ?? assertMessage(p.step)) : null;
    const e = p.step.tool === 'loop' ? emitLoop(scope, p, outputs) : emitStep(scope, p, message, outputs);
    const lines = [...e.lines];
    // A value a read minted ({{dN}} with `read`) is bound from what it published.
    for (const [slot, d] of Object.entries(p.segment.derived ?? {})) {
      if (d.step !== p.index || !d.read || scope.captured.has(slot)) continue;
      const name = local(scope, d.read);
      lines.push(`const ${name} = outputs[${quote(`${step.id}.${d.read}`)}];`);
      scope.captured.set(slot, name);
    }
    items.push({ p, header, lines });
  }
  for (const item of mergePicks(items, file, step.id)) body.push(...(item.header ? [item.header] : []), ...item.lines);

  // What later steps refer to this one by, published.
  const published = new Set<string>();
  for (const l of body) for (const m of l.matchAll(/^outputs\['([^']+)'\] = /g)) published.add(m[1]);
  const tail: string[] = [];
  const end = endPattern(step);
  for (const ref of [...file.consumed].filter((k) => k.startsWith(`${step.id}.`)).sort()) {
    if (published.has(ref)) continue;
    const output = ref.slice(step.id.length + 1);
    if (output === 'url') {
      tail.push(`outputs[${quote(ref)}] = page.url();`);
      continue;
    }
    if (output.startsWith('url.')) {
      const label = output.slice(4);
      const route = step.urlRoutes?.[output];
      tail.push(`outputs[${quote(ref)}] = ${urlOutputExpr(scope, label, route, end, planned)};`);
      continue;
    }
    if (output === 'minted') continue;
    // A report value that is one of the step's own params: what the caller gave it.
    const template = step.segments.at(-1)?.report?.values?.[output];
    const one = typeof template === 'string' ? /^\s*\{\{([vd]\d+)\}\}\s*$/.exec(template)?.[1] : undefined;
    if (one && (one in step.params || scope.captured.has(one))) {
      tail.push(`outputs[${quote(ref)}] = ${str(scope, `{{${one}}}`)};`);
      continue;
    }
    file.diagnostics.push({
      code: 'unsourced-ref',
      step: step.id,
      what: `a later step needs {{${ref}}}, and nothing in the readable ${step.id} publishes it`,
      why: `${step.id} reads ${output} only for its report (a read-back or the page title), or not at all, so the readable file has no value to hand on.`,
      fix: `re-record ${step.id} so it reads ${output} from an element (\`sitelooper rerecord <flow file> ${step.id}\`)`,
      action: { command: 'rerecord', args: [step.id], step: step.id },
      severity: 'error',
    });
    tail.push(`// TODO: publish ${ref} — no recorded read of ${commentText(output)} can be written as plain Playwright.`);
  }
  if (tail.length) scope.uses.outputs = true;

  // The references this step needs, bound before anything runs.
  for (const [ref, name] of [...scope.refs]) lines.push(`const ${name} = need(outputs, ${quote(ref)}, ${quote(step.id)});`);
  lines.push(...scope.blockers, ...body, ...tail);
  return { id: step.id, fn, lines, uses: scope.uses };
}

/** A consumed `{{<step>.url.<label>}}`: the minted local when the end url carries it, else the part read off the url. */
function urlOutputExpr(scope: Scope, label: string, route: string | undefined, end: string | null, planned: Planned[]): string {
  if (route) {
    // A part minted on a url the step VISITED (urlRoutes): the last action that landed on the route.
    const hit = [...planned].reverse().find((p) => !p.pruned && landing(p.step) && routeAt(landing(p.step)!, label) === route);
    const visited = hit ? landing(hit.step)! : null;
    if (visited && visited !== end) {
      const captured = slotAt(visited, label);
      if (captured && scope.captured.has(captured)) return scope.captured.get(captured)!;
      scope.file.warnings.push(`${scope.step.id}: url.${label} was minted on a url the step visited mid-way; the readable file reads it off the url the step ends on`);
    }
  }
  const atEnd = end ? slotAt(end, label) : null;
  if (atEnd && scope.captured.has(atEnd)) return scope.captured.get(atEnd)!;
  return urlPartExpr(scope, label, end);
}

/** The `{{dN}}` a url pattern carries at part `label`, if any. */
function slotAt(pattern: string, label: string): string | null {
  const p = /^p(\d+)$/.exec(label);
  const parts = parseUrl(pattern);
  if (!p || !parts) return null;
  return /^\{\{(d\d+)\}\}$/.exec(parts.path[Number(p[1])] ?? '')?.[1] ?? null;
}

// --- helpers the file carries when it uses them ------------------------------------

const HELPERS: Record<string, string[]> = {
  need: [
    '/** A value an earlier step published; stops the step before it runs when that step did not. */',
    'function need(outputs: Outputs, key: string, by: string): string {',
    '  const value = outputs[key];',
    "  if (!value) throw new Error(`${by} needs {{${key}}}, and this run never published it`);",
    '  return value;',
    '}',
  ],
  pick: [
    '/**',
    " * Opens a dropdown and chooses an option. The opener's click can land before the page's script has",
    ' * wired the dropdown up, and then nothing opens: it is clicked again until the option shows — but',
    ' * not while a list is already open (a second click would close it), and a typed search is typed again.',
    ' */',
    'async function pick(page: Page, opener: Locator, option: Locator, typed?: { search: Locator; text: string; delay?: number }): Promise<void> {',
    '  await expect(async () => {',
    '    if (!(await option.isVisible())) {',
    '      if (typed) {',
    '        if (!(await typed.search.isVisible())) await opener.click();',
    '        if (typed.delay === undefined) await typed.search.fill(typed.text);',
    "        else await typed.search.fill('').then(() => typed.search.pressSequentially(typed.text, { delay: typed.delay }));",
    "      } else if (!(await page.getByRole('listbox').or(page.getByRole('menu')).first().isVisible())) await opener.click();",
    '    }',
    '    await expect(option).toBeVisible({ timeout: 3_000 });',
    '  }).toPass({ timeout: 30_000 });',
    '  await option.click();',
    '}',
  ],
  visit: [
    '/** Opens a path of the app on the origin this run is on (startUrl, or the project baseURL). */',
    'async function visit(page: Page, path: string): Promise<void> {',
    '  await page.goto(new URL(path, page.url()).href);',
    '}',
  ],
  escapeRe: [
    '/** A value as literal regex source. */',
    'function escapeRe(value: string): string {',
    "  return value.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');",
    '}',
  ],
  totp: [
    '/**',
    ' * The current one-time code (RFC 6238: HMAC-SHA-1, 30 s, 6 digits, or what an',
    ' * otpauth:// URI says) for the base32 seed in an environment variable.',
    ' */',
    'async function totp(seed: string, name: string): Promise<string> {',
    '  let secret = seed.trim();',
    "  let digits = 6, period = 30, hash = 'SHA-1';",
    '  if (/^otpauth:/i.test(secret)) {',
    '    const url = new URL(secret);',
    "    secret = url.searchParams.get('secret') ?? '';",
    "    digits = Number(url.searchParams.get('digits') ?? 6);",
    "    period = Number(url.searchParams.get('period') ?? 30);",
    "    hash = (url.searchParams.get('algorithm') ?? 'SHA1').toUpperCase().replace(/^SHA/, 'SHA-');",
    '  }',
    "  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';",
    '  const bytes: number[] = [];',
    '  let bits = 0, acc = 0;',
    "  for (const ch of secret.replace(/[\\s=-]/g, '').toUpperCase()) {",
    '    const v = alphabet.indexOf(ch);',
    '    if (v < 0) throw new Error(`${name} is not a base32 TOTP secret`);',
    '    acc = (acc << 5) | v;',
    '    bits += 5;',
    '    if (bits >= 8) bytes.push((acc >>> (bits -= 8)) & 0xff);',
    '  }',
    '  const periodMs = period * 1000;',
    '  if (periodMs - (Date.now() % periodMs) < 3000) await new Promise((r) => setTimeout(r, periodMs - (Date.now() % periodMs) + 50));',
    '  let counter = Math.floor(Date.now() / periodMs);',
    '  const message = new Uint8Array(8);',
    '  for (let i = 7; i >= 0; i--, counter = Math.floor(counter / 256)) message[i] = counter % 256;',
    '  const subtle = (globalThis as unknown as { crypto: { subtle: any } }).crypto.subtle;',
    "  const key = await subtle.importKey('raw', new Uint8Array(bytes), { name: 'HMAC', hash }, false, ['sign']);",
    "  const mac = new Uint8Array(await subtle.sign('HMAC', key, message));",
    '  const at = mac[mac.length - 1] & 0x0f;',
    '  const bin = ((mac[at] & 0x7f) << 24) | (mac[at + 1] << 16) | (mac[at + 2] << 8) | mac[at + 3];',
    "  return String(bin % 10 ** digits).padStart(digits, '0');",
    '}',
  ],
};

/** Environment-backed inputs named anywhere in the procedure — the runtime file's rule (emit.ts requiredEnvNames). */
function requiredEnvNames(spec: SpecFlow): string[] {
  const names = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const m of value.matchAll(/\{\{(?:env|totp):([A-Za-z_]\w*)\}\}/g)) names.add(m[1]);
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(spec);
  return [...names].sort();
}

/** `{{<step>.<output>}}` references the flow's own params make. */
function consumedRefs(spec: SpecFlow): Set<string> {
  const out = new Set<string>();
  for (const step of spec.steps) {
    for (const value of Object.values(step.params ?? {})) {
      for (const m of String(value).matchAll(/\{\{([\w-]+\.[\w.#-]+)\}\}/g)) out.add(m[1]);
    }
  }
  return out;
}

// --- the file ------------------------------------------------------------------------

export function emitReadableFlowFile(spec: SpecFlow, o: ReadableEmitOptions): ReadableEmitResult {
  const file: FileState = {
    spec,
    warnings: [NO_FALLBACK_WARNING],
    diagnostics: [],
    helpers: new Set(),
    consumed: consumedRefs(spec),
    followsPages: spec.steps.some((st) => st.segments.some((seg) => seg.steps.some(function moves(s): boolean {
      return Boolean((s.effect && s.effect.kind !== 'navigate') || (s.tool === 'tabs' && typeof s.args?.switch_to === 'number') || s.body?.some(moves));
    }))),
    actions: 0,
  };
  const envNames = requiredEnvNames(spec);
  const taken = new Set<string>();
  const steps = spec.steps.map((st) => emitFlowStep(file, st, functionName(st.id, taken)));
  const assertIds = spec.steps.filter((st) => st.kind === 'assert' || st.segments.some((seg) => seg.assert)).map((st) => st.id);
  const budget = Math.min(BUDGET_MAX_MS, BUDGET_BASE_MS + BUDGET_PER_ACTION_MS * file.actions);
  const browser = spec.browser ?? { viewport: { width: 1280, height: 900 } };
  const use = {
    viewport: browser.viewport,
    ...(browser.deviceScaleFactor !== undefined ? { deviceScaleFactor: browser.deviceScaleFactor } : {}),
    ...(browser.isMobile !== undefined ? { isMobile: browser.isMobile } : {}),
    ...(browser.hasTouch !== undefined ? { hasTouch: browser.hasTouch } : {}),
    ...(browser.userAgent !== undefined ? { userAgent: browser.userAgent } : {}),
    actionTimeout: ACTION_TIMEOUT_MS,
    navigationTimeout: NAVIGATION_TIMEOUT_MS,
  };
  const startParts = parseUrl(spec.startUrl);
  const startPath = startParts && startParts.origin === spec.origin ? spec.startUrl.slice(startParts.origin.length) || '/' : spec.startUrl;
  const source = { flow: spec.name, bundle: o.bundleRelPath, specHash: readableSpecHash(spec) };

  const header = o.standalone
    ? [
        `// Written with sitelooper ${o.compilerVersion} from the recorded flow ${JSON.stringify(spec.name)}.`,
        '// Plain @playwright/test with no other dependency: edit it like any other test.',
      ]
    : [
        `// Generated by sitelooper ${o.compilerVersion} from flow ${JSON.stringify(spec.name)} (readable style) — regenerate, don't edit:`,
        `//   sitelooper compile ${/^[\w.@/-]+$/.test(spec.name) ? spec.name : JSON.stringify(spec.name)} --style readable`,
        READABLE_MARKER_LINE,
        `// @sitelooper-source ${JSON.stringify(source)}`,
      ];
  const out: string[] = [
    ...header,
    `import { expect, test, ${file.helpers.has('pick') ? 'type Locator, ' : ''}type Page } from '@playwright/test';`,
    '',
    '// The one Node global this file reads, declared so it type-checks without @types/node.',
    'declare const process: { env: Record<string, string | undefined> };',
    '',
    `export const flowStepIds = ${JSON.stringify(spec.steps.map((st) => st.id))} as const;`,
    `export const requiredInputNames = ${JSON.stringify(spec.vars)} as const;`,
    `export const requiredEnvNames = ${JSON.stringify(envNames)} as const;`,
    ...(assertIds.length ? [`export const assertStepIds = ${JSON.stringify(assertIds)} as const;`] : []),
    '',
    `export type Vars = ${spec.vars.length ? `{ ${spec.vars.map((v) => `${key(v)}: string`).join('; ')} }` : 'Record<string, never>'};`,
    `export type Env = ${envNames.length ? 'Record<(typeof requiredEnvNames)[number], string>' : 'Record<string, never>'};`,
    '/** Values the steps publish, keyed "<stepId>.<output>". */',
    'export type Outputs = Record<string, string>;',
    `export interface StepContext { vars: Vars; env: Env; outputs: Outputs${file.followsPages ? '; page?: Page' : ''} }`,
    '/** The runtime style\'s run record, kept so an existing .spec.ts compiles unchanged; this style never drifts. */',
    'export interface FlowRun { drift: string[]; warnings: string[]; echoed: string[] }',
    'export interface RunOptions { startUrl?: string; run?: FlowRun }',
    '',
    `/** 30 s plus 5 s for each of the flow's ${file.actions} recorded actions: with no fallback to try, a run either goes through or stops at its first stuck action. */`,
    `export const BUDGET_MS = ${budget};`,
    `/** The browser the flow was recorded in, applied by the generated .spec.ts with test.use(); a stuck action or navigation fails after ${ACTION_TIMEOUT_MS / 1000} s / ${NAVIGATION_TIMEOUT_MS / 1000} s, naming its step, instead of using up BUDGET_MS. */`,
    `export const RECORDED_USE = ${JSON.stringify(use)};`,
    '/** Where the app was when this flow was recorded: used only when neither startUrl nor the project baseURL says. */',
    `export const RECORDED_ORIGIN = ${quote(spec.origin)};`,
    '',
    'export function createFlowRun(): FlowRun {',
    '  return { drift: [], warnings: [], echoed: [] };',
    '}',
    '',
    '/** Every input the flow needs, checked before the browser goes anywhere. */',
    'function readInputs(vars: Vars): Env {',
    '  const missing: string[] = [];',
    ...spec.vars.map((v) => `  if (!${member('vars', v)}?.trim()) missing.push(${quote(envName(v))});`),
    '  for (const name of requiredEnvNames) if (!process.env[name]?.trim()) missing.push(name);',
    "  if (missing.length) throw new Error(`missing required flow input${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`);",
    envNames.length
      ? `  return { ${envNames.map((n) => `${key(n)}: process.env.${n}!`).join(', ')} };`
      : '  return {};',
    '}',
    '',
    '/** Runs every step in order and returns what they published. */',
    'export async function runFlow(page: Page, vars: Vars, options: RunOptions = {}): Promise<Outputs> {',
    '  const ctx: StepContext = { vars, env: readInputs(vars), outputs: {} };',
    '  const base = test.info().project.use.baseURL ?? RECORDED_ORIGIN;',
    `  await page.goto(new URL(options.startUrl ?? ${quote(startPath)}, base).href);`,
  ];
  for (const st of steps) {
    const instruction = spec.steps.find((s) => s.id === st.id)!.instruction;
    out.push(`  await test.step(${quote(`${st.id}: ${instruction}`)}, () => ${st.fn}(${file.followsPages ? 'ctx.page ?? page' : 'page'}, ctx));`);
    out.push(`  console.log(${quote(`[sitelooper step] ${st.id}`)});`);
  }
  out.push('  return ctx.outputs;', '}', '');
  out.push('export const steps = {', ...steps.map((st) => `  ${quote(st.id)}: ${st.fn},`), '};');
  // Helpers sit above the first `@step` marker: a stack frame inside one then has no marker above it,
  // and check.ts walks on to the caller's frame, the step line that called it.
  for (const name of ['need', 'visit', 'pick', 'escapeRe', 'totp'] as const) {
    if (file.helpers.has(name)) out.push('', ...HELPERS[name]);
  }

  for (const st of steps) {
    const spStep = spec.steps.find((s) => s.id === st.id)!;
    const used = (['vars', 'env', 'outputs'] as const).filter((k) => st.uses[k]);
    const needsCtx = file.followsPages && st.lines.some((l) => l.includes('ctx.page'));
    const param = needsCtx ? 'ctx' : used.length ? `{ ${used.join(', ')} }` : '_ctx';
    out.push('', `/** ${spStep.kind === 'assert' ? 'assert: ' : ''}${commentText(spStep.instruction)} */`);
    out.push(`async function ${st.fn}(page: Page, ${param}: StepContext): Promise<void> {`);
    if (needsCtx && used.length) out.push(`  const { ${used.join(', ')} } = ctx;`);
    for (const line of st.lines) out.push(...line.split('\n').map((l) => (l ? `  ${l}` : l)));
    out.push('}');
  }
  out.push('');
  return { source: out.join('\n'), warnings: file.warnings, diagnostics: file.diagnostics };
}
