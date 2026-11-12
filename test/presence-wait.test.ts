/**
 * A wait for its target to APPEAR is given its own timeout to find that
 * target, in both runners (replay.ts presenceWaitMs). Ghost fwgh21-fr
 * s_80a461 step 2, `wait_for text=Saved visible timeout_ms:15000`, stopped
 * after the fixed 3 s resolve window on both replays while the editor still
 * showed "Saving...".
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { PRESENCE_WAIT_FLOOR_MS, presenceWaitMs, replaySkill } from '../src/skills/replay.js';
import type { Skill, SkillStep } from '../src/skills/store.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';

let savedWait: string | undefined;
beforeEach(() => {
  savedWait = process.env.SITELOOPER_RESOLVE_WAIT_MS;
  // A short standard window, so "after the window, within the timeout" is quick to show.
  process.env.SITELOOPER_RESOLVE_WAIT_MS = '50';
});
afterEach(() => {
  if (savedWait === undefined) delete process.env.SITELOOPER_RESOLVE_WAIT_MS;
  else process.env.SITELOOPER_RESOLVE_WAIT_MS = savedWait;
});

/** A page where `text=Saved` is attached from `appearsAt` ms after the fake is made. */
function fakePage(appearsAt: number): Page {
  const born = Date.now();
  const loc = {
    count: async () => (Date.now() - born >= appearsAt ? 1 : 0),
    first: () => loc,
    nth: () => loc,
    isVisible: async () => Date.now() - born >= appearsAt,
    boundingBox: async () => ({ x: 0, y: 0, width: 10, height: 10 }),
    evaluate: async () => undefined,
    getAttribute: async () => null,
    innerText: async () => 'Saved',
    textContent: async () => 'Saved',
  };
  return {
    url: () => 'http://h:1/editor',
    evaluate: async () => undefined,
    locator: () => loc,
    mainFrame: () => ({}),
    frames: () => [],
  } as unknown as Page;
}

function skillOf(step: SkillStep): Skill {
  return {
    id: 's_wait',
    origin: 'http://h:1',
    template: 'wait for the save',
    params: {},
    preconditions: { urlPattern: 'http://h:1/editor' },
    steps: [step],
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'validated',
    provenance: { session: 's', instruction: 'i', created: 't' },
  };
}

const saved = (tool: string, args: Record<string, unknown>): SkillStep => ({
  tool,
  args: { target: 'text=Saved', ...args },
  locators: { target: [{ kind: 'css', selector: 'text=Saved' } as never] },
});

async function run(step: SkillStep, appearsAt: number) {
  const dispatched: Record<string, unknown>[] = [];
  const res = await replaySkill(skillOf(step), {}, {
    page: fakePage(appearsAt),
    exec: async (tool, args) => {
      dispatched.push({ tool, ...args });
      return { result: 'condition met: visible' };
    },
  });
  return { res, dispatched };
}

describe('presenceWaitMs', () => {
  it('is the step timeout for a wait whose target must appear, null otherwise', () => {
    expect(presenceWaitMs(saved('wait_for', { state: 'visible', timeout_ms: 15000 }), { state: 'visible', timeout_ms: 15000 }, false)).toBe(15000);
    expect(presenceWaitMs(saved('wait_for', { state: 'text_contains' }), { state: 'text_contains' }, false)).toBe(10000);
    expect(presenceWaitMs(saved('wait_for', { state: 'count', count: 2 }), { state: 'count', count: 2 }, false)).toBe(10000);
    expect(presenceWaitMs(saved('wait_for', { state: 'hidden' }), { state: 'hidden' }, false)).toBeNull();
    expect(presenceWaitMs(saved('wait_for', { state: 'count', count: 0 }), { state: 'count', count: 0 }, false)).toBeNull();
    expect(presenceWaitMs(saved('wait_for', { state: 'url_contains' }), { state: 'url_contains' }, false)).toBeNull();
    expect(presenceWaitMs(saved('click', {}), {}, false)).toBeNull();
    // An assertion's wait keeps the standard window: its miss is the run's answer.
    expect(presenceWaitMs(saved('wait_for', { state: 'visible' }), { state: 'visible' }, true)).toBeNull();
    expect(presenceWaitMs({ ...saved('wait_for', { state: 'visible' }), assert: { message: 'm' } }, { state: 'visible' }, false)).toBeNull();
  });
});

describe('daemon: a presence wait resolves within its own timeout', () => {
  it('passes when the target appears after the standard window but within the timeout', async () => {
    const { res, dispatched } = await run(saved('wait_for', { state: 'visible', timeout_ms: 2000 }), 300);
    expect(res.ok).toBe(true);
    expect(dispatched).toHaveLength(1);
    // The wait spends what is left of its 2 s, not a fresh 2 s.
    const left = Number(dispatched[0].timeout_ms);
    expect(left).toBeGreaterThanOrEqual(PRESENCE_WAIT_FLOOR_MS);
    expect(left).toBeLessThanOrEqual(1750);
  });

  it('still stops when the target never appears within the timeout', async () => {
    const started = Date.now();
    const { res, dispatched } = await run(saved('wait_for', { state: 'visible', timeout_ms: 400 }), 60_000);
    expect(res.ok).toBe(false);
    expect(dispatched).toHaveLength(0);
    expect(Date.now() - started).toBeGreaterThanOrEqual(350);
  });

  it('leaves a click on the standard window', async () => {
    const { res, dispatched } = await run(saved('click', {}), 300);
    expect(res.ok).toBe(false);
    expect(dispatched.filter((d) => d.tool === 'click')).toHaveLength(0);
  });
});

describe('artifact: the emitted presence wait carries its timeout as its resolve window', () => {
  const emit = (steps: SkillStep[]): string => {
    const spec: SpecFlow = {
      version: 1,
      name: 'demo',
      origin: 'http://h:1',
      startUrl: 'http://h:1/editor',
      vars: [],
      steps: [
        {
          id: '01-save',
          instruction: 'wait for the save',
          params: {},
          outputs: [],
          segments: [{ id: 's_wait', template: 'wait for the save', params: {}, preconditions: { urlPattern: 'http://h:1/editor' }, steps }],
        },
      ],
    };
    const source = emitFlowFile(spec, { tier: 'plain' }).source;
    return source.slice(source.indexOf('export const steps = {'));
  };

  it('resolves within 15 s and waits only for what is left', () => {
    const src = emit([saved('wait_for', { state: 'visible', timeout_ms: 15000 })]);
    const deadline = /const (waitUntil\d+) = Date\.now\(\) \+ 15000;/.exec(src);
    expect(deadline).not.toBeNull();
    expect(src).toContain('waitMs: 15000');
    expect(src).toContain(`toBeVisible({ timeout: Math.max(${deadline![1]} - Date.now(), 1000) })`);
  });

  it('a wait recorded without a timeout resolves within the tool default', () => {
    const src = emit([saved('wait_for', { state: 'text_contains', text: 'Saved' })]);
    expect(src).toContain('waitMs: 10000');
    const line = src.split('\n').find((l) => l.includes('toContainText('));
    expect(line).toMatch(/useInnerText: true, timeout: Math\.max\(waitUntil\d+ - Date\.now\(\), 1000\) \}\)/);
  });

  it('leaves an absence wait and a click on their own windows', () => {
    const hidden = emit([saved('wait_for', { state: 'hidden', timeout_ms: 15000 })]);
    expect(hidden).toContain('waitMs: 0');
    expect(hidden).not.toMatch(/waitUntil\d/);
    const click = emit([saved('click', {})]);
    expect(click).toContain('waitMs: RESOLVE_WAIT_MS');
    expect(click).not.toMatch(/waitUntil\d/);
  });
});
