/**
 * The content-expectation verdict both runners share (src/execution/expect.ts)
 * and the snapshot dialect it reads (src/execution/snapshot.ts), tested as
 * pure functions over observations — no browser. The browser half, both
 * runners against one application, is in execution-parity.test.ts
 * ("content expectations").
 */
import { describe, expect, it } from 'vitest';
import {
  TRANSIENT_LINE,
  consequentialExpectations,
  expectedChangesVerdict,
  identifiesNothing,
  isEchoLine,
  liveLines,
  maskForeignValue,
  maskMinted,
  maskPopupItem,
  namesDialogControl,
  popupItem,
  unfilledSlot,
  type ChangeObservation,
} from '../src/execution/expect.js';
import { addedLines, isInteractiveLine, lineShows } from '../src/execution/snapshot.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';
import type { SkillStep } from '../src/skills/store.js';

const ctx = (over: Partial<{ tag: string; tool: string; value?: string; positionalResolution: boolean }> = {}) => ({
  tag: '3',
  tool: 'click',
  positionalResolution: false,
  ...over,
});

/** An observation: what the diff holds, and what a fresh look at the page shows. */
const seen = (added: string[] | null, live: string[] | null): ChangeObservation => ({ added, live: async () => (live === null ? null : { lines: live, complete: true }) });

describe('expectedChangesVerdict', () => {
  it('passes with nothing to say when the step recorded no lines, or only transient ones', async () => {
    expect(await expectedChangesVerdict(undefined, {}, ctx(), seen(null, null))).toEqual({ warnings: [] });
    expect(await expectedChangesVerdict([], {}, ctx(), seen([], []))).toEqual({ warnings: [] });
    expect(await expectedChangesVerdict(['- status "Loading…"', '- progressbar ""'], {}, ctx(), seen([], []))).toEqual({ warnings: [] });
  });

  /**
   * The false-success shape this verdict exists to close on the emitted side:
   * a slot in the VALUE after the colon. The control is on the page, visible
   * and named as recorded — and holds the wrong value.
   */
  it('fails a hard line whose slot sits in the value when only the name is present, and passes when the value is', async () => {
    const recorded = ['- combobox "Project": {{v1}}'];
    const p = { v1: 'Beta' };
    const wrongValue = await expectedChangesVerdict(recorded, p, ctx({ tool: 'select' }), seen([], ['- combobox "Project": Alpha']));
    expect(wrongValue.stop).toBe('after step 3 the page did not show "- combobox \\"Project\\": Beta" as it did when recorded — the step ran but probably acted on the wrong element');
    // the name alone, no value at all, is not the line either
    const nameOnly = await expectedChangesVerdict(recorded, p, ctx({ tool: 'select' }), seen([], ['- combobox "Project"']));
    expect(nameOnly.stop).toMatch(/did not show/);
    // in the diff
    expect(await expectedChangesVerdict(recorded, p, ctx({ tool: 'select' }), seen(['- combobox "Project": Beta'], []))).toEqual({ warnings: [], confirmed: true });
    // or on the live page, when the diff missed it (filling a field with the value it already held)
    expect(await expectedChangesVerdict(recorded, p, ctx({ tool: 'select' }), seen([], ['- combobox "Project": Beta']))).toEqual({ warnings: [] });
    // whitespace-insensitive, as lineShows is
    expect(await expectedChangesVerdict(recorded, p, ctx({ tool: 'select' }), seen([], ['-   combobox   "Project":   Beta']))).toEqual({ warnings: [] });
  });

  it('hard lines are any-of, and a hard miss stops even when the plain group shows', async () => {
    const recorded = ['- heading "{{v1}}"', '- link "{{v1}} details"', '- button "Save"'];
    const p = { v1: 'Widget A' };
    expect((await expectedChangesVerdict(recorded, p, ctx(), seen(['- link "Widget A details"', '- button "Save"'], []))).stop).toBeUndefined();
    const miss = await expectedChangesVerdict(recorded, p, ctx(), seen(['- button "Save"'], ['- button "Save"']));
    expect(miss.stop).toContain('did not show "- heading \\"Widget A\\"" / "- link \\"Widget A details\\""');
  });

  it('checks the plain group in the diff, then on the live page with a warning, and stops when it is nowhere', async () => {
    const recorded = ['- heading "Saved"', '- button "Undo"'];
    expect(await expectedChangesVerdict(recorded, {}, ctx(), seen(['- button "Undo"'], []))).toEqual({ warnings: [], confirmed: true });
    const onPage = await expectedChangesVerdict(recorded, {}, ctx(), seen([], ['- heading "Saved"']));
    expect(onPage.stop).toBeUndefined();
    expect(onPage.warnings).toEqual(['step 3: none of the 2 expected page change(s) appeared in the step diff (found on the page instead)']);
    const nowhere = await expectedChangesVerdict(recorded, {}, ctx(), seen([], ['- heading "Other"']));
    expect(nowhere.stop).toBe('after step 3 none of the 2 recorded page change(s) appeared (e.g. "- heading \\"Saved\\"") — the step ran but did not have its recorded effect');
    expect(nowhere.absentDialog).toBeUndefined();
  });

  it('a {{dN}} derived marker is filled but stays plain', async () => {
    const derived = await expectedChangesVerdict(['- heading "Order {{d1}}"'], { d1: '42' }, ctx(), seen([], ['- heading "Order 43"']));
    // plain group, nowhere: a stop with the plain wording, not the hard one
    expect(derived.stop).toContain('none of the 1 recorded page change(s) appeared (e.g. "- heading \\"Order 42\\"")');
    expect((await expectedChangesVerdict(['- heading "Order {{d1}}"'], { d1: '42' }, ctx(), seen(['- heading "Order 42"'], []))).stop).toBeUndefined();
  });

  /**
   * fwod49-n2: the flow could not resolve `02-open.product_name`, the step ran
   * with that marker as the param's value, and the gate searched the page for
   * the literal text "{{02-open.product_name}}" — which no page has ever shown.
   * Every replay of s_78eaaf and s_32409f stopped there and both were demoted
   * for a step that had done exactly what it was recorded doing.
   */
  it('drops a line this run could not fill, with a warning, and never stops on one', async () => {
    // an unresolved reference arriving AS the param's value
    const unresolved = await expectedChangesVerdict(['- option "{{v4}}"'], { v4: '{{02-open.product_name}}' }, ctx(), seen(['- option "Acoustic Bloc Screens"'], ['- option "Acoustic Bloc Screens"']));
    expect(unresolved.stop).toBeUndefined();
    expect(unresolved.warnings).toEqual(['step 3: 1 recorded page change(s) carry a value this run could not fill (e.g. "- option \\"{{02-open.product_name}}\\"") — not checked']);
    // a slot the caller never bound at all
    const unbound = await expectedChangesVerdict(['- heading "{{v9}}"'], {}, ctx(), seen(['- heading "anything"'], ['- heading "anything"']));
    expect(unbound.stop).toBeUndefined();
    expect(unbound.warnings[0]).toContain('could not fill');
    // a slot bound to '' — the artifact's spelling of an unpublished reference
    // (fwod67 04-open: `- row "20% £ {{v9}}"` filled to `- row "20% £ "` and was
    // searched for; the daemon, with v9 absent, had dropped it)
    const nothing = await expectedChangesVerdict(['- row "20% £ {{v9}}"'], { v9: '' }, ctx(), seen(['- row "20% £ 885.00"'], ['- row "20% £ 885.00"']));
    expect(nothing.stop).toBeUndefined();
    expect(nothing.warnings).toEqual(['step 3: 1 recorded page change(s) carry a value this run could not fill (e.g. "- row \\"20% £ {{v9}}\\"") — not checked']);
    // a derived marker bound to '' the same; a bound one is still judged
    expect((await expectedChangesVerdict(['- heading "Order {{d1}}"'], { d1: '' }, ctx(), seen([], ['- heading "Order 43"']))).stop).toBeUndefined();
    expect((await expectedChangesVerdict(['- heading "Order {{d1}}"'], { d1: '42' }, ctx(), seen([], ['- heading "Order 43"']))).stop).toBeDefined();
    // the {{*}} wildcard is not an unfilled slot: it is still matched, and still judged
    const wildcard = await expectedChangesVerdict(['- combobox "Project": {{*}}'], {}, ctx(), seen([], ['- combobox "Other": x']));
    expect(wildcard.stop).toMatch(/none of the 1 recorded page change\(s\) appeared/);
    // the fillable lines of the same step are still judged
    const mixed = await expectedChangesVerdict(['- heading "{{v1}}"', '- option "{{v4}}"'], { v1: 'Widget A', v4: '{{02-open.product_name}}' }, ctx(), seen([], ['- heading "Widget B"']));
    expect(mixed.stop).toMatch(/did not show "- heading \\"Widget A\\""/);
    expect(mixed.warnings[0]).toContain('could not fill');
  });

  /**
   * fwod49-n2 02-open: a `type` of one character recorded the autocomplete's
   * whole option list as its effect, `- option "{{v4}}"` among it. The list is
   * whatever the catalogue answers with now; only the popup's OPENING is the
   * step's doing.
   */
  it('never treats an item inside an open popup as hard evidence', async () => {
    const recorded = ['- menu ""', '- option "{{v1}}"'];
    const p = { v1: 'Cabinet with Doors' };
    // the option is absent and the menu opened: the plain group holds, no stop
    const opened = await expectedChangesVerdict(recorded, p, ctx({ tool: 'type' }), seen(['- menu ""'], []));
    expect(opened.stop).toBeUndefined();
    // neither line anywhere: the plain wording, never "acted on the wrong element"
    const nothing = await expectedChangesVerdict(recorded, p, ctx({ tool: 'type' }), seen([], ['- button "Save"']));
    expect(nothing.stop).toMatch(/none of the 2 recorded page change\(s\) appeared/);
    // the container itself is unaffected — a named dialog is still hard
    const dialog = await expectedChangesVerdict(['- dialog "Edit {{v1}}"'], p, ctx(), seen([], ['- dialog "Edit Other"']));
    expect(dialog.stop).toMatch(/did not show "- dialog \\"Edit Cabinet with Doors\\""/);
  });

  it('masks the recording\'s clock tokens and minted values at run time, so an older store still matches', async () => {
    // a store compiled before masking existed carries the recording's own minute and its own record id
    const recorded = ['- textbox "09/03/2026 07:22": {{v3}}', '- combobox "Project {{v2}}": 13f9pv52yozr'];
    const p = { v2: 'Bench', v3: '12/31/2026' };
    const live = ['- textbox "09/12/2026 11:05": 12/31/2026', '- combobox "Project Bench": zz91kk'];
    expect(await expectedChangesVerdict(recorded, p, ctx(), seen([], live))).toEqual({ warnings: [] });
  });

  it('applies the echo filter only to a positional resolution with a value, as replay does', async () => {
    const recorded = ['- textbox "": {{v1}}', '- heading "{{v1}}"'];
    const p = { v1: 'My Title' };
    const echoOnly = seen(['- textbox "": My Title'], ['- textbox "": My Title']);
    // positional: the echo is what the wrong textbox produces too — only the heading counts, and it is absent
    const positional = await expectedChangesVerdict(recorded, p, ctx({ tool: 'fill', value: 'My Title', positionalResolution: true }), echoOnly);
    expect(positional.stop).toBe('after step 3 the page did not show "- heading \\"My Title\\"" as it did when recorded — the step ran but probably acted on the wrong element');
    // named: the echo is evidence
    expect(await expectedChangesVerdict(recorded, p, ctx({ tool: 'fill', value: 'My Title', positionalResolution: false }), echoOnly)).toEqual({ warnings: [], confirmed: true });
    // positional but no value (a click that resolved by position): nothing to filter by
    expect(await expectedChangesVerdict(recorded, p, ctx({ positionalResolution: true }), echoOnly)).toEqual({ warnings: [], confirmed: true });
    // positional with only the echo recorded: the old gate stands, and it says so
    const lone = await expectedChangesVerdict(['- textbox "": {{v1}}'], p, ctx({ tool: 'fill', value: 'My Title', positionalResolution: true }), echoOnly);
    expect(lone.stop).toBeUndefined();
    expect(lone.warnings).toEqual(["step 3: resolved positionally and its only recorded effect is the fill's own echo — the effect gate cannot tell right element from wrong here"]);
    // ...and an echo that cannot tell right element from wrong confirms nothing
    // (an unrecorded alert on this step still stops it: gates.ts alertVerdict)
    expect(lone.confirmed).toBeUndefined();
  });

  it('confirms the step only when every recorded group was found in what the action added', async () => {
    const recorded = ['- heading "{{v1}}"', '- button "Undo"'];
    const p = { v1: 'Widget A' };
    // both groups in the diff
    expect((await expectedChangesVerdict(recorded, p, ctx(), seen(['- heading "Widget A"', '- button "Undo"'], []))).confirmed).toBe(true);
    // the plain group only on the live page — it may simply have been there already
    expect((await expectedChangesVerdict(recorded, p, ctx(), seen(['- heading "Widget A"'], ['- button "Undo"']))).confirmed).toBeUndefined();
    // a failed capture: no diff to have found anything in
    expect((await expectedChangesVerdict(recorded, p, ctx(), seen(null, ['- heading "Widget A"', '- button "Undo"']))).confirmed).toBeUndefined();
    // nothing recorded, or only transient lines: nothing to confirm by
    expect((await expectedChangesVerdict(['- status "Loading…"'], {}, ctx(), seen(['- status "Loading…"'], []))).confirmed).toBeUndefined();
  });

  it('treats a recorded dialog that did not open as conditional UI, carrying its subtree for the skip rule', async () => {
    const recorded = ['- dialog "Discard changes?"', '- button "Discard"', '- button "Cancel"'];
    const absent = await expectedChangesVerdict(recorded, {}, ctx({ tag: '5' }), seen([], ['- button "Exit"']));
    expect(absent.stop).toBeUndefined();
    expect(absent.absentDialog).toEqual({ name: 'Discard changes?', lines: recorded });
    expect(absent.warnings).toEqual(['step 5: the recorded dialog "Discard changes?" did not open — conditional UI, treated as absent; steps that name one of its controls will be skipped']);
    // it opened: an ordinary pass
    expect(await expectedChangesVerdict(recorded, {}, ctx(), seen(['- dialog "Discard changes?"', '- button "Discard"'], []))).toEqual({ warnings: [], confirmed: true });
    // only a PLAIN dialog line is conditional UI: one carrying this run's value is hard, and its absence stops
    const hard = await expectedChangesVerdict(['- dialog "Edit {{v1}}"'], { v1: 'Widget A' }, ctx(), seen([], []));
    expect(hard.stop).toMatch(/did not show "- dialog \\"Edit Widget A\\""/);
    expect(hard.absentDialog).toBeUndefined();
    // and only with a leading dash: the verdict's own shape, as replay has it
    const undashed = await expectedChangesVerdict(['dialog "Options"'], {}, ctx(), seen([], []));
    expect(undashed.stop).toMatch(/none of the 1 recorded page change/);
    expect(undashed.absentDialog).toBeUndefined();
  });

  it('a failed capture is unobserved, never a pass: the live page decides, and a dialog\'s absence cannot be assumed from it', async () => {
    const live = ['- heading "Saved"'];
    const plainOnPage = await expectedChangesVerdict(['- heading "Saved"'], {}, ctx(), seen(null, live));
    expect(plainOnPage.stop).toBeUndefined();
    expect(plainOnPage.unobserved).toBe(true);
    expect(plainOnPage.warnings).toEqual([
      'step 3: the page could not be captured after the action — its recorded effects were checked against the live page instead',
      'step 3: none of the 1 expected page change(s) appeared in the step diff (found on the page instead)',
    ]);
    const hardOnPage = await expectedChangesVerdict(['- heading "{{v1}}"'], { v1: 'Saved' }, ctx(), seen(null, live));
    expect(hardOnPage).toEqual({ warnings: ['step 3: the page could not be captured after the action — its recorded effects were checked against the live page instead'], unobserved: true });
    // a hard line the live page does not show still stops
    expect((await expectedChangesVerdict(['- heading "{{v1}}"'], { v1: 'Other' }, ctx(), seen(null, live))).stop).toMatch(/did not show/);
    // the live page cannot be read either: nothing proves the effect
    expect((await expectedChangesVerdict(['- heading "{{v1}}"'], { v1: 'Saved' }, ctx(), seen(null, null))).stop).toMatch(/did not show/);
    // the dialog branch needs a real observation
    const dialog = await expectedChangesVerdict(['- dialog "Discard changes?"'], {}, ctx(), seen(null, []));
    expect(dialog.stop).toBe('after step 3 the page could not be captured, so whether the dialog "Discard changes?" opened is unknown — its absence cannot be assumed');
    expect(dialog.unobserved).toBe(true);
    expect(dialog.absentDialog).toBeUndefined();
  });

  /**
   * ROBUSTNESS.md finding 4. A live look that could not cover the page (a cap
   * reached, a visible frame unread, a virtualised list) has not shown a line
   * ABSENT. The stop stands — nothing established the effect — but it is
   * marked unobserved and says why; and the conditional branch that reads
   * absence as "the dialog did not open" is never taken on such a look.
   */
  it('keeps the stop on a look that could not cover the page, marks it unobserved, and never takes the absent-dialog branch on it', async () => {
    const partial = (lines: string[]): ChangeObservation => ({
      added: [],
      live: async () => ({ lines, complete: false, coverage: { nodesWalked: 4000, nodeCap: 4000, nodesTruncated: false, linesTruncated: true, alertsTruncated: false, shadowRootsWalked: 0, frames: { observed: 0, hidden: 0, overCap: 0, inaccessible: [] }, collections: { partial: false, evidence: [] } } }),
    });
    const hard = await expectedChangesVerdict(['- heading "{{v1}}"'], { v1: 'Widget A' }, ctx(), partial([]));
    expect(hard.unobserved).toBe(true);
    expect(hard.stop).toBe('after step 3 the page did not show "- heading \\"Widget A\\"" as it did when recorded, and that could not be confirmed: capture incomplete (the line cap was reached) — the step ran but its effect was not established');
    const plain = await expectedChangesVerdict(['- heading "Saved"'], {}, ctx(), partial([]));
    expect(plain.unobserved).toBe(true);
    expect(plain.stop).toMatch(/^after step 3 none of the 1 recorded page change\(s\) appeared \(e\.g\. "- heading \\"Saved\\""\), and that could not be confirmed: capture incomplete \(the line cap was reached\)/);
    const dialog = await expectedChangesVerdict(['- dialog "Discard changes?"'], {}, ctx(), partial([]));
    expect(dialog.absentDialog).toBeUndefined();
    expect(dialog.unobserved).toBe(true);
    expect(dialog.stop).toBe('after step 3 the recorded dialog "Discard changes?" was not seen, but the page could not be observed in full (the line cap was reached) — its absence cannot be assumed');
    // a live page that could not be read at all is the same: never [] for "unavailable"
    const unreadable = await expectedChangesVerdict(['- dialog "Discard changes?"'], {}, ctx(), { added: [], live: async () => null });
    expect(unreadable.absentDialog).toBeUndefined();
    expect(unreadable.stop).toMatch(/could not be observed in full \(the page could not be read\)/);
    // what an incomplete look DOES show is still evidence: no stop, nothing unobserved
    expect(await expectedChangesVerdict(['- heading "Saved"'], {}, ctx(), partial(['- heading "Saved"']))).toEqual({
      warnings: ['step 3: none of the 1 expected page change(s) appeared in the step diff (found on the page instead)'],
    });
  });

  it('skips a line that identifies no element, so a stale store stops failing on it (fwod47-n3 04-open)', async () => {
    // the stored shape: an unnamed textbox whose slot filled to "null", beside wildcarded unnamed ones
    const recorded = ['- textbox "": {{*}}', '- textbox "": {{v5}}'];
    expect(await expectedChangesVerdict(recorded, { v5: 'null' }, ctx(), seen([], []))).toEqual({ warnings: [] });
    expect(await expectedChangesVerdict(recorded, { v5: '' }, ctx(), seen([], []))).toEqual({ warnings: [] });
    // a slot that fills to a real value still identifies, and still stops when absent
    expect((await expectedChangesVerdict(recorded, { v5: '147.00' }, ctx(), seen([], ['- textbox "": 12.00']))).stop).toMatch(/did not show "- textbox \\"\\": 147.00"/);
    // the identifying lines of a group are still judged without the unidentifying ones
    const mixed = await expectedChangesVerdict(['- row "20% £ 294.00"', '- textbox "": {{*}}'], {}, ctx(), seen([], ['- textbox "": 3']));
    expect(mixed.stop).toBe('after step 3 none of the 1 recorded page change(s) appeared (e.g. "- row \\"20% £ 294.00\\"") — the step ran but did not have its recorded effect');
  });

  it('reads the diff first: a change that landed in the diff needs no live look', async () => {
    let looked = 0;
    const obs: ChangeObservation = { added: ['- heading "Widget A"'], live: async () => { looked++; return { lines: [], complete: true }; } };
    expect(await expectedChangesVerdict(['- heading "{{v1}}"'], { v1: 'Widget A' }, ctx(), obs)).toEqual({ warnings: [], confirmed: true });
    expect(looked).toBe(0);
  });
});

describe('the rules the verdict is built from', () => {
  it('TRANSIENT_LINE names the page in transit, with or without the leading dash', () => {
    for (const line of ['- status "Loading"', 'status "Loading"', '- progressbar ""', '- alert "Error loading RSS feed"']) expect(TRANSIENT_LINE.test(line), line).toBe(true);
    for (const line of ['- heading "Status"', '- button "alert me"', '- cell "status"']) expect(TRANSIENT_LINE.test(line), line).toBe(false);
  });

  it('maskMinted wildcards the value after the colon unless it is a slot', () => {
    expect(maskMinted('- combobox "Project": 13f9pv52yozr')).toBe('- combobox "Project": {{*}}');
    expect(maskMinted('- textbox "Due" [checked]: 12/31/2026')).toBe('- textbox "Due" [checked]: {{*}}');
    expect(maskMinted('- textbox "Name": {{v1}}')).toBe('- textbox "Name": {{v1}}');
    expect(maskMinted('- heading "Panel: Title"')).toBe('- heading "Panel: Title"');
  });

  it('identifiesNothing: no name and no real value, whatever the role, except a popup container', () => {
    for (const line of ['- textbox "": {{*}}', '- textbox ""', '- textbox "": ', '- textbox "": null', '- generic ""', '- cell "{{*}}"', '- checkbox "" [checked]', '- checkbox [checked]', '- row', 'button ""']) {
      expect(identifiesNothing(line), line).toBe(true);
    }
    for (const line of ['- textbox "Name": {{*}}', '- textbox "": 147.00', '- textbox "": {{v5}}', '- row "20% £ 294.00"', '- cell "2.00', '- text: Saved', '- dialog ""', '- listbox', '- menu ""', 'not a line at all!']) {
      expect(identifiesNothing(line), line).toBe(false);
    }
  });

  it('unfilledSlot: any {{…}} left after the params are in, except the wildcard', () => {
    for (const line of ['- heading "{{v9}}"', '- option "{{02-open.product_name}}"', '- cell "{{d3}}"', '- textbox "Name": {{v1}}']) {
      expect(unfilledSlot(line), line).toBe(true);
    }
    for (const line of ['- heading "Widget A"', '- textbox "{{*}} {{*}}": 147.00', '- combobox "Project": {{*}}', '- cell "{ {v1} }"']) {
      expect(unfilledSlot(line), line).toBe(false);
    }
  });

  it('popupItem: the entries of an open menu or listbox, never its container', () => {
    for (const line of ['- option "Cabinet"', 'option "Cabinet"', '- menuitem "Delete"', '- menuitemcheckbox "Wrap" [checked]', '- menuitemradio "Left"']) {
      expect(popupItem(line), line).toBe(true);
    }
    for (const line of ['- menu ""', '- listbox "Products"', '- dialog "Discard changes?"', '- cell "Cabinet"', '- optional "x"']) {
      expect(popupItem(line), line).toBe(false);
    }
  });

  /**
   * The provenance half maskMinted leaves open: a value that IS a slot, but a
   * slot bound to another step's output. fwod49-n2 04-open recorded a dblclick
   * — which types nothing — as `- combobox "…": {{v4}}`, the product the
   * recording's own quotation happened to hold.
   */
  it('maskForeignValue wildcards an editable control\'s value unless this step put it there', () => {
    expect(maskForeignValue('- combobox "Type to find a product...": {{v4}}', [])).toBe('- combobox "Type to find a product...": {{*}}');
    expect(maskForeignValue('- combobox "Type to find a product...": {{v4}}', ['{{v4}}'])).toBe('- combobox "Type to find a product...": {{v4}}');
    expect(maskForeignValue('- textbox "Name" [required]: {{v1}}', ['{{v2}}'])).toBe('- textbox "Name" [required]: {{*}}');
    expect(maskForeignValue('- spinbutton "Qty": 5', ['5'])).toBe('- spinbutton "Qty": 5');
    // role, name and state are never touched, and a non-editable role is left alone
    expect(maskForeignValue('- cell "{{v4}}"', [])).toBe('- cell "{{v4}}"');
    expect(maskForeignValue('- row "20% £ 885.00": {{v4}}', [])).toBe('- row "20% £ 885.00": {{v4}}');
    // the wildcard is already the answer
    expect(maskForeignValue('- combobox "Project": {{*}}', [])).toBe('- combobox "Project": {{*}}');
  });

  it('maskPopupItem leaves a popup entry identifying nothing, and a container untouched', () => {
    expect(maskPopupItem('- option "{{v4}}"')).toBe('- option "{{*}}"');
    expect(identifiesNothing(maskPopupItem('- option "{{v4}}"'))).toBe(true);
    expect(maskPopupItem('- menuitem "Delete {{v1}}"')).toBe('- menuitem "Delete {{*}}"');
    expect(maskPopupItem('- option "[E-COM11] Cabinet with Doors"')).toBe('- option "[E-COM11] Cabinet with Doors"');
    expect(maskPopupItem('- menu "{{v1}}"')).toBe('- menu "{{v1}}"');
  });

  it('liveLines masks, then fills, as both runners do at run time', () => {
    expect(liveLines(['- textbox "09/03/2026 07:22": {{v1}}', '- combobox "X": abc'], { v1: 'v' })).toEqual(['- textbox "{{*}} {{*}}": v', '- combobox "X": {{*}}']);
  });

  it('isEchoLine and consequentialExpectations: a fill echoed in a same-role element is no evidence', () => {
    expect(isEchoLine('- textbox "": My Title', 'My Title')).toBe(true);
    expect(isEchoLine('- searchbox "Search": a.b*c', 'a.b*c')).toBe(true); // the value is data, not pattern
    expect(isEchoLine('- heading "My Title"', 'My Title')).toBe(false);
    expect(isEchoLine('- textbox "": My Title extra', 'My Title')).toBe(false);
    const lines = ['- heading "My Title"', '- textbox "": My Title'];
    expect(consequentialExpectations(lines, 'My Title')).toEqual(['- heading "My Title"']);
    expect(consequentialExpectations(['- textbox "": My Title'], 'My Title')).toEqual(['- textbox "": My Title']);
    expect(consequentialExpectations(lines, undefined)).toEqual(lines);
  });
});

describe('lineShows', () => {
  it('matches any want as a whitespace-normalised substring of the joined lines', () => {
    const live = ['- heading "Bench   Board"', '- textbox "Due": 2026-12-31'];
    expect(lineShows(live, ['Bench Board '])).toBe(true);
    expect(lineShows(live, ['Ready', '- textbox "Due": 2026-12-31'])).toBe(true);
    expect(lineShows(live, ['Ready'])).toBe(false);
    expect(lineShows(live, [''])).toBe(false);
    expect(lineShows([], ['x'])).toBe(false);
  });

  it('a {{*}} wildcard matches anything within ONE line', () => {
    expect(lineShows(['- textbox "09/03/2026 07:31": 2026-12-31'], ['- textbox "{{*}} {{*}}": 2026-12-31'])).toBe(true);
    expect(lineShows(['- textbox "09/03/2026 07:31": 2026-12-30'], ['- textbox "{{*}} {{*}}": 2026-12-31'])).toBe(false);
    expect(lineShows(['- a "x"', '- b "y"'], ['- a "{{*}}b "y"'])).toBe(false);
    // the rest of the line is still literal: regex metacharacters in it are data
    expect(lineShows(['- cell "(1+1)*2"'], ['- cell "({{*}})*2"'])).toBe(true);
    expect(lineShows(['- cell "x"'], ['- cell "({{*}})*2"'])).toBe(false);
  });

  it('the whole option is the identity rule: bounded at both edges', () => {
    const whole = { whole: true };
    expect(lineShows(['- cell "312"'], ['12'], whole)).toBe(false);
    expect(lineShows(['- cell "312"'], ['12'])).toBe(true);
    expect(lineShows(['- row "fwgr25-n10 Bench Customer"'], ['fwgr25-n1'], whole)).toBe(false);
    expect(lineShows(['- row "fwgr25-n1 Bench Customer"'], ['fwgr25-n1'], whole)).toBe(true);
    expect(lineShows(['- row "RD-1015"'], ['rd-1015'], whole)).toBe(true);
  });
});

describe('the snapshot dialect', () => {
  it('addedLines diffs as the recorder does: every after-line not present before, capped, null when a leg is missing', () => {
    expect(addedLines(['a', 'b'], ['b', 'c', 'a', 'd'])).toEqual(['c', 'd']);
    expect(addedLines([], [])).toEqual([]);
    expect(addedLines(null, ['a'])).toBeNull();
    expect(addedLines(['a'], null)).toBeNull();
    const many = Array.from({ length: 30 }, (_, i) => `- cell "${i}"`);
    expect(addedLines([], many)).toHaveLength(20);
  });

  it('isInteractiveLine keeps the roles a step is judged by, and any ref', () => {
    for (const line of ['- button "Save"', '- combobox "Project": Beta', '- dialog "Discard changes?"', '- generic "" [@e4]', '- cell "12"']) expect(isInteractiveLine(line), line).toBe(true);
    for (const line of ['- generic "sidebar"', '- text: Saved', '- img "logo"']) expect(isInteractiveLine(line), line).toBe(false);
  });
});

describe('namesDialogControl', () => {
  const dialog = ['- dialog "Discard changes?"', '- button "Discard"', '- textbox "Reason"', '- link "{{v1}} details"'];
  const step = (locators: SkillStep['locators']) => ({ locators } as never);

  it('proves membership against the dialog\'s own recorded subtree, by the target\'s NAME', () => {
    expect(namesDialogControl(step({ target: [{ kind: 'role', role: 'button', name: 'Discard' }] }), dialog, {})).toBe('Discard');
    expect(namesDialogControl(step({ target: [{ kind: 'label', label: 'Reason' }] }), dialog, {})).toBe('Reason');
    expect(namesDialogControl(step({ target: [{ kind: 'text', text: 'Discard' }] }), dialog, {})).toBe('Discard');
    expect(namesDialogControl(step({ target: [{ kind: 'scoped', scope: 'li', hasText: 'Discard', selector: 'button' } as never] }), dialog, {})).toBe('Discard');
    expect(namesDialogControl(step({ source: [{ kind: 'role', role: 'button', name: 'Discard' }] }), dialog, {})).toBe('Discard');
  });

  it('fills a slot in the name from the params before it looks', () => {
    expect(namesDialogControl(step({ target: [{ kind: 'role', role: 'link', name: '{{v1}} details' }] }), dialog, { v1: 'Widget A' })).toBeNull();
    expect(namesDialogControl(step({ target: [{ kind: 'role', role: 'link', name: '{{v1}} details' }] }), ['- link "Widget A details"'], { v1: 'Widget A' })).toBe('Widget A details');
  });

  it('a css, id, testid or point target says where an element was, not what it was called: never a member', () => {
    expect(namesDialogControl(step({ target: [{ kind: 'css', selector: '#discard' }] }), dialog, {})).toBeNull();
    expect(namesDialogControl(step({ target: [{ kind: 'id', selector: '#discard' }] }), dialog, {})).toBeNull();
    expect(namesDialogControl(step({ target: [{ kind: 'testid', testId: 'Discard' } as never] }), dialog, {})).toBeNull();
    expect(namesDialogControl(step({}), dialog, {})).toBeNull();
    // a name the dialog did not list, or a partial one, is not proven
    expect(namesDialogControl(step({ target: [{ kind: 'role', role: 'button', name: 'Mark' }] }), dialog, {})).toBeNull();
    expect(namesDialogControl(step({ target: [{ kind: 'role', role: 'button', name: 'Disc' }] }), dialog, {})).toBeNull();
    expect(namesDialogControl(step({ target: [{ kind: 'role', role: 'button', name: '' }] }), dialog, {})).toBeNull();
  });
});

/**
 * The emitter side, without a browser: the shape the artifact takes so that it
 * asks the same question of the same lines. The runnable checks over the
 * emitted source itself are in spec-emit.test.ts ("expectations").
 */
describe('the emitted adapter', () => {
  const ORIGIN = 'http://app.test';
  const button = (name: string) => [{ kind: 'role' as const, role: 'button', name }];
  const flowOf = (steps: SkillStep[]): SpecFlow => ({
    version: 1,
    name: 'expect-emit',
    origin: ORIGIN,
    startUrl: `${ORIGIN}/`,
    vars: [],
    steps: [{
      id: '01-step', instruction: 'exercise the gate', params: { v1: 'Beta' }, outputs: [],
      segments: [{ id: 's_emit', template: 'exercise the gate', params: { v1: { example: 'Beta', usedIn: [1], known: true } }, preconditions: { urlPattern: `${ORIGIN}/` }, steps }],
    }],
  });
  const bodiesOf = (source: string) => source.slice(source.indexOf('export const steps = {'));
  const stepOf = (source: string, n: number) => {
    const from = source.indexOf(`// @step 01-step s_emit/${n}`);
    const to = source.indexOf(`// @step 01-step s_emit/${n + 1}`);
    return source.slice(from, to === -1 ? undefined : to);
  };

  it('captures the lines before the action only when the step has a page-change expectation, and judges them in verify', () => {
    const { source, warnings } = emitFlowFile(flowOf([
      { tool: 'select', args: { target: '@e1', option: '{{v1}}' }, locators: { target: [{ kind: 'role', role: 'combobox', name: 'Project' }] }, expect: { addedContains: ['- combobox "Project": {{v1}}'] } },
      { tool: 'click', args: { target: '@e2' }, locators: { target: button('Save project') } },
    ]), { tier: 'plain' });
    expect(warnings).toEqual([]);
    const first = stepOf(source, 1);
    expect(first).toContain('let linesBefore1: string[] | null = null;');
    expect(first).toContain('linesBefore1 = await capturePageLines(page);');
    expect(first.indexOf('linesBefore1 = await capturePageLines(page);')).toBeLessThan(first.indexOf('act: async () => {'));
    // positional resolution is what the step's own resolution reported, not a compile-time guess
    const verdict = "await expectChanges(page, ['- combobox \"Project\": {{v1}}'], p, { tag: '01-step s_emit/1', tool: 'select', positionalResolution: positional1 }, linesBefore1);";
    expect(first).toContain(verdict);
    expect(first).toContain('let positional1 = false;');
    expect(first).toContain('positional1 = positional1 || hit1.structural || hit1.nth !== undefined;');
    expect(first.indexOf(verdict)).toBeGreaterThan(first.indexOf('verify: async () => {'));
    const second = stepOf(source, 2);
    expect(second).not.toContain('linesBefore');
    expect(second).not.toContain('expectChanges(');
    // the same rule, embedded once each, and nothing of the old locator union
    expect(source).toContain('async function expectedChangesVerdict(');
    expect(source).toContain('async function capturePageLines(page: Page, d: LineDialect = 1)');
    expect(source).toContain('const EXPECT_WAIT_MS = 5_000;');
    expect(source).toContain('{ timeout: EXPECT_WAIT_MS, message: `${ctx.tag}: the recorded page change did not appear` }');
    expect(bodiesOf(source)).not.toContain('toBeVisible');
    expect(source).not.toContain('looseText');
    expect(source).not.toContain('lineLocator');
    expect(source).not.toMatch(/getByRole\('combobox'\)\.filter/);
  });

  it('emits the skip path for a step that names a control of a dialog an earlier step recorded, and nothing for one that does not', () => {
    const { source } = emitFlowFile(flowOf([
      { tool: 'click', args: { target: '@e1' }, locators: { target: button('Exit') }, expect: { addedContains: ['- dialog "Discard changes?"', '- button "Discard"'] } },
      { tool: 'click', args: { target: '@e2' }, locators: { target: button('Discard') } },
      { tool: 'click', args: { target: '@e3' }, locators: { target: button('Mark') } },
    ]), { tier: 'plain' });
    expect(bodiesOf(source)).toContain('let absentDialog: { name: string; lines: string[] } | null = null;');
    expect(stepOf(source, 1)).toMatch(/absentDialog = changes\d+\.absentDialog \?\? null;/);
    expect(stepOf(source, 1)).not.toContain('absentDialogSkip');
    for (const n of [2, 3]) {
      const step = stepOf(source, n);
      expect(step).toContain(`await absentDialogSkip([page.getByRole('button', { name: roleName('${n === 2 ? 'Discard' : 'Mark'}'), exact: true })], {"target":[{"kind":"role","name":"${n === 2 ? 'Discard' : 'Mark'}"}]}, absentDialog, p, '01-step s_emit/${n}')`);
      expect(step).toContain("return { status: 'skipped' };");
      expect(step).toContain('absentDialog = null;');
      expect(step.indexOf('absentDialog = null;')).toBeLessThan(step.indexOf('await click('));
    }
    expect(source).toContain('function namesDialogControl(');
    // the artifact decides membership at run time with the shared rule; the
    // compiler does not pre-judge which later step belongs to the dialog
    expect(stepOf(source, 3)).toContain('absentDialogSkip');
    const plain = emitFlowFile(flowOf([
      { tool: 'click', args: { target: '@e1' }, locators: { target: button('Save') }, expect: { addedContains: ['- heading "Saved"'] } },
      { tool: 'click', args: { target: '@e2' }, locators: { target: button('Next') } },
    ]), { tier: 'plain' }).source;
    expect(bodiesOf(plain)).not.toContain('absentDialog');
  });
});
