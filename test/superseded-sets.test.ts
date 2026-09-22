/**
 * A set the recording did again (src/skills/toggles.ts dropSupersededSets).
 * fwvk4 n1 typed the task description, reloaded, read the editor back empty,
 * and did it again with a Save; compile kept both attempts, and every replay
 * stopped on the abandoned type's recorded autosave.
 */
import { describe, expect, it } from 'vitest';
import type { LocatorCandidate, RecordedEntry, RecordedStep, StepDiff } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { dropSupersededSets } from '../src/skills/toggles.js';

const TASK = 'http://127.0.0.1:8096/tasks/4';
const LIST = 'http://127.0.0.1:8096/projects/2/5';
const TEXT = 'Bench task for run fwvk4-n1';

const chain = (raw: string, ...c: LocatorCandidate[]) => ({ target: { expr: 'x', verified: true, raw, chain: c } });
const diff = (d: Partial<StepDiff> = {}): StepDiff => ({ url: TASK, alerts: [], added: [], dialect: 2, ...d });

// n1 28-29: the first attempt, on the editor's <p>
const P = [
  { kind: 'css', selector: 'div:nth-of-type(2) > div > div > div:nth-of-type(2) > div > p' },
  { kind: 'point', x: 638, y: 351, w: 572, h: 24, role: null, tag: 'p', vw: 1280, vh: 900 },
] as LocatorCandidate[];
// n1 34-35: the second, on the contenteditable <div> around it
const DIV = [
  { kind: 'css', selector: 'main [contenteditable="true"] >> nth=1' },
  { kind: 'css', selector: 'div:nth-of-type(1) > div:nth-of-type(2) > div > div > div:nth-of-type(2) > div' },
  { kind: 'point', x: 638, y: 351, w: 588, h: 40, role: null, tag: 'div', vw: 1280, vh: 900 },
] as LocatorCandidate[];
const SAVE = [{ kind: 'role', role: 'button', name: 'Save' }] as LocatorCandidate[];

const step = (tool: string, args: Record<string, unknown>, locators: RecordedStep['locators'] = {}, d?: StepDiff): RecordedStep => ({
  k: 'step',
  tool,
  args,
  locators,
  ...(d ? { diff: d } : {}),
});

/** fwvk4 n1 steps 27-36, as recorded. */
function fwvk4(): RecordedStep[] {
  return [
    step('click', { target: 'role=link[name="fwvk4-n1 Bench Task"]' }, chain('@e1', { kind: 'role', role: 'link', name: 'fwvk4-n1 Bench Task' } as LocatorCandidate), diff({ url: TASK, added: ['- heading "Description"'] })),
    step('click', { target: '@e759' }, chain('@e759', ...P), diff({ removed: [] })),
    step('type', { target: '@e759', text: TEXT }, chain('@e759', ...P), diff({ added: ['- heading "Description Saved!"'] })),
    step('screenshot', { path: 'a.png' }),
    step('goto', { url: TASK }, {}, diff({ added: ['- button "SAVE" [disabled]'] })),
    step('read_all', { target: 'main [contenteditable="true"]', what: 'text' }, chain('x', { kind: 'css', selector: 'main [contenteditable="true"]' } as LocatorCandidate)),
    step('eval', { expression: 'document.title' }),
    step('click', { target: 'main [contenteditable="true"] >> nth=1' }, chain('y', ...DIV), diff({ removed: [] })),
    step('type', { target: 'main [contenteditable="true"] >> nth=1', text: TEXT, delay_ms: 30 }, chain('y', ...DIV), diff({ added: ['- button "SAVE"'] })),
    step('click', { target: 'role=button[name="Save"]' }, chain('z', ...SAVE), diff({ added: ['- heading "Description Saved!"', '- button "Edit"'] })),
  ];
}

describe('dropSupersededSets', () => {
  it('drops the abandoned click+type and the reload when the same value is set again on the same editor (fwvk4 n1 27-36)', () => {
    const steps = fwvk4();
    const out = dropSupersededSets(steps);
    expect(out).toEqual([steps[0], steps[3], steps[5], steps[6], steps[7], steps[8], steps[9]]);
    // identity kept: compile matches kept steps against the recording by object
    expect(out[4]).toBe(steps[7]);
  });

  it('keeps both attempts without a reload between them, or with an action between them', () => {
    const noReload = fwvk4().filter((s) => s.tool !== 'goto');
    expect(dropSupersededSets(noReload)).toHaveLength(noReload.length);
    const acted = fwvk4();
    acted.splice(4, 0, step('click', { target: 'x' }, chain('x', ...SAVE), diff({ added: ['- heading "Saved"'] })));
    expect(dropSupersededSets(acted)).toHaveLength(acted.length);
  });

  it('keeps both when the value differs, the url differs, or the target is elsewhere', () => {
    const other = fwvk4();
    other[8] = { ...other[8], args: { ...other[8].args, text: 'something else' } };
    expect(dropSupersededSets(other)).toHaveLength(other.length);
    const moved = fwvk4();
    moved[8] = { ...moved[8], diff: diff({ url: LIST }) };
    expect(dropSupersededSets(moved)).toHaveLength(moved.length);
    const elsewhere = fwvk4();
    const far = { kind: 'point', x: 638, y: 600, w: 588, h: 40, role: null, tag: 'div', vw: 1280, vh: 900 } as LocatorCandidate;
    elsewhere[8] = { ...elsewhere[8], locators: chain('y', DIV[0], far) };
    expect(dropSupersededSets(elsewhere)).toHaveLength(elsewhere.length);
  });

  it('keeps a password and its confirmation, and a form of several fills', () => {
    const pw = (name: string) => step('fill', { target: '@e', value: 'hunter22' }, chain('@e', { kind: 'role', role: 'textbox', name } as LocatorCandidate), diff());
    const pair = [pw('Password'), pw('Confirm password')];
    expect(dropSupersededSets(pair)).toHaveLength(2);
    // even across a reload: two fields are two targets
    const reloaded = [pw('Password'), step('goto', { url: TASK }, {}, diff()), pw('Confirm password')];
    expect(dropSupersededSets(reloaded)).toHaveLength(3);
    const form = [pw('Name'), step('fill', { target: '@e', value: 'x@y.z' }, chain('@e', { kind: 'role', role: 'textbox', name: 'Email' } as LocatorCandidate), diff()), pw('Password')];
    expect(dropSupersededSets(form)).toHaveLength(3);
  });

  it('supersedes a fill re-done on the same named field after a reload', () => {
    const name = { kind: 'role', role: 'textbox', name: 'Title' } as LocatorCandidate;
    const first = step('fill', { target: '@e', value: 'Bench' }, chain('@e', name), diff());
    const reload = step('goto', { url: TASK }, {}, diff());
    const again = step('fill', { target: '@f', value: 'Bench' }, chain('@f', name), diff());
    expect(dropSupersededSets([first, reload, again])).toEqual([again]);
  });
});

describe('compile: a set done again compiles once', () => {
  it('compiles fwvk4 n1 27-36 to the link, one click, one type and Save', () => {
    const entries: RecordedEntry[] = [{ k: 'instruction', text: `open the task and set its description to '${TEXT}'`, url: LIST }, ...fwvk4()];
    const [first, ...rest] = compileSkills({
      entries,
      instruction: `open the task and set its description to '${TEXT}'`,
      report: { status: 'success', summary: 'done', evidence: { values: {} } },
      session: 't',
      now: '2026-09-22T00:00:00.000Z',
    });
    const steps = [first, ...rest].flatMap((s) => s.steps);
    expect(steps.map((s) => s.tool)).toEqual(['click', 'click', 'type', 'click']);
    expect(steps[2].args.target).toBe('main [contenteditable="true"] >> nth=1');
    expect(steps.some((s) => s.tool === 'goto')).toBe(false);
    expect(steps.filter((s) => s.expect?.addedContains?.includes('- heading "Description Saved!"'))).toHaveLength(1);
  });
});
