Validate the three HELD-OUT-2 benchmark targets on this cloud box WITHOUT running any automation tool, and publish what you find. This box proves the infrastructure only: the docker stacks, the per-run reset, the API oracle and the app-side verifier. Read notes/HELDOUT2-PROTOCOL.md (section "Validating the infrastructure").

ABSOLUTE RULE: do not run sitelooper, e2e, agent-browser, a browser, or bench/harness.mjs / bench/sweep.mjs against these apps, and do not open them in a browser. Only curl, node scripts under bench/ named below, bash scripts under bench/heldout/ and bench/thirdparty/, and docker commands.

1. Code: cd /home/user/sitelooper && git fetch origin && git checkout -B bench/heldout2 origin/bench/heldout2 (never push main, never push bench/heldout2). Record `git log --oneline -1`.
2. Setup ALREADY RAN (node, build, docker; see /tmp/setup.log); the environment may also have started the first held-out apps (directus, mealie, bookstack) — leave them alone. Do NOT run cloud-setup.sh. Record `tail -20 /tmp/setup.log`. Bring each target up from the checked-out files on a fresh volume, capturing the output:
   mkdir -p bench/results && bash bench/heldout/bring-up.sh T 2>&1 | tee bench/results/heldout2-validate-T-bringup.log
   for T in planka, kimai, grocy. If one fails, its failure IS the finding: collect `docker compose -f bench/thirdparty/T/docker-compose.yml logs --tail 80`, diagnose and fix as in step 4, and go on with the others.
3. For each target T in planka, kimai, grocy (codes pk, km, gc), run and capture the full output of each command into bench/results/heldout2-validate-T.log (append; use `2>&1 | tee -a`):
   node bench/reset-app.mjs --target T
   node bench/oracle-T.mjs heldout2-validate-<code>or1
   BENCH_OUT=bench/results node bench/verify-T.mjs heldout2-validate-<code>or1        (EXPECTED: every objective PASS, no DUPLICATE/EXTRA line, exit 0)
   node bench/reset-app.mjs --target T                                               (EXPECTED: deletes what the oracle created)
   echo '{"finalText": ""}' > bench/results/heldout2-validate-<code>none1-blank-result.json
   BENCH_OUT=bench/results node bench/verify-T.mjs heldout2-validate-<code>none1     (EXPECTED: every state objective FAIL, report objectives FAIL or UNVERIFIABLE, no EXTRA line, exit 1)
   node bench/reset-app.mjs --target T                                               (EXPECTED: nothing left to delete)
   node bench/reset-app.mjs --target T                                               (EXPECTED: idempotent, nothing changed)
   curl -s -o /dev/null -w '%{http_code}\n' <the target's APP_URL from bench/app-defaults.mjs>   (EXPECTED: 200 or a redirect to its sign-in page)
4. When an expectation fails, DIAGNOSE it against the live app: read the relevant bench file (bench/app-reset.mjs resetT, bench/oracle-T.mjs, bench/verify-T.mjs, bench/thirdparty/T/*, bench/heldout/bring-up.sh), query the API with curl to see the real shapes, and FIX the bench files for that target only. Then rerun steps 2-3 for that target from the start, until every expectation holds or you have tried for 60 minutes on that target. Allowed files: bench/app-reset.mjs (only the reset function for that target), bench/oracle-{planka,kimai,grocy}.mjs, bench/verify-{planka,kimai,grocy}.mjs, bench/thirdparty/{planka,kimai,grocy}/*, those targets' lines in bench/heldout/bring-up.sh, bench/app-defaults.mjs (only those targets' entries). Never touch src/, test/, bench/tasks/, or any other target's code. Do not weaken a check to make it pass: a verifier must still FAIL a run that did not do the objective, and must still flag duplicates and extra mutations. If the TASK itself is impossible on the real app (e.g. a field the task names does not exist), do not edit the task: report it, with the evidence.
5. Also check each task file bench/tasks/{planka-card-flow,kimai-timesheet-flow,grocy-product-flow}.md against the live app by API only: every widget, field, choice and decoy it names exists after a reset. Report any mismatch; do not edit the task.
6. Save your changes for review: `git diff > bench/results/heldout2-validate-fixes.diff` (also `git status --short >> bench/results/heldout2-validate-fixes.diff`). Do NOT commit them.
7. Publish (a results branch, never main), ONE command run on its own: node bench/publish-results.mjs --base heldout2-validate
   If it exits non-zero, paste its output verbatim and STOP.

REPORT, verbatim: git log --oneline -1; the setup log tail; per target: the bring-up output's last 10 lines, the final run of step 3 (every command's output), a list of every fix you made with the reason and the evidence (the API response that showed the assumption was wrong); anything that could not be made to work; and the task check from step 5.

NEVER end your turn while a command runs in the background: wait for its completion notification.
