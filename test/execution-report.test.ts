import { describe, expect, it } from 'vitest';
import { derivesFromParams, observedSummary, referenceValue, templateSource, templateValue } from '../src/execution/report.js';
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
    // The page shows the title: a value made only of params publishes only
    // where this run observed it (round 60, fwgt11 07-add).
    const shown = ['fwgh4-n2 Bench Post'];
    const report = synthesizeReport(skill, params, { read: 'live value' }, shown);
    expect(report.evidence?.values).toEqual({ title: 'fwgh4-n2 Bench Post', read: 'live value' });
    for (const [k, v] of Object.entries(skill.reportTemplate!.values)) {
      if (k === 'read') continue;
      expect(report.evidence?.values?.[k] ?? null).toBe(templateValue(v, params, shown, { given: { typed: [], live: ['live value'] } }));
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
    // No page, no observation: the literal is withheld, and since round 60
    // (fwgt11 07-add) so is the pure fill — no page, read or typed value shows it.
    expect(synthesizeReport(skill, params, {}, null).evidence?.values).toEqual({});
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

  // The summary under the same rule. n2's published 06-delete summary still
  // said "(Showing 1–10 of 13)", "| 2026-09-23", "total 15 (… plus the
  // pre-existing archived RD-1013)" — the recording's list, not n2's.
  it("drops the summary's unobserved clauses and keeps the ones this run's page shows", () => {
    // The detail page's words, as a replay would see them after the archive.
    const page = [...nextDay, 'Final state title status plus an Archived badge 0 parts', 'Ready'];
    const report = synthesizeReport(deleteSkill, params, live, page, { instruction: 'Report the final state of the ticket' });
    for (const stale of ['2026-09-23', 'of 13', 'total 15', 'RD-1015']) expect(report.summary).not.toContain(stale);
    expect(report.summary).toContain('Final state: RD-1016, title "fwrd86-n2 RD Bench Ticket", status Ready plus an "Archived" badge, 0 parts.');
    // No page at all: nothing but the params and reads vouch, and the plain sentence stands.
    expect(synthesizeReport(deleteSkill, params, live).summary).toMatch(/^Replayed stored procedure s_6532a2; observed /);
  });

  // s_6a0a0a (04-edit): "…the "Total (price × quantity)" line is now {{live}}
  // (previously $375.00)." 04-edit never read $375.00 — it is 03-add's total.
  it('drops a parenthetical figure no read or page vouches for, and keeps the sentence around it', () => {
    const edit = {
      id: 's_6a0a0a',
      params: {},
      steps: [],
      reportTemplate: { summary: 'The Total (price × quantity) line is now $437.50 (previously $375.00).', values: { updated_total_amount: '$437.50' } },
    } as unknown as Skill;
    const report = synthesizeReport(edit, {}, { updated_total_amount: '$437.50' }, ['The Total (price × quantity) line', '- cell "$437.50"', 'is now']);
    expect(report.summary).toBe('The Total (price × quantity) line is now $437.50.');
  });

  // fwrd86 01-signin: "read 'ticket_title' returned a value the skill itself
  // set … dropped from the report's confident values" — and the report then
  // carried ticket_title from the template's "{{v4}}". The artifact never did.
  it('keeps an echo out of the report: the template does not refill what the guard dropped', () => {
    const signin = { id: 's_93ead3', params: {}, steps: [], reportTemplate: { summary: '', values: { ticket_title: '{{v4}}', ticket_status: '{{v5}}' } } } as unknown as Skill;
    const r = synthesizeReport(signin, { v4: 'fwrd86-n2 RD Bench Ticket', v5: 'Draft' }, {}, ['fwrd86-n2 RD Bench Ticket', 'Status Draft'], { withhold: ['ticket_title'] });
    expect(r.evidence?.values).toEqual({ ticket_status: 'Draft' });
  });
});

/**
 * A later step's reference to a template value (fwod74 06-open ←
 * 05-open.second_product_name, `"[FURN_6666] {{v7}}"`; fwrd72 09-report ←
 * 01-open.landing_page, `"{{v1}}#/tickets"`). The whole value where the page
 * shows its recorded text; else the one slot, which this run supplied; never
 * the recording's text. Compile's question (templateSource) is the same one.
 */
describe('observedSummary', () => {
  const page = ['Ticket RD-1016 archived', '- button "Unarchive ticket"', 'Parts 0'];
  it('drops a sentence whose main clause was not observed, and its parts with it', () => {
    const r = observedSummary('Ticket RD-1016 archived (Parts 0). Deleted both parts (Parts 0).', [], page);
    expect(r.text).toBe('Ticket RD-1016 archived (Parts 0).');
    expect(r.dropped).toEqual(['Deleted both parts (Parts 0).']);
  });

  it('keeps a standing sentence and drops only its unobserved parts', () => {
    const r = observedSummary('Ticket RD-1016 archived; total 15 — Parts 0 (previously 2).', [], page);
    expect(r.text).toBe('Ticket RD-1016 archived — Parts 0.');
  });

  it('never cuts inside quotes, and drops a clause that still holds a marker', () => {
    expect(observedSummary('Ticket "RD-1016; archived" archived.', [], page).text).toBe('Ticket "RD-1016; archived" archived.');
    expect(observedSummary('Ticket {{v1}} archived.', [], page).text).toBe('');
  });
});

describe('a consumed template value', () => {
  it('resolves to the whole value where the page shows it, else to its one slot', () => {
    expect(referenceValue('[FURN_6666] {{v7}}', { v7: 'Acoustic Bloc Screens' }, ['- cell "[FURN_6666] Acoustic Bloc Screens"'])).toBe('[FURN_6666] Acoustic Bloc Screens');
    expect(referenceValue('[FURN_6666] {{v7}}', { v7: 'Acoustic Bloc Screens' }, ['- heading "Quotations"'])).toBe('Acoustic Bloc Screens');
    expect(referenceValue('{{v1}}#/tickets', { v1: 'http://127.0.0.1:4180/' }, ['http://127.0.0.1:4180/#/tickets'])).toBe('http://127.0.0.1:4180/#/tickets');
  });

  it('resolves to nothing from two slots whose recorded text the page does not show, as compile says', () => {
    expect(referenceValue('{{v1}} created on 2026-09-23 by {{v2}}', { v1: 'RD-1016', v2: 'Bench' }, ['- cell "RD-1016"'])).toBeNull();
    expect(templateSource('{{v1}} created on 2026-09-23 by {{v2}}')).toBe(false);
    expect(templateSource('{{v1}} | {{v2}}')).toBe(true);
    expect(templateSource('[FURN_6666] {{v7}}')).toBe(true);
    expect(templateSource('RD-1017')).toBe(false);
  });
});
