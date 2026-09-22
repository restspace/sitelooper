import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { carryOpener, compileSkills } from '../src/skills/compile.js';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-carry-dead-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

/**
 * gitea fwgt3-n1, entries 38-65 (FIX X): 38 opened the Labels menu and ticked
 * "bug", then died on an LLM 400 with no report; 49 recorded nothing; 50 began
 * inside the still-open menu and clicked "bug" (which UNticked it), then
 * "bug" again and "priority-high". The replays and the compiled script
 * "succeeded" at tier A without the labels applied.
 */
describe('carryOpener across a dead instruction (fwgt3)', () => {
  const ISSUE = 'http://127.0.0.1:8095/bench/bench-repo/issues/4';
  const menu = [
    '- combobox "Labels Clear labels bug documentation enhancement priority-high"',
    '- listbox "Clear labels bug documentation enhancement priority-high"',
    '- textbox "Filter Label"',
    '- link "bug"',
    '- link "priority-high"',
  ];
  const step = (tool: string, target: string, chain: RecordedStep['locators']['target']['chain'], added: string[] = [], extra: Partial<RecordedStep> = {}): RecordedStep => ({
    k: 'step',
    tool,
    args: { target },
    locators: { target: { expr: 'x', verified: true, raw: target, chain } },
    diff: { url: ISSUE, alerts: [], added, dialect: 2 },
    ...extra,
  });
  const opener = step('click', '@e245', [{ kind: 'css', selector: 'div > div:nth-of-type(3)' }], menu);
  const tick = step('click', '.issue-label-list .item[data-label-name="bug"]', [{ kind: 'css', selector: '.issue-label-list .item[data-label-name="bug"]' }]);
  const pick = (name: string) => step('click', '@e376', [{ kind: 'role', role: 'link', name }]);
  const startText = `- heading "fwgt3-n1 Bench Issue #4"\n${menu.join('\n')}`;
  const dead: RecordedEntry[] = [
    { k: 'instruction', text: "Set exactly the two labels 'bug' and 'priority-high'.", url: ISSUE },
    opener,
    tick,
    { k: 'step', tool: 'read', args: { what: 'url', label: 'current_url' }, locators: {}, result: JSON.stringify(ISSUE) },
    { k: 'step', tool: 'eval', args: { expression: '1' }, locators: {} },
  ];
  const empty: RecordedEntry = { k: 'instruction', text: "Use the Labels picker to set 'bug' and 'priority-high'.", url: ISSUE, startText, startDialect: 2 };
  const own = (): RecordedEntry[] => [
    { k: 'instruction', text: "Navigate to issue #4 and set the labels 'bug' and 'priority-high'.", url: ISSUE, startText, startDialect: 2 },
    pick('bug'),
    pick('bug'),
    pick('priority-high'),
    { k: 'step', tool: 'press', args: { key: 'Escape' }, locators: {}, diff: { url: ISSUE, alerts: [], added: ['- combobox "Labels"'], dialect: 2 } },
  ];

  it('walks past the empty instruction and carries the opener and the tick, not the observations', () => {
    const entries = own();
    const out = carryOpener([...dead, empty], entries);
    const steps = out.filter((e): e is RecordedStep => e.k === 'step');
    expect(steps.map((s) => s.args.target ?? s.args.key)).toEqual(['@e245', '.issue-label-list .item[data-label-name="bug"]', '@e376', '@e376', '@e376', 'Escape']);
    expect(out[0]).toBe(entries[0]);
  });

  it('compiles the instruction to begin with the opener and the tick', () => {
    const entries = carryOpener([...dead, empty], own());
    const [skill] = compileSkills({ entries, instruction: (entries[0] as Extract<RecordedEntry, { k: 'instruction' }>).text, report: { status: 'success', summary: 'labels set', evidence: { values: {} } }, session: 's' });
    expect(skill.steps.slice(0, 3).map((s) => s.locators.target?.[0])).toEqual([
      { kind: 'css', selector: 'div > div:nth-of-type(3)' },
      { kind: 'css', selector: '.issue-label-list .item[data-label-name="bug"]' },
      { kind: 'role', role: 'link', name: 'bug' },
    ]);
  });

  it('a report-less instruction that a resume continues is not dead yet', () => {
    const entries = own();
    const resumed: RecordedEntry[] = [...dead, { ...(dead[0] as Extract<RecordedEntry, { k: 'instruction' }>), resume: true }, { k: 'report', status: 'success', summary: 'ok', values: {} }];
    expect(carryOpener(resumed, entries)).toBe(entries);
  });

  it('does not walk past an empty instruction that reported success', () => {
    const entries = own();
    const answered: RecordedEntry[] = [...dead, empty, { k: 'report', status: 'success', summary: 'ok', values: {} }];
    expect(carryOpener(answered, entries)).toBe(entries);
  });
});
