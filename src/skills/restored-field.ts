/**
 * A PRE-FILLED FIELD CLEARED AND RESTORED AROUND A FAILED SUBMIT, dropped on
 * the in-page journal's proof (round 62).
 *
 * snipeit fwsi13-n1 03-create filled Asset Tag with "" (#47): the app had
 * pre-filled it with the next tag, BA-00004. Save failed (#59: "This field is
 * required", no write request, the browser's validation focused Asset Tag);
 * the model fiddled with the field and a "new!" row it added and deleted
 * (#61-#73), filled "BA-00004" back (#74) and saved (#76: a POST carrying
 * #74's value, answered 302). Compiled whole, the procedure cleared the tag
 * the app pre-fills, and n2's recovery, taking the empty tag as meant, spent
 * 73 turns on "This field is required".
 *
 * Every condition is a recorded fact, never a guess at what a value means:
 *  (a) the clear's val event records the hash the field held before it
 *      (`was`), and the field's last set before the successful submit left
 *      that same hash (`h`): the app's own value stood;
 *  (b) there is a failed submit — a click between the clear and the
 *      restoring set, naming the same button (role and name) as the
 *      successful one — and each such click made no write request, or one
 *      answered 4xx; the first one's own events put the focus back into the
 *      cleared field (the validation that refused it named that field);
 *  (c) a later click made a write request that CARRIED the restored value
 *      (the journal's `carries`) and was answered 2xx/3xx.
 * And the detour did nothing lasting: between the first failed submit and
 * the restoring set, no step set another field, and the page changes those
 * steps recorded (the failed submits' own answers aside) cancel out; no
 * request carried the cleared value.
 *
 * Then the clear, and everything from the first failed submit through the
 * restoring set, are dropped — reads excepted, as they may publish values —
 * and the successful submit is kept. A recording without `was` (every store
 * before round 62) compiles exactly as before.
 *
 * Returns the kept steps, the same objects (compile matches kept steps
 * against the recording by identity).
 */
import type { JournalEvent } from '../daemon/journal-attribute.js';
import type { LocatorCandidate, RecordedStep } from '../daemon/recorder.js';

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SETS = new Set(['fill', 'type']);
/** Kept inside a dropped detour: a read may publish a value the report uses. */
const KEEP_IN_DETOUR = new Set(['read', 'read_all']);

function allEvents(steps: readonly RecordedStep[]): JournalEvent[] {
  return steps.flatMap((s) => [...(s.journal?.ev ?? []), ...(s.journal?.gap?.ev ?? [])]);
}

/** The events a step caused: in its window, or late from it. */
function caused(step: RecordedStep, events: readonly JournalEvent[]): JournalEvent[] {
  const w = step.journal?.w;
  if (w === undefined) return [];
  return events.filter((e) => (e.c?.[0] === 'in' || e.c?.[0] === 'late') && e.c[1] === w);
}

/** A named field (`textbox "Asset Tag"`); an unnamed one cannot be told from its neighbours. */
const named = (f: unknown): f is string => typeof f === 'string' && /"[^"]+"$/.test(f);

const isWrite = (e: JournalEvent) => e.k === 'req' && WRITES.has(String(e.m));
const status = (e: JournalEvent) => (typeof e.s === 'number' ? e.s : undefined);
const succeeded = (e: JournalEvent) => {
  const s = status(e);
  return s !== undefined && s >= 200 && s < 400;
};
const refused = (e: JournalEvent) => {
  const s = status(e);
  return s !== undefined && s >= 400 && s < 500;
};

/** The (role, name) pairs a click's chain names, position ignored. */
function roleNames(step: RecordedStep): Set<string> {
  const chain: readonly LocatorCandidate[] = step.locators.target?.chain ?? [];
  return new Set(chain.flatMap((c) => (c.kind === 'role' && c.name ? [`${c.role}\u0000${c.name}`] : [])));
}

/** Whether a set of page lines added and removed across steps cancels out. */
function netsToNothing(steps: readonly RecordedStep[]): boolean {
  const n = new Map<string, number>();
  for (const s of steps) {
    for (const l of s.diff?.added ?? []) n.set(l.trim(), (n.get(l.trim()) ?? 0) + 1);
    for (const l of s.diff?.removed ?? []) n.set(l.trim(), (n.get(l.trim()) ?? 0) - 1);
    if (s.diff?.alerts.length) return false;
  }
  return [...n.values()].every((v) => v === 0);
}

export function dropRestoredDetours<T extends RecordedStep>(steps: readonly T[]): T[] {
  if (!steps.some((s) => s.journal)) return [...steps];
  const events = allEvents(steps);
  const dropped = new Set<number>();
  for (let i = 0; i < steps.length; i++) {
    const clear = steps[i];
    if (dropped.has(i) || !SETS.has(clear.tool) || !clear.journal) continue;
    const cv = caused(clear, events).filter((e) => e.k === 'val').at(-1);
    if (!cv || !named(cv.f) || typeof cv.was !== 'string' || typeof cv.h !== 'string' || cv.h === cv.was) continue;
    const field = cv.f;
    const setsField = (s: RecordedStep) => caused(s, events).some((e) => e.k === 'val' && e.f === field);

    // (c) the first later click whose successful write CARRIED the field's
    // last set before it (a write that carried nothing of the field — fwsi13's
    // "new!" row, a livewire POST — is not the submit); that set restores it
    const lastSet = (x: number) => {
      for (let k = x - 1; k > i; k--) if (setsField(steps[k])) return k;
      return -1;
    };
    const carriesSet = (x: number, r: number) =>
      r > 0 && steps[r].journal !== undefined && caused(steps[x], events).some((e) => isWrite(e) && succeeded(e) && Array.isArray(e.carries) && (e.carries as number[]).includes(steps[r].journal!.w));
    const x = steps.findIndex((s, k) => k > i && s.tool === 'click' && carriesSet(k, lastSet(k)));
    if (x < 0) continue;
    const r = lastSet(x);
    if (!SETS.has(steps[r].tool)) continue;
    const rv = caused(steps[r], events).filter((e) => e.k === 'val' && e.f === field).at(-1);
    // (a)
    if (!rv || rv.h !== cv.was) continue;
    // no request carried the cleared value
    if (events.some((e) => e.k === 'req' && Array.isArray(e.carries) && (e.carries as number[]).includes(clear.journal!.w))) continue;

    // (b) the failed submits: the same button as the successful one, between the clear and the restoring set
    const button = roleNames(steps[x]);
    const submits: number[] = [];
    for (let k = i + 1; k < r; k++) {
      const s = steps[k];
      if (s.tool === 'click' && [...roleNames(s)].some((n) => button.has(n))) submits.push(k);
    }
    if (!submits.length) continue;
    if (!submits.every((k) => caused(steps[k], events).filter(isWrite).every(refused))) continue;
    const first = submits[0];
    if (!caused(steps[first], events).some((e) => e.k === 'foc' && e.dir === 'in' && e.d === field)) continue;

    // the field is not set between the clear and the first failed submit
    if (steps.slice(i + 1, first).some(setsField)) continue;
    // the detour did nothing lasting
    const fiddles = steps.slice(first + 1, r).filter((_, n) => !submits.includes(first + 1 + n));
    if (fiddles.some((s) => caused(s, events).some((e) => e.k === 'val' && e.f !== field))) continue;
    if (!netsToNothing(fiddles)) continue;

    dropped.add(i);
    for (let k = first; k <= r; k++) if (!KEEP_IN_DETOUR.has(steps[k].tool)) dropped.add(k);
  }
  return dropped.size ? steps.filter((_, k) => !dropped.has(k)) : [...steps];
}
