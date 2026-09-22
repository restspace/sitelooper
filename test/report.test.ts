import { describe, expect, it } from 'vitest';
import { addEvidenceValue, backfillReadValues, flattenComposedValues, flattenProvenComposite, positionDatumKeys, promoteLabelledReads, proseIdentifiers, publishProseIdentifiers, unnamedReadValues, validateReport, type Report } from '../src/agent/report.js';

describe('report validation', () => {
  it('accepts a minimal valid report', () => {
    const v = validateReport({ status: 'success', summary: 'done' });
    expect(v.ok).toBe(true);
  });

  it('accepts full evidence', () => {
    const v = validateReport({
      status: 'failure',
      summary: 'count did not increment',
      details: 'expected 5, saw 4',
      evidence: {
        url: 'http://localhost:5173/organisations',
        capturedDialogs: ['confirm("Delete?") → accept'],
        values: { orgName: 'k7x2 MTP Supplies Ltd', count: 4, deleted: false, missing: null },
      },
    });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.report.evidence?.values).toEqual({ orgName: 'k7x2 MTP Supplies Ltd', count: 4, deleted: false });
  });

  it('rejects what cannot be repaired without guessing, with a readable error', () => {
    for (const bad of [
      { status: 'ok', summary: 'x' }, // not a status we can map without inventing intent
      { status: 'success' }, // no summary to salvage
      'not an object',
      42,
      null,
    ]) {
      const v = validateReport(bad);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.error.length).toBeGreaterThan(0);
    }
  });

  describe('near-miss repair', () => {
    it('flattens a list of ids where the schema wants one scalar', () => {
      const v = validateReport({
        status: 'success',
        summary: 'removed the items',
        evidence: { values: { removed: ['a', 'b', 'c'], count: 3 } },
      });
      expect(v.ok).toBe(true);
      if (!v.ok) return;
      expect(v.report.evidence!.values!.removed).toBe('a, b, c');
      expect(v.report.evidence!.values!.count).toBe(3);
      expect(v.coerced?.join(' ')).toMatch(/flattened to scalars: removed/);
    });

    it('drops stray keys rather than failing the whole report', () => {
      const v = validateReport({ status: 'success', summary: 'x', extra: 1 });
      expect(v.ok).toBe(true);
      if (!v.ok) return;
      expect((v.report as Record<string, unknown>).extra).toBeUndefined();
      expect(v.coerced?.join(' ')).toMatch(/unknown key\(s\) dropped: extra/);
    });

    it('normalises status case and wraps a lone dialog string', () => {
      const v = validateReport({
        status: 'Success',
        summary: 'x',
        evidence: { capturedDialogs: 'confirm: Remove this item?' },
      });
      expect(v.ok).toBe(true);
      if (!v.ok) return;
      expect(v.report.status).toBe('success');
      expect(v.report.evidence!.capturedDialogs).toEqual(['confirm: Remove this item?']);
    });

    it('truncates an over-long summary instead of rejecting it', () => {
      const v = validateReport({ status: 'failure', summary: 'y'.repeat(5000) });
      expect(v.ok).toBe(true);
      if (!v.ok) return;
      expect(v.report.summary.length).toBeLessThanOrEqual(2000);
      expect(v.coerced).toContain('summary truncated');
    });

    it('reports nothing as coerced when the payload was already valid', () => {
      const v = validateReport({ status: 'success', summary: 'clean' });
      expect(v.ok).toBe(true);
      if (!v.ok) return;
      expect(v.coerced).toBeUndefined();
    });
  });
});

describe('backfillReadValues', () => {
  it('promotes a read value cited in the summary but missing from evidence', () => {
    const report: Report = { status: 'success', summary: 'The dashboard is titled "Ops Overview" as expected.' };
    const added = backfillReadValues(report, [{ target: 'dashboard title', values: ['Ops Overview'] }]);
    expect(added).toEqual(['dashboard_title']);
    expect(report.evidence?.values).toEqual({ dashboard_title: 'Ops Overview' });
  });

  it('promotes read_all elements individually, only the cited ones', () => {
    const report: Report = { status: 'success', summary: 'Panels present.', details: 'Saw CPU Load and Memory among others.' };
    const added = backfillReadValues(report, [{ target: 'panel titles', values: ['CPU Load', 'Memory', 'Disk IO'] }]);
    expect(added).toEqual(['panel_titles', 'panel_titles_2']);
    expect(report.evidence?.values).toEqual({ panel_titles: 'CPU Load', panel_titles_2: 'Memory' });
  });

  it('skips values already present in evidence.values', () => {
    const report: Report = {
      status: 'success',
      summary: 'Title is Ops Overview.',
      evidence: { values: { title: 'Ops Overview' } },
    };
    const added = backfillReadValues(report, [{ target: 'heading', values: ['Ops Overview'] }]);
    expect(added).toEqual([]);
    expect(report.evidence?.values).toEqual({ title: 'Ops Overview' });
  });

  it('does not promote a read the prose never mentions', () => {
    const report: Report = { status: 'success', summary: 'Signed in fine.' };
    const added = backfillReadValues(report, [{ target: 'debug cell', values: ['a1b2c3'] }]);
    expect(added).toEqual([]);
    expect(report.evidence?.values).toBeUndefined();
  });

  it('requires token boundaries — a substring of a longer word is not a citation', () => {
    const report: Report = { status: 'success', summary: 'The page mentions Overviewing procedures.' };
    const added = backfillReadValues(report, [{ target: 'title', values: ['Overview'] }]);
    expect(added).toEqual([]);
  });

  it('matches values containing regex metacharacters literally', () => {
    const report: Report = { status: 'success', summary: 'Cost shown as $1.50 (net).' };
    const added = backfillReadValues(report, [{ target: 'price cell', values: ['$1.50 (net)'] }]);
    expect(added).toEqual(['price_cell']);
    expect(report.evidence?.values?.price_cell).toBe('$1.50 (net)');
  });

  it('ignores trivial values below the length floor', () => {
    const report: Report = { status: 'success', summary: 'Count is 4.' };
    const added = backfillReadValues(report, [{ target: 'count', values: ['4'] }]);
    expect(added).toEqual([]);
  });

  it('names collide into numbered suffixes rather than overwriting', () => {
    const report: Report = {
      status: 'success',
      summary: 'First row Alpha One, second row Beta Two.',
      evidence: { values: { row: 'existing' } },
    };
    const added = backfillReadValues(report, [
      { target: 'row', values: ['Alpha One'] },
      { target: 'row', values: ['Beta Two'] },
    ]);
    expect(added).toEqual(['row_2', 'row_3']);
    expect(report.evidence?.values).toEqual({ row: 'existing', row_2: 'Alpha One', row_3: 'Beta Two' });
  });
});
describe('a snapshot ref is not a value name', () => {
  it('does not promote a read whose target names nothing', () => {
    // fwgr10: a read on @e5322 was promoted as `e5322`, buildFlow minted
    // {{03-report.e5322}} into three later flow steps, and no replay resolved
    // it — the handle expires with the snapshot that issued it. Naming it
    // `value` instead stopped the dead reference but kept the noise: fwod18
    // published the column heading "Untaxed Amount" and the status badge
    // "New" as `value` and `value_2`, outputs no later step would ever name.
    // A value with no usable name is not published at all.
    const report = { status: 'success' as const, summary: 'The dashboard is named fwgr10-n2 Bench Dashboard.' };
    const added = backfillReadValues(report, [{ target: '@e5322', values: ['fwgr10-n2 Bench Dashboard'] }]);
    expect(added).toEqual([]);
    expect(report.evidence?.values ?? {}).toEqual({});
  });

  it('still publishes a prose-pinned identifier, which the caller named itself', () => {
    // addEvidenceValue's base comes from the CALLER ("ref"), not from a
    // selector, so the drop above must not reach it — that path is how a
    // record reference the model left in prose becomes threadable at all.
    const report: Report = { status: 'success', summary: 'Created S00021.' };
    expect(addEvidenceValue(report, 'ref', 'S00021')).toBe('ref');
    expect(report.evidence!.values!.ref).toBe('S00021');
  });

  it('keeps a selector-derived name, which does mean something', () => {
    const report = { status: 'success' as const, summary: 'Total is 437.50 on the page.' };
    const added = backfillReadValues(report, [{ target: '.parts_total', values: ['437.50'] }]);
    expect(added).toEqual(['parts_total']);
  });
});


describe('proseIdentifiers', () => {
  it('skips refs, ordinals and measurements so the real reference is not crowded out', () => {
    const report = { status: 'success' as const, summary: 'Clicked @e1234 on the 10th row (width 100px, took 30s) and confirmed order S00021.', evidence: { values: {} } };
    expect(proseIdentifiers(report)).toEqual(['S00021']);
  });

  it('does not cite a url as an identifier', () => {
    // fwrd44-n1's report: the host 127.0.0.1 passes the shape test, and
    // published as `ref` it would turn every later url into a reference.
    const report = {
      status: 'success' as const,
      summary: 'Created it; it appears in the list as RD-1128. Its detail view at http://127.0.0.1:4180/#/tickets/t15 shows status Draft.',
      evidence: { values: {} },
    };
    expect(proseIdentifiers(report)).toEqual(['RD-1128']);
  });
});

describe('publishProseIdentifiers', () => {
  it('publishes an identifier the page cannot pin, instead of leaving it as prose', async () => {
    // fwrd44-n1: RD-1128 shown twice on the detail page, pin refused, and the
    // literal rode into four flow instructions. Unpinned is still published.
    const report: Report = { status: 'success', summary: 'Ticket RD-1128 created; order S00021 linked.', evidence: { values: {} } };
    const out = await publishProseIdentifiers(report, async (v) => v === 'S00021');
    expect(out).toEqual({ pinned: ['ref_2'], unpinned: ['ref'] });
    expect(report.evidence?.values).toEqual({ ref: 'RD-1128', ref_2: 'S00021' });
  });

  it('keeps the citation when pinning throws', async () => {
    const report: Report = { status: 'success', summary: 'Ticket RD-1128 created.', evidence: { values: {} } };
    const out = await publishProseIdentifiers(report, async () => {
      throw new Error('page navigated');
    });
    expect(out.unpinned).toEqual(['ref']);
    expect(report.evidence?.values).toEqual({ ref: 'RD-1128' });
  });
});

describe('composed report values', () => {
  const of = (values: Record<string, string>): Report => ({
    status: 'success',
    summary: 'read the order lines',
    evidence: { values },
  });

  it('splits a JSON blob into the page values it was built from', () => {
    // fwod17's 03-open, verbatim. Nothing could pin that string on the page,
    // so six real reads were recorded unlabelled and four later steps lost
    // {{03-open.line_1#qty}} on every zero-model replay.
    const report = of({
      line_1: '{"product":"Customizable Desk","qty":"3.00","unit_price":"750.00"}',
      untaxed_amount: '2316.00',
    });
    const added = flattenComposedValues(report);
    expect(added).toEqual(['line_1_product', 'line_1_qty', 'line_1_unit_price']);
    expect(report.evidence?.values).toEqual({
      untaxed_amount: '2316.00',
      line_1_product: 'Customizable Desk',
      line_1_qty: '3.00',
      line_1_unit_price: '750.00',
    });
    // The composite is GONE: leaving it would leave the unreferencable form
    // available to reference.
    expect('line_1' in (report.evidence?.values ?? {})).toBe(false);
  });

  it('leaves a table alone, and leaves prose alone', () => {
    const rows = of({ rows: JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ n: String(i) }))) });
    expect(flattenComposedValues(rows)).toEqual([]);
    expect(rows.evidence?.values?.rows).toBeTypeOf('string');

    const prose = of({ note: '[see the totals section] the amount was 2316.00' });
    expect(flattenComposedValues(prose)).toEqual([]);
    expect(prose.evidence?.values?.note).toBe('[see the totals section] the amount was 2316.00');
  });

  it('names array elements by position and keeps existing names', () => {
    const report = of({ line_1_qty: 'taken', lines: '["A","B"]' });
    expect(flattenComposedValues(report)).toEqual(['lines_1', 'lines_2']);
    expect(report.evidence?.values).toEqual({ line_1_qty: 'taken', lines_1: 'A', lines_2: 'B' });
  });
});

describe('delimiter-joined report values (the page is the judge)', () => {
  const of = (values: Record<string, string>): Report => ({
    status: 'success',
    summary: 'opened the board',
    evidence: { values },
  });
  /** Stands in for captureReadBack: a page that shows exactly these strings. */
  const pageShowing = (...shown: string[]) => {
    const asked: string[] = [];
    const pin = async (value: string, name: string) => {
      asked.push(value);
      return shown.includes(value) ? { read: value, label: name } : null;
    };
    return { pin, asked };
  };

  it('splits a joined list every part of which the page shows', async () => {
    // kanboard fwkb17's 01-open, verbatim. The recording scored 6/6 reporting
    // four scalars; this round's agent joined them and both replays scored 5/6
    // with `obj 1: FAIL — column(s) not in report: Ready, Done`.
    const report = of({ columns_left_to_right: 'Backlog, Ready, Work in progress, Done' });
    const page = pageShowing('Backlog', 'Ready', 'Work in progress', 'Done');
    const { names, pinned } = await flattenProvenComposite(report, 'columns_left_to_right', page.pin);
    expect(names).toEqual([
      'columns_left_to_right_1',
      'columns_left_to_right_2',
      'columns_left_to_right_3',
      'columns_left_to_right_4',
    ]);
    // Each part is a real read the page vouched for, carrying the part's name.
    expect(pinned).toEqual([
      { read: 'Backlog', label: 'columns_left_to_right_1' },
      { read: 'Ready', label: 'columns_left_to_right_2' },
      { read: 'Work in progress', label: 'columns_left_to_right_3' },
      { read: 'Done', label: 'columns_left_to_right_4' },
    ]);
    expect(report.evidence?.values).toEqual({
      columns_left_to_right_1: 'Backlog',
      columns_left_to_right_2: 'Ready',
      columns_left_to_right_3: 'Work in progress',
      columns_left_to_right_4: 'Done',
    });
  });

  it('refuses the split when the page does not show every part', async () => {
    // Prose that merely contains commas. Its "parts" pin nothing, so the
    // delimiter is exactly as unauthoritative as it should be.
    const raw = 'the board opened cleanly, the columns were already in place, nothing was moved';
    const report = of({ note: raw });
    const page = pageShowing('the board opened cleanly');
    const { names, pinned } = await flattenProvenComposite(report, 'note', page.pin);
    expect(names).toEqual([]);
    expect(pinned).toEqual([]);
    expect(report.evidence?.values).toEqual({ note: raw });
    // And it stops at the first part the page will not vouch for, rather than
    // asking about all of them.
    expect(page.asked).toEqual(['the board opened cleanly', 'the columns were already in place']);
  });

  it('splits on slashes and dashes too, and not on a value with no join', async () => {
    const slashes = of({ columns: 'Backlog / Ready / Done' });
    expect((await flattenProvenComposite(slashes, 'columns', pageShowing('Backlog', 'Ready', 'Done').pin)).names)
      .toEqual(['columns_1', 'columns_2', 'columns_3']);

    const dashes = of({ range: 'Request rate — Error count' });
    expect((await flattenProvenComposite(dashes, 'range', pageShowing('Request rate', 'Error count').pin)).names)
      .toEqual(['range_1', 'range_2']);

    const scalar = of({ total: '2316.00' });
    const page = pageShowing('2316.00');
    expect((await flattenProvenComposite(scalar, 'total', page.pin)).names).toEqual([]);
    expect(page.asked).toEqual([]); // one part is not a join: the page is never asked
    expect(scalar.evidence?.values).toEqual({ total: '2316.00' });
  });

  it('keeps the MAX_LEAVES cap: a table is not a record', async () => {
    const many = Array.from({ length: 9 }, (_, i) => `Col ${i + 1}`);
    const report = of({ columns: many.join(', ') });
    const page = pageShowing(...many);
    expect((await flattenProvenComposite(report, 'columns', page.pin)).names).toEqual([]);
    expect(page.asked).toEqual([]);
    expect(report.evidence?.values?.columns).toBe(many.join(', '));
  });

  it('does not collide with a name already taken, or with a sibling', async () => {
    const report = of({ columns_1: 'taken', columns: 'Backlog, Done' });
    const { names } = await flattenProvenComposite(report, 'columns', pageShowing('Backlog', 'Done').pin);
    expect(names).toEqual(['columns_1_2', 'columns_2']);
    expect(report.evidence?.values).toEqual({ columns_1: 'taken', columns_1_2: 'Backlog', columns_2: 'Done' });
  });

  it('does nothing for a key the report does not carry', async () => {
    const report = of({ a: 'x, y' });
    expect((await flattenProvenComposite(report, 'missing', pageShowing('x', 'y').pin)).names).toEqual([]);
  });
});

describe('unnamedReadValues', () => {
  it('names the values the report described but did not label', () => {
    const report: Report = { status: 'success', summary: 'Saved quotation S00021 with unit price 85.00.' };
    expect(unnamedReadValues(report, [
      { target: 'h1', values: ['S00021'] },
      { target: '[name="price_unit"]', values: ['85.00'] },
    ])).toEqual(['S00021', '85.00']);
  });

  it('asks for nothing when the model already named the value', () => {
    const report: Report = {
      status: 'success',
      summary: 'Saved quotation S00021.',
      evidence: { values: { quotation_reference: 'S00021' } },
    };
    expect(unnamedReadValues(report, [{ target: 'h1', values: ['S00021'] }])).toEqual([]);
  });

  it('asks about a value the read returned even when the prose never quotes it', () => {
    // The trigger is what the READ returned, not what the summary happens to
    // repeat. Keyed on prose, the ask fired on 3 of 27 recorded instructions
    // (and was answered 3 times out of 3) — a summary like this one is the
    // common case, not the odd one.
    const report: Report = { status: 'success', summary: 'Saved the quotation.' };
    expect(unnamedReadValues(report, [{ target: 'h1', values: ['S00021'] }])).toEqual(['S00021']);
  });

  it('leaves read_all bulk alone — a table of cells is not values the caller needs named', () => {
    const report: Report = { status: 'success', summary: 'Listed the orders.' };
    expect(unnamedReadValues(report, [{ target: 'td', values: ['S00021', 'S00022', 'S00023'] }])).toEqual([]);
  });

  it('still honours the citation filter when a caller asks for it', () => {
    const report: Report = { status: 'success', summary: 'Saved the quotation.' };
    expect(unnamedReadValues(report, [{ target: 'h1', values: ['S00021'] }], { requireCitation: true })).toEqual([]);
  });

  it('never holds a blocked or failed report', () => {
    const report: Report = { status: 'blocked', summary: 'Stuck after reading S00021.' };
    expect(unnamedReadValues(report, [{ target: 'h1', values: ['S00021'] }])).toEqual([]);
  });
});

describe('citation matching', () => {
  it('promotes a page value the prose respaced', () => {
    // fwod25 instr 5: the totals read "£ 1,599.00", the summary wrote "£1,599.00".
    const report: Report = { status: 'success', summary: 'The Untaxed Amount updated to £1,599.00.' };
    expect(unnamedReadValues(report, [{ target: '@e1918', values: ['£ 1,599.00'] }])).toEqual(['£ 1,599.00']);
  });

  it('still refuses a value the prose does not contain, under the citation filter', () => {
    // backfillReadValues invents a name unilaterally, so it keeps needing proof
    // the read mattered. Only the ASK dropped that requirement.
    const report: Report = { status: 'success', summary: 'The Untaxed Amount updated to £99.00.' };
    expect(unnamedReadValues(report, [{ target: '@e1918', values: ['£ 1,599.00'] }], { requireCitation: true })).toEqual([]);
    expect(backfillReadValues({ ...report }, [{ target: 'total', values: ['£ 1,599.00'] }])).toEqual([]);
  });
});

describe('promoteLabelledReads', () => {
  it('publishes a labelled read under the model name and suppresses the ask', () => {
    const report: Report = { status: 'success', summary: 'Confirmed the quotation.' };
    const reads = [{ target: '@e123', values: ['S00021'], label: 'order_reference' }];
    expect(promoteLabelledReads(report, reads)).toEqual(['order_reference']);
    expect(report.evidence?.values).toEqual({ order_reference: 'S00021' });
    // Already named at read time: the naming retry has nothing to ask about.
    expect(unnamedReadValues(report, reads)).toEqual([]);
  });

  it('the label wins over the selector slug backfill would derive', () => {
    const report: Report = { status: 'success', summary: 'Quotation S00021 confirmed.' };
    const reads = [{ target: 'h1', values: ['S00021'], label: 'order_reference' }];
    promoteLabelledReads(report, reads);
    backfillReadValues(report, reads);
    // One name, the model's — not a duplicate h1 entry from the backfill.
    expect(report.evidence?.values).toEqual({ order_reference: 'S00021' });
  });

  it('ignores bulk reads, present values, and reads without labels', () => {
    const report: Report = {
      status: 'success',
      summary: 'Read the table.',
      evidence: { values: { total: '85.00' } },
    };
    expect(
      promoteLabelledReads(report, [
        { target: 'td', values: ['a', 'b'], label: 'rows' },
        { target: '@e5', values: ['85.00'], label: 'unit_price' },
        { target: '@e6', values: ['SO-99'] },
      ]),
    ).toEqual([]);
    expect(report.evidence?.values).toEqual({ total: '85.00' });
  });

  it('an unusable label falls back rather than dropping the value', () => {
    const report: Report = { status: 'success', summary: 'ok' };
    expect(promoteLabelledReads(report, [{ target: '@e1', values: ['S00021'], label: '@@@' }])).toEqual(['value']);
    expect(report.evidence?.values).toEqual({ value: 'S00021' });
  });
});

// fwgh8 01-open: the model keyed its report by the seed titles it had read.
describe('positionDatumKeys', () => {
  const reads = [
    { target: 'h3, .gh-content-entry-title', values: ['Seed: House style guide', 'New members', 'Seed: Welcome to the bench'] },
    { target: '.gh-badge', values: ['Published', 'Published'] },
  ];

  it('makes a key the page showed into positional data, keeping its value beside it', () => {
    const report: Report = {
      status: 'success',
      summary: 'two seed posts, both published',
      evidence: { values: { seed_post_count: '2', 'Seed: House style guide': 'Published', 'Seed:  Welcome to the bench ': 'Published' } },
    };
    expect(positionDatumKeys(report, reads)).toEqual(['Seed: House style guide', 'Seed:  Welcome to the bench ']);
    expect(report.evidence!.values).toEqual({
      seed_post_count: '2',
      item_1: 'Seed: House style guide',
      item_1_value: 'Published',
      item_2: 'Seed: Welcome to the bench',
      item_2_value: 'Published',
    });
  });

  it('leaves a name alone, however its value was read, and a key no read returned', () => {
    const report: Report = { status: 'success', summary: 'ok', evidence: { values: { status: 'Published', 'Seed: Never read': 'Draft' } } };
    expect(positionDatumKeys(report, reads)).toEqual([]);
    expect(report.evidence!.values).toEqual({ status: 'Published', 'Seed: Never read': 'Draft' });
  });

  it('never takes a positional name the report already uses', () => {
    const report: Report = { status: 'success', summary: 'ok', evidence: { values: { item_1: 'x', 'New members': 'Free' } } };
    positionDatumKeys(report, reads);
    expect(report.evidence!.values).toEqual({ item_1: 'x', item_2: 'New members', item_2_value: 'Free' });
  });
});
