import type { Flow } from '../skills/flow.js';
import { mutates, selectCandidates } from '../skills/learn.js';
import { threadStepParams } from '../skills/rethread.js';
import { diagnosticLine, rerecordFix, rerecordAction, type Diagnostic } from './diagnostics.js';
import { LEAKED_STEP } from './rerecord.js';
import { SKILL_CONTRACT, pageEffectDemoted, stepsCarryContext, type Skill, type SkillParam, type SkillStep, type SkillStore } from '../skills/store.js';
import { seedRecipes, snapshotRecipes, type ComponentStore } from '../skills/components.js';
import type { RecipeSnapshot } from '../execution/recipes.js';
import { FINGERPRINT_DIMS } from '../execution/fingerprint.js';
import type { BrowserProfile } from '../execution/browser.js';

/**
 * The intermediate representation a compiled spec carries.
 *
 * It is a FLOW plus the converged procedures its steps resolved to, with
 * everything the emitted file cannot honour dropped: stats, status, the
 * model that recorded it. (The structural fingerprint DOES travel, per
 * segment: the artifact measures the live page against it.) Two reasons for it
 * to be its own shape rather than "a Flow and a store". First, the emitted
 * `.flow.ts` embeds this object verbatim as its FLOW constant, so it has to
 * be self-contained — a spec that resolved its skills out of `~/.sitelooper`
 * at run time would not be a Tier-2 artifact at all. Second, the store is
 * mutable and the file is a snapshot: pinning the procedure here is what
 * makes `lift(emit(spec))` the same IR every time, however the store has
 * moved on since.
 */
export interface SpecFlow {
  /**
   * 1, or 2 for a spec whose procedures say where a target lives or what a
   * step does to its page (SkillStep.contexts / page / effect, contract 3). A
   * build that lifts only version 1 refuses such a file rather than lowering
   * it into procedures it would resolve against the main page.
   */
  version: 1 | 2;
  /** Flow name. */
  name: string;
  origin: string;
  startUrl: string;
  /** Flow-level inputs; the spec takes them as a `vars` object. */
  vars: string[];
  /** One per FlowStep, in order. */
  steps: SpecStep[];
  /**
   * The component recipes the artifact drives `fill`/`type`/`select` through
   * (src/execution/recipes.ts): one bare procedure per (family, intent), the
   * one the daemon's ComponentStore would have chosen at COMPILE time —
   * seeds and learned variants alike, demoted ones omitted. Compile-time
   * state, frozen like the segments: the daemon's store keeps learning,
   * validating and demoting after this file is written, and the artifact does
   * not. Absent on a spec compiled without a store (hand-built, lowered,
   * lifted from an older file): the emitter then carries the shipped seeds,
   * which is exactly what a fresh install's store holds.
   */
  recipes?: RecipeSnapshot;
  /**
   * The browser the flow was recorded in (Flow.browser), for the artifact to
   * apply and judge against. Absent on a flow saved before it was stored, which
   * was recorded at DEFAULT_BROWSER_PROFILE.
   */
  browser?: BrowserProfile;
}

export interface SpecStep {
  /** FlowStep.id, e.g. "01-open". */
  id: string;
  instruction: string;
  /** slot -> value; values may be literals, "{{var}}" or "{{stepId.output}}" refs (FlowStep.params). */
  params: Record<string, string>;
  /** FlowStep.outputs. */
  outputs: string[];
  /** The converged procedure: the skill's segments in seq order; empty when the step has no skill. */
  segments: SpecSegment[];
  /** FlowStep.urlRoutes: url outputs minted from a url the step visited but did not end on, with their routes (fwgh14). */
  urlRoutes?: Record<string, string>;
}

/** A Skill minus what the spec does not need to carry: stats, status, provenance.model. */
export interface SpecSegment {
  id: string;
  template: string;
  params: Record<string, SkillParam>;
  preconditions: {
    urlPattern: string;
    requireText?: string[];
    /**
     * The structural fingerprint the skill recorded of its start page
     * (src/execution/fingerprint.ts): FINGERPRINT_DIMS numbers, verbatim from
     * the store. Replay lets a same-shape url with 1–2 differing segments
     * through only when the live page measures close to it
     * (preconditionVerdict); the artifact embeds the same `fingerprintPage`
     * and `cosine` and takes the same measurement, so both runners make the
     * same soft-match decision. Absent when the skill kept none — the url
     * alone decides, on both runners.
     */
    fingerprint?: number[];
    /**
     * LEGACY, read for back-compat only: a file compiled before the vector
     * travelled marked a fingerprinted segment with this flag and no vector.
     * Such a segment cannot be measured, so the emitter hands the verdict
     * `'unmeasured'` (a soft url match is refused) and warns that the file
     * should be recompiled (`unmeasured-precondition`). Never written for a
     * segment that carries `fingerprint`.
     */
    fingerprinted?: true;
  };
  /** Verbatim, including locators[].seen evidence, expect, mints, loops. */
  steps: SkillStep[];
  derived?: Skill['derived'];
  /**
   * What the page shows once this step's work is DONE — the positive
   * counterpart of `preconditions.requireText`, copied from `Skill.goal`.
   *
   * Carried on the LAST segment of a MUTATING procedure only: that segment is
   * the one that finishes the work, and a read-only procedure has no state it
   * could already be in. The emitter turns it into the `satisfied()` guard at
   * the top of the step body, so a spec re-running a step whose work has
   * already landed does nothing instead of hunting for a control that no
   * longer exists — fwod34's 08-open, asked to cancel an order 06-open had
   * already cancelled, and failing on a Cancel button that is not there.
   */
  goal?: { requireText: string[] };
  /**
   * The skill's report template, carried on the LAST segment of a step's chain
   * (and beside a `goal`, which only the last segment has). After the step's
   * last segment the artifact publishes each value built from the caller's own
   * `{{vN}}` that no live read published — the daemon's synthesizeReport over
   * the same segment, through the shared templateValue (src/execution/report.ts).
   * When the goal guard short-circuits the step, these are the values the
   * step's read-backs would have published, and the steps after it must still
   * see them.
   */
  report?: { summary: string; values: Record<string, string> };
}

/**
 * The one-line form of the `unmeasured-precondition` diagnostic. The emitter
 * pushes the same line as a warning of its own (it can be run without the
 * diagnostics), and the compile CLI prints a warning once per distinct line.
 */
export function unmeasuredPreconditionLine(stepId: string, segmentId: string): string {
  return `${stepId}: segment ${segmentId} enforces its url precondition without the page-fingerprint soft-match (this file predates carried fingerprints and has no vector to measure against) — recompile it with \`sitelooper compile\``;
}

/** The typed form of `unmeasuredPreconditionLine`, for a lifted segment with the legacy flag and no vector. */
export function unmeasuredPreconditionDiagnostic(stepId: string, segmentId: string): Diagnostic {
  return {
    code: 'unmeasured-precondition',
    step: stepId,
    what: `segment ${segmentId} enforces its url precondition without the page-fingerprint soft-match replay applies`,
    why: `${segmentId} recorded a structural fingerprint of its start page, but this file was compiled before the vector travelled in the spec, so it has nothing to measure the live page against: a start url that differs in a segment or two is refused outright (replay would compare page structure and may proceed). Only a strict url match starts this segment in the artifact.`,
    fix: 'recompile the flow with `sitelooper compile`: the recompiled file carries the fingerprint, and the artifact then measures the page exactly as replay does',
    severity: 'warning',
    line: unmeasuredPreconditionLine(stepId, segmentId),
  };
}

/** Whether a vector is the shape `fingerprintPage` produces: FINGERPRINT_DIMS finite numbers. */
export function isFingerprintVector(v: unknown): v is number[] {
  return Array.isArray(v) && v.length === FINGERPRINT_DIMS && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

/** A skill as the spec carries it: the procedure, none of the bookkeeping. */
function toSegment(skill: Skill, goalBearing = false, last = false): SpecSegment {
  const seg: SpecSegment = {
    id: skill.id,
    template: skill.template,
    params: skill.params,
    preconditions: { urlPattern: skill.preconditions.urlPattern },
    steps: skill.steps,
  };
  // Identity markers travel, and so does the fingerprint: the artifact embeds
  // the same measurement replay takes (src/execution/fingerprint.ts). A vector
  // of any other length is one replay can never compare (`cosine` of unequal
  // lengths is null, so its url alone decides) — leaving it out gives the
  // artifact that same null.
  if (skill.preconditions.requireText?.length) seg.preconditions.requireText = skill.preconditions.requireText;
  if (isFingerprintVector(skill.preconditions.fingerprint)) seg.preconditions.fingerprint = skill.preconditions.fingerprint;
  if (skill.derived) seg.derived = skill.derived;
  // The goal travels only where it can be acted on: see SpecSegment.goal.
  if (goalBearing && skill.goal?.requireText?.length) {
    seg.goal = { requireText: [...skill.goal.requireText] };
    if (skill.reportTemplate) seg.report = skill.reportTemplate;
  }
  // ...and the chain's LAST segment always carries it: its values built from
  // the caller's own params are what the daemon's zero-model report publishes
  // after the chain (synthesizeReport, over that same segment), so the
  // artifact publishes them there too (fwgh4 03-open).
  if (last && skill.reportTemplate && Object.keys(skill.reportTemplate.values).length) seg.report = skill.reportTemplate;
  return seg;
}

/**
 * Every segment of the procedure `skill` belongs to, in replay order.
 *
 * A multi-segment skill is ONE recorded instruction split at page-template
 * boundaries (see Skill.seq), and replay composes the chain in `index`
 * order. A compiler that emitted only the segment the flow step points at
 * would silently drop the rest of the instruction — the sign-in step of
 * fwat2 is two segments, and the second is where the app actually lands.
 */
/**
 * A pinned step the flow gave no bindings: the skill replay runs for it, and
 * the bindings replay gives it.
 *
 * Replay's rule (skills/learn.ts `selectCandidates`): with no pinned params,
 * every live skill of the origin is a candidate that binds by reading its
 * template as a pattern over the instruction (`bindSkill`), best track record
 * first. The pin gets no special standing. fwrd50 03-add bound nothing ("the
 * pinned skill s_c675d2 bound no params for this instruction") and went to the
 * model; fwat3 04-add and fwgr21 08-open were run by a DIFFERENT skill whose
 * template did read over the instruction. The emitter compiled the pin in all
 * three and inlined each slot's recorded example, so fwrd50's spec went looking
 * for run 1's ticket and typed run 1's part names.
 *
 * Compile time has the instruction's `{{ref}}` text where replay has resolved
 * values; the pattern match is the same, and the bound text is a template the
 * spec resolves per run. It lacks the run's ledger, so a slot only a recorded
 * origin could fill does not bind here — a refusal, never a wrong record.
 */
export function replayBinding(pinned: Skill, skills: Skill[], instruction: string): { skill: Skill; params: Record<string, string> } | null {
  return selectCandidates(skills, pinned.id, instruction, undefined, {})[0] ?? null;
}

function chainOf(skill: Skill, store: SkillStore): Skill[] {
  if (!skill.seq) return [skill];
  const chain = skill.seq.chain;
  const members = store
    .list(skill.origin)
    .filter((s) => s.seq?.chain === chain)
    .sort((a, b) => (a.seq?.index ?? 0) - (b.seq?.index ?? 0));
  return members.length ? members : [skill];
}

/**
 * The evidence sentence behind a demotion, straight out of the store's stats.
 *
 * A demotion is never a guess — `SkillStore.record` demotes a skill only when
 * two consecutive replays failed at the SAME step — so the numbers that caused
 * it are the honest answer to "why should I re-record this?", and printing
 * them is what turns "compiles a demoted skill" into something a caller can
 * act on without opening the store.
 *
 * How many of those stops the FLOW recovered from belongs in the same
 * sentence (`SkillStats.recoveredStops`). fwod49 is why: s_32409f was demoted
 * by two stops, and on both runs the step around them reported success — the
 * diagnostic said "its last replays failed at the same step" over a flow that
 * had passed twice, which reads as a broken procedure and is not one. A stop
 * every run recovered from is a re-recording worth doing, not an emergency,
 * and the caller can only tell the two apart if the number is printed.
 */
function demotionWhy(skill: Skill): string {
  const st = skill.stats;
  const parts = [`${skill.id} is demoted: ${st.successes} of ${st.uses} replays succeeded`];
  const worst = Object.entries(st.failedAtStep ?? {}).sort((a, b) => b[1] - a[1])[0];
  if (worst) parts.push(`replay failed at step ${worst[0]} on ${worst[1]} of them`);
  // Absent is not zero: a store written before the counter existed does not
  // know how its stops ended, and saying "none were recovered" there would be
  // a claim about runs nobody watched.
  const recovered = st.recoveredStops;
  if (st.partial > 0 && recovered !== undefined) {
    parts.push(
      recovered === 0
        ? `none of the ${st.partial} stop(s) were recovered — the instruction failed around each`
        : `${recovered} of the ${st.partial} stop(s) were recovered (the step still finished)`,
    );
  }
  if (st.lastFailedAt !== undefined) parts.push(`the demotion was two consecutive failures at step ${st.lastFailedAt}`);
  // A store banked before page-effect stops became strikes (pageEffectDemoted):
  // say which step, and why a recovered stop there still counts.
  if (skill.status !== 'demoted' && worst) {
    parts.push(`step ${worst[0]} opens or switches the page (a popup or tab) that later steps' procedures were recorded on, so a stop there is a strike even when the step recovered`);
  }
  if (st.lastUsed) parts.push(`last used ${st.lastUsed}`);
  return `${parts.join('; ')}.`;
}

/**
 * The record-time warnings a flow carries, as diagnostics.
 *
 * `buildFlow` flags two record-time problems and stores each on the flow with
 * a code prefix: `noop-step:` — an instruction MUTATING by intent that
 * changed nothing (fwod34's 08-open asks to cancel an order step 06 already
 * cancelled) — and `contradicted-step:` — a read-only step that read a value
 * contradicting the mutating step immediately before it (fwod34's 07-open
 * read "Sales Order" right after 06-open reported "Cancelled" for the same
 * order). Both are the same shape of fact: a step whose RECORDING, not the
 * app, is what a later failure is about — so both re-surface here the same
 * way, each pointing at the step whose re-recording fixes it.
 */
function noopDiagnostics(flow: Flow, flowFile: string | undefined): Diagnostic[] {
  const ids = new Set(flow.steps.map((s) => s.id));
  const out: Diagnostic[] = [];
  for (const warning of flow.warnings ?? []) {
    if (warning.startsWith('noop-step:')) {
      const text = warning.slice('noop-step:'.length).trim();
      const first = text.split(/\s+/)[0] ?? '';
      const step = ids.has(first) ? first : undefined;
      out.push({
        code: 'noop-step',
        step,
        what: step ? `${step} changed nothing when it was recorded, though its instruction asks for a change` : text,
        why: text,
        fix: step ? rerecordFix(flowFile ?? flow.name, step) : undefined,
        action: step ? rerecordAction(flowFile ?? flow.name, step) : undefined,
        severity: 'warning',
        line: text,
      });
    } else if (warning.startsWith(LEAKED_STEP)) {
      // Export quarantined this step: its recorded procedure located an
      // element by a value the recording run made. It is unpinned, so it also
      // reports `no-procedure` — this is the diagnostic that says WHY, and it
      // is an error because the fix is a recording, not a rerun.
      const text = warning.slice(LEAKED_STEP.length).trim();
      const first = text.split(/\s+/)[0] ?? '';
      const step = ids.has(first) ? first : undefined;
      out.push({
        code: 'needs-rerecord',
        step,
        what: step ? `${step} was taken out of replay at export: its procedure located an element by a value the recording run made` : text,
        why: text,
        fix: step ? rerecordFix(flowFile ?? flow.name, step) : undefined,
        action: step ? rerecordAction(flowFile ?? flow.name, step) : undefined,
        severity: 'error',
        line: text,
      });
    } else if (warning.startsWith('contradicted-step:')) {
      const text = warning.slice('contradicted-step:'.length).trim();
      const first = text.split(/\s+/)[0] ?? '';
      const step = ids.has(first) ? first : undefined;
      const rerecordMatch = text.match(/Re-record (\S+?)\.?$/);
      const rerecordStep = rerecordMatch && ids.has(rerecordMatch[1]) ? rerecordMatch[1] : undefined;
      out.push({
        code: 'contradicted-step',
        step,
        what: step ? `${step} read a value that contradicts what the previous step reported` : text,
        why: text,
        fix: rerecordStep ? rerecordFix(flowFile ?? flow.name, rerecordStep) : undefined,
        action: rerecordStep ? rerecordAction(flowFile ?? flow.name, rerecordStep) : undefined,
        severity: 'warning',
        line: text,
      });
    }
  }
  return out;
}

/**
 * Resolve a flow against a skill store into the IR the emitter prints.
 *
 * Diagnostics are the honest half of the result: a step with no converged
 * procedure still becomes a SpecStep (the flow's shape is worth showing)
 * with empty segments, and the emitter turns that into a `throw` rather
 * than into silence. A demoted skill compiles — it is the best evidence
 * there is — but the caller is told, with the stats behind the demotion and
 * the `rerecord` command that fixes it, because a demotion means the last two
 * replays failed at the same step and the emitted assertions inherit that.
 *
 * `warnings` stays exactly what it was (`diagnostics.map(diagnosticLine)`), so
 * every caller and test that reads the one-line strings keeps working.
 */
export function flowToSpec(
  flow: Flow,
  store: SkillStore,
  o: {
    flowFile?: string;
    /**
     * The component store whose recipe choices the spec snapshots
     * (`SpecFlow.recipes`). The compile CLI passes the one the daemon reads
     * (`$SITELOOPER_COMPONENTS_FILE`, else `<home>/components.json`), so the
     * artifact carries what a replay on this machine would have used. Omitted
     * — a lowered spec re-read by repair, a test's hand-built flow — the spec
     * carries no snapshot and the emitter falls back to the shipped seeds.
     */
    components?: ComponentStore;
  } = {},
): { spec: SpecFlow; warnings: string[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [...noopDiagnostics(flow, o.flowFile)];
  // The recipe findings keep their place ahead of the per-step ones; whether
  // there are any is decided once the steps are known (see below).
  const recipeAt = diagnostics.length;
  const steps: SpecStep[] = [];
  const fixFile = o.flowFile ?? flow.name;

  for (const step of flow.steps) {
    const pinned = step.skill ? store.get(step.skill) : null;
    let skill = pinned;
    let params = step.params ?? {};
    // Ask the store WHY it has nothing before saying it has nothing. A
    // procedure this build refuses is excluded from `get`, so without this
    // the headline symptom of a version mismatch is a missing-skill warning
    // telling the user to check SITELOOPER_SKILLS_DIR — sending them to look
    // for a file that is sitting exactly where they left it.
    const refused = step.skill ? store.unreadable.find((u) => u.id === step.skill) : undefined;
    if (step.skill && !skill && refused) {
      diagnostics.push({
        code: 'future-contract',
        step: step.id,
        what: `its pinned skill ${step.skill} ${refused.why}`,
        why: `the procedure is intact at ${refused.file}; this build reads up to contract ${SKILL_CONTRACT}, so emitting it would mean guessing at semantics it does not implement.`,
        fix: 'upgrade sitelooper, or recompile with the build that wrote the store.',
        severity: 'error',
        line: `step ${step.id} is pinned to skill ${step.skill}, written by a newer sitelooper`,
      });
    } else if (step.skill && !skill) {
      diagnostics.push({
        code: 'missing-skill',
        step: step.id,
        what: `its pinned skill ${step.skill} is not in the skill store`,
        why: 'the store this compile read has no such skill, so there is no procedure to emit — the store may be the wrong one (SITELOOPER_SKILLS_DIR), or the skill was cleared.',
        fix: rerecordFix(fixFile, step.id),
        action: rerecordAction(fixFile, step.id),
        severity: 'warning',
        line: `step ${step.id} refers to skill ${step.skill}, which is not in the store`,
      });
    }
    // A pin the flow gave no bindings runs whatever replay can bind from the
    // instruction (replayBinding) — the pin itself, a sibling, or nothing.
    if (pinned && !Object.keys(params).length && Object.keys(pinned.params).length) {
      const bound = replayBinding(pinned, store.list(pinned.origin), step.instruction);
      if (!bound) {
        diagnostics.push({
          code: 'unbound-pin',
          step: step.id,
          what: `it is pinned to ${pinned.id} but the flow binds none of its slots, and no skill binds them from the instruction — the compiled spec would run with the recording's own values`,
          why: `replay refuses this step for the same reason ("the pinned skill ${pinned.id} bound no params for this instruction") and hands it to the model; a compiled spec has no model, so it would type and look for the recorded run's record.`,
          fix: rerecordFix(fixFile, step.id),
          action: rerecordAction(fixFile, step.id),
          severity: 'error',
          line: `step ${step.id} is pinned to ${pinned.id} with no bindings, and no skill binds from its instruction`,
        });
      } else {
        if (bound.skill.id !== pinned.id) {
          diagnostics.push({
            code: 'unbound-pin',
            step: step.id,
            what: `it is pinned to ${pinned.id}, which cannot bind from the instruction, so the spec compiles ${bound.skill.id} — the skill replay runs for this step`,
            why: `the flow binds none of ${pinned.id}'s slots and its template does not read over the instruction; replay's candidate selection binds ${bound.skill.id} from the instruction text instead.`,
            fix: rerecordFix(fixFile, step.id),
            action: rerecordAction(fixFile, step.id),
            severity: 'warning',
            line: `step ${step.id} compiles ${bound.skill.id} in place of its unbindable pin ${pinned.id}`,
          });
        }
        skill = bound.skill;
        params = bound.params;
      }
    }
    // A goal is a claim about STATE, so it is only meaningful on a procedure
    // that changes state — `mutates` is the same gate the store uses to stop a
    // read-only skill covering a mutating pin — and only on the last segment,
    // the one that finishes the work.
    const chain = skill ? chainOf(skill, store) : [];
    const changes = chain.some((member) => mutates(store, member.id));
    const segments = chain.map((member, i) => toSegment(member, changes && i === chain.length - 1, i === chain.length - 1));
    if (!segments.length) {
      diagnostics.push({
        code: 'no-procedure',
        step: step.id,
        what: 'it has no converged procedure, so the compiled spec throws here',
        why: 'nothing in the store resolves to a recorded procedure for this step; the emitted body is a throw, not a silent skip.',
        fix: rerecordFix(fixFile, step.id),
        action: rerecordAction(fixFile, step.id),
        severity: 'warning',
        line: `step ${step.id} has no converged procedure`,
      });
    }
    for (const member of chain) {
      // No `unmeasured-precondition` here any more: the segment carries the
      // skill's fingerprint (toSegment), and the artifact measures it exactly
      // as replay does. Only a lifted file that predates the vector has a
      // segment it cannot measure (carryFingerprints, and the emitter).
      // pageEffectDemoted: stops at a popup/tab step banked as "harmless"
      // before they became strikes (fwsi9 s_24e7fd) demote it here too.
      if (pageEffectDemoted(member)) {
        diagnostics.push({
          code: 'demoted-pin',
          step: step.id,
          what: `it is pinned to the demoted skill ${member.id} — the compiled spec inherits a procedure whose last replays failed at the same step`,
          why: demotionWhy(member),
          fix: rerecordFix(fixFile, step.id),
        action: rerecordAction(fixFile, step.id),
          severity: 'error',
          line: `step ${step.id} compiles a demoted skill (${member.id}) — its last replays failed at the same step`,
        });
      }
    }
    // A literal binding on a step whose instruction threads references is
    // replay debt (an adoption froze that run's values into the pin): align
    // the pinned template against the instruction and rebind what it can —
    // and fill a declared slot the flow left out where a reference stands at
    // it. The same threadStepParams daemon runFlow applies before it binds,
    // so neither runner repairs a flow the other runs as written (fwod85).
    if (skill) {
      const threaded = threadStepParams({ id: step.id, instruction: step.instruction, params }, skill);
      params = threaded.params ?? params;
      for (const line of threaded.warnings) {
        // A rebind is news, not a problem; only an UNTHREADED literal is one.
        const stuck = line.includes('could not be rethreaded');
        diagnostics.push({
          code: 'unthreaded-param',
          step: step.id,
          what: stuck
            ? "a literal slot binding could not be rethreaded — the step will run against the recording's own record"
            : 'a literal slot binding was rethreaded to the reference its instruction carries',
          why: line,
          severity: 'warning',
          line,
        });
      }
    }
    steps.push({
      id: step.id,
      instruction: step.instruction,
      params,
      outputs: step.outputs ?? [],
      segments,
      ...(step.urlRoutes && Object.keys(step.urlRoutes).length ? { urlRoutes: step.urlRoutes } : {}),
    });
  }

  // Only a flow that fills, types or selects somewhere (loop bodies included)
  // runs a recipe at all: anything else would carry a snapshot its code never
  // embeds, and warnings about widgets it never touches.
  let recipes: RecipeSnapshot | undefined;
  if (o.components && stepsDriveWidgets(steps)) {
    const found: Diagnostic[] = [];
    recipes = recipeSnapshot(o.components, found);
    diagnostics.splice(recipeAt, 0, ...found);
  }

  return {
    spec: { version: steps.some((st) => st.segments.some((seg) => stepsCarryContext(seg.steps))) ? 2 : 1, name: flow.name, origin: flow.origin, startUrl: flow.startUrl, vars: flow.vars ?? [], steps, ...(recipes ? { recipes } : {}), ...(flow.browser ? { browser: flow.browser } : {}) },
    warnings: diagnostics.map(diagnosticLine),
    diagnostics,
  };
}

/**
 * The recipe snapshot an artifact carries, and what the store holds that a
 * static snapshot cannot express — each finding a flow-level
 * `recipe-snapshot` diagnostic (a warning, never a blocker: the artifact runs
 * the same ladder the daemon runs, it only stops learning). A demoted recipe
 * is omitted, so the artifact never revives it; a (family, intent) left with
 * nothing usable falls back to the native primitive on both runners, but the
 * artifact does so for good; a learned variant travels as data, knowledge from
 * this machine's store in the file. Stats and validation drift AFTER the
 * compile are not diagnosed — that is what "snapshot" means.
 */
/** The tools that climb a recipe ladder (src/execution/recipes.ts). */
const WIDGET_TOOLS = new Set(['fill', 'type', 'select']);

function skillStepsDriveWidgets(steps: readonly SkillStep[]): boolean {
  return steps.some((s) => WIDGET_TOOLS.has(s.tool) || (Array.isArray(s.body) && skillStepsDriveWidgets(s.body)));
}

/** Whether any segment of these spec steps fills, types or selects — loop bodies included. */
export function stepsDriveWidgets(steps: readonly SpecStep[]): boolean {
  return steps.some((st) => st.segments.some((seg) => skillStepsDriveWidgets(seg.steps)));
}

/**
 * Re-attach a recipe snapshot to a spec rebuilt from a store that never held
 * one — repair's staged store, rerecord's scratch store — so the written file
 * carries the snapshot the verification runs ACTUALLY executed with.
 *
 * Those runs go through the daemon, whose recipe book is the machine's
 * ComponentStore as it stands now: seeds demoted since the compile, variants
 * learned since (a rerecord learns them during its own run). "Converged" is
 * evidence for THAT recipe, not for the one the file was compiled with, so
 * the current store's snapshot is adopted whenever it differs from `prior`,
 * with one change line per (family, intent) that moved and the store findings
 * a compile would report. An identical snapshot keeps `prior` itself (the
 * FLOW bytes do not move) and says nothing.
 *
 * A file with no snapshot (`prior` undefined) predates snapshots: its artifact
 * ran the shipped seeds, and it may have typed and selected natively. It gets
 * the store's snapshot, change lines against the seeds, and a
 * `recipe-snapshot` warning saying what now behaves differently.
 *
 * A flow that never fills, types or selects is left exactly as it was.
 */
export function carryRecipeSnapshot(
  prior: RecipeSnapshot | undefined,
  spec: SpecFlow,
  components: ComponentStore,
): { changes: string[]; diagnostics: Diagnostic[] } {
  if (!stepsDriveWidgets(spec.steps)) {
    if (prior) spec.recipes = prior;
    else delete spec.recipes;
    return { changes: [], diagnostics: [] };
  }
  const found: Diagnostic[] = [];
  const current = recipeSnapshot(components, found);
  if (prior && JSON.stringify(prior) === JSON.stringify(current)) {
    spec.recipes = prior;
    return { changes: [], diagnostics: [] };
  }
  spec.recipes = current;
  const changes = describeRecipeChanges(prior ?? snapshotRecipes(seedRecipes()).recipes, current);
  if (!prior) {
    changes.unshift('recipes: the file carried no recipe snapshot; it now carries the one the verification run(s) used');
    const line =
      'recipe snapshot: this file predates recipe snapshots, so its artifact ran the shipped seed recipes; it now carries a snapshot, and type and select go through recipes as fill does (a recorded type into a contenteditable now replaces its content rather than appending) — recompile it with `sitelooper compile` and review the result';
    found.unshift({
      code: 'recipe-snapshot',
      what: 'the file predates recipe snapshots, and its type/select steps now go through component recipes',
      why: 'a .flow.ts written before recipe snapshots carries no `recipes`; the artifact ran the shipped seeds, and an older one typed and selected with the native primitives. The re-emitted file carries the snapshot the verification run(s) used and drives type and select through the same recipe ladder the daemon uses.',
      fix: 'recompile the flow with `sitelooper compile` and review the type/select steps that act on a recognised widget',
      severity: 'warning',
      line,
    });
  }
  return { changes, diagnostics: found };
}

/**
 * Carry each segment's recorded page fingerprint from the file a repair or a
 * rerecord started from (`prior`, lifted) onto the spec it rebuilt from the
 * store its verification run(s) used — the carry-forward carryRecipeSnapshot
 * does for recipes, per segment. Segments are matched within the same flow
 * step by segment id, and by position only for a segment replaced in place
 * (matchPriorSegment says exactly when).
 *
 *  - The rebuilt segment carries a vector (the skill the run used has one):
 *    it stands. When it differs from the file's own, a `fingerprint: …` change
 *    line says so; when the file had none (or only the flag), likewise.
 *  - It carries none, and the file's segment did at the SAME start url
 *    pattern: the file's vector is carried — it describes that page, and a
 *    staged store that lost it has not measured anything new.
 *  - It carries none, and the file's segment had a vector at a DIFFERENT
 *    pattern (repair widened it): the vector is not carried (it describes
 *    another page), the `fingerprinted` flag is set instead with a change line
 *    saying why, and an `unmeasured-precondition` warning says to recompile.
 *  - It carries none, and the file's segment has the legacy `fingerprinted`
 *    flag (a file compiled before the vector travelled), at any pattern: the
 *    flag is kept, so the artifact still refuses the soft match it cannot
 *    measure, and an `unmeasured-precondition` warning says to recompile.
 *
 * Nothing moves for a segment both sides agree on, so an unchanged file
 * re-emits byte-equal.
 */
export function carryFingerprints(prior: SpecFlow, spec: SpecFlow): { changes: string[]; diagnostics: Diagnostic[] } {
  const changes: string[] = [];
  const diagnostics: Diagnostic[] = [];
  const priorSteps = new Map(prior.steps.map((s) => [s.id, s]));
  for (const step of spec.steps) {
    const before = priorSteps.get(step.id);
    step.segments.forEach((seg, i) => {
      const was = before ? matchPriorSegment(before.segments, step.segments, i) : undefined;
      const pre = seg.preconditions;
      if (pre.fingerprint) {
        const old = was?.preconditions.fingerprint;
        if (old && JSON.stringify(old) !== JSON.stringify(pre.fingerprint)) {
          changes.push(`fingerprint: ${step.id} segment ${seg.id} carries the start-page fingerprint the verification run's skill recorded (it differs from the file's)`);
        } else if (was && !old) {
          const had = was.preconditions.fingerprinted ? 'the file had only the legacy fingerprinted flag, no vector' : 'the file had none';
          changes.push(`fingerprint: ${step.id} segment ${seg.id} now carries the start-page fingerprint the verification run's skill recorded (${had})`);
        }
        return;
      }
      if (!was) return;
      // The url-pattern check guards the VECTOR only: it describes the page the
      // file's segment started on, and a segment that now starts on another
      // pattern must not measure against it. The flag holds nothing
      // page-specific — it says the recording fingerprinted this start page —
      // so it survives a moved pattern, and so does a vector dropped for one:
      // the staged skill lost it and replay passed null, so the artifact says
      // it cannot measure rather than silently soft-matching on the url alone.
      const samePattern = was.preconditions.urlPattern === pre.urlPattern;
      if (was.preconditions.fingerprint && samePattern) {
        pre.fingerprint = was.preconditions.fingerprint;
        return;
      }
      if (!was.preconditions.fingerprint && !was.preconditions.fingerprinted) return;
      pre.fingerprinted = true;
      if (was.preconditions.fingerprint) {
        changes.push(
          `fingerprint: ${step.id} segment ${seg.id} does not carry the file's start-page fingerprint — it was recorded at ${was.preconditions.urlPattern} and the segment now starts at ${pre.urlPattern}, and the verification run's skill recorded none — so a soft url match is refused here until it is recompiled`,
        );
      }
      if (seg.steps[0]?.tool !== 'goto') diagnostics.push(unmeasuredPreconditionDiagnostic(step.id, seg.id));
    });
  }
  return { changes, diagnostics };
}

/**
 * The file's segment a rebuilt segment continues, for carryFingerprints.
 *
 * By segment id first: a segment id is its skill id, which repair keeps for
 * every segment it only reorders or prepends locators on (foldPatchedVariants
 * folds a patch back into the original skill), and the flow file's own ids
 * survive staging and reload.
 *
 * By position only as the fallback for a segment REPLACED in place — a re-pin
 * onto a repair variant (`newSkillId(origin, template~repair, now)`, a clone
 * that keeps the original's template and `seq` slot) or a rerecord that
 * recompiled the same chain under new ids. Every segment of one chain shares
 * the template (store.ts `seq`), so template equality alone cannot tell two
 * segments of a step apart; the fallback therefore also requires that the
 * step still has the same number of segments (what a variant clone and an
 * unchanged chain preserve, and what an inserted or removed segment breaks),
 * and that neither id is present on the other side (the rebuilt id is new to
 * the file and the file's id is gone from the rebuild — not a segment that
 * moved). Anything else matches nothing: the rebuilt segment keeps only what
 * the run's skill recorded, exactly what replay with that skill measures.
 */
function matchPriorSegment(before: SpecSegment[], after: SpecSegment[], i: number): SpecSegment | undefined {
  const seg = after[i];
  const byId = before.find((s) => s.id === seg.id);
  if (byId) return byId;
  if (before.length !== after.length) return undefined;
  const was = before[i];
  if (!was || was.template !== seg.template) return undefined;
  if (after.some((s) => s.id === was.id)) return undefined;
  return was;
}

/** One line per (family, intent) whose chosen procedure differs between two snapshots. */
export function describeRecipeChanges(before: RecipeSnapshot, after: RecipeSnapshot): string[] {
  const key = (r: { family: string; intent: string }) => `${r.family}/${r.intent}`;
  const was = new Map(before.recipes.map((r) => [key(r), r]));
  const now = new Map(after.recipes.map((r) => [key(r), r]));
  const lines: string[] = [];
  for (const [k, r] of now) {
    const old = was.get(k);
    if (!old) lines.push(`recipes: ${k} added ${r.id}`);
    else if (old.id !== r.id) lines.push(`recipes: ${k} ${old.id} -> ${r.id}`);
    else if (JSON.stringify(old) !== JSON.stringify(r)) lines.push(`recipes: ${k} ${r.id} procedure changed`);
  }
  for (const [k, old] of was) {
    if (!now.has(k)) lines.push(`recipes: ${k} removed ${old.id} (the component store has no usable recipe for it)`);
  }
  return lines;
}

function recipeSnapshot(components: ComponentStore, diagnostics: Diagnostic[]): RecipeSnapshot {
  const { recipes, diagnostics: findings } = snapshotRecipes(components.list());
  for (const line of findings) {
    const demoted = line.includes('is demoted in the component store');
    const unusable = line.includes('no usable recipe');
    diagnostics.push({
      code: 'recipe-snapshot',
      what: demoted
        ? 'a component recipe is demoted in the store, and the compiled artifact omits it for good'
        : unusable
          ? 'a component family has no usable recipe, so the compiled artifact drives it with the native primitive for good'
          : 'a learned component recipe travels in the compiled artifact as data',
      why: `${line}. The snapshot is compile-time state: the daemon keeps validating, learning and demoting after this file is written; the artifact runs what it was given.`,
      fix: demoted || unusable ? 'record the widget again with the daemon to learn a working recipe, then recompile' : undefined,
      severity: 'warning',
      line: `recipe snapshot: ${line}`,
    });
  }
  return recipes;
}
