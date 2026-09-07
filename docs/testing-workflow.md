# Integrating generated tests into a Playwright project

Use the same config and fixtures for generated and handwritten tests. For example:

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://localhost:3000' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

For authenticated tests, use your existing authentication setup project or a fixture that loads
`storageState`. Record login in the test only when login is the behavior being tested. Keep saved
authentication state out of version control.

## Fresh data and cleanup

Prefer a unique account or namespace per test and cleanup in fixture teardown. The following
example assumes your test app exposes fixture endpoints; adapt them to the app rather than adding
app-specific setup logic to Sitelooper.

```ts
// tests/fixtures.ts
import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export const test = base.extend<{ runid: string }>({
  runid: async ({ request }, use) => {
    const runid = process.env.RUNID || randomUUID();
    const seeded = await request.post('/test-fixtures', { data: { namespace: runid } });
    expect(seeded.ok()).toBe(true);
    try {
      await use(runid);
    } finally {
      const deleted = await request.delete(`/test-fixtures/${encodeURIComponent(runid)}`);
      expect(deleted.ok()).toBe(true);
    }
  },
});
export { expect };
```

Change the user-owned generated `.spec.ts` to import this `test`, request `{ page, runid }`, and
pass `{ runid }` to `runFlow`. Preserve the scaffold's `try/finally` drift attachment. Configure
`fixtureIsolation: true` only once the fixtures prepare fresh state for every verification run.
The compiled module exports `Vars`, `OutputKey`, `Outputs`, `createFlowRun`, `steps` and `runFlow`.
Output values are optional because an observation may not be available; assert the values your
test depends on explicitly.

Sitelooper's verification command disables retries and runs one worker, while retaining your
project config, setup dependencies, imports and fixture lifecycle. Normal CI remains under your
own Playwright settings:

```sh
npx playwright test
```

## Failure detection

Repeated green runs do not prove that assertions detect a regression. An optional negative spec
should inject one explicit fault and assert a specific business-outcome assertion fails. For example,
for a flow that reads back `save.ticket_status`:

```ts
// tests/ticket-fault.spec.ts — adapt route and output key to your actual app/flow
import { test, expect } from './fixtures';
import { runFlow } from './sitelooper/ticket.flow';

test('rejecting save is detected', async ({ page, runid }) => {
  await page.route('**/api/tickets', route => route.fulfill({ status: 503, body: 'test fault' }));
  // Bound the check and require the actual intended failure, not any thrown error.
  await expect(async () => {
    const outputs = await runFlow(page, { runid });
    expect(outputs['save.ticket_status'], 'ticket save outcome').toBe('Saved');
  }).rejects.toThrow('ticket save outcome');
});
```

If your generated flow itself asserts the save outcome, match that assertion's specific error
instead. A locator timeout or unrelated fixture error must not satisfy the negative check.
Run this explicitly authored test with:

```sh
sitelooper check tests/sitelooper/ticket.flow.ts --ready --fixture-isolation \
  --var runid=verify-{n} --negative-spec tests/ticket-fault.spec.ts
```

The negative spec must pass and contain no skipped tests. Readiness reports failure detection
separately as `verified`, `not-configured`, or `failed`.

## Reviewing repair proposals

A proposal includes the original source hash, candidate source and hash, user spec hash, changes,
compiled-spec result, and number of live executions. Its candidate files remain beside the spec
so imports resolve normally. Inspect the diff with your editor or `git diff --no-index`, then apply
the proposal. Apply does not start a browser. The temporary candidate scaffold is removed after verification so it cannot join the regular test
suite. The candidate flow and proposal remain available for review.

For required CI readiness, check the process exit code and `readiness.outcome === 'verified'`.
Archive the `.readiness.json` evidence with the exact generated flow and user spec it hashes.
Readiness evidence is a record of those executions, not an attestation of every dependency in the
project; reverify after changing fixtures, app versions or test configuration.
