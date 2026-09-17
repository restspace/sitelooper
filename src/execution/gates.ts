/**
 * The step and segment GATES both execution targets judge by, as pure
 * verdicts over observations the caller supplies: an error page, where a step
 * left the url, a live-region alert, where a segment starts, and whether a
 * goal's markers are bound at all.
 *
 * Each verdict is one function called by daemon replay (src/skills/replay.ts)
 * AND by the compiled `.flow.ts` artifact, which embeds this exact source
 * (spec/runtime-source.ts). What differs per runner is only HOW it waits and
 * observes, never what it decides — a rule only one runner applies is the class
 * of defect the parity harness exists to catch. So this module must stay
 * self-contained: sibling shared modules and Playwright types only.
 *
 * `where` in every message is the caller's name for the step ("step 3" in the
 * daemon, "<stepId> <segmentId>/<n>" in the artifact).
 */
import { clip } from './text.js';
import { boundQueryKeys, CREDENTIAL_KEY, fillParams, mintedShape, oneSidedQueryKeys, serializeShape, softUrlMatch, urlDiff, urlMatches, urlShapeOf, type UrlSegDiff, type UrlShape } from './url.js';

/**
 * How a LIVE url reads in a verdict's message. The message travels: into a
 * recovery prompt, onto the persisted run record, into a refusals list. The
 * url's shape (origin, path, hash route or state) is all any of those need;
 * the query string and a free-form fragment are where `?token=…` and
 * `#access_token=…` live, and they must not travel with it. A state-shaped
 * fragment is kept (its keys are app routing — odoo's `#action=9&cids=1`).
 * Of the query, only the keys `against` — the pattern the url was judged by —
 * names are kept, since those are the pairs the verdict is about
 * (`?status=failure` where `?status=success` was expected); every other query
 * pair is dropped. Either way the VALUE of any key that names a credential is
 * replaced by `***`. A url that does not parse is shown as it is.
 */
export function describeUrl(url: string, against?: string): string {
  const shape = urlShapeOf(url);
  if (!shape) return url;
  const named = (against && urlShapeOf(against)?.query) || new Map<string, string>();
  for (const key of shape.query.keys()) {
    if (!named.has(key)) shape.query.delete(key);
  }
  for (const pairs of [shape.query, shape.hashState]) {
    for (const key of pairs.keys()) {
      if (CREDENTIAL_KEY.test(key)) pairs.set(key, '***');
    }
  }
  return serializeShape(shape);
}

/**
 * A stored pattern as a verdict must SHOW it: filled from this run's params,
 * and any marker the run never bound rendered as the wildcard the matcher
 * already treats it as (url.ts isWildcardSeg). DISPLAY ONLY — every matcher
 * here goes on reading the raw pattern, so which urls pass is unchanged.
 *
 * fwod51's 07-verify printed "expected url …&id={{d3}}&…": the literal text of
 * a marker no page ever shows, inside a sentence reading "expected url". The
 * gate was right — the click had overshot onto another record's list — but the
 * refusal read as a broken gate in the drift ticket, the flowrun and the
 * compile diagnostic, and sent the fix hunting in the wrong place. A `{{vN}}`
 * is a value the caller supplies and reads as `:var`; anything else is a
 * position the run derives, and reads as `:id`, which is how the compiler
 * already spells the id positions beside it.
 */
export function shownPattern(pattern: string, params: Record<string, string>): string {
  return fillParams(pattern, params).replace(/\{\{([\w.-]+)\}\}/g, (_m, name: string) => (/^v\d+$/.test(name) ? ':var' : ':id'));
}

/** The tab is on a browser error page: a crashed renderer, a navigation the network refused. */
export function isErrorPageUrl(url: string): boolean {
  return /^chrome-error:|^about:neterror/.test(url);
}

/**
 * Nothing recorded can hold on an error page, and every later step would
 * resolve nothing while the run pressed on. fwgr26-n2 ran eleven more steps
 * on chrome-error://chromewebdata/ before the next segment refused with the
 * unreadable "browser is at null/".
 */
export function errorPageVerdict(url: string, where: string): string | null {
  return isErrorPageUrl(url) ? `after ${where} the browser is on an error page (${url}) — the tab crashed or a navigation failed` : null;
}

export interface UrlEffectVerdict {
  stop?: string;
  warnings: string[];
  /** The pattern with the disagreeing segments generalised, to persist once the run past here succeeds. */
  generalised?: string;
  diffs?: UrlSegDiff[];
}

/**
 * Hard expectation: where the step was supposed to leave the browser. A
 * strict match passes. A same-shape url whose 1–2 literal segments disagree is
 * the signature of an environment-minted identifier (a Grafana uid, an Odoo
 * action id) — treated as volatile: warn, hand back the generalisation,
 * continue. Anything else stops. The WAIT for a navigation still in flight
 * belongs to the caller: judge only once the url has had its window.
 */
export function urlEffectVerdict(
  pattern: string | undefined,
  liveUrl: string,
  params: Record<string, string>,
  where: string,
): UrlEffectVerdict {
  if (!pattern || urlMatches(pattern, liveUrl, params)) return { warnings: [] };
  const soft = softUrlMatch(pattern, liveUrl, params);
  if (!soft) {
    const shown = shownPattern(pattern, params);
    return { warnings: [], stop: `after ${where} expected url ${shown} but browser is at ${describeUrl(liveUrl, shown)}` };
  }
  return {
    warnings: [`${where}: url segment(s) differ from recorded (${describeDiffs(soft.diffs)}) — treated as volatile`],
    generalised: soft.generalised,
    diffs: soft.diffs,
  };
}

function describeDiffs(diffs: UrlSegDiff[]): string {
  return diffs.map((d) => `${d.expected}→${d.actual}`).join(', ');
}

/** How a url position reads in a message, in the spelling urlRecordParts uses. */
function positionLabel(d: UrlSegDiff): string {
  return d.where === 'path' ? `path[${d.index}]` : d.where === 'hashPath' ? `#[${d.index}]` : d.where === 'hashState' ? `#${d.key}` : `${d.key}`;
}

function samePosition(a: UrlSegDiff, b: UrlSegDiff): boolean {
  return a.where === b.where && a.index === b.index && a.key === b.key;
}

/** What a url holds at the position a diff names, or undefined when it has none there. */
function partAt(shape: UrlShape, d: UrlSegDiff): string | undefined {
  if (d.where === 'path') return shape.path[d.index!];
  if (d.where === 'hashPath') return shape.hashPath[d.index!];
  if (d.where === 'query') return shape.query.get(d.key!);
  return shape.hashState.get(d.key!);
}

/**
 * Rewrite the named positions of a url, leaving every other byte of it as it
 * was. Not serializeShape: that sorts the query, drops noise keys and decodes
 * values, and a navigation must ask for the url the recording asked for, with
 * only these positions changed. Null when a position is not in the url.
 */
function withUrlParts(url: string, edits: readonly { at: UrlSegDiff; value: string }[]): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  // The fragment is edited as text: `#` may carry a route, state pairs, and a
  // `?…` remainder urlShapeOf ignores but the app may not.
  const cut = u.hash.indexOf('?');
  let body = u.hash.length > 1 ? (cut < 0 ? u.hash.slice(1) : u.hash.slice(1, cut)) : '';
  const rest = cut < 0 ? '' : u.hash.slice(cut);
  const nthNonEmpty = (parts: string[], n: number): number => parts.reduce<number[]>((keep, part, i) => (part === '' ? keep : [...keep, i]), [])[n] ?? -1;
  for (const { at, value } of edits) {
    if (at.where === 'path') {
      const segs = u.pathname.split('/');
      const i = nthNonEmpty(segs, at.index!);
      if (i < 0) return null;
      segs[i] = encodeURIComponent(value);
      u.pathname = segs.join('/');
    } else if (at.where === 'query') {
      if (!u.searchParams.has(at.key!)) return null;
      u.searchParams.set(at.key!, value);
    } else if (at.where === 'hashPath') {
      const segs = body.split('/');
      const i = nthNonEmpty(segs, at.index!);
      if (i < 0) return null;
      segs[i] = encodeURIComponent(value);
      body = segs.join('/');
    } else {
      const pairs = body.split('&');
      const i = pairs.findIndex((p) => p.split('=')[0] === at.key);
      if (i < 0) return null;
      pairs[i] = `${at.key}=${encodeURIComponent(value)}`;
      body = pairs.join('&');
    }
  }
  u.hash = body || rest ? `#${body}${rest}` : '';
  return u.toString();
}

/** Where a navigation should actually go, and what is stale about where it was told to go. */
export interface NavigationTarget {
  /** The url to navigate to: the recorded target, or it with volatile positions taken from the live url. */
  url: string;
  /** What was retargeted, for the run's warnings; absent when the recorded target stands. */
  warning?: string;
  /**
   * The target still spells a value at a position this run has shown volatile
   * — the recording's record, not this run's. Handed to the alert gate as the
   * CAUSE of an unrecorded alert on the landing (alertVerdict.navigatedToStale).
   */
  stale?: string;
}

/**
 * Where a goto should send the browser. A recorded target is a literal from
 * the RECORDING's run, and one of its positions may be an identifier the
 * environment mints afresh — the case the soft url match already treats as
 * volatile. When this run has DEMONSTRATED that a position varies (the
 * `diffs` a urlEffectVerdict or a precondition soft match handed back) and the
 * target still spells the stale value there, the recorded literal names a page
 * of the recording's run, not of this one: navigate to the value the browser
 * is already showing at that position instead.
 *
 * Evidence only, never a shape guess: the position must have been observed to
 * vary in THIS run, the target must still carry exactly the value that
 * observation found stale, the live url must be the target's own page shape
 * (urlDiff), and every position where the two disagree must be one of those
 * observed — a disagreement anywhere else is a different page, and the
 * recorded target stands. Both sides must look minted, as softUrlMatch
 * requires, so `/orders/success` is never retargeted to `/orders/failure`.
 *
 * fwgr41-n3 06-find: step 6 warned "url segment(s) differ from recorded
 * (afyd7g0300dfkc→cfyd8hqymgfeoe) — treated as volatile", and step 7 then went
 * to the recorded `/d/afyd7g0300dfkc/…` — a dashboard this environment never
 * minted — where Grafana answered "Dashboard not found".
 */
export function retargetNavigation(target: string, liveUrl: string, volatile: readonly UrlSegDiff[], where = 'this navigation'): NavigationTarget {
  // An unfilled marker is not a concrete destination; whatever this would
  // compare, it is not the url the step will ask for.
  if (!volatile.length || /\{\{/.test(target)) return { url: target };
  const shape = urlShapeOf(target);
  if (!shape) return { url: target };
  const carried = volatile.filter((v) => v.expected !== v.actual && partAt(shape, v) === v.expected);
  if (!carried.length) return { url: target };
  const stale = `its url still names the recorded ${carried.map((v) => `${positionLabel(v)}=${clip(v.expected, 40)}`).join(', ')}, which this run has already shown varies (${carried.map((v) => clip(v.actual, 40)).join(', ')})`;
  const diffs = urlDiff(target, liveUrl);
  // The browser is already where the target points (or on a url that is not
  // its page at all, where nothing here can be read off it).
  if (diffs && !diffs.length) return { url: target };
  if (!diffs) return { url: target, stale };
  const edits: { at: UrlSegDiff; value: string }[] = [];
  for (const d of diffs) {
    if (!carried.some((v) => samePosition(v, d) && v.expected === d.expected)) return { url: target, stale };
    if (!mintedShape(d.expected) || !mintedShape(d.actual)) return { url: target, stale };
    edits.push({ at: d, value: d.actual });
  }
  const url = withUrlParts(target, edits);
  if (!url) return { url: target, stale };
  return {
    url,
    warning: `${where}: the recorded target names ${diffs.map((d) => `${positionLabel(d)}=${clip(d.expected, 40)}`).join(', ')}, a position this run has already shown volatile — navigating to the live ${diffs.map((d) => `${positionLabel(d)}=${clip(d.actual, 40)}`).join(', ')} instead`,
  };
}

export interface AlertVerdict {
  stop?: string;
  warnings: string[];
  /** The alert evidence could not be captured; nothing here was proven either way. */
  unobserved?: true;
}

/**
 * An alert the recording never saw cannot, on its own, be told apart: it may
 * be the app talking back — a rejection ("Ticket is not ready…") that leaves
 * the page superficially intact, as fwrd4l-n3 clicked into, the step counted
 * as run and only external verification catching that the ticket never
 * reached Ready — or it may be ambient page content that simply rendered late,
 * like fwgr34's "Error loading RSS feed" on a Grafana home page whose feed an
 * offline box cannot reach (the recording's after-look came before it did).
 *
 * So an unrecorded alert is always REPORTED, and whether the run continues is
 * decided by the step's own state evidence, not by the alert:
 * - `effectConfirmed` (expect.ts ChangeVerdict.confirmed — the recorded page
 *   changes appeared in what the action added): the step demonstrably did what
 *   it was recorded doing, so the alert is a warning and the run goes on; a
 *   later gate or step stops it if the state is in fact broken.
 * - otherwise the alert is the only evidence there is about whether the step
 *   worked, and a state-changing step stops on it (the rejected Mark that
 *   would otherwise go on to Remove the item).
 * A recorded-but-missing alert stays soft — toasts are volatile — and never
 * stops; a recorded alert (`expectedContains`) is what the step is expected
 * to raise, and is checked, not treated as unexpected.
 *
 * `before`/`after` are the visible live-region texts around the action (the
 * daemon's diff already holds the surplus, so it passes `before: []`); `after`
 * is null when the page could not be captured, which is reported as
 * unobserved rather than read as "no alert was raised".
 *
 * `afterComplete` false says the after-look did not see every live region
 * (the alert cap was reached, or a rendered frame could not be read). An
 * alert it DID see still stops the step — that is evidence — but "nothing new
 * was raised" and "the expected alert is missing" are then not established:
 * both are reported unobserved, never as a clean step.
 */
export function alertVerdict(
  before: string[],
  after: string[] | null,
  ctx: { where: string; isRead: boolean; expectedContains?: string; params: Record<string, string>; effectConfirmed?: boolean; navigatedToStale?: string },
  afterComplete = true,
): AlertVerdict {
  const warnings: string[] = [];
  let unobserved: true | undefined;
  const want = ctx.expectedContains ? fillParams(ctx.expectedContains, ctx.params) : undefined;
  if (after === null) {
    // Detecting a NEW alert needs both captures; with either missing there is
    // no answer to give. Say so rather than the silent nothing that reads,
    // downstream, exactly like "no alert was raised".
    if (!ctx.isRead) {
      unobserved = true;
      warnings.push(`${ctx.where}: the page could not be captured after the action — whether it raised an alert is unknown, not clear`);
    }
    if (want !== undefined) {
      unobserved = true;
      warnings.push(`${ctx.where}: expected alert containing ${JSON.stringify(want)} could not be observed`);
    }
    return unobserved ? { warnings, unobserved } : { warnings };
  }
  const raised = after.filter((a) => !before.includes(a));
  if (raised.length && !ctx.isRead && want === undefined) {
    // The step NAVIGATED to a url still spelling a value this run has shown
    // volatile (retargetNavigation.stale): the page that url names belongs to
    // the recording's run and does not exist here, which is the cause of
    // whatever the app then said. The alert's own text decides nothing — the
    // navigation does — and the stop is the same stop; only what it names is
    // different, so recovery and the drift ticket act on the cause instead of
    // "an alert the recording never saw" (fwgr41-n3 06-find step 7, where
    // Grafana answered the recording's dead dashboard uid).
    const seen = ctx.navigatedToStale
      ? `${ctx.where} navigated to a page that does not exist: ${ctx.navigatedToStale} — the app answered with an alert the recording never saw: ${clip(raised.join(' | '), 200)}`
      : `${ctx.where} raised an alert the recording never saw: ${clip(raised.join(' | '), 200)}`;
    if (!ctx.effectConfirmed) return { warnings, stop: seen };
    warnings.push(`${seen} — reported, not stopped: the step's recorded page changes appeared`);
    return { warnings };
  }
  if (!afterComplete) {
    if (!ctx.isRead && !raised.length) {
      unobserved = true;
      warnings.push(`${ctx.where}: the page's alerts could not be observed in full after the action — whether it raised an alert is unknown, not clear`);
    }
    if (want !== undefined && !raised.some((a) => a.includes(want))) {
      unobserved = true;
      warnings.push(`${ctx.where}: expected alert containing ${JSON.stringify(want)} could not be observed in full`);
    }
    return unobserved ? { warnings, unobserved } : { warnings };
  }
  if (want !== undefined && !raised.some((a) => a.includes(want))) {
    warnings.push(`${ctx.where}: expected alert containing ${JSON.stringify(want)}`);
  }
  return { warnings };
}

/**
 * A soft-matched precondition needs the page's structural fingerprint to
 * agree before a run proceeds on it. Same-template-different-record pages
 * measured 0.94–1.0 in the swg sweeps; the different-template fixture pair
 * measures 0.57.
 */
export const SOFT_MATCH_MIN_SIMILARITY = 0.8;

export interface PreconditionVerdict {
  refuse?: string;
  /** The url is the same page shape with 1–2 disagreeing segments, and the run proceeds on it. */
  soft?: { diffs: UrlSegDiff[]; generalised: string };
  warnings: string[];
}

/**
 * What a caller knows about the page's structural fingerprint when it asks
 * where a segment starts:
 *  - a number: the cosine similarity it measured between the recording's
 *    fingerprint and the live page;
 *  - null: the recording kept NO fingerprint, so there is nothing to measure
 *    against and the url is the only evidence there is;
 *  - 'unmeasured': the recording kept one and this caller CANNOT measure it
 *    (a compiled artifact from before the vector travelled in the spec, with
 *    only a `fingerprinted` flag). Evidence exists that the caller cannot
 *    consult, which is not the same as no evidence.
 *
 * Both runners measure the same way (src/execution/fingerprint.ts): the
 * cosine of the recorded vector and the live page's fingerprint, where a page
 * that could not be read gives null and the url alone decides. (No call is
 * spelled out here: the emitter embeds a module whose export this text names.)
 */
export type FingerprintSimilarity = number | null | 'unmeasured';

/**
 * Where a segment starts. A strict url match passes. Same page shape with 1–2
 * disagreeing segments is likely an environment-minted id (an Odoo action id,
 * a Grafana uid): proceed optimistically instead of refusing — a hard fail
 * here is what turned a one-segment difference into a dead flow, and it also
 * makes the volatility evidence uncollectible. But "likely" is not evidence,
 * so when the caller measured the page's structural fingerprint against the
 * recording's (`similarity`), that second gate decides: a different RECORD of
 * the same template fingerprints close; a different TEMPLATE does not. Only a
 * close page proceeds.
 *
 * With no fingerprint recorded (null) the url alone decides and a soft match
 * proceeds, as the daemon does for such a skill. When a fingerprint WAS
 * recorded but this caller cannot measure it ('unmeasured'), a soft match is
 * refused: the daemon would have consulted the fingerprint here, and a runner
 * that cannot must not proceed on less evidence than the daemon requires —
 * only a strict match passes. That is an old compiled artifact's case; the
 * emitter says so per segment (the `unmeasured-precondition` diagnostic).
 *
 * Asked immediately before the segment's first page-dependent step
 * (`segmentGate`), never before a step that does not look at the page.
 */
/**
 * Where a goto landed, against where it was sent. Redirects are ordinary (a
 * root that routes to its login, a uid url the app completes with a slug), so
 * a different path or a key only one side has decides nothing. What does
 * decide is a key BOTH urls carry — query or hash state — whose values are
 * different WORDS: the app chose another view. fwod45's recovery skill sent
 * the browser to `…&view_type=form&id=22` for a record the reset had deleted,
 * and Odoo landed it on `view_type=list`; the steps after it read the list as
 * if it were the order. Two values that both look minted (ids, uids) are a
 * volatile id, not a different view. Null when the landing is acceptable.
 */
export function gotoLandingVerdict(target: string, landed: string, where: string): string | null {
  const t = urlShapeOf(target);
  const l = urlShapeOf(landed);
  if (!t || !l || t.origin !== l.origin) return null;
  const pairs: [string, string, string][] = [];
  for (const [key, val] of t.query) if (l.query.has(key)) pairs.push([key, val, l.query.get(key)!]);
  for (const [key, val] of t.hashState) if (l.hashState.has(key)) pairs.push([key, val, l.hashState.get(key)!]);
  // An EMPTY requested value asks for no particular view: the app filling in
  // its default is the landing the request left open. fwod48's recording
  // typed `web#action=&model=&view_type=list&cids=1&menu_id=`, Odoo landed on
  // action=123&menu_id=81 exactly as it had at record time, and both replays
  // stopped there as "another view".
  const differ = pairs.filter(([, want, got]) => want !== '' && want !== got && !/\{\{/.test(want) && !(mintedShape(want) && mintedShape(got)));
  if (!differ.length) return null;
  const said = differ.map(([key, want, got]) => `${key}=${clip(got, 40)} where it was sent to ${key}=${clip(want, 40)}`).join(', ');
  return `${where} navigated but landed on another view: ${said} — the page it asked for was not given`;
}

/** Tools that act on the browser or the tab itself and never on anything in the page. */
const PAGE_INDEPENDENT_TOOLS = new Set(['goto', 'back', 'set_viewport', 'set_offline', 'dialog_expect', 'screenshot', 'snapshot', 'tabs']);

/** The steps a segment's gate is placed by: a tool, its args, its target chains. */
export interface GateStep {
  tool: string;
  args?: Record<string, unknown>;
  locators?: Record<string, readonly unknown[] | undefined>;
}

/**
 * A selector that names the document itself, not anything the page renders.
 *
 * The root has more than one spelling. A recorder that enriches a raw `body`
 * writes `html > body` beside it (fwrd68 s_bfc33c), and `html body` is the
 * same element again: a path built from NOTHING but `html`/`body` and
 * descendant/child combinators can only land on the document. Anything else in
 * the path is page content and is not the root — `body > div` must stay out,
 * which is why this reads the whole selector and not a prefix of it.
 */
function documentRoot(selector: unknown): boolean {
  return typeof selector === 'string' && /^\s*(?:html|body)(?:(?:\s*>\s*|\s+)(?:html|body))*\s*$/i.test(selector);
}

/**
 * Whether a step acts on or reads the page's CONTENT — the steps a segment's
 * gate (where it starts, and whose record it is) exists to protect. Pure, so
 * both runners and the compiler ask the same question.
 *
 * Not page-dependent:
 *  - goto, back: they take the browser somewhere; what was there before is
 *    beside the point. A navigation is a page seam (compile.ts).
 *  - set_viewport, set_offline, tabs: the browser or the tab, not the page.
 *  - dialog_expect: arms a handler; it touches nothing until a dialog opens.
 *  - screenshot, snapshot: they look and can never fail on what they see.
 *  - a `read` of `what: 'url'`: the address bar, which is no page's content.
 *  - a `press` with no target: keyboard input to whatever has focus.
 *  - a `wait_for` whose target is the document itself (`body`/`html`, as the
 *    raw selector or as every recorded candidate that can say) waiting only
 *    for it to be there: a page load, not a page. A text or count condition on
 *    `body` IS about the content, and stays page-dependent.
 * Page-dependent: everything else — every step that resolves a target in the
 * page (click, dblclick, modifier/right click, fill, type, select, check,
 * hover, scroll_into_view, drag, upload, download, press with a target, read
 * and read_all with a target, a wait_for on anything else), a loop (its guard
 * and body resolve in the page), a labelled read, and eval. An unknown tool
 * counts as page-dependent: a gate asked once too often refuses a run; one
 * skipped does its work on the wrong page.
 */
export function dependsOnPage(step: GateStep): boolean {
  const args = step.args ?? {};
  if (PAGE_INDEPENDENT_TOOLS.has(step.tool)) return false;
  if (step.tool === 'loop') return true;
  if (step.tool === 'press') return Boolean(args.target);
  if (step.tool === 'read' || step.tool === 'read_all') return args.what !== 'url';
  if (step.tool === 'wait_for') {
    const state = args.state === undefined ? 'visible' : String(args.state);
    if (state !== 'visible' && state !== 'attached') return true;
    const chain = step.locators?.target ?? [];
    const candidates = chain.filter((c): c is { kind: string; selector?: unknown } => Boolean(c) && typeof c === 'object');
    // WHY THE EXEMPTION EXISTS: a `wait_for body` looks at no page, so gating
    // it asks the page the procedure is LEAVING — fwrd53 07-report asked a
    // list for a detail page's markers (replay.ts's note at its segmentGate
    // call). Here that same mistake put the gate ahead of the `goto` that
    // CHOOSES the page, and the goto never ran.
    //
    // A CHAIN IS A PREFERENCE ORDER, NOT A CONJUNCTION — the same reading
    // `fillableChain` takes of an unfilled rung. Its rungs are alternative
    // ways to reach ONE element, so a rung that cannot answer "is this the
    // document root?" is DROPPED, not counted as a no; only the rungs that can
    // speak decide. A `point` is the rung that cannot: it is a coordinate, and
    // resolve.ts reads it as "what is HERE", never as identity. Every other
    // kind does name an element, and a `role`/`text`/`id`/`scoped` rung names
    // one the page renders — an answer, and the answer is no, so a chain
    // offering a page element alongside the root stays page-dependent.
    //
    // fwrd68 s_bfc33c: step 1's chain is [css `body`, css `html > body`,
    // point] — one element under two spellings plus a coordinate — and
    // `every` over it refused the whole flow (0/6 objectives) for a step that
    // waits for the document to exist.
    const speaking = candidates.filter((c) => c.kind !== 'point');
    const onRoot = candidates.length ? speaking.length > 0 && speaking.every((c) => c.kind === 'css' && documentRoot(c.selector)) : documentRoot(args.target);
    return !onRoot;
  }
  return true;
}

/**
 * Where a segment's gate goes: immediately before its first page-dependent
 * step (1-based `at`; 0 when it has none, and then it is never gated), and
 * whether a goto or back ran inside the segment ahead of that step.
 *
 * The gate used to sit before step 1, with a special case for a segment that
 * opened by navigating — which then asked the page it LANDED on for markers
 * observed before the goto (fwrd53 07-report: a detail page's markers asked of
 * the list). A navigation is now a seam, so a newly compiled segment never has
 * one ahead of its gate; `afterNavigation` is an older skill's shape, and the
 * caller judges it with `landedOnRecordedPage`.
 */
export function segmentGate(steps: readonly GateStep[]): { at: number; afterNavigation: boolean } {
  let navigated = false;
  for (const [i, step] of steps.entries()) {
    if (dependsOnPage(step)) return { at: i + 1, afterNavigation: navigated };
    if (step.tool === 'goto' || step.tool === 'back') navigated = true;
  }
  return { at: 0, afterNavigation: false };
}

/**
 * A segment compiled before navigations were seams (contract < 4) can hold a
 * goto or back ahead of its first page-dependent step, while its url pattern,
 * fingerprint and identity markers were observed on the page BEFORE that
 * navigation. Judging the landing by them is only meaningful where it is the
 * same page template: then the url precondition is not asked (the goto chose
 * the page, and the recording's start url is a race with any redirect) but
 * the identity markers are — the recorded goto carries the RECORDING run's
 * record id (fwod10). Anywhere else the markers describe a page the procedure
 * has left, and neither is asked (fwrd53: a detail page's markers asked of the
 * list, where the archived record is hidden by design). Same template = a
 * strict or a soft url match of the recorded pattern with its slots left
 * UNFILLED: a slot is the record, and which record it is is the markers'
 * question — filled, another record's url would read as another template and
 * skip the very check that tells them apart.
 */
export function landedOnRecordedPage(pattern: string, url: string): boolean {
  return urlMatches(pattern, url) || softUrlMatch(pattern, url) !== null;
}

/**
 * The soft-match budget this verdict spends, above url.ts's default — BECAUSE
 * AND ONLY BECAUSE it goes on to require `structurallySame` before accepting.
 * url.ts's count is a proxy for "is this a different page?"; this caller holds
 * the real measurement (SOFT_MATCH_MIN_SIMILARITY against the recorded
 * fingerprint), so the proxy yields to it. `urlEffectVerdict` warns and
 * proceeds with no similarity check at all, and keeps the default.
 *
 * Three, derived from fwgr49 and not from taste: the positions that varied
 * between two runs of one grafana dashboard were the record identifier
 * (`path[1]`, the uid) plus a time range, which occupies TWO positions
 * (`from`, `to`) for one varying thing. One identifier plus one range is the
 * most any url in the evidence varies by; a fourth disagreeing position is not
 * something a recording has shown, so it still refuses. The per-diff guards in
 * softUrlMatch (no WORD position, no parameter-filled position) are what make
 * each of the three safe, and they do not move with this number.
 */
const PRECONDITION_SOFT_DIFFS = 3;

/** A url position a procedure's step mints (compile.ts `mints`): the label urlParts gives it, and the 1-based step. */
export interface MintedPosition {
  at: string;
  step: number;
}

/**
 * The record a procedure CREATES is one its start page does not have. A
 * state-shaped url accumulates (urlDiff: a live key the pattern does not name
 * is allowed, Odoo grows `cids`/`menu_id` between segments), and that rule
 * let a procedure recorded on an UNSAVED form — no `id` in the url, its save
 * step mints `q.id` — start on the SAVED form of the same model: fwod66's
 * 04-verify was recorded as the rescue of a save that had not taken, replayed
 * on a quotation the fixed 03-create had already saved, and its first click
 * ("Cancel", the modal's at record time) cancelled the order. So a key the
 * procedure itself mints later, absent from its start pattern but present on
 * the live url, is the procedure's own evidence that the page is PAST its
 * start: the record it would create exists. Only that key: a key the pattern
 * names (`id=:id`, a procedure that starts on one record and creates another)
 * is judged as before.
 */
function mintedAhead(pattern: string, url: string, params: Record<string, string>, mints: MintedPosition[]): { key: string; value: string; step: number } | null {
  if (!mints.length) return null;
  const p = urlShapeOf(fillParams(pattern, params));
  const l = urlShapeOf(url);
  if (!p || !l) return null;
  for (const m of mints) {
    if (!m.at.startsWith('q.')) continue;
    const key = m.at.slice(2);
    if (p.hashState.has(key) || p.query.has(key)) continue;
    const value = l.hashState.get(key) ?? l.query.get(key);
    if (value) return { key, value, step: m.step };
  }
  return null;
}

export function preconditionVerdict(
  pattern: string,
  url: string,
  params: Record<string, string>,
  similarity: FingerprintSimilarity,
  mints: MintedPosition[] = [],
): PreconditionVerdict {
  // What this verdict actually compared, for every message below (fwod51).
  const shown = shownPattern(pattern, params);
  const ahead = mintedAhead(pattern, url, params, mints);
  if (ahead) {
    return {
      warnings: [],
      refuse:
        `not on the page this procedure starts from (expects ${shown}, browser is at ${describeUrl(url, shown)}; ` +
        `the url already carries ${ahead.key}=${ahead.value}, the record this procedure creates at its step ${ahead.step} — the page is past where the procedure starts)`,
    };
  }
  if (urlMatches(pattern, url, params)) {
    // A strict match that let a one-sided query key pass took that key on
    // trust. When the caller measured the page, that trust is checked like a
    // soft match's: `?editview=json-model` against the plain dashboard is the
    // same url by the query rule and a different view by the page (fwgr36
    // 04-open measured 0.252), and the identity gate then refused it as a
    // "different record". A same-page drift of `refresh=1m` measures close.
    const trusted = oneSidedQueryKeys(fillParams(pattern, params), url);
    if (trusted.length && typeof similarity === 'number' && similarity < SOFT_MATCH_MIN_SIMILARITY) {
      return {
        warnings: [],
        refuse: `not on the page this procedure starts from (expects ${shown}, browser is at ${describeUrl(url, shown)}; the urls differ only in query key(s) ${trusted.join(', ')}, and the page structure is not the recorded one — similarity ${similarity}, so this is another view of the page)`,
      };
    }
    return { warnings: [] };
  }
  const soft = softUrlMatch(pattern, url, params, PRECONDITION_SOFT_DIFFS);
  const structurallySame = similarity === null || (typeof similarity === 'number' && similarity >= SOFT_MATCH_MIN_SIMILARITY);
  if (!soft || !structurallySame) {
    const because =
      !soft || structurallySame
        ? ''
        : similarity === 'unmeasured'
          ? '; the url shape is close, but the recording fingerprinted this page and this runner cannot measure the live page against it — only a strict url match can pass here'
          : `; the url shape is close but the page structure is not — similarity ${similarity}`;
    return {
      warnings: [],
      refuse: `not on the page this procedure starts from (expects ${shown}, browser is at ${describeUrl(url, shown)}${because})`,
    };
  }
  return {
    soft: { diffs: soft.diffs, generalised: soft.generalised },
    warnings: [`start url differs from the recorded pattern in ${soft.diffs.length} segment(s) (${describeDiffs(soft.diffs)}) — proceeding optimistically`],
  };
}

/**
 * Whether every marker is BOUND: each slot it names has a nonempty value in
 * `params`, and the filled text is nonempty with no marker left in it. An
 * unbound marker proves nothing, so a goal check over one must fail rather
 * than pass — and a slot bound to '' (a derived value the run never minted)
 * renders `Order {{d1}}` as `Order `, which a page shows for every order. Both
 * runners ask this at run time; a compile-time check cannot see the value.
 */
export function markersBound(markers: string[], params: Record<string, string>): boolean {
  return markers.every((marker) => {
    for (const m of marker.matchAll(/\{\{([vd]\d+)\}\}/g)) {
      if (!params[m[1]]) return false;
    }
    const filled = fillParams(marker, params);
    return Boolean(filled.trim()) && !/\{\{/.test(filled);
  });
}

/**
 * The slots a value still ASKS FOR that this run has no answer for: every
 * `{{vN}}`/`{{dN}}` marker anywhere inside it (a string, or any string reached
 * through an array or object — a step's args and its locator chains alike)
 * whose name is absent from `params`.
 *
 * EVIDENCE, NOT SHAPE. The question asked of each marker is `name in params`,
 * which is exactly what `fillParams` substitutes on (url.ts): a marker still
 * standing in already-filled text is, by construction, one this run had no
 * value for. Nothing here reads what the text looks like. A slot bound to ''
 * is BOUND — an unpublished reference, whose own rule is stated at url.ts's
 * `unfilled` — and is not reported here.
 *
 * Scoped to the two markers `fillParams` itself recognises and to nothing
 * else: a `{{stepId.output}}` reference reaching a value is a different
 * mechanism, answered for an ACTION's args by `unresolvedArgMarkers` and at
 * compile time by the artifact's `need` / `unsourced-ref`; and a page that
 * legitimately displays braces is not a marker at all. This narrow reading is
 * what the locator-chain arm and every marker CHECK want, and only those.
 *
 * WHY A CALLER WOULD ASK. "A slot the run could not fill asks for no
 * particular value" is the right reading for a CHECK, and every gate here
 * already takes it: markersBound, urlRecordParts, gotoLandingVerdict's
 * `want !== ''`, isWildcardSeg. It is the wrong reading for the VALUE an
 * action carries: a `type`/`fill` whose text is still `{{v2}}` puts those
 * five characters into a live field, and a goto navigates to the literal. See
 * `fillableChain` for why a locator chain is judged differently.
 */
export function unfilledSlots(value: unknown, params: Record<string, string>): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(/\{\{([vd]\d+)\}\}/g)) {
        if (!(m[1] in params) && !out.includes(m[1])) out.push(m[1]);
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (v && typeof v === 'object') for (const item of Object.values(v as Record<string, unknown>)) walk(item);
  };
  walk(value);
  return out;
}

/**
 * Any `{{…}}` marker that is not the wildcard — the same reading as
 * `expect.ts`'s UNFILLED_MARKER, restated here because this module may import
 * nothing but a sibling.
 *
 * The NAME must differ from expect.ts's. Both modules are embedded VERBATIM,
 * side by side, into the compiled artifact, so two file-scope `const`s sharing
 * a name are one `SyntaxError: Identifier 'UNFILLED_MARKER' has already been
 * declared` and every emitted flow fails to import — which is exactly what the
 * parity suite caught. A shared reading is fine; a shared identifier is not.
 * (`g` here, unlike expect.ts's, because this one is used with `matchAll`.)
 */
const UNRESOLVED_ARG_MARKER = /\{\{(?!\*\}\})[^{}]*\}\}/g;

/**
 * Every marker still standing in a value once this run's params are in — the
 * BROAD reading, and the one `expect.ts:unfilledSlot` has taken for some time
 * (its `{{02-open.product_name}}` case, fwod49-n2). Returned as the marker text
 * (`{{03-create.product_name}}`), not a slot name, because the thing left
 * standing need not be a slot.
 *
 * WHY THE ARGS ARM NEEDS THIS AND `unfilledSlots` CANNOT GIVE IT.
 * `fillParams` is a SINGLE PASS: a param bound to the string
 * `"{{03-create.product_name}}"` substitutes that text into the args and
 * nothing re-scans the result. `unfilledSlots` asks `name in params`, and the
 * slot IS in params — bound, just bound to a placeholder — so it is
 * structurally unable to see this. The daemon has no `{{stepId.output}}`
 * diagnosis of its own either: `emit.ts`'s `need`/`unsourced-ref` is compile
 * time only. fwod56's witness: `10-verify` pinned a chain head whose `v4` held
 * `{{05-open.quotation_reference}}`, and segment 3 of that chain types `{{v4}}`
 * into odoo's search box — 31 characters of marker text, as real keystrokes.
 *
 * ACTIONS MUST NOT BE LAXER THAN ASSERTIONS. An expectation over a line this
 * run could not fill is dropped; an action carrying one would be dispatched.
 * The wildcard is excluded because it is deliberate (lineShows matches it
 * against anything), and a value bound to '' leaves no marker at all, so the
 * "bound to '' is BOUND" rule (url.ts's `unfilled`) survives untouched.
 */
export function unresolvedArgMarkers(value: unknown, params: Record<string, string>): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      // Filled here rather than trusted to the caller: replay hands this
      // already-substituted args and the predicate must answer the same for
      // both, and `fillParams` over filled text is a no-op by construction.
      for (const m of fillParams(v, params).matchAll(UNRESOLVED_ARG_MARKER)) {
        if (!out.includes(m[0])) out.push(m[0]);
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (v && typeof v === 'object') for (const item of Object.values(v as Record<string, unknown>)) walk(item);
  };
  walk(value);
  return out;
}

/**
 * A recorded locator chain less the rungs this run could not fill.
 *
 * A CHAIN IS A PREFERENCE ORDER, NOT A CONJUNCTION. Its rungs are the ways
 * the recording could name one element, best first, and the resolver takes the
 * first that matches (execution/resolve.ts). A rung carrying a slot this run
 * has no value for — odoo fwod34's `#name_{{d2}}`, where `d2` is a url-pattern
 * wildcard and not a value at all — cannot match anything once `fillParams`
 * leaves the marker standing, so it is not a defect in the step: it is one
 * exhausted preference, dropped, and the `role`/`placeholder` rungs behind it
 * take the step exactly as they were recorded to.
 *
 * Only a chain whose EVERY rung is dead leaves the step with no way to name
 * its element, and that is the case a runner must act on.
 */
export function fillableChain<T>(chain: readonly T[] | undefined, params: Record<string, string>): T[] {
  return (chain ?? []).filter((rung) => !unfilledSlots(rung, params).length);
}

/** A step as this verdict reads it: the values it carries, and the chains it resolves through. */
export interface UnfilledStep {
  args?: unknown;
  locators?: Record<string, readonly unknown[] | undefined>;
}

/**
 * Why a step that ACTS must not act, or null when nothing stops it. The caller
 * decides what "acts" means for it (a type, fill, click, select, goto) — a
 * read, a wait and a check keep the "asks for nothing" reading and never ask
 * this.
 *
 * The split inside the step is the point, and it is not the same question
 * twice:
 *  - the ARGS carry the value the step acts WITH. ANY marker left standing
 *    there once the params are in is fatal — an unbound slot (unfilledSlots)
 *    or a slot bound to an unresolved reference (unresolvedArgMarkers, the
 *    reading expect.ts takes of a recorded line). There is no second choice,
 *    and the step would type or navigate to the literal marker text. An action
 *    must not be laxer than an assertion about the same run.
 *  - a LOCATOR CHAIN is how the step names WHAT to act on, in preference
 *    order. An unfilled rung is dropped (fillableChain); only an entirely dead
 *    chain is fatal, and then because the step has no way left to find its
 *    target, not because a marker survived.
 *
 * Since bindSkill stopped guessing a split between two adjacent slots and left
 * both unbound instead, the args case is reachable rather than theoretical.
 * What each runner DOES about it differs — daemon replay falls back to the
 * model, the artifact has no model and refuses at compile time — but the
 * question is this one, asked here, once.
 */
export function unfilledStepVerdict(step: UnfilledStep, params: Record<string, string>, where: string): string | null {
  const said = (slots: string[]): string => slots.map((s) => `{{${s}}}`).join(', ');
  const inArgs = unfilledSlots(step.args, params);
  if (inArgs.length) {
    return `${where}: ${said(inArgs)} ${inArgs.length > 1 ? 'were' : 'was'} left unbound — this run has no value for ${inArgs.length > 1 ? 'those slots' : 'that slot'}, and the step would otherwise act on the literal marker text`;
  }
  // The second reading of the same question, and only over the args: a slot
  // that IS bound, to a reference nothing resolved. See unresolvedArgMarkers.
  const leftInArgs = unresolvedArgMarkers(step.args, params);
  if (leftInArgs.length) {
    const many = leftInArgs.length > 1;
    return `${where}: ${leftInArgs.join(', ')} ${many ? 'are' : 'is'} still unresolved after this run's params were filled in — ${
      many ? 'those markers name values' : 'that marker names a value'
    } nothing published, and the step would otherwise act on the literal marker text`;
  }
  for (const [key, chain] of Object.entries(step.locators ?? {})) {
    if (!chain?.length || fillableChain(chain, params).length) continue;
    return `${where}: every recorded locator for ${key} names ${said(unfilledSlots(chain, params))}, which this run could not fill — the step has no way left to name the element it acts on`;
  }
  return null;
}

/**
 * The parts of the live url that name THIS run's record, or null when the url
 * cannot say. A record part is one the pattern fills from a param or a minted
 * value (`/d/:var/{{v2}}-bench-dashboard`, `edit?id={{d1}}`, `#id={{d1}}`):
 * the compiler put a marker there because the recording's record lived there.
 * Every such part must be bound and equal, filled, to the live url's part, and
 * the url must be the pattern's page shape at all (urlDiff; a literal that
 * differs elsewhere is a volatile id, which the precondition gate judged
 * already). A pattern with no marker part — `:id`/`:var` wildcards match every
 * record — names no record, and neither does a marker left unbound.
 */
export function urlRecordParts(pattern: string | undefined, url: string, params: Record<string, string>): string[] | null {
  if (!pattern) return null;
  const filledPattern = fillParams(pattern, params);
  const raw = urlShapeOf(pattern);
  const want = urlShapeOf(filledPattern);
  const live = urlShapeOf(url);
  if (!raw || !want || !live) return null;
  // A param value carrying '/' shifts segment positions between the raw and
  // filled pattern; positions then no longer say which part is the record.
  if (raw.path.length !== want.path.length || raw.hashPath.length !== want.hashPath.length) return null;
  if (!urlDiff(filledPattern, url, boundQueryKeys(pattern, params))) return null;
  const marked = /\{\{[vd]\d+\}\}/;
  const parts: string[] = [];
  const judge = (recorded: string | undefined, expected: string | undefined, actual: string | undefined, label: string): boolean => {
    if (recorded === undefined || !marked.test(recorded)) return true;
    if (expected === undefined || !expected.trim() || /\{\{/.test(expected) || [...recorded.matchAll(/\{\{([vd]\d+)\}\}/g)].some((m) => !params[m[1]])) return false;
    if (actual !== expected) return false;
    // The message travels (describeUrl's note): a credential key's value never does.
    parts.push(`${label}=${CREDENTIAL_KEY.test(label) ? '***' : clip(actual, 40)}`);
    return true;
  };
  for (const [i, seg] of raw.path.entries()) if (!judge(seg, want.path[i], live.path[i], `path[${i}]`)) return null;
  for (const [key, val] of raw.query) if (!judge(val, want.query.get(key), live.query.get(key), key)) return null;
  for (const [i, seg] of raw.hashPath.entries()) if (!judge(seg, want.hashPath[i], live.hashPath[i], `#[${i}]`)) return null;
  for (const [key, val] of raw.hashState) if (!judge(val, want.hashState.get(key), live.hashState.get(key), `#${key}`)) return null;
  return parts.length ? parts : null;
}

/**
 * How long a runner waits for a BOUND identity marker to appear before it
 * judges which record the page is, and the cadence of that wait. A page that
 * has not finished arriving cannot say which record it is: fwgr47-n2
 * 07-verify stopped on the RIGHT dashboard (its own verifier reported uid
 * bfyfuaptu20aoa PASS) because step 1 was a `goto` to a bare dashboard url
 * that grafana normalises a moment later, and the gate looked during the
 * boot. Stated here because BOTH runners must wait the same: the compiled
 * artifact polls it (spec/emit.ts identityChecks) and daemon replay polls it
 * (skills/replay.ts checkIdentity) — a rule only one runner applies is the
 * class of defect the parity harness exists to catch.
 */
export const IDENTITY_WAIT_MS = 5_000;

/** Cadence of that wait, for a runner with no poll helper of its own. */
export const IDENTITY_POLL_MS = 100;

export interface IdentityMarkerVerdict {
  /** The segment may run. */
  pass: boolean;
  /** Passed on the url's word while the marker was not seen: the marker is stale. */
  warning?: string;
}

/**
 * One identity marker, judged. Present passes. Not seen ('absent', or a look
 * that could not establish absence — 'unknown') refuses — unless the live url
 * already names this run's record (urlRecordParts): then the url has answered
 * "which record" and the marker is only a stale description of the page, so
 * it warns and the segment runs. Markers still decide wherever the url cannot
 * tell records apart.
 *
 * fwgr39-n3 05-set refused s_6108b1 on the RIGHT dashboard — its url carried
 * this run's own slug, `{{v2}}-bench-dashboard` — because its second marker was
 * "Last 6 hours", a time-range setting the settings view does not render: a
 * state, not a name, and not the question the url had already answered.
 *
 * `url` must be the url as it reads AFTER the runner's identity wait
 * (IDENTITY_WAIT_MS), not the one the first look saw. The escape hatch was
 * unavailable to fwgr47-n2 at the first look for a reason that expires: the
 * pattern's bound query keys (from, to) were missing from a url the app had
 * not rewritten yet, so urlDiff — and with it urlRecordParts — said null.
 * Asking again once the wait is spent costs nothing and is the same question
 * the app has by then answered; one step earlier the SAME app warn-and-
 * proceeded twice on exactly this fallback.
 */
export function identityMarkerVerdict(
  pattern: string | undefined,
  url: string,
  params: Record<string, string>,
  want: string,
  presence: 'present' | 'absent' | 'unknown',
): IdentityMarkerVerdict {
  if (presence === 'present') return { pass: true };
  const parts = urlRecordParts(pattern, url, params);
  if (!parts) return { pass: false };
  const seen = presence === 'unknown' ? 'could not be confirmed on the page' : 'is not on the page';
  return {
    pass: true,
    warning: `identity marker ${JSON.stringify(clip(want, 60))} ${seen}, but the url names this run's record (${parts.join(', ')}) — the marker is stale; proceeding`,
  };
}
