import { mintedShape, urlDiff, urlParts } from './url.js';

/**
 * An action may explicitly skip or stop; neither outcome claims completion. A
 * stopped action may say what is known about its dispatch (browser.ts
 * `ActionOutcome`): a stop whose action was proven never to have gone out is
 * a different fact from one that may have landed.
 */
export type StepActionResult<T> =
  | { status: 'completed'; value: T }
  | { status: 'skipped' }
  | { status: 'stopped'; outcome?: 'not-dispatched' | 'dispatched' | 'effect-verified' | 'unknown' };

export interface StepLifecycle<T, V> {
  prepare(): Promise<void>;
  act(): Promise<StepActionResult<T>>;
  settle(value: T): Promise<void>;
  bind(value: T): Promise<void>;
  verify(value: T): Promise<V>;
}

/**
 * The mandatory lifecycle used by replay and embedded in standalone tests.
 * Action handlers cannot bypass the obligations of a completed action. Binding
 * precedes verification because a step's checks may refer to values it minted.
 * There is deliberately no retry or catch here: a failed phase stops the step,
 * and an adapter must never mistake a verification failure for failed dispatch.
 */
export async function runStepLifecycle<T, V>(phases: StepLifecycle<T, V>): Promise<{
  action: StepActionResult<T>;
  verification?: V;
}> {
  await phases.prepare();
  const action = await phases.act();
  if (action.status !== 'completed') return { action };
  await phases.settle(action.value);
  await phases.bind(action.value);
  const verification = await phases.verify(action.value);
  return { action, verification };
}

/** Reads are optional observations in both execution targets. */
export function isReadAction(tool: string): boolean {
  return tool === 'read' || tool === 'read_all';
}

/** What a step's dispatch was told to act on, as far as ambiguity is concerned. */
export interface DispatchArgs {
  state?: unknown;
  what?: unknown;
}

/**
 * Whether a step's dispatch reaches EVERY match of its target: `read_all`
 * reads across all of them, and a count — read or wait — is the question "how
 * many", which a single match could not answer. Several matches are the POINT
 * of these steps, so their locator is allowed to name several and is recorded
 * without an index.
 */
export function spansEveryMatch(tool: string, args: DispatchArgs = {}): boolean {
  if (tool === 'read_all') return true;
  if (tool === 'read') return args.what === 'count';
  return tool === 'wait_for' && args.state === 'count';
}

/**
 * Whether a step's dispatch acts on the FIRST match and ignores the rest.
 * Every wait but a count one does: tools.ts `waitFor` dispatches
 * `loc.first().waitFor({ state })` for visible/hidden and reads
 * `loc.first().innerText()` for the text states.
 *
 * "May match several" has to follow the DISPATCH, not the tool name. grafana
 * fwgr43's `wait_for h2 state:visible` was resolved as if it had to name
 * exactly one element, so both replays stopped and the compiled arm failed
 * 0/6 — while the wait it would have run looks only at `h2` number one. Only
 * an ABSENCE wait was let through with ambiguity allowed, which made `hidden`
 * an exception rather than the rule it is an instance of.
 */
export function dispatchesFirstMatch(tool: string, args: DispatchArgs = {}): boolean {
  return tool === 'wait_for' && args.state !== 'count';
}

/** Only a nonempty identifier changed by this step is evidence of creation. */
export function changedCreation(before: string | undefined, after: string | undefined): string | undefined {
  return after && after !== before ? after : undefined;
}

/** Actions that can change application data; navigation is a separate concern. */
const MUTATING_ACTIONS = new Set([
  'click', 'dblclick', 'right_click', 'modifier_click', 'fill', 'type',
  'press', 'select', 'check', 'drag', 'upload',
]);

export function isMutatingAction(tool: string): boolean {
  return MUTATING_ACTIONS.has(tool);
}

/**
 * One recorded gesture as the evidence a run has about it: the tool it used
 * and what the recording OBSERVED around it (daemon/recorder.ts RecordedStep,
 * structurally — this module may not import it).
 */
export interface ObservedGesture {
  tool: string;
  diff?: { url: string; alerts: readonly string[]; added: readonly string[] };
}

/**
 * Whether this gesture minted a record identifier: the url it left is the
 * SAME page as the one it started on (urlDiff — same origin, path shape,
 * route, and every state key the before-url named), and every position whose
 * value changed gained an identifier where there was none. A position that
 * swapped one identifier for another (odoo's `action=330` → `action=156`) or
 * that changed a route word (`view_type=list` → `form`) is the app moving the
 * browser, not the run making a record — fwod51's recovery did exactly that,
 * and every part of the record it opened (`id=45`) the run already had.
 */
function mintedRecordId(before: string, after: string): boolean {
  if (!urlDiff(before, after)) return false; // not even the same page: it moved
  const was = new Map(urlParts(before).map((p) => [p.label, p.value]));
  let gained = false;
  for (const { label, value } of urlParts(after)) {
    const made = changedCreation(was.get(label), value);
    if (made === undefined) continue; // this position is as it was
    if (!mintedShape(made)) return false; // a word, not an id: the app routed
    if (mintedShape(was.get(label) ?? '')) return false; // one record swapped for another
    gained = true;
  }
  return gained;
}

/**
 * Did this gesture COST the run anything it can account for? A stop is only a
 * strike against the procedure that stopped when the repair after it actually
 * changed something, and the run has to have OBSERVED that change: content
 * left different on a page the gesture stayed on (added lines or an alert in
 * the step's recorded diff), or a record identifier minted into the url. A
 * gesture whose only observable effect was moving from one page to another is
 * navigation, which costs nothing however it was dispatched.
 *
 * fwod51 is why the tool NAME cannot answer this: 07-verify is a read-only
 * instruction, its recovery could only reach the record by clicking, and
 * `isMutatingAction('click')` read that as a mutation — two such stops demoted
 * the skill and refused the compile while both mutation logs were empty.
 *
 * Conservative where the run has no evidence: a gesture with no recorded diff
 * (learning off, or a capture that lost its race) counts as a change, and so
 * does one whose starting url is unknown and that left content behind.
 */
export function observedChange(step: ObservedGesture, urlBefore: string | undefined): boolean {
  if (!isMutatingAction(step.tool)) return false;
  if (!step.diff) return true;
  if (urlBefore !== undefined && step.diff.url !== urlBefore) return mintedRecordId(urlBefore, step.diff.url);
  return step.diff.added.length > 0 || step.diff.alerts.length > 0;
}

export interface ExecutionStepShape {
  tool: string;
  body?: readonly ExecutionStepShape[];
}

export function mutatesSteps(steps: readonly ExecutionStepShape[]): boolean {
  return steps.some((step) => isMutatingAction(step.tool) || (step.body ? mutatesSteps(step.body) : false));
}
