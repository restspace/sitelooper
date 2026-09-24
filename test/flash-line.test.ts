/**
 * Round 61 — vikunja fwvk12 (results/fwvk12-pxk01s). test/fixture/fwvk12-n1-script.jsonl
 * is the published n1 recording.
 *
 * 02-create's #24 clicked the empty description placeholder, and its diff
 * caught `- heading "Description Saved!"` (the heading "Description" renamed),
 * a timed save indicator. It reverted by itself — nothing recorded removing it
 * — and #35, the description's Save, recorded it appearing again. Compiled as
 * s_329439 step 1's only line, it stopped n2 and n3 at step 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { parseScript } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import type { SkillStep } from '../src/skills/store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
/** The recording as the daemon reads it: phase A's failed steps dropped. */
const load = (): RecordedEntry[] => parseScript(fs.readFileSync(path.join(here, 'fixture', 'fwvk12-n1-script.jsonl'), 'utf8').replace(/\r\n/g, '\n')).entries;

function compile02(): SkillStep[][] {
  const e = load();
  const start = e.findIndex((x) => x.k === 'instruction' && x.text.includes('create a new task titled'));
  const end = e.findIndex((x, i) => i > start && x.k === 'report');
  const own = e.slice(start, end);
  const report = e[end] as Extract<RecordedEntry, { k: 'report' }>;
  return compileSkills({
    entries: own,
    instruction: (own[0] as Extract<RecordedEntry, { k: 'instruction' }>).text,
    report: { status: 'success', summary: report.summary, evidence: { values: report.values ?? {} } },
    session: 'fwvk12-n1',
    knownValues: { 'var:runid': 'fwvk12-n1' },
  }).map((s) => s.steps);
}

describe('a flash is not a step\'s effect (fwvk12 02-create, n1 #24 and #35)', () => {
  it('the placeholder click (s_329439 step 1) loses the flashed line; the Save (step 11) keeps it', () => {
    const task = compile02()[1];
    const placeholder = task[0];
    expect(placeholder.args.target).toBe('@e414');
    expect(placeholder.expect?.addedContains ?? []).not.toContain('- heading "Description Saved!"');
    const save = task.find((s) => s.args.target === '@e415')!;
    expect(save.expect?.addedContains).toContain('- heading "Description Saved!"');
  });
});

describe('controls: where the line stays', () => {
  const url = 'http://127.0.0.1:8096/tasks/4';
  const at = (added: string[], removed: string[] = []) => ({ diff: { url, alerts: [], added, removed, dialect: 2 as const } });
  const step = (tool: string, target: string, extra: Partial<RecordedStep>, args: Record<string, unknown> = {}): RecordedStep => ({
    k: 'step',
    tool,
    args: { target, ...args },
    locators: { target: { expr: 'x', verified: true, raw: target, chain: [{ kind: 'role', role: 'button', name: target }] } },
    ...extra,
  });
  const compile = (steps: RecordedStep[]) =>
    compileSkills({ entries: [{ k: 'instruction', text: 'edit the task', url }, ...steps], instruction: 'edit the task', report: { status: 'success', summary: 'ok' }, session: 's' }).flatMap((s) => s.steps);
  const FLASH = '- heading "Saved!"';

  it('two Saves that each flash the same toast keep both lines', () => {
    const steps = compile([
      step('fill', 'Title', at(['- textbox "Title": A']), { value: 'A' }),
      step('click', 'Save', at([FLASH])),
      step('fill', 'Notes', at(['- textbox "Notes": B']), { value: 'B' }),
      step('click', 'Save changes', at([FLASH])),
    ]);
    const saves = steps.filter((s) => s.tool === 'click');
    expect(saves.map((s) => s.expect?.addedContains?.includes(FLASH))).toEqual([true, true]);
  });

  it('a line a step in between explicitly removes is kept', () => {
    const steps = compile([
      step('click', 'Open panel', at([FLASH])),
      step('click', 'Close panel', at([], [FLASH])),
      step('fill', 'Notes', at(['- textbox "Notes": B']), { value: 'B' }),
      step('click', 'Save', at([FLASH])),
    ]);
    expect(steps.find((s) => s.args.target === 'Open panel')?.expect?.addedContains).toContain(FLASH);
  });

  it('a confirm the previous click raised keeps its line (ghost fwgh6 "Publish post, right now")', () => {
    const steps = compile([
      step('click', 'Publish', at(['- button "Publish post, right now"'])),
      step('click', 'Publish post, right now', at([FLASH])),
      step('click', 'Settings', at([], [])),
      step('click', 'Update', at([FLASH])),
    ]);
    expect(steps.find((s) => s.args.target === 'Publish post, right now')?.expect?.addedContains).toContain(FLASH);
  });

  it('keeps the line when a step in between has no complete record of what it removed (a recording before round 56)', () => {
    const steps = compile([
      step('click', 'Open panel', at([FLASH, '- button "Edit"'])),
      step('click', 'Other', { diff: { url, alerts: [], added: ['- heading "Other"'], dialect: 2 } }),
      step('click', 'Save', at([FLASH])),
    ]);
    expect(steps.find((s) => s.args.target === 'Open panel')?.expect?.addedContains).toContain(FLASH);
  });

  it('a non-submitting click whose line a later Save shows again loses it', () => {
    const steps = compile([
      step('click', 'Open panel', at([FLASH, '- button "Edit"'])),
      step('fill', 'Notes', at(['- textbox "Notes": B']), { value: 'B' }),
      step('click', 'Save', at([FLASH])),
    ]);
    expect(steps.find((s) => s.args.target === 'Open panel')?.expect?.addedContains).toEqual(['- button "Edit"']);
    expect(steps.find((s) => s.args.target === 'Save')?.expect?.addedContains).toEqual([FLASH]);
  });
});
