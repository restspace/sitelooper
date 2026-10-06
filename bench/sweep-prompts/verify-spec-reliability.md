Verify the code on branch `feat/spec-reliability` in the cloud (the dev box is short of memory), then publish a short report. Do NOT change any source or test file, and do NOT push to main or to feat/spec-reliability (publish only the results branch).

1. Check out the branch and build it:
   git fetch origin && git checkout -B feat/spec-reliability origin/feat/spec-reliability
   (The box's local clone can be an unrelated old history; never pull --ff-only onto it, and never push main.) Record `git log --oneline -1`; it must contain the four items (`test -f src/spec/converge.ts && grep -q 'relaxExpectation' src/skills/store.ts && grep -q "unproven-pin" src/spec/ir.ts && grep -q 'generaliseLine' src/execution/expect.ts && grep -q 'SITELOOPER_SPEC_OUTPUTS' src/spec/emit.ts`), else STOP and report. Then:
   npm ci && npm run build && npx playwright install --with-deps chromium
   Start every long command with the Bash tool's run_in_background: true and wait for its completion notification. Do NOT use the Monitor tool, and do not chain `sleep`. Do not end your turn while a command runs.
BROWSER (mandatory): this repo's @playwright/test wants Chromium revision 1228. The box may ship an
older one under /opt/pw-browsers (e.g. chromium-1194). Run `npx playwright install --with-deps chromium`
and confirm revision 1228 is installed (`ls ~/.cache/ms-playwright` or the PLAYWRIGHT_BROWSERS_PATH).
If the tests cannot find it, point SITELOOPER_EXECUTABLE at the 1228 chrome binary, never at 1194.
Record the Chromium revision the tests actually ran in the report.

2. Run each check with its output tee'd to /tmp/v/<name>.log (mkdir -p /tmp/v first):
   c. FIRST, on the fresh box, before a and b: BP_PARITY_TESTS=1 timeout 2700 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=1 2>&1 | tee /tmp/v/parity.log
      (It takes about 34 minutes; a run killed before 45 minutes is not a hang. Record the exit code and wall time.)
   a. npx vitest run --pool=forks --poolOptions.forks.maxForks=4 2>&1 | tee /tmp/v/suite.log
   b. BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2 2>&1 | tee /tmp/v/browser.log
      (report test/learn-recoveries.test.ts, test/cross-run-calibration.test.ts, test/no-silent-pass.test.ts, test/build-converge.test.ts, test/spec-repair.test.ts, test/spec-emit.test.ts, test/execution-expect.test.ts, test/execution-resolve-emit.test.ts, test/hide-toggle.test.ts, test/assert-spec.test.ts, test/assert-e2e.browser.test.ts, test/execution-browser.test.ts, test/cli-acceptance.test.ts and test/execution-parity.test.ts by name and result)
   d. Corpus at this branch and at main e34fd2d7, same box, same fetch:
      PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet 2>&1 | tee /tmp/v/corpus.log
      PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --no-fetch --at e34fd2d7 --out /tmp/v/corpus-main.json --quiet 2>&1 | tee /tmp/v/corpus-main.log
      (No app, no model. This branch adds compile diagnostics `unproven-pin` (error, fires only on stores whose skills carry stats.stopStreak, which no published store does) and `unchecked-commit` (warning). The gate's comparison with bench/corpus-baseline.json is STALE — the corpus has grown since — so its "FAIL" on lint totals is informational only.)
   e. Compare /tmp/v/corpus.json with /tmp/v/corpus-main.json keyed by `runid`, field `status`, and the per-row lint totals. List every runid whose status changed (main -> branch) and any lint total that differs. A compiled -> refused change fails; a refused -> compiled change is listed and allowed.
3. Write bench/verify-reports/spec-reliability.md containing:
   - the commit;
   - for a-c: the "Test Files" and "Tests" summary lines, plus the name and the first 30 lines of the error for every failing test;
   - for d/e: the row count, the number changed, each change, and the lint totals on both sides;
   - an overall PASS or FAIL (PASS only if a-c have 0 failures and no runid in e went from compiled to refused).
   Copy /tmp/v/corpus.json to bench/corpus-snapshots/sr-<short sha>.json.
4. Publish on a new branch, never main:
   git checkout -b results/verify-spec-reliability && git add bench/verify-reports bench/corpus-snapshots && git commit -m "verify spec-reliability" && git push -u origin results/verify-spec-reliability
5. Your final message: the overall PASS/FAIL and the report's contents.
RULES: if a check fails, report it; do not retry more than once, and do not try to fix anything.
