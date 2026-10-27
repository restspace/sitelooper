/**
 * Shadow rules: stricter checks under trial that report and never refuse.
 *
 * Each finding is one line, `[shadow:<kind>] step <tag>: <why>`. Replay
 * collects them on ReplayResult.shadow, the flow run carries them on
 * FlowStepResult.shadow, and a compiled artifact prints them as
 * `[sitelooper shadow] …`. A sweep counts them against its verifier: a rule
 * that flags the known false passes and stays quiet on green runs graduates
 * to a refusal; one that does not is dropped.
 *
 * Kinds:
 *  - `delta`: a step's success rested on page state that was already there
 *    before this run's segment began, so the run did not cause it (an expected
 *    change "found on the page instead", an "already in effect" skip, an
 *    "already satisfied" goal skip).
 *  - `read`: a published value whose recorded template is fully fixed (literal
 *    text and this run's own params) read something else on this replay.
 *
 * Embedded verbatim in the compiled artifact, like the rest of src/execution.
 */

export type ShadowKind = 'delta' | 'read';

/** Off only when SITELOOPER_SHADOW=off; on by default while rules are under trial. */
export function shadowEnabled(): boolean {
  return (typeof process !== 'undefined' ? process.env?.SITELOOPER_SHADOW : undefined) !== 'off';
}

export function shadowLine(kind: ShadowKind, tag: string, why: string): string {
  return `[shadow:${kind}] step ${tag}: ${why}`;
}
