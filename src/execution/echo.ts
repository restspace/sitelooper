/**
 * The ECHO rule both execution targets share: a read-back that returns only
 * what the procedure itself typed, selected or named confirms the control's
 * display, not that the app persisted anything. grafana's time picker read
 * back "Last 6 hours" after the replay had clicked the option of that name.
 *
 * The daemon (src/skills/replay.ts) keeps one ledger per replayed segment and
 * reports an echoed label in `ReplayResult.echoedValues`, which the flow runner
 * drops from its confident values. A compiled `.flow.ts` embeds this exact
 * source (spec/runtime-source.ts), keeps the same ledger per segment, and lists
 * the label in `run.echoed`. Neither runner withholds the value from a later
 * step: an echo is a report-confidence finding, not a gate.
 *
 * Self-contained: sibling shared modules and Playwright types only.
 */
import { clip } from './text.js';

/**
 * Shortest interacted/read value worth treating as an echo. Below this the
 * coincidence rate is too high (a "1m" refresh, a "3" quantity) — a false echo
 * would wrongly drop a legitimate finding, so only substantial values qualify.
 */
export const MIN_ECHO_LEN = 5;

/**
 * Tools that observe or position and SET nothing, so what they name is never
 * an interaction. A scroll to the heading "Latency by endpoint" set nothing,
 * but its target's name used to land in the ledger and the later read of that
 * heading was discounted as an echo — fwgr23 published two of three panel
 * titles on every replay and objective 1 failed each time.
 */
const OBSERVATION_TOOLS = new Set(['scroll_into_view', 'wait_for', 'hover', 'screenshot']);

/** Whether a step of this tool puts something on the page the ledger should remember. */
export function setsSomething(tool: string): boolean {
  return tool !== 'read' && tool !== 'read_all' && !OBSERVATION_TOOLS.has(tool);
}

/** Loosely keyed, so "Last 6 hours" matches "last 6 hours" and "Last 6 hours." */
export function echoKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Remember what a step put on the page: its filled `value`/typed `text`, and
 * the accessible name (else label) of every candidate of a target it resolved
 * — the name of a clicked option ("Last 6 hours") is the value it selects.
 * Callers pass only steps for which `setsSomething(tool)` holds, and the
 * candidates only once the chain RESOLVED, as replay does.
 */
export function noteInteraction(ledger: Set<string>, texts: readonly unknown[]): void {
  for (const text of texts) {
    if (typeof text === 'string' && text.length >= MIN_ECHO_LEN) ledger.add(echoKey(text));
  }
}

/** The name, else the label, of each candidate: what a resolved target is known by. */
export function candidateNames(candidates: readonly { name?: unknown; label?: unknown }[]): unknown[] {
  return candidates.map((c) => c.name ?? c.label);
}

/**
 * The warning for a read whose value is an echo, or null when it is not one.
 * `where` is the caller's name for the step ("step 3" in the daemon,
 * "<stepId> <segmentId>/<n>" in the artifact); `label` is the read's own key.
 */
export function echoVerdict(ledger: Set<string>, label: string, value: string, where: string): string | null {
  if (!value || value.length < MIN_ECHO_LEN || !ledger.has(echoKey(value))) return null;
  return `${where}: read '${label}' returned a value the skill itself set/selected ('${clip(value, 60)}') — confirms the control, not persistence; dropped from the report's confident values`;
}
