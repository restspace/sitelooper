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

/** A page that shows exactly these signature lines. */
function fakePage(lines: string[]): Page {
  return {
    url: () => 'http://127.0.0.1:8069/odoo/sales/21',
    title: async () => 'Sales order',
    evaluate: async () => ({ lines, alerts: [] }),
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

  it('is not satisfied when the page cannot be captured', async () => {
    const dead = { url: () => 'about:blank', title: async () => '', evaluate: async () => { throw new Error('page closed'); } } as unknown as Page;
    expect(await goalSatisfied(dead, skill(['Cancelled']), PARAMS)).toEqual({ satisfied: false, shown: [] });
  });
});
