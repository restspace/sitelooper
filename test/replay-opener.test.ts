import { describe, expect, it } from 'vitest';
import type { SkillStep } from '../src/skills/store.js';
import type { Page } from 'playwright-core';
import { openerAlreadyShowing, openerPopupLines, openerWorkLines } from '../src/execution/expect.js';
import { openerLines } from '../src/skills/replay.js';
import { documentOf, isObserveArg } from './fixture/observation.js';

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

/**
 * Round 72, odoo fwod98 06-open: the "Send and cancel" click that cancels the
 * order closed the wizard, and what came back into view was the form
 * underneath — the top-bar company `menu "7 3 YourCompany"` (on every page)
 * beside `button "Set to Quotation"` (only on a cancelled order). The menu
 * alone skipped the click on every replay. An opener is in effect only when
 * its popup shows AND every line of its other recorded work shows.
 */
describe('openerWorkLines and openerAlreadyShowing', () => {
  const added = ['- menu "7 3 YourCompany"', '- button "7"', '- button "Set to Quotation"', '- row "Product Description Quantity Unit Price Taxes Tax excl."', '- status "Saved"', '- dialog "{{v1}}"'];

  it('splits a click\'s plain additions into the popup and the rest', () => {
    expect(openerPopupLines(added)).toEqual(['- menu "7 3 YourCompany"']);
    expect(openerWorkLines(added)).toEqual(['- button "7"', '- button "Set to Quotation"', '- row "Product Description Quantity Unit Price Taxes Tax excl."']);
    expect(openerWorkLines(undefined)).toEqual([]);
  });

  const pageShowing = (lines: string[]) =>
    ({
      url: () => 'http://app.test/',
      evaluate: async (_fn: unknown, arg?: unknown) => (isObserveArg(arg) ? documentOf(lines, [], {}) : undefined),
    }) as unknown as Page;

  it('is not in effect while the click\'s other work is missing, even with the popup line showing', async () => {
    const page = pageShowing(['- menu "7 3 YourCompany"', '- button "7"', '- button "Cancel"', '- row "Product Description Quantity Unit Price Taxes Tax excl."']);
    expect(await openerAlreadyShowing(page, openerPopupLines(added), openerWorkLines(added), 2)).toBe(false);
  });

  it('is in effect when the popup and all of the work show', async () => {
    const page = pageShowing(['- menu "7 3 YourCompany"', '- button "7"', '- button "Set to Quotation"', '- row "Product Description Quantity Unit Price Taxes Tax excl."']);
    expect(await openerAlreadyShowing(page, openerPopupLines(added), openerWorkLines(added), 2)).toBe(true);
  });

  it('is the old any-of rule for a click whose only plain additions are popup lines', async () => {
    expect(await openerAlreadyShowing(pageShowing(['- menu "New"', '- menuitem "New dashboard"']), ['- menu "New"'], [], 2)).toBe(true);
    expect(await openerAlreadyShowing(pageShowing(['- button "New"']), ['- menu "New"'], [], 2)).toBe(false);
    expect(await openerAlreadyShowing(pageShowing(['- menu "New"']), [], [], 2)).toBe(false);
  });
});
