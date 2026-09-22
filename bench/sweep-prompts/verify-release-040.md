Verify the code on branch `release/0.4.0` in the cloud (the dev box is short of memory), then publish a short report. Do NOT change any source or test file, and do NOT merge anything.

1. Check out the branch and build it:
   git fetch origin && git checkout release/0.4.0 && git pull --ff-only
   Record `git log --oneline -1`. Then:
   npm ci && npm run build && npx playwright install --with-deps chromium
   Start every long command with the Bash tool's run_in_background: true and wait for its completion notification. Do NOT use the Monitor tool, and do not chain `sleep`. Do not end your turn while a command runs.
2. Run each check with its output tee'd to /tmp/v/<name>.log (mkdir -p /tmp/v first):
   a. npx vitest run --pool=forks --poolOptions.forks.maxForks=4 2>&1 | tee /tmp/v/suite.log
   b. BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2 2>&1 | tee /tmp/v/browser.log
   c. BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2 2>&1 | tee /tmp/v/parity.log
   d. node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet 2>&1 | tee /tmp/v/corpus.log
      (It fetches every results/* branch and compiles each published store: no app, no model, about 2-5 minutes.)
   e. Compare /tmp/v/corpus.json with bench/corpus-snapshots/r46-2623dbf9.json, keyed by `runid`, field `status`. List every runid whose status changed (old -> new), and every runid that is new.
3. Write bench/verify-reports/release-040.md containing:
   - the commit;
   - for a-c: the "Test Files" and "Tests" summary lines, plus the name and the first 30 lines of the error for every failing test;
   - for d/e: the row count, the number changed, and each change;
   - an overall PASS or FAIL (PASS only if a-c have 0 failures and no runid in e went from compiled to refused/error).
   Copy /tmp/v/corpus.json to bench/corpus-snapshots/r47-<short sha>.json.
4. Publish on a new branch, never main and never release/0.4.0:
   git checkout -b results/verify-release-040 && git add bench/verify-reports bench/corpus-snapshots && git commit -m "verify release 0.4.0" && git push -u origin results/verify-release-040
5. Your final message: the overall PASS/FAIL and the report's contents.
RULES: if a check fails, report it; do not retry more than once, and do not try to fix anything.

ALSO (release checks), after step 2 and before writing the report:
   f. `npm pack --dry-run 2>&1 | tail -40`: record the file count, packed/unpacked size, and confirm there is no notes/, bench/, src/ or test/ in the tarball, and that CHANGELOG.md, README.md, LICENSE, dist/ and bin/ are included.
   g. `OPENROUTER_API_KEY=sk-or-test SITELOOPER_HOME=$(mktemp -d) node bin/sitelooper.js doctor`: paste the output (the browser line may fail on this box; that's fine).
   Include f and g in the report; they do not affect PASS/FAIL unless the tarball contains notes/, bench/, src/ or test/.
