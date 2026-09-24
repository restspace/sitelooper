Verify the code on branch `main` in the cloud (the dev box is short of memory), then publish a short report. Do NOT change any source or test file, and do NOT merge or push to main.

1. Check out the branch and build it:
   git fetch origin && git checkout main && git pull --ff-only
   Record `git log --oneline -1`. Then:
   npm ci && npm run build && npx playwright install --with-deps chromium
   Start every long command with the Bash tool's run_in_background: true and wait for its completion notification. Do NOT use the Monitor tool, and do not chain `sleep`. Do not end your turn while a command runs.
2. Run each check with its output tee'd to /tmp/v/<name>.log (mkdir -p /tmp/v first):
   a. npx vitest run --pool=forks --poolOptions.forks.maxForks=4 2>&1 | tee /tmp/v/suite.log
   b. BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2 2>&1 | tee /tmp/v/browser.log
   c. BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2 2>&1 | tee /tmp/v/parity.log
   d. PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet 2>&1 | tee /tmp/v/corpus.log
      (APP_PASSWORD is set on purpose: old stores carry that password in the clear and compile must rewrite it, not refuse. It fetches every results/* branch and compiles each published store: no app, no model, about 2-5 minutes.)
   e. Compare /tmp/v/corpus.json with bench/corpus-snapshots/r55-42122950.json, keyed by `runid`, field `status`. List every runid whose status changed (old -> new), and every runid that is new.
3. Write bench/verify-reports/round56c.md containing:
   - the commit;
   - for a-c: the "Test Files" and "Tests" summary lines, plus the name and the first 30 lines of the error for every failing test;
   - for d/e: the row count, the number changed, and each change;
   - an overall PASS or FAIL (PASS only if a-c have 0 failures and no runid in e went from compiled to refused/error).
   Copy /tmp/v/corpus.json to bench/corpus-snapshots/r56c-<short sha>.json.
4. Publish on a new branch, never main:
   git checkout -b results/verify-round56c && git add bench/verify-reports bench/corpus-snapshots && git commit -m "verify round56c" && git push -u origin results/verify-round56c
5. Your final message: the overall PASS/FAIL and the report's contents.
RULES: if a check fails, report it; do not retry more than once, and do not try to fix anything.
