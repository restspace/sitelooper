/**
 * Item 1 of notes/CONTRACT-spec-reliability.md: learn from recoveries.
 *
 * hsdx1's s_2731b5 stopped at step 4 on every replay (a hide line naming a
 * timestamp) and hsbs2's s_7db6d8 at step 5 (hide `textbox "Tag Name"`). Each
 * stop was judged harmless — the recovery finished the step and changed
 * nothing — so neither was ever a strike, both stayed provisional, and both
 * compiled into specs that threw at that very gate. Here: the replay names
 * the gate that stopped it (stopGate), the store relaxes it when the stop was
 * harmless and the evidence reaches (relaxExpectation), counts consecutive
 * stops (stopStreak), and the compile refuses a pin that has not replayed
 * clean since its last stop (unproven-pin).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { afterAll, describe, expect, it } from 'vitest';
import type { Flow } from '../src/skills/flow.js';
import { replaySkill, type StopGate } from '../src/skills/replay.js';
import { SkillStore, type Skill, type SkillStep } from '../src/skills/store.js';
import { flowToSpec } from '../src/spec/ir.js';
import { compileFlow } from '../src/spec/index.js';
import { documentOf, isObserveArg } from './fixture/observation.js';

process.env.SITELOOPER_RESOLVE_WAIT_MS = '0';

const ORIGIN = 'http://127.0.0.1:8055';
const LIST = `${ORIGIN}/admin/content/tickets`;
const ITEM = `${ORIGIN}/admin/content/tickets/7`;

/** A page whose locators resolve to one element and whose live look shows `lines`. */
function fakePage(state: { url: string; lines: string[] }): Page {
  const loc = () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) });
  return {
    url: () => state.url,
    async goto() {},
    async content() {
      return '<html></html>';
    },
    async evaluate(_fn: unknown, arg: unknown) {
      return isObserveArg(arg) ? documentOf(state.lines) : '';
    },
    async waitForLoadState() {},
    getByRole: loc,
    locator: loc,
  } as unknown as Page;
}

function skillOf(steps: SkillStep[], extra: Partial<Skill> = {}): Skill {
  return {
    id: 's_2731b5',
    origin: ORIGIN,
    template: 'set the ticket status',
    params: {},
    preconditions: { urlPattern: LIST },
    steps,
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'provisional',
    provenance: { session: 's', instruction: 'i', created: 't' },
    ...extra,
  };
}

function clickStep(name: string, expect?: SkillStep['expect']): SkillStep {
  return {
    tool: 'click',
    args: { target: `role=button[name="${name}"]` },
    locators: { target: [{ kind: 'role', role: 'button', name }] as SkillStep['locators']['target'] },
    ...(expect ? { expect: { lineDialect: 2, ...expect } } : {}),
  };
}

/** Replay `skill`; each click moves the url to `lands` and leaves `after` on the page. */
async function replay(skill: Skill, after: string[], lands = LIST, params: Record<string, string> = {}) {
  const state = { url: LIST, lines: after };
  return replaySkill(skill, params, {
    page: fakePage(state),
    exec: async () => {
      state.url = lands;
      return { result: 'clicked', settled: true, diff: { url: lands, alerts: [], added: [] } };
    },
  });
}

describe('stopGate: which expectation stopped the replay', () => {
  it('names a hide stop by its recorded lines (hsbs2 s_7db6d8/5)', async () => {
    const step = clickStep('Save', { removedContains: ['- textbox "Tag Name"'] });
    const res = await replay(skillOf([clickStep('Open'), step]), ['- textbox "Tag Name"']);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/still shows/);
    expect(res.stopGate).toEqual({ skill: 's_2731b5', step: 2, kind: 'hide', line: '- textbox "Tag Name"', lines: ['- textbox "Tag Name"'] });
  });

  it('names a url stop by its stored pattern', async () => {
    const res = await replay(skillOf([clickStep('Clear', { urlPattern: `${LIST}?search={{v1}}` })]), [], LIST, { v1: 'Seed' });
    expect(res.ok).toBe(false);
    expect(res.stopGate).toEqual({ skill: 's_2731b5', step: 1, kind: 'url', pattern: `${LIST}?search={{v1}}` });
  });

  it('names a plain added-change stop by the plain lines, never the hard ones', async () => {
    const step = clickStep('Save', { addedContains: ['- button "Saved just now"', '- heading "{{v1}}"'] });
    const res = await replay(skillOf([step]), ['- heading "Ticket 7"'], LIST, { v1: 'Ticket 7' });
    expect(res.ok).toBe(false);
    expect(res.stopGate).toMatchObject({ kind: 'added', line: '- button "Saved just now"', lines: ['- button "Saved just now"'] });
  });

  it('names a hard added-change stop by its slotted line, which no relaxation will touch', async () => {
    const step = clickStep('Save', { addedContains: ['- heading "{{v1}}"'] });
    const res = await replay(skillOf([step]), ['- heading "Another"'], LIST, { v1: 'Ticket 7' });
    expect(res.ok).toBe(false);
    expect(res.stopGate).toMatchObject({ kind: 'added', line: '- heading "{{v1}}"' });
  });

  it('carries none on a clean replay, or on a stop that is not an expectation', async () => {
    const clean = await replay(skillOf([clickStep('Save', { urlPattern: ITEM })]), [], ITEM);
    expect(clean.ok).toBe(true);
    expect(clean.stopGate).toBeUndefined();
    // A locator miss: no element resolves, nothing an expectation said.
    const state = { url: LIST, lines: [] as string[] };
    const none = () => ({ count: async () => 0, first: () => ({ textContent: async () => '' }) });
    const page = Object.assign(fakePage(state), { getByRole: none, locator: none }) as unknown as Page;
    const miss = await replaySkill(skillOf([clickStep('Save', { urlPattern: ITEM })]), {}, { page, exec: async () => ({ result: 'clicked', settled: true }) });
    expect(miss.ok).toBe(false);
    expect(miss.stopGate).toBeUndefined();
  });
});

describe('stopStreak: consecutive stops since the last full replay', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-streak-'));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('counts every stop, harmless or strike, and a full replay ends it', () => {
    const store = new SkillStore(tmp);
    const s = skillOf([clickStep('Open'), clickStep('Save')], { id: 's_aaaaa1' });
    store.put(s);
    expect(store.get(s.id)!.stats.stopStreak).toBeUndefined();
    let got = store.recordOutcome(s.id, { ok: false, failedAt: 2, instructionSucceeded: true, harmlessStop: true })!;
    expect(got.stats.stopStreak).toBe(1);
    expect(got.stats.lastStopAt).toBe(2);
    expect(got.stats.harmlessStops).toBe(1);
    expect(got.status).toBe('provisional');
    got = store.recordOutcome(s.id, { ok: false, failedAt: 1, instructionSucceeded: false })!;
    expect(got.stats.stopStreak).toBe(2);
    expect(got.stats.lastStopAt).toBe(1);
    got = store.recordOutcome(s.id, { ok: true, instructionSucceeded: true, unobserved: 1 })!;
    expect(got.stats.stopStreak).toBe(0);
  });
});

describe('relaxExpectation: a harmless stop corrects the gate it stopped on', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-relax-'));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
  let n = 0;
  const fresh = (steps: SkillStep[], extra: Partial<Skill> = {}) => {
    const store = new SkillStore(path.join(tmp, String(n++)));
    const s = skillOf(steps, { stats: { uses: 3, successes: 1, partial: 2, created: 't', failedAtStep: { '2': 2 }, fallthroughs: 0, stopStreak: 2, verifiedContract: 3 }, ...extra });
    store.put(s);
    return { store, s };
  };
  const HIDE = '- button "Oct 5 {{*}} PM Edited by Admin User"';

  it('drops the hide lines, says so, gives up validation and restarts the streak (hsdx1 s_2731b5/4)', () => {
    const { store, s } = fresh([clickStep('Open'), clickStep('Save', { removedContains: [HIDE, '- status "Saving"'] })]);
    const gate: StopGate = { skill: s.id, step: 2, kind: 'hide', line: HIDE, lines: [HIDE] };
    const out = store.relaxExpectation(s.id, gate, '2026-10-06T00:00:00Z')!;
    expect(out).not.toBeNull();
    expect(out.steps[1].expect?.removedContains).toEqual(['- status "Saving"']);
    expect(out.stats.stopStreak).toBe(0);
    expect(out.stats.relaxations).toBe(1);
    expect(out.stats.verifiedContract).toBeUndefined();
    expect(out.provenance.contractChanges).toEqual([
      { at: '2026-10-06T00:00:00Z', by: 'harmless-stop relaxation', gave: [expect.stringContaining(`step 2 no longer requires its click to take ${JSON.stringify(HIDE)} off the page`)] },
    ]);
    // Persisted, and a second identical relaxation finds nothing to drop.
    expect(store.get(s.id)!.steps[1].expect?.removedContains).toEqual(['- status "Saving"']);
    expect(store.relaxExpectation(s.id, gate)).toBeNull();
  });

  it('deletes a url pattern, and the whole expectation when nothing else is left', () => {
    const pattern = `${LIST}?search=Seed`;
    const { store, s } = fresh([clickStep('Clear', { urlPattern: pattern })]);
    const out = store.relaxExpectation(s.id, { skill: s.id, step: 1, kind: 'url', pattern })!;
    expect(out.steps[0].expect).toBeUndefined();
    expect(out.provenance.contractChanges![0].gave[0]).toContain(`no longer requires the url to match ${JSON.stringify(pattern)}`);
  });

  it('drops added lines', () => {
    const { store, s } = fresh([clickStep('Save', { addedContains: ['- button "Saved just now"', '- heading "Ticket"'] })]);
    const out = store.relaxExpectation(s.id, { skill: s.id, step: 1, kind: 'added', line: '- button "Saved just now"', lines: ['- button "Saved just now"'] })!;
    expect(out.steps[0].expect?.addedContains).toEqual(['- heading "Ticket"']);
  });

  describe('refuses, changing nothing, where the evidence does not reach', () => {
    const refused = (steps: SkillStep[], gate: Omit<StopGate, 'skill'>, extra: Partial<Skill> = {}) => {
      const { store, s } = fresh(steps, extra);
      const before = JSON.stringify(store.get(s.id));
      expect(store.relaxExpectation(s.id, { skill: s.id, ...gate })).toBeNull();
      expect(JSON.stringify(store.get(s.id))).toBe(before);
    };
    const hide = (extra: Partial<SkillStep> = {}, expect: SkillStep['expect'] = {}) => ({ ...clickStep('Save', { removedContains: ['- textbox "Tag Name"'], ...expect }), ...extra });
    const gate = { step: 1, kind: 'hide' as const, line: '- textbox "Tag Name"', lines: ['- textbox "Tag Name"'] };

    it('an assertion procedure, or an assertion step', () => {
      refused([hide()], gate, { assert: true });
      refused([hide({ assert: { message: 'the tag is gone' } })], gate);
    });
    it('a required removal', () => refused([hide({}, { removalRequired: true })], gate));
    it('a step with a page effect', () => refused([hide({ effect: { kind: 'popup' } })], gate));
    it('a line or pattern carrying a slot marker', () => {
      refused([clickStep('Save', { removedContains: ['- textbox "{{v1}}"'] })], { step: 1, kind: 'hide', line: '- textbox "{{v1}}"', lines: ['- textbox "{{v1}}"'] });
      refused([clickStep('Save', { addedContains: ['- heading "{{v1}}"'] })], { step: 1, kind: 'added', line: '- heading "{{v1}}"', lines: ['- heading "{{v1}}"'] });
      refused([clickStep('Save', { urlPattern: `${LIST}/{{d1}}` })], { step: 1, kind: 'url', pattern: `${LIST}/{{d1}}` });
      refused([clickStep('Clear', { urlPattern: `${LIST}?search={{v1}}` })], { step: 1, kind: 'url', pattern: `${LIST}?search={{v1}}` });
    });
    it('a url stop at a step that mints', () => refused([{ ...clickStep('Create', { urlPattern: ITEM }), mints: { at: 'p4' } }], { step: 1, kind: 'url', pattern: ITEM }));
    it('a line or pattern no longer there', () => {
      refused([hide()], { ...gate, line: '- textbox "Other"', lines: ['- textbox "Other"'] });
      refused([clickStep('Save', { urlPattern: ITEM })], { step: 1, kind: 'url', pattern: LIST });
      refused([hide()], { ...gate, step: 3 });
    });
    it('a gate naming another procedure', () => {
      const { store, s } = fresh([hide()]);
      expect(store.relaxExpectation(s.id, { skill: 's_other', ...gate })).toBeNull();
    });
  });
});

describe('unproven-pin: compile refuses a pin that has not replayed clean since it stopped', () => {
  const FWOD34 = path.resolve('bench/results-published/fwod34.json');
  const FWOD34_SKILLS = path.resolve('bench/results-published/fwod34-skills');
  const flow = JSON.parse(fs.readFileSync(FWOD34, 'utf8')) as Flow;
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });
  const storeWith = (id: string, stats: Partial<Skill['stats']>, opts: { undemote?: boolean } = {}) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-unproven-'));
    dirs.push(dir);
    fs.cpSync(FWOD34_SKILLS, dir, { recursive: true });
    const s = new SkillStore(dir);
    const skill = s.get(id)!;
    s.put({ ...skill, stats: { ...skill.stats, ...stats } });
    // fwod34's 08-open pin is demoted, which refuses the compile on its own.
    if (opts.undemote) {
      const d = s.get('s_c86522')!;
      s.put({ ...d, status: 'provisional', stats: { ...d.stats, failedAtStep: {}, lastFailedAt: undefined } });
    }
    return new SkillStore(dir);
  };

  it('names the step and its stop, as an error with the rerecord fix', () => {
    const store = storeWith('s_d654ba', { stopStreak: 2, lastStopAt: 4, failedAtStep: { '4': 2 }, harmlessStops: 2, recoveredStops: 2 });
    const d = flowToSpec(flow, store, { flowFile: FWOD34 }).diagnostics.find((x) => x.code === 'unproven-pin');
    expect(d).toMatchObject({ step: '03-open', severity: 'error', fix: `sitelooper rerecord ${FWOD34} 03-open` });
    expect(d!.what).toBe('its pinned procedure s_d654ba stopped at step 4 on its latest replay and has not replayed clean since — a compiled spec would stop there');
    expect(d!.why).toContain('the last 2 replay(s) all stopped');
    expect(d!.why).toContain('2 were judged harmless');
    expect(d!.action).toBeDefined();
  });

  it('says nothing for a streak of 0, or a store that predates the streak', () => {
    const codes = (store: SkillStore) => flowToSpec(flow, store, { flowFile: FWOD34 }).diagnostics.filter((x) => x.code === 'unproven-pin');
    expect(codes(storeWith('s_d654ba', { stopStreak: 0 }))).toEqual([]);
    expect(codes(new SkillStore(FWOD34_SKILLS))).toEqual([]);
  });

  it('is not said twice for a pin already reported demoted', () => {
    const store = storeWith('s_c86522', { stopStreak: 3 });
    const ds = flowToSpec(flow, store, { flowFile: FWOD34 }).diagnostics.filter((x) => x.step === '08-open');
    expect(ds.map((x) => x.code)).toContain('demoted-pin');
    expect(ds.map((x) => x.code)).not.toContain('unproven-pin');
  });

  it('refuses the compile; --allow-demoted admits it', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-unproven-out-'));
    dirs.push(out);
    // The control: with 08-open's demotion cleared and no streak, it compiles.
    expect(compileFlow(FWOD34, { store: storeWith('s_d654ba', {}, { undemote: true }), outDir: path.join(out, 'c') }).refused).toBe(false);
    const store = storeWith('s_d654ba', { stopStreak: 1, lastStopAt: 2 }, { undemote: true });
    const refused = compileFlow(FWOD34, { store, outDir: path.join(out, 'a') });
    expect(refused.refused).toBe(true);
    expect(refused.diagnostics.filter((x) => x.severity === 'error').map((x) => x.code)).toEqual(['unproven-pin']);
    const allowed = compileFlow(FWOD34, { store, outDir: path.join(out, 'b'), allowDemoted: true });
    expect(allowed.refused).toBe(false);
  });
});
