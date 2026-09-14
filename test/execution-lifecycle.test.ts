import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  changedCreation,
  isMutatingAction,
  isReadAction,
  mutatesSteps,
  runStepLifecycle,
  type StepActionResult,
} from '../src/execution/lifecycle.js';
import { emitFlowFile } from '../src/spec/emit.js';
import { actionFailure } from '../src/execution/browser.js';
import type { SpecFlow, SpecSegment } from '../src/spec/ir.js';
import { replaySkill } from '../src/skills/replay.js';
import type { Skill, SkillStep } from '../src/skills/store.js';
import { documentOf, isObserveArg } from './fixture/observation.js';

/** A lifecycle whose every phase records its name, with overridable phases. */
function recording(overrides: Partial<{
  act: () => Promise<StepActionResult<string>>;
  verify: (v: string) => Promise<string>;
}> = {}) {
  const calls: string[] = [];
  const phases = {
    prepare: async () => { calls.push('prepare'); },
    act: overrides.act ?? (async (): Promise<StepActionResult<string>> => { calls.push('act'); return { status: 'completed', value: 'v' }; }),
    settle: async (v: string) => { calls.push(`settle:${v}`); },
    bind: async (v: string) => { calls.push(`bind:${v}`); },
    verify: overrides.verify ?? (async (v: string) => { calls.push(`verify:${v}`); return `ok:${v}`; }),
  };
  return { calls, phases };
}

describe('runStepLifecycle', () => {
  it('runs prepare, act, settle, bind, verify in that order and returns both results', async () => {
    const { calls, phases } = recording();
    const out = await runStepLifecycle(phases);
    expect(calls).toEqual(['prepare', 'act', 'settle:v', 'bind:v', 'verify:v']);
    expect(out).toEqual({ action: { status: 'completed', value: 'v' }, verification: 'ok:v' });
  });

  it('binds before it verifies, so a check can refer to what the step minted', async () => {
    const { calls, phases } = recording();
    await runStepLifecycle(phases);
    expect(calls.indexOf('bind:v')).toBeLessThan(calls.indexOf('verify:v'));
  });

  it('a skipped action short-circuits settle, bind and verify without claiming completion', async () => {
    const { calls, phases } = recording({ act: async () => { calls.push('act'); return { status: 'skipped' }; } });
    const out = await runStepLifecycle(phases);
    expect(calls).toEqual(['prepare', 'act']);
    expect(out).toEqual({ action: { status: 'skipped' } });
    expect(out.verification).toBeUndefined();
  });

  it('a stopped action short-circuits the same way', async () => {
    const { calls, phases } = recording({ act: async () => { calls.push('act'); return { status: 'stopped' }; } });
    const out = await runStepLifecycle(phases);
    expect(calls).toEqual(['prepare', 'act']);
    expect(out).toEqual({ action: { status: 'stopped' } });
  });

  it('a throwing act propagates: nothing swallows it and nothing re-invokes it', async () => {
    let acts = 0;
    const { calls, phases } = recording({ act: async () => { acts++; throw new Error('dispatch failed'); } });
    await expect(runStepLifecycle(phases)).rejects.toThrow('dispatch failed');
    expect(acts).toBe(1);
    expect(calls).toEqual(['prepare']);
  });

  it('a throwing verify propagates and act is not re-invoked', async () => {
    let acts = 0;
    const { calls, phases } = recording({
      act: async () => { acts++; calls.push('act'); return { status: 'completed', value: 'v' }; },
      verify: async () => { throw new Error('expectation failed'); },
    });
    await expect(runStepLifecycle(phases)).rejects.toThrow('expectation failed');
    expect(acts).toBe(1);
    // settle and bind still ran, once, before the failing check.
    expect(calls).toEqual(['prepare', 'act', 'settle:v', 'bind:v']);
  });

  it('a completed action can never skip settle, bind or verify', async () => {
    const { calls, phases } = recording({ act: async () => ({ status: 'completed', value: '' }) });
    await runStepLifecycle(phases);
    expect(calls).toEqual(['prepare', 'settle:', 'bind:', 'verify:']);
  });
});

describe('changedCreation', () => {
  it('accepts only a nonempty identifier that this step changed', () => {
    expect(changedCreation(undefined, undefined)).toBeUndefined();
    expect(changedCreation(undefined, '')).toBeUndefined();
    expect(changedCreation('', '')).toBeUndefined();
    expect(changedCreation('new', 'new')).toBeUndefined(); // a rejected click leaves the url as it was
    expect(changedCreation('17', '17')).toBeUndefined();
    expect(changedCreation(undefined, '17')).toBe('17');
    expect(changedCreation('', '17')).toBe('17');
    expect(changedCreation('new', '17')).toBe('17');
    expect(changedCreation('17', '')).toBeUndefined(); // navigating away is not a creation
  });
});

describe('action classifications', () => {
  it('isReadAction names exactly the observation tools', () => {
    expect(isReadAction('read')).toBe(true);
    expect(isReadAction('read_all')).toBe(true);
    for (const tool of ['click', 'fill', 'wait_for', 'goto', 'hover', 'loop', 'scroll_into_view', '']) {
      expect(isReadAction(tool), tool).toBe(false);
    }
  });

  it('isMutatingAction names the data-changing tools and not navigation or observation', () => {
    for (const tool of ['click', 'dblclick', 'right_click', 'modifier_click', 'fill', 'type', 'press', 'select', 'check', 'drag', 'upload']) {
      expect(isMutatingAction(tool), tool).toBe(true);
    }
    for (const tool of ['goto', 'back', 'read', 'read_all', 'wait_for', 'hover', 'scroll_into_view', 'screenshot', 'loop', 'eval', 'download']) {
      expect(isMutatingAction(tool), tool).toBe(false);
    }
  });

  it('mutatesSteps looks inside nested bodies', () => {
    expect(mutatesSteps([])).toBe(false);
    expect(mutatesSteps([{ tool: 'goto' }, { tool: 'read' }])).toBe(false);
    expect(mutatesSteps([{ tool: 'goto' }, { tool: 'fill' }])).toBe(true);
    expect(mutatesSteps([{ tool: 'loop', body: [{ tool: 'read' }] }])).toBe(false);
    expect(mutatesSteps([{ tool: 'loop', body: [{ tool: 'read' }, { tool: 'click' }] }])).toBe(true);
    expect(mutatesSteps([{ tool: 'loop', body: [{ tool: 'loop', body: [{ tool: 'check' }] }] }])).toBe(true);
    expect(mutatesSteps([{ tool: 'loop', body: [] }])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The daemon side, through replaySkill with a fake page and a fake executor.
// ---------------------------------------------------------------------------

const ORIGIN = 'http://x.test';

function fakePage(opts: { url?: string; matches?: number } = {}) {
  const matches = opts.matches ?? 1;
  const loc = () => ({ count: async () => matches, first: () => ({ textContent: async () => '' }) });
  return {
    url: () => opts.url ?? `${ORIGIN}/orders`,
    async goto() {}, async content() { return '<html></html>'; },
    async evaluate() { return ''; }, async waitForLoadState() {},
    getByRole: loc,
    locator: loc,
  } as unknown as import('playwright-core').Page;
}

function skillOf(steps: SkillStep[]): Skill {
  return {
    id: 's_lifecycle', origin: ORIGIN, template: 't', params: {},
    preconditions: { urlPattern: `${ORIGIN}/orders` },
    steps,
    stats: { uses: 1, successes: 1, partial: 0, created: '', failedAtStep: {}, fallthroughs: 0 },
    status: 'validated', provenance: { session: 's', instruction: 't', created: '' },
  } as unknown as Skill;
}

const button = [{ kind: 'role', role: 'button', name: 'Create' }] as SkillStep['locators']['target'];

describe('replaySkill through the lifecycle', () => {
  let savedWait: string | undefined;
  beforeEach(() => {
    savedWait = process.env.SITELOOPER_RESOLVE_WAIT_MS;
    // The url gate polls for a navigation in flight; the fake page never moves.
    process.env.SITELOOPER_RESOLVE_WAIT_MS = '20';
  });
  afterEach(() => {
    if (savedWait === undefined) delete process.env.SITELOOPER_RESOLVE_WAIT_MS;
    else process.env.SITELOOPER_RESOLVE_WAIT_MS = savedWait;
  });

  it('an executor throw on a non-read step stops the replay with the execution failure, not a verification one', async () => {
    const skill = skillOf([
      // The url expectation cannot hold on the fake page: were the gates to
      // run, the reason would say "expected url", not "click failed".
      { tool: 'click', args: { target: '@e1' }, locators: { target: button }, expect: { urlPattern: `${ORIGIN}/nowhere/:id` } },
    ]);
    let execs = 0;
    const out = await replaySkill(skill, {}, {
      page: fakePage(),
      exec: async () => { execs++; throw new Error('boom\nCall log:\n  - waiting for locator'); },
    });
    expect(execs).toBe(1); // no re-dispatch
    expect(out.ok).toBe(false);
    expect(out.stepsRun).toBe(0);
    expect(out.failedAt).toBe(1);
    // an untagged error proves nothing about the dispatch: unknown, and `acted` stands
    expect(out.reason).toBe('click failed: boom [outcome: unknown]');
    expect(out.reason).not.toMatch(/expected url/);
    expect(out.acted).toBe(true); // it was dispatched, even though it failed
  });

  it('a first action PROVEN not dispatched gives back `acted`; after an earlier dispatch it cannot', async () => {
    const refusal = () => actionFailure('not-dispatched', 'disabled', 'click NOT dispatched: the control is disabled');
    const first = await replaySkill(skillOf([{ tool: 'click', args: { target: '@e1' }, locators: { target: button } }]), {}, {
      page: fakePage(),
      exec: async () => { throw refusal(); },
    });
    expect(first.reason).toBe('click failed: click NOT dispatched: the control is disabled [outcome: not dispatched]');
    expect(first.outcome).toBe('not-dispatched');
    expect(first.acted).toBe(false); // nothing reached the app: another candidate may run

    let n = 0;
    const second = await replaySkill(skillOf([
      { tool: 'click', args: { target: '@e1' }, locators: { target: button } },
      { tool: 'click', args: { target: '@e1' }, locators: { target: button } },
    ]), {}, {
      page: fakePage(),
      exec: async () => {
        if (n++ === 0) return { result: 'clicked', outcome: 'dispatched' };
        throw refusal();
      },
    });
    expect(second.failedAt).toBe(2);
    expect(second.outcome).toBe('not-dispatched');
    expect(second.acted).toBe(true); // the first click went out
  });

  it('a verification failure never re-dispatches the action', async () => {
    const skill = skillOf([
      { tool: 'click', args: { target: '@e1' }, locators: { target: button }, expect: { urlPattern: `${ORIGIN}/nowhere/:id` } },
    ]);
    let execs = 0;
    const out = await replaySkill(skill, {}, { page: fakePage(), exec: async () => { execs++; return { result: 'ok' }; } });
    expect(execs).toBe(1);
    expect(out.stepsRun).toBe(0);
    expect(out.failedAt).toBe(1);
    expect(out.reason).toMatch(/expected url/);
    expect(out.acted).toBe(true);
  });

  it('an executor throw on a read is skipped and runs no gates', async () => {
    const skill = skillOf([
      { tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target: button }, label: 'ref',
        // Would stop the replay if the url gate ran after the skip.
        expect: { urlPattern: `${ORIGIN}/nowhere/:id` } },
      { tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target: button }, label: 'after' },
    ]);
    const out = await replaySkill(skill, {}, {
      page: fakePage(),
      exec: async (_tool, _args, _resolved, via) => {
        if (via.step === 1) throw new Error('read blew up');
        return { result: '"S1"' };
      },
    });
    expect(out.failedAt).toBeUndefined();
    expect(out.ok).toBe(true);
    expect(out.stepsRun).toBe(2); // the skip did not end the replay
    expect(out.lines[0]).toMatch(/skipped \(read blew up\)/);
    expect(out.warnings.some((w) => /read errored/.test(w))).toBe(true);
    expect(out.values.ref).toBeUndefined();
    expect(out.values.after).toBe('S1');
    expect(out.acted).toBe(false); // observing is not acting
  });

  it('an already-open popup skips the click, dispatches nothing and does not mark `acted`', async () => {
    const skill = skillOf([
      { tool: 'click', args: { target: '@e1' }, locators: { target: button }, expect: { addedContains: ['dialog "New order"'] } },
    ]);
    // presentOnPage captures the page signature through page.evaluate
    // (src/execution/snapshot.ts observeDocumentInPage); the recorded popup line is showing.
    const page = fakePage();
    (page as unknown as { evaluate: (fn: unknown, arg?: unknown) => Promise<unknown> }).evaluate = async (_fn, arg) =>
      isObserveArg(arg) ? documentOf(['- dialog "New order"']) : '';
    (page as unknown as { title: () => Promise<string> }).title = async () => 'Orders';
    let execs = 0;
    const out = await replaySkill(skill, {}, { page, exec: async () => { execs++; return { result: 'ok' }; } });
    expect(execs).toBe(0);
    expect(out.lines[0]).toMatch(/skipped \(already in effect\)/);
    expect(out.acted).toBe(false);
    expect(out.stepsRun).toBe(1);
    expect(out.ok).toBe(true);
  });

  /**
   * F1. The executor diffs only STATE_CHANGING tools (tools.ts): a goto, a
   * back, a wait_for, a hover come back with no diff at all, captureFailed
   * unset. That is an observed nothing — the tool never looks — and must not
   * read as "the page could not be captured": every such step of every replay
   * was being marked unobserved, and a provisional skill containing one could
   * never validate (store.ts counts a success only with unobserved === 0).
   */
  it('a tool the executor never diffs is observed-empty for the alert gate, not unobserved', async () => {
    const skill = skillOf([
      { tool: 'goto', args: { url: `${ORIGIN}/orders` }, locators: {} },
      { tool: 'hover', args: { target: '@e1' }, locators: { target: button } },
      { tool: 'click', args: { target: '@e1' }, locators: { target: button } },
    ]);
    const out = await replaySkill(skill, {}, {
      page: fakePage(),
      exec: async (tool) => (tool === 'click' ? { result: 'ok', diff: { url: `${ORIGIN}/orders`, alerts: [], added: [] } } : { result: 'ok' }),
    });
    expect(out.ok, out.reason ?? '').toBe(true);
    expect(out.stepsRun).toBe(3);
    expect(out.unobserved).toEqual([]);
    expect(out.warnings.filter((w) => /could not be captured/.test(w))).toEqual([]);
  });

  it('a capture that FAILED is still unobserved, and an unrecorded alert in a diff still stops', async () => {
    const click: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: button } };
    const failed = await replaySkill(skillOf([click]), {}, { page: fakePage(), exec: async () => ({ result: 'ok', captureFailed: true }) });
    expect(failed.unobserved).toEqual(['1']);
    expect(failed.warnings.some((w) => /could not be captured after the action/.test(w))).toBe(true);
    const raised = await replaySkill(skillOf([click]), {}, {
      page: fakePage(),
      exec: async () => ({ result: 'ok', diff: { url: `${ORIGIN}/orders`, alerts: ['Ticket is not ready'], added: [] } }),
    });
    expect(raised.ok).toBe(false);
    expect(raised.reason).toMatch(/raised an alert the recording never saw: Ticket is not ready/);
  });

  /**
   * F4. The already-in-effect guard sits AFTER resolution in replay: a click
   * whose target no longer resolves is a stop (or the navigation fallback),
   * whatever the page shows. The artifact now orders it the same way (see the
   * emitter tests); here the daemon's half is pinned so it cannot drift.
   */
  it('a click whose target does not resolve stops, even while its recorded popup is showing', async () => {
    const skill = skillOf([
      { tool: 'click', args: { target: '@e1' }, locators: { target: button }, expect: { addedContains: ['dialog "New order"'] } },
    ]);
    const page = fakePage({ matches: 0 });
    (page as unknown as { evaluate: (fn: unknown, arg?: unknown) => Promise<unknown> }).evaluate = async (_fn, arg) =>
      isObserveArg(arg) ? documentOf(['- dialog "New order"']) : '';
    (page as unknown as { title: () => Promise<string> }).title = async () => 'Orders';
    let execs = 0;
    const out = await replaySkill(skill, {}, { page, exec: async () => { execs++; return { result: 'ok' }; } });
    expect(execs).toBe(0);
    expect(out.ok).toBe(false);
    expect(out.failedAt).toBe(1);
    expect(out.reason).toMatch(/no element matched any known locator/);
    expect(out.lines[0]).not.toMatch(/already in effect/);
  });

  it('a dblclick is never skipped as already in effect (the guard is a single click\'s shape)', async () => {
    const skill = skillOf([
      { tool: 'dblclick', args: { target: '@e1' }, locators: { target: button }, expect: { addedContains: ['dialog "Edit"'] } },
    ]);
    const page = fakePage();
    (page as unknown as { evaluate: (fn: unknown, arg?: unknown) => Promise<unknown> }).evaluate = async (_fn, arg) =>
      isObserveArg(arg) ? documentOf(['- dialog "Edit"']) : '';
    (page as unknown as { title: () => Promise<string> }).title = async () => 'Orders';
    let execs = 0;
    const out = await replaySkill(skill, {}, { page, exec: async () => { execs++; return { result: 'ok', diff: { url: `${ORIGIN}/orders`, alerts: [], added: ['- dialog "Edit"'] } }; } });
    expect(execs).toBe(1);
    expect(out.ok, out.reason ?? '').toBe(true);
    expect(out.lines[0]).not.toMatch(/already in effect/);
  });

  it('an absence wait that matches nothing dispatches nothing and still runs its postconditions', async () => {
    const step: SkillStep = { tool: 'wait_for', args: { target: '@e1', state: 'hidden' }, locators: { target: button } };
    let execs = 0;
    const exec = async () => { execs++; return { result: 'ok' }; };

    const met = await replaySkill(skillOf([step]), {}, { page: fakePage({ matches: 0 }), exec });
    expect(execs).toBe(0);
    expect(met.ok).toBe(true);
    expect(met.lines[0]).toMatch(/condition met: hidden \(nothing matched\)/);
    expect(met.lines.length).toBe(1);

    const checked = await replaySkill(
      skillOf([{ ...step, expect: { urlPattern: `${ORIGIN}/nowhere/:id` } }]),
      {},
      { page: fakePage({ matches: 0 }), exec },
    );
    expect(execs).toBe(0);
    expect(checked.ok).toBe(false);
    expect(checked.failedAt).toBe(1);
    expect(checked.reason).toMatch(/expected url/);
  });

  /**
   * Review C6, F1. An absence wait resolves its chain with ambiguity ALLOWED:
   * a chain that still matches two visible elements has not met "hidden",
   * and reading the policy's 'ambiguous' miss as "nothing matched" reported
   * the condition met while the elements were visibly there. Several still
   * there resolve and are dispatched to the wait, exactly as one would be.
   */
  it('an absence wait whose chain still matches several elements is dispatched, never read as nothing matched', async () => {
    const step: SkillStep = { tool: 'wait_for', args: { target: '@e1', state: 'hidden' }, locators: { target: button } };
    const dispatched: string[] = [];
    const out = await replaySkill(skillOf([step]), {}, {
      page: fakePage({ matches: 2 }),
      exec: async (tool, _args, resolved) => { dispatched.push(`${tool}:${resolved?.target ? 'resolved' : 'unresolved'}`); return { result: 'condition met: hidden' }; },
    });
    expect(dispatched).toEqual(['wait_for:resolved']);
    expect(out.lines[0]).not.toMatch(/nothing matched/);
    expect(out.ok, out.reason ?? '').toBe(true);

    // ...and when that wait times out (the elements stayed), the step stops
    // the replay with the wait's own failure — the false success is gone.
    const stayed = await replaySkill(skillOf([step, { tool: 'click', args: { target: '@e1' }, locators: { target: button } }]), {}, {
      page: fakePage({ matches: 2 }),
      exec: async (tool) => {
        if (tool === 'wait_for') throw new Error('locator.waitFor: Timeout 1000ms exceeded.');
        return { result: 'ok' };
      },
    });
    expect(stayed.ok).toBe(false);
    expect(stayed.failedAt).toBe(1);
    expect(stayed.reason).toBe('wait_for failed: locator.waitFor: Timeout 1000ms exceeded.');
    expect(stayed.stepsRun).toBe(0);

    // A count-0 wait is an absence wait too, and follows the same rule.
    const counted = await replaySkill(skillOf([{ ...step, args: { target: '@e1', state: 'count', count: 0 } }]), {}, {
      page: fakePage({ matches: 3 }),
      exec: async (tool) => { dispatched.push(tool); return { result: 'condition met: count=0' }; },
    });
    expect(dispatched).toEqual(['wait_for:resolved', 'wait_for']);
    expect(counted.lines[0]).not.toMatch(/nothing matched/);
  });
});

// ---------------------------------------------------------------------------
// The emitter side: the shape of what it generates, without a browser.
// ---------------------------------------------------------------------------

function flowOf(segment: Partial<SpecSegment> & { steps: SpecSegment['steps'] }): SpecFlow {
  return {
    version: 1,
    name: 'lifecycle-emit',
    origin: ORIGIN,
    startUrl: `${ORIGIN}/`,
    vars: [],
    steps: [{
      id: '01-step', instruction: 'exercise the lifecycle', params: {}, outputs: [],
      segments: [{
        id: 's_emit', template: 'exercise the lifecycle', params: {},
        preconditions: { urlPattern: `${ORIGIN}/` },
        ...segment,
      }],
    }],
  };
}

const target = [{ kind: 'id' as const, selector: '#control' }];

/** The lifecycle blocks of the emitted step body, in emitted order. */
function lifecycleBlocks(source: string): { name: string; body: string }[] {
  const names = ['prepare', 'act', 'settle', 'bind', 'verify'];
  const blocks: { name: string; body: string }[] = [];
  const re = /^\s*(prepare|act|settle|bind|verify): async \(\) => \{$/gm;
  const starts = [...source.matchAll(re)].map((m) => ({ name: m[1], at: m.index! }));
  for (const [i, start] of starts.entries()) {
    const end = i + 1 < starts.length ? starts[i + 1].at : source.indexOf('\n});', start.at);
    blocks.push({ name: start.name, body: source.slice(start.at, end) });
  }
  expect(blocks.map((b) => b.name).slice(0, 5)).toEqual(names);
  return blocks;
}

describe('emitted step lifecycle', () => {
  it('emits every phase in order, reads urlBefore in prepare, binds before it verifies', () => {
    const { source, warnings } = emitFlowFile(flowOf({
      derived: { d1: { step: 1, at: 'p1', example: '17' } },
      steps: [{
        tool: 'click', args: { target: '@e1' }, locators: { target },
        mints: { at: 'p1' },
        expect: { urlPattern: `${ORIGIN}/orders/{{d1}}`, addedContains: ['heading "Order {{d1}}"'] },
      }],
    }), { tier: 'plain' });
    expect(warnings).toEqual([]);
    const [prepare, act, settle, bind, verify] = lifecycleBlocks(source);
    expect(prepare.body).toContain('await settle(page);');
    expect(prepare.body).toContain('urlBefore1 = page.url();');
    // Every target resolves through the shared policy first, and the action
    // acts on what it resolved to.
    expect(act.body).toContain("{ locator: page.locator('#control'), index: 0, structural: false, kind: 'id', carries: JSON.stringify({ kind: 'id', selector: '#control' }) },");
    expect(act.body).toContain(`], '01-step s_emit/1 target', { stayOnOrigin: '${ORIGIN}', waitMs: RESOLVE_WAIT_MS }, '${ORIGIN}/orders/{{d1}}', p, { drift: run.drift });`);
    // a navigation click falls back to its recorded destination (shared recover.ts), and is then done
    expect(act.body).toContain("if (!hit1) return { status: 'skipped' };");
    expect(act.body).toContain('await click(hit1.locator, { obs: obs1 }).catch(actionFailed);');
    expect(act.body).toContain("return { status: 'completed', value: undefined };");
    // and the effect gate is told whether that resolution was positional.
    expect(act.body).toContain('positional1 = positional1 || hit1.structural || hit1.nth !== undefined;');
    expect(settle.body).toContain('if (page.url() !== urlBefore1) await settle(page);');
    // The after-action alert observation is the settle phase's, taken where the
    // daemon takes its diff — before verify's url wait, so a toast that
    // auto-dismisses during that wait is seen by both runners or by neither.
    expect(settle.body).toContain('alertsAfter1 = await settledAlerts(page);');
    expect(settle.body.indexOf('await settle(page);')).toBeLessThan(settle.body.indexOf('settledAlerts('));
    // Derived binding first, then the mint read off the value it just bound.
    expect(bind.body).toContain("bindPart(p, 'd1', await urlPartWhen(page, 'p1', urlBefore1));");
    expect(bind.body).toContain("const minted1 = changedCreation(urlPart(urlBefore1, 'p1'), p.d1);");
    expect(bind.body.indexOf("bindPart(p, 'd1'")).toBeLessThan(bind.body.indexOf('changedCreation('));
    expect(bind.body).toContain("outputs['01-step.minted'] = minted1;");
    expect(bind.body).toContain('if (!run.created.includes(minted1)) run.created.push(minted1);');
    // The effect gates in replay's STEP_GATES order: error page, url, page changes, alerts.
    expect(verify.body).toContain("errorPageGate(page, '01-step s_emit/1');");
    expect(verify.body).toContain(`await urlEffect(page, '${ORIGIN}/orders/{{d1}}', p, '01-step s_emit/1');`);
    expect(verify.body).toContain("alertGate(alertsBefore1, alertsAfter1, { where: '01-step s_emit/1', isRead: false, params: p, effectConfirmed: changes1.confirmed === true });");
    expect(verify.body.indexOf('errorPageGate(')).toBeLessThan(verify.body.indexOf('await urlEffect('));
    expect(verify.body.indexOf('await urlEffect(')).toBeLessThan(verify.body.indexOf('alertGate('));
    expect(verify.body.indexOf('Order')).toBeLessThan(verify.body.indexOf('alertGate('));
    // verify judges; it captures nothing of its own
    expect(verify.body).not.toContain('liveAlerts(');
    expect(verify.body).not.toContain('settledAlerts(');
    // The alert baseline is taken in prepare, before the action.
    expect(prepare.body).toContain('alertsBefore1 = (await liveAlerts(page)) ?? [];');
    // The shared modules are embedded, and nothing imports them.
    expect(source).toContain('async function runStepLifecycle');
    expect(source).toContain('function changedCreation(');
    expect(source).not.toMatch(/^import .*execution/m);
    expect(source.match(/^\s*let urlBefore1 = '';$/gm)).toHaveLength(1);
  });

  it('a mint with no derived binding waits for the url part itself', () => {
    const { source } = emitFlowFile(flowOf({
      steps: [{ tool: 'click', args: { target: '@e1' }, locators: { target }, mints: { at: 'p1' } }],
    }), { tier: 'plain' });
    const bind = lifecycleBlocks(source)[3];
    expect(bind.body).toContain("const minted1 = changedCreation(urlPart(urlBefore1, 'p1'), await urlPartWhen(page, 'p1', urlBefore1));");
  });

  it('a read cannot throw inside act, and its url expectation still runs in verify', () => {
    const { source, warnings } = emitFlowFile(flowOf({
      steps: [
        { tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target }, label: 'name', expect: { urlPattern: `${ORIGIN}/orders`, addedContains: ['heading "x"'] } },
        { tool: 'read', args: { target: '@e1', what: 'url' }, locators: { target }, label: 'where' },
        { tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target } },
      ],
    }), { tier: 'plain' });
    expect(warnings).toEqual([]);
    const blocks = lifecycleBlocks(source);
    const acts = blocks.filter((b) => b.name === 'act');
    expect(acts).toHaveLength(3);
    expect(acts[0].body).toContain("outputs['01-step.name'] = await readOptional(page, [");
    expect(acts[1].body).toContain("outputs['01-step.where'] = page.url();");
    expect(acts[2].body).toContain('// observed: read text (unlabelled');
    for (const act of acts) {
      expect(act.body).not.toMatch(/\bthrow\b/);
      expect(act.body).not.toMatch(/await pick\(/); // a bare pick would throw before readOptional could catch
    }
    const verifies = blocks.filter((b) => b.name === 'verify');
    // The daemon's expectedUrl gate does not exempt reads; neither does the spec.
    expect(verifies[0].body).toContain(`await urlEffect(page, '${ORIGIN}/orders', p, '01-step s_emit/1');`);
    // Its page-change expectation stays excluded for a read, and so is the
    // unrecorded-alert gate (replay's unrecordedAlert exempts reads).
    expect(verifies[0].body).not.toMatch(/heading/);
    for (const verify of verifies) expect(verify.body).not.toContain('alertGate(');
  });

  it('an already-open popup returns skipped from act, so no postcondition runs on a click that did not fire', () => {
    const { source } = emitFlowFile(flowOf({
      steps: [{ tool: 'click', args: { target: '@e1' }, locators: { target }, expect: { addedContains: ['dialog "Options"'] } }],
    }), { tier: 'plain' });
    const act = lifecycleBlocks(source)[1];
    expect(act.body).toContain("return { status: 'skipped' };");
    expect(act.body.indexOf("return { status: 'skipped' };")).toBeLessThan(act.body.indexOf('await click(hit1.locator, { obs: obs1 }).catch(actionFailed);'));
    // The already-in-effect question is asked AFTER the target resolved, as
    // replay orders it, so the pick still runs on a click that is skipped.
    expect(act.body.indexOf('await pick(page, [')).toBeLessThan(act.body.indexOf('presentOnPage('));
  });

  it('an unsupported action throws explicitly, surfaces a compile warning, and keeps the TODO blocker', () => {
    const { source, warnings } = emitFlowFile(flowOf({
      steps: [{ tool: 'future_browser_action', args: { target: '@e1' }, locators: { target } }],
    }), { tier: 'plain' });
    const act = lifecycleBlocks(source)[1];
    expect(act.body).toContain("throw new Error('Unsupported recorded action: future_browser_action');");
    expect(act.body).toContain('// TODO: recorded tool future_browser_action has no Tier 2 form.');
    expect(warnings).toEqual(['01-step: step 1 uses tool future_browser_action, which has no Tier 2 form']);
  });

  it('an unsupported wait_for state throws explicitly and surfaces a compile warning', () => {
    const { source, warnings } = emitFlowFile(flowOf({
      steps: [{ tool: 'wait_for', args: { target: '@e1', state: 'stable' }, locators: { target } }],
    }), { tier: 'plain' });
    const act = lifecycleBlocks(source)[1];
    expect(act.body).toContain("throw new Error('Unsupported recorded wait_for state: stable');");
    expect(act.body).toContain('// TODO: recorded wait_for state stable has no Tier 2 form.');
    expect(warnings).toEqual(['01-step: step 1 waits for state stable, which has no Tier 2 form']);
  });

  it('a drag with no recorded source at all throws explicitly and surfaces a compile warning', () => {
    const { source, warnings } = emitFlowFile(flowOf({
      steps: [{ tool: 'drag', args: { source: '@e0', target: '@e1' }, locators: { target, source: [] } }],
    }), { tier: 'plain' });
    const act = lifecycleBlocks(source)[1];
    expect(act.body).toContain("throw new Error('No expressible locator for required drag source');");
    expect(act.body).toContain('// TODO: no locator this compiler can express for the drag source.');
    expect(warnings).toContain('01-step: step 1 has no expressible drag source');
  });

  /**
   * A recorded POINT is no longer inexpressible: it resolves through
   * pointLocator/markPoint like any other candidate, so a drag whose source
   * was only ever a position compiles into a real drag.
   */
  it('a drag whose source is only a point resolves it, rather than refusing the step', () => {
    const { source, warnings } = emitFlowFile(flowOf({
      steps: [{
        tool: 'drag', args: { source: '@e0', target: '@e1' },
        locators: { target, source: [{ kind: 'point', x: 1, y: 2, w: 3, h: 4, role: 'button', tag: 'button', vw: 800, vh: 600 } as never] },
      }],
    }), { tier: 'plain' });
    const act = lifecycleBlocks(source)[1];
    expect(act.body).toContain('locator: pointLocator(page, { x: 1, y: 2 })');
    expect(act.body).toContain("kind: 'point'");
    expect(act.body).toContain('point: { x: 1, y: 2, w: 3, h: 4, role: \'button\', tag: \'button\', vw: 800, vh: 600 }');
    expect(act.body).toContain('await hit2.locator.dragTo(hit1.locator).catch(actionFailed);');
    expect(act.body).not.toContain('No expressible locator for required drag source');
    expect(warnings).toEqual([]);
  });

  it('supported absence waits and the other wait states emit assertions, not throws', () => {
    const { source, warnings } = emitFlowFile(flowOf({
      steps: [
        { tool: 'wait_for', args: { target: '@e1', state: 'hidden' }, locators: { target } },
        { tool: 'wait_for', args: { target: '@e1', state: 'count', count: 0 }, locators: { target } },
        { tool: 'wait_for', args: { target: '@e1', state: 'visible' }, locators: { target } },
        { tool: 'wait_for', args: { target: '@e1', state: 'text_contains', text: 'Saved' }, locators: { target } },
      ],
    }), { tier: 'plain' });
    expect(warnings).toEqual([]);
    const acts = lifecycleBlocks(source).filter((b) => b.name === 'act');
    // An absence wait asks the chain ONCE, with no wait: nothing resolving is
    // the condition being met, not drift — so it resolves rather than picks.
    // Several matches resolve too (allowMultiple): two visible elements have
    // NOT gone, and must be waited on rather than read as "nothing matched".
    expect(acts[0].body).toContain("], '01-step s_emit/1 target', { allowMultiple: true, stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: 0 }, { drift: run.drift });");
    expect(acts[0].body).toContain('const hit1 = await resolveTarget(page, [');
    // The hidden wait is on the FIRST match, as replay dispatches it (tools.ts
    // waitFor); Playwright's strict expect would refuse the several matches
    // allowed above instead of waiting for them to go.
    expect(acts[0].body).toContain('if (hit1) await expect(hit1.locator.first()).toBeHidden();');
    expect(acts[1].body).toContain("], '01-step s_emit/2 target', { allowMultiple: true, stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: 0 }, { drift: run.drift });");
    expect(acts[1].body).toContain('const hit2 = await resolveTarget(page, [');
    expect(acts[1].body).toContain('if (hit2) await expect(hit2.locator).toHaveCount(0);');
    // A presence wait is a target like any other: it must resolve, so it picks.
    expect(acts[2].body).toContain("], '01-step s_emit/3 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, { drift: run.drift });");
    expect(acts[2].body).toContain('await expect(hit3.locator).toBeVisible();');
    expect(acts[3].body).toContain("await expect(hit4.locator).toContainText('Saved');");
    for (const act of acts) expect(act.body).not.toMatch(/\bthrow\b/);
  });

  it('every loop-body step goes through its own lifecycle with a distinct urlBefore', () => {
    const { source, warnings } = emitFlowFile(flowOf({
      steps: [
        { tool: 'click', args: { target: '@e1' }, locators: { target } },
        {
          tool: 'loop', args: {}, locators: {}, max: 3,
          while: [{ kind: 'css', selector: '.row' }],
          body: [
            { tool: 'click', args: { target: '@e2' }, locators: { target: [{ kind: 'css', selector: '.row .edit' }] } },
            { tool: 'fill', args: { target: '@e3', value: 'x' }, locators: { target: [{ kind: 'css', selector: '.row input' }] } },
          ],
        } as SpecSegment['steps'][number],
        { tool: 'click', args: { target: '@e1' }, locators: { target } },
      ],
    }), { tier: 'plain' });
    expect(warnings).toEqual([]);
    expect(source.match(/await runStepLifecycle\(\{/g)).toHaveLength(4);
    const declared = [...source.matchAll(/^\s*let (urlBefore\d+) = '';$/gm)].map((m) => m[1]);
    expect(declared).toEqual(['urlBefore1', 'urlBefore2', 'urlBefore3', 'urlBefore4']);
    expect(new Set(declared).size).toBe(declared.length);
    // The loop body's two lifecycles sit inside the shared loop's runBody.
    const bodyAt = source.indexOf('runBody: async (cursor1: number, pass1: LoopPass) => {');
    expect(bodyAt).toBeGreaterThan(-1);
    const inside = source.slice(bodyAt, source.indexOf('}, { max: 3', bodyAt));
    expect(inside.match(/await runStepLifecycle\(\{/g)).toHaveLength(2);
    expect(inside).toContain("let urlBefore2 = '';");
    expect(inside).toContain("let urlBefore3 = '';");
  });

  it('a self-navigating segment checks identity after the first step, not before it', () => {
    const { source } = emitFlowFile(flowOf({
      params: { v1: { example: 'ORD-7' } } as never,
      preconditions: { urlPattern: `${ORIGIN}/orders/1`, requireText: ['{{v1}}'] },
      steps: [
        { tool: 'goto', args: { url: `${ORIGIN}/orders/1` }, locators: {} },
        { tool: 'click', args: { target: '@e1' }, locators: { target } },
      ],
    }), { tier: 'plain' });
    const identity = source.indexOf('await expect.poll(async () => (await confirmPresence(page, [`${p.v1}`], 2, { whole: true })).presence');
    const gotoStep = source.indexOf('// @step 01-step s_emit/1');
    const clickStep = source.indexOf('// @step 01-step s_emit/2');
    expect(identity).toBeGreaterThan(gotoStep);
    expect(identity).toBeLessThan(clickStep);
    // ...and after the goto's whole lifecycle, not inside it.
    const gotoClose = source.indexOf('\n    });', gotoStep);
    expect(identity).toBeGreaterThan(gotoClose);
  });

  it('nothing catches around the lifecycle call in the emitted body', () => {
    const { source } = emitFlowFile(flowOf({
      steps: [{ tool: 'click', args: { target: '@e1' }, locators: { target }, expect: { addedContains: ['heading "Saved"'] } }],
    }), { tier: 'plain' });
    const body = source.slice(source.indexOf("async '01-step'("), source.indexOf('export async function runFlow'));
    // The one catch a body has is on a state-changing action's own call, and it
    // rethrows (actionFailed adds the outcome and throws): nothing is swallowed.
    expect(body).toContain('.catch(actionFailed);');
    const rethrowsRemoved = body.split('.catch(actionFailed);').join(';');
    expect(rethrowsRemoved).not.toMatch(/\btry\b/);
    expect(rethrowsRemoved).not.toMatch(/\.catch\(/);
  });
});
