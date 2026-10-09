Run ONE compile-reliability rebuild A/B box for app planka: rebuild the six PUBLISHED held-out recordings of this app (results/hapk1-3 and results/hbpk1-3) offline from their n1 scripts with BOTH code versions, compile each, and run every compiled spec against a reset app; then publish the raw results. No model is called anywhere: do not run sitelooper's recorder, bench/sweep.mjs or bench/harness.mjs.

1. Code: cd /home/user/sitelooper && git fetch origin && git checkout -B bench/compile-g1-ab origin/bench/compile-g1-ab && npm ci && npm run build   (never push main or bench/compile-g1-ab). Record `git log --oneline -1`. Check: `git diff --stat origin/fix/compile-g1 HEAD -- src test package.json` MUST print nothing and `test -f bench/heldout/rebuild-ab.mjs` must succeed; else STOP and report.
2. Setup ALREADY RAN (node, build, browser; see /tmp/setup.log); the environment may also have started other held-out apps; ignore them. Do NOT run cloud-setup.sh. Bring THIS box's app up from the checked-out files, on a fresh volume (1-5 minutes; it ends with `planka: up, seeded and reset`). bring-up.sh is this repository's own script: it runs `docker compose` on bench/thirdparty/planka/docker-compose.yml, committed here, which starts the version-pinned image earlier boxes already ran on this environment, then this repository's seed and reset; it talks only to the local app:
   mkdir -p bench/results && bash bench/heldout/bring-up.sh planka 2>&1 | tee bench/results/rbpk-bring-up.log
   If it exits non-zero, paste its output verbatim and STOP.
3. The BEFORE code (main bfeabd26), from /home/user/sitelooper:
   git worktree add -f /tmp/before HEAD && cd /tmp/before && git restore --source=bfeabd26 --staged --worktree -- src test package.json package-lock.json && npm ci && npm run build && cp /home/user/sitelooper/bench/rebuild-flow.mjs /tmp/before/bench/rebuild-flow.mjs
   Check: `cd /tmp/before && git diff --stat bfeabd26 -- src test package.json` prints nothing and `! grep -q reachedGateRefusal src/daemon/server.ts`; else STOP and report.
4. Run (about 20-60 minutes; start it with the Bash tool's run_in_background: true and wait for its completion notification; do NOT use the Monitor tool and do not chain sleep; check progress only with `tail -5 bench/results/rbpk-run.log`):
   cd /home/user/sitelooper && node bench/heldout/rebuild-ab.mjs --target planka --code pk --runs 2 2>&1 | tee bench/results/rbpk-stdout.log
   A refused compile, a failed spec or a FAIL objective is a legitimate result: do not change any code, config, task or test, and do not rerun.
5. Publish, ONE command on its own, before reading any result: node bench/publish-results.mjs --base rbpk

REPORT, verbatim: git log --oneline -1; the whole of bench/results/rbpk-run.log; the "after" and "before" lines of the summary; for every recording whose two versions differ (compiled vs refused, state clean vs not, drift count), the refusal lines or failing objective lines and test errors of both versions; any infrastructure error; the branch pushed.
Clean up at the end: stop any browser you started and the app stack.
NEVER end your turn while a command runs in the background: wait on its completion notification.
