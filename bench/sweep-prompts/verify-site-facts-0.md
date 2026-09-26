Verify the code on branch `feat/site-facts-0` in the cloud (the dev box is short of memory), then publish a short report. Do NOT change any source or test file, and do NOT push to main (publish only the results branch).

1. Check out the branch and build it:
   git fetch origin && git checkout -B feat/site-facts-0 origin/feat/site-facts-0
   (The box's local clone can be an unrelated old history; never pull --ff-only onto it, and never push main.) Record `git log --oneline -1`; it must contain test/facts-url.test.ts (`test -f test/facts-url.test.ts`), else STOP and report. Then:
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
      (report test/facts-url.test.ts, test/facts-format.test.ts, test/facts-value.test.ts, test/facts-snapshot.test.ts, test/readback.test.ts, test/repin-round57.test.ts, test/recorder-evidence.browser.test.ts and test/sourcing-hold.browser.test.ts by name and result)
   c. BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2 2>&1 | tee /tmp/v/parity.log
   d. PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet 2>&1 | tee /tmp/v/corpus.log
      (APP_PASSWORD is set on purpose: old stores carry that password in the clear and compile must rewrite it, not refuse. It fetches every results/* branch and compiles each published store: no app, no model, about 2-5 minutes. This branch is stage 0 of site facts (notes/design/design-site-facts.md): observers and shadow rows only, no decision changes; compile now snapshots each origin's site-facts.json (absent in every published store), so the corpus must show 0 status changes.)
   e. Fetch the baseline: git fetch origin results/verify-repin-route-query && git show origin/results/verify-repin-route-query:bench/corpus-snapshots/rrq-67e35381.json > /tmp/v/base.json . Compare /tmp/v/corpus.json with /tmp/v/base.json, keyed by `runid`, field `status`. List every runid whose status changed (old -> new), and every runid that is new.
   f. node bench/facts-report.mjs bench/results-published/fwod26-skills 2>&1 | tee /tmp/v/facts-report.log   (a store with no site-facts.json: must print 0 facts, 0 rows, exit 0)
   g. grep -c 'siteFactsAt' src/execution/facts.ts dist/spec/execution-source.js 2>/dev/null; grep -n "'facts'" src/spec/runtime-source.ts   (the facts module is embedded in the emitted artifact)
3. Write bench/verify-reports/site-facts-0.md containing:
   - the commit;
   - for a-c: the "Test Files" and "Tests" summary lines, plus the name and the first 30 lines of the error for every failing test;
   - for d/e: the row count, the number changed, and each change;
   - for f/g: the output verbatim;
   - an overall PASS or FAIL (PASS only if a-c have 0 failures and no runid in e changed status).
   Copy /tmp/v/corpus.json to bench/corpus-snapshots/sf0-<short sha>.json.
4. Publish on a new branch, never main:
   git checkout -b results/verify-site-facts-0 && git add bench/verify-reports bench/corpus-snapshots && git commit -m "verify site-facts-0" && git push -u origin results/verify-site-facts-0
5. Your final message: the overall PASS/FAIL and the report's contents.
RULES: if a check fails, report it; do not retry more than once, and do not try to fix anything.
