Validate the three HELD-OUT benchmark targets on this cloud box WITHOUT running any automation tool, and publish what you find. This box proves the infrastructure only: the docker stacks, the per-run reset, the API oracle and the app-side verifier. Read notes/HELDOUT-PROTOCOL.md (section "Validating the infrastructure").

ABSOLUTE RULE: do not run sitelooper, e2e, agent-browser, a browser, or bench/harness.mjs / bench/sweep.mjs / bench/e2e-sweep.mjs against these apps, and do not open them in a browser. Only curl, node scripts under bench/ named below, and docker commands.

1. Code: git fetch origin && git checkout -B bench/heldout origin/bench/heldout (never push main, never push bench/heldout). Record `git log --oneline -1`.
2. Setup ALREADY RAN: this environment's setup script ran bench/cloud-setup.sh --with-arm-b --with-target directus --with-target mealie --with-target bookstack and logged to /tmp/setup.log. Do NOT rerun cloud-setup.sh. Record `tail -40 /tmp/setup.log` verbatim and `docker ps --format "{{.Names}} {{.Status}}"`. If setup failed (no `EXIT 0`) the failure IS the finding: collect the evidence (the setup log, `docker compose -f bench/thirdparty/<t>/docker-compose.yml logs --tail 80` for each target) and go on with whichever targets are up.
3. For each target T in directus, mealie, bookstack (codes dx, ml, bs), run and capture the full output of each command into bench/results/heldout-validate-T.log (append; use `2>&1 | tee -a`):
   node bench/reset-app.mjs --target T
   node bench/oracle-T.mjs heldout-validate-<code>or1
   BENCH_OUT=bench/results node bench/verify-T.mjs heldout-validate-<code>or1        (EXPECTED: every objective PASS, no DUPLICATE/EXTRA line, exit 0)
   node bench/reset-app.mjs --target T                                              (EXPECTED: deletes the oracle's record and comment)
   echo '{"finalText": ""}' > bench/results/heldout-validate-<code>none1-blank-result.json
   BENCH_OUT=bench/results node bench/verify-T.mjs heldout-validate-<code>none1     (EXPECTED: every objective FAIL, no EXTRA line, exit 1)
   node bench/reset-app.mjs --target T                                              (EXPECTED: nothing left to delete)
   node bench/reset-app.mjs --target T                                              (EXPECTED: idempotent, nothing changed)
   For bookstack, run `bash bench/thirdparty/bookstack/seed.sh` once first if the reset says the API token is refused.
4. When an expectation fails, DIAGNOSE it against the live app: read the relevant bench file (bench/app-reset.mjs resetT, bench/oracle-T.mjs, bench/verify-T.mjs, bench/thirdparty/T/*), query the API with curl to see the real shapes, and FIX the bench files for that target only. Then rerun step 3 for that target from the start, until every expectation holds or you have tried for 60 minutes on that target. Allowed files: bench/app-reset.mjs (only the reset function for that target), bench/oracle-*.mjs, bench/verify-{directus,mealie,bookstack}.mjs, bench/thirdparty/{directus,mealie,bookstack}/*, the three targets' blocks in bench/cloud-setup.sh. Never touch src/, test/, bench/tasks/, bench/e2e-arm/, or any other target's code. Do not weaken a check to make it pass: a verifier must still FAIL a run that did not do the objective, and must still flag duplicates and extra mutations. If the TASK itself is impossible on the real app (e.g. a field the task names does not exist), do not edit the task: report it.
5. Save your changes for review: `git diff > bench/results/heldout-validate-fixes.diff` (also `git status --short >> bench/results/heldout-validate-fixes.diff`). Do NOT commit them.
6. Publish (a results branch, never main), ONE command run on its own: node bench/publish-results.mjs --base heldout-validate
   It copies this box's own validation logs (bench/results/heldout-validate-*: logs, verifier output, the diff; no credentials) into bench/results-published and pushes them to results/heldout-validate of this same repository, the branch this routine was set up to deliver. If it exits non-zero, paste its output verbatim and STOP.

REPORT, verbatim: git log --oneline -1; the setup log tail; per target: the final run of step 3 (every command's output), and a list of every fix you made with the reason and the evidence (the API response that showed the assumption was wrong); anything that could not be made to work; and whether any task objective looked impossible on the real app.

NEVER end your turn while a command runs in the background: wait for its completion notification.
