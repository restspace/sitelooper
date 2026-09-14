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

export interface ExecutionStepShape {
  tool: string;
  body?: readonly ExecutionStepShape[];
}

export function mutatesSteps(steps: readonly ExecutionStepShape[]): boolean {
  return steps.some((step) => isMutatingAction(step.tool) || (step.body ? mutatesSteps(step.body) : false));
}
