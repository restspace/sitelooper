import type { LocatorCandidate, RecordedStep } from '../daemon/recorder.js';
import { framesEqual } from '../execution/context.js';

/**
 * DISCLOSURE TOGGLE PAIRS, found in a recording before it compiles.
 *
 * fwsi1 05-change clicked "Show/Hide More Information" twice: the first click
 * recorded `added: []` — the panel was already open (an earlier instruction
 * had opened it), so its whole effect was to HIDE it — and the second showed
 * it again, recording the panel's links. Every replay starts with the panel
 * shut: the first click opened it, the second shut it, and the step stopped on
 * "none of the 2 recorded page change(s) appeared" (21 recovery turns).
 *
 * Both clicks are the recording getting to one state: the panel shown. So the
 * pair compiles to ONE click — the second, which carries what the panel shows
 * — flagged `toggle` (SkillStep.toggle): both runners skip it as already in
 * effect when everything it is recorded adding is already showing, and click
 * it when not.
 *
 * A pair is, conservatively:
 *  - two clicks on the same control: their target chains share a candidate
 *    that names it (not a point, not a position — `nth`, `:nth-of-type`), in
 *    the same frame, neither with a page effect, a navigation or an alert;
 *  - the first added nothing, and what it took off the page is what the
 *    second put back — at least half of the lines one of them could share (a
 *    recording made before the recorder kept add-less removals has no
 *    `removed` at all, and the first click adding nothing on the same control
 *    is then the whole evidence); a first click whose removal is known to be
 *    EMPTY did nothing visible and is not a toggle (a counter's "+" is two
 *    clicks);
 *  - nothing between them that could change the page (only observations:
 *    reads, evals, screenshots, waits, hovers, scrolls), all on one url.
 *
 * Returns the steps with each pair's first click dropped, and marks the
 * second `toggle: true` IN PLACE — identity is preserved, because compile
 * matches kept steps against the recording by object identity; the mark is a
 * pure function of the recording, so marking again is a no-op.
 */
export function collapseTogglePairs(steps: readonly RecordedStep[]): RecordedStep[] {
  const dropped = new Set<number>();
  for (let i = 0; i < steps.length; i++) {
    const first = steps[i];
    if (dropped.has(i) || !hidesOnly(first)) continue;
    for (let k = i + 1; k < steps.length; k++) {
      const next = steps[k];
      if (next.tool === 'click' && sameControl(first, next)) {
        if (showsWhatWasHidden(first, next)) {
          dropped.add(i);
          next.toggle = true;
        }
        break;
      }
      if (!OBSERVATIONS.has(next.tool) || (next.diff?.url !== undefined && next.diff.url !== first.diff!.url)) break;
    }
  }
  return dropped.size ? steps.filter((_, i) => !dropped.has(i)) : [...steps];
}

/** Steps that change nothing a replay depends on: between the two clicks of a pair, only these. */
const OBSERVATIONS = new Set(['read', 'read_all', 'eval', 'screenshot', 'wait_for', 'hover', 'scroll_into_view']);

/** A click whose only recorded effect is a disappearance (or, from an older recorder, nothing recorded). */
function hidesOnly(step: RecordedStep): boolean {
  const d = step.diff;
  if (step.tool !== 'click' || !d || d.added.length || d.alerts.length) return false;
  if (step.effect || step.fingerprintAfter) return false;
  return d.removed === undefined || d.removed.length > 0;
}

function showsWhatWasHidden(first: RecordedStep, second: RecordedStep): boolean {
  const a = first.diff!;
  const b = second.diff;
  if (!b || !b.added.length || b.alerts.length || second.effect || second.fingerprintAfter) return false;
  if (b.url !== a.url) return false;
  if (!framesEqual(first.locators.target?.frame, second.locators.target?.frame)) return false;
  if (a.removed === undefined) return true;
  const hidden = new Set(a.removed.map(norm));
  const shared = b.added.filter((l) => hidden.has(norm(l))).length;
  return shared > 0 && shared * 2 >= Math.min(a.removed.length, b.added.length);
}

const norm = (line: string) => line.trim();

/** Whether two clicks name the same control: one identifying (non-positional) candidate in common. */
function sameControl(a: RecordedStep, b: RecordedStep): boolean {
  const names = (s: RecordedStep) => new Set((s.locators.target?.chain ?? []).filter(identifying).map(canonical));
  const left = names(a);
  return [...names(b)].some((n) => left.has(n));
}

function identifying(c: LocatorCandidate): boolean {
  if (c.kind === 'point') return false;
  if ('nth' in c && (c as { nth?: unknown }).nth !== undefined) return false;
  if ((c.kind === 'css' || c.kind === 'id') && /:nth-|>>\s*nth=/.test(c.selector)) return false;
  if (c.kind === 'role' && !c.name) return false;
  return true;
}

function canonical(c: LocatorCandidate): string {
  const o = c as unknown as Record<string, unknown>;
  // An id candidate and the css candidate carrying the same `#id` name one element.
  if ((c.kind === 'id' || c.kind === 'css') && /^#[\w-]+$/.test(c.selector)) return `sel:${c.selector}`;
  return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
}
