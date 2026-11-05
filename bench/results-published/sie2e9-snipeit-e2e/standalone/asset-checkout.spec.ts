import { test } from '@playwright/test';
import { runFlow, BUDGET_MS, RECORDED_USE } from './asset-checkout.flow';

test.use(RECORDED_USE);

test('asset-checkout', async ({ page }) => {
  test.setTimeout(BUDGET_MS);
  const outputs = await runFlow(page, { runid: process.env['RUNID'] ?? '' });
  // Add your own assertions here. `outputs` holds the values the steps pass on, keyed "<step>.<name>".
  void outputs;
});
