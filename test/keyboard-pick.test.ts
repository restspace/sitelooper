/**
 * Round 62, gitea fwgt13: silent wrong data. n1 walked the new-issue form's
 * pickers with the keyboard (test/fixture/fwgt13-n1-02-create-full.jsonl,
 * script entries 22-100): ArrowDown ×2 + Enter (enhancement on), ArrowUp ×3 +
 * Enter (enhancement off), ArrowDown + Enter (bug on), ArrowDown ×3 + Enter
 * (priority-high on), ArrowDown ×3 + Enter (Bench Milestone), ArrowDown ×3 +
 * Enter (bench-assignee). compile's coalesceControls folded each run of
 * identical target-less presses into ONE, so every replay and the compiled
 * script picked by the wrong distance: labels [bug, enhancement], milestone
 * Backlog, assignee admin, all reported as success.
 *
 * Now each pick the journal names (skills/key-pick.ts) compiles as a click on
 * that option BY NAME, and the arrow presses that only moved the highlight go;
 * a pick no click can name stays a press verified by name at replay.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { coalesceControls, compileSkills, namedKeyPicks } from '../src/skills/compile.js';
import type { Skill, SkillStep } from '../src/skills/store.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-kbd-pick-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixture');
// The recorder never compiles a step that failed to dispatch; neither does this.
const entries: RecordedEntry[] = fs
  .readFileSync(path.join(DIR, 'fwgt13-n1-02-create-full.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .filter((e: RecordedEntry) => !(e.k === 'step' && e.failed));

const compiled = (): Skill[] => {
  const report = entries[entries.length - 1] as Extract<RecordedEntry, { k: 'report' }>;
  const instruction = (entries[0] as Extract<RecordedEntry, { k: 'instruction' }>).text;
  return compileSkills({ entries, instruction, report: { status: 'success', summary: report.summary, evidence: { values: report.values } }, session: 'fwgt13', knownValues: {} });
};
const filled = (skill: Skill, v: string) => v.replace(/\{\{(v\d+)\}\}/g, (_, slot: string) => String(skill.params[slot]?.example));

describe('coalesceControls folds a repeated control, never an action', () => {
  it('keeps every key press', () => {
    const arm = (): SkillStep => ({ tool: 'dialog_expect', args: { action: 'accept' }, locators: {} });
    const press = (): SkillStep => ({ tool: 'press', args: { key: 'ArrowDown' }, locators: {} });
    expect(coalesceControls([arm(), arm()]).length).toBe(1);
    expect(coalesceControls([press(), press(), press()]).length).toBe(3);
  });
});

describe('fwgt13-n1: every keyboard pick compiles as a named selection', () => {
  it('replaces each picking press with a click on the option it picked, and drops the arrows', () => {
    const chain = compiled();
    const presses = chain.flatMap((s) => s.steps).filter((s) => s.tool === 'press').map((s) => String(s.args.key));
    expect(presses).toEqual(['Escape', 'Escape', 'Escape']);
    const named = chain.flatMap((skill) =>
      skill.steps
        .filter((s) => s.tool === 'click' && typeof s.args.target === 'string' && s.args.target.startsWith('role=link[name='))
        .map((s) => filled(skill, String((s.locators.target ?? []).find((c) => c.kind === 'role')?.name ?? ''))),
    );
    // #27 was a click by name already; #36, #49, #55, #59, #65, #77 and #85 were presses
    expect(named).toEqual(['bug', 'bug', 'enhancement', 'enhancement', 'bug', 'priority-high', 'Bench Milestone', 'bench-assignee (Bench Assignee)']);
  });

  it('keeps a pick no click can name as a press, carrying the name to verify', () => {
    const steps: SkillStep[] = [
      { tool: 'press', args: { key: 'ArrowDown' }, locators: {} },
      { tool: 'press', args: { key: 'Enter' }, locators: {}, picks: { role: 'div', name: 'enhancement' } },
    ];
    const out = namedKeyPicks(steps);
    expect(out.map((s) => s.tool)).toEqual(['press', 'press']);
    expect(out[1].picks).toEqual({ role: 'div', name: 'enhancement' });
  });

  it('the artifact verifies such a press by name (keyboardPickVerdict)', () => {
    const steps: SkillStep[] = [
      { tool: 'press', args: { key: 'ArrowDown' }, locators: {} },
      { tool: 'press', args: { key: 'Enter' }, locators: {}, picks: { role: 'div', name: 'enhancement' } },
    ];
    const flow: SpecFlow = {
      version: 1,
      name: 'kbd',
      origin: 'http://x.test',
      startUrl: 'http://x.test/',
      vars: [],
      steps: [{ id: '01-set', instruction: 'set', params: {}, outputs: [], segments: [{ id: 's_k', template: 'set', params: {}, preconditions: { urlPattern: 'http://x.test/' }, steps }] }],
    };
    const { source } = emitFlowFile(flow, { tier: 'plain' });
    expect(source.split('\n').filter((l) => l.trim() === 'await armKeyboardPick(page);')).toHaveLength(1);
    expect(source.split('\n').filter((l) => l.includes("await keyboardPickVerdict(page, { role: 'div', name: 'enhancement' })"))).toHaveLength(1);
  });
});
