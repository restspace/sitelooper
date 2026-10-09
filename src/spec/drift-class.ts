/**
 * Which `[sitelooper drift]` lines stop a compiled spec from counting as clean.
 *
 * One classifier for readiness (src/spec/readiness.ts) and convergence
 * (src/spec/converge.ts), so the two cannot disagree about "clean" again:
 * fwgt35-luna-cv converged ("round 2: the compiled spec passed"), then
 * readiness run 1 refused it on 5 locator fallbacks, every one on a
 * read-back whose value only fed the final report, and `build` exited 4.
 *
 * The line names its site (`<step> s_xxxxxx/<n>`, emit.ts `where`), and the
 * compiled flow says what that site is:
 *  - a gesture (click, fill, type, select, press, goto, a loop, a wait …):
 *    the fallback chose what the run ACTED on — blocks;
 *  - a check of an assertion (`sitelooper assert`) — blocks;
 *  - a read whose label a later step consumes (`{{<step>.<label>}}` in a later
 *    step, or `{{<label>}}` further on in its own step) — the fallback chose a
 *    value the run went on to use — blocks;
 *  - a read nothing consumes: its value only feeds the final report — a
 *    warning (the user's decision, hard-5 contract fix 5(b)).
 * Anything the flow cannot place (no site, a step or segment it does not
 * have, an index past the segment) blocks: fail closed.
 */
import type { SkillStep } from '../skills/store.js';

/** What the classifier reads of a compiled flow; `SpecFlow` satisfies it. */
export interface DriftFlow {
  steps: ReadonlyArray<{
    id: string;
    kind?: 'assert';
    params?: Record<string, string>;
    segments?: ReadonlyArray<{ id: string; assert?: true; steps: readonly SkillStep[] }>;
  }>;
}

export interface DriftEvent {
  line: string;
  /** The flow step the line names, when it names one. */
  step: string | null;
  /** `<segment>/<n>` as the line names it. */
  site: string | null;
  blocking: boolean;
  why: string;
}

export interface DriftClassification {
  blocking: DriftEvent[];
  warnings: DriftEvent[];
}

const SITE = /^\[sitelooper drift\] ([\w-]+) ([\w-]+)\/(\d+)\b/;
const STEP_ONLY = /^\[sitelooper drift\] ([\w-]+) /;

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The names a read publishes under: its own label, and the label its args carry. */
function readLabels(s: SkillStep): string[] {
  const args = (s.args ?? {}) as Record<string, unknown>;
  return [...new Set([s.label, typeof args.label === 'string' ? args.label : undefined].filter((l): l is string => Boolean(l)))];
}

export function classifyDriftLine(line: string, flow: DriftFlow | null | undefined): DriftEvent {
  const m = SITE.exec(line);
  const named = m?.[1] ?? STEP_ONLY.exec(line)?.[1] ?? null;
  const at = (blocking: boolean, why: string): DriftEvent => ({ line, step: named, site: m ? `${m[2]}/${m[3]}` : null, blocking, why });
  if (!m) return at(true, 'the drift line names no recorded step');
  if (!flow) return at(true, 'no compiled flow metadata to classify it by');
  const [, stepId, segmentId, n] = m;
  const stepAt = flow.steps.findIndex((s) => s.id === stepId);
  const step = flow.steps[stepAt];
  if (!step) return at(true, `${stepId} is not a step of the compiled flow`);
  const segAt = step.segments?.findIndex((s) => s.id === segmentId) ?? -1;
  const segment = step.segments?.[segAt];
  if (!segment) return at(true, `${stepId} has no segment ${segmentId}`);
  const index = Number(n);
  const action = segment.steps[index - 1];
  if (!action) return at(true, `${segmentId} has no step ${index}`);
  if (step.kind === 'assert' || segment.assert || action.assert) return at(true, `fallback on an assertion check (${action.tool})`);
  if (action.tool !== 'read' && action.tool !== 'read_all') return at(true, `fallback on a ${action.tool}: the run acted on what it chose`);
  const labels = readLabels(action);
  for (const label of labels) {
    // A later flow step that names it: `{{04-set.sidebar_labels_1}}`, `{{…}}.x`, `{{…|filter}}`.
    const qualified = new RegExp(`\\{\\{\\s*${escape(stepId)}\\.${escape(label)}\\s*[}.|]`);
    const later = flow.steps.slice(stepAt + 1).find((s) => qualified.test(JSON.stringify(s)));
    if (later) return at(true, `fallback on read "${label}", which ${later.id}${later.kind === 'assert' ? ' (an assertion)' : ''} uses`);
    // The rest of its own step: the actions after it in this segment, then the later segments.
    const bare = new RegExp(`\\{\\{\\s*(?:${escape(stepId)}\\.)?${escape(label)}\\s*[}.|]`);
    const rest = [...segment.steps.slice(index), ...(step.segments ?? []).slice(segAt + 1).flatMap((s) => s.steps)];
    if (rest.some((s) => bare.test(JSON.stringify(s)))) return at(true, `fallback on read "${label}", which a later action of ${stepId} uses`);
  }
  return at(false, `fallback on read${labels.length ? ` "${labels.join('"/"')}"` : ''}, which only feeds the final report`);
}

/** Every drift line, split into the ones that block "clean" and the report-only warnings. */
export function classifyDrift(lines: readonly string[], flow: DriftFlow | null | undefined): DriftClassification {
  const events = lines.map((line) => classifyDriftLine(line, flow));
  return { blocking: events.filter((e) => e.blocking), warnings: events.filter((e) => !e.blocking) };
}

/** The first flow step (in flow order) a blocking event names, for a re-record. */
export function firstBlockingStep(blocking: readonly DriftEvent[], order: readonly string[]): string | null {
  const named = blocking.map((e) => e.step).filter((s): s is string => Boolean(s));
  if (!named.length) return null;
  const at = new Map(order.map((id, i) => [id, i]));
  return [...named].sort((a, b) => (at.get(a) ?? 1e9) - (at.get(b) ?? 1e9))[0];
}

/** "5 locator fallback events at 04-set s_6733ad/7, 05-open s_76d091/10" — the blocker / why text. */
export function describeDrift(events: readonly DriftEvent[], noun = 'locator fallback events'): string {
  const sites = [...new Set(events.map((e) => (e.step ? `${e.step}${e.site ? ` ${e.site}` : ''}` : 'an unnamed site')))];
  return `${events.length} ${noun} at ${sites.slice(0, 5).join(', ')}${sites.length > 5 ? `, +${sites.length - 5} more` : ''}`;
}
