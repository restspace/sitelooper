import type { Page } from 'playwright-core';
import { DIALOG_LINE, dismissalAlreadyInEffect, liveLines, type DialogControlStep, type LiveLines } from './expect.js';
import { shadowEnabled, shadowLine } from './shadow.js';
import { captureLines, lineShows, type LineDialect } from './snapshot.js';

/**
 * The `delta` shadow rules (execution/shadow.ts): a replayed step's success
 * counts only if part of its recorded effect was produced during this run.
 * Under trial, so every function here only words a finding; neither runner
 * changes a verdict, a skip or a stop on it. Both runners ask the same
 * functions, as with every shared module.
 */

/** A finding's evidence, quoted and clipped for one line. */
function quoted(lines: readonly string[]): string {
  const first = JSON.stringify(lines[0].length > 80 ? `${lines[0].slice(0, 79)}…` : lines[0]);
  return lines.length > 1 ? `${first} and ${lines.length - 1} more` : first;
}

/*
 * RULE 1 — found on the page instead. The effect gate (expect.ts
 * changesVerdict) accepts a recorded change the step's diff did not add when
 * the live page shows it. When every line the live page showed was already in
 * the step's BEFORE look, the page was in that state before the action: the
 * run did not produce it (fwgt3's Escape step, `- combobox "Labels"`). A line
 * that arrived late — in neither the before look nor the diff, on the live
 * page — is a real effect and no finding. No before look, no evidence.
 * The lines themselves come from expect.ts preexistingLines, on the verdict.
 */

/** Rule 1's finding, worded once for both runners; null when there is nothing to say or shadow rules are off. */
export function preexistingShadow(tag: string, lines: readonly string[] | undefined): string | null {
  if (!lines?.length || !shadowEnabled()) return null;
  return shadowLine('delta', tag, `its recorded page change ${quoted(lines)} was accepted from the live page, but it was already on the page before the step — this run did not produce it`);
}

/*
 * RULE 2 — "already in effect" skips. An opener whose popup shows, a
 * disclosure already open, a hide or a dismissal whose lines are already
 * gone: each skip rests on the page's present state. When that state already
 * held as this segment STARTED — before any of its steps ran — nothing this
 * segment did produced it (fwod98 06-open: the company menu is on every
 * page). One look at the segment's start, in the dialect of its first step
 * that can skip this way; a step in another dialect gets no finding, nor does
 * any step when that look failed. The applied-pick skip needs none of this:
 * it already refuses a pick its segment's start showed (toggle.ts
 * pickAlreadyApplied).
 */

/** The page as a segment started, in one dialect. */
export interface SegmentStart {
  dialect: LineDialect;
  live: LiveLines;
}

/** A dismissal step as rule 2 reads it (expect.ts dismissalAlreadyInEffect reads the same). */
export type DismissalStep = DialogControlStep & { mints?: unknown; expect?: { removedContains?: readonly string[] } };

/**
 * The one look at a segment's start, in the dialect toggle.ts
 * segmentStartDialect chose; null when shadow rules are off or the look failed.
 */
export async function segmentStart(page: Page, dialect: LineDialect | null): Promise<SegmentStart | null> {
  if (!shadowEnabled() || dialect === null) return null;
  try {
    const live = await captureLines(page, dialect);
    return live ? { dialect, live } : null;
  } catch {
    return null;
  }
}

/** What an in-effect skip relied on (lines filled for this run): lines shown (one of `any`, every one of `all`), lines absent, or a dismissal's dialog. */
export type InEffectEvidence =
  | { shown: { any: readonly string[]; all: readonly string[] } }
  | { absent: readonly string[] }
  | { dismissed: { step: DismissalStep; params: Record<string, string> } };

/** Did the evidence an in-effect skip relied on already hold as the segment started? An absence holds only on a start look that covered the page. */
export function heldAtStart(start: SegmentStart | null | undefined, dialect: LineDialect, evidence: InEffectEvidence): boolean {
  if (!start || start.dialect !== dialect) return false;
  const lines = start.live.lines;
  if ('shown' in evidence) {
    const { any, all } = evidence.shown;
    if (!any.length && !all.length) return false;
    if (any.length && !lineShows(lines, [...any])) return false;
    return all.every((l) => lineShows(lines, [l]));
  }
  if ('absent' in evidence) {
    if (!evidence.absent.length || !start.live.complete) return false;
    return !evidence.absent.some((l) => lineShows(lines, [l]));
  }
  return dismissalAlreadyInEffect(evidence.dismissed.step, start.live, evidence.dismissed.params) !== null;
}

/** Rule 2 in one call: the finding when the evidence held at the segment's start, else null. `what` names the skip. */
export function inEffectShadow(start: SegmentStart | null | undefined, dialect: LineDialect, tag: string, what: string, evidence: InEffectEvidence): string | null {
  if (!shadowEnabled() || !heldAtStart(start, dialect, evidence)) return null;
  const lines =
    'shown' in evidence
      ? [...evidence.shown.any, ...evidence.shown.all]
      : 'absent' in evidence
        ? [...evidence.absent]
        : liveLines((evidence.dismissed.step.expect?.removedContains ?? []).filter((l) => DIALOG_LINE.test(l)), evidence.dismissed.params);
  const shown = lines.length ? ` (${quoted(lines)})` : '';
  const how = 'absent' in evidence || 'dismissed' in evidence ? 'absent' : 'showing';
  return shadowLine('delta', tag, `skipped as already in effect (${what}), on evidence${shown} already ${how} when this segment started — this run did not produce it`);
}

/*
 * RULE 3 — "already satisfied" goal skips. Every such skip rests on state that
 * predates the step by definition, so what tells a real one from a leftover is
 * whether the goal text that satisfied it names a value OF THIS RUN: a slot
 * whose param the caller vouched for (`known`) or one bound to the run id, or
 * the run id itself. "Dashboard saved" (fwgr50, the previous step's toast) and
 * "FURN_6666" (fwod74, a product code the previous step showed) name nothing
 * of the run.
 */

/** A param as rule 3 reads it (SkillParam, structurally). */
export interface RunParam {
  known?: boolean;
  binding?: string;
}

/** The params a goal may name as this run's own: `known` ones, and any bound to the run id. */
export function runSlotsOf(...sets: (Record<string, RunParam | undefined> | undefined)[]): string[] {
  const out = new Set<string>();
  for (const set of sets) for (const [name, p] of Object.entries(set ?? {})) if (p?.known || p?.binding === 'var:runid') out.add(name);
  return [...out];
}

/** The run id values among `params` (those bound `var:runid` in any of `sets`). */
export function runIdsOf(params: Record<string, string>, ...sets: (Record<string, RunParam | undefined> | undefined)[]): string[] {
  const out = new Set<string>();
  for (const set of sets) for (const [name, p] of Object.entries(set ?? {})) if (p?.binding === 'var:runid' && params[name]) out.add(params[name]);
  return [...out];
}

const GOAL_SLOT = /\{\{([^{}]+)\}\}/g;

/** Does the goal text (recorded markers, slots intact) name a value of this run — a bound `runSlots` slot, or a run id in its filled text? */
export function goalNamesRunValue(goal: readonly string[], params: Record<string, string>, runSlots: readonly string[], runIds: readonly string[] = []): boolean {
  for (const g of goal) {
    for (const m of g.matchAll(GOAL_SLOT)) {
      const value = params[m[1]];
      if (runSlots.includes(m[1]) && typeof value === 'string' && value.trim()) return true;
    }
  }
  const ids = runIds.map((v) => (v ?? '').trim()).filter((v) => v.length >= 3);
  return goal.some((g) => {
    const filled = g.replace(GOAL_SLOT, (all, name: string) => params[name] ?? all);
    return ids.some((id) => filled.includes(id));
  });
}

/** Rule 3 in one call: the finding when the satisfied goal names nothing of this run, else null. */
export function goalSkipShadow(tag: string, goal: readonly string[], params: Record<string, string>, runSlots: readonly string[], runIds: readonly string[] = []): string | null {
  if (!shadowEnabled() || !goal.length || goalNamesRunValue(goal, params, runSlots, runIds)) return null;
  const shown = goal.map((g) => g.replace(GOAL_SLOT, (all, name: string) => params[name] ?? all));
  return shadowLine('delta', tag, `skipped as already satisfied on goal text ${quoted(shown)}, which names no value of this run — it may have been on the page before the run`);
}
