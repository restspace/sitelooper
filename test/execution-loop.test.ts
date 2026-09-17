/**
 * The shared folded-loop policy, and what each runner has to supply it.
 *
 * A folded loop used to be written twice — replay's `runLoop` and the
 * emitter's unrolled `for` — and the two agreed on the cap, the cursor and the
 * shrink wait while disagreeing about when to settle, what the guard counts,
 * and whether a pass that made no progress was progress (policy audit B9,
 * gaps 6/7/11). `runFoldedLoop` is now the only copy, so these tests are of
 * the POLICY (with fake observations, no browser) plus the SHAPE each runner
 * emits or passes to it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import type { Locator } from 'playwright-core';
import { LOOP_BODY_STOPPED, runFoldedLoop, type LoopGuard, type LoopHooks } from '../src/execution/loop.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow, SpecSegment } from '../src/spec/ir.js';
import { saveFlow, type Flow } from '../src/skills/flow.js';
import { SkillStore, type Skill, type SkillStep } from '../src/skills/store.js';
import { compileFlow } from '../src/spec/index.js';

// ---------------------------------------------------------------------------
// The policy, with fake observations.
// ---------------------------------------------------------------------------

interface Fake {
  calls: string[];
  hooks: LoopHooks;
  cursors: number[];
  /** Every `nth(i)` the shrink check waited on, with its timeout. */
  waits: { index: number; timeout: number | undefined }[];
}

/**
 * A fake list of `size` records whose body either DELETES the record at the
 * cursor (the collection shrinks) or MARKS it (the collection does not).
 * `late` models the normal case for a removal: the row is still counted right
 * after the click and leaves the DOM only while the shrink wait is running.
 */
function fake(o: {
  size: number;
  mode?: 'delete' | 'edit';
  late?: boolean;
  signature?: (cursor: number) => string;
  stopBodyAt?: number;
  abortAt?: number;
  /** The guard count throws from this count call on (1-based), as a closed or navigating page does. */
  countThrowsFrom?: number;
  /** Whether the page answers at all; a guard that matched nothing is only EMPTY on a readable page. */
  readable?: () => boolean;
}): Fake {
  const calls: string[] = [];
  const cursors: number[] = [];
  const waits: { index: number; timeout: number | undefined }[] = [];
  let size = o.size;
  let pending = false;
  let bodies = 0;
  let counts = 0;
  const guard: LoopGuard = {
    count: async () => {
      calls.push('count');
      counts++;
      if (o.countThrowsFrom !== undefined && counts >= o.countThrowsFrom) throw new Error('Target page, context or browser has been closed');
      return pending ? size + 1 : size;
    },
    nth: (i: number) => ({
      waitFor: async (wait?: { state?: string; timeout?: number }) => {
        waits.push({ index: i, timeout: wait?.timeout });
        pending = false; // the row left the DOM while the loop waited for it
      },
    }) as unknown as Locator,
  };
  return {
    calls,
    cursors,
    waits,
    hooks: {
      settle: async () => { calls.push('settle'); },
      guard: async () => { calls.push('resolve'); return guard; },
      readable: async () => (o.readable ? o.readable() : true),
      runBody: async (cursor, pass) => {
        bodies++;
        calls.push(`body:${cursor}`);
        cursors.push(cursor);
        if (o.stopBodyAt === bodies) return { status: 'stop' };
        // resolve, check, THEN act — the order both runners follow
        pass.entries.push(o.signature ? o.signature(cursor) : `c${cursor}`);
        pass.check();
        calls.push(`act:${cursor}`);
        if ((o.mode ?? 'delete') === 'delete') {
          size--;
          if (o.late) pending = true;
        }
        return { status: 'ran' };
      },
      aborted: o.abortAt === undefined ? undefined : () => cursors.length >= o.abortAt!,
    },
  };
}

const opts = (over: Partial<{ max: number; scope: 'observed' | 'drain'; shrinkWaitMs: number; describe: string }> = {}) => ({
  max: 20,
  scope: 'drain' as const,
  shrinkWaitMs: 1_000,
  ...over,
});

describe('runFoldedLoop', () => {
  it('settles before EVERY guard count, the first one included', async () => {
    // gap 6: the artifact used to count immediately, and a list that had not
    // rendered yet answered zero — a full collection reported drained.
    const f = fake({ size: 0 });
    const out = await runFoldedLoop(f.hooks, opts({ max: 3 }));
    expect(f.calls).toEqual(['settle', 'resolve', 'count']);
    expect(out).toEqual({ ok: true, state: 'complete', iterations: 0 });
  });

  it('never counts without settling first, across several passes', async () => {
    const f = fake({ size: 3 });
    await runFoldedLoop(f.hooks, opts({ max: 5 }));
    for (const [i, call] of f.calls.entries()) {
      if (call === 'count') expect(f.calls.slice(0, i)).toContain('settle');
      if (call === 'count') expect(f.calls[i - 1] === 'resolve' || f.calls[i - 1] === 'settle').toBe(true);
    }
  });

  it('recounts with the SAME guard it resolved, and re-resolves only for the next pass', async () => {
    // Re-walking the chain to recount can answer from a different rung: the
    // recorded `[data-testid="del-1"]` matches 1 before its row goes and 0
    // after, while the fallback `button "Remove"` matches the other rows.
    const f = fake({ size: 2 });
    await runFoldedLoop(f.hooks, opts({ max: 4 }));
    const firstPass = f.calls.slice(0, f.calls.indexOf('body:0') + 1);
    expect(firstPass.filter((c) => c === 'resolve')).toHaveLength(1);
    expect(f.calls.filter((c) => c === 'resolve').length).toBeGreaterThan(1);
  });

  it('leaves the cursor at 0 while the collection shrinks (a delete loop)', async () => {
    const f = fake({ size: 3 });
    const out = await runFoldedLoop(f.hooks, opts({ max: 9 }));
    expect(f.cursors).toEqual([0, 0, 0]);
    expect(out).toEqual({ ok: true, state: 'complete', iterations: 3 });
  });

  it('advances the cursor when the collection does not shrink (an edit-in-place loop)', async () => {
    const f = fake({ size: 3, mode: 'edit', signature: (c) => `record-${c}` });
    const out = await runFoldedLoop(f.hooks, opts({ max: 9, scope: 'observed' }));
    // Three records visited once each, then cursor >= count ends the loop.
    expect(f.cursors).toEqual([0, 1, 2]);
    expect(out).toEqual({ ok: true, state: 'complete', iterations: 3 });
  });

  it('waits for the last match to detach before deciding the count did not shrink', async () => {
    // A row that leaves the DOM a beat after the click would otherwise read as
    // an edit-in-place, advance the cursor, and make a delete loop skip a record.
    const f = fake({ size: 2, late: true });
    const out = await runFoldedLoop(f.hooks, opts({ max: 4, shrinkWaitMs: 250 }));
    expect(f.waits[0]).toEqual({ index: 1, timeout: 250 });
    expect(f.cursors[0]).toBe(0);
    expect(out.ok).toBe(true);
  });

  it('stops when a pass resolved the same elements and the count did not shrink — before acting on them again', async () => {
    // gap 11 / fwrd4l-n3: the per-record locators stopped telling records
    // apart, and the loop was re-acting on one record while counting progress.
    // ROBUSTNESS.md finding 1: judged after the body, the repeat was noticed
    // only once its mutation had already run twice.
    const f = fake({ size: 2, mode: 'edit', signature: () => 'same' });
    const out = await runFoldedLoop(f.hooks, opts({ max: 9, scope: 'observed' }));
    expect(out).toEqual({
      ok: false,
      iterations: 1,
      reason:
        'loop iteration 2 resolved the same element(s) as the previous one with the guard count unchanged (2) — ' +
        'the recorded per-record locators no longer distinguish records, so the loop stopped before re-acting on one record',
    });
    expect(f.calls.filter((c) => c.startsWith('act:'))).toEqual(['act:0']);
  });

  it('still judges a pass whose runner never asked, once the body is done', async () => {
    const f = fake({ size: 2, mode: 'edit' });
    const hooks: LoopHooks = { ...f.hooks, runBody: async (_cursor, pass) => { pass.entries.push('same'); return { status: 'ran' }; } };
    const out = await runFoldedLoop(hooks, opts({ max: 9, scope: 'observed' }));
    expect(out.ok).toBe(false);
    expect(out.iterations).toBe(1);
  });

  it('a guard count that throws is not an empty collection: the loop stops, unfinished', async () => {
    // ROBUSTNESS.md finding 1: count().catch(() => 0) read a closed page as
    // zero rows, and zero is the normal exit — {"ok":true,"iterations":0}.
    const f = fake({ size: 3, countThrowsFrom: 1 });
    const out = await runFoldedLoop(f.hooks, opts({ describe: "button 'Remove'" }));
    expect(out.ok).toBe(false);
    expect(out.iterations).toBe(0);
    expect((out as { reason: string }).reason).toBe(
      "loop guard button 'Remove' could not be read after 0 pass(es) (Target page, context or browser has been closed) — whether records remain is unknown, so the loop is not finished",
    );
    expect(f.cursors).toEqual([]);
    // observed twice, with a settle between: a navigation in flight gets one more look
    expect(f.calls).toEqual(['settle', 'resolve', 'count', 'settle', 'resolve', 'count']);
  });

  it('a count that fails once, mid-navigation, is taken again and the loop carries on', async () => {
    const f = fake({ size: 2 });
    let failed = false;
    const hooks: LoopHooks = {
      ...f.hooks,
      guard: async () => {
        const g = await f.hooks.guard();
        return g && { nth: g.nth, count: async () => { if (!failed) { failed = true; throw new Error('Execution context was destroyed'); } return g.count(); } };
      },
    };
    expect(await runFoldedLoop(hooks, opts())).toEqual({ ok: true, state: 'complete', iterations: 2 });
  });

  it('the recount after a pass is held to the same rule', async () => {
    // body 1 runs, then every count throws: the pass may have consumed its
    // record or not, and a zero here would have advanced nothing and ended green
    const f = fake({ size: 3, countThrowsFrom: 2 });
    const out = await runFoldedLoop(f.hooks, opts());
    expect(out.ok).toBe(false);
    expect(out.iterations).toBe(0);
    expect(f.cursors).toEqual([0]);
  });

  it('a guard that matched nothing on a page that cannot be read is unreadable, not drained', async () => {
    const f = fake({ size: 3, readable: () => false });
    const out = await runFoldedLoop({ ...f.hooks, guard: async () => null }, opts());
    expect(out.ok).toBe(false);
    expect((out as { reason: string }).reason).toBe(
      'the loop guard could not be read after 0 pass(es) (the page could not be read) — whether records remain is unknown, so the loop is not finished',
    );
  });

  it('a guard that matched nothing on a readable page is a genuinely empty collection', async () => {
    const f = fake({ size: 0 });
    expect(await runFoldedLoop({ ...f.hooks, guard: async () => null }, opts())).toEqual({ ok: true, state: 'complete', iterations: 0 });
  });

  it('a body that stops ends the loop without overwriting its diagnosis', async () => {
    const f = fake({ size: 3, stopBodyAt: 2 });
    const out = await runFoldedLoop(f.hooks, opts({ max: 9 }));
    expect(out).toEqual({ ok: false, iterations: 1, reason: LOOP_BODY_STOPPED });
    expect(f.cursors).toHaveLength(2);
  });

  it('a DRAIN that used every pass with records left is unfinished work, not a pass', async () => {
    const f = fake({ size: 10, mode: 'edit', signature: (c) => `record-${c}` });
    const out = await runFoldedLoop(f.hooks, opts({ max: 2, describe: "button 'Remove'" }));
    expect(out).toEqual({
      ok: false,
      iterations: 2,
      reason: "loop stopped after 2 pass(es) with 8 item(s) still matching button 'Remove' — the recorded work is not finished",
    });
  });

  it('a BOUNDED loop that used every pass did exactly the work it was given, and says it is partial', async () => {
    const f = fake({ size: 10, mode: 'edit', signature: (c) => `record-${c}` });
    const out = await runFoldedLoop(f.hooks, opts({ max: 2, scope: 'observed', describe: "button 'Mark'" }));
    // Not a failure — the loop had authority over the observed work only — but
    // not "the collection is done" either: eight records still match.
    expect(out).toEqual({ ok: true, state: 'partial', iterations: 2, remaining: 8, reason: "bounded to 2 pass(es), 8 item(s) still match button 'Mark'" });
    expect(f.cursors).toEqual([0, 1]);
  });

  it('a BOUNDED loop whose passes covered every match is complete', async () => {
    const f = fake({ size: 2, mode: 'edit', signature: (c) => `record-${c}` });
    expect(await runFoldedLoop(f.hooks, opts({ max: 2, scope: 'observed' }))).toEqual({ ok: true, state: 'complete', iterations: 2 });
  });

  it('a BOUNDED loop whose remainder cannot be counted is partial with an unknown remainder, never complete', async () => {
    const f = fake({ size: 10, mode: 'edit', signature: (c) => `record-${c}`, countThrowsFrom: 7 });
    const out = await runFoldedLoop(f.hooks, opts({ max: 2, scope: 'observed' }));
    expect(out.ok).toBe(true);
    expect(out).toMatchObject({ state: 'partial', remaining: null, iterations: 2 });
    expect((out as { reason: string }).reason).toMatch(/^bounded to 2 pass\(es\); whether records still match the guard could not be read/);
  });

  it('a DRAIN that emptied the rendered window of a virtualised collection is partial, not complete', async () => {
    const f = fake({ size: 3 });
    let asked = 0;
    const virtualised: LoopHooks = { ...f.hooks, coverage: async () => { asked++; return { partial: true, evidence: ["grid 'Orders' 20/340"] }; } };
    const out = await runFoldedLoop(virtualised, opts({ describe: "button 'Remove'" }));
    expect(out).toEqual({
      ok: true,
      state: 'partial',
      iterations: 3,
      remaining: null,
      reason: "no rendered record matches button 'Remove', but the page renders only part of its collection (grid 'Orders' 20/340) — records not rendered may remain",
    });
    expect(asked).toBe(1);
    // a page whose collections are fully rendered, or cannot be asked, is complete as before
    const full = fake({ size: 3 });
    expect(await runFoldedLoop({ ...full.hooks, coverage: async () => ({ partial: false, evidence: [] }) }, opts())).toEqual({ ok: true, state: 'complete', iterations: 3 });
    const silent = fake({ size: 3 });
    expect(await runFoldedLoop({ ...silent.hooks, coverage: async () => null }, opts())).toEqual({ ok: true, state: 'complete', iterations: 3 });
    // a bounded loop is not asked: it never claimed the collection
    const bounded = fake({ size: 2, mode: 'edit', signature: (c) => `record-${c}` });
    let boundedAsked = 0;
    await runFoldedLoop({ ...bounded.hooks, coverage: async () => { boundedAsked++; return { partial: true, evidence: [] }; } }, opts({ scope: 'observed' }));
    expect(boundedAsked).toBe(0);
  });

  it('an abort stops the loop instead of calling a part-done list finished', async () => {
    const f = fake({ size: 10, mode: 'edit', signature: (c) => `record-${c}`, abortAt: 2 });
    const out = await runFoldedLoop(f.hooks, opts({ max: 9, scope: 'observed' }));
    expect(out).toEqual({
      ok: false,
      iterations: 2,
      reason: 'instruction budget exhausted after 2 loop iteration(s), before the loop finished',
    });
  });

  it('an abort before the first pass runs no body at all', async () => {
    const f = fake({ size: 10, mode: 'edit', abortAt: 0 });
    const out = await runFoldedLoop(f.hooks, opts());
    expect(out.ok).toBe(false);
    expect(f.cursors).toEqual([]);
    expect(f.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The emitter side: the shape of what it generates, without a browser.
// ---------------------------------------------------------------------------

const ORIGIN = 'http://app.test';

function flowOf(steps: SpecSegment['steps']): SpecFlow {
  return {
    version: 1,
    name: 'loop-emit',
    origin: ORIGIN,
    startUrl: `${ORIGIN}/`,
    vars: [],
    steps: [{
      id: '01-step', instruction: 'clear the list', params: {}, outputs: [],
      segments: [{ id: 's_emit', template: 'clear the list', params: {}, preconditions: { urlPattern: `${ORIGIN}/` }, steps }],
    }],
  };
}

const PER_RECORD = { kind: 'css' as const, selector: '.row[data-id="7"] .del' };
const GENERIC = { kind: 'role' as const, role: 'button', name: 'Remove' };

const loopStep = (over: Partial<SkillStep> = {}): SkillStep => ({
  tool: 'loop',
  args: {},
  locators: {},
  while: [PER_RECORD, GENERIC],
  max: 4,
  body: [{ tool: 'click', args: { target: '@e1' }, locators: { target: [PER_RECORD, GENERIC] } }],
  ...over,
});

/** The emitted guard closure, from `guard: async () => {` to the runBody that follows. */
function guardBlock(source: string): string {
  const from = source.indexOf('  guard: async () => {');
  expect(from).toBeGreaterThan(-1);
  return source.slice(from, source.indexOf('runBody:', from));
}

describe('the emitted loop', () => {
  it('runs the shared policy rather than restating it', () => {
    const { source } = emitFlowFile(flowOf([loopStep()]), { tier: 'plain' });
    expect(source).toContain('const loop1 = await runFoldedLoop({');
    expect(source).toContain('  settle: () => settle(page),');
    expect(source).toContain('  readable: () => pageReadable(page),');
    expect(source).toContain("max: 4, scope: 'drain', shrinkWaitMs: LOOP_SHRINK_WAIT_MS");
    expect(source).toContain('if (!loop1.ok) throw new Error(');
    // and it carries the maintained module, not a copy of its rules
    expect(source).toContain('async function runFoldedLoop(');
    expect(source).not.toMatch(/^import .*execution/m);
  });

  it('takes the FIRST candidate that matches, in chain order, never a union', () => {
    // gap 7: `.or()` counts the generic fallback's rows too, so a guard whose
    // primary names this run's records drains rows the recording never claimed.
    const { source } = emitFlowFile(flowOf([loopStep()]), { tier: 'plain' });
    const guard = guardBlock(source);
    expect(guard).not.toContain('.or(');
    // The chain goes to the SHARED policy — which walks it candidate by
    // candidate and catches per candidate — with ambiguity allowed, as
    // replay's own guard call does.
    expect(guard).toContain('const guard1 = await resolveCandidates(page, [');
    expect(guard).toContain('], { allowMultiple: true });');
    expect(guard).toContain('return guard1 ? guard1.locator : null;');
    const primary = guard.indexOf("{ locator: page.locator('.row[data-id=\"7\"] .del'), index: 0,");
    const fallback = guard.indexOf("{ locator: page.getByRole('button', { name: roleName('Remove'), exact: true }), index: 1,");
    expect(primary).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(-1);
    expect(primary).toBeLessThan(fallback);
  });

  it('acts on the record at the cursor and signs the pass with what its targets resolved to', () => {
    const { source } = emitFlowFile(flowOf([loopStep()]), { tier: 'plain' });
    expect(source).toContain('runBody: async (cursor1: number, pass1: LoopPass) => {');
    // The cursor is the POLICY's now, not a `.nth()` welded onto the target:
    // it only narrows a candidate that turned out to be ambiguous.
    expect(source).toContain('ambiguousNth: cursor1');
    expect(source).not.toContain('.nth(cursor1)');
    // replay's sink: every body target's resolution, in order, is the pass's
    // evidence, checked as it resolves and before the target is acted on
    expect(source).toContain("resolved: { into: pass1.entries, key: 'target', check: pass1.check }");
    expect(source).toContain('    opts.resolved.check?.();');
    expect(source).toContain("return { status: 'ran' as const };");
    // the old signature was `${guard}#${cursor}`, which repeats only after a
    // shrink — when the count has dropped and the progress guard cannot fire
    expect(source).not.toMatch(/signature: `\$\{guardHit/);
    // the body still goes through the shared step lifecycle, acting on what
    // the policy resolved
    expect(source).toContain('await runStepLifecycle({');
    expect(source).toContain('await click(hit1.locator, { obs: obs1 }).catch(actionFailed);');
  });

  /**
   * Rule 4 (the progress guard) fires only when a pass's signature REPEATS
   * with the count unchanged. A signature that cannot repeat is a guard that
   * cannot fire — which is what the artifact had. The emitted `pick` records
   * the winning candidate, so two passes that resolve the same element sign
   * the same; an ambiguous candidate (several matches, one taken by index)
   * carries the cursor, as replay's resolveChain returns `{ …candidate, nth }`.
   */
  it('the emitted signature is stable across two identical passes, and differs by cursor only when the candidate was ambiguous', async () => {
    const { source } = emitFlowFile(flowOf([loopStep()]), { tier: 'plain' });
    const block = /export const DRIFT: string\[\] = \[\];\n([\s\S]*?)\nexport const steps = \{/.exec(source);
    expect(block).not.toBeNull();
    const js = ts.transpileModule(block![1], { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const pick = new Function('DRIFT', 'console', `${js}\nreturn pick;`)([], { warn: () => {}, log: () => {} }) as (
      page: unknown,
      candidates: unknown[],
      where: string,
      policy: { ambiguousNth?: number; waitMs?: number },
      opts: { drift?: string[]; resolved?: { into: string[]; key: string } },
    ) => Promise<unknown>;
    const page = { url: () => 'http://app.test/', evaluate: async () => ({ x: 0, y: 0 }) };
    /** The fake Locator of test/execution-resolve.test.ts, to the shape the policy asks. */
    const fakeLocator = (count: number, label: string): unknown => {
      const self: Record<string, unknown> = {
        toString: () => label,
        count: async () => count,
        first: () => self,
        textContent: async () => '',
        boundingBox: async () => ({ x: 0, y: 0, width: 10, height: 10 }),
        evaluate: async () => false,
        nth: (i: number) => fakeLocator(1, `${label}.nth(${i})`),
      };
      return self;
    };
    const obs = (index: number, count: number, label: string) =>
      ({ locator: fakeLocator(count, label), index, structural: false, kind: 'role', carries: '' });
    const sign = async (cursor: number, candidates: unknown[]): Promise<string[]> => {
      const into: string[] = [];
      await pick(page, candidates, 'w', { ambiguousNth: cursor, waitMs: 0 }, { resolved: { into, key: 'target' } });
      return into;
    };

    // a unique per-record candidate, resolved on two passes with the cursor
    // advanced: the same entry twice — the cursor never reaches the signature
    const unique = () => [obs(0, 1, "locator('.row[data-id=\"7\"] .del')"), obs(1, 3, 'generic')];
    const pass1 = await sign(0, unique());
    const pass2 = await sign(1, unique());
    expect(pass1).toEqual(["target=locator('.row[data-id=\"7\"] .del')"]);
    expect(pass2).toEqual(pass1);

    // an ambiguous candidate (the generic fallback matched every row) is
    // narrowed to the cursor by the policy, and the signature carries it
    const generic = () => [obs(0, 0, 'gone'), obs(1, 3, "getByRole('button', { name: roleName('Remove'), exact: true })")];
    const ambiguous = await sign(2, generic());
    expect(ambiguous).toEqual(["target=getByRole('button', { name: roleName('Remove'), exact: true }).nth(2)"]);
    expect(await sign(1, generic())).toEqual(["target=getByRole('button', { name: roleName('Remove'), exact: true }).nth(1)"]);
    expect(await sign(1, generic())).not.toEqual(ambiguous);

    // outside a loop nothing is recorded
    const none: string[] = [];
    await pick(page, unique(), 'w', { waitMs: 0 }, { resolved: undefined });
    expect(none).toEqual([]);
  });

  it('passes the recorded scope through, so a bounded loop is not asked to drain', () => {
    const { source } = emitFlowFile(flowOf([loopStep({ scope: 'observed' })]), { tier: 'plain' });
    expect(source).toContain("scope: 'observed'");
  });

  it('says so, once, when the recorded loop has no guard a spec can express', () => {
    // Nothing recorded at all: a point guard IS expressible now (below).
    const { source, warnings } = emitFlowFile(flowOf([loopStep({ while: [] })]), { tier: 'plain' });
    expect(source).toContain('// TODO: recorded loop at step 1 has no expressible guard.');
    expect(warnings).toContain('01-step: step 1 is a loop with no guard a spec can express');
    expect(source).not.toContain('runFoldedLoop({');
  });

  it('a guard recorded only as a position is expressible: it resolves through the point', () => {
    const { source, warnings } = emitFlowFile(
      flowOf([loopStep({ while: [{ kind: 'point', x: 1, y: 2, w: 3, h: 4, role: null, tag: 'div', vw: 800, vh: 600 } as never] })]),
      { tier: 'plain' },
    );
    expect(source).not.toContain('// TODO: recorded loop at step 1 has no expressible guard.');
    expect(warnings).toEqual([]);
    const guard = guardBlock(source);
    expect(guard).toContain('{ locator: pointLocator(page, { x: 1, y: 2 }), index: 0, structural: true, kind: \'point\'');
    expect(guard).toContain('point: { x: 1, y: 2, w: 3, h: 4, role: null, tag: \'div\', vw: 800, vh: 600 }');
    expect(guard).toContain('], { allowMultiple: true });');
  });
});

// ---------------------------------------------------------------------------
// Capabilities the artifact cannot carry: said as a diagnostic, a warning, a
// TODO blocker and a throw — never as a comment alone.
// ---------------------------------------------------------------------------

/** A position is resolvable now (pointLocator/markPoint); an EMPTY chain is not. */
const POINT_ONLY = [{ kind: 'point' as const, x: 1, y: 2, w: 3, h: 4, role: null, tag: 'div', vw: 800, vh: 600 } as never];
const NO_LOCATOR: never[] = [];

const UNSUPPORTED: [string, SkillStep, string, string][] = [
  [
    'an attribute read that never named its attribute',
    { tool: 'read', args: { target: '@e1', what: 'attr', name: 'href' }, locators: { target: [{ kind: 'id', selector: '#a' }] }, label: 'link' },
    'Unsupported recorded read: what=attr',
    '// TODO: read what=attr has no Tier 2 form (label link).',
  ],
  [
    'a read of an unknown kind',
    { tool: 'read', args: { target: '@e1', what: 'style' }, locators: { target: [{ kind: 'id', selector: '#a' }] }, label: 'look' },
    'Unsupported recorded read: what=style',
    '// TODO: read what=style has no Tier 2 form (label look).',
  ],
  [
    'a target with no recorded locator at all',
    { tool: 'click', args: { target: '@e1' }, locators: { target: NO_LOCATOR } },
    'Unsupported recorded locator: click has no locator a standalone spec can express',
    '// TODO: no locator this compiler can express for click — fill it in by hand.',
  ],
];

describe('a read with no locator left', () => {
  it('skips with one line and publishes nothing, as replay skips it — never a TODO that refuses the flow', () => {
    const step = { tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target: NO_LOCATOR }, label: 'name' };
    const { source, warnings, diagnostics } = emitFlowFile(flowOf([step]), { tier: 'plain' });
    expect(source).not.toContain('// TODO: no locator this compiler can express for read');
    expect(source).not.toContain('Unsupported recorded locator: read');
    expect(source).toContain('[sitelooper skip] 01-step');
    expect(source).toContain(`outputs['01-step.name'] = '';`);
    expect(diagnostics).toHaveLength(0);
    expect(warnings.some((w) => w.startsWith('01-step: step 1 (read name) has no locator left'))).toBe(true);
  });
});

describe('compile-time diagnostics for what the artifact cannot do', () => {
  it.each(UNSUPPORTED)('%s yields a diagnostic, a warning, a TODO and a throw', (_name, step, thrown, todo) => {
    const { source, warnings, diagnostics } = emitFlowFile(flowOf([step]), { tier: 'plain' });
    expect(source).toContain(todo);
    expect(source).toContain(`throw new Error('${thrown}');`);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('unsupported-capability');
    expect(diagnostics[0].step).toBe('01-step');
    expect(diagnostics[0].severity).toBe('warning');
    expect(diagnostics[0].why).not.toBe('');
    expect(diagnostics[0].fix).toBeTruthy();
    // The same sentence reaches the prose warnings, so no caller loses it.
    expect(warnings).toContain(diagnostics[0].line);
    expect(warnings.some((w) => w.startsWith('01-step: step 1 '))).toBe(true);
    // And a reader of the generated file sees compile's verdict above the step.
    expect(source).toContain(`  // warning 01-step: ${diagnostics[0].what}`);
  });

  it('says an empty chain kept no candidate, rather than blaming the tool', () => {
    const { diagnostics } = emitFlowFile(
      flowOf([{ tool: 'click', args: { target: '@e1' }, locators: { target: NO_LOCATOR } }]),
      { tier: 'plain' },
    );
    expect(diagnostics[0].why).toContain('kept no candidate for this target');
    expect(diagnostics[0].fix).toContain('sitelooper rerecord');
  });

  /**
   * A recorded POSITION is no longer a capability the artifact lacks: it
   * resolves through pointLocator/markPoint, under the same shared policy
   * (which ranks it last and checks its plausibility) that replay uses.
   */
  it('a position-only locator is resolvable, so it is no diagnostic at all', () => {
    const { diagnostics, warnings, source } = emitFlowFile(
      flowOf([{ tool: 'click', args: { target: '@e1' }, locators: { target: POINT_ONLY } }]),
      { tier: 'plain' },
    );
    expect(diagnostics).toEqual([]);
    expect(warnings).toEqual([]);
    expect(source).not.toContain('Unsupported recorded locator');
    expect(source).not.toContain('// TODO: dropped the recorded position fallback');
    expect(source).toContain("{ locator: pointLocator(page, { x: 1, y: 2 }), index: 0, structural: true, kind: 'point'");
    expect(source).toContain("point: { x: 1, y: 2, w: 3, h: 4, role: null, tag: 'div', vw: 800, vh: 600 }");
    expect(source).toContain('await click(hit1.locator, { obs: obs1 }).catch(actionFailed);');
  });

  it('a position-only locator on a read is resolvable too', () => {
    const { diagnostics, source } = emitFlowFile(
      flowOf([{ tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target: POINT_ONLY }, label: 'name' }]),
      { tier: 'plain' },
    );
    expect(diagnostics).toEqual([]);
    expect(source).toContain("outputs['01-step.name'] = await readOptional(page, [");
    expect(source).toContain('locator: pointLocator(page, { x: 1, y: 2 })');
  });

  it('leaves a supported step with no diagnostics at all', () => {
    const { diagnostics, source } = emitFlowFile(
      flowOf([{ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#b' }] } }]),
      { tier: 'plain' },
    );
    expect(diagnostics).toEqual([]);
    expect(source).not.toContain('Unsupported recorded');
  });
});

describe('a recorded tab switch (ROBUSTNESS.md finding 5)', () => {
  it('is followed, not reported as a capability the artifact lacks', () => {
    const { source, diagnostics } = emitFlowFile(flowOf([{ tool: 'tabs', args: { switch_to: 1 }, locators: {} }]), { tier: 'plain' });
    expect(diagnostics).toEqual([]);
    expect(source).not.toContain('Unsupported recorded action: tabs');
    expect(source).toContain(`landing1 = await armPageEffect(page, {"kind":"switch","to":1}, '01-step s_emit/1');`);
    expect(source).toContain('moved1 = await landed(landing1);');
    expect(source).toContain('if (moved1) page = run.page = moved1;');
    expect(source).toContain('if (run.page && !run.page.isClosed()) page = run.page;');
  });
});

describe('compileFlow over an unsupported capability', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('refuses to call the flow compilable, and reports the diagnostic with it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-loop-'));
    dirs.push(dir);
    const store = new SkillStore(path.join(dir, 'skills'));
    const skill: Skill = {
      id: 's_tabs',
      origin: ORIGIN,
      template: 'open the report tab',
      params: {},
      preconditions: { urlPattern: `${ORIGIN}/` },
      // A read of a kind the artifact has no form for (a tab switch used to
      // stand here; it is followed now — see "a recorded tab switch").
      steps: [{ tool: 'read', args: { target: '@e1', what: 'style' }, locators: { target: [{ kind: 'id', selector: '#a' }] }, label: 'look' }],
      stats: { uses: 2, successes: 2, partial: 0, created: '2026-09-07T00:00:00.000Z', failedAtStep: {}, fallthroughs: 0 },
      status: 'validated',
      provenance: { session: 'author', instruction: 'open the report tab', created: '2026-09-07T00:00:00.000Z' },
    };
    store.put(skill);
    const flow: Flow = {
      name: 'tabbed',
      origin: ORIGIN,
      startUrl: `${ORIGIN}/`,
      vars: [],
      steps: [{ id: '01-open', instruction: skill.template, skill: skill.id, outputs: [], recorded: {} }],
      provenance: { session: 'author', created: '2026-09-07T00:00:00.000Z' },
    };
    const flowFile = saveFlow(flow, path.join(dir, 'tabbed.json'));

    const result = compileFlow(flowFile, { store, outDir: path.join(dir, 'out') });
    expect(result.compilable).toBe(false);
    expect(result.compileBlockers.join(' ')).toContain('read what=style has no Tier 2 form');
    expect(result.diagnostics.map((d) => d.code)).toContain('unsupported-capability');
    // A warning, not an error: the file is still written, and still refuses to run.
    expect(result.refused).toBe(false);
    expect(fs.readFileSync(result.flowFile!, 'utf8')).toContain('Unsupported recorded read: what=style');
  });
});
