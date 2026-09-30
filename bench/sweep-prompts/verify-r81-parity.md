Run ONLY the execution-parity suite on branch `fix/r81-control-args` in the cloud, and if it does not finish, on `main` for comparison; then publish a short report. Do NOT change any source or test file, and do NOT push to main (publish only the results branch).

CONTEXT: verify-r81-control-args passed the suite, the browser suite and the corpus check, but `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts` never printed a summary in two attempts (30 and 25 minutes, vitest worker at ~5 GB RSS) on a box that had just run the browser suite. On verify-r80 (the code before this branch) the same command passed 204/204. This run decides whether the branch hangs parity or the box did.

1. git fetch origin && git checkout -B fix/r81-control-args origin/fix/r81-control-args
   (The box's local clone can be an unrelated old history; never pull --ff-only onto it, and never push main.) Record `git log --oneline -1`; `grep -q 'export function restoreControlArgs' src/skills/store.ts` must succeed, else STOP and report. Then:
   npm ci && npm run build && npx playwright install --with-deps chromium
   Use Chromium revision 1228 (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers if that is where 1228 is). Record the revision used.
   Start every long command with the Bash tool's run_in_background: true and wait for its completion notification. Do NOT use the Monitor tool, and do not chain `sleep`. Do not end your turn while a command runs.
   Before each run below, record `free -m` and make sure no chrome/chromium or vitest process is left from an earlier step (`pgrep -a -f 'chrom|vitest' || true`; kill only processes you started).

2. mkdir -p /tmp/v; run on the branch, with a per-test reporter so a hang names its test:
   BP_PARITY_TESTS=1 timeout 2700 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=1 --reporter=verbose 2>&1 | tee /tmp/v/parity-branch.log
   Record the exit code, the "Test Files" and "Tests" lines, the wall time, and peak memory if you can observe it (`free -m` once midway is enough).

3. ONLY IF step 2 did not print a "Tests" summary line: run the same command on main for comparison, on this same box:
   git checkout -B main origin/main && npm run build
   BP_PARITY_TESTS=1 timeout 2700 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=1 --reporter=verbose 2>&1 | tee /tmp/v/parity-main.log
   Then git checkout fix/r81-control-args again before step 4.

4. Write bench/verify-reports/r81-parity.md containing: the commit(s); for each run, the exit code, the summary lines, the wall time, the free -m readings; the LAST 40 lines of each log verbatim; the name of the last test that started without finishing (from the verbose reporter), if any; the name and first 30 error lines of every failing test; and a verdict:
   - PASS: step 2 printed a summary with 0 failures;
   - BRANCH-REGRESSION: step 2 hung or failed and step 3 passed;
   - BOX: both hung or failed the same way;
   - FAIL: step 2 has failing tests.
   Copy /tmp/v/parity-branch.log (and /tmp/v/parity-main.log if it exists) to bench/verify-reports/ as r81-parity-branch.log / r81-parity-main.log, truncated to their last 400 lines.

5. Publish on a new branch, never main:
   git checkout -b results/verify-r81-parity && git add bench/verify-reports && git commit -m "verify r81-parity" && git push -u origin results/verify-r81-parity
6. Your final message: the verdict and the report's contents.
RULES: do not retry more than once, and do not try to fix anything.
