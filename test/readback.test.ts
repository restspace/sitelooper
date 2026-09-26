import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import {
  MAX_CANDIDATES,
  READ_BACK_MAX_VALUE_CHARS,
  describeOutcome,
  displayersOf,
  displays,
  sourceReadBacks,
  type DisplayCandidate,
  type ReadBackTarget,
} from '../src/agent/readback.js';
import type { RecordedStep } from '../src/daemon/recorder.js';

/**
 * Site C's code decider (notes/PLAN-jev.md). Everything here is the SEARCH and the
 * cascade around it; what the page-side sweep actually finds is checked by the
 * browser-backed block at the bottom, because only a real page can answer
 * "which element displays this".
 */

const el = (path: string, text: string, over: Partial<DisplayCandidate> = {}): DisplayCandidate => ({
  path,
  text,
  kind: 'text',
  tag: 'td',
  ...over,
});

describe('what counts as displaying a value', () => {
  it('takes the fold as the one rule for "same value"', () => {
    expect(displays('Bench Supplies Ltd', 'bench supplies ltd')).toBe('exact');
    expect(displays('  Showing 1–10\n  of 13 ', 'Showing 1–10 of 13')).toBe('exact');
    expect(displays('$125.00', '$125.00')).toBe('exact');
  });

  it('accepts a wrapper that carries the value on its own rendered line', () => {
    // The model path's own allowance: a label, a unit, a sibling cell.
    expect(displays('Customer: Bench Test Customer · Raised 2026-09-18', '2026-09-18')).toBe('line');
    expect(displays('Folder: Bench', 'Bench')).toBe('line');
  });

  it('refuses a line that runs a document past its value (fwgr56)', () => {
    // grafana's dashboard JSON: one <pre>, one line, 2,236 characters. Every
    // reported value was "contained" in it, and seventeen reads of the whole
    // body is what the replay published.
    const body = `{"title":"Bench","panels":[${'{"id":1,"type":"timeseries","title":"latency"},'.repeat(40)}]}`;
    expect(displays(body, 'Bench')).toBe(null);
  });

  it('refuses a short value inside a longer line, and keeps it when the element shows nothing else', () => {
    // Kanboard ids are one digit and grafana's panel_count is "3":
    // captureReadBack dropped its length floor to 1 so the page's own count
    // could decide those. Inside a longer line there is no such count.
    expect(displays('3', '3')).toBe('exact');
    expect(displays('Qty 3', '3')).toBe(null);
    expect(displays('$100.00', '1')).toBe(null);
  });

  it('refuses a value that is only part of a token', () => {
    expect(displays('Part fwrd54-n10 has no supplier', 'fwrd54-n1')).toBe(null);
    expect(displays('total RD-10159 due', 'RD-1015')).toBe(null);
    expect(displays('Ticket RD-1015 is ready', 'RD-1015')).toBe('line');
  });

  it('refuses prose the read-back ceiling refuses anyway', () => {
    const prose = 'x'.repeat(READ_BACK_MAX_VALUE_CHARS + 1);
    expect(displays(prose, prose)).toBe(null);
  });

  it('keeps its ceiling equal to the recorder\'s literal', () => {
    // captureReadBack / captureReadBackAt spell it as a literal; recorder.ts
    // is a module this change may only add `export` keywords to, so the two
    // are held together here rather than shared.
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const src = fs.readFileSync(path.join(root, 'src/daemon/recorder.ts'), 'utf8');
    expect(src).toContain(`want.length > ${READ_BACK_MAX_VALUE_CHARS}`);
    expect(src).toContain(`const READ_BACK_LINE_ALLOWANCE = ${READ_BACK_MAX_VALUE_CHARS}`);
  });
});

describe('which elements are on the ballot', () => {
  it('finds the one element that shows the value', () => {
    const found = displayersOf([el('html > td:nth-child(1)', '$125.00'), el('html > td:nth-child(2)', '25%')], '$125.00');
    expect(found.map((c) => c.path)).toEqual(['html > td:nth-child(1)']);
  });

  it('prefers the smallest element over the row that merely contains it', () => {
    const row = el('html > tr:nth-child(2)', 'fwrd Part A\t$100.00\t25%', { tag: 'tr' });
    const cell = el('html > tr:nth-child(2) > td:nth-child(2)', '$100.00');
    expect(displayersOf([row, cell], '$100.00').map((c) => c.path)).toEqual([cell.path]);
  });

  it('prefers an exact displayer over one that only carries the value', () => {
    const cell = el('html > td:nth-child(1)', 'RD-1021');
    const crumb = el('html > nav:nth-child(1)', 'Tickets / RD-1021', { tag: 'nav' });
    expect(displayersOf([crumb, cell], 'RD-1021').map((c) => c.path)).toEqual([cell.path]);
  });

  it('keeps every sibling that shows it — that is the ambiguity Jev is for', () => {
    const partB = el('html > tr:nth-child(3) > td:nth-child(6)', '$250.00', { row: 'Part B $200.00 25% 1 No supplier $250.00' });
    const total = el('html > tr:nth-child(4) > td:nth-child(2)', '$250.00', { row: 'Total (price × quantity) $250.00' });
    expect(displayersOf([partB, total], '$250.00')).toHaveLength(2);
  });

  it('finds nothing when nothing shows it', () => {
    expect(displayersOf([el('html > p:nth-child(1)', 'No parts on this ticket yet.')], 'RD-1021')).toEqual([]);
  });
});

// --- the cascade -------------------------------------------------------------

/** A page whose sweep is scripted: what the harvest found, per value. */
function pageShowing(byValue: Record<string, { items?: DisplayCandidate[]; extra?: number }>): Page {
  const frame = {
    evaluate: async (_fn: unknown, payload: { wants: string[]; max: number }) =>
      payload.wants.map((want) => ({
        want,
        items: byValue[want]?.items ?? [],
        extra: byValue[want]?.extra ?? 0,
      })),
  };
  return { frames: () => [frame], mainFrame: () => frame, url: () => 'http://127.0.0.1:4180/#/tickets/t15' } as unknown as Page;
}

const step = (value: string): RecordedStep =>
  ({ k: 'step', tool: 'read', args: { target: '(read-back)', what: 'text' }, locators: { target: { expr: 'x', verified: true, raw: '(read-back)' } }, result: JSON.stringify(value) }) as unknown as RecordedStep;

const pinning = () => {
  const calls: Array<{ value: string; selector: string }> = [];
  return {
    calls,
    pin: async (value: string, selector: string) => {
      calls.push({ value, selector });
      return step(value);
    },
  };
};

const targets = (...pairs: Array<[string, string]>): ReadBackTarget[] => pairs.map(([name, value]) => ({ name, value }));

describe('the read-back cascade', () => {
  it('sources an unambiguous value with no decider and no model, and labels the step', async () => {
    const pin = pinning();
    const out = await sourceReadBacks(targets(['part_cost', '$125.00']), pageShowing({ '$125.00': { items: [el('html > td:nth-child(2)', '$125.00')] } }), {
      instruction: 'add a part',
      pin: pin.pin,
    });
    expect(out.byCode).toEqual(['part_cost']);
    expect(out.remaining).toEqual([]);
    expect(pin.calls).toEqual([{ value: '$125.00', selector: 'html > td:nth-child(2)' }]);
    // The evidence KEY travels with the step, so compile does not have to
    // recover it by matching the result against every reported value.
    expect(out.steps[0].label).toBe('part_cost');
  });

  it('drops prose without looking at the page: the verifier refuses it on length', async () => {
    const prose = 'none observed — no toast appeared; the change was shown by the status value changing from Draft to Ready';
    const out = await sourceReadBacks(targets(['confirmation_message', prose]), pageShowing({}), { instruction: 'mark ready', pin: pinning().pin });
    expect(out.dropped).toEqual([{ name: 'confirmation_message', value: prose, why: 'prose' }]);
    expect(out.remaining).toEqual([]);
  });

  it('drops a value no node on the page contains: no selector could pass either', async () => {
    const out = await sourceReadBacks(targets(['screenshot', 'ticket-RD-1021-detail.png']), pageShowing({}), {
      instruction: 'open the ticket',
      pin: pinning().pin,
    });
    expect(out.dropped).toEqual([{ name: 'screenshot', value: 'ticket-RD-1021-detail.png', why: 'absent' }]);
    expect(out.remaining).toEqual([]);
  });

  it('keeps a value for the model when an occurrence exists that code cannot offer', async () => {
    // Inside a shadow root, in another frame, or unrendered: code cannot point
    // at it, so absence is not proven and the model keeps its turn.
    const out = await sourceReadBacks(targets(['ref', 'RD-1021']), pageShowing({ 'RD-1021': { extra: 1 } }), {
      instruction: 'open the ticket',
      pin: pinning().pin,
    });
    expect(out.dropped).toEqual([]);
    expect(out.remaining.map((t) => t.name)).toEqual(['ref']);
  });

  it('leaves an ambiguous value to the model when there is no decider', async () => {
    const items = [el('html > tr:nth-child(3) > td:nth-child(6)', '$250.00'), el('html > tr:nth-child(4) > td:nth-child(2)', '$250.00')];
    const out = await sourceReadBacks(targets(['new_part_price', '$250.00']), pageShowing({ '$250.00': { items } }), {
      instruction: 'add part B',
      pin: pinning().pin,
    });
    expect(out.askedDecider).toBe(false);
    expect(out.remaining.map((t) => t.name)).toEqual(['new_part_price']);
  });

  it('asks the decider only about the ambiguous values, and only about the elements on the ballot', async () => {
    const items = [el('html > tr:nth-child(3) > td:nth-child(6)', '$250.00'), el('html > tr:nth-child(4) > td:nth-child(2)', '$250.00')];
    const asks: unknown[] = [];
    const out = await sourceReadBacks(
      targets(['new_part_price', '$250.00'], ['part_markup', '25%'], ['screenshot', 'two-parts.png']),
      pageShowing({ '$250.00': { items }, '25%': { items: [el('html > td:nth-child(3)', '25%')] } }),
      {
        instruction: 'add part B',
        pin: pinning().pin,
        decider: async (askInput) => {
          asks.push(askInput);
          return [{ name: 'new_part_price', value: '$250.00', path: items[0].path }];
        },
      },
    );
    expect(asks).toHaveLength(1);
    expect((asks[0] as { items: Array<{ name: string }> }).items.map((i) => i.name)).toEqual(['new_part_price']);
    expect(out.byCode).toEqual(['part_markup']);
    expect(out.byDecider).toEqual(['new_part_price']);
    expect(out.dropped.map((d) => d.why)).toEqual(['absent']);
    expect(out.remaining).toEqual([]);
  });

  it('discards a pick that is not one of the offered elements', async () => {
    const items = [el('html > td:nth-child(1)', '$250.00'), el('html > td:nth-child(2)', '$250.00')];
    const out = await sourceReadBacks(targets(['price', '$250.00']), pageShowing({ '$250.00': { items } }), {
      instruction: 'add part B',
      pin: pinning().pin,
      decider: async () => [{ name: 'price', value: '$250.00', path: 'html > td:nth-child(9)' }],
    });
    expect(out.byDecider).toEqual([]);
    expect(out.remaining.map((t) => t.name)).toEqual(['price']);
  });

  it('a decider that declines or throws is indistinguishable from one that is absent', async () => {
    const items = [el('html > td:nth-child(1)', '$250.00'), el('html > td:nth-child(2)', '$250.00')];
    for (const decider of [async () => null, async () => { throw new Error('429'); }]) {
      const out = await sourceReadBacks(targets(['price', '$250.00']), pageShowing({ '$250.00': { items } }), {
        instruction: 'add part B',
        pin: pinning().pin,
        decider,
      });
      expect(out.remaining.map((t) => t.name)).toEqual(['price']);
    }
  });

  it('refuses to guess on a list page: more candidates than a ballot holds', async () => {
    const items = Array.from({ length: MAX_CANDIDATES + 1 }, (_, i) => el(`html > tr:nth-child(${i + 1}) > td:nth-child(1)`, 'Draft'));
    const out = await sourceReadBacks(targets(['status', 'Draft']), pageShowing({ Draft: { items } }), {
      instruction: 'list tickets',
      pin: pinning().pin,
      decider: async () => {
        throw new Error('must not be asked');
      },
    });
    expect(out.remaining.map((t) => t.name)).toEqual(['status']);
  });

  it('hands a value back to the model when the verifier refuses what the search found', async () => {
    const out = await sourceReadBacks(targets(['price', '$250.00']), pageShowing({ '$250.00': { items: [el('html > td:nth-child(1)', '$250.00')] } }), {
      instruction: 'add part B',
      pin: async () => null,
    });
    expect(out.byCode).toEqual([]);
    expect(out.remaining.map((t) => t.name)).toEqual(['price']);
  });

  it('survives a page that cannot be swept', async () => {
    const wedged = {
      frames: () => [{ evaluate: async () => { throw new Error('Execution context was destroyed'); } }],
      mainFrame: () => null,
      url: () => 'about:blank',
    } as unknown as Page;
    const out = await sourceReadBacks(targets(['price', '$250.00']), wedged, { instruction: 'x', pin: pinning().pin });
    expect(out.remaining.map((t) => t.name)).toEqual(['price']);
    expect(out.dropped).toEqual([]);
  });

  it('says what it did', () => {
    expect(
      describeOutcome({
        steps: [],
        byCode: ['part_cost'],
        byDecider: ['price'],
        remaining: [{ name: 'x', value: 'y' }],
        dropped: [{ name: 's', value: 'a.png', why: 'absent' }],
        askedDecider: true,
        ms: { code: 5, decider: 300 },
      }),
    ).toBe('[read-back] code sourced 1 (part_cost); jev sourced 1 (price); 1 not shown anywhere on the page; 1 left for the model');
  });
});

/**
 * The page-side sweep, against a real browser — the half no stub can check:
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/readback.test.ts
 */
const browserEnabled = process.env.BP_BROWSER_TESTS === '1';
(browserEnabled ? describe : describe.skip)('the sweep, on a live page', () => {
  // repairdesk's ticket detail, as fwrdj4-n1 left it: two part rows whose
  // price cells repeat in the total row, a breadcrumb repeating the ref, a
  // supplier held in a form control, and a computed value shown nowhere.
  const html = `<!doctype html><title>RD-1021</title><body>
    <nav id="crumb"><a href="#">Tickets</a> / <span>RD-1021</span></nav>
    <h1 data-testid="ticket-title">fwrdj4-n1 RD Bench Ticket</h1>
    <p data-testid="ticket-ref">RD-1021</p>
    <p id="raised">Customer: Bench Test Customer · Raised 2026-09-18</p>
    <h2>Parts</h2>
    <table><thead><tr><th>Name</th><th>Cost</th><th>Price</th></tr></thead><tbody>
      <tr><td>fwrdj4-n1 RD Part A</td><td>$100.00</td><td>$125.00</td></tr>
      <tr><td>fwrdj4-n1 RD Part B</td><td>$200.00</td><td>$250.00</td></tr>
      <tr><td>Total (price × quantity)</td><td></td><td>$250.00</td></tr>
    </tbody></table>
    <label for="sup">Supplier</label><input id="sup" value="Bench Supplies Ltd">
    <span id="hidden" style="display:none">RD-1099</span>
  </body>`;

  let session: { getPage: () => Promise<Page>; close: () => Promise<unknown> };
  let page: Page;
  beforeAll(async () => {
    const { BrowserSession } = await import('../src/daemon/browser.js');
    session = new BrowserSession({ session: 'readback', persist: false }) as never;
    page = await session.getPage();
    await page.setContent(html);
  }, 60_000);
  afterAll(async () => {
    await session?.close();
  });

  const run = async (t: ReadBackTarget[], decider?: Parameters<typeof sourceReadBacks>[2]['decider']) => {
    const { captureReadBackAt } = await import('../src/daemon/recorder.js');
    return sourceReadBacks(t, page, {
      instruction: 'add a second part and report the totals',
      pin: (value, selector) => captureReadBackAt(page, value, selector),
      ...(decider ? { decider } : {}),
    });
  };

  it('sources the values one element shows, pins them through captureReadBackAt, and proves the rest', async () => {
    const out = await run(
      targets(
        ['part_a_price', '$125.00'], // one cell
        ['ticket_title', 'fwrdj4-n1 RD Bench Ticket'], // one heading
        ['ticket_raised', '2026-09-18'], // only ever on a wrapper's own line
        ['screenshot', 'ticket-RD-1021-detail.png'], // nowhere
      ),
    );
    expect(out.byCode.sort()).toEqual(['part_a_price', 'ticket_raised', 'ticket_title']);
    expect(out.dropped).toEqual([{ name: 'screenshot', value: 'ticket-RD-1021-detail.png', why: 'absent' }]);
    expect(out.remaining).toEqual([]);
    // Real read-backs: a non-circular locator derived from the live element.
    expect(out.steps.every((s) => s.args.target === '(read-back)' && s.locators.target.chain?.length)).toBe(true);
  });

  it('offers a form control as an occurrence, never as a candidate', async () => {
    // `captureReadBackAt` reads innerText, which is '' for an input, so a
    // control can never be sourced through it — and `captureFormValue` has
    // already refused, or the value would not be here. Not absent, not
    // offerable: the model's, as before.
    const out = await run(targets(['supplier', 'Bench Supplies Ltd']));
    expect(out.byCode).toEqual([]);
    expect(out.dropped).toEqual([]);
    expect(out.remaining.map((t) => t.name)).toEqual(['supplier']);
  });

  it('calls a value two elements show ambiguous, breadcrumb included (fwod26)', async () => {
    const out = await run(targets(['ticket_reference', 'RD-1021']));
    expect(out.byCode).toEqual([]);
    expect(out.remaining.map((t) => t.name)).toEqual(['ticket_reference']);
  });

  it('puts a value two cells show on the ballot, with the row and column that tell them apart', async () => {
    const seen: Array<{ items: Array<{ name: string; candidates: Array<{ row?: string; column?: string }> }> }> = [];
    const out = await run(targets(['part_b_price', '$250.00']), async (input) => {
      seen.push(input as never);
      return null;
    });
    expect(out.askedDecider).toBe(true);
    expect(seen[0].items[0].candidates).toHaveLength(2);
    expect(seen[0].items[0].candidates.map((c) => c.column)).toEqual(['Price', 'Price']);
    expect(seen[0].items[0].candidates.map((c) => c.row?.slice(0, 12))).toEqual(['fwrdj4-n1 RD', 'Total (price']);
    // Declined: still the model's to answer, exactly as before.
    expect(out.remaining.map((t) => t.name)).toEqual(['part_b_price']);
  });

  it('does not call an unrendered element a displayer, but does not call the value absent either', async () => {
    const out = await run(targets(['old_ref', 'RD-1099']));
    expect(out.byCode).toEqual([]);
    expect(out.dropped).toEqual([]);
    expect(out.remaining.map((t) => t.name)).toEqual(['old_ref']);
  });
});

// --- stage 2 (site facts, consumer 3): known renderings before the model --------

describe('stage 2: a reliable display format is offered before the model', () => {
  const ORIGIN = 'http://127.0.0.1:4180';
  const URL_ = `${ORIGIN}/#/tickets/t15`;
  let dir: string;
  let store: import('../src/skills/facts.js').SiteFactStore;
  let ff: typeof import('../src/skills/facts-format.js');
  let rec: typeof import('../src/daemon/recorder.js');

  const affix = (key: string, tpl: string, hard = true, session = 's1') =>
    store.observe(ORIGIN, [{ k: 'format', key, v: { kind: 'affix', tpl }, hard, session }]);

  beforeAll(async () => {
    ff = await import('../src/skills/facts-format.js');
    rec = await import('../src/daemon/recorder.js');
  });
  beforeEach(async () => {
    const os = await import('node:os');
    const { SiteFactStore } = await import('../src/skills/facts.js');
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitelooper-readback-k-'));
    store = new SiteFactStore(dir);
    ff.useFormatStore(store);
    ff.setFormatSession('rec-1');
  });
  afterEach(() => {
    ff.useFormatStore(null);
    ff.setFormatSession(null);
    ff.takeFormatShadowRows();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('displays: a rendering is its own tier, after exact and before line', () => {
    expect(displays('#4', '4')).toBe(null); // today: a lone digit inside a longer text
    expect(displays('#4', '4', ['#4'])).toBe('rendered');
    expect(displays('4', '4', ['#4'])).toBe('exact');
    const exact = el('html > td:nth-child(1)', '4');
    const shown = el('html > span:nth-child(2)', '#4');
    expect(displayersOf([shown, exact], '4', ['#4']).map((c) => c.path)).toEqual([exact.path]);
    expect(displayersOf([shown], '4', ['#4']).map((c) => c.path)).toEqual([shown.path]);
    const line = el('html > p:nth-child(3)', 'Ticket RD-1015 is ready');
    const framed = el('html > h1:nth-child(1)', 'Ticket RD-1015');
    expect(displayersOf([line, framed], 'RD-1015', ['Ticket RD-1015']).map((c) => c.path)).toEqual([framed.path]);
    // no renderings: today's function
    expect(displayersOf([line, framed], 'RD-1015').map((c) => c.path).sort()).toEqual([framed.path, line.path].sort());
  });

  it("readBackRenderings: report key first, then the route's controls; affix with the value as its core only", () => {
    const report = ff.reportFormatKey(URL_, 'task_ref');
    const cell = ff.controlKey(URL_, 'cell', 'Ref');
    affix(report, '#{{=}}');
    affix(cell, 'Task {{=}}');
    affix(ff.controlKey(URL_, 'cell', 'Advisory'), 'Seen {{=}}', false); // one soft session: advisory
    affix(ff.reportFormatKey(URL_, 'other'), 'Other {{=}}'); // another label's report key: not a control
    affix(ff.titleKey(URL_), '{{=}} - Desk'); // the title is not an element
    store.observe(ORIGIN, [{ k: 'format', key: ff.controlKey(URL_, 'textbox', 'Amount'), v: { kind: 'thousands' }, hard: true, session: 's1' }]);
    const sf = store.read(ORIGIN);
    expect(rec.readBackRenderings(sf, URL_, 'task_ref', '4')).toEqual([
      { text: '#4', tpl: '#{{=}}', key: report },
      { text: 'Task 4', tpl: 'Task {{=}}', key: cell },
    ]);
    expect(rec.readBackRenderings(sf, URL_, undefined, '4').map((r) => r.text)).toEqual(['Task 4']);
    // thousands re-spells the core: a read of "12,500" would publish another value
    expect(rec.readBackRenderings(sf, URL_, undefined, '12500').map((r) => r.text)).toEqual(['Task 12500']);
  });

  it('readBackRenderings: a template the tightened observer refuses never decides', () => {
    const key = ff.reportFormatKey(URL_, 'subtotal');
    affix(key, '£ 2,{{=}}');
    expect(rec.readBackRenderings(store.read(ORIGIN), URL_, 'subtotal', '450.00')).toEqual([]);
  });

  it("the cascade pins the one element showing a known rendering; without the fact it is the model's, as before", async () => {
    const items = [el('html > span:nth-child(1)', '#4'), el('html > p:nth-child(2)', 'Moved 4 cards')];
    const page = pageShowing({ '4': { items } });
    const before = await sourceReadBacks(targets(['task_ref', '4']), page, { instruction: 'open the task', pin: pinning().pin });
    expect(before.byCode).toEqual([]);
    expect(before.remaining.map((t) => t.name)).toEqual(['task_ref']);
    affix(ff.reportFormatKey(URL_, 'task_ref'), '#{{=}}');
    const pin = pinning();
    const after = await sourceReadBacks(targets(['task_ref', '4']), page, { instruction: 'open the task', pin: pin.pin });
    expect(after.byCode).toEqual(['task_ref']);
    expect(pin.calls).toEqual([{ value: '4', selector: 'html > span:nth-child(1)' }]);
    // no session: no facts read, today's cascade
    ff.setFormatSession(null);
    const closed = await sourceReadBacks(targets(['task_ref', '4']), page, { instruction: 'open the task', pin: pinning().pin });
    expect(closed.remaining.map((t) => t.name)).toEqual(['task_ref']);
  });
});

(browserEnabled ? describe : describe.skip)('stage 2: captureReadBack through a fact, on a live page', () => {
  const ORIGIN = 'http://facts.test';
  const URL_ = `${ORIGIN}/tasks/4`;
  const html = `<!doctype html><title>Task</title><body>
    <nav><a href="#">Board</a> / <span>Tasks</span></nav>
    <h1>Bench Task</h1>
    <p class="meta"><span class="ref">#4</span></p>
    <ul><li>moved to Backlog</li><li>4 comments</li></ul>
  </body>`;
  let session: { getPage: () => Promise<Page>; close: () => Promise<unknown> };
  let page: Page;
  let dir: string;
  let store: import('../src/skills/facts.js').SiteFactStore;
  let ff: typeof import('../src/skills/facts-format.js');

  beforeAll(async () => {
    const os = await import('node:os');
    const { BrowserSession } = await import('../src/daemon/browser.js');
    const { SiteFactStore } = await import('../src/skills/facts.js');
    ff = await import('../src/skills/facts-format.js');
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitelooper-readback-kb-'));
    store = new SiteFactStore(dir);
    session = new BrowserSession({ session: 'readback-k', persist: false }) as never;
    page = await session.getPage();
    await page.route(`${ORIGIN}/**`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
    await page.goto(URL_);
  }, 60_000);
  afterAll(async () => {
    ff?.useFormatStore(null);
    ff?.setFormatSession(null);
    ff?.takeFormatShadowRows();
    await session?.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('refuses "4" as today, then pins "#4" framed by the fact and stamps the shadow row applied', async () => {
    const { captureReadBack } = await import('../src/daemon/recorder.js');
    ff.useFormatStore(store);
    ff.setFormatSession('rec-k');
    expect(await captureReadBack(page, '4', 'task_ref')).toBeNull();
    expect(ff.takeFormatShadowRows()).toEqual([]); // no fact of any standing: no row
    store.observe(ORIGIN, [{ k: 'format', key: ff.reportFormatKey(URL_, 'task_ref'), v: { kind: 'affix', tpl: '#{{=}}' }, hard: true, session: 'rec-0' }]);
    const step = await captureReadBack(page, '4', 'task_ref');
    expect(step).not.toBeNull();
    expect(step!.args).toMatchObject({ target: '(read-back)', what: 'text', frame: '#{{=}}' });
    expect(step!.result).toBe(JSON.stringify('4'));
    expect(step!.label).toBe('task_ref');
    // a durable locator that names neither the value nor its rendering
    expect(step!.locators.target.chain?.some((c) => c.kind === 'text' && ['4', '#4'].includes(c.text))).toBe(false);
    const rows = ff.takeFormatShadowRows() as unknown as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rule: 'facts.readback', fact: 'pin', heuristic: 'refused', applied: true });
  });
});
