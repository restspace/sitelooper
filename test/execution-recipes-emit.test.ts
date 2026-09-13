import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_RECIPES, type RecipeProcedure } from '../src/execution/recipes.js';
import type { Flow } from '../src/skills/flow.js';
import { ComponentStore, seedRecipeId, seedRecipes, snapshotRecipes, type Recipe } from '../src/skills/components.js';
import { SkillStore, type Skill, type SkillStep } from '../src/skills/store.js';
import { emitFlowFile } from '../src/spec/emit.js';
import { compileFlow } from '../src/spec/index.js';
import { flowToSpec, type SpecFlow } from '../src/spec/ir.js';

/**
 * C7 stage B: the artifact's `fill`/`type`/`select` are adapters over the
 * shared recipe ladders (src/execution/recipes.ts), driven by a snapshot of
 * what the daemon's ComponentStore would have chosen when the flow was
 * compiled. Three things are pinned here that the emitter's own text tests
 * cannot: where the snapshot COMES FROM (the compiler, from the store the
 * daemon reads), what the compiler SAYS about store state a snapshot cannot
 * express, and what the emitted adapters DO when run — against fake locators,
 * from the whole helper block, embedded runner included.
 */

const ORIGIN = 'http://app.test';

const fillStep: SkillStep = { tool: 'fill', args: { target: '@e1', value: 'Notes' }, locators: { target: [{ kind: 'id', selector: '#ed' }] } };
const typeStep: SkillStep = { tool: 'type', args: { target: '@e1', text: 'abc' }, locators: { target: [{ kind: 'id', selector: '#ed' }] } };
const selectStep: SkillStep = { tool: 'select', args: { target: '@e1', option: 'Beta', optionValue: '2' }, locators: { target: [{ kind: 'id', selector: '#sel' }] } };

const skillOf = (steps: SkillStep[]): Skill => ({
  id: 's_edit',
  origin: ORIGIN,
  template: 'edit the notes',
  params: {},
  preconditions: { urlPattern: `${ORIGIN}/` },
  steps,
  stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
  status: 'validated',
  provenance: { session: 'test', instruction: 'edit the notes', created: 't' },
});

const flowOf = (): Flow => ({
  name: 'recipes-emit',
  origin: ORIGIN,
  startUrl: `${ORIGIN}/`,
  vars: [],
  steps: [{ id: '01-edit', instruction: 'edit the notes', skill: 's_edit', outputs: [], recorded: {} }],
  provenance: { session: 'test', created: 't' },
});

const specOf = (steps: SkillStep[], over: Partial<SpecFlow> = {}): SpecFlow => ({
  version: 1,
  name: 'recipes-emit',
  origin: ORIGIN,
  startUrl: `${ORIGIN}/`,
  vars: [],
  steps: [{ id: '01-edit', instruction: 'edit the notes', params: {}, outputs: [], segments: [{ id: 's_edit', template: 'edit the notes', params: {}, preconditions: { urlPattern: `${ORIGIN}/` }, steps }] }],
  ...over,
});

const learned = (over: Partial<Recipe> = {}): Recipe => ({
  id: 'r_learn1',
  family: 'monaco',
  intent: 'set-value',
  steps: [{ action: 'click' }, { action: 'insertText', text: '{{value}}' }, { action: 'settle', ms: 300 }],
  verifyRead: '.view-lines',
  status: 'validated',
  stats: { uses: 3, successes: 3, origins: { [ORIGIN]: 3 }, failStreak: 0, created: 't' },
  provenance: { session: 'sess-1', created: 't' },
  ...over,
});

const seedSnapshot = () => snapshotRecipes(seedRecipes()).recipes;

let tmp: string;
let skills: SkillStore;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-recipes-emit-'));
  skills = new SkillStore(path.join(tmp, 'skills'));
  skills.put(skillOf([fillStep, typeStep, selectStep]));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const componentsAt = (name: string, recipes: Recipe[]): ComponentStore => {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, JSON.stringify({ version: 1, recipes }));
  return new ComponentStore(file);
};

describe('the snapshot in the IR', () => {
  it('is taken from the component store the compiler is given, learned variants included, and travels in FLOW', () => {
    const { spec, diagnostics, warnings } = flowToSpec(flowOf(), skills, { components: componentsAt('learned.json', [learned()]) });
    expect(spec.recipes?.version).toBe(1);
    const monaco = spec.recipes!.recipes.find((r) => r.family === 'monaco' && r.intent === 'set-value');
    // the store's own choice, as a bare procedure: no status, stats or provenance
    expect(monaco).toEqual({ id: 'r_learn1', family: 'monaco', intent: 'set-value', steps: learned().steps, verifyRead: '.view-lines' });
    // every other (family, intent) is the seed the store merges in
    expect(spec.recipes!.recipes).toHaveLength(SEED_RECIPES.length);
    expect(spec.recipes!.recipes.find((r) => r.family === 'contenteditable')!.id).toBe(seedRecipeId('contenteditable', 'set-value'));
    // ...and the learned variant is diagnosed as knowledge from this machine travelling as data
    expect(diagnostics.filter((d) => d.code === 'recipe-snapshot')).toEqual([
      expect.objectContaining({
        code: 'recipe-snapshot',
        severity: 'warning',
        what: 'a learned component recipe travels in the compiled artifact as data',
        line: 'recipe snapshot: monaco/set-value: uses learned recipe r_learn1 learned in session sess-1 (validated) rather than the shipped seed; the artifact carries it as data',
      }),
    ]);
    expect(diagnostics.find((d) => d.code === 'recipe-snapshot')!.step).toBeUndefined();
    expect(warnings).toContain('recipe snapshot: monaco/set-value: uses learned recipe r_learn1 learned in session sess-1 (validated) rather than the shipped seed; the artifact carries it as data');
    // the emitted file embeds THAT snapshot, in FLOW and as the RECIPES constant
    const { source } = emitFlowFile(spec, { tier: 'plain', diagnostics });
    expect(source).toContain(`const RECIPES: RecipeSnapshot = ${JSON.stringify(spec.recipes)};`);
    expect(source).toContain('"id":"r_learn1"');
    const flow = /\/\/ @sitelooper-flow-begin\n([\s\S]*?)\n\/\/ @sitelooper-flow-end/.exec(source)![1];
    expect(JSON.parse(flow.replace(/^export const FLOW = /, '').replace(/;$/, '')).recipes).toEqual(spec.recipes);
  });

  it('omits a demoted seed, says so, and names a family left with nothing usable', () => {
    const seeds = seedRecipes();
    const cm = seeds.find((r) => r.family === 'codemirror6' && r.intent === 'set-value')!;
    cm.status = 'demoted';
    cm.stats.failStreak = 2;
    const { spec, diagnostics, warnings } = flowToSpec(flowOf(), skills, { components: componentsAt('demoted.json', [cm]) });
    expect(spec.recipes!.recipes.some((r) => r.family === 'codemirror6' && r.intent === 'set-value')).toBe(false);
    expect(spec.recipes!.recipes).toHaveLength(SEED_RECIPES.length - 1);
    const found = diagnostics.filter((d) => d.code === 'recipe-snapshot');
    expect(found.map((d) => d.line)).toEqual([
      `recipe snapshot: codemirror6/set-value: seed recipe ${cm.id} is demoted in the component store (2 consecutive verification failures); the snapshot omits it`,
      'recipe snapshot: codemirror6/set-value: no usable recipe; the artifact falls back to the native primitive on this family, as the daemon does today',
    ]);
    expect(found.map((d) => d.what)).toEqual([
      'a component recipe is demoted in the store, and the compiled artifact omits it for good',
      'a component family has no usable recipe, so the compiled artifact drives it with the native primitive for good',
    ]);
    // a warning, never a blocker: the artifact runs the daemon's own ladder, it only stops learning
    expect(found.every((d) => d.severity === 'warning')).toBe(true);
    expect(found.every((d) => d.fix?.startsWith('record the widget again'))).toBe(true);
    expect(found.every((d) => d.why.includes('The snapshot is compile-time state'))).toBe(true);
    expect(warnings.filter((w) => w.startsWith('recipe snapshot:'))).toHaveLength(2);
    // the artifact then carries no codemirror6 set-value recipe at all
    const { source } = emitFlowFile(spec, { tier: 'plain', diagnostics });
    expect(source).not.toContain('"family":"codemirror6","intent":"set-value"');
  });

  it('a flow that never fills, types or selects carries no snapshot and raises no recipe warning, even over a store that would', () => {
    const seeds = seedRecipes();
    const cm = seeds.find((r) => r.family === 'codemirror6' && r.intent === 'set-value')!;
    cm.status = 'demoted';
    cm.stats.failStreak = 2;
    const store = componentsAt('widgetless.json', [cm, learned()]);
    const clicks = new SkillStore(path.join(tmp, 'skills-clicks'));
    const click: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#go' }] } };
    clicks.put(skillOf([click]));
    const { spec, diagnostics, warnings } = flowToSpec(flowOf(), clicks, { components: store });
    expect(spec.recipes).toBeUndefined();
    expect(diagnostics.some((d) => d.code === 'recipe-snapshot')).toBe(false);
    expect(warnings.some((w) => w.startsWith('recipe snapshot:'))).toBe(false);
    // a fill only inside a loop body is still a fill: snapshot and warnings both
    const looped = new SkillStore(path.join(tmp, 'skills-looped'));
    looped.put(skillOf([{ tool: 'loop', args: {}, locators: {}, body: [click, fillStep], max: 3 }]));
    const inLoop = flowToSpec(flowOf(), looped, { components: store });
    expect(inLoop.spec.recipes?.version).toBe(1);
    expect(inLoop.diagnostics.filter((d) => d.code === 'recipe-snapshot')).toHaveLength(3);
    // ...and `type` / `select` alone count too
    for (const only of [typeStep, selectStep]) {
      const one = new SkillStore(path.join(tmp, `skills-${only.tool}`));
      one.put(skillOf([only]));
      expect(flowToSpec(flowOf(), one, { components: store }).spec.recipes?.version).toBe(1);
    }
  });

  it('a compile with no store carries no snapshot, and the emitter then embeds the shipped seeds', () => {
    const { spec, diagnostics } = flowToSpec(flowOf(), skills);
    expect(spec.recipes).toBeUndefined();
    expect(diagnostics.some((d) => d.code === 'recipe-snapshot')).toBe(false);
    const { source } = emitFlowFile(spec, { tier: 'plain', diagnostics });
    expect(source).toContain(`const RECIPES: RecipeSnapshot = ${JSON.stringify(seedSnapshot())};`);
    // an absent field still round-trips through FLOW as absent, not as null or seeds
    const flow = /\/\/ @sitelooper-flow-begin\n([\s\S]*?)\n\/\/ @sitelooper-flow-end/.exec(source)![1];
    expect(flow).not.toContain('"recipes"');
    expect(JSON.parse(flow.replace(/^export const FLOW = /, '').replace(/;$/, ''))).toEqual(JSON.parse(JSON.stringify(spec)));
  });

  it('compileFlow reads the store the daemon reads, and a fresh one is the seeds with nothing to diagnose', () => {
    const outDir = path.join(tmp, 'out');
    const flowFile = path.join(tmp, 'recipes-emit.json');
    fs.writeFileSync(flowFile, JSON.stringify(flowOf()));
    const fresh = compileFlow(flowFile, { store: skills, outDir, components: new ComponentStore(path.join(tmp, 'absent.json')) });
    expect(fresh.refused).toBe(false);
    expect(fresh.spec.recipes).toEqual(seedSnapshot());
    expect(fresh.diagnostics.some((d) => d.code === 'recipe-snapshot')).toBe(false);
    expect(fs.readFileSync(fresh.flowFile!, 'utf8')).toContain(`const RECIPES: RecipeSnapshot = ${JSON.stringify(seedSnapshot())};`);
    // the env var the daemon honours is the default the compiler honours
    const file = path.join(tmp, 'env.json');
    fs.writeFileSync(file, JSON.stringify({ version: 1, recipes: [learned()] }));
    const previous = process.env.SITELOOPER_COMPONENTS_FILE;
    process.env.SITELOOPER_COMPONENTS_FILE = file;
    try {
      const viaEnv = compileFlow(flowFile, { store: skills, outDir, overwriteSpec: true });
      expect(viaEnv.spec.recipes!.recipes.find((r) => r.family === 'monaco' && r.intent === 'set-value')!.id).toBe('r_learn1');
      expect(viaEnv.diagnostics.map((d) => d.code)).toContain('recipe-snapshot');
      expect(viaEnv.warnings.some((w) => w.startsWith('recipe snapshot: monaco/set-value: uses learned recipe r_learn1'))).toBe(true);
      // a warning: the write still happens, and the file is not blocked
      expect(viaEnv.refused).toBe(false);
      expect(viaEnv.compilable).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.SITELOOPER_COMPONENTS_FILE;
      else process.env.SITELOOPER_COMPONENTS_FILE = previous;
    }
  });
});

/**
 * The artifact's helper block — the embedded shared modules and the adapters
 * over them — cut WHOLE out of the emitted source and rebuilt together, so
 * `fill` runs against the very `fillWithRecipe`, `recognizeComponent`,
 * `settleDom` and `reactSafeFill` it will run against in a consumer's project.
 * (A helper cut in isolation fails closed, which reads as a pass.)
 */
function runnableHelpers(source: string, log: string[]): Record<string, (...args: unknown[]) => Promise<unknown>> {
  const block = /export const DRIFT: string\[\] = \[\];\n([\s\S]*?)\nexport const steps = \{/.exec(source);
  if (!block) throw new Error('helper block not found in the emitted source');
  const js = ts.transpileModule(block[1], { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const names = [...block[1].matchAll(/^(?:async )?function (\w+)/gm)].map((m) => m[1]);
  const build = new Function('DRIFT', 'console', `${js}\nreturn { ${names.join(', ')} };`) as (d: string[], c: unknown) => Record<string, (...args: unknown[]) => Promise<unknown>>;
  return build([], { warn: (line: string) => log.push(`warn ${line}`), log: (line: string) => log.push(line) });
}

/**
 * A page of fake locators, the shape test/execution-recipes.test.ts drives the
 * runner with — here driving the ARTIFACT's copy of it. A locator is its
 * description; `closest` says which family roots the target sits inside,
 * `shown` what the verification read sees. Every action is logged in order.
 */
class World {
  calls: string[] = [];
  closest = new Set<string>();
  shown: { innerText: string } | { value: string } = { innerText: '' };
  page: unknown;
  constructor() {
    this.page = {
      keyboard: {
        press: async (key: string) => void this.calls.push(`press ${key}`),
        insertText: async (text: string) => void this.calls.push(`insertText ${text}`),
      },
      locator: (sel: string) => this.loc(`page>>${sel}`),
      // settleDom's one evaluate: the DOM is quiet at once
      evaluate: async () => void this.calls.push('settle'),
      url: () => `${ORIGIN}/edit`,
    };
  }
  loc(desc: string): unknown {
    const world = this;
    return {
      desc,
      page: () => world.page,
      locator: (sel: string) => world.loc(`${desc}>>${sel}`),
      and: (other: { desc: string }) => world.loc(`${desc}&${other.desc}`),
      first: () => world.loc(`${desc}.first`),
      last: () => world.loc(`${desc}.last`),
      filter: (o: { hasText: string }) => world.loc(`${desc}[hasText=${o.hasText}]`),
      count: async () => 1,
      waitFor: async (o: { state: string }) => void world.calls.push(`waitFor ${desc} ${o.state}`),
      scrollIntoViewIfNeeded: async () => void world.calls.push(`scroll ${desc}`),
      click: async () => void world.calls.push(`click ${desc}`),
      fill: async (text: string) => void world.calls.push(`fill ${desc} ${text}`),
      selectOption: async (o: unknown) => {
        world.calls.push(`selectOption ${desc} ${JSON.stringify(o)}`);
        return ['chosen'];
      },
      pressSequentially: async (text: string, o: unknown) => void world.calls.push(`pressSequentially ${desc} ${text} ${JSON.stringify(o)}`),
      evaluate: async (fn: (el: unknown, arg: unknown) => unknown, arg: unknown) => {
        world.calls.push(`evaluate ${desc}`);
        return fn(world.element(desc), arg);
      },
      // recognition resolves the target once, as a handle
      elementHandle: async () => {
        world.calls.push(`elementHandle ${desc}`);
        return world.handle(desc);
      },
    };
  }
  element(desc: string): unknown {
    if (desc === 'target') return { closest: (sel: string) => (this.closest.has(sel) ? { root: sel } : null) };
    return { ...this.shown, matches: (sel: string) => desc === `root(${sel})`, blur: () => void this.calls.push(`blur ${desc}`) };
  }
  /** A pinned element handle: the recognised root, or an element found inside it. */
  handle(desc: string): unknown {
    const world = this;
    return {
      desc,
      $: async (sel: string) => world.handle(`${desc}>>${sel}`),
      click: async () => void world.calls.push(`click ${desc}`),
      fill: async (text: string) => void world.calls.push(`fill ${desc} ${text}`),
      evaluate: async (fn: (el: unknown, arg: unknown) => unknown, arg: unknown) => {
        world.calls.push(`evaluate ${desc}`);
        return fn(world.element(desc), arg);
      },
      // pins the root element the in-page closest() found
      evaluateHandle: async (fn: (el: unknown, arg: unknown) => unknown, arg: unknown) => {
        world.calls.push(`evaluateHandle ${desc}`);
        const hit = fn(world.element(desc), arg) as { root: string } | null;
        return { asElement: () => (hit ? world.handle(`root(${hit.root})`) : null), dispose: async () => void world.calls.push(`dispose jshandle ${desc}`) };
      },
      dispose: async () => void world.calls.push(`dispose ${desc}`),
    };
  }
}

describe('the emitted adapters, run from the whole helper block', () => {
  const source = emitFlowFile(specOf([fillStep, typeStep, selectStep]), { tier: 'plain' }).source;
  const monacoId = seedRecipeId('monaco', 'set-value');
  const comboId = seedRecipeId('aria-combobox', 'select-option');

  it('fill: a recognized editor gets its recipe, verified on the widget, and the native setter never runs', async () => {
    const w = new World();
    w.closest.add('.monaco-editor');
    w.shown = { innerText: 'line one\nnotes for run x77' };
    const log: string[] = [];
    const { fill } = runnableHelpers(source, log);
    await fill(w.loc('target'), 'notes for run x77');
    // recognition first, as the daemon does (no visibility wait ahead of it), then
    // the daemon's own step order through the embedded runner, on the pinned root
    expect(w.calls.slice(0, 5)).toEqual(['elementHandle target', 'evaluateHandle target', 'evaluate root(.monaco-editor)', 'dispose target', 'click root(.monaco-editor)']);
    expect(w.calls.some((c) => c.startsWith('waitFor'))).toBe(false);
    expect(w.calls).toContain('blur root(.monaco-editor)>>textarea');
    expect(w.calls.at(-1)).toBe('dispose root(.monaco-editor)');
    expect(w.calls).toContain('press ControlOrMeta+a');
    expect(w.calls).toContain('insertText notes for run x77');
    expect(w.calls).toContain('press Escape');
    expect(w.calls.filter((c) => c === 'settle')).toHaveLength(2);
    expect(w.calls.some((c) => c.startsWith('fill '))).toBe(false);
    // ...reported in the daemon's words
    expect(log).toEqual([`[sitelooper recipe] filled via recipe monaco/set-value (${monacoId}); value verified on the component`]);
  });

  it('fill: an unverified recipe falls back to reactSafeFill on the same target, silently', async () => {
    const w = new World();
    w.closest.add('.monaco-editor');
    w.shown = { innerText: 'the default markdown' };
    const log: string[] = [];
    const { fill } = runnableHelpers(source, log);
    await fill(w.loc('target'), 'v');
    expect(w.calls).toContain('insertText v');
    // reactSafeFill: the fake element has no value setter, so Playwright's own fill is the last resort
    expect(w.calls.at(-1)).toBe('fill target v');
    expect(log).toEqual([]);
  });

  it('fill: a plain input never reaches the recipe half beyond recognition', async () => {
    const w = new World();
    const log: string[] = [];
    const { fill } = runnableHelpers(source, log);
    await fill(w.loc('target'), 'v');
    // recognition, then reactSafeFill's own visible-wait: the only one
    expect(w.calls).toEqual(['elementHandle target', 'evaluateHandle target', 'dispose jshandle target', 'dispose target', 'waitFor target visible', 'scroll target', 'click target', 'evaluate target', 'fill target v']);
    expect(log).toEqual([]);
  });

  it("type: the set-value recipe for a recognized widget, else pressSequentially with tools.ts's timeout and delay", async () => {
    const w = new World();
    w.closest.add('[contenteditable="true"]');
    w.shown = { innerText: 'typed body' };
    const log: string[] = [];
    const { type } = runnableHelpers(source, log);
    await type(w.loc('target'), 'typed body');
    expect(w.calls).toContain('insertText typed body');
    expect(w.calls.some((c) => c.startsWith('pressSequentially'))).toBe(false);
    expect(log).toEqual([`[sitelooper recipe] filled via recipe contenteditable/set-value (${seedRecipeId('contenteditable', 'set-value')}); value verified on the component`]);
    const plain = new World();
    await runnableHelpers(source, log).type(plain.loc('target'), 'abc');
    expect(plain.calls.at(-1)).toBe('pressSequentially target abc {"timeout":10000,"delay":20}');
    await runnableHelpers(source, log).type(plain.loc('target'), 'abc', { delay: 50 });
    expect(plain.calls.at(-1)).toBe('pressSequentially target abc {"timeout":10000,"delay":50}');
  });

  it('select: the select-option recipe for an aria-combobox, else reactSafeSelect with the recorded fallback', async () => {
    const w = new World();
    w.closest.add('[role="combobox"]');
    w.shown = { value: 'apricot x1' };
    const log: string[] = [];
    const { select } = runnableHelpers(source, log);
    await select(w.loc('target'), 'apricot x1', 'id-9');
    expect(w.calls).toContain('insertText apricot x1');
    expect(w.calls).toContain('click page>>[role="option"][hasText=apricot x1].first');
    expect(w.calls.some((c) => c.startsWith('selectOption'))).toBe(false);
    expect(log).toEqual([`[sitelooper recipe] selected via recipe aria-combobox/select-option (${comboId}); value verified on the component`]);
    // a native <select> is outside every family: reactSafeSelect, label first
    const native = new World();
    await runnableHelpers(source, log).select(native.loc('target'), 'Beta', '2');
    expect(native.calls.filter((c) => c.startsWith('selectOption'))).toEqual(['selectOption target {"label":"Beta"}']);
  });

  it('the book is the embedded snapshot: a family with no recipe in it falls straight to the native primitive', async () => {
    const only: RecipeProcedure = { id: 'r_combo', ...SEED_RECIPES.find((s) => s.family === 'aria-combobox')! };
    const narrowed = emitFlowFile(specOf([fillStep, typeStep, selectStep], { recipes: { version: 1, recipes: [only] } }), { tier: 'plain' }).source;
    const w = new World();
    w.closest.add('.monaco-editor');
    w.shown = { innerText: 'v' };
    const log: string[] = [];
    await runnableHelpers(narrowed, log).fill(w.loc('target'), 'v');
    // no set-value recipe offered at all: recognition is skipped, straight to reactSafeFill
    expect(w.calls).toEqual(['waitFor target visible', 'scroll target', 'click target', 'evaluate target', 'fill target v']);
    expect(log).toEqual([]);
  });
});
