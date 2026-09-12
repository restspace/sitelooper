import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFlowFile, type Flow } from '../skills/flow.js';
import { SKILL_CONTRACT, SkillStore, contractOf, contractVerdict, type Skill } from '../skills/store.js';

export interface CompilerProvenance {
  name: 'sitelooper';
  version: string;
}

export interface FlowBundle {
  kind: 'sitelooper-flow-bundle';
  schemaVersion: 1;
  compiler: CompilerProvenance;
  exportedAt: string;
  flow: Flow;
  skills: Skill[];
}

export interface ExportFlowBundleResult {
  file: string;
  bundle: FlowBundle;
  missingSkills: string[];
}

let packageVersion: string | undefined;

export function compilerProvenance(): CompilerProvenance {
  if (!packageVersion) {
    try {
      const here = path.dirname(fileURLToPath(import.meta.url));
      packageVersion = String(JSON.parse(fs.readFileSync(path.resolve(here, '../../package.json'), 'utf8')).version);
    } catch {
      packageVersion = 'unknown';
    }
  }
  return { name: 'sitelooper', version: packageVersion };
}

export function isFlowBundle(value: unknown): value is FlowBundle {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<FlowBundle>;
  return v.kind === 'sitelooper-flow-bundle' && v.schemaVersion === 1 && Boolean(v.flow) && Array.isArray(v.skills);
}

export function loadFlowBundle(file: string): FlowBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`cannot read procedure snapshot ${JSON.stringify(file)}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isFlowBundle(parsed)) throw new Error(`${JSON.stringify(file)} is not a Sitelooper procedure snapshot`);
  // BundleSkillStore serves its procedures from this array and never goes
  // through SkillStore's reader, so the contract check has to happen at the
  // boundary. Throwing beats filtering: a silently dropped entry surfaces
  // later as a missing-procedure diagnostic, which blames the snapshot for
  // being incomplete when the real answer is that it is too new to read.
  //
  // The snapshot's own schemaVersion is a separate question and stays 1: a v1
  // snapshot may legitimately carry procedures of any contract.
  const tooNew = parsed.skills.filter((s) => !contractVerdict(s).ok);
  if (tooNew.length) {
    const shown = tooNew.slice(0, 3).map((s) => `${s.id} (contract ${contractOf(s)})`).join(', ');
    throw new Error(
      `${JSON.stringify(file)} holds ${tooNew.length} procedure(s) this build cannot run — ` +
        `${shown}${tooNew.length > 3 ? ', …' : ''}; this build reads up to contract ${SKILL_CONTRACT}. Upgrade sitelooper.`,
    );
  }
  return parsed;
}

/** A read-only SkillStore view over a portable bundle. */
export class BundleSkillStore extends SkillStore {
  constructor(readonly bundle: FlowBundle) {
    super('');
  }

  override origins(): string[] {
    return [...new Set(this.bundle.skills.map((skill) => skill.origin))];
  }

  override list(origin: string): Skill[] {
    return this.bundle.skills.filter((skill) => skill.origin === origin);
  }

  override all(): Skill[] {
    return [...this.bundle.skills];
  }

  override get(id: string): Skill | null {
    return this.bundle.skills.find((skill) => skill.id === id) ?? null;
  }

  override put(): void {
    throw new Error('a procedure snapshot is read-only');
  }
}

function includedSkills(flow: Flow, store: SkillStore): { skills: Skill[]; missing: string[] } {
  const selected = new Map<string, Skill>();
  const missing = new Set<string>();
  for (const step of flow.steps) {
    if (!step.skill) continue;
    const pinned = store.get(step.skill);
    if (!pinned) {
      missing.add(step.skill);
      continue;
    }
    if (!pinned.seq) {
      selected.set(pinned.id, pinned);
      continue;
    }
    const chain = store.list(pinned.origin).filter((candidate) => candidate.seq?.chain === pinned.seq?.chain);
    for (const member of chain.length ? chain : [pinned]) selected.set(member.id, member);
  }
  return { skills: [...selected.values()].sort((a, b) => a.id.localeCompare(b.id)), missing: [...missing].sort() };
}

/** Export the flow and every pinned procedure segment needed to compile it on another machine. */
export function exportFlowBundle(
  flowNameOrPath: string,
  options: { outFile: string; store?: SkillStore; now?: string },
): ExportFlowBundleResult {
  const loaded = loadFlowFile(flowNameOrPath);
  if (!loaded) throw new Error(`no flow named ${JSON.stringify(flowNameOrPath)} (looked in the flows dir and as a path)`);
  const { skills, missing } = includedSkills(loaded.flow, options.store ?? new SkillStore());
  const bundle: FlowBundle = {
    kind: 'sitelooper-flow-bundle',
    schemaVersion: 1,
    compiler: compilerProvenance(),
    exportedAt: options.now ?? new Date().toISOString(),
    flow: loaded.flow,
    skills,
  };
  const file = path.resolve(options.outFile);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(bundle, null, 2));
  fs.renameSync(tmp, file);
  return { file, bundle, missingSkills: missing };
}
