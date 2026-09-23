import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { InstructionResult, SkillRecord } from '../src/agent/loop.js';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { decideRepin, learnFromInstruction, pinCarriesFailedStep } from '../src/skills/learn.js';
import { SkillStore, type Skill } from '../src/skills/store.js';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-stopped-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

/**
 * snipeit fwsi7-n3 02-create (round 54): the replay of 02-create's chain
 * stopped at s_5dcb48 step 1 (`goto /hardware/4`, the recording's record),
 * the recovery finished the step, and the re-pin took the chain s_9a4939 →
 * s_19095e → s_0aa6d6, where s_0aa6d6 is that very goto, recorded
 * `via: {skill: s_5dcb48, step: 1}`. The compiled script died on it.
 */
const ORIGIN = 'http://127.0.0.1:8098';
const via = (skill: string, stepNo: number, tool: string, args: Record<string, unknown>, url: string): RecordedStep => ({
  k: 'step',
  tool,
  args,
  locators: args.target ? { target: { expr: 'x', verified: true, raw: String(args.target), chain: [{ kind: 'role', role: 'button', name: String(args.target) }] } } : {},
  diff: { url, alerts: [], added: ['- heading "x"'], dialect: 2 },
  via: { skill, step: stepNo },
});
const recovery = (): RecordedEntry[] => [
  { k: 'instruction', text: "Create a new asset named 'fwsi7-n3 Bench Asset'", url: `${ORIGIN}/hardware/create` },
  via('s_b2d9d5', 1, 'click', { target: 'Save' }, `${ORIGIN}/hardware`),
  via('s_5dcb48', 1, 'goto', { url: `${ORIGIN}/hardware/4` }, `${ORIGIN}/hardware/4`),
  { k: 'step', tool: 'click', args: { target: 'Click here to view' }, locators: { target: { expr: 'x', verified: true, raw: 'x', chain: [{ kind: 'role', role: 'link', name: 'Click here to view' }] } }, diff: { url: `${ORIGIN}/hardware/7`, alerts: [], added: ['- heading "fwsi7-n3 Bench Asset"'], dialect: 2 } },
];
const report = { status: 'success' as const, summary: 'created', evidence: { values: {} } };
const hasStoppedGoto = (skills: Skill[]) => skills.flatMap((s) => s.steps).some((s) => s.tool === 'goto' && String(s.args.url).endsWith('/hardware/4'));

describe('a recovery compile drops the replayed step that stopped it', () => {
  it('compileSkills with stoppedAt keeps every other step but not that one', () => {
    const entries = recovery();
    const withStop = compileSkills({ entries, instruction: (entries[0] as { text: string }).text, report, session: 't', stoppedAt: { skill: 's_5dcb48', step: 1 } });
    expect(hasStoppedGoto(withStop)).toBe(false);
    expect(withStop.flatMap((s) => s.steps).some((s) => s.tool === 'click' && JSON.stringify(s.locators).includes('Click here to view'))).toBe(true);
    // without the stop, the recording's step is the procedure's, as before
    expect(hasStoppedGoto(compileSkills({ entries, instruction: (entries[0] as { text: string }).text, report, session: 't' }))).toBe(true);
  });

  it('learnFromInstruction passes the stop for a recovery, from the replay record', () => {
    const store = new SkillStore(path.join(tmp, 'learn'));
    const skill: SkillRecord = { listed: [], invoked: 's_5dcb48', stepsReplayed: 0, stepsTotal: 1, failedAt: 1, repaired: true, refused: false, fallthroughs: 0, similarity: null, deterministicActions: 0, totalActions: 1 };
    const result = { report, turns: 3, usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 }, timing: {}, screenshots: [], skill } as unknown as InstructionResult;
    const entries = recovery();
    const learned = learnFromInstruction(store, { result, instruction: (entries[0] as { text: string }).text, entries, session: 's', recovery: true });
    const ids = [...(learned?.compiledAll ?? []), ...(learned?.wholeAll ?? []), learned?.compiled, learned?.whole].filter((x): x is string => Boolean(x));
    expect(ids.length).toBeGreaterThan(0);
    expect(hasStoppedGoto(ids.map((id) => store.get(id)!).filter(Boolean))).toBe(false);
  });
});

describe('a re-pin whose chain replays a demoted skill failed step is refused', () => {
  const skill = (id: string, steps: Skill['steps'], extra: Partial<Skill> = {}): Skill => ({
    id,
    origin: ORIGIN,
    template: id,
    params: {},
    preconditions: { urlPattern: `${ORIGIN}/hardware` },
    steps,
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'provisional',
    provenance: { session: 's', instruction: id, created: 't' },
    ...extra,
  });

  it('names the failed step, and decideRepin refuses on it', () => {
    const store = new SkillStore(path.join(tmp, 'repin'));
    store.put(skill('s_5dcb48', [{ tool: 'goto', args: { url: `${ORIGIN}/hardware/4` }, locators: {} }], { status: 'demoted', stats: { uses: 3, successes: 1, partial: 2, created: 't', failedAtStep: { '1': 2 }, fallthroughs: 0 } }));
    store.put(skill('s_19095e', [{ tool: 'click', args: { target: '@e1' }, locators: {} }], { seq: { chain: 's_4cc14e', index: 0, of: 2 } }));
    store.put(skill('s_0aa6d6', [{ tool: 'goto', args: { url: `${ORIGIN}/hardware/4` }, locators: {}, via: { skill: 's_5dcb48', step: 1 } }], { seq: { chain: 's_4cc14e', index: 1, of: 2 } }));
    const failedStep = pinCarriesFailedStep(store, 's_19095e');
    expect(failedStep).toMatch(/s_0aa6d6 replays step 1 of s_5dcb48/);
    const decision = decideRepin({
      step: { id: '02-create', skill: 's_old', adopted: true },
      reportStatus: 'success',
      outcome: undefined,
      compiled: { skill: 's_19095e', status: 'provisional' },
      incumbent: 'demoted',
      stray: 0,
      adoptable: true,
      failedStep,
    });
    expect(decision).toEqual({ refused: expect.stringMatching(/not re-pinning s_19095e/) });
    // a healthy source skill is no reason to refuse
    store.update('s_5dcb48', (sk) => ({ ...sk, status: 'validated' }));
    expect(pinCarriesFailedStep(store, 's_19095e')).toBeNull();
  });
});
