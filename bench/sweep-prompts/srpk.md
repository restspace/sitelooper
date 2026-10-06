Run ONE held-out-2 same-recording box for app planka: compile the six PUBLISHED recordings of this app (results/hapk1-3 and results/hbpk1-3) with BOTH code versions and run every compiled spec against a reset app, then publish the raw results. No model is called anywhere: do not run sitelooper's recorder, bench/sweep.mjs or bench/harness.mjs. Read notes/HELDOUT2-PROTOCOL.md (the Log entry about the same-recording A/B) first.

1. Code: cd /home/user/sitelooper && git fetch origin && git checkout -B bench/heldout2 origin/bench/heldout2 && npm run build   (never push main or bench/heldout2). Record `git log --oneline -1` and `git diff --stat 4e901145 HEAD -- src test package.json`, which MUST print nothing; if it prints anything, STOP and report.
2. Setup ALREADY RAN (node, build, browser; see /tmp/setup.log); the environment may also have started other held-out apps; ignore them. Do NOT run cloud-setup.sh. Bring THIS box's app up from the checked-out files, on a fresh volume (1-5 minutes; it ends with `planka: up, seeded and reset`). bring-up.sh is this repository's own script: it runs `docker compose` on bench/thirdparty/planka/docker-compose.yml, committed here, which starts the version-pinned image earlier boxes already ran on this environment, then this repository's seed and reset; it talks only to the local app:
   mkdir -p bench/results && bash bench/heldout/bring-up.sh planka 2>&1 | tee bench/results/srpk-bring-up.log
   If it exits non-zero, paste its output verbatim and STOP.
3. The BEFORE code, from /home/user/sitelooper:
   git worktree add -f /tmp/before HEAD && cd /tmp/before && git restore --source=e34fd2d7 --staged --worktree -- src test package.json package-lock.json && npm ci && npm run build
   Check: `cd /tmp/before && git diff --stat e34fd2d7 -- src test package.json` prints nothing and `test ! -f src/spec/converge.ts`; else STOP and report.
4. Run (about 30-90 minutes; start it with the Bash tool's run_in_background: true and wait for its completion notification; do NOT use the Monitor tool and do not chain sleep; check progress only with `tail -5 bench/results/srpk-run.log`):
   cd /home/user/sitelooper && node bench/heldout/same-recording.mjs --target planka --code pk --runs 2 2>&1 | tee bench/results/srpk-stdout.log
   A refused compile, a failed spec or a FAIL objective is a legitimate result: do not change any code, config, task or test, and do not rerun.
5. Publish, ONE command on its own, before reading any result: node bench/publish-results.mjs --base srpk

REPORT, verbatim: git log --oneline -1; the whole of bench/results/srpk-run.log; the "after" and "before" lines of the summary; any infrastructure error; the branch pushed.
Clean up at the end: stop any browser you started.
NEVER end your turn while a command runs in the background: wait on its completion notification.
