/**
 * Round 57 — kanboard fwkb41 (results/fwkb41-bno76f). test/fixture/fwkb41-n1-script.jsonl
 * is the published n1 recording.
 *
 * 02-create's save (#37) added `- link "#4"` and `- link "fwkb41-n1 Bench
 * Task"`; after three evals the run went (#41) `goto
 * …?controller=TaskViewController&action=show&task_id=4`, linkedFrom the title
 * link. idPositionPart admits only a param named exactly `id` (odoo fwod29's
 * menu_id lesson), and urlParts does not enumerate the query string at all, so
 * `task_id=4` was no record position: not banked, not minted, no {{dN}}.
 *  - The report's new_task_numeric_id stayed the literal "4" (then pruned).
 *  - s_2977d9 step 5 kept `goto …task_id=4` and its goal requireText
 *    ["Task #4"]: right only because the reset makes the new task #4 again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { urlPart } from '../src/execution/url.js';
import { compileSkills } from '../src/skills/compile.js';
import { urlOutputs } from '../src/skills/flow.js';
import { RunLedger, linkMintedParts } from '../src/skills/ledger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (): RecordedEntry[] =>
  fs
    .readFileSync(path.join(here, 'fixture', 'fwkb41-n1-script.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);
const line = (e: RecordedEntry[], n: number) => e[n - 1];
const ORIGIN = 'http://127.0.0.1:8085';
const TASK = `${ORIGIN}/?controller=TaskViewController&action=show&task_id=4`;

describe('a url part the step\'s own mutation minted and linked to is a record position (fwkb41 #37 → #41)', () => {
  it('finds task_id=4 at the goto linked from the save\'s title link, and nothing elsewhere in the recording', () => {
    const e = load();
    const hits = e.flatMap((s, i) => (s.k === 'step' && s.diff?.url ? linkMintedParts(s, e.slice(0, i)).map((p) => `#${i + 1} ${p.label}=${p.value}`) : []));
    expect(hits).toEqual(['#41 q.task_id=4']);
  });

  it('needs the link to be the mutation\'s own: a goto from anything else mints nothing', () => {
    const e = load();
    const goto = { ...(line(e, 41) as RecordedStep), linkedFrom: { expr: '', verified: true, raw: '', chain: [{ kind: 'role' as const, role: 'link', name: 'Dashboard' }] } };
    expect(linkMintedParts(goto, e.slice(0, 40))).toEqual([]);
  });

  it('needs the value to be new at the mutation: a seed card\'s #1 is not minted by a later save', () => {
    const e = load();
    const goto = line(e, 41) as RecordedStep;
    const toSeed = { ...goto, diff: { ...goto.diff!, url: `${ORIGIN}/?controller=TaskViewController&action=show&task_id=1` } };
    const save = line(e, 37) as RecordedStep;
    const e2 = [...e.slice(0, 36), { ...save, diff: { ...save.diff!, added: [...save.diff!.added, '- link "#1"'] } }, ...e.slice(37, 40)];
    expect(linkMintedParts(toSeed, e2)).toEqual([]);
  });

  it('never admits a constant no mutation produced (odoo menu_id)', () => {
    const click = { k: 'step', tool: 'click', args: { target: '@e1' }, locators: { target: { expr: '', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'menuitem', name: 'Sales' }] } }, diff: { url: 'http://127.0.0.1:8069/web#action=316&cids=1&menu_id=120', alerts: [], added: ['- menuitem "Sales"'] } } as RecordedStep;
    const before: RecordedEntry[] = [{ k: 'instruction', text: 'Open Sales.', url: 'http://127.0.0.1:8069/web#cids=1' }];
    expect(linkMintedParts(click, before)).toEqual([]);
  });

  it('is banked as 02-create\'s record id, by position', () => {
    const ledger = new RunLedger();
    ledger.addUrlIds(TASK, 'i2', [], { linkMinted: [{ label: 'q.task_id', value: '4' }] });
    expect(ledger.all().map((x) => [x.value, x.binding, x.positional])).toEqual([['4', { from: 'url', step: 'i2', label: 'q.task_id' }, true]]);
  });

  it('is read by its label from the query string, and published when a later step consumes it', () => {
    expect(urlPart(TASK, 'q.task_id')).toBe('4');
    expect(urlPart('http://127.0.0.1:8069/web#id=44&model=x', 'q.id')).toBe('44');
    expect(urlOutputs(TASK)['url.q.task_id']).toBeUndefined();
    expect(urlOutputs(TASK, undefined, new Set(['url.q.task_id']))['url.q.task_id']).toBe('4');
  });
});

describe('02-create compiles with the task id derived, never frozen (fwkb41 s_2977d9)', () => {
  const compile02 = (values?: (v: Record<string, string>) => Record<string, string>) => {
    const e = load();
    const own = e.slice(29, 59);
    const report = line(e, 60) as Extract<RecordedEntry, { k: 'report' }>;
    const recorded = (report.values ?? {}) as Record<string, string>;
    return compileSkills({
      entries: own,
      instruction: (own[0] as Extract<RecordedEntry, { k: 'instruction' }>).text,
      report: { status: 'success', summary: report.summary, evidence: { values: values ? values(recorded) : recorded } },
      session: 'fwkb41-n1',
      knownValues: { 'var:runid': 'fwkb41-n1', 'output:i1:project': 'Bench Board', 'output:i1:project_id': '1' },
      before: e.slice(0, 29),
    });
  };

  it('replays the goto as a click on the new task\'s link, which mints d1 at task_id', () => {
    const skills = compile02();
    const steps = skills.flatMap((s) => s.steps);
    expect(steps.filter((s) => s.tool === 'goto')).toEqual([]);
    const click = steps.find((s) => s.mints?.at === 'q.task_id')!;
    expect(click.tool).toBe('click');
    expect(JSON.stringify(click.locators)).not.toContain('task_id=4');
    expect(skills.some((s) => s.derived && Object.values(s.derived).some((d) => d.at === 'q.task_id' && d.example === '4'))).toBe(true);
  });

  it('keeps no goal naming task #4', () => {
    const skills = compile02();
    expect(JSON.stringify(skills.map((s) => s.goal ?? {}))).not.toContain('#4');
  });

  it('publishes new_task_numeric_id from the live url where it alone reported the id', () => {
    const skills = compile02(({ backlog_column_count_after: _count, ...rest }) => rest);
    const last = skills[skills.length - 1];
    const d = Object.entries(skills.find((s) => s.derived)!.derived!).find(([, v]) => v.at === 'q.task_id')![0];
    expect(last.reportTemplate!.values.new_task_numeric_id).toBe(`{{${d}}}`);
  });

  it('derives neither of two report values that both equal the one-digit id (fwkb41 as recorded)', () => {
    // backlog_column_count_after "4" is a count that happens to equal the id.
    const values = compile02().at(-1)!.reportTemplate!.values;
    expect([values.new_task_numeric_id, values.backlog_column_count_after]).toEqual(['4', '4']);
  });
});
