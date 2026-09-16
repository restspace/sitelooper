import { test, expect } from '@playwright/test';
import { createFlowRun, runFlow } from './sample.flow';
test('independent telemetry', async ({ context }) => {
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  const a = createFlowRun(), b = createFlowRun();
  await Promise.all([
    runFlow(pageA, {}, { run: a }),
    runFlow(pageB, {}, { run: b, startUrl: 'data:text/html,<script>document.write(location.hash.endsWith("2") ? "<output id=fallback>B</output>" : "<output id=primary>A</output>")</script>#run-2' }),
  ]);
  expect(a.outputs['read.result']).toBe('A');
  expect(b.outputs['read.result']).toBe('B');
  expect(a.drift).toHaveLength(0);
  expect(b.drift).toHaveLength(1);
});