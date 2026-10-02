/**
 * `sitelooper assert`, the compile and replay half (notes/CONTRACT-assert.md):
 * an instruction recorded with `assert` compiles to a procedure of its checks
 * and nothing else, exports as a flow step of kind 'assert', and replays under
 * the strict policy — a miss is the run's answer (`failed`), a target no
 * recorded candidate finds is `unlocatable`, and no rule may skip, heal,
 * recover or re-pin it. The flow runner's side is step-verdict.ts
 * runAssertStep, which is handed a replay and no model.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Locator, Page } from 'playwright-core';
import type { LocatorCandidate, RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { assertFailureKind } from '../src/execution/assert.js';
import { compileSkills, fillParams, sameProcedure } from '../src/skills/compile.js';
import { buildFlow } from '../src/skills/flow.js';
import { canAdoptPin, learnFromInstruction, matchTemplate, mutates, publishedOutputs, selectCandidates } from '../src/skills/learn.js';
import { candidatesFor, renderReplay, replaySkill, type InlineHealer, type ReplayResult } from '../src/skills/replay.js';
import { SkillStore, type Skill, type SkillStep } from '../src/skills/store.js';
import { runAssertStep, type AssertReplay } from '../src/daemon/step-verdict.js';
import type { InstructionResult } from '../src/agent/loop.js';

process.env.SITELOOPER_RESOLVE_WAIT_MS = '0';
process.env.SITELOOPER_IDENTITY_WAIT_MS = '0';

const APP = 'http://app.test';
const LIST = `${APP}/tickets`;
const SENTENCE = "the ticket list shows 'r9 Test' with status Open";

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-assert-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});
const newStore = (): SkillStore => new SkillStore(fs.mkdtempSync(path.join(tmp, 'store-')));

const recorded = (tool: string, args: Record<string, unknown>, chain?: LocatorCandidate[], extra: Partial<RecordedStep> = {}): RecordedStep => ({
  k: 'step',
  tool,
  args,
  locators: chain ? { target: { expr: 'page.locator()', verified: true, raw: String(args.target ?? ''), chain } } : {},
  ...extra,
});

/** The row's title cell, found by name and by position, and its status cell. */
const TITLE_CHAIN: LocatorCandidate[] = [
  { kind: 'role', role: 'cell', name: 'r9 Test' },
  { kind: 'css', selector: '#rows > tr:nth-of-type(1) > td:nth-of-type(1)' },
];
const STATUS_CHAIN: LocatorCandidate[] = [
  { kind: 'testid', attr: 'data-testid', value: 'status' },
  { kind: 'css', selector: '#rows > tr:nth-of-type(1) > td:nth-of-type(2)' },
];

/** One `assert` instruction as the recorder files it: the model looked, read, and stated the condition as waits. */
function assertion(text = SENTENCE): RecordedEntry[] {
  return [
    { k: 'instruction', text, url: LIST, assert: true, startText: '- cell "r9 Test"\n- cell "Open"' },
    recorded('read', { target: '@e4', what: 'text' }, TITLE_CHAIN, { result: 'r9 Test' }),
    recorded('wait_for', { target: '@e4', state: 'text_equals', text: 'r9 Test' }, TITLE_CHAIN),
    recorded('read_all', { target: 'td', what: 'text' }, [{ kind: 'css', selector: 'td' }], { result: '["r9 Test","Open"]' }),
    recorded('wait_for', { target: '@e5', state: 'text_contains', text: 'Open' }, STATUS_CHAIN),
    recorded('wait_for', { state: 'url_contains', text: '/tickets' }),
  ];
}

function compileAssertion(entries = assertion(), extra: Partial<Parameters<typeof compileSkills>[0]> = {}): Skill[] {
  return compileSkills({
    entries,
    instruction: (entries[0] as Extract<RecordedEntry, { k: 'instruction' }>).text,
    report: { status: 'success', summary: 'The list shows r9 Test with status Open.', evidence: { values: { title: 'r9 Test', status: 'Open' } } },
    session: 'assert',
    knownValues: { 'var:runid': 'r9' },
    now: '2026-10-02T00:00:00.000Z',
    ...extra,
  });
}

describe('compile: an assert instruction is a procedure of its checks', () => {
  it('keeps the waits that held and drops the reads around them', () => {
    const skills = compileAssertion();
    expect(skills).toHaveLength(1);
    const [skill] = skills;
    expect(skill.assert).toBe(true);
    expect(skill.steps.map((s) => s.tool)).toEqual(['wait_for', 'wait_for', 'wait_for']);
    expect(skill.steps.map((s) => s.args.state)).toEqual(['text_equals', 'text_contains', 'url_contains']);
    // No label, no expectation: a check publishes nothing and has no effect to verify.
    for (const step of skill.steps) {
      expect(step.label).toBeUndefined();
      expect(step.expect).toBeUndefined();
    }
  });

  it("carries the caller's sentence, slotted, on every step", () => {
    const [skill] = compileAssertion();
    expect(skill.template).toContain('{{v');
    expect(skill.template).not.toContain('r9');
    for (const step of skill.steps) expect(step.assert).toEqual({ message: skill.template });
    const example = Object.fromEntries(Object.entries(skill.params).map(([n, p]) => [n, p.example]));
    expect(fillParams(skill.template, example)).toBe(SENTENCE);
  });

  it('slots the expected text as an instruction value, so a declared var threads through it', () => {
    const [skill] = compileAssertion();
    const expected = String(skill.steps[0].args.text);
    expect(expected).not.toContain('r9');
    // Whatever the slot layout, another run's values produce another run's expectation.
    const runid = Object.entries(skill.params).find(([, p]) => p.binding === 'var:runid');
    expect(runid).toBeDefined();
    const next = Object.fromEntries(Object.entries(skill.params).map(([n, p]) => [n, p.example.replace('r9', 'r12')]));
    expect(fillParams(expected, next)).toBe('r12 Test');
    // …and the locator that named the element by that text is slotted with it.
    expect(JSON.stringify(fillParams(JSON.stringify(skill.steps[0].locators.target[0]), next))).toContain('r12 Test');
  });

  it('compiles a url_contains wait, which has no target and no locator', () => {
    const [skill] = compileAssertion();
    const url = skill.steps[2];
    expect(url.args).toEqual({ state: 'url_contains', text: '/tickets' });
    expect(url.locators).toEqual({});
  });

  it('has no goal, no identity markers, no detour, no outputs, and does not mutate', () => {
    const [skill] = compileAssertion();
    expect(skill.goal).toBeUndefined();
    expect(skill.detour).toBeUndefined();
    // The start page showed the expected text: as a precondition it would
    // refuse the procedure before its wait could say the condition is false.
    expect(skill.preconditions.requireText).toBeUndefined();
    expect(skill.reportTemplate).toEqual({ summary: skill.template, values: {} });
    expect(publishedOutputs(skill)).toEqual([]);
    const store = newStore();
    store.put(skill);
    expect(mutates(store, skill.id)).toBe(false);
  });

  it('is nothing at all when no wait was recorded', () => {
    const entries = assertion().filter((e) => e.k !== 'step' || e.tool !== 'wait_for');
    expect(compileAssertion(entries)).toEqual([]);
  });

  it('is never a variant of the procedure it was recorded beside', () => {
    const [skill] = compileAssertion(assertion(), { variantOf: 's_other', stoppedAt: { skill: 's_other', step: 1 } });
    expect(skill.assert).toBe(true);
    expect(skill.variantOf).toBeUndefined();
  });

  it('leaves the same recording, issued with `do`, exactly as before', () => {
    const entries = assertion();
    delete (entries[0] as { assert?: true }).assert;
    const [skill] = compileAssertion(entries);
    expect(skill.assert).toBeUndefined();
    expect(skill.steps.some((s) => s.assert)).toBe(false);
    expect(skill.steps.some((s) => s.tool === 'read')).toBe(true);
  });
});

describe('learn: an assertion stands apart from every other procedure', () => {
  const result = (skill?: InstructionResult['skill']): InstructionResult =>
    ({ report: { status: 'success', summary: 'holds', evidence: { values: {} } }, turns: 1, usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 }, screenshots: [], ...(skill ? { skill } : {}) }) as unknown as InstructionResult;

  it('is stored beside, never merged into, a `do` procedure with the same sentence', () => {
    const store = newStore();
    const plain = assertion();
    delete (plain[0] as { assert?: true }).assert;
    const first = learnFromInstruction(store, { result: result(), instruction: SENTENCE, entries: plain, session: 'a', vars: { 'var:runid': 'r9' }, now: '2026-10-02T00:00:00.000Z' });
    const second = learnFromInstruction(store, { result: result(), instruction: SENTENCE, entries: assertion(), session: 'a', vars: { 'var:runid': 'r9' }, now: '2026-10-02T00:00:01.000Z' });
    expect(first?.compiled).toBeTruthy();
    expect(second?.compiled).toBeTruthy();
    expect(second?.merged).toBeUndefined();
    expect(second!.compiled).not.toBe(first!.compiled);
    expect(store.get(second!.compiled!)?.assert).toBe(true);
    expect(store.get(first!.compiled!)?.assert).toBeUndefined();
    // A second recording of the same assertion merges into the assertion.
    const third = learnFromInstruction(store, { result: result(), instruction: SENTENCE, entries: assertion(), session: 'a', vars: { 'var:runid': 'r9' }, now: '2026-10-02T00:00:02.000Z' });
    expect(third?.merged).toBe(second!.compiled);
    expect(store.get(second!.compiled!)?.status).toBe('validated');
  });

  it('is never selected for, matched by, or adopted into a step that is not an assertion', () => {
    const store = newStore();
    const [check] = compileAssertion();
    const plainEntries = assertion();
    delete (plainEntries[0] as { assert?: true }).assert;
    // A second later: a skill's id is its origin, template and creation time.
    const [plain] = compileAssertion(plainEntries, { now: '2026-10-02T00:00:01.000Z' });
    expect(plain.id).not.toBe(check.id);
    check.status = 'validated';
    plain.status = 'validated';
    store.put(check);
    store.put(plain);
    const skills = store.list(APP);
    const known = { 'var:runid': 'r9' };
    expect(sameProcedure(check, { ...check, assert: undefined })).toBe(false);
    expect(selectCandidates(skills, plain.id, SENTENCE, undefined, known).map((c) => c.skill.id)).toEqual([plain.id]);
    expect(selectCandidates(skills, check.id, SENTENCE, undefined, known).map((c) => c.skill.id)).toEqual([check.id]);
    expect(selectCandidates(skills, undefined, SENTENCE, undefined, known).map((c) => c.skill.id)).toEqual([plain.id]);
    expect(matchTemplate(skills, SENTENCE, LIST, known)?.skill.id).toBe(plain.id);
    expect(matchTemplate(skills, SENTENCE, LIST, known, { assert: true })?.skill.id).toBe(check.id);
    expect(canAdoptPin(store, [{ id: '02-open' }], '02-open', undefined, check.id, 'read-only')).toBe(false);
    // …nor offered to a model as a way of doing an instruction's work.
    expect(candidatesFor(skills, LIST).map((s) => s.id)).toEqual([plain.id]);
  });

  it('does not count a missed assertion as a strike against its procedure', () => {
    const store = newStore();
    const [check] = compileAssertion();
    store.put(check);
    const missed = { ...result({ invoked: check.id, refused: false, stepsReplayed: 0, stepsTotal: 3, failedAt: 1, fallthroughs: 0, listed: [check.id], repaired: false } as unknown as InstructionResult['skill']) };
    missed.report = { status: 'failure', summary: 'assertion failed' } as InstructionResult['report'];
    for (let i = 0; i < 3; i++) learnFromInstruction(store, { result: missed, instruction: SENTENCE, entries: [], session: 'a' });
    const after = store.get(check.id)!;
    expect(after.status).toBe('provisional');
    expect(after.stats.failedAtStep).toEqual({});
  });
});

describe('flow export: an assertion is its own step', () => {
  const report = (status: 'success' | 'failure', skill?: string, values: Record<string, string> = {}): RecordedEntry => ({ k: 'report', status, summary: status, values, ...(skill ? { skill } : {}) });
  const entries: RecordedEntry[] = [
    { k: 'instruction', text: "create a ticket titled 'r9 Test'", url: `${APP}/tickets/new` },
    recorded('fill', { target: '#title', value: 'r9 Test' }, [{ kind: 'css', selector: '#title' }], { diff: { url: `${APP}/tickets/new`, alerts: [], added: ['- textbox "Title": r9 Test'] } }),
    recorded('click', { target: '#save' }, [{ kind: 'css', selector: '#save' }], { diff: { url: LIST, alerts: [], added: ['- cell "r9 Test"', '- cell "Open"'] } }),
    report('success', 's_create', { ticket_status: 'Open' }),
    // Held: a step of the flow. Its sentence carries a mutating verb, which is no instruction to change anything.
    ...assertion("the ticket 'r9 Test' was created with status Open"),
    report('success', 's_check', { status: 'Open' }),
    // Did not hold at record time: never part of the flow, and never adopted.
    { k: 'instruction', text: "the ticket list shows 'r9 Test' with status Closed", url: LIST, assert: true },
    recorded('read', { target: '@e5', what: 'text' }, STATUS_CHAIN, { result: 'Open' }),
    report('failure'),
    { k: 'instruction', text: "open the ticket titled 'r9 Test'", url: LIST },
    recorded('click', { target: '@e4' }, TITLE_CHAIN, { diff: { url: `${APP}/tickets/t15`, alerts: [], added: ['- heading "r9 Test"'] } }),
    report('success', 's_open'),
  ];
  const flow = buildFlow(entries, { name: 'f', origin: APP, startUrl: `${APP}/tickets/new`, vars: { runid: 'r9' }, session: 'a', now: '2026-10-02T00:00:00.000Z' })!;

  it("exports the assertion that held as kind 'assert', with no outputs", () => {
    expect(flow.steps.map((s) => [s.id, s.kind])).toEqual([
      ['01-create', undefined],
      ['02-assert', 'assert'],
      ['03-open', undefined],
    ]);
    const step = flow.steps[1];
    expect(step.skill).toBe('s_check');
    expect(step.outputs).toEqual([]);
    expect(step.recorded).toEqual({});
    expect(step.adopted).toBeUndefined();
    // Threaded like any instruction: the declared var, and an earlier step's output.
    expect(step.instruction).toContain('{{runid}} Test');
    expect(step.instruction).toContain('{{01-create.ticket_status}}');
  });

  it('never keeps the assertion that failed, and never warns that an assertion changed nothing', () => {
    expect(flow.steps.some((s) => s.instruction.includes('Closed'))).toBe(false);
    expect(flow.warnings ?? []).toEqual([]);
  });

  it('no later step references anything an assertion reported', () => {
    expect(JSON.stringify(flow.steps[2])).not.toContain('02-assert');
  });

  it('is transparent to adoption: a failed step is still adopted by the work that continued it, across an assertion', () => {
    const continued: RecordedEntry[] = [
      { k: 'instruction', text: "create a ticket titled 'r9 Test'", url: `${APP}/tickets/new` },
      recorded('fill', { target: '#title', value: 'r9 Test' }, [{ kind: 'css', selector: '#title' }], { diff: { url: `${APP}/tickets/new`, alerts: [], added: ['- textbox "Title": r9 Test'] } }),
      report('failure'),
      { k: 'instruction', text: "the title field holds 'r9 Test'", url: `${APP}/tickets/new`, assert: true },
      recorded('wait_for', { target: '#title', state: 'value_equals', text: 'r9 Test' }, [{ kind: 'css', selector: '#title' }]),
      report('success', 's_value'),
      { k: 'instruction', text: 'save the ticket', url: `${APP}/tickets/new` },
      recorded('click', { target: '#save' }, [{ kind: 'css', selector: '#save' }], { diff: { url: `${APP}/tickets/t15`, alerts: [], added: ['- heading "r9 Test"'] } }),
      report('success', 's_save'),
    ];
    const f = buildFlow(continued, { name: 'f', origin: APP, startUrl: `${APP}/tickets/new`, vars: { runid: 'r9' }, session: 'a' })!;
    // The failed create is adopted because "save" continued it; the assertion
    // between them stays its own step and is absorbed by neither.
    expect(f.steps.map((s) => [s.id, s.kind, s.adopted])).toEqual([
      ['01-create', undefined, true],
      ['02-assert', 'assert', undefined],
      ['03-step', undefined, undefined],
    ]);
  });
});

/** Locators counted by key (`role:<role>:<name>`, `testid:<id>`, `css:<selector>`, `text:<text>`). */
function fakePage(counts: Record<string, number>, url = LIST): Page {
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
    url: () => url,
    evaluate: async () => [],
    getByTestId: (v: string) => loc(`testid:${v}`),
    getByRole: (role: string, o?: { name?: string | RegExp }) => {
      const hit = Object.keys(counts).find((k) => {
        if (!k.startsWith(`role:${role}:`)) return false;
        const shown = k.slice(`role:${role}:`.length);
        return o?.name instanceof RegExp ? o.name.test(shown) : shown === (o?.name ?? '');
      });
      return loc(hit ?? `role:${role}:?`);
    },
    getByLabel: (l: string) => loc(`label:${l}`),
    getByPlaceholder: () => loc('placeholder'),
    getByText: (t: string) => loc(`text:${t}`),
    locator: (s: string) => loc(`css:${s}`),
  } as unknown as Page;
}

const MESSAGE = "the ticket list shows '{{v1}} Test' with status Open";
function check(steps: Partial<SkillStep>[], extra: Partial<Skill> = {}): Skill {
  return {
    assert: true,
    id: 's_check',
    origin: APP,
    template: MESSAGE,
    params: { v1: { example: 'r9', usedIn: [1], known: true, binding: 'var:runid' } },
    preconditions: { urlPattern: LIST },
    steps: steps.map((s) => ({ assert: { message: MESSAGE }, tool: 'wait_for', args: {}, locators: {}, ...s })) as SkillStep[],
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0, verifiedContract: 2 },
    status: 'validated',
    contract: 2,
    provenance: { session: 'a', instruction: SENTENCE, created: 't' },
    ...extra,
  } as Skill;
}
const TITLE_STEP: Partial<SkillStep> = {
  args: { target: '@e4', state: 'text_equals', text: '{{v1}} Test' },
  locators: { target: [{ kind: 'role', role: 'cell', name: '{{v1}} Test' }, { kind: 'css', selector: '#rows > tr:nth-of-type(1) > td:nth-of-type(1)' }] },
};
const held = async () => ({ result: 'condition met' });
const timedOut = async () => {
  throw new Error('wait_for text_equals timed out after 10000ms (last: text="r12 Other")');
};

describe('replay: the strict failure policy', () => {
  it('passes when every check holds', async () => {
    const calls: string[] = [];
    const res = await replaySkill(check([TITLE_STEP, { args: { state: 'url_contains', text: '/tickets' } }]), { v1: 'r12' }, {
      page: fakePage({ 'role:cell:r12 Test': 1 }),
      exec: async (tool, args) => {
        calls.push(`${tool} ${String(args.state)} ${String(args.text)}`);
        return { result: 'condition met' };
      },
    });
    expect(res.ok).toBe(true);
    expect(res.assertFailed).toBeUndefined();
    // This run's value is what was waited for, and the targetless url check ran without resolving anything.
    expect(calls).toEqual(['wait_for text_equals r12 Test', 'wait_for url_contains /tickets']);
  });

  it("a wait that misses is 'failed', with the caller's sentence filled in and the wait's own words as the detail", async () => {
    const res = await replaySkill(check([TITLE_STEP, { args: { state: 'url_contains', text: '/tickets' } }]), { v1: 'r12' }, {
      page: fakePage({ 'role:cell:r12 Test': 1 }),
      exec: timedOut,
    });
    expect(res.ok).toBe(false);
    expect(res.refused).toBeFalsy();
    expect(res.failedAt).toBe(1);
    expect(res.stepsRun).toBe(0);
    expect(res.assertFailed).toMatchObject({ kind: 'failed', step: 1, sentence: "the ticket list shows 'r12 Test' with status Open" });
    expect(res.assertFailed!.message).toBe(res.reason);
    expect(res.reason).toMatch(/^assertion failed: the ticket list shows 'r12 Test' with status Open — wait_for text_equals timed out/);
    expect(assertFailureKind(res.reason!)).toBe('failed');
    // Rendered as an answer, not as a procedure for a model to finish.
    const said = renderReplay(check([TITLE_STEP]), res);
    expect(said).toContain('is an assertion');
    expect(said).not.toContain('continue from here');
  });

  it("a targetless url_contains that misses is 'failed' too", async () => {
    const res = await replaySkill(check([{ args: { state: 'url_contains', text: '/orders' } }]), { v1: 'r12' }, {
      page: fakePage({}),
      exec: async () => {
        throw new Error('wait_for url_contains timed out after 10000ms (last: url="http://app.test/tickets")');
      },
    });
    expect(res.assertFailed?.kind).toBe('failed');
  });

  it("a target no recorded candidate finds is 'unlocatable', and no inline heal is asked", async () => {
    let asked = 0;
    let dispatched = 0;
    const heal: InlineHealer = async () => {
      asked++;
      return { candidate: { kind: 'css', selector: '#elsewhere' } as LocatorCandidate, note: 'healed' };
    };
    const res = await replaySkill(check([TITLE_STEP]), { v1: 'r12' }, {
      // The text is on the page — under a locator the recording never made.
      page: fakePage({ 'text:r12 Test': 1, 'css:#elsewhere': 1 }),
      exec: async () => {
        dispatched++;
        return { result: 'condition met' };
      },
      heal,
    });
    expect(res.ok).toBe(false);
    expect(res.assertFailed?.kind).toBe('unlocatable');
    expect(res.reason).toMatch(/^assertion could not be checked: the ticket list shows 'r12 Test' with status Open — no element matched any known locator for target/);
    expect(assertFailureKind(res.reason!)).toBe('unlocatable');
    expect(asked).toBe(0);
    expect(dispatched).toBe(0);
    // Drift is still filed: the whole chain missed.
    expect(res.misses).toEqual([expect.objectContaining({ step: '1', key: 'target', used: null })]);
  });

  it('a fallback candidate of the same chain still resolves it, and files drift as for any step', async () => {
    // The status cell: its test id is gone, its id still names it. (A chain
    // that names the RECORD keeps its identity guard, as for any step: a
    // positional rung may not stand in for `cell "r12 Test"`.)
    const status: Partial<SkillStep> = {
      args: { target: '@e5', state: 'text_contains', text: 'Open' },
      locators: { target: [{ kind: 'testid', attr: 'data-testid', value: 'status' }, { kind: 'id', selector: '#status' }] },
    };
    const res = await replaySkill(check([status]), { v1: 'r12' }, { page: fakePage({ 'css:#status': 1 }), exec: held });
    expect(res.ok).toBe(true);
    expect(res.fallthroughs).toBe(1);
    expect(res.misses[0]).toMatchObject({ step: '1', key: 'target', usedIndex: 1 });
  });

  it('is never skipped: the rule that skips an ordinary step is a miss for an assertion', async () => {
    // A read whose target is gone is skipped with a warning (an observation
    // that could not be re-made); the same step as an assertion's check stops.
    const read: Partial<SkillStep> = { tool: 'read', args: { target: '@e4', what: 'text' }, locators: { target: [{ kind: 'css', selector: '#gone' }] }, label: 'title' };
    const after: Partial<SkillStep> = { args: { state: 'url_contains', text: '/tickets' } };
    const page = fakePage({});
    const ordinary = check([read, after]);
    delete ordinary.assert;
    for (const step of ordinary.steps) delete step.assert;
    const skipped = await replaySkill(ordinary, { v1: 'r12' }, { page, exec: held });
    expect(skipped.lines[0]).toContain('skipped');
    expect(skipped.assertFailed).toBeUndefined();
    expect(skipped.stepsRun).toBe(2);

    const strict = await replaySkill(check([read, after]), { v1: 'r12' }, { page, exec: held });
    expect(strict.ok).toBe(false);
    expect(strict.stepsRun).toBe(0);
    expect(strict.failedAt).toBe(1);
    expect(strict.assertFailed?.kind).toBe('unlocatable');
    expect(strict.lines.join('\n')).not.toContain('skipped');
  });

  it('is never skipped by an "already in effect" rule either: whatever the body returns, a skip becomes a miss', async () => {
    // A hide whose target is gone with what it removed: skipped as already in
    // effect for an ordinary click. Dressed as an assertion's step, the same
    // shape stops — the wrapper's backstop, not any one rule's exemption.
    const hide: Partial<SkillStep> = {
      tool: 'click',
      args: { target: '#close' },
      locators: { target: [{ kind: 'css', selector: '#close' }] },
      expect: { removedContains: ['- dialog "Filters"', '- button "Close"'] },
    };
    const page = fakePage({});
    const res = await replaySkill(check([hide]), { v1: 'r12' }, { page, exec: held });
    expect(res.ok).toBe(false);
    expect(res.stepsRun).toBe(0);
    expect(res.assertFailed?.kind).toBe('unlocatable');
  });

  it('a wait for absence is met by absence, as for any wait', async () => {
    const res = await replaySkill(check([{ args: { target: '.error', state: 'hidden' }, locators: { target: [{ kind: 'css', selector: '.error' }] } }]), { v1: 'r12' }, {
      page: fakePage({}),
      exec: held,
    });
    expect(res.ok).toBe(true);
  });

  it('refuses, before any check, when a value it needs was not given', async () => {
    const res = await replaySkill(check([TITLE_STEP]), {}, { page: fakePage({ 'role:cell:r9 Test': 1 }), exec: held });
    expect(res.refused).toBe(true);
    expect(res.reason).toContain('an assertion with an unfilled value cannot be checked');
    expect(res.assertFailed).toBeUndefined();
  });

  it('a wait cut short by the run being stopped is no verdict on the page', async () => {
    const stop = new AbortController();
    const res = await replaySkill(check([TITLE_STEP]), { v1: 'r12' }, {
      page: fakePage({ 'role:cell:r12 Test': 1 }),
      signal: stop.signal,
      exec: async () => {
        stop.abort();
        throw new Error('wait_for cancelled: instruction budget exhausted');
      },
    });
    expect(res.ok).toBe(false);
    expect(res.assertFailed).toBeUndefined();
  });
});

describe('flow runner: an assertion step is decided with a replay and no model', () => {
  const seg = (id: string, assert = true) => ({ id, ...(assert ? { assert: true as const } : {}) });
  const ok: AssertReplay = { ok: true, stepsRun: 2, stepsTotal: 2 };
  const base = { sentence: "the ticket list shows 'r12 Test' with status Open", pin: 's_check', chain: [seg('s_check')], params: { v1: 'r12' }, unresolved: [] as string[], aborted: () => false };

  it('succeeds when the pinned procedure replays clean, threading derived values through a chain', async () => {
    const seen: [string, Record<string, string>][] = [];
    const out = await runAssertStep({
      ...base,
      chain: [seg('s_a'), seg('s_b')],
      replay: async (skill, params) => {
        seen.push([skill.id, { ...params }]);
        return skill.id === 's_a' ? { ...ok, derivedValues: { d1: 't15' } } : ok;
      },
    });
    expect(out.status).toBe('success');
    expect(out.assert).toBeUndefined();
    expect(out.replayed).toBe('4/4');
    expect(seen).toEqual([
      ['s_a', { v1: 'r12' }],
      ['s_b', { v1: 'r12', d1: 't15' }],
    ]);
  });

  it("a miss is 'assert-failed' with the replay's own kind and message, and nothing runs after it", async () => {
    let calls = 0;
    const message = "assertion failed: the ticket list shows 'r12 Test' with status Open — wait_for text_equals timed out";
    const out = await runAssertStep({
      ...base,
      chain: [seg('s_a'), seg('s_b')],
      replay: async () => {
        calls++;
        return { ok: false, stepsRun: 0, stepsTotal: 2, reason: message, assertFailed: { kind: 'failed' as const, message } };
      },
    });
    expect(out).toMatchObject({ status: 'assert-failed', assert: { kind: 'failed', message }, replayed: '0/2' });
    expect(calls).toBe(1);
  });

  it("no pinned skill, a pin the store lost, a pin that is not an assertion: 'unlocatable', and nothing is replayed", async () => {
    let calls = 0;
    const replay = async () => {
      calls++;
      return ok;
    };
    const none = await runAssertStep({ ...base, pin: undefined, chain: [], replay });
    const lost = await runAssertStep({ ...base, chain: [], replay });
    const acting = await runAssertStep({ ...base, chain: [seg('s_check'), seg('s_click', false)], replay });
    for (const out of [none, lost, acting]) {
      expect(out.status).toBe('assert-failed');
      expect(out.assert?.kind).toBe('unlocatable');
      expect(assertFailureKind(out.assert!.message)).toBe('unlocatable');
      expect(out.replayed).toBeNull();
    }
    expect(none.assert!.message).toContain('no pinned assertion procedure');
    expect(lost.assert!.message).toContain('s_check is not in the skill store');
    expect(acting.assert!.message).toContain('s_click is not an assertion procedure');
    expect(calls).toBe(0);
  });

  it("an expected value no earlier step published, or params that do not bind: 'unlocatable', nothing replayed", async () => {
    let calls = 0;
    const replay = async () => {
      calls++;
      return ok;
    };
    const unresolved = await runAssertStep({ ...base, unresolved: ['02-create.total'], replay });
    const unbound = await runAssertStep({ ...base, params: null, replay });
    expect(unresolved.assert).toMatchObject({ kind: 'unlocatable' });
    expect(unresolved.assert!.message).toContain('02-create.total');
    expect(unbound.assert).toMatchObject({ kind: 'unlocatable' });
    expect(calls).toBe(0);
  });

  it("a start gate that refuses the page is 'unlocatable' with the gate's reason, never a recovery", async () => {
    const out = await runAssertStep({
      ...base,
      replay: async () => ({ ok: false, stepsRun: 0, stepsTotal: 2, refused: true, reason: 'expects http://app.test/tickets, browser is at http://app.test/login — nothing was run' }),
    });
    expect(out.status).toBe('assert-failed');
    expect(out.assert?.kind).toBe('unlocatable');
    expect(out.assert!.message).toContain('s_check could not start: expects http://app.test/tickets');
  });

  it("a replay that throws is 'unlocatable'; a run that was stopped is 'blocked', not a verdict", async () => {
    const threw = await runAssertStep({
      ...base,
      replay: async () => {
        throw new Error('browser has been closed');
      },
    });
    expect(threw.assert?.kind).toBe('unlocatable');
    expect(threw.assert!.message).toContain('browser has been closed');
    let stopped = false;
    const blocked = await runAssertStep({
      ...base,
      aborted: () => stopped,
      replay: async () => {
        stopped = true;
        return { ok: false, stepsRun: 0, stepsTotal: 2, reason: 'instruction budget exhausted before this step' };
      },
    });
    expect(blocked.status).toBe('blocked');
    expect(blocked.assert).toBeUndefined();
  });

  it('has no model to call: its only capability is the replay it is handed', async () => {
    // The whole input, by name. A provider, a recovery budget or a store
    // would have to be added here before any path could reach a model.
    const input = { ...base, replay: async (): Promise<ReplayResult> => ({ ok: true, stepsRun: 1, stepsTotal: 1 }) as ReplayResult };
    expect(Object.keys(input).sort()).toEqual(['aborted', 'chain', 'params', 'pin', 'replay', 'sentence', 'unresolved']);
    expect((await runAssertStep(input)).status).toBe('success');
  });
});
