import { WILDCARD } from '../shared/text.js';
import type { Skill, SkillStep, StepExpectation } from './store.js';

/**
 * What a procedure PROMISES, and whether an edit to it takes any of that back.
 *
 * Invariant 7 of CORRECTNESS_PLAN.md: learning cannot weaken correctness.
 * Locator repair, pattern generalisation and fallback promotion all exist to
 * make a procedure survive a page that moved, and all of them rewrite a stored
 * procedure in place. None of that is licence to assert less than the
 * recording proved, widen the identity a procedure will accept, or grant a
 * loop authority over records nobody counted — but nothing checked, and the
 * checks that did exist lived only on the spec-repair path.
 *
 * A weakening is not automatically wrong. Generalising a url segment that
 * demonstrated volatility is a real improvement. The rule is that it may not
 * happen SILENTLY: it has to be visible, and a procedure that has promised
 * less than it did has to earn its validation again rather than carry over a
 * status won under the stronger promise.
 */

/** A wildcard matches anything, so counting them measures how much a pattern gave up. */
function wildcards(pattern: string): number {
  return pattern.split(WILDCARD).length - 1;
}

/**
 * Assertions the step no longer makes.
 *
 * Lifted from the spec-repair path, which had it and applied it to exactly one
 * of the several places a procedure gets rewritten.
 */
export function expectationLoss(before: StepExpectation | undefined, after: StepExpectation | undefined): string | null {
  if (!before) return null;
  if (!after) return 'the step no longer asserts anything about the page it produced';
  const lost: string[] = [];
  if (before.urlPattern && !after.urlPattern) lost.push(`url ${before.urlPattern}`);
  if (before.alertContains && !after.alertContains) lost.push(`alert ${JSON.stringify(before.alertContains)}`);
  for (const line of before.addedContains ?? []) {
    if (!(after.addedContains ?? []).includes(line)) lost.push(`page text ${JSON.stringify(line)}`);
  }
  return lost.length ? `no longer asserts ${lost.join(', ')}` : null;
}

function stepWeakening(before: SkillStep, after: SkillStep, where: string): string[] {
  const out: string[] = [];
  const lost = expectationLoss(before.expect, after.expect);
  if (lost) out.push(`${where} ${lost}`);

  // A step that minted a record is how recovery knows a record already
  // exists. Losing it is how a recovered run creates a second one.
  if (before.mints && !after.mints) out.push(`${where} no longer records that it creates a record`);

  if (before.tool === 'loop' || after.tool === 'loop') {
    const bScope = before.scope ?? 'drain';
    const aScope = after.scope ?? 'drain';
    if (bScope === 'observed' && aScope === 'drain') {
      out.push(`${where} widened its loop from the work that was observed to draining every match`);
    }
    const bMax = before.max ?? 0;
    const aMax = after.max ?? 0;
    if (aMax > bMax) out.push(`${where} raised its loop cap from ${bMax} to ${aMax}`);
  }

  for (let i = 0; i < (before.body?.length ?? 0); i++) {
    const b = before.body![i];
    const a = after.body?.[i];
    if (!a) {
      out.push(`${where} dropped step ${i + 1} of its loop body`);
      continue;
    }
    out.push(...stepWeakening(b, a, `${where} loop step ${i + 1}:`));
  }
  return out;
}

/**
 * Every promise `after` makes less strongly than `before`, one line each.
 *
 * Empty means the edit preserved the contract, which is what an ordinary
 * locator repair should do. It compares only what the two have in common: a
 * procedure gaining steps or assertions is strengthening, never weakening.
 */
export function contractWeakening(before: Skill, after: Skill): string[] {
  const out: string[] = [];

  for (const text of before.preconditions.requireText ?? []) {
    if (!(after.preconditions.requireText ?? []).includes(text)) {
      out.push(`no longer requires the page to show ${JSON.stringify(text)} before it runs`);
    }
  }

  // A pattern with more wildcards in it accepts more pages — which is the
  // whole point of generalising one, and exactly why it has to be declared.
  const bWild = wildcards(before.preconditions.urlPattern);
  const aWild = wildcards(after.preconditions.urlPattern);
  if (aWild > bWild) {
    out.push(`widened the page it will start on from ${before.preconditions.urlPattern} to ${after.preconditions.urlPattern}`);
  }

  for (const text of before.goal?.requireText ?? []) {
    if (!(after.goal?.requireText ?? []).includes(text)) {
      out.push(`no longer treats ${JSON.stringify(text)} as the state this procedure produces`);
    }
  }
  if (before.goal && !after.goal) out.push('no longer says what state it produces, so it can never be found already done');

  for (let i = 0; i < before.steps.length; i++) {
    const a = after.steps[i];
    if (!a) {
      out.push(`step ${i + 1} was dropped`);
      continue;
    }
    out.push(...stepWeakening(before.steps[i], a, `step ${i + 1}:`));
  }
  return out;
}
