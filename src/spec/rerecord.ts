import fs from 'node:fs';
import path from 'node:path';
import type { Flow, FlowStep } from '../skills/flow.js';
import type { FlowStepResult } from '../shared/protocol.js';
import { formatDiagnostic, rerecordFix, type Diagnostic } from './diagnostics.js';

/**
 * `sitelooper rerecord <flow> <step>` — throw one step's recording away and
 * let the agent make a new one.
 *
 * The failure this exists for is not drift. fwod34's 08-open is pinned to a
 * skill whose FIRST action clicks a Cancel button that only existed on the
 * recording run (step 06 had already cancelled the order by the time 08 ran),
 * so the pin is demoted and every later run "passes" the step only because
 * the engine quietly replays some other, read-only skill instead. Nothing in
 * the app is broken and no locator has drifted: the recording is wrong. The
 * only repair for a wrong recording is another recording, and this is the
 * command that takes one — deterministically, against the real app, with the
 * store's own re-pin rule (learn.ts `decideRepin`) as the judge of whether
 * the new procedure is good enough to keep.
 *
 * The mechanism is deliberately small: unpin the step (below), run the flow a
 * couple of times in learning mode, and read the verdict off the step's own
 * run results. Everything that decides whether the new recording is trustworthy
 * — the recovery ladder, skill compilation, lifecycle promotion, the re-pin
 * gate — already exists and is exercised on every ordinary run.
 */

/** Raised for the caller's mistakes (unknown step, unwritable backup): exit 2, no daemon. */
export class RerecordError extends Error {}

/**
 * The shared diagnostic shape (src/spec/diagnostics.ts), narrowed to the one
 * code this surface emits. The formatter and the fix-command builder are the
 * shared ones, re-exported under this module's names so every surface prints
 * a rerecord verdict the same way.
 */
export type RerecordDiagnostic = Diagnostic & { code: 'needs-rerecord' };

/** `<severity> <step>: <what>` + indented why/fix — the contracted block form. */
export const formatRerecordDiagnostic = formatDiagnostic;

/** The command that re-records one step, quoted so a path with spaces survives. */
export const rerecordCommand = rerecordFix;

/**
 * The step, stripped back to "an instruction nobody has recorded yet".
 *
 * `adopted = true` is not decoration: it is the shape `decideRepin` pins on
 * the FIRST clean recovery (an adopted step's incumbent is scaffolding, so a
 * recovery that carried the whole step wins outright, provisional or not).
 * Without it the new procedure would enter the store provisional and need two
 * more clean runs before the pin moved, and a two-run rerecord would report
 * "nothing was pinned" about a perfectly good recording.
 *
 * `params` and `outputEvidence` go with the pin because both describe the
 * skill that is being discarded: params are ITS slot bindings, and evidence
 * is cross-run agreement about values the old recording read. `outputs` stays
 * — later steps reference this step's outputs by name, and renaming them
 * would break the flow's threading. `recorded` is emptied rather than deleted:
 * the field is required, and its recorded values are soft assertions made
 * about the run this command exists to replace.
 *
 * Pure, and returns a new flow: the caller decides when (and whether) it hits
 * disk, and the tests do not need one.
 */
export function unpinStep(flow: Flow, stepId: string, instruction?: string): Flow {
  const idx = flow.steps.findIndex((s) => s.id === stepId);
  if (idx < 0) {
    throw new RerecordError(
      `flow "${flow.name}" has no step "${stepId}" — steps are: ${flow.steps.map((s) => s.id).join(', ')}`,
    );
  }
  const old = flow.steps[idx];
  const next: FlowStep = {
    id: old.id,
    instruction: instruction ?? old.instruction,
    outputs: old.outputs,
    recorded: {},
    adopted: true,
  };
  const steps = flow.steps.slice();
  steps[idx] = next;
  return { ...flow, steps };
}

/** `<file>.bak-<stamp>.json` beside the flow — the recording this command discards. */
export function backupPath(file: string, stamp: string = Date.now().toString(36)): string {
  const dir = path.dirname(file);
  const base = path.basename(file).replace(/\.json$/i, '');
  return path.join(dir, `${base}.bak-${stamp}.json`);
}

/** Copy the flow file aside before patching it. Returns the backup's path. */
export function backupFlowFile(file: string, stamp?: string): string {
  const to = backupPath(file, stamp);
  try {
    fs.copyFileSync(file, to);
  } catch (err) {
    throw new RerecordError(`could not back up ${file}: ${(err as Error).message}`);
  }
  return to;
}

/** One run's view of the step being re-recorded. `step` is absent when the run never reached it. */
export interface RerecordRun {
  /** "run 1", "run 2", … — printed verbatim. */
  label: string;
  step?: FlowStepResult;
}

/** `run 2: 08-open  replay tier A (s_ab12cd)` / `run 1: 08-open  agent (12 turns) re-pinned s_ab12cd` */
export function stepLine(stepId: string, run: RerecordRun): string {
  const st = run.step;
  if (!st) return `${run.label}: ${stepId}  not reached`;
  const how =
    st.tier === 'A'
      ? `replay tier A${st.replayed ? ` (${st.replayed})` : ''}`
      : st.replayed
        ? `replay ${st.replayed}${st.repaired ? ' + repair' : ''}${st.turns ? ` (${st.turns} turns)` : ''}`
        : `agent${st.turns ? ` (${st.turns} turns)` : ''}`;
  const mark = st.status === 'success' ? '' : ` [${st.status.toUpperCase()}]`;
  return `${run.label}: ${stepId}  ${how}${mark}${st.repinned ? ` re-pinned ${st.repinned}` : ''}`;
}

export type RerecordVerdict =
  | { ok: true; pinned: string; runs: number }
  | { ok: false; pinned?: string; diagnostic: RerecordDiagnostic };

/**
 * Did the re-recording take?
 *
 * The bar is the one the compiled spec has to clear, not "the run passed":
 * the LAST run must have replayed this step at tier A — no model, no repair —
 * with the skill this rerecord pinned. Anything else is the same failure mode
 * the command was built to expose. A step that passes because the engine
 * reached for a different skill is exactly fwod34/08-open, and reporting that
 * as success would put the wrong recording straight back into a spec.
 */
export function rerecordVerdict(input: { file: string; stepId: string; runs: RerecordRun[] }): RerecordVerdict {
  const { file, stepId, runs } = input;
  const fix = rerecordCommand(file, stepId);
  const trail = runs.map((r) => stepLine(stepId, r)).join('; ');
  // The pin this rerecord made: the last re-pin any run reported. Later runs
  // replay it and report no re-pin of their own, which is the success shape.
  let pinned: string | undefined;
  for (const r of runs) if (r.step?.repinned) pinned = r.step.repinned;
  const bad = (what: string, why: string, extra?: Partial<RerecordDiagnostic>): RerecordVerdict => ({
    ok: false,
    ...(pinned ? { pinned } : {}),
    diagnostic: { code: 'needs-rerecord', step: stepId, what, why, fix, severity: 'error', ...extra },
  });

  if (!runs.length) {
    return bad(`${stepId} was not re-recorded — no run completed`, 'the flow never ran');
  }
  const last = runs[runs.length - 1];
  if (!last.step) {
    return bad(
      `${stepId} was not re-recorded — the last run never reached it`,
      `an earlier step halted the flow. ${trail}`,
    );
  }
  if (!pinned) {
    return bad(
      `${stepId} has no procedure after re-recording — nothing was pinned to it`,
      `the agent ran the step but the store's re-pin rule refused the result (a recovery that needed model gestures beyond its replay, or a locator carrying a value this run minted). ${trail}`,
      { fix: `${fix} --instruction "<a clearer instruction for this step>"` },
    );
  }
  if (last.step.status !== 'success') {
    return bad(
      `${stepId} did not pass on its last run after re-recording`,
      `pinned ${pinned}, then ${last.label} reported ${last.step.status}${last.step.summary ? `: ${last.step.summary}` : ''}. ${trail}`,
      { fix: `${fix} --instruction "<a clearer instruction for this step>"` },
    );
  }
  if (last.step.tier !== 'A') {
    return bad(
      `${stepId} still needs the model after re-recording — its new procedure did not replay cleanly`,
      `pinned ${pinned}, but ${last.label} ran the step at tier ${last.step.tier ?? 'none'}${last.step.fellBack ? ` (${last.step.fellBack})` : ''}; a compiled spec has no model to fall back on. ${trail}`,
      { fix: `${fix} --runs 3` },
    );
  }
  if (last.step.replayed && last.step.replayed !== pinned) {
    return bad(
      `${stepId} only passes because the engine replays ${last.step.replayed} instead of its new pin ${pinned}`,
      `the re-recording pinned ${pinned}, but ${last.label} replayed ${last.step.replayed}; a compiled spec emits the pin and halts here. ${trail}`,
      { fix: `${fix} --instruction "<an instruction that describes what this step should do>"` },
    );
  }
  return { ok: true, pinned, runs: runs.length };
}

/** The step's result in one run, by id. */
export function stepOf(steps: FlowStepResult[] | undefined, stepId: string): FlowStepResult | undefined {
  return steps?.find((s) => s.id === stepId);
}
