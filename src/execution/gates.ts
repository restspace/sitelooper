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
import { CREDENTIAL_KEY, fillParams, mintedShape, oneSidedQueryKeys, serializeShape, softUrlMatch, urlMatches, urlShapeOf, type UrlSegDiff } from './url.js';

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
  if (!soft) return { warnings: [], stop: `after ${where} expected url ${fillParams(pattern, params)} but browser is at ${describeUrl(liveUrl, pattern)}` };
  return {
    warnings: [`${where}: url segment(s) differ from recorded (${describeDiffs(soft.diffs)}) — treated as volatile`],
    generalised: soft.generalised,
    diffs: soft.diffs,
  };
}

function describeDiffs(diffs: UrlSegDiff[]): string {
  return diffs.map((d) => `${d.expected}→${d.actual}`).join(', ');
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
  ctx: { where: string; isRead: boolean; expectedContains?: string; params: Record<string, string>; effectConfirmed?: boolean },
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
    const seen = `${ctx.where} raised an alert the recording never saw: ${clip(raised.join(' | '), 200)}`;
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
 * A segment whose first step navigates carries its own precondition and must
 * not be asked this at all — that is the caller's `navigatesItself` rule.
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
  const differ = pairs.filter(([, want, got]) => want !== got && !/\{\{/.test(want) && !(mintedShape(want) && mintedShape(got)));
  if (!differ.length) return null;
  const said = differ.map(([key, want, got]) => `${key}=${clip(got, 40)} where it was sent to ${key}=${clip(want, 40)}`).join(', ');
  return `${where} navigated but landed on another view: ${said} — the page it asked for was not given`;
}

/** Tools that look at the page and never take the browser anywhere. */
const LOOK_ONLY_TOOLS = new Set(['wait_for', 'read', 'read_all', 'screenshot', 'snapshot', 'scroll_into_view', 'hover']);

/**
 * The 1-based index of the goto a segment opens with, past any leading steps
 * that only look — 0 when it does not open by navigating. Such a segment
 * carries its own precondition (its goto puts the browser on the recorded
 * page), so the start url is not asked, and its identity gate is asked right
 * after that goto. "Step 1 is a goto" was the old rule: fwrd51 recorded
 * `wait_for body` → `read url` → `goto` from about:blank, and the start url
 * refused it on the very page the goto would have left.
 */
export function selfNavigationStep(steps: readonly { tool: string }[]): number {
  for (const [i, step] of steps.entries()) {
    if (step.tool === 'goto') return i + 1;
    if (!LOOK_ONLY_TOOLS.has(step.tool)) return 0;
  }
  return 0;
}

export function preconditionVerdict(
  pattern: string,
  url: string,
  params: Record<string, string>,
  similarity: FingerprintSimilarity,
): PreconditionVerdict {
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
        refuse: `not on the page this procedure starts from (expects ${fillParams(pattern, params)}, browser is at ${describeUrl(url, pattern)}; the urls differ only in query key(s) ${trusted.join(', ')}, and the page structure is not the recorded one — similarity ${similarity}, so this is another view of the page)`,
      };
    }
    return { warnings: [] };
  }
  const soft = softUrlMatch(pattern, url, params);
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
      refuse: `not on the page this procedure starts from (expects ${fillParams(pattern, params)}, browser is at ${describeUrl(url, pattern)}${because})`,
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
