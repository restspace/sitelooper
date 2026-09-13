import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadFlowFile, saveFlow, type Flow } from '../src/skills/flow.js';
import { SkillStore, type Skill } from '../src/skills/store.js';
import { compileFlow, exportFlowBundle, loadFlowBundle } from '../src/spec/index.js';
import { persistRerecordInput, resolveRerecordInput, stageRerecordInput } from '../src/spec/rerecord-input.js';
import { FINGERPRINT_DIMS } from '../src/execution/fingerprint.js';
import { ComponentStore, seedRecipeId, seedRecipes, snapshotRecipes, type Recipe } from '../src/skills/components.js';

const dirs: string[] = [];
const originalSkillsDir = process.env.SITELOOPER_SKILLS_DIR;
const originalFlowsDir = process.env.SITELOOPER_FLOWS_DIR;
afterEach(() => {
  if (originalSkillsDir === undefined) delete process.env.SITELOOPER_SKILLS_DIR;
  else process.env.SITELOOPER_SKILLS_DIR = originalSkillsDir;
  if (originalFlowsDir === undefined) delete process.env.SITELOOPER_FLOWS_DIR;
  else process.env.SITELOOPER_FLOWS_DIR = originalFlowsDir;
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function temp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-rerecord-input-'));
  dirs.push(dir);
  return dir;
}

function fixture(dir: string): { flow: Flow; flowFile: string; store: SkillStore } {
  const store = new SkillStore(path.join(dir, 'skills'));
  const skill: Skill = {
    id: 's_old', origin: 'http://app.test', template: 'open items', params: {},
    preconditions: { urlPattern: 'http://app.test/' },
    steps: [{ tool: 'goto', args: { url: 'http://app.test/items' }, locators: {} }],
    stats: { uses: 2, successes: 2, partial: 0, created: '2026-09-07T00:00:00.000Z', failedAtStep: {}, fallthroughs: 0 },
    status: 'validated',
    provenance: { session: 'author', instruction: 'open items', created: '2026-09-07T00:00:00.000Z' },
  };
  store.put(skill);
  const flow: Flow = {
    name: 'items', origin: skill.origin, startUrl: `${skill.origin}/`, vars: [],
    steps: [{ id: '01-open', instruction: 'open items', skill: skill.id, outputs: [], recorded: {} }],
    provenance: { session: 'author', created: '2026-09-07T00:00:00.000Z' },
  };
  return { flow, flowFile: saveFlow(flow, path.join(dir, 'items.json')), store };
}

function repin(staged: ReturnType<typeof stageRerecordInput>, id = 's_new'): void {
  const old = staged.store.get('s_old')!;
  staged.store.put({ ...old, id, template: 'open the item list again' });
  const flow = loadFlowFile(staged.flowFile)!.flow;
  flow.steps[0].skill = id;
  saveFlow(flow, staged.flowFile);
}

describe('rerecord artifact input', () => {
  it('uses a raw flow and the existing procedure store in place', () => {
    const dir = temp();
    const { flow, flowFile, store } = fixture(dir);
    process.env.SITELOOPER_SKILLS_DIR = store.dir;
    const input = resolveRerecordInput(flowFile);
    expect(input.kind).toBe('flow');
    const patched = { ...flow, steps: [{ ...flow.steps[0], instruction: 'changed instruction' }] };
    const staged = stageRerecordInput(input, patched);
    expect(staged.flowFile).toBe(path.resolve(flowFile));
    expect(staged.skillsDir).toBe(store.dir);
    expect(loadFlowFile(flowFile)!.flow.steps[0].instruction).toBe('changed instruction');
    expect(persistRerecordInput(input, staged, true)).toEqual({ file: path.resolve(flowFile), wrote: false });
  });

  it('repackages a successful bundle rerecord with its new pin and keeps failed evidence isolated', () => {
    const dir = temp();
    const { flowFile, store } = fixture(dir);
    const bundleFile = path.join(dir, 'procedures.json');
    exportFlowBundle(flowFile, { outFile: bundleFile, store });
    const input = resolveRerecordInput(bundleFile);
    expect(input.kind).toBe('bundle');
    const staged = stageRerecordInput(input, input.flow);
    expect(staged.workspace).toBeTruthy();
    expect(staged.skillsDir).not.toBe(store.dir);
    repin(staged);

    const before = fs.readFileSync(bundleFile, 'utf8');
    expect(persistRerecordInput(input, staged, false).wrote).toBe(false);
    expect(fs.readFileSync(bundleFile, 'utf8')).toBe(before);
    expect(fs.existsSync(staged.flowFile)).toBe(true);

    expect(persistRerecordInput(input, staged, true).wrote).toBe(true);
    const saved = loadFlowBundle(bundleFile);
    expect(saved.flow.steps[0].skill).toBe('s_new');
    expect(saved.skills.map((skill) => skill.id)).toEqual(['s_new']);
  });

  it('re-emits a successful compiled input without touching its sibling user spec', () => {
    const dir = temp();
    const { flowFile, store } = fixture(dir);
    const out = path.join(dir, 'generated');
    const compiled = compileFlow(flowFile, { store, outDir: out });
    const userSpec = compiled.specFile!;
    fs.appendFileSync(userSpec, '\n// user assertion\n');
    const userSource = fs.readFileSync(userSpec, 'utf8');
    const original = fs.readFileSync(compiled.flowFile!, 'utf8');

    const input = resolveRerecordInput(compiled.flowFile!);
    expect(input.kind).toBe('compiled');
    const staged = stageRerecordInput(input, input.flow);
    repin(staged);
    expect(persistRerecordInput(input, staged, false).wrote).toBe(false);
    expect(fs.readFileSync(compiled.flowFile!, 'utf8')).toBe(original);

    expect(persistRerecordInput(input, staged, true).wrote).toBe(true);
    expect(fs.readFileSync(compiled.flowFile!, 'utf8')).toContain('s_new');
    expect(fs.readFileSync(userSpec, 'utf8')).toBe(userSource);
  });

  it('can resolve a flow name from the configured snapshot fallback', () => {
    const dir = temp();
    const { flowFile, store } = fixture(dir);
    const bundleFile = path.join(dir, 'procedures.json');
    exportFlowBundle(flowFile, { outFile: bundleFile, store });
    const input = resolveRerecordInput('items', bundleFile);
    expect(input.kind).toBe('bundle');
    expect(input.file).toBe(path.resolve(bundleFile));
  });

  it('prefers the project snapshot to a same-named flow in the global store', () => {
    const dir = temp();
    const project = path.join(dir, 'project');
    const global = path.join(dir, 'global-flows');
    const { flow, flowFile, store } = fixture(project);
    const bundleFile = path.join(project, 'procedures.json');
    exportFlowBundle(flowFile, { outFile: bundleFile, store });
    saveFlow({ ...flow, origin: 'http://stale-global.test' }, path.join(global, 'items.json'));
    process.env.SITELOOPER_FLOWS_DIR = global;

    const input = resolveRerecordInput('items', bundleFile);
    expect(input.kind).toBe('bundle');
    expect(input.flow.origin).toBe('http://app.test');
  });
});

// A compiled file carries each segment's page fingerprint; a rerecord re-emits
// from the store its run used, so the vector is carried unless that store's
// skill recorded a different one.
describe('rerecord of a compiled input: the page fingerprint', () => {
  const flowRegion = (source: string) => /\/\/ @sitelooper-flow-begin\n([\s\S]*?)\n\/\/ @sitelooper-flow-end/.exec(source)![1];
  const vector = (k: number) => Array.from({ length: FINGERPRINT_DIMS }, (_, i) => (i % k === 0 ? 0.3 : 0));

  function compiledWithFingerprint(dir: string): string {
    const { flow, store } = fixture(dir);
    const skill = store.get('s_old')!;
    store.put({
      ...skill,
      preconditions: { urlPattern: 'http://app.test/', fingerprint: vector(4) },
      steps: [{ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#open' }] } }],
    }, { overwrite: true });
    const flowFile = saveFlow(flow, path.join(dir, 'items.json'));
    const compiled = compileFlow(flowFile, { store, outDir: path.join(dir, 'generated') });
    expect(compiled.spec.steps[0].segments[0].preconditions.fingerprint).toEqual(vector(4));
    return compiled.flowFile!;
  }

  it('keeps the file\'s vector: no change line, and the FLOW is byte-equal', () => {
    const dir = temp();
    const file = compiledWithFingerprint(dir);
    const original = fs.readFileSync(file, 'utf8');
    const input = resolveRerecordInput(file);
    expect(input.skills![0].preconditions.fingerprint).toEqual(vector(4));
    const staged = stageRerecordInput(input, input.flow);
    const persisted = persistRerecordInput(input, staged, true);
    expect(persisted).toMatchObject({ wrote: true, recipeChanges: [], diagnostics: [] });
    expect(flowRegion(fs.readFileSync(file, 'utf8'))).toBe(flowRegion(original));
  });

  it('adopts the vector a re-recorded skill measured, and says so', () => {
    const dir = temp();
    const file = compiledWithFingerprint(dir);
    const input = resolveRerecordInput(file);
    const staged = stageRerecordInput(input, input.flow);
    const old = staged.store.get('s_old')!;
    staged.store.put({ ...old, preconditions: { ...old.preconditions, fingerprint: vector(6) } }, { overwrite: true });
    const persisted = persistRerecordInput(input, staged, true);
    expect(persisted.recipeChanges).toEqual([
      "fingerprint: 01-open segment s_old carries the start-page fingerprint the verification run's skill recorded (it differs from the file's)",
    ]);
    expect(resolveRerecordInput(file).skills![0].preconditions.fingerprint).toEqual(vector(6));
  });
});

// A rerecord verifies through the daemon, whose recipes are the machine's
// component store (plus whatever the run itself learned). The rewritten
// compiled file carries THAT snapshot, and reports the move.
describe('rerecord of a compiled input: the recipe snapshot', () => {
  const flowRegion = (source: string) => /\/\/ @sitelooper-flow-begin\n([\s\S]*?)\n\/\/ @sitelooper-flow-end/.exec(source)![1];
  const learned: Recipe = {
    id: 'r_learn1', family: 'monaco', intent: 'set-value',
    steps: [{ action: 'click' }, { action: 'insertText', text: '{{value}}' }, { action: 'settle', ms: 300 }],
    verifyRead: '.view-lines', status: 'validated',
    stats: { uses: 3, successes: 3, origins: { 'http://app.test': 3 }, failStreak: 0, created: 't' },
    provenance: { session: 'rerecord-run', created: 't' },
  };
  const components = (dir: string, recipes: Recipe[]): ComponentStore => {
    const file = path.join(dir, `components-${recipes.length}.json`);
    if (recipes.length) fs.writeFileSync(file, JSON.stringify({ version: 1, recipes }));
    return new ComponentStore(file);
  };

  /** A compiled flow whose one step fills, snapshotted from a seeds-only store. */
  function compiledWithFill(dir: string): string {
    const { flow, store } = fixture(dir);
    const skill = store.get('s_old')!;
    store.put({ ...skill, steps: [...skill.steps, { tool: 'fill', args: { target: '@e1', value: 'notes' }, locators: { target: [{ kind: 'id', selector: '#notes' }] } }] }, { overwrite: true });
    const flowFile = saveFlow(flow, path.join(dir, 'items.json'));
    const compiled = compileFlow(flowFile, { store, outDir: path.join(dir, 'generated'), components: components(dir, []) });
    expect(compiled.spec.recipes).toEqual(snapshotRecipes(seedRecipes()).recipes);
    return compiled.flowFile!;
  }

  it('adopts the store the run used when it differs, and says which recipe moved', () => {
    const dir = temp();
    const file = compiledWithFill(dir);
    const input = resolveRerecordInput(file);
    expect(input.recipes).toEqual(snapshotRecipes(seedRecipes()).recipes);
    const staged = stageRerecordInput(input, input.flow);
    const persisted = persistRerecordInput(input, staged, true, components(dir, [learned]));
    expect(persisted.wrote).toBe(true);
    expect(persisted.recipeChanges).toEqual([`recipes: monaco/set-value ${seedRecipeId('monaco', 'set-value')} -> r_learn1`]);
    expect(persisted.diagnostics!.map((d) => d.code)).toEqual(['recipe-snapshot']);
    const written = fs.readFileSync(file, 'utf8');
    expect(flowRegion(written)).toContain('"id": "r_learn1"');
    expect(resolveRerecordInput(file).recipes!.recipes.find((r) => r.family === 'monaco' && r.intent === 'set-value')!.id).toBe('r_learn1');
  });

  it('keeps an identical snapshot: no change line, and the FLOW is byte-equal', () => {
    const dir = temp();
    const file = compiledWithFill(dir);
    const original = fs.readFileSync(file, 'utf8');
    const input = resolveRerecordInput(file);
    const staged = stageRerecordInput(input, input.flow);
    const persisted = persistRerecordInput(input, staged, true, components(dir, []));
    expect(persisted).toMatchObject({ wrote: true, recipeChanges: [], diagnostics: [] });
    expect(flowRegion(fs.readFileSync(file, 'utf8'))).toBe(flowRegion(original));
  });
});
