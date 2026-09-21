import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { carryOpener, compileSkills } from '../src/skills/compile.js';
import { openerLines } from '../src/skills/replay.js';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-carry-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

/**
 * gitea fwgt1-n1: 03-set opened the Labels picker and gave up with it open;
 * 04-set, issued on that page, began by ticking `link "bug"` in it. Its
 * procedure, compiled from its own entries alone, started with the tick —
 * aimed, on every clean replay, at an item in a menu nothing had opened.
 */
describe('carryOpener (fwgt1 04-set)', () => {
  const ISSUE = 'http://127.0.0.1:8095/bench/bench-repo/issues/4';
  const menu = [
    '- combobox "Labels Clear labels bug documentation enhancement priority-high"',
    '- listbox "Clear labels bug documentation enhancement priority-high"',
    '- textbox "Filter Label"',
    '- link "bug"',
    '- link "priority-high"',
  ];
  const opener: RecordedStep = {
    k: 'step',
    tool: 'click',
    args: { target: '@e245' },
    locators: { target: { expr: "page.locator('div > div:nth-of-type(3)')", verified: true, raw: '@e245', chain: [{ kind: 'css', selector: 'div > div:nth-of-type(3)' }] } },
    diff: { url: ISSUE, alerts: [], added: menu, dialect: 2 },
  };
  const pick = (name: string): RecordedStep => ({
    k: 'step',
    tool: 'click',
    args: { target: '@e376' },
    locators: { target: { expr: `page.getByRole('link', { name: '${name}', exact: true })`, verified: true, raw: '@e376', chain: [{ kind: 'role', role: 'link', name }] } },
    diff: { url: ISSUE, alerts: [], added: [], dialect: 2 },
  });
  const before = (o: { last?: RecordedStep[] } = {}): RecordedEntry[] => [
    { k: 'instruction', text: "Set the labels 'bug' and 'priority-high'.", url: ISSUE },
    opener,
    ...(o.last ?? []),
    { k: 'report', status: 'failure', summary: 'No labels', values: {} },
  ];
  const own = (startText = `- heading "x Bench Issue #4"\n${menu.join('\n')}`): RecordedEntry[] => [
    { k: 'instruction', text: "Set the issue's labels to exactly 'bug' and 'priority-high'.", url: ISSUE, startText, startDialect: 2 },
    pick('bug'),
    pick('priority-high'),
    { k: 'step', tool: 'press', args: { key: 'Escape' }, locators: {}, diff: { url: ISSUE, alerts: [], added: ['- link "bug"', '- link "priority-high"'], dialect: 2 } },
  ];

  it('carries the earlier click that opened the popup in front of the first pick', () => {
    const carried = carryOpener(before(), own());
    expect(carried.map((e) => (e.k === 'step' ? e.args.target ?? e.tool : e.k))).toEqual(['instruction', '@e245', '@e376', '@e376', 'press']);
    const [skill] = compileSkills({
      entries: carried,
      instruction: "Set the issue's labels to exactly 'bug' and 'priority-high'.",
      report: { status: 'success', summary: 'labels set', evidence: { values: {} } },
      session: 's',
    });
    // The procedure opens the menu first — and that click is one replay and
    // the artifact skip when the menu is already showing (pickers toggle).
    expect(skill.steps[0].args.target).toBe('@e245');
    expect(openerLines(skill.steps[0], {})).toEqual(['- listbox "Clear labels bug documentation enhancement priority-high"']);
  });

  it('carries nothing when the popup was not showing as the instruction began', () => {
    const entries = own('- heading "x Bench Issue #4"\n- combobox "Labels"');
    expect(carryOpener(before(), entries)).toBe(entries);
  });

  it('carries nothing when a step after the opener left the page', () => {
    const away: RecordedStep = { ...pick('Issues'), diff: { url: 'http://127.0.0.1:8095/bench/bench-repo/issues', alerts: [], added: [], dialect: 2 } };
    const entries = own();
    expect(carryOpener(before({ last: [away] }), entries)).toBe(entries);
  });

  it('carries nothing when what made the target appear was not a popup opening', () => {
    const entries = own();
    const noPopup: RecordedStep = { ...opener, diff: { url: ISSUE, alerts: [], added: ['- link "bug"'], dialect: 2 } };
    expect(carryOpener([before()[0], noPopup], entries)).toBe(entries);
  });

  it('carries nothing when the instruction that left it open succeeded — its own procedure ends with the click', () => {
    const entries = own();
    const done = before().map((e) => (e.k === 'report' ? { ...e, status: 'success' as const } : e));
    expect(carryOpener(done, entries)).toBe(entries);
  });

  it('carries nothing into a resume, nor across more than one instruction', () => {
    const resumed = own();
    resumed[0] = { ...(resumed[0] as Extract<RecordedEntry, { k: 'instruction' }>), resume: true };
    expect(carryOpener(before(), resumed)).toBe(resumed);
    const entries = own();
    const between: RecordedEntry[] = [{ k: 'instruction', text: 'Read the title.', url: ISSUE }, { k: 'report', status: 'success', summary: 'ok', values: {} }];
    expect(carryOpener([...before(), ...between], entries)).toBe(entries);
  });

  it('carries nothing when the instruction opened the popup itself', () => {
    const entries: RecordedEntry[] = [own()[0], opener, pick('bug')];
    expect(carryOpener(before(), entries)).toBe(entries);
  });
});
