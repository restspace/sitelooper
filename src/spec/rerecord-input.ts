import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadFlowFile, saveFlow, type Flow } from '../skills/flow.js';
import { SkillStore, skillsDir as globalSkillsDir, type Skill } from '../skills/store.js';
import { compilerProvenance, exportFlowBundle, isFlowBundle, loadFlowBundle } from './bundle.js';
import { emitFlowFile } from './emit.js';
import { flowToSpec } from './ir.js';
import { liftFlowFile } from './lift.js';
import { specToFlow } from './lower.js';

export interface RerecordInput {
  flow: Flow;
  /** Persistent source artifact: raw flow JSON, procedure snapshot, or generated .flow.ts. */
  file: string;
  kind: 'flow' | 'bundle' | 'compiled';
  /** Present when the source artifact carries its procedures. */
  skills?: Skill[];
}

export interface StagedRerecordInput {
  flowFile: string;
  skillsDir: string;
  store: SkillStore;
  /** Isolated evidence is intentionally retained when a bundle/compiled rerecord fails. */
  workspace?: string;
}

function fromBundle(file: string): RerecordInput | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (!isFlowBundle(raw)) return null;
  return { flow: raw.flow, file: path.resolve(file), kind: 'bundle', skills: raw.skills };
}

function fromCompiled(file: string): RerecordInput | null {
  let source: string;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  try {
    const lowered = specToFlow(liftFlowFile(source).spec);
    return { flow: lowered.flow, file: path.resolve(file), kind: 'compiled', skills: lowered.skills };
  } catch {
    return null;
  }
}

/** Resolve every artifact diagnostics may name back into the replayable Flow shape. */
export function resolveRerecordInput(nameOrPath: string, snapshotFile?: string): RerecordInput {
  if (fs.existsSync(nameOrPath)) {
    const bundle = fromBundle(nameOrPath);
    if (bundle) return bundle;
    const compiled = fromCompiled(nameOrPath);
    if (compiled) return compiled;
    const direct = loadFlowFile(nameOrPath);
    if (direct?.flow && typeof direct.flow.name === 'string' && Array.isArray(direct.flow.steps)) {
      return { flow: direct.flow, file: path.resolve(direct.file), kind: 'flow' };
    }
    // An explicit existing path is authoritative. Falling through to a
    // same-named project snapshot would conceal a corrupt artifact.
    throw new Error(`${JSON.stringify(nameOrPath)} is not a flow JSON, procedure snapshot, or generated .flow.ts`);
  }

  if (snapshotFile && fs.existsSync(snapshotFile)) {
    const bundle = loadFlowBundle(snapshotFile);
    const requested = path.basename(nameOrPath, path.extname(nameOrPath));
    if (bundle.flow.name === nameOrPath || bundle.flow.name === requested) {
      return { flow: bundle.flow, file: path.resolve(snapshotFile), kind: 'bundle', skills: bundle.skills };
    }
  }

  const loaded = loadFlowFile(nameOrPath);
  // loadFlowFile intentionally accepts arbitrary JSON. Avoid labelling a
  // malformed object as a raw Flow merely because JSON.parse worked.
  if (loaded?.flow && typeof loaded.flow.name === 'string' && Array.isArray(loaded.flow.steps)) {
    return { flow: loaded.flow, file: path.resolve(loaded.file), kind: 'flow' };
  }
  throw new Error(`no rerecordable flow ${JSON.stringify(nameOrPath)} (expected a flow JSON, procedure snapshot, or generated .flow.ts)`);
}

/**
 * Put an unpinned flow where the ordinary daemon runner can update it.
 * Raw flows already own a store and file; self-contained artifacts use a
 * scratch store so rerecording cannot mutate the user's global procedures.
 */
export function stageRerecordInput(input: RerecordInput, patchedFlow: Flow): StagedRerecordInput {
  if (input.kind === 'flow') {
    saveFlow(patchedFlow, input.file);
    const skillsDir = globalSkillsDir();
    return { flowFile: input.file, skillsDir, store: new SkillStore(skillsDir) };
  }

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'sitelooper-rerecord-'));
  const skillsDir = path.join(workspace, 'skills');
  const store = new SkillStore(skillsDir);
  // Importing into a brand-new temp store, from procedures that may carry a
  // revision belonging to whatever store exported them. Comparing those
  // numbers against this one's would be comparing two unrelated histories.
  for (const skill of input.skills ?? []) store.put(skill, { overwrite: true });
  const flowFile = saveFlow(patchedFlow, path.join(workspace, `${safeName(patchedFlow.name)}.json`));
  return { flowFile, skillsDir, store, workspace };
}

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_') || 'flow';
}

function stagedFlow(staged: StagedRerecordInput): Flow {
  const loaded = loadFlowFile(staged.flowFile);
  if (!loaded) throw new Error(`staged rerecord flow disappeared: ${staged.flowFile}`);
  return loaded.flow;
}

/** Persist only the artifact type the caller supplied; never touch a sibling user spec. */
export function persistRerecordInput(
  input: RerecordInput,
  staged: StagedRerecordInput,
  success: boolean,
): { file: string; wrote: boolean } {
  if (input.kind === 'flow') return { file: input.file, wrote: false };
  if (!success) return { file: input.file, wrote: false };

  if (input.kind === 'bundle') {
    exportFlowBundle(staged.flowFile, { outFile: input.file, store: staged.store });
    return { file: input.file, wrote: true };
  }

  const flow = stagedFlow(staged);
  const { spec, diagnostics } = flowToSpec(flow, staged.store, { flowFile: input.file });
  const emitted = emitFlowFile(spec, { tier: 'plain', diagnostics });
  const compiler = compilerProvenance();
  const source = `// Generated by ${compiler.name} ${compiler.version}\n${emitted.source}`;
  const tmp = `${input.file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, source);
  fs.renameSync(tmp, input.file);
  return { file: input.file, wrote: true };
}
