import { describe, expect, it } from 'vitest';
import { partialReasons } from '../src/daemon/step-verdict.js';

/**
 * Round 59, EspoCRM fwec11: n2 and n3 ended "partial" on 01-signin alone —
 *   "the procedure's read of page_title, an output this step reports, was
 *    skipped (nothing matched on the page), so page_title went unreported"
 * — while every verifier passed. The instruction was "Sign in … Then confirm
 * you are signed in and report what page you land on": page_title is not a
 * fact it asked for (round 56's ask rule: every word of the name in a
 * "report …" clause; "title" is not). A skipped read of an output nobody
 * asked for is a warning and a drift ticket, not a failed step. A skipped
 * read of an ASKED output still is (fwsi7 05-open's checked_out_to_user).
 */
describe('a skipped read makes a step partial only when its output was asked for', () => {
  it('fwec11 01-signin: page_title was not asked — clean', () => {
    expect(
      partialReasons({
        reportStatus: 'success',
        recovered: false,
        skippedReads: ['page_title'],
        declaredOutputs: ['landed_url', 'page_title', 'signed_in_user', 'signed_in_username', 'landing_page', 'body_class'],
        values: { body_class: 'has-navbar minimized', landed_url: 'http://127.0.0.1:8097/' },
        instruction:
          'Sign in to EspoCRM with username admin and password {{env:APP_PASSWORD}} (type the password text exactly as {{env:APP_PASSWORD}}). Then confirm you are signed in and report what page you land on.',
      }),
    ).toEqual([]);
  });

  it('fwsi7 05-open: checked_out_to_user was asked — still partial', () => {
    expect(
      partialReasons({
        reportStatus: 'success',
        recovered: false,
        skippedReads: ['checked_out_to_user'],
        declaredOutputs: ['asset_tag', 'asset_name', 'model', 'default_location', 'purchase_date_as_displayed', 'checked_out_to_user', 'history_checkout_note'],
        values: { asset_tag: 'BA-00005', asset_name: 'x', model: 'y' },
        instruction:
          'Open the asset view page for asset tag {{02-create.asset_tag}} and report exactly what it displays for: asset tag, asset name, model, status, default location, purchase date, and the user it is checked out to. Also confirm the checkout note in the History tab.',
      }),
    ).toEqual([
      "the procedure's read of checked_out_to_user, an output this step reports, was skipped (nothing matched on the page), so checked_out_to_user went unreported",
    ]);
  });

  it('fwrd88 05-change: alerts_present_after_success was not asked — clean', () => {
    expect(
      partialReasons({
        reportStatus: 'success',
        recovered: false,
        skippedReads: ['alerts_present_after_success'],
        declaredOutputs: ['final_status', 'alerts_present_after_success'],
        values: { final_status: 'Ready' },
        instruction:
          "On the ticket detail page, change the ticket's status to 'Ready'. Report the final status shown on the ticket, and exactly what preconditions were required (quote the app's messages you encountered and what you did to satisfy each).",
      }),
    ).toEqual([]);
  });
});
