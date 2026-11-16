/**
 * Declared fix-ups, record side (execution/fixup.ts; erpnext fwen10-fr):
 * where the `fixup` tool is offered, what it refuses before anything is
 * recorded, and how the recorder marks the steps of an open fix-up. The whole
 * path on a real page is test/fixup-record.browser.test.ts.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ASSERT_TOOLS, TOOL_DEFS, assertRefusal, executeTool, toolDefsFor } from '../src/agent/tools.js';
import { OPERATING_RULES, buildSystemPrompt } from '../src/agent/prompt.js';
import type { BrowserSession } from '../src/daemon/browser.js';
import { ScriptRecorder, type RecordedEntry, type RecordedStep } from '../src/daemon/recorder.js';
import { GUARD_STATES, malformedFixups, wellFormedFixup } from '../src/execution/fixup.js';

let tmpHome: string;
beforeAll(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-fixup-'));
  process.env.SITELOOPER_HOME = tmpHome;
});
afterAll(() => {
  delete process.env.SITELOOPER_HOME;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

/** A page of selectors with a count each: just what wait_for asks a locator. */
function countPage(counts: Record<string, number>) {
  return {
    url: () => 'http://app.test/orders/7',
    locator(selector: string) {
      const n = counts[selector] ?? 0;
      const loc = {
        count: async () => n,
        first: () => loc,
        or: () => loc,
        isVisible: async () => n > 0,
        innerText: async () => {
          if (!n) throw new Error('no element');
          return 'row';
        },
        waitFor: async ({ state }: { state: string }) => {
          if ((state === 'visible') !== n > 0) throw new Error(`Timeout waiting for ${state}`);
        },
      };
      return loc;
    },
  };
}

const step = (tool: string, args: Record<string, unknown> = {}): RecordedStep => ({ k: 'step', tool, args, locators: {} });
const check = { target: 'a:has-text("Widget")', state: 'count' as const, count: 2 };
const steps = (r: ScriptRecorder) => r.entries.filter((e): e is RecordedStep => e.k === 'step');
const onDisk = (name: string): RecordedEntry[] =>
  fs
    .readFileSync(path.join(tmpHome, 'sessions', name, 'script.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);

describe('fixup: where it is offered', () => {
  it('is offered in learning mode, and not without a skill store', () => {
    expect(toolDefsFor({ learn: {} } as unknown as BrowserSession).map((t) => t.name)).toContain('fixup');
    expect(toolDefsFor({} as unknown as BrowserSession).map((t) => t.name)).not.toContain('fixup');
  });

  it('is never offered or run in assert mode', () => {
    expect(ASSERT_TOOLS.has('fixup')).toBe(false);
    expect(toolDefsFor({ learn: {} } as unknown as BrowserSession, { on: false }, { assert: true }).map((t) => t.name)).not.toContain('fixup');
    expect(assertRefusal('fixup', { reason: 'x', ...check }, 'no error banner')).toMatch(/fixup is not available/);
  });

  it('checks exactly the guard states, and takes no timeout', () => {
    const def = TOOL_DEFS.find((t) => t.name === 'fixup')!;
    const params = def.parameters as Record<string, any>;
    expect(params.properties.state.enum).toEqual([...GUARD_STATES]);
    expect(params.required).toEqual(['reason', 'target', 'state']);
    expect(params.properties.timeout_ms).toBeUndefined();
  });

  it('is in the ordinary operating rules, which the assert prompt overrides (A1), not in the assert rules', () => {
    expect(OPERATING_RULES).toMatch(/FIX-UPS: .*call fixup FIRST/);
    const assert = buildSystemPrompt({ notes: [] }, { assert: true });
    expect(assert.slice(OPERATING_RULES.length)).not.toContain('fixup');
  });
});

describe('fixup: refusals record nothing', () => {
  const session = (recorder: ScriptRecorder | null, page: unknown = countPage({})) =>
    ({ dialogs: { drain: () => [] }, isOpen: false, learn: recorder ? {} : null, script: recorder, getPage: async () => page }) as unknown as BrowserSession;
  const call = (s: BrowserSession, args: Record<string, unknown>) => executeTool(s, 'fixup', args, os.tmpdir());

  it('refuses outside learning mode', async () => {
    const out = await call(session(null), { reason: 'r', ...check });
    expect(out).toMatchObject({ isError: true });
    expect(out.result).toMatch(/only while recording in learning mode/);
  });

  it('refuses a check that does not hold now, saying what it found', async () => {
    const recorder = new ScriptRecorder('t-fixup-refuse');
    recorder.beginInstruction('submit the order');
    const out = await call(session(recorder, countPage({ 'a:has-text("Widget")': 1 })), { reason: 'the order has the Widget row twice', ...check });
    expect(out.isError).toBe(true);
    expect(out.result).toMatch(/its check does not hold now/);
    expect(out.result).toMatch(/count=1/);
    expect(out.result).toMatch(/Nothing was recorded/);
    expect(steps(recorder)).toHaveLength(0);
    expect(recorder.openFixup).toBeNull();
    expect(onDisk('t-fixup-refuse').filter((e) => e.k === 'step')).toHaveLength(0);
  }, 10_000);

  it('refuses a snapshot ref, a missing reason, an unknown state, and a count without count', async () => {
    const recorder = new ScriptRecorder('t-fixup-args');
    const s = session(recorder);
    expect((await call(s, { reason: 'r', target: '@e12', state: 'visible' })).result).toMatch(/snapshot ref/);
    expect((await call(s, { target: '#a', state: 'visible' })).result).toMatch(/needs a reason/);
    expect((await call(s, { reason: 'r', target: '#a', state: 'value_equals', text: 'x' })).result).toMatch(/not one a fix-up can check/);
    expect((await call(s, { reason: 'r', target: '#a', state: 'count' })).result).toMatch(/needs count/);
    expect((await call(s, { reason: 'r', target: '#a', state: 'text_equals' })).result).toMatch(/needs text/);
    expect(recorder.entries).toHaveLength(0);
  });

  it('refuses a second fix-up while one is open', async () => {
    const recorder = new ScriptRecorder('t-fixup-nest');
    recorder.beginInstruction('submit the order');
    recorder.commit(step('wait_for', { ...check }), 'condition met: count=2', { guard: { reason: 'dup', check } });
    const out = await call(session(recorder, countPage({ 'a:has-text("Widget")': 2 })), { reason: 'another', target: '#draft', state: 'visible' });
    expect(out.isError).toBe(true);
    expect(out.result).toMatch(/fix-up g1 is still open .*do not nest/);
    expect(steps(recorder)).toHaveLength(1);
  });
});

describe('fixup: the recorder marks an open fix-up', () => {
  it('numbers the guard, marks what follows guarded, and closes at guardEnd', () => {
    const recorder = new ScriptRecorder('t-fixup-marks');
    recorder.beginInstruction('submit the order');
    recorder.commit(step('click', { target: '#open' }), 'clicked');
    recorder.commit(step('wait_for', { ...check }), 'condition met: count=2', { guard: { reason: 'the Widget row is there twice', check } });
    expect(recorder.openFixup).toEqual({ id: 'g1', check });
    recorder.commit(step('check', { target: '#row-2' }), 'checked');
    recorder.commit(step('read', { target: '#n', what: 'text' }), '"2 rows"');
    recorder.commit(step('click', { target: '#delete' }), 'clicked', { guardEnd: true });
    expect(recorder.openFixup).toBeNull();
    expect(recorder.takeClosedFixup()).toEqual({ id: 'g1', tool: 'click' });
    expect(recorder.takeClosedFixup()).toBeNull();
    recorder.commit(step('click', { target: '#submit' }), 'clicked');
    const s = steps(recorder);
    expect(s.map((e) => [e.tool, e.guard?.id, e.guarded, e.guardEnd])).toEqual([
      ['click', undefined, undefined, undefined],
      ['wait_for', 'g1', undefined, undefined],
      ['check', undefined, 'g1', undefined],
      ['read', undefined, 'g1', undefined],
      ['click', undefined, 'g1', true],
      ['click', undefined, undefined, undefined],
    ]);
    expect(s[1].guard).toEqual({ id: 'g1', reason: 'the Widget row is there twice' });
    expect(wellFormedFixup(s, 1)).toBe(true);
    // On disk exactly as in memory: the file is append-only, so the marks are on the lines as written.
    const disk = onDisk('t-fixup-marks').filter((e): e is RecordedStep => e.k === 'step');
    expect(disk.map((e) => [e.guard?.id, e.guarded, e.guardEnd])).toEqual(s.map((e) => [e.guard?.id, e.guarded, e.guardEnd]));
  });

  it('leaves the group without guardEnd when the instruction reports first, and says so on stderr', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recorder = new ScriptRecorder('t-fixup-open');
    recorder.beginInstruction('submit the order');
    recorder.commit(step('wait_for', { ...check }), 'condition met: count=2', { guard: { reason: 'dup', check } });
    recorder.commit(step('click', { target: '#delete' }), 'clicked');
    recorder.endInstruction({ status: 'success', summary: 'done', values: {} });
    expect(recorder.openFixup).toBeNull();
    expect(err.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringMatching(/fix-up g1 left open: the instruction reported/)]);
    err.mockRestore();
    const s = steps(recorder);
    expect(s[1]).toMatchObject({ guarded: 'g1' });
    expect(s[1].guardEnd).toBeUndefined();
    expect(malformedFixups(s)).toEqual(['g1']);
    // The next instruction starts with nothing open, and its guard is g2.
    recorder.beginInstruction('next');
    recorder.commit(step('click', { target: '#x' }), 'clicked');
    expect(steps(recorder).at(-1)!.guarded).toBeUndefined();
    recorder.commit(step('wait_for', { target: '#draft', state: 'visible' }), 'condition met: visible', { guard: { reason: 'a draft is left', check: { target: '#draft', state: 'visible' } } });
    expect(recorder.openFixup?.id).toBe('g2');
  });

  it('never marks a failed step, and a new instruction closes a fix-up the last one left open', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recorder = new ScriptRecorder('t-fixup-failed');
    recorder.beginInstruction('submit the order');
    recorder.commit(step('wait_for', { ...check }), 'condition met: count=2', { guard: { reason: 'dup', check } });
    recorder.fail(step('click', { target: '#gone' }), { kind: 'not-dispatched', reason: 'never-attached', message: 'x' } as never);
    const failed = onDisk('t-fixup-failed').find((e) => e.k === 'step' && e.failed) as RecordedStep;
    expect(failed.guarded).toBeUndefined();
    expect(recorder.openFixup?.id).toBe('g1');
    recorder.beginInstruction('a resumed attempt');
    expect(recorder.openFixup).toBeNull();
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it('puts a read-back inserted inside a fix-up into it, and one inserted after its last step outside', () => {
    const recorder = new ScriptRecorder('t-fixup-insert');
    recorder.beginInstruction('submit the order');
    recorder.commit(step('wait_for', { ...check }), 'condition met: count=2', { guard: { reason: 'dup', check } });
    recorder.commit(step('check', { target: '#row-2' }), 'checked');
    const inside = steps(recorder).at(-1)!;
    recorder.commit(step('click', { target: '#delete' }), 'clicked', { guardEnd: true });
    const last = steps(recorder).at(-1)!;
    recorder.insertStepAfter(inside, step('read', { target: '(read-back)', what: 'text' }));
    recorder.insertStepAfter(last, step('read', { target: '(read-back)', what: 'value' }));
    const s = steps(recorder);
    expect(s.map((e) => [e.tool, e.guarded, e.guardEnd])).toEqual([
      ['wait_for', undefined, undefined],
      ['check', 'g1', undefined],
      ['read', 'g1', undefined],
      ['click', 'g1', true],
      ['read', undefined, undefined],
    ]);
    expect(wellFormedFixup(s, 0)).toBe(true);
  });

  it('continues guard numbering from a previous take on disk', () => {
    const first = new ScriptRecorder('t-fixup-takes');
    first.beginInstruction('a');
    first.commit(step('wait_for', { ...check }), 'condition met: count=2', { guard: { reason: 'dup', check } });
    first.commit(step('click', { target: '#delete' }), 'clicked', { guardEnd: true });
    const second = new ScriptRecorder('t-fixup-takes');
    second.beginInstruction('b');
    second.commit(step('wait_for', { ...check }), 'condition met: count=2', { guard: { reason: 'dup', check } });
    expect(second.openFixup?.id).toBe('g2');
  });
});
