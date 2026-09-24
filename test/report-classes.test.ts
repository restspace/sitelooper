import { describe, expect, it } from 'vitest';
import { classifyReportValue, templateValue } from '../src/execution/report.js';
import { committedSlots, expectedChangesVerdict, linesInDiff } from '../src/execution/expect.js';

/**
 * Phase B provenance, stage 1: ONE classification of a report-template value,
 * shared by both runners (execution/report.ts classifyReportValue), and the
 * commit evidence it is fed (execution/expect.ts ChangeVerdict.inDiff,
 * committedSlots). The parity cases in execution-parity.test.ts run both
 * runners over the same page; these pin the rule itself.
 */
describe('classifyReportValue', () => {
  const params = { v1: 'Bench title n2', v2: 'Widget n2', v3: 'bug', v4: '150' };
  const page = ['Widget n2', 'Labels', 'priority-high', 'http://app.test/parts'];

  it('a typed slot nothing committed and no read returned is an echo, withheld (hole 1)', () => {
    const c = classifyReportValue('{{v1}}', params, page, { typed: ['v1'], live: [] });
    expect(c).toEqual({ value: null, class: 'echo', slots: ['v1'] });
  });

  it('a typed slot is committed by a click whose own diff showed it, or observed by a read that returned it', () => {
    expect(classifyReportValue('{{v2}}', params, page, { typed: ['v2'], live: [], committed: ['v2'] })).toEqual({ value: 'Widget n2', class: 'committed', slots: [] });
    expect(classifyReportValue('{{v1}}', params, page, { typed: ['v1'], live: ['Bench title n2 — saved'] })).toEqual({ value: 'Bench title n2', class: 'committed', slots: [] });
  });

  it('the page alone does not vouch for a typed slot: the field itself shows what was typed', () => {
    expect(classifyReportValue('{{v1}}', params, ['- textbox "Title": Bench title n2', 'Bench title n2'], { typed: ['v1'], live: [] }).class).toBe('echo');
  });

  it('recorded text around a typed slot does not vouch for it either', () => {
    expect(classifyReportValue('{{v2}} saved', params, ['Widget n2 saved'], { typed: ['v2'], live: [] }).class).toBe('echo');
    expect(classifyReportValue('{{v2}} saved', params, ['Widget n2 saved'], { typed: ['v2'], live: [], committed: ['v2'] }).class).toBe('committed');
    // ...and a committed slot still needs its recorded text shown (round 53).
    expect(classifyReportValue('{{v2}} saved', params, ['Widget n2'], { typed: ['v2'], live: [], committed: ['v2'] }).class).toBe('withheld');
  });

  it('an untyped param-only slot keeps round 60’s given rule; an untyped value the page shows is observed', () => {
    expect(classifyReportValue('{{v3}}', params, page, { typed: [], live: [] })).toEqual({ value: null, class: 'given', slots: ['v3'] });
    expect(classifyReportValue('{{v2}}', params, page, { typed: [], live: [] })).toEqual({ value: 'Widget n2', class: 'observed', slots: [] });
  });

  it('templateValue with evidence is the classification’s value', () => {
    expect(templateValue('{{v1}}', params, page, { given: { typed: ['v1'], live: [] } })).toBeNull();
    expect(templateValue('{{v1}}', params, page, { given: { typed: ['v1'], live: [], committed: ['v1'] } })).toBe('Bench title n2');
    // The already-satisfied guard: nothing ran, nothing typed; the page decides.
    expect(templateValue('{{v2}}', params, page, { literal: true, given: { typed: [], live: [] } })).toBe('Widget n2');
  });
});

describe('commit evidence', () => {
  it('committedSlots takes a click’s own-diff lines, never a control’s line or a popup item, and only for a click or press', () => {
    const inDiff = ['- cell "{{v2}}"', '- textbox "Title": {{v1}}', '- option "{{v3}}"', '- heading "{{v4}} items"'];
    expect(committedSlots('click', inDiff).sort()).toEqual(['v2', 'v4']);
    expect(committedSlots('press', inDiff).sort()).toEqual(['v2', 'v4']);
    expect(committedSlots('fill', inDiff)).toEqual([]);
    expect(committedSlots('click', undefined)).toEqual([]);
  });

  it('linesInDiff keeps only the recorded lines this run’s diff added, filled', () => {
    const recorded = ['- cell "{{v2}}"', '- heading "Draft note text"', '- status "Saving…"'];
    const added = ['- row "Widget n2"', '- cell "Widget n2"', '- status "Saving…"'];
    expect(linesInDiff(recorded, { v2: 'Widget n2' }, added)).toEqual(['- cell "{{v2}}"']);
  });

  it('the verdict carries inDiff: a line already on the page before the click is not in it (hole 3)', async () => {
    const live = async () => ({ lines: ['- heading "Draft note text"'], complete: true });
    const ctx = { tag: '3', tool: 'click', positionalResolution: false };
    const before = await expectedChangesVerdict(['- heading "Draft note text"'], {}, ctx, { added: [], live });
    expect(before.stop).toBeUndefined();
    expect(before.inDiff).toBeUndefined();
    const added = await expectedChangesVerdict(['- heading "Draft note text"'], {}, ctx, { added: ['- heading "Draft note text"'], live });
    expect(added.inDiff).toEqual(['- heading "Draft note text"']);
    // No diff captured: no inDiff, whatever the live page shows.
    const lost = await expectedChangesVerdict(['- heading "Draft note text"'], {}, ctx, { added: null, live });
    expect(lost.inDiff).toBeUndefined();
  });
});
