Run ONE sitelooper CONVERGENCE experiment on this cloud box and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: snipeit   RUNID: fwsi16-cv   FROM: fwsi16 (results branch results/fwsi16-vacbqw)

WHAT THIS IS: the design's STAGE-3 convergence re-run on snipeit (notes/design/design-site-facts.md §5, notes/design/site-facts-stage3-contract.md): this run is on main with feat/site-facts-3 merged, so value class facts now decide the ledger's kind, the export's strip, the sourcing hold and the task constants when reliable. It takes fwsi16's recording (results/fwsi16-vacbqw), which round 65 (the sourcing-hold confirmation batch) refused to compile with unsourced-ref on 01-signin: an unasked list column (`model`/`status`) was threaded as a literal into a later step with nothing publishing it, so the ref had no source. This run asks whether stage 3's value-class facts (the unasked mint-shaped value held for a read; a value the app offered before it was reported treated as a task constant, not threaded) let 01-signin's list columns resolve without that unsourced-ref, using the EXISTING retry commands: `sitelooper compile` → on a refusal, `sitelooper rerecord <flow> <step>` (the model re-records ONE step, the rest replays) → recompile; on a compiled artifact that fails under plain Playwright or the verifier, `sitelooper repair --converge 1` (triage run, converge run, compiled-spec check) → then re-record the step it names. Up to 4 rounds. bench/converge.mjs drives all of it and writes bench/results/fwsi16-cv-converge.json. Every model turn happens at record/repair time; the artifact that ends the loop is model-free. Do NOT set SITELOOPER_SOURCING_HOLD (this experiment isolates the retry mechanisms).

OVERRIDES
1. Code: use `main`:
   git fetch origin && git checkout -B main origin/main
   (The box's local main can be an unrelated old history; never push main.) Record `git log --oneline -1`. It must contain bench/converge.mjs and the site-facts stage 3 value class consumers (`test -f bench/converge.mjs && grep -q 'function valueVerdict' src/skills/facts-value.ts`), else STOP and report. Then `npm ci && npm run build` if cloud-setup.sh does not already build.
2. The earlier recording: fetch its results branch and unpack the flow and the skill store into bench/results:
   git fetch origin results/fwsi16-vacbqw
   mkdir -p bench/results/flows && git archive origin/results/fwsi16-vacbqw bench/results-published/fwsi16-skills bench/results-published/fwsi16.json | tar -x -C /tmp
   cp -r /tmp/bench/results-published/fwsi16-skills bench/results/fwsi16-skills && cp /tmp/bench/results-published/fwsi16.json bench/results/flows/fwsi16.json
   Confirm both exist: `ls bench/results/fwsi16-skills bench/results/flows/fwsi16.json`.
3. Environment: do NOT edit ~/.bashrc, ~/.profile or any other shell startup file. Put the four exports below at the start of every command that needs them, or in a script file under /tmp that each command sources.
   Models: OpenRouter everywhere, never Novita (it has no balance). OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line.
   export SITELOOPER_PROVIDER=openrouter
   export SITELOOPER_MODEL=deepseek/deepseek-v4.1-flash
   export SITELOOPER_FALLBACK_MODEL=z-ai/glm-5.3
   export SITELOOPER_EXTRA_BODY='{"provider":{"only":["DeepSeek"]}}'
   Confirm before running: `sitelooper config --session cfgcheck` should show model deepseek/deepseek-v4.1-flash, then `sitelooper stop --session cfgcheck`.
4. Setup: bench/cloud-setup.sh --with-target snipeit   (provisions only snipeit)
5. The experiment (30-120 minutes; each re-record is two full flow runs against a reset app, each repair is two runs plus a spec check):
   node bench/converge.mjs --from fwsi16 --tag fwsi16-cv --target snipeit --verify-cmd "node bench/verify-snipeit.mjs" --max-rounds 4 --out bench/results 2>&1 | tee bench/results/fwsi16-cv-driver.log
   Its exit code is 0 only when a model-free artifact passed (converged or converged-by-repair). Every other outcome (stuck, exhausted) is a legitimate result: report it, do not retry, do not change source code, do not pass --allow-demoted or any override.
   WAITING — IMPORTANT: do NOT use the Monitor tool at all, and do not chain `sleep`. Start every long command (setup, the experiment) with the Bash tool's run_in_background: true and wait for its completion notification; while waiting, check progress only with short Bash calls such as `tail -20 bench/results/fwsi16-cv-converge.log`.
6. Publish (a results branch, never main; commit ONLY results):
   mkdir -p bench/results-published && cp -r bench/results/fwsi16-cv-* bench/results-published/ && cp bench/results/flows/fwsi16-cv.json bench/results-published/fwsi16-cv.json
   for s in ~/.sitelooper/sessions/rerecord-* ~/.sitelooper/sessions/fwsi16-cv-*; do [ -d "$s" ] && for f in script timing; do [ -f "$s/$f.jsonl" ] && cp "$s/$f.jsonl" "bench/results-published/fwsi16-cv-$(basename "$s")-$f.jsonl"; done; done; true
   The password value must appear NOWHERE in bench/results-published except as a login that equals it; grep and report a COUNT. Never paste the value.
   git checkout -b results/fwsi16-cv && git add bench/results-published && git commit -m "Add convergence results for fwsi16-cv" && git push -u origin results/fwsi16-cv

REPORT, verbatim:
  1. git log --oneline -1 and the branch pushed.
  2. The last line of fwsi16-cv-driver.log (the verdict summary: status, why, rounds, flow runs, model turns).
  3. From bench/results/fwsi16-cv-converge.json, per round: the compile outcome and its codes; each rerecord (step, why, ok, pinned, and each run's status/tier/turns/repinned, plus its diagnostics); the artifact result (exitCode, stats, driftCount, verified, failLines, anchors); the repair result (outcome, converged, specCheck, runs, needsRerecord, and its changes). Quote every diagnostic and every FAIL line verbatim.
  4. For every re-record: did the step's NEW recording read the value that was missing (or land where the old one did not)? Quote from the rerecord's diagnostics and the new skill's steps (bench/results/fwsi16-cv-skills).
  5. For every round's artifact run: the verifier summary and every FAIL line, and whether any DUPLICATE record or EXTRA mutation was reported.
  6. Cost: the number of flow runs the loop made and the model turns (from the driver line), plus each rerecord/repair session's timing.jsonl totals (modelMs, modelCalls) if present.
  7. Anything you had to change to make setup work, with exact commands.

RULES: do not retry more than once, and report both attempts if you do. A stuck or exhausted verdict is a legitimate result. Do not change source code. Clean up: stop the target stack and any browser or sitelooper daemon you started. NEVER end your turn while the experiment is running, not even with a wakeup scheduled: a run whose session goes idle is lost. Wait on the background job's completion notification.
