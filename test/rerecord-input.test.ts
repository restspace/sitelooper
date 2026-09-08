import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadFlowFile, saveFlow, type Flow } from '../src/skills/flow.js';
import { SkillStore, type Skill } from '../src/skills/store.js';
import { compileFlow, exportFlowBundle, loadFlowBundle } from '../src/spec/index.js';
import { persistRerecordInput, resolveRerecordInput, stageRerecordInput } from '../src/spec/rerecord-input.js';

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
