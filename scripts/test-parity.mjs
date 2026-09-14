import { spawnSync } from 'node:child_process';

// The execution parity suite (daemon replay vs the compiled artifact) takes
// about nine minutes, so `npm test` skips it. Run it from time to time, and
// before trusting a change to src/execution: `npm run test:parity`.
// Extra arguments pass through to vitest (e.g. `-- -t "read_all"`).
const result = spawnSync('npx', ['vitest', 'run', 'test/execution-parity.test.ts', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, BP_PARITY_TESTS: '1', BP_BROWSER_TESTS: '1' },
});
process.exit(result.status ?? 1);
