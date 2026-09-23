/**
 * What a step was asked to report, and whether its replay published it
 * (src/daemon/step-verdict.ts askedOutputs / unansweredAsks; round 56).
 *
 * test/fixture/report-asks-steps.json holds every zero-model step of the
 * round-54 and round-56 flow runs we hold (16 runs, 127 steps): its
 * instruction, its candidate outputs (declared, plus what export pruned) and
 * what the replay published (reported values and echo-reads).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { askedOutputs, unansweredAsks } from '../src/daemon/step-verdict.js';

interface Row {
  run: string;
  replay: string;
  green: boolean;
  step: string;
  instruction: string;
  candidates: string[];
  pruned: string[];
  published: string[];
  recorded: Record<string, string>;
}
const ROWS = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixture', 'report-asks-steps.json'), 'utf8')) as Row[];
const row = (run: string, replay: string, step: string) => ROWS.find((r) => r.run === run && r.replay === replay && r.step === step)!;
const unanswered = (r: Row) => unansweredAsks(r.instruction, r.candidates, r.published, r.recorded).sort();

describe('the three round-56 steps that claimed success without the asked-for fact', () => {
  it('fwod82 02-create: the product and the untaxed amount (pruned at export)', () => {
    for (const n of ['n2', 'n3']) {
      const r = row('fwod82', n, '02-create');
      expect(r.pruned).toContain('untaxed_amount');
      expect(unanswered(r)).toEqual(['product', 'untaxed_amount']);
    }
  });

  it('fwgt8 01-open: the open issues\' titles (two counts were all it published)', () => {
    for (const n of ['n2', 'n3']) expect(unanswered(row('fwgt8', n, '01-open'))).toEqual(['seed_issue_1', 'seed_issue_2', 'seed_issue_3', 'seed_issue_titles']);
  });

  it('fwsi8 01-signin: each asset\'s name and tag (a count was all it published)', () => {
    for (const n of ['n2', 'n3']) expect(unanswered(row('fwsi8', n, '01-signin'))).toEqual(['asset_1', 'asset_2', 'asset_3']);
  });
});

describe('fwec8 record_id and fwgr68 03-open dashboard_uid: one template shape, decided by what was ASKED', () => {
  it('fwgr68 03-open never asked for the dashboard uid, so its unfillable {{v4}} template is not an unanswered ask', () => {
    for (const n of ['n2', 'n3']) {
      const r = row('fwgr68', n, '03-open');
      expect(r.candidates).toContain('dashboard_uid');
      expect(askedOutputs(r.instruction, r.candidates)).not.toContain('dashboard_uid');
    }
  });

  it('fwec8 03-verify never asked for record_id either; 02-create did, and never published it', () => {
    const verify = row('fwec8', 'n3', '03-verify');
    expect(verify.candidates).toContain('record_id');
    expect(askedOutputs(verify.instruction, verify.candidates)).not.toContain('record_id');
    for (const n of ['n2', 'n3']) expect(unanswered(row('fwec8', n, '02-create'))).toEqual(['record_id', 'record_url']);
  });
});

describe('what counts as asked, and as answered', () => {
  it('only a clause that asks to report: a verified-but-not-reported fact is not asked (fwvk7 02-create)', () => {
    const r = row('fwvk7', 'n2', '02-create');
    expect(r.instruction).toMatch(/priority High/);
    expect(askedOutputs(r.instruction, ['priority', 'task_identifier'])).toEqual(['task_identifier']);
  });

  it('an echo-read answers (fwgr68 03-open new_panel_title), and so does a published name holding every word (fwvk7 03-open)', () => {
    expect(unanswered(row('fwgr68', 'n2', '03-open'))).not.toContain('new_panel_title');
    expect(unanswered(row('fwvk7', 'n2', '03-open'))).toEqual([]);
  });

  it('a list index and a one-letter enumeration label are not words of the ask', () => {
    expect(askedOutputs('Report each asset\'s name and tag.', ['asset_1', 'asset_tag', 'b_asset_name', 'count'])).toEqual(['asset_1', 'asset_tag', 'b_asset_name']);
  });
});

describe("a joined ask answered as its parts, by the recording's own values", () => {
  it('fwkb40 01-signin: columns_left_to_right (pruned) is answered by column_1_name … column_4_name', () => {
    for (const n of ['n2', 'n3']) {
      const r = row('fwkb40', n, '01-signin');
      expect(r.pruned).toContain('columns_left_to_right');
      expect(askedOutputs(r.instruction, r.candidates)).toContain('columns_left_to_right');
      expect(unanswered(r)).toEqual([]);
    }
  });

  it("a name family is not enough: fwrd87 04-add's parts_table_row_1 … 6 (Part A's row) do not answer parts_total", () => {
    const r = row('fwrd87', 'n2', '04-add');
    expect(r.published).toContain('parts_table_row_1');
    expect(unanswered(r)).toEqual(['parts_total']);
  });
});

describe('export: a pruned output the instruction asked for is named, not dropped quietly', () => {
  it('fwod82 02-create: of the pruned untaxed_amount, total and product_code, only untaxed_amount was asked', () => {
    const r = row('fwod82', 'n2', '02-create');
    expect(r.pruned.sort()).toEqual(['product_code', 'total', 'untaxed_amount']);
    expect(askedOutputs(r.instruction, r.pruned)).toEqual(['untaxed_amount']);
  });
});

describe('the whole of rounds 54 and 56', () => {
  it('names exactly these steps (a warning, not a verdict — see step-verdict.ts for why)', () => {
    const named = ROWS.filter((r) => unanswered(r).length).map((r) => `${r.green ? 'GREEN ' : ''}${r.run} ${r.replay} ${r.step}: ${unanswered(r).join(', ')}`).sort();
    expect(named).toEqual([
      'GREEN fwgh11 n2 03-open: tags',
      'GREEN fwgh11 n2 04-verify: final_status, publish_date',
      'GREEN fwgh11 n2 05-report: public_date_visible, public_tag_visible, public_url_http_status, settings_publish_date, settings_tags',
      'GREEN fwgh11 n3 03-open: tags',
      'GREEN fwgh11 n3 04-verify: final_status, publish_date',
      'GREEN fwgh11 n3 05-report: public_date_visible, public_tag_visible, public_url_http_status, settings_publish_date, settings_tags',
      'GREEN fwgr68 n2 04-open: time_range_text_after_reload',
      'GREEN fwgr68 n3 04-open: time_range_text_after_reload',
      'GREEN fwgt7 n2 02-open: issue_exists',
      'GREEN fwgt7 n2 04-add: labels_displayed',
      'GREEN fwgt7 n3 02-open: issue_exists',
      'GREEN fwgt7 n3 04-add: labels_displayed',
      'GREEN fwrd87 n2 04-add: parts_total',
      'GREEN fwrd87 n2 06-change: preconditions_required',
      'GREEN fwrd87 n3 04-add: parts_total',
      'GREEN fwrd87 n3 06-change: preconditions_required',
      'fwec8 n2 02-create: record_id, record_url',
      'fwec8 n3 02-create: record_id, record_url',
      'fwgt8 n2 01-open: seed_issue_1, seed_issue_2, seed_issue_3, seed_issue_titles',
      'fwgt8 n2 04-add: labels_shown, milestone_shown',
      'fwgt8 n3 01-open: seed_issue_1, seed_issue_2, seed_issue_3, seed_issue_titles',
      'fwgt8 n3 04-add: labels_shown, milestone_shown',
      'fwkb39 n3 04-open: card_column_id, card_number',
      'fwod82 n2 02-create: product, untaxed_amount',
      'fwod82 n2 03-add: new_untaxed_amount',
      'fwod82 n3 02-create: product, untaxed_amount',
      'fwod82 n3 03-add: new_untaxed_amount',
      'fwop11 n2 02-create: assignee, finish_date, status',
      'fwop11 n2 03-open: finish_date',
      'fwop11 n3 02-create: assignee, finish_date, status',
      'fwop11 n3 03-open: finish_date',
      'fwrd88 n2 05-change: preconditions_required',
      'fwrd88 n2 06-delete: final_status_label',
      'fwrd88 n3 05-change: preconditions_required',
      'fwrd88 n3 06-delete: final_status_label',
      'fwsi7 n2 05-open: checked_out_to_user, model, status',
      'fwsi7 n3 05-open: checked_out_to_user, model, status',
      'fwsi8 n2 01-signin: asset_1, asset_2, asset_3',
      'fwsi8 n3 01-signin: asset_1, asset_2, asset_3',
    ]);
  });
});
