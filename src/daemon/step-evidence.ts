/**
 * What the recorder already knew about a gesture and used to throw away
 * (design-recorder-evidence stage 0). Recorded facts only: nothing here is read
 * by compile, export, replay or the artifact yet, and every field is optional,
 * so a store written before it existed reads exactly as before.
 *
 * Why each fact, from the published evidence:
 *  - `at`: no recording carried a clock. Whether a change came from the step
 *    or from something after its capture (ghost fwgh6's late tab, gitea
 *    fwgt11's picker that shut between two gestures) could only be guessed.
 *  - `settle`: the action's own SettleVerdict (src/execution/action.ts). Whether
 *    a link click asked the server for its href (openproject fwop6/fwop13's
 *    "+0 -0" clicks) was known at settle and discarded.
 *  - `captureFailed`: a lost after-capture left no diff, which the store could
 *    not tell from "not a diffed tool".
 *  - `totals` / `removed`: the diff keeps 20 lines, and keeps removals only when
 *    a dialog went or nothing was added (espocrm fwec10's 27 lost the line
 *    that would say when Amount emptied). `diff.removed` keeps its meaning
 *    exactly — compile reads its PRESENCE (toggles.ts hidesOnly, quietFill) —
 *    so the always-kept removals live here instead.
 */
import { outcomeOfError, type ActionFailure, type ActionOutcome, type DispatchVia } from '../execution/browser.js';
import type { SettleVerdict } from '../execution/action.js';
import { scrubSecrets, scrubSecretsDeep } from '../shared/secrets.js';

export interface StepEvidence {
  /** Epoch ms: the action dispatched (d), its observation settled (s), the after-capture returned (c). */
  at: { d: number; s?: number; c?: number };
  /** The action observation's verdict, when the step had one (state-changing tools). */
  settle?: {
    outcome: ActionOutcome;
    via?: DispatchVia;
    /** A clicked link whose navigation the settle waited on: where it started, and its href. */
    link?: { from: string; href: string };
    waited: { domMs: number; networkMs: number; urlMs: number; effectMs: number };
    deadlineHit?: true;
    /** How many open requests the settle ignored as long-lived. */
    ignored?: number;
  };
  /** The before or after capture was lost: the step's missing diff means "unknown", not "no effect". */
  captureFailed?: true;
  /** Uncapped counts of the lines the action added and removed (the diff keeps at most 20). */
  totals?: { added: number; removed: number };
  /** What the action took off the page (capped like the diff), kept when `diff.removed` was not. */
  removed?: string[];
}

/** Why a gesture failed, for a step recorded with `failed: true`. */
export interface StepFailure {
  outcome: 'not-dispatched' | 'unknown';
  /** ActionFailure.reason, when the error carried one. */
  reason?: string;
  /** The error's first line, clipped. */
  message: string;
}

/** The settle verdict as a step records it: no page urls beyond a link's, secrets scrubbed. */
export function settleEvidence(v: SettleVerdict): NonNullable<StepEvidence['settle']> {
  return {
    outcome: v.outcome,
    ...(v.via ? { via: v.via } : {}),
    ...(v.link ? { link: scrubSecretsDeep({ from: v.link.from, href: v.link.href }) } : {}),
    waited: { domMs: Math.round(v.waited.domMs), networkMs: Math.round(v.waited.networkMs), urlMs: Math.round(v.waited.urlMs), effectMs: Math.round(v.waited.effectMs) },
    ...(v.deadlineHit ? { deadlineHit: true as const } : {}),
    ...(v.ignored.length ? { ignored: v.ignored.length } : {}),
  };
}

/** A thrown action as a failed step records it: its proven outcome, reason and first line. */
export function stepFailure(err: unknown): StepFailure {
  const reason = err && typeof err === 'object' ? (err as Partial<ActionFailure>).actionReason : undefined;
  const text = err instanceof Error ? err.message : String(err);
  return {
    outcome: outcomeOfError(err),
    ...(reason ? { reason } : {}),
    message: scrubSecrets(text.split('\n')[0].slice(0, 200)),
  };
}

/** Uncapped counts of the lines an action added and removed (the diff itself keeps 20). */
export function diffTotals(before: readonly string[], after: readonly string[]): { added: number; removed: number } {
  const was = new Set(before);
  const now = new Set(after);
  return { added: after.filter((l) => !was.has(l)).length, removed: before.filter((l) => !now.has(l)).length };
}
