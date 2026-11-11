/**
 * The shape rules of a declared fix-up (src/execution/fixup.ts): which steps a
 * guard guards, and when a fix-up is well formed enough to be run
 * conditionally. Both runners and compile ask these.
 */
import { describe, expect, it } from 'vitest';
import { fixupApplies, fixupSkipped, guardedRun, malformedFixups, wellFormedFixup, type FixupStep } from '../src/execution/fixup.js';

const plain: FixupStep = {};
const guard = (id: string): FixupStep => ({ guard: { id, reason: 'a duplicate row' } });
const guarded = (id: string, end = false): FixupStep => ({ guarded: id, ...(end ? { guardEnd: true as const } : {}) });

describe('guardedRun', () => {
  it('counts the unbroken run of steps after the guard that carry its id', () => {
    expect(guardedRun([plain, guard('g1'), guarded('g1'), guarded('g1', true), plain], 1)).toBe(2);
    expect(guardedRun([guard('g1'), guarded('g1', true), plain, guarded('g1')], 0)).toBe(1);
    expect(guardedRun([guard('g1'), guarded('g2')], 0)).toBe(0);
    expect(guardedRun([guard('g1')], 0)).toBe(0);
  });
  it('is 0 for a step that is no guard, or no step at all', () => {
    expect(guardedRun([plain, guarded('g1')], 0)).toBe(0);
    expect(guardedRun([], 3)).toBe(0);
  });
});

describe('wellFormedFixup', () => {
  it('a guard, then its steps, the last one closing it', () => {
    // erpnext fwen10-fr as it should have been recorded: the check, then tick, Delete, Save.
    const steps = [guard('g1'), guarded('g1'), guarded('g1'), guarded('g1', true), plain];
    expect(wellFormedFixup(steps, 0)).toBe(true);
    expect(malformedFixups(steps)).toEqual([]);
  });
  it('a single guarded step that closes it', () => {
    expect(wellFormedFixup([plain, guard('g1'), guarded('g1', true)], 1)).toBe(true);
  });
  it('never closed: the instruction ended before the condition turned false', () => {
    const steps = [guard('g1'), guarded('g1'), guarded('g1')];
    expect(wellFormedFixup(steps, 0)).toBe(false);
    expect(malformedFixups(steps)).toEqual(['g1']);
  });
  it('a guard with nothing guarded', () => {
    expect(wellFormedFixup([guard('g1'), plain], 0)).toBe(false);
    expect(wellFormedFixup([guard('g1')], 0)).toBe(false);
  });
  it('closed before its last step, or twice', () => {
    expect(wellFormedFixup([guard('g1'), guarded('g1', true), guarded('g1')], 0)).toBe(false);
    expect(wellFormedFixup([guard('g1'), guarded('g1', true), guarded('g1', true)], 0)).toBe(false);
  });
  it('split: a step of the group stands apart from it', () => {
    const steps = [guard('g1'), guarded('g1', true), plain, guarded('g1')];
    expect(wellFormedFixup(steps, 0)).toBe(false);
    expect(malformedFixups(steps)).toEqual(['g1']);
  });
  it('a guarded step with no guard in the list (its guard was cut away)', () => {
    expect(malformedFixups([plain, guarded('g1'), guarded('g1', true)])).toEqual(['g1']);
  });
  it('fix-ups do not nest, and a guard is not itself guarded', () => {
    expect(wellFormedFixup([guard('g1'), { ...guard('g2'), guarded: 'g1' }, guarded('g1', true)], 0)).toBe(false);
    expect(wellFormedFixup([{ ...guard('g1'), guarded: 'g0' }, guarded('g1', true)], 0)).toBe(false);
  });
  it('two fix-ups in one list are judged apart', () => {
    const steps = [guard('g1'), guarded('g1', true), plain, guard('g2'), guarded('g2')];
    expect(wellFormedFixup(steps, 0)).toBe(true);
    expect(wellFormedFixup(steps, 3)).toBe(false);
    expect(malformedFixups(steps)).toEqual(['g2']);
  });
  it('the same id declared twice is neither', () => {
    const steps = [guard('g1'), guarded('g1', true), guard('g1'), guarded('g1', true)];
    expect(wellFormedFixup(steps, 0)).toBe(false);
    expect(malformedFixups(steps)).toEqual(['g1']);
  });
});

describe('the lines both runners log', () => {
  it('say where, why, and how many steps were skipped', () => {
    expect(fixupApplies('step 3', 'Bench Widget appears twice')).toBe('step 3: fix-up applies — Bench Widget appears twice');
    expect(fixupSkipped('05-verify s_6f4cbd/1', 'Bench Widget appears twice', 3)).toBe(
      '05-verify s_6f4cbd/1: fix-up not needed, 3 step(s) skipped — its condition does not hold this time (Bench Widget appears twice)',
    );
  });
});
