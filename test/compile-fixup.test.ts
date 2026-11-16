/**
 * Declared fix-ups through compile (execution/fixup.ts, Part K): a recorded
 * fix-up reaches the skill whole — its guard, then every step it guards,
 * inside one segment — or it is dissolved into the ordinary steps compile
 * made of it before fix-ups existed, with a `dissolveFixup` note saying why.
 * Never a half-conditional group. erpnext fwen10-fr is the run behind it: a
 * repair (tick row 2, Delete, Save) compiled as unconditional steps deleted a
 * real row on every replay that had no duplicate to remove.
 */
import { describe, expect, it } from 'vitest';
import type { LocatorExpr, RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills, sameProcedure } from '../src/skills/compile.js';
import { malformedFixups, wellFormedFixup } from '../src/execution/fixup.js';
import type { Skill, SkillStep } from '../src/skills/store.js';

const ORIGIN = 'http://127.0.0.1:8100';
const FORM = `${ORIGIN}/app/sales-order/SO-0042`;
const REPORT = { status: 'success' as const, summary: 'submitted', evidence: { values: {} } };
const NOW = '2026-11-11T00:00:00.000Z';

function role(r: string, name: string): Record<string, LocatorExpr> {
  return { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: r, name }] } };
}

function click(name: string, extra: Partial<RecordedStep> = {}): RecordedStep {
  return { k: 'step', tool: 'click', args: { target: '@e1' }, locators: role('button', name), ...extra };
}

/** A per-record control (testid `del-<id>`): two of them in a row are a loop foldLoops folds. */
function del(id: string, extra: Partial<RecordedStep> = {}): RecordedStep {
  return { k: 'step', tool: 'click', args: { target: '@e9' }, locators: { target: { expr: 'x', verified: true, raw: '@e9', chain: [{ kind: 'testid', attr: 'data-testid', value: `del-${id}` }] } }, ...extra };
}

/** The guard the `fixup` tool records: a wait_for carrying `guard`. */
function guard(id = 'g1', reason = 'order has the Widget row twice'): RecordedStep {
  return {
    k: 'step',
    tool: 'wait_for',
    args: { target: '@e5', state: 'count', count: 2, timeout_ms: 3000 },
    locators: role('link', 'Widget'),
    guard: { id, reason },
  };
}

function compile(steps: RecordedStep[], opts: { instruction?: string; assert?: boolean; url?: string } = {}): Skill[] {
  const instruction = opts.instruction ?? 'submit the sales order';
  const entries: RecordedEntry[] = [{ k: 'instruction', text: instruction, url: opts.url ?? FORM, ...(opts.assert ? { assert: true } : {}) }, ...steps];
  return compileSkills({ entries, instruction, report: REPORT, session: 't', now: NOW });
}

/** The same recording as it would be without the fix-up: no guard step, no markers. */
function plain(steps: RecordedStep[]): RecordedStep[] {
  return steps.filter((s) => !s.guard).map(({ guarded: _g, guardEnd: _e, ...s }) => s);
}

/** Skills with their transform notes left out, for comparing procedures. */
function procedures(skills: Skill[]): unknown {
  return skills.map(({ provenance: { transforms: _t, ...provenance }, ...s }) => ({ ...s, provenance }));
}

function fixupFields(steps: SkillStep[]): unknown[] {
  const out: unknown[] = [];
  const visit = (list: SkillStep[]) =>
    list.forEach((s) => {
      if (s.guard || s.guarded !== undefined || s.guardEnd) out.push(s);
      if (s.body) visit(s.body);
    });
  visit(steps);
  return out;
}

function dissolvedNotes(skills: Skill[]): string[] {
  return skills.flatMap((s) => (s.provenance.transforms ?? []).filter((t) => t.name === 'dissolveFixup').map((t) => t.reason));
}

describe('compile: a well-formed fix-up', () => {
  const recording = [
    guard(),
    click('Row 2', { guarded: 'g1' }),
    click('Delete', { guarded: 'g1' }),
    click('Save', { guarded: 'g1', guardEnd: true }),
    click('Submit'),
  ];

  it('compiles to its guard and its guarded steps with the fields intact', () => {
    const skills = compile(recording);
    expect(skills).toHaveLength(1);
    const steps = skills[0].steps;
    expect(steps.map((s) => s.tool)).toEqual(['wait_for', 'click', 'click', 'click', 'click']);
    expect(steps[0].guard).toEqual({ id: 'g1', reason: 'order has the Widget row twice' });
    expect(steps.slice(1, 4).map((s) => s.guarded)).toEqual(['g1', 'g1', 'g1']);
    expect(steps.map((s) => s.guardEnd ?? null)).toEqual([null, null, null, true, null]);
    expect(steps[4].guarded).toBeUndefined();
    expect(wellFormedFixup(steps, 0)).toBe(true);
    expect(malformedFixups(steps)).toEqual([]);
    expect(dissolvedNotes(skills)).toEqual([]);
  });

  it('keeps the guard a bare check: its locators and wait args, no timeout_ms, nothing an action carries', () => {
    const [skill] = compile(recording);
    const g = skill.steps[0];
    expect(g.args).toEqual({ target: '@e5', state: 'count', count: 2 });
    expect(g.locators.target).toEqual([{ kind: 'role', role: 'link', name: 'Widget' }]);
    for (const key of ['expect', 'movedAfterMs', 'mints', 'label', 'effect', 'toggle', 'repeatIfNoEffect', 'guarded', 'guardEnd'] as const) expect(g[key]).toBeUndefined();
  });

  it('slots the run values in its reason, as an assertion message is slotted', () => {
    const steps = [
      { k: 'step', tool: 'fill', args: { target: '@e2', value: 'SO-0042' }, locators: role('textbox', 'Search') } as RecordedStep,
      guard('g1', 'SO-0042 has the Widget row twice'),
      click('Delete', { guarded: 'g1', guardEnd: true }),
    ];
    const [skill] = compile(steps, { instruction: 'submit order SO-0042' });
    const g = skill.steps.find((s) => s.guard)!;
    expect(g.guard!.reason).not.toContain('SO-0042');
    expect(g.guard!.reason).toMatch(/^\{\{v\d+\}\} has the Widget row twice$/);
  });

  it('is never the same procedure as the same steps run unconditionally', () => {
    const [fixed] = compile(recording);
    const [unconditional] = compile([{ ...guard(), guard: undefined }, ...plain(recording)]);
    expect(unconditional.steps).toHaveLength(fixed.steps.length);
    expect(sameProcedure(fixed, unconditional)).toBe(false);
    expect(sameProcedure(fixed, structuredClone(fixed))).toBe(true);
  });
});

describe('compile: a fix-up it cannot carry is dissolved', () => {
  it('dissolves a group with no guardEnd (the instruction ended first) into plain steps', () => {
    const recording = [guard(), click('Row 2', { guarded: 'g1' }), click('Delete', { guarded: 'g1' })];
    const skills = compile(recording);
    expect(skills.flatMap((s) => fixupFields(s.steps))).toEqual([]);
    expect(skills[0].steps.map((s) => s.tool)).toEqual(['click', 'click']);
    expect(procedures(skills)).toEqual(procedures(compile(plain(recording))));
    expect(dissolvedNotes(skills)).toEqual([expect.stringContaining('no guardEnd')]);
  });

  it('dissolves a group a page-template seam would split across two skills', () => {
    const recording = [
      guard(),
      click('Row 2', { guarded: 'g1' }),
      click('Open invoice', { guarded: 'g1', diff: { url: `${ORIGIN}/app/sales-invoice/SINV-7`, alerts: [], added: ['- heading "SINV-7"'] } }),
      click('Delete', { guarded: 'g1', guardEnd: true }),
    ];
    const skills = compile(recording);
    expect(skills).toHaveLength(2);
    expect(skills.flatMap((s) => fixupFields(s.steps))).toEqual([]);
    expect(skills.flatMap((s) => s.steps).some((s) => s.tool === 'wait_for')).toBe(false);
    expect(procedures(skills)).toEqual(procedures(compile(plain(recording))));
    expect(dissolvedNotes(skills)).toEqual([expect.stringContaining('page-template seam')]);
  });

  it('dissolves a fix-up whose guarded step would fold into a loop with the unguarded steps after it', () => {
    // Without the fix-up these three are one loop: a run that skipped the
    // repair would skip the first iteration's evidence the loop was folded on.
    const recording = [guard(), del('1', { guarded: 'g1', guardEnd: true }), del('2'), del('3')];
    const skills = compile(recording);
    expect(skills.flatMap((s) => fixupFields(s.steps))).toEqual([]);
    expect(procedures(skills)).toEqual(procedures(compile(plain(recording))));
    expect(skills[0].steps).toHaveLength(1);
    expect(skills[0].steps[0]).toMatchObject({ tool: 'loop', max: 3 });
    expect(dissolvedNotes(skills)).toEqual([expect.stringContaining('folded into a loop')]);
  });

  it('dissolves a fix-up whose removal changes how the steps around it compile', () => {
    // Without the repair between them, del-1 and del-2 are one loop; with it
    // they are two clicks. Compile does not judge which decisions a skipped
    // repair would make wrong: any the repair's steps changed dissolve it.
    const recording = [del('1'), guard(), click('Save', { guarded: 'g1', guardEnd: true }), del('2')];
    const skills = compile(recording);
    expect(skills.flatMap((s) => fixupFields(s.steps))).toEqual([]);
    expect(procedures(skills)).toEqual(procedures(compile(plain(recording))));
    expect(dissolvedNotes(skills)).toEqual([expect.stringContaining('compile differently without it')]);
  });

  it('dissolves every fix-up of an assertion, which keeps only its waits', () => {
    const recording = [guard(), click('Delete', { guarded: 'g1', guardEnd: true }), { k: 'step', tool: 'wait_for', args: { target: '@e3', state: 'visible' }, locators: role('heading', 'Submitted') } as RecordedStep];
    const skills = compile(recording, { assert: true });
    expect(skills.flatMap((s) => fixupFields(s.steps)).filter((s) => (s as SkillStep).guard || (s as SkillStep).guarded)).toEqual([]);
    expect(skills[0].steps.map((s) => s.tool)).toEqual(['wait_for']);
    expect(dissolvedNotes(skills)).toEqual([expect.stringContaining('assertion')]);
  });

  it('dissolves a guard that is not a wait_for, keeping its steps', () => {
    const recording = [{ ...click('Look'), guard: { id: 'g1', reason: 'x' } }, click('Delete', { guarded: 'g1', guardEnd: true })];
    const skills = compile(recording);
    expect(skills.flatMap((s) => fixupFields(s.steps))).toEqual([]);
    expect(skills[0].steps.map((s) => s.locators.target?.[0])).toEqual([{ kind: 'role', role: 'button', name: 'Delete' }]);
    expect(dissolvedNotes(skills)).toEqual([expect.stringContaining('not a wait_for')]);
  });

  it('dissolves a fix-up whose guarded step a pass merges into a neighbour', () => {
    // dropSupersededNavigation drops a goto the next step replaces: inside
    // the fix-up that would leave it a step short of what was recorded.
    const goto = (path: string, extra: Partial<RecordedStep> = {}): RecordedStep => ({ k: 'step', tool: 'goto', args: { url: `${ORIGIN}${path}` }, locators: {}, diff: { url: `${ORIGIN}${path}`, alerts: [], added: [] }, ...extra });
    const recording = [guard(), goto('/app/sales-order/SO-0042?x=1', { guarded: 'g1' }), goto('/app/sales-order/SO-0042?x=2', { guarded: 'g1', guardEnd: true }), click('Submit')];
    const skills = compile(recording);
    expect(skills.flatMap((s) => fixupFields(s.steps))).toEqual([]);
    expect(procedures(skills)).toEqual(procedures(compile(plain(recording))));
    expect(dissolvedNotes(skills)).toEqual([expect.stringContaining('dropped or merged')]);
  });
});

describe('compile: a fix-up beside a real loop', () => {
  it('leaves the per-record loop folded and the fix-up intact', () => {
    const recording = [guard(), click('Row 2', { guarded: 'g1' }), click('Save', { guarded: 'g1', guardEnd: true }), del('1'), del('2')];
    const [skill] = compile(recording);
    expect(skill.steps.map((s) => s.tool)).toEqual(['wait_for', 'click', 'click', 'loop']);
    expect(skill.steps[0].guard?.id).toBe('g1');
    expect(skill.steps.slice(1, 3).map((s) => [s.guarded, s.guardEnd ?? null])).toEqual([
      ['g1', null],
      ['g1', true],
    ]);
    expect(skill.steps[3]).toMatchObject({ tool: 'loop', max: 2 });
    expect(fixupFields(skill.steps[3].body!)).toEqual([]);
    expect(malformedFixups(skill.steps)).toEqual([]);
  });

  it('keeps a loop before the fix-up folded too', () => {
    const recording = [del('1'), del('2'), guard(), click('Save', { guarded: 'g1', guardEnd: true })];
    const [skill] = compile(recording);
    expect(skill.steps.map((s) => s.tool)).toEqual(['loop', 'wait_for', 'click']);
    expect(wellFormedFixup(skill.steps, 1)).toBe(true);
  });

  it('carries a guarded screenshot as dropped, closing the group on the last step that acts', () => {
    const recording = [guard(), click('Delete', { guarded: 'g1' }), { k: 'step', tool: 'screenshot', args: {}, locators: {}, guarded: 'g1', guardEnd: true } as RecordedStep, click('Submit')];
    const [skill] = compile(recording);
    expect(skill.steps.map((s) => [s.tool, s.guarded ?? null, s.guardEnd ?? null])).toEqual([
      ['wait_for', null, null],
      ['click', 'g1', true],
      ['click', null, null],
    ]);
  });
});
