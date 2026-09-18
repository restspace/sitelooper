import { describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import {
  expectationDecisions,
  recordedTexts,
  recordedValues,
  ruleAnswer,
  threadingDecisions,
  type ThreadingSite,
  type ValueOrigin,
} from '../src/skills/triage.js';

/**
 * The enumerators must REPRODUCE the shape rules, not resemble them: every
 * case below is one the product's own comments name, and the expected
 * `ruleSaid` is what `substitute` / `replaceToken` / the mask chain answer
 * today. A rule that changes should break these, which is the point — a
 * triage log about a rule the product no longer runs is worse than none.
 */

const value = (v: string, over: Partial<ValueOrigin> = {}): ValueOrigin => ({
  value: v,
  label: 'v',
  whereReadFrom: 'read',
  ...over,
});
const site = (text: string, over: Partial<ThreadingSite> = {}): ThreadingSite => ({ kind: 'expectation', where: 'w', text, ...over });

/** The one decision for one value in one text. */
const one = (v: ValueOrigin, s: ThreadingSite, nth = 0) => threadingDecisions([v], [s])[nth];

describe('threadingDecisions reproduces the token boundary', () => {
  it('refuses a word inside a compound, and admits an identifier that splits it', () => {
    // fwgr8: `bench` inside the slug; fwod5: `form` inside the class name.
    expect(one(value('bench', { label: 'tags', whereReadFrom: 'typed' }), site('http://h/d/uid/fwgr8-n1-bench-dashboard', { kind: 'url' })).ruleSaid).toBe('coincidence');
    expect(one(value('form', { whereReadFrom: 'url' }), site('div.o_form_view_group > td', { kind: 'locator' })).ruleSaid).toBe('coincidence');
    // ...and the runid, which IS the record the slug names.
    expect(one(value('fwgr8-n1', { whereReadFrom: 'var' }), site('http://h/d/uid/fwgr8-n1-bench-dashboard', { kind: 'url' })).ruleSaid).toBe('same');
    // `ticket-link-t15` — an address with a minted record welded into it.
    expect(one(value('t15', { whereReadFrom: 'url' }), site('ticket-link-t15', { kind: 'locator' })).ruleSaid).toBe('same');
  });

  it('names the numeric guard when it, and not the boundary, refused', () => {
    // Round 26: the order id 21 inside the clock time `09/17/2026 21:05`.
    const clock = one(value('21', { label: 'order_id', whereReadFrom: 'url' }), site('- cell "09/17/2026 21:05"'));
    expect([clock.ruleSaid, clock.rule]).toEqual(['coincidence', 'substitute:numeric-guard']);
    // fwod31: `cids=1` minted "1", and the start url's last octet is a "1".
    const octet = one(value('1', { whereReadFrom: 'url' }), site('http://127.0.0.1:8069/odoo/sales', { kind: 'url' }), 1);
    expect([octet.ruleSaid, octet.rule]).toEqual(['coincidence', 'substitute:numeric-guard']);
    // The nth-index guard: a cost of 25 must not touch `:nth-of-type(25)`.
    expect(one(value('25', { whereReadFrom: 'typed' }), site('tr:nth-of-type(25) > td', { kind: 'locator' })).rule).toBe('substitute:numeric-guard');
    // ...and the same id where it really is the record: the boundary, and yes.
    const url = one(value('21', { whereReadFrom: 'url' }), site('http://h/odoo/sales/21', { kind: 'url' }));
    expect([url.ruleSaid, url.rule]).toEqual(['same', 'tokenPattern']);
  });

  it('routes an instruction through replaceToken, which protects markers', () => {
    // fwod5 again, one level up: a value that is a common word must not rewrite
    // the middle of a reference an earlier pass already placed.
    const d = threadingDecisions([value('product', { whereReadFrom: 'typed' })], [site('Add {{02-create.product_name}} to the order', { kind: 'arg', via: 'replaceToken' })]);
    expect(d.map((x) => x.ruleSaid)).toEqual(['coincidence']);
  });

  it('reports every occurrence, with its span, boundary characters and enclosing token', () => {
    const d = threadingDecisions([value('bench', { whereReadFrom: 'typed' })], [site('bench in fwgr8-n1-bench-dashboard', { kind: 'url' })]);
    expect(d.map((x) => [x.span[0], x.ruleSaid, x.enclosingToken])).toEqual([
      [0, 'same', 'bench'],
      [18, 'coincidence', 'fwgr8-n1-bench-dashboard'],
    ]);
    expect([d[1].precededBy, d[1].followedBy]).toEqual(['-', '-']);
  });

  it('has no length floor, so the one-character fwod31 value is enumerable', () => {
    expect(threadingDecisions([value('1')], [site('1 of 1')]).length).toBe(2);
    // ...while the COLLECTOR keeps buildFlow's floor, so a session does not
    // enumerate every digit on the page.
    const entries: RecordedEntry[] = [{ k: 'report', status: 'success', summary: '', values: { n: '1', ref: 'RD-1015' } }];
    expect(recordedValues(entries).map((v) => v.value)).toEqual(['RD-1015']);
  });

  it('leaves its inputs untouched', () => {
    const values = [value('bench')];
    const sites = [site('fwgr8-n1-bench-dashboard', { kind: 'url' })];
    const before = JSON.stringify({ values, sites });
    threadingDecisions(values, sites);
    expect(JSON.stringify({ values, sites })).toBe(before);
  });
});

describe('expectationDecisions reproduces the mask chain', () => {
  const rec = (added: string[], tool = 'click', procedure = 'Do the thing.'): RecordedEntry[] => [
    { k: 'instruction', text: procedure },
    { k: 'step', tool, args: {}, locators: {}, diff: { url: '', alerts: [], added } },
  ];

  it('drops a transient line, and says which rule did it', () => {
    // fwgr25: `- status "Loading"` was the sign-in click's only page change.
    const [d] = expectationDecisions({ entries: rec(['- status "Loading"']) });
    expect([d.ruleSaid, d.rule]).toEqual(['drop', 'TRANSIENT_LINE']);
  });

  it('masks a control value the procedure did not type (maskMinted)', () => {
    // atelyr: the recording's own project id as a picker's displayed value.
    const [d] = expectationDecisions({ entries: rec(['- combobox "Project": 13f9pv52yozr']) });
    expect([d.ruleSaid, d.rule, d.masked]).toEqual(['mask', 'maskMinted', '- combobox "Project": {{*}}']);
  });

  it('masks a typed value that is not a slot — maskMinted runs before maskForeignValue', () => {
    // Worth pinning because it is a whole class of the disagreements the
    // step-2 log carries: the procedure demonstrably typed "Bristol", but it
    // is a literal and not a `{{vN}}`, so provenance says "the app's" and the
    // wildcard lands. maskForeignValue's `own` list only reaches values that
    // ARE slots by then.
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Set the city.' },
      { k: 'step', tool: 'fill', args: { target: '@e1', value: 'Bristol' }, locators: {}, diff: { url: '', alerts: [], added: ['- textbox "City": Bristol'] } },
    ];
    const [d] = expectationDecisions({ entries });
    expect([d.ruleSaid, d.rule, d.masked]).toEqual(['mask', 'maskMinted', '- textbox "City": {{*}}']);
    // ...and with the slot bound, the value the step typed survives.
    const slotted = expectationDecisions({ entries, slots: new Map([['v1', 'Bristol']]) })[0];
    expect([slotted.ruleSaid, slotted.masked]).toEqual(['keep', '- textbox "City": {{v1}}']);
  });

  it('empties a popup item and then drops it for identifying nothing', () => {
    // fwod49-n2 02-open: `- option "{{v4}}"` stopped every replay whose
    // catalogue answered differently.
    const [d] = expectationDecisions({ entries: rec(['- option "{{v4}}"'], 'type'), slots: new Map([['v4', 'Product A']]) });
    expect(d.ruleSaid).toBe('drop');
    expect(d.rule).toContain('maskPopupItem');
  });

  it('masks a value the recording\'s own read published (maskPublishedValues)', () => {
    // fwod60 s_292da2: a value only the recording could produce, frozen into
    // the step's expectation.
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Add a line and report the total.' },
      { k: 'step', tool: 'read', args: { target: '(read-back)' }, locators: {}, label: 'untaxed', result: '"£ 267.00"' },
      { k: 'step', tool: 'click', args: {}, locators: {}, diff: { url: '', alerts: [], added: ['- row "Untaxed Amount £ 267.00"'] } },
    ];
    const [d] = expectationDecisions({ entries, reportValues: { untaxed: '£ 267.00' } });
    expect(d.ruleSaid).toBe('mask');
    expect(d.rule).toContain('maskPublishedValues');
    expect(d.masked).toBe('- row "Untaxed Amount {{*}}"');
  });

  it('carries the slotted line, the procedure and the step tag', () => {
    const [d] = expectationDecisions({ entries: rec(['- textbox "Customer": Acme'], 'fill', 'Create a ticket for Acme.'), slots: new Map([['v1', 'Acme']]) });
    expect(d.slotted).toBe('- textbox "Customer": {{v1}}');
    expect([d.procedure, d.where, d.tool]).toEqual(['Create a ticket for Acme.', 'step 1 (fill)', 'fill']);
  });

  it('never rules on a navigation\'s landing', () => {
    expect(expectationDecisions({ entries: rec(['- heading "Sales"'], 'goto') })).toEqual([]);
    expect(expectationDecisions({ entries: rec(['- heading "Sales"'], 'back') })).toEqual([]);
  });

  it('separates "not every run" from "identifies nothing"', () => {
    // The two drops answer different questions, and only the first is an
    // answer to site J's — see ruleAnswer.
    const transient = expectationDecisions({ entries: rec(['- status "Saved"']) })[0];
    const nothing = expectationDecisions({ entries: rec(['- cell ""']) })[0];
    const kept = expectationDecisions({ entries: rec(['- button "Confirm"']) })[0];
    expect(ruleAnswer(transient)).toBe('this-run');
    expect(ruleAnswer(nothing)).toBe('uninformative');
    expect(ruleAnswer(kept)).toBe('every-run');
  });
});

describe('collecting the inputs a recording actually has', () => {
  const entries: RecordedEntry[] = [
    { k: 'instruction', text: 'Create a ticket titled Acme Repair and report its reference.' },
    { k: 'step', tool: 'goto', args: { url: 'http://h/tickets/new' }, locators: {} },
    {
      k: 'step',
      tool: 'fill',
      args: { target: '@e1', value: 'Acme Repair' },
      locators: { target: { expr: '', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'textbox', name: 'Title' }, { kind: 'css', selector: '#form-title' }] } },
      diff: { url: 'http://h/tickets/new', alerts: [], added: ['- textbox "Title": Acme Repair'] },
    },
    { k: 'step', tool: 'read', args: { target: '.ref', what: 'text' }, locators: {}, label: 'ticket_ref', result: '"RD-1015"' },
    { k: 'report', status: 'success', summary: '', values: { ticket_ref: 'RD-1015', title: 'Acme Repair' } },
  ];

  it('knows how the run came by each value, first provenance winning', () => {
    const values = recordedValues(entries, { runid: 'fwrd35-n1' });
    expect(values.map((v) => [v.value, v.label, v.whereReadFrom])).toEqual([
      ['Acme Repair', 'value', 'typed'],
      ['RD-1015', 'ticket_ref', 'read'],
      ['fwrd35-n1', 'runid', 'var'],
    ]);
    expect(values[1].source).toContain('read back from the page');
  });

  it('collects the url, the typed args, the locator fields and the page changes', () => {
    const kinds = recordedTexts(entries).map((s) => [s.kind, s.text]);
    expect(kinds).toContainEqual(['url', 'http://h/tickets/new']);
    expect(kinds).toContainEqual(['arg', 'Acme Repair']);
    expect(kinds).toContainEqual(['locator', 'Title']);
    expect(kinds).toContainEqual(['locator', '#form-title']);
    expect(kinds).toContainEqual(['expectation', '- textbox "Title": Acme Repair']);
    // The instruction goes through the exporter's rule, not the compiler's.
    const instruction = recordedTexts(entries).find((s) => s.via === 'replaceToken');
    expect(instruction?.text).toContain('Create a ticket');
  });
});
