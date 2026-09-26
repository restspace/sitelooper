/**
 * Record-time sourcing (notes/design/design-recording-hygiene.md §4, stages
 * 3-4), behind SITELOOPER_SOURCING_HOLD=on (default off; with it off nothing
 * in this file runs and the loop is byte-identical).
 *
 * Two measures, both at the moment the recording model files a report:
 *
 *  - Stage 3, the commentary pre-pass (deterministic, no hold): a reported
 *    value of the form `head + commentary` — "Ready to Deploy (badge:
 *    Deployed)", "Dec 31 (year not displayed)", "BA Bench Assignee — the
 *    default" — whose HEAD the page shows is published as the head, and the
 *    commentary moves into the summary. The page vouches for the head; the
 *    rest was the model talking.
 *
 *  - Stage 4, the sourcing hold: a value the instruction ASKED for that no
 *    element on the current page shows, that nothing this instruction read or
 *    displayed, and that the page sweep proves absent, is handed back to the
 *    model once with the ask to read it where it is shown. A replay can only
 *    re-read a value a real read produced (fwgt10's issue titles came from an
 *    eval; fwec8's record id was frozen as a literal; fwsi14's minted tag was
 *    typed back as one). The retry is accepted whatever it says: this never
 *    refuses a report, it costs at most one turn, and it forbids data-changing
 *    gestures in its own text.
 *
 * The decision (`decideSourcingHold`) is pure and takes the tier verdicts as
 * an input; the loop supplies them from the same read-back tiers `finish`
 * runs, as a dry run that files nothing.
 */
import { foldValue } from '../skills/flow.js';
import { askedOutputs } from '../daemon/step-verdict.js';
import { READ_BACK_MAX_VALUE_CHARS } from './readback.js';
import type { Report } from './report.js';

/** Whether the sourcing measures are on (read per call: a test or a daemon restart may change it). */
export function sourcingHoldOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SITELOOPER_SOURCING_HOLD === 'on';
}

/** A hold this close to the instruction deadline would only burn the turn it needs. */
export const SOURCING_HOLD_MIN_MS = 20_000;

/** The most values one hold lists: past this the report is a table, not a handful of asks. */
export const MAX_HELD_VALUES = 6;

/** Verdict-shaped values are conclusions, never page text to read back. */
const VERDICTS = new Set(['yes', 'no', 'true', 'false', 'none', 'n/a', 'na', 'not set', 'unset', '0', 'ok', 'done', 'success', 'failed', 'failure', 'pass', 'fail']);

/**
 * `head + commentary`: a trailing parenthetical, or an em-dash / semicolon
 * tail, with a substantive head before it. A parenthetical that is the value's
 * data — "Seed: triage inbox (#1)" — is not commentary; flattenContainedComposite
 * runs first and keeps such parts, and this split is only consulted for what
 * it left. A head made only of punctuation is no head.
 */
export function splitCommentary(value: string): { head: string; commentary: string } | null {
  const raw = value.trim();
  const paren = /^(.{2,}?)\s*\(([^()]{2,})\)$/s.exec(raw);
  const dash = /^(.{2,}?)\s+[—–-]\s+(.{2,})$/s.exec(raw);
  const semi = /^(.{2,}?);\s+(.{2,})$/s.exec(raw);
  const m = paren ?? dash ?? semi;
  if (!m) return null;
  const head = m[1].trim();
  const commentary = m[2].trim();
  if (!head || !commentary || !/[\p{L}\p{N}]/u.test(head)) return null;
  return { head, commentary };
}

/**
 * Stage 3, applied: for each value with commentary whose head `sourced`
 * (captureReadBack on the live page), publish the head and move the
 * commentary into the summary. Returns the keys it changed. The summary line
 * names the key, so nothing the model said is lost — it just stops being a
 * value a replay would have to find on the page.
 */
export async function applyCommentaryPrePass(report: Report, sourced: (head: string, key: string) => Promise<boolean>, only?: readonly string[]): Promise<string[]> {
  const values = report.evidence?.values;
  if (!values) return [];
  const changed: string[] = [];
  for (const [key, raw] of Object.entries(values)) {
    if (only && !only.includes(key)) continue;
    if (typeof raw !== 'string') continue;
    const split = splitCommentary(raw);
    if (!split) continue;
    if (!(await sourced(split.head, key))) continue;
    values[key] = split.head;
    report.summary = `${report.summary.trimEnd()} (${key}: ${split.commentary})`;
    changed.push(key);
  }
  return changed;
}

/** Data-shaped: something an element could show, not a verdict and not prose. */
export function isDataShaped(value: string): boolean {
  const folded = foldValue(value);
  if (!folded || folded.length > READ_BACK_MAX_VALUE_CHARS) return false;
  if (VERDICTS.has(folded)) return false;
  // A verdict with commentary is still a verdict: fwrd94 07-set held for
  // `errors_shown` = "none — the action succeeded with no refusal", a wasted turn.
  const head = splitCommentary(value)?.head;
  if (head && VERDICTS.has(foldValue(head))) return false;
  return /[\p{L}\p{N}]/u.test(folded);
}

/** What the dry run of the read-back tiers said about one value. */
export type TierVerdict =
  /** Some tier pinned it (or a part of it) on this instruction's pages. */
  | 'sourced'
  /** Every tier failed AND a complete sweep of the current page found no occurrence. */
  | 'absent'
  /** Every tier failed, but the page could not be swept or the value is on it somewhere (ambiguous). */
  | 'unknown';

export interface SourcingCandidate {
  key: string;
  value: string;
  verdict: TierVerdict;
  /** The value equals (or is contained in) something an eval of this instruction returned. */
  fromEval?: boolean;
  /**
   * Held although the instruction did not ask for it: a reliable site fact
   * (valueVerdict: the key's mint shape, or the value's mint class) makes it
   * an identifier (site facts stage 3, consumer 3). The `facts.sourcing`
   * shadow row for its key is then `applied`.
   */
  byFact?: boolean;
}

/**
 * The origin's value-class facts as the hold consults them (site facts stage
 * 3, consumer 3): `verdict(value, key)` is skills/facts-value.ts
 * `valueVerdict` under the key's `shapeKeyOf(url, key)` on the instruction's
 * url — RELIABLE facts only, null when none speaks. Injected by the loop, so
 * this module stays pure and never reads the store.
 */
export interface SourcingFacts {
  verdict(value: string, key: string): { kind: 'identifier' | 'not-identifier' } | null;
}

export interface SourcingDecision {
  /** The values to hold for, in report order. */
  held: SourcingCandidate[];
}

/**
 * The pure decision: which of the report's values to hold for.
 *
 *  - only an ASKED key (the same word match behind replay's `unanswered`, so
 *    the record-time ask and the replay-time warning agree);
 *  - only a data-shaped value;
 *  - never a value this instruction already read, or one shown in a recorded
 *    alert / dialog (the model saw it; an alert that has gone cannot be
 *    re-read, and holding for it only burns the turn — fwrd81-88's
 *    `precondition_required`);
 *  - and only when the tiers proved it `absent`. Ambiguous values (several
 *    candidates on the page) are not held: they go on to the model-sourced
 *    locate in finish exactly as today.
 *
 * Site facts (stage 3, consumer 3): with `facts`, a key the instruction did
 * NOT ask for is still a candidate when a reliable fact makes its value an
 * identifier (the label's mint shape: fwsi16's unasked list columns, threaded
 * to later literals) — every other filter above applies to it unchanged, and
 * it is marked `byFact`. The facts only ever ADD a candidate; with no facts,
 * or no reliable verdict, the decision is today's.
 */
export async function decideSourcingHold(input: {
  instruction: string;
  values: Record<string, unknown>;
  alreadyRead: ReadonlySet<string>;
  alertTexts: readonly string[];
  /** The tiers' dry run for one value — consulted only for values the cheap filters let through. */
  verdict: (key: string, value: string) => Promise<TierVerdict>;
  evalResults?: readonly string[];
  /** The origin's reliable value facts (the daemon's snapshot); absent → today's rule. */
  facts?: SourcingFacts;
}): Promise<SourcingDecision> {
  const asked = new Set(askedOutputs(input.instruction, Object.keys(input.values)));
  const alerts = input.alertTexts.map(foldValue);
  const evals = (input.evalResults ?? []).map(foldValue);
  const held: SourcingCandidate[] = [];
  for (const [key, raw] of Object.entries(input.values)) {
    const value = String(raw ?? '').trim();
    // Asked, or (site facts) an identifier by a reliable fact: nothing else is held.
    let byFact = false;
    if (!asked.has(key)) {
      if (!input.facts || !isDataShaped(value) || input.alreadyRead.has(value)) continue;
      let verdict: ReturnType<SourcingFacts['verdict']> = null;
      try {
        verdict = input.facts.verdict(value, key);
      } catch {
        verdict = null;
      }
      if (verdict?.kind !== 'identifier') continue;
      byFact = true;
    }
    if (!isDataShaped(value)) continue;
    if (input.alreadyRead.has(value)) continue;
    const folded = foldValue(value);
    if (alerts.some((a) => a.includes(folded))) continue;
    if ((await input.verdict(key, value)) !== 'absent') continue;
    held.push({ key, value, verdict: 'absent', ...(evals.some((e) => e.includes(folded)) ? { fromEval: true } : {}), ...(byFact ? { byFact: true } : {}) });
    if (held.length >= MAX_HELD_VALUES) break;
  }
  return { held };
}

/** The text handed back with the held report. */
export function sourcingAskMessage(held: readonly SourcingCandidate[]): string {
  const lines = held.map((h) => `  ${h.key} = ${JSON.stringify(h.value)}${h.fromEval ? '  (it matches what your eval returned; evals are never replayed)' : ''}`);
  return (
    `report held — these values are not shown by any element on the current page, nor anywhere this instruction read or displayed them, so a replay could never read them again:\n` +
    `${lines.join('\n')}\n` +
    `For each one: if the page shows it, read it where it is shown — read or read_all with label=<key>, navigating back if you must, but do not click or fill anything that changes data — and report exactly the text the page shows. ` +
    `If it is your own conclusion or paraphrase, keep it and say so in the summary. Then call report again.`
  );
}
