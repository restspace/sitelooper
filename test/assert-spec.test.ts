/**
 * `sitelooper assert` in the compiled artifact (notes/CONTRACT-assert.md,
 * "Failure policy" and "Compiled spec").
 *
 * An assertion is a recorded `wait_for` carrying `assert: { message }`. The
 * emitter writes it as the wait it is — same chain, same shared resolution
 * policy, same first-match dispatch, same timeout — and changes only what a
 * miss means: the generated code throws the shared assertFailure
 * (src/execution/assert.ts, embedded), 'unlocatable' when no recorded locator
 * resolved and 'failed' when the condition did not hold, and no skip,
 * satisfied or detour path is emitted around it.
 *
 * Text assertions pin the emitted statements; the "runs" block compiles the
 * emitted module and drives its step function against a fake page, so what is
 * asserted about the thrown message is what the ARTIFACT throws, not what the
 * emitter's text looks like.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Flow } from '../src/skills/flow.js';
import { SkillStore, type Skill, type SkillStep } from '../src/skills/store.js';
import { assertFailure, assertFailureKind } from '../src/execution/assert.js';
import { assertMiss, verdictFor } from '../src/spec/check.js';
import { emitFlowFile, emitSpecFile } from '../src/spec/emit.js';
import { assertionCounts, flowToSpec, type SpecFlow, type SpecSegment, type SpecStep } from '../src/spec/ir.js';
import { LiftError, liftFlowFile } from '../src/spec/lift.js';
import { specToFlow } from '../src/spec/lower.js';
import { runReadinessCheck } from '../src/spec/readiness.js';
import { EXECUTION_MODULES, executionClosure } from '../src/spec/runtime-source.js';

const ORIGIN = 'http://app.test';
const MESSAGE = 'the ticket list shows {{v1}} with status Open';
const STATUS = [{ kind: 'testid' as const, attr: 'data-testid', value: 'status' }, { kind: 'role' as const, role: 'status', name: 'Ticket status' }];

/** One check of an assertion: a wait_for carrying the caller's sentence. */
const check = (args: Record<string, unknown>, target: SkillStep['locators']['target'] | null = STATUS, message = MESSAGE): SkillStep => ({
  tool: 'wait_for',
  args: { ...(target ? { target: '@e1' } : {}), ...args },
  locators: target ? { target } : {},
  assert: { message },
});

const segmentOf = (steps: SkillStep[], extra: Partial<SpecSegment> = {}): SpecSegment => ({
  id: 's_assert',
  template: MESSAGE,
  params: { v1: { example: 'demo Test', usedIn: [1], known: true } },
  preconditions: { urlPattern: `${ORIGIN}/tickets` },
  steps,
  assert: true,
  ...extra,
});

const stepOf = (steps: SkillStep[], extra: Partial<SpecStep> = {}, segment: Partial<SpecSegment> = {}): SpecStep => ({
  id: '02-assert',
  instruction: 'the ticket list shows {{name}} with status Open',
  params: { v1: '{{name}}' },
  outputs: [],
  segments: [segmentOf(steps, segment)],
  kind: 'assert',
  ...extra,
});

const flowOf = (...steps: SpecStep[]): SpecFlow => ({ version: 1, name: 'asserts', origin: ORIGIN, startUrl: `${ORIGIN}/tickets`, vars: ['name'], steps });

const emit = (spec: SpecFlow) => emitFlowFile(spec, { tier: 'plain' });

/** Just the emitted step bodies, without the shared modules and helpers embedded ahead of them. */
const stepBodies = (source: string): string => source.slice(source.indexOf('export const steps = {'), source.indexOf('/** Runs every step in order.'));

/** Every emitted statement of the step bodies, trimmed of indentation: order is the contract, columns are layout. */
const statements = (source: string): string[] => stepBodies(source).split('\n').map((l) => l.trim());

function syntaxErrors(source: string): string[] {
  const out = ts.transpileModule(source, { fileName: 'flow.ts', reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return (out.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
}

/** Every recorded state, as a check of one assertion step. */
const SEVEN: Record<string, SkillStep> = {
  visible: check({ state: 'visible' }),
  hidden: check({ state: 'hidden' }),
  text_equals: check({ state: 'text_equals', text: 'Open' }),
  text_contains: check({ state: 'text_contains', text: '{{v1}}' }),
  count: check({ state: 'count', count: 3 }),
  value_equals: check({ state: 'value_equals', text: '{{v1}}', timeout_ms: 4000 }),
  url_contains: check({ state: 'url_contains', text: '/tickets' }, null),
};

describe('assert: emitted code for each state', () => {
  const source = emit(flowOf(stepOf(Object.values(SEVEN)))).source;
  const lines = statements(source);
  const miss = (kind: 'failed' | 'unlocatable') => `assertMissed('${kind}', \`the ticket list shows \${p.v1} with status Open\`, err)`;

  it('is real TypeScript and raises no diagnostic', () => {
    expect(syntaxErrors(source)).toEqual([]);
    expect(emit(flowOf(stepOf(Object.values(SEVEN)))).diagnostics).toEqual([]);
  });

  it('visible: the wait as today, on the first match, its miss raised as failed', () => {
    const at = lines.indexOf('await expect(hit1.locator.first()).toBeVisible();');
    expect(at).toBeGreaterThan(0);
    expect(lines.slice(at - 1, at + 4)).toEqual(['try {', 'await expect(hit1.locator.first()).toBeVisible();', '} catch (err) {', `${miss('failed')};`, '}']);
  });

  it('every target resolves through the shared policy, and a chain that resolves nothing is unlocatable', () => {
    // same chain, same policy inputs, same drift sink as any other wait…
    expect(stepBodies(source)).toContain("const hit1 = await pick(page, [");
    expect(stepBodies(source)).toContain(`], '02-assert s_assert/1 target', { allowMultiple: true, stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, { drift: run.drift }).catch((err: unknown) => ${miss('unlocatable')});`);
    // …for every state that has a target but the absence wait, which resolves with no wait.
    expect(lines.filter((l) => l.includes(`.catch((err: unknown) => ${miss('unlocatable')});`))).toHaveLength(6);
  });

  it('hidden: absence is the condition, so nothing resolving passes and a target still there fails', () => {
    const at = lines.findIndex((l) => l.startsWith('const hit2 = await resolveTarget(page, ['));
    expect(at).toBeGreaterThan(0);
    const tail = lines.slice(at).slice(0, 12);
    expect(tail.find((l) => l.includes('waitMs: 0'))).toBe(
      `], '02-assert s_assert/2 target', { allowMultiple: true, stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: 0 }, { drift: run.drift }).catch((err: unknown) => ${miss('unlocatable')});`,
    );
    expect(lines.indexOf('if (hit2) {')).toBeGreaterThan(at);
    const wait = lines.indexOf('await expect(hit2.locator.first()).toBeHidden();');
    expect(lines.slice(wait - 2, wait + 4)).toEqual(['if (hit2) {', 'try {', 'await expect(hit2.locator.first()).toBeHidden();', '} catch (err) {', `${miss('failed')};`, '}']);
  });

  it('text_equals and text_contains: rendered text, the held-elsewhere rung as today, then failed', () => {
    const equals = lines.indexOf("await expect(hit3.locator.first()).toHaveText('Open', { useInnerText: true });");
    expect(lines.slice(equals - 2, equals + 6)).toEqual([
      'try {',
      'try {',
      "await expect(hit3.locator.first()).toHaveText('Open', { useInnerText: true });",
      '} catch (err) {',
      "await textHeldOrThrow(err, observations3, 'text_equals', 'Open', '02-assert s_assert/3', run.drift);",
      '}',
      '} catch (err) {',
      `${miss('failed')};`,
    ]);
    const contains = lines.indexOf('await expect(hit4.locator.first()).toContainText(`${p.v1}`, { useInnerText: true });');
    expect(lines.slice(contains + 1, contains + 6)).toEqual([
      '} catch (err) {',
      "await textHeldOrThrow(err, observations4, 'text_contains', `${p.v1}`, '02-assert s_assert/4', run.drift);",
      '}',
      '} catch (err) {',
      `${miss('failed')};`,
    ]);
  });

  it('count: the whole locator, plural by nature', () => {
    const at = lines.indexOf('await expect(hit5.locator).toHaveCount(3);');
    expect(lines.slice(at - 1, at + 3)).toEqual(['try {', 'await expect(hit5.locator).toHaveCount(3);', '} catch (err) {', `${miss('failed')};`]);
  });

  it('value_equals: the field value polled through the shared valueHolds, never toHaveValue', () => {
    const at = lines.indexOf('await expectValue(hit6.locator.first(), `${p.v1}`, 4000);');
    expect(lines.slice(at - 1, at + 3)).toEqual(['try {', 'await expectValue(hit6.locator.first(), `${p.v1}`, 4000);', '} catch (err) {', `${miss('failed')};`]);
    expect(source).toContain('async function expectValue(loc: Locator, want: string, timeout: number): Promise<void> {');
    expect(source).toContain('const value = await loc.inputValue({ timeout: 1_000 }).catch(() => null);');
    expect(source).toContain('return value !== null && valueHolds(value, want);');
    expect(source).not.toContain('toHaveValue(');
  });

  it('url_contains: no locator at all, the url polled through the shared urlHolds', () => {
    const at = lines.indexOf("await expectUrl(page, '/tickets', 10000);");
    expect(lines.slice(at - 1, at + 3)).toEqual(['try {', "await expectUrl(page, '/tickets', 10000);", '} catch (err) {', `${miss('failed')};`]);
    // nothing is resolved for it: the step before it took hit6, and there is no hit7
    expect(stepBodies(source)).not.toContain('hit7');
    const body = stepBodies(source);
    const stepAt = body.indexOf('// @step 02-assert s_assert/7');
    expect(body.slice(stepAt)).not.toContain('pick(');
    expect(source).toContain('return urlHolds(url, want);');
    expect(source).not.toContain('toHaveURL(');
  });

  it('fills the message from this run\'s params, as every other slotted string is filled', () => {
    // `{{v1}}` in the caller's sentence is the step's own `p.v1`, which the call site binds from the run var
    expect(source).toContain("await steps['02-assert'](page, { v1: vars.name }, outputs, run);");
    expect(stepBodies(source)).toContain("async '02-assert'(page: Page, p: { v1: string }, outputs: Outputs, run: FlowRun = createFlowRun()): Promise<void> {");
  });

  it('embeds the shared assert module, once, after the text rules it imports', () => {
    expect(EXECUTION_MODULES).toContain('assert');
    expect(executionClosure(['assert']).map((m) => m.name)).toEqual(['text', 'assert']);
    expect(source.split('// Shared execution source: assert.ts.').length).toBe(2);
    expect(source.indexOf('// Shared execution source: text.ts.')).toBeLessThan(source.indexOf('// Shared execution source: assert.ts.'));
    expect(source).toContain('function assertFailure(kind: AssertFailureKind, message: string, detail: string): string {');
    expect(source).toContain('function valueHolds(shown: string, want: string): boolean {');
    expect(source).toContain('function urlHolds(url: string, want: string): boolean {');
    // …and the one place the generated code raises a miss is that module's own message
    expect(source).toContain('throw new Error(assertFailure(kind, message, detail));');
    expect(source).not.toMatch(/^(?:import|export) .*assert\.js/m);
  });

  it('names the assertion in the generated module', () => {
    expect(source).toContain('export const assertStepIds = ["02-assert"] as const;');
    expect(stepBodies(source)).toContain('/** assert: the ticket list shows {{name}} with status Open */');
    expect(source).toContain("await test.step('02-assert: assert: the ticket list shows {{name}} with status Open', async () => {");
  });

  it('a flow with no assertion carries none of it', () => {
    const plain = emit(flowOf({ ...stepOf([{ tool: 'wait_for', args: { target: '@e1', state: 'visible' }, locators: { target: STATUS } }], { kind: undefined }, { assert: undefined }), id: '01-wait' })).source;
    expect(plain).not.toContain('assertMissed');
    expect(plain).not.toContain('assertStepIds');
    expect(plain).not.toContain('// Shared execution source: assert.ts.');
    expect(statements(plain)).toContain('await expect(hit1.locator.first()).toBeVisible();');
    expect(statements(plain)[statements(plain).indexOf('await expect(hit1.locator.first()).toBeVisible();') - 1]).not.toBe('try {');
  });
});

describe('assert: nothing skips, softens or satisfies it', () => {
  const dialogOpener: SkillStep = {
    tool: 'click',
    args: { target: '@e1' },
    locators: { target: [{ kind: 'role', role: 'button', name: 'Options' }] },
    expect: { addedContains: ['- dialog "Options"', '- button "Apply"'] },
  };

  it('emits no skip, satisfied, warn or detour path in an assertion step', () => {
    const body = stepBodies(emit(flowOf(stepOf(Object.values(SEVEN)))).source);
    expect(body).not.toContain("status: 'skipped'");
    expect(body).not.toContain('[sitelooper skip]');
    expect(body).not.toContain('[sitelooper warn]');
    expect(body).not.toContain('[sitelooper satisfied]');
    expect(body).not.toContain('satisfied(page');
    expect(body).not.toContain('detourGiven(');
    expect(body).not.toContain('logWarning(');
    expect(body).not.toContain('readOptional(');
  });

  it('no satisfied guard, even where the segment carries an identity and a goal', () => {
    const guarded = (kind: 'assert' | undefined, assert: true | undefined) =>
      emit(
        flowOf(
          stepOf(
            [kind ? SEVEN.visible : { tool: 'click', args: { target: '@e1' }, locators: { target: STATUS } }],
            { kind },
            { assert, preconditions: { urlPattern: `${ORIGIN}/tickets`, requireText: ['{{v1}}'] }, goal: { requireText: ['Open'] } },
          ),
        ),
      ).source;
    // the same segment as an ordinary step IS guarded: the fixture reaches the guard
    expect(stepBodies(guarded(undefined, undefined))).toContain('[sitelooper satisfied] 02-assert');
    expect(stepBodies(guarded('assert', true))).not.toContain('[sitelooper satisfied]');
    expect(stepBodies(guarded('assert', true))).not.toContain('await satisfied(');
  });

  it('an assertion segment is never passed over as a detour', () => {
    const goto: SkillStep = { tool: 'goto', args: { url: `${ORIGIN}/tickets` }, locators: {} };
    const seg = (id: string, steps: SkillStep[], extra: Partial<SpecSegment> = {}): SpecSegment => ({ id, template: MESSAGE, params: {}, preconditions: { urlPattern: `${ORIGIN}/tickets` }, steps, ...extra });
    const chain = (assert: true | undefined) =>
      emit(
        flowOf({
          id: '02-assert',
          instruction: 'the list is showing',
          params: {},
          outputs: [],
          segments: [seg('s_a', [goto]), seg('s_b', [assert ? check({ state: 'visible' }, STATUS, 'the list is showing') : goto], { detour: { asked: `${ORIGIN}/tickets` }, assert }), seg('s_c', [goto])],
        }),
      ).source;
    expect(stepBodies(chain(undefined))).toContain('detourGiven(');
    expect(stepBodies(chain(true))).not.toContain('detourGiven(');
  });

  it('a check after a dialog that did not open is not skipped as one of its controls', () => {
    const apply = [{ kind: 'role' as const, role: 'button', name: 'Apply' }];
    const ordinary: SkillStep = { tool: 'wait_for', args: { target: '@e2', state: 'visible' }, locators: { target: apply } };
    const body = (wait: SkillStep) =>
      stepBodies(emit(flowOf({ ...stepOf([dialogOpener, wait], { kind: undefined }, { assert: undefined }), id: '01-open' })).source);
    // an ordinary wait on the dialog's control consults the absent dialog…
    expect(body(ordinary)).toContain('await absentDialogSkip(');
    // …an assertion's check on the same control does not, and still clears the state
    const asserted = body({ ...ordinary, assert: { message: 'Apply is offered' } });
    expect(asserted).not.toContain('await absentDialogSkip(');
    expect(asserted).toContain("assertMissed('unlocatable', 'Apply is offered', err)");
    expect(asserted.split('absentDialog = null;').length).toBe(body(ordinary).split('absentDialog = null;').length);
  });

  it('a referenced expected value is needed, never blank and never the recorded stand-in', () => {
    const producer: SpecStep = {
      id: '01-create',
      instruction: 'create a ticket',
      params: {},
      outputs: ['ticket_title'],
      segments: [{ id: 's_create', template: 'create a ticket', params: {}, preconditions: { urlPattern: `${ORIGIN}/tickets` }, steps: [{ tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target: STATUS }, label: 'ticket_title' }] }],
    };
    // v1 is used by no locator and no typed value (usedIn: []): for an ordinary step that is a blank on a miss
    const consumer = (kind: 'assert' | undefined): SpecStep =>
      stepOf(
        [kind ? check({ state: 'text_contains', text: '{{v1}}' }) : { tool: 'wait_for', args: { target: '@e1', state: 'text_contains', text: '{{v1}}' }, locators: { target: STATUS } }],
        { kind, params: { v1: '{{01-create.ticket_title}}' } },
        { assert: kind ? true : undefined, params: { v1: { example: 'demo Test', usedIn: [] } } },
      );
    expect(emit(flowOf(producer, consumer(undefined))).source).toContain("{ v1: outputs['01-create.ticket_title'] ?? '' }");
    const strict = emit(flowOf(producer, consumer('assert'))).source;
    expect(strict).toContain("{ v1: need(outputs, '01-create.ticket_title', '02-assert') }");
    expect(strict).not.toContain('needShown(');
    expect(strict).not.toContain('shownOr(');
  });

  it('the scaffold spec is unchanged by an assertion', () => {
    const withAssert = flowOf(stepOf([SEVEN.visible]));
    const without: SpecFlow = { ...withAssert, steps: [{ ...stepOf([{ tool: 'wait_for', args: { target: '@e1', state: 'visible' }, locators: { target: STATUS } }], { kind: undefined }, { assert: undefined }) }] };
    expect(emitSpecFile(withAssert)).toBe(emitSpecFile(without));
  });
});

describe('assert: compile blockers', () => {
  const blocked = (step: SkillStep) => emit(flowOf(stepOf([step])));

  it('a check with no expressible locator is a blocker with a diagnostic, not a pass', () => {
    for (const state of ['visible', 'text_equals', 'count', 'value_equals']) {
      const out = blocked(check({ state, text: 'Open', count: 2 }, []));
      expect(out.diagnostics, state).toEqual([
        expect.objectContaining({ code: 'unsupported-capability', step: '02-assert', what: `(assertion: wait_for ${state}) has no locator a spec can express`, fix: expect.stringContaining('rerecord') }),
      ]);
      const body = stepBodies(out.source);
      // the TODO is what compilationBlockers refuses the flow on; the throw stops a run that gets here
      expect(body, state).toContain(`// TODO: no locator this compiler can express for the assertion's wait_for ${state} — re-record the assertion.`);
      expect(body, state).toContain(`throw new Error('Unsupported recorded locator: the assertion\\'s wait_for ${state} has no locator a standalone spec can express');`);
      // the finding sits above the step, where a reader of the file looks
      expect(body, state).toContain(`// warning 02-assert: (assertion: wait_for ${state}) has no locator a spec can express`);
    }
  });

  it('an absence check with an empty chain is a blocker too: "resolves nothing" must not read as the condition holding', () => {
    const out = blocked(check({ state: 'hidden' }, []));
    expect(out.diagnostics.map((d) => d.code)).toEqual(['unsupported-capability']);
    expect(stepBodies(out.source)).toContain("// TODO: no locator this compiler can express for the assertion's wait_for hidden — re-record the assertion.");
    // …where an ordinary absence wait keeps the comment-only form it has always had
    const ordinary = emit(flowOf({ ...stepOf([{ tool: 'wait_for', args: { target: '@e1', state: 'hidden' }, locators: { target: [] } }], { kind: undefined }, { assert: undefined }), id: '01-wait' }));
    expect(ordinary.diagnostics).toEqual([]);
  });

  it('a step that is not a check inside an assertion is refused', () => {
    const out = blocked({ tool: 'click', args: { target: '@e1' }, locators: { target: STATUS } });
    expect(out.diagnostics).toEqual([expect.objectContaining({ code: 'unsupported-capability', step: '02-assert', what: '(click) sits inside an assertion, which may only check' })]);
    const body = stepBodies(out.source);
    expect(body).toContain("throw new Error('Unsupported assertion step: click is not a check');");
    expect(body).not.toContain('await click(');
  });

  it('a slot the assertion names with no binding and no recorded value is an error, never a blank', () => {
    const out = emit(flowOf(stepOf([check({ state: 'text_contains', text: '{{v2}}' })])));
    expect(out.diagnostics).toEqual([expect.objectContaining({ code: 'unbound-slot', step: '02-assert', severity: 'error' })]);
    expect(out.source).not.toContain("v2: ''");
  });
});

describe('assert: IR, lowering, lifting', () => {
  let dir: string;
  let store: SkillStore;
  const skill = (extra: Partial<Skill> = {}): Skill => ({
    id: 's_assert',
    origin: ORIGIN,
    template: MESSAGE,
    params: { v1: { example: 'demo Test', usedIn: [1], known: true } },
    preconditions: { urlPattern: `${ORIGIN}/tickets`, requireText: ['{{v1}}'] },
    steps: [SEVEN.text_contains],
    assert: true,
    // an assertion carries neither, whatever its record holds
    goal: { requireText: ['Open'] },
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'validated',
    provenance: { session: 'assert', instruction: MESSAGE, created: 't' },
    ...extra,
  });
  const flow = (kind: 'assert' | undefined, warnings: string[] = []): Flow => ({
    name: 'asserts',
    origin: ORIGIN,
    startUrl: `${ORIGIN}/tickets`,
    vars: ['name'],
    steps: [{ id: '02-assert', instruction: 'the ticket list shows {{name}} with status Open', skill: 's_assert', params: { v1: '{{name}}' }, outputs: [], recorded: {}, ...(kind ? { kind } : {}) }],
    provenance: { session: 'assert', created: 't' },
    ...(warnings.length ? { warnings } : {}),
  });

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-assert-spec-'));
    store = new SkillStore(dir);
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('carries the step kind and the skill flag, and no goal', () => {
    store.put(skill());
    const { spec, diagnostics } = flowToSpec(flow('assert'), store);
    expect(diagnostics).toEqual([]);
    expect(spec.steps[0].kind).toBe('assert');
    expect(spec.steps[0].segments[0].assert).toBe(true);
    expect(spec.steps[0].segments[0].goal).toBeUndefined();
    expect(spec.steps[0].segments[0].steps[0].assert).toEqual({ message: MESSAGE });
    expect(assertionCounts(spec)).toEqual({ steps: 1, checks: 1 });
  });

  it('is never reported as a no-op step for changing nothing', () => {
    store.put(skill());
    const noop = 'noop-step: 02-assert changed nothing when it was recorded';
    expect(flowToSpec(flow('assert', [noop]), store).diagnostics).toEqual([]);
    // the same warning against an ordinary step is still reported
    store.put(skill({ assert: undefined, steps: [{ ...SEVEN.text_contains, assert: undefined }] }));
    expect(flowToSpec(flow(undefined, [noop]), store).diagnostics.map((d) => d.code)).toEqual(['noop-step']);
  });

  it('refuses a step and a procedure that disagree about being an assertion', () => {
    store.put(skill({ assert: undefined }));
    expect(flowToSpec(flow('assert'), store).diagnostics).toEqual([expect.objectContaining({ code: 'assert-procedure', step: '02-assert', severity: 'error' })]);
    store.put(skill());
    expect(flowToSpec(flow(undefined), store).diagnostics).toEqual([expect.objectContaining({ code: 'assert-procedure', step: '02-assert', severity: 'error' })]);
  });

  it('round-trips through the emitted FLOW and back down to a flow and its skill', () => {
    store.put(skill());
    const { spec } = flowToSpec(flow('assert'), store);
    const lifted = liftFlowFile(emit(spec).source).spec;
    expect(lifted).toEqual(spec);
    const lowered = specToFlow(lifted);
    expect(lowered.flow.steps[0].kind).toBe('assert');
    expect(lowered.skills[0].assert).toBe(true);
    expect(lowered.skills[0].steps[0].assert).toEqual({ message: MESSAGE });
    expect(lowered.skills[0].goal).toBeUndefined();
    // an ordinary step lowers with neither
    const ordinary = specToFlow(flowOf({ ...stepOf([SEVEN.visible], { kind: undefined }, { assert: undefined }) }));
    expect('kind' in ordinary.flow.steps[0]).toBe(false);
    expect('assert' in ordinary.skills[0]).toBe(false);
  });

  it('lift refuses a hand-edited assertion flag', () => {
    const source = emit(flowOf(stepOf([SEVEN.visible]))).source;
    expect(() => liftFlowFile(source.replace('"kind": "assert"', '"kind": "soft"'))).toThrow(LiftError);
    expect(() => liftFlowFile(source.replace('"assert": true', '"assert": false'))).toThrow(/"assert" must be true/);
    expect(() => liftFlowFile(source.replace(/"assert": \{\s*"message": "[^"]*"\s*\}/, '"assert": {}'))).toThrow(/"assert" must be \{ message: string \}/);
  });
});

describe('assert: readiness and check evidence', () => {
  it('readiness reports how many assertions the flow carries, without changing the outcome', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-assert-ready-'));
    try {
      const report = (spec: SpecFlow) => {
        const flowFile = path.join(dir, `${spec.name}.flow.ts`);
        fs.writeFileSync(flowFile, emit(spec).source);
        fs.writeFileSync(path.join(dir, `${spec.name}.spec.ts`), emitSpecFile(spec));
        // no reset command and no fixture isolation: the check stops at its blockers, before any browser
        return runReadinessCheck({ flowFile }, () => {
          throw new Error('the check runner must not be reached');
        });
      };
      const withAsserts = report(flowOf(stepOf([SEVEN.visible, SEVEN.url_contains])));
      expect(withAsserts.assertions).toEqual({ steps: 1, checks: 2 });
      const plain = report({ ...flowOf({ ...stepOf([{ tool: 'wait_for', args: { target: '@e1', state: 'visible' }, locators: { target: STATUS } }], { kind: undefined }, { assert: undefined }) }), name: 'plain' });
      expect(plain.assertions).toEqual({ steps: 0, checks: 0 });
      // additive: the same outcome and the same blockers either way
      expect(withAsserts.outcome).toBe(plain.outcome);
      expect(withAsserts.blockers).toEqual(plain.blockers);
      expect(JSON.parse(fs.readFileSync(withAsserts.evidenceFile, 'utf8')).assertions).toEqual({ steps: 1, checks: 2 });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a check failure that is an assertion miss is classified by the shared prefix', () => {
    const failed = assertFailure('failed', 'the total is 370.00', 'wait_for text_equals timed out');
    expect(assertMiss(`Error: ${failed}`)).toEqual({ kind: 'failed', message: failed });
    expect(assertMiss(assertFailure('unlocatable', 'the total is 370.00', 'none of 2 recorded locators resolved'))?.kind).toBe('unlocatable');
    expect(assertMiss('Error: none of 2 recorded locators resolved')).toBeNull();
    expect(assertMiss(null)).toBeNull();
    const result = { ran: true, skipped: null, passed: false, durationMs: 1000, exitCode: 1, timedOut: false, error: `Error: ${failed}`, anchor: '02-assert s_assert/1', errorFile: null, errorLine: null, drift: [], driftCount: 0, workspace: null, specFile: null };
    expect(verdictFor(result, false)).toBe(`spec check: FAILED at @step 02-assert s_assert/1 — Error: ${failed} — an assertion of the flow did not hold on this run`);
  });
});

/**
 * The emitted module, compiled and run: the step function driven against a
 * fake page, so the thrown message is the artifact's own. `@playwright/test`
 * is replaced by a shim whose `expect` fails the way Playwright's does — by
 * throwing — which is all the generated code relies on.
 */
describe('assert: the artifact throws the shared failure on a miss', () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.resolve('test/.assert-spec-'));
    fs.writeFileSync(
      path.join(dir, 'pw-shim.mjs'),
      [
        'const fail = (message) => { throw new Error(message); };',
        'export const test = { step: async (_name, fn) => await fn() };',
        'export const expect = Object.assign(',
        '  (target) => ({',
        "    toBeVisible: async () => { if (!(await target.isVisible())) fail('expect(locator).toBeVisible() failed'); },",
        "    toBeHidden: async () => { if (await target.isVisible()) fail('expect(locator).toBeHidden() failed'); },",
        "    toHaveText: async (want) => { if ((await target.innerText()) !== want) fail(`expect(locator).toHaveText(${JSON.stringify(want)}) failed`); },",
        "    toContainText: async (want) => { if (!(await target.innerText()).includes(want)) fail(`expect(locator).toContainText(${JSON.stringify(want)}) failed`); },",
        "    toHaveCount: async (want) => { if ((await target.count()) !== want) fail(`expect(locator).toHaveCount(${want}) failed`); },",
        '  }),',
        '  // One look, then the timeout: what a poll that never holds amounts to.',
        "  { poll: (read) => ({ toBe: async (want) => { if ((await read()) !== want) fail('Timeout exceeded while waiting on the predicate'); } }) },",
        ');',
        '',
      ].join('\n'),
    );
  });
  afterAll(() => {
    expect(path.basename(dir)).toMatch(/^\.assert-spec-/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  interface Module {
    steps: Record<string, (page: unknown, p: Record<string, string>, outputs: Record<string, string>, run?: unknown) => Promise<void>>;
    createFlowRun(): { drift: string[] };
  }

  async function moduleOf(spec: SpecFlow): Promise<Module> {
    const { source } = emit(spec);
    const js = ts
      .transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
      .outputText.replace("from '@playwright/test'", "from './pw-shim.mjs'");
    const file = path.join(dir, `flow-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
    fs.writeFileSync(file, js);
    return (await import(`file://${file.split(path.sep).join('/')}`)) as Module;
  }

  /** What the page shows of the one element every fixture chain names. */
  interface Shown {
    /** How many elements the PRIMARY candidate matches (0: it does not resolve). */
    primary: number;
    /** How many the fallback candidate matches. */
    fallback?: number;
    visible?: boolean;
    text?: string;
    value?: string | null;
    url?: string;
  }

  /**
   * A page that answers what the embedded resolution policy and the emitted
   * waits ask of it, and nothing else. Whatever it is not asked for throws, so
   * a path the fixture did not expect fails loudly rather than passing.
   */
  function fakePage(shown: Shown) {
    const locator = (label: string, count: number): Record<string, unknown> => {
      const self: Record<string, unknown> = {
        toString: () => label,
        count: async () => count,
        first: () => self,
        nth: () => self,
        page: () => page,
        isVisible: async () => count > 0 && shown.visible !== false,
        innerText: async () => shown.text ?? '',
        textContent: async () => shown.text ?? '',
        inputValue: async () => {
          if (shown.value === null || shown.value === undefined) throw new Error('Node is not an <input>, <textarea> or <select> element');
          return shown.value;
        },
        boundingBox: async () => ({ x: 0, y: 0, width: 10, height: 10 }),
        evaluate: async () => false,
      };
      return self;
    };
    const page: Record<string, unknown> = {
      url: () => shown.url ?? `${ORIGIN}/tickets`,
      locator: (selector: string) => locator(`locator(${selector})`, shown.primary),
      getByTestId: (id: string) => locator(`getByTestId(${id})`, shown.primary),
      getByRole: (role: string) => locator(`getByRole(${role})`, shown.fallback ?? 0),
      waitForLoadState: async () => {},
      waitForTimeout: async () => {},
      evaluate: async () => null,
      on: () => {},
      off: () => {},
      once: () => {},
      removeListener: () => {},
      mainFrame: () => ({ url: () => shown.url ?? `${ORIGIN}/tickets` }),
      frames: () => [],
      context: () => ({ pages: () => [page] }),
      isClosed: () => false,
      title: async () => 'Tickets',
    };
    return page;
  }

  /** Run the one assertion step; what it threw, or null when it passed. */
  async function run(checkStep: SkillStep, shown: Shown, name = 'demo Test'): Promise<{ error: string | null; drift: string[] }> {
    // No url precondition marker and no identity: the step under test is the check alone.
    const mod = await moduleOf(flowOf(stepOf([checkStep])));
    const state = mod.createFlowRun();
    try {
      await mod.steps['02-assert'](fakePage(shown), { v1: name }, {}, state);
      return { error: null, drift: state.drift };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err), drift: state.drift };
    }
  }

  const FILLED = 'the ticket list shows demo Test with status Open';

  it('passes when the condition holds', async () => {
    expect((await run(SEVEN.visible, { primary: 1 })).error).toBeNull();
    expect((await run(SEVEN.text_equals, { primary: 1, text: 'Open' })).error).toBeNull();
    expect((await run(SEVEN.text_contains, { primary: 1, text: 'ticket demo Test' })).error).toBeNull();
    expect((await run(SEVEN.count, { primary: 3 })).error).toBeNull();
    // whitespace-collapsed, as the daemon compares it — where toHaveValue would not match
    expect((await run(SEVEN.value_equals, { primary: 1, value: '  demo   Test ' })).error).toBeNull();
    expect((await run(SEVEN.url_contains, { primary: 0, url: `${ORIGIN}/tickets?open=1` })).error).toBeNull();
    // absence: nothing resolving IS the condition
    expect((await run(SEVEN.hidden, { primary: 0 })).error).toBeNull();
  }, 60_000);

  it('failed: the condition does not hold on a target that resolved', async () => {
    const cases: [SkillStep, Shown, string][] = [
      [SEVEN.visible, { primary: 1, visible: false }, 'expect(locator).toBeVisible() failed'],
      [SEVEN.hidden, { primary: 1, visible: true }, 'expect(locator).toBeHidden() failed'],
      [SEVEN.text_equals, { primary: 1, text: 'Closed' }, 'expect(locator).toHaveText("Open") failed'],
      [SEVEN.text_contains, { primary: 1, text: 'another ticket' }, 'expect(locator).toContainText("demo Test") failed'],
      [SEVEN.count, { primary: 2 }, 'expect(locator).toHaveCount(3) failed'],
      [SEVEN.value_equals, { primary: 1, value: 'other' }, 'wait_for value_equals timed out after 4000ms (last: value="other")'],
      [SEVEN.value_equals, { primary: 1, value: null }, 'wait_for value_equals timed out after 4000ms (last: value=(no field value))'],
      [check({ state: 'url_contains', text: '/orders' }, null), { primary: 0 }, `wait_for url_contains timed out after 10000ms (last: url="${ORIGIN}/tickets")`],
    ];
    for (const [step, shown, detail] of cases) {
      const { error } = await run(step, shown);
      expect(error, String(step.args.state)).toBe(assertFailure('failed', FILLED, detail));
      expect(assertFailureKind(error!)).toBe('failed');
    }
  }, 60_000);

  it('unlocatable: no recorded locator resolved, so the condition could not be read', async () => {
    for (const state of ['visible', 'text_equals', 'text_contains', 'count', 'value_equals']) {
      const { error } = await run(SEVEN[state], { primary: 0, fallback: 0 });
      expect(assertFailureKind(error!), state).toBe('unlocatable');
      expect(error, state).toContain(`assertion could not be checked: ${FILLED} — none of 2 recorded locators resolved at 02-assert s_assert/1 target (page is at ${ORIGIN}/tickets)`);
    }
  }, 120_000);

  it('unlocatable: a stop anywhere else in the step is still the assertion missing, never an ordinary error', async () => {
    // A check recorded on the second tab, run with one tab open: the page gate stops the step in
    // `prepare`, before anything resolves. Replay books the same stop as 'unlocatable' (its backstop).
    const { error } = await run({ ...SEVEN.visible, page: 1 }, { primary: 1 });
    expect(assertFailureKind(error!)).toBe('unlocatable');
    expect(error).toContain(`assertion could not be checked: ${FILLED} — 02-assert s_assert/1`);
  }, 60_000);

  it('a fallback candidate of the same chain still resolves it, and files drift', async () => {
    const held = await run(SEVEN.visible, { primary: 0, fallback: 1 });
    expect(held.error).toBeNull();
    expect(held.drift).toHaveLength(1);
    expect(held.drift[0]).toContain('[sitelooper drift] 02-assert s_assert/1 target: primary');
    // …and a fallback that resolves but does not hold is still a failure, with the drift on record
    const missed = await run(SEVEN.visible, { primary: 0, fallback: 1, visible: false });
    expect(assertFailureKind(missed.error!)).toBe('failed');
    expect(missed.drift).toHaveLength(1);
  }, 60_000);
});
