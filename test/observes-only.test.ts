/**
 * Round 59, OpenProject fwop13 01-signin (n1 lines 11-16 verbatim, in
 * test/fixture/fwop13-n1-01-signin.jsonl with the rest of that instruction):
 * the agent clicked the Bench Project link, `read url` still said /projects,
 * it waited for the link, clicked it again (neither click recorded any
 * change), listed the tabs (`tabs {}`), and typed `goto /projects/bench-project`.
 * s_d1e9fe kept all six. On replay the first click DID navigate, and the
 * second was stranded on the project page: "stopped at step 4 — expected url
 * …/projects but browser is at …/projects/bench-project", on n2, on n3 and
 * in the compiled run (which has no recovery, so 02-create never ran).
 *
 * abandonedLinkClick (fwop6) exists for exactly this, and stepped over reads
 * and waits only: the tab listing ended its scan. One definition of "a step
 * that only looks" (observesOnly) now serves it and repeatOf, and a bare tab
 * listing is dropped at compile like a screenshot.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { compileSkills, dropSupersededNavigation, observesOnly } from '../src/skills/compile.js';
import { SkillStore, type Skill, type SkillStep } from '../src/skills/store.js';

const FIXTURE = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixture', 'fwop13-n1-01-signin.jsonl');
const entries = (): RecordedEntry[] =>
  fs
    .readFileSync(FIXTURE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);

function compiled(es: RecordedEntry[] = entries()): Skill[] {
  const head = es[0] as Extract<RecordedEntry, { k: 'instruction' }>;
  const report = es.find((e): e is Extract<RecordedEntry, { k: 'report' }> => e.k === 'report');
  return compileSkills({
    entries: es.filter((e) => e.k !== 'report'),
    instruction: head.text,
    report: { status: 'success', summary: report?.summary ?? '', evidence: { values: report?.values ?? {} } },
    session: 't',
    knownValues: { 'var:runid': 'fwop13-n1' },
  });
}

const BENCH = 'a[href="/projects/bench-project"]';
const isBenchClick = (s: SkillStep) => s.tool === 'click' && JSON.stringify(s.locators.target ?? []).includes(BENCH.replace(/"/g, '\\"'));

describe('fwop13 01-signin: link clicks the recording saw do nothing, replaced by a goto', () => {
  it('the fixture is n1 lines 11-16 as recorded', () => {
    const steps = entries().filter((e): e is Extract<RecordedEntry, { k: 'step' }> => e.k === 'step');
    const tail = steps.slice(steps.findIndex((s) => s.tool === 'click' && s.args.target === BENCH)).slice(0, 6);
    expect(tail.map((s) => s.tool)).toEqual(['click', 'read', 'wait_for', 'click', 'tabs', 'goto']);
    expect(tail[0].diff?.added).toEqual([]);
    expect(tail[3].diff?.added).toEqual([]);
    expect(tail[4].args).toEqual({});
  });

  it('compiles to the goto, with neither inert click and no tab listing', () => {
    const skills = compiled();
    const steps = skills.flatMap((s) => s.steps);
    expect(steps.filter(isBenchClick)).toEqual([]);
    expect(steps.some((s) => s.tool === 'tabs')).toBe(false);
    expect(steps.some((s) => s.tool === 'goto' && s.args.url === 'http://127.0.0.1:8090/projects/bench-project')).toBe(true);
  });

  it('abandonedLinkClick steps over a tab listing that survives to the skill steps (observesOnly)', () => {
    const link = [{ kind: 'css' as const, selector: BENCH }, { kind: 'role' as const, role: 'link', name: 'Bench Project' }];
    const PROJECTS = 'http://127.0.0.1:8090/projects';
    const click = (): SkillStep => ({ tool: 'click', args: { target: BENCH }, locators: { target: link }, expect: { urlPattern: PROJECTS } });
    const steps: SkillStep[] = [
      click(),
      { tool: 'read', args: { what: 'url' }, locators: {}, label: 'current_url' },
      { tool: 'wait_for', args: { target: BENCH, state: 'visible' }, locators: { target: link } },
      click(),
      { tool: 'tabs', args: {}, locators: {} },
      { tool: 'goto', args: { url: `${PROJECTS}/bench-project` }, locators: {} },
    ];
    const out = dropSupersededNavigation(steps, []);
    expect(out.map((s) => s.tool)).toEqual(['read', 'wait_for', 'tabs', 'goto']);
  });

  it('observesOnly: reads, waits and a bare tab listing; never a tab switch or a gesture', () => {
    const s = (tool: string, args: Record<string, unknown> = {}): SkillStep => ({ tool, args, locators: {} });
    expect(observesOnly(s('read'))).toBe(true);
    expect(observesOnly(s('read_all'))).toBe(true);
    expect(observesOnly(s('wait_for', { state: 'visible' }))).toBe(true);
    expect(observesOnly(s('tabs'))).toBe(true);
    expect(observesOnly(s('tabs', { switch_to: 1 }))).toBe(false);
    expect(observesOnly(s('click'))).toBe(false);
    expect(observesOnly(s('press', { key: 'Escape' }))).toBe(false);
    expect(observesOnly(s('goto', { url: 'x' }))).toBe(false);
  });
});

/**
 * Why s_d1e9fe stayed provisional with failedAtStep {4: 2}. Published stats:
 * uses 3, successes 1, partial 2, recoveredStops 2, harmlessStops 1,
 * lastFailedAt 4. One of the two stops was HARMLESS (recordOutcome's middle
 * branch, fwod49): n3's recovery only clicked "Work packages" and read, a
 * navigation that observedChange does not count (fwod51), so the stop was
 * neither a strike nor a forgiveness. n2's recovery activated and cleared a
 * filter (s_f8971d: Activate Filter, Delete), a costly repair, so its stop was
 * the one strike. One strike never demotes. fwsi10's s_6cdda3 took two
 * costly stops at step 7 (no harmlessStops) and demoted. Accounting as
 * designed, not a lastFailedAt reset and not chain-member bookkeeping.
 */
describe('fwop13 s_d1e9fe: a strike and a harmless stop at the same step do not demote', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-r59-'));
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const fresh = (id: string, steps: number): Skill => ({
    id,
    origin: 'http://127.0.0.1:8090',
    template: 't',
    params: {},
    preconditions: { urlPattern: 'http://127.0.0.1:8090/projects' },
    steps: Array.from({ length: steps }, () => ({ tool: 'click', args: { target: '@e1' }, locators: {} })),
    stats: { uses: 0, successes: 0, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'provisional',
    provenance: { session: 's', instruction: 't', created: 't' },
  });

  it('reproduces the published stats: n1 success, n2 costly stop at 4, n3 harmless stop at 4', () => {
    const store = new SkillStore(path.join(tmp, 'op'));
    store.put(fresh('s_d1e9fe', 6));
    store.recordOutcome('s_d1e9fe', { ok: true, instructionSucceeded: true });
    store.recordOutcome('s_d1e9fe', { ok: false, failedAt: 4, instructionSucceeded: true });
    store.recordOutcome('s_d1e9fe', { ok: false, failedAt: 4, instructionSucceeded: true, harmlessStop: true });
    const s = store.get('s_d1e9fe')!;
    expect(s.status).toBe('provisional');
    expect(s.stats).toMatchObject({ uses: 3, successes: 1, partial: 2, failedAtStep: { '4': 2 }, recoveredStops: 2, harmlessStops: 1, lastFailedAt: 4 });
  });

  it("fwsi10's s_6cdda3: two costly stops at step 7 demote, as they did", () => {
    const store = new SkillStore(path.join(tmp, 'si'));
    store.put(fresh('s_6cdda3', 15));
    store.recordOutcome('s_6cdda3', { ok: true, instructionSucceeded: true });
    store.recordOutcome('s_6cdda3', { ok: false, failedAt: 7, instructionSucceeded: true });
    store.recordOutcome('s_6cdda3', { ok: false, failedAt: 7, instructionSucceeded: true });
    const s = store.get('s_6cdda3')!;
    expect(s.status).toBe('demoted');
    expect(s.stats).toMatchObject({ uses: 3, successes: 1, partial: 2, failedAtStep: { '7': 2 }, recoveredStops: 2, lastFailedAt: 7 });
    expect(s.stats.harmlessStops).toBeUndefined();
  });
});
