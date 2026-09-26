import { isMutatingAction, mutatesSteps } from '../execution/lifecycle.js';
import type { InstructionResult, SkillRecord } from '../agent/loop.js';
import type { Report } from '../agent/report.js';
import type { RecordedEntry, RecordedInstruction } from '../daemon/recorder.js';
import { shadowVerdicts, writeShadow } from './shadow.js';
import { bufferFactRow, factStoreFor, flushRouteObservations, observeRouting, routesAgreeShadow, takeFactRows } from './facts-url.js';
import { routesAgreeByFacts, type RoutesAgree } from '../execution/facts-route.js';
import { rewriteOrigins } from './facts-rewrite.js';
import { shadowClassify, takeFormatShadowRows } from './facts-format.js';
import { compileSkills, escapeRe, fillParams, samePageContexts, sameProcedure, urlMatches, urlPattern, variantStart } from './compile.js';
import { landedOnRecordedPage } from '../execution/gates.js';
import { urlDiff } from '../execution/url.js';
import type { Page } from 'playwright-core';
import { classifyReportValue, derivesFromParams, observedSummary, referenceValue, reportNeedsPage, shownForReport, templateSource, templateValue, typedSlots, unshownLiterals, type GivenEvidence } from '../execution/report.js';
import { ComponentStore, learnRecipes } from './components.js';
import { contractOf, isVerified, pageEffectDemoted, successRate, type Skill, type SkillStore } from './store.js';
export { pageEffectDemoted } from './store.js';

export interface LearnedRecord {
  /** A new skill was stored (the first segment, when the compile split). */
  compiled?: string;
  /** Every segment stored, in chain order, when the compile split into >1. */
  compiledAll?: string[];
  /** An existing skill absorbed this run (same template or same procedure). */
  merged?: string;
  /** The stored skill whose stats were updated from a replay. */
  outcome?: { skill: string; status: Skill['status']; ok: boolean };
  variantOf?: string;
  /** A validated variant replaced the skill it repaired. */
  superseded?: string;
  /** Component recipes compiled from this instruction's recording. */
  recipes?: string[];
  /**
   * The WHOLE instruction's procedure, stored (or merged) beside a variant
   * that starts after steps this recording replayed through other skills —
   * the only one of the two that is a procedure for the step (see
   * learnFromInstruction). Its segments, in chain order, in `wholeAll`.
   */
  whole?: string;
  wholeAll?: string[];
}

/**
 * Does a validated variant REPLACE the skill it was born repairing, or does it
 * merely stand beside it?
 *
 * `supersede` DEMOTES the parent, and a demoted skill is skipped by
 * `selectCandidates`, fails `isVerified`, and refuses to compile when a flow
 * step still pins it. So retiring the parent is only right where the variant
 * answers the parent's OWN instruction — which is the case the repair path was
 * built for: the replay of this instruction's procedure stopped, the model
 * finished this instruction, and what it recorded is a better way to do the
 * same thing.
 *
 * It is NOT the case a repair is limited to. A flow step's pin is a HINT, so
 * one step's instruction can select and repair another step's procedure, and
 * the variant it compiles then answers a DIFFERENT instruction. kanboard
 * fwkb21 is the witness: `02-open` ("Navigate to the project named 'Bench
 * Board' and open its board…") selected `01-open`'s eleven-step sign-in chain,
 * stopped at its second step because the browser was already signed in, and
 * compiled a seven-step board-reading variant of it. That variant does real
 * work, and it does not do `01-open`'s work — letting it retire the sign-in
 * chain would leave `01-open` with no procedure at all and refuse the compile
 * of the whole flow.
 *
 * The question is asked of the two recordings' own instructions, through the
 * templates compiled from them: same instruction, same work, and the variant
 * inherits. Nothing here reads what a template LOOKS like — only whether the
 * two are the same text. A parent the store no longer holds is not retired by
 * inference either. It fails toward COST: a genuine replacement whose template
 * re-slotted differently leaves both in the store, ranked against each other
 * by their records, instead of silently retiring a procedure another step
 * still depends on.
 */
function replacesParent(store: SkillStore, variant: Skill): boolean {
  const parent = variant.variantOf ? store.get(variant.variantOf) : null;
  return Boolean(parent && parent.template === variant.template);
}

/**
 * Everything learning mode does once an instruction has finished: fold the
 * replay outcome into the replayed skill, then — only on a successful report —
 * compile the recording into a new skill, a variant, or a stat bump on one
 * that already exists.
 */
export function learnFromInstruction(
  store: SkillStore,
  input: {
    result: InstructionResult;
    instruction: string;
    entries: RecordedEntry[];
    session: string;
    model?: string;
    now?: string;
    /** Run-scoped values (flow vars, url provenance) to slot by policy at compile. */
    vars?: Record<string, string>;
    /** The ledger step THIS instruction banks under (`i2`), for compile's ownStep. */
    ownStep?: string;
    /** Known values that are constants of the task (compile.ts CompileInput.taskConstants). */
    taskConstants?: string[];
    /** Text mints of earlier instructions (compile.ts CompileInput.mintedValues). */
    mintedValues?: string[];
    /** What the run recorded before this instruction (compile.ts CompileInput.before). */
    before?: RecordedEntry[];
    /**
     * The caller watched the recovery and saw the stop cost nothing: the
     * instruction succeeded and nothing changed the page after the replay
     * stopped, so the interrupted gesture was never redone. Passed straight to
     * `recordOutcome`, which treats such a stop as inconclusive rather than a
     * strike (fwod49). Only a caller with the run's recording past the
     * replay's resume point can establish it — see the flow runner.
     */
    harmlessStop?: boolean;
    /**
     * A flow step's RECOVERY: its compile drops the replayed step that
     * stopped this very replay (compile.ts CompileInput.stoppedAt). Only the
     * recovery says so — a `do` that repaired its own replay keeps the
     * step, as before.
     */
    recovery?: boolean;
  },
): LearnedRecord | null {
  // SITE FACTS (stage 0, skills/facts-url.ts): the route facts this session's
  // recorded steps proved since the last instruction, written under its name.
  // Changes nothing learned below.
  flushRouteObservations(store, input.session);
  const out: LearnedRecord = {};
  const sk = input.result.skill;
  const succeeded = input.result.report.status === 'success';

  if (sk?.invoked && !sk.refused) {
    const ok = sk.stepsReplayed === sk.stepsTotal;
    const updated = store.recordOutcome(
      sk.invoked,
      {
        ok,
        failedAt: ok ? undefined : sk.stepsReplayed + 1,
        fallthroughs: sk.fallthroughs,
        instructionSucceeded: succeeded,
        unobserved: sk.unobserved?.length ?? 0,
        ...(input.harmlessStop ? { harmlessStop: true } : {}),
      },
      input.now,
    );
    if (updated) {
      out.outcome = { skill: updated.id, status: updated.status, ok };
      if (updated.status === 'validated' && updated.variantOf && replacesParent(store, updated)) {
        store.supersede(updated.variantOf);
        out.superseded = updated.variantOf;
      }
    }
  }

  if (!succeeded) return Object.keys(out).length ? out : null;

  // Component recipes (PLAN-component-recipes): a successful agent-driven
  // interaction with a recognized widget teaches a cross-app recipe,
  // regardless of what happens to the skill-level compile below.
  try {
    const recipes = learnRecipes(new ComponentStore(), input.entries, input.instruction, input.session, input.now);
    if (recipes.length) out.recipes = recipes;
  } catch {
    // recipe learning must never break instruction learning
  }

  // A clean full replay has nothing new to teach; a repair does. A full
  // replay the model then drove PAST is a partial-coverage procedure, and
  // what it did not cover is this recording's to teach: fwop15-cv's 01-open
  // replayed s_713d1c (the sign-in) in full four times, the model opened the
  // project and read the subjects each time, nothing was compiled, and the
  // re-pin rule refused the sign-in for not carrying the step — every time.
  // Compiled whole (variantOf undefined), the recording is the candidate
  // decideRepin falls back to.
  const fullReplay = sk?.invoked && !sk.refused && sk.stepsReplayed === sk.stepsTotal;
  if (fullReplay && agentGesturesOutsideReplay(input.entries) <= MAX_STRAY_GESTURES_FOR_PIN) return Object.keys(out).length ? out : null;
  const variantOf = sk?.invoked && !sk.refused && sk.stepsReplayed < sk.stepsTotal ? sk.invoked : undefined;

  // The replayed step that stopped this replay, when it stopped part-way: the
  // segment `invoked` names on a stop, and its 1-based step (compile.ts
  // CompileInput.stoppedAt; fwsi7-n3 02-create).
  const stoppedAt = input.recovery && sk?.invoked && !sk.refused && sk.stepsReplayed < sk.stepsTotal && sk.failedAt !== undefined ? { skill: sk.invoked, step: sk.failedAt } : undefined;
  const compile = (variant: string | undefined) =>
    compileSkills({
      entries: input.entries,
      instruction: input.instruction,
      report: input.result.report,
      session: input.session,
      model: input.model,
      now: input.now,
      variantOf: variant,
      knownValues: input.vars,
      ...(input.ownStep ? { ownStep: input.ownStep } : {}),
      ...(input.taskConstants?.length ? { taskConstants: input.taskConstants } : {}),
      ...(input.mintedValues?.length ? { mintedValues: input.mintedValues } : {}),
      ...(stoppedAt ? { stoppedAt } : {}),
      ...(input.before?.length ? { before: input.before } : {}),
    });
  const skills = compile(variantOf);
  // SITE FACTS: two procedures one query literal apart on pages that do not
  // fingerprint alike prove that key routes (a soft `route.query` fact).
  observeRouting(store, skills, input.session);
  // SITE FACTS stage 1 (consumer 5, skills/facts-rewrite.ts): a reliable
  // `state` query key or `anchor` fragment widens the origin's STORED
  // patterns (never a step or a locator). Nothing without a reliable fact.
  rewriteOrigins(store, skills.map((s) => s.origin));
  // SHADOW (skills/shadow.ts): what the journal's facts say beside what the
  // heuristics decided, to a report next to the store. Changes nothing learned.
  // The site-facts rows this session buffered (replays of stored skills the
  // model ran during the instruction) go out in the same call.
  const factRows = takeFactRows(store);
  factRows.push(...takeFormatShadowRows()); // display-format rows (skills/facts-format.ts)
  if (skills.length || factRows.length) writeShadow(store.dir, { session: input.session, instruction: input.instruction }, [...(skills.length ? shadowVerdicts(input.entries, skills, input.before ?? []) : []), ...factRows]);
  // A variant that starts AFTER steps this recording replayed through other
  // skills (an earlier segment of the chain it repaired) covers the tail of
  // the instruction, not the instruction: replay composes a chain by its own
  // `seq`, so nothing ever runs that tail after the prefix it omits. It is
  // stored as before — it is the repair, gated on the page it ran on — and
  // the whole recording is stored beside it as the instruction's procedure,
  // the one a flow step can be pinned to. fwop2's 01-signin was re-pinned to
  // a tail that began in the signed-in projects list; the compiled artifact
  // ran it on a fresh browser's login form and missed its first click.
  const whole = variantOf && variantStart(input.entries, variantOf).dropped ? compile(undefined) : [];
  if (whole.length) observeRouting(store, whole, input.session);
  if (!skills.length && !whole.length) return Object.keys(out).length ? out : null;
  if (skills.length) Object.assign(out, keep(store, skills, variantOf));
  if (whole.length) {
    const kept = keep(store, whole, undefined);
    out.whole = kept.merged ?? kept.compiled;
    if (kept.compiledAll) out.wholeAll = kept.compiledAll;
  }
  return out;
}

/**
 * Store one compiled recording: merged into twins that already hold it, or
 * put as new skills. Split out of learnFromInstruction so a variant and the
 * whole recording it was cut from are each asked the same question.
 */
function keep(store: SkillStore, skills: Skill[], variantOf: string | undefined): Pick<LearnedRecord, 'compiled' | 'compiledAll' | 'merged' | 'variantOf'> {
  const out: Pick<LearnedRecord, 'compiled' | 'compiledAll' | 'merged' | 'variantOf'> = {};
  const existing = store.list(skills[0].origin);
  // A twin is an existing skill with this recording's shape at the same
  // chain position. Merge only when EVERY segment has a twin and the twins
  // all belong to one chain — otherwise the store would end up with
  // half-shared chains that replay cannot compose.
  //
  // A VARIANT IS ASKED THE SAME QUESTION, INSIDE ITS OWN FAMILY (fwkb21).
  // This search used to be skipped entirely for a repair-born recording, on
  // the implicit rule "a recording produced under a repair is new by
  // construction, so it is stored without asking whether the store already
  // holds it". Nothing makes that true: a repair can arrive at a procedure an
  // earlier repair already found, and a store that never asks can never
  // notice. The cost is not a duplicate row — it is that `uses`/`successes`
  // stay at 1 forever, and the `successes >= 2` promotion below (and
  // store.ts's) is the ONLY route a repair-born skill has to validated, the
  // replay route being shut by the ranking in `selectCandidates`. kanboard's
  // three correct board-reading procedures each sat at 1/1 across three runs
  // for exactly this reason.
  //
  // Scoped to one family and no wider: a variant of one parent is not a twin
  // of a variant of another, however alike their steps read — they were born
  // repairing different procedures, which is a fact about their provenance
  // and not a guess about their shape. A non-variant recording keeps its
  // existing reach unchanged (it may still twin anything non-demoted).
  const twins = skills.map((sk) =>
    existing.find(
      (s) =>
        s.status !== 'demoted' &&
        (!variantOf || s.variantOf === variantOf) &&
        (s.seq?.index ?? 0) === (sk.seq?.index ?? 0) &&
        (s.seq?.of ?? 1) === (sk.seq?.of ?? 1) &&
        (s.template === sk.template || sameProcedure(s, sk)) &&
        samePageContexts(s, sk),
    ),
  );
  if (twins.every(Boolean) && new Set(twins.map((t) => t!.seq?.chain ?? t!.id)).size === 1) {
    for (const twin of twins as Skill[]) {
      twin.stats.uses += 1;
      twin.stats.successes += 1;
      twin.stats.lastUsed = skills[0].provenance.created;
      if (twin.status === 'provisional' && twin.stats.successes >= 2) {
        twin.status = 'validated';
        twin.stats.verifiedContract = contractOf(twin);
      }
      store.put(twin);
    }
    out.merged = twins[0]!.id;
    return out;
  }
  for (const sk of skills) store.put(sk);
  out.compiled = skills[0].id;
  if (skills.length > 1) out.compiledAll = skills.map((s) => s.id);
  if (variantOf) out.variantOf = variantOf;
  return out;
}

/**
 * Zero-model match: a validated skill whose template, read as a pattern,
 * matches the incoming instruction exactly (modulo case, whitespace and quote
 * style), and whose start page is the current one. Returns the bound params.
 *
 * `isVerified`, not `status === 'validated'`, and this is the site where the
 * difference matters most: nothing here consults a model, so the validated
 * status IS the safety argument. A procedure promoted under an older contract
 * was promoted by an engine with different rules, and letting it through here
 * would run it unattended on the strength of evidence about a different
 * engine. It stays a candidate elsewhere; it just cannot be trusted blind.
 */
export function matchTemplate(
  skills: Skill[],
  instruction: string,
  url: string,
  known: Record<string, string> = {},
): { skill: Skill; params: Record<string, string> } | null {
  for (const skill of skills) {
    if (!isVerified(skill)) continue;
    if (skill.seq && skill.seq.index > 0) continue; // chains start at their head
    if (!urlMatches(skill.preconditions.urlPattern, url)) continue;
    const params = bindSkill(skill, instruction, known);
    if (params) return { skill, params };
  }
  return null;
}

/**
 * The skills a flow step should try for its procedure, best track record
 * first. The step's pinned skill is a HINT that defines the family (its
 * template and its procedure shape), never an authority: candidates are every
 * non-demoted skill in the store that either binds the instruction directly
 * or shares the hint's procedure, ordered validated-first, then by success
 * rate, then by experience. Selection by record is what stops one bad pin —
 * e.g. a fragile provisional from a single model recovery — from dominating
 * the step run after run.
 *
 * The validated-first tier is itself withheld from a candidate that is in the
 * running only on the pin's say-so, when another candidate was recorded
 * answering this very instruction — see the comment on the sort.
 */
/**
 * The pinned skill's values, re-offered to a sibling by what each slot MEANS.
 *
 * Slot names are per-skill positional labels: `v1` is "the first slot of this
 * skill", not a shared identifier. Two skills that share a procedure therefore
 * both have a `v1` while their `v1` denotes different records — in fwrd48 the
 * pinned skill's v1 was the bench ticket and the sibling's v1 was a scratch
 * ticket that did not exist yet. Inheriting by name handed the sibling the
 * wrong record's identifier, it acted on the first row it found, and only a
 * recorded expectation caught it 28 model turns later.
 *
 * So a value crosses only where both sides agree what it is: the hint's values
 * are re-keyed by the hint's own bindings and each sibling slot is looked up by
 * ITS binding. A slot that cannot be filled that way (no binding, or a binding
 * nothing has a value for) refuses the whole inheritance — the candidate is
 * skipped and the step costs a model turn, rather than running against a record
 * it was never given.
 */
function inheritByBinding(
  sibling: Skill,
  hint: Skill,
  pinned: Record<string, string>,
  known: Record<string, string>,
): Record<string, string> | null {
  const byBinding = new Map<string, string>();
  for (const [n, p] of Object.entries(hint.params)) {
    if (p.binding && pinned[n] !== undefined) byBinding.set(p.binding, pinned[n]);
  }
  // A slot with no binding was cut from the instruction text, so only the
  // template says what it denotes. Identical templates slot in the same order,
  // which makes the names correspond by construction; different templates say
  // nothing, and `sameProcedure` alone cannot stand in — for a one-step skill
  // it means only "same tool, same kind of locator", which any two clicks in
  // the app satisfy. That is what let a scratch-ticket skill inherit the bench
  // ticket's reference in fwrd48.
  const sameWording = sibling.template === hint.template;
  const out: Record<string, string> = {};
  for (const [n, p] of Object.entries(sibling.params)) {
    const value = p.binding ? byBinding.get(p.binding) ?? known[p.binding] : sameWording ? pinned[n] : undefined;
    if (value === undefined) return null;
    out[n] = value;
  }
  return out;
}

/**
 * Do two stored skills carry out the same PROCEDURE — the whole procedure,
 * not its first segment?
 *
 * A compiled procedure that spans pages is stored as a chain of segments, and
 * a chain's head is one segment of it. `sameProcedure` answers a per-segment
 * question (same tools, same locator shapes, same frames/pages/effects), so
 * asking it of two heads compares the first line of two functions and calls
 * the functions equal.
 *
 * fwod56 is what that costs. `10-verify`'s pin was the head of a five-segment
 * chain; `02-create`'s head was a four-segment chain that creates a contact.
 * Both heads are two clicks with the same locator shapes, so `sameProcedure`
 * said yes, the create head was validated where the verify head was only
 * provisional, and it sorted first. The chain walk in the daemon then ran the
 * remaining create segments and minted a second contact — while the flow
 * reported `status: success, passed 10/10`, and the verifier looked at the
 * duplicate. Wrong work done silently under a passing verdict.
 *
 * So the comparison is made of the chain: both chained or neither, the same
 * number of segments, and every corresponding segment pair `sameProcedure`.
 * Segments are resolved out of `skills` by `seq.chain`/`seq.index`; a segment
 * that is missing from the store refuses the comparison, because a chain that
 * cannot be read cannot be shown to do this work.
 *
 * `sameProcedure` itself is deliberately left alone — store merging asks the
 * per-segment question at a matching chain position, and that use is sound.
 */
export function sameChainProcedure(a: Skill, b: Skill, skills: Skill[]): boolean {
  if (a.id === b.id) return true;
  if (Boolean(a.seq) !== Boolean(b.seq)) return false;
  if (!a.seq || !b.seq) return sameProcedure(a, b);
  if (a.seq.of !== b.seq.of) return false;
  const segment = (chain: string, index: number): Skill | undefined =>
    [a, b, ...skills].find((s) => s.seq !== undefined && s.seq.chain === chain && s.seq.index === index);
  for (let i = 0; i < a.seq.of; i++) {
    const sa = segment(a.seq.chain, i);
    const sb = segment(b.seq.chain, i);
    if (!sa || !sb || !sameProcedure(sa, sb)) return false;
  }
  return true;
}

/**
 * A pin's health as a PROCEDURE. A pinned step replays its skill's whole
 * chain, and the compile refuses the flow when ANY segment of that chain is
 * demoted (spec/ir.ts `demoted-pin`) — so a chain is as demoted as its worst
 * segment, and the step's incumbent is judged the same way. fwod66-n3's
 * 09-open kept its pin on a validated head whose third segment had just been
 * demoted at the same step twice: decideRepin saw a healthy incumbent, left
 * the recovery's procedure unpinned, and the compile refused the whole flow.
 * `'missing'` when the step has no pin or the store no longer holds it.
 */
export function pinStatus(skills: Skill[], pinned: Skill | null | undefined): Skill['status'] | 'missing' {
  if (!pinned) return 'missing';
  // pageEffectDemoted: a stop at a popup/tab step banked as "harmless" before
  // it became a strike still demotes (fwsi9 s_24e7fd).
  if (!pinned.seq) return pageEffectDemoted(pinned) ? 'demoted' : pinned.status;
  const chain = skills.filter((s) => s.seq?.chain === pinned.seq!.chain);
  return chain.some((s) => pageEffectDemoted(s)) ? 'demoted' : pinned.status;
}

export function selectCandidates(
  skills: Skill[],
  hintId: string | undefined,
  instruction: string,
  hintParams?: Record<string, string>,
  known: Record<string, string> = {},
): { skill: Skill; params: Record<string, string> }[] {
  const hint = hintId ? skills.find((s) => s.id === hintId) : undefined;
  const pinned = hintParams && Object.keys(hintParams).length ? hintParams : undefined;
  const out: { skill: Skill; params: Record<string, string>; bound: boolean }[] = [];
  for (const s of skills) {
    if (s.status === 'demoted') continue;
    if (s.seq && s.seq.index > 0) continue; // chains start at their head
    // Does this candidate's OWN recorded instruction read over the instruction
    // being served? Asked of every candidate, the PIN included — the pin used
    // to skip the question, because its params were already in hand and the
    // answer changed nothing. It changes the ranking now (see below), so it is
    // asked and kept. The flow's stored bindings stay authoritative for the
    // pinned skill either way; only the boolean is taken from the bind.
    const own = bindSkill(s, instruction, known);
    // The flow's stored bindings are authoritative for the pinned skill; a
    // sibling binds from the instruction text, or inherits the pinned
    // bindings when it shares the hint's procedure and its slots all resolve.
    let params: Record<string, string> | null = s.id === hintId && pinned ? pinned : own;
    // A sibling may stand in for the hint only if it does the hint's WHOLE
    // work: `sameChainProcedure` compares chain against chain, because the
    // daemon replays the head's whole chain and not just the head (fwod56).
    // The shared template is checked at the same depth — identical wording on
    // two chains of different lengths says the words matched, not the work.
    if (!params && pinned && hint && (s.template === hint.template || sameProcedure(s, hint)) && sameChainProcedure(s, hint, skills)) {
      params = inheritByBinding(s, hint, pinned, known);
    }
    if (!params) continue;
    out.push({ skill: s, params, bound: own !== null });
  }
  // A PIN IS A HINT, NOT AN ENTITLEMENT — and `validated` is the entitlement
  // (kanboard fwkb21 02-open).
  //
  // One stored procedure can serve two flow steps, and its stats are one
  // number for both. s_06c07b is kanboard's eleven-step sign-in-then-read
  // chain. `01-open` pins it and it replays 11/11 every time. `02-open` pins
  // it too — the same pin, carried over with the same `v1` (the site's base
  // url, a value 02-open's instruction never mentions) — and there it stops at
  // step 2 every time, because the browser is already signed in and the
  // recorded Username field cannot appear. Three of each: pooled, that reads
  // `validated, 3/6`, which the `isVerified`-first tier put ahead of three
  // provisional 1/1 procedures that were RECORDED answering 02-open's own
  // instruction. (The pooling hides the failure twice over: 01-open's success
  // clears `lastFailedAt` between 02-open's stops, so the repeat strike at
  // step 2 never demotes either.)
  //
  // So the tier is withheld from the PIN, when the pin's own recording does
  // not read over this instruction and some other candidate's does. Not
  // excluded, not demoted, not re-ordered by wording: it keeps its place in
  // the list and competes on the one thing that is evidence about this step —
  // its record. s_06c07b at 0.5 then loses to a variant at 1.0, and would
  // still win at a rate the variants could not beat.
  //
  // `bound` is provenance, not shape: it is the candidate's own recorded
  // instruction, slotted, read over this one. Nothing here looks at what a
  // string is made of.
  //
  // TWO GUARDS, and both are load-bearing.
  //
  // `someoneBound` keeps this off every green app. A pin whose wording has
  // drifted away from its step's instruction is the normal case — odoo fwod59
  // (6 steps of 6), repairdesk fwrd66 (5 of 5), grafana fwgr51 (1 of 3) and
  // kanboard's own `05-edit` all run one that way, every step green. In each
  // the pin is the ONLY candidate, so there is nobody to hand the tier to and
  // nothing changes. Demoting pin-only candidates as a class would have hit
  // all four apps; with the guard the rule reaches exactly one step in the
  // four published stores, and it is the failing one.
  //
  // `id === hintId` keeps it off SIBLINGS. A sibling that inherits the pin's
  // values (`inheritByBinding`) also fails to bind, but it is not the thing
  // the flow author vouched for — it is a candidate the store offered on the
  // strength of a shared procedure and agreeing slot bindings, and fwod56 and
  // fwrd48 are both about how hard that is to earn. Stripping ITS tier would
  // put a fragile pin back in front of the proven sibling those rounds paid
  // for. The entitlement being withheld is the pin's, so only the pin loses it.
  const someoneBound = out.some((c) => c.bound);
  return out
    .sort((a, b) => {
      const rank = (c: (typeof out)[number]) =>
        isVerified(c.skill) && !(someoneBound && !c.bound && c.skill.id === hintId) ? 1 : 0;
      return (
        rank(b) - rank(a) ||
        successRate(b.skill) - successRate(a.skill) ||
        b.skill.stats.uses - a.skill.stats.uses ||
        (b.skill.stats.lastUsed ?? '').localeCompare(a.skill.stats.lastUsed ?? '')
      );
    })
    .map(({ skill, params }) => ({ skill, params }));
}

/**
 * Occurrence indices of `{{vN}}` slots the template separates by nothing but
 * whitespace, grouped into runs. Each returned array holds the OCCURRENCE
 * indices (capture group i+1 in `bindSkill`'s pattern), not slot names, because
 * a slot may appear more than once and only some of its occurrences abut.
 *
 * `alignSlots` (src/skills/rethread.ts) applies this same rule, and that
 * module's doc states the principle it comes from: adjacent slots are an
 * ambiguity "left alone and reported, never guessed at". It splits a run only
 * on the evidence `resolveAdjacentRun` treats as a hard requirement — a slot a
 * non-adjacent occurrence already placed — because it aligns against an
 * instruction whose values are references, where no recorded example applies.
 */
function adjacentSlotRuns(squashedTemplate: string): number[][] {
  const spans = [...squashedTemplate.matchAll(/\{\{v\d+\}\}/g)];
  const runs: number[][] = [];
  let run: number[] = [];
  for (let i = 1; i < spans.length; i++) {
    const prev = spans[i - 1];
    const end = (prev.index ?? 0) + prev[0].length;
    if (!squashedTemplate.slice(end, spans[i].index ?? 0).trim()) {
      if (!run.length) run.push(i - 1);
      run.push(i);
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

/** Every way to cut `tokens` into `k` non-empty consecutive parts, capped. */
const MAX_ADJACENT_SPLITS = 200;
function splitsOf(tokens: string[], k: number): string[][] | null {
  if (k < 1 || tokens.length < k) return null;
  let out: string[][] = [[]];
  for (let part = 0; part < k; part++) {
    const next: string[][] = [];
    for (const acc of out) {
      const used = acc.reduce((n, p) => n + p.split(' ').length, 0);
      const left = tokens.length - used;
      const remaining = k - part - 1;
      const max = left - remaining; // leave one token for each later part
      for (let take = 1; take <= max; take++) {
        next.push([...acc, tokens.slice(used, used + take).join(' ')]);
        if (next.length > MAX_ADJACENT_SPLITS) return null;
      }
    }
    out = next;
  }
  return out;
}

/**
 * Re-split the text the regex minimally divided between adjacent slots, on
 * evidence rather than on where a non-greedy `(.+?)` happened to stop.
 *
 * WHY (odoo fwod55). `…open the confirmed {{v1}} {{v2}}…` against
 * `…open the confirmed Sales Order S00024…` splits minimally as
 * v1="Sales", v2="Order S00024". No page ever shows "Order S00024", so the
 * identity marker was absent after the full poll and all three arms hard-
 * stopped on the RIGHT record, leaving the order uncancelled. The split is a
 * guess; the recording's own evidence can decide it.
 *
 * Evidence, in order: the split each slot's recorded `example` vouches for;
 * then a value this run already published for the slot's binding (a hard
 * requirement — a split that contradicts a known value is never taken).
 * Returns null when the evidence does not single one split out: the slots are
 * then left UNBOUND, which is a first-class state (checkIdentity skips an
 * unbound marker, identityChecks emits a comment, markersBound refuses one).
 * The step costs a model turn instead of stopping the flow on the right
 * record. That is the intended trade.
 */
function resolveAdjacentRun(
  skill: Skill,
  slots: string[],
  captured: string[],
  known: Record<string, string>,
  pinned: Record<string, string>,
): string[] | null {
  const tokens = captured.join(' ').split(' ').filter(Boolean);
  const candidates = splitsOf(tokens, slots.length);
  if (!candidates) return null;
  if (candidates.length === 1) return candidates[0]; // one token per slot: nothing to guess

  const same = (a: string | undefined, b: string | undefined): boolean =>
    Boolean(a) && Boolean(b) && squash(a!).toLowerCase() === squash(b!).toLowerCase();

  let best: { parts: string[]; hits: number } | null = null;
  let tied = false;
  for (const parts of candidates) {
    let ok = true;
    let hits = 0;
    slots.forEach((n, i) => {
      const p = skill.params[n];
      // (b) a value this run published for this slot's binding, and a value a
      // NON-adjacent occurrence of the same slot already bound, are both facts,
      // not hints: a split that disagrees with either is not a candidate.
      const required = (p?.binding ? known[p.binding] : undefined) ?? pinned[n];
      if (required && !same(parts[i], required)) ok = false;
      // (a) the recording's own example for the slot. The varying slot will not
      // match it (S00024 is not the recorded S00021) — the fixed one does, and
      // that is enough to place the boundary.
      if (same(parts[i], p?.example)) hits++;
    });
    if (!ok) continue;
    if (!best || hits > best.hits) {
      best = { parts, hits };
      tied = false;
    } else if (hits === best.hits) tied = true;
  }
  // A tie is exactly the case this exists to refuse. A lone survivor with no
  // example hit got there through the required-value filter, which is evidence
  // of the stronger kind; with no required value at all every candidate
  // survives, so a lone survivor cannot arise that way.
  return best && !tied ? best.parts : null;
}

/**
 * Bind a specific skill's {{vN}} slots from an instruction by reading its
 * template as a pattern. Used by flow replay, where the skill is already
 * chosen (pinned), so its status and the page are the flow's concern, not this
 * function's. Returns null unless every slot binds — from the template, by
 * origin, or out of a bound slot that contains it (`deriveContained`) —
 * except a slot the template cannot justify splitting from its neighbour,
 * which is deliberately left unbound (see `resolveAdjacentRun`).
 */
export function bindSkill(skill: Skill, instruction: string, known: Record<string, string> = {}): Record<string, string> | null {
  const names: string[] = [];
  const template = squash(skill.template);
  const pattern = escapeRe(template).replace(/\\\{\\\{(v\d+)\\\}\\\}/g, (_m, name: string) => {
    names.push(name);
    return '(.+?)';
  });
  const m = new RegExp(`^${pattern}$`, 'i').exec(squash(instruction));
  if (!m) return null;
  const params: Record<string, string> = {};
  const runs = adjacentSlotRuns(template);
  const adjacent = new Set<number>(runs.flat());
  // An occurrence the template separates by real text is unambiguous, so it is
  // bound first and then stands as evidence for any adjacent occurrence of the
  // same slot.
  names.forEach((n, i) => {
    if (!adjacent.has(i)) params[n] = m[i + 1].trim();
  });
  const refused = new Set<string>();
  for (const run of runs) {
    const slots = run.map((i) => names[i]);
    const parts = resolveAdjacentRun(skill, slots, run.map((i) => m[i + 1].trim()), known, params);
    if (parts) slots.forEach((n, k) => (params[n] = parts[k]));
    else for (const n of slots) if (!params[n]) refused.add(n);
  }
  for (const n of refused) delete params[n];
  // A param the template cannot supply binds to its ORIGIN instead: the value
  // came from an earlier instruction, so this run resolves its own from the
  // same place rather than the skill carrying the recorded literal. A refused
  // slot is skipped here: the split was refused precisely because no reading of
  // the instruction produces the known value at that position.
  for (const [n, p] of Object.entries(skill.params)) {
    if (params[n] || refused.has(n) || !p.binding) continue;
    const value = known[p.binding];
    if (value) params[n] = value;
  }
  // A slot the template never states and whose origin this run has not banked
  // may still be IN the instruction — inside a slot that is. See
  // `deriveContained`. Only template/origin-bound values serve as hosts, so a
  // derivation never feeds another one.
  const hosts = Object.entries(params)
    .filter(([h]) => typeof skill.params[h]?.example === 'string')
    .map(([h, value]) => ({ example: String(skill.params[h].example), value }));
  for (const [n, p] of Object.entries(skill.params)) {
    if (params[n] || refused.has(n) || !p.example) continue;
    const derived = deriveContained(String(p.example), hosts);
    if (derived) params[n] = derived;
  }
  return Object.keys(skill.params).every((n) => params[n] || refused.has(n)) ? params : null;
}

/**
 * The value a slot the template never states takes on THIS run, read out of a
 * bound slot whose recorded example contained this slot's recorded example.
 *
 * WHY (grafana fwgr64 07-report). The template states `'{{v1}}' at {{v8}}`;
 * v2 (the bare runid, example `fwgr64-n1`) and v3 (the host, `127.0.0.1`) are
 * swallowed whole by those longer slots and appear in it nowhere. Both carry
 * an origin (`var:runid`, `output:i1:grafana_host`), and bindSkill binds such
 * a slot by origin — but at compile time there is no ledger, and at replay
 * the host was never published (the export pruned it as unread), so neither
 * had a value, bindSkill returned null for the WHOLE skill, both replays
 * handed 07-report to the model (29-30 turns) and the compile refused the
 * flow as `unbound-pin` — with every value it needed sitting in the
 * instruction the step was given.
 *
 * The recording is the evidence: the host's example is `L + example + R`,
 * so on this run the slot is what stands where the example stood. It is
 * anchored at one end by the WHOLE literal context (L, or R) and stopped at
 * the other by the delimiter that ended the example in the recording (R's
 * first character, or L's last) — the whole of the far context is not
 * required, because it routinely holds another run value (v8's tail is
 * `…/efyxnzqqt40e8c/fwgr64-n1-bench-dashboard`, a minted uid and the runid,
 * neither of which recurs). A delimiter must be a non-word character the
 * example itself does not contain; that is what makes the stop reproduce the
 * recorded split exactly. A `{{ref}}` is one unit (compile reads the
 * instruction's references where replay reads their values, and the two must
 * agree — a `.` inside `{{02-create.url.p1}}` is not a delimiter).
 *
 * Every host and anchor that yields a value must yield the SAME value; any
 * disagreement, or no reading at all, leaves the slot unbound and bindSkill
 * refuses as before. So this never falls back to the recording's own value:
 * the result is text of this run's instruction or it is nothing.
 */
function deriveContained(example: string, hosts: ReadonlyArray<{ example: string; value: string }>): string | null {
  const found = new Set<string>();
  for (const host of hosts) {
    const at = host.example.indexOf(example);
    // Absent, the slot itself, or ambiguous (two occurrences: which one?).
    if (at < 0 || host.example === example || host.example.indexOf(example, at + 1) >= 0) continue;
    const left = host.example.slice(0, at);
    const right = host.example.slice(at + example.length);
    const stops = (c: string | undefined): c is string => c !== undefined && /[^\p{L}\p{N}_]/u.test(c) && !example.includes(c);
    // Anchored on the whole left context, stopped by right's first character.
    if (host.value.startsWith(left) && (right === '' || stops(right[0]))) {
      const rest = host.value.slice(left.length);
      const end = right === '' ? rest.length : indexOutsideRefs(rest, right[0], 'first');
      const v = end > 0 ? rest.slice(0, end).trim() : '';
      if (v) found.add(v);
    }
    // Anchored on the whole right context, stopped by left's last character.
    if (host.value.endsWith(right) && (left === '' || stops(left[left.length - 1]))) {
      const head = host.value.slice(0, host.value.length - right.length);
      const start = left === '' ? 0 : indexOutsideRefs(head, left[left.length - 1], 'last') + 1;
      const v = start > 0 || left === '' ? head.slice(start).trim() : '';
      if (v) found.add(v);
    }
  }
  return found.size === 1 ? [...found][0] : null;
}

/** Index of `ch` in `text` outside any `{{…}}` reference, or -1. */
function indexOutsideRefs(text: string, ch: string, which: 'first' | 'last'): number {
  let hit = -1;
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('{{', i)) {
      const close = text.indexOf('}}', i + 2);
      if (close >= 0) {
        i = close + 1;
        continue;
      }
    }
    if (text[i] === ch) {
      if (which === 'first') return i;
      hit = i;
    }
  }
  return hit;
}

function squash(text: string): string {
  return text.replace(/[“”"]/g, "'").replace(/\s+/g, ' ').trim();
}

/**
 * A report for a zero-model replay. A value is trustworthy only if it came
 * from this run — either a live read-back, or a slot filled from the caller's
 * own parameters. A recorded literal (the ticket id "RD-1017" from the run
 * that made the skill) is stale on any later run, so it is dropped, never
 * reported from memory; the same stale substrings are struck from the summary.
 * This is the honesty rule the scref3 fabrication made load-bearing, applied
 * to the model-free path.
 */
const MIN_STALE_LEN = 4;

export function synthesizeReport(
  skill: Skill,
  params: Record<string, string>,
  liveValues: Record<string, string>,
  /**
   * The page once the replay's work is done (shownForReport), which a filled
   * value's recorded text must stand on to be published; null observed
   * nothing. fwrd86 06-delete published "Created: 2026-09-23" around this
   * run's ticket id on every replay.
   */
  shown: readonly string[] | null = null,
  opts: ReportOptions = {},
): Report {
  return synthesize(skill, params, liveValues, shown, opts).report;
}

export interface ReportOptions {
  /**
   * Keys the echo guard dropped from the confident values. Withheld outright:
   * the template must not put back what the guard took out. fwrd86 01-signin
   * warned "read 'ticket_title' … dropped from the report's confident values"
   * and then reported ticket_title all the same, from the template's
   * "{{v4}}" — while the artifact, whose echoed read sets the key, never
   * filled it from the template and lists it in run.echoed.
   */
  withhold?: readonly string[];
  /** This run's instruction: the caller's own words, observed for the summary (observedSummary). */
  instruction?: string;
  /**
   * The segments this replay walked, in order (default: the skill alone). A
   * slot any of them TYPED keeps today's rule; any other slot of a value
   * made only of params must be observed (round 60, fwgt11 07-add: the
   * comment s_3db36f filled is published by s_c8e15e's template).
   */
  chain?: readonly Skill[];
  /**
   * The typed slots a commit showed on this run (ReplayResult.committed, every
   * segment of the chain): a slot the chain typed is reported only where one
   * did, or a read returned it (phase B provenance, stage 1).
   */
  committed?: readonly string[];
  /** The urls the replay's page landed on while the chain ran (GivenEvidence.visited, round 63). */
  visited?: readonly string[];
}

/** What a zero-model replay reports, and what a later step's reference may use beyond it. */
export interface ReplayReport {
  report: Report;
  /** Template keys withheld because this run's page did not show their recorded text. */
  withheld: string[];
  /** Summary clauses dropped as unobserved or stale (observedSummary). */
  unobservedProse: string[];
  /**
   * Template keys made only of params that this run never observed — no page
   * line, read or typed value shows them — withheld as given, not observed
   * (round 60, fwgt11 07-add's issue_content_right_a_it: "bug").
   */
  given: string[];
  /**
   * Template keys carrying a slot the chain typed that nothing on this run
   * committed or read back: echoes of the run's own typing, withheld from the
   * report and still given to a later step's reference (phase B provenance,
   * stage 1; execution/report.ts classifyReportValue).
   */
  typed: string[];
  /**
   * For a later step's REFERENCE only, never the report: each template key
   * not reported whose referenceValue this run can supply (a one-slot value's
   * slot). The flow runner banks the ones a later step consumes.
   */
  references: Record<string, string>;
}

/** synthesizeReport, with what it withheld and what references may still use. */
function synthesize(skill: Skill, params: Record<string, string>, liveValues: Record<string, string>, shown: readonly string[] | null, opts: ReportOptions = {}): ReplayReport {
  const template = skill.reportTemplate ?? { summary: '', values: {} };
  const withhold = new Set(opts.withhold ?? []);
  const values: Record<string, string> = {};
  const stale: string[] = [];
  /** Values withheld because this run's page did not show their recorded text. */
  const unshown: string[] = [];
  let omitted = 0;
  /** Values withheld as given, not observed (round 60). */
  const given: string[] = [];
  // What this run observed besides the page: the slots its chain typed and
  // the values its reads returned — the artifact's reportGiven.
  const evidence: GivenEvidence = { typed: typedSlots((opts.chain ?? [skill]).flatMap((s) => s.steps)), live: Object.values(liveValues), committed: opts.committed ?? [], visited: opts.visited ?? [] };
  /** Values withheld as echoes of this run's own typing (phase B). */
  const typedEchoes: string[] = [];
  for (const [k, v] of Object.entries(template.values)) {
    if (k in liveValues) continue; // a live read wins outright, below
    if (withhold.has(k)) continue; // the echo guard's to drop, not the template's to refill
    // A value made only of params publishes only where this run observed it
    // (src/execution/report.ts withheldAsGiven, the artifact's check too):
    // fwgt11 07-add's "{{v7}}" published "bug" beside a live "priority-high".
    // A value carrying a slot the chain typed publishes only where this run
    // committed it (phase B): the same classifyReportValue the artifact asks.
    const verdict = classifyReportValue(v, params, shown, evidence);
    // SITE FACTS shadow (facts.classify, skills/facts-format.ts): would a known rendering have made an echo committed?
    if (verdict.class === 'echo') shadowClassify(skill, opts.chain, v, params, shown, evidence, verdict);
    if (verdict.class === 'given' || verdict.class === 'echo') {
      // The given or typed value is what the prose must not state either.
      stale.push(...verdict.slots.map((slot) => params[slot]));
      (verdict.class === 'given' ? given : typedEchoes).push(k);
      continue;
    }
    // The shared rule (src/execution/report.ts templateValue), which a
    // compiled artifact applies to the same template (fwgh4 03-open).
    const kept = templateValue(v, params, shown);
    // Withheld for text the page does not show: THAT text is what is stale,
    // so it is what the prose below must not keep stating. The whole value
    // would never match the prose — the slots in it are this run's.
    const filled = fillParams(v, params);
    if (kept === null && derivesFromParams(v) && filled && !filled.includes('{{')) {
      stale.push(...unshownLiterals(v, shown));
      unshown.push(k);
      continue;
    }
    // Kept only if every part of it came from a parameter: no residual literal,
    // and no residual MARKER of any spelling. A param can itself arrive still
    // holding a reference the run never resolved — fwod56's `07-change`
    // published `line1_product: "{{03-create.product_name}}"`, because the
    // residual test only looked for `{{vN}}` and a `{{step.output}}` reference
    // is not one. A value that still asks for something is not a value: it
    // stays unpublished, exactly as an unfilled slot "asks for nothing"
    // elsewhere (src/execution/url.ts `unfilled`, gates.ts `markersBound`).
    // Published, it is a placeholder that any consumer can bank, compare and
    // re-publish as data.
    // An empty fill is unfilled too (round 26's rule J), and so not a value.
    if (kept !== null) values[k] = kept;
    else {
      stale.push(v);
      omitted += 1;
    }
  }
  for (const [k, live] of Object.entries(liveValues)) values[k] = live;

  let summary = fillParams(template.summary, params);
  // ONE pass over the prose, every recorded value swapped for its live one at
  // once, longest first. Swapping them one after another re-scanned the text
  // each live value had just put there: fwgr56 07-report's live values were
  // each the dashboard's whole JSON body (a read-back pinned to the page's
  // one <pre>), the body held every other recorded value ("now", "bench",
  // "3"), and seventeen sequential swaps compounded it until the engine
  // refused the string ("Invalid string length") — the step fell back to the
  // model on both replays. A live value is never itself rewritten.
  const swaps: [string, string][] = [];
  for (const [k, live] of Object.entries(liveValues)) {
    const recorded = template.values[k];
    const old = recorded ? fillParams(recorded, params) : undefined;
    if (old && old !== live) swaps.push([old, live]);
  }
  if (swaps.length) {
    swaps.sort((a, b) => b[0].length - a[0].length);
    const re = new RegExp(swaps.map(([old]) => escapeRe(old)).join('|'), 'g');
    summary = summary.replace(re, (hit) => swaps.find(([old]) => old === hit)?.[1] ?? hit);
  }
  // Strip stale recorded literals from the prose so the summary cannot state a
  // value this run did not observe — clause by clause (observedSummary's cut),
  // so one stale figure costs its clause, not the whole summary.
  //
  // Containment is compared LOOSELY. fwrd19l stored the same validation
  // message twice — once in the summary keeping the app's "-" bullets, once
  // in values with them collapsed by whitespace normalisation — and an exact
  // substring test missed by that one character, publishing the recording
  // run's part names as this run's finding.
  const loose = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const fresh = (clause: string): boolean => {
    const hay = loose(clause);
    return !(
      stale.some((v) => loose(v).length >= MIN_STALE_LEN && hay.includes(loose(v))) ||
      // A param's `example` IS the recording run's value. If one survives in
      // the prose while this run bound something else to that param, the
      // clause is describing the wrong record however well the rest filled.
      Object.entries(skill.params).some(([n, p]) => {
        const example = String(p.example ?? '');
        return example.length >= MIN_STALE_LEN && params[n] !== example && hay.includes(loose(example));
      })
    );
  };
  // And every word left must have been observed on THIS run: on the page, or
  // supplied by it — the instruction, a slot's value, a live read, a value it
  // kept. fwrd86 06-delete's "total 15 ({{v1}} plus the pre-existing archived
  // RD-1013)" and 04-edit's "(previously $375.00)" name no value, so the
  // stale rule never saw them; n2 had archived a third ticket.
  const prose = observedSummary(summary, [opts.instruction ?? '', ...Object.values(params), ...Object.values(values)], shown, fresh);
  const dropped =
    !prose.text ||
    // A replay that re-observed NOTHING cannot vouch for a sentence naming
    // specifics. Both rules above need something to compare against — a stale
    // template value, or a param whose example survived — and fwod12's steps
    // 03-06 had neither: no labelled reads, no matching param. So they
    // republished the recording's own narrative verbatim,
    //   "Added a second order line to S00021 and saved."
    // as this run's finding, while publishing {} as their values. The run had
    // created S00023.
    //
    // A sentence NOTHING in this run vouches for.
    //
    // This used to scan the prose for tokens that LOOKED like identifiers and
    // drop the summary only when it found one — the last site in the product
    // where reading characters decided something that fails toward silence. A
    // fabricated sentence naming an id the regex did not recognise ("Added a
    // second order line to Order Alpha and saved") survived as the run's
    // finding, and no widening of the regex fixes that: the property that
    // matters is not how the id is spelled.
    //
    // What this run can vouch for is exactly two things, and both are known
    // without reading anything. A value it OBSERVED (`liveValues`), and a
    // value it SUPPLIED (a param that actually reached the prose). With
    // neither, every specific in the sentence is the recording's, and which
    // of those specifics name a record is the question shape was failing to
    // answer.
    //
    // Fails toward COST: a replay that observed nothing and filled nothing
    // has its true-but-unverified sentence replaced by a duller true one
    // ("Saved the form and closed the dialog." becomes "Replayed stored
    // procedure s_x"). The values the replay did observe are listed either
    // way, and the step's status still says the procedure ran. That is a
    // worse report, never a wrong one.
    // (A clause still carrying an unresolved marker states a placeholder as a
    // finding; observedSummary drops it with the unobserved ones.)
    (!Object.keys(liveValues).length && summary === template.summary);
  const clean = dropped
    ? `Replayed stored procedure ${skill.id}${Object.keys(values).length ? `; observed ${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(', ')}` : ''}.`
    : prose.text;

  // What a later step may still reference: a one-slot value's slot, where the
  // whole value could not be reported (referenceValue). Never an echo key: the
  // echoed read itself is what references get (InstructionResult.published).
  const references: Record<string, string> = {};
  for (const [k, v] of Object.entries(template.values)) {
    if (k in values || k in liveValues || withhold.has(k)) continue;
    const ref = referenceValue(v, params, shown);
    if (ref !== null) references[k] = ref;
  }

  const report: Report = {
    status: 'success',
    summary: clean || `Replayed stored procedure ${skill.id} (${skill.steps.length} steps).`,
    details: `Replayed stored procedure ${skill.id} without the model. Reported values are live read-backs or your own parameters; ${omitted ? `${omitted} recorded value(s) that could not be re-observed were omitted` : 'no stale values were carried over'}${unshown.length ? `; withheld ${unshown.join(', ')}, whose recorded text this run's page did not show` : ''}${given.length ? `; withheld ${given.join(', ')}, given as parameters but not observed on this run` : ''}.`,
    evidence: { values },
  };
  return { report, withheld: unshown, unobservedProse: prose.dropped, references, given, typed: typedEchoes };
}

/**
 * The daemon's zero-model report once a replayed chain has finished: the
 * page looked at once, after the last segment — where the artifact looks,
 * after the step's last segment (spec/emit.ts reportTemplateLines) — and only
 * when a value no live read covers has recorded text to check. `withheld`
 * names what the page did not show (fwrd86 06-delete: "Created: 2026-09-23",
 * "Showing 1–10 of 13"), the way the echo guard names what it dropped.
 */
export async function replayReport(
  getPage: () => Promise<Page>,
  skill: Skill,
  params: Record<string, string>,
  liveValues: Record<string, string>,
  opts: ReportOptions = {},
): Promise<ReplayReport> {
  const pending = Object.entries(skill.reportTemplate?.values ?? {})
    .filter(([k]) => !(k in liveValues) && !(opts.withhold ?? []).includes(k))
    .map(([, v]) => v);
  let shown: string[] | null = null;
  // The summary's words are observed on the page too (observedSummary), so
  // prose is reason enough to look.
  // A param-only value the chain did not type is observed on the page too (round 60).
  const typed = typedSlots((opts.chain ?? [skill]).flatMap((s) => s.steps));
  if (reportNeedsPage(pending, typed) || reportNeedsPage([skill.reportTemplate?.summary ?? ''])) {
    try {
      shown = await shownForReport(await getPage());
    } catch {
      /* browser gone — nothing observed, so nothing recorded is published */
    }
  }
  return synthesize(skill, params, liveValues, shown, opts);
}

/**
 * Which report-value names a tier-A (zero-model) replay of this skill
 * re-publishes deterministically: labelled reads (re-read live from the page)
 * and report-template values derived from the caller's own {{vN}} params
 * (synthesizeReport keeps exactly those; recorded literals are dropped as
 * stale). Used by the flow export lint to flag {{step.output}} references
 * that only model recovery could re-observe.
 *
 * Only a value that publishes for a reference on EVERY run counts
 * (templateSource): since fwrd86 a template value's recorded text publishes
 * only where the page shows it, and a later step's reference falls back to
 * the one slot's own value (referenceValue). A value from several slots with
 * text between them has no such fallback, so it is no source — the same
 * answer the artifact's unsourcedRef gives, and what replay does.
 *
 * Every marker must be bound, too: a declared param of this skill, or a
 * {{dN}} the chain (`chain`, this skill's segments in order) derives — the
 * replay threads those across segments ({ ...match.params, ...derived }),
 * which is how fwec8 02-create's tail can publish the record id its SAVE
 * segment minted. A marker naming neither never fills (fwec8 03-verify's
 * orphan {{v2}}).
 */
export function publishedOutputs(skill: Skill, chain: readonly Skill[] = [skill]): string[] {
  const out = new Set<string>();
  const walk = (steps: Skill['steps']): void => {
    for (const s of steps) {
      if ((s.tool === 'read' || s.tool === 'read_all') && s.label) out.add(s.label);
      if (s.body) walk(s.body);
    }
  };
  walk(skill.steps);
  const bound = new Set([...Object.keys(skill.params ?? {}), ...chain.flatMap((s) => Object.keys(s.derived ?? {}))]);
  for (const [k, v] of Object.entries(skill.reportTemplate?.values ?? {})) {
    if (templateSource(v, (name) => bound.has(name))) out.add(k);
  }
  return [...out];
}


/**
 * How many state-changing steps the MODEL drove in a recovery, beyond what a
 * stored skill replayed — the measure of whether that skill did this step's
 * work or merely ran somewhere inside it. rpgr3-r1 invoked s_567dd1 during a
 * 41-turn 03-add recovery; the skill replayed fully, validated, and was
 * re-pinned — but the model had done 30-odd clicks after it to actually
 * finish, so on the next run the pinned skill alone left the panel unmade.
 * A recovery the skill carried on its own has (near) none of these.
 */
export function agentGesturesOutsideReplay(entries: RecordedEntry[]): number {
  let n = 0;
  for (const e of entries) if (e.k === 'step' && !e.via && isMutatingAction(e.tool)) n++;
  return n;
}

/** The most model-driven gestures a recovery may contain and still hand its replayed skill the pin. */
export const MAX_STRAY_GESTURES_FOR_PIN = 2;

/**
 * Does this skill's procedure CHANGE anything, anywhere in it (loop bodies
 * included)? The one question that separates "a procedure that does this
 * step's work" from "a procedure that merely resolves on this step's page" —
 * see `canAdoptPin` for why that distinction is the most important gate in
 * the store, and `spec/repair.ts` for the repair-time diagnostic that reports
 * a step which only passes because a READ-ONLY skill covered a mutating pin.
 */
export function mutates(store: SkillStore, id: string | undefined): boolean {
  const skill = id ? store.get(id) : null;
  if (!skill) return false;
  return mutatesSteps(skill.steps);
}

/**
 * May a flow step move its pin to `next`? Adoption is already gated on the
 * skill being validated and having just replayed cleanly; these two say the
 * candidate is about THIS STEP'S WORK, not merely a procedure that resolves
 * on this page.
 *
 * fwrd14l-n2 is why. Step 08 (create a scratch ticket) and step 09 (delete
 * both parts) were re-pinned to s_0b2413 — step 07's READ-ONLY skill, which
 * was validated and matched the same detail page. The rewritten flow went to
 * disk; n3 inherited it, replayed 07's read chain for all three steps,
 * changed NOTHING, reported success three times, and halted at step 10 on a
 * scratch ticket that never existed. A replay that reports success having
 * done nothing is the worst failure this system has, so:
 *
 *  1. A skill another step of the flow already owns is that step's procedure.
 *     Two steps are two different instructions; one skill cannot be both.
 *  2. A read-only skill never replaces one that mutates. Reads resolve on any
 *     plausible page, which is exactly why this swap looks like success.
 */
export function canAdoptPin(
  store: SkillStore,
  steps: { id: string; skill?: string }[],
  stepId: string,
  current: string | undefined,
  next: string,
  /**
   * What the step's own instruction asks for, when the caller knows it. A
   * step that asks to change something must never settle for a procedure
   * that reads — even when it has no pin yet to compare against, which is
   * the gap rule 2 alone leaves open.
   */
  intent: 'mutating' | 'read-only' | null = null,
): boolean {
  const nextMutates = mutates(store, next);
  // Rule 1, narrowed: a MUTATING procedure is one step's work and one step's
  // only. A read-only procedure is a way of looking at a page, and two steps
  // that look at the same page the same way may share it — fwod34r's 08-open
  // ("open the order, report its status") replayed 07-open's validated status
  // read at tier B on five straight runs and could not keep it, because the
  // unnarrowed rule refused to let a second step own it.
  if (nextMutates && steps.some((s) => s.id !== stepId && s.skill === next)) return false;
  if (intent === 'mutating' && !nextMutates) return false;
  return !(mutates(store, current) && !nextMutates);
}

/**
 * Where a flow step's pin goes after this run, if anywhere. Pure: every gate
 * the verdict rests on arrives as a fact, so the whole decision is one
 * readable function instead of a chain of conditions inside the flow runner.
 *
 * Lifecycle-gated adoption: the pin only ever moves to a skill that is
 * VALIDATED and has just replayed this step cleanly. A skill compiled from a
 * single model recovery enters the store provisional and must EARN the pin by
 * validating across runs — flow5 showed that force-pinning such a skill
 * (usually MORE fragile than the clean original) makes the zero-model
 * fraction non-monotone: fail, recover, re-pin another provisional, churn.
 *
 * The exception is a step with NOTHING WORTH KEEPING: an ADOPTED step (its
 * incumbent, if any, is a partial compiled from a non-success recording —
 * rpod1's 01-open replayed 1/2 then paid ~90 turns of recovery on EVERY
 * replay), a step with no pin at all, or one pinned to a DEMOTED skill. None
 * of those is better than a recovery that just completed the whole step, so
 * on the first clean recovery its skill is pinned, provisional or not.
 * fwgr39-n3's 04-open kept its pin on demoted s_92b602 after a clean recovery
 * and the spec compile then refused the whole flow.
 *
 * The candidate is either the stored skill the recovery replayed in full
 * (`outcome`) or, when no stored skill carried the step, the skill this
 * successful recording compiled or merged into (`compiled`). fwod47-n2's
 * adopted 03-add had no pin, so nothing was replayed, `outcome` was absent,
 * and the s_8f8761 its 24-turn recovery compiled was never pinned — n3 paid
 * 59 turns for the same step.
 *
 * `stray` is the model-driven gesture count outside the skill replay: a skill
 * that ran inside a recovery the model then finished by hand did not carry
 * the step, and pinning it would replay the same shortfall. It says nothing
 * about a `compiled` candidate, which IS those gestures. `adoptable` is
 * canAdoptPin's verdict (never steal another step's skill, never demote a
 * mutating step to a read-only one).
 */
export function decideRepin(input: {
  step: { id: string; skill?: string; adopted?: boolean };
  reportStatus: Report['status'];
  outcome: LearnedRecord['outcome'];
  /** The skill this run's successful recording compiled or merged into, with its status after learning. */
  compiled?: { skill: string; status: Skill['status'] };
  /**
   * The step's current pin's status in the store; 'missing' when the step
   * has no pin or the store no longer holds it. Omitted means healthy.
   */
  incumbent?: Skill['status'] | 'missing';
  stray: number;
  adoptable: boolean;
  /**
   * Navigation targets in the candidate skill that carry an identifier THIS
   * step's recovery minted (a url part first banked during this step). Such
   * a skill would send every later run to this run's record: fwgr26-n3's
   * recovery typed `goto /d/<its own uid>/…`, verify-artifacts flagged it,
   * and the pin moved anyway.
   */
  mintedLeaks?: string[];
  /**
   * pinStartsElsewhere's verdict: the candidate's procedure starts on a page
   * other than the one this step began on, so it covers only part of the
   * step (fwop2 01-signin: a tail recorded after the sign-in it omits).
   */
  startsElsewhere?: string | null;
  /**
   * pinEndsElsewhere's verdict: the candidate's chain ends on a route other
   * than the one the next step's pin starts on, and that pin does not
   * navigate there itself (fwec4-n3 02-create: a chain ending on the list,
   * followed by a 03-verify recorded on the record's view page).
   */
  endsElsewhere?: string | null;
  /**
   * pinCarriesFailedStep's verdict: the candidate's chain replays a step a
   * DEMOTED skill failed at (fwsi7-n3 02-create).
   */
  failedStep?: string | null;
}): { skill: string; graduated: boolean } | { refused: string } | null {
  const { step, outcome } = input;
  // A full replay of the incumbent itself leaves nothing to move.
  if (outcome?.ok && outcome.skill === step.skill) return null;
  // A replayed skill the model drove past did not carry the step; the whole
  // recording this run compiled (learnFromInstruction's full-replay-plus-
  // gestures path) is the candidate instead, judged by the same gates below.
  const carried = !(outcome?.ok && input.stray > MAX_STRAY_GESTURES_FOR_PIN);
  if (outcome?.ok && !carried) {
    const whole = input.compiled && input.compiled.skill !== outcome.skill && input.compiled.skill !== step.skill ? input.compiled : undefined;
    if (!whole) return { refused: `not re-pinning ${outcome.skill} — the model drove ${input.stray} gesture(s) beyond its replay, so it did not carry the step` };
  }
  const replayed = outcome?.ok && carried ? outcome : undefined;
  const cand = replayed ?? input.compiled;
  if (!cand || cand.skill === step.skill) return null;
  if (input.mintedLeaks?.length) {
    return { refused: `not re-pinning ${cand.skill} — its navigation carries an identifier this run made (${input.mintedLeaks.slice(0, 3).join(', ')}), so it would replay onto this run's record` };
  }
  if (input.startsElsewhere) return { refused: `not re-pinning ${cand.skill} — ${input.startsElsewhere}` };
  if (input.endsElsewhere) return { refused: `not re-pinning ${cand.skill} — ${input.endsElsewhere}` };
  if (input.failedStep) return { refused: `not re-pinning ${cand.skill} — ${input.failedStep}` };
  if (input.reportStatus !== 'success' || !input.adoptable || cand.status === 'demoted') return null;
  // An adopted step graduates on its first clean recovery whatever the
  // candidate's status: it now owns a skill that completed it, and keeping
  // the flag would leave a pinned step on the model-first route (the local
  // re-record of odoo 08-open onto validated s_04d970 kept `adopted: true`).
  if (cand.status === 'validated') return { skill: cand.skill, graduated: Boolean(step.adopted) };
  if (step.adopted) return { skill: cand.skill, graduated: true };
  const nothingToKeep = !step.skill || input.incumbent === 'missing' || input.incumbent === 'demoted';
  if (nothingToKeep) return { skill: cand.skill, graduated: false };
  return null;
}

/**
 * Whether a re-pin candidate's chain carries a step that a DEMOTED skill
 * failed at: a segment step recorded `via` that skill and step, where the
 * skill's own record says it failed there. snipeit fwsi7-n3 02-create
 * re-pinned the chain s_9a4939 → s_19095e → s_0aa6d6, and s_0aa6d6 was
 * `goto /hardware/4` via {skill: s_5dcb48, step: 1} — the step s_5dcb48 had
 * just stopped at (failedAtStep {1: 2}, demoted). The artifact died on it.
 * Evidence from the store, not the step's shape. Null when none does.
 */
export function pinCarriesFailedStep(store: SkillStore, candidateId: string): string | null {
  const cand = store.get(candidateId);
  if (!cand) return null;
  const chain = cand.seq ? store.list(cand.origin).filter((s) => s.seq?.chain === cand.seq!.chain) : [cand];
  for (const seg of chain) {
    for (const step of seg.steps) {
      if (!step.via) continue;
      const src = store.get(step.via.skill);
      if (!src || src.status !== 'demoted' || !(src.stats.failedAtStep?.[step.via.step] ?? 0)) continue;
      return `its segment ${seg.id} replays step ${step.via.step} of ${src.id}, a demoted procedure that failed there`;
    }
  }
  return null;
}

/**
 * Whether a re-pin candidate starts where the step did. A pin is the step's
 * WHOLE procedure: the daemon runs it on whatever page the previous step left
 * (or the flow's start url), and the compiled artifact runs it and nothing
 * else. A candidate whose chain head is gated on another page starts after
 * something the step had to do first — fwop2's 01-signin was re-pinned to a
 * procedure whose first click is a project in the signed-in projects list,
 * recorded after its chain's sign-in segments had replayed; inside that
 * daemon session the browser was already signed in, and the artifact's fresh
 * browser was on the login form. The evidence is the recording's own: the
 * page the instruction began on, against the head's stored start pattern
 * (landedOnRecordedPage — a strict match, or a soft one on minted values).
 * Null when it starts there, or when either side is unknown.
 */
export function pinStartsElsewhere(store: SkillStore, candidateId: string, stepStartUrl: string | undefined): string | null {
  if (!stepStartUrl) return null;
  const cand = store.get(candidateId);
  if (!cand) return null;
  const head = cand.seq
    ? (store.list(cand.origin).find((s) => s.seq?.chain === cand.seq!.chain && s.seq.index === 0) ?? cand)
    : cand;
  const pattern = head.preconditions.urlPattern;
  if (!pattern) return null;
  // SITE FACTS stage 1 (consumer 1): a reliable route fact decides whether
  // the step's start page is the head's route (a `state` query key never
  // separates them; a one-sided `routing` key does; an `anchor` fragment is
  // the same page). No reliable fact: the strict landing rule, as before.
  const startsHere = (p: string, u: string, byFragment: boolean): boolean => landedOnRecordedPage(byFragment ? p : p.replace(/#.*$/, ''), byFragment ? u : u.replace(/#.*$/, ''));
  if (agreeWithFacts(store, cand.origin, pattern, stepStartUrl, true, startsHere, landedOnRecordedPage(pattern, stepStartUrl), `pinStartsElsewhere ${head.id}`)) return null;
  return `its procedure starts on ${pattern} (${head.id}), and this step began on ${urlPattern(stepStartUrl)}: it covers only what follows something the step had to do first`;
}

/**
 * Whether a re-pin candidate ENDS where the next step's procedure begins —
 * pinStartsElsewhere's other end. A pin hands the page it leaves to the next
 * step, and a next step whose pin opens with no navigation of its own runs on
 * exactly that page. fwec4-n3's recovery of 02-create graduated the chain
 * s_e1e58c → s_cad6eb → s_e0d705, whose last click went back to the
 * `#Opportunity` list; 03-verify's pin, recorded after 02-create had left
 * the browser on the record's view page, starts there with no goto, and was
 * refused on n3 ("expects …#Opportunity/view/:id, browser is at
 * …#Opportunity") and in the compiled script.
 *
 * The evidence is the two stored procedures: where the candidate's chain tail
 * last recorded the page (its last step's url expectation, else its start
 * pattern) against the next pin's chain head start pattern, compared as
 * routes — a slot marker and `:id` are both "some record" (routeOf). Null
 * when they agree, when the next pin opens with a goto (it goes where it
 * needs), or when either side is unknown.
 */
export function pinEndsElsewhere(store: SkillStore, candidateId: string, nextPinId: string | undefined): string | null {
  if (!nextPinId || nextPinId === candidateId) return null;
  const cand = store.get(candidateId);
  const next = store.get(nextPinId);
  if (!cand || !next) return null;
  const members = (s: Skill) => (s.seq ? store.list(s.origin).filter((m) => m.seq?.chain === s.seq!.chain) : [s]);
  const tail = cand.seq ? members(cand).reduce((a, b) => ((b.seq?.index ?? 0) > (a.seq?.index ?? 0) ? b : a), cand) : cand;
  const head = next.seq ? (members(next).find((m) => m.seq?.index === 0) ?? next) : next;
  if (head.steps[0]?.tool === 'goto') return null;
  // A next pin that is itself demoted will not run as it stands, so where it
  // starts decides nothing (fwsi9-n3: 04-report's good variant was refused
  // against 05-open's unrunnable s_72aa4e, and 05-open was re-pinned later in
  // the same run). The flow runner re-asks this against the next step's pin
  // as it stands at the END of the run (server.ts deferredPins).
  if (pinStatus(store.list(next.origin), next) === 'demoted') return null;
  const start = head.preconditions.urlPattern;
  const end = [...tail.steps].reverse().find((s) => s.expect?.urlPattern)?.expect?.urlPattern ?? tail.preconditions.urlPattern;
  const byFragment = routesByFragment(store, cand.origin);
  // SITE FACTS stage 1 (consumer 1): a reliable route fact's verdict
  // replaces today's routesAgree; the shadow row is written either way.
  const agree = Boolean(start && end) && agreeWithFacts(store, cand.origin, start!, end, byFragment, routesAgree, routesAgree(start!, end, byFragment), `pinEndsElsewhere ${tail.id} -> ${head.id}`);
  if (!start || !end || agree) return null;
  return `its procedure ends on ${end} (${tail.id}), and the next step's procedure (${head.id}) starts on ${start} without navigating there: it would leave the next step on the wrong page`;
}

/**
 * Two routes agree, decided by the origin's site facts where a RELIABLE fact
 * settles it (execution/facts-route.ts routesAgreeByFacts: `state` query keys
 * dropped, a one-sided `routing` key separating, a `route.fragment` replacing
 * `byFragment`), else `heuristic` — today's verdict, unchanged. The
 * `facts.routesAgree` shadow row is buffered whenever any fact bears on the
 * pair, with `applied: true` when the fact decided. Never throws: a fact that
 * cannot be read is a fact that does not decide.
 */
function agreeWithFacts(store: SkillStore, origin: string, start: string, end: string, byFragment: boolean, today: RoutesAgree, heuristic: boolean, step: string): boolean {
  try {
    const sf = factStoreFor(store.dir).read(origin);
    const r = routesAgreeByFacts(sf, start, end, byFragment, today);
    const applied = Boolean(r?.decided);
    const row = routesAgreeShadow(sf, start, end, byFragment, today, heuristic, step);
    if (row && applied) Object.assign(row, { applied: true });
    bufferFactRow(store, row);
    return applied ? r!.agree : heuristic;
  } catch {
    return heuristic;
  }
}

/**
 * A url pattern as a route: every slot marker and `:id` read as the same
 * "some record" position — and, on an app that does not route by fragment,
 * the fragment dropped: Snipe-IT's `/hardware/:id#history` is the History tab
 * of `/hardware/:id`, one page (fwsi9-n3 04-report).
 */
function routeOf(pattern: string, byFragment: boolean): string {
  const route = pattern.replace(/\{\{[^{}]*\}\}|:id\b|:var\b/g, '*');
  return byFragment ? route : route.replace(/#.*$/, '');
}

/**
 * Whether a candidate's end and the next pin's start are the same route: as
 * routes textually, else by the replay gate's own url rule (urlDiff, read
 * either way round). The query string is view state there: a key only one
 * side carries is not a different page, a wildcard matches any value, and
 * only a key BOTH carry with two different literals separates pages
 * (kanboard's `?controller=…`). fwop15-cv2: every re-record of 01-open ended
 * on `…/work_packages` or `…/work_packages?query_props={…filters…}` and 02's
 * pin starts on `…/work_packages?query_props=:var` — the page 02 replays on
 * without complaint — and all five were refused on the query string alone.
 */
function routesAgree(start: string, end: string, byFragment: boolean): boolean {
  if (routeOf(start, byFragment) === routeOf(end, byFragment)) return true;
  const strip = (u: string): string => (byFragment ? u : u.replace(/#.*$/, ''));
  const agree = (pattern: string, url: string): boolean => {
    const d = urlDiff(pattern, url);
    return d !== null && d.length === 0;
  };
  return agree(strip(start), strip(end)) || agree(strip(end), strip(start));
}

/**
 * Whether an origin ROUTES by fragment, by its own recorded urls: some stored
 * pattern's fragment carries a path (`#Opportunity/view/:id`, `#/posts`) or
 * state (`#action=9&cids=1`) — EspoCRM, Ghost and Odoo do; a bare `#history`
 * anchor is not evidence of either. Provenance, not the fragment's look:
 * fwec4's `#Opportunity` list and `#Opportunity/view/:id` stay two routes
 * because the same store records the latter.
 */
function routesByFragment(store: SkillStore, origin: string): boolean {
  const patterns = store.list(origin).flatMap((s) => [s.preconditions.urlPattern, ...s.steps.map((st) => st.expect?.urlPattern)]);
  return patterns.some((p) => {
    const hash = typeof p === 'string' ? p.indexOf('#') : -1;
    return hash >= 0 && /[/=]/.test(p!.slice(hash + 1));
  });
}

export function instructionEntry(entries: RecordedEntry[]): RecordedInstruction | undefined {
  return entries.find((e): e is RecordedInstruction => e.k === 'instruction');
}

export type { SkillRecord };
