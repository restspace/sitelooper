import { dispatchesFirstMatch, isMutatingAction, isReadAction, spansEveryMatch } from '../execution/lifecycle.js';
import { DEFAULT_BROWSER_PROFILE, isNavigatingAction, type BrowserProfile } from '../execution/browser.js';
import { setsSomething } from '../execution/echo.js';
import { standingFillRole } from '../execution/refill.js';
import { hideEffectLines, toggleEffectLines } from '../execution/toggle.js';
import { derivesFromParams, reportNeedsPage, templateMarkers, templateSource } from '../execution/report.js';
import { observedNothing } from '../execution/observe.js';
import { segmentGate } from '../execution/gates.js';
/**
 * The IR as `@playwright/test` source (Tier 2: no sitelooper runtime).
 *
 * Two files, because they have two owners. `<name>.flow.ts` is the TOOL's:
 * every line of it is generated from the FLOW constant it carries, and
 * `repair` regenerates it wholesale, so a hand edit there is lost work.
 * `<name>.spec.ts` is the USER's: it is written once, never rewritten, and
 * it is where their own assertions live. Keeping the regenerated half and
 * the hand-written half in separate files is what lets convergence stay
 * automatic without ever clobbering a reviewer's work.
 *
 * What the emitted body must be is a faithful reading of `replay.ts`: the
 * same locator chain resolved through the same shared policy (see
 * `./locators.js` for the observations and `../execution/resolve.js` for the
 * rules), the same effect gates as assertions, the same derived-value binding
 * after the step that mints it. Where Tier 2 cannot follow — a tab switch, an
 * attribute read, a chain with nothing recorded — it says so in a diagnostic
 * instead of pretending, because a spec that asserts something the recording
 * never observed is worse than one that admits the gap.
 */
import { EXECUTION_MODULES, executionClosure } from './runtime-source.js';
import { candidateExpr, type LocatorCandidate } from '../daemon/recorder.js';
import { DIALOG_LINE, SLOT_LINE, TRANSIENT_LINE } from '../execution/expect.js';
import { identityFields } from '../execution/resolve.js';
import { originOf } from '../execution/url.js';
import { describeFramePath, stepEffect } from '../execution/context.js';
import { OPENER_LINE, recordMarkers, waitsForAbsence } from '../skills/replay.js';
import { seedRecipes, snapshotRecipes } from '../skills/components.js';
import type { SkillStep } from '../skills/store.js';
import { consumedReportedOutputs, recordedStandIn } from '../skills/flow.js';
import { candidateSources, matcherSource, observationSources, stringSource } from './locators.js';
import { unmeasuredPreconditionDiagnostic, type SpecFlow, type SpecSegment, type SpecStep } from './ir.js';
import { diagnosticNote, formatDiagnostic, type Diagnostic } from './diagnostics.js';

export interface EmitOptions {
  /** Tier 2, no runtime. The only tier this module emits. */
  tier: 'plain';
  /**
   * What compile found wrong with this flow (spec/diagnostics.ts). A step
   * flagged by one is emitted with the diagnostic as a comment block above it
   * AND with its text carried on whatever the step throws — see `stepNote`.
   */
  diagnostics?: Diagnostic[];
}

/**
 * The diagnostics that belong ABOVE a step's body, per flow step id.
 *
 * Only the record-level ones: a demoted pin and a record-time no-op are both
 * "this recording is wrong", which is exactly what a reader of the generated
 * file cannot otherwise tell from a locator error. A rethread warning is about
 * a binding, not about the step's existence, and belongs in the compile
 * report, not in every reviewer's diff.
 *
 * `unsupported-capability` joins them because it is the same kind of fact: the
 * step is in the file and cannot run, and the reader of the generated code is
 * exactly the person who has to supply the missing half by hand.
 */
const FLAGGED: readonly Diagnostic['code'][] = ['demoted-pin', 'noop-step', 'unsupported-capability'];

function flaggedByStep(diagnostics: Diagnostic[] | undefined): Map<string, Diagnostic[]> {
  const out = new Map<string, Diagnostic[]>();
  for (const d of diagnostics ?? []) {
    if (!d.step || !FLAGGED.includes(d.code)) continue;
    out.set(d.step, [...(out.get(d.step) ?? []), d]);
  }
  return out;
}

/**
 * The one-line note a FLAGGED step's failure carries, or none.
 *
 * WHY. fwod34's 08-open is pinned to a demoted skill whose first action clicks
 * a Cancel button that no longer exists, and the emitted spec said only "none
 * of 3 recorded locators resolved" — which reads as app drift and sends the
 * reader hunting for a changed selector. The step's own error is the one place
 * the reader is guaranteed to look, so the reason and the fix go there too.
 * Only a demoted pin: a no-op step still replays, so failing it with that note
 * would be a guess about a failure it did not cause.
 */
function stepNote(flagged: Diagnostic[] | undefined): string | undefined {
  const d = flagged?.find((x) => x.code === 'demoted-pin');
  return d ? diagnosticNote(d) : undefined;
}

/** Markers LIFT reads the FLOW constant back out of. Changing either breaks the round trip. */
const BEGIN_MARKER = '// @sitelooper-flow-begin';
const END_MARKER = '// @sitelooper-flow-end';

/**
 * What the inlined `urlPartsWhen` waits for the url a step navigated TO.
 *
 * Longer than the resolve window (RESOLVE_WAIT_MS) because that is what replay effectively allows a
 * url: runOneStep lets the DOM go quiet first (settleDom, capped at 2s) and
 * only then does `expectedUrl` poll for another resolveWaitMs (3s) before it
 * judges the url wrong. A spec that gave up after 3s bound an EMPTY part and
 * built a pattern that could never match — odoo populates `action=` late, and
 * fwod34's 01-signin asserted `#action=&cids=1&menu_id=81` against a browser
 * that was, a beat later, exactly where the recording left it.
 */
const URL_WAIT_MS = 5_000;

/** Playwright's own default; only a different timeout is worth carrying over. */
const DEFAULT_WAIT_MS = 10_000;

/** How long a recorded template may run inside a generated comment. */
const COMMENT_CLIP = 120;

/** How far a chain's `.or(` continuation lines sit in from the statement that opens them. */
const CONT_INDENT = '  ';

/** Default iterations a folded loop may run when the recording set no cap. */
const DEFAULT_LOOP_MAX = 20;

const clip = (s: string, max = COMMENT_CLIP) => (s.length <= max ? s : s.slice(0, max) + '…');

/** One line of comment text: no newlines, and nothing that would close a doc comment. */
const commentSafe = (s: string) => clip(String(s).replace(/\s+/g, ' ').replace(/\*\//g, '* /').trim(), 200);

/** How a recorded slot renders inside generated source: as the step's own param. */
// A derived slot the run has not minted is left UNSET, as replay leaves it
// out of its params: its marker then stays literal, as fillParams leaves it.
const slotAsParam = (s: string) => (s.startsWith('d') ? '${p.' + s + " ?? '{{" + s + "}}'}" : '${p.' + s + '}');

/** A JS single-quoted literal (mirrors recorder.q, which this module cannot import without pulling in playwright types). */
function q(value: string): string {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '').replace(/\n/g, '\\n')}'`;
}

/** An object key as source: bare when it is an identifier, quoted otherwise. */
function key(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : q(name);
}

/** Literal text inside a template literal: a backtick or a `${` would end it or open a hole. */
function templateSafe(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/**
 * Per-tier budget for the inlined `click` helper, mirroring the 10s
 * `timeout` tools.ts hands robustClick, but cut so that ALL THREE tiers plus
 * the scroll ahead of tier 2 fit well inside a default 60s Playwright test:
 * grafana's viz-picker burned the whole 60s on tier 1 alone before this.
 */
const CLICK_TIER_MS = 5_000;

/**
 * The whole budget of one emitted action — dispatch, its settle, its expected
 * effect — as the daemon's ACTION_DEADLINE_MS (30s) is for replay's. Shorter,
 * because a step's pick and gates share a Playwright test's timeout with it;
 * the click tiers (3×CLICK_TIER_MS plus the re-render window) fit inside it.
 */
const ACTION_DEADLINE_MS = 25_000;

/**
 * What the inlined `type` hands `typeWithRecipe`, as tools.ts's `case 'type'`
 * does: the tool layer's default 10s timeout, and its 20ms per-key delay when
 * the recording set none — one cadence in both runners, not Playwright's 0.
 */
const TYPE_TIMEOUT_MS = 10_000;
const TYPE_DELAY_MS = 20;

/**
 * The inlined helpers, keyed by the token that proves the body (or another
 * helper) uses one. Constants both runners share (LOOP_SHRINK_WAIT_MS,
 * SLOT_LINE, the snapshot limits) are NOT restated here: the shared module
 * that exports them is embedded whole, and naming the token is what pulls it in.
 */
const HELPERS: { token: string; source: string[] }[] = [
  {
    token: 'await settle(',
    source: [
      'async function settle(page: Page): Promise<void> {',
      "  // Record the page's traffic from the first settle on, as the daemon records",
      '  // it from the moment its session adopts a page: an action begun on it later',
      '  // (beginAction, the shared src/execution/action.ts) has a baseline to read.',
      '  pageTraffic(page);',
      '  await settleDom(page);',
      '}',
    ],
  },
  {
    // The whole-action budget every emitted beginAction is given.
    token: 'ACTION_DEADLINE_MS',
    source: [`const ACTION_DEADLINE_MS = ${ACTION_DEADLINE_MS};`],
  },
  {
    token: 'catch(actionFailed)',
    source: [
      '/**',
      " * A state-changing action that threw, rethrown with what its error proves",
      " * about it (the shared outcomeOfError): `[outcome: not dispatched]` when",
      ' * nothing went out, `[outcome: unknown]` otherwise — the words replay puts',
      " * after its own `click failed: …`.",
      ' */',
      'function actionFailed(err: unknown): never {',
      "  if (err instanceof Error && !err.message.includes('[outcome: ')) err.message += ` ${outcomeLabel(outcomeOfError(err))}`;",
      '  throw err;',
      '}',
    ],
  },
  {
    // Shared by `urlPartsWhen` and `urlEffect`: the window a url a step
    // navigated TO is given before it is judged.
    token: 'URL_WAIT_MS',
    source: [`const URL_WAIT_MS = ${URL_WAIT_MS};`],
  },
  {
    // Every navigation the artifact makes, bounded exactly as tools.ts's
    // `goto` bounds the daemon's.
    token: 'GOTO_TIMEOUT_MS',
    source: [
      '/**',
      " * tools.ts's `goto`: the load event, within 30s — and it has to be said out",
      ' * loud, because under `@playwright/test` `navigationTimeout` defaults to 0.',
      ' * The familiar 30s default belongs to playwright-core, NOT to the test',
      ' * runner, so a bare `page.goto(url)` in a spec file is unbounded IN FACT:',
      ' * an app that never finishes loading hangs the test until the runner (or,',
      ' * under a harness, a kill signal) stops it, with nothing logged about where',
      ' * it was. Every goto this file emits passes this, so the artifact fails the',
      ' * same way, at the same moment, as the daemon replaying the same step.',
      ' */',
      'const GOTO_TIMEOUT_MS = 30_000;',
    ],
  },
  {
    token: 'logWarning(',
    source: [
      '/**',
      ' * A soft finding, in the one grep-able shape replay reports its own warnings in.',
      ' *',
      ' * stdout, not stderr, like every `[sitelooper …]` line this file logs: the',
      " * list reporter forwards a worker's stdout live and batches its stderr to the",
      ' * END of the run, so a run that is killed (a harness watchdog, a CI timeout)',
      ' * loses everything written to stderr. On stdout these interleave with the',
      ' * `[sitelooper step]` lines and survive the kill, which is the only record of',
      ' * where the run had got to.',
      ' */',
      'function logWarning(line: string): void {',
      '  console.log(`[sitelooper warn] ${line}`);',
      '}',
    ],
  },
  {
    token: 'echoRead(',
    source: [
      '/**',
      " * A published read whose value is only what this segment itself typed,",
      " * selected or named — replay's echoedValues, through the shared echoVerdict",
      ' * (src/execution/echo.ts, embedded). It confirms the control, not that the',
      ' * app persisted anything, so the label is listed in `run.echoed` and warned;',
      ' * the value is still published, as replay still carries it to later steps.',
      ' */',
      'function echoRead(ledger: Set<string>, run: FlowRun, label: string, key: string, value: string | undefined, where: string): void {',
      "  const echo = echoVerdict(ledger, label, value ?? '', where);",
      '  if (!echo) return;',
      '  run.echoed.push(key);',
      '  logWarning(echo);',
      '}',
    ],
  },
  {
    token: 'errorPageGate(',
    source: [
      '/** First gate after every step, as replay orders it: nothing recorded can hold on a browser error page. */',
      'function errorPageGate(page: Page, where: string): void {',
      '  const stop = errorPageVerdict(page.url(), where);',
      '  if (stop) throw new Error(stop);',
      '}',
    ],
  },
  {
    token: 'await urlEffect(',
    source: [
      '/**',
      " * Where the step was supposed to leave the browser — replay's expectedUrl",
      ' * gate. The VERDICT is the shared urlEffectVerdict (src/execution/gates.ts,',
      ' * embedded): a strict urlMatches passes, a same-shape url with 1–2 differing',
      ' * literal segments is treated as volatile (warned, continued), anything else',
      ' * stops. Only the WAIT is this file\'s own: the recorded url may still be on',
      ' * its way (an SPA sign-in answers the click, then routes a moment later), so',
      ' * a strict match is given URL_WAIT_MS on the navigation itself before the',
      ' * verdict is asked once, of wherever the browser then is. `link` is what the',
      " * step's click reported of the link it clicked (the shared beginAction): a",
      ' * click that went where its link points, recorded as staying on the page it',
      ' * left, is the shared linkLandingWarning and waits for nothing.',
      ' */',
      'async function urlEffect(page: Page, pattern: string, p: Record<string, string>, where: string, volatile: UrlSegDiff[], link?: LinkNavigation): Promise<void> {',
      '  if (!urlMatches(pattern, page.url(), p)) {',
      '    const landed = linkLandingWarning(pattern, page.url(), p, where, link);',
      '    if (landed) return logWarning(landed);',
      '  }',
      '  await page.waitForURL((url) => urlMatches(pattern, url.toString(), p), { timeout: URL_WAIT_MS }).catch(() => {});',
      '  const verdict = urlEffectVerdict(pattern, page.url(), p, where, link);',
      '  for (const line of verdict.warnings) logWarning(line);',
      '  // What this step watched vary is the segment\'s evidence from here on',
      '  // (navigationTarget), whether or not the step goes on to stop.',
      '  if (verdict.diffs) volatile.push(...verdict.diffs);',
      '  if (verdict.stop) throw new Error(verdict.stop);',
      '}',
    ],
  },
  {
    token: 'navigationTarget(',
    source: [
      '/**',
      ' * Where a goto actually sends the browser — the shared retargetNavigation',
      ' * (src/execution/gates.ts): a recorded target whose only disagreement with',
      ' * the live url sits at a position THIS segment has already watched vary is a',
      " * literal from the recording's run, and the live value is navigated to",
      ' * instead. `volatile` is the segment ledger urlEffect fills, as replay keeps',
      ' * one per replayed skill. The returned `stale` is handed to this step\'s',
      ' * alert gate, so an unrecorded alert on the landing names the cause.',
      ' */',
      'function navigationTarget(target: string, page: Page, volatile: UrlSegDiff[], where: string): NavigationTarget {',
      '  const verdict = retargetNavigation(target, page.url(), volatile, where);',
      '  if (verdict.warning) logWarning(verdict.warning);',
      '  return verdict;',
      '}',
    ],
  },
  {
    token: 'settledAlerts(',
    source: [
      '/**',
      ' * The alert observation a step is judged by, taken where the daemon takes',
      " * its diff: after the action, once the DOM has settled (tools.ts",
      ' * settledSignature), and before any url wait — a toast that auto-dismisses',
      " * inside verify's url window is seen by both runners or by neither.",
      " * Rendered in the step's line dialect, with whether every live region was",
      ' * seen (the alert cap, an unread frame): "none raised" needs a full look.',
      ' */',
      'async function settledAlerts(page: Page, dialect: LineDialect = 1): Promise<ObservedAlerts | null> {',
      '  await settle(page);',
      '  return liveAlertsObserved(page, dialect);',
      '}',
    ],
  },
  {
    token: 'alertGate(',
    source: [
      '/**',
      " * The live-region alerts a step raised, judged by the shared alertVerdict",
      ' * (src/execution/gates.ts): an alert the recording never saw is reported,',
      ' * and stops a state-changing step only when its recorded page changes did',
      ' * not confirm it worked (a rejection toast that leaves the page superficially',
      ' * intact); a recorded-but-missing one only warns.',
      ' * Both observations are taken by the step lifecycle — `before` in prepare,',
      ' * `after` in settle, right after the action has settled and BEFORE the url',
      " * wait in verify, where the daemon takes its diff (a toast that auto-dismisses",
      ' * during a 5s url wait must not be missed) — and a page that could not be',
      ' * read is handed over as unobserved, never as "no alert".',
      ' */',
      'function alertGate(before: string[], after: ObservedAlerts | null, ctx: { where: string; isRead: boolean; expectedContains?: string; params: Record<string, string>; effectConfirmed?: boolean; navigatedToStale?: string }): void {',
      '  const verdict = alertVerdict(before, after ? after.alerts : null, ctx, after ? after.complete : true);',
      '  for (const line of verdict.warnings) logWarning(line);',
      '  if (verdict.stop) throw new Error(verdict.stop);',
      '}',
    ],
  },
  {
    token: 'await preconditionGate(',
    source: [
      '/**',
      " * Where a segment starts — replay's start-of-segment rule, through the shared",
      ' * preconditionVerdict (src/execution/gates.ts): a strict url match passes, a',
      ' * same-shape url with 1–2 differing segments proceeds with a warning when the',
      ' * page structure agrees, anything else refuses before the first step acts.',
      " * `similarity` is what replay's adapter passes: where the recording kept a",
      ' * page fingerprint, the call site measures the live page with the shared',
      ' * fingerprintPage and hands over the cosine of recorded and live — null when the page',
      " * could not be read, exactly as replay; null where the recording kept none",
      " * (the url alone decides); 'unmeasured' only for a segment of a file",
      ' * compiled before the vector travelled, which refuses a soft match it cannot',
      ' * measure. `url` is read at the call site BEFORE `similarity` is measured',
      ' * (arguments evaluate left to right), as replay reads startUrl before it',
      ' * fingerprints: both describe the page as the segment found it, not where a',
      ' * navigation in flight landed during the measurement. Async so the call site',
      ' * must await it: a gate that could be left un-awaited is one that can',
      ' * silently become a no-op.',
      ' */',
      "async function preconditionGate(pattern: string, url: string, p: Record<string, string>, where: string, similarity: number | null | 'unmeasured', mints: { at: string; step: number }[] = []): Promise<void> {",
      '  const verdict = preconditionVerdict(pattern, url, p, similarity, mints);',
      '  for (const line of verdict.warnings) logWarning(`${where}: ${line}`);',
      '  if (verdict.refuse) throw new Error(`${where}: ${verdict.refuse} — nothing of this segment has run`);',
      '}',
    ],
  },
  {
    token: 'recordedFingerprint(',
    source: [
      '/**',
      " * The structural page fingerprint a segment recorded, read from FLOW — the",
      ' * source of truth, so the vector is carried once. A segment the emitter',
      ' * asked this of always has one; its absence means FLOW was edited by hand,',
      ' * and the gate fails closed rather than soft-match on the url alone.',
      ' */',
      'function recordedFingerprint(stepId: string, segmentId: string): number[] {',
      '  const steps = FLOW.steps as unknown as readonly { id: string; segments: readonly { id: string; preconditions: { fingerprint?: number[] } }[] }[];',
      '  const recorded = steps.find((s) => s.id === stepId)?.segments.find((g) => g.id === segmentId)?.preconditions.fingerprint;',
      '  if (!recorded) throw new Error(`${stepId} ${segmentId}: FLOW carries no recorded page fingerprint for this segment (the file was edited) — recompile it with sitelooper`);',
      '  return recorded;',
      '}',
    ],
  },
  {
    token: 'urlPartsWhen(',
    source: [
      '/**',
      ' * The url parts a step mints, read AFTER the navigation it started has landed.',
      ' *',
      ' * WHICH REPLAY RULE THIS MIRRORS. runOneStep captures the url before the',
      ' * action and, when the action changed it, awaits settleDom before binding',
      " * the step's derived values — the value a spec needs is the one on the url",
      ' * the step navigated TO, and `page.url()` read in the same tick as the',
      ' * click still says where the page came FROM. Bound empty, every pattern',
      ' * built from these parts (`toHaveURL`, an identity marker) can only fail.',
      ' *',
      ' * ALL of them together, not one at a time, because they are read into ONE',
      ' * pattern: an app is free to populate its state fragment key by key (odoo',
      ' * lands on `#cids=1&menu_id=81` and adds `action=` a beat later), so a part',
      ' * that binds the instant IT is non-empty can be bound off a half-built url',
      ' * while its neighbour is still missing. The step is not where it was',
      ' * recorded until every part is there.',
      ' *',
      ' * A spec has no settleDom, so it polls on the shared resolve cadence',
      ' * (RESOLVE_POLL_MS) within the window',
      ' * replay effectively allows a url (URL_WAIT_MS), and takes one last reading',
      ' * at the deadline: a step whose url genuinely does not change (the parts were',
      ' * already there) must still bind what is there rather than hang or throw.',
      ' *',
      ' * The parts themselves come from the shared `urlPart` (src/execution/url.ts),',
      " * the daemon's own labelling; a part the url does not carry is undefined.",
      ' */',
      "async function urlPartsWhen(page: Page, labels: string[], urlBefore = ''): Promise<(string | undefined)[]> {",
      '  const read = (url: string) => labels.map((label) => urlPart(url, label));',
      '  for (let waited = 0; waited < URL_WAIT_MS; waited += RESOLVE_POLL_MS) {',
      '    const url = page.url();',
      '    const values = read(url);',
      '    if (url !== urlBefore && values.every(Boolean)) {',
      '      // The parts are there — but an app is free to redirect AGAIN from',
      '      // the url that first carried them, and the value that matters is',
      '      // the one on the url the step SETTLES on. Replay never sees this,',
      '      // because it binds derived values only after settleDom absorbs the',
      '      // whole redirect chain. So: let the DOM go quiet, and if the url',
      '      // moved while it did, settle once more before reading.',
      '      for (let pass = 0; pass < 2; pass++) {',
      '        const before = page.url();',
      '        await settle(page);',
      '        if (page.url() === before) break;',
      '      }',
      '      return read(page.url());',
      '    }',
      '    await page.waitForTimeout(RESOLVE_POLL_MS);',
      '  }',
      '  return read(page.url());',
      '}',
    ],
  },
  {
    token: 'urlPartWhen(',
    source: [
      '/** One part, on the same terms. `urlBefore` is omitted where no action of this step',
      "  * moved the page: then the wait is simply for the part to be there at all, which is",
      '  * what the flow runner does before it publishes a step\'s url outputs (consumedUrlOutputs). */',
      "async function urlPartWhen(page: Page, label: string, urlBefore = ''): Promise<string | undefined> {",
      '  return (await urlPartsWhen(page, [label], urlBefore))[0];',
      '}',
    ],
  },
  {
    token: 'bindPart(',
    source: [
      '/**',
      " * A derived value, bound as replay binds it: only when the url carries the",
      ' * part. Left unset, the `{{dN}}` marker stays literal wherever it is filled,',
      " * which urlDiff reads as a wildcard and a locator as text no page shows.",
      ' */',
      'function bindPart(p: Record<string, string>, name: string, value: string | undefined): void {',
      '  if (value !== undefined) p[name] = value;',
      '}',
    ],
  },
  {
    token: 'await frameRoot(',
    source: [
      '/**',
      " * The recorded frame a step's target lives in — replay's own lookup, the",
      ' * shared rootFor (src/execution/context.ts, embedded): the ranked selectors',
      ' * each hop recorded, polled for `waitMs`. A frame that is not there is a',
      " * stop, never a search of the main page: the page's own Save is not the",
      " * frame's Save, whatever it is called.",
      ' */',
      'async function frameRoot(page: Page, frame: FramePath, where: string, waitMs: number = RESOLVE_WAIT_MS): Promise<Root> {',
      '  const found = await rootFor(page, frame, waitMs);',
      "  if ('error' in found) throw new Error(`${where}: ${found.error}, so the target recorded inside it was not looked for on the page`);",
      '  return found.root;',
      '}',
    ],
  },
  {
    token: 'pageGate(',
    source: [
      '/**',
      " * The page a step was recorded on, among the browser's open pages — replay's",
      ' * check through the shared pageIndexVerdict: a step recorded on a popup does',
      ' * not run on the page that opened it.',
      ' */',
      'function pageGate(page: Page, expected: number, where: string): void {',
      '  const stop = pageIndexVerdict(page, expected, where);',
      '  if (stop) throw new Error(stop);',
      '}',
    ],
  },
  {
    token: 'await landed(',
    source: [
      '/**',
      ' * Where a step that was recorded opening a popup, closing its page or',
      ' * switching tabs left the procedure — the question the shared armPageEffect',
      ' * (armed before the action dispatched) hands back. A recorded popup that did',
      ' * not open is a stop, exactly as in replay.',
      ' */',
      'async function landed(landing: (() => Promise<{ page: Page } | { error: string } | null>) | null): Promise<Page | null> {',
      '  if (!landing) return null;',
      '  const result = await landing();',
      "  if (result && 'error' in result) throw new Error(result.error);",
      '  return result ? result.page : null;',
      '}',
    ],
  },
  {
    token: 'await click(',
    source: [
      `const CLICK_TIER_MS = ${CLICK_TIER_MS};`,
      'async function click(loc: Locator, opts: { dbl?: boolean; obs?: ActionObservation | null } = {}): Promise<void> {',
      "  // The tiers are cut to what is left of the action's deadline, and report how the click went out.",
      '  await robustClick(loc, { timeout: CLICK_TIER_MS, dbl: opts.dbl, obs: opts.obs ?? undefined });',
      '}',
    ],
  },
  {
    token: 'logRecipe(',
    source: [
      '/** The words the daemon reports a verified recipe in (its tool result), as a grep-able line. */',
      'function logRecipe(attempt: RecipeAttempt): void {',
      '  console.log(`[sitelooper recipe] ${describeRecipeAttempt(attempt)}`);',
      '}',
    ],
  },
  {
    token: 'await fill(',
    source: [
      '/**',
      " * A recorded `fill`, executed as tools.ts's `case 'fill'` executes it: the",
      ' * shared ladder `fillWithRecipe` (src/execution/recipes.ts, embedded above)',
      ' * — the component recipe first, verified against the widget\'s own read,',
      ' * and the native reactSafeFill only when nothing was verified. Both halves',
      ' * matter. A keyboard-driven editor has no value property to set (monaco\'s',
      ' * `<textarea>` is an input sink and the text you see is a rendered',
      ' * `.view-lines` div), so a native setter writes into a box the editor never',
      ' * reads — grafana `03-add s_e4d3e5/6` reported success on exactly that and',
      ' * the saved panel kept its default markdown. And a plain input that commits',
      ' * on `change` (Odoo, React controlled inputs) never sees Playwright\'s own',
      ' * fill, which fires only `input` — odoo sp4od filled a quantity the form',
      ' * never committed. The recipes themselves are the RECIPES snapshot: what the',
      ' * daemon\'s component store would have chosen when this file was compiled.',
      ' * No visibility wait ahead of recognition, as in the daemon: a recognised',
      " * widget's recipe clicks its root (an input sink inside it may be 0x0), and",
      " * the native half waits for the field itself (reactSafeFill's own 10s).",
      ' */',
      'async function fill(loc: Locator, value: string): Promise<void> {',
      '  const attempt = await fillWithRecipe(loc.page(), loc, value, recipeBook);',
      '  if (attempt) logRecipe(attempt);',
      '}',
    ],
  },
  {
    token: 'await type(',
    source: [
      '/**',
      " * A recorded `type`, as tools.ts's `case 'type'`: the same set-value recipe",
      ' * ladder a fill climbs (an editor or an aria-combobox driven by typing in',
      ' * the recording is driven by its recipe here too), else pressSequentially',
      " * on the same target with the daemon's timeout and per-key delay.",
      ' */',
      `const TYPE_TIMEOUT_MS = ${TYPE_TIMEOUT_MS};`,
      `const TYPE_DELAY_MS = ${TYPE_DELAY_MS};`,
      'async function type(loc: Locator, text: string, opts: { delay?: number } = {}): Promise<void> {',
      '  const attempt = await typeWithRecipe(loc.page(), loc, text, recipeBook, { timeout: TYPE_TIMEOUT_MS, delay: opts.delay ?? TYPE_DELAY_MS });',
      '  if (attempt) logRecipe(attempt);',
      '}',
    ],
  },
  {
    token: 'await select(',
    source: [
      '/**',
      " * A recorded `select`, as tools.ts's `case 'select'`: the select-option",
      ' * recipe for a recognized widget (a portal-rendered aria-combobox), else the',
      ' * native reactSafeSelect by label, with the recorded `optionValue` as the',
      ' * last resort replay itself keeps.',
      ' */',
      'async function select(loc: Locator, label: string, fallbackValue?: string): Promise<void> {',
      '  const { attempt } = await selectWithRecipe(loc.page(), loc, label, recipeBook, fallbackValue);',
      '  if (attempt) logRecipe(attempt);',
      '}',
    ],
  },
  {
    token: 'await hover(',
    source: [
      'async function hover(loc: Locator): Promise<void> {',
      '  await syntheticHover(loc);',
      '}',
    ],
  },
  {
    token: 'resolveTarget(',
    source: [
      '/**',
      " * One recorded chain resolved against the page — the artifact's adapter to",
      ' * the shared `resolveCandidates` (src/execution/resolve.ts, embedded above),',
      " * which is replay's `resolveChain` policy itself: the class order, the",
      ' * point mark, the identity guard, plausibility, the origin guard, ambiguity',
      ' * and its loop-cursor narrowing, the structural hold and the whole-chain',
      ' * wait are decided THERE, in both runners. Nothing here reinterprets one.',
      ' *',
      ' * What this adds is presentation, exactly what replay adds around its own',
      ' * call:',
      ' *  - `where` (`"<stepId> <segmentId>/<stepIndex> target|source"`, baked in',
      ' *    at each call site) turns a silent fallthrough into telemetry. A win by',
      ' *    any candidate but the primary (stored index 0) IS drift — the recorded',
      ' *    locator missed and a later one covered for it — so it is one stable,',
      ' *    grep-able `[sitelooper drift]` line naming every candidate rejected',
      " *    ahead of the winner and WHY, in the policy's own words (MissReason).",
      " *  - `resolved` is the loop-body sink (replay's runOneStep `sink`): what",
      ' *    this target resolved TO, as `<key>=<winning locator>`, with the cursor',
      ' *    appended only when ambiguity was narrowed to it. The progress guard',
      " *    compares one pass's entries with the last.",
      ' *',
      " * WHAT THE ARTIFACT STILL CANNOT MIRROR. Retirement (`retired`, replay's",
      " * evidence-based reordering of a candidate later runs showed volatile):",
      ' * that evidence lives in the skill store, and an artifact has none, so a',
      ' * compiled chain is ordered by class and recorded order alone. Everything',
      ' * else the policy decides is decided here from the same observations.',
      ' */',
      'async function resolveTarget(',
      '  page: Page,',
      '  candidates: CandidateObservation[],',
      '  where: string,',
      '  policy: ResolvePolicy,',
      '  opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},',
      '): Promise<Resolution | null> {',
      '  const hit = await resolveCandidates(page, candidates, policy);',
      '  if (!hit) return null;',
      '  const primary = candidates.find((c) => c.index === 0) ?? candidates[0];',
      '  // Drift is a better candidate that FAILED (the shared isDrift), never a stored',
      '  // index alone: a positional primary the policy ranked behind a name was not missed.',
      '  if (isDrift(hit)) {',
      "    const missed = hit.missed.map((m) => `#${m.index + 1} ${m.reason}`).join(', ');",
      '    const head = hit.missed.some((m) => m.index === 0) ? `primary ${String(primary.locator)} missed; used` : \'used\';',
      '    const line = `[sitelooper drift] ${where}: ${head} #${hit.index + 1} ${String(hit.locator)} (${missed})`;',
      '    console.log(line);',
      '    (opts.drift ?? DRIFT).push(line);',
      '  }',
      '  if (opts.resolved) {',
      '    const won = candidates.find((c) => c.index === hit.index) ?? primary;',
      "    opts.resolved.into.push(`${opts.resolved.key}=${String(won.locator)}${hit.nth !== undefined ? `.nth(${hit.nth})` : ''}`);",
      '    // the loop progress guard, asked before anything acts on what just resolved',
      '    opts.resolved.check?.();',
      '  }',
      '  return hit;',
      '}',
    ],
  },
  {
    token: 'pick(',
    source: [
      '/**',
      ' * resolveTarget for an ACTION: a chain that resolves nothing is a stop.',
      ' *',
      ' * `note` is passed only at a FLAGGED step (compile found the step itself',
      ' * wrong — a demoted pin, say — see spec/diagnostics.ts). Appended to the',
      ' * throw, it is what stops "none of 3 recorded locators resolved" from',
      ' * reading as app drift when the recording is what needs redoing.',
      ' */',
      'async function pick(',
      '  page: Page,',
      '  candidates: CandidateObservation[],',
      '  where: string,',
      '  policy: ResolvePolicy,',
      '  opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},',
      '  note?: string,',
      '): Promise<Resolution> {',
      '  const hit = await resolveTarget(page, candidates, where, policy, opts);',
      '  if (hit) return hit;',
      '  throw pickMiss(page, candidates, where, note);',
      '}',
    ],
  },
  {
    token: 'pickMiss(',
    source: [
      '/** The stop for a chain that resolved nothing, shared by `pick` and `pickOrNavigate`. */',
      'function pickMiss(page: Page, candidates: CandidateObservation[], where: string, note?: string): Error {',
      '  return new Error(',
      '    // The url and the recorded step are half the answer whenever a chain',
      '    // misses wholesale: a locator that named the control on the day it was',
      '    // recorded usually misses because the page is not the page the step',
      '    // expected, and the log otherwise says only that nothing resolved.',
      '    `none of ${candidates.length} recorded locators resolved at ${where} (page is at ${page.url()}): ` +',
      "      candidates.slice(0, 3).map((c) => String(c.locator)).join(' | ') +",
      "      (note ? `\\n  ${note}` : ''),",
      '  );',
      '}',
    ],
  },
  {
    token: 'pickOrNavigate(',
    source: [
      '/**',
      " * `pick` for a navigation click with a recorded destination — replay's",
      ' * navigation fallback (runOneStep), through the shared',
      ' * mayNavigateToDestination/navigateToDestination (src/execution/recover.ts,',
      ' * embedded). When the chain resolves nothing and the browser is not already',
      ' * where the click was recorded to land, another visible link to that',
      ' * destination is clicked, else a fully concrete destination is navigated to',
      ' * directly. Arrival returns null — the step is done, logged as drift, and',
      ' * its gates are not asked, as replay returns before them. Otherwise the',
      " * same stop `pick` throws. Never emitted in a loop body (replay's rule).",
      ' */',
      'async function pickOrNavigate(',
      '  page: Page,',
      '  candidates: CandidateObservation[],',
      '  where: string,',
      '  policy: ResolvePolicy,',
      '  destPattern: string,',
      '  p: Record<string, string>,',
      '  opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},',
      '  note?: string,',
      '): Promise<Resolution | null> {',
      '  const hit = await resolveTarget(page, candidates, where, policy, opts);',
      '  if (hit) return hit;',
      "  if (mayNavigateToDestination('click', destPattern, page.url(), p, false)) {",
      '    const arrived = await navigateToDestination(page, destPattern, p, {',
      '      click: async (loc) => {',
      '        await click(loc);',
      '      },',
      "      goto: (url) => page.goto(url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS }),",
      '    });',
      "    // The substitute link's click may have landed: a stop, never the direct navigation after it.",
      "    if (arrived && 'unknown' in arrived) throw new Error(`${where}: none of ${candidates.length} recorded locators resolved; ${arrived.note}`);",
      '    if (arrived) {',
      '      const line = `[sitelooper drift] ${where}: none of ${candidates.length} recorded locators resolved; ${arrived.note}`;',
      '      console.log(line);',
      '      (opts.drift ?? DRIFT).push(line);',
      '      return null;',
      '    }',
      '  }',
      '  throw pickMiss(page, candidates, where, note);',
      '}',
    ],
  },
  {
    token: 'textHeldOrThrow(',
    source: [
      '/**',
      " * A text wait that failed on the target it resolved — replay's",
      ' * textHeldElsewhere rung (the shared src/execution/recover.ts, embedded):',
      ' * when another recorded candidate for the same target already shows the',
      ' * text, the condition held, and the step goes on to its own gates with a',
      ' * drift line naming the candidate. Otherwise the wait\'s own error stands.',
      ' */',
      'async function textHeldOrThrow(err: unknown, candidates: CandidateObservation[], state: string, text: string, where: string, drift: string[]): Promise<void> {',
      '  const held = await textHeldElsewhere(candidates, state, text);',
      '  if (!held) throw err;',
      "  const message = (err instanceof Error ? err.message : String(err)).split('\\n')[0];",
      '  const line = `[sitelooper drift] ${where}: ${message}; the text was already showing in fallback #${held.index + 1} ${String(held.locator)}`;',
      '  console.log(line);',
      '  drift.push(line);',
      '}',
    ],
  },
  {
    token: 'skippedReads',
    source: [
      '/**',
      ' * Every `[sitelooper skip]` line this run logged, by the `where` that',
      ' * logged it (`<step id> <skill step>/<n> <role>`).',
      ' *',
      " * WHY THIS EXISTS. `need`'s error used to tell the reader, unconditionally,",
      ' * to look above for the producing step\'s `[sitelooper skip] … read target',
      ' * not found` line. When the reference names something that is not a step of',
      ' * the flow (grafana fwgr47: `07-verify needs {{i2.dashboard_title_saved}}`,',
      ' * a ledger instruction id no step publishes) no such line was ever emitted —',
      ' * the only occurrence of that string in the entire log was inside the error',
      ' * itself, and it sent the diagnosis after a read that was working all along.',
      ' * So the claim is now made only when the log bears it out.',
      ' */',
      'const skippedReads: string[] = [];',
    ],
  },
  {
    token: 'readOptional(',
    source: [
      '/**',
      ' * A recorded READ, which never fails the flow.',
      ' *',
      ' * WHICH REPLAY RULE THIS MIRRORS. runOneStep treats `read`/`read_all` as an',
      ' * OBSERVATION, not a state change: a read whose target cannot be resolved —',
      ' * or whose read itself errors — is skipped with a warning and the replay',
      ' * CONTINUES ("skipped read — no element matched any known locator"). Failing',
      ' * to re-capture a value says nothing about whether the procedure ran; the',
      ' * step after it is exactly as valid as it was. A spec that threw here turned',
      " * a missing observation into a failed test: grafana's `panel_content` read is",
      ' * a freshly applied text panel whose body the verifier goes on to confirm,',
      ' * and none of the three recorded ways of naming it resolved inside the',
      ' * resolve window — one lost value, and the run reported as a broken procedure.',
      ' *',
      ' * So: the resolution and the read together, and on any failure one grep-able',
      ' * line and an EMPTY value. Assertions and outputs built from an empty read',
      ' * are left exactly as they were — the emptiness is the honest report.',
      ' *',
      ' * The rules are not restated here. WHEN the resolution is asked (once, then',
      ' * after one sweep of the page once more with no wait) is the shared',
      ' * resolveForRead; taking the read, flattening it and turning its error into',
      ' * a skip is the shared takeRead (src/execution/observe.ts, embedded).',
      " * Replay's runOneStep calls the same two; this adapter only says what it did.",
      ' */',
      'async function readOptional(',
      '  page: Page,',
      '  candidates: CandidateObservation[],',
      '  where: string,',
      '  policy: ResolvePolicy,',
      '  read: (loc: Locator) => Promise<unknown>,',
      '  opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},',
      '): Promise<string> {',
      '  const hit = await resolveForRead(page, (again) => resolveTarget(page, candidates, where, again ? { ...policy, waitMs: 0 } : policy, opts));',
      '  if (!hit) {',
      '    skippedReads.push(where);',
      '    console.log(`[sitelooper skip] ${where}: read target not found — value left empty`);',
      "    return '';",
      '  }',
      '  const taken = await takeRead(() => read(hit.locator));',
      '  if (taken.ok) return taken.value;',
      '  skippedReads.push(where);',
      '  console.log(`[sitelooper skip] ${where}: read errored (${taken.message}) — value left empty`);',
      "  return '';",
      '}',
    ],
  },
  {
    token: 'need(outputs, ',
    source: [
      '/**',
      ' * A value an earlier step had to publish, taken at the moment the step',
      ' * that NEEDS it is handed its arguments.',
      ' *',
      ' * WHICH REPLAY RULE THIS MIRRORS. The flow runner resolves every {{ref}}',
      ' * in a step\'s instruction and params BEFORE the step runs',
      ' * (src/daemon/server.ts:1009-1024) and classifies what it could not fill:',
      ' * a reference bound into a slot the pinned procedure actually USES — one a',
      ' * recorded step types or locates by, or that names the record the',
      " * procedure must find — is BLOCKING (`ignorableRefs`, src/skills/flow.ts:1083),",
      ' * so the zero-model replay is skipped and the step goes to recovery. Only a',
      ' * reference no recorded step can be affected by replays as pinned.',
      ' * `lookupRef` says it outright: a reference this run did not publish "goes',
      ' * to recovery, never to a recorded literal."',
      ' *',
      " * The artifact has no recovery, so blocking here is a stop. What it may NOT",
      ' * do is what the plain `outputs[ref] ?? \'\'` did: carry the empty string in.',
      ' * A read that matched nothing is left empty on purpose (see readOptional) —',
      ' * that is honest for an observation and fatal for an argument. Empty, a',
      " * record-scoped locator (`li:has-text('')`) matches EVERY record and a",
      ' * `known` slot loses the identity it exists to carry, so the blank does not',
      ' * merely misreport the run: it does the work to the wrong record.',
      ' *',
      ' * Raised at CONSUMPTION, never at the read: the producing step keeps its',
      ' * verdict, the browser is at rest, and nothing of the consuming step has',
      ' * run when this throws.',
      ' *',
      ' * What it says about the LOG is checked against the log (skippedReads): an',
      ' * unpublished reference whose producing step never skipped a read has a',
      ' * different cause and a different fix, and pointing at a line that was',
      ' * never printed costs a diagnosis (grafana fwgr47).',
      ' */',
      'function need(outputs: Outputs, ref: string, by: string): string {',
      '  const value = outputs[ref as keyof Outputs];',
      "  if (value === undefined || value === '') {",
      "    const dot = ref.indexOf('.');",
      '    const sid = dot < 0 ? ref : ref.slice(0, dot);',
      '    const skips = skippedReads.filter((w) => w === sid || w.startsWith(`${sid} `));',
      '    const trail = skips.length',
      '      ? `The step that publishes ${ref} read nothing — look above for its \\`[sitelooper skip]\\` line` +',
      '        ` (${skips[0]}), which is where this run diverged.`',
      '      : `No \\`[sitelooper skip]\\` line was logged for ${sid} on this run, so no read of ${ref} was even` +',
      '        ` attempted: check that ${sid} is a step of this flow and that it is the step that publishes` +',
      '        ` this value, rather than re-recording a read that may be working.`;',
      '    throw new Error(',
      '      `${by} needs {{${ref}}}, and this run never published it` +',
      "        (value === '' ? ' (it was published empty)' : '') +",
      '        `. ${trail}` +',
      '        ` Stopping here instead of passing an empty value into ${by}:` +',
      '        ` blank, a record-scoped locator matches every record and a known slot loses` +',
      '        ` its identity, so the step would do its work to the wrong one. Everything` +',
      '        ` earlier steps did stands; nothing of ${by} has run.`,',
      '    );',
      '  }',
      '  return value;',
      '}',
    ],
  },
  {
    token: 'shownOr(page, outputs, ',
    source: [
      '/**',
      ' * `needShown` for a slot nothing resolves by: the recorded value when the',
      ' * live page shows it, else the empty string this artifact has always',
      " * carried for an unpublished reference. Never throws — an unused slot's",
      ' * blank costs nothing, while a stop on it would refuse a step that can run.',
      ' */',
      'async function shownOr(page: Page, outputs: Outputs, ref: string, by: string, recorded: string, runValues: string[]): Promise<string> {',
      "  const published = outputs[ref as keyof Outputs];",
      "  if (published !== undefined && published !== '') return published;",
      '  if (await recordedValueShown(page, recorded, runValues)) {',
      '    (outputs as Record<string, string>)[ref] = recorded;',
      '    console.log(`[sitelooper resolved] ${by}: {{${ref}}} to its recorded value ${JSON.stringify(recorded)}, shown on the page`);',
      '    return recorded;',
      '  }',
      "  return '';",
      '}',
    ],
  },
  {
    token: 'needShown(page, outputs, ',
    source: [
      '/**',
      ' * `need`, except that a reference this run did not publish resolves to its',
      ' * RECORDED value when the live page shows it (the compiler emits this only',
      ' * for a value `recordedStandIn` judged safe: not identifier-shaped, not',
      " * holding a recorded var). WHICH REPLAY RULE THIS MIRRORS: the daemon's",
      ' * runFlow asks recordedValueShown of the same page at the same moment —',
      ' * before the consuming step runs — and banks the value for later steps.',
      " * fwrd54's 07-edit clicked a \"Mark Ready\" its producer never re-read.",
      " * A value published EMPTY is stood in for too: that is this artifact's",
      " * spelling of a read that matched nothing (readOptional leaves ''), where",
      ' * replay publishes no value at all — the same missing reference.',
      ' */',
      'async function needShown(page: Page, outputs: Outputs, ref: string, by: string, recorded: string, runValues: string[]): Promise<string> {',
      "  const published = outputs[ref as keyof Outputs];",
      "  if ((published === undefined || published === '') && (await recordedValueShown(page, recorded, runValues))) {",
      '    (outputs as Record<string, string>)[ref] = recorded;',
      '    console.log(`[sitelooper resolved] ${by}: {{${ref}}} to its recorded value ${JSON.stringify(recorded)}, shown on the page`);',
      '  }',
      '  return need(outputs, ref, by);',
      '}',
    ],
  },
  {
    token: 'satisfied(page, ',
    source: [
      '/**',
      " * Is this step's work already DONE on the record it names?",
      ' *',
      " * WHICH REPLAY RULE THIS MIRRORS. `goalSatisfied` (src/skills/replay.ts),",
      ' * asked of the SAME observation in the same dialect: one capture of the',
      " * page's snapshot lines (capturePageLines — role, name, state and the value",
      ' * after the colon, so a marker that is only an <input>\'s VALUE on a form in',
      ' * edit mode is seen, where `getByText` never could: cloud run sp5odb died on',
      ' * exactly that), read by lineShows. Two halves, and both are load-bearing.',
      ' * The IDENTITY texts say the page is showing THIS record — the url and the',
      ' * page shape only ever say "a page of this template" — and take the bounded',
      ' * rule (`whole`: `fwgr25-n1` is not satisfied by `fwgr25-n10`); the GOAL',
      ' * texts say that record is already in the state this step exists to',
      ' * produce, and are a plain substring, exactly as goalSatisfied splits them.',
      ' * Identity alone would skip a step because the right record is open; a goal',
      ' * alone would skip it because some OTHER record happens to read "Cancelled".',
      ' *',
      ' * Both halves being on the PAGE is not enough, which is why the record-scope',
      " * check follows (scopeCheckInPage, the daemon's own, run in the page): on a",
      ' * list, "Order A" and "Cancelled" are both present when it is order B that',
      ' * was cancelled. They have to hold of the same record.',
      ' *',
      ' * Conservative by construction: no goal, no identity, or a page that cannot',
      ' * be read — or a look that could not cover it (captureLines, dialect 2: a',
      ' * cap reached, a visible frame unread, a virtualised list) — is never',
      ' * satisfied. Being wrong the other way costs one re-run of a step that had',
      ' * already happened; being wrong THIS way skips work that never happened.',
      ' */',
      'async function satisfied(page: Page, identity: string[], goal: string[]): Promise<boolean> {',
      '  if (!identity.length || !goal.length) return false;',
      '  const captured = await captureLines(page, 2);',
      '  if (!captured || !captured.complete) return false;',
      '  const lines = captured.lines;',
      '  for (const want of identity) {',
      '    if (!lineShows(lines, [want], { whole: true })) return false;',
      '  }',
      '  for (const want of goal) {',
      '    if (!lineShows(lines, [want])) return false;',
      '  }',
      '  try {',
      '    // The identity half goes in as regex SOURCE: scopeCheckInPage is',
      '    // serialised into the page, so it cannot call identityRe there.',
      '    return await page.evaluate(scopeCheckInPage, { identity: identity.map(identitySource), goal });',
      '  } catch {',
      '    // A page that cannot be evaluated has proven nothing. Run the step.',
      '    return false;',
      '  }',
      '}',
    ],
  },
  {
    token: 'EXPECT_WAIT_MS',
    source: [
      '/**',
      " * How long a recorded page change has to appear: Playwright's own expect",
      ' * timeout, the patience the `toBeVisible()` assertion this replaced had.',
      ' */',
      'const EXPECT_WAIT_MS = 5_000;',
    ],
  },
  {
    token: 'await expectChanges(',
    source: [
      '/**',
      " * The step's recorded page changes, judged by the daemon's own effect gate.",
      ' *',
      ' * WHICH REPLAY RULE THIS MIRRORS. expectedChangesVerdict (src/execution/',
      " * expect.ts, embedded below) IS replay's `expectedChanges` gate — the same",
      ' * function, not a reading of it. The lines carrying this run\'s own values are',
      ' * HARD, the rest are a plain group; either is looked for first in the lines',
      ' * this step ADDED (capturePageLines before and after, diffed as the recorder',
      ' * diffs its signatures) and then on the live page, as WHOLE snapshot lines:',
      ' * role, name, state, and the value after the colon. An earlier cut of this',
      ' * file rebuilt each recorded line as a Playwright locator and asserted it',
      ' * visible, which never looked past the name — `- combobox "Project": {{v1}}`',
      ' * passed on any visible Project combobox whatever it showed. Polled for',
      ' * EXPECT_WAIT_MS, the patience that assertion had; the daemon reads its diff',
      ' * once, so the artifact is the more patient of the two, never the looser.',
      ' *',
      ' * The verdict\'s warnings go to stdout as `[sitelooper warn]` lines, a missing',
      " * diff leg or a look that could not cover the page as `[sitelooper unobserved]`.",
      " * Every look is rendered in `dialect`, the one the step's lines were recorded",
      ' * in (StepExpectation.lineDialect), exactly as replay renders its own. An absent dialog comes back to the',
      ' * step body, which remembers it for the steps that were going to act inside.',
      ' */',
      'async function expectChanges(',
      '  page: Page,',
      '  recorded: string[],',
      '  p: Record<string, string>,',
      '  ctx: { tag: string; tool: string; value?: string; positionalResolution: boolean },',
      '  linesBefore: string[] | null,',
      '  dialect: LineDialect = 1,',
      '): Promise<ChangeVerdict> {',
      '  let last: ChangeVerdict = { warnings: [] };',
      '  await expect',
      '    .poll(',
      '      async () => {',
      '        last = await expectedChangesVerdict(recorded, p, ctx, {',
      '          added: addedLines(linesBefore, await capturePageLines(page, dialect)),',
      '          live: () => captureLines(page, dialect),',
      '        });',
      '        return last.stop ?? null;',
      '      },',
      '      { timeout: EXPECT_WAIT_MS, message: `${ctx.tag}: the recorded page change did not appear` },',
      '    )',
      '    .toBeNull();',
      '  for (const warning of last.warnings) console.log(`[sitelooper warn] ${warning}`);',
      '  if (last.unobserved) console.log(`[sitelooper unobserved] ${ctx.tag}: the page could not be captured, or observed in full, after the action`);',
      '  return last;',
      '}',
    ],
  },
  {
    token: 'await absentDialogSkip(',
    source: [
      '/**',
      ' * Is this step one that was going to act inside a dialog that did not open?',
      ' *',
      ' * WHICH REPLAY RULE THIS MIRRORS. runOneStep, while a recorded dialog is',
      ' * absent (see ChangeVerdict.absentDialog): a step whose target cannot be',
      " * found AND which names one of that dialog's own controls — namesDialogControl,",
      ' * the shared rule, proven against the dialog\'s recorded subtree — is skipped as',
      ' * belonging to it. A step that resolves its target, or misses without naming',
      ' * anything the dialog listed, is the procedure\'s own and runs (and fails) as',
      ' * such; the caller clears the remembered dialog either way. A minting step is',
      ' * never skipped, because skipping a mutation cannot be undone: the caller',
      ' * emits none of this for one. The one look at the candidates here is what',
      " * replay's resolve window becomes on a page `settle` has already let go quiet.",
      ' */',
      'async function absentDialogSkip(',
      '  candidates: Locator[],',
      '  locators: Record<string, { kind: string; name?: string; text?: string; label?: string; hasText?: string }[]>,',
      '  dialog: { name: string; lines: string[] },',
      '  p: Record<string, string>,',
      '  where: string,',
      '): Promise<boolean> {',
      '  const inside = namesDialogControl({ locators }, dialog.lines, p);',
      '  if (inside === null) return false;',
      '  for (const candidate of candidates) if ((await candidate.count().catch(() => 0)) > 0) return false;',
      '  console.log(`[sitelooper skip] ${where}: acts on ${JSON.stringify(inside)}, a control of the dialog ${JSON.stringify(dialog.name)}, which did not open — skipped`);',
      '  return true;',
      '}',
    ],
  },
  {
    token: 'await dismissalSkip(',
    source: [
      '/**',
      ' * Is this step a dismissal of a dialog that is not open — already in effect?',
      ' *',
      " * WHICH REPLAY RULE THIS MIRRORS. runOneStep, on a target that did not",
      ' * resolve in its window: a step recorded closing a dialog (and doing nothing',
      ' * else) whose dialog is not on the page is skipped — the shared',
      ' * dismissalAlreadyInEffect decides, over the same recorded removals and a',
      " * look in the step's dialect. Replay asks after its resolve window, so this",
      ' * waits the same window for a VISIBLE target first (a modal library keeps a',
      ' * closed dialog, Close button and all, hidden in the DOM): a target that',
      ' * shows up is acted on by the pick below as usual, and a false return leaves',
      ' * that pick to report the miss exactly as it would have.',
      ' */',
      'async function dismissalSkip(',
      '  page: Page,',
      '  candidates: Locator[],',
      '  step: { locators: Record<string, { kind: string; name?: string; text?: string; label?: string; hasText?: string }[]>; expect: { removedContains: string[] } },',
      '  p: Record<string, string>,',
      '  where: string,',
      '  dialect: LineDialect = 1,',
      '): Promise<boolean> {',
      '  for (let waited = 0; ; waited += RESOLVE_POLL_MS) {',
      '    for (const candidate of candidates) {',
      '      const n = await candidate.count().catch(() => 0);',
      '      for (let i = 0; i < Math.min(n, 5); i++) if (await candidate.nth(i).isVisible().catch(() => false)) return false;',
      '    }',
      '    if (waited >= RESOLVE_WAIT_MS) break;',
      '    await page.waitForTimeout(RESOLVE_POLL_MS);',
      '  }',
      '  const done = dismissalAlreadyInEffect(step, await captureLines(page, dialect), p);',
      '  if (!done) return false;',
      '  console.log(`[sitelooper skip] ${where}: closes the dialog ${JSON.stringify(done.dialog)} with ${JSON.stringify(done.control)}, which is not open — already in effect`);',
      '  return true;',
      '}',
    ],
  },
];

/**
 * The helpers this body needs, in declaration order — transitively, because a
 * helper may use another (`urlPartWhen` reads the shared `urlPart`; both poll
 * on `pick`'s constants). Anything else would emit a file that references a
 * function it does not carry, which is the one defect a generated spec cannot
 * survive.
 *
 * The shared modules (src/execution/*.ts) come first, each embedded WHOLE and
 * once, a module counted as used when the body or a chosen helper names one of
 * its exports. A shared module may import a sibling; executionClosure carries
 * the sibling too, ahead of it, whether or not anything else names it.
 */
function neededHelpers(body: string, perFlow: { token: string; source: string[] }[] = []): { source: string[] }[] {
  const modules = executionClosure(EXECUTION_MODULES);
  const shared = modules.map((m) => ({ tokens: m.tokens, source: m.source, name: m.name }));
  // Per-flow helpers (the recipe snapshot) sit between the shared modules
  // they call and the fixed helpers that read them, so a top-level `const`
  // is declared after what builds it and before what uses it.
  const available: { tokens: string[]; source: string[]; name?: string }[] = [
    ...shared,
    ...perFlow.map((h) => ({ tokens: [h.token], source: h.source })),
    ...HELPERS.map((h) => ({ tokens: [h.token], source: h.source })),
  ];
  const chosen = new Set<(typeof available)[number]>();
  for (;;) {
    const text = [body, ...[...chosen].map((h) => h.source.join('\n'))].join('\n');
    const added = available.filter((h) => !chosen.has(h) && h.tokens.some((token) => text.includes(token)));
    if (!added.length) break;
    for (const h of added) chosen.add(h);
  }
  // A chosen module's siblings ride along even when nothing in the body names them.
  const closure = new Set(executionClosure(shared.filter((m) => chosen.has(m)).map((m) => m.name)).map((m) => m.name));
  return available.filter((h) => chosen.has(h) || (h.name !== undefined && closure.has(h.name)));
}

/**
 * The recipe snapshot the artifact's `fill`/`type`/`select` adapters drive
 * the shared ladders with — `RecipeSnapshot`, `snapshotBook` and the ladders
 * themselves are the embedded src/execution/recipes.ts. The snapshot is the
 * spec's (`SpecFlow.recipes`, what the daemon's ComponentStore would have
 * chosen when the flow was compiled); a spec compiled without a store carries
 * the shipped seeds, which is what a fresh install's store holds too.
 * Nothing about a family or a step list is restated here: the recognition
 * set and the seed procedures travel inside the module.
 */
/**
 * The browser the flow was recorded in, twice: as the profile `runFlow` judges
 * the live page against (the embedded profileMismatch), and as the Playwright
 * Test options the generated `.spec.ts` applies with `test.use`. Applying it
 * belongs to the spec file, not to runFlow: the browser is the test runner's,
 * and a project that runs the flow on a phone on purpose must not have it
 * silently reset to the recording's desktop window.
 */
function recordedBrowserLines(profile: BrowserProfile): string[] {
  const use = {
    viewport: profile.viewport,
    ...(profile.deviceScaleFactor !== undefined ? { deviceScaleFactor: profile.deviceScaleFactor } : {}),
    ...(profile.isMobile !== undefined ? { isMobile: profile.isMobile } : {}),
    ...(profile.hasTouch !== undefined ? { hasTouch: profile.hasTouch } : {}),
    ...(profile.userAgent !== undefined ? { userAgent: profile.userAgent } : {}),
  };
  return [
    '/**',
    ` * The browser this flow was recorded in${profile.device ? ` (${profile.device})` : ''}. Layout-dependent locators`,
    ' * (coordinates, responsive columns, a nav that collapses to a menu) hold only there;',
    ' * runFlow compares the page it is given and says so in run.warnings when it differs.',
    ' */',
    `export const RECORDED_BROWSER: BrowserProfile = ${JSON.stringify(profile)};`,
    '/** RECORDED_BROWSER as Playwright Test options: the generated spec calls `test.use(RECORDED_USE)`. */',
    `export const RECORDED_USE = ${JSON.stringify(use)};`,
  ];
}

function recipesHelper(spec: SpecFlow): { token: string; source: string[] } {
  const snapshot = spec.recipes ?? snapshotRecipes(seedRecipes()).recipes;
  return {
    token: 'recipeBook',
    source: [
      '/**',
      ' * The component recipes this file drives fill/type/select through: one',
      " * procedure per (family, intent), the daemon's own choice at compile time.",
      ' * Compile-time state — the daemon keeps learning and demoting; this file',
      ' * runs what it was given. Recompile to refresh it.',
      ' */',
      `const RECIPES: RecipeSnapshot = ${JSON.stringify(snapshot)};`,
      'const recipeBook = snapshotBook(RECIPES);',
    ],
  };
}

/**
 * The FLOW literal: `JSON.stringify(spec, null, 2)`, except that a segment's
 * page fingerprint — FINGERPRINT_DIMS numbers — is written on ONE line rather
 * than one line per number. Still JSON (lift parses it as such), and nothing
 * but whitespace differs, so the IR it encodes is the same.
 */
function flowLiteral(spec: SpecFlow): string {
  return JSON.stringify(spec, null, 2).replace(
    /("fingerprint": )\[\n([-+.eE0-9,\s]*?)\n\s*\]/g,
    (_all, head: string, numbers: string) => `${head}[${numbers.split(',').map((n) => n.trim()).join(',')}]`,
  );
}

/** Emission state shared by every step of one flow step's body. */
interface Ctx {
  /** Flow step id, the prefix of every output key this body writes. */
  stepId: string;
  /** Slot names the body needs in `p`, collected as it emits. */
  slots: Set<string>;
  /**
   * Inside a folded loop: the variable holding the index of the record THIS
   * pass acts on. Replay keeps exactly such a cursor (runLoop) and advances
   * it when the collection did not shrink; a spec that always took `.first()`
   * instead worked record one over and over on every edit-in-place loop.
   */
  loopCursor?: string;
  warnings: string[];
  /**
   * Problems found while emitting, as typed diagnostics (spec/diagnostics.ts)
   * rather than only prose: a capability the artifact cannot carry is reported
   * by every surface in the same shape, and the compile caller gets it in
   * `--json` instead of having to read a comment out of the generated file.
   */
  diagnostics: Diagnostic[];
  downloads: number;
  /** Resolved-target locals emitted so far, so each names its own. */
  picks: number;
  /** The segment and within-segment step index currently emitting — for `@step` and `pick`'s `where`. */
  segmentId: string;
  stepIndex: number;
  /** Hoisted loop guards, so each loop names its own. */
  loops: number;
  /**
   * Inside a folded loop: the array the body's resolutions are recorded in,
   * for the loop's progress guard — replay's `sink` (runOneStep). Every
   * target of every body step lands here as `<key>=<winning candidate>`, so a
   * pass that resolved the same elements as the last one reads the same.
   */
  loopSink?: string;
  /** Pre-action url captures emitted so far, so each minting step names its own. */
  urls: number;
  /** Batched derived-value reads emitted so far, so each names its own local. */
  binds: number;
  /**
   * One line naming what compile found wrong with THIS flow step, when it
   * found anything (see `stepNote`). Carried onto every way the step can
   * fail: the `pick` throw, and a single-candidate action's rethrow.
   */
  note?: string;
  /**
   * The segment's KNOWN slots (SkillParam.known): the values a caller vouched
   * for, which are the only ones that can NAME the record a step acts on.
   * The identity guard is rendered from these, as replay's identityOfPrimary
   * restricts itself to `skill.params[slot].known`.
   */
  known: Set<string>;
  /**
   * The step-scoped variable the resolution reports positional resolution
   * into, when the step carries recorded changes for the effect gate to
   * sharpen on — replay's own per-step `positionalResolution`.
   */
  positional?: string;
  /**
   * An earlier step of this body may leave a recorded dialog absent (see
   * ChangeVerdict.absentDialog), so every later step consults the body's
   * `absentDialog` before it resolves — exactly the state runOneStep keeps.
   */
  dialogAbsence?: boolean;
  /**
   * The current segment's echo ledger (see echoLines): the local that
   * remembers what this segment typed, selected or named, as replay keeps one
   * `interacted` set per replayed segment. `echoUsed` says a line named it.
   */
  echoes?: string;
  echoUsed?: boolean;
  /**
   * The current segment's record of url positions this run has watched vary
   * (urlEffect's diffs), which a later navigation of the same segment
   * retargets by — replay keeps exactly this list per replayed skill.
   * `volatileUsed` says a line named it.
   */
  volatile?: string;
  volatileUsed?: boolean;
  /**
   * The current segment's ledger of standing fills (the shared
   * restoreStandingFills), declared only in a segment that fills something —
   * replay keeps exactly this list per replayed skill. `standingUsed` says a
   * line named it.
   */
  standing?: string;
  standingUsed?: boolean;
  /** The step-scoped variable holding this goto's navigation target (retargetNavigation). */
  navTarget?: string;
  /** Segments emitted so far in this body, so each ledger names its own local. */
  segments?: number;
  /**
   * The derived slots minted by segments of this body that have ALREADY been
   * emitted — what an earlier segment of the chain threaded forward.
   *
   * `p` is one object per flow STEP, not per segment (see `slotsOf`), and
   * `bindPart` writes into it; the daemon threads the same values the same way
   * (`{ ...match.params, ...derived }`, src/daemon/server.ts). So a `{{dN}}`
   * minted in segment 1 is still on `p` when segment 6 acts on it, and the
   * compile-time fillability check has to read the whole chain rather than one
   * segment — fwod57's s_4990f3, segment 6 of 6, whose goto acts on d2/d4/d5/d6
   * minted by the segments ahead of it, was refused a compiled arm on a flow
   * whose zero-model replays scored 6/6.
   *
   * Only segments already emitted are in it: a slot a LATER segment mints is
   * still unfillable here, exactly as a slot a later step of this segment
   * mints is (bindPart runs after its own step's action).
   */
  minted?: Set<string>;
  /** Frame roots emitted so far, so each resolution in a frame names its own local. */
  roots?: number;
  /**
   * The step-scoped variable holding what a recorded page effect armed before
   * the action (armPageEffect), when the step emitting carries one.
   */
  landing?: string;
  /**
   * The step-scoped variable holding the action's observation (beginAction),
   * when the step emitting is a state-changing action.
   */
  obs?: string;
}

const src = (text: string) => stringSource(text, { slot: slotAsParam });
const match = (text: string) => matcherSource(text, { slot: slotAsParam });

/**
 * A value an ACTION dispatches with, as source: `src`, with every
 * `{{env:NAME}}` secret read from the environment at run time — the twin of
 * tools.ts, which resolves the same markers in a dispatched tool's args and
 * only there. The file names the variable, never the value; a missing one is
 * refused up front by validateInputs (requiredEnvNames). Everything that is
 * not dispatched (expectations, echo notes, messages) keeps `src` and the
 * marker, as replay keeps it.
 */
/**
 * Whether the flow being emitted names a `{{totp:NAME}}` anywhere. A flow
 * step's param bound to one reaches an action through a slot, which the
 * recorded text cannot show, so then every slotted dispatched value is passed
 * through the shared totpMarkersIn at run time. Set per emitFlowFile call.
 */
let flowNamesTotp = false;

const actSrc = (text: string): string => {
  const expr = actExpr(text);
  return flowNamesTotp && /\{\{[vd]\d+\}\}/.test(text) ? `(await totpMarkersIn(${expr}))` : expr;
};

const actExpr = (text: string): string => {
  if (!text.includes('{{env:') && !text.includes('{{totp:')) return src(text);
  // A `{{totp:NAME}}` is the code current when the action runs, computed
  // there by the shared totpCode from the seed in the environment — the
  // file carries neither the seed nor a code (execution/totp.ts).
  const parts = text.split(/\{\{(env|totp):(\w+)\}\}/);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) out.push(src(parts[i]));
    if (i + 2 >= parts.length) break;
    const name = parts[i + 2];
    out.push(parts[i + 1] === 'totp' ? `(await totpCode(process.env[${q(name)}], ${q(name)}))` : `(process.env[${q(name)}] ?? '')`);
  }
  return out.join(' + ') || q('');
};

/**
 * The recorded page changes a step is judged by, after the compile-time
 * filter both runners apply (TRANSIENT_LINE); empty when the step has none
 * or is a read (replay's expectedChanges runs on reads too, but the compiler
 * never attaches an expectation to one — the exclusion is moot and kept).
 */
function recordedChanges(step: SkillStep): string[] {
  if (isReadAction(step.tool)) return [];
  return (step.expect?.addedContains ?? []).filter((l) => !TRANSIENT_LINE.test(l));
}

/**
 * The `ResolvePolicy` for one chain, as source — the same inputs replay's
 * runOneStep builds for `resolveChain`, derived at compile time:
 *
 *  - `allowMultiple` wherever the DISPATCH may match several (the shared
 *    spansEveryMatch / dispatchesFirstMatch): `read_all` and a count read or
 *    wait read across every match, and every other wait acts on the first of
 *    them — a chain that still matches several visible elements has not met
 *    "hidden", and one that matches three panel headings has not failed
 *    `wait_for h2 state:visible` (grafana fwgr43). Replay's own rule,
 *    runOneStep;
 *  - `ambiguousNth`: the loop cursor, inside a folded loop's body — the
 *    policy narrows an ambiguous candidate to it only when it matched
 *    several, exactly as replay does, never an unconditional `.nth()`;
 *  - `requireIdentity`: replay's identityOfPrimary — `identityValues` over the
 *    UNFILLED name/text/label/hasText fields of the WHOLE chain, with the
 *    run's own values for the segment's KNOWN slots. Rendered as the call
 *    itself over `p.vN` references, so the run's real value guards the run,
 *    and the ≥3-character rule and dedupe are applied by the shared function
 *    at run time as they are in the daemon. Omitted when no known slot names
 *    the target (the daemon passes an empty list; same thing);
 *  - `stayOnOrigin`: the recorded url pattern's origin when it has a concrete
 *    one, else the live page's — `originOf`, the daemon's own rule;
 *  - `waitMs`: the shared RESOLVE_WAIT_MS, or 0 where nothing resolving is
 *    the condition (an absence wait).
 */
function policySource(chain: LocatorCandidate[], step: SkillStep, ctx: Ctx, o: { allowMultiple?: boolean; waitMs: 'RESOLVE_WAIT_MS' | '0' }): string {
  const parts: string[] = [];
  if (o.allowMultiple) parts.push('allowMultiple: true');
  if (ctx.loopCursor) parts.push(`ambiguousNth: ${ctx.loopCursor}`);
  const identity = identitySource(chain, ctx);
  if (identity) parts.push(`requireIdentity: ${identity}`);
  parts.push(`stayOnOrigin: ${originSource(step)}`);
  parts.push(`waitMs: ${o.waitMs}`);
  return `{ ${parts.join(', ')} }`;
}

/** The `identityValues(…)` call for a chain, or null when no known slot names its target. */
function identitySource(chain: LocatorCandidate[], ctx: Ctx): string | null {
  const fields = chain.flatMap((c) => identityFields(c as { name?: string; text?: string; label?: string; hasText?: string }));
  const slotsOf = (field: string) => [...field.matchAll(/\{\{(v\d+)\}\}/g)].map((m) => m[1]).filter((s) => ctx.known.has(s));
  const named = fields.filter((f) => slotsOf(f).length);
  const slots = [...new Set(named.flatMap(slotsOf))];
  if (!slots.length) return null;
  for (const slot of slots) ctx.slots.add(slot);
  return `identityValues({ ${slots.map((s) => `${s}: p.${s}`).join(', ')} }, [${named.map(q).join(', ')}])`;
}

/** Where the step stays: the recorded pattern's concrete origin, else the live page's, as replay derives it. */
function originSource(step: SkillStep): string {
  const pattern = step.expect?.urlPattern;
  const recorded = pattern ? originOf(pattern) : null;
  if (recorded && !recorded.includes('{')) return q(recorded);
  return 'originOf(page.url()) ?? undefined';
}

/**
 * The step's recorded page changes, checked by the shared verdict — the
 * `expectedChanges` gate itself (src/execution/expect.ts), embedded — over the
 * same observation the daemon makes: the lines this step added, and the live
 * page in the snapshot dialect. The recorded lines go in as recorded, markers
 * intact; the verdict masks and fills them from `p` at run time exactly as
 * replay does, and reads the WHOLE line — a slot in the value after the colon
 * is checked, where the locator union this replaced only ever found the name.
 *
 * `linesBefore` is the pre-action capture emitSkillStep takes in `prepare`.
 * A recorded dialog that did not open comes back as `absentDialog`, which the
 * body remembers for the steps that were going to act inside it.
 */
function expectationLines(step: SkillStep, ctx: Ctx, out: string[], linesBefore: string): string | null {
  const recorded = recordedChanges(step);
  if (!recorded.length) return null;
  noteSlots(recorded, ctx);
  const where = `${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex}`;
  const value = typeof step.args?.value === 'string' ? `, value: ${src(step.args.value)}` : '';
  // Positional resolution is what the step's resolution REPORTED, at run
  // time (replay's own per-step flag), not a compile-time guess over the chain.
  const call =
    `await expectChanges(page, [${recorded.map(q).join(', ')}], p, ` +
    `{ tag: ${q(where)}, tool: ${q(step.tool)}${value}, positionalResolution: ${ctx.positional ?? 'false'} }, ${linesBefore}${dialectArg(step)})`;
  out.push("// The step's recorded page changes, judged by the daemon's own effect gate (see expectChanges):");
  for (const line of recorded) out.push(`//   ${commentSafe(line)}`);
  // Only a plain `- dialog "…"` line can leave a dialog absent (the verdict's
  // own rule, DIALOG_LINE); a body with no such step never carries the state.
  // The verdict is kept: its `confirmed` is what the alert gate after it reads.
  const verdict = `changes${ctx.urls}`;
  out.push(`const ${verdict} = ${call};`);
  if (recorded.some((l) => !SLOT_LINE.test(l) && DIALOG_LINE.test(l))) {
    ctx.dialogAbsence = true;
    out.push(`absentDialog = ${verdict}.absentDialog ?? null;`);
  }
  return verdict;
}

/**
 * The url half of a step's expectation: the shared verdict over the recorded
 * pattern, markers intact, filled from this run's `p` exactly as replay fills
 * it (urlEffect -> urlEffectVerdict, src/execution/gates.ts). One form for
 * every pattern shape — a path, a hash route, a query-shaped hash that is
 * unordered STATE — because the shared urlMatches already knows them all; a
 * regex built here was a second implementation, and it disagreed (decoding,
 * trailing slashes, an unbound `{{dN}}`, the soft match it had no notion of).
 * The alert half is a lifecycle observation (before/after), emitted by
 * emitSkillStep.
 */
function effectLines(step: SkillStep, ctx: Ctx, out: string[], observed?: string): void {
  const pattern = step.expect?.urlPattern;
  if (!pattern) return;
  noteSlots(pattern, ctx);
  ctx.volatileUsed = true;
  // The link the step's click reported (robustClick), as replay's url gate
  // reads it off the executor's StepRun; no other tool reports one.
  const link = observed && (step.tool === 'click' || step.tool === 'dblclick') ? `, ${observed}?.link()` : '';
  out.push(`await urlEffect(page, ${q(pattern)}, p, ${q(`${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex}`)}, ${ctx.volatile}${link});`);
}

/**
 * The trailing dialect argument for a step's page observations: `, 2` when its
 * recorded lines are in dialect 2 (StepExpectation.lineDialect), nothing for
 * dialect 1 — the helpers default to it, so a file compiled from a store
 * written before dialects reads exactly as it did.
 */
function dialectArg(step: SkillStep): string {
  return step.expect?.lineDialect === 2 ? ', 2' : '';
}

/** Collect the slots a piece of recorded text needs from `p`. */
function noteSlots(value: unknown, ctx: Ctx): void {
  if (typeof value === 'string') {
    for (const m of value.matchAll(/\{\{([vd]\d+)\}\}/g)) ctx.slots.add(m[1]);
    return;
  }
  if (Array.isArray(value)) for (const v of value) noteSlots(v, ctx);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) noteSlots(v, ctx);
}

/**
 * Wraps the ACTION a click step emitted — everything from `actionAt` on — in
 * the already-in-effect guard, or leaves it alone when the recorded effect
 * opens no popup.
 *
 * WHICH REPLAY RULE THIS MIRRORS. runOneStep, after it has resolved the
 * target and before it acts: a click that OPENS a popup is a TOGGLE, so
 * re-clicking it while the popup is showing closes the very thing the next
 * step depends on — and the click that ought to be a no-op is instead
 * intercepted by the modal overlay it raised, which on kanboard meant 60s of
 * Playwright waiting for an `#modal-overlay` to stop eating pointer events.
 * Replay skips such a click ("already in effect"); the spec asks the same
 * question of the same recorded lines. The pick stays OUTSIDE the guard, as
 * replay's resolution stays ahead of its check: a target that no longer
 * resolves is a stop in both runners, and a guard that swallowed the miss
 * would report skipped-and-green where the daemon reports a stop.
 */
function wrapAlreadyInEffect(step: SkillStep, ctx: Ctx, out: string[], actionAt: number): void {
  const opener = openerExpectations(step);
  if (!opener.length) {
    wrapToggle(step, ctx, out, actionAt);
    return;
  }
  noteSlots(opener, ctx);
  const where = `${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex}`;
  const acted = out
    .splice(actionAt)
    .flatMap((l) => l.split('\n'))
    .map((l) => (l ? '  ' + l : l));
  out.push(
    "// This click OPENS a popup, which makes it a toggle: replay skips it when the",
    '// recorded effect is already showing (runOneStep, "skipped (already in effect)"),',
    '// because clicking again would close what the next step needs. Same rule here,',
    '// asked AFTER the target resolved (as replay orders it) of the same recorded',
    '// lines in the same snapshot dialect (presentOnPage, the shared',
    '// src/execution/snapshot.ts — whole lines, so a `button "6"` never matches a',
    '// button called "17.6"):',
    ...opener.map((l) => `//   ${commentSafe(l)}`),
    `if (await presentOnPage(page, liveLines([${opener.map(q).join(', ')}], p)${step.expect?.lineDialect === 2 ? ', {}, 2' : ''})) {`,
    '  // already in effect: the popup is on the page, so the recorded click has nothing left to do.',
    // A skipped click is invisible in a passing-until-it-isn't spec, and a
    // guard that fires for the WRONG reason (one of these lines is on the page
    // for some other reason than "the popup is open") silently drops the step
    // that everything after it depends on. One line on stdout is what makes
    // that legible in a bench log.
    `  console.log(${q(`[sitelooper skip] ${where}: recorded popup already showing — click skipped`)});`,
    "  return { status: 'skipped' };",
    '} else {',
    ...acted,
    '}',
  );
}

/**
 * The disclosure toggle's twin of the guard above: replay's runStepBody skips
 * a click compiled from a hide-then-show pair (SkillStep.toggle, fwsi1
 * 05-change) when EVERY line it is recorded adding already shows — the shared
 * toggleAlreadyShown over the shared toggleEffectLines, asked after the
 * target resolved, as replay asks it.
 */
function wrapToggle(step: SkillStep, ctx: Ctx, out: string[], actionAt: number): void {
  const lines = step.tool === 'click' && step.toggle ? toggleEffectLines(step.expect?.addedContains) : [];
  if (!lines.length) {
    wrapHide(step, ctx, out, actionAt);
    return;
  }
  noteSlots(lines, ctx);
  const where = `${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex}`;
  const acted = out
    .splice(actionAt)
    .flatMap((l) => l.split('\n'))
    .map((l) => (l ? '  ' + l : l));
  out.push(
    '// A disclosure toggle: the recording hid this panel and showed it again, compiled to',
    '// the one click that leaves it shown. Clicking it while it shows would hide it, so it',
    '// is skipped when every line it adds is already on the page (as replay skips it):',
    ...lines.map((l) => `//   ${commentSafe(l)}`),
    `if (await toggleAlreadyShown(page, [${lines.map(q).join(', ')}], p${step.expect?.lineDialect === 2 ? ', 2' : ''})) {`,
    `  console.log(${q(`[sitelooper skip] ${where}: toggled panel already showing — click skipped`)});`,
    "  return { status: 'skipped' };",
    '} else {',
    ...acted,
    '}',
  );
}

/**
 * The HIDE's twin of the guard above: replay's runStepBody skips a click whose
 * whole recorded effect was taking lines off the page (vikunja fwvk8-n1
 * 02-create's FILTERS click) when a look that covered the page shows none of
 * them — the shared hideAlreadyInEffect over the shared hideEffectLines,
 * asked after the target resolved, as replay asks it.
 */
function wrapHide(step: SkillStep, ctx: Ctx, out: string[], actionAt: number): void {
  const lines = hideEffectLines(step);
  if (!lines.length) return;
  noteSlots(lines, ctx);
  const where = `${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex}`;
  const acted = out
    .splice(actionAt)
    .flatMap((l) => l.split('\n'))
    .map((l) => (l ? '  ' + l : l));
  out.push(
    '// A hide: the recording\'s click took these lines off the page, and did nothing else.',
    '// When none of them is on the page it is already in effect (as replay skips it):',
    ...lines.map((l) => `//   ${commentSafe(l)}`),
    `const hide${ctx.urls} = await hideBefore(page, [${lines.map(q).join(', ')}], ${Boolean(step.expect?.removalRequired)}, p, ${q(where)}${step.expect?.lineDialect === 2 ? ', 2' : ''});`,
    `if (hide${ctx.urls}.stop) throw new Error(hide${ctx.urls}.stop);`,
    `if (hide${ctx.urls}.skip) {`,
    `  console.log(${q(`[sitelooper skip] ${where}: what this click removes is not on the page — click skipped`)});`,
    "  return { status: 'skipped' };",
    '} else {',
    ...acted,
    '}',
  );
}

/**
 * The resolution one call site resolves through: the chain's observations in
 * stored order (see locators.ts `observationSource`), then `], where, policy`
 * and the presentation options. Shared by every place a chain is resolved —
 * an action, a read, an absence wait — so they cannot disagree about what an
 * observation is.
 */
function resolutionLines(
  chain: LocatorCandidate[],
  step: SkillStep,
  key: 'target' | 'source',
  ctx: Ctx,
  o: { allowMultiple?: boolean; waitMs: 'RESOLVE_WAIT_MS' | '0' },
  /** The expression the candidates are built from: `page`, or the recorded frame's root local. */
  root = 'page',
): { open: string[]; where: string; policy: string; opts: string } {
  noteSlots(chain, ctx);
  const where = q(`${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex} ${key}`);
  const open = observationSources(chain, { slot: slotAsParam, page: root }).map((source) => `${CONT_INDENT}${source},`);
  // Drift belongs to this invocation. `DRIFT` remains only as a compatibility
  // view of the last completed run; helpers write into the run passed through
  // the step instead of accumulating process-wide state. In a loop body, what
  // the target resolved to is sunk for the progress guard (replay's sink).
  const resolved = ctx.loopSink ? `, resolved: { into: ${ctx.loopSink}.entries, key: ${q(key)}, check: ${ctx.loopSink}.check }` : '';
  return { open, where, policy: policySource(chain, step, ctx, o), opts: `{ drift: run.drift${resolved} }` };
}

/**
 * The expression an action acts on, emitting the resolution above it.
 *
 * EVERY chain goes through the shared policy — a single candidate too:
 * Playwright's strict mode ("exactly one, or throw") is not the daemon's rule
 * (identity, plausibility, origin, the wait), and the loop's progress guard
 * needs what the target resolved to whatever the chain's length. Returns null
 * when the recording has no candidate at all — the caller then emits a TODO
 * rather than a statement it cannot target.
 */
/**
 * The already-in-effect guard for a dismissal (dismissalSkip, over the shared
 * dismissalAlreadyInEffect): nothing for a step that recorded closing no
 * dialog, a read, a minting step, or one inside a loop body or a frame (the
 * caller checks those two) — replay's own exclusions.
 */
function dismissalLines(step: SkillStep, chain: LocatorCandidate[], ctx: Ctx): string[] {
  const removed = step.expect?.removedContains;
  if (!removed?.some((l) => DIALOG_LINE.test(l)) || step.mints || isReadAction(step.tool)) return [];
  const { sources } = candidateSources(chain, { slot: slotAsParam });
  if (!sources.length) return [];
  const locators = Object.fromEntries(
    Object.entries(step.locators ?? {}).map(([key, cands]) => [
      key,
      (cands ?? []).map((c) => {
        const { kind, name, text, label, hasText } = c as { kind: string; name?: string; text?: string; label?: string; hasText?: string };
        return { kind, ...(name !== undefined && { name }), ...(text !== undefined && { text }), ...(label !== undefined && { label }), ...(hasText !== undefined && { hasText }) };
      }),
    ]),
  );
  noteSlots(locators, ctx);
  noteSlots(removed, ctx);
  const where = `${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex}`;
  const guard = JSON.stringify({ locators, expect: { removedContains: removed } });
  return [
    `if (await dismissalSkip(page, [${sources.join(', ')}], ${guard}, p, ${q(where)}${step.expect?.lineDialect === 2 ? ', 2' : ''})) return { status: 'skipped' };`,
  ];
}

function actionTarget(step: SkillStep, key: 'target' | 'source', ctx: Ctx, out: string[], hoist?: string): string | null {
  const chain = step.locators?.[key] ?? [];
  if (!chain.length) return null;
  const root = frameRootLines(step, key, ctx, out);
  const name = `hit${++ctx.picks}`;
  // The same rule replay applies at its own allowMultiple: a step whose
  // dispatch spans every match, or acts on the first of them, has not failed
  // to name its element by matching two. Without it the artifact held
  // fwgr43's `wait_for h2 state:visible` to exactly one element and failed
  // 0/6 on a page that showed three panels — while the wait it was about to
  // run looks only at the first.
  const args = step.args ?? {};
  // Replay's own expression (runOneStep): inside a folded loop the cursor is
  // what names this pass's record, so a wait that could be narrowed to it is
  // not widened back to match 0; a step that spans every match is plural
  // whatever the cursor says. (An absence wait never reaches here.)
  const allowMultiple =
    key === 'target' && (spansEveryMatch(step.tool, args) || (dispatchesFirstMatch(step.tool, args) && !ctx.loopCursor));
  warnUnprovenTarget(step, key, chain, ctx);
  const { open, where, policy, opts } = resolutionLines(chain, step, key, ctx, { ...(allowMultiple ? { allowMultiple } : {}), waitMs: 'RESOLVE_WAIT_MS' }, root);
  // `hoist` names the observations as a local, for a step that consults them
  // again after acting (a text wait's held-elsewhere fallback).
  const candidates = hoist ? hoist : null;
  if (hoist) out.push(`const ${hoist}: CandidateObservation[] = [`, ...open, '];');
  const list = (head: string) => (candidates ? [`${head}${candidates}, ${where}, `] : [`${head}[`, ...open, `], ${where}, `]);
  const note = ctx.note ? `, ${q(ctx.note)}` : '';
  if (key === 'target' && root === 'page' && !ctx.loopSink) out.push(...dismissalLines(step, chain, ctx));
  const destPattern = step.expect?.urlPattern;
  if (key === 'target' && destPattern && (step.tool === 'click' || step.tool === 'dblclick') && !ctx.loopSink) {
    // Replay's navigation fallback (the shared recover.ts): a missed
    // navigation click whose recorded destination the browser is not on
    // reaches it by another link to it, else directly — then the step is
    // done, and its gates are not asked, as replay returns before them.
    noteSlots(destPattern, ctx);
    const head = list(`const ${name} = await pickOrNavigate(page, `);
    head[head.length - 1] += `${policy}, ${q(destPattern)}, p, ${opts}${note});`;
    out.push(...head, `if (!${name}) return { status: 'skipped' };`);
  } else {
    const head = list(`const ${name} = await pick(page, `);
    head[head.length - 1] += `${policy}, ${opts}${note});`;
    out.push(...head);
  }
  // Replay's per-step flag: a resolution through a positional candidate, or
  // one narrowed to the loop cursor (an index into several matches), is what
  // the effect gate must corroborate with a consequential change.
  if (ctx.positional) out.push(`${ctx.positional} = ${ctx.positional} || ${name}.structural || ${name}.nth !== undefined;`);
  // A resolved target is known by its candidates' names — the name of a
  // clicked option is the value it selects (replay notes them here too).
  if (setsSomething(step.tool)) {
    out.push(...echoNoteLines(chain.map((c) => (c as { name?: unknown; label?: unknown }).name ?? (c as { name?: unknown; label?: unknown }).label), ctx));
  }
  return `${name}.locator`;
}

/**
 * A step that ACTS ON ONE element (dispatchesFirstMatch) whose whole chain is
 * one unindexed PRIMARY was never proved to identify one element.
 *
 * The recorder derives a chain — testid, role+name, anchored path, point —
 * from the element it saw; what it hands back instead is the agent's own raw
 * selector alone, as the `css`/`text` candidate `primaryFor` builds, when it
 * could derive nothing (it used to bail on an ambiguous selector; it still
 * does for a target that matches nothing). grafana fwgr43 stored exactly that
 * for `wait_for h2 state:visible`, and the shape is invisible in the
 * artifact: a locator that looked fine on the recording machine and names
 * three panel headings on the next page load.
 *
 * Only these steps, because only their ambiguity is SILENT: a click hands its
 * locator to Playwright, whose strict mode says so out loud, while a wait
 * takes match 0 and reports success. A step that spans every match (read_all,
 * a count) makes no claim about one element at all.
 *
 * A warning, not a blocker: the artifact still runs, and the run it warns
 * about may well pass.
 */
function warnUnprovenTarget(step: SkillStep, key: 'target' | 'source', chain: readonly LocatorCandidate[], ctx: Ctx): void {
  if (key !== 'target' || !dispatchesFirstMatch(step.tool, step.args ?? {})) return;
  const only = chain.length === 1 ? chain[0] : undefined;
  if (!only || only.nth !== undefined || (only.kind !== 'css' && only.kind !== 'text')) return;
  ctx.warnings.push(
    `${ctx.stepId}: step ${ctx.stepIndex} (${step.tool} ${String((step.args ?? {}).state ?? '')}) acts on one element through a single unindexed candidate, ` +
      `${candidateExpr(only)} — never proved to identify one element on the page that produced it, so this run acts on whatever it matches first; ` +
      `re-record the step (sitelooper rerecord) to derive a full chain for it`,
  );
}

/**
 * The root a target's chain resolves against, emitting its lookup: `page` for
 * a target of the main frame, else a local holding the recorded frame
 * (frameRoot, over the shared rootFor), which throws when the frame is not
 * there — replay's stop, never a search of the page.
 */
function frameRootLines(step: SkillStep, key: 'target' | 'source', ctx: Ctx, out: string[]): string {
  const frame = step.contexts?.[key]?.frame;
  if (!frame?.length) return 'page';
  const root = `root${(ctx.roots = (ctx.roots ?? 0) + 1)}`;
  out.push(
    `// The recorded ${key} lives inside ${commentSafe(describeFramePath(frame))}; its chain is resolved there and nowhere else.`,
    `const ${root} = await frameRoot(page, ${JSON.stringify(frame)}, ${q(`${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex} ${key}`)});`,
  );
  return root;
}

/**
 * What a step put on the page, into the segment's echo ledger — replay's
 * `interacted` set, through the shared noteInteraction (src/execution/echo.ts),
 * which applies the length floor at run time to the FILLED text.
 */
function echoNoteLines(texts: unknown[], ctx: Ctx): string[] {
  const strings = texts.filter((t): t is string => typeof t === 'string' && t.length > 0);
  if (!strings.length || !ctx.echoes) return [];
  noteSlots(strings, ctx);
  ctx.echoUsed = true;
  return [`noteInteraction(${ctx.echoes}, [${strings.map(src).join(', ')}]);`];
}

/**
 * A published read asked whether it merely echoes what this segment set —
 * replay's echoedValues. The value is still published (as replay still
 * carries it); the label goes into `run.echoed` with one warning line.
 */
function echoReadLines(step: SkillStep, ctx: Ctx): string[] {
  if (!ctx.echoes || !step.label) return [];
  ctx.echoUsed = true;
  const key = `${ctx.stepId}.${step.label}`;
  return [`echoRead(${ctx.echoes}, run, ${q(step.label)}, ${q(key)}, outputs[${q(key)}], ${q(`${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex}`)});`];
}

/** The names this step mints, in the order the segment declares them. */
function derivedHere(segment: SpecSegment, index: number): [string, { at: string; example: string }][] {
  return Object.entries(segment.derived ?? {}).filter(([, d]) => d.step === index) as [string, { at: string; example: string }][];
}

/**
 * `p.dN = …` for every value this step mints, bound before the assertions
 * read it.
 *
 * `settled` says the url is already the one the step navigated to — true
 * after a `goto`, which awaits its own navigation. Anywhere else the action
 * only STARTS the navigation, so the part has to be read the way replay reads
 * it: after the url changed and the page stopped moving (see `urlPartWhen`).
 * Read in the same tick instead, every part comes back empty and the
 * `toHaveURL` built from them can never match — which is what odoo's
 * `#action=&cids=&menu_id=` did on the first cloud run.
 */
function derivedLines(segment: SpecSegment, index: number, ctx: Ctx, out: string[], urlBefore = '', gotoFrom?: string): void {
  const here = derivedHere(segment, index);
  for (const [name] of here) ctx.slots.add(name);
  if (!here.length) return;
  const example = (d: { example: string }) => `// recorded example: ${commentSafe(d.example)}`;
  // A goto's landing may redirect AGAIN on its own (a timer, a client-side
  // route): bound at once, the value is whichever url the race left, and the
  // next navigation can be cancelled by the redirect still pending. So the
  // url is followed until it holds still first — the shared urlHeldStill,
  // as replay waits (skills/replay.ts bind).
  if (gotoFrom) out.push(`await urlHeldStill(page, ${gotoFrom}, () => inFlightRequests(page));`);
  // A part the url does not carry is NOT bound — replay's `if (v !== undefined)
  // params[name] = v` — so a later url check reads the unbound `{{dN}}` as the
  // wildcard it is to urlDiff, rather than requiring an empty segment.
  if (!urlBefore) {
    for (const [name, d] of here) out.push(`bindPart(p, ${q(name)}, urlPart(page.url(), ${q(d.at)})); ${example(d)}`);
    return;
  }
  if (here.length === 1) {
    out.push(`bindPart(p, ${q(here[0][0])}, await urlPartWhen(page, ${q(here[0][1].at)}, ${urlBefore})); ${example(here[0][1])}`);
    return;
  }
  // ONE wait for ALL of them: a part bound the instant IT is non-empty can be
  // read off a half-built url while its neighbour is still missing, and the
  // pattern the three of them go into is then unmatchable by construction.
  const name = `bound${++ctx.binds}`;
  out.push(`const ${name} = await urlPartsWhen(page, [${here.map(([, d]) => q(d.at)).join(', ')}], ${urlBefore});`);
  here.forEach(([slot, d], i) => out.push(`bindPart(p, ${q(slot)}, ${name}[${i}]); ${example(d)}`));
}

/**
 * The recorded popup lines that make a click a TOGGLE, or empty.
 *
 * Mirrors replay's `openerLines`: only the plain (unparameterised, non
 * transient) effects count, and they count only when at least one of them
 * names a popup — a dialog, menu, listbox or tooltip is the thing a second
 * click closes again, where another row of textboxes is an effect worth
 * re-producing. `click` only, as replay has it: a toggle is a single click's
 * shape (a menu button, a dropdown), and every bench case behind the rule was
 * one. A `dblclick` that opens something (a row opening its editor) is not
 * undone by a second dblclick, and the artifact used to skip it where replay
 * ran it — gap 17. Now neither skips it.
 */
function openerExpectations(step: SkillStep): string[] {
  if (step.tool !== 'click') return [];
  const lines = (step.expect?.addedContains ?? []).filter((l) => !TRANSIENT_LINE.test(l) && !SLOT_LINE.test(l));
  // Only the popup lines decide, as replay's openerLines: the other effects
  // a dialog-opening click recorded (the row it was about to fill, the
  // combobox it typed into) were on the page BEFORE the click too, and an
  // any-of guard over them skipped fwod34's product-option click on every
  // run, so the configurator dialog its next step confirms never opened.
  return lines.filter((l) => OPENER_LINE.test(l));
}

/**
 * One recorded step as source. `first` marks a loop body, where every target
 * is taken at its first match (see emitLoop).
 */
/** Every `{{vN}}`/`{{dN}}` slot a value names, anywhere inside it. */
function slotsNamed(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    for (const m of value.matchAll(/\{\{([vd]\d+)\}\}/g)) out.add(m[1]);
    return out;
  }
  if (Array.isArray(value)) for (const v of value) slotsNamed(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value as Record<string, unknown>)) slotsNamed(v, out);
  return out;
}

/**
 * Whether the artifact can have put a value in `slot` by the time step `index`
 * of `segment` acts. Three ways, and they are the only three:
 *  - it is one of the segment's caller params (which `callArgs` always passes,
 *    even as a blank);
 *  - an EARLIER STEP of this segment mints it (`bindPart` runs after its own
 *    step's action, so a step cannot consume what it mints);
 *  - an EARLIER SEGMENT of this chain minted it and threaded it forward
 *    (`minted`). A procedure's segments share one `p` (slotsOf), and the
 *    daemon shares the same values the same way; reading only the segment in
 *    hand refused fwod57's sixth-of-six segment for d2/d4/d5/d6 that its first
 *    five had already bound — a flow whose zero-model replays were 6/6.
 *
 * A LATER segment's mint is not in `minted`, so it still refuses: the ordering
 * guarantee is the whole point of the check.
 */
function fillableSlot(slot: string, segment: SpecSegment, index: number, minted: ReadonlySet<string>): boolean {
  if (slot in segment.params) return true;
  if (minted.has(slot)) return true;
  const derived = segment.derived?.[slot];
  return Boolean(derived && derived.step < index);
}

/** A recorded chain less the rungs the artifact could not fill — the shared fillableChain's compile-time twin. */
function fillableRungs(chain: readonly unknown[] | undefined, segment: SpecSegment, index: number, minted: ReadonlySet<string>): unknown[] {
  return (chain ?? []).filter((rung) => [...slotsNamed(rung)].every((slot) => fillableSlot(slot, segment, index, minted)));
}

/**
 * Why a step that ACTS cannot be compiled, or null when nothing stops it —
 * the compile-time reading of the shared `unfilledStepVerdict`, split the same
 * way:
 *  - its ARGS carry the value it acts WITH. A slot nothing can fill is fatal:
 *    there is no second choice, and the artifact would type the literal
 *    `{{v2}}` into a live field or navigate to it.
 *  - a LOCATOR CHAIN is how it names WHAT to act on, best first. A rung naming
 *    an unfillable slot — odoo fwod34's `#name_{{d2}}`, where d2 is a
 *    url-pattern wildcard and never a value — is an exhausted preference: it
 *    is dropped from the emitted chain and the `role`/`placeholder` rungs
 *    behind it take the step, exactly as they were recorded to. Only a chain
 *    with no rung left is fatal, and then because the step has no way to find
 *    its target, not because a marker survived.
 *
 * Daemon replay meets the same condition at run time and hands the step to the
 * model; a compiled artifact has no model to hand it to, so it refuses here,
 * where there is still somebody to tell — the trade the artifact already makes
 * for an unsourced ref.
 *
 * Only steps that act: a read, a wait or a check carrying an unfilled marker
 * keeps the "asks for no particular value" reading every marker gate takes.
 */
function unfillableStep(step: SkillStep, segment: SpecSegment, index: number, minted: ReadonlySet<string>): { where: string; slots: string[] } | null {
  if (!isMutatingAction(step.tool) && step.tool !== 'goto') return null;
  const dead = (value: unknown): string[] => [...slotsNamed(value)].filter((slot) => !fillableSlot(slot, segment, index, minted));
  const inArgs = dead(step.args);
  if (inArgs.length) return { where: 'args', slots: inArgs };
  for (const [key, chain] of Object.entries(step.locators ?? {})) {
    if (!chain?.length || fillableRungs(chain, segment, index, minted).length) continue;
    return { where: key, slots: dead(chain) };
  }
  return null;
}

/**
 * The step as the artifact should carry it: every locator rung the artifact
 * could never fill dropped, so the emitted chain holds only rungs that can
 * match. Acting steps only — a read or a wait keeps its chain as recorded,
 * where an unfillable rung costs a resolve attempt and nothing else.
 */
function withLiveRungs(step: SkillStep, segment: SpecSegment, index: number, minted: ReadonlySet<string>): SkillStep {
  if (!isMutatingAction(step.tool) && step.tool !== 'goto') return step;
  let changed = false;
  const locators: Record<string, unknown[]> = {};
  for (const [key, chain] of Object.entries(step.locators ?? {})) {
    const live = fillableRungs(chain, segment, index, minted);
    if (live.length !== (chain ?? []).length) changed = true;
    locators[key] = live;
  }
  return changed ? ({ ...step, locators } as unknown as SkillStep) : step;
}

function emitSkillStep(recorded: SkillStep, segment: SpecSegment, index: number, ctx: Ctx, first = false): string[] {
  ctx.segmentId = segment.id;
  ctx.stepIndex = index;
  const minted: ReadonlySet<string> = ctx.minted ?? new Set<string>();
  const unfillable = unfillableStep(recorded, segment, index, minted);
  if (unfillable) {
    const named = unfillable.slots.map((s) => `{{${s}}}`).join(', ');
    const one = unfillable.slots.length === 1;
    const inArgs = unfillable.where === 'args';
    ctx.diagnostics.push({
      code: 'unfilled-slot',
      step: ctx.stepId,
      what: inArgs
        ? `${segment.id} step ${index} (${recorded.tool}) acts on ${named}, and nothing can fill ${one ? 'it' : 'them'} by the time it acts`
        : `${segment.id} step ${index} (${recorded.tool}) has no locator left for its ${unfillable.where}: every recorded one names ${named}, which nothing can fill`,
      why: inArgs
        ? `${named} ${one ? 'is not a caller parameter' : 'are not caller parameters'} of ${segment.id}, and nothing that runs before step ${index} mints ${one ? 'it' : 'them'} — ` +
          `neither a segment of this procedure ahead of ${segment.id} nor a step of ${segment.id} before step ${index} — so the artifact has no value to substitute. ` +
          `fillParams leaves an unfilled marker standing, which is the right reading for a CHECK ("asks for no particular value") and the wrong one for the value an action carries: ` +
          `this step would ${recorded.tool === 'goto' ? 'navigate to a url still spelling' : recorded.tool + ' '}the literal text ${named}. ` +
          `Daemon replay meets the same condition at run time and hands the step to the model; a compiled artifact has no model to hand it to.`
        : `A locator chain is a preference order, and a rung naming a slot nothing can fill is dropped rather than tried. Every recorded rung for ${unfillable.where} names ${named}, ` +
          `so the step has no way left to name the element it acts on. Daemon replay drops the same rungs and falls back to the model only when none survive.`,
      fix: inArgs
        ? `re-record ${ctx.stepId} so ${named} is read before step ${index} (\`sitelooper rerecord <flow file> ${ctx.stepId}\`), or take ${named} out of the step's ${recorded.tool === 'goto' ? 'url' : 'text'}`
        : `re-record ${ctx.stepId} so step ${index} names its ${unfillable.where} by something this run has (\`sitelooper rerecord <flow file> ${ctx.stepId}\`)`,
      action: { command: 'rerecord', args: [ctx.stepId], step: ctx.stepId },
      severity: 'error',
    });
  }
  // Every locator rung the artifact could never fill is dropped before
  // emission: it could only ever waste a resolve attempt (see withLiveRungs).
  const step = withLiveRungs(recorded, segment, index, minted);
  const urlBefore = `urlBefore${++ctx.urls}`;
  // The page-change gate sharpens on a positional resolution, so a step that
  // carries one is given a flag its resolution reports into (see actionTarget).
  ctx.positional = recordedChanges(step).length ? `positional${ctx.urls}` : undefined;
  // A recorded popup, close or tab switch: armed in the action, just ahead of
  // its dispatch, and asked where the procedure continues once it has run.
  const effect = stepEffect(step);
  const landing = effect && effect.kind !== 'navigate' ? `landing${ctx.urls}` : undefined;
  const moved = landing ? `moved${ctx.urls}` : undefined;
  ctx.landing = landing;
  // A goto resolves its target against what this segment has learned is
  // volatile (the shared retargetNavigation), and keeps the verdict for its
  // landing check and its alert gate.
  const nav = step.tool === 'goto' && typeof step.args?.url === 'string' ? `nav${ctx.urls}` : undefined;
  ctx.navTarget = nav;
  // A state-changing action is observed from just before it dispatches to the
  // end of its settle (the shared beginAction), as tools.ts runStep observes
  // every state-changing tool replay executes.
  const obs = isMutatingAction(step.tool) ? `obs${ctx.urls}` : undefined;
  ctx.obs = obs;
  const action = emitSkillAction(step, segment, index, ctx, first);
  ctx.landing = undefined;
  ctx.obs = undefined;
  ctx.navTarget = undefined;
  const observed = obs && action.some((line) => line.includes(`${obs} = beginAction(`)) ? obs : undefined;
  if (landing && moved) {
    action.push(
      `// The recording ${effect!.kind === 'popup' ? 'opened a popup' : effect!.kind === 'close' ? 'closed this page' : `switched to tab ${(effect as { to: number }).to}`} here: the step is not done until the`,
      '// procedure is on the page it continued on (replay stops the same way when it is not).',
      `${moved} = await landed(${landing});`,
    );
  }
  // A step that resolved nothing (page-level, or refused) has nothing to report: the gate is told so outright.
  if (ctx.positional && !action.some((line) => line.includes(`${ctx.positional} = `))) ctx.positional = undefined;
  const bindings: string[] = [];
  // A goto awaits navigation; other actions may only have started it.
  derivedLines(segment, index, ctx, bindings, step.tool === 'goto' ? '' : urlBefore, step.tool === 'goto' ? urlBefore : undefined);
  if (step.mints) {
    bindings.push(`// This step creates a record; expose this run's identifier for teardown.`);
    const alreadyBound = derivedHere(segment, index).find(([, derived]) => derived.at === step.mints!.at);
    const value = alreadyBound ? `p.${alreadyBound[0]}` : `await urlPartWhen(page, ${q(step.mints.at)}, ${urlBefore})`;
    const minted = `minted${ctx.urls}`;
    bindings.push(`const ${minted} = changedCreation(urlPart(${urlBefore}, ${q(step.mints.at)}), ${value});`);
    // `<step>.minted` is the latest record (the teardown handle a single mint
    // publishes); `run.created` accumulates every distinct one, as replay's
    // `created` does — a loop body mints once per pass.
    bindings.push(`if (${minted}) {`, `  outputs[${q(`${ctx.stepId}.minted`)}] = ${minted};`, `  if (!run.created.includes(${minted})) run.created.push(${minted});`, '}');
  }
  const where = `${ctx.stepId} ${segment.id}/${index}`;
  const isRead = isReadAction(step.tool);
  // The effect gates, in the order replay's STEP_GATES runs them: error page,
  // url, page changes, alerts — the alert gate last, because an alert the
  // recording never saw only stops a step whose page changes did not confirm
  // it worked. Each is the shared verdict; see the helpers.
  const checks: string[] = [`errorPageGate(page, ${q(where)});`];
  // Replay's gotoLanding gate, second in its order: a goto that landed on another view of what it asked for.
  if (step.tool === 'goto' && typeof step.args.url === 'string') {
    noteSlots(step.args.url, ctx);
    // Judged against where the goto was actually SENT — the retargeted url
    // when this segment's volatility evidence redirected it, as replay judges
    // its own (mutated) `args.url`.
    const sent = nav ? `${nav}.url` : src(step.args.url);
    checks.push(`{ const landing = gotoLandingVerdict(${sent}, page.url(), ${q(where)}); if (landing) throw new Error(landing); }`);
  }
  effectLines(step, ctx, checks, observed);
  // A read raises no alert of its own (replay exempts it), unless the
  // recording expects one; the daemon's expectedAlert gate has no read test.
  const alerts = !isRead || step.expect?.alertContains ? `alertsBefore${ctx.urls}` : null;
  const alertsAfter = alerts ? `alertsAfter${ctx.urls}` : null;
  // The page-change gate needs the lines the page showed BEFORE the action —
  // the diff leg of its evidence — so a step that carries one captures them
  // in `prepare`, after the settle, in the same dialect it will judge by.
  const linesBefore = recordedChanges(step).length ? `linesBefore${ctx.urls}` : null;
  const changes = linesBefore ? expectationLines(step, ctx, checks, linesBefore) : null;
  // Replay's expectedRemovals gate, after the page changes and before the
  // alerts: a hide whose lines all survive the click did not have its effect.
  const hidden = hideEffectLines(step);
  if (hidden.length) {
    noteSlots(hidden, ctx);
    checks.push(
      `{ const hidden = hideVerdict([${hidden.map(q).join(', ')}], p, await captureLines(page${dialectArg(step)}), ${q(where)}); ` +
        "for (const w of hidden.warnings) console.log(`[sitelooper warn] ${w}`); if (hidden.stop) throw new Error(hidden.stop); }",
    );
  }
  if (alerts) {
    if (step.expect?.alertContains) noteSlots(step.expect.alertContains, ctx);
    const expected = step.expect?.alertContains ? `, expectedContains: ${q(step.expect.alertContains)}` : '';
    const confirmed = changes ? `, effectConfirmed: ${changes}.confirmed === true` : '';
    // A goto that was sent to a url still spelling a value this segment has
    // shown volatile tells the alert gate so: an unrecorded alert on the
    // landing is then reported as the page not existing, not as an alert out
    // of nowhere (replay passes the same `navigatedToStale`).
    const stale = nav ? `, navigatedToStale: ${nav}.stale` : '';
    checks.push(`alertGate(${alerts}, ${alertsAfter}, { where: ${q(where)}, isRead: ${isRead}${expected}, params: p${confirmed}${stale} });`);
  }
  const positional = ctx.positional;
  ctx.positional = undefined;
  // A submitting action refills what this segment filled and the page emptied
  // since, and it and every other setting action retire the ledger — asked
  // after the settle and the page check, before anything resolves, where
  // replay's runStepBody asks it (restoreStandingFills).
  const role = standingFillRole(step.tool);
  const standing = ctx.standing && (role === 'submit' || role === 'retire') ? ctx.standing : undefined;
  if (standing) ctx.standingUsed = true;
  // A submit whose url gate fails because the page replaced its document under
  // it, leaving the form it submitted empty, runs once more after a refill —
  // replay's runStepBody repeats it on the same shared standingFillsLost, and
  // only on the url gate (fwvk2 n2 01-open).
  const urlAt = standing && role === 'submit' ? checks.findIndex((line) => line.startsWith('await urlEffect(')) : -1;
  const urlFailed = urlAt >= 0 ? `urlFailed${ctx.urls}` : undefined;
  if (urlFailed) checks[urlAt] = `try { ${checks[urlAt]} } catch (err) { ${urlFailed} = true; throw err; }`;
  const indent = (lines: string[]) => lines.flatMap((line) => line.split('\n').map((part) => part ? `    ${part}` : part));
  const head = [
    `// @step ${where}`,
    `let ${urlBefore} = '';`,
    ...(alerts ? [`let ${alerts}: string[] = [];`, `let ${alertsAfter}: ObservedAlerts | null = null;`] : []),
    ...(linesBefore ? [`let ${linesBefore}: string[] | null = null;`] : []),
    ...(nav ? [`let ${nav}: NavigationTarget = { url: '' };`] : []),
    ...(positional ? [`let ${positional} = false;`] : []),
    ...(landing ? [`let ${landing}: Awaited<ReturnType<typeof armPageEffect>> | null = null;`, `let ${moved}: Page | null = null;`] : []),
    ...(observed ? [`let ${observed}: ActionObservation | null = null;`] : []),
  ];
  const lifecycle = [
    'await runStepLifecycle({',
    '  prepare: async () => {',
    '    await settle(page);',
    // Replay asks which page it is on before it resolves anything.
    ...(step.page !== undefined ? [`    pageGate(page, ${step.page}, ${q(where)});`] : []),
    ...(standing ? [`    for (const warning of await restoreStandingFills(page, ${standing}, ${q(step.tool)}, ${q(where)})) logWarning(warning);`] : []),
    `    ${urlBefore} = page.url();`,
    ...(alerts ? [`    ${alerts} = (await liveAlerts(page${dialectArg(step)})) ?? [];`] : []),
    ...(linesBefore ? [`    ${linesBefore} = await capturePageLines(page${dialectArg(step)});`] : []),
    '  },',
    '  act: async () => {',
    ...indent(action),
    "    return { status: 'completed', value: undefined };",
    '  },',
    '  settle: async () => {',
    // An observed action settles on its own evidence — the DOM, the requests
    // it started, a debounced one, the url held still after a tool that may
    // navigate (the shared urlHeldStill, inside it), its expected effect — as
    // runStep settles replay's; anything else as replay's settle phase does.
    ...(observed
      ? [`    if (${observed}) await ${observed}.settle();`, `    else if (page.url() !== ${urlBefore}) await settle(page);`]
      : [`    if (page.url() !== ${urlBefore}) await settle(page);`]),
    // The alert observation belongs to the settle phase, not to verify:
    // taken right after the action has settled, before the url wait.
    ...(alerts ? [`    ${alertsAfter} = await settledAlerts(page${dialectArg(step)});`] : []),
    '  },',
    '  bind: async () => {',
    ...indent(bindings),
    '  },',
    '  verify: async () => {',
    ...indent(checks),
    '  },',
    '});',
  ];
  const body = urlFailed
    ? [
        `let ${urlFailed} = false;`,
        'for (let attempt = 0; ; attempt++) {',
        '  try {',
        ...lifecycle.map((l) => (l ? `    ${l}` : l)),
        '    break;',
        '  } catch (err) {',
        `    if (attempt > 0 || !${urlFailed} || !(await standingFillsLost(page, ${standing}))) throw err;`,
        `    ${urlFailed} = false;`,
        `    rearmStandingFills(${standing});`,
        `    logWarning(${q(`${where}: `)} + (err instanceof Error ? err.message : String(err)) + ${q(` — the page replaced its document under this ${step.tool} and its form is empty again, so it is repeated once after a refill`)});`,
        '  }',
        '}',
      ]
    : lifecycle;
  return [
    ...head,
    ...body,
    // Every later step of this body, and every later flow step (run.page), is
    // asked of the page the procedure continued on.
    ...(moved ? [`if (${moved}) page = run.page = ${moved};`] : []),
  ];
}

/** Whether any step (loop bodies included) moves the procedure to another page. */
function carriesEffect(steps: readonly SkillStep[]): boolean {
  return steps.some((s) => {
    const effect = stepEffect(s);
    return (effect !== undefined && effect.kind !== 'navigate') || (Array.isArray(s.body) && carriesEffect(s.body));
  });
}

/** Tools emitSkillAction dispatches against the page itself, with no locator to resolve. */
const PAGE_LEVEL_TOOLS = new Set(['goto', 'back', 'set_viewport', 'set_offline', 'eval', 'screenshot', 'dialog_expect', 'tabs']);

/**
 * What a step does about a recorded dialog an earlier step of this body left
 * absent (see expectationLines): nothing at all in a body that never has one.
 *
 * WHICH REPLAY RULE THIS MIRRORS. runOneStep, on a target that did not
 * resolve: a step naming one of the absent dialog's own controls is skipped
 * as belonging to it (absentDialogSkip, over the shared namesDialogControl);
 * one that names nothing the dialog listed is the procedure's own, and runs
 * (and fails) as such. Either way — and on every step whose targets resolve,
 * page-level steps and reads included — the state is cleared, so a stale
 * dialog can never excuse a later, unrelated miss. A minting step is never
 * skipped (a skipped mutation cannot be undone); a read is never skipped this
 * way (replay skips a missing read as a read, before it asks); and an absence
 * wait is satisfied by the miss itself. Emitted ahead of the already-in-effect
 * guard and the pick, as replay's ordering has it.
 */
function absentDialogLines(step: SkillStep, args: Record<string, unknown>, ctx: Ctx): string[] {
  if (!ctx.dialogAbsence) return [];
  const out: string[] = [];
  const pageLevel = PAGE_LEVEL_TOOLS.has(step.tool) || (step.tool === 'press' && !args.target);
  const chain = [...(step.locators?.target ?? []), ...(step.locators?.source ?? [])];
  const { sources } = candidateSources(chain, { slot: slotAsParam });
  // A target inside a recorded frame is never skipped this way: the dialog's
  // controls were looked for on the page, and replay does not consult the
  // absent dialog for a step whose frame is missing either.
  const framed = Boolean(step.contexts?.target?.frame?.length || step.contexts?.source?.frame?.length);
  if (!pageLevel && !framed && !isReadAction(step.tool) && !waitsForAbsence(step, args) && !step.mints && sources.length) {
    const locators = Object.fromEntries(
      Object.entries(step.locators ?? {}).map(([key, cands]) => [
        key,
        (cands ?? []).map((c) => {
          const { kind, name, text, label, hasText } = c as { kind: string; name?: string; text?: string; label?: string; hasText?: string };
          return { kind, ...(name !== undefined && { name }), ...(text !== undefined && { text }), ...(label !== undefined && { label }), ...(hasText !== undefined && { hasText }) };
        }),
      ]),
    );
    noteSlots(locators, ctx);
    const where = `${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex}`;
    out.push(
      `if (absentDialog !== null && (await absentDialogSkip([${sources.join(', ')}], ${JSON.stringify(locators)}, absentDialog, p, ${q(where)}))) {`,
      "  return { status: 'skipped' };",
      '}',
    );
  }
  out.push('absentDialog = null;');
  return out;
}

function emitSkillAction(step: SkillStep, segment: SpecSegment, index: number, ctx: Ctx, first = false): string[] {
  const out: string[] = [];
  // A location comment ahead of everything this step emits, so a Playwright
  // stack line (or a `[sitelooper drift]` warning, which shares this same
  // "<stepId> <segmentId>/<stepIndex>" shape) can be mapped back to the
  // recorded step that produced it.

  // Ahead of EVERYTHING this step does — the already-in-effect guard, the pick,
  // a bare locator action — because that is where replay's own settleDom sits
  // (runOneStep). See the helper's comment for the odoo toggle sequence this
  // ordering is what saves.

  ctx.segmentId = segment.id;
  ctx.stepIndex = index;
  const args = step.args ?? {};
  noteSlots(args, ctx);
  const str = (name: string, fallback = '') => String(args[name] ?? fallback);
  const num = (name: string): number | undefined => (typeof args[name] === 'number' ? (args[name] as number) : undefined);

  // A filled value or typed text is something the step put on the page, noted
  // ahead of any skip, as replay notes it before it asks about a miss.
  if (setsSomething(step.tool)) out.push(...echoNoteLines([args.value, args.text], ctx));
  out.push(...absentDialogLines(step, args, ctx));

  // Steps that act on the page itself, before any locator is needed.
  switch (step.tool) {
    case 'goto':
      // Not `page.goto(<recorded url>)`: the recorded target may name a record
      // of the RECORDING's run at a position this segment has already watched
      // vary, and the shared verdict sends the browser to the live value there
      // instead (fwgr41-n3 06-find step 7 went to a dashboard uid this
      // environment never minted). `nav` also carries what is stale about the
      // target, which this step's alert gate reports as the cause.
      //
      // Bounded, because `@playwright/test` bounds nothing: its
      // `navigationTimeout` default is 0, so a bare goto here waits forever
      // (see GOTO_TIMEOUT_MS). The daemon's own goto passes exactly this pair.
      if (ctx.navTarget) {
        ctx.volatileUsed = true;
        out.push(`${ctx.navTarget} = navigationTarget(${actSrc(str('url'))}, page, ${ctx.volatile}, ${q(`${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex}`)});`);
        out.push(`await page.goto(${ctx.navTarget}.url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });`);
      } else {
        out.push(`await page.goto(${actSrc(str('url'))}, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });`);
      }
      return out;
    case 'back':
      out.push('await page.goBack();');
      return out;
    case 'set_viewport':
      out.push(`await page.setViewportSize({ width: ${num('width') ?? 0}, height: ${num('height') ?? 0} });`);
      return out;
    case 'set_offline':
      out.push(`await page.context().setOffline(${Boolean(args.offline)});`);
      return out;
    case 'eval':
      out.push(`await page.evaluate(${actSrc(str('expression'))});`);
      return out;
    case 'screenshot':
      out.push(`await page.screenshot({ path: ${src(args.path ? str('path') : 'screenshot.jpg')}${args.full_page ? ', fullPage: true' : ''} });`);
      return out;
    case 'dialog_expect': {
      const action = args.action === 'accept' ? 'accept' : 'dismiss';
      const arg = action === 'accept' && args.prompt_text ? actSrc(str('prompt_text')) : '';
      const count = num('count') ?? 1;
      // A prompt answered with a one-time code computes it in the handler.
      out.push(`page.${count > 1 ? 'on' : 'once'}('dialog', ${arg.includes('await ') ? 'async ' : ''}(dialog) => dialog.${action}(${arg}));`);
      return out;
    }
    case 'tabs':
      // The switch itself is the step's page effect (stepEffect): the handle
      // is the tab at the recorded index among the open pages, taken after
      // the step and carried to every later line as `page` (and to later flow
      // steps as run.page) — replay's follow, not a guess. A tabs step that
      // only listed the tabs did nothing to the page.
      if (ctx.landing) out.push(`${ctx.landing} = await armPageEffect(page, ${JSON.stringify(stepEffect(step))}, ${q(`${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex}`)});`);
      else out.push('// the recording listed the open tabs here; nothing to do.');
      return out;
    case 'press':
      if (!args.target) {
        if (ctx.landing) out.push(`${ctx.landing} = await armPageEffect(page, ${JSON.stringify(stepEffect(step))}, ${q(`${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex}`)});`);
        out.push(`await page.keyboard.press(${actSrc(str('key'))});`);
        observeAction(step, ctx, out);
        return out;
      }
      break;
    default:
      break;
  }

  const isRead = isReadAction(step.tool);
  if (isRead && str('what') === 'url') {
    if (step.label) out.push(`outputs[${q(`${ctx.stepId}.${step.label}`)}] = page.url();`, ...echoReadLines(step, ctx));
    return out;
  }
  // An unlabelled read published nothing — it was the agent orienting itself —
  // so it needs no locator, and reporting one as missing would be a defect
  // where replay simply skips: a read is an observation, never a state change.
  if (isRead && !step.label) {
    out.push(`// observed: ${step.tool} ${commentSafe(str('what', 'text'))} (unlabelled — it published no value)`);
    return out;
  }

  void first;
  // A wait for the target to be GONE: resolving nothing IS the condition, so
  // the chain is resolved once with no wait (replay's waitsForAbsence rule),
  // and only a chain that still resolves is then held to become hidden.
  if (waitsForAbsence(step, args)) {
    const chain = step.locators?.target ?? [];
    if (!chain.length) {
      out.push(`// TODO: no locator this compiler can express for ${step.tool} — fill it in by hand.`);
      return out;
    }
    const name = `hit${++ctx.picks}`;
    warnUnprovenTarget(step, 'target', chain, ctx);
    // Inside a recorded frame: a frame that is not there shows nothing, so the
    // absence is met; an ambiguous one is a stop (replay's own reading).
    const frame = step.contexts?.target?.frame;
    let root = 'page';
    if (frame?.length) {
      const framed = `framed${(ctx.roots = (ctx.roots ?? 0) + 1)}`;
      root = `${framed}.root`;
      out.push(
        `const ${framed} = await rootFor(page, ${JSON.stringify(frame)}, 0);`,
        `if ('error' in ${framed} && !${framed}.missing) throw new Error(${q(`${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex} target: `)} + ${framed}.error);`,
      );
    }
    // Several matches resolve too (allowMultiple): two visible elements have
    // not met "hidden", and an 'ambiguous' miss read as "nothing matched"
    // was a false success. Replay's own policy for this step.
    const { open, where, policy, opts } = resolutionLines(chain, step, 'target', ctx, { allowMultiple: true, waitMs: '0' }, root);
    // The wait is on the FIRST match, as replay dispatches it (tools.ts
    // waitFor: `loc.first().waitFor({ state })`); Playwright's strict expect
    // would otherwise refuse the several matches allowed above instead of
    // waiting for them to go. A count wait is plural by nature — and this is
    // the general rule now (dispatchesFirstMatch), not a rule about `hidden`.
    const target = dispatchesFirstMatch(step.tool, args) ? `${name}.locator.first()` : `${name}.locator`;
    out.push(
      '// Absence is the condition: a chain that resolves nothing has met it (replay treats',
      '// the miss as the recorded outcome, not as drift), so the resolution is asked once,',
      '// with no wait, and only a target that is still there is waited on to go.',
      root === 'page' ? `const ${name} = await resolveTarget(page, [` : `const ${name} = 'root' in ${root.slice(0, -'.root'.length)} ? await resolveTarget(page, [`,
      ...open,
      root === 'page' ? `], ${where}, ${policy}, ${opts});` : `], ${where}, ${policy}, ${opts}) : null;`,
      `if (${name}) ${waitForLine(target, args, num('timeout_ms'), ctx, index)}`,
    );
    return out;
  }
  // A read resolves and reads through `readOptional`, which cannot throw: see
  // its comment. It never goes through `actionTarget`, because a `pick` emitted
  // as its own statement would throw before the read could catch anything.
  if (isRead) {
    out.push(...readLines(step, ctx));
    return out;
  }
  // The resolution, then the action: the already-in-effect guard and the
  // note rethrow both wrap only the action (see wrapAlreadyInEffect and
  // noteRethrow) — the `pick` carries its own note.
  // A text wait keeps its observations: when the wait fails on the target it
  // resolved, another recorded candidate may already show the text (textHeldOrThrow).
  const heldText = step.tool === 'wait_for' && (args.state === 'text_contains' || args.state === 'text_equals') && typeof args.text === 'string' && args.text.trim();
  const observations = heldText ? `observations${ctx.picks + 1}` : undefined;
  const target = actionTarget(step, 'target', ctx, out, observations);
  const actionAt = out.length;
  if (!target) {
    out.push(
      ...unsupportedCapability(ctx, index, {
        what: `(${step.tool}) has no locator a spec can express`,
        why: 'The recording kept no candidate for this target, so there is nothing for the artifact to resolve.',
        fix: `re-record this step so the target is named (sitelooper rerecord), or write the locator for ${step.tool} by hand in the generated file`,
        todo: `no locator this compiler can express for ${step.tool} — fill it in by hand.`,
        throws: `Unsupported recorded locator: ${step.tool} has no locator a standalone spec can express`,
      }),
    );
    return out;
  }

  switch (step.tool) {
    case 'click':
      out.push(`await click(${target}${ctx.obs ? `, { obs: ${ctx.obs} }` : ''});`);
      break;
    case 'dblclick':
      out.push(`await click(${target}, { dbl: true${ctx.obs ? `, obs: ${ctx.obs}` : ''} });`);
      break;
    // Not through the tiers: tools.ts dispatches a right or modifier click as a
    // plain, single Playwright click too (only click/dblclick reach
    // robustClick), and a FORCED right click on the wrong layer would open
    // someone else's context menu.
    case 'right_click':
      out.push(`await ${target}.click({ button: 'right' }); // plain, as replay dispatches it — robustClick's tiers are for click/dblclick only`);
      break;
    case 'modifier_click': {
      const mods = Array.isArray(args.modifiers) ? (args.modifiers as string[]) : [];
      out.push(`await ${target}.click({ modifiers: [${mods.map(q).join(', ')}] }); // plain, as replay dispatches it — robustClick's tiers are for click/dblclick only`);
      break;
    }
    case 'fill':
      // Through the inlined helper, never `locator.fill`: see its comment.
      out.push(`await fill(${target}, ${actSrc(str('value'))});`);
      break;
    case 'type': {
      // Through the inlined helper, never `pressSequentially` alone: a recorded
      // `type` into an editor or an aria-combobox is recipe-driven in the
      // daemon, and was the one action the artifact drove past the recipe.
      const delay = num('delay_ms');
      out.push(`await type(${target}, ${actSrc(str('text'))}${delay === undefined ? '' : `, { delay: ${delay} }`});`);
      break;
    }
    case 'press':
      out.push(`await ${target}.press(${actSrc(str('key'))});`);
      break;
    case 'select': {
      // By label first, not value: the recording watched a human pick the
      // option they could read, and an app is free to renumber its values.
      // Through the inlined helper, never `locator.selectOption` alone — the
      // recorded `optionValue` is the last resort replay itself keeps.
      const fallback = typeof args.optionValue === 'string' && args.optionValue ? `, ${actSrc(str('optionValue'))}` : '';
      out.push(`await select(${target}, ${actSrc(str('option'))}${fallback});`);
      break;
    }
    case 'check':
      out.push(`await ${target}.${args.checked === false ? 'uncheck' : 'check'}();`);
      break;
    case 'hover':
      // Through the inlined helper, never `locator.hover` alone: see its comment.
      out.push(`await hover(${target});`);
      break;
    case 'scroll_into_view':
      out.push(`await ${target}.scrollIntoViewIfNeeded();`);
      break;
    case 'upload': {
      const paths = Array.isArray(args.paths) ? (args.paths as string[]) : [];
      out.push(`await ${target}.setInputFiles([${paths.map(q).join(', ')}]);`);
      break;
    }
    case 'download': {
      const n = ++ctx.downloads;
      out.push(`const downloadPromise${n} = page.waitForEvent('download');`);
      out.push(`await ${target}.click();`);
      out.push(`const download${n} = await downloadPromise${n};`);
      out.push(`await download${n}.saveAs(${args.save_path ? actSrc(str('save_path')) : `\`downloads/\${download${n}.suggestedFilename()}\``});`);
      break;
    }
    case 'drag': {
      const source = actionTarget(step, 'source', ctx, out);
      if (source) out.push(`await ${source}.dragTo(${target});`);
      else {
        // The TODO line is what compilationBlockers (src/spec/index.ts) reads
        // to refuse the file as ready; the throw is what stops a run of it.
        ctx.warnings.push(`${ctx.stepId}: step ${index} has no expressible drag source`);
        out.push(`// TODO: no locator this compiler can express for the drag source.`);
        out.push(`throw new Error(${q('No expressible locator for required drag source')});`);
      }
      break;
    }
    case 'wait_for': {
      // On the FIRST match, exactly as replay dispatches it (tools.ts waitFor:
      // `loc.first().waitFor({ state })`, `loc.first().innerText()`) and as
      // the absence branch above already did — `hidden` was never a special
      // case, the dispatch is. Playwright's strict expect would otherwise
      // refuse the several matches the resolution now allows. A count wait is
      // plural by nature and keeps the whole locator.
      const waited = dispatchesFirstMatch(step.tool, args) ? `${target}.first()` : target;
      if (observations) {
        const where = `${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex}`;
        out.push(
          'try {',
          `  ${waitForLine(waited, args, num('timeout_ms'), ctx, index)}`,
          '} catch (err) {',
          `  await textHeldOrThrow(err, ${observations}, ${q(String(args.state))}, ${src(str('text'))}, ${q(where)}, run.drift);`,
          '}',
        );
      } else {
        out.push(waitForLine(waited, args, num('timeout_ms'), ctx, index));
      }
      break;
    }
    default:
      out.push(`// TODO: recorded tool ${step.tool} has no Tier 2 form.`);
      out.push(`throw new Error(${q(`Unsupported recorded action: ${step.tool}`)});`);
      ctx.warnings.push(`${ctx.stepId}: step ${index} uses tool ${step.tool}, which has no Tier 2 form`);
      break;
  }

  // The action's observation begins just before it dispatches, after the
  // arming below (both before the dispatch, as replay orders them).
  if (!(step.tool === 'drag' && !out[out.length - 1]?.includes('.dragTo('))) observeAction(step, ctx, out);
  // A fill that ran joins the segment's standing fills, with the url it ran on
  // (replay notes the same once the step has run).
  if (step.tool === 'fill' && ctx.standing) {
    ctx.standingUsed = true;
    // A value that makes a one-time code is noted as how to make it, so a refill types a fresh one.
    const noted = actSrc(str('value'));
    out.push(`await noteFill(${ctx.standing}, ${target}, ${noted.includes('await ') ? `async () => ${noted}` : noted}, page);`);
  }
  // A recorded popup/close is armed after the target resolved and before the
  // action dispatches, as replay arms it: a target=_blank click can raise its
  // popup before the click call returns.
  if (ctx.landing) {
    out.splice(actionAt, 0, `${ctx.landing} = await armPageEffect(page, ${JSON.stringify(stepEffect(step))}, ${q(`${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex}`)});`);
  }
  wrapAlreadyInEffect(step, ctx, out, actionAt);
  // A flagged step's `pick` carries the note in its own throw (actionTarget),
  // but the ACTION after it can fail too — a click that timed out on what
  // resolved says only that Playwright waited — and that failure must say
  // the same thing. Rethrow everything after the resolution with the
  // diagnostic appended, so every way a flagged step can fail names it.
  if (ctx.note) noteRethrow(out, actionAt, ctx.note);
  return out;
}

/**
 * Observe the state-changing action whose dispatch is the last line of `out`:
 * begin its observation (the shared beginAction) just ahead of it, and rethrow
 * a failure with its outcome (actionFailed). The options are replay's runStep
 * options: whether the tool may navigate (the url wait), whether it is an
 * input (the start grace from the dispatch), and the step's expected effect
 * (the shared effectExpectation over its recorded `{{vN}}` lines).
 */
function observeAction(step: SkillStep, ctx: Ctx, out: string[]): void {
  if (!ctx.obs || !isMutatingAction(step.tool) || !out.length) return;
  const dispatch = out.pop()!;
  const options = ['deadlineMs: ACTION_DEADLINE_MS'];
  if (isNavigatingAction(step.tool)) options.push('navigating: true');
  if (INPUT_TOOLS.has(step.tool)) options.push('graceFromDispatch: true');
  const hard = recordedChanges(step).filter((l) => SLOT_LINE.test(l));
  if (hard.length) {
    noteSlots(hard, ctx);
    options.push(`expect: effectExpectation(page, [${hard.map(q).join(', ')}], p${dialectArg(step)})`);
  }
  // Every dispatch this is asked of is one `await <call>;` line (a trailing
  // comment allowed): the failure is taken on the call itself, so the step
  // body gains no try block around it.
  const call = /^await (.+?);(\s*\/\/.*)?$/.exec(dispatch);
  out.push(`${ctx.obs} = beginAction(page, { ${options.join(', ')} });`, call ? `await ${call[1]}.catch(actionFailed);${call[2] ?? ''}` : dispatch);
}

/** Inputs, whose own save an app commonly debounces: tools.ts INPUT_TOOLS. */
const INPUT_TOOLS = new Set(['fill', 'type', 'press', 'select', 'check']);

/**
 * Wrap `out[from..]` in a try/catch that appends `note` to whatever it throws.
 *
 * The note is compile's diagnostic for this flow step, and a rethrow — not a
 * swallow — is the point: the step still fails, it just stops lying about why.
 * A throw that already carries the note (a `pick` inside the wrapped lines —
 * a drag's source) is passed through as it is, never noted twice.
 */
function noteRethrow(out: string[], from: number, note: string): void {
  const inner = out.splice(from).map((l) =>
    l
      .split('\n')
      .map((x) => (x ? `  ${x}` : x))
      .join('\n'),
  );
  const noted = q(`\n  ${note}`);
  out.push('try {', ...inner, '} catch (err) {', `  if (err instanceof Error && !err.message.includes(${noted})) err.message += ${noted};`, '  throw err;', '}');
}

/**
 * A capability the recording used and a standalone artifact cannot carry,
 * reported in all four places somebody looks for it.
 *
 * Replay executes a tab switch, an attribute read and a position-only locator;
 * the artifact has no second Page handle, no `getAttribute` shape for a
 * recorded `what`, and no way to find an element by where it was on screen.
 * A comment alone let all three through as a file that compiled, ran, and
 * quietly did less than the recording — so each one now yields:
 *   - a typed Diagnostic, printed by every surface and carried in `--json`;
 *   - a `ctx.warnings` line, for callers that still print warnings;
 *   - a `// TODO:` line, which is what `compilationBlockers` (spec/index.ts)
 *     keys on to refuse the flow as ready;
 *   - a `throw`, so a run of the file stops here rather than skipping it.
 * This is the shape the `default` branch of the action switch established.
 */
function unsupportedCapability(
  ctx: Ctx,
  index: number,
  o: { what: string; why: string; fix?: string; todo: string; throws: string },
): string[] {
  const line = `${ctx.stepId}: step ${index} ${o.what}`;
  ctx.diagnostics.push({
    code: 'unsupported-capability',
    step: ctx.stepId,
    what: o.what,
    why: o.why,
    ...(o.fix ? { fix: o.fix } : {}),
    severity: 'warning',
    line,
  });
  ctx.warnings.push(line);
  return [`// TODO: ${o.todo}`, `throw new Error(${q(o.throws)});`];
}

function waitForLine(target: string, args: Record<string, unknown>, timeout: number | undefined, ctx: Ctx, index: number): string {
  const only = timeout && timeout !== DEFAULT_WAIT_MS ? `{ timeout: ${timeout} }` : '';
  const opt = only ? `, ${only}` : '';
  // Rendered text, as the daemon's wait compares it (execution/text.ts
  // textHolds): textContent misses CSS text-transform (fwop10 "OVERVIEW").
  const rendered = `{ useInnerText: true${timeout && timeout !== DEFAULT_WAIT_MS ? `, timeout: ${timeout}` : ''} }`;
  switch (String(args.state)) {
    case 'visible':
      return `await expect(${target}).toBeVisible(${only});`;
    case 'hidden':
      return `await expect(${target}).toBeHidden(${only});`;
    case 'text_equals':
      return `await expect(${target}).toHaveText(${src(String(args.text ?? ''))}, ${rendered});`;
    case 'text_contains':
      return `await expect(${target}).toContainText(${src(String(args.text ?? ''))}, ${rendered});`;
    case 'count':
      return `await expect(${target}).toHaveCount(${Number(args.count ?? 0)}${opt});`;
    default:
      // A wait the spec cannot express is a step it cannot run: the diagnostic
      // reaches the compile caller, the TODO keeps the file from being called
      // ready (compilationBlockers), and the throw stops a run that gets here.
      ctx.warnings.push(`${ctx.stepId}: step ${index} waits for state ${String(args.state)}, which has no Tier 2 form`);
      return [
        `// TODO: recorded wait_for state ${commentSafe(String(args.state))} has no Tier 2 form.`,
        `throw new Error(${q(`Unsupported recorded wait_for state: ${String(args.state)}`)});`,
      ].join('\n');
  }
}

/**
 * A read publishes the value later steps reference by `<stepId>.<label>`; an
 * unlabelled one never reaches here.
 *
 * Resolution and read go through `readOptional` TOGETHER, single candidate or
 * many, so that neither half can fail the flow: replay skips a read it cannot
 * resolve — and one whose read errors — and carries on, because an observation
 * that could not be re-captured says nothing about whether the procedure ran.
 * Emitting the single-candidate case as a bare `await loc.textContent()` would
 * have thrown on exactly the same page where the multi-candidate case does.
 */
function readLines(step: SkillStep, ctx: Ctx): string[] {
  const what = String(step.args?.what ?? 'text');
  const out = `outputs[${q(`${ctx.stepId}.${step.label ?? ''}`)}]`;
  // The daemon's read tools take every element read through the embedded
  // readElements, and readOptional publishes it through the same takeRead
  // replay does, so a read_all reads EVERY match here too. A single-element
  // read on a plural selector threw strict mode, and was skipped on every
  // compiled run (fwod41).
  const attr = step.args?.attr;
  const readable = what === 'text' || what === 'value' || what === 'count' || (what === 'attr' && typeof attr === 'string' && attr !== '');
  const take = `readElements(loc, ${step.tool === 'read_all'}, ${q(what)}${what === 'attr' ? `, { attr: ${q(String(attr))} }` : ''})`;
  // A read-back pinned by containment publishes only the span at its frame's
  // mark, through the shared framedRead replay calls (fwvk3, fwgh5 s_5ee393):
  // the frame's slots filled from this run's params as replay fills its args.
  const valueFrame = typeof step.args?.frame === 'string' && step.args.frame ? step.args.frame : null;
  // A read scoped by a slot (skills/readscope.ts) goes through the shared
  // scopedRead replay calls, with the same slots' values (fwrd87).
  const slotName = (v: unknown) => (typeof v === 'string' && /^[vd]\d+$/.test(v) ? v : null);
  const slotFrame = typeof step.args?.slotFrame === 'string' && step.args.slotFrame ? step.args.slotFrame : null;
  const frameMark = slotName(step.args?.frameMark);
  const scopedBy = slotName(step.args?.scopedBy);
  const scope = [
    ...(valueFrame ? [`frame: ${src(valueFrame)}`] : []),
    ...(slotFrame ? [`slotFrame: ${src(slotFrame)}`] : []),
    ...(frameMark ? [`mark: p[${q(frameMark)}]`] : []),
    ...(scopedBy ? [`within: p[${q(scopedBy)}]`] : []),
  ];
  const read = readable
    ? slotFrame || frameMark || scopedBy
      ? `async (loc: Locator) => scopedRead(await ${take}, { ${scope.join(', ')} })`
      : valueFrame
        ? `async (loc: Locator) => framedRead(await ${take}, ${src(valueFrame)})`
        : `(loc: Locator) => ${take}`
    : null;
  // An unknown kind, or an attribute read that never recorded WHICH attribute:
  // publishing nothing under the label a later step consumes is how an empty
  // value travels.
  if (!read) {
    return unsupportedCapability(ctx, ctx.stepIndex, {
      what: `reads what=${what}${what === 'attr' ? ' with no attribute named' : ''}, which a standalone spec has no form for (label ${step.label ?? ''})`,
      why: 'The recording does not say what to read off the element, so the generated file cannot take it; this label would be left empty and any step consuming it would run on a blank.',
      fix: `write the read for what=${what} by hand in the generated file, or re-record the step as a text read`,
      todo: `read what=${commentSafe(what)} has no Tier 2 form (label ${commentSafe(step.label ?? '')}).`,
      throws: `Unsupported recorded read: what=${what}`,
    });
  }

  const chain = step.locators?.target ?? [];
  if (!chain.length) {
    // A read is an observation: replay skips one whose chain resolves nothing
    // ("skipped read — … (none recorded)") and the flow goes on. A chain can be
    // empty by design — dropDeadReadLocators retires every candidate that
    // looked for a value a later run saw change — and refusing the whole flow
    // over it made fwrd55 and fwod48 uncompilable while both replays passed.
    // So the artifact skips it the same way: one skip line, the value empty.
    ctx.warnings.push(`${ctx.stepId}: step ${ctx.stepIndex} (${step.tool} ${step.label ?? ''}) has no locator left — it publishes nothing, as replay skips it`);
    return [
      `console.log(${q(`[sitelooper skip] ${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex} target: no locator recorded — value left empty`)});`,
      `${out} = '';`,
    ];
  }
  // In a loop body a read's resolution is sunk for the progress guard too, as replay sinks every key.
  const frame = step.contexts?.target?.frame;
  if (frame?.length) {
    // A read inside a recorded frame that is not there is skipped, as replay
    // skips a read it cannot resolve: an observation, never a stop.
    const framed = `framed${(ctx.roots = (ctx.roots ?? 0) + 1)}`;
    const r = resolutionLines(chain, step, 'target', ctx, { allowMultiple: spansEveryMatch(step.tool, step.args ?? {}), waitMs: 'RESOLVE_WAIT_MS' }, `${framed}.root`);
    return [
      `const ${framed} = await rootFor(page, ${JSON.stringify(frame)}, RESOLVE_WAIT_MS);`,
      `if ('error' in ${framed}) {`,
      `  skippedReads.push(${q(`${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex} target`)});`,
      `  console.log(${q(`[sitelooper skip] ${ctx.stepId} ${ctx.segmentId}/${ctx.stepIndex} target: `)} + ${framed}.error + ' — value left empty');`,
      `}`,
      `${out} = 'root' in ${framed} ? await readOptional(page, [`,
      ...r.open,
      `], ${r.where}, ${r.policy}, ${read}, ${r.opts}) : '';`,
      ...echoReadLines(step, ctx),
    ];
  }
  const { open, where, policy, opts } = resolutionLines(chain, step, 'target', ctx, { allowMultiple: spansEveryMatch(step.tool, step.args ?? {}), waitMs: 'RESOLVE_WAIT_MS' });
  return [`${out} = await readOptional(page, [`, ...open, `], ${where}, ${policy}, ${read}, ${opts});`, ...echoReadLines(step, ctx)];
}

/**
 * A folded loop: the recording did the same thing to record after record.
 *
 * HOW it repeats is not emitted here at all — it is `runFoldedLoop`
 * (src/execution/loop.ts), the same policy replay runs, so the settle before
 * every count, the cursor, the shrink wait, the progress guard and the cap
 * cannot drift apart between the two runners. What this emits is the three
 * observations the policy asks the artifact for: settle the page, resolve the
 * guard, run the recorded body for one cursor.
 *
 * The guard is the FIRST candidate in the chain that matches anything, never
 * `.or()` over all of them: a chain is an ordered list of ways to name one
 * thing, and a union of a per-record primary with a generic fallback counts —
 * and then works — rows the recording never claimed (policy audit, gap 7).
 */
function emitLoop(step: SkillStep, segment: SpecSegment, index: number, ctx: Ctx): string[] {
  const body = step.body ?? [];
  const guardChain = step.while ?? body[0]?.locators?.target ?? [];
  noteSlots(guardChain, ctx);
  // The guard counts where the body acts: inside the recorded frame, when
  // there is one. A frame that is not there throws — unreadable, not empty.
  const guardFrame = (step.whileContext ?? body[0]?.contexts?.target)?.frame;
  const guardRoot = guardFrame?.length ? `guardRoot${ctx.loops + 1}` : 'page';
  const observations = observationSources(guardChain, { slot: slotAsParam, page: guardRoot });
  if (!observations.length || !body.length) {
    ctx.warnings.push(`${ctx.stepId}: step ${index} is a loop with no ${observations.length ? 'body' : 'guard a spec can express'}`);
    return [
      `// @step ${ctx.stepId} ${segment.id}/${index}`,
      `// TODO: recorded loop at step ${index} has no ${observations.length ? 'body' : 'expressible guard'}.`,
    ];
  }
  const max = step.max ?? DEFAULT_LOOP_MAX;
  const n = ++ctx.loops;
  const result = `loop${n}`;
  const cursor = `cursor${n}`;
  const sink = `pass${n}`;
  ctx.segmentId = segment.id;
  ctx.stepIndex = index;
  const where = `${ctx.stepId} ${segment.id}/${index}`;
  const out = [
    `// @step ${where}`,
    '// The recording folded a run of identical actions into a loop. `runFoldedLoop` is',
    "// replay's own loop policy, embedded: the cursor is what makes both kinds of loop work",
    '// from one body — a DELETE loop shrinks the collection, so the next record is always',
    '// match 0 and the cursor stays put; an EDIT-IN-PLACE loop leaves the count alone, so the',
    '// cursor steps on to the next match. The guard is the chain resolved through the shared',
    "// policy with ambiguity allowed (replay's own guard call: `{ allowMultiple: true }`, no",
    '// wait), and every recount uses that same candidate.',
    `const ${result} = await runFoldedLoop({`,
    '  settle: () => settle(page),',
    '  readable: () => pageReadable(page),',
    '  coverage: async () => (await observePage(page))?.coverage.collections ?? null,',
    '  guard: async () => {',
    ...(guardFrame?.length ? [`    const ${guardRoot} = await frameRoot(page, ${JSON.stringify(guardFrame)}, ${q(`${where} loop guard`)}, 0);`] : []),
    `    const guard${n} = await resolveCandidates(page, [`,
  ];
  for (const source of observations) out.push(`      ${source},`);
  out.push(
    '    ], { allowMultiple: true });',
    `    return guard${n} ? guard${n}.locator : null;`,
    '  },',
    `  runBody: async (${cursor}: number, ${sink}: LoopPass) => {`,
    "    // What each target of this pass resolved TO — replay's own sink (runOneStep) — is",
    '    // the progress guard\'s evidence, checked as each target resolves and before it is',
    '    // acted on: a pass that resolved the same elements as the last with the guard count',
    '    // unchanged stops before re-acting on one record.',
  );
  ctx.loopCursor = cursor;
  ctx.loopSink = sink;
  for (const [k, bstep] of body.entries()) {
    for (const line of emitSkillStep(bstep, segment, index, ctx, true)) {
      out.push(...line.split('\n').map((l) => (l ? '    ' + l : l)));
    }
    if (k < body.length - 1) out.push('');
  }
  ctx.loopCursor = undefined;
  ctx.loopSink = undefined;
  out.push(
    "    return { status: 'ran' as const };",
    '  },',
    `}, { max: ${max}, scope: ${q(step.scope ?? 'drain')}, shrinkWaitMs: LOOP_SHRINK_WAIT_MS, describe: ${q(guardDescription(guardChain))} });`,
    // The cap is a budget, not a finish line: a drain that used every pass with
    // records left has unfinished work, and says so rather than returning green.
    `if (!${result}.ok) throw new Error(\`${templateSafe(where)}: \${${result}.reason}\`);`,
    // A partial loop is not a failure and not a finished collection either:
    // replay says `loop ×N (partial: …)` and so does this, on stdout.
    `if (${result}.state === 'partial') console.log(\`[sitelooper partial] ${templateSafe(where)}: \${${result}.reason}\`);`,
  );
  return out;
}

/** How a loop guard reads in a failure message: its primary's expression, or where a point-only guard was recorded. */
function guardDescription(chain: LocatorCandidate[]): string {
  const first = chain[0];
  if (!first) return 'the guard';
  if (first.kind === 'point') return `the ${first.role ?? first.tag} recorded at ${first.x},${first.y}`;
  return candidateSources([first], { slot: slotAsParam }).sources[0] ?? 'the guard';
}

/** Whether every slot in a marker is bound by this segment's params or its derived values. */
function markerBound(marker: string, segment: SpecSegment): boolean {
  const slots = [...marker.matchAll(/\{\{([vd]\d+)\}\}/g)].map((m) => m[1]);
  if (!slots.length) return Boolean(marker.trim());
  return slots.every((s) => s in segment.params || s in (segment.derived ?? {}));
}

/**
 * The "already satisfied" guard at the top of a step body, when the step's
 * procedure carries one.
 *
 * WHY A STEP MAY BE ASKED TO DO WHAT IS ALREADY DONE. A flow is a record of
 * what the orchestrator did, and it retries: fwod34's 06-open asked for an
 * order to be cancelled and its recording did not land the cancel, so 08-open
 * was recorded asking for the same cancel again. On REPLAY 06-open works —
 * and 08-open then goes looking for a Cancel button that a cancelled order
 * does not have. The recorded procedure is fine; it is simply being run on a
 * record that has already reached its destination.
 *
 * So: identity (this is the right record) AND the goal (it is already in the
 * state the step produces) short-circuit the step, publishing the values its
 * read-backs would have published so the steps after it see the same shape.
 * Emitted only where every marker is BOUND — an unbound `{{v1}}` proves
 * nothing, and a guard that cannot be sure is not emitted at all, which
 * simply leaves the step running exactly as it does today.
 */
function satisfiedGuard(step: SpecStep, ctx: Ctx, consumed: ReadonlySet<string> = new Set()): string[] {
  const head = step.segments[0];
  const last = step.segments[step.segments.length - 1];
  const goal = last?.goal?.requireText ?? [];
  if (!head || !goal.length) return [];
  if (!(head.preconditions.requireText ?? []).some((m) => markerBound(m, head))) return [];
  // The record the goal is about is every value the step names (replay's
  // recordMarkers): the precondition's markers and a marker for each `known`
  // param — fwrd69's second "add a part" was skipped on the first part's row
  // until the part's own name was asked for. A named value the flow leaves
  // unbound proves nothing, so no guard is emitted at all.
  const identity = recordMarkers(head);
  if (!identity.every((m) => markerBound(m, head))) return [];
  if (!goal.every((g) => markerBound(g, last))) return [];
  noteSlots([...identity, ...goal], ctx);
  const shown = goal.map((g) => `"${g}"`).join(', ');
  const say = `[sitelooper satisfied] ${step.id} — page shows ${shown}; nothing to do`;
  // The same three preconditions replay's goalSatisfied puts ahead of the
  // page check, through the same shared rules (src/execution/gates.ts and
  // url.ts): every marker BOUND at run time — a slot bound to '' renders
  // `Order {{d1}}` as `Order `, which every order shows, and the compile-time
  // markerBound above cannot see the value — and the page template the goal
  // was read on, unconditionally, or the words mean nothing.
  noteSlots(head.preconditions.urlPattern, ctx);
  const raw = [...identity, ...goal].map(q).join(', ');
  const onPage = `markersBound([${raw}], p) && urlMatches(${q(head.preconditions.urlPattern)}, page.url(), p) && `;
  const out = [
    `// goal: the page already showing ${shown} for this record means the step's work is done —`,
    '// the same check replay makes before it acts (goalSatisfied, src/skills/replay.ts).',
    `if (${onPage}await satisfied(page, [${identity.map(src).join(', ')}], [${goal.map(src).join(', ')}])) {`,
    `  console.log(${src(say)});`,
  ];
  // The read-backs never run, so the report template stands in for them: the
  // same output keys, filled from this run's own params — through the shared
  // rule, on the page just judged, as the daemon's already-satisfied path
  // does: recorded text publishes only where this page shows it (fwrd86).
  const templated = Object.entries(last.report?.values ?? {}).filter(([label, value]) => label && value && markerBound(value, last));
  if (templated.length) out.push('  const satisfiedShown = await shownForReport(page).catch(() => null);');
  for (const [label, value] of templated) {
    noteSlots(value, ctx);
    const fn = consumed.has(label) ? 'referenceValue' : 'templateValue';
    out.push(`  { const value = ${fn}(${q(value)}, p, satisfiedShown, { literal: true }); if (value !== null) outputs[${q(`${step.id}.${label}`)}] = value; }`);
  }
  out.push('  return;', '}');
  return out;
}

/**
 * After the step's last segment: every report-template value built from the
 * caller's own `{{vN}}`, filled for this run and published unless a live read
 * of the step already published it — the daemon's synthesizeReport over the
 * same (last) segment, through the one shared rule (templateValue,
 * src/execution/report.ts): a recorded literal never publishes, nor does a
 * value that fills to nothing or still holds a `{{` marker — nor one naming a
 * slot the segment does not bind, which fills to a marker on every run. fwgh4's artifact
 * refused 03-open over `{{02-create.post_title_element_text}}`, a `"{{v2}}"`
 * value only the daemon published.
 */
function reportTemplateLines(step: SpecStep, ctx: Ctx, consumed: ReadonlySet<string> = new Set()): string[] {
  const last = step.segments[step.segments.length - 1];
  // A marker is bound by the segment's params, or by a {{dN}} an earlier
  // segment of this body minted (Ctx.minted): fwec8 02-create's record id,
  // minted by the save segment and reported by the tail.
  const bound = (template: string) => markerBound(template, last) || templateMarkers(template).every((m) => m in last.params || (ctx.minted?.has(m) ?? false));
  const entries = Object.entries(last?.report?.values ?? {}).filter(([label, template]) => label && derivesFromParams(template) && bound(template));
  if (!entries.length) return [];
  const out = ["// The step's report values built from this run's own parameters, as the daemon reports them (synthesizeReport)."];
  // Recorded text around a slot publishes only where this page shows it
  // (fwrd86 06-delete: "Created: 2026-09-23"), so the page is looked at once,
  // after the last segment — where the daemon looks, after the chain.
  const needsPage = reportNeedsPage(entries.map(([, template]) => template));
  if (needsPage) out.push('const reportShown = await shownForReport(page).catch(() => null);');
  for (const [label, template] of entries) {
    noteSlots(template, ctx);
    const key = q(`${step.id}.${label}`);
    // A consumed key falls back to its one slot (referenceValue): a later
    // step's reference, never a finding — the daemon banks the same.
    const fn = consumed.has(label) ? 'referenceValue' : 'templateValue';
    out.push(`{ const value = ${fn}(${q(template)}, p, ${needsPage ? 'reportShown' : 'null'}); if (value !== null && outputs[${key}] === undefined) outputs[${key}] = value; }`);
  }
  return out;
}

/** The segment's identity gate: one poll per bound marker, a comment per unbound one. */
function identityChecks(segment: SpecSegment, ctx: Ctx): string[] {
  const out: string[] = [];
  for (const marker of segment.preconditions.requireText ?? []) {
    // Identity: the url and the page shape match every record of this
    // template, so only the marker can say this is the RIGHT record. An
    // unbound marker proves nothing and is skipped, exactly as replay skips it.
    if (!markerBound(marker, segment)) {
      out.push(`// identity marker ${commentSafe(marker)} is unbound here — nothing to check.`);
      continue;
    }
    noteSlots(marker, ctx);
    out.push(`// identity: this must be the record the flow is working on, not another of the same shape.`);
    // The daemon's own question (checkIdentity, src/skills/replay.ts):
    // confirmPresence over a fresh dialect-2 observation, bounded (`whole`)
    // so a neighbouring record whose id merely extends this one cannot pass,
    // seeing a marker that is only a field's VALUE or sits in a frame, and
    // sweeping the page once when the look could not establish absence.
    // Polled, not asserted once: replay reaches this gate after its own
    // settleDom, and a spec arrives on a page that may still be rendering. A
    // look that stays 'unknown' fails the poll as 'unknown', not as absent.
    //
    // Except where the live url already names this run's record (its
    // param-filled parts equal this run's values): then a missing marker is
    // stale, not another record, and warns — replay's same shared verdict
    // (identityMarkerVerdict, src/execution/gates.ts; fwgr39-n3 05-set refused
    // the right dashboard on "Last 6 hours"). Asked once there, as replay asks.
    //
    // And the poll's EXHAUSTED branch ends in that same verdict, never in a
    // bare throw. The escape hatch was unavailable at the first look for a
    // reason that expires: fwgr47-n2's app had not yet written the pattern's
    // bound query keys into its url, so urlDiff — and with it urlRecordParts —
    // said null. Asking again once the budget is spent reads the POST-WAIT
    // url, which is the whole point of having waited. Without it the artifact
    // stopped exactly where replay (checkIdentity, src/skills/replay.ts) warns
    // and proceeds: a live parity divergence in the window "the marker never
    // renders AND the url only names the record after the wait".
    //
    // IDENTITY_WAIT_MS / IDENTITY_POLL_MS come from the shared module this
    // file embeds, not from a private literal beside it: two literals of one
    // budget is how the original divergence survived unnoticed.
    const pattern = q(segment.preconditions.urlPattern);
    noteSlots(segment.preconditions.urlPattern, ctx);
    const where = `${ctx.stepId} ${segment.id}`;
    out.push(
      '{',
      `  let seen = await confirmPresence(page, [${src(marker)}], 2, { whole: true });`,
      `  if (!urlRecordParts(${pattern}, page.url(), p)) {`,
      '    const deadline = Date.now() + IDENTITY_WAIT_MS;',
      "    while (seen.presence !== 'present' && Date.now() < deadline) {",
      '      await new Promise((r) => setTimeout(r, Math.max(1, Math.min(IDENTITY_POLL_MS, deadline - Date.now()))));',
      `      seen = await confirmPresence(page, [${src(marker)}], 2, { whole: true });`,
      '    }',
      '  }',
      "  if (seen.presence !== 'present') {",
      `    const verdict = identityMarkerVerdict(${pattern}, page.url(), p, ${src(marker)}, seen.presence);`,
      `    if (verdict.warning) logWarning(${q(`${where}: `)} + verdict.warning);`,
      `    if (!verdict.pass) throw new Error(${q(`${where}: identity: ${commentSafe(marker)} is not confirmed on this page`)});`,
      '  }',
      '}',
    );
  }
  return out;
}

/** One segment: its preconditions, then its steps. */
function emitSegment(segment: SpecSegment, ctx: Ctx): string[] {
  const out: string[] = [];
  ctx.known = new Set(Object.entries(segment.params).filter(([, p]) => p.known === true).map(([slot]) => slot));
  // One echo ledger per segment, as replay keeps one per replayed segment.
  ctx.segments = (ctx.segments ?? 0) + 1;
  ctx.echoes = `typed${ctx.segments}`;
  ctx.echoUsed = false;
  // One volatility ledger per segment, as replay keeps one per replayed skill:
  // a navigation is retargeted by what THIS procedure has watched vary, never
  // by another skill's observation (see navigationTarget).
  ctx.volatile = `volatile${ctx.segments}`;
  ctx.volatileUsed = false;
  // One standing-fill ledger per segment, as replay keeps one per replayed
  // skill — and only where the segment fills anything (loop bodies included),
  // since an empty ledger answers every step with nothing.
  const fills = (steps: readonly SkillStep[]): boolean => steps.some((s) => s.tool === 'fill' || (Array.isArray(s.body) && fills(s.body)));
  ctx.standing = fills(segment.steps) ? `filled${ctx.segments}` : undefined;
  ctx.standingUsed = false;
  out.push(`// ${segment.id}: ${commentSafe(segment.template)}`);
  out.push(`// recorded on a page matching ${commentSafe(segment.preconditions.urlPattern)}`);
  // The gate goes immediately before the first page-dependent step — replay
  // asks the same shared segmentGate (src/execution/gates.ts); a rule only one
  // runner applies is the class of defect the parity harness exists to catch.
  const gate = segmentGate(segment.steps);
  for (const [i, step] of segment.steps.entries()) {
    if (i + 1 === gate.at) out.push('', ...segmentGateLines(segment, ctx, gate.afterNavigation));
    out.push('');
    const lines = step.tool === 'loop' ? emitLoop(step, segment, i + 1, ctx) : emitSkillStep(step, segment, i + 1, ctx);
    out.push(...lines);
  }
  // A read-only segment that skipped every read it could take did not replay
  // (the shared observedNothing, asked by replay after the same steps). Only
  // emitted where it can ever hold, so other segments carry nothing.
  const shape = segment.steps.map((s) => ({
    tool: s.tool,
    args: { what: s.args?.what ?? 'text' },
    locators: { target: (s.locators?.target ?? []).map(() => 0) },
    ...(s.label ? { label: s.label } : {}),
  }));
  if (observedNothing(shape, Number.MAX_SAFE_INTEGER)) {
    const base = `readsBefore${ctx.segments}`;
    out.splice(2, 0, `const ${base} = skippedReads.length;`);
    out.push(
      '',
      `if (observedNothing(${JSON.stringify(shape)}, skippedReads.length - ${base})) {`,
      `  throw new Error(${q(`${segment.id}: every read of this read-only procedure was skipped — the page is not the one it was recorded reading`)});`,
      '}',
    );
  }
  // Everything this segment mints is on `p` from here to the end of the body,
  // so the segments BEHIND it can act on it (see Ctx.minted). Added after the
  // steps, never before: within this segment the per-step ordering still rules.
  for (const name of Object.keys(segment.derived ?? {})) (ctx.minted ??= new Set()).add(name);
  if (ctx.volatileUsed) {
    out.splice(2, 0, `// Url positions this segment has watched vary, for a later navigation (see navigationTarget).`, `const ${ctx.volatile}: UrlSegDiff[] = [];`);
  }
  if (ctx.echoUsed) {
    out.splice(2, 0, `// What this segment types, selects or names: a read that returns only that is an echo (see echoRead).`, `const ${ctx.echoes} = new Set<string>();`);
  }
  if (ctx.standingUsed) {
    out.splice(2, 0, `// What this segment filled, which must still stand when the action that submits it goes (see restoreStandingFills).`, `const ${ctx.standing} = standingFills();`);
  }
  ctx.echoes = undefined;
  ctx.echoUsed = false;
  ctx.volatile = undefined;
  ctx.volatileUsed = false;
  ctx.standing = undefined;
  ctx.standingUsed = false;
  return out;
}

/**
 * The segment's gate: where it starts (the shared preconditionVerdict) and
 * whose record it is (identityChecks), both asked at the one place segmentGate
 * names. `afterNavigation` is a segment compiled before navigations were
 * seams, with a goto or back ahead of that place: its gate was observed on the
 * page it left, so the url is not asked and the markers are asked only of a
 * page of the recorded template (the shared landedOnRecordedPage), as replay
 * asks them.
 */
function segmentGateLines(segment: SpecSegment, ctx: Ctx, afterNavigation: boolean): string[] {
  const out: string[] = [];
  const identity = identityChecks(segment, ctx);
  if (afterNavigation) {
    if (!identity.length) return out;
    out.push(
      '// The gate sits after a navigation this segment was recorded with. Its url',
      '// and markers were observed on the page the navigation LEFT, so the url is',
      '// not asked, and the markers only where the page is the recorded template:',
      "// the recorded goto carries the RECORDING run's record id (fwod10), while a",
      '// page of another template shows none of them by design (fwrd53). Replay',
      '// asks this same place (passGate, src/skills/replay.ts).',
      `if (landedOnRecordedPage(${q(segment.preconditions.urlPattern)}, page.url())) {`,
      ...identity.map((line) => `  ${line}`),
      '}',
    );
    return out;
  }
  // The url precondition: replay's rule, through the shared preconditionVerdict.
  noteSlots(segment.preconditions.urlPattern, ctx);
  const where = `${ctx.stepId} ${segment.id}`;
  let similarity = 'null';
  if (segment.preconditions.fingerprint) {
    // Replay's own adapter (src/skills/replay.ts): measure the live page
    // with the shared fingerprintPage and hand the verdict the cosine
    // against the recorded vector — null when the page could not be read.
    similarity = `cosine(recordedFingerprint(${q(ctx.stepId)}, ${q(segment.id)}), (await fingerprintPage(page)) ?? undefined)`;
    out.push("// the recording's page fingerprint decides a soft url match here, measured as replay measures it");
  } else if (segment.preconditions.fingerprinted) {
    // A file compiled before the vector travelled: the recording
    // fingerprinted this page and the file has nothing to measure against,
    // so the gate is told so and refuses the soft match replay would decide
    // by fingerprint. Said in the file and in the emit warnings.
    const diagnostic = unmeasuredPreconditionDiagnostic(ctx.stepId, segment.id);
    ctx.diagnostics.push(diagnostic);
    ctx.warnings.push(diagnostic.line!);
    out.push('// NOTE: the recording fingerprinted this page, but this file predates carried fingerprints, so a soft url match is refused here (only a strict match passes) where replay would decide it by fingerprint. Recompile to carry the fingerprint.');
    similarity = "'unmeasured'";
  }
  // page.url() is an argument AHEAD of the measurement, so it is read first —
  // replay's order (the url, then fingerprintPage).
  // The positions this segment mints ride with the gate, as replay hands them
  // to the same verdict: a page already carrying the record the segment would
  // create is past its start (gates.ts mintedAhead, fwod66 04-verify).
  const mints = segment.steps.flatMap((s, i) => (s.mints ? [{ at: s.mints.at, step: i + 1, ...(s.mints.sole !== undefined ? { sole: s.mints.sole } : {}) }] : []));
  out.push(`await preconditionGate(${q(segment.preconditions.urlPattern)}, page.url(), p, ${q(where)}, ${similarity}${mints.length ? `, ${JSON.stringify(mints)}` : ''});`);
  out.push(...identity);
  return out;
}

/** The slots a step's `p` object carries: every param of every segment, plus what they mint. */
function slotsOf(step: SpecStep, found: Set<string>): string[] {
  const names = new Set(found);
  for (const seg of step.segments) {
    for (const name of Object.keys(seg.params)) names.add(name);
    for (const name of Object.keys(seg.derived ?? {})) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

/**
 * A flow-step param value as an expression: a literal, a run var, an earlier
 * step's output, or an environment secret. Secrets stay markers everywhere
 * until the moment they are used — see shared/secrets.ts — and that holds in
 * a compiled spec too: the emitted file names the variable, never the value.
 *
 * `by` is the consuming step id, passed only where a missing value would
 * CHANGE what the step does (see `callArgs`): then a `{{step.output}}`
 * reference is resolved through `need`, which stops rather than binding a
 * blank. Left out, a reference resolves the way it always has.
 */
function paramExpr(template: string, vars: Set<string>, by?: string): string {
  const parts: { lit?: string; expr?: string }[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{\{([\w.#:-]+)\}\}/g)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ lit: template.slice(last, at) });
    parts.push({ expr: refExpr(m[1], vars, by) });
    last = at + m[0].length;
  }
  if (last < template.length) parts.push({ lit: template.slice(last) });
  if (!parts.length) return q('');
  if (parts.length === 1 && parts[0].expr) return parts[0].expr!;
  if (parts.every((p) => p.lit !== undefined)) return q(parts.map((p) => p.lit).join(''));
  return '`' + parts.map((p) => (p.lit !== undefined ? templateSafe(p.lit) : '${' + p.expr + '}')).join('') + '`';
}

function refExpr(ref: string, vars: Set<string>, by?: string): string {
  const secret = /^env:([A-Za-z_][A-Za-z0-9_]*)$/.exec(ref);
  // A secret is validated once, up front (validateInputs / requiredEnvNames);
  // a plain run var likewise. Only a step-to-step output is a value THIS run
  // had to produce, so only it can go missing mid-flow.
  if (secret) return `process.env[${q(secret[1])}] ?? ''`;
  // A one-time code travels as its MARKER to the action that types it, and
  // is generated there (actSrc → totpMarkersIn): a code computed at the call
  // site would be stale by the time a refill used it.
  const totp = /^totp:(\w+)$/.exec(ref);
  if (totp) return q(`{{totp:${totp[1]}}}`);
  if (ref.includes('.')) return by ? `need(outputs, ${q(ref)}, ${q(by)})` : `outputs[${q(ref)}] ?? ''`;
  if (vars.has(ref)) return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(ref) ? `vars.${ref}` : `vars[${q(ref)}]`;
  // A reference to something the flow never declared: honest at run time
  // rather than a compile-time guess at what the caller meant.
  return `(vars as Record<string, string>)[${q(ref)}] ?? ''`;
}

/**
 * Can a missing value in this slot change what the step DOES?
 *
 * The port of `ignorableRefs` (src/skills/flow.ts:1083), derived from the same
 * two facts it reads: a slot some recorded step types or locates by
 * (`SkillParam.usedIn`), or one naming the record the procedure must find (a
 * `{{vN}}` inside `preconditions.requireText`). Everything else — a tag the
 * instruction mentions for context, a price quoted from the recording —
 * reaches nothing the pinned procedure can act on, so its absence is no reason
 * to stop. fwgr23 05-open is the case: `{{04-open.tag}}` blank, bound to a slot
 * no step used.
 */
function usedSlot(step: SpecStep, slot: string): boolean {
  return step.segments.some(
    (s) =>
      (s.params[slot]?.usedIn.length ?? 0) > 0 ||
      (s.preconditions.requireText ?? []).some((marker) => marker.includes(`{{${slot}}}`)),
  );
}

/**
 * Is the only thing that publishes `ref` a read no run has ever resolved?
 *
 * WHY THIS IS ASKED AT ALL. `publishedOutputs` (src/skills/learn.ts) counts a
 * label as published on one fact: a read step carries it. That is right for
 * what it is for — pruning an output nothing can ever source, and a wording-only
 * reference must not start failing — but it says nothing about whether the read
 * WORKS. The flow export synthesizes a read for a referenced value the
 * producing skill never read (flow.ts `liveReadsFor`), located by the
 * characters of the value the recording model reported; appending it is what
 * makes the label "published", which is what stops the output being pruned,
 * which is what turns a soft unreported output into a HARD dependency of a
 * later step. fwkb14 and fwod52 both exported 6/6 with every skill validated
 * 3/3 and then stopped their compiled arms at 1/6 and 3/6 — od52's synthesized
 * chain was EMPTY, so it could never have published on any page.
 *
 * So: a read that has never resolved is a CANDIDATE source. `unproven` carries
 * that as a fact from where the read is built, and is dropped the first time
 * any run resolves it (SkillStep.unproven). A source is anything else — a
 * recorded read, or a report-template value derived from the caller's own
 * `{{vN}}`, which is what `publishedOutputs` counts beside reads.
 *
 * Having NO source at all is the same defect with one fewer read, and it is
 * the commoner half: fwkb15's `{{02-create.task_url}}` and fwod52's
 * `{{02-create.product_name}}` are each referenced by steps that type them,
 * recorded as a literal in a report template, and read from the page by
 * nothing. Asking only "is the one source unproven" shipped those artifacts
 * to a guaranteed stop. The question is whether anything can EVER publish the
 * key, so the exclusions below are not a filter on what a name looks like:
 * they are the complete set of sites that assign `outputs[...]` in the file
 * being written — minted, a labelled read (including a url read and a loop
 * body's), a report value the caller's `{{vN}}` reaches, and the url parts.
 * A ref a stand-in can fill never reaches here; callArgs tries that first.
 */
function unsourcedRef(spec: SpecFlow, ref: string): { sid: string; output: string; kind: 'unproven' | 'none' | 'dangling' } | null {
  const dot = ref.indexOf('.');
  if (dot < 0) return null;
  const sid = ref.slice(0, dot);
  // A url part is re-bound from every replay's landing and a JSON leaf comes
  // out of a body; neither is a read's label. `#` is stripped because the
  // read that publishes `body` is what sources `body#task.id`.
  const output = ref.slice(dot + 1).split('#')[0];
  const producer = spec.steps.find((s) => s.id === sid);
  // A reference naming NO step of the flow was waved through here while a
  // producer that merely cannot publish was refused — the exemption ran the
  // wrong way round. grafana fwgr47's compiled arm stopped at
  // `07-verify needs {{i2.dashboard_title_saved}}`: the read is fine and does
  // publish, as `02-create.dashboard_title_saved`, but `i2` is a ledger
  // instruction-index id and nothing ever assigns `outputs['i2.…']`. Nothing
  // can: every site that writes `outputs[...]` in the emitted file is keyed by
  // a step of `spec.steps` — the url publisher (urlOutputLines, emitted per
  // step) included, which is why this is asked BEFORE the url/minted
  // exemptions. So it is the worst case of the three, not an exempt one.
  if (!producer) return { sid, output, kind: 'dangling' };
  if (output === 'url' || output.startsWith('url.') || output === 'minted') return null;
  let reads = 0;
  let proven = 0;
  const walk = (steps: SkillStep[]): void => {
    for (const s of steps) {
      if ((s.tool === 'read' || s.tool === 'read_all') && s.label === output) {
        reads += 1;
        // A read whose every candidate was retired (dropDeadReadLocators, or
        // the absent-only retirement) publishes '' on every run, and `need`
        // treats '' as missing — so an empty chain is no more a source than
        // an unproven one. A url read is the exception: it needs no locator.
        const empty = !(s.locators?.target ?? []).length && s.args?.what !== 'url';
        if (!s.unproven && !empty) proven += 1;
      }
      if (s.body) walk(s.body);
    }
  };
  // A {{dN}} any segment of the step derives is on `p` once that segment has
  // run (Ctx.minted): the tail may publish what the head minted (fwec8).
  const derivedHere = new Set(producer.segments.flatMap((s) => Object.keys(s.derived ?? {})));
  for (const segment of producer.segments) {
    walk(segment.steps);
    const templated = segment.report?.values?.[output];
    // Only a value that publishes for a reference on every run (templateSource,
    // the rule publishedOutputs shares): one from several slots with recorded
    // text between them publishes only where the page shows that text, and
    // one naming a marker nothing binds never publishes (fwec8 03-verify).
    if (typeof templated === 'string' && templateSource(templated, (name) => name in segment.params || derivedHere.has(name))) proven += 1;
  }
  return proven === 0 ? { sid, output, kind: reads > 0 ? 'unproven' : 'none' } : null;
}

/** The `{ v1: …, d1: '' }` argument one step is called with. */
function callArgs(step: SpecStep, slots: string[], vars: Set<string>, warnings: string[], spec: SpecFlow, diagnostics: Diagnostic[]): string {
  const derived = new Set(step.segments.flatMap((s) => Object.keys(s.derived ?? {})));
  const fields = slots.map((slot) => {
    // A minted value has no caller binding by construction: the body reads it
    // off the live url after the step that creates it.
    // Not passed at all: replay's params carry no derived value until it is
    // minted, and an unset `{{dN}}` is a wildcard where '' is an empty segment.
    if (derived.has(slot)) return null;
    const bound = step.params[slot];
    // Only a USED slot is checked. `outputs` is whatever keys the model's
    // report happened to emit (flow.ts's runFlow), and across the published
    // bench flows 1521 outputs are declared against 89 consumed downstream:
    // requiring every one of them would turn values nobody authored into
    // failure points.
    if (bound !== undefined) {
      const used = usedSlot(step, slot);
      // A used slot bound to exactly one `{{step.output}}` whose recorded value
      // is safe to stand in (recordedStandIn, the daemon runFlow's own rule):
      // resolved from the page when this run did not publish it — fwrd54's
      // 07-edit clicking `{{06-change.mark_ready_button}}`.
      const exact = /^\s*\{\{([\w-]+\.[\w.-]+)\}\}\s*$/.exec(bound)?.[1];
      const standIn = exact ? recordedStandIn(exact, step.params, step.segments) : undefined;
      if (exact && standIn !== undefined) {
        // An UNUSED slot may not throw — nothing resolves by it, and this
        // artifact has always carried such a slot as a blank. It may still be
        // filled: the daemon's runFlow now runs the same page stand-in over
        // every unresolved reference (fwod49's product name sat in an
        // expectation only, and was on the page all along), so `shownOr` is
        // `needShown` without the throw, and the two runners fill alike.
        const helper = used ? 'needShown' : 'shownOr';
        return `${slot}: await ${helper}(page, outputs, ${q(exact)}, ${q(step.id)}, ${q(standIn)}, Object.values(vars))`;
      }
      // A used slot with no stand-in compiles to `need(…)`, which STOPS the
      // run when the reference is unpublished. Where the only thing that
      // could publish it is a read no run has ever resolved, that stop is not
      // a risk, it is the plan: refuse the compile instead, with a cause that
      // names the step, the output and the reason. A loud compile-time
      // refusal beats a silent 1/6 with residue on the app (fwkb14 03-verify,
      // fwod52 04-open).
      //
      // The discrimination is `usedSlot`'s, unchanged and exactly right: a
      // reference merely QUOTED in the wording reaches nothing the procedure
      // acts on, so its blank costs a sentence, not a record. And only the
      // no-stand-in case — where a `recordedStandIn` exists, `needShown` fills
      // the slot from the live page and the compile can stand behind the step.
      //
      // NOT fixed by carrying the recording's literal: a reference this run
      // did not publish goes to recovery, never to a recorded value, or the
      // step silently edits run 1's record (flow.ts lookupRef, `need` above).
      if (used) {
        for (const m of bound.matchAll(/\{\{([\w-]+\.[\w.#-]+)\}\}/g)) {
          const src = unsourcedRef(spec, m[1]);
          if (!src) continue;
          // Its own wording, because its own repair: there is no read to
          // re-record — the reference is simply pointed at something that is
          // not a step. Naming the ids that DO exist is the whole fix in one
          // line (fwgr47: `i2` for `02-create`).
          if (src.kind === 'dangling') {
            const ids = spec.steps.map((s) => s.id);
            diagnostics.push({
              code: 'unsourced-ref',
              step: step.id,
              what: `slot ${slot} is bound to {{${m[1]}}}, and this flow has no step ${src.sid}`,
              why:
                `${src.sid} is not one of this flow's steps (${ids.join(', ')}), so nothing in the artifact can ever publish ${m[1]} — ` +
                `every value a step reads, mints or takes off the url is published under a step id from that list. ` +
                `${step.id} types or locates by ${slot}, so the artifact would stop here on every run, part-way through the flow and with everything earlier already done.`,
              fix: `bind ${step.id}'s ${slot} to the step that publishes ${src.output} (one of: ${ids.join(', ')}), or take {{${m[1]}}} out of it`,
              severity: 'error',
            });
            continue;
          }
          const because =
            src.kind === 'unproven'
              ? `${src.sid}'s only source for ${src.output} is a read the flow export synthesized from the value the recording reported — no run has resolved it or read a value back through it.`
              : `nothing in ${src.sid}'s procedure reads ${src.output} from the page, and no report value derives it from a parameter, so no run can publish it. The recording's own value is not a substitute: passing it would make every replay work run 1's record.`;
          diagnostics.push({
            code: 'unsourced-ref',
            step: step.id,
            what: `slot ${slot} is bound to {{${m[1]}}}, and nothing has ever published ${src.output}`,
            why: `${because} ${step.id} types or locates by ${slot}, so the artifact would stop here on every run, part-way through the flow and with everything earlier already done.`,
            fix: `re-record ${src.sid} so it reads ${src.output} from an element (\`sitelooper rerecord <flow file> ${src.sid}\`), or take {{${m[1]}}} out of ${step.id}'s ${slot}`,
            action: { command: 'rerecord', args: [src.sid], step: src.sid },
            severity: 'error',
          });
        }
      }
      return `${slot}: ${paramExpr(bound, vars, used ? step.id : undefined)}`;
    }
    const example = step.segments.map((s) => s.params[slot]?.example).find((e) => typeof e === 'string');
    if (example === undefined) return `${slot}: ''`;
    // No flow binding: the recording's own value is the only one there is,
    // and inlining it silently is how a replay comes to work the recorded
    // run's record. Emitted, but the caller is told.
    warnings.push(`${step.id}: slot ${slot} has no flow binding — the recorded value is inlined`);
    return `${slot}: ${paramExpr(example, vars)} /* recorded value; no flow binding */`;
  });
  return `{ ${fields.filter((f) => f !== null).join(', ')} }`;
}

/**
 * The `{{<stepId>.url}}` / `{{<stepId>.url.<part>}}` references this flow's own
 * params make, grouped by the step that has to publish them.
 *
 * WHICH REPLAY RULE THIS MIRRORS. The flow runner publishes every step's END
 * URL as outputs — the whole url and each identifier-like part (`urlOutputs`
 * in skills/flow.ts) — and that is how a later step's param
 * `http://…/d/{{02-create.url.p1}}/…` gets a value. A compiled body published
 * none of them: it binds what the step mints into its own `p.dN`, which is
 * segment-local, while `refExpr` resolves the flow-level reference out of
 * `outputs`. So fwgr27's 03-add did `page.goto('http://127.0.0.1:3000/d//fwgr27-…')`
 * — the uid segment simply empty — and every locator after it missed on a page
 * that was not the dashboard. Only the consumed refs are published: an output
 * nothing reads is noise, and this is exactly what `consumedUrlOutputs` asks.
 */
function consumedUrlRefs(spec: SpecFlow): Map<string, string[]> {
  const wanted = new Map<string, Set<string>>();
  for (const step of spec.steps) {
    for (const value of Object.values(step.params)) {
      for (const m of value.matchAll(/\{\{([\w-]+)\.(url(?:\.[\w.-]+)?)\}\}/g)) {
        const set = wanted.get(m[1]) ?? new Set<string>();
        set.add(m[2]);
        wanted.set(m[1], set);
      }
    }
  }
  // `url` first: it is the one output every step can publish without a read.
  return new Map([...wanted].map(([id, outs]) => [id, [...outs].sort()]));
}

/** The lines that publish one step's end-url outputs, or none. */
function urlOutputLines(stepId: string, outs: string[] | undefined): string[] {
  if (!outs?.length) return [];
  const lines = ['// Later steps refer to this step by where it left the browser, so publish its'];
  lines.push('// end url the way the flow runner does (urlOutputs / consumedUrlOutputs in');
  lines.push('// src/skills/flow.ts) — unpublished, `{{' + stepId + '.' + outs[0] + '}}` resolves to nothing.');
  for (const out of outs) {
    const key = `${stepId}.${out}`;
    if (out === 'url') lines.push(`outputs[${q(key)}] = page.url();`);
    // No urlBefore: nothing here acted, so the wait is simply for the part to
    // be there at all — an SPA can update its url a beat after the page itself
    // settles, which is what consumedUrlOutputs waits out.
    else lines.push(`outputs[${q(key)}] = (await urlPartWhen(page, ${q(out.slice('url.'.length))})) ?? '';`);
  }
  return lines;
}

/** Every output the generated body can publish or a later step can consume. */
function outputKeys(spec: SpecFlow, urlRefs: Map<string, string[]>): string[] {
  const keys = new Set<string>();
  const visit = (stepId: string, steps: SkillStep[]) => {
    for (const step of steps) {
      if (step.label) keys.add(`${stepId}.${step.label}`);
      if (step.mints) keys.add(`${stepId}.minted`);
      if (step.body?.length) visit(stepId, step.body);
    }
  };
  for (const step of spec.steps) {
    for (const output of step.outputs) keys.add(`${step.id}.${output}`);
    for (const segment of step.segments) {
      visit(step.id, segment.steps);
      for (const output of Object.keys(segment.report?.values ?? {})) keys.add(`${step.id}.${output}`);
    }
    // Include references even when their producer is absent. The compiler will
    // diagnose that separately, while the emitted access remains useful and
    // type-safe for a reviewer fixing the flow.
    for (const value of Object.values(step.params)) {
      for (const match of value.matchAll(/\{\{([\w-]+\.[\w.#-]+)\}\}/g)) keys.add(match[1]);
    }
  }
  for (const [stepId, outputs] of urlRefs) for (const output of outputs) keys.add(`${stepId}.${output}`);
  return [...keys].sort();
}

/** Environment-backed inputs named anywhere in the self-contained procedure. */
function requiredEnvNames(spec: SpecFlow): string[] {
  const names = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      // A `{{totp:NAME}}` seed is an environment input the same way.
      for (const match of value.matchAll(/\{\{(?:env|totp):([A-Za-z_][A-Za-z0-9_]*)\}\}/g)) names.add(match[1]);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value && typeof value === 'object') for (const item of Object.values(value)) visit(item);
  };
  visit(spec);
  return [...names].sort();
}

export function emitFlowFile(spec: SpecFlow, o: EmitOptions): { source: string; warnings: string[]; diagnostics: Diagnostic[] } {
  if (o.tier !== 'plain') throw new Error(`unknown emit tier ${String(o.tier)}`);
  flowNamesTotp = JSON.stringify(spec).includes('{{totp:');
  const warnings: string[] = [];
  // Problems only emission can find — a capability the artifact cannot carry —
  // travel back to the compile caller as diagnostics, not just as prose.
  const diagnostics: Diagnostic[] = [];
  const vars = new Set(spec.vars);
  const urlRefs = consumedUrlRefs(spec);
  const knownOutputs = outputKeys(spec, urlRefs);
  const envInputs = requiredEnvNames(spec);
  const flagged = flaggedByStep(o.diagnostics);

  // A flow with a step that moves the procedure to another page (a popup, a
  // close, a tab switch) carries that page between flow steps on `run.page`;
  // one without never names it, so its generated text is unchanged.
  const followsPages = spec.steps.some((step) => step.segments.some((seg) => carriesEffect(seg.steps)));
  // Bodies first: which helpers the file needs is decided by what they use.
  const bodies = spec.steps.map((step) => {
    const ctx: Ctx = { stepId: step.id, slots: new Set(), warnings, diagnostics, downloads: 0, loops: 0, picks: 0, urls: 0, binds: 0, segmentId: '', stepIndex: 0, note: stepNote(flagged.get(step.id)), known: new Set(), minted: new Set() };
    const lines: string[] = [];
    if (!step.segments.length) {
      lines.push(`// TODO: no converged procedure for ${JSON.stringify(commentSafe(step.instruction))}`);
      lines.push(`throw new Error(${q(`step ${step.id} has no converged procedure — record it with sitelooper, then compile again`)});`);
    } else {
      // What later steps reference of this one: a withheld template value
      // still gives them its one slot (referenceValue), as the daemon's flow
      // runner banks it — the same set, the same function.
      const consumed = new Set(consumedReportedOutputs(spec.steps, step.id));
      const guard = satisfiedGuard(step, ctx, consumed);
      if (guard.length) lines.push(...guard, '');
      for (const [i, segment] of step.segments.entries()) {
        if (i) lines.push('');
        lines.push(...emitSegment(segment, ctx));
      }
      const templated = reportTemplateLines(step, ctx, consumed);
      if (templated.length) lines.push('', ...templated);
      const published = urlOutputLines(step.id, urlRefs.get(step.id));
      if (published.length) lines.push('', ...published);
      // The one piece of state a body keeps between its steps: a recorded
      // dialog that did not open (see expectationLines), consulted by every
      // later step before it resolves — as runOneStep keeps it.
      if (ctx.dialogAbsence) lines.unshift('let absentDialog: { name: string; lines: string[] } | null = null;', '');
      // An earlier flow step may have left the procedure on another page.
      if (followsPages) lines.unshift("// Where an earlier step's popup, close or tab switch left the procedure.", 'if (run.page && !run.page.isClosed()) page = run.page;', '');
    }
    return { step, lines, slots: slotsOf(step, ctx.slots) };
  });

  // What emission itself found goes above the step it belongs to, exactly as a
  // diagnostic compile found beforehand does.
  for (const d of diagnostics) {
    if (d.step && FLAGGED.includes(d.code)) flagged.set(d.step, [...(flagged.get(d.step) ?? []), d]);
  }

  // Call sites BEFORE the helper scan: `need(` is emitted only at a call site,
  // and `neededHelpers` decides what the file carries by what its text names.
  // Computed after the bodies because a call site's slot list is what the body
  // collected.
  const calls = bodies.map((b) => callArgs(b.step, b.slots, vars, warnings, spec, diagnostics));
  const body = [...bodies.flatMap((b) => b.lines), ...calls].join('\n');
  // runFlow judges the browser it is handed (profileMismatch, readLiveBrowser);
  // named here because runFlow is written after the helper scan.
  // Every flow records its page's traffic from the start url on (runFlow,
  // below): the first action's baseline includes the load, and the start
  // page's routing wait (startPageSettled) counts those requests — which a
  // flow with no observed action needs as much as one with.
  // GOTO_TIMEOUT_MS is named unconditionally: runFlow's own start-url goto
  // passes it, and runFlow is written after this scan, so a flow whose steps
  // never navigate would otherwise reference a constant the file does not carry.
  const helpers = neededHelpers([body, 'profileMismatch(', 'readLiveBrowser(', 'GOTO_TIMEOUT_MS', 'pageTraffic(', 'startPageSettled('].join('\n'), [recipesHelper(spec)]);

  const out: string[] = [
    '// @sitelooper-flow v1',
    `// Generated by sitelooper from flow ${JSON.stringify(spec.name)} — do not edit by hand.`,
    '// Repair drift with `sitelooper repair <this file>`; the FLOW constant below is the source of truth.',
    `import { ${helpers.some((h) => h.source.some((l) => l.includes('ElementHandle'))) ? 'type ElementHandle, ' : ''}expect, test, ${helpers.some((h) => h.source.some((l) => l.includes('Locator'))) ? 'type Locator, ' : ''}type Page } from '@playwright/test';`,
    '',
    '// This file needs @playwright/test and nothing else. A module-scoped',
    '// declaration of the one Node global it reads keeps it type-checking in a',
    '// project without @types/node, and shadows harmlessly in one that has it.',
    'declare const process: { env: Record<string, string | undefined> };',
    '',
    BEGIN_MARKER,
    `export const FLOW = ${flowLiteral(spec)};`,
    END_MARKER,
    '',
    `export const flowStepIds = ${JSON.stringify(spec.steps.map((step) => step.id))} as const;`,
    `export const requiredInputNames = ${JSON.stringify(spec.vars)} as const;`,
    `export const requiredEnvNames = ${JSON.stringify(envInputs)} as const;`,
    '',
    `export type Vars = ${spec.vars.length ? `{ ${spec.vars.map((v) => `${key(v)}: string`).join('; ')} }` : 'Record<string, never>'};`,
    `export type OutputKey = ${knownOutputs.length ? knownOutputs.map(q).join(' | ') : 'never'};`,
    '/** Known values the steps can read back, keyed "<stepId>.<output>". */',
    'export type Outputs = Partial<Record<OutputKey, string>>;',
    '/** Mutable state for one invocation. Pass it to runFlow to retain telemetry after a failure. */',
    'export interface FlowRun {',
    '  outputs: Outputs;',
    '  drift: string[];',
    '  /**',
    "   * Output keys whose read only echoed what the flow itself typed or selected:",
    "   * published, but not proof the app persisted them (replay's echoedValues).",
    '   */',
    '  echoed: string[];',
    '  /**',
    "   * Every distinct record identifier a record-creating step minted this run, in",
    "   * order (replay's `created`); a loop body contributes one per pass.",
    '   */',
    '  created: string[];',
    '  /**',
    '   * What this run noticed about its conditions rather than its steps: today, a browser',
    '   * that is not the one the flow was recorded in (see RECORDED_BROWSER).',
    '   */',
    '  warnings: string[];',
    ...(followsPages
      ? [
          '  /**',
          "   * The page the procedure is on once a step's recorded popup, close or tab",
          '   * switch moved it; every later step runs there. Unset until one does.',
          '   */',
          '  page?: Page;',
        ]
      : []),
    '}',
    'export interface RunOptions {',
    '  /** Absolute URL, or a relative path resolved through the Playwright project baseURL. */',
    '  startUrl?: string;',
    '  run?: FlowRun;',
    '}',
    ...recordedBrowserLines(spec.browser ?? DEFAULT_BROWSER_PROFILE),
    'export function createFlowRun(): FlowRun {',
    '  return { outputs: {}, drift: [], echoed: [], created: [], warnings: [] };',
    '}',
    '/**',
    ' * The wall-clock budget one run of this flow needs under a test runner: every',
    ' * recorded step may spend a settle window, a pick, three click tiers and a 5s',
    " * expectation, so a flow is budgeted per recorded step, never at the runner's",
    ' * 60s default. fwod34 (odoo, 9 flow steps, ~80 recorded steps) ran ~63s to',
    " * its 06-open before that default cut a click's retry short of the force",
    ' * tier that replay reaches. The generated `.spec.ts` applies it with',
    ' * `test.setTimeout(BUDGET_MS)`; your own spec can do the same or override it.',
    ' *',
    ' * Capped, because a per-step sum is not a wall-clock anyone waits out: a',
    ' * 159-step flow summed to 79.5 minutes, longer than the bench harness\'s 600s',
    ' * kill (bench/spec-replay.mjs), so the budget could never fire first and the',
    ' * hang was collected as a SIGKILL with no reason, no stack and no stderr.',
    ' * The cap has to stay well under whatever kills the run from outside, so the',
    ' * test times out as a TEST — naming the step it was in — rather than dying.',
    ' */',
    `export const BUDGET_MS = ${budgetMs(spec)};`,
    '/**',
    ' * Every `[sitelooper drift] …` line this run logged (see `pick` below):',
    ' * Compatibility view of the most recently completed run. New code should',
    ' * use `createFlowRun()` and read `run.drift`, which is invocation-local.',
    ' * A primary locator that missed and the recorded fallback that covered for',
    ' * it. Always exported — even a flow with no multi-candidate step today may',
    " * gain one after a repair — so a caller's assertion never has to guess",
    ' * whether it exists. Attach it from the user spec if you want it in the',
    " * Playwright report: `test.info().attach('sitelooper-drift', { body: run.drift.join('\\n') })`.",
    ' */',
    'export const DRIFT: string[] = [];',
  ];
  for (const helper of helpers) out.push('', ...helper.source);

  out.push('', 'function validateInputs(vars: Vars): void {', '  const missing: string[] = [];');
  for (const variable of spec.vars) {
    const access = `vars[${q(variable)}]`;
    out.push(`  if (typeof ${access} !== 'string' || !${access}.trim()) missing.push(${q(envName(variable))});`);
  }
  out.push('  for (const name of requiredEnvNames) {');
  out.push("    if (!process.env[name]?.trim()) missing.push(name);");
  out.push('  }');
  out.push("  if (missing.length) throw new Error(`missing required flow input${missing.length === 1 ? '' : 's'}: ${[...new Set(missing)].join(', ')}`);");
  out.push('}');

  out.push('', 'export const steps = {');
  for (const [i, b] of bodies.entries()) {
    if (i) out.push('');
    // Compile's verdict on this step, above the step, before its instruction:
    // a reviewer reading the generated file sees WHY it is expected to fail
    // and what to run, not a locator error they will read as app drift.
    for (const d of flagged.get(b.step.id) ?? []) {
      for (const line of formatDiagnostic(d).split('\n')) out.push(`  // ${commentSafe(line)}`);
    }
    out.push(`  /** ${commentSafe(b.step.instruction)} */`);
    // Derived slots are not declared: they are set on `p` only once minted
    // (bindPart), so the index signature carries them.
    const derivedSlots = new Set(b.step.segments.flatMap((s) => Object.keys(s.derived ?? {})));
    const declared = b.slots.filter((s) => !derivedSlots.has(s));
    const p = declared.length
      ? `{ ${declared.map((s) => `${s}: string`).join('; ')}${declared.length < b.slots.length ? '; [slot: string]: string' : ''} }`
      : 'Record<string, string>';
    out.push(`  async ${q(b.step.id)}(page: Page, p: ${p}, outputs: Outputs, run: FlowRun = createFlowRun()): Promise<void> {`);
    for (const line of b.lines) out.push(...line.split('\n').map((l) => (l ? '    ' + l : '')));
    out.push('  },');
  }
  out.push('};');

  out.push('', '/** Runs every step in order. Each call owns its output and drift state. */');
  out.push('export async function runFlow(page: Page, vars: Vars, options: RunOptions = {}): Promise<Outputs> {');
  out.push('  validateInputs(vars);');
  out.push('  const run = options.run ?? createFlowRun();');
  out.push('  run.outputs = {};');
  out.push('  run.drift.length = 0;');
  out.push('  run.echoed = [];');
  out.push('  run.created = [];');
  out.push('  run.warnings = [];');
  if (followsPages) out.push('  run.page = undefined;');
  out.push('  const outputs = run.outputs;');
  out.push('  try {');
  // Judged, never applied: the browser belongs to the test runner (the
  // scaffold applies RECORDED_USE; a mobile project may deliberately differ).
  out.push('    const browserMismatch = profileMismatch(RECORDED_BROWSER, await readLiveBrowser(page));');
  out.push('    if (browserMismatch) {');
  out.push('      run.warnings.push(browserMismatch);');
  out.push("      console.log(`[sitelooper warn] ${browserMismatch}`);");
  out.push('    }');
  out.push("    // Traffic is recorded from the start url on, as the daemon records it from adopting the page.", '    pageTraffic(page);');
  // Bounded like every other goto this file emits: the start url is the one
  // navigation a flow ALWAYS makes, and an unbounded one here hangs the run
  // before the first `[sitelooper step]` line is printed — which is exactly
  // how it reads in a log when it happens.
  out.push(`    await page.goto(options.startUrl ?? ${q(spec.startUrl)}, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });`);
  // `load` fires before a client-rendered app has painted, and the first
  // segment's start page (url, fingerprint) is judged right after — the
  // daemon's runFlow waits for the page to show content here (the shared
  // waitForContent), and a hash-routed app sends a signed-out visitor to its
  // login route only once it has rendered: fwrd75's artifact read `#/tickets`
  // and refused the sign-in segment the daemon had passed three times.
  out.push('    await waitForContent(page).catch(() => {});');
  // …and content is not the end of routing. fwrd78's app painted a static
  // shell (a skip link is content), sat on `#/tickets` while it asked the
  // server who was signed in, and only on the 401 sent the fresh browser to
  // `#/login`: the artifact read the url in between and refused its sign-in
  // segment on both attempts, where the daemon passed twice at tier A. The
  // shared startPageSettled, exactly as the daemon's runFlow waits.
  out.push('    await startPageSettled(page).catch(() => {});');
  for (const [i, b] of bodies.entries()) {
    out.push(`    await test.step(${q(`${b.step.id}: ${b.step.instruction}`)}, async () => {`);
    // The arguments are built INSIDE test.step and before `steps[id]` is
    // called, so a `need` that throws is this step's failure with nothing of
    // this step run — which is the guarantee the check is worth having for.
    out.push(`      await steps[${q(b.step.id)}](page, ${calls[i]}, outputs, run);`);
    out.push(`      console.log(${q(`[sitelooper step] ${b.step.id}`)});`);
    out.push('    });');
  }
  out.push('    return outputs;');
  out.push('  } finally {');
  out.push('    DRIFT.splice(0, DRIFT.length, ...run.drift);');
  out.push('  }');
  out.push('}', '');

  return { source: out.join('\n'), warnings, diagnostics };
}

/** An environment variable name for a run var, so the scaffold has something to pass. */
function envName(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
}

/**
 * The user's half. Written once and never rewritten, so it is deliberately
 * thin: the call, and an invitation to assert whatever this suite cares
 * about. Everything the tool regenerates lives in the `.flow.ts` beside it.
 */
/** Per-step budget: settle (≤2s) + pick + three 5s click tiers + a 5s expectation, with headroom. */
const STEP_BUDGET_MS = 30_000;
const MIN_BUDGET_MS = 120_000;
/**
 * The ceiling on the per-step sum, and the one number here that is about the
 * WORLD rather than the flow. A budget is only worth having if it can fire:
 * the bench harness kills a spec run at 600s (bench/spec-replay.mjs), CI
 * runners and humans are less patient still, and a SIGKILL reports nothing —
 * no failing step, no stack, not even the batched stderr. odoo's 159 recorded
 * steps summed to 4,770,000 ms (79.5 minutes), so its hang was collected as
 * `exit=null, 0/0 passed, 600s` and cost a round to diagnose. Half the
 * harness's kill leaves the test's own timeout room to fire, report the step
 * it was in, and let Playwright write its report. Raising this past what the
 * outermost watchdog allows re-creates that silence, so the two must be
 * changed together.
 */
const MAX_BUDGET_MS = 300_000;

/** The test budget for one run of the whole flow, from its recorded step count. */
export function budgetMs(spec: SpecFlow): number {
  const steps = spec.steps.reduce((n, st) => n + st.segments.reduce((m, seg) => m + seg.steps.length, 0), 0);
  return Math.min(MAX_BUDGET_MS, Math.max(MIN_BUDGET_MS, steps * STEP_BUDGET_MS));
}

export function emitSpecFile(spec: SpecFlow): string {
  const varFields = spec.vars.map((v) => `${key(v)}: process.env[${q(envName(v))}] ?? ''`).join(', ');
  const filename = spec.name.replace(/[^A-Za-z0-9._-]+/g, '_') || 'flow';
  return [
    "import { test } from '@playwright/test';",
    `import { createFlowRun, runFlow, steps, BUDGET_MS, RECORDED_USE } from './${filename}.flow';`,
    '',
    `// The browser the flow was recorded in${spec.browser?.device ? ` (${spec.browser.device})` : ''}. To run it at another size, replace this`,
    "// with your own options (e.g. `test.use({ ...devices['Pixel 7'] })`): layout-dependent locators may",
    '// then miss, and runFlow reports the difference in run.warnings.',
    'test.use(RECORDED_USE);',
    '',
    `test(${q(spec.name)}, async ({ page }) => {`,
    '  // One test runs the whole flow: budget it by its recorded steps, not the 60s default.',
    '  test.setTimeout(BUDGET_MS);',
    '  const run = createFlowRun();',
    '  try {',
    `    const outputs = await runFlow(page, ${varFields ? `{ ${varFields} }` : '{}'}, {`,
    '      run,',
    '      // Set SITELOOPER_TARGET_URL to an absolute URL, or a path resolved through project baseURL.',
    '      startUrl: process.env.SITELOOPER_TARGET_URL,',
    '    });',
    '    // Add your own assertions here; this file is yours and sitelooper never rewrites it.',
    '    // `outputs` has typed keys for every value this flow can publish.',
    '    // `steps` lets you run one generated step on its own.',
    '    // `run.echoed` lists outputs that only echo what the flow typed or selected:',
    '    // do not assert persistence on those without reading them somewhere else.',
    '    void outputs;',
    '    void steps;',
    '  } finally {',
    "    await test.info().attach('sitelooper-drift', {",
    "      body: run.drift.join('\\n'),",
    "      contentType: 'text/plain',",
    '    });',
    '  }',
    '});',
    '',
  ].join('\n');
}
