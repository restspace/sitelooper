Verify the code on branch `fix/commentary-report` in the cloud (the dev box is short of memory), then publish a short report. Do NOT change any source or test file, and do NOT push to main (publish only the results branch).

1. Check out the branch and build it:
   git fetch origin && git checkout -B fix/commentary-report origin/fix/commentary-report
   (The box's local clone can be an unrelated old history; never pull --ff-only onto it, and never push main.) Record `git log --oneline -1`; it must contain test/commentary-report.test.ts (`test -f test/commentary-report.test.ts`), else STOP and report. Then:
   npm ci && npm run build && npx playwright install --with-deps chromium
   Start every long command with the Bash tool's run_in_background: true and wait for its completion notification. Do NOT use the Monitor tool, and do not chain `sleep`. Do not end your turn while a command runs.
BROWSER (mandatory): this repo's @playwright/test wants Chromium revision 1228. The box may ship an
older one under /opt/pw-browsers (e.g. chromium-1194). Run `npx playwright install --with-deps chromium`
and confirm revision 1228 is installed (`ls ~/.cache/ms-playwright` or the PLAYWRIGHT_BROWSERS_PATH).
If the tests cannot find it, point SITELOOPER_EXECUTABLE at the 1228 chrome binary, never at 1194.
Record the Chromium revision the tests actually ran in the report.

2. Run each check with its output tee'd to /tmp/v/<name>.log (mkdir -p /tmp/v first):
   a. npx vitest run --pool=forks --poolOptions.forks.maxForks=4 2>&1 | tee /tmp/v/suite.log
   b. BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2 2>&1 | tee /tmp/v/browser.log
      (report test/commentary-report.test.ts, test/flow.test.ts, test/task-constants.test.ts, test/ledger.test.ts, test/facts-value.test.ts, test/spec-repair.test.ts, test/rerecord.test.ts and test/sourcing-hold.browser.test.ts by name and result)
   c. BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2 2>&1 | tee /tmp/v/parity.log
   d. PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet 2>&1 | tee /tmp/v/corpus.log
      (APP_PASSWORD is set on purpose: old stores carry that password in the clear and compile must rewrite it, not refuse. It fetches every results/* branch and compiles each published store: no app, no model, about 2-5 minutes. This branch changes what a RECORDING banks and threads (flow.ts commentaryReport: a report value no page line showed is not a reference); the published flows are already built, so the corpus must show 0 status changes.)
   e. Fetch the baseline: git fetch origin results/verify-site-facts-0 && git show origin/results/verify-site-facts-0:bench/corpus-snapshots/sf0-41b794a7.json > /tmp/v/base.json . Compare /tmp/v/corpus.json with /tmp/v/base.json, keyed by `runid`, field `status`. List every runid whose status changed (old -> new), and every runid that is new.
   f. Offline rebuild of the gitea recording this fixes: git fetch origin results/fwgt17-cf64fa && mkdir -p /tmp/v/gt17 && git archive origin/results/fwgt17-cf64fa bench/results-published | tar -x -C /tmp/v/gt17 --wildcards 'bench/results-published/fwgt17*' && REBUILD_DUMP=/tmp/v/gt17/rebuilt-{runid}.json node bench/rebuild-flow.mjs --tag fwgt17 --dir /tmp/v/gt17/bench/results-published 2>&1 | tee /tmp/v/rebuild.log | grep -E 'crossStepRefs|markers' -A3; then node -e "const j=require('/tmp/v/gt17/rebuilt-fwgt17-n1.json');const s=j.steps.find(x=>x.id==='08-report');console.log(s.instruction);console.log(JSON.stringify(s.params))"   (expected: the 08-report instruction reads "(not closed)" literally, params carry no labels_picker_state, crossStepRefs 18 — the picker state and the joined "bug, priority-high" no element displays are the two references dropped from main's 20)
3. Write bench/verify-reports/commentary-report.md containing:
   - the commit;
   - for a-c: the "Test Files" and "Tests" summary lines, plus the name and the first 30 lines of the error for every failing test;
   - for d/e: the row count, the number changed, and each change;
   - for f: the output verbatim, and whether it matched the expectation;
   - an overall PASS or FAIL (PASS only if a-c have 0 failures and no runid in e changed status).
   Copy /tmp/v/corpus.json to bench/corpus-snapshots/cr-<short sha>.json.
4. Publish on a new branch, never main:
   git checkout -b results/verify-commentary-report && git add bench/verify-reports bench/corpus-snapshots && git commit -m "verify commentary-report" && git push -u origin results/verify-commentary-report
5. Your final message: the overall PASS/FAIL and the report's contents.
RULES: if a check fails, report it; do not retry more than once, and do not try to fix anything.
