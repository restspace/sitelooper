/**
 * An app that saves by itself, on a timer after a value is typed, saves nothing
 * for a run that leaves the page before the timer fires.
 *
 * vikunja fwvk18-fc 03-create: the recording typed a task's description, the
 * app's own timer POSTed it 4.6 s later, and the recording's next action, a
 * goto, went out 5.7 s after the typing. Replay n2's goto went out 2.2 s
 * after: every step passed and the description was never stored. Compile now
 * records how long the app's own save took (SkillStep.savedAfterMs) and both
 * runners hold the next step that long (execution/lifecycle.ts).
 */
import { describe, expect, it } from 'vitest';
import type { RecordedStep } from '../src/daemon/recorder.js';
import { RECORDED_SAVE_MAX_MS, RECORDED_SAVE_SLACK_MS, holdForRecordedSave, recordedSaveHold } from '../src/execution/lifecycle.js';
import { savedAfterCapture } from '../src/skills/compile.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow, SpecSegment } from '../src/spec/ir.js';

const APP = 'http://app.test';
const TASK = `${APP}/tasks/4`;
const base = 1_000_000;

/** A recorded step dispatched `d` ms in, captured 470 ms later, on `url`. */
const step = (tool: string, d: number, more: Record<string, unknown> = {}, url: string | null = TASK): RecordedStep =>
  ({
    k: 'step',
    tool,
    args: { target: '@e1' },
    locators: {},
    obs: { at: { d: base + d, s: base + d + 450, c: base + d + 470 } },
    journal: { w: d },
    ...(url ? { diff: { url, added: [], removed: [] } } : {}),
    ...more,
  }) as unknown as RecordedStep;
const gap = (ev: unknown[]) => ({ journal: { w: 1, gap: { ev } } });
const save = (t: number, more: Record<string, unknown> = {}) => ({ t: base + t, k: 'req', m: 'POST', e: `${APP}/api/v1/tasks/4`, rt: 'xhr', t1: base + t + 13, s: 200, c: ['app', 'timer'], ...more });
const held = (steps: RecordedStep[]) => steps.map((s) => (s.obs ? savedAfterCapture(steps).get(s.obs) ?? null : null));

// fwvk18-fc #61-#65 in miniature: click into the editor, type, screenshot, read, goto.
const typed = step('type', 1_000); // captured at 1470
const recording = (ev: unknown[], last: RecordedStep = step('goto', 7_200, gap(ev))): RecordedStep[] => [
  step('click', 0),
  typed,
  step('screenshot', 3_500, {}, null),
  step('read_all', 5_100, {}, null),
  last,
];

describe('savedAfterCapture', () => {
  it('the typing step is given the time the app\'s own save took, measured to its answer', () => {
    // POST at 6070 answered at 6083: 4613 ms after the capture at 1470.
    expect(held(recording([save(6_070)]))).toEqual([null, 4_613, null, null, null]);
  });

  it('a save that fell inside an observation between the two counts as well', () => {
    const steps = recording([]);
    (steps[3] as unknown as { journal: unknown }).journal = { w: 5, ev: [save(5_105, { c: ['in', 5, 'observe'] })] };
    expect(held(steps)).toEqual([null, 3_648, null, null, null]);
  });

  it('the last gesture before leaving carries it, when a value was entered on the page earlier', () => {
    const steps = [step('type', 0), step('click', 1_000), step('goto', 7_200, gap([save(6_070)]))];
    expect(held(steps)).toEqual([null, 4_613, null]);
  });

  it('a click that the recording shows landed on another url is a leave too', () => {
    const steps = [typed, step('click', 7_200, gap([save(6_070)]), `${APP}/projects/2`)];
    expect(held(steps)).toEqual([4_613, null]);
  });

  it('none when the recording does not show all of it', () => {
    const none = (steps: RecordedStep[]) => expect(held(steps).every((v) => v === null)).toBe(true);
    // No write at all; a read; a poll; a write a gesture caused; an ambiguous one; one that failed.
    none(recording([]));
    none(recording([save(6_070, { m: 'GET' })]));
    none(recording([save(6_070, { c: ['app', 'poll'] })]));
    none(recording([save(6_070, { c: ['in', 7, 'gesture'] })]));
    none(recording([save(6_070, { also: 3 })]));
    none(recording([save(6_070, { s: 500 })]));
    // Before the capture (the step's own doing), or after the next action went out.
    none(recording([save(1_200)]));
    none(recording([save(7_195)]));
    // Too long after to wait for.
    none(recording([save(1_470 + RECORDED_SAVE_MAX_MS)], step('goto', 20_000, gap([save(1_470 + RECORDED_SAVE_MAX_MS)]))));
    // The next action stays on the page: the app's timer is still running.
    none(recording([save(6_070)], step('click', 7_200, gap([save(6_070)]))));
    // Nothing was typed on this page: there is nothing to save.
    none([step('click', 0), step('click', 1_000), step('goto', 7_200, gap([save(6_070)]))]);
    // …or it was typed on the page before this one.
    none([step('type', 0, {}, `${APP}/other`), step('click', 1_000), step('goto', 7_200, gap([save(6_070)]))]);
    // No journal, no evidence, no next step.
    none([typed, step('goto', 7_200)]);
    none([step('type', 1_000, { obs: undefined }), step('goto', 7_200, gap([save(6_070)]))]);
    none([typed]);
  });
});

describe('recordedSaveHold', () => {
  it('that long from the settle, plus the slack, less what has passed', () => {
    expect(recordedSaveHold(4_613, 10_000, 10_000)).toBe(4_613 + RECORDED_SAVE_SLACK_MS);
    expect(recordedSaveHold(4_613, 10_000, 12_200)).toBe(4_613 + RECORDED_SAVE_SLACK_MS - 2_200);
    expect(recordedSaveHold(4_613, 10_000, 16_000)).toBe(0);
    expect(recordedSaveHold(60_000, 0, 0)).toBe(RECORDED_SAVE_MAX_MS + RECORDED_SAVE_SLACK_MS);
    for (const none of [undefined, null, 0, -5, Number.NaN, '4613']) expect(recordedSaveHold(none, 0, 0)).toBe(0);
  });

  it('holdForRecordedSave waits that long and says so', async () => {
    const started = Date.now() - RECORDED_SAVE_SLACK_MS;
    const slept = await holdForRecordedSave(40, started);
    expect(slept).toBeGreaterThan(0);
    expect(Date.now() - started).toBeGreaterThanOrEqual(40 + RECORDED_SAVE_SLACK_MS - 5);
    expect(await holdForRecordedSave(undefined, started)).toBe(0);
  });
});

describe('the compiled spec holds after the same step, with the shared helper', () => {
  const steps: SpecSegment['steps'] = [
    { tool: 'type', args: { target: '@e1', text: 'a description' }, locators: { target: [{ kind: 'css', selector: '#editor' }] }, savedAfterMs: 4_613 },
    { tool: 'goto', args: { url: `${APP}/projects/2` }, locators: {} },
  ];
  const flow: SpecFlow = {
    version: 1,
    name: 'saved-after',
    origin: APP,
    startUrl: TASK,
    vars: [],
    steps: [{ id: '01-step', instruction: 'describe it', params: {}, outputs: [], segments: [{ id: 's_1', template: 'describe it', params: {}, preconditions: { urlPattern: TASK }, steps }] }],
  };

  it('emits one hold, timed from the typing step\'s own settle', () => {
    const { source } = emitFlowFile(flow, { tier: 'plain' });
    const body = source.slice(source.indexOf('export const steps = {'));
    expect([...body.matchAll(/if \((movedSettled\d+)\) await holdForRecordedSave\((\d+), \1\);/g)].map((m) => Number(m[2]))).toEqual([4_613]);
    expect([...body.matchAll(/movedSettled\d+ = Date\.now\(\);/g)]).toHaveLength(1);
    expect(body).not.toContain('holdForRecordedMove(');
    expect(source).toContain('async function holdForRecordedSave(');
  });
});
