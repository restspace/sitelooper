import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { SpecCheckResult } from './check.js';

export const sourceHash = (source: string): string => createHash('sha256').update(source).digest('hex');

export interface RepairProposal {
  schemaVersion: 1;
  kind: 'sitelooper-repair';
  createdAt: string;
  target: string;
  originalHash: string;
  candidateHash: string;
  source: string;
  specFile: string;
  specHash: string;
  candidateFile: string;
  candidateSpec: string;
  changes: string[];
  liveExecutions: number;
  verification: SpecCheckResult | null;
}

/** Stage beside the user's spec so relative fixture imports retain their meaning. */
export function stageProposal(target: string, source: string): { flowFile: string; specFile: string; originalSpec: string; originalSpecHash: string } {
  const absolute = path.resolve(target);
  const base = path.basename(absolute, '.flow.ts');
  const originalSpec = path.join(path.dirname(absolute), `${base}.spec.ts`);
  if (!fs.existsSync(originalSpec)) throw new Error(`no sibling spec: ${originalSpec}`);
  const name = `${base}.proposal-${randomUUID().slice(0, 8)}`;
  const flowFile = path.join(path.dirname(absolute), `${name}.flow.ts`);
  const specFile = path.join(path.dirname(absolute), `${name}.spec.ts`);
  const original = fs.readFileSync(originalSpec, 'utf8');
  const moduleName = `./${base}.flow`;
  let count = 0;
  const scaffold = original.replace(/(['"])([^'"\r\n]+)\1/g, (whole, quote: string, value: string) => {
    if (![moduleName, `${moduleName}.ts`, `${moduleName}.js`].includes(value)) return whole;
    count++;
    return `${quote}./${name}.flow${value.slice(moduleName.length)}${quote}`;
  });
  if (!count) throw new Error(`the spec must import ${moduleName} to validate a staged repair`);
  fs.writeFileSync(flowFile, source, { flag: 'wx' });
  fs.writeFileSync(specFile, scaffold, { flag: 'wx' });
  return { flowFile, specFile, originalSpec, originalSpecHash: sourceHash(original) };
}

export function saveProposal(file: string, data: Omit<RepairProposal, 'schemaVersion' | 'kind' | 'createdAt' | 'candidateHash' | 'specHash'>): RepairProposal {
  const proposal: RepairProposal = {
    ...data, schemaVersion: 1, kind: 'sitelooper-repair', createdAt: new Date().toISOString(),
    candidateHash: sourceHash(data.source), specHash: sourceHash(fs.readFileSync(data.specFile, 'utf8')),
  };
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(proposal, null, 2) + '\n', { flag: 'wx' });
  return proposal;
}

/** Apply the exact checked candidate, refusing stale inputs or changed evidence. No browser run. */
export function applyProposal(file: string): { target: string; changes: string[]; liveExecutions: 0 } {
  const p = JSON.parse(fs.readFileSync(file, 'utf8')) as RepairProposal;
  if (p.schemaVersion !== 1 || p.kind !== 'sitelooper-repair' || typeof p.source !== 'string') throw new Error('unsupported repair proposal');
  if (!p.verification?.ran || !p.verification.passed || p.verification.timedOut || p.verification.skippedCount || p.verification.driftCount || p.verification.satisfied?.length) {
    throw new Error('proposal has no clean compiled-spec verification; create a new verified proposal');
  }
  if (sourceHash(p.source) !== p.candidateHash) throw new Error('proposal candidate changed after verification');
  if (sourceHash(fs.readFileSync(p.candidateFile, 'utf8')) !== p.candidateHash) throw new Error('staged candidate changed after verification');
  if (sourceHash(fs.readFileSync(p.target, 'utf8')) !== p.originalHash) throw new Error('target changed since proposal; create a new proposal');
  if (sourceHash(fs.readFileSync(p.specFile, 'utf8')) !== p.specHash) throw new Error('user spec changed since verification; create a new proposal');
  const temp = `${p.target}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, p.source, { flag: 'wx' });
  try { fs.renameSync(temp, p.target); } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return { target: p.target, changes: p.changes, liveExecutions: 0 };
}
