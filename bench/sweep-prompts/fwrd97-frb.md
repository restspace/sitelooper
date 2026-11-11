Re-run ONE compiled Playwright script on this cloud box and publish the raw results. No model is used and nothing is recorded. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: repairdesk   RUNID: fwrd97-frb   SOURCE RUN: fwrd97-fr

OVERRIDES
1. Code: use the branch `bench/fault-sweep` (feat/fault-readiness plus these prompts; source commit f0d05a6b):
   git fetch origin && git checkout -B bench/fault-sweep origin/bench/fault-sweep && npm run build
   (The box's local main can be an unrelated old history; never push main or bench/fault-sweep.) Record `git log --oneline -1`. Check: `git diff --stat f0d05a6b HEAD -- src test package.json` must print nothing, and `grep -q recordedAsNavigation src/execution/recover.ts && grep -q lineShownWhole src/execution/snapshot.ts && test -f bench/verify-repairdesk.mjs` must succeed, else STOP and report rather than going on.
2. Environment: do NOT edit ~/.bashrc, ~/.profile or any other shell startup file. No model is called; do NOT set SITELOOPER_FAULT.
3. Setup ALREADY RAN before this session: do NOT run bench/cloud-setup.sh yourself. Check: `tail -5 /tmp/setup.log` must end with the line `EXIT 0`; if not, paste `tail -40 /tmp/setup.log` verbatim and STOP. Also confirm `test -d dist`.
4. Inputs: the flow and skills the earlier run fwrd97-fr published, extracted outside the repository tree:
   git fetch origin results/fwrd97-fr && mkdir -p /tmp/in && git archive FETCH_HEAD bench/results-published/fwrd97-fr.json bench/results-published/fwrd97-fr-skills | tar -x -C /tmp/in && ls /tmp/in/bench/results-published
5. Compiled script, against a reset app. Start it with the Bash tool's run_in_background: true and wait for its completion notification; do NOT use the Monitor tool and do not chain `sleep`:
   node bench/spec-replay.mjs --flow /tmp/in/bench/results-published/fwrd97-fr.json --skills /tmp/in/bench/results-published/fwrd97-fr-skills --tag fwrd97-frb-spec --target repairdesk --reset --out bench/results 2>&1 | tee bench/results/fwrd97-frb-spec-run.log
   node bench/verify-repairdesk.mjs fwrd97-frb-spec 2>&1 | tee bench/results/fwrd97-frb-spec-verify.log
   BROWSER CHECK (a known problem on these boxes today): if bench/results/fwrd97-frb-spec-spec.log contains "Executable doesn't exist", the compiled run never started: Playwright wants a browser build the box does not have. Then, and only then:
     a. Run `ls /opt/pw-browsers; echo "PLAYWRIGHT_BROWSERS_PATH=$PLAYWRIGHT_BROWSERS_PATH"` and keep the output for the report.
     b. Run, with a 5 minute timeout: `npx --yes "playwright@$(node -p "require('./node_modules/playwright-core/package.json').version")" install chromium chromium-headless-shell` (the command bench/cloud-setup.sh itself uses).
     c. Only if (b) fails or is refused: the error names a directory such as /opt/pw-browsers/chromium_headless_shell-NNNN. If another /opt/pw-browsers/chromium_headless_shell-MMMM directory exists and contains chrome-headless-shell-linux64/chrome-headless-shell, run `ln -s /opt/pw-browsers/chromium_headless_shell-MMMM /opt/pw-browsers/chromium_headless_shell-NNNN` and say in the report that the compiled run used build MMMM in place of NNNN.
     d. Move the failed attempt aside (`mkdir -p bench/results/fwrd97-frb-spec-attempt1 && mv bench/results/fwrd97-frb-spec-spec* bench/results/fwrd97-frb-spec-run.log bench/results/fwrd97-frb-spec-verify.log bench/results/fwrd97-frb-spec-attempt1/`), then run the two step-5 commands again, ONCE. This is the one retry the rules allow; report both attempts.
     If a command in (b)-(d) is refused by a permission check, do not retry it or work around it: publish what you have and report the refusal verbatim.
   If the flow is not compilable (compile exit 2), that is a legitimate result: keep bench/results/fwrd97-frb-spec-spec-compile.log and skip the verifier. Do not recompile with --allow-demoted or any other override. Report-only objectives may be UNVERIFIABLE for the compiled arm; that is expected.
6. Publish (a results branch, never main). After step 5, before any report item below, run this ONE command and nothing else until it returns:
   node bench/publish-results.mjs --base fwrd97-frb
   Its last line reads `[publish] on origin: …`. If it exits non-zero, paste its output verbatim and STOP; do not run any git command yourself.

WHAT THIS IS (2026-11-11): the sweep run fwrd97-fr recorded and replayed its flow, but its compiled Playwright script never started: the box had a newer Playwright browser build than the repository's pinned version launches ("Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-…"). This run repeats only that compiled arm, from the flow and skills fwrd97-fr published, with the BROWSER CHECK above to get past the missing build. If seed or reset fails, paste `tail -60 /tmp/setup.log` verbatim and STOP. If the verifier crashes or scores something obviously wrong, report its output verbatim, but do not change code.

REPORT, verbatim:
  1. git log --oneline -1, the branch pushed, and anything notable about setup.
  2. Whether the BROWSER CHECK fired, the output of its step (a), which of (b) or (c) fixed it, and both attempts' last lines.
  3. The compiled script: compiled or not (diagnostics verbatim if not), the last line of fwrd97-frb-spec-run.log, every `[sitelooper drift]`, `[sitelooper shadow]`, `[sitelooper warn]` and `[sitelooper skip]` line, stats, exitCode, every test error, and the full verifier output.
  4. Anything you had to install or change to make it run.

RULES: do not retry more than the one retry the BROWSER CHECK allows. A failed objective, a non-compilable flow or a crash is a legitimate result: do not massage it. Do not change source code, config, task or test. Clean up at the end: stop the target stack and any browser you started.

NEVER end your turn while the compiled replay is running, not even with a wakeup scheduled: a run whose session goes idle is lost. Wait on the background job's completion notification.
