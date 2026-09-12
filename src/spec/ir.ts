import type { Flow } from '../skills/flow.js';
import { mutates } from '../skills/learn.js';
import { rethreadParams } from './rethread.js';
import { diagnosticLine, rerecordFix, rerecordAction, type Diagnostic } from './diagnostics.js';
import { LEAKED_STEP } from './rerecord.js';
import { SKILL_CONTRACT, type Skill, type SkillParam, type SkillStep, type SkillStore } from '../skills/store.js';

/**
 * The intermediate representation a compiled spec carries.
 *
 * It is a FLOW plus the converged procedures its steps resolved to, with
 * everything the emitted file cannot honour dropped: stats, status, the
 * structural fingerprint and the model that recorded it. Two reasons for it
 * to be its own shape rather than "a Flow and a store". First, the emitted
 * `.flow.ts` embeds this object verbatim as its FLOW constant, so it has to
 * be self-contained — a spec that resolved its skills out of `~/.sitelooper`
 * at run time would not be a Tier-2 artifact at all. Second, the store is
 * mutable and the file is a snapshot: pinning the procedure here is what
 * makes `lift(emit(spec))` the same IR every time, however the store has
 * moved on since.
 */
export interface SpecFlow {
  version: 1;
  /** Flow name. */
  name: string;
  origin: string;
  startUrl: string;
  /** Flow-level inputs; the spec takes them as a `vars` object. */
  vars: string[];
  /** One per FlowStep, in order. */
  steps: SpecStep[];
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
}

/** A Skill minus what the spec does not need to carry: stats, status, provenance.model, fingerprint. */
export interface SpecSegment {
  id: string;
  template: string;
  params: Record<string, SkillParam>;
  preconditions: { urlPattern: string; requireText?: string[] };
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
   * The skill's report template, carried ONLY beside a `goal`: when the guard
   * short-circuits the step, these are the values the step's read-backs would
   * have published, and the steps after it must still see them.
   */
  report?: { summary: string; values: Record<string, string> };
}

/** A skill as the spec carries it: the procedure, none of the bookkeeping. */
function toSegment(skill: Skill, goalBearing = false): SpecSegment {
  const seg: SpecSegment = {
    id: skill.id,
    template: skill.template,
    params: skill.params,
    preconditions: { urlPattern: skill.preconditions.urlPattern },
    steps: skill.steps,
  };
  // Identity markers travel; the fingerprint does not — a vector of DOM
  // counts is measured against a live page by a runtime the emitted spec
  // deliberately does not have.
  if (skill.preconditions.requireText?.length) seg.preconditions.requireText = skill.preconditions.requireText;
  if (skill.derived) seg.derived = skill.derived;
  // The goal travels only where it can be acted on: see SpecSegment.goal.
  if (goalBearing && skill.goal?.requireText?.length) {
    seg.goal = { requireText: [...skill.goal.requireText] };
    if (skill.reportTemplate) seg.report = skill.reportTemplate;
  }
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
 */
function demotionWhy(skill: Skill): string {
  const st = skill.stats;
  const parts = [`${skill.id} is demoted: ${st.successes} of ${st.uses} replays succeeded`];
  const worst = Object.entries(st.failedAtStep ?? {}).sort((a, b) => b[1] - a[1])[0];
  if (worst) parts.push(`replay failed at step ${worst[0]} on ${worst[1]} of them`);
  if (st.lastFailedAt !== undefined) parts.push(`the demotion was two consecutive failures at step ${st.lastFailedAt}`);
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
  o: { flowFile?: string } = {},
): { spec: SpecFlow; warnings: string[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [...noopDiagnostics(flow, o.flowFile)];
  const steps: SpecStep[] = [];
  const fixFile = o.flowFile ?? flow.name;

  for (const step of flow.steps) {
    const skill = step.skill ? store.get(step.skill) : null;
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
    // A goal is a claim about STATE, so it is only meaningful on a procedure
    // that changes state — `mutates` is the same gate the store uses to stop a
    // read-only skill covering a mutating pin — and only on the last segment,
    // the one that finishes the work.
    const chain = skill ? chainOf(skill, store) : [];
    const changes = chain.some((member) => mutates(store, member.id));
    const segments = chain.map((member, i) => toSegment(member, changes && i === chain.length - 1));
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
      if (member.status === 'demoted') {
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
    // the pinned template against the instruction and rebind what it can.
    let params = step.params ?? {};
    if (skill) {
      const threaded = rethreadParams(step.id, step.instruction, skill.template, params);
      params = threaded.params;
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
    });
  }

  return {
    spec: { version: 1, name: flow.name, origin: flow.origin, startUrl: flow.startUrl, vars: flow.vars ?? [], steps },
    warnings: diagnostics.map(diagnosticLine),
    diagnostics,
  };
}
