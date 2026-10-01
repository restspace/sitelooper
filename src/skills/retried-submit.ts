/**
 * A SUBMIT THE RECORDING HAD TO RETRY, compiled to the attempt that took (round 81).
 *
 * espocrm fwec18-luna-n1 (the create half of 03-create): the model filled
 * Amount "12500" (#80) and clicked Save (#81). EspoCRM refused it in the
 * browser: no request went out, the url held, and the app emptied Amount.
 * The model filled it again and saved again, four times (#82-#88), then
 * clicked into the field, typed the amount (#89-#90) and saved (#92: a POST
 * carrying #90's value, answered 200, landing on the new record). Compiled
 * whole, s_b7d27e expected the create form after its first Save; on n2 and
 * n3 that Save took at once, the url gate stopped on the record's page, and
 * the model finished 03-create (15 and 27 turns). The skill was demoted, and
 * compile refused it.
 *
 * Every condition is a recorded fact, never a guess at what a value means:
 *  - the FINAL submit is a click whose own write request was answered
 *    2xx/3xx;
 *  - an ATTEMPT is an earlier click on the same control (the same primary
 *    locator) that made no write request, or only refused ones, and left
 *    the url where it was; there is at least one;
 *  - between the first attempt and the final submit, every step is an
 *    attempt, an observation (read, screenshot, wait), a REFILL — a fill or
 *    type of a field this instruction set before the first attempt, with the
 *    same recorded value — or a click on such a field (focusing it);
 *  - at least one refill follows the last attempt (the retry re-entered
 *    something; two clicks with only reads between them may be a toggle);
 *  - the final write CARRIED the last refill of every field refilled there
 *    (the journal's `carries`): what the app saved is what the kept steps set.
 * Anything else between them (another field, a key press, an alert) and the
 * recording compiles as before.
 *
 * Then every attempt is dropped, and every refill a later refill of the same
 * field supersedes; observations, focus clicks, the last refill of each field
 * and the final submit are kept. A replay runs the path that took — set,
 * remedy, one submit — and the shared guardedTyping clears a field before a
 * `type` onto the value a fill left there, as the recording typed into the
 * field the refused Save had emptied. A recording without a journal compiles
 * exactly as before.
 *
 * Returns the kept steps, the same objects (compile matches kept steps
 * against the recording by identity).
 */
import type { RecordedStep } from '../daemon/recorder.js';
import { allEvents, caused, isWrite, refused, succeeded } from './restored-field.js';

const SETS = new Set(['fill', 'type']);
const OBSERVATIONS = new Set(['read', 'read_all', 'screenshot', 'wait_for']);

/** The step's primary locator, as one comparable string; null when it recorded none. */
function primary(step: RecordedStep): string | null {
  const first = step.locators.target?.chain?.[0];
  return first ? JSON.stringify(first) : null;
}

/** The value a set step put into its field, as recorded. */
function setValue(step: RecordedStep): string | null {
  const v = step.tool === 'fill' ? step.args.value : step.tool === 'type' ? step.args.text : undefined;
  return typeof v === 'string' ? v : null;
}

export function dropRetriedSubmits<T extends RecordedStep>(steps: readonly T[]): T[] {
  if (!steps.some((s) => s.journal)) return [...steps];
  const events = allEvents(steps);
  const dropped = new Set<number>();
  for (let x = 0; x < steps.length; x++) {
    const final = steps[x];
    const control = primary(final);
    if (final.tool !== 'click' || !final.journal || !control) continue;
    const writes = caused(final, events).filter(isWrite);
    if (!writes.length || !writes.every(succeeded)) continue;

    // The attempts: earlier clicks on the same control, back to the first one
    // a run of stretch-shaped steps reaches.
    const attempts: number[] = [];
    for (let k = x - 1; k >= 0; k--) {
      const s = steps[k];
      if (s.tool === 'click' && primary(s) === control) {
        if (!s.journal || !caused(s, events).filter(isWrite).every(refused)) break;
        attempts.unshift(k);
        continue;
      }
      if (OBSERVATIONS.has(s.tool) || SETS.has(s.tool) || s.tool === 'click') continue;
      break;
    }
    // The longest stretch that holds: the earliest attempt it can start at.
    const carried = new Set(writes.flatMap((e) => (Array.isArray(e.carries) ? (e.carries as number[]) : [])));
    for (let a = 0; a < attempts.length; a++) {
      const lastRefill = stretchRefills(steps, attempts.slice(a), x, carried);
      if (!lastRefill) continue;
      const first = attempts[a];
      for (const k of attempts.slice(a)) dropped.add(k);
      for (let k = first; k < x; k++) {
        const field = SETS.has(steps[k].tool) ? primary(steps[k]) : null;
        if (field && lastRefill.get(field) !== k) dropped.add(k);
      }
      break;
    }
  }
  return dropped.size ? steps.filter((_, k) => !dropped.has(k)) : [...steps];
}

/**
 * The last refill of each field in the stretch from `attempts[0]` to the
 * final submit at `x`, or null when the stretch does not hold: it must be
 * nothing but attempts, observations, refills and focus clicks, all on the
 * form the first attempt left, with every last refill carried by the final write.
 */
function stretchRefills(steps: readonly RecordedStep[], attempts: readonly number[], x: number, carried: ReadonlySet<number>): Map<string, number> | null {
  const first = attempts[0];
  const formUrl = steps[first].diff?.url;
  if (!formUrl) return null;
  // What each field held before the first attempt: its last set there.
  const before = new Map<string, string>();
  for (let k = 0; k < first; k++) {
    const s = steps[k];
    const field = primary(s);
    const value = setValue(s);
    if (SETS.has(s.tool) && field && value !== null) before.set(field, value);
  }
  const lastRefill = new Map<string, number>();
  for (let k = first; k < x; k++) {
    const s = steps[k];
    if (s.diff && (s.diff.url !== formUrl || s.diff.alerts.length)) return null;
    if (attempts.includes(k) || OBSERVATIONS.has(s.tool)) continue;
    const field = primary(s);
    if (SETS.has(s.tool)) {
      if (!field || setValue(s) === null || before.get(field) !== setValue(s)) return null;
      lastRefill.set(field, k);
    } else if (s.tool !== 'click' || !field || !before.has(field)) return null;
  }
  // A retry re-enters something after its last refused attempt. Two clicks on
  // one control with only reads between them may be a toggle (gitea fwgt32-luna
  // #125/#128 clicked the label "bug" in a picker twice), which is not this rule's.
  if (![...lastRefill.values()].some((k) => k > attempts[attempts.length - 1])) return null;
  for (const k of lastRefill.values()) if (steps[k].journal === undefined || !carried.has(steps[k].journal!.w)) return null;
  return lastRefill;
}
