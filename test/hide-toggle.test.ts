import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { hideEffectLines, hideVerdict } from '../src/execution/toggle.js';
import { compileSkills } from '../src/skills/compile.js';
import type { SkillStep } from '../src/skills/store.js';

/**
 * vikunja fwvk8-n1 02-create (round 56; n1 lines 28-63 verbatim): 01-open's
 * FILTERS click had opened the filter popup, and 02-create began with Escape
 * (which did nothing) and the SAME click, which CLOSED it — added [], removed
 * the popup's lines. Compiled with no content check (removals were kept only
 * for dialogs), that click opened the popup on every replay whose page had it
 * closed, and passed; the open popup swallowed the Add click. s_7f135a/4
 * failed every time, and n2/n3 graduated the inverted effect.
 */
const entries = (): RecordedEntry[] =>
  fs
    .readFileSync(path.join(__dirname, 'fixture', 'fwvk8-n1-02-create.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);

function compiled(es: RecordedEntry[] = entries()): SkillStep[] {
  const head = es[0] as Extract<RecordedEntry, { k: 'instruction' }>;
  const report = es.find((e): e is Extract<RecordedEntry, { k: 'report' }> => e.k === 'report')!;
  return compileSkills({
    entries: es.filter((e) => e.k !== 'report'),
    instruction: head.text,
    report: { status: 'success', summary: report.summary ?? '', evidence: { values: report.values ?? {} } },
    session: 't',
    knownValues: { 'var:runid': 'fwvk8-n1' },
  }).flatMap((s) => s.steps);
}
const filters = (steps: SkillStep[]) => steps.find((s) => s.tool === 'click' && s.args.target === '@e233')!;

describe('a click whose whole recorded effect is a removal checks it (fwvk8)', () => {
  it('compiles the FILTERS click with the popup lines it removed', () => {
    const click = filters(compiled());
    expect(click.expect?.removedContains).toEqual(expect.arrayContaining(['- textbox "Type a search or filter query…"', '- button "Custom"']));
    expect(hideEffectLines(click)).toContain('- textbox "Type a search or filter query…"');
  });

  it('the gate stops when every line the click was recorded removing still shows', () => {
    const lines = ['- textbox "Type a search or filter query…"', '- button "Custom"'];
    const open = hideVerdict(lines, {}, { lines: ['- heading "Bench Project"', ...lines], complete: true }, '2');
    expect(open.stop).toMatch(/still shows/);
    expect(hideVerdict(lines, {}, { lines: ['- heading "Bench Project"'], complete: true }, '2').stop).toBeUndefined();
    // a look that could not be taken is reported, never a pass or a stop
    const blind = hideVerdict(lines, {}, null, '2');
    expect(blind.stop).toBeUndefined();
    expect(blind.unobserved).toBe(true);
  });
});

describe('what a removal does NOT make a hide', () => {
  const url = 'http://x.test/p';
  const click = (removed: string[], added: string[] = []): RecordedStep => ({
    k: 'step',
    tool: 'click',
    args: { target: '@e1' },
    locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name: 'Toggle' }] } },
    diff: { url, alerts: [], added, removed, dialect: 2 },
  });
  const compileOne = (step: RecordedStep) =>
    compileSkills({ entries: [{ k: 'instruction', text: 'do it', url }, step], instruction: 'do it', report: { status: 'success', summary: 'ok' }, session: 't' })[0].steps[0];

  it('a dialog dismissal keeps its dialog removal and is left to the dismissal rule', () => {
    const step = compileOne(click(['- dialog "Welcome"', '- button "Close"']));
    expect(step.expect?.removedContains).toContain('- dialog "Welcome"');
    expect(hideEffectLines(step)).toEqual([]);
  });

  it('a removal of a record (a row) is a consequence, not a hide', () => {
    expect(compileOne(click(['- row "RD-1015 Printer jam"'])).expect?.removedContains).toBeUndefined();
  });

  it('a click that also added a line is not a hide', () => {
    const step = compileOne(click(['- button "Custom"'], ['- heading "Filters applied"']));
    expect(hideEffectLines(step)).toEqual([]);
  });
});
