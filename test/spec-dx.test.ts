import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { chromium } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emitFlowFile, emitSpecFile } from '../src/spec/emit.js';
import { runSpecCheck } from '../src/spec/check.js';
import type { SpecFlow } from '../src/spec/ir.js';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.resolve('test/.spec-dx-')); });
afterEach(() => {
  expect(path.dirname(dir)).toBe(path.resolve('test'));
  expect(path.basename(dir)).toMatch(/^\.spec-dx-/);
  fs.rmSync(dir, { recursive: true, force: true });
});
function sample(): SpecFlow {
  return { version: 1, name: 'sample', origin: 'null', startUrl: 'data:text/html,<output id="primary">A</output>', vars: [],
    steps: [{ id: 'read', instruction: 'Read the result', params: {}, outputs: ['result'],
      segments: [{ id: 's_read', template: 'Read the result', params: {}, preconditions: { urlPattern: '.*' },
        steps: [{ tool: 'read', args: { what: 'text', target: '@result' }, label: 'result',
          locators: { target: [{ kind: 'id', selector: '#primary' }, { kind: 'id', selector: '#fallback' }] } }] }] }] };
}

describe('generated public API', () => {
  it('typechecks the scaffold and typed consumer including unusual flow/input names', () => {
    const spec = sample();
    spec.name = 'sample test';
    spec.vars = ['9-name'];
    const flow = path.join(dir, 'sample_test.flow.ts');
    const scaffold = path.join(dir, 'sample_test.spec.ts');
    fs.writeFileSync(flow, emitFlowFile(spec, { tier: 'plain' }).source);
    fs.writeFileSync(scaffold, emitSpecFile(spec));
    const consumer = path.join(dir, 'consumer.ts');
    fs.writeFileSync(consumer, `import type { Outputs, Vars } from './sample_test.flow';
const vars: Vars = { '9-name': 'input' };
const outputs: Outputs = { 'read.result': 'A' };
// @ts-expect-error unknown output keys must not silently compile
outputs['read.reslut'] = 'typo';
void vars;
`);
    const program = ts.createProgram([flow, scaffold, consumer], {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, noEmit: true, skipLibCheck: true,
    });
    expect(ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))).toEqual([]);
  }, 30_000);

  it('fails missing inputs before navigation and includes the input name in the error', () => {
    const spec = sample();
    spec.vars = ['name'];
    const flow = path.join(dir, 'sample.flow.ts');
    fs.writeFileSync(flow, emitFlowFile(spec, { tier: 'plain' }).source);
    fs.writeFileSync(path.join(dir, 'sample.spec.ts'), `import { test, expect } from '@playwright/test';
import { runFlow } from './sample.flow';
test('input validation', async () => {
  let navigated = false;
  const page = { goto: async () => { navigated = true; } } as never;
  await expect(runFlow(page, { name: '' })).rejects.toThrow('missing required flow input: NAME');
  expect(navigated).toBe(false);
});`);
    const result = runSpecCheck({ flowFile: flow });
    expect(result.error ?? result.skipped).toBeNull();
    expect(result.passed).toBe(true);
  }, 30_000);

  it.skipIf(!fs.existsSync(chromium.executablePath()))('keeps concurrent invocation outputs and drift independent', () => {
    const flow = path.join(dir, 'sample.flow.ts');
    fs.writeFileSync(flow, emitFlowFile(sample(), { tier: 'plain' }).source);
    fs.writeFileSync(path.join(dir, 'sample.spec.ts'), `import { test, expect } from '@playwright/test';
import { createFlowRun, runFlow } from './sample.flow';
test('independent telemetry', async ({ context }) => {
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  const a = createFlowRun(), b = createFlowRun();
  await Promise.all([
    runFlow(pageA, {}, { run: a }),
    runFlow(pageB, {}, { run: b, startUrl: 'data:text/html,<output id="fallback">B</output>' }),
  ]);
  expect(a.outputs['read.result']).toBe('A');
  expect(b.outputs['read.result']).toBe('B');
  expect(a.drift).toHaveLength(0);
  expect(b.drift).toHaveLength(1);
});`);
    const result = runSpecCheck({ flowFile: flow });
    expect(result.error ?? result.skipped).toBeNull();
    expect(result.passed).toBe(true);
    expect(result.driftCount).toBe(1);
  }, 30_000);
});
