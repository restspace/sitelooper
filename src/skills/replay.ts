import { changedCreation, dispatchesFirstMatch, isMutatingAction, isReadAction, runStepLifecycle, spansEveryMatch, type StepActionResult } from '../execution/lifecycle.js';
import { outcomeLabel, outcomeOfError, type ActionOutcome } from '../execution/browser.js';
import type { ActionExpectation } from '../execution/action.js';
import { IDENTITY_POLL_MS, IDENTITY_WAIT_MS, SOFT_MATCH_MIN_SIMILARITY, alertVerdict, errorPageVerdict, gotoLandingVerdict, identityMarkerVerdict, isErrorPageUrl, landedOnRecordedPage, markersBound, preconditionVerdict, retargetNavigation, segmentGate, fillableChain, unfilledStepVerdict, urlEffectVerdict, urlRecordParts } from '../execution/gates.js';
import type { UrlSegDiff } from '../execution/url.js';
import { LOOP_SHRINK_WAIT_MS, pageReadable, runFoldedLoop, type LoopPass } from '../execution/loop.js';
import type { Locator, Page } from 'playwright-core';
import { clip, identityRe, identitySource } from '../shared/text.js';
import { cosine, fingerprintPage } from '../daemon/fingerprint.js';
import { candidateExpr, makeLocator, type LocatorCandidate, type StepDiff } from '../daemon/recorder.js';
import { retired, type SnapshotRow } from './repair.js';
import {
  RESOLVE_POLL_MS,
  RESOLVE_WAIT_MS,
  candidateRank,
  identityFields,
  identityValues,
  isDrift,
  resolveCandidates,
  structuralCandidate,
  type CandidateObservation,
  type ResolvePolicy as SharedResolvePolicy,
} from '../execution/resolve.js';
import { isRefTarget } from '../daemon/refs.js';
import { settleDom } from '../daemon/settle.js';
import { TRANSIENT_LINE, fillParams, fillParamsDeep, urlMatches, urlPart, urlPattern } from './compile.js';
import { flattenRead, liveAlerts, liveAlertsObserved, resolveForRead, takeRead, type ObservedAlerts } from '../execution/observe.js';
import {
  addedLines,
  alertsComplete,
  captureLines,
  confirmPresence,
  lineShows,
  observePage,
  presentOnPage,
  renderAlerts,
  renderLines,
  scopeCheckInPage,
  type LineDialect,
  type PageObservation,
} from '../execution/snapshot.js';
import { dismissalAlreadyInEffect, effectExpectation, expectedChangesVerdict, liveLines, namesDialogControl } from '../execution/expect.js';
// The observation dialect and the content-expectation rules live in the
// shared execution modules, where a compiled artifact embeds them too.
// Re-exported so this module's callers need not know which owns the source.
export { lineShows, type LineShowsOptions } from '../execution/snapshot.js';
export { consequentialExpectations, isEchoLine } from '../execution/expect.js';
import { candidateNames, echoVerdict, noteInteraction, setsSomething } from '../execution/echo.js';
import { mayNavigateToDestination, navigateToDestination, textHeldElsewhere } from '../execution/recover.js';
import { CONTEXT_CONTRACT, contractOf, contractVerdict, isVerified, originOf, stepsCarryContext, type Skill, type SkillStep } from './store.js';
import { armPageEffect, describeFramePath, pageIndexVerdict, rootFor, stepEffect, type Root } from '../execution/context.js';

/** Executes one step against the live page, recording it; throws on failure. */
export type StepExecutor = (
  tool: string,
  args: Record<string, unknown>,
  resolved: Record<string, Locator>,
  via: { skill: string; step: number },
  /** What the step's action observation polls for: its expected effect (effectExpectation). */
  action?: { expect?: ActionExpectation },
) => Promise<StepRunResult>;

/**
 * What the executor hands back for one step: its tool result, the recorder's
 * diff (in the dialect it was recorded in, `diff.dialect`), and — when both
 * were taken — the before/after observations the diff was rendered from, so
 * a step whose expectation is in another dialect is judged on a diff rendered
 * in THAT dialect. `captureFailed` marks a diff that could not be taken.
 */
export interface StepRunResult {
  result: string;
  diff?: StepDiff;
  observations?: { before: PageObservation; after: PageObservation };
  captureFailed?: true;
  /** How the action ended, from its observation (src/execution/action.ts). */
  outcome?: ActionOutcome;
  /** The executor's action observation already settled the page after the action. */
  settled?: true;
}

export interface ReplayOptions {
  page: Page;
  exec: StepExecutor;
  signal?: AbortSignal;
  /**
   * Called when a step recorded opening a popup, closing its page or
   * switching tabs has moved the procedure to another page: the session moves
   * its pin there, so the executor acts on the page the replay now uses and a
   * chain's next segment starts on it. Steps without a recorded effect never
   * call it — a stray tab a replayed click opens does not move the replay.
   */
  follow?: (page: Page) => void;
  /**
   * Inline healing for a step whose whole chain missed (site B of PLAN-jev.md).
   * Per call, so a test supplies its own; the daemon registers one for the
   * process with `setInlineHealer`, because the tool layer that builds these
   * options (src/agent/tools.ts) is neutral about deciders and must stay so.
   */
  heal?: InlineHealer;
}

/**
 * What replay tells an inline healer about the step whose locator chain just
 * died, and what a healer may hand back.
 *
 * Stated ENTIRELY in this module's own terms — a skill, a step, a chain, a
 * page — and carrying no idea of what is behind it. That is the whole design
 * of the seam: healing sits exactly where model recovery sits, one tier below
 * a dead chain, and a runner that supplies no healer runs the code path that
 * existed before this type did. Nothing here is in `src/execution`, which a
 * compiled artifact embeds verbatim, so the artifact cannot acquire a
 * recovery tier it never had (see docs/shared-execution.md: the artifact's
 * answer to a dead chain is, and stays, "stop").
 */
export interface HealRequest {
  skill: Skill;
  step: SkillStep;
  /** Human step tag, e.g. "5" or "9.2.1" inside a loop. */
  tag: string;
  /** Which arg the dead chain was for: "target" or "source". */
  key: string;
  /** The dead chain, params already filled — every rung of it missed just now. */
  chain: LocatorCandidate[];
  /** The live page the chain was looked for on. */
  page: Page;
  signal?: AbortSignal;
}

export interface HealProposal {
  /**
   * The replacement locator. A candidate object, never a selector string a
   * model wrote: the healer picks a live element and code builds the locator
   * from it, in the recorder's own candidate order (repair-jev.ts).
   */
  candidate: LocatorCandidate;
  /** One line for the replay's telemetry, its warnings, and the recovery prelude. */
  note: string;
  /**
   * The page's interactive elements the proposal was chosen from, bounded.
   * Carried onto the drift ticket so a repair that happened once becomes a
   * replayable case for bench/jev-repair-probe.mjs — the missing half of
   * site A's corpus (PLAN-jev.md, step-1 status, last bullet).
   */
  rows?: SnapshotRow[];
  /**
   * Called ONCE with the step's own verdict, after the healed locator has been
   * acted on and the step's recorded expectations and effect gates have had
   * their say. This is the label the decision log needs: a heal is "right"
   * exactly when the deterministic verifier that checks every other replayed
   * step accepted it.
   */
  settled?: (verified: boolean) => void;
}

/** A healer declines by returning null, exactly as every `Decider` declines. */
export type InlineHealer = (req: HealRequest) => Promise<HealProposal | null>;

/**
 * The process-wide healer, for callers that cannot pass `ReplayOptions.heal`.
 *
 * `replaySkill` is reached through the neutral tool layer (`run_skill` in
 * src/agent/tools.ts), which knows nothing about System One and must not learn:
 * only the composition root — the daemon — asks whether the tier exists
 * (decide.ts, and the test that enforces it). So the daemon registers the
 * healer once, here, and the tool layer carries nothing new. Null (the
 * default, and CI) is the code path that existed before site B.
 */
let registeredHealer: InlineHealer | null = null;

export function setInlineHealer(healer: InlineHealer | null): void {
  registeredHealer = healer;
}

/**
 * The BLAST RADIUS policy: why this step's dead chain may not be healed
 * inline, or null when it may.
 *
 * A heal acts on the live page on the strength of one ~free judgement, before
 * anything has checked it. What makes that safe is not the judgement — it is
 * that the step's OWN recorded verifier runs immediately afterwards and is
 * indifferent to how the locator was obtained. So the rule is simply: heal
 * only where a wrong answer is either harmless or caught.
 *
 *  - reads observe; a wrong read publishes a wrong value, but the value is
 *    then checked against the step's expectations like any other, and a read
 *    that misses is skipped today, so healing it can only add information.
 *  - a fill/select/check writes into ONE control and the step's own
 *    `addedContains` echoes what it wrote (`- textbox "Part name *": {{v3}}`),
 *    so the wrong field is caught before the form is submitted.
 *  - a click is the one that commits. It is healed only when the recording
 *    left something that will contradict a wrong one: a url pattern, added
 *    lines, or a recorded page effect (a popup/tab/close the runner arms).
 *    A click with nothing to verify it falls to model recovery exactly as it
 *    does today — which is the behaviour this whole site is trying to avoid,
 *    and is still the right answer when nothing can tell success from damage.
 *  - a step that MINTS a record needs the sharpest of those: a wrongly healed
 *    mint is a duplicate record nobody asked for and no later step can undo
 *    (fwod13 finished with two and three orders for exactly this reason), so
 *    added lines are not enough — the url must have to match.
 *
 * And three places where the question is wrong rather than the answer risky:
 * a loop body (its per-record locator is ambiguous BY DESIGN and the cursor is
 * what names this pass's record — a healed single-match locator would pin
 * every pass to one row, which is how fwrd4l edited part A seven times), a
 * target recorded inside a frame (the healer reads the PAGE's elements, so it
 * would propose some other document's control — the same refusal
 * `patchSegment` already makes), and a synthesized read that no run has ever
 * resolved (`unproven`: there is no drift, because there was never a hit).
 *
 * Pure, so it is calibrated by reading it rather than by running a sweep.
 */
export function unhealableWhy(step: SkillStep, key: string, tag: string): string | null {
  if (step.unproven) return 'the step is a synthesized read no run has ever resolved, so nothing about it has drifted';
  if (tag.includes('.')) return 'it is inside a folded loop, whose per-record locator is ambiguous by design';
  if (step.contexts?.[key as 'target' | 'source']?.frame?.length) {
    return `the ${key} was recorded inside ${describeFramePath(step.contexts![key as 'target' | 'source']!.frame!)}, and healing reads the page's own elements`;
  }
  if (isReadAction(step.tool)) return null;
  if (HEAL_WRITE_TOOLS.has(step.tool)) return null;
  if (!HEAL_COMMIT_TOOLS.has(step.tool)) return `the step's tool (${step.tool}) is not one inline healing acts for`;
  const expect = step.expect;
  if (step.mints) {
    return expect?.urlPattern ? null : 'the step brings a record into existence and recorded no url to check it by';
  }
  if (expect?.urlPattern || expect?.addedContains?.length || step.effect) return null;
  return 'the step recorded nothing that would verify a healed locator (no url pattern, no added lines, no page effect)';
}

/** Tools that write into one control: the wrong one is echoed back by the step's own expectation. */
const HEAL_WRITE_TOOLS = new Set(['fill', 'type', 'select', 'check', 'uncheck']);
/** Tools that COMMIT: healed only against a recorded verifier (see unhealableWhy). */
const HEAL_COMMIT_TOOLS = new Set(['click', 'dblclick', 'submit', 'press']);

/**
 * One locator that did not resolve as recorded: either a fallback candidate
 * had to stand in (`used` set — localized drift that self-healed) or nothing
 * in the chain matched (`used` null — the step failed or the read was
 * skipped). Structured so post-session repair can act on it; the prose
 * `warnings` remain for humans and the agent.
 */
export interface LocatorMiss {
  /** Human step tag, e.g. "5" or "9.2.1" inside a loop. */
  step: string;
  /** Which arg the locator was for: "target" or "source". */
  key: string;
  /** The primary (recorded) locator that missed. */
  primary: string;
  /** The fallback that resolved, or null when the whole chain missed. */
  used: string | null;
  /** Chain index of the fallback that resolved (0 is the primary). */
  usedIndex?: number;
  /** Which skill the miss belongs to, set when misses from a segment chain are aggregated. */
  skill?: string;
  /**
   * The whole chain missed and the step ran on a locator proposed INLINE
   * (site B). `used` is that locator's expression, so every reader that
   * already understands "a fallback stood in" reads this one too; these three
   * fields say it was not one of the recorded rungs.
   *
   * EVIDENCE, NOT MUTATION. Nothing here rewrites the stored skill: the
   * proposal travels on the drift ticket and is only patched into the chain
   * later, by the ordinary drain, and only for a run that got past the step —
   * the rule `recordCandidateEvidence` already documents. A heal that ran and
   * was then contradicted by the step's own gates is a ticket that says so.
   */
  healed?: true;
  /** The proposed candidate itself, so the later drain can patch without asking a model again. */
  proposal?: LocatorCandidate;
  /** The page's interactive elements the proposal was picked from, bounded (see HealProposal.rows). */
  rows?: SnapshotRow[];
}

export interface ReplayResult {
  ok: boolean;
  skill: string;
  stepsRun: number;
  stepsTotal: number;
  /** 1-based, when !ok. */
  failedAt?: number;
  reason?: string;
  /** Live read-back values, keyed by the step's label or `readN`. */
  values: Record<string, string>;
  /**
   * Labels of read-backs whose value merely echoes something the skill itself
   * put on the page earlier this run — a fill value, or the name of an option
   * it clicked. Such a read confirms the control still shows what we typed or
   * chose, NOT that the app persisted it: grafana's top-bar time picker reads
   * back "Last 6 hours" (the option the skill clicked) whether or not the save
   * actually stored the range, so the flow reported a persisted time range the
   * API says was dropped. The caller drops these from the report's confident
   * values so a replay never claims a persist it only echoed.
   */
  echoedValues: string[];
  /** Per-step lines for the tool result. */
  lines: string[];
  /** Soft-expectation misses: logged, never fatal in Stage 1. */
  warnings: string[];
  /**
   * Steps whose effect evidence could not be captured at all — the page
   * signature race timed out, the frame went away mid-navigation. The step's
   * REQUIRED expectations are still evaluated against the live page (see
   * expectedChanges), so this is not a pass; it records that one leg of the
   * evidence was missing, which a caller deciding whether to PROMOTE a
   * procedure must see. An empty diff is a real observation and never lands
   * here; only a failed one does.
   */
  unobserved: string[];
  fallthroughs: number;
  /** Structured record of every locator that missed its primary. */
  misses: LocatorMiss[];
  /**
   * Steps whose dead chain was healed inline and which then ran. Optional
   * because it is new: every existing construction of a ReplayResult (tests,
   * the segment-walk's `{ ...replay }` clones) is still a legal one, and a
   * replay with no healer never sets it.
   */
  healed?: { step: string; key: string; locator: string; note: string; verified?: boolean }[];
  /**
   * Per-candidate outcomes from the pass that resolved: which chain index won
   * and which were rejected with the element demonstrably present. The caller
   * folds these onto the stored chain only if the run past this point
   * succeeded, so a candidate is retired for being repeatedly WRONG, never for
   * looking wrong.
   */
  candidateEvidence: { step: string; key: string; hit: number; missed: number[]; skill?: string }[];
  /** Values this replay itself minted and bound ({{dN}} derived params), for later segments and callers. */
  derivedValues: Record<string, string>;
  /**
   * Identifiers of records this replay BROUGHT INTO EXISTENCE, read off the
   * live url as each minting step ran. Past one of these a stop is not a
   * clean slate, and recovery must be told so by name.
   */
  created: string[];
  /**
   * A state-changing action was DISPATCHED — whether or not the step it
   * belonged to went on to complete. The page may have changed, so this
   * replay is not repeatable and no sibling candidate may be tried after it.
   */
  acted: boolean;
  /**
   * What is known about the last state-changing action this replay attempted:
   * its observation's outcome when it ran, what its error proved when it
   * threw. A stop whose last action was `not-dispatched` left that action
   * undone; `unknown` may not have.
   */
  outcome?: ActionOutcome;
  /**
   * Url patterns whose literal segment(s) disagreed with the live url while
   * everything else matched (mechanism 2, PLAN-replay-v2). The replay
   * proceeded optimistically; the caller persists the generalised pattern
   * onto the skill only once the run past that point succeeded — the segment
   * has then demonstrated volatility.
   */
  generalisations: { kind: 'precondition' | 'expect'; step?: number; pattern: string }[];
  /**
   * The url segment diffs those same expectations treated as volatile, raw.
   *
   * A generalisation is a promise about the SKILL and is only kept once the run
   * walked past the segment; a diff is an observation about the ENVIRONMENT and
   * is true either way, so this list survives a stop where `generalisations`
   * does. The flow runner turns it into variance evidence for the ledger and
   * for the next run (ledger.ts `urlVarianceValues`, flow.ts
   * `FlowStep.urlVariance`): fwgr41-n2 watched the dashboard uid change one
   * step before it stopped on the recorded uid being gone, and n3 had nothing
   * but the characters to go on again.
   */
  urlDiffs: UrlSegDiff[];
  /** Cosine similarity between the stored start-page fingerprint and the live page, if both exist. */
  similarity: number | null;
  url: string;
  /** The replay never started (wrong page / bad params) — nothing was touched. */
  refused?: boolean;
  /**
   * The refusal was that the page is PAST this procedure's start: the url
   * already carries the record the procedure creates (gates.ts
   * PreconditionVerdict.past). The step's mutation has already happened, so
   * the flow runner lets a read-only sibling that carried the step take the
   * pin (fwod68 03-open: the rescue of a save that a graduated earlier step
   * now performs).
   */
  pastStart?: boolean;
  /**
   * The refusal was an IDENTITY mismatch: right template, wrong record. The
   * caller cannot fix this by trying another skill — every skill for this
   * procedure will refuse the same page — so the flow runner returns the
   * browser to the flow's start url before recovery, instead of letting a
   * model "repair" the step on whatever record happens to be open (which is
   * how fwrd8-n2/n3 did the whole flow's work on a seed ticket).
   */
  wrongRecord?: string;
}

const MAX_LINE = 160;

/**
 * Replay a stored skill deterministically: precondition → each step with its
 * locator chain → expectation check → next. Stops at the first failure and
 * hands back exactly what ran, so the agent can continue from the real page
 * state without repeating anything.
 */
export async function replaySkill(
  skill: Skill,
  params: Record<string, string>,
  opts: ReplayOptions,
): Promise<ReplayResult> {
  // Not fixed for the run: a step recorded opening a popup, closing its page
  // or switching tabs moves the procedure, and every later step, gate and
  // look is asked of the page it moved to.
  let page = opts.page;
  const res: ReplayResult = {
    ok: false,
    skill: skill.id,
    stepsRun: 0,
    stepsTotal: skill.steps.length,
    values: {},
    echoedValues: [],
    lines: [],
    warnings: [],
    unobserved: [],
    fallthroughs: 0,
    misses: [],
    derivedValues: {},
    generalisations: [],
    urlDiffs: [],
    candidateEvidence: [],
    created: [],
    acted: false,
    similarity: null,
    url: page.url(),
  };

  // Values the skill puts on the page as it runs — fill/type values, and the
  // names of options it clicks. A later read that returns one of these is an
  // echo (confirming the control, not app persistence); see echoedValues and
  // the shared rule, src/execution/echo.ts, which the artifact embeds.
  const interacted = new Set<string>();
  // A recorded dialog that did not open (see StepVerdict.absentDialog): while
  // set, a step whose target cannot be found AND which names one of that
  // dialog's own controls is skipped as belonging to it; cleared by the next
  // step that resolves its target normally, or by the first step that misses
  // without belonging to the dialog.
  let absentDialog: { name: string; lines: string[] } | null = null;

  // Copy the caller's bindings: derived ({{dN}}) values minted mid-replay are
  // bound into this map as steps execute, so later steps see them.
  params = { ...params };

  // Url positions THIS replay has watched vary: the diffs a step's url
  // expectation found (urlEffectVerdict), which it treated as volatile. A
  // later navigation whose recorded target still spells the stale value there
  // is retargeted to the live one by the shared retargetNavigation — the
  // artifact keeps the same list per segment, which is this same scope (one
  // segment, one replayed skill).
  //
  // It IS `res.urlDiffs` — what this replay acts on and what it reports to the
  // flow runner as variance evidence are one observation, and a stop must not
  // lose it (fwgr41-n2 made this observation one step before it stopped).
  const volatileUrl: UrlSegDiff[] = res.urlDiffs;

  // Belt and braces. SkillStore excludes a procedure this build cannot run at
  // the read, which covers every selection path — but a skill can also arrive
  // as an object: lowered from a spec, staged by re-record, handed in by a
  // test. Refusing here means no route reaches execution unchecked.
  const contract = contractVerdict(skill);
  if (!contract.ok) {
    res.refused = true;
    res.reason = `${skill.id} ${contract.why} — nothing was run`;
    return res;
  }
  // A procedure whose steps carry frame or page context under an older stamp
  // was written by something that did not know what the stamp promises (a
  // hand edit, a merge); a build that reads the stamp would not follow them.
  // Asked of the context contract alone: a navigating procedure stamped before
  // contract 4 is still run (see SKILL_CONTRACT), so contractFor is not the bar.
  if (stepsCarryContext(skill.steps) && contractOf(skill) < CONTEXT_CONTRACT) {
    res.refused = true;
    res.reason = `${skill.id} carries frame or page context its contract ${contractOf(skill)} does not declare (it needs ${CONTEXT_CONTRACT}) — nothing was run`;
    return res;
  }

  const missing = Object.keys(skill.params).filter((p) => !(p in params) || params[p] === '');
  if (missing.length) {
    res.refused = true;
    res.reason = `missing params: ${missing.map((m) => `${m} (e.g. ${JSON.stringify(skill.params[m].example)})`).join(', ')} — nothing was run`;
    return res;
  }

  // The segment's gate — where it starts, and whose record it is — runs
  // immediately before its first PAGE-DEPENDENT step (shared segmentGate),
  // not before step 1: a goto, a viewport, a wait for `body` look at no page,
  // and gating them asked the page being LEFT (fwrd53 07-report asked a list
  // for a detail page's markers). A segment with no such step is never gated.
  const gate = segmentGate(skill.steps);
  // Measured where the segment starts, as before, whenever the gate will not
  // measure it itself: the similarity is drift telemetry too (repair.ts).
  if (skill.preconditions.fingerprint && (gate.at === 0 || gate.afterNavigation)) {
    res.similarity = cosine(skill.preconditions.fingerprint, (await fingerprintPage(page)) ?? undefined);
  }

  // Identity: the url pattern and the fingerprint both match every record of
  // this template, so neither can tell ticket t15 from ticket t14. A segment
  // that started on a page showing caller-vouched values must find them
  // again, or it is about to do this run's work on someone else's record.
  //
  // Asked after a navigation inside the segment, never skipped for it: the
  // recorded goto carries the RECORDING run's record id. fwod10 replayed
  //   goto .../web#id=44&...&model=res.partner
  // and steps 03-07 did this run's work on n1's records at tier A, published
  // no values, reported success, and verified 1/6.
  const checkIdentity = async (): Promise<boolean> => {
    for (const marker of skill.preconditions.requireText ?? []) {
      const want = fillParams(marker, params);
      if (!want || /\{\{/.test(want)) continue; // unbound marker proves nothing
      // Bounded, not substring: a marker matched anywhere inside a longer run
      // of letters/digits cannot tell t15 from t150, and this is the ONLY gate
      // that can tell records of one template apart at all.
      // Asked in dialect 2 — a marker is text, not a recorded line, and a
      // record's name inside a frame or an open shadow root is on the page
      // too. A look that cannot establish absence (a cap, an unread frame, a
      // virtualised list) sweeps the page once and asks again; still unknown
      // is a refusal of its own, NOT a wrong record: nothing showed a
      // different record, only that this one could not be confirmed.
      //
      // Waited for, not asked once: a page that has not finished arriving
      // cannot say which record it is. The compiled artifact already polls
      // IDENTITY_WAIT_MS here (emit.ts identityChecks) whenever the live url
      // does not already name this run's record; replay looked exactly once,
      // and fwgr47-n2 07-verify stopped on the RIGHT dashboard (that run's
      // own verifier: "obj 6: PASS — uid bfyfuaptu20aoa reported") because
      // step 1 was a goto to a BARE dashboard url grafana normalises a moment
      // later. Replay looked during the boot and the flow fell back 21 turns.
      // Same budget, same condition, so the two runners decide alike
      // (test/execution-parity.test.ts).
      const pattern = skill.preconditions.urlPattern;
      const urlNamesRecord = Boolean(urlRecordParts(pattern, page.url(), params));
      let seen = await confirmPresence(page, [want], 2, { whole: true });
      if (!urlNamesRecord) {
        const deadline = Date.now() + identityWaitMs();
        while (seen.presence !== 'present' && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, Math.max(1, Math.min(IDENTITY_POLL_MS, deadline - Date.now()))));
          seen = await confirmPresence(page, [want], 2, { whole: true });
        }
      }
      if (seen.presence === 'present') continue;
      // A url that already names this run's record answers the question the
      // marker was asking; a marker missing there is stale, not another record
      // (fwgr39-n3 05-set). Shared with the compiled spec (identityMarkerVerdict).
      //
      // Read HERE, after the wait, never at the first look: fwgr47-n2's url
      // carried neither of the pattern's bound query keys while the app was
      // still rewriting it, which is the one reason urlRecordParts failed —
      // and it is a reason that expires. A url naming another record does not
      // expire, so this re-ask can only rescue the page that had not arrived.
      const verdict = identityMarkerVerdict(pattern, page.url(), params, want, seen.presence);
      if (verdict.pass) {
        if (verdict.warning) res.warnings.push(verdict.warning);
        continue;
      }
      if (seen.presence === 'unknown') {
        res.refused = true;
        res.reason = `could not confirm that the page at ${urlPattern(page.url())} shows ${JSON.stringify(clip(want, 60))} (capture incomplete: ${clip(seen.why ?? 'coverage unknown', 160)}) — nothing was run`;
        if (!res.unobserved.includes('identity')) res.unobserved.push('identity');
        return false;
      }
      res.refused = true;
      // "A different record" is the gate's reading when the page is the
      // recorded template. When the page's structure measured far from the
      // recording's, that reading is not established: say what was measured.
      const unlike = typeof res.similarity === 'number' && res.similarity < SOFT_MATCH_MIN_SIMILARITY;
      res.wrongRecord = unlike
        ? `the page at ${urlPattern(page.url())} does not show ${JSON.stringify(clip(want, 60))}, and its structure is not the recorded page's (similarity ${res.similarity}) — a different view or page, not only a different record — nothing was run`
        : `the page at ${urlPattern(page.url())} does not show ${JSON.stringify(clip(want, 60))} — it matches this procedure's page template but is a different record — nothing was run`;
      res.reason = res.wrongRecord;
      return false;
    }
    return true;
  };

  /**
   * The gate, before step `n`. False when it stopped the replay (reason set).
   * Nothing dispatched yet (`acted` false): a REFUSAL, and the next candidate
   * may try. Something already ran (a goto, an earlier step): a partial stop
   * at `n` — trying another candidate would run it from a page nobody expects,
   * so the caller hands it to recovery; `wrongRecord` still tells the flow
   * runner to put the browser back on the flow's start url first.
   */
  const passGate = async (n: number): Promise<boolean> => {
    const { urlPattern: pattern, requireText } = skill.preconditions;
    let passed = true;
    if (!gate.afterNavigation) {
      // The url first, then the measurement: both describe the page as the
      // gate found it, not where a navigation in flight landed meanwhile.
      const url = page.url();
      if (skill.preconditions.fingerprint) {
        res.similarity = cosine(skill.preconditions.fingerprint, (await fingerprintPage(page)) ?? undefined);
      }
      // Strict, then soft-with-fingerprint, else refuse: the shared verdict
      // (src/execution/gates.ts, preconditionVerdict) decides; this runner only
      // supplies the fingerprint similarity it measured and books the result.
      // …and the positions this procedure mints, so a page already carrying
      // the record it would create is refused as past its start (fwod66).
      const mints = skill.steps.flatMap((s, i) => (s.mints ? [{ at: s.mints.at, step: i + 1 }] : []));
      const verdict = preconditionVerdict(pattern, url, params, res.similarity, mints);
      if (verdict.refuse) {
        res.refused = true;
        if (verdict.past) res.pastStart = true;
        res.reason = `${verdict.refuse} — nothing was run`;
        passed = false;
      } else {
        res.warnings.push(...verdict.warnings);
        if (verdict.soft) res.generalisations.push({ kind: 'precondition', pattern: verdict.soft.generalised });
      }
    } else if (!landedOnRecordedPage(pattern, page.url())) {
      // An older skill's navigation left the template its gate was observed
      // on (shared landedOnRecordedPage): nothing recorded describes this page.
      return true;
    }
    if (passed && requireText?.length) passed = await checkIdentity();
    if (passed) return true;
    if (res.acted) {
      res.refused = false;
      res.failedAt = n;
      res.url = page.url();
      const said = `— stopped before step ${n}`;
      res.reason = res.reason?.replace(/— nothing was run$/, said);
      if (res.wrongRecord) res.wrongRecord = res.wrongRecord.replace(/— nothing was run$/, said);
    }
    return false;
  };
  if (gate.at === 1 && !(await passGate(1))) return res;

  // Heals made by the step currently running, awaiting its verdict. The
  // label a heal's decision log needs is "did the step's own gates accept
  // it", which is known only after the step returns — see the runOneStep
  // wrapper below.
  const pendingHeals: HealProposal[] = [];
  const healer = opts.heal ?? registeredHealer;

  /**
   * Site B of PLAN-jev.md: the whole chain for `key` missed, so ask the
   * healer for a live locator instead of failing the step to a model
   * recovery (tens of turns, minutes of wall-clock, for what is usually a
   * renamed control). Returns the locator to act on, or null to fail exactly
   * as before.
   *
   * Two guards in THIS module, on top of whatever the healer applied to its
   * own answer, because a healer is an injected stranger and the failure
   * modes are known: the policy above decides whether the step may be healed
   * at all, and the proposal must resolve to exactly ONE element on the live
   * page. The second is site A's measured weakness — N identically named rows,
   * where the chooser picks the first at ≤0.77 — which post-session repair
   * catches in `patchSegment`'s resolves-to-one check. Healing acts before any
   * review, so it makes the same check itself, first.
   */
  const tryHeal = async (step: SkillStep, tag: string, key: string, chain: LocatorCandidate[], missOf: string): Promise<Locator | null> => {
    if (!healer) return null;
    const why = unhealableWhy(step, key, tag);
    if (why) {
      res.warnings.push(`step ${tag}: the ${key} chain is dead and was not healed inline — ${why}`);
      return null;
    }
    let proposal: HealProposal | null = null;
    try {
      proposal = await healer({ skill, step, tag, key, chain, page, ...(opts.signal ? { signal: opts.signal } : {}) });
    } catch {
      // A healer that throws is a healer that is absent: the step falls to
      // the model, which is what it did before there was one.
      return null;
    }
    if (!proposal) return null;
    const expr = candidateExpr(proposal.candidate);
    let locator: Locator;
    try {
      locator = makeLocator(page, proposal.candidate);
      const count = await locator.count();
      if (count !== 1) {
        proposal.settled?.(false);
        res.warnings.push(`step ${tag}: an inline heal proposed ${expr}, which matches ${count} element(s) on this page — refused, a locator that names several things names none`);
        return null;
      }
    } catch {
      proposal.settled?.(false);
      return null;
    }
    pendingHeals.push(proposal);
    (res.healed ??= []).push({ step: tag, key, locator: expr, note: proposal.note });
    // A heal IS drift — the recorded chain did not work — so it counts as a
    // fallthrough and files its miss, exactly as a fallback that stood in
    // does. What is different is only that the locator came from the live
    // page rather than from the chain, which the three fields below say.
    res.fallthroughs++;
    res.misses.push({
      step: tag,
      key,
      primary: chain[0] ? candidateExpr(chain[0]) : '(none recorded)',
      used: expr,
      healed: true,
      proposal: proposal.candidate,
      ...(proposal.rows?.length ? { rows: proposal.rows } : {}),
    });
    res.warnings.push(`step ${tag}: ${missOf}; ${proposal.note}`);
    return locator;
  };

  // One step against the live page. Mutates `res` (lines/warnings/values/
  // stepsRun) and returns how it went; a 'stop' has already set failedAt/reason.
  // `tag` labels the step for humans (e.g. "5" or, inside a loop, "9.2.1");
  // `failIndex` is the top-level step number recorded in failedAt on a stop.
  const runStepBody = async (
    step: SkillStep,
    tag: string,
    failIndex: number,
    /** When set (loop bodies), collects what each target actually resolved to, and is checked before acting (the loop's progress guard). */
    sink?: LoopPass,
    /** Loop-body cursor: which match an ambiguous per-record locator should act on (see resolveChain). */
    ambiguousNth?: number,
  ): Promise<'ran' | 'skipped' | 'stop'> => {
    const args = fillParamsDeep(step.args, params) as Record<string, unknown>;
    // A slot the run could not fill "asks for no particular value" — the
    // reading every marker gate here already takes (markersBound,
    // urlRecordParts, gotoLandingVerdict). It is the right reading for a
    // CHECK and the wrong one for an ACTION: fillParams leaves `{{v2}}`
    // standing, so a type would put those five characters into a live field
    // and a locator would hunt the page for them. bindSkill now leaves two
    // adjacent slots UNBOUND rather than guess where one ends, so this is a
    // reachable state, not a theoretical one.
    //
    // Widened for the args since fwod56: `fillParams` is a SINGLE pass, so a
    // param bound to `{{05-open.quotation_reference}}` substitutes that text
    // into the args and nothing re-scans it — the slot IS in `params`, so the
    // membership question above cannot see it. The args arm therefore asks
    // expect.ts's question instead (any `{{…}}` but the wildcard), which is
    // what an expectation over the same value has asked all along; the marker
    // and check arms keep the narrow reading.
    //
    // Not a hard stop — a fallback, like every other replay stop: the step is
    // handed to the model, which is the whole point of the trade that made
    // the slots unbound. Reads, waits and checks are untouched; they keep the
    // "asks for nothing" reading. The locator chains go in unfilled because
    // the shared predicate keys on membership in `params`, never on what the
    // text looks like, so filling them first could not change its answer.
    const acts = isMutatingAction(step.tool) || step.tool === 'goto';
    if (acts) {
      const unfilled = unfilledStepVerdict({ args, locators: step.locators }, params, `step ${tag}`);
      if (unfilled) {
        res.failedAt = failIndex;
        res.reason = `${unfilled} — nothing was dispatched`;
        res.lines.push(`${tag}. ${step.tool} → FAILED: ${unfilled}`);
        return 'stop';
      }
    }
    // A recorded goto target is a literal from the RECORDING's run. Where this
    // replay has already watched one of its positions vary, the shared verdict
    // sends the browser to the live value instead — and says so when it cannot,
    // which is the cause the alert gate reports if the landing then talks back
    // (fwgr41-n3 06-find: step 6 saw the dashboard uid vary, step 7 went to the
    // recorded one and Grafana said "Dashboard not found").
    let navigatedToStale: string | undefined;
    if (step.tool === 'goto' && typeof args.url === 'string') {
      const retarget = retargetNavigation(args.url, page.url(), volatileUrl, `step ${tag}`);
      if (retarget.warning) res.warnings.push(retarget.warning);
      navigatedToStale = retarget.stale;
      args.url = retarget.url;
    }
    const head = `${tag}. ${step.tool} ${describeArgs(step.tool, args)}`;

    // The agent's observation turns were implicit waits; a replay has none,
    // so let the DOM go quiet before looking for this step's target. Generic
    // (no network-idle, no app knowledge) and instant on a static page.
    await settleDom(page);

    // A step recorded on another of the browser's pages (a popup, a tab) is
    // not this page's step: asked here, before anything resolves, it stops
    // rather than pressing the opener's identical control.
    const offPage = pageIndexVerdict(page, step.page, `step ${tag}`);
    if (offPage) {
      res.failedAt = failIndex;
      res.reason = offPage;
      res.lines.push(`${head} → FAILED: ${offPage}`);
      return 'stop';
    }

    // A read/read_all is an OBSERVATION, not a state change: its failure means
    // a value could not be re-captured, never that the procedure is broken. So
    // a read that cannot resolve or errors is skipped with a warning and the
    // replay continues — only an action step (click/fill/submit) or a hard
    // expectation stops it. read_all also legitimately matches many elements,
    // so its target need not be unique.
    const isRead = isReadAction(step.tool);

    // Resolve every target through its chain before touching the page.
    const resolved: Record<string, Locator> = {};
    let resolveError: string | null = null;
    // Whether ANY target of this step resolved through a structural candidate
    // — position, not identity. Sharpens the effect gate below: a positional
    // resolution must be corroborated by a consequential page change, not by
    // the fill's own echo.
    let positionalResolution = false;
    // A wait for absence whose chain resolved nothing: the condition is met
    // by that emptiness, so there is nothing to dispatch — but the step still
    // owes its postconditions (url, recorded effects), so it goes through the
    // lifecycle with an empty action rather than returning here.
    let absenceMet = false;
    // The roots each target resolved against (src/execution/context.ts): the
    // page, or the recorded frame. A frame that is not there is a stop of its
    // own — never a search of the main page — and none of the recovery rungs
    // below apply to it: they act on the page.
    const roots: Record<string, Root> = {};
    let frameMissed = false;
    for (const key of ['target', 'source'] as const) {
      if (!(key in args)) continue;
      // A chain is a PREFERENCE ORDER, not a conjunction (shared fillableChain):
      // a rung naming a slot this run could not fill — fwod34's `#name_{{d2}}`,
      // where d2 is a url-pattern wildcard and never a value — can only ever
      // waste a resolve attempt, so it is dropped and the rungs behind it take
      // the step. A chain with no live rung left never reaches here: the verdict
      // above stopped the step, and only for a step that acts.
      const recorded = acts ? fillableChain(step.locators[key] ?? [], params) : (step.locators[key] ?? []);
      const chain = (fillParamsDeep(recorded, params) as LocatorCandidate[]) ?? [];
      const identity = identityOfPrimary(recorded, skill, params);
      // An absence wait allows several matches too: a chain that still
      // matches two visible elements has NOT met "hidden", and reading the
      // policy's 'ambiguous' miss as "nothing matched → condition met" was a
      // false success in both runners. Several still there resolve, and are
      // then waited on to go, exactly as one would be.
      const absence = waitsForAbsence(step, args);
      // "May match several" follows the DISPATCH, not the tool name: a step
      // that spans every match (read_all, a count read or wait) or that acts
      // on the first one (every other wait — tools.ts waitFor dispatches
      // `loc.first()`) has not failed to name its element by matching two.
      // Absence was the only wait let through here, which stopped grafana
      // fwgr43's `wait_for h2 state:visible` on both replays with three
      // panel headings on the page — the very thing the wait was for.
      // Inside a folded loop the cursor is what names THIS pass's record, so a
      // wait that could be narrowed to it must not be widened back to match 0;
      // a step that spans every match, and an absence wait, were plural before
      // the cursor existed and stay so.
      const multiple =
        spansEveryMatch(step.tool, args) || absence || (dispatchesFirstMatch(step.tool, args) && ambiguousNth === undefined);
      const policy = {
        rawTarget: typeof args[key] === 'string' ? String(args[key]) : '',
        allowMultiple: multiple,
        ambiguousNth,
        requireIdentity: identity,
        // Polling to FIND something that is supposed to be gone only delays
        // the answer; the absence is the condition (see waitsForAbsence).
        waitMs: absence ? 0 : resolveWaitMs(),
        stayOnOrigin: originOf(step.expect?.urlPattern ?? '') ?? originOf(page.url()) ?? undefined,
      };
      const framed = await rootFor(page, step.contexts?.[key]?.frame, policy.waitMs);
      if ('error' in framed) {
        // Nothing can be visible in a frame that is not there, so an absence
        // wait is met; an ambiguous frame is not an absent one.
        if (absence && framed.missing) {
          absenceMet = true;
          break;
        }
        frameMissed = true;
        resolveError = `${framed.error}, so the ${key} recorded inside it (${describeFramePath(step.contexts![key]!.frame!)}) was not looked for on the page`;
        res.misses.push({ step: tag, key, primary: chain[0] ? candidateExpr(chain[0]) : '(none recorded)', used: null });
        break;
      }
      const root = (roots[key] = framed.root);
      // A read is an observation: the shared resolveForRead sweeps the page
      // and asks once more before giving up on it, exactly as the artifact does.
      const hit = isRead
        ? await resolveForRead(page, (again) => resolveChain(page, chain, again ? { ...policy, waitMs: 0 } : policy, root))
        : await resolveChain(page, chain, policy, root);
      if (!hit) {
        // A wait for an element to be HIDDEN is satisfied by its absence: the
        // step's own success condition is "nothing matches", so a dead chain
        // here is the recorded outcome, not drift. fwrd42's 06-report waited
        // for a deleted part's text to go and filed a drift ticket on every
        // run, which no repair could clear because nothing was wrong.
        if (absence) {
          absenceMet = true;
          break;
        }
        const dead = `no element matched any known locator for ${key}${chain.length ? ` (tried ${chain.length}: ${chain.slice(0, 3).map(candidateExpr).join(', ')}${chain.length > 3 ? ', …' : ''})` : ' (none recorded)'}`;
        // One rung BELOW the recorded chain and one ABOVE model recovery: a
        // locator proposed from the live page, which the step's own recorded
        // expectations then verify exactly as they verify a replayed one.
        const healedLocator = await tryHeal(step, tag, key, chain, dead);
        if (healedLocator) {
          resolved[key] = healedLocator;
          if (setsSomething(step.tool)) noteInteraction(interacted, candidateNames(chain as { name?: unknown; label?: unknown }[]));
          continue;
        }
        resolveError = dead;
        res.misses.push({ step: tag, key, primary: chain[0] ? candidateExpr(chain[0]) : '(none recorded)', used: null });
        break;
      }
      resolved[key] = hit.locator;
      if (structural(hit.candidate)) positionalResolution = true;
      // Evidence ONLY from a pass whose winner names something. When a
      // structural path won, that is precisely the resolution we distrust —
      // it may have acted on whatever sorted into that position — and banking
      // it would retire the anchors that missed and confirm the path that hit,
      // turning one bad resolution into a permanent one. fwrd26l did exactly
      // that: its 8/8 zero-model replay had retired two identity anchors in
      // favour of `tr:nth-of-type(1)`.
      if (hit.missed.length && !structural(hit.candidate)) {
        res.candidateEvidence.push({ step: tag, key, hit: hit.index, missed: hit.missed });
      }
      sink?.entries.push(`${key}=${candidateExpr(hit.candidate)}`);
      // Record what this action put on the page (see `interacted`). Only for
      // non-read steps: a read observes, it does not set. The accessible name
      // of a clicked option ("Last 6 hours") is the value it selects.
      // Only a step that can SET or SELECT something counts (setsSomething).
      if (setsSomething(step.tool)) noteInteraction(interacted, candidateNames(chain as { name?: unknown; label?: unknown }[]));
      // Drift only when a candidate tried ahead of the winner FAILED (the shared
      // isDrift): a positional primary ranked behind a name that won was never missed.
      if (isDrift(hit)) {
        res.fallthroughs++;
        res.misses.push({ step: tag, key, primary: candidateExpr(chain[0]), used: candidateExpr(hit.candidate), usedIndex: hit.index });
        res.warnings.push(`step ${tag}: ${hit.missed.includes(0) ? 'primary locator did not resolve' : 'a better-ranked locator did not resolve'}; used fallback #${hit.index + 1} ${candidateExpr(hit.candidate)}`);
      }
    }
    // A typed/filled value is likewise something the skill put on the page.
    if (setsSomething(step.tool)) noteInteraction(interacted, [args.value, args.text]);
    if (!resolveError) absentDialog = null;
    if (resolveError) {
      if (isRead) {
        res.warnings.push(`step ${tag}: skipped read — ${resolveError}`);
        res.lines.push(`${head} → skipped (${resolveError})`);
        return 'skipped';
      }
      // Never a target recorded inside a frame: the dialog's controls were
      // recorded on the page, and a frame step is not one of them.
      if (absentDialog !== null && !step.contexts?.target?.frame?.length && !step.contexts?.source?.frame?.length) {
        // Membership is proven against the dialog's own recorded subtree, not
        // inferred from the target being missing. A step that names a control
        // the dialog listed was inside it; anything else — a later,
        // independent action whose locator simply broke — must fail, which is
        // what a bare "target missing after an absent dialog" used to swallow.
        const inside = namesDialogControl(step, absentDialog.lines, params);
        if (inside && step.mints) {
          res.warnings.push(`step ${tag}: names a control of the absent dialog ${JSON.stringify(absentDialog.name)} but is declared record-minting — not skipped, because skipping a mutation cannot be undone`);
        } else if (inside) {
          res.warnings.push(`step ${tag}: skipped — acts on ${JSON.stringify(inside)}, a control of the dialog ${JSON.stringify(absentDialog.name)}, which did not open this time`);
          res.lines.push(`${head} → skipped (dialog ${JSON.stringify(absentDialog.name)} did not open)`);
          return 'skipped';
        } else {
          res.warnings.push(`step ${tag}: target missing after the absent dialog ${JSON.stringify(absentDialog.name)}, but it names nothing that dialog contained — treated as this procedure's own step, not part of the dialog`);
          absentDialog = null;
        }
      }
      // A dismissal whose dialog is not on the page is already in effect (the
      // shared dismissalAlreadyInEffect): the dialog it was recorded closing
      // appeared on its own — nothing in this procedure opened it, so
      // `absentDialog` above cannot know about it — and on this run it never
      // came. Asked only after the resolve window, and never of a frame step.
      if (!step.contexts?.target?.frame?.length && !step.contexts?.source?.frame?.length && step.expect?.removedContains?.length) {
        const done = dismissalAlreadyInEffect(step, await captureLines(page, dialectOf(step)), params);
        if (done) {
          res.warnings.push(`step ${tag}: skipped — it closes the dialog ${JSON.stringify(done.dialog)} with ${JSON.stringify(done.control)}, and that dialog is not open this time: already in effect`);
          res.lines.push(`${head} → skipped (dialog ${JSON.stringify(done.dialog)} not open — already in effect)`);
          return 'skipped';
        }
      }
      // Navigation by recorded destination (PLAN-replay-v2 "order of
      // application", rung 3). A navigation step's recorded EVIDENCE includes
      // where it landed; the clicked affordance (a recents list, a shortcut —
      // anything session-local) may be gone on a fresh browser, but the
      // destination is what the step was for. Two sub-rungs, because this is
      // testing how the app works for a HUMAN: (a) another link on the page
      // to the same destination — click that, exercising the app's own
      // navigation; (b) only then, and only when the destination is fully
      // concrete (params/derived filled, nothing volatile left), navigate
      // there directly. Both are logged as fallthroughs so drift telemetry
      // and post-session repair still see the miss.
      // The rule and both rungs are the shared src/execution/recover.ts.
      const destPattern = step.expect?.urlPattern;
      if (!frameMissed && mayNavigateToDestination(step.tool, destPattern, page.url(), params, tag.includes('.'))) {
        const exec = (tool: string, a: Record<string, unknown>, r: Record<string, Locator>) => opts.exec(tool, a, r, { skill: skill.id, step: failIndex });
        const arrived = await navigateToDestination(page, destPattern, params, {
          click: (locator, selector) => exec('click', { target: selector }, { target: locator }),
          goto: (url) => exec('goto', { url }, {}),
        });
        // The substitute link's click may have landed: a stop, never the
        // direct navigation after it, and the caller must not try another
        // candidate over a page that may have changed.
        if (arrived && 'unknown' in arrived) {
          res.acted = true;
          res.outcome = 'unknown';
          res.failedAt = failIndex;
          res.reason = `${resolveError}; ${arrived.note}`;
          res.lines.push(`${head} → FAILED: ${res.reason}`);
          return 'stop';
        }
        if (arrived) {
          const miss = res.misses[res.misses.length - 1];
          if (miss && miss.step === tag) miss.used = arrived.used;
          res.fallthroughs++;
          res.warnings.push(`step ${tag}: ${resolveError}; ${arrived.note}`);
          res.lines.push(`${head} → target gone; ${arrived.note}`);
          return 'ran';
        }
      }
      res.failedAt = failIndex;
      res.reason = resolveError;
      res.lines.push(`${head} → FAILED: ${resolveError}`);
      return 'stop';
    }
    // Every target of this step is resolved and nothing has been dispatched:
    // the one point where a loop pass that repeats the last can still be
    // refused before its mutation runs again (runFoldedLoop rule 4).
    sink?.check();

    let urlBefore = page.url();

    // A click that opens a popup (menu, dialog, listbox) is a TOGGLE in most
    // SPAs: the same click on an already-open popup closes it. When the
    // recorded effect is already showing before the click, the click would
    // undo the state the next step depends on — fwgr26's third click on
    // "New" shut the menu its "New dashboard" link lived in, on every
    // replay. Skipped as already in effect. Only popup lines count: a
    // re-usable effect (another row of textboxes) must still be produced.
    const opener = openerLines(step, params);
    // Asked in the step's own line dialect; only a match skips — a look that
    // could not cover the page clicks, which is the direction this guard
    // already leans (a wrong skip loses the step everything after needs).
    if (opener.length && (await presentOnPage(page, opener, {}, dialectOf(step)))) {
      res.warnings.push(`step ${tag}: the recorded effect (${clip(opener[0], 60)}) is already showing — a click would toggle it away; skipped as already in effect`);
      res.lines.push(`${head} → skipped (already in effect)`);
      return 'skipped';
    }

    const warnings: string[] = [];
    /** Where a recorded page effect left the procedure, once the action has run. */
    let movedTo: Page | null = null;
    /** Whether an earlier step of this replay had already dispatched something (see `acted`). */
    let actedBefore = res.acted;
    /**
     * Alerts around a navigation (goto, back), which the executor never diffs.
     * The artifact takes these two looks for every non-read step; replay took
     * none, so fwod45-n3's goto to a record the reset had deleted ("Can't fetch
     * record(s) 22") landed on the list and ran on at tier A while the compiled
     * script stopped.
     */
    let navAlerts: StepGateInput['navAlerts'];
    const navigates = NAV_ALERT_TOOLS.has(step.tool);
    const lifecycle = await runStepLifecycle({
      prepare: async () => {
        // Dispatched, not completed. A step whose action fires and whose
        // EXPECTATION then fails returns 'stop' without incrementing stepsRun,
        // so stepsRun === 0 has never meant "the page was not touched" — and
        // the caller reads it as exactly that before trying another candidate.
        // Set before the executor is called, so a throw from it still counts;
        // set AFTER the already-in-effect skip above, because a skipped click
        // dispatched nothing.
        actedBefore = res.acted;
        if (!isRead) res.acted = true;
        urlBefore = page.url();
        if (navigates) navAlerts = { before: (await liveAlerts(page, dialectOf(step))) ?? [], after: null };
      },
      act: async (): Promise<StepActionResult<StepRunResult & { read?: string }>> => {
        // No retry. A click that produced no observable change was retried here
        // on the theory that it landed during a repaint — but "the page did not
        // change" is not evidence the click failed to DISPATCH. A mutation whose
        // effect simply falls outside the diff window (20 added lines, a 2s
        // capture) looks identical, and the retry then commits it twice. Retry is
        // only ever safe with proof the action did not fire, and nothing here has
        // that proof.
        if (absenceMet) return { status: 'completed', value: { result: `condition met: ${String(args.state)} (nothing matched)` } };
        if (isRead) {
          // Taken and flattened by the shared takeRead, as the artifact takes it:
          // a read that errors is skipped, never a failed step.
          let result = '';
          const taken = await takeRead(async () => {
            result = (await opts.exec(step.tool, args, resolved, { skill: skill.id, step: failIndex })).result;
            return decodeRead(result);
          });
          if (!taken.ok) {
            res.warnings.push(`step ${tag}: read errored — ${clip(taken.message, 120)}`);
            res.lines.push(`${head} → skipped (${clip(taken.message, 120)})`);
            return { status: 'skipped' };
          }
          return { status: 'completed', value: { result, read: taken.value } };
        }
        try {
          // A recorded popup/close/switch is armed BEFORE the action dispatches
          // (the shared armPageEffect): the popup a click raises can arrive
          // before the click call returns.
          const landing = await armPageEffect(page, stepEffect(step), `step ${tag}`);
          // The step's expected effect is what its action observation polls for
          // (effect-verified), in the step's own line dialect.
          const expect = effectExpectation(page, step.expect?.addedContains, params, dialectOf(step));
          const value = await opts.exec(step.tool, args, resolved, { skill: skill.id, step: failIndex }, expect ? { expect } : undefined);
          if (value.outcome) res.outcome = value.outcome;
          const landed = await landing();
          if (landed && 'error' in landed) {
            res.failedAt = failIndex;
            res.reason = landed.error;
            res.lines.push(`${head} → FAILED: ${landed.error}`);
            return { status: 'stopped' };
          }
          if (landed) movedTo = landed.page;
          return { status: 'completed', value };
        } catch (err) {
          const message = (err instanceof Error ? err.message : String(err)).split('\nCall log:')[0];
          // A text wait is a condition on the PAGE, located through a chain.
          // resolveChain took the first candidate that matched exactly one
          // element, which for a positional candidate can be the wrong one:
          // fwrd43's create step waited for the new ticket's title in `label
          // "Tickets" >> nth=1`, which on replay was an empty element, while the
          // chain's own next candidate — the tickets section — already showed
          // it. Both replays of 01-open went to recovery over it. The condition
          // holds if any recorded way of finding the target shows the text; the
          // wait already gave the page its full timeout to paint.
          const heldChain = step.tool === 'wait_for' ? ((fillParamsDeep(step.locators.target ?? [], params) as LocatorCandidate[]) ?? []) : [];
          const held = await textHeldElsewhere(heldObservations(roots.target ?? page, heldChain), args.state, args.text);
          const heldBy = held ? { index: held.index, candidate: heldChain[held.index] } : null;
          if (heldBy) {
            res.fallthroughs++;
            res.misses.push({ step: tag, key: 'target', primary: candidateExpr((step.locators.target ?? [])[0]), used: candidateExpr(heldBy.candidate), usedIndex: heldBy.index });
            res.warnings.push(`step ${tag}: ${clip(message, 120)}; the text was already showing in fallback #${heldBy.index + 1} ${candidateExpr(heldBy.candidate)}`);
            // Completed, not 'ran' straight out: the condition held, so the
            // step's own postconditions still apply. The completion path
            // below writes the line, once.
            return { status: 'completed', value: { result: `condition met in fallback #${heldBy.index + 1}` } };
          }
          // What the failure proves about the action. Only a proof that nothing
          // went out gives back `acted` — and only as it stood before this step,
          // so an earlier step's dispatch is never forgotten. `unknown` keeps it:
          // no sibling candidate may run over a page this click may have changed.
          const outcome = isMutatingAction(step.tool) ? outcomeOfError(err) : undefined;
          const label = outcome ? ` ${outcomeLabel(outcome)}` : '';
          if (outcome) {
            res.outcome = outcome;
            if (outcome === 'not-dispatched') res.acted = actedBefore;
          }
          res.failedAt = failIndex;
          res.reason = `${step.tool} failed: ${clip(message, 300)}${label}`;
          res.lines.push(`${head} → FAILED: ${clip(message, 300)}${label}`);
          return { status: 'stopped', ...(outcome ? { outcome } : {}) };
        }

      },
      settle: async (value) => {
        // A navigation renders a route skeleton first; let it hydrate before
        // the effect gates look for the recorded content. An action whose
        // observation settled the page (the executor's) has waited on exactly
        // that already — DOM, requests, the url — so there is nothing to add.
        if (value.settled) return;
        if (page.url() !== urlBefore) await settleDom(page);
        // After the settle, before the url wait in verify — where the artifact
        // takes its after-look, so a toast that auto-dismisses is not missed.
        if (navAlerts) navAlerts.after = await liveAlertsObserved(page, dialectOf(step));

      },
      bind: async () => {
        // Bind values this step just minted (derived params) from the live url,
        // BEFORE the expectation check: the minting step's own expectation refers
        // to the value it produced, so it must compare against the replay's own.
        if (skill.derived) {
          for (const [name, d] of Object.entries(skill.derived)) {
            if (d.step !== failIndex) continue;
            const v = urlPart(page.url(), d.at);
            if (v !== undefined) {
              params[name] = v;
              res.derivedValues[name] = v;
            }
          }
        }

        // A step declared record-minting has now run: read THIS run's identifier
        // off the live url and keep it. If the replay later stops, recovery is
        // told the record already exists and what it is called, instead of being
        // told only how many steps ran and left to infer the rest — which is how
        // fwod13 came to create a second and third order.
        if (step.mints) {
          // Only a part the step CHANGED: a rejected click leaves the url as it
          // was, and "new" from /tickets/new is not a record this run created.
          const made = changedCreation(urlPart(urlBefore, step.mints.at), urlPart(page.url(), step.mints.at));
          if (made && !res.created.includes(made)) res.created.push(made);
        }

      },
      verify: async (outcome) => {
        // Effect gates: did the step leave the page as the recording said it
        // would? Each gate's warnings and staged generalisations always apply; a
        // stop ends the replay here, with what ran already in `res`.
        let stop: StepVerdict | null = null;
        let effectConfirmed = false;
        for (const gate of STEP_GATES) {
          const verdict = await gate({ page, step, tag, failIndex, args, params, outcome, isRead, positionalResolution, effectConfirmed, navAlerts, navigatedToStale });
          if (!verdict) continue;
          if (verdict.confirmed) effectConfirmed = true;
          // What this step watched vary is this replay's evidence from here on
          // (retargetNavigation), whether or not the step went on to stop.
          if (verdict.volatile) volatileUrl.push(...verdict.volatile);
          if (verdict.warnings) warnings.push(...verdict.warnings);
          if (verdict.generalise) res.generalisations.push(verdict.generalise);
          if (verdict.absentDialog !== undefined) absentDialog = verdict.absentDialog;
          if (verdict.unobserved && !res.unobserved.includes(tag)) res.unobserved.push(tag);
          if (verdict.stop) {
            stop = verdict;
            break;
          }
        }
        res.warnings.push(...warnings);
        return stop;
      },
    });
    if (lifecycle.action.status !== 'completed') return lifecycle.action.status === 'skipped' ? 'skipped' : 'stop';
    const outcome = lifecycle.action.value;
    const stop = lifecycle.verification;
    if (stop) {
      // The step took the tab off the app (an error page, another origin):
      // whoever picks up from here — recovery, the next segment — needs the
      // app, not the wreck. Go back to where the step started. rpgr13-r2's
      // recovery spent its whole budget on chrome-error://chromewebdata/.
      const landed = page.url();
      if (landed !== urlBefore && (isErrorPageUrl(landed) || (originOf(landed) ?? '') !== (originOf(urlBefore) ?? ''))) {
        try {
          await page.goto(urlBefore, { waitUntil: 'domcontentloaded' });
          warnings.push(`step ${tag}: the browser was returned to ${urlPattern(urlBefore)} from ${urlPattern(landed)}`);
          res.warnings.push(warnings[warnings.length - 1]);
        } catch {
          // the tab is truly gone; the stop below says where it ended
        }
      }
      res.failedAt = failIndex;
      res.reason = stop.stop!;
      res.lines.push(`${head} → ran, but ${stop.stop}`);
      return 'stop';
    }

    // The step did what it was recorded doing to its page: every later step,
    // gate and look is asked of the page the procedure continues on, and the
    // session's pin follows so the executor acts there too.
    if (movedTo && movedTo !== page) {
      page = movedTo;
      opts.follow?.(page);
      res.lines.push(`${head} → ${clip(outcome.result.split('\n')[0], MAX_LINE)}; the procedure continues on ${urlPattern(page.url())} (recorded ${stepEffect(step)!.kind})`);
      return 'ran';
    }
    if (isRead) {
      const key = step.label ?? `read${tag}`;
      const value = outcome.read ?? flattenRead(decodeRead(outcome.result));
      res.values[key] = value;
      // An echo read: this value is only what the skill itself set or chose,
      // so it confirms the control's display, not that the app persisted it.
      const echo = echoVerdict(interacted, key, value, `step ${tag}`);
      if (echo) {
        res.echoedValues.push(key);
        res.warnings.push(echo);
      }
      res.lines.push(`${head} → ${key} = ${clip(outcome.result, MAX_LINE)}`);
    } else {
      res.lines.push(`${head} → ${clip(outcome.result.split('\n')[0], MAX_LINE)}`);
    }
    return 'ran';
  };

  /**
   * `runStepBody`, plus the one thing the body cannot give an inline heal:
   * the step's own verdict.
   *
   * A heal is right exactly when the deterministic verifier that checks every
   * other replayed step accepted it — the recorded expectations, the effect
   * gates, the url. That answer exists only once the step has returned, so
   * the settle happens here and nowhere else, and it happens on every exit
   * (a stop and a skip are both "the gates did not accept it"). `splice` from
   * the depth this call found, so a nested step can never settle an outer
   * one's proposal.
   */
  const runOneStep = async (
    step: SkillStep,
    tag: string,
    failIndex: number,
    sink?: LoopPass,
    ambiguousNth?: number,
  ): Promise<'ran' | 'skipped' | 'stop'> => {
    const depth = pendingHeals.length;
    const verdict = await runStepBody(step, tag, failIndex, sink, ambiguousNth);
    for (const proposal of pendingHeals.splice(depth)) {
      const verified = verdict === 'ran';
      proposal.settled?.(verified);
      const row = res.healed?.find((h) => h.step === tag && h.locator === candidateExpr(proposal.candidate));
      if (row) row.verified = verified;
      if (!verified) {
        // Named for the recovery prompt: the prelude renders these warnings
        // (renderReplay's `notes:`), so the model that picks the step up is
        // told which locator was already tried and refused rather than
        // re-deriving it and being surprised by the same gate.
        res.warnings.push(
          `step ${tag}: the inline heal ${candidateExpr(proposal.candidate)} ran and the step's own checks then refused it — treat that locator as known-wrong`,
        );
      }
    }
    return verdict;
  };

  // A folded loop: repeat the body while its guard locator still matches an
  // element, capped at `max`. Counts as ONE top-level step no matter how many
  // times the body runs, so the ok check below stays about top-level progress.
  const runLoop = async (step: SkillStep, n: number): Promise<'ran' | 'stop'> => {
    const body = step.body ?? [];
    const guard = step.while ?? body[0]?.locators.target ?? [];
    const max = step.max ?? 20;
    const before = res.stepsRun;
    // Everything about HOW a folded loop repeats — settle before every count,
    // the first-match guard, the cursor, the shrink wait, the progress guard,
    // the cap as a budget — is `runFoldedLoop` (src/execution/loop.ts), the same
    // policy the emitted artifact carries. What stays here is the daemon's own
    // bookkeeping: observations in (resolve, settle, run a recorded step) and
    // the replay result out.
    let pass = 0;
    let bodyStopped = false;
    const result = await runFoldedLoop(
      {
        settle: () => settleDom(page),
        readable: () => pageReadable(page),
        // Re-walked fresh each time, exactly as the loop asks for it; the
        // returned guard then recounts with the SAME candidate. Re-walking the
        // chain to recount can answer from a different rung — the recorded
        // guard `[data-testid="del-1"]` matches 1 before its row goes and 0
        // after, but the chain then falls through to a generic `button
        // "Remove"` matching the OTHER rows, so a shrink reads as growth.
        guard: async () => {
          const chain = fillParamsDeep(guard, params) as LocatorCandidate[];
          // The guard counts records where the body acts on them: inside the
          // recorded frame. A frame that is not there cannot say how many
          // remain, so it throws — unreadable, never empty (rule 6).
          const framed = await rootFor(page, (step.whileContext ?? body[0]?.contexts?.target)?.frame, 0);
          if ('error' in framed) throw new Error(framed.error);
          const root = framed.root;
          const hit = await resolveChain(page, chain, { allowMultiple: true }, root);
          if (!hit) return null;
          return {
            // A count that throws is left to throw: the loop tells an
            // unreadable guard from an empty one (rule 6).
            count: () => makeLocator(root, hit.candidate).count(),
            nth: (i: number) => makeLocator(root, hit.candidate).nth(i),
          };
        },
        runBody: async (cursor: number, progress: LoopPass) => {
          pass++;
          for (const [k, bstep] of body.entries()) {
            const st = await runOneStep(bstep, `${n}.${pass}.${k + 1}`, n, progress, cursor);
            if (st === 'stop') {
              bodyStopped = true;
              return { status: 'stop' as const };
            }
          }
          return { status: 'ran' as const };
        },
        aborted: () => Boolean(opts.signal?.aborted),
        // Whether a drain that found nothing more had only a rendered window of
        // a larger collection to look at (a virtualised grid).
        coverage: async () => (await observePage(page))?.coverage.collections ?? null,
      },
      { max, scope: step.scope ?? 'drain', shrinkWaitMs: LOOP_SHRINK_WAIT_MS, describe: chain0Desc(guard) },
    );
    if (!result.ok) {
      res.stepsRun = before;
      // A stopped BODY already recorded its own reason and failing step; saying
      // "the loop body stopped" over the top of it would replace the diagnosis
      // with a restatement of the obvious.
      if (bodyStopped) return 'stop';
      res.failedAt = n;
      res.reason = result.reason;
      res.lines.push(`${n}. loop ×${result.iterations} → FAILED: ${result.reason}`);
      return 'stop';
    }
    res.stepsRun = before + 1;
    if (result.state === 'partial') {
      // Not a stop: the loop did the work it had authority over. But it is not
      // "the collection is done" either, and whoever reads this run must not
      // be told it was.
      res.warnings.push(`step ${n}: loop ×${result.iterations} partial — ${result.reason}`);
      res.lines.push(`${n}. loop ×${result.iterations} (partial: ${result.reason})`);
      return 'ran';
    }
    res.lines.push(`${n}. loop ×${result.iterations} (while ${chain0Desc(guard)} matches)`);
    return 'ran';
  };

  for (const [i, step] of skill.steps.entries()) {
    const n = i + 1;
    if (n > 1 && n === gate.at && !(await passGate(n))) return res;
    if (opts.signal?.aborted) {
      res.failedAt = n;
      res.reason = 'instruction budget exhausted before this step';
      res.lines.push(`${n}. ${step.tool} — not run (budget exhausted)`);
      break;
    }
    if (step.tool === 'loop') {
      if ((await runLoop(step, n)) === 'stop') break;
      continue;
    }
    const status = await runOneStep(step, String(n), n);
    if (status === 'stop') break;
    res.stepsRun++;
  }

  res.ok = res.stepsRun === skill.steps.length && res.failedAt === undefined;
  res.url = page.url();
  return res;
}

/** What an effect gate sees after a step's action ran. */
interface StepGateInput {
  page: Page;
  step: SkillStep;
  /** Human step tag ("5", or "9.2.1" inside a loop). */
  tag: string;
  /** Top-level step number, for staged generalisations. */
  failIndex: number;
  /** The step's args with params filled. */
  args: Record<string, unknown>;
  params: Record<string, string>;
  outcome: StepRunResult;
  isRead: boolean;
  /** Some target of this step resolved through a structural (positional) candidate. */
  positionalResolution: boolean;
  /** An earlier gate (expectedChanges) saw the step's recorded page changes in what it added. */
  effectConfirmed?: boolean;
  /** A navigation step's own alert looks (goto/back carry no executor diff); `after` null when the page could not be read. */
  navAlerts?: { before: string[]; after: ObservedAlerts | null };
  /** This goto's target still named a value at a position this replay has shown volatile (retargetNavigation). */
  navigatedToStale?: string;
}

/** Steps whose alerts replay observes itself, because the executor does not diff them. */
const NAV_ALERT_TOOLS = new Set(['goto', 'back']);

/** A gate's verdict. Warnings and generalisations always apply; `stop` ends the replay with that reason. */
interface StepVerdict {
  warnings?: string[];
  generalise?: ReplayResult['generalisations'][number];
  stop?: string;
  /**
   * The recorded effect was a dialog opening and no dialog opened. A dialog
   * is conditional UI — "Discard changes?" appears only when there are
   * changes — so its absence is a legitimate state, not a failed effect; the
   * steps that were going to act inside it are skipped (see runOneStep).
   *
   * `lines` is the dialog's own recorded subtree — the controls it listed.
   * Membership is PROVEN against it, never inferred from a target simply
   * being missing: a step whose locator names nothing the dialog contained
   * is a step of the procedure's own, and its absence is a failure.
   */
  absentDialog?: { name: string; lines: string[] };
  /** This step's effect evidence could not be captured (see ReplayResult.unobserved). */
  unobserved?: true;
  /** The recorded page changes appeared in the step's diff (expect.ts ChangeVerdict.confirmed). */
  confirmed?: true;
  /** Url positions this step watched vary, which a later navigation of this replay may retarget by. */
  volatile?: readonly UrlSegDiff[];
}

type StepGate = (g: StepGateInput) => Promise<StepVerdict | null> | StepVerdict | null;

/**
 * Hard expectation: where the step was supposed to leave the browser. A
 * same-shape url whose literal segment(s) disagree is treated as volatile
 * (mechanism 2): warn, stage the generalisation, continue.
 */
const expectedUrl: StepGate = async ({ step, page, params, tag, failIndex }) => {
  const pattern = step.expect?.urlPattern;
  if (!pattern || urlMatches(pattern, page.url(), params)) return null;
  // The recorded url may still be on its way: an SPA sign-in answers the
  // click, then routes to the landing page a moment later. fwat2's sign-in
  // step was judged at "/" on every replay and sent to recovery, whose
  // report then lacked the landing-page value every later step referred to.
  // Give a navigation in flight the resolve window before judging.
  const deadline = Date.now() + resolveWaitMs();
  while (Date.now() < deadline) {
    // Wait on the navigation, not on a clock: the route that was in flight
    // is seen the moment it lands. The per-iteration budget is a backstop
    // for an app that rewrites its url without a history entry, which raises
    // no event to wake us.
    const slice = Math.max(1, Math.min(URL_SETTLE_POLL_MS, deadline - Date.now()));
    if (typeof page.waitForURL === 'function') {
      await page.waitForURL((u) => urlMatches(pattern, u.toString(), params), { timeout: slice }).catch(() => {});
    } else {
      // A minimal page (tests stub only url/locator) has no navigation events.
      await new Promise((r) => setTimeout(r, Math.min(slice, RESOLVE_POLL_MS)));
    }
    if (urlMatches(pattern, page.url(), params)) return null;
  }
  // The window is spent; the shared verdict (src/execution/gates.ts) decides
  // strict / soft-and-continue / stop exactly as the artifact does.
  const verdict = urlEffectVerdict(pattern, page.url(), params, `step ${tag}`);
  if (verdict.stop) return { stop: verdict.stop };
  return {
    warnings: verdict.warnings,
    generalise: verdict.generalised ? { kind: 'expect', step: failIndex, pattern: verdict.generalised } : undefined,
    volatile: verdict.diffs,
  };
};

/**
 * An alert the recording never saw is the app talking back — usually a
 * rejection ("Ticket is not ready…") that leaves the page superficially
 * intact. fwrd4l-n3 clicked into exactly that: the step counted as run, the
 * synthesized report declared the recorded outcome, and only external
 * verification caught that the ticket never reached Ready. So a
 * state-changing step that provokes an UNRECORDED alert fails hard — unless
 * its recorded page changes confirmed it worked, when the alert is reported
 * and the replay goes on — while a recorded-but-missing alert stays soft
 * (expectedAlert — toasts are volatile).
 */
const alerts: StepGate = ({ outcome, isRead, step, params, tag, effectConfirmed, navAlerts, navigatedToStale }) => {
  // The shared verdict (src/execution/gates.ts, alertVerdict) decides; the
  // diff already holds the alerts the action RAISED (the surplus over the
  // pre-action capture), so `before` is empty here. Only a capture that FAILED
  // is handed over as null (unobserved, never "no alert"). A step with no diff
  // at all is a tool the executor never diffs by design — goto, back,
  // wait_for, hover, scroll_into_view (tools.ts STATE_CHANGING) — and that is
  // an observed nothing: reading it as unobserved marked every such step of
  // every replay, and a skill containing one could never validate.
  //
  // The step's recorded alert text is in the step's line dialect; the diff is
  // in the executor's. When the two differ and the observations are there,
  // the before/after alerts are rendered in the step's dialect instead — the
  // same surplus the recorder takes — so a dialect-1 step is not stopped by a
  // shadow-root toast its recording could never have seen.
  const ctx = { where: `step ${tag}`, isRead, expectedContains: step.expect?.alertContains, params, effectConfirmed, navigatedToStale };
  const d = dialectOf(step);
  const obs = outcome.captureFailed ? undefined : outcome.observations;
  // A navigation's own looks decide for it, ahead of any diff: the executor
  // now diffs a goto/back while learning too (its landing is a page seam), but
  // the looks are the ones the artifact takes. An alert they SAW is evidence
  // and stops the step. A look that failed stays the observed-empty F1 reads
  // it as — marking every goto of a page mid-load unobserved would stop a
  // skill with one ever validating.
  const verdict = navAlerts
    ? alertVerdict(navAlerts.before, navAlerts.after?.alerts ?? [], ctx, navAlerts.after?.complete ?? true)
    : obs
      ? alertVerdict(renderAlerts(obs.before, d), renderAlerts(obs.after, d), ctx, alertsComplete(obs.after.coverage))
      : alertVerdict([], outcome.captureFailed ? null : (outcome.diff?.alerts ?? []), ctx);
  if (verdict.stop) return { stop: verdict.stop };
  if (!verdict.warnings.length && !verdict.unobserved) return null;
  return { warnings: verdict.warnings, unobserved: verdict.unobserved };
};

/**
 * Page-change expectations. Lines that carry a parameter are HARD: they are
 * what distinguishes this run from the recorded one (the new title appearing
 * as a heading), so their absence means the step acted on the wrong thing
 * even though it "worked". Everything else stays soft until data says it is
 * reliable — but a plain change absent from the diff AND the live page means
 * the action did not have its recorded effect, and failing there is what
 * turns a rejected state change into a clean recovery instead of a false
 * success (the fwrd4l-n3 Ready click).
 */
const expectedChanges: StepGate = async ({ outcome, step, params, tag, args, page, positionalResolution }) => {
  if (!step.expect?.addedContains?.length) return null;
  // The verdict itself is the shared expectedChangesVerdict (src/execution/
  // expect.ts) — the one rule a compiled artifact embeds too. This adapter
  // only supplies the observations: the step diff (null when the capture
  // failed — unavailable, never observed-empty) and a fresh look at the
  // live page in the same snapshot dialect.
  //
  // Both are rendered in the dialect the step's lines were RECORDED in
  // (expect.lineDialect, absent = 1): the diff from the executor's own
  // before/after observations, the live look through captureLines, which also
  // says whether a line missing from it is absent from the page. A diff taken
  // without observations (a stand-in executor) is used as it came.
  const d = dialectOf(step);
  const obs = outcome.observations;
  const added = obs ? addedLines(renderLines(obs.before, d), renderLines(obs.after, d)) : outcome.diff ? outcome.diff.added : null;
  const verdict = await expectedChangesVerdict(
    step.expect.addedContains,
    params,
    { tag, tool: step.tool, value: typeof args.value === 'string' ? args.value : undefined, positionalResolution },
    { added: outcome.captureFailed ? null : added, live: () => captureLines(page, d) },
  );
  return verdict.stop || verdict.unobserved || verdict.absentDialog || verdict.confirmed || verdict.warnings.length ? verdict : null;
};

/** The effect gates a step passes through after its action, in order. */
/**
 * The tab is on a browser error page (a crashed renderer, a navigation the
 * network refused): nothing recorded can hold there, and every later step
 * would resolve nothing while the replay pressed on. fwgr26-n2 ran eleven
 * more steps on chrome-error://chromewebdata/ before the next segment
 * refused with the unreadable "browser is at null/".
 */
const errorPage: StepGate = ({ page, tag }) => {
  const stop = errorPageVerdict(page.url(), `step ${tag}`);
  return stop ? { stop } : null;
};

// The alert gate runs AFTER the page-change gate: an alert the recording never
// saw is reported, and only stops the step when its recorded changes could not
// confirm it worked (gates.ts alertVerdict).
/** A goto that landed on another view of what it asked for (shared gotoLandingVerdict). */
const gotoLanding: StepGate = ({ page, step, args, tag }) => {
  if (step.tool !== 'goto' || typeof args.url !== 'string') return null;
  const stop = gotoLandingVerdict(args.url, page.url(), `step ${tag}`);
  return stop ? { stop } : null;
};

const STEP_GATES: StepGate[] = [errorPage, gotoLanding, expectedUrl, expectedChanges, alerts];

/** The line dialect a step's recorded lines are in: absent is dialect 1, every expectation compiled before dialects existed. */
function dialectOf(step: SkillStep): LineDialect {
  return step.expect?.lineDialect === 2 ? 2 : 1;
}

/** Short human label for a loop's guard locator. */
function chain0Desc(chain: LocatorCandidate[]): string {
  return chain[0] ? candidateExpr(chain[0]) : 'element';
}

/**
 * First candidate in the chain that resolves to exactly one element. An
 * indexed candidate (`nth`) already selects one; an unindexed fallback must
 * be unique on its own, since the element it was recorded against is gone.
 * A raw CSS target the agent chose is tried last if the chain is empty.
 */
/**
 * How a chain is READ: which candidates name the RECORD, which name the
 * ELEMENT, and which only say where it sits.
 *
 * This is PLAN-provenance's ElementSpec as a VIEW over the stored array
 * rather than a new stored shape, so no skill has to be migrated to gain the
 * invariant. What it buys is that resolution order stops being a convention
 * about array position: a chain whose head happens to be structural can no
 * longer let a positional candidate win ahead of one that names the record.
 * That is not hypothetical — the agent's own raw target is unshifted to the
 * head at record time, which is exactly how `text="..."` came to sit in front
 * of the identity anchor recorded for the same element.
 */
export interface ElementSpec {
  /** Names the RECORD: an anchor whose hasText carries a caller-vouched value. */
  identity: LocatorCandidate[];
  /** Names the ELEMENT: test id, role+name, label, placeholder, visible text. */
  handles: LocatorCandidate[];
  /** Finds it by WHERE it sits. Last resort, and never enough to name a record. */
  path: LocatorCandidate[];
}

/**
 * Structural: a path through the document, or an index into a set of matches.
 *
 * Note this is NOT "kind === css". An agent-chosen `#modal-save` is a handle
 * — it names one control — while `#view > div > button:nth-of-type(2)` is a
 * route to wherever that shape currently sits. Demoting the first alongside
 * the second would push a deliberate selector below a role guess.
 */
export function structural(c: LocatorCandidate): boolean {
  return structuralCandidate(c);
}

export function specOf(chain: LocatorCandidate[]): ElementSpec {
  const rank = (c: LocatorCandidate) => candidateRank({ kind: c.kind, structural: structural(c) });
  return {
    identity: chain.filter((c) => rank(c) === 0),
    handles: chain.filter((c) => rank(c) === 1),
    // Paths, then where it was: a point is the last resort behind every path.
    path: [...chain.filter((c) => rank(c) === 2), ...chain.filter((c) => rank(c) === 3)],
  };
}

/**
 * Policy for one resolution — the shared policy (src/execution/resolve.ts,
 * where every rule and its reason is documented) plus the one daemon-only
 * input: the agent's raw target, for a step that recorded no chain.
 */
export interface ResolvePolicy extends SharedResolvePolicy {
  /** The agent's original target string, used only when no chain was recorded. */
  rawTarget?: string;
}

/**
 * Resolve a stored chain against the page. This is the daemon's ADAPTER to
 * the shared policy: it builds one observation per candidate (the live
 * locator, the stored index, the structural/kind facts, what the candidate
 * names, its geometry, and the store's retirement evidence) and maps the
 * shared Resolution back onto the shapes replay's telemetry keeps. Every
 * DECISION — order, the point mark, identity, plausibility, origin,
 * ambiguity, the hold, the wait — is made in `resolveCandidates`.
 */
export async function resolveChain(
  page: Page,
  chain: LocatorCandidate[],
  policy: ResolvePolicy = {},
  /** What the candidates are built from: the page, or the recorded frame (context.ts rootFor). */
  root: Root = page,
): Promise<{ locator: Locator; index: number; candidate: LocatorCandidate; missed: number[] } | null> {
  const { rawTarget = '', ...shared } = policy;
  const candidates = chain.length || !rawTarget || isRefTarget(rawTarget) ? chain : [{ kind: 'css', selector: rawTarget } as LocatorCandidate];
  // A candidate whose locator cannot even be BUILT (a malformed selector, a
  // page with no locator engine) is one the walk passes over, not one that
  // stops the resolution: the failure is deferred to its count() so the
  // shared policy records it as an 'error' miss and tries the next.
  const locatorOf = (candidate: LocatorCandidate): Locator => {
    try {
      return makeLocator(root, candidate);
    } catch (error) {
      return { count: async () => { throw error; } } as unknown as Locator;
    }
  };
  const observations: CandidateObservation[] = candidates.map((candidate, index) => ({
    locator: locatorOf(candidate),
    index,
    structural: structural(candidate),
    kind: candidate.kind,
    // What the candidate itself names, params already filled by the caller:
    // an identity value found here needs no guarding.
    carries: JSON.stringify(candidate),
    nth: candidate.nth,
    point: candidate.kind === 'point' ? candidate : undefined,
    // Demonstrated volatile by later runs: store evidence, an INPUT to the
    // shared ordering rather than a rule of its own.
    retired: retired(candidate),
  }));
  const hit = await resolveCandidates(page, observations, { pollMs: RESOLVE_POLL_MS, ...shared });
  if (!hit) return null;
  const candidate = candidates[hit.index];
  return {
    locator: hit.locator,
    index: hit.index,
    candidate: hit.nth !== undefined ? { ...candidate, nth: hit.nth } : candidate,
    missed: hit.missed.map((m) => m.index),
  };
}

/**
 * The identity values the primary locator carried: known ({{known}}) slots
 * whose value the recorded run used to NAME the target by its visible text.
 * Only text-bearing locator kinds count — a slot inside a css selector or a
 * testid is an address, not a name, and holding a fallback to it would break
 * ordinary form fills whose fallbacks are structural by design.
 *
 * The WHOLE chain, not chain[0]. Identity is a property of the STEP — which
 * record it acts on — not of whichever candidate happens to sit first.
 *
 * fwrd26l is why. The agent's raw target was an XPath,
 * `//tr[contains(., '{{v5}}')]`, stored as `css` because the recorder does
 * not parse selector strings. So the primary advertised no identity, the
 * guard was disarmed, and `#ticket-rows > tr:nth-of-type(1)` took the step —
 * while the scoped anchor sitting right behind it named the record perfectly
 * well. Same shape as the `text="..."` case, different syntax; reading the
 * chain instead of its head fixes both without parsing anything.
 *
 * The rule itself is the shared `identityValues`; this is the daemon's view
 * of its inputs — the skill's known slots and this run's values.
 */
export function identityOfPrimary(chain: LocatorCandidate[], skill: Skill, params: Record<string, string>): string[] {
  const known: Record<string, string | undefined> = {};
  for (const [slot, value] of Object.entries(params)) if (skill.params[slot]?.known) known[slot] = value;
  return identityValues(known, chain.flatMap((c) => identityFields(c as { name?: string; text?: string; label?: string; hasText?: string })));
}

/**
 * How long a step keeps re-trying its locator chain before calling the target
 * absent. Overridable so a test exercising a FALLBACK path need not sit
 * through the wait that precedes it.
 */
/** A wait_for whose recorded condition is that its target is NOT there. */
export function waitsForAbsence(step: SkillStep, args: Record<string, unknown>): boolean {
  if (step.tool !== 'wait_for') return false;
  return args.state === 'hidden' || (args.state === 'count' && Number(args.count) === 0);
}

/**
 * The daemon's observations for the shared textHeldElsewhere (src/execution/
 * recover.ts): each stored candidate of the filled chain with the live locator
 * makeLocator builds for it, index = its stored position. A candidate whose
 * locator cannot be built is left out, as the old loop skipped it.
 */
function heldObservations(page: Root, chain: LocatorCandidate[]): { index: number; kind: string; locator: Locator }[] {
  const out: { index: number; kind: string; locator: Locator }[] = [];
  chain.forEach((candidate, index) => {
    if (index === 0 || candidate.kind === 'point') return;
    try {
      out.push({ index, kind: candidate.kind, locator: makeLocator(page, candidate) });
    } catch {
      // unbuildable: never a holder
    }
  });
  return out;
}

function resolveWaitMs(): number {
  const raw = Number(process.env.SITELOOPER_RESOLVE_WAIT_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : RESOLVE_WAIT_MS;
}

/**
 * How long checkIdentity waits for a bound marker (the artifact's shared
 * IDENTITY_WAIT_MS), overridable exactly as the resolve budget is — a unit
 * test that drives a stub page has no page to wait for.
 */
function identityWaitMs(): number {
  const raw = Number(process.env.SITELOOPER_IDENTITY_WAIT_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : IDENTITY_WAIT_MS;
}
// The locator chain has no single DOM condition to wait on — each rung is a
// different candidate and the preference order has to be re-read as a whole
// — so resolution stays a poll, at the shared RESOLVE_POLL_MS cadence.
/** Backstop cadence for a url an SPA rewrites without raising a navigation. */
const URL_SETTLE_POLL_MS = 500;

/** A snapshot line that names a popup: the thing a toggle opens and closes. */
export const OPENER_LINE = /^-?\s*(dialog|alertdialog|menu|menubar|listbox|tooltip)\b/;

/**
 * The popup lines a click was recorded to open, with params filled — empty
 * for anything but a click whose plain (unparameterised) effects include a
 * popup. See runOneStep's already-in-effect skip.
 */
export function openerLines(step: SkillStep, params: Record<string, string>): string[] {
  if (step.tool !== 'click' || !step.expect?.addedContains?.length) return [];
  const plain = step.expect.addedContains.filter((l) => !TRANSIENT_LINE.test(l) && !/\{\{v\d+\}\}/.test(l));
  // Only the POPUP lines decide. A click recorded to open a dialog also
  // records whatever else changed around it — the row it was about to fill,
  // the combobox it typed into — and those are on the page BEFORE the click
  // too. fwod34's 03-open picked "Conference Chair" from a product
  // autocomplete: the recorded effect listed `row "£ 0.00"` (the empty line
  // added one step earlier) beside `dialog ""`/`heading "Configure your
  // product"`, lineShows is any-of, so the option click was skipped as
  // "already in effect" on every replay and the dialog's Confirm at the next
  // step had nothing to click.
  const popup = plain.filter((l) => OPENER_LINE.test(l));
  if (!popup.length) return [];
  return liveLines(popup, params);
}

/**
 * Is this step's work already done on the record it names?
 *
 * Two halves, and both are load-bearing. `preconditions.requireText` says the
 * page is showing THIS record (the url pattern and fingerprint only ever say
 * "a page of this template"); `goal.requireText` says that record is in the
 * state the procedure exists to produce. Identity without goal would skip a
 * step because the right record is open; goal without identity would skip it
 * because some OTHER record happens to read "Cancelled".
 *
 * Conservative by construction: a skill with no goal, or no identity, is never
 * satisfied, and an unbound marker (one that still reads `{{v1}}`) proves
 * nothing so it fails the check rather than passing it. Being wrong the other
 * way costs one replay; being wrong this way skips work that never happened.
 *
 * THE RECORD THE STEP NAMES IS EVERY VALUE IT NAMES, not only the markers the
 * recorder put in the precondition. The precondition identifies the page the
 * procedure starts on (fwrd69: the ticket); a step that CREATES something on
 * that page names the thing it creates in its own params (the part's name,
 * `known`), and its goal is a claim about THAT. fwrd69's "add a part" skill
 * was pinned by 02-add and 03-add alike; its goal was `Bench Supplier` and
 * `Edit Delete` — what any part row shows — so once Part A existed, 03-add
 * was "already satisfied" on the ticket page, Part B was never created, and
 * 07-delete then deleted Part A twice. So every bound `known` param joins the
 * identity half: the page must show this run's Part B, whole, in the same
 * record scope as the goal, before the step is skipped. Same rule in the
 * artifact (spec/emit.ts satisfiedGuard).
 */
export async function goalSatisfied(
  page: Page,
  skill: Pick<Skill, 'preconditions' | 'goal'> & { params?: Skill['params'] },
  params: Record<string, string>,
): Promise<{ satisfied: boolean; shown: string[] }> {
  const fill = (markers: string[] | undefined) => (markers ?? []).map((m) => fillParams(m, params));
  const identityMarkers = recordMarkers(skill);
  const identity = fill(identityMarkers);
  const goal = fill(skill.goal?.requireText);
  if (!(skill.preconditions.requireText ?? []).length || !goal.length) return { satisfied: false, shown: [] };
  // The shared rule (src/execution/gates.ts): a marker still reading `{{v1}}`,
  // or one whose slot is bound to '', proves nothing. The artifact asks the same.
  if (!markersBound([...identityMarkers, ...(skill.goal?.requireText ?? [])], params)) return { satisfied: false, shown: [] };
  // The goal was read on the page template the procedure ends on (single
  // segment, so also where it starts): on any other template the same words
  // mean nothing — a list row can show "Cancelled" for a different order.
  if (!urlMatches(skill.preconditions.urlPattern, page.url(), params)) return { satisfied: false, shown: [] };
  // Dialect 2: the markers are text, not recorded lines, and text inside a
  // frame or open shadow root is on the page. A look that could not cover the
  // page is not satisfied, whatever it shows — the conservative direction:
  // being wrong costs one replay, where a skip on partial evidence costs work
  // that never happened.
  const captured = await captureLines(page, 2);
  if (!captured || !captured.complete) return { satisfied: false, shown: [] };
  // The two halves are asked differently. Identity says WHICH record, so it
  // takes the bounded rule (S00039 is not S000390); the goal says what state
  // that record is in, which is an ordinary substring question.
  for (const want of identity) {
    if (!lineShows(captured.lines, [want], { whole: true })) return { satisfied: false, shown: [] };
  }
  for (const want of goal) {
    if (!lineShows(captured.lines, [want])) return { satisfied: false, shown: [] };
  }
  // Both halves are SOMEWHERE on the page — which on a list is not the same
  // as both being true of one record. An orders grid showing "S00039
  // Pending" and "S00040 Cancelled" satisfies "is S00039 cancelled?" by that
  // test alone: the identity is on one row, the goal on another, and the url
  // gate above cannot separate them because a list page has one url. So the
  // two must be proven together, inside the record's own container.
  if (!(await sharesRecordScope(page, identity, goal))) return { satisfied: false, shown: [] };
  return { satisfied: true, shown: goal };
}

/**
 * The markers that name the record a step's goal is about: the precondition's
 * identity markers, then a `{{vN}}` for every `known` param the precondition
 * does not already carry. Shared with the emitter, which asks the same of a
 * segment (SpecSegment.params is the skill's).
 */
export function recordMarkers(skill: { preconditions: { requireText?: string[] }; params?: Skill['params'] }): string[] {
  const out = [...(skill.preconditions.requireText ?? [])];
  for (const [name, p] of Object.entries(skill.params ?? {})) {
    if (!p?.known) continue;
    const marker = `{{${name}}}`;
    if (!out.some((m) => m.includes(marker))) out.push(marker);
  }
  return out;
}

/**
 * Do the identity and the goal hold of the SAME record?
 *
 * The record's container is the OUTERMOST ancestor of the goal text that is
 * one of several siblings of its kind — the row among rows, the card among
 * cards. Outermost, not nearest: a cell is one of several cells too, and
 * stopping there would ask whether the identity is inside the status cell,
 * which it never is. The row above it is the scope the page itself asserts is
 * one record, and it is what a `scoped` locator names. If the goal text has
 * no repeated ancestor at all the page is not listing records, and page-wide
 * agreement is the right answer there (a detail page's heading and its status
 * field share no small container).
 */
async function sharesRecordScope(page: Page, identity: string[], goal: string[]): Promise<boolean> {
  try {
    // The identity half goes in as regex SOURCE: scopeCheckInPage (the shared
    // src/execution/snapshot.ts) is serialised into the page, so it cannot
    // call identityRe — and a second hand-written copy of the boundary rule
    // in page scope would be free to drift.
    return await page.evaluate(scopeCheckInPage, { identity: identity.map(identitySource), goal });
  } catch {
    // A page that cannot be evaluated (navigating, closed) has not proven
    // anything. Conservative: not satisfied, so the step runs.
    return false;
  }
}

/** A read tool's result as the value it carries: its JSON, or the text itself when it is not JSON. */
function decodeRead(result: string): unknown {
  try {
    return JSON.parse(result);
  } catch {
    return result;
  }
}

function describeArgs(tool: string, args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (k === 'target' || k === 'source') continue;
    if (typeof v === 'string') parts.push(`${k}=${JSON.stringify(clip(v, 60))}`);
    else if (typeof v === 'number' || typeof v === 'boolean') parts.push(`${k}=${v}`);
  }
  void tool;
  return parts.join(' ');
}

/** Text rendering of a replay result for the agent's tool output. */
export function renderReplay(skill: Skill, res: ReplayResult): string {
  const lines: string[] = [];
  if (res.refused) return `ERROR: could not replay ${skill.id}: ${res.reason}`;
  lines.push(
    res.ok
      ? `replayed ${skill.id}: ${res.stepsRun}/${res.stepsTotal} steps ok`
      : `replayed ${skill.id}: ${res.stepsRun}/${res.stepsTotal} steps ok, FAILED at step ${res.failedAt}`,
  );
  lines.push(...res.lines.map((l) => '  ' + l));
  if (!res.ok && res.failedAt !== undefined && res.failedAt < res.stepsTotal) {
    lines.push(`  not run: steps ${res.failedAt + 1}-${res.stepsTotal}`);
  }
  if (!res.ok) {
    lines.push(
      `Steps 1-${res.stepsRun} HAVE run and changed the page — do not repeat them. Observe the current page and continue from here to finish the instruction yourself.`,
    );
    // Naming the steps is not enough when the steps CREATED something. fwod13
    // replayed 02-create part-way, stopped, and recovery created a second
    // order: run n2 finished with 2 orders for its customer and n3 with 3,
    // which is why every later objective scored "no single order to check".
    // The model was told which steps ran; it was not told that a record it is
    // about to create may already exist.
    if (res.created.length) {
      // Evidence, not persuasion: these were read off the live url as the
      // minting steps ran, so they are THIS run's records, not the
      // recording's.
      lines.push(
        `ALREADY CREATED by those steps: ${res.created.map((c) => JSON.stringify(c)).join(', ')}. ` +
          `Continue with ${res.created.length === 1 ? 'it' : 'them'} — creating another is a silent duplicate, not a recovery.`,
      );
    } else if (res.stepsRun > 0) {
      lines.push(
        `If this instruction CREATES a record, one may already exist from those steps — search for it first and continue with it. Creating a second one is a silent duplicate, not a recovery.`,
      );
    }
  }
  const values = Object.entries(res.values);
  if (values.length) lines.push(`values read from the live page: ${values.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}`);
  // A healed step that the step's own checks then refused is the one fact a
  // recovery must not have to rediscover: it would otherwise look at the same
  // page, reach the same plausible control, and be refused by the same gate.
  // Stated before the general notes, and only for the refused ones — a heal
  // that verified is ordinary drift telemetry, not instruction.
  const refused = (res.healed ?? []).filter((h) => h.verified === false);
  if (refused.length) {
    lines.push(
      `ALREADY TRIED and refused by this step's own checks: ${refused.map((h) => `${h.locator} (step ${h.step}, ${h.key})`).join(', ')}. ` +
        `Those locators resolved on the page; what failed was what the step expected to happen afterwards.`,
    );
  }
  if (res.warnings.length) lines.push(`notes: ${res.warnings.join('; ')}`);
  return lines.join('\n');
}

/** Which stored skills could apply on this page, best first. */
export function candidatesFor(skills: Skill[], url: string, limit = 5): Skill[] {
  return skills
    .filter((s) => s.status !== 'demoted' && !(s.seq && s.seq.index > 0) && urlMatches(s.preconditions.urlPattern, url))
    .sort((a, b) => {
      const rank = (s: Skill) => (isVerified(s) ? 1 : 0);
      const rate = (s: Skill) => (s.stats.uses ? s.stats.successes / s.stats.uses : 0);
      return rank(b) - rank(a) || rate(b) - rate(a) || (b.stats.lastUsed ?? '').localeCompare(a.stats.lastUsed ?? '');
    })
    .slice(0, limit);
}

/** Values a skill will type verbatim because they were not parameterised. */
export function literalInputs(s: Skill): string[] {
  const out: string[] = [];
  for (const st of s.steps) {
    for (const key of ['value', 'text', 'option'] as const) {
      const v = st.args[key];
      if (typeof v === 'string' && v.trim() && !/\{\{v\d+\}\}/.test(v) && !out.includes(JSON.stringify(clip(v, 40)))) {
        out.push(JSON.stringify(clip(v, 40)));
      }
    }
  }
  return out.slice(0, 6);
}

/** The `[skills]` block appended to an instruction's user message. */
export function renderCandidates(skills: Skill[]): string {
  if (!skills.length) return '';
  const lines = ['[skills] stored procedures that have worked on this page before — if one matches the instruction, call run_skill with it FIRST instead of rediscovering the steps:'];
  for (const s of skills) {
    const params = Object.entries(s.params)
      .map(([k, p]) => `${k} e.g. ${JSON.stringify(clip(p.example, 40))}`)
      .join(', ');
    const reads = s.steps.filter((st) => st.label).map((st) => st.label);
    // A procedure validated under an older contract is described as what it
    // is: a real record of clean runs, under rules this engine no longer
    // follows. Calling it "validated" here would hand the model a guarantee
    // nothing currently backs.
    const status = isVerified(s)
      ? `validated ${s.stats.successes}/${s.stats.uses}`
      : s.status === 'validated'
        ? `validated under an older contract, so treated as unverified, ${s.stats.successes}/${s.stats.uses} run(s)`
        : `unverified, ${s.stats.successes}/${s.stats.uses} run(s)`;
    lines.push(`  ${s.id}  ${JSON.stringify(s.template)}`);
    lines.push(`         ${s.steps.length} steps · ${status}${params ? ` · params: ${params}` : ' · no params'}${reads.length ? ` · reads back: ${reads.join(', ')}` : ''}`);
    const literals = literalInputs(s);
    if (literals.length) {
      lines.push(`         types these FIXED values (not parameters — do not use this procedure if the instruction wants different ones): ${literals.join(', ')}`);
    }
  }
  return lines.join('\n');
}
