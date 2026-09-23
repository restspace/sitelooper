import { describe, expect, it } from 'vitest';
import { flattenContainedComposite, planContainedParts } from '../src/agent/report.js';
import type { Report } from '../src/agent/report.js';

/**
 * Round 56: a reported value no element shows whole, made of element texts
 * the page does show, plus the model's own labels and punctuation.
 *
 * fwgt8-n1 01-open reported `seed_issue_1: "Seed: triage inbox (#1)"` — the
 * issue list shows the title in one element and `#1` in another — and
 * fwsi8-n1 01-signin reported `asset_1: "Asset Tag SEED-0001 / Name Seed:
 * Reception Laptop"` over a table whose cells hold `SEED-0001` and `Seed:
 * Reception Laptop`. Neither pinned, both stayed recorded literals, and both
 * replays scored obj 1 FAIL at tier A: the titles and tags were on the replay
 * page and nothing re-read them.
 */

const GITEA_INSTR =
  "Open http://127.0.0.1:8095/ in the browser. If you are not already signed in, sign in with username admin and password {{env:APP_PASSWORD}}. Then navigate to the issues list of the repository bench/bench-repo and report the titles of all OPEN issues whose title starts with 'Seed:', exactly as displayed on the page, one per line.";
const SNIPE_INSTR =
  "Sign in to Snipe-IT at http://127.0.0.1:8098/ with username admin and password {{env:APP_PASSWORD}} (type the password exactly as the text {{env:APP_PASSWORD}}). Then list all assets whose name starts with 'Seed:' and report each asset's name and asset tag exactly as shown.";

/** What the Gitea issue list shows, element by element (full visible texts). */
const GITEA_PAGE = ['Issues', '3 Open', '0 Closed', 'Seed: ship repaired device', '#3', 'Seed: order missing parts', '#2', 'Seed: triage inbox', '#1', '1', 'admin', 'opened 3 days ago by admin'];
/** The Snipe-IT assets table, header and cells. */
const SNIPE_PAGE = ['Assets', 'Asset Tag', 'Name', 'Model', 'SEED-0001', 'Seed: Reception Laptop', 'SEED-0002', 'Seed: Training Laptop', 'SEED-0003', 'Seed: Spare Laptop', 'Bench Laptop Model', 'Ready to Deploy'];

describe('planContainedParts', () => {
  it('splits a title and its number, each an element the page shows (fwgt8 seed_issue_1)', () => {
    expect(planContainedParts('Seed: triage inbox (#1)', GITEA_PAGE, GITEA_INSTR)).toEqual(['Seed: triage inbox', '#1']);
  });

  it('splits a tag and a name, leaving the model’s labels out (fwsi8 asset_1)', () => {
    // "Asset Tag" and "Name" are the page's headers AND the instruction's own
    // words: labels, not data — never a part, never a gap.
    expect(planContainedParts('Asset Tag SEED-0001 / Name Seed: Reception Laptop', SNIPE_PAGE, SNIPE_INSTR)).toEqual(['SEED-0001', 'Seed: Reception Laptop']);
  });

  it('takes "#1" over the bare "1" the page also shows, and never both', () => {
    const parts = planContainedParts('Seed: triage inbox (#1)', GITEA_PAGE, GITEA_INSTR)!;
    expect(parts).not.toContain('1');
  });

  it('captures nothing when the parts do not cover the value', () => {
    // "assigned to nobody" is on no element and in no instruction word.
    expect(planContainedParts('Seed: triage inbox (#1), assigned to nobody', GITEA_PAGE, GITEA_INSTR)).toBeNull();
  });

  it('captures nothing when an element already shows the value whole', () => {
    expect(planContainedParts('Seed: triage inbox (#1)', [...GITEA_PAGE, 'Seed: triage inbox (#1)'], GITEA_INSTR)).toBeNull();
  });

  it('never makes reads of a lone number: a bare part needs a substantive partner', () => {
    expect(planContainedParts('open: 3 (#3)', ['3', '#3'], 'report the open count')).toBeNull();
  });

  it('agrees with the list splitter on a separator-joined list (fwkb17)', () => {
    expect(planContainedParts('Backlog, Ready, Work in progress, Done', ['Backlog', 'Ready', 'Work in progress', 'Done', 'Board'], 'report the columns left to right')).toEqual(['Backlog', 'Ready', 'Work in progress', 'Done']);
  });
});

describe('flattenContainedComposite', () => {
  it('replaces the composite with one pinned part per element, as the list splitter does', async () => {
    const report: Report = { status: 'success', summary: 's', evidence: { values: { open_issue_count: '3', seed_issue_1: 'Seed: triage inbox (#1)' } } };
    const pinned: [string, string][] = [];
    const out = await flattenContainedComposite(report, 'seed_issue_1', GITEA_PAGE, GITEA_INSTR, async (value, name) => {
      pinned.push([name, value]);
      return { value, name };
    });
    expect(out.names).toEqual(['seed_issue_1_1', 'seed_issue_1_2']);
    expect(pinned).toEqual([
      ['seed_issue_1_1', 'Seed: triage inbox'],
      ['seed_issue_1_2', '#1'],
    ]);
    expect(report.evidence?.values).toEqual({ open_issue_count: '3', seed_issue_1_1: 'Seed: triage inbox', seed_issue_1_2: '#1' });
  });

  it('changes nothing when one part does not pin (all or nothing)', async () => {
    const report: Report = { status: 'success', summary: 's', evidence: { values: { asset_1: 'Asset Tag SEED-0001 / Name Seed: Reception Laptop' } } };
    const out = await flattenContainedComposite(report, 'asset_1', SNIPE_PAGE, SNIPE_INSTR, async (value) => (value === 'SEED-0001' ? null : { value }));
    expect(out.names).toEqual([]);
    expect(report.evidence?.values).toEqual({ asset_1: 'Asset Tag SEED-0001 / Name Seed: Reception Laptop' });
  });
});
