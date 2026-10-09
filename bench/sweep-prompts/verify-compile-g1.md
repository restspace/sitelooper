Verify the code on branch `fix/compile-g1` in the cloud (the dev box is short of memory), then publish a short report. Do NOT change any source or test file, and do NOT push to main or to fix/compile-g1 (publish only the results branch).

1. Check out the branch and build it:
   git fetch origin && git checkout -B fix/compile-g1 origin/fix/compile-g1
   (The box's local clone can be an unrelated old history; never pull --ff-only onto it, and never push main.) Record `git log --oneline -1`; it must contain all three items (`grep -q reachedGateRefusal src/daemon/server.ts && grep -q cut-procedure src/spec/ir.ts && grep -q shownMoreThanOnce src/skills/readscope.ts && grep -q 'export function substituteCandidate' src/skills/compile.ts && test -f test/compile-g1-goto.test.ts`), else STOP and report. Then:
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
      (report test/compile-g1-goto.test.ts, test/readscope.test.ts, test/ambiguous-evidence.browser.test.ts, test/substitute-candidate.test.ts, test/spec-locators.test.ts, test/replay.test.ts, test/execution-resolve.test.ts, test/spec-repair.test.ts, test/build-converge.test.ts, test/spec-readiness.test.ts, test/drift-class.test.ts, test/app-minted-session.test.ts, test/id-fragments.test.ts, test/shape-gate.test.ts, test/spec-emit.test.ts, test/assert-e2e.browser.test.ts, test/execution-browser.test.ts, test/cli-acceptance.test.ts and test/execution-parity.test.ts by name and result)
   d. Corpus at this branch and at main bfeabd26, same box, same fetch:
      PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet 2>&1 | tee /tmp/v/corpus.log
      PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --no-fetch --at bfeabd26 --out /tmp/v/corpus-main.json --quiet 2>&1 | tee /tmp/v/corpus-main.log
      (corpus-check compiles the published STORES and never recompiles skills from recordings, so items 1(b) and 2 are not expected to change it; item 5 may let a store with a slot-marker kind compile differently. The gate's comparison with bench/corpus-baseline.json is STALE, so its "FAIL" on lint totals is informational only.)
   e. Compare /tmp/v/corpus.json with /tmp/v/corpus-main.json keyed by `runid`, field `status`, and the per-row lint totals. List every runid whose status changed (main -> branch) and any lint total that differs. A compiled -> refused change fails; a refused -> compiled change is listed and allowed.
   f. Rebuild survey (recompiles every published n1 recording offline; no app, no model):
      git worktree add -f /tmp/main bfeabd26 && (cd /tmp/main && npm ci && npm run build) && cp bench/rebuild-flow.mjs bench/rebuild-survey.mjs /tmp/main/bench/
      node bench/rebuild-survey.mjs --quiet --no-fetch --code /tmp/main --out /tmp/v/rs-main.json 2>&1 | tee /tmp/v/rs-main.log
      node bench/rebuild-survey.mjs --quiet --no-fetch --out /tmp/v/rs-branch.json 2>&1 | tee /tmp/v/rs-branch.log
      node bench/rebuild-survey.mjs --compare /tmp/v/rs-main.json /tmp/v/rs-branch.json > /tmp/v/rs-diff.txt
      (Both bench scripts are copied from the branch so both sides are surveyed the same way; only src differs. Informational: report the last line of rs-diff.txt, the count of `+ … POINT-ONLY` and `- … POINT-ONLY` lines, the number of recordings changed, and the full diff for hakm1, fwsi14, fwsi26, hbgc3 and fwen9-luna.)
3. Write bench/verify-reports/compile-g1.md containing:
   - the commit;
   - for a-c: the "Test Files" and "Tests" summary lines, plus the name and the first 30 lines of the error for every failing test;
   - for d/e: the row count, the number changed, each change, and the lint totals on both sides;
   - for f: the items asked above;
   - an overall PASS or FAIL (PASS only if a-c have 0 failures and no runid in e went from compiled to refused).
   Copy /tmp/v/corpus.json to bench/corpus-snapshots/g1-<short sha>.json and /tmp/v/rs-diff.txt to bench/verify-reports/compile-g1-rebuild-diff.txt.
4. Publish on a new branch, never main:
   git checkout -b results/verify-compile-g1b && git add bench/verify-reports bench/corpus-snapshots && git commit -m "verify compile-g1" && git push -u origin results/verify-compile-g1b
5. Your final message: the overall PASS/FAIL and the report's contents.
RULES: if a check fails, report it; do not retry more than once, and do not try to fix anything.
