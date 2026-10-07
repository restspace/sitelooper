import { describe, expect, it } from 'vitest';
import { converge, decideBuildConvergence, NO_RESET_SKIP_MESSAGE, type ConvergeCompile, type ConvergeSeams } from '../src/spec/converge.js';

const base = { noConverge: false, convergeFlag: undefined as string | undefined, resetCmd: 'npm run reset', hasModelKey: true };

describe('build convergence default', () => {
  it('converges for 2 rounds when a reset command exists', () => {
    expect(decideBuildConvergence(base)).toEqual({ mode: 'converge', maxRounds: 2, modelAvailable: true });
  });
  it('--no-converge restores plain build, with no skip line', () => {
    expect(decideBuildConvergence({ ...base, noConverge: true })).toEqual({ mode: 'plain', skipped: null });
    expect(decideBuildConvergence({ ...base, noConverge: true, resetCmd: undefined })).toEqual({ mode: 'plain', skipped: null });
  });
  it('without a reset command it is plain build plus a skip line naming how to configure one', () => {
    const d = decideBuildConvergence({ ...base, resetCmd: undefined });
    expect(d).toEqual({ mode: 'plain', skipped: NO_RESET_SKIP_MESSAGE });
    expect(NO_RESET_SKIP_MESSAGE).toContain('--reset-cmd');
    expect(NO_RESET_SKIP_MESSAGE).toContain('resetCommand');
  });
  it('--converge N sets the rounds; bare --converge is 3; both converge even without a reset command', () => {
    expect(decideBuildConvergence({ ...base, convergeFlag: '5' })).toMatchObject({ mode: 'converge', maxRounds: 5 });
    expect(decideBuildConvergence({ ...base, convergeFlag: '' })).toMatchObject({ mode: 'converge', maxRounds: 3 });
    expect(decideBuildConvergence({ ...base, convergeFlag: '1', resetCmd: undefined })).toMatchObject({ mode: 'converge', maxRounds: 1 });
  });
  it('no API key still converges, with the model marked unavailable', () => {
    expect(decideBuildConvergence({ ...base, hasModelKey: false })).toEqual({ mode: 'converge', maxRounds: 2, modelAvailable: false });
  });
});

describe('converge without a model', () => {
  const compiled = (): ConvergeCompile => ({ refused: false, compilable: true, flowFile: '/out/f.flow.ts', compileBlockers: [], diagnostics: [], spec: { steps: [{ id: '01-a' }] } });
  const seams = (check: ConvergeSeams['check'], calls: string[]): ConvergeSeams => ({
    compile: () => compiled(),
    check,
    rerecord: async () => { calls.push('rerecord'); throw new Error('must not be called'); },
  });
  it('passes when the first check passes (no re-record needed)', async () => {
    const calls: string[] = [];
    const r = await converge(seams(() => ({ ran: true, passed: true, timedOut: false, error: null, anchor: null }), calls), { maxRounds: 2, rerecordRuns: 2, modelAvailable: false });
    expect(r.status).toBe('converged');
  });
  it('stops unavailable, with a message and no re-record, when the check fails', async () => {
    const calls: string[] = [];
    const r = await converge(seams(() => ({ ran: true, passed: false, timedOut: false, error: 'x', anchor: '01-a s_1/1' }), calls), { maxRounds: 2, rerecordRuns: 2, modelAvailable: false });
    expect(r.status).toBe('unavailable');
    expect(r.why).toContain('API key');
    expect(calls).toEqual([]);
  });
});
