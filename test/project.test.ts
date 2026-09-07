import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findProjectConfig, loadProjectConfig } from '../src/project.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function project(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-project-'));
  dirs.push(dir);
  return dir;
}

describe('project config', () => {
  it('finds the nearest config from a nested working directory and resolves its paths at the project root', () => {
    const root = project();
    const nested = path.join(root, 'packages', 'app');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(root, 'sitelooper.config.json'), JSON.stringify({
      targetUrl: 'http://localhost:4173',
      requiredVars: ['runid', 'account'],
      vars: { account: 'test-account' },
      resetCommand: 'npm run reset:e2e',
      playwright: { config: 'test/playwright.config.ts', project: 'chromium' },
      fixtureIsolation: true,
      verificationRuns: 4,
      negativeSpec: 'test/fault.spec.ts',
      outputDir: 'test/generated',
      snapshotFile: '.sitelooper/demo.bundle.json',
    }));

    expect(findProjectConfig(nested)).toBe(path.join(root, 'sitelooper.config.json'));
    expect(loadProjectConfig(nested)).toEqual({
      file: path.join(root, 'sitelooper.config.json'),
      root,
      targetUrl: 'http://localhost:4173',
      requiredVars: ['runid', 'account'],
      vars: { account: 'test-account' },
      resetCommand: 'npm run reset:e2e',
      playwright: { config: path.join(root, 'test/playwright.config.ts'), project: 'chromium' },
      fixtureIsolation: true,
      verificationRuns: 4,
      negativeSpec: path.join(root, 'test/fault.spec.ts'),
      outputDir: path.join(root, 'test/generated'),
      snapshotFile: path.join(root, '.sitelooper/demo.bundle.json'),
    });
  });

  it('has stable project-local defaults when no config exists', () => {
    const root = project();
    expect(loadProjectConfig(root)).toMatchObject({
      file: null,
      root,
      requiredVars: [],
      vars: {},
      playwright: {},
      verificationRuns: 3,
      outputDir: path.join(root, 'tests/sitelooper'),
      snapshotFile: path.join(root, '.sitelooper/procedures.json'),
    });
  });

  it('rejects invalid readiness settings with a useful field name', () => {
    const root = project();
    fs.writeFileSync(path.join(root, 'sitelooper.config.json'), JSON.stringify({ verificationRuns: 0 }));
    expect(() => loadProjectConfig(root)).toThrow(/verificationRuns must be a positive integer/);
  });
});
