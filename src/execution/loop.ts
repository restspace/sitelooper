import type { Locator, Page } from 'playwright-core';

/**
 * ONE folded-loop policy, run by daemon replay and embedded verbatim in the
 * standalone artifact.
 *
 * A folded loop exists because the recording did the same thing to record
 * after record. Repeating that safely is not "while the guard matches": it is
 * six rules that were, until this module, written twice and agreed on only
 * three of them (see the policy audit, B9 / gaps 6, 7, 11).
 *
 *  1. SETTLE BEFORE EVERY COUNT. The guard is asked how much work is left; a
 *     list that has not rendered yet answers zero, and a loop that trusts that
 *     reports a full collection drained. The artifact used to count once,
 *     immediately, before anything settled.
 *  2. FIRST MATCH, NOT A UNION. The chain is an ORDERED list of ways to name
 *     one thing, so the guard is the first candidate that matches anything,
 *     and every recount uses THAT candidate. A union of the per-record primary
 *     with a generic fallback counts rows the recording never claimed.
 *  3. THE CURSOR. A delete loop shrinks the collection, so the next record is
 *     always match 0; an edit-in-place loop leaves the count alone, so the next
 *     record is the next match index. The cursor advances exactly when the
 *     previous pass did not consume its record — which is why the shrink is
 *     waited for (a row that leaves the DOM a beat late otherwise reads as an
 *     edit, advances the cursor, and skips a record).
 *  4. THE PROGRESS GUARD, BEFORE THE ACTION. Every pass must either shrink the
 *     guard's count or resolve different elements. Neither means the
 *     per-record locators have stopped telling records apart: fwrd4l-n3's loop
 *     fell through to a positional path pinned to row 1 and edited the same
 *     part seven times while replay counted it as progress. The runner asks
 *     `pass.check()` once a step's targets are resolved and before it acts on
 *     them, so the repeat is refused before its mutation runs a second time —
 *     judged after the body, as this used to be, the mutation had already
 *     been repeated by the time it was noticed.
 *  5. THE CAP IS A BUDGET, NOT A FINISH LINE. A DRAIN that used every pass and
 *     still matches has work left and fails; a loop BOUNDED to the observed
 *     work was never given authority over the rest — it succeeds, but as
 *     `partial` when records still match, never as `complete`. A drain that
 *     empties what the page RENDERED of a virtualised collection is partial
 *     too (the `coverage` hook).
 *  6. AN UNREADABLE GUARD IS NOT AN EMPTY ONE. A count that threw used to read
 *     as zero, and zero is the loop's normal exit, so a closed or navigating
 *     page reported an unfinished collection drained. A count that throws, or
 *     an empty answer from a page that cannot be read at all, is settled and
 *     taken again once; still unreadable, the loop stops. Only a guard read
 *     successfully as empty ends it.
 */
export interface LoopGuard {
  /** How many records still match. Re-resolves the SAME candidate each call. */
  count(): Promise<number>;
  nth(i: number): Locator;
}

/** One pass's evidence for the progress guard (rule 4). */
export interface LoopPass {
  /** What each target of this pass resolved to, in order; the runner appends as it resolves. */
  readonly entries: string[];
  /** Asked once a step's targets are resolved and before acting on them: throws when the pass repeats the previous one. */
  check(): void;
}

export interface LoopHooks {
  settle(): Promise<void>;
  /** the FIRST candidate with count > 0, and the locator to recount with; null when none */
  guard(): Promise<LoopGuard | null>;
  runBody(cursor: number, pass: LoopPass): Promise<{ status: 'ran' | 'stop' }>;
  /** Whether the page can be read at all — what separates "no record matched" from "nothing could be asked" (rule 6). */
  readable(): Promise<boolean>;
  aborted?(): boolean;
  /**
   * Whether the page's collections are only partly rendered (snapshot.ts
   * ObservationCoverage.collections), asked once when a drain runs out of
   * matches: an empty rendered window over a larger collection is not an
   * empty collection. Null (or no hook) when it cannot be said.
   */
  coverage?(): Promise<{ partial: boolean; evidence: string[] } | null>;
}

/** How long a loop iteration waits for its record to leave the guard's match set — both runners' default. */
export const LOOP_SHRINK_WAIT_MS = 1_000;

export interface LoopOptions {
  max: number;
  scope: 'observed' | 'drain';
  /** Defaults to LOOP_SHRINK_WAIT_MS. */
  shrinkWaitMs?: number;
  /** How the guard reads in a failure message; the daemon passes its chain description. */
  describe?: string;
}

/**
 * How a loop ended. `complete`: the work it had authority over is done.
 * `partial`: it stopped short of everything that matches WITHOUT failing — a
 * loop bounded to the observed work used its passes and records still match
 * (`remaining`, null when they could not be counted), or a drain emptied every
 * record the page RENDERED while the page says its collection is larger
 * (a virtualised grid). Not a stop, and not the same claim as `complete`:
 * callers say so. `ok: false` is a loop that did not finish what it owed.
 */
export type LoopOutcome =
  | { ok: true; state: 'complete'; iterations: number }
  | { ok: true; state: 'partial'; iterations: number; remaining: number | null; reason: string }
  | { ok: false; reason: string; iterations: number };

/** The reason a stopped BODY produces: the body itself already said what went wrong. */
export const LOOP_BODY_STOPPED = 'the loop body stopped';

/** Thrown by `LoopPass.check` and caught by runFoldedLoop, so a body stops wherever it stands, before acting. */
export class LoopRepeated extends Error {}

/** The hook both runners pass as `readable`: an evaluate that answers at all. */
export function pageReadable(page: Pick<Page, 'evaluate'>): Promise<boolean> {
  return page.evaluate(() => true).then(
    () => true,
    () => false,
  );
}

function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split('\n')[0].slice(0, 160);
}

export async function runFoldedLoop(hooks: LoopHooks, opts: LoopOptions): Promise<LoopOutcome> {
  let iter = 0;
  let prevSig: string | null = null;
  let prevRemaining = Number.POSITIVE_INFINITY;
  let cursor = 0;
  /** The loop ran out of matching records, rather than out of passes. */
  let exhausted = false;
  const describe = opts.describe ?? 'the guard';
  const unreadable = (why: string): LoopOutcome => ({
    ok: false,
    reason: `${opts.describe ? `loop guard ${opts.describe}` : 'the loop guard'} could not be read after ${iter} pass(es) (${why}) — whether records remain is unknown, so the loop is not finished`,
    iterations: iter,
  });

  /** Rule 6: the guard and how many it matches, taken twice at most; a string when it could not be read. */
  const observe = async (): Promise<{ hit: LoopGuard | null; remaining: number } | string> => {
    let why = 'the page could not be read';
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await hooks.settle();
      try {
        const hit = await hooks.guard();
        const remaining = hit ? await hit.count() : 0;
        if (remaining > 0 || (await hooks.readable())) return { hit, remaining };
        why = 'the page could not be read';
      } catch (err) {
        why = errorText(err);
      }
    }
    return why;
  };

  /** A recount of the guard already resolved, under the same rule. */
  const recount = async (hit: LoopGuard): Promise<number | string> => {
    let why = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await hooks.settle();
      try {
        const n = await hit.count();
        if (n > 0 || (await hooks.readable())) return n;
        why = 'the page could not be read';
      } catch (err) {
        why = errorText(err);
      }
    }
    return why;
  };

  while (iter < opts.max) {
    // A loop cut short by the budget is NOT a finished loop: breaking out
    // counted it as a success, and a part-cleared list read as a cleared one.
    if (hooks.aborted?.()) {
      return { ok: false, reason: `instruction budget exhausted after ${iter} loop iteration(s), before the loop finished`, iterations: iter };
    }
    await hooks.settle();
    // No wait window: this asks whether the list still has rows, and nothing
    // matching is the loop's normal exit, not a failure to find something.
    const seen = await observe();
    if (typeof seen === 'string') return unreadable(seen);
    const { hit, remaining } = seen;
    if (!remaining || cursor >= remaining) {
      exhausted = true;
      break;
    }
    const repeatsPrevious = remaining >= prevRemaining ? prevSig : null;
    const entries: string[] = [];
    // A closure, not a method: the artifact hands `pass.check` on detached.
    const pass: LoopPass = {
      entries,
      check: () => {
        const joined = entries.join('; ');
        if (joined && joined === repeatsPrevious) {
          throw new LoopRepeated(
            `loop iteration ${iter + 1} resolved the same element(s) as the previous one with the guard count unchanged (${remaining}) — ` +
              `the recorded per-record locators no longer distinguish records, so the loop stopped before re-acting on one record`,
          );
        }
      },
    };
    let body: { status: 'ran' | 'stop' };
    try {
      body = await hooks.runBody(cursor, pass);
    } catch (err) {
      if (err instanceof LoopRepeated) return { ok: false, reason: err.message, iterations: iter };
      throw err;
    }
    if (body.status === 'stop') return { ok: false, reason: LOOP_BODY_STOPPED, iterations: iter };
    // A body whose runner never asked (nothing it resolved came after the
    // repeat was complete) is still judged, now, on everything it resolved.
    try {
      pass.check();
    } catch (err) {
      if (err instanceof LoopRepeated) return { ok: false, reason: err.message, iterations: iter };
      throw err;
    }
    prevSig = entries.join('; ');
    // Did this pass consume its record (the guard shrank) or leave it in place?
    // Settle first: a removal landing late would otherwise advance the cursor
    // and make the next pass skip a record.
    await hooks.settle();
    let after = await recount(hit!);
    if (typeof after === 'string') return unreadable(after);
    if (after >= remaining && remaining > 0) {
      // "the count shrank" is exactly "the remaining-th match left the DOM", so
      // wait on that element rather than re-counting on a timer: a row that goes
      // immediately is seen immediately, and one that never goes costs no more
      // than the old window. A wait that times out is the answer "it stayed".
      await hit!
        .nth(remaining - 1)
        .waitFor({ state: 'detached', timeout: opts.shrinkWaitMs ?? LOOP_SHRINK_WAIT_MS })
        .catch(() => {});
      after = await recount(hit!);
      if (typeof after === 'string') return unreadable(after);
    }
    if (after >= remaining) cursor++;
    prevRemaining = remaining;
    iter++;
  }
  // Counted fresh: `remaining` above is from before the last pass ran.
  if (iter >= opts.max && opts.scope === 'drain') {
    const seen = await observe();
    if (typeof seen === 'string') return unreadable(seen);
    if (seen.remaining > cursor) {
      return {
        ok: false,
        reason: `loop stopped after ${opts.max} pass(es) with ${seen.remaining - cursor} item(s) still matching ${describe} — the recorded work is not finished`,
        iterations: iter,
      };
    }
  }
  // A BOUNDED loop that used its passes did the work it had authority over
  // (rule 5), but "the loop is done" and "nothing matches any more" are
  // different claims, and a caller reporting the first must not imply the
  // second. So the rest is counted and the outcome says partial.
  if (iter >= opts.max && opts.scope === 'observed') {
    const seen = await observe();
    if (typeof seen === 'string') {
      return { ok: true, state: 'partial', iterations: iter, remaining: null, reason: `bounded to ${opts.max} pass(es); whether records still match ${describe} could not be read (${seen})` };
    }
    if (seen.remaining > cursor) {
      const left = seen.remaining - cursor;
      return { ok: true, state: 'partial', iterations: iter, remaining: left, reason: `bounded to ${opts.max} pass(es), ${left} item(s) still match ${describe}` };
    }
  }
  // A drain that ran out of RENDERED matches on a page that says its
  // collection is bigger than what it rendered has emptied a window, not the
  // collection.
  if (exhausted && opts.scope === 'drain' && hooks.coverage) {
    const collections = await hooks.coverage().catch(() => null);
    if (collections?.partial) {
      return {
        ok: true,
        state: 'partial',
        iterations: iter,
        remaining: null,
        reason: `no rendered record matches ${describe}, but the page renders only part of its collection (${collections.evidence.join(', ') || 'virtualised'}) — records not rendered may remain`,
      };
    }
  }
  return { ok: true, state: 'complete', iterations: iter };
}
