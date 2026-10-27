import { afterEach, describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { expectedChangesVerdict, openerPopupLines, openerWorkLines, preexistingLines, type ChangeObservation } from '../src/execution/expect.js';
import { goalNamesRunValue, goalSkipShadow, heldAtStart, inEffectShadow, preexistingShadow, runIdsOf, runSlotsOf, segmentStart, type SegmentStart } from '../src/execution/delta.js';
import { segmentStartDialect } from '../src/execution/toggle.js';
import { documentOf, isObserveArg } from './fixture/observation.js';

/**
 * The delta shadow rule (execution/delta.ts): a replayed step's success counts
 * only if part of its recorded effect was produced during this run. Warn-only:
 * these tests pin what is REPORTED, and that the verdicts are untouched.
 */

afterEach(() => {
  delete process.env.SITELOOPER_SHADOW;
});

const ctx = { tag: '4', tool: 'press', positionalResolution: false };
const observed = (o: { added: string[] | null; live: string[]; before?: string[] | null }): ChangeObservation => ({
  added: o.added,
  live: async () => ({ lines: o.live, complete: true }),
  ...(o.before !== undefined ? { before: o.before } : {}),
});

describe('rule 1: a recorded change accepted from the live page that was there before the step', () => {
  // fwgt3: the Escape step's `- combobox "Labels"` was on the page before the
  // press; the labels picker never opened and nothing was committed.
  const recorded = ['- combobox "Labels"'];

  it('reports the lines the before look already showed, and passes the step exactly as before', async () => {
    const v = await expectedChangesVerdict(recorded, {}, ctx, observed({ added: [], live: ['- combobox "Labels"', '- button "Save"'], before: ['- combobox "Labels"'] }));
    expect(v.stop).toBeUndefined();
    expect(v.warnings.some((w) => /found on the page instead/.test(w))).toBe(true);
    expect(v.preexisting).toEqual(['- combobox "Labels"']);
    expect(preexistingShadow('4', v.preexisting)).toBe(
      '[shadow:delta] step 4: its recorded page change "- combobox \\"Labels\\"" was accepted from the live page, but it was already on the page before the step — this run did not produce it',
    );
  });

  it('says nothing of a line that arrived late — in neither the before look nor the diff', async () => {
    const v = await expectedChangesVerdict(recorded, {}, ctx, observed({ added: [], live: ['- combobox "Labels"'], before: ['- button "Save"'] }));
    expect(v.stop).toBeUndefined();
    expect(v.preexisting).toBeUndefined();
  });

  it('says nothing without a before look', async () => {
    for (const before of [null, undefined]) {
      const v = await expectedChangesVerdict(recorded, {}, ctx, observed({ added: [], live: ['- combobox "Labels"'], before }));
      expect(v.stop).toBeUndefined();
      expect(v.preexisting).toBeUndefined();
    }
  });

  it('says nothing when the diff added the change', async () => {
    const v = await expectedChangesVerdict(recorded, {}, ctx, observed({ added: ['- combobox "Labels"'], live: ['- combobox "Labels"'], before: ['- combobox "Labels"'] }));
    expect(v.confirmed).toBe(true);
    expect(v.preexisting).toBeUndefined();
  });

  it('judges the hard (slotted) group the same way, filled', async () => {
    const v = await expectedChangesVerdict(['- heading "{{v1}}"'], { v1: 'Order 7' }, ctx, observed({ added: [], live: ['- heading "Order 7"'], before: ['- heading "Order 7"'] }));
    expect(v.stop).toBeUndefined();
    expect(v.preexisting).toEqual(['- heading "Order 7"']);
  });

  it('is no finding when one of the lines the page showed arrived late', () => {
    expect(preexistingLines(['- a "x"', '- b "y"'], ['- a "x"', '- b "y"'], ['- a "x"'])).toEqual([]);
    expect(preexistingLines(['- a "x"', '- b "y"'], ['- a "x"'], ['- a "x"', '- b "y"'])).toEqual(['- a "x"']);
  });

  it('is silent when shadow rules are off', () => {
    process.env.SITELOOPER_SHADOW = 'off';
    expect(preexistingShadow('4', ['- combobox "Labels"'])).toBeNull();
  });
});

describe('rule 2: an in-effect skip whose evidence already held as the segment started', () => {
  const pageShowing = (lines: string[]) =>
    ({
      url: () => 'http://app.test/',
      evaluate: async (_fn: unknown, arg?: unknown) => (isObserveArg(arg) ? documentOf(lines, [], {}) : undefined),
    }) as unknown as Page;

  // odoo fwod98 06-open step 9: the company menu is on every page.
  const added = ['- menu "7 3 YourCompany"', '- button "Set to Quotation"'];
  const opener = { tool: 'click', locators: { target: [] }, expect: { addedContains: added, lineDialect: 2 } };
  const evidence = { shown: { any: openerPopupLines(added), all: openerWorkLines(added) } };

  it('looks at the start in the dialect of the first step that can skip, and not at all without one', () => {
    expect(segmentStartDialect([{ tool: 'fill', locators: {} }, opener])).toBe(2);
    expect(segmentStartDialect([{ tool: 'loop', locators: {}, body: [{ ...opener, expect: { addedContains: added } }] }])).toBe(1);
    expect(segmentStartDialect([{ tool: 'click', locators: {}, expect: { addedContains: ['- button "Save"'] } }])).toBeNull();
    // a dismissal, and a hide
    expect(segmentStartDialect([{ tool: 'click', locators: {}, expect: { removedContains: ['- dialog "Welcome"', '- button "Close"'] } }])).toBe(1);
    expect(segmentStartDialect([{ tool: 'click', locators: {}, expect: { removedContains: ['- searchbox "Filter"'] } }])).toBe(1);
  });

  it('reports an opener skip whose popup and work showed at the start', async () => {
    const start = await segmentStart(pageShowing(['- menu "7 3 YourCompany"', '- button "Set to Quotation"']), 2);
    expect(start).not.toBeNull();
    expect(heldAtStart(start, 2, evidence)).toBe(true);
    const finding = inEffectShadow(start, 2, '9', 'a popup opener', evidence);
    expect(finding).toMatch(/^\[shadow:delta\] step 9: skipped as already in effect \(a popup opener\), on evidence \("- menu \\"7 3 YourCompany\\"" and 1 more\) already showing when this segment started/);
  });

  it('says nothing when this segment produced the evidence (absent at the start)', async () => {
    const start = await segmentStart(pageShowing(['- menu "7 3 YourCompany"', '- button "Cancel"']), 2);
    expect(inEffectShadow(start, 2, '9', 'a popup opener', evidence)).toBeNull();
    // a popup an earlier step of the segment opened
    const shut = await segmentStart(pageShowing(['- button "New"']), 2);
    expect(inEffectShadow(shut, 2, '3', 'a popup opener', { shown: { any: ['- menu "Actions"'], all: [] } })).toBeNull();
  });

  it('says nothing without a start look, or for a step in another dialect', async () => {
    expect(inEffectShadow(null, 2, '9', 'a popup opener', evidence)).toBeNull();
    const start = await segmentStart(pageShowing(added), 2);
    expect(inEffectShadow(start, 1, '9', 'a popup opener', evidence)).toBeNull();
    expect(await segmentStart(pageShowing(added), null)).toBeNull();
  });

  it('holds an absence only on a start look that covered the page', () => {
    const start = (complete: boolean): SegmentStart => ({ dialect: 1, live: { lines: ['- button "Add"'], complete } });
    expect(heldAtStart(start(true), 1, { absent: ['- searchbox "Filter"'] })).toBe(true);
    expect(heldAtStart(start(false), 1, { absent: ['- searchbox "Filter"'] })).toBe(false);
    expect(heldAtStart(start(true), 1, { absent: ['- button "Add"'] })).toBe(false);
  });

  it('reads a dismissal through the shared dismissalAlreadyInEffect', () => {
    const step = { locators: { target: [{ kind: 'role', name: 'Close' }] }, expect: { removedContains: ['- dialog "Welcome"', '- button "Close"'] } };
    const start: SegmentStart = { dialect: 1, live: { lines: ['- button "Create"'], complete: true } };
    expect(inEffectShadow(start, 1, '1', 'a dismissal of a dialog not open', { dismissed: { step, params: {} } })).toMatch(/already absent when this segment started/);
    const open: SegmentStart = { dialect: 1, live: { lines: ['- dialog "Welcome"', '- button "Close"'], complete: true } };
    expect(inEffectShadow(open, 1, '1', 'a dismissal of a dialog not open', { dismissed: { step, params: {} } })).toBeNull();
  });

  it('takes no look when shadow rules are off', async () => {
    process.env.SITELOOPER_SHADOW = 'off';
    expect(await segmentStart(pageShowing(added), 2)).toBeNull();
  });
});

describe('rule 3: an "already satisfied" skip on goal text that names no value of this run', () => {
  // grafana fwgr50: the previous step's toast; odoo fwod74: a product code
  // the previous step showed. Both goals are literals.
  const params = { v1: 'S00021', v2: 'fwod74-n2 Bench Customer', v3: 'fwod74-n2' };
  const known = { v1: { known: true }, v2: { known: true }, v3: { known: true, binding: 'var:runid' }, v7: {} };

  it('reports a literal goal', () => {
    const slots = runSlotsOf(known);
    expect(slots).toEqual(['v1', 'v2', 'v3']);
    expect(goalNamesRunValue(['FURN_6666'], params, slots, runIdsOf(params, known))).toBe(false);
    expect(goalSkipShadow('05-open', ['Dashboard saved'], params, slots)).toBe(
      '[shadow:delta] step 05-open: skipped as already satisfied on goal text "Dashboard saved", which names no value of this run — it may have been on the page before the run',
    );
  });

  it('says nothing of a goal naming a known slot, bound', () => {
    const slots = runSlotsOf(known);
    expect(goalSkipShadow('06-open', ['{{v1}} Cancelled'], params, slots)).toBeNull();
    // a slot nobody vouched for is not this run's
    expect(goalSkipShadow('06-open', ['{{v7}}'], { ...params, v7: 'Acoustic' }, slots)).not.toBeNull();
    // nor one bound to nothing
    expect(goalSkipShadow('06-open', ['{{v1}}'], { ...params, v1: '' }, slots)).not.toBeNull();
  });

  it('says nothing of a goal whose text carries the run id', () => {
    expect(runIdsOf(params, known)).toEqual(['fwod74-n2']);
    expect(goalSkipShadow('06-open', ['Notes for fwod74-n2'], params, [], ['fwod74-n2'])).toBeNull();
  });

  it('is silent when shadow rules are off', () => {
    process.env.SITELOOPER_SHADOW = 'off';
    expect(goalSkipShadow('05-open', ['Dashboard saved'], params, [])).toBeNull();
  });
});
