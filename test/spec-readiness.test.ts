import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runSpecCheck, parseSpecReport, type SpecCheckResult } from '../src/spec/check.js';
import { chromium } from '@playwright/test';
import { emitFlowFile, emitSpecFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';
import { runReadinessCheck, artifactHash } from '../src/spec/readiness.js';

let dir: string;
let flowFile: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.resolve('test/.readiness-test-'));
  flowFile = path.join(dir, 'sample.flow.ts');
  fs.writeFileSync(flowFile, 'export const flowStepIds = ["save"] as const;\nexport const requiredInputNames = ["name"] as const;');
  fs.writeFileSync(path.join(dir, 'sample.spec.ts'), '// generated scaffold');
});
afterEach(() => {
  expect(path.dirname(dir)).toBe(path.resolve('test'));
  expect(path.basename(dir)).toMatch(/^\.readiness-test-/);
  fs.rmSync(dir, { recursive: true, force: true });
});
function passing(extra: Partial<SpecCheckResult> = {}): SpecCheckResult {
  return { outcome: 'passed', ran: true, passed: true, skipped: null, durationMs: 10,
    exitCode: 0, timedOut: false, error: null, anchor: null, errorFile: null, errorLine: null,
    drift: [], driftCount: 0, satisfied: [], executedSteps: ['save'], skippedCount: 0,
    verdict: 'passed', workspace: null, specFile: null, ...extra };
}

describe('readiness acceptance gate', () => {
  it('runs three distinct fresh-state executions, records hashes and persists evidence', () => {
    const inputs: string[] = [];
    const result = runReadinessCheck({ flowFile, vars: { name: 'customer-{n}' }, fixtureIsolation: true }, (o) => {
      inputs.push(o.vars!.name); return passing();
    });
    expect(inputs).toEqual(['customer-1', 'customer-2', 'customer-3']);
    expect(result.outcome).toBe('verified');
    expect(result.artifactHash).toBe(artifactHash(flowFile));
    expect(JSON.parse(fs.readFileSync(result.evidenceFile, 'utf8')).state).toBe('spec-verified');
    expect(fs.readFileSync(result.evidenceFile, 'utf8')).not.toContain('customer-');
  });
  it('blocks before execution without isolation, complete inputs or varied datasets', () => {
    let calls = 0;
    const result = runReadinessCheck({ flowFile }, () => { calls++; return passing(); });
    expect(calls).toBe(0);
    expect(result.blockers.join(' ')).toContain('fixtureIsolation');
    expect(result.blockers.join(' ')).toContain('missing required inputs');
    expect(result.blockers.join(' ')).toContain('distinct datasets');
  });
  it.each([
    [{ driftCount: 1 }, 'fallback'],
    [{ satisfied: ['save'] }, 'already satisfied'],
    [{ skippedCount: 1 }, 'skipped'],
    [{ executedSteps: [] }, 'Required steps'],
    [{ passed: false, outcome: 'failed', error: 'assertion failed' }, 'assertion failed'],
  ] as [Partial<SpecCheckResult>, string][])('stops at the first unclean execution %j', (extra, text) => {
    const result = runReadinessCheck({ flowFile, vars: { name: 'n-{n}' }, fixtureIsolation: true }, () => passing(extra));
    expect(result.outcome).toBe('failed');
    expect(result.runs).toHaveLength(1);
    expect(result.blockers.join(' ')).toContain(text);
  });
  it('keeps unavailable separate from failed', () => {
    const result = runReadinessCheck({ flowFile, vars: { name: 'n-{n}' }, fixtureIsolation: true }, () => passing({ ran: false, outcome: 'unavailable', skipped: 'setup failed' }));
    expect(result.outcome).toBe('unavailable');
  });
  it('unions configured requirements with generated inputs and rejects unrelated dataset variation', () => {
    const result = runReadinessCheck({ flowFile, requiredInputs: [], requiredSteps: [], fixtureIsolation: true,
      vars: { name: 'same', unrelated: 'extra-{n}' } }, () => passing());
    expect(result.outcome).toBe('blocked');
    expect(result.blockers.join(' ')).toContain('distinct datasets');
  });
  it('blocks unsupported code before running an apparently green spec', () => {
    fs.appendFileSync(flowFile, '\n// TODO: no locator this compiler can express for click');
    const result = runReadinessCheck({ flowFile, vars: { name: 'n-{n}' }, fixtureIsolation: true }, () => { throw new Error('must not run'); });
    expect(result.blockers.join(' ')).toContain('unsupported');
  });
  /**
   * A step whose required expectation had no nameable line emitted no
   * assertion at all: it ran, checked nothing about its own effect, and went
   * green. Three green runs of that are three runs of nothing, so readiness
   * refuses the claim rather than quietly making it worth less.
   */
  it('blocks a step whose effect the artifact does not verify', () => {
    fs.appendFileSync(flowFile, '\n// UNCHECKED: this run\'s own values must show — none of the 1 recorded line(s) can be named as a locator, so this step\'s effect is not verified here.');
    const result = runReadinessCheck({ flowFile, vars: { name: 'n-{n}' }, fixtureIsolation: true }, () => { throw new Error('must not run'); });
    expect(result.outcome).toBe('blocked');
    expect(result.blockers.join(' ')).toContain('does not verify their effect');
  });
  it('requires coverage metadata for older compiled artifacts', () => {
    fs.writeFileSync(flowFile, 'export const steps = {};');
    const result = runReadinessCheck({ flowFile, fixtureIsolation: true }, () => { throw new Error('must not run'); });
    expect(result.blockers.join(' ')).toContain('Required-step metadata');
  });
  it('rejects verification if the artifact changes during execution', () => {
    const result = runReadinessCheck({ flowFile, vars: { name: 'n-{n}' }, fixtureIsolation: true }, () => {
      fs.appendFileSync(flowFile, '\n// changed'); return passing();
    });
    expect(result.outcome).toBe('blocked');
    expect(result.blockers[0]).toContain('changed');
  });
  it('validates an explicit negative fixture and expected error separately', () => {
    let calls = 0;
    const result = runReadinessCheck({ flowFile, vars: { name: 'n-{n}' }, fixtureIsolation: true,
      negativeCheck: { env: { SAVE_FAULT: 'reject' }, expectedError: 'Save confirmation absent' } }, (o) => {
      calls++;
      return o.env?.SAVE_FAULT ? passing({ outcome: 'failed', passed: false, error: 'Save confirmation absent' }) : passing();
    });
    expect(calls).toBe(4);
    expect(result.failureDetection).toBe('verified');
    expect(result.outcome).toBe('verified');
  });
  it('rejects aliases that would overwrite the changing dataset in the child environment', () => {
    const result = runReadinessCheck({ flowFile, fixtureIsolation: true, vars: { name: 'n-{n}', NAME: 'fixed' } }, () => { throw new Error('must not run'); });
    expect(result.outcome).toBe('blocked');
    expect(result.blockers.join(' ')).toContain('both map to environment variable NAME');
    const checked = runSpecCheck({ flowFile, vars: { 'a-b': 'one', a_b: 'two' } });
    expect(checked.outcome).toBe('unavailable');
    expect(checked.skipped).toContain('both map to environment variable A_B');
  });
  it('preserves positive execution evidence when the configured negative test fails', () => {
    const result = runReadinessCheck({ flowFile, vars: { name: 'n-{n}' }, fixtureIsolation: true,
      negativeCheck: { env: { SAVE_FAULT: 'reject' }, expectedError: 'save outcome missing' } }, () => passing());
    expect(result).toMatchObject({ outcome: 'failed', state: 'spec-verified', executionVerified: true, failureDetection: 'failed' });
    expect(result.runs).toHaveLength(3);
    expect(result.verifiedAt).not.toBeNull();
  });
});

describe('real project Playwright validation', () => {
  it('preserves relative fixtures and selected project config and disables configured retries', () => {
    fs.writeFileSync(path.join(dir, 'fixture.ts'), `import { test as base } from '@playwright/test';
export const test = base.extend<{ label: string }>({ label: ['default', { option: true }] });`);
    fs.writeFileSync(path.join(dir, 'playwright.config.ts'), `export default { testDir: '.', retries: 2, projects: [{ name: 'chosen', use: { label: 'from-project' } }] };`);
    fs.writeFileSync(path.join(dir, 'sample.spec.ts'), `import { expect } from '@playwright/test';
import { test } from './fixture';
test('project fixture works', async ({ label }, info) => {
  expect(label).toBe('from-project');
  expect(info.project.retries).toBe(0);
  expect(process.env.NAME).toBe('fixture-input');
  console.log('[sitelooper step] save');
});`);
    const result = runSpecCheck({ flowFile, project: 'chosen', vars: { name: 'fixture-input' } });
    expect(result.error ?? result.skipped).toBeNull();
    expect(result.outcome).toBe('passed');
    expect(result.executedSteps).toEqual(['save']);
    expect(result.workspace).toBeNull();
  }, 30_000);
  it('distinguishes an artifact import failure from unavailable project setup', () => {
    fs.writeFileSync(path.join(dir, 'sample.spec.ts'), `import './missing-fixture';`);
    const result = runSpecCheck({ flowFile });
    expect(result.outcome).toBe('failed');
    expect(result.error).toContain('missing-fixture');
    expect(result.workspace).not.toBeNull();
  }, 30_000);
  it('reports reset failure as unavailable before launching tests', () => {
    const result = runSpecCheck({ flowFile, resetCmd: 'node -e "process.exit(3)"' });
    expect(result.outcome).toBe('unavailable');
    expect(result.ran).toBe(false);
    expect(result.skipped).toContain('exited 3');
  });
  it('does not count expected failures as a clean pass', () => {
    const report = { suites: [{ specs: [{ title: 'expected failure', tests: [{ status: 'expected', expectedStatus: 'failed', results: [{ status: 'failed' }] }] }] }] };
    expect(parseSpecReport(report).passed).toBe(false);
  });
});


describe('generated browser artifact readiness', () => {
  it.skipIf(!fs.existsSync(chromium.executablePath()))('verifies emitted steps and user assertions across three clean browser contexts', () => {
    const html = `<input id="name"><button id="save" onclick="document.querySelector('#result').textContent = document.querySelector('#name').value">Save</button><output id="result"></output>`;
    const startUrl = 'data:text/html,' + encodeURIComponent(html);
    const spec: SpecFlow = {
      version: 1, name: 'sample', origin: 'null', startUrl, vars: ['name'],
      steps: [{ id: 'save', instruction: 'Save the entered name', params: { v1: '{{name}}' }, outputs: ['saved'],
        segments: [{ id: 's_save', template: 'Save {{v1}}', params: { v1: { example: 'customer', usedIn: [0], known: true } },
          preconditions: { urlPattern: startUrl }, steps: [
            { tool: 'fill', args: { target: '@name', value: '{{v1}}' }, locators: { target: [{ kind: 'id', selector: '#name' }] } },
            { tool: 'click', args: { target: '@save' }, locators: { target: [{ kind: 'id', selector: '#save' }] } },
            { tool: 'read', args: { target: '@result', what: 'text' }, locators: { target: [{ kind: 'id', selector: '#result' }] }, label: 'saved' },
          ] }],
      }],
    };
    fs.writeFileSync(flowFile, emitFlowFile(spec, { tier: 'plain' }).source);
    const scaffold = emitSpecFile(spec)
      .replace("import { test }", "import { test, expect }")
      .replace('    void outputs;', "    expect(outputs['save.saved']).toBe(process.env.NAME);");
    fs.writeFileSync(path.join(dir, 'sample.spec.ts'), scaffold);
    const result = runReadinessCheck({ flowFile, vars: { name: 'customer-{n}' }, fixtureIsolation: true });
    expect(result.blockers).toEqual([]);
    expect(result.outcome).toBe('verified');
    expect(result.runs).toHaveLength(3);
    expect(result.runs.every((run) => run.result.executedSteps?.includes('save'))).toBe(true);
  }, 60_000);
});
