Verify the code on branch `fix/hard5` in the cloud (the dev box is short of memory), then publish a short report. Do NOT change any source or test file, and do NOT push to main or to fix/hard5 (publish only the results branch).

1. Check out the branch and build it:
   git fetch origin && git checkout -B fix/hard5 origin/fix/hard5
   (The box's local clone can be an unrelated old history; never pull --ff-only onto it, and never push main.) Record `git log --oneline -1`; it must contain all four fixes (`grep -q 'export function messageAnchor' src/spec/check.ts && grep -q sessionAppMintedPositions src/skills/app-minted-url.ts && test -f src/skills/id-fragments.ts && test -f src/spec/drift-class.ts && test -f bench/rebuild-survey.mjs`), else STOP and report. Then:
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
      (report test/build-converge.test.ts, test/build-default.test.ts, test/spec-readiness.test.ts, test/drift-class.test.ts, test/app-minted-session.test.ts, test/id-fragments.test.ts, test/eval-assigned-ids.test.ts, test/offered-constants.test.ts, test/shape-gate.test.ts, test/spec-emit.test.ts, test/spec-repair.test.ts, test/assert-spec.test.ts, test/assert-e2e.browser.test.ts, test/execution-browser.test.ts, test/cli-acceptance.test.ts and test/execution-parity.test.ts by name and result)
   d. Corpus at this branch and at main f535c191, same box, same fetch:
      PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet 2>&1 | tee /tmp/v/corpus.log
      PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --no-fetch --at f535c191 --out /tmp/v/corpus-main.json --quiet 2>&1 | tee /tmp/v/corpus-main.log
      (corpus-check compiles the published STORES and never recompiles skills from recordings, so fixes 2 and 5a are not expected to change it; fix 5b does not touch compile. The gate's comparison with bench/corpus-baseline.json is STALE, so its "FAIL" on lint totals is informational only.)
   e. Compare /tmp/v/corpus.json with /tmp/v/corpus-main.json keyed by `runid`, field `status`, and the per-row lint totals. List every runid whose status changed (main -> branch) and any lint total that differs. A compiled -> refused change fails; a refused -> compiled change is listed and allowed.
   f. Rebuild survey (recompiles every published n1 recording offline; no app, no model):
      git worktree add -f /tmp/main f535c191 && (cd /tmp/main && npm ci && npm run build) && cp bench/rebuild-flow.mjs /tmp/main/bench/rebuild-flow.mjs
      node bench/rebuild-survey.mjs --quiet --no-fetch --code /tmp/main --out /tmp/v/rs-main.json 2>&1 | tee /tmp/v/rs-main.log
      node bench/rebuild-survey.mjs --quiet --no-fetch --out /tmp/v/rs-branch.json 2>&1 | tee /tmp/v/rs-branch.log
      node bench/rebuild-survey.mjs --compare /tmp/v/rs-main.json /tmp/v/rs-branch.json > /tmp/v/rs-diff.txt
      (The rebuild script is copied from the branch so both sides pass the session's earlier steps the same way; only src differs. Informational: report the last line of rs-diff.txt, the count of `+ … POINT-ONLY` and `- … POINT-ONLY` lines, and the full diff for fwen8-luna and fwgt35-luna.)
3. Write bench/verify-reports/hard5.md containing:
   - the commit;
   - for a-c: the "Test Files" and "Tests" summary lines, plus the name and the first 30 lines of the error for every failing test;
   - for d/e: the row count, the number changed, each change, and the lint totals on both sides;
   - for f: the items asked above;
   - an overall PASS or FAIL (PASS only if a-c have 0 failures and no runid in e went from compiled to refused).
   Copy /tmp/v/corpus.json to bench/corpus-snapshots/h5-<short sha>.json and /tmp/v/rs-diff.txt to bench/verify-reports/hard5-rebuild-diff.txt.
4. Publish on a new branch, never main:
   git checkout -b results/verify-hard5 && git add bench/verify-reports bench/corpus-snapshots && git commit -m "verify hard5" && git push -u origin results/verify-hard5
5. Your final message: the overall PASS/FAIL and the report's contents.
RULES: if a check fails, report it; do not retry more than once, and do not try to fix anything.
