import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { expectedChangesVerdict } from '../src/execution/expect.js';
import { compileSkills } from '../src/skills/compile.js';
import type { Skill, SkillStep } from '../src/skills/store.js';

/**
 * Round 51, the silent tier-A pass. repairdesk fwrd84-n1 05-edit set part A's
 * cost from 100 to 150 and saved. The Save's recorded effect was the row
 * `fwrd84-n1 RD Part A $150.00 25% 1 No supplier $187.50 Edit Delete`, but the
 * step's own reads published "$150.00" and "$187.50", so unfreezeExpectations
 * wildcarded both: `- row "{{v4}} {{*}} {{v7}}% {{*}} No supplier {{*}} Edit
 * Delete"` — which the UNCHANGED row matches too. n3 saved an unchanged form
 * (its own read published "$100.00") and reported tier A, 0 turns, 12/12.
 *
 * Both instructions are the published recordings, verbatim:
 * origin/results/fwrd84 (n1 script entries 101-117) and
 * origin/results/fwrd85-w49cxy (the normal run, n1 entries 74-88).
 */
const fixture = (name: string): RecordedEntry[] =>
  fs
    .readFileSync(path.join(__dirname, 'fixture', name), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);

function compiled(name: string, runid: string): { skill: Skill; steps: SkillStep[]; entries: RecordedEntry[] } {
  const entries = fixture(name);
  const head = entries[0] as Extract<RecordedEntry, { k: 'instruction' }>;
  const report = entries.find((e): e is Extract<RecordedEntry, { k: 'report' }> => e.k === 'report')!;
  const skills = compileSkills({
    entries: entries.filter((e) => e.k !== 'report'),
    instruction: head.text,
    report: { status: 'success', summary: report.summary ?? '', evidence: { values: report.values ?? {} } },
    session: 't',
    knownValues: { 'var:runid': runid, 'output:i3:part_name': `${runid} RD Part A` },
  });
  return { skill: skills[0], steps: skills.flatMap((s) => s.steps), entries };
}

const examples = (skill: Skill): Record<string, string> => Object.fromEntries(Object.entries(skill.params).map(([k, p]) => [k, p.example]));
const saveOf = (steps: SkillStep[]) => steps.find((s) => s.tool === 'click' && String(s.args.target).includes('Save part'))!;
const recordedSave = (entries: RecordedEntry[]) => entries.find((e): e is RecordedStep => e.k === 'step' && e.tool === 'click' && String(e.args.target).includes('Save part'))!;

/** The shared runtime gate (both runners), over a page that shows `lines` and a diff that added `added`. */
async function verdictOver(save: SkillStep, params: Record<string, string>, added: string[], lines: string[]) {
  return expectedChangesVerdict(save.expect?.addedContains, params, { tag: 'save', tool: 'click', positionalResolution: false }, { added, live: async () => ({ lines, complete: true }) });
}

describe('a step whose work was to SET a value does not pass when the value never appears (fwrd84 05-edit)', () => {
  it('fails the Save when the save left the row unchanged (the cost never took)', async () => {
    const { skill, steps, entries } = compiled('fwrd84-n1-05-edit.jsonl', 'fwrd84-n1');
    const save = saveOf(steps);
    const before = (recordedSave(entries).diff!.removed ?? []).filter((l) => !/dialog|heading|textbox|spinbutton|button/.test(l));
    // The page after an unchanged save is the page before it: the old row, $100.00.
    const verdict = await verdictOver(save, examples(skill), [], before);
    expect(verdict.stop, JSON.stringify(save.expect)).toBeDefined();
  });

  it('passes the Save when the row shows the cost it set', async () => {
    const { skill, steps, entries } = compiled('fwrd84-n1-05-edit.jsonl', 'fwrd84-n1');
    const added = recordedSave(entries).diff!.added;
    const verdict = await verdictOver(saveOf(steps), examples(skill), added, added);
    expect(verdict.stop).toBeUndefined();
  });

  it('fwrd85, the normal 05-edit, still passes on its own recorded change and fails on an unchanged row', async () => {
    const { skill, steps, entries } = compiled('fwrd85-n1-05-edit.jsonl', 'fwrd85-n1');
    const save = saveOf(steps);
    const recorded = recordedSave(entries).diff!;
    expect((await verdictOver(save, examples(skill), recorded.added, recorded.added)).stop).toBeUndefined();
    const before = (recorded.removed ?? []).filter((l) => !/dialog|heading|textbox|spinbutton|button/.test(l));
    expect((await verdictOver(save, examples(skill), [], before)).stop).toBeDefined();
  });

  it('keeps a computed figure the step did not set masked (the price, the total)', () => {
    const { steps } = compiled('fwrd84-n1-05-edit.jsonl', 'fwrd84-n1');
    const lines = saveOf(steps).expect?.addedContains ?? [];
    expect(lines.join('\n')).not.toContain('187.50');
    expect(lines.join('\n')).not.toContain('437.50');
  });

  it('drops a line the masking left matching what the step replaced (the total row, before and after alike)', () => {
    // `- row "Total (price × quantity) {{*}}"` matches the Save's own recorded
    // removal `… $375.00` as well as the new `… $437.50`: it cannot tell a save
    // that happened from one that did not, so it must not count as the step's effect.
    const { steps } = compiled('fwrd84-n1-05-edit.jsonl', 'fwrd84-n1');
    const lines = saveOf(steps).expect?.addedContains ?? [];
    expect(lines.some((l) => l.includes('Total (price'))).toBe(false);
    expect(lines.some((l) => /\$\{\{v\d+\}\}/.test(l))).toBe(true);
  });
});
