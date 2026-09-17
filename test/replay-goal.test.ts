/**
 * `goalSatisfied`: is this step's work already done on the record it names?
 *
 * Both halves are load-bearing and both are here. Identity without goal skips a
 * step because the right record is open; goal without identity skips it because
 * some OTHER order happens to read "Cancelled". A false positive silently omits
 * work that never happened, so every uncertain case has to come back false.
 */
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { goalSatisfied } from '../src/skills/replay.js';
import type { Skill } from '../src/skills/store.js';
import { documentOf } from './fixture/observation.js';

/** A page that shows exactly these signature lines. */
function fakePage(lines: string[]): Page {
  return {
    url: () => 'http://127.0.0.1:8069/odoo/sales/21',
    title: async () => 'Sales order',
    evaluate: async () => documentOf(lines),
  } as unknown as Page;
}

/** Odoo's status bar after the cancel: every reachable state, Cancelled among them. */
const CANCELLED = ['- heading "S00021"', '- button "Cancelled"', '- button "Sales Order"', '- button "Quotation Sent"'];
/** Before it: the same bar without Cancelled. */
const OPEN = ['- heading "S00021"', '- button "Sales Order"', '- button "Quotation Sent"', '- button "Cancel"'];

const skill = (goal?: string[], identity: string[] = ['{{v1}}', '{{v3}}']): Pick<Skill, 'preconditions' | 'goal'> => ({
  preconditions: { urlPattern: 'http://127.0.0.1:8069/odoo/sales/:id', requireText: identity },
  ...(goal ? { goal: { requireText: goal } } : {}),
});

const PARAMS = { v1: 'S00021', v3: 'Sales Order' };

describe('goalSatisfied', () => {
  it('is satisfied when this record shows the goal, and says what it saw', async () => {
    const res = await goalSatisfied(fakePage(CANCELLED), skill(['Cancelled']), PARAMS);
    expect(res).toEqual({ satisfied: true, shown: ['Cancelled'] });
  });

  it('is not satisfied while the goal is missing — the step still has work to do', async () => {
    expect(await goalSatisfied(fakePage(OPEN), skill(['Cancelled']), PARAMS)).toEqual({ satisfied: false, shown: [] });
  });

  it('is not satisfied on a DIFFERENT record that happens to show the goal', async () => {
    const other = ['- heading "S00022"', '- button "Cancelled"', '- button "Sales Order"'];
    expect(await goalSatisfied(fakePage(other), skill(['Cancelled']), PARAMS)).toEqual({ satisfied: false, shown: [] });
  });

  // fwrd69: one "add a part" skill pinned by 02-add and 03-add; its goal was
  // what any part row shows, so 03-add was "already satisfied" on Part A's row
  // and Part B was never created. The record the step names is every value it
  // names — the part's own name (`known`) has to be on the page too.
  it('is not satisfied until the record the step itself names is on the page', async () => {
    const adding: Pick<Skill, 'preconditions' | 'goal'> & { params: Skill['params'] } = {
      preconditions: { urlPattern: 'http://127.0.0.1:8069/odoo/sales/:id', requireText: ['{{v1}}'] },
      goal: { requireText: ['Edit Delete'] },
      params: {
        v1: { example: 'S00021', usedIn: [1], known: true },
        v4: { example: 'k7 RD Part A', usedIn: [3], known: true }, // the thing this step creates
        v5: { example: '100', usedIn: [4] }, // a plain input: not identity
      },
    };
    const partA = ['- heading "S00021"', '- row "k7 RD Part A $100.00 Edit Delete"'];
    // Part A exists; the step is asked for Part B: not done
    expect(await goalSatisfied(fakePage(partA), adding, { v1: 'S00021', v4: 'k7 RD Part B', v5: '200' })).toEqual({ satisfied: false, shown: [] });
    // asked for Part A again: done
    expect(await goalSatisfied(fakePage(partA), adding, { v1: 'S00021', v4: 'k7 RD Part A', v5: '100' })).toEqual({ satisfied: true, shown: ['Edit Delete'] });
    // the named value unbound proves nothing
    expect(await goalSatisfied(fakePage(partA), adding, { v1: 'S00021', v5: '100' })).toEqual({ satisfied: false, shown: [] });
  });

  it('needs EVERY goal text, not any', async () => {
    expect(await goalSatisfied(fakePage(CANCELLED), skill(['Cancelled', 'Refunded']), PARAMS)).toEqual({ satisfied: false, shown: [] });
  });

  it('is never satisfied without a goal', async () => {
    expect(await goalSatisfied(fakePage(CANCELLED), skill(undefined), PARAMS)).toEqual({ satisfied: false, shown: [] });
  });

  it('is never satisfied without identity — the url template alone cannot tell one order from another', async () => {
    expect(await goalSatisfied(fakePage(CANCELLED), skill(['Cancelled'], []), PARAMS)).toEqual({ satisfied: false, shown: [] });
  });

  it('refuses an unbound marker rather than reading it literally', async () => {
    // {{v3}} unfilled proves nothing about this run's record.
    expect(await goalSatisfied(fakePage(CANCELLED), skill(['Cancelled']), { v1: 'S00021' })).toEqual({ satisfied: false, shown: [] });
  });

  /**
   * ROBUSTNESS.md finding 4: a look that stopped at a cap, or could not read a
   * visible frame, is not the page. Skipping a step on it risks work that
   * never happened; running it costs one replay.
   */
  it('is not satisfied on a look that could not cover the page, even when both halves show', async () => {
    const partial = {
      url: () => 'http://127.0.0.1:8069/odoo/sales/21',
      title: async () => 'Sales order',
      evaluate: async () => documentOf(CANCELLED, [], { nodesTruncated: true }),
    } as unknown as Page;
    expect(await goalSatisfied(partial, skill(['Cancelled']), PARAMS)).toEqual({ satisfied: false, shown: [] });
  });

  it('is not satisfied when the page cannot be captured', async () => {
    const dead = { url: () => 'about:blank', title: async () => '', evaluate: async () => { throw new Error('page closed'); } } as unknown as Page;
    expect(await goalSatisfied(dead, skill(['Cancelled']), PARAMS)).toEqual({ satisfied: false, shown: [] });
  });
});
