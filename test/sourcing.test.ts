/**
 * Record-time sourcing (src/agent/sourcing.ts; hygiene design §4, stages 3-4):
 * the pure halves. The loop's hold and the stage-3 pre-pass against a live
 * page are in test/sourcing-hold.browser.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { applyCommentaryPrePass, decideSourcingHold, isDataShaped, sourcingAskMessage, sourcingHoldOn, splitCommentary, type TierVerdict } from '../src/agent/sourcing.js';
import type { Report } from '../src/agent/report.js';

describe('sourcingHoldOn', () => {
  it('is off unless SITELOOPER_SOURCING_HOLD=on', () => {
    expect(sourcingHoldOn({})).toBe(false);
    expect(sourcingHoldOn({ SITELOOPER_SOURCING_HOLD: '1' })).toBe(false);
    expect(sourcingHoldOn({ SITELOOPER_SOURCING_HOLD: 'on' })).toBe(true);
  });
});

describe('splitCommentary (stage 3)', () => {
  it('splits a trailing parenthetical, dash tail or semicolon tail off a substantive head', () => {
    expect(splitCommentary('Ready to Deploy (badge: Deployed)')).toEqual({ head: 'Ready to Deploy', commentary: 'badge: Deployed' });
    expect(splitCommentary('Dec 31 (year not displayed)')).toEqual({ head: 'Dec 31', commentary: 'year not displayed' });
    expect(splitCommentary('BA Bench Assignee — the default assignee')).toEqual({ head: 'BA Bench Assignee', commentary: 'the default assignee' });
    expect(splitCommentary('Backlog; the first column')).toEqual({ head: 'Backlog', commentary: 'the first column' });
  });

  it('leaves a plain value, a bare parenthetical, or a hyphenated word alone', () => {
    expect(splitCommentary('Ready to Deploy')).toBeNull();
    expect(splitCommentary('(deployed)')).toBeNull();
    expect(splitCommentary('RD-1015')).toBeNull();
    expect(splitCommentary('S00021')).toBeNull();
  });
});

describe('isDataShaped', () => {
  it('admits page-like text and refuses verdicts, empties and prose', () => {
    expect(isDataShaped('S00021')).toBe(true);
    expect(isDataShaped('Seed: triage inbox')).toBe(true);
    expect(isDataShaped('yes')).toBe(false);
    expect(isDataShaped('N/A')).toBe(false);
    expect(isDataShaped('0')).toBe(false);
    expect(isDataShaped('   ')).toBe(false);
    expect(isDataShaped('x'.repeat(81))).toBe(false);
  });
});

describe('decideSourcingHold', () => {
  const instruction = 'Open the issue list and report the titles of all open issues and the record id.';
  const verdictFrom = (map: Record<string, TierVerdict>, seen: string[] = []) => async (key: string) => {
    seen.push(key);
    return map[key] ?? 'unknown';
  };

  it('holds only an asked, data-shaped, absent value, and consults the tiers only for those', async () => {
    const seen: string[] = [];
    const d = await decideSourcingHold({
      instruction,
      values: { open_issue_titles: '#1 Seed: triage inbox, #2 Seed: order missing parts', record_id: '42', scratch: 'nobody asked', issue_exists: 'yes' },
      alreadyRead: new Set(),
      alertTexts: [],
      verdict: verdictFrom({ open_issue_titles: 'absent', record_id: 'sourced' }, seen),
    });
    expect(d.held.map((h) => h.key)).toEqual(['open_issue_titles']);
    expect(seen.sort()).toEqual(['open_issue_titles', 'record_id']);
  });

  it('never holds for a value a read produced, or one a recorded alert showed', async () => {
    const d = await decideSourcingHold({
      instruction,
      values: { open_issue_titles: 'Seed: triage inbox', record_id: '42' },
      alreadyRead: new Set(['Seed: triage inbox']),
      alertTexts: ['- alert "Record 42 saved"'],
      verdict: verdictFrom({ open_issue_titles: 'absent', record_id: 'absent' }),
    });
    expect(d.held).toEqual([]);
  });

  it('does not hold for an ambiguous or unsweepable value (those go to the model-sourced locate as today)', async () => {
    const d = await decideSourcingHold({
      instruction,
      values: { record_id: 'RD-1015' },
      alreadyRead: new Set(),
      alertTexts: [],
      verdict: verdictFrom({ record_id: 'unknown' }),
    });
    expect(d.held).toEqual([]);
  });

  it('names the eval an absent value came from', async () => {
    const d = await decideSourcingHold({
      instruction,
      values: { open_issue_titles: 'Seed: triage inbox' },
      alreadyRead: new Set(),
      alertTexts: [],
      verdict: verdictFrom({ open_issue_titles: 'absent' }),
      evalResults: ['["Seed: triage inbox","Seed: order missing parts"]'],
    });
    expect(d.held).toEqual([{ key: 'open_issue_titles', value: 'Seed: triage inbox', verdict: 'absent', fromEval: true }]);
    const msg = sourcingAskMessage(d.held);
    expect(msg).toMatch(/report held/);
    expect(msg).toMatch(/open_issue_titles = "Seed: triage inbox"  \(it matches what your eval returned/);
    expect(msg).toMatch(/do not click or fill anything that changes data/);
    expect(msg).toMatch(/keep it and say so in the summary/);
  });
});

describe('applyCommentaryPrePass (stage 3)', () => {
  it('publishes the head when the page vouches for it and moves the commentary into the summary', async () => {
    const report: Report = { status: 'success', summary: 'Opened the record.', evidence: { values: { status: 'Ready to Deploy (badge: Deployed)', plain: 'Bench', unsourced: 'Nowhere (guess)' } } };
    const changed = await applyCommentaryPrePass(report, async (head) => head === 'Ready to Deploy');
    expect(changed).toEqual(['status']);
    expect(report.evidence?.values).toEqual({ status: 'Ready to Deploy', plain: 'Bench', unsourced: 'Nowhere (guess)' });
    expect(report.summary).toBe('Opened the record. (status: badge: Deployed)');
  });

  it('restricts itself to the keys it is given', async () => {
    const report: Report = { status: 'success', summary: 's', evidence: { values: { a: 'One (ex)', b: 'Two (why)' } } };
    expect(await applyCommentaryPrePass(report, async () => true, ['b'])).toEqual(['b']);
    expect(report.evidence?.values).toEqual({ a: 'One (ex)', b: 'Two' });
  });
});
