import { describe, expect, it } from 'vitest';
import type { SkillStep } from '../src/skills/store.js';
import { openerLines } from '../src/skills/replay.js';

/**
 * fwod34's 03-open, step 3: the click that picks "Conference Chair" from the
 * product autocomplete was recorded to open the "Configure your product"
 * dialog, and ALSO recorded the empty order line (`row "£ 0.00"`) that the
 * previous step had already added. That row is on the page before the click,
 * lineShows is any-of, so the option click was skipped as "already in
 * effect" on every replay and the dialog never opened. Only popup lines may
 * decide a toggle.
 */
describe('openerLines', () => {
  const click = (added: string[]): SkillStep => ({ tool: 'click', args: { target: '@e1' }, locators: { target: [] }, expect: { addedContains: added } });

  it('keeps only the popup lines of a click that opens one', () => {
    const lines = openerLines(
      click(['- row "£ 0.00"', '- combobox "Type to find a product...": {{*}}', '- dialog ""', '- heading "Configure your product"', '- button "Close"']),
      {},
    );
    expect(lines).toEqual(['- dialog ""']);
  });

  it('is empty for a click that opens no popup', () => {
    expect(openerLines(click(['- row "£ 0.00"', '- button "Save"']), {})).toEqual([]);
  });

  it('still fills params and skips lines that carry this run\'s own values', () => {
    expect(openerLines(click(['- menu "Actions"', '- dialog "{{v1}}"']), { v1: 'X' })).toEqual(['- menu "Actions"']);
  });

  it('ignores anything but a click', () => {
    expect(openerLines({ ...click(['- dialog "X"']), tool: 'fill' }, {})).toEqual([]);
  });
});
