import { describe, expect, it } from 'vitest';
import { readShadowFinding, readShadowLines, readWords, shadowReadLabels, shadowReadTemplates } from '../src/execution/shadow.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';

describe('readShadowFinding', () => {
  it('flags a fixed literal the replay read otherwise (odoo fwod98 s_b90c3c status)', () => {
    expect(readShadowFinding('status', 'Cancelled', {}, 'Sales Order')).toBe('label status read "Sales Order", recorded template "Cancelled"');
    expect(readShadowFinding('labels_picker_expanded', 'true', {}, 'false')).not.toBeNull();
    expect(readShadowFinding('status', 'Cancelled', {}, 'Cancelled')).toBeNull();
  });

  it("fills this run's slots, and flags a slot-filled mismatch (grafana fwgr50 panel title)", () => {
    const why = readShadowFinding('panel_title_notes', '{{v2}} Notes', { v2: 'fwgr50-n3' }, 'fwgr50-n3 Availability');
    expect(why).toBe('label panel_title_notes read "fwgr50-n3 Availability", recorded template "{{v2}} Notes" = "fwgr50-n3 Notes" this run');
    expect(readShadowFinding('panel_title_notes', '{{v2}} Notes', { v2: 'fwgr50-n3' }, 'fwgr50-n3 Notes')).toBeNull();
  });

  it('flags a read that is only part of the template (fwod98 statusbar_2 without "Cancelled")', () => {
    const t = 'Cancelled\n{{v4}}\nQuotation Sent\nQuotation';
    expect(readShadowFinding('statusbar_2', t, { v4: 'Sales Order' }, 'Sales Order\nQuotation Sent\nQuotation')).not.toBeNull();
    expect(readShadowFinding('statusbar_2', t, { v4: 'Sales Order' }, 'Cancelled\nSales Order\nQuotation Sent\nQuotation')).toBeNull();
  });

  it('accepts a read whose element shows more around the recorded value', () => {
    expect(readShadowFinding('column', 'Ready', {}, 'Backlog | Ready | Work in progress')).toBeNull();
    expect(readShadowFinding('runid', '{{v1}}', { v1: 'fwgh4-n2' }, 'fwgh4-n2 Bench Post')).toBeNull();
  });

  it('gives no judgement for frames, derived slots, wildcards, env markers, unknown or empty slots', () => {
    expect(readShadowFinding('so_id', 'S000{{=}}', {}, 'S00023')).toBeNull();
    expect(readShadowFinding('amount', '{{=}}.00', {}, '1,250,012,500.00')).toBeNull();
    expect(readShadowFinding('id', '{{d1}}', { d1: '7' }, '9')).toBeNull();
    expect(readShadowFinding('when', 'Updated {{*}}', {}, 'Created')).toBeNull();
    expect(readShadowFinding('pw', '{{env:APP_PASSWORD}}', {}, 'x')).toBeNull();
    expect(readShadowFinding('name', '{{v9}}', {}, 'x')).toBeNull();
    expect(readShadowFinding('name', '{{v1}} Bench', { v1: '' }, 'x')).toBeNull();
    // a param still carrying a marker (an unresolved secret) fills to a marker
    expect(readShadowFinding('pw', '{{v1}}', { v1: '{{env:APP_PASSWORD}}' }, 'x')).toBeNull();
  });

  it('gives no judgement where nothing was read', () => {
    expect(readShadowFinding('status', 'Cancelled', {}, undefined)).toBeNull();
    expect(readShadowFinding('status', 'Cancelled', {}, '')).toBeNull();
    expect(readShadowFinding('status', 'Cancelled', {}, '  \n ')).toBeNull();
  });

  it('compares numbers by value: formatting alone never flags', () => {
    expect(readShadowFinding('amount', '{{v3}}', { v3: '12500' }, '12,500')).toBeNull();
    expect(readShadowFinding('amount', '{{v3}}', { v3: '12500' }, '12,500.00')).toBeNull();
    expect(readShadowFinding('amount', '{{v3}}', { v3: '12500' }, '1,250,012,500')).not.toBeNull();
  });

  it("judges recorded numbers only when they are this run's params (EspoCRM fwec10's amount)", () => {
    // 12,500 is the amount the run typed (12500): the template is fixed.
    expect(readShadowFinding('amount_view', '$12,500.00', { v4: '12500' }, '$1,250,012,500.00')).not.toBeNull();
    expect(readShadowFinding('amount_view', '$12,500.00', { v4: '12500' }, '$12,500.00')).toBeNull();
    // Any other recorded number is the recording's moment: a minted id, a clock, a total.
    expect(readShadowFinding('issue_number', '#4', {}, '#5')).toBeNull();
    expect(readShadowFinding('ref', 'S00021', {}, 'S00023')).toBeNull();
    expect(readShadowFinding('due', 'Due date: 12/31/2026 18:07', {}, 'Due date: 12/31/2026 18:10')).toBeNull();
    // ...but a number inside a slot's own value is this run's, and judged.
    expect(readShadowFinding('subtotal', '£ {{v6}}', { v6: '70.00' }, '£ 140.00')).not.toBeNull();
  });

  it('leaves urls alone', () => {
    expect(readShadowFinding('initial_page_url', 'about:blank', {}, 'http://127.0.0.1:8069/web/login')).toBeNull();
    expect(readShadowFinding('landing', '{{v1}}?first_time_user=true', { v1: 'http://h/' }, 'http://h/')).toBeNull();
  });

  it('gives no judgement on an in-progress status, either side (Ghost "Saving..." vs "Draft - Saved")', () => {
    expect(readShadowFinding('post_status', 'Draft - Saved', {}, 'Saving...')).toBeNull();
    expect(readShadowFinding('save_status_final', 'Saving...', {}, 'Draft - Saved')).toBeNull();
    expect(readShadowFinding('header', 'Posts\nDraft - Saved\nPreview\nPublish', {}, 'Posts\nSaving...\nPreview\nPublish')).toBeNull();
    expect(readShadowFinding('s', 'Ready', {}, 'Loading…')).toBeNull();
    // a word alone, with no ellipsis, is not a progress status
    expect(readShadowFinding('post_status', 'Draft - Saved', {}, 'Saving failed')).not.toBeNull();
    expect(readShadowFinding('post_status', 'Draft - Saved', {}, 'Published')).not.toBeNull();
  });

  it('agrees on the same words in another order, never on a word missing or extra (GitHub-like fwgt16)', () => {
    expect(readShadowFinding('timeline_item_2', 'admin added the \npriority-high\nbug\n labels', {}, 'admin added the \nbug\npriority-high\n labels')).toBeNull();
    expect(readShadowFinding('t', 'admin added the bug label', {}, 'admin added the \nbug\npriority-high\n labels')).not.toBeNull();
    expect(readShadowFinding('t', 'admin added the \npriority-high\nbug\n labels', {}, 'admin added the \nbug\n labels')).not.toBeNull();
    expect(readShadowFinding('t', 'bug bug feature', {}, 'feature bug feature')).not.toBeNull();
  });

  it("gives no judgement where a whole-slot template was bound to something not of the read's kind", () => {
    // a whole table row bound where the read is one cell (Odoo fwod50, fwod39)
    const row = ' | [FURN_6666] Acoustic Bloc Screens | [FURN_6666] Acoustic Bloc Screens | 3.00 | 295.00 | 20% | £ 885.00 | ';
    expect(readShadowFinding('first_line_product', '{{v4}}', { v4: row }, '[FURN_6666] Acoustic Bloc Screens')).toBeNull();
    expect(readShadowFinding('first_line_product', '{{v4}}', { v4: row }, row.replace('3.00', '5.00'))).toBeNull();
    expect(readShadowFinding('line2_product', '{{v6}}', { v6: '[FURN_7777] Office Chair 1.00 70.00' }, '[FURN_7777] Office Chair')).toBeNull();
    // a param that was never a value (Odoo fwod47)
    expect(readShadowFinding('unit_price', '{{v6}}', { v6: 'null' }, '85.00')).toBeNull();
    // a minted reference against the run id or a page title (RepairDesk fwrd49, Odoo fwod48)
    expect(readShadowFinding('ticket_reference', '{{v3}}', { v3: 'fwrd49-n3' }, 'RD-1019')).toBeNull();
    expect(readShadowFinding('so_reference', '{{v3}}', { v3: 'Quotations' }, 'S00022')).toBeNull();
  });

  it("still judges a whole-slot template bound to a value of the read's kind", () => {
    // ERPNext fwen2: the item the run chose, read as another
    expect(readShadowFinding('item_name_1', '{{v2}}', { v2: 'Bench Widget' }, 'Bench Gadget')).not.toBeNull();
    // a minted reference bound to a minted reference, read as another
    expect(readShadowFinding('ref', '{{v3}}', { v3: 'RD-1017' }, 'RD-1019')).not.toBeNull();
    // a slot with more around it is not a whole-slot binding
    expect(readShadowFinding('title', '{{v1}} Bench', { v1: 'Bench Task | x' }, 'Other')).not.toBeNull();
    // the slot's value neither contains the read nor is a list
    expect(readShadowFinding('part_name', '{{v4}}', { v4: 'fwrd53-n3 RD Part B' }, 'fwrd53-n3 RD Part A')).not.toBeNull();
    expect(readShadowFinding('part_name', '{{v4}}', { v4: 'fwrd53-n3 RD Part A' }, 'No parts on this ticket yet.')).not.toBeNull();
  });

  it('compares multi-line and list reads by their words', () => {
    expect(readWords('Sales Order\nQuotation Sent\n  Quotation')).toEqual(['sales', 'order', 'quotation', 'sent', 'quotation']);
    expect(readShadowFinding('s', 'Seed: A, Seed: B', {}, 'Seed: A | Seed: B')).toBeNull();
    expect(readShadowFinding('s', 'TAX 20%\t\n£ 351.00', { v: '20', w: '351' }, 'TAX 20%  £ 351.00')).toBeNull();
    expect(readShadowFinding('s', 'OVERVIEW', {}, 'Overview')).toBeNull();
    // a node's text run into its neighbour's still splits into words
    expect(readShadowFinding('d', '{{v4}}', { v4: 'Bench task for run fwvk1-n2' }, 'Bench task for run fwvk1-n2Bench task for run fwvk1-n2')).toBeNull();
  });
});

describe('readShadowLines', () => {
  const steps = [
    { tool: 'click' },
    { tool: 'read', label: 'status' },
    { tool: 'read', label: 'customer' },
    { tool: 'read', label: 'status' },
    { tool: 'read' },
    { tool: 'loop', label: 'ignored' },
  ];

  it('numbers each label by the last top-level read of it', () => {
    expect(shadowReadLabels(steps)).toEqual({ status: 4, customer: 3 });
  });

  it('merges the chain from this segment on, later members overriding', () => {
    expect(shadowReadTemplates([{ reportTemplate: { values: { a: '1', b: '2' } } }, {}, { reportTemplate: { values: { b: '3' } } }])).toEqual({ a: '1', b: '3' });
  });

  it('judges read, templated, non-echoed labels only', () => {
    const lines = readShadowLines(shadowReadLabels(steps), { status: 'Cancelled', customer: '{{v2}}', other: 'x' }, { v2: 'fwod98-n3 Bench Customer' }, { status: 'Sales Order', customer: 'someone else', other: 'y' }, ['customer']);
    expect(lines).toEqual(['[shadow:read] step 4: label status read "Sales Order", recorded template "Cancelled"']);
  });

  it('drops sibling labels that swapped values (GitHub-like fwgt16 sidebar labels)', () => {
    const labels = { sidebar_label_priority_high: 2, sidebar_label_bug: 3, status: 4 };
    const templates = { sidebar_label_priority_high: 'priority-high', sidebar_label_bug: 'bug', status: 'Open' };
    expect(readShadowLines(labels, templates, {}, { sidebar_label_priority_high: 'bug', sidebar_label_bug: 'priority-high', status: 'Open' }, [])).toEqual([]);
    // a swap does not hide a sibling's own wrong value
    expect(readShadowLines(labels, templates, {}, { sidebar_label_priority_high: 'bug', sidebar_label_bug: 'priority-high', status: 'Closed' }, [])).toEqual([
      '[shadow:read] step 4: label status read "Closed", recorded template "Open"',
    ]);
  });

  it('still flags siblings that read the same wrong value, or only half a swap', () => {
    const labels = { a: 1, b: 2 };
    const templates = { a: '{{v1}} RD Part A', b: '{{v1}} RD Part B' };
    const params = { v1: 'fwrd55-n3' };
    expect(readShadowLines(labels, templates, params, { a: 'fwrd55-n3 RD Part A', b: 'fwrd55-n3 RD Part A' }, [])).toHaveLength(1);
    expect(readShadowLines(labels, { a: 'bug', b: 'priority-high' }, {}, { a: 'priority-high', b: 'enhancement' }, [])).toHaveLength(2);
    expect(readShadowLines(labels, { a: 'bug', b: 'priority-high' }, {}, { a: 'priority-high', b: 'priority-high' }, [])).toHaveLength(1);
  });
});

describe('the artifact', () => {
  const flow = (report: Record<string, string>): SpecFlow =>
    ({
      version: 1,
      name: 'shadow',
      origin: 'http://127.0.0.1:1',
      startUrl: 'http://127.0.0.1:1/',
      vars: [],
      steps: [
        {
          id: '01-open',
          instruction: 'Open the order and report its status',
          params: {},
          outputs: ['status'],
          segments: [
            {
              id: 's_aaaaaa',
              template: 'Open the order',
              params: {},
              preconditions: { urlPattern: 'http://127.0.0.1:1/' },
              steps: [{ tool: 'read', args: { target: '#status', what: 'text' }, label: 'status', locators: { target: [{ kind: 'css', selector: '#status' }] } }],
              report: { summary: '', values: report },
            },
          ],
        },
      ],
    }) as unknown as SpecFlow;

  it("checks a segment's reads against its fixed templates, printing [sitelooper shadow]", () => {
    const out = emitFlowFile(flow({ status: 'Cancelled' }), { tier: 'plain' }).source;
    expect(out).toContain('if (shadowEnabled()) for (const line of readShadowLines({"status":1}, {"status":"Cancelled"}, p,');
    expect(out).toContain("console.log('[sitelooper shadow] 01-open s_aaaaaa: ' + line)");
    expect(out).toContain('function readShadowLines(');
  });

  it('carries nothing where no read has a template', () => {
    const out = emitFlowFile(flow({ other: 'x' }), { tier: 'plain' }).source;
    expect(out).not.toContain('readShadowLines(');
  });
});
