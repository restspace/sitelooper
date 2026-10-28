Prove the READABLE spec style on the Snipe-IT pilot recording, on this cloud box, and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for anything not covered here; these steps override it.

RUNID: sie2e3   BRANCH: feat/readable-specs   TOOL: this checkout's sitelooper (node bin/sitelooper.js), not npm

WHY: re-proof of the readable style after four new pruning rules (unlabelled nav links written as visits, dead visits, orphaned menu openers, dismissed dropdowns). Same recording (origin/results/sie2e1), same script; the Snipe-IT file is now 182 lines.

1. Code: git fetch origin && git checkout -B feat/readable-specs origin/feat/readable-specs && git fetch origin results/sie2e1:refs/remotes/origin/results/sie2e1   (never push main or this branch). Record `git log --oneline -1`. Then: npm ci && npm run build (both must succeed, else paste the tail and STOP).
2. Setup already ran before this session (bench Snipe-IT on :8098; leave it alone). Check `tail -3 /tmp/setup.log` ends with `EXIT 0` and `docker ps` works; if not, paste the evidence and STOP.
   OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line. Do not edit shell startup files.
3. Bring up the recording instance: docker compose -p snipeit-e2e -f bench/upstream/snipeit-e2e/docker-compose.yml up -d
   Wait until `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/login` prints 200 or 302 (allow up to 5 minutes).
4. Seed: E2E_ADMIN_PASSWORD=e2e-ci-password bash bench/upstream/snipeit-e2e/seed.sh 2>&1 | tee bench/results/sie2e3-seed.log   (must end with the seeder's output, no exception; else paste and STOP).
5. Run (start it with the Bash tool's run_in_background: true and wait for its completion notification; 5-30 minutes; do NOT use the Monitor tool and do not chain sleep):
   bash bench/upstream/snipeit-e2e/readable.sh sie2e3 2>&1 | tee bench/results/sie2e3-run.log
   A failed build or plain run is a legitimate result: do not edit any script or source, and do not re-run it more than once (if you re-run, say why and keep both logs).
6. Publish (a results branch, never main), ONE command: node bench/publish-results.mjs --base sie2e3
   Its last line reads `[publish] on origin: …`. If it exits non-zero, paste its output verbatim and STOP; do not run any git command yourself. Publish FIRST; nothing in item 7 may run before the push.
7. After the push only: cat bench/results/sie2e3-snipeit-e2e/steps.log; the last 40 lines of bench/results/sie2e3-snipeit-e2e/02-build.stderr; both 03-plain-*.txt files; `wc -l bench/results/sie2e3-snipeit-e2e/tests-e2e/specs/*.ts`.

REPORT, verbatim: the git log line and the branch pushed; steps.log; the build outcome and any blockers or re-recorded steps; both plain runs with their times; item 7.

RULES: do not change sitelooper source or the scripts. Clean up any browser you started (never kill by process name).
NEVER end your turn while a command runs in the background: wait on its completion notification, not even to wait for a notification.
