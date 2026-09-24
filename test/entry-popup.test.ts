/**
 * Round 59 — snipeit fwsi10 (results/fwsi10-abuzrn). test/fixture/fwsi10-n1-script.jsonl
 * is the published n1 recording.
 *
 * 03-create filled #purchase_date with "2026-03-15" (#35), which opened the
 * date picker (its diff added the calendar), then clicked the day "15" (#36:
 * added nothing, removed exactly the calendar #35 added) and read the field
 * back (#37: "2026-03-15", the value the fill had typed). Compiled as s_6cdda3
 * step 7, the click had no content check — the calendar's rows and cells read
 * as record lines, so its removal counted as a consequence — and its chain led
 * with the positional `div > div:nth-of-type(1) > table > tbody > tr:nth-of-type(3) > td:nth-of-type(1)`
 * (stableFirst took "15" for an id by its shape). n2 and n3 replayed steps 1-6,
 * found no calendar at step 7, and paid 23 and 29 model turns.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { hideEffectLines } from '../src/execution/toggle.js';
import { compileSkills } from '../src/skills/compile.js';
import type { SkillStep } from '../src/skills/store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (): RecordedEntry[] =>
  fs
    .readFileSync(path.join(here, 'fixture', 'fwsi10-n1-script.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);

/** 03-create (#26 … #61) compiled as the recording's daemon compiled it. */
function compile03(mutate?: (e: RecordedEntry[]) => void): SkillStep[] {
  const e = load();
  mutate?.(e);
  const own = e.slice(25, 60);
  const report = e[60] as Extract<RecordedEntry, { k: 'report' }>;
  return compileSkills({
    entries: own,
    instruction: (own[0] as Extract<RecordedEntry, { k: 'instruction' }>).text,
    report: { status: 'success', summary: report.summary, evidence: { values: report.values ?? {} } },
    session: 'fwsi10-n1',
    knownValues: { 'var:runid': 'fwsi10-n1' },
  }).flatMap((s) => s.steps);
}
const dayClick = (steps: SkillStep[]) => steps.find((s) => s.tool === 'click' && String(s.args.target).includes('has-text("15")'))!;

describe('rule A: a click that only closed the picker its entry opened is conditional (fwsi10 #35-#37)', () => {
  it('records what the click took away, so a replay can skip it when the picker is not open', () => {
    const click = dayClick(compile03());
    expect(click.expect?.removedContains).toEqual(['- row "March 2026"', '- cell "Select Month"', '- row "Su Mo Tu We Th Fr Sa"', '- cell "Su"', '- cell "Mo"']);
    expect(click.expect?.removalRequired).toBeUndefined();
    expect(hideEffectLines(click).length).toBeGreaterThan(0);
  });

  it('keeps a picker click that changed the field value an ordinary step (it still replays)', () => {
    const click = dayClick(
      compile03((e) => {
        const s = e[35] as RecordedStep;
        s.diff = { ...s.diff!, added: ['- textbox "Select Date (YYYY-MM-DD)": 2026-03-16'] };
      }),
    );
    expect(click.expect?.addedContains?.length).toBeGreaterThan(0);
    expect(hideEffectLines(click)).toEqual([]);
  });

  it('keeps an option click that took away the search box its query was typed in (openproject fwop11/12 ng-select)', () => {
    const url = 'http://127.0.0.1:8090/projects/bench-project/work_packages/new';
    const list = ['- combobox "Search": Bench', '- listbox "Options List"', '- option "Bench User"'];
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'assign it', url },
      { k: 'step', tool: 'fill', args: { target: '@e1', value: 'Bench' }, locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'combobox', name: 'Search' }] } }, diff: { url, alerts: [], added: list, dialect: 2 } },
      { k: 'step', tool: 'click', args: { target: '.ng-option' }, locators: { target: { expr: 'x', verified: true, raw: '.ng-option', chain: [{ kind: 'css', selector: '.ng-option' }] } }, diff: { url, alerts: [], added: [], removed: list, dialect: 2 } },
    ];
    const option = compileSkills({ entries, instruction: 'assign it', report: { status: 'success', summary: 'ok' }, session: 's' }).flatMap((s) => s.steps).find((s) => s.args.target === '.ng-option')!;
    expect(option.expect?.removalRequired).toBe(true);
  });

  it('still requires the removal when a click, not the entry, opened what it closes (vikunja fwvk5 "Set Priority")', () => {
    const url = 'http://127.0.0.1:8096/tasks/4';
    const at = (added: string[], removed: string[] = []) => ({ diff: { url, alerts: [], added, removed, dialect: 2 as const } });
    const click = (name: string, extra: Partial<RecordedStep>): RecordedStep => ({
      k: 'step',
      tool: 'click',
      args: { target: name },
      locators: { target: { expr: 'x', verified: true, raw: name, chain: [{ kind: 'role', role: 'button', name }] } },
      ...extra,
    });
    const popup = ['- button "Today Tue"', '- button "Tomorrow Wed"'];
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'set a due date', url },
      click('Set due date', at(popup)),
      click('Set Priority', at([], popup)),
    ];
    const steps = compileSkills({ entries, instruction: 'set a due date', report: { status: 'success', summary: 'ok' }, session: 's' }).flatMap((s) => s.steps);
    expect(steps.find((s) => s.args.target === 'Set Priority')?.expect?.removalRequired).toBe(true);
  });
});

describe('rule B: a candidate whose digits come from the task\'s own value is not demoted by its shape (s_6cdda3 step 7)', () => {
  it('keeps the recording\'s named candidates ahead of the positional path', () => {
    const chain = dayClick(compile03()).locators.target;
    expect(chain.map((c) => c.kind)).toEqual(['css', 'text', 'css', 'point']);
    expect(chain[0]).toEqual({ kind: 'css', selector: '.datepicker-days td.day:not(.old):not(.new):has-text("15")' });
    expect(chain[1]).toEqual({ kind: 'text', text: '15' });
  });

  it('still demotes a digit name the task never stated (a record\'s own id)', () => {
    const chain = dayClick(
      compile03((e) => {
        // The same click, recorded under an instruction that states no date.
        (e[25] as Extract<RecordedEntry, { k: 'instruction' }>).text = "Create a new asset named 'fwsi10-n1 Bench Asset' and set a purchase date with the date picker.";
      }),
    ).locators.target;
    expect(chain[0].kind).toBe('css');
    expect((chain[0] as { selector: string }).selector).toContain('nth-of-type');
  });
});
