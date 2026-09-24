/**
 * Round 60, gitea fwgt11-n1 04-set (test/fixture/fwgt11-n1-04-set.jsonl:
 * script entries 63-157, so entry N of the script is line N-63 here).
 *
 * 63 set the labels and reported blocked. After its reload (84) it opened the
 * Labels picker (89: added `- listbox …`, `- link "bug"` …) and ticked "bug"
 * (90), which Gitea commits when the picker closes. 97 is the escalated
 * resume: its first click (98) opened the same picker again, and that diff
 * added every item line EXCEPT `- link "bug"`, which was already on the page:
 * the applied label in the sidebar. 107 carried on inside the open picker and
 * reported bug + priority-high.
 *
 * carryOpener walked back from 107's first gesture and stopped at the LATEST
 * opener, 98, so s_1b4c52 began at the re-open and "bug" was never ticked:
 * n2, n3 and the compiled script all ended with labels=[priority-high].
 * The earlier opening is carried when the re-open shows its gesture took
 * effect; the re-open is then skipped by both runners as already showing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { carryOpener } from '../src/skills/compile.js';
import { unbankedMutations } from '../src/skills/flow.js';

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixture');
const load = (): RecordedEntry[] => fs.readFileSync(path.join(DIR, 'fwgt11-n1-04-set.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const AT = (n: number) => n - 63; // script entry → fixture line
const THIRD = AT(107);
const LAST = AT(158);

const sig = (e: RecordedEntry) => (e.k === 'step' ? `${e.tool} ${JSON.stringify(e.args)}` : e.k);
const carriedOf = (entries: RecordedEntry[]) => {
  const out = carryOpener(entries.slice(0, THIRD), entries.slice(THIRD, LAST));
  // the carried steps sit between the instruction and its own first step
  const own = entries.slice(THIRD + 1, LAST).map(sig);
  return out.slice(1, out.length - own.length).map(sig);
};

describe('carryOpener: a picker the dead instruction opened twice (fwgt11 04-set)', () => {
  it('carries the first opening and its tick when the re-open shows the tick took effect', () => {
    const entries = load();
    const want = [89, 90, 98, 99, 102, 103, 106].map((n) => sig(entries[AT(n)]));
    expect(carriedOf(entries)).toEqual(want);
    expect(want[1]).toContain('data-value=\\"1\\"'); // the tick of "bug"
  });

  it('carries from the latest opener only when the re-open still offered the ticked item (the tick did not take effect)', () => {
    const entries = load();
    const reopen = entries[AT(98)] as RecordedStep;
    reopen.diff!.added = [...reopen.diff!.added!, '- link "bug"'];
    expect(carriedOf(entries)).toEqual([98, 99, 102, 103, 106].map((n) => sig(entries[AT(n)])));
  });

  it('carries from the latest opener when the earlier opening made no gesture', () => {
    const entries = load();
    entries.splice(AT(90), 1); // no tick in the first opening
    const shift = (n: number) => AT(n) - (n > 90 ? 1 : 0);
    const out = carryOpener(entries.slice(0, THIRD - 1), entries.slice(THIRD - 1, LAST - 1));
    const own = entries.slice(THIRD, LAST - 1).length;
    expect(out.slice(1, out.length - own).map(sig)).toEqual([98, 99, 102, 103, 106].map((n) => sig(entries[shift(n)])));
  });

  it('never reaches back past the dead instruction\'s own reload', () => {
    const entries = load();
    // a goto between the two openings: the first opening's state is gone
    const reload: RecordedStep = { k: 'step', tool: 'goto', args: { url: 'http://127.0.0.1:8095/bench/bench-repo/issues/4' }, locators: {}, diff: { url: 'http://127.0.0.1:8095/bench/bench-repo/issues/4', alerts: [], added: [] } };
    entries.splice(AT(95), 0, reload);
    const out = carryOpener(entries.slice(0, THIRD + 1), entries.slice(THIRD + 1, LAST + 1));
    const own = entries.slice(THIRD + 2, LAST + 1).length;
    expect(out.slice(1, out.length - own).map(sig)).toEqual([98, 99, 102, 103, 106].map((n) => sig(entries[AT(n) + 1])));
  });
});

describe('unbankedMutations counts only what no procedure carried (fwgt11 04-set)', () => {
  it('names the dead attempt\'s gestures less the seven carried into 107', () => {
    const lines = unbankedMutations(load());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/ran 10 state-changing step\(s\) but reported blocked — its work is NOT in the flow \(7 more were carried into the next instruction's procedure\)/);
  });

  it('keeps the whole count when nothing was carried', () => {
    const entries = load();
    const reopen = entries[AT(98)] as RecordedStep;
    reopen.diff!.added = [...reopen.diff!.added!, '- link "bug"'];
    // 98, 99, 102, 103, 106 are still carried from the latest opener
    expect(unbankedMutations(entries)[0]).toMatch(/ran 12 state-changing step\(s\) .*\(5 more were carried/);
  });
});

describe('the compiled procedure (fwgt11 04-set)', () => {
  it('begins with the first opening and the tick of "bug", and marks the re-open closedBefore', async () => {
    const { compileSkills } = await import('../src/skills/compile.js');
    const entries = load();
    const report = entries[AT(157)] as Extract<RecordedEntry, { k: 'report' }>;
    const [skill] = compileSkills({
      entries: carryOpener(entries.slice(0, THIRD), entries.slice(THIRD, LAST)),
      instruction: (entries[THIRD] as Extract<RecordedEntry, { k: 'instruction' }>).text,
      report: { status: 'success', summary: report.summary, evidence: { values: report.values } },
      session: 'fwgt11',
      knownValues: {},
    });
    const [open, tick, reopen] = skill.steps;
    expect(open.tool).toBe('click');
    // the report's own values are masked in expectations: `bug` and `priority-high` read {{*}}
    const listbox = (lines?: string[]) => (lines ?? []).filter((l) => l.startsWith('- listbox "Clear labels'));
    expect(listbox(open.expect?.addedContains)).toHaveLength(1);
    expect(tick.args.target).toBe('.issue-content-right .ui.dropdown.full-width.active.visible .menu .item[data-value="1"]');
    expect(reopen.args.target).toBe('@e392');
    expect(listbox(reopen.expect?.addedContains)).toEqual(listbox(open.expect?.addedContains));
    // 98's diff ADDED the listbox 89 had added: the picker was shut when it
    // was clicked, so the re-open shuts a showing picker first (closedBefore)
    expect(reopen.closedBefore).toBe(true);
    expect(skill.steps.filter((st) => st.closedBefore)).toEqual([reopen]);
  });
});

describe('closedBefore needs the recorded evidence (fwgt11 04-set)', () => {
  it('marks nothing when the carry starts at the latest opener (the tick did not take effect)', () => {
    const entries = load();
    const reopen = entries[AT(98)] as RecordedStep;
    reopen.diff!.added = [...reopen.diff!.added!, '- link "bug"'];
    const out = carryOpener(entries.slice(0, THIRD), entries.slice(THIRD, LAST));
    expect(out.filter((e) => e.k === 'step' && e.closedBefore)).toEqual([]);
  });
});
