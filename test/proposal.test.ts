import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyProposal, saveProposal, sourceHash, stageProposal } from '../src/spec/proposal.js';
import type { SpecCheckResult } from '../src/spec/check.js';

let dir: string;
let target: string;
const original = 'export const value = 1;';
const repaired = 'export const value = 2;';
const verification = { ran: true, passed: true, driftCount: 0, satisfied: [] } as unknown as SpecCheckResult;
beforeEach(() => {
  dir = fs.mkdtempSync(path.resolve('test/.proposal-test-'));
  target = path.join(dir, 'demo.flow.ts');
  fs.writeFileSync(target, original);
  fs.writeFileSync(path.join(dir, 'demo.spec.ts'), "import { test } from './fixtures';\nimport { value } from './demo.flow';\n");
});
afterEach(() => {
  expect(path.dirname(dir)).toBe(path.resolve('test'));
  expect(path.basename(dir)).toMatch(/^\.proposal-test-/);
  fs.rmSync(dir, { recursive: true, force: true });
});
function propose(check = verification) {
  const staged = stageProposal(target, repaired);
  const file = path.join(dir, 'proposal.json');
  saveProposal(file, { target, originalHash: sourceHash(original), source: repaired,
    specFile: staged.originalSpec, candidateFile: staged.flowFile, candidateSpec: staged.specFile,
    changes: ['save: candidate promoted'], liveExecutions: 3, verification: check });
  return { file, staged };
}
describe('staged repair application', () => {
  it('preserves relative fixture imports and only applies the exact candidate after review', () => {
    const { file, staged } = propose();
    expect(fs.readFileSync(target, 'utf8')).toBe(original);
    expect(fs.readFileSync(staged.specFile, 'utf8')).toContain("from './fixtures'");
    expect(fs.readFileSync(staged.specFile, 'utf8')).not.toContain("from './demo.flow'");
    expect(applyProposal(file)).toMatchObject({ target, liveExecutions: 0 });
    expect(fs.readFileSync(target, 'utf8')).toBe(repaired);
    expect(fs.readFileSync(staged.originalSpec, 'utf8')).toContain("from './demo.flow'");
  });
  it.each(['target', 'spec', 'candidate'] as const)('refuses a stale %s', (kind) => {
    const { file, staged } = propose();
    fs.appendFileSync(kind === 'target' ? target : kind === 'spec' ? staged.originalSpec : staged.flowFile, '\n// changed');
    expect(() => applyProposal(file)).toThrow(/changed/);
  });
  it('refuses failed, drifted or skipped verification', () => {
    const { file } = propose({ ...verification, driftCount: 1 });
    expect(() => applyProposal(file)).toThrow(/no clean/);
    expect(fs.readFileSync(target, 'utf8')).toBe(original);
  });
});
