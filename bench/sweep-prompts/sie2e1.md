Record and prove ONE Playwright spec for a proposed upstream contribution to Snipe-IT, on this cloud box, and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for anything not covered here; these steps override it.

RUNID: sie2e1   BRANCH: bench/snipeit-e2e   TOOL: the PUBLISHED npm package sitelooper@0.7.0 (not the repo build)

WHY: we are offering Snipe-IT a small browser-test job. The spec must be recorded against the same origin their CI will serve (http://127.0.0.1:8000), seeded by the contribution's own seeder (bench/upstream/snipeit-e2e/files/database/seeders/E2eSeeder.php, never executed before this run), proven by `sitelooper build` (three clean runs), and then pass under plain `npx playwright test`.

1. Code: git fetch origin && git checkout -B bench/snipeit-e2e origin/bench/snipeit-e2e   (never push main or this branch). Record `git log --oneline -1`.
2. Setup already ran before this session (it brought up the bench Snipe-IT on :8098; leave it alone). Check `tail -3 /tmp/setup.log` ends with `EXIT 0` and `docker ps` works; if not, paste the evidence and STOP.
   OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line. Do not edit shell startup files.
3. Bring up the recording instance (separate project, port 8000):
   docker compose -p snipeit-e2e -f bench/upstream/snipeit-e2e/docker-compose.yml up -d
   Wait until `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/login` prints 200 or 302 (first boot migrates; allow up to 5 minutes).
4. Seed: E2E_ADMIN_PASSWORD=e2e-ci-password bash bench/upstream/snipeit-e2e/seed.sh 2>&1 | tee bench/results/sie2e1-seed-first.log
   This is the seeder's FIRST execution anywhere. If it fails, you MAY fix bench/upstream/snipeit-e2e/files/database/seeders/E2eSeeder.php (PHP errors, validation failures; keep its names and its idempotence), up to 3 attempts, and must save `git diff` of the seeder to bench/results/sie2e1-seeder-fixes.diff. Then run seed.sh a second time to prove it is idempotent (tee to bench/results/sie2e1-seed-second.log). Then check sign-in works: `curl -s -c /tmp/j -b /tmp/j http://127.0.0.1:8000/login | grep -c _token` must be at least 1.
5. Install the published tool: npm install -g sitelooper@0.7.0 && sitelooper --version   (must print 0.7.0).
6. Record, build and check (start it with the Bash tool's run_in_background: true and wait for its completion notification; 10-40 minutes; do NOT use the Monitor tool and do not chain sleep):
   bash bench/upstream/snipeit-e2e/record.sh sie2e1 2>&1 | tee bench/results/sie2e1-record.log
   It stops at the first failing recording step. A failed step, build or plain run is a legitimate result: do NOT edit record.sh's instructions and do not re-run it more than once (if you re-run, say why, and keep both logs).
7. Publish (a results branch, never main), ONE command: node bench/publish-results.mjs --base sie2e1
   Its last line reads `[publish] on origin: …`. If it exits non-zero, paste its output verbatim and STOP; do not run any git command yourself. Publish FIRST; nothing in item 8 may run before the push.
8. After the push only: `cat bench/results/sie2e1-snipeit-e2e/steps.log`; the last 40 lines of bench/results/sie2e1-snipeit-e2e/09-build.stderr; bench/results/sie2e1-snipeit-e2e/10-plain-playwright.txt; `ls -R bench/results/sie2e1-snipeit-e2e/tests-e2e | head -40`; and `grep -c "{{env:E2E_ADMIN_PASSWORD}}" bench/results/sie2e1-snipeit-e2e/tests-e2e/specs/*.flow.ts`.

REPORT, verbatim: git log line and the branch pushed; the seed logs' last lines and any seeder fix diff; steps.log; the build outcome and blockers; the plain Playwright result; item 8.

RULES: do not change sitelooper source or record.sh. Clean up: `sitelooper --session si stop` if a session is left, and stop browsers you started (never kill by process name).
NEVER end your turn while a command runs in the background: wait on its completion notification, not even to wait for a notification.
