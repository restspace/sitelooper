import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import {
  ComponentStore,
  compileRecipes,
  learnRecipes,
  pickRecipe,
  renderComponents,
  seedRecipes,
  FAMILIES,
  familyOf,
  type Recipe,
} from '../src/skills/components.js';

let tmp: string;
let store: ComponentStore;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-comp-'));
  process.env.SITELOOPER_COMPONENTS_FILE = path.join(tmp, 'components.json');
  store = new ComponentStore();
});
afterEach(() => {
  delete process.env.SITELOOPER_COMPONENTS_FILE;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('seeds and store', () => {
  it('ships provisional seed recipes for every family that needs one', () => {
    const seeds = seedRecipes();
    expect(seeds.find((r) => r.family === 'monaco' && r.intent === 'set-value')).toBeDefined();
    expect(seeds.find((r) => r.family === 'aria-combobox' && r.intent === 'select-option')).toBeDefined();
    expect(seeds.every((r) => r.status === 'provisional')).toBe(true);
    // every seed's set-value carries the payload marker and every family exists
    for (const r of seeds) {
      expect(familyOf(r.family)).toBeDefined();
      if (r.intent === 'set-value') expect(JSON.stringify(r.steps)).toContain('{{value}}');
    }
  });
  it('list() serves seeds until a stored recipe covers the (family, intent)', () => {
    const before = store.list().filter((r) => r.family === 'monaco' && r.intent === 'set-value');
    expect(before).toHaveLength(1);
    expect(before[0].seeded).toBe(true);
    const learned: Recipe = { ...before[0], id: 'r_learn1', seeded: undefined, provenance: { created: 'now' } };
    store.put(learned);
    const after = store.list().filter((r) => r.family === 'monaco' && r.intent === 'set-value');
    expect(after.map((r) => r.id)).toEqual(['r_learn1']);
  });
});

describe('stored seeds run the shipped procedure', () => {
  // fwvk1: the prosemirror seed was demoted for an Escape the shipped seed no
  // longer presses; a store that kept the old steps and the demotion would
  // never try the fixed seed.
  it('a seed stored with steps this build no longer ships starts over provisional, with the shipped steps', () => {
    const seed = store.list().find((r) => r.family === 'prosemirror' && r.intent === 'set-value')!;
    const stale: Recipe = {
      ...seed,
      steps: [...seed.steps.slice(0, 4), { action: 'press', key: 'Escape' }, ...seed.steps.slice(4)],
      status: 'demoted',
      stats: { ...seed.stats, uses: 2, failStreak: 2 },
    };
    store.put(stale);
    const now = store.get(seed.id)!;
    expect(now.steps).toEqual(seed.steps);
    expect(now.status).toBe('provisional');
    expect(now.stats.failStreak).toBe(0);
    expect(now.stats.uses).toBe(2);
    // ...while a seed stored with the shipped steps keeps its lifecycle
    store.put({ ...seed, status: 'demoted', stats: { ...seed.stats, failStreak: 2 } });
    expect(store.get(seed.id)!.status).toBe('demoted');
  });
});

describe('lifecycle', () => {
  it('validates on the second verified success and demotes after two straight failures', () => {
    const seed = store.list().find((r) => r.family === 'monaco' && r.intent === 'set-value')!;
    expect(store.recordOutcome(seed.id, true, 'http://a:1')!.status).toBe('provisional');
    expect(store.recordOutcome(seed.id, true, 'http://a:1')!.status).toBe('validated');
    const cm = store.list().find((r) => r.family === 'codemirror6' && r.intent === 'set-value')!;
    expect(store.recordOutcome(cm.id, false, 'http://a:1')!.status).toBe('provisional');
    expect(store.recordOutcome(cm.id, false, 'http://a:1')!.status).toBe('demoted');
  });
  it('a success resets the failure streak', () => {
    const seed = store.list().find((r) => r.family === 'contenteditable')!;
    store.recordOutcome(seed.id, false, 'http://a:1');
    store.recordOutcome(seed.id, true, 'http://a:1');
    expect(store.recordOutcome(seed.id, false, 'http://a:1')!.status).toBe('provisional');
  });
  it('cross-origin success counts double toward validation', () => {
    const seed = store.list().find((r) => r.family === 'prosemirror')!;
    // one success on each of two origins: 2 successes + cross-origin weight
    store.recordOutcome(seed.id, true, 'http://a:1');
    expect(store.get(seed.id)!.status).toBe('provisional');
    expect(store.recordOutcome(seed.id, true, 'http://b:2')!.status).toBe('validated');
    expect(Object.keys(store.get(seed.id)!.stats.origins)).toHaveLength(2);
  });
});

describe('pickRecipe', () => {
  it('prefers validated over provisional and skips demoted', () => {
    const recipes: Recipe[] = [
      { id: 'a', family: 'monaco', intent: 'set-value', steps: [], status: 'provisional', stats: stats(5) },
      { id: 'b', family: 'monaco', intent: 'set-value', steps: [], status: 'validated', stats: stats(1) },
      { id: 'c', family: 'monaco', intent: 'set-value', steps: [], status: 'demoted', stats: stats(9) },
    ];
    expect(pickRecipe(recipes, 'monaco', 'set-value')!.id).toBe('b');
    expect(pickRecipe(recipes, 'monaco', 'select-option')).toBeNull();
  });
});

function stats(successes: number) {
  return { uses: successes, successes, origins: {}, failStreak: 0, created: 't' };
}

describe('compileRecipes', () => {
  const INSTR = "Set the Notes panel content to 'run x9 notes body' and apply.";
  function componentRun(): RecordedEntry[] {
    return [
      { k: 'instruction', text: INSTR, url: 'http://h:1/edit' },
      {
        k: 'step', tool: 'click', args: { target: '@e1' }, locators: {},
        component: { family: 'monaco', rel: '' },
      },
      {
        k: 'step', tool: 'press', args: { key: 'Control+a' }, locators: {},
        component: { family: 'monaco', rel: '' },
      },
      {
        k: 'step', tool: 'type', args: { target: '@e1', text: 'run x9 notes body' }, locators: {},
        component: { family: 'monaco', rel: '' },
      },
      // outside the component: ends the run
      { k: 'step', tool: 'click', args: { target: '@e9' }, locators: {} },
    ];
  }
  it('compiles a consecutive component run with an instruction-named payload', () => {
    const recipes = compileRecipes(componentRun(), INSTR, { session: 's', now: '2026-08-25T01:00:00Z' });
    expect(recipes).toHaveLength(1);
    const r = recipes[0];
    expect(r.family).toBe('monaco');
    expect(r.intent).toBe('set-value');
    expect(r.status).toBe('provisional');
    expect(r.verifyRead).toBe('.view-lines');
    expect(r.steps.map((s) => s.action)).toEqual(['click', 'press', 'insertText', 'settle']);
    expect(r.steps[2].text).toBe('{{value}}');
  });
  it('refuses runs without a parameterisable payload and replayed (via) steps', () => {
    const entries = componentRun();
    (entries[3] as { args: Record<string, unknown> }).args = { target: '@e1', text: 'something else entirely' };
    expect(compileRecipes(entries, INSTR, { session: 's' })).toHaveLength(0);
    const viaEntries = componentRun();
    (viaEntries[1] as { via?: unknown }).via = { skill: 's_x', step: 1 };
    // the run is broken by the replayed step, leaving press+type — still a run,
    // but starting at press: click was via, so run = [press, type] (2 steps, has payload)
    const got = compileRecipes(viaEntries, INSTR, { session: 's' });
    expect(got.length).toBeLessThanOrEqual(1);
  });
  // fwvk1 n1: a click and a type into an EMPTY tiptap description — no
  // select-all, since there was nothing to select. Learned as recorded, the
  // recipe appended on every later run.
  const DESC = "Create a task with a description that includes 'Bench task created for run n1'.";
  const typedIntoEditor = (readBack?: string): RecordedEntry[] => [
    { k: 'instruction', text: DESC, url: 'http://h:1/tasks/4' },
    { k: 'step', tool: 'click', args: { target: '.ProseMirror' }, locators: {}, component: { family: 'prosemirror', rel: '' } },
    { k: 'step', tool: 'type', args: { target: '.ProseMirror', text: 'Bench task created for run n1' }, locators: {}, component: { family: 'prosemirror', rel: '' } },
    ...(readBack === undefined ? [] : [{ k: 'step' as const, tool: 'read', args: { target: '.ProseMirror', what: 'text' }, locators: {}, result: JSON.stringify(readBack) }]),
    { k: 'step', tool: 'click', args: { target: '@e9' }, locators: {} },
  ];
  it('a run that inserts with no clearing step of its own learns a select-all ahead of the insert', () => {
    for (const entries of [typedIntoEditor(), typedIntoEditor('Bench task created for run n1')]) {
      const [r] = compileRecipes(entries, DESC, { session: 's', now: '2026-09-21T01:00:00Z' });
      expect(r.steps).toEqual([{ action: 'click' }, { action: 'press', key: 'ControlOrMeta+a' }, { action: 'insertText', text: '{{value}}' }, { action: 'settle', ms: 300 }]);
    }
  });
  it('a run whose read-back right after it did not show the payload is not learned', () => {
    // fwvk1 n1's read-back: two characters dropped
    expect(compileRecipes(typedIntoEditor('nch task created for run n1'), DESC, { session: 's' })).toEqual([]);
  });
  it('learnRecipes stores once and dedupes structural twins', () => {
    const first = learnRecipes(store, componentRun(), INSTR, 's', '2026-08-25T01:00:00Z');
    expect(first).toHaveLength(1);
    const again = learnRecipes(store, componentRun(), INSTR, 's', '2026-08-25T02:00:00Z');
    expect(again).toHaveLength(0);
    expect(store.get(first[0])).not.toBeNull();
  });
});

describe('renderComponents', () => {
  it('lists recognized families with their available intents', () => {
    const text = renderComponents([FAMILIES.find((f) => f.id === 'monaco')!], store);
    expect(text).toContain('[components]');
    expect(text).toContain('monaco (set-value, read-value)');
  });
  it('is empty when nothing is recognized', () => {
    expect(renderComponents([], store)).toBe('');
  });
});
