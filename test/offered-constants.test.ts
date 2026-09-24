import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LocatorCandidate, RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills, stripRunValueCandidates } from '../src/skills/compile.js';
import { taskConstants } from '../src/skills/flow.js';

/**
 * odoo fwod84-n1 03-open (round 58; n1 lines 49-75 verbatim): the step typed
 * "Chair" into the product combobox, the app LISTED `- option "[FURN_7777]
 * Office Chair"` (line 51), the step picked it (line 52), and the report at
 * line 75 carried `ref_2: "FURN_7777"`. The ledger filed FURN_7777 as a
 * run-made identifier by its shape, export's strip deleted the pick's role
 * option candidate, and the click was left with `#autocomplete_0_2` — an
 * Odoo render counter — and a point: n2 missed it and fell to the model.
 */
const entries = (): RecordedEntry[] =>
  fs
    .readFileSync(path.join(__dirname, 'fixture', 'fwod84-n1-03-open.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);

describe('taskConstants: a value the app OFFERED before the run picked and reported it (fwod84)', () => {
  it('the catalog code and the option it names are constants', () => {
    const c = taskConstants(entries(), ['FURN_7777', '[FURN_7777] Office Chair'], ['fwod84-n1']);
    expect(c.has('FURN_7777')).toBe(true);
    expect(c.has('[FURN_7777] Office Chair')).toBe(true);
  });

  it('RD-1015: a record a create reported, later picked from a list, stays the run’s', () => {
    const url = 'http://x.test/#/tickets';
    const es: RecordedEntry[] = [
      { k: 'instruction', text: 'Create a ticket titled Printer jam', url },
      { k: 'step', tool: 'click', args: { target: '@e1' }, locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name: 'Save' }] } }, diff: { url, alerts: [], added: ['- heading "RD-1015 Printer jam"'], dialect: 2 } },
      { k: 'report', status: 'success', summary: 'created', values: { ref: 'RD-1015' } },
      { k: 'instruction', text: 'Link the part to that ticket', url },
      { k: 'step', tool: 'type', args: { target: '@e2', text: 'Printer' }, locators: { target: { expr: 'x', verified: true, raw: '@e2', chain: [{ kind: 'role', role: 'combobox', name: 'Ticket' }] } }, diff: { url, alerts: [], added: ['- option "RD-1015 Printer jam"'], dialect: 2 } },
      { k: 'step', tool: 'click', args: { target: '@e3' }, locators: { target: { expr: 'x', verified: true, raw: '@e3', chain: [{ kind: 'role', role: 'option', name: 'RD-1015 Printer jam' }] } }, diff: { url, alerts: [], added: [], dialect: 2 } },
    ];
    expect([...taskConstants(es, ['RD-1015'])]).toEqual([]);
  });

  it('an option the run never picked is no evidence either', () => {
    const es = entries().filter((e) => !(e.k === 'step' && e.tool === 'click' && JSON.stringify(e.locators?.target?.chain ?? []).includes('Office Chair')));
    expect(taskConstants(es, ['FURN_7777']).has('FURN_7777')).toBe(false);
  });
});

describe('compile keeps the pick’s name once the code is a constant', () => {
  it('a later compile that knows FURN_7777 keeps the role option candidate', () => {
    const es = entries();
    const head = es[0] as Extract<RecordedEntry, { k: 'instruction' }>;
    const known = { 'var:runid': 'fwod84-n1', 'output:i3:ref_2': 'FURN_7777' };
    const compile = (constants?: string[]) =>
      compileSkills({ entries: es.filter((e) => e.k !== 'report'), instruction: head.text, report: { status: 'success', summary: 'ok' }, session: 't', knownValues: known, ...(constants ? { taskConstants: constants } : {}) })
        .flatMap((s) => s.steps)
        .find((s) => s.tool === 'click' && JSON.stringify(s.locators.target ?? []).includes('autocomplete_0_2'))!;
    expect(compile().locators.target?.some((c) => c.kind === 'role')).toBe(false); // the defect, at compile
    const pick = compile([...taskConstants(es, Object.values(known), ['fwod84-n1'])]);
    expect(pick.locators.target?.[0]).toMatchObject({ kind: 'role', role: 'option', name: '[FURN_7777] Office Chair' });
  });
});

describe('stripRunValueCandidates: the export strip, and its backstop', () => {
  const option: LocatorCandidate = { kind: 'role', role: 'option', name: '[FURN_7777] Office Chair' };
  const counter: LocatorCandidate[] = [
    { kind: 'id', selector: '#autocomplete_0_2' },
    { kind: 'css', selector: '#autocomplete_0_2' },
    { kind: 'point', x: 176, y: 568, w: 241.3, h: 27, role: 'option', tag: 'a', vw: 1280, vh: 900 },
  ];

  it('never strips the last named candidate for a value only its shape called a run value, when only positional or bookmarked ones would remain', () => {
    const out = stripRunValueCandidates([option, ...counter], [{ value: 'FURN_7777', evidence: false }]);
    expect(out).toEqual([option, ...counter]);
  });

  it('strips it when the run value has evidence behind it (a url position, a var, a watched variance)', () => {
    expect(stripRunValueCandidates([option, ...counter], [{ value: 'FURN_7777', evidence: true }])).toEqual(counter);
  });

  it('fwrd22l: a shape-only record reference is still stripped while a named candidate is left', () => {
    const chain: LocatorCandidate[] = [{ kind: 'role', role: 'link', name: 'RD-1015' }, { kind: 'text', text: 'Open ticket' }, { kind: 'css', selector: '#ticket-rows > tr:nth-of-type(1) > td' }];
    expect(stripRunValueCandidates(chain, [{ value: 'RD-1015', evidence: false }])).toEqual(chain.slice(1));
  });

  it('never empties a chain', () => {
    const only: LocatorCandidate[] = [{ kind: 'text', text: 'RD-1015' }];
    expect(stripRunValueCandidates(only, [{ value: 'RD-1015', evidence: true }])).toEqual(only);
  });
});

void (null as unknown as RecordedStep);
