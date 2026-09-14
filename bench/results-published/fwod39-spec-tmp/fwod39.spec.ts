import { test } from '@playwright/test';
import { createFlowRun, runFlow, steps, BUDGET_MS } from './fwod39.flow';

test('fwod39', async ({ page }) => {
  // One test runs the whole flow: budget it by its recorded steps, not the 60s default.
  test.setTimeout(BUDGET_MS);
  const run = createFlowRun();
  try {
    const outputs = await runFlow(page, { runid: process.env['RUNID'] ?? '' }, {
      run,
      // Set SITELOOPER_TARGET_URL to an absolute URL, or a path resolved through project baseURL.
      startUrl: process.env.SITELOOPER_TARGET_URL,
    });
    // Add your own assertions here; this file is yours and sitelooper never rewrites it.
    // `outputs` has typed keys for every value this flow can publish.
    // `steps` lets you run one generated step on its own.
    // `run.echoed` lists outputs that only echo what the flow typed or selected:
    // do not assert persistence on those without reading them somewhere else.
    void outputs;
    void steps;
  } finally {
    await test.info().attach('sitelooper-drift', {
      body: run.drift.join('\n'),
      contentType: 'text/plain',
    });
  }
});
