/**
 * When a flow step may call itself a SUCCESS (round 55, "honesty").
 *
 * A step reported `success` is taken at its word everywhere after: the flow
 * counts it passed, a recovery's recording is compiled and banked as a
 * working procedure, and the pin may move onto it. Round 54 showed two ways
 * that word was wrong, each visible in the executor's OWN record — never in
 * the model's prose, which this module does not read:
 *
 *  - fwop10-n2 02-create: the recovery's last gesture, the "Submit comment"
 *    click, was not dispatched (the button was still disabled). The model
 *    reported success anyway ("NOT confirmed as posted"), and the recording —
 *    which never contained the failed click — was banked as s_a575e9 and
 *    s_7b4c9e: comment procedures with no submit, 1/1, eligible to re-pin.
 *    The loop now says so (InstructionResult.unfinishedGesture).
 *  - fwsi7 05-open: a zero-model replay whose read of `checked_out_to_user`, a
 *    declared output, found no element and was skipped. The step reported
 *    success at tier A, with the value simply missing.
 *
 * Either is PARTIAL: not a success, not counted passed, and — for a recovery
 * — not banked and not re-pinned. The flow goes on, as it does for an adopted
 * step: the next step fails on its own terms if the work did not stick.
 *
 * WHAT IS DELIBERATELY NOT A REASON. Unreported outputs alone. A recovery
 * reports under its own names (fwop10-n2 02-create reported
 * `work_package_subject`, the flow declares `subject`: eight "unreported"
 * outputs, every one of them reported), and a zero-model replay drops an
 * ECHO — a read of the very value the procedure typed — from its confident
 * values by design: fwgr68, fwkb39, fwrd87 and fwvk7 all have such steps and
 * all were green in round 54. A skipped read is different: nothing was
 * observed at all.
 */

export interface StepVerdictInput {
  /** What the step reported. */
  reportStatus: 'success' | 'failure' | 'blocked';
  /** The model drove the step (a recovery), rather than a zero-model replay. */
  recovered: boolean;
  /** InstructionResult.unfinishedGesture: the last attempted gesture failed. */
  unfinishedGesture?: { tool: string; args: string };
  /** SkillRecord.skippedReads: labelled reads the replay skipped (tier A). */
  skippedReads?: readonly string[];
  /** The outputs the flow step declares. */
  declaredOutputs: readonly string[];
  /** The values the step reported. */
  values: Record<string, unknown>;
}

/**
 * Why a step that reported success is only PARTIAL, one sentence each; empty
 * when it is a clean success (or did not report success at all).
 */
export function partialReasons(input: StepVerdictInput): string[] {
  if (input.reportStatus !== 'success') return [];
  const reasons: string[] = [];
  if (input.recovered && input.unfinishedGesture) {
    const g = input.unfinishedGesture;
    reasons.push(
      `the recovery's last ${g.tool} (${g.args}) did not go through and nothing acted after it, yet the step reported success — its final action is unverified`,
    );
  }
  if (!input.recovered && input.skippedReads?.length) {
    const declared = new Set(input.declaredOutputs);
    const missed = [...new Set(input.skippedReads)].filter((label) => declared.has(label) && !(label in input.values));
    for (const label of missed) {
      reasons.push(`the procedure's read of ${label}, an output this step reports, was skipped (nothing matched on the page), so ${label} went unreported`);
    }
  }
  return reasons;
}
