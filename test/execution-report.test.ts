import { describe, expect, it } from 'vitest';
import { derivesFromParams, templateValue } from '../src/execution/report.js';
import { synthesizeReport } from '../src/skills/learn.js';
import type { Skill } from '../src/skills/store.js';

/**
 * The report-template rule both runners share (src/execution/report.ts):
 * the daemon's synthesizeReport and the artifact's publication after a step's
 * last segment (fwgh4 03-open) fill the same template the same way.
 */
describe('templateValue', () => {
  it('publishes a value built from the caller’s params, filled for this run', () => {
    expect(templateValue('{{v2}}', { v2: 'fwgh4-n2 Bench Post' }, null)).toBe('fwgh4-n2 Bench Post');
    // The recorded text around the slot publishes only where this run's page shows it (fwrd86).
    expect(templateValue('{{v2}}-bench-post', { v2: 'fwgh4-n2' }, ['- link "fwgh4-n2-bench-post"'])).toBe('fwgh4-n2-bench-post');
    expect(templateValue('{{v2}}-bench-post', { v2: 'fwgh4-n2' }, ['- heading "Posts"'])).toBeNull();
    expect(templateValue('{{v2}}-bench-post', { v2: 'fwgh4-n2' }, null)).toBeNull();
  });

  it('publishes nothing for a recorded literal, an unbound slot, a residual reference, or an empty fill (rule J)', () => {
    expect(derivesFromParams('fwgh4-n1 Bench Post')).toBe(false);
    expect(templateValue('fwgh4-n1 Bench Post', {})).toBeNull();
    expect(templateValue('{{v2}}', {})).toBeNull();
    expect(templateValue('{{v2}}', { v2: '{{03-create.product_name}}' })).toBeNull();
    expect(templateValue('{{v2}}', { v2: '' })).toBeNull();
  });

  it('is exactly what the daemon’s zero-model report keeps', () => {
    const skill = { id: 's_t', params: {}, steps: [], reportTemplate: { summary: 'created {{v2}}', values: { title: '{{v2}}', literal: 'RD-1017', empty: '{{v3}}', read: '{{v2}}' } } } as unknown as Skill;
    const params = { v2: 'fwgh4-n2 Bench Post', v3: '' };
    const report = synthesizeReport(skill, params, { read: 'live value' });
    expect(report.evidence?.values).toEqual({ title: 'fwgh4-n2 Bench Post', read: 'live value' });
    for (const [k, v] of Object.entries(skill.reportTemplate!.values)) {
      if (k === 'read') continue;
      expect(report.evidence?.values?.[k] ?? null).toBe(templateValue(v, params));
    }
  });
});

/**
 * fwrd86 (RepairDesk, 2026-09-23). Both replays published the report
 * template's recorded text as their own findings: s_6532a2 (06-delete) filled
 * `{{v1}}` and `{{v4}}` into a list row that still read "Created: 2026-09-23"
 * and into counts that still read "Showing 1–10 of 13" / "of 15" — n2 had
 * archived a second ticket and reported 15 all the same. The slot is this
 * run's; the text between the slots is the recording's. Here the replay runs
 * a day later against a list that grew: nothing the page does not show may be
 * published.
 */
describe('fwrd86: a template value publishes only the text this run observed', () => {
  // s_6532a2's report template and params, verbatim from the fwrd86 store.
  const deleteSkill = {
    id: 's_6532a2',
    params: {
      v1: { example: 'RD-1015', usedIn: [] },
      v2: { example: 'Ready', usedIn: [] },
      v3: { example: 'fwrd86-n1 RD Part A', usedIn: [] },
      v4: { example: 'fwrd86-n1', usedIn: [3, 4, 5] },
      v5: { example: 'fwrd86-n1 RD Part B', usedIn: [] },
      v6: { example: 'Draft', usedIn: [] },
    },
    steps: [],
    reportTemplate: {
      summary:
        'Deleted both parts on {{v1}} via their Delete buttons, each time confirming the app\'s "Confirm" dialog with "Delete part"; after each delete the Parts table refreshed, and it now reads "No parts on this ticket yet." (Parts = 0). I then clicked "Archive ticket" — it did not require a status change (the ticket stayed {{v2}}) and no confirm dialog appeared; the button flipped to "Unarchive ticket". Final state: {{v1}}, title "{{v4}} RD Bench Ticket", status {{v2}} plus an "Archived" badge, 0 parts. In the list view {{v1}} is gone from the default listing (Showing 1–10 of 13) and, with "Show archived" ticked, it appears as the first row — "{{v1}} | {{v4}} RD Bench Ticket Archived | Not recorded | {{v2}} | 0 | 2026-09-23", total 15 ({{v1}} plus the pre-existing archived RD-1013) — so nothing from this run is left active.',
      values: {
        ticket_reference: '{{v1}}',
        deleted_part_a: "{{v3}} (confirmed via 'Delete part' dialog)",
        deleted_part_b: "{{v5}} (confirmed via 'Delete part' dialog)",
        parts_remaining: "0 (detail page shows 'No parts on this ticket yet.')",
        detail_status: '{{v2}}',
        detail_controls_after_archive: "'Unarchive ticket' button replaced 'Archive ticket'",
        'list_row_RD-1015': '{{v1}} | {{v4}} RD Bench Ticket [Archived] | Customer: Not recorded | Status: {{v2}} | Parts: 0 | Created: 2026-09-23',
        list_default_count: "Showing 1–10 of 13 ({{v1}} hidden while 'Show archived' unchecked)",
        list_with_archived_count: 'Showing 1–10 of 15 ({{v1}} first row, archived)',
        other_archived_ticket: 'RD-1013 (pre-existing, Blue Fox Cafe)',
        ticket_detail_url: 'http://127.0.0.1:4180/#/tickets/t15',
        ref: '{{v4}}',
        ref_2: 'RD-1013',
      },
    },
  } as unknown as Skill;
  const params = { v1: 'RD-1016', v2: 'Ready', v3: 'fwrd86-n2 RD Part A', v4: 'fwrd86-n2', v5: 'fwrd86-n2 RD Part B', v6: 'Draft' };
  // The skill's own reads (ref_2, ticket_reference, ref, detail_status) and the
  // chain head's ticket_detail_url, as a replay reads them.
  const live = { ticket_detail_url: 'http://127.0.0.1:4180/#/tickets/t16', ref_2: 'RD-1013', ticket_reference: 'RD-1016', ref: 'fwrd86-n2', detail_status: 'Ready' };
  // The list the replay ends on: a day later, one more archived ticket.
  const nextDay = [
    '- checkbox "Show archived" [checked]',
    '- text: Showing 1–10 of 16',
    '- row "RD-1016 fwrd86-n2 RD Bench Ticket Archived Not recorded Ready 0 2026-09-24"',
    '- cell "RD-1016"',
    '- cell "fwrd86-n2 RD Bench Ticket Archived"',
    '- cell "Not recorded"',
    '- cell "Ready"',
    '- cell "0"',
    '- cell "2026-09-24"',
  ];

  it("publishes neither the recording's date nor its counts", () => {
    const report = synthesizeReport(deleteSkill, params, live, nextDay);
    const published = JSON.stringify(report.evidence?.values ?? {});
    for (const stale of ['2026-09-23', 'of 13', 'of 15', 't15']) expect(published).not.toContain(stale);
    expect(report.summary).not.toContain('2026-09-23');
    expect(report.summary).not.toContain('of 13');
    // What the run DID observe is still reported: every live read, whole.
    expect(report.evidence?.values).toMatchObject(live);
    expect(report.evidence?.values?.['list_row_RD-1015']).toBeUndefined();
    expect(report.evidence?.values?.list_default_count).toBeUndefined();
    expect(report.evidence?.values?.list_with_archived_count).toBeUndefined();
  });

  it('publishes a filled value whose every literal this run’s page shows', () => {
    const skill = { ...deleteSkill, reportTemplate: { summary: '', values: { title: '{{v4}} RD Bench Ticket', row: '{{v1}} | {{v2}}' } } } as unknown as Skill;
    const report = synthesizeReport(skill, params, {}, nextDay);
    expect(report.evidence?.values).toEqual({ title: 'fwrd86-n2 RD Bench Ticket', row: 'RD-1016 | Ready' });
    // No page, no observation: the literal is withheld, the pure fill is not.
    expect(synthesizeReport(skill, params, {}, null).evidence?.values).toEqual({ row: 'RD-1016 | Ready' });
  });

  // s_93ead3 (01-signin) templates `ticket_created: "2026-09-23"` beside a
  // read labelled ticket_created. The read's live text is what publishes; the
  // template's date never does, even when the read comes back empty.
  it("publishes a live read's date, never the template's", () => {
    const signin = { id: 's_93ead3', params: {}, steps: [], reportTemplate: { summary: '', values: { ticket_created: '2026-09-23', ticket_parts: '0', ticket_title: '{{v4}}' } } } as unknown as Skill;
    const p = { v4: 'fwrd86-n2 RD Bench Ticket' };
    expect(synthesizeReport(signin, p, { ticket_created: '2026-09-24' }, nextDay).evidence?.values).toEqual({ ticket_created: '2026-09-24', ticket_title: 'fwrd86-n2 RD Bench Ticket' });
    expect(synthesizeReport(signin, p, {}, nextDay).evidence?.values).toEqual({ ticket_title: 'fwrd86-n2 RD Bench Ticket' });
  });
});
