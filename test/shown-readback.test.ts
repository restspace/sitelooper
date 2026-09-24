/**
 * Round 59, Gitea fwgt10 01-open: a reported value read where the recording
 * SHOWED it, not only on the page the report was made on.
 *
 * n1 reported `open_issue_titles: "#1 Seed: triage inbox, #2 Seed: order
 * missing parts, #3 Seed: ship repaired device"`. Its three read_alls on the
 * list came back empty on this Gitea build and it took the titles with an
 * `eval` (compile drops evals); it then went to the search page, where the
 * report was made. The read-back (captureReadBack, round 56's composite
 * split) looks only at that page, which shows no titles — so nothing read
 * them, s_2ea0ba carried them as a template literal, the replays withheld it,
 * and n2/n3 failed obj 1. The recording DID show them: step 12's diff (the
 * second visit to /issues) added `- link "Seed: triage inbox"`, `- link
 * "#1"` … for all three.
 *
 * test/fixture/fwgt10-n1-01-open.jsonl is n1's recording of that instruction.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Report } from '../src/agent/report.js';
import { shownReadBack, type RecordedEntry, type RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';

const FIXTURE = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixture', 'fwgt10-n1-01-open.jsonl');
const load = (): RecordedEntry[] => fs.readFileSync(FIXTURE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as RecordedEntry);
const stepsOf = (entries: RecordedEntry[]): RecordedStep[] => entries.filter((e): e is RecordedStep => e.k === 'step');
const reportOf = (entries: RecordedEntry[]): Report => {
  const r = entries.find((e) => e.k === 'report') as unknown as { status: Report['status']; summary: string; values: Record<string, string> };
  return { status: r.status, summary: r.summary, evidence: { values: { ...r.values } } };
};
const instructionOf = (entries: RecordedEntry[]): string => (entries.find((e) => e.k === 'instruction') as unknown as { text: string }).text;

describe('shownReadBack (fwgt10 n1 01-open)', () => {
  it('anchors the titles at the step whose diff showed them, split into the element texts it showed', async () => {
    const entries = load();
    const steps = stepsOf(entries);
    const report = reportOf(entries);
    const shown = await shownReadBack(steps, report, 'open_issue_titles', instructionOf(entries));
    expect(shown).not.toBeNull();
    // the second visit to the issues list, not the search page the report was made on
    expect(shown!.after.tool).toBe('goto');
    expect(String(shown!.after.args.url)).toMatch(/\/bench\/bench-repo\/issues$/);
    expect(shown!.reads.map((r) => JSON.parse(String(r.result)))).toEqual(['#1', 'Seed: triage inbox', '#2', 'Seed: order missing parts', '#3', 'Seed: ship repaired device']);
    expect(shown!.reads.every((r) => r.tool === 'read' && r.locators.target?.chain[0]?.kind === 'role')).toBe(true);
    expect(shown!.reads[1].locators.target?.chain[0]).toEqual({ kind: 'role', role: 'link', name: 'Seed: triage inbox' });
    // committed the way round 56 commits a split: the composite gives way to its parts
    expect(report.evidence?.values?.open_issue_titles).toBeUndefined();
    expect(report.evidence?.values?.open_issue_titles_2).toBe('Seed: triage inbox');
  });

  it('refuses a value no recorded diff accounts for, and leaves the report alone', async () => {
    const entries = load();
    const report = reportOf(entries);
    report.evidence!.values!.made_up = 'Seed: nowhere to be seen, Seed: nor this';
    expect(await shownReadBack(stepsOf(entries), report, 'made_up', instructionOf(entries))).toBeNull();
    expect(report.evidence?.values?.made_up).toBe('Seed: nowhere to be seen, Seed: nor this');
  });

  it('compiles to a procedure that reads the titles on the list, before it navigates to the search', async () => {
    const entries = load();
    const steps = stepsOf(entries);
    const report = reportOf(entries);
    const instruction = instructionOf(entries);
    const shown = (await shownReadBack(steps, report, 'open_issue_titles', instruction))!;
    // as the recorder's insertStepAfter lays them in
    const at = entries.indexOf(shown.after);
    entries.splice(at + 1, 0, ...shown.reads);
    const reportEntry = entries.find((e) => e.k === 'report') as unknown as { values: Record<string, string> };
    reportEntry.values = Object.fromEntries(Object.entries(report.evidence!.values!).map(([k, v]) => [k, String(v)]));
    const skills = compileSkills({ entries, instruction, report, session: 'fwgt10-n1' });
    const flat = skills.flatMap((s) => s.steps.map((st) => ({ skill: s.id, st })));
    const titleReads = flat.filter(({ st }) => st.tool === 'read' && /^open_issue_titles_/.test(st.label ?? ''));
    expect(titleReads.map(({ st }) => st.label)).toEqual(['open_issue_titles_1', 'open_issue_titles_2', 'open_issue_titles_3', 'open_issue_titles_4', 'open_issue_titles_5', 'open_issue_titles_6']);
    const search = flat.findIndex(({ st }) => st.tool === 'goto' && /state=all/.test(String(st.args.url)));
    expect(search).toBeGreaterThan(-1);
    expect(flat.indexOf(titleReads[titleReads.length - 1])).toBeLessThan(search);
  });
});
