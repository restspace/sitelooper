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
