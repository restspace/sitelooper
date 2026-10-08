import { describe, expect, it } from 'vitest';
import { messageAnchor } from '../src/spec/check.js';
import { converge, failingStep, rerecordSteps, type ConvergeCheck, type ConvergeCompile, type ConvergeRerecord, type ConvergeSeams } from '../src/spec/converge.js';
import type { Diagnostic } from '../src/spec/diagnostics.js';

const STEPS = ['01-signin', '02-create', '03-open', '04-edit'].map((id) => ({ id }));

const refusal = (...steps: string[]): ConvergeCompile => ({
  refused: true, compilable: false, flowFile: null, compileBlockers: [], spec: { steps: STEPS },
  diagnostics: steps.map((step): Diagnostic => ({
    code: 'demoted-pin', step, what: `${step} is pinned to a demoted procedure`, why: 'w', severity: 'error',
    action: { command: 'rerecord', args: ['flow', step], step },
  })),
});
const compiled = (): ConvergeCompile => ({ refused: false, compilable: true, flowFile: '/out/f.flow.ts', compileBlockers: [], diagnostics: [], spec: { steps: STEPS } });
const pass = (): ConvergeCheck => ({ ran: true, passed: true, timedOut: false, error: null, anchor: null });
const fail = (anchor: string | null, error = 'locator.click: failed', timedOut = false): ConvergeCheck => ({ ran: true, passed: false, timedOut, error, anchor });
const ok = (turns = 10): ConvergeRerecord => ({ ok: true, pinned: 's_1', runs: [{ status: 'success', tier: 'A', turns }], diagnostics: [] });
const refused = (): ConvergeRerecord => ({ ok: false, pinned: null, runs: [{ status: 'success', tier: 'B', turns: 5 }], diagnostics: ['needs-rerecord: not replayed at tier A'] });

/** Fakes that answer from queues and record every call. */
function fakes(q: { compile: ConvergeCompile[]; check?: ConvergeCheck[]; rerecord?: ConvergeRerecord[] }) {
  const calls: string[] = [];
  const rerecords: Array<{ step: string; runs: number; outputs: string[] }> = [];
  const seams: ConvergeSeams = {
    compile: () => { calls.push('compile'); return q.compile.shift() ?? compiled(); },
    reset: () => { calls.push('reset'); },
    check: () => { calls.push('check'); return q.check?.shift() ?? pass(); },
    rerecord: async (step, o) => { calls.push(`rerecord ${step}`); rerecords.push({ step, ...o }); return q.rerecord?.shift() ?? ok(); },
  };
  return { seams, calls, rerecords };
}

const opts = { maxRounds: 3, rerecordRuns: 2 };

describe('build --converge', () => {
  it('re-records the earliest named step of a refusal, recompiles, checks and passes', async () => {
    const f = fakes({ compile: [refusal('03-open', '02-create'), compiled()], check: [pass()] });
    const r = await converge(f.seams, opts);
    expect(r.status).toBe('converged');
    expect(f.calls).toEqual(['compile', 'rerecord 02-create', 'compile', 'reset', 'check']);
    expect(r.flowFile).toBe('/out/f.flow.ts');
    expect(r.rounds[0].compile.steps).toEqual(['02-create', '03-open']);
    expect(r.rounds[0].rerecord).toMatchObject({ step: '02-create', ok: true, turns: 10 });
    expect(r.modelTurns).toBe(10);
  });

  it('names the step from the failure site and re-records it, then tests that re-record', async () => {
    const f = fakes({ compile: [compiled(), compiled()], check: [fail('03-open s_1e46d8/10'), pass()] });
    const r = await converge(f.seams, opts);
    expect(r.status).toBe('converged');
    expect(f.rerecords.map((x) => x.step)).toEqual(['03-open']);
    expect(r.rounds[0].check).toMatchObject({ passed: false, step: '03-open' });
  });

  it('never lets a drift line pick the step: only the anchor and the failure text are read', () => {
    // A check result carries no drift field to read; an error that merely quotes a drift line names no site.
    expect(failingStep({ anchor: '03-open s_1e46d8/10', error: '[sitelooper drift] 02-create s_aaaaaa/1 healed' }).step).toBe('03-open');
    expect(failingStep({ anchor: null, error: 'expect(locator) failed' }).step).toBeNull();
    // The artifact's end-of-run checks (PARTIAL, persistence) sit outside every step anchor.
    expect(failingStep({ anchor: '05-report s_bbbbbb/1', error: 'Error: persistence: 03-create typed "Seed: Tomato", the record at http://x/r/1 does not show it after reload' }).step).toBe('03-create');
    expect(failingStep({ anchor: null, error: 'PARTIAL: 02-find: the report gave seed_name as given' }).step).toBe('02-find');
  });

  it("a start gate's refusal names its own step, not the previous step the stack anchor points at (fwen8)", () => {
    const error = 'Error: 05-add s_f44792: not on the page this procedure starts from (expects http://127.0.0.1:8100/app/sales-order/new-sales-order-uxvwbpigvk, browser is at http://127.0.0.1:8100/app/sales-order/new-sales-order-stngnmhhdk) — nothing of this segment has run';
    expect(failingStep({ anchor: '04-create s_538e35/13', error }).step).toBe('05-add');
    expect(messageAnchor(error)).toBe('05-add s_f44792');
    expect(messageAnchor('01-signin s_5fccd8/2: no element matched')).toBe('01-signin s_5fccd8/2');
    // Only a LEADING site counts: a quoted drift line or a site mid-sentence is not the thrower.
    expect(messageAnchor('[sitelooper drift] 02-create s_aaaaaa/1 healed')).toBeNull();
    expect(messageAnchor('TimeoutError: locator.click: Timeout 10000ms exceeded')).toBeNull();
  });

  it('a failure naming a producer re-records the producer and asks it to read the value', async () => {
    const err = '04-edit needs {{02-create.ref}}, and this run never published it';
    const f = fakes({ compile: [compiled(), compiled()], check: [fail('04-edit s_aaaaaa/1', err), pass()] });
    await converge(f.seams, opts);
    expect(f.rerecords[0]).toMatchObject({ step: '02-create', outputs: ['ref'] });
  });

  it('a refusal for an unpublished output asks the producer to read it', async () => {
    const c = refusal('02-create');
    c.diagnostics[0].what = 'step uses {{02-create.ref}}, and nothing has ever published it';
    const f = fakes({ compile: [c, compiled()] });
    await converge(f.seams, opts);
    expect(f.rerecords[0].outputs).toEqual(['ref']);
  });

  it('stops when the check only timed out: the budget is not a step', async () => {
    const f = fakes({ compile: [compiled()], check: [fail('03-open s_1e46d8/10', 'Test timeout of 300000ms exceeded.')] });
    const r = await converge(f.seams, opts);
    expect(r.status).toBe('timed-out');
    expect(f.rerecords).toEqual([]);
    const g = fakes({ compile: [compiled()], check: [fail(null, 'killed', true)] });
    expect((await converge(g.seams, opts)).status).toBe('timed-out');
  });

  it('a locator timeout inside a step is a step failure, not the budget', async () => {
    const f = fakes({ compile: [compiled(), compiled()], check: [fail('03-open s_1/2', 'locator.click: Timeout 10000ms exceeded.'), pass()] });
    expect((await converge(f.seams, opts)).status).toBe('converged');
  });

  it('stops after two refused re-records of one step, the second with three runs', async () => {
    const f = fakes({ compile: [refusal('02-create'), refusal('02-create'), refusal('02-create')], rerecord: [refused(), refused()] });
    const r = await converge(f.seams, { maxRounds: 5, rerecordRuns: 2 });
    expect(r.status).toBe('stuck-repin');
    expect(f.rerecords.map((x) => x.runs)).toEqual([2, 3]);
  });

  it('stops when a refusal names no step to re-record', async () => {
    const c = refusal();
    c.compileBlockers = ['nothing to emit'];
    const r = await converge(fakes({ compile: [c] }).seams, opts);
    expect(r.status).toBe('stuck');
    expect(r.why).toContain('nothing to emit');
  });

  it('stops when a failure names no step', async () => {
    const f = fakes({ compile: [compiled()], check: [fail(null, 'something broke')] });
    expect((await converge(f.seams, opts)).status).toBe('stuck');
    expect(f.rerecords).toEqual([]);
  });

  it('reports an unrunnable spec as unavailable', async () => {
    const f = fakes({ compile: [compiled()], check: [{ ran: false, passed: false, timedOut: false, error: null, anchor: null, verdict: 'no browser' }] });
    expect((await converge(f.seams, opts)).status).toBe('unavailable');
  });

  it('caps the rounds but still tests the last re-record', async () => {
    const f = fakes({ compile: [compiled(), compiled(), compiled()], check: [fail('03-open s_1/2'), fail('03-open s_1/2'), pass()] });
    const r = await converge(f.seams, { maxRounds: 2, rerecordRuns: 2 });
    expect(r.status).toBe('converged');
    expect(r.rounds.map((x) => x.round)).toEqual([1, 2, 3]);
    expect(r.rounds[2].final).toBe(true);
    expect(f.rerecords).toHaveLength(2);
  });

  it('is exhausted when the final check fails, and never re-records after it', async () => {
    const f = fakes({ compile: [compiled(), compiled(), compiled()], check: [fail('03-open s_1/2'), fail('04-edit s_1/2'), fail('04-edit s_1/2')] });
    const r = await converge(f.seams, { maxRounds: 2, rerecordRuns: 2 });
    expect(r.status).toBe('exhausted');
    expect(f.rerecords).toHaveLength(2);
    expect(f.calls.at(-1)).toBe('check');
  });

  it('does not run a final round when the last re-record was refused', async () => {
    const f = fakes({ compile: [compiled(), compiled()], check: [fail('03-open s_1/2')], rerecord: [refused()] });
    const r = await converge(f.seams, { maxRounds: 1, rerecordRuns: 2 });
    expect(r.status).toBe('exhausted');
    expect(r.rounds).toHaveLength(1);
  });

  it('resets before every check, and a refused compile never runs the spec', async () => {
    const f = fakes({ compile: [refusal('02-create'), compiled()] });
    await converge(f.seams, opts);
    expect(f.calls.filter((c) => c === 'reset')).toHaveLength(1);
    expect(f.calls.indexOf('reset')).toBe(f.calls.indexOf('check') - 1);
  });

  it('keeps the rounds in a JSON-able shape', async () => {
    const f = fakes({ compile: [refusal('02-create'), compiled(), compiled()], check: [fail('03-open s_1/2'), pass()] });
    const r = await converge(f.seams, opts);
    const back = JSON.parse(JSON.stringify(r));
    expect(back.rounds).toHaveLength(3);
    expect(back.rounds[0]).toMatchObject({ round: 1, compile: { outcome: 'refused', steps: ['02-create'] }, rerecord: { step: '02-create', ok: true } });
    expect(back.rounds[1]).toMatchObject({ compile: { outcome: 'compiled' }, check: { passed: false, step: '03-open' }, rerecord: { step: '03-open' } });
    expect(back.rounds[2]).toMatchObject({ check: { passed: true } });
    expect(back.rounds[2].rerecord).toBeUndefined();
    expect(back).toMatchObject({ status: 'converged', modelTurns: 20 });
  });

  it('rerecordSteps ignores warnings and non-rerecord actions and sorts by flow order', () => {
    const d = (step: string, severity: 'error' | 'warning', command = 'rerecord'): Diagnostic => ({ code: 'demoted-pin', step, what: 'w', why: 'w', severity, action: { command, args: [], step } });
    expect(rerecordSteps([d('04-edit', 'error'), d('01-signin', 'warning'), d('03-open', 'error', 'compile'), d('02-create', 'error')], STEPS.map((s) => s.id))).toEqual(['02-create', '04-edit']);
  });
});
