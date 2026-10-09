/**
 * Tail adoption and omitted work (src/skills/flow.ts resolveGroups, omittedWork;
 * src/spec/ir.ts omittedDiagnostics).
 *
 * Kimai hakm2-n1 (test/fixture/hakm2-n1-script.jsonl, the published recording,
 * whole): its last instruction "Create exactly one timesheet record…" saved
 * the record and reported blocked; the re-issue (a resume) only re-opened it
 * to verify and reported failure. Rule 2 needs a successful successor, the
 * tail has none, so the flow stopped at 04-edit and the compiled spec passed
 * against an app with no timesheet.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseScript, type RecordedEntry } from '../src/daemon/recorder.js';
import { buildFlow, unbankedMutations, type Flow } from '../src/skills/flow.js';
import { SkillStore } from '../src/skills/store.js';
import { flowToSpec } from '../src/spec/ir.js';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-tail-'));
  process.env.SITELOOPER_SKILLS_DIR = path.join(tmp, 'skills');
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const ORIGIN = 'http://127.0.0.1:9000';
const build = (entries: RecordedEntry[]): Flow => buildFlow(entries, { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: {}, session: 's' })!;
const step = (tool: string, url?: string, added: string[] = []): RecordedEntry =>
  ({ k: 'step', tool, args: { target: '@e1' }, locators: {}, ...(url ? { diff: { url, alerts: [], added } } : {}) }) as RecordedEntry;

describe('kimai hakm2-n1: the recording ended on the timesheet create', () => {
  const KM = 'http://127.0.0.1:8105';
  const entries = parseScript(fs.readFileSync(path.join(__dirname, 'fixture', 'hakm2-n1-script.jsonl'), 'utf8').replace(/\r\n/g, '\n')).entries;
  const flow = buildFlow(entries, { name: 'hakm2', origin: KM, startUrl: `${KM}/en/login`, vars: { runid: 'hakm2-n1' }, session: 's' })!;

  it('the timesheet create is a step: adopted, after 04-edit, exactly one', () => {
    expect(flow.steps.map((s) => s.id).slice(0, 4)).toEqual(['01-signin', '02-find', '03-create', '04-edit']);
    expect(flow.steps).toHaveLength(5);
    const timesheet = flow.steps.filter((s) => /timesheet record/.test(s.instruction));
    expect(timesheet).toHaveLength(1);
    expect(timesheet[0]).toBe(flow.steps[4]);
    expect(timesheet[0].adopted).toBe(true);
    // The first four are untouched.
    expect(flow.steps.slice(0, 4).every((s) => !s.adopted)).toBe(true);
  });

  it('nothing is left out, so nothing is said', () => {
    expect(unbankedMutations(entries)).toEqual([]);
    expect(flow.omitted).toBeUndefined();
  });
});

describe('tail adoption, synthetic', () => {
  const list = `${ORIGIN}/items`;
  const signin: RecordedEntry[] = [
    { k: 'instruction', text: 'Sign in.', url: `${ORIGIN}/login` },
    step('fill', `${ORIGIN}/login`),
    step('click', list),
    { k: 'report', status: 'success', summary: 'signed in', values: {} },
  ] as RecordedEntry[];

  it('a tail non-success group that changed nothing is not adopted', () => {
    const entries = [
      ...signin,
      { k: 'instruction', text: 'Report the item count.', url: list },
      step('read'),
      step('screenshot'),
      { k: 'report', status: 'failure', summary: 'could not count', values: {} },
    ] as RecordedEntry[];
    const flow = build(entries);
    expect(flow.steps.map((s) => s.id)).toEqual(['01-signin']);
    expect(flow.omitted).toBeUndefined();
  });

  it('a tail group with no report (a recording cut off) is not adopted', () => {
    const entries = [...signin, { k: 'instruction', text: 'Create an item.', url: list }, step('click', `${ORIGIN}/items/new`), step('fill', `${ORIGIN}/items/new`)] as RecordedEntry[];
    expect(build(entries).steps).toHaveLength(1);
  });

  it('a same-text re-issue at the tail is a retry of the same work: ONE adopted step', () => {
    const text = "Create an item named 'Widget' and save it.";
    const entries = [
      ...signin,
      { k: 'instruction', text, url: list },
      step('click', `${ORIGIN}/items/new`, ['- textbox "Name"']),
      step('fill', `${ORIGIN}/items/new`),
      step('click', `${ORIGIN}/items/41`, ['- heading "Widget"']),
      { k: 'report', status: 'blocked', summary: 'saved, turn cap', values: { item_id: '41' } },
      // Re-issued as a new instruction (not a resume): its own group.
      { k: 'instruction', text, url: `${ORIGIN}/items/41` },
      step('click', `${ORIGIN}/items/41`),
      step('read'),
      { k: 'report', status: 'failure', summary: 'verified only', values: { item_name: 'Widget' } },
    ] as RecordedEntry[];
    const flow = build(entries);
    expect(flow.steps).toHaveLength(2);
    expect(flow.steps[1].adopted).toBe(true);
    expect(flow.steps[1].instruction).toBe(text);
    // The step owns both attempts' values.
    expect(flow.steps[1].recorded).toMatchObject({ item_id: '41', item_name: 'Widget' });
    expect(flow.omitted).toBeUndefined();
  });

  it('two different tail instructions that both changed the app are both adopted', () => {
    const entries = [
      ...signin,
      { k: 'instruction', text: "Create an item named 'Widget'.", url: list },
      step('click', `${ORIGIN}/items/new`, ['- textbox "Name"']),
      step('fill', `${ORIGIN}/items/new`),
      step('click', `${ORIGIN}/items/41`, ['- heading "Widget"']),
      { k: 'report', status: 'blocked', summary: 'saved', values: {} },
      { k: 'instruction', text: "Tag the item 'Widget' as urgent.", url: `${ORIGIN}/items/41` },
      step('goto', `${ORIGIN}/items/41/tags`),
      step('click', `${ORIGIN}/items/41/tags`, ['- text "urgent"']),
      { k: 'report', status: 'failure', summary: 'tagged, could not verify', values: {} },
    ] as RecordedEntry[];
    const flow = build(entries);
    expect(flow.steps.map((s) => Boolean(s.adopted))).toEqual([false, true, true]);
  });

  it('a mid-flow abandoned group worked around by a navigation is still dropped, and recorded as omitted', () => {
    const entries = [
      ...signin,
      { k: 'instruction', text: 'Create an item from the quick-add bar.', url: list },
      step('click', list, ['- textbox "Quick add"']),
      step('fill', list),
      step('press', list),
      { k: 'report', status: 'failure', summary: 'quick add did nothing', values: {} },
      { k: 'instruction', text: 'Create the item from the full form instead.', url: list },
      step('goto', `${ORIGIN}/items/new`),
      step('fill', `${ORIGIN}/items/new`),
      step('click', `${ORIGIN}/items/41`, ['- heading "Widget"']),
      { k: 'report', status: 'success', summary: 'created', values: {} },
    ] as RecordedEntry[];
    const flow = build(entries);
    expect(flow.steps.map((s) => [s.instruction, Boolean(s.adopted)])).toEqual([
      ['Sign in.', false],
      ['Create the item from the full form instead.', false],
    ]);
    expect(flow.omitted).toEqual([{ instruction: 'Create an item from the quick-add bar.', mutations: 3, status: 'failure' }]);
    // The export line still says it.
    expect(unbankedMutations(entries)).toEqual([expect.stringContaining('its work is NOT in the flow')]);
  });

  it('a tail group a later tail group undid is not adopted, nor is the undoer', () => {
    const board = `${ORIGIN}/board`;
    const whole = '- heading "Board"\n- cell "Backlog"\n- link "#1 Seed task"\n- cell "Doing"';
    const entries = [
      ...signin,
      { k: 'instruction', text: 'Move task #2 to Doing.', url: board, startText: whole, startDialect: 2, startTextComplete: true },
      step('drag', board),
      step('click', board),
      { k: 'report', status: 'failure', summary: 'moved the wrong card (#1)', values: {} },
      { k: 'instruction', text: 'Move task #1 back to Backlog.', url: board, startText: '- heading "Board"', startDialect: 2, startTextComplete: true },
      step('drag', board),
      { k: 'report', status: 'blocked', summary: 'moved back, could not verify', values: {} },
      // The board reads exactly as it did before the pair.
      { k: 'instruction', text: 'Report the cards in Doing.', url: board, startText: whole, startDialect: 2, startTextComplete: true },
      step('read'),
      { k: 'report', status: 'failure', summary: 'unclear', values: {} },
    ] as RecordedEntry[];
    const flow = build(entries);
    expect(flow.steps.map((s) => s.instruction)).toEqual(['Sign in.']);
    expect(flow.omitted).toEqual([{ instruction: 'Move task #2 to Doing.', mutations: 2, status: 'failure', undoneBy: 'Move task #1 back to Backlog.' }]);
    const lines = unbankedMutations(entries);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('NEITHER is in the flow');
  });
});

describe('omitted-work diagnostic', () => {
  const flowWith = (omitted?: Flow['omitted']): Flow => ({
    name: 'f',
    origin: ORIGIN,
    startUrl: `${ORIGIN}/`,
    vars: [],
    steps: [{ id: '01-sign', instruction: 'Sign in.', outputs: [], recorded: {} }],
    provenance: { session: 's', created: 'x' },
    ...(omitted ? { omitted } : {}),
  });

  it('names the left-out instruction, at warning severity', () => {
    const store = new SkillStore(path.join(tmp, 'store-a'));
    const { diagnostics, warnings } = flowToSpec(flowWith([{ instruction: 'Create an item from the quick-add bar.', mutations: 3, status: 'failure' }]), store);
    const d = diagnostics.filter((x) => x.code === 'omitted-work');
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe('warning');
    expect(d[0].step).toBeUndefined();
    expect(d[0].what).toContain('Create an item from the quick-add bar.');
    expect(d[0].what).toContain('a spec may pass without that work');
    expect(d[0].why).toContain('3 state-changing step(s) and reported failure');
    expect(warnings).toContain(d[0].what);
  });

  it('a flow saved before `omitted` existed gets none', () => {
    const store = new SkillStore(path.join(tmp, 'store-b'));
    expect(flowToSpec(flowWith(), store).diagnostics.some((x) => x.code === 'omitted-work')).toBe(false);
  });
});
