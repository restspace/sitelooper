/**
 * Declared fix-ups: a repair the recording agent made to something an earlier
 * step of the same recording left wrong, carried with the CONDITION under
 * which it is a repair at all.
 *
 * erpnext fwen10-fr. The create step saved a sales order with a duplicate row.
 * The next instruction ("submit the order") noticed it, ticked row 2, clicked
 * Delete, saved, and submitted; compile kept those three steps as the start of
 * the submit procedure. On every replay the order had no duplicate, so the
 * same three steps deleted a real line, each recorded effect matched ("You
 * removed 1 row from Items", "Saved"), and the run passed with the order
 * wrong — in the daemon and in the artifact, with no model involved. The
 * repair was only right while the thing it repaired was there, and nothing
 * the recorder kept said so: its diff drops a line that still shows, so "one
 * of two identical rows went" is recorded nowhere.
 *
 * So the agent DECLARES a repair before it makes one (the `fixup` tool), with a
 * check that is true because of the problem. The recorder accepts the check
 * only if it holds then, records it as a `wait_for` step carrying `guard`,
 * marks every step that follows `guarded`, and closes the fix-up at the first
 * step after which the check no longer holds (`guardEnd`): a condition the
 * repair demonstrably removed. Both runners evaluate the guard where it was
 * recorded. It holds: the repair runs. It does not: there is nothing to
 * repair, the guarded steps are skipped, and the run says so.
 *
 * A guard is to a fix-up what `assert` is to an assertion (assert.ts): the
 * same recorded wait, with a different meaning for a miss. A wait that misses
 * has drifted; an assertion that misses is the run's answer; a guard that
 * misses means the mistake was not made this time.
 *
 * Daemon replay imports this module; a compiled `.flow.ts` embeds its exact
 * source (spec/runtime-source.ts). Self-contained: no imports.
 */

/**
 * How long a runner gives a guard's condition to show itself before reading
 * it as not holding. The step before it has settled, so this is slack for a
 * late paint, not a wait: a guard that misses costs the run this much.
 */
export const GUARD_WAIT_MS = 1_500;

/** The states a guard may check: wait_for's own five. */
export const GUARD_STATES = ['visible', 'hidden', 'count', 'text_equals', 'text_contains'] as const;

export type GuardState = (typeof GUARD_STATES)[number];

/** The longest reason a guard carries. */
export const GUARD_REASON_MAX = 200;

/** A step, as far as a fix-up's shape is concerned. */
export interface FixupStep {
  guard?: { id: string; reason?: string };
  guarded?: string;
  guardEnd?: true;
}

/**
 * How many steps the guard at `index` guards: the unbroken run of steps after
 * it that carry `guarded === id`. 0 when `index` is no guard.
 */
export function guardedRun(steps: readonly FixupStep[], index: number): number {
  const id = steps[index]?.guard?.id;
  if (!id) return 0;
  let n = 0;
  while (steps[index + 1 + n]?.guarded === id) n++;
  return n;
}

/**
 * Whether the fix-up whose guard is at `index` is WELL FORMED in this step
 * list: the guard is not itself guarded, at least one step follows it guarded
 * by it, those steps are contiguous, the last of them carries `guardEnd` and
 * no other does, and no step elsewhere in the list claims the same guard.
 *
 * `guardEnd` is the recorder's proof that the condition turned false once the
 * repair was made. A group without it was never shown to repair what its
 * guard checks (the instruction ended first), and a group that a later pass
 * split, reordered or cut is no longer the thing that was recorded. Neither
 * may be run conditionally: compile dissolves such a fix-up into ordinary
 * steps, and a runner that meets one anyway runs every step.
 */
export function wellFormedFixup(steps: readonly FixupStep[], index: number): boolean {
  const guard = steps[index];
  const id = guard?.guard?.id;
  if (!id || guard.guarded !== undefined || guard.guardEnd) return false;
  const n = guardedRun(steps, index);
  if (n === 0) return false;
  for (let i = 0; i < steps.length; i++) {
    const inRun = i > index && i <= index + n;
    if (!inRun && i !== index && (steps[i].guarded === id || steps[i].guard?.id === id)) return false;
    if (inRun && steps[i].guard) return false;
    if (inRun && Boolean(steps[i].guardEnd) !== (i === index + n)) return false;
  }
  return true;
}

/** The ids of every fix-up in `steps` that is not well formed (each once, in order). */
export function malformedFixups(steps: readonly FixupStep[]): string[] {
  const out: string[] = [];
  const add = (id: string | undefined) => {
    if (id && !out.includes(id)) out.push(id);
  };
  const sound = new Set<string>();
  steps.forEach((step, i) => {
    if (!step.guard) return;
    if (wellFormedFixup(steps, i)) sound.add(step.guard.id);
    else add(step.guard.id);
  });
  // A guarded step whose guard is not in the list at all.
  for (const step of steps) if (step.guarded && !sound.has(step.guarded)) add(step.guarded);
  return out;
}

/** The line both runners log when a guard holds and its fix-up runs. */
export function fixupApplies(where: string, reason: string): string {
  return `${where}: fix-up applies — ${reason}`;
}

/** The line both runners log when a guard does not hold and its fix-up is skipped. */
export function fixupSkipped(where: string, reason: string, steps: number): string {
  return `${where}: fix-up not needed, ${steps} step(s) skipped — its condition does not hold this time (${reason})`;
}
