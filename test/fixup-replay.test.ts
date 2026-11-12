/**
 * Declared fix-ups in the two runners (execution/fixup.ts; erpnext fwen10-fr,
 * where a repair of a duplicate row deleted a real row on every replay that
 * had no duplicate). A guard is evaluated, never run: it holds and its steps
 * run as ordinary steps; it does not and they are skipped, with a warning, and
 * the replay goes on clean. The artifact emits the same decision.
 */
import { describe, expect, it } from 'vitest';
import type { Locator, Page } from 'playwright-core';
import { replaySkill } from '../src/skills/replay.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';
import type { Skill, SkillStep } from '../src/skills/store.js';

process.env.SITELOOPER_RESOLVE_WAIT_MS = '0';
process.env.SITELOOPER_IDENTITY_WAIT_MS = '0';

const APP = 'http://app.test';
const ORDER = `${APP}/orders/SO-1`;

/** Locators counted by key (`role:<role>:<name>`, `css:<selector>`), as test/assert-replay.test.ts fakes them. */
function fakePage(counts: Record<string, number>): Page {
  const loc = (key: string): Locator =>
    ({
      count: async () => counts[key] ?? 0,
      first: () => loc(key),
      nth: () => loc(key),
      evaluate: async () => null,
      ariaSnapshot: async () => '',
      textContent: async () => '',
      innerText: async () => '',
    }) as unknown as Locator;
  return {
    url: () => ORDER,
    evaluate: async () => [],
    getByTestId: (v: string) => loc(`testid:${v}`),
    getByRole: (role: string, o?: { name?: string | RegExp }) => {
      const hit = Object.keys(counts).find((k) => k.startsWith(`role:${role}:`) && (o?.name instanceof RegExp ? o.name.test(k.slice(role.length + 6)) : k.slice(role.length + 6) === (o?.name ?? '')));
      return loc(hit ?? `role:${role}:?`);
    },
    getByLabel: (l: string) => loc(`label:${l}`),
    getByPlaceholder: () => loc('placeholder'),
    getByText: (t: string) => loc(`text:${t}`),
    locator: (s: string) => loc(`css:${s}`),
  } as unknown as Page;
}

const button = (name: string) => ({ target: [{ kind: 'role' as const, role: 'button', name }] });

/** The fwen10-fr shape: a guard, the repair it guards (tick row 2, Delete, Save), then the step the instruction asked for. */
const FIXUP_STEPS: SkillStep[] = [
  { tool: 'wait_for', args: { target: '.row a', state: 'count', count: 2 }, locators: { target: [{ kind: 'css', selector: '.row a' }] }, guard: { id: 'g1', reason: '{{v1}} appears twice' } },
  { tool: 'click', args: { target: '@e2' }, locators: button('Row 2'), guarded: 'g1' },
  { tool: 'click', args: { target: '@e3' }, locators: button('Delete'), guarded: 'g1' },
  { tool: 'click', args: { target: '@e4' }, locators: button('Save'), guarded: 'g1', guardEnd: true },
  { tool: 'click', args: { target: '@e5' }, locators: button('Submit') },
];

function skill(steps: SkillStep[] = FIXUP_STEPS): Skill {
  return {
    id: 's_submit',
    origin: APP,
    template: 'submit the order',
    params: { v1: { example: 'Bench Widget', usedIn: [] } },
    preconditions: { urlPattern: `${APP}/orders/:id` },
    steps,
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'validated',
    provenance: { session: 's', instruction: 'submit the order', created: 't' },
  } as Skill;
}

const ON_PAGE = { 'role:button:Row 2': 1, 'role:button:Delete': 1, 'role:button:Save': 1, 'role:button:Submit': 1 };

/** Every dispatch, by tool and target; a wait_for count holds when the page shows that many. */
function run(counts: Record<string, number>, steps?: SkillStep[]) {
  const calls: string[] = [];
  const page = fakePage(counts);
  return replaySkill(skill(steps), { v1: 'Bench Widget' }, {
    page,
    exec: async (tool, args, resolved) => {
      calls.push(tool === 'wait_for' ? `wait_for ${String(args.state)} ${String(args.count)} within ${String(args.timeout_ms)}` : `${tool} ${String(args.target)}`);
      if (tool === 'wait_for' && args.state === 'count') {
        const n = await resolved.target!.count();
        if (n !== Number(args.count)) throw new Error(`wait_for count timed out after ${String(args.timeout_ms)}ms (last: ${n})`);
      }
      return { result: 'ok' };
    },
  }).then((res) => ({ res, calls }));
}

describe('replay: a declared fix-up', () => {
  it('runs the repair when its guard holds', async () => {
    const { res, calls } = await run({ ...ON_PAGE, 'css:.row a': 2 });
    expect(res.ok).toBe(true);
    expect(calls.map((c) => c.split(' within ')[0])).toEqual(['wait_for count 2', 'click @e2', 'click @e3', 'click @e4', 'click @e5']);
    // The guard's condition gets GUARD_WAIT_MS in all, not a wait_for's 10 s.
    expect(Number(calls[0].split(' within ')[1])).toBeLessThanOrEqual(1_500);
    expect(res.lines[0]).toMatch(/^1\. wait_for .*: fix-up applies — Bench Widget appears twice$/);
    expect(res.warnings).toEqual([]);
    expect(res.stepsRun).toBe(5);
  });

  it('skips the repair when its guard does not hold, and the step after it still runs', async () => {
    const { res, calls } = await run({ ...ON_PAGE, 'css:.row a': 1 });
    expect(res.ok).toBe(true);
    expect(res.failedAt).toBeUndefined();
    // Nothing of the repair was dispatched; the step the instruction asked for was.
    expect(calls.filter((c) => !c.startsWith('wait_for'))).toEqual(['click @e5']);
    expect(res.warnings).toEqual(['step 1: fix-up not needed, 3 step(s) skipped — its condition does not hold this time (Bench Widget appears twice)']);
    expect(res.lines.slice(1, 4)).toEqual([
      '2. click → skipped (fix-up g1 not needed)',
      '3. click → skipped (fix-up g1 not needed)',
      '4. click → skipped (fix-up g1 not needed)',
    ]);
    // Not drift, not a fallback, nothing acted on for the skipped steps.
    expect(res.fallthroughs).toBe(0);
    expect(res.misses).toEqual([]);
    expect(res.stepsRun).toBe(res.stepsTotal);
  });

  it('a guard whose target is not there at all is a miss, and costs about GUARD_WAIT_MS, not ten seconds', async () => {
    const started = Date.now();
    const { res, calls } = await run(ON_PAGE);
    const took = Date.now() - started;
    expect(res.ok).toBe(true);
    expect(calls).toEqual(['click @e5']);
    expect(res.warnings[0]).toContain('fix-up not needed, 3 step(s) skipped');
    expect(took).toBeLessThan(4_000);
  }, 15_000);

  it('a guarded step of a guard that held is an ordinary step: its own stop applies', async () => {
    const { res } = await run({ 'role:button:Row 2': 1, 'role:button:Submit': 1, 'css:.row a': 2 });
    expect(res.ok).toBe(false);
    expect(res.failedAt).toBe(3);
  });

  it('a guarded loop step is skipped as one step', async () => {
    const loop: SkillStep = { tool: 'loop', args: {}, locators: {}, max: 3, scope: 'drain', while: [{ kind: 'css', selector: '.dup' }], body: [{ tool: 'click', args: { target: '@e9' }, locators: { target: [{ kind: 'css', selector: '.dup' }] } }], guarded: 'g1', guardEnd: true };
    const { res, calls } = await run({ ...ON_PAGE, 'css:.row a': 1, 'css:.dup': 1 }, [FIXUP_STEPS[0], loop, FIXUP_STEPS[4]]);
    expect(res.ok).toBe(true);
    expect(calls).toEqual(['wait_for count 2 within ' + calls[0].split(' within ')[1], 'click @e5']);
    expect(res.lines[1]).toBe('2. loop → skipped (fix-up g1 not needed)');
  });

  it('a malformed fix-up runs as compile would have left it: guard dropped, every step unconditional, one warning', async () => {
    const open = FIXUP_STEPS.map((s) => ({ ...s })) as SkillStep[];
    delete open[3].guardEnd;
    const { res, calls } = await run({ ...ON_PAGE, 'css:.row a': 1 }, open);
    expect(res.ok).toBe(true);
    expect(calls).toEqual(['click @e2', 'click @e3', 'click @e4', 'click @e5']);
    expect(res.warnings).toEqual(['s_submit: fix-up(s) g1 not well formed — their guard is dropped and their steps run unconditionally']);
  });
});

function flow(steps: SkillStep[] = FIXUP_STEPS): SpecFlow {
  return {
    version: 1,
    name: 'fixup',
    origin: APP,
    startUrl: ORDER,
    vars: ['name'],
    steps: [{
      id: '02-submit', instruction: 'submit the order', params: { v1: '{{name}}' }, outputs: [],
      segments: [{ id: 's_submit', template: 'submit the order', params: { v1: { example: 'Bench Widget', usedIn: [] } }, preconditions: { urlPattern: `${APP}/orders/:id` }, steps }],
    }],
  };
}

describe('artifact: a declared fix-up', () => {
  const { source, warnings } = emitFlowFile(flow(), { tier: 'plain' });

  it('evaluates the guard into a segment-scoped verdict within GUARD_WAIT_MS, never throwing', () => {
    const guard = source.slice(source.indexOf('// @step 02-submit s_submit/1'), source.indexOf('// @step 02-submit s_submit/2'));
    expect(guard).toContain('let fixup1 = false;');
    expect(guard).toContain('await settle(page);');
    expect(guard).toContain('const guardUntil1 = Date.now() + GUARD_WAIT_MS;');
    expect(guard).toContain('waitMs: GUARD_WAIT_MS });');
    expect(guard).toContain('await expect(guardHit1.locator).toHaveCount(2, { timeout: Math.max(guardUntil1 - Date.now(), 100) });');
    expect(guard).toContain('} catch {');
    // No drift line, no pick (which throws), no healing: resolveCandidates straight.
    expect(guard).not.toContain('run.drift');
    expect(guard).not.toContain('await pick(');
    expect(guard).toContain("if (fixup1) console.log(`[sitelooper fixup] ${fixupApplies('02-submit s_submit/1', `${p.v1} appears twice`)}`);");
    expect(guard).toContain("else console.log(`[sitelooper skip] ${fixupSkipped('02-submit s_submit/1', `${p.v1} appears twice`, 3)}`);");
  });

  it('wraps each guarded step whole — before its settle or any capture — and leaves the step after the fix-up alone', () => {
    for (const n of [2, 3, 4]) expect(source).toMatch(new RegExp(`if \\(fixup1\\) \\{\\n\\s+// @step 02-submit s_submit/${n}\\n`));
    expect(source).not.toMatch(/if \(fixup1\) \{\n\s+\/\/ @step 02-submit s_submit\/5\n/);
    expect(source.match(/if \(fixup1\) \{/g)).toHaveLength(3);
    // The echo ledger's navigation note is inside the wrap: a skipped click notes nothing.
    const wrapped = source.slice(source.indexOf('// @step 02-submit s_submit/2'), source.indexOf('// @step 02-submit s_submit/3'));
    expect(wrapped).toContain("noteNavigation(echoLedger, 's_submit/2'");
  });

  it('exports no fault site for a gesture a run may legitimately skip', () => {
    const sites = /export const faultSites = (\[.*\]) as const;/.exec(source)![1];
    expect(JSON.parse(sites)).toEqual(['02-submit s_submit/5 click']);
    expect(warnings.filter((w) => w.includes('fix-up'))).toEqual([]);
  });

  it('a malformed fix-up emits every step unconditionally, with one warning', () => {
    const open = FIXUP_STEPS.map((s) => ({ ...s })) as SkillStep[];
    delete open[3].guardEnd;
    const emitted = emitFlowFile(flow(open), { tier: 'plain' });
    expect(emitted.source).not.toContain('fixup1');
    expect(emitted.source).not.toContain('GUARD_WAIT_MS');
    expect(emitted.source).toContain('the guard of fix-up g1, which is not well formed');
    expect(emitted.warnings.filter((w) => w.includes('fix-up'))).toEqual(['02-submit: s_submit carries fix-up(s) g1 that are not well formed — their guard is dropped and their steps run unconditionally']);
  });
});
