import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Flow } from '../src/skills/flow.js';
import type { FlowStepResult } from '../src/shared/protocol.js';
import {
  RerecordError,
  backupFlowFile,
  backupPath,
  formatRerecordDiagnostic,
  rerecordCommand,
  rerecordVerdict,
  stepLine,
  stepOf,
  unpinStep,
  type RerecordRun,
} from '../src/spec/rerecord.js';

// `rerecord` is one pure decision wrapped in a flow run: which fields of a step
// survive being unpinned, and whether the runs that followed prove the new
// recording is good enough for a compiled spec. Both are testable without a
// browser; the daemon half is the same `run` path every other command uses.

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sitelooper-rerecord-test-'));
  tmpDirs.push(d);
  return d;
}

function flowFixture(): Flow {
  return {
    name: 'fwod34',
    origin: 'https://app.example.com',
    startUrl: 'https://app.example.com/odoo',
    vars: ['runid'],
    steps: [
      {
        id: '06-open',
        instruction: 'cancel the order',
        skill: 's_aaa111',
        outputs: ['state'],
        recorded: { state: 'Cancelled' },
      },
      {
        id: '08-open',
        instruction: 'cancel the order {{runid}} and report its state',
        skill: 's_c86522',
        params: { v1: '{{runid}}' },
        outputs: ['state'],
        recorded: { state: 'Cancelled' },
        outputEvidence: { state: { same: 2, differed: 0 } },
      },
    ],
    provenance: { session: 'rec', created: '2026-01-01T00:00:00.000Z' },
  };
}

function result(over: Partial<FlowStepResult> = {}): FlowStepResult {
  return { id: '08-open', status: 'success', ...over };
}

describe('unpinStep', () => {
  it('throws away the pin, its params and the recorded values, keeping the outputs', () => {
    const out = unpinStep(flowFixture(), '08-open');
    const step = out.steps[1];
    expect(step.skill).toBeUndefined();
    expect(step.params).toBeUndefined();
    expect(step.outputEvidence).toBeUndefined();
    expect(step.recorded).toEqual({});
    // Later steps reference this step's outputs by name: renaming or dropping
    // them would break the flow's threading, so they survive the unpin.
    expect(step.outputs).toEqual(['state']);
    expect(step.id).toBe('08-open');
  });

  it('marks the step adopted, which is the shape decideRepin pins on the first clean recovery', () => {
    expect(unpinStep(flowFixture(), '08-open').steps[1].adopted).toBe(true);
  });

  it('keeps the instruction by default and replaces it when one is given', () => {
    expect(unpinStep(flowFixture(), '08-open').steps[1].instruction).toBe('cancel the order {{runid}} and report its state');
    expect(unpinStep(flowFixture(), '08-open', 'report the order state').steps[1].instruction).toBe('report the order state');
  });

  it('leaves every other step, and the original flow, untouched', () => {
    const before = flowFixture();
    const out = unpinStep(before, '08-open');
    expect(out.steps[0]).toEqual(before.steps[0]);
    expect(before.steps[1].skill).toBe('s_c86522');
    expect(before.steps[1].recorded).toEqual({ state: 'Cancelled' });
  });

  it('refuses an unknown step id and names the ones there are', () => {
    expect(() => unpinStep(flowFixture(), '99-nope')).toThrow(RerecordError);
    expect(() => unpinStep(flowFixture(), '99-nope')).toThrow(/no step "99-nope".*06-open, 08-open/s);
  });
});

describe('backups', () => {
  it('names the backup beside the flow, stamped', () => {
    expect(backupPath(path.join('flows', 'fwod34.json'), 'abc')).toBe(path.join('flows', 'fwod34.bak-abc.json'));
  });

  it('copies the file rather than moving it', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'fwod34.json');
    fs.writeFileSync(file, '{"name":"fwod34"}');
    const to = backupFlowFile(file, 'abc');
    expect(fs.readFileSync(to, 'utf8')).toBe('{"name":"fwod34"}');
    expect(fs.existsSync(file)).toBe(true);
  });

  it('reports an unreadable flow as a caller error, not a crash', () => {
    expect(() => backupFlowFile(path.join(tmpDir(), 'missing.json'), 'abc')).toThrow(RerecordError);
  });
});

describe('rerecordVerdict', () => {
  const file = 'bench/results-published/fwod34.json';
  const runs = (...steps: (FlowStepResult | undefined)[]): RerecordRun[] =>
    steps.map((step, i) => ({ label: `run ${i + 1}`, step }));

  it('passes when the last run replays the step at tier A with the new pin', () => {
    const v = rerecordVerdict({
      file,
      stepId: '08-open',
      runs: runs(result({ tier: null, turns: 12, repinned: 's_ab12cd' }), result({ tier: 'A', replayed: 's_ab12cd' })),
    });
    expect(v).toEqual({ ok: true, pinned: 's_ab12cd', runs: 2 });
  });

  it('fails when nothing was pinned — the store refused the recovery', () => {
    const v = rerecordVerdict({ file, stepId: '08-open', runs: runs(result({ tier: null, turns: 20 }), result({ tier: null, turns: 18 })) });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.diagnostic.what).toMatch(/nothing was pinned/);
    expect(v.diagnostic.fix).toMatch(/--instruction/);
  });

  it('fails when the new procedure still needs the model on the last run', () => {
    const v = rerecordVerdict({
      file,
      stepId: '08-open',
      runs: runs(result({ tier: null, repinned: 's_ab12cd' }), result({ tier: null, turns: 9, fellBack: 'precondition' })),
    });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.diagnostic.what).toMatch(/still needs the model/);
    expect(v.diagnostic.why).toMatch(/tier none \(precondition\)/);
    expect(v.pinned).toBe('s_ab12cd');
  });

  it('fails when the step only passes because a different skill covered it — the fwod34 failure', () => {
    const v = rerecordVerdict({
      file,
      stepId: '08-open',
      runs: runs(result({ tier: null, repinned: 's_ab12cd' }), result({ tier: 'A', replayed: 's_fcb896' })),
    });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.diagnostic.what).toMatch(/only passes because the engine replays s_fcb896 instead of its new pin s_ab12cd/);
  });

  it('fails when the last run did not pass the step at all', () => {
    const v = rerecordVerdict({
      file,
      stepId: '08-open',
      runs: runs(result({ tier: null, repinned: 's_ab12cd' }), result({ status: 'failure', summary: 'no Cancel button', tier: null })),
    });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.diagnostic.why).toMatch(/reported failure: no Cancel button/);
  });

  it('fails when the flow halted before reaching the step, and when it never ran', () => {
    const halted = rerecordVerdict({ file, stepId: '08-open', runs: runs(result({ tier: null, repinned: 's_ab12cd' }), undefined) });
    expect(halted.ok).toBe(false);
    if (!halted.ok) expect(halted.diagnostic.what).toMatch(/never reached it/);
    const none = rerecordVerdict({ file, stepId: '08-open', runs: [] });
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.diagnostic.what).toMatch(/no run completed/);
  });

  it('every failure is an error-severity needs-rerecord diagnostic whose fix is a real command', () => {
    const v = rerecordVerdict({ file, stepId: '08-open', runs: runs(result({ tier: null })) });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.diagnostic.code).toBe('needs-rerecord');
    expect(v.diagnostic.severity).toBe('error');
    expect(v.diagnostic.step).toBe('08-open');
    expect(v.diagnostic.fix).toMatch(/^sitelooper rerecord bench\/results-published\/fwod34\.json 08-open/);
    const block = formatRerecordDiagnostic(v.diagnostic);
    expect(block.split('\n')[0]).toBe(`error 08-open: ${v.diagnostic.what}`);
    expect(block).toMatch(/\n {2}why: /);
    expect(block).toMatch(/\n {2}fix: sitelooper rerecord /);
  });
});

describe('reporting helpers', () => {
  it('quotes a path with spaces in the fix command', () => {
    expect(rerecordCommand('my flows/f.json', '08-open')).toBe('sitelooper rerecord "my flows/f.json" 08-open');
    expect(rerecordCommand('f.json', '08-open', 'do the thing')).toBe('sitelooper rerecord f.json 08-open --instruction "do the thing"');
  });

  it('prints the step the way the command reports each run', () => {
    expect(stepLine('08-open', { label: 'run 1', step: result({ tier: null, turns: 12, repinned: 's_ab12cd' }) })).toBe(
      'run 1: 08-open  agent (12 turns) re-pinned s_ab12cd',
    );
    expect(stepLine('08-open', { label: 'run 2', step: result({ tier: 'A', replayed: 's_ab12cd' }) })).toBe(
      'run 2: 08-open  replay tier A (s_ab12cd)',
    );
    expect(stepLine('08-open', { label: 'run 2', step: result({ status: 'failure', tier: null }) })).toBe('run 2: 08-open  agent [FAILURE]');
    expect(stepLine('08-open', { label: 'run 2' })).toBe('run 2: 08-open  not reached');
  });

  it('finds the step in a run result, and says nothing when the run stopped short', () => {
    expect(stepOf([result({ id: '06-open' }), result()], '08-open')?.id).toBe('08-open');
    expect(stepOf([result({ id: '06-open' })], '08-open')).toBeUndefined();
    expect(stepOf(undefined, '08-open')).toBeUndefined();
  });
});

// The CLI wiring has no exported seam to call (see test/spec-cli.test.ts for the
// same reasoning): importing src/cli.ts runs main(). So the command's contract
// with the user — the usage text and the flags it must parse — is asserted
// against the source.
describe('cli: rerecord command', () => {
  const cliSource = fs.readFileSync(path.resolve(__dirname, '../src/cli.ts'), 'utf8');

  it('documents the command in USAGE', () => {
    expect(cliSource).toContain('rerecord <flow> <step-id>');
  });

  it('accepts --instruction and --runs as value flags', () => {
    const valueFlags = cliSource.match(/const valueFlags = new Set\(\[([\s\S]*?)\]\);/);
    expect(valueFlags).not.toBeNull();
    expect(valueFlags![1]).toMatch(/'instruction'/);
    expect(valueFlags![1]).toMatch(/'runs'/);
  });

  it('dispatches "rerecord" before any daemon is spawned', () => {
    const idx = cliSource.indexOf("if (command === 'rerecord')");
    expect(idx).toBeGreaterThan(0);
    expect(cliSource).toMatch(/if \(command === 'rerecord'\) \{\s*\n\s*await rerecordFlowCommand\(positional, flags, json, onProgress\);/);
    expect(idx).toBeLessThan(cliSource.indexOf('const conn = await connectOrSpawn('));
  });

  it('reuses the run path, the var minting and the reset command rather than duplicating them', () => {
    const body = cliSource.slice(cliSource.indexOf('async function rerecordFlowCommand('));
    expect(body).toMatch(/runResetCmd\(resetCmd, label, say\)/);
    expect(body).toMatch(/runStagedFlow\(stagedInput, mintVars\(vars, i\)/);
  });
});

describe('stepNote and refusal evidence', () => {
  it('extracts the daemon line about the step being re-recorded and nothing else', async () => {
    const { stepNote } = await import('../src/spec/rerecord.js');
    const line = '[flow fwod34r2] 08-open: not re-pinning s_04d970 — slot(s) v1, v2, v3 identify the record but carry no origin to rebind from';
    expect(stepNote(line, '08-open')).toBe('not re-pinning s_04d970 — slot(s) v1, v2, v3 identify the record but carry no origin to rebind from');
    expect(stepNote(line, '07-open')).toBeNull();
    expect(stepNote('  · clicking Cancel', '08-open')).toBeNull();
  });

  it("quotes the daemon's refusal in the verdict when nothing was pinned", async () => {
    const { rerecordVerdict } = await import('../src/spec/rerecord.js');
    const step = { id: '08-open', status: 'success', tier: 'B', replayed: 's_04d970', turns: 2 } as never;
    const v = rerecordVerdict({
      file: 'flows/f.json',
      stepId: '08-open',
      runs: [
        { label: 'run 1', step, notes: ['not re-pinning s_04d970 — slot(s) v2 identify the record but carry no origin to rebind from'] },
        { label: 'run 2', step },
      ],
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.diagnostic.why).toContain('run 1: not re-pinning s_04d970 — slot(s) v2');
      expect(v.diagnostic.why).not.toContain('needed model gestures');
    }
  });
});

describe('replayed as a fraction', () => {
  // The local re-record of odoo 08-open: run 1 re-pinned s_04d970, run 2
  // replayed it at tier A and the daemon reported `replayed: "2/2"` — a
  // steps-run fraction, not a skill id — and the verdict called it a cover.
  it("does not mistake the daemon's steps-run fraction for a covering skill", async () => {
    const { rerecordVerdict, replayedSkillId } = await import('../src/spec/rerecord.js');
    expect(replayedSkillId('2/2')).toBeNull();
    expect(replayedSkillId('s_04d970')).toBe('s_04d970');
    const v = rerecordVerdict({
      file: 'flows/f.json',
      stepId: '08-open',
      runs: [
        { label: 'run 1', step: { id: '08-open', status: 'success', tier: 'B', replayed: '2/2', turns: 2, repinned: 's_04d970' } as never },
        { label: 'run 2', step: { id: '08-open', status: 'success', tier: 'A', replayed: '2/2', turns: 0 } as never },
      ],
    });
    expect(v).toEqual({ ok: true, pinned: 's_04d970', runs: 2 });
  });
});

