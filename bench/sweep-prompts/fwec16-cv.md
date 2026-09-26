Run ONE sitelooper CONVERGENCE experiment on this cloud box and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: espocrm   RUNID: fwec16-cv   FROM: fwec16 (results branch results/fwec16)

WHAT THIS IS: the FIRST convergence run for fwec16, and the SITE-FACTS STAGE 2 re-run the design calls for on an espocrm display-format case (notes/design/design-site-facts.md §5, notes/design/site-facts-stage2-contract.md exit: "the espo amount ... decide from facts"). This run is on main with feat/site-facts-2 merged, so display format facts now decide report classification, identity checks, read-back capture and counter masking when reliable, and the affix observer refuses a frame cut from a digit or equal to a declared var's value (the `£ 2,{{=}}`/`{{=}} Bench Customer` over-generalisation round 67 showed on odoo). Not a fresh sweep. It takes fwec16's recording (round 65, the sourcing-hold confirmation batch) and asks how far the EXISTING retry commands take it: `sitelooper compile` → on a refusal, `sitelooper rerecord <flow> <step>` (the model re-records ONE step, the rest replays) → recompile; on a compiled artifact that fails under plain Playwright or the verifier, `sitelooper repair --converge 1` (triage run, converge run, compiled-spec check) → then re-record the step it names. Up to 4 rounds. bench/converge.mjs drives all of it and writes bench/results/fwec16-cv-converge.json. Every model turn happens at record/repair time; the artifact that ends the loop is model-free. Do NOT set SITELOOPER_SOURCING_HOLD (this experiment isolates the retry mechanisms).

OVERRIDES
1. Code: use `main`:
   git fetch origin && git checkout -B main origin/main
   (The box's local main can be an unrelated old history; never push main.) Record `git log --oneline -1`. It must contain bench/converge.mjs and the site-facts stage 2 display consumers (`test -f bench/converge.mjs && grep -q 'function classifyReportValueWithFacts' src/execution/facts-display.ts`), else STOP and report. Then `npm ci && npm run build` if cloud-setup.sh does not already build.
2. The earlier recording: fetch its results branch and unpack the flow and the skill store into bench/results:
   git fetch origin results/fwec16
   mkdir -p bench/results/flows && git archive origin/results/fwec16 bench/results-published/fwec16-skills bench/results-published/fwec16.json | tar -x -C /tmp
   cp -r /tmp/bench/results-published/fwec16-skills bench/results/fwec16-skills && cp /tmp/bench/results-published/fwec16.json bench/results/flows/fwec16.json
   Confirm both exist: `ls bench/results/fwec16-skills bench/results/flows/fwec16.json`.
3. Environment: do NOT edit ~/.bashrc, ~/.profile or any other shell startup file. Put the four exports below at the start of every command that needs them, or in a script file under /tmp that each command sources.
   Models: OpenRouter everywhere, never Novita (it has no balance). OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line.
   export SITELOOPER_PROVIDER=openrouter
   export SITELOOPER_MODEL=deepseek/deepseek-v4.1-flash
   export SITELOOPER_FALLBACK_MODEL=z-ai/glm-5.3
   export SITELOOPER_EXTRA_BODY='{"provider":{"only":["DeepSeek"]}}'
   Confirm before running: `sitelooper config --session cfgcheck` should show model deepseek/deepseek-v4.1-flash, then `sitelooper stop --session cfgcheck`.
4. Setup: bench/cloud-setup.sh --with-target espocrm   (provisions only espocrm)
5. The experiment (30-120 minutes; each re-record is two full flow runs against a reset app, each repair is two runs plus a spec check):
   node bench/converge.mjs --from fwec16 --tag fwec16-cv --target espocrm --verify-cmd "node bench/verify-espocrm.mjs" --max-rounds 4 --out bench/results 2>&1 | tee bench/results/fwec16-cv-driver.log
   Its exit code is 0 only when a model-free artifact passed (converged or converged-by-repair). Every other outcome (stuck, exhausted) is a legitimate result: report it, do not retry, do not change source code, do not pass --allow-demoted or any override.
   WAITING — IMPORTANT: do NOT use the Monitor tool at all, and do not chain `sleep`. Start every long command (setup, the experiment) with the Bash tool's run_in_background: true and wait for its completion notification; while waiting, check progress only with short Bash calls such as `tail -20 bench/results/fwec16-cv-converge.log`.
6. Publish (a results branch, never main; commit ONLY results):
   mkdir -p bench/results-published && cp -r bench/results/fwec16-cv-* bench/results-published/ && cp bench/results/flows/fwec16-cv.json bench/results-published/fwec16-cv.json
   for s in ~/.sitelooper/sessions/rerecord-* ~/.sitelooper/sessions/fwec16-cv-*; do [ -d "$s" ] && for f in script timing; do [ -f "$s/$f.jsonl" ] && cp "$s/$f.jsonl" "bench/results-published/fwec16-cv-$(basename "$s")-$f.jsonl"; done; done; true
   The password value must appear NOWHERE in bench/results-published except as a login that equals it; grep and report a COUNT. Never paste the value.
   git checkout -b results/fwec16-cv && git add bench/results-published && git commit -m "Add convergence results for fwec16-cv" && git push -u origin results/fwec16-cv

REPORT, verbatim:
  1. git log --oneline -1 and the branch pushed.
  2. The last line of fwec16-cv-driver.log (the verdict summary: status, why, rounds, flow runs, model turns).
  3. From bench/results/fwec16-cv-converge.json, per round: the compile outcome and its codes; each rerecord (step, why, ok, pinned, and each run's status/tier/turns/repinned, plus its diagnostics); the artifact result (exitCode, stats, driftCount, verified, failLines, anchors); the repair result (outcome, converged, specCheck, runs, needsRerecord, and its changes). Quote every diagnostic and every FAIL line verbatim.
  4. For every re-record: did the step's NEW recording read the value that was missing (or land where the old one did not)? Quote from the rerecord's diagnostics and the new skill's steps (bench/results/fwec16-cv-skills).
  5. For every round's artifact run: the verifier summary and every FAIL line, and whether any DUPLICATE record or EXTRA mutation was reported.
  6. Cost: the number of flow runs the loop made and the model turns (from the driver line), plus each rerecord/repair session's timing.jsonl totals (modelMs, modelCalls) if present.
  7. Site facts: `node bench/facts-report.mjs bench/results-published/fwec16-cv-skills` pasted verbatim (every fact and every facts.* shadow disagreement), and every shadow row with `applied: true` from any shadow.jsonl under bench/results-published/fwec16-cv-skills.
  8. Anything you had to change to make setup work, with exact commands.

RULES: do not retry more than once, and report both attempts if you do. A stuck or exhausted verdict is a legitimate result. Do not change source code. Clean up: stop the target stack and any browser or sitelooper daemon you started. NEVER end your turn while the experiment is running, not even with a wakeup scheduled: a run whose session goes idle is lost. Wait on the background job's completion notification.
