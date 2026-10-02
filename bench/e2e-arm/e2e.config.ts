/**
 * e2e (tester-army) comparison arm. Driven by bench/e2e-sweep.mjs, which sets
 * the BENCH_* and APP_* variables; nothing here is app-specific.
 *
 * Budgets are RAISED from e2e's defaults (25 actions and 25 model calls per
 * step) to 50 each, the most a step can take and still be recorded for replay,
 * so that a long objective is not cut short by a default.
 */
import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { openrouter } from '@openrouter/ai-sdk-provider';

const cacheMode = (process.env.BENCH_E2E_CACHE ?? 'read-write') as 'read-write' | 'read-only' | 'off';

export default {
  targets: [{ engine: web(), app: { url: process.env.APP_URL ?? 'http://127.0.0.1:4180/' } }],
  agents: {
    default: {
      model: openrouter(process.env.BENCH_E2E_MODEL ?? 'openai/gpt-6-luna'),
      maxSteps: 50,
      maxModelCalls: 50,
      judgmentTimeout: 60_000,
    },
  },
  cache: { mode: cacheMode, dir: '.e2e/cache' },
  retries: 0,
  workers: 1,
} satisfies E2EConfig;
