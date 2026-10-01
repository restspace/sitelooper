Verify the code on branch `fix/r82-retried-submit` in the cloud (the dev box is short of memory), then publish a short report. Do NOT change any source or test file, and do NOT push to main (publish only the results branch).

1. Check out the branch and build it:
   git fetch origin && git checkout -B fix/r82-retried-submit origin/fix/r82-retried-submit
   (The box's local clone can be an unrelated old history; never pull --ff-only onto it, and never push main.) Record `git log --oneline -1`; it must contain the retried-submit rule (`grep -q 'export function dropRetriedSubmits' src/skills/retried-submit.ts`), else STOP and report. Then:
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
      (report test/facts-stage4-corpus.test.ts, test/facts-stage3-corpus.test.ts, test/facts-stage2-corpus.test.ts, test/facts-stage1-corpus.test.ts, test/facts-value.test.ts, test/facts.test.ts, test/ledger.test.ts, test/sourcing.test.ts, test/quoted-literal.test.ts, test/commentary-report.test.ts, test/replay-heal-guard.test.ts, test/compile-typed-prefix.test.ts, test/credential-facts.test.ts, test/sourcing-hold.browser.test.ts, test/spec-emit.test.ts, test/hash-id-slot.test.ts, test/execution-refill.test.ts, test/press-focus.browser.test.ts, test/execution-browser.test.ts, test/slow-submit.browser.test.ts, test/unasked-word.test.ts, test/read-mint.test.ts, test/mask-published-marker.test.ts, test/control-args-unslotted.test.ts, test/retried-submit.test.ts, test/restored-field.test.ts, test/read-mint.browser.test.ts, test/minted-fill.test.ts, test/carry-choice.test.ts, test/carry-reopen.test.ts, test/spec-emit.test.ts, test/rebuild.test.ts and test/execution-parity.test.ts by name and result)
   d. PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet 2>&1 | tee /tmp/v/corpus.log
      (APP_PASSWORD is set on purpose: old stores carry that password in the clear and compile must rewrite it, not refuse. It fetches every results/* branch and compiles each published store: no app, no model, about 2-5 minutes. This branch changes COMPILE only, and only when skills are LEARNED from a recording: dropRetriedSubmits (src/skills/retried-submit.ts) drops a submit the recording had to retry (the same control clicked with no successful write and the url held, refilled with the same values, then a final click whose write succeeded and carried the refills; espocrm fwec18-luna-n1 03-create). corpus-check recompiles stored skills, so NO status change is expected. A compiled -> refused change fails; a refused -> compiled change is listed and allowed. Report EVERY status change in step e with the runid and the compile log line. corpus-check.mjs also prints its own movement against each branch's OLD compile log ("fixed / newly-refusing / still-refusing"): that is INFORMATIONAL ONLY — list it, but it never decides the verdict; only the snapshot comparison in e does.)
   e. Fetch the baseline: git fetch origin results/verify-r81-control-args-69p040 && git show origin/results/verify-r81-control-args-69p040:bench/corpus-snapshots/r81c-57b71c4e.json > /tmp/v/base.json . Compare /tmp/v/corpus.json with /tmp/v/base.json, keyed by `runid`, field `status`. List every runid whose status changed (old -> new), and every runid that is new.
   f. node bench/facts-report.mjs bench/results-published/fwod26-skills 2>&1 | tee /tmp/v/facts-report.log   (a store with no site-facts.json: must print 0 facts, 0 rows, applied 0, exit 0)
3. Write bench/verify-reports/r82-retried-submit.md containing:
   - the commit;
   - for a-c: the "Test Files" and "Tests" summary lines, plus the name and the first 30 lines of the error for every failing test;
   - for d/e: the row count, the number changed, and each change;
   - for f: the output verbatim;
   - an overall PASS or FAIL (PASS only if a-c have 0 failures and no runid in e went from compiled to refused (a refused -> compiled change is listed and allowed); corpus-check's own per-branch movement never decides it).
   Copy /tmp/v/corpus.json to bench/corpus-snapshots/r82r-<short sha>.json.
4. Publish on a new branch, never main:
   git checkout -b results/verify-r82-retried-submit && git add bench/verify-reports bench/corpus-snapshots && git commit -m "verify r82-retried-submit" && git push -u origin results/verify-r82-retried-submit
5. Your final message: the overall PASS/FAIL and the report's contents.
RULES: if a check fails, report it; do not retry more than once, and do not try to fix anything.
