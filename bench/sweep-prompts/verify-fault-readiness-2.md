Verify the code on branch `feat/fault-readiness` in the cloud (the dev box is short of memory), then publish a short report. Do NOT change any source or test file, and do NOT push to main or to feat/fault-readiness (publish only the results branch).

1. Check out the branch and build it:
   git fetch origin && git checkout -B feat/fault-readiness origin/feat/fault-readiness
   (The box's local clone can be an unrelated old history; never pull --ff-only onto it, and never push main.) Record `git log --oneline -1`; its commit must be 755ec077 (`git rev-parse --short=8 HEAD`) and it must contain this branch's work (`grep -q recordedAsNavigation src/execution/recover.ts && grep -q lineShownWhole src/execution/snapshot.ts && grep -q faultHere src/spec/emit.ts && grep -q fixupSkipped src/execution/fixup.ts && grep -q literalLength src/skills/learn.ts && grep -q savedAfterCapture src/skills/compile.ts && grep -q documentLoadedDuring src/skills/compile.ts && grep -q dropCoverOnlyClicks src/skills/compile.ts && grep -q keptRead src/spec/emit.ts && grep -q sameAccessibleName src/execution/text.ts && grep -q holdForRecordedSave src/execution/lifecycle.ts`), else STOP and report. Then:
   npm ci && npm run build && npx playwright install --with-deps chromium
   Start every long command with the Bash tool's run_in_background: true and wait for its completion notification. Do NOT use the Monitor tool, and do not chain `sleep`. Do not end your turn while a command runs.
BROWSER (mandatory): this repo's @playwright/test wants one Chromium revision (`node -p "require('./node_modules/playwright-core/browsers.json').browsers.find(b=>b.name==='chromium').revision"`). The box may ship an older one under /opt/pw-browsers. Run `npx playwright install --with-deps chromium` and confirm that revision is installed (`ls ~/.cache/ms-playwright` or the PLAYWRIGHT_BROWSERS_PATH). If the tests cannot find it, point SITELOOPER_EXECUTABLE at that revision's chrome binary, never at an older one. Record the Chromium revision the tests actually ran in the report.

2. Run each check with its output tee'd to /tmp/v/<name>.log (mkdir -p /tmp/v first):
   c. FIRST, on the fresh box, before a and b: BP_PARITY_TESTS=1 timeout 2700 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=1 2>&1 | tee /tmp/v/parity.log
      (It takes about 34 minutes; a run killed before 45 minutes is not a hang. Record the exit code and wall time.)
   a. npx vitest run --pool=forks --poolOptions.forks.maxForks=4 2>&1 | tee /tmp/v/suite.log
   b. BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2 2>&1 | tee /tmp/v/browser.log
      (report test/kept-read.test.ts, test/saved-after.test.ts, test/fill-reload-effect.test.ts, test/cover-click.test.ts, test/hover-rename.test.ts, test/probe-view.test.ts, test/probe-retire.test.ts, test/match-specific.test.ts, test/no-silent-pass.test.ts, test/spec-emit.test.ts, test/execution-expect.test.ts, test/execution-resolve-emit.test.ts, test/r87-erpnext.test.ts, test/fault-readiness.browser.test.ts, test/fixup-e2e.browser.test.ts, test/assert-e2e.browser.test.ts, test/execution-browser.test.ts, test/cli-acceptance.test.ts and test/execution-parity.test.ts by name and result)
      If a test file fails in a or b, re-run THAT FILE ALONE once with --poolOptions.forks.maxForks=1 (same env) to /tmp/v/rerun-<name>.log and report both results: a file that fails in the full run and passes alone is listed as "contention", not as a failure; one that fails both times is a failure.
   d. Corpus at this branch and at main 402bbf3f, same box, same fetch:
      PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet 2>&1 | tee /tmp/v/corpus.log
      PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --no-fetch --at 402bbf3f --out /tmp/v/corpus-main.json --quiet 2>&1 | tee /tmp/v/corpus-main.log
      (No app, no model. The gate's comparison with bench/corpus-baseline.json is STALE — the corpus has grown since — so its "FAIL" on lint totals is informational only.)
   e. Compare /tmp/v/corpus.json with /tmp/v/corpus-main.json keyed by `runid`, field `status`, and the per-row lint totals. List every runid whose status changed (main -> branch) and any lint total that differs. A compiled -> refused change fails; a refused -> compiled change is listed and allowed.
3. Write bench/verify-reports/fault-readiness-2.md containing:
   - the commit;
   - for a-c: the "Test Files" and "Tests" summary lines, plus the name and the first 30 lines of the error for every failing test, and the re-run result of each;
   - for d/e: the row count, the number changed, each change, and the lint totals on both sides;
   - an overall PASS or FAIL (PASS only if a-c have 0 failures after the single-file re-runs and no runid in e went from compiled to refused).
   Copy /tmp/v/corpus.json to bench/corpus-snapshots/fr-<short sha>.json.
4. Publish on a new branch, never main:
   git checkout -b results/verify-fault-readiness-2 && git add bench/verify-reports bench/corpus-snapshots && git commit -m "verify fault-readiness" && git push -u origin results/verify-fault-readiness-2
5. Your final message: the overall PASS/FAIL and the report's contents.
RULES: apart from the single-file re-run in 2b, if a check fails, report it; do not retry, and do not try to fix anything.
