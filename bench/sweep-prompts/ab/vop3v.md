Run ONE sitelooper benchmark learning sweep on this cloud box, then replay the COMPILED Playwright script it produces, and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: openproject   RUNID: vop3v   TASK: bench/tasks/openproject-work-package-flow.md   VISION ARM: on

OVERRIDES
1. Code: use `main`:
   git fetch origin && git checkout main && git pull --ff-only
   Record `git log --oneline -1`; it must contain src/agent/vision.ts (`test -f src/agent/vision.ts`), else STOP and report. Then `npm ci && npm run build` if cloud-setup.sh does not already build.
2. Environment: do NOT edit ~/.bashrc, ~/.profile or any other shell startup file. Put the exports below at the start of every command that needs them, or in a script file under /tmp that each command sources.
   Models: OpenRouter everywhere, never Novita. OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line.
   export SITELOOPER_PROVIDER=openrouter
   export SITELOOPER_MODEL=xiaomi/mimo-v2.6-flash
   export SITELOOPER_FALLBACK_MODEL=z-ai/glm-5.3
   export SITELOOPER_EXTRA_BODY='{"provider":{"only":["Xiaomi"]}}'
   export SITELOOPER_VISION=on
   Do NOT set SITELOOPER_VISION_AUTO (this A/B measures model-requested screenshots only) and do NOT set SITELOOPER_FALLBACK_EXTRA_BODY.
   Confirm before sweeping: `sitelooper config --session cfgcheck` shows model xiaomi/mimo-v2.6-flash, then `sitelooper stop --session cfgcheck`.
   Also confirm the flag is read: `node -e "import('./dist/agent/vision.js').then(m=>console.log(JSON.stringify(m.visionSettings())))"` must print "on":true for arm v and "on":false for arm n.
3. Setup: bench/cloud-setup.sh --with-target openproject   (allow ~15 minutes on a cold box)
4. Sweep (k=3: one recording, then two zero-orchestrator flow replays against a reset app):
   node bench/sweep.mjs --k 3 --base vop3v --learn bench/results/vop3v-skills --flow vop3v --verify-cmd "node bench/verify-openproject.mjs" --arm sitelooper --target openproject --task bench/tasks/openproject-work-package-flow.md --provider openrouter --model z-ai/glm-5.3 --maxUsd 3.00 --coarse --out bench/results 2>&1 | tee bench/results/vop3v-sweep.log
   This can take 30-90 minutes. Do NOT end your turn while it runs.
   WAITING — IMPORTANT: do NOT use the Monitor tool at all (it needs a permission approval nobody can give on this box). `sleep N` followed by another command is also blocked. Start every long command (setup, sweep, spec replay) with the Bash tool's run_in_background: true and wait for its completion notification; while waiting, check progress only with short Bash calls such as `tail -20 <logfile>`.
5. Compiled script (no model at replay time), after the sweep, against a reset app, whatever the sweep's result:
   node bench/spec-replay.mjs --flow bench/results/flows/vop3v.json --skills bench/results/vop3v-skills --tag vop3v-spec --target openproject --reset --out bench/results 2>&1 | tee bench/results/vop3v-spec-run.log
   node bench/verify-openproject.mjs vop3v-spec 2>&1 | tee bench/results/vop3v-spec-verify.log
   If the flow is not compilable (compile exit 2), that is a legitimate result: report the compile log verbatim and skip the verifier. Do not recompile with --allow-demoted or any other override.
6. Publish (a results branch, never main; commit ONLY results). The recording's timing and trace are part of this A/B's measurements; copy them too:
   mkdir -p bench/results-published && cp -r bench/results/vop3v-* bench/results-published/ && cp bench/results/flows/vop3v.json bench/results-published/vop3v.json
   for f in script timing trace; do cp ~/.sitelooper/sessions/vop3v-n1/$f.jsonl bench/results-published/vop3v-n1-$f.jsonl; done
   Before committing: `grep -c 'data:image\|;base64,' bench/results-published/vop3v-*` must be 0 for every file (no image bytes are ever written); report the counts.
   git checkout -b results/vop3v && git add bench/results-published && git commit -m "Add raw results for vop3v" && git push -u origin results/vop3v
7. Measure: node bench/ab-metrics.mjs --dir bench/results-published --base vop3v
   Paste its output line verbatim.

WHAT THIS IS: one cell of a vision A/B. Arm v shows the recording model (xiaomi/mimo-v2.6-flash) the page whenever it calls `screenshot`: a JPEG of the viewport scaled to 1280px wide, with only the last 2 kept in its context. Arm n is the same model with the flag off, which is byte-identical to main without vision. Replays and the compiled script never use a model's eyes: screenshots are not replayed steps.

REPORT, verbatim:
  1. git log --oneline -1 and the branch pushed.
  2. The ab-metrics line (step 7). Per run it gives:
     - recording: model calls, blocked instructions, errors, failed steps, repeated clicks, evals and eval refusals, screenshots, images shown and withheld;
     - replays: turns and tiers for n2 and n3;
     - the compiled result;
     - objectives per run;
     - cost: total_usd, inner_usd and served.
  3. Every verifier summary line (n1, n2, n3, spec) and every FAIL line.
  4. Of `served` in vop3v-n1-sitelooper-result.json (inner.servedByModel): anything but Xiaomi for xiaomi/mimo-v2.6-flash means the cost is not the rate-table figure; say so.
  5. Arm v only:
     - every trace row whose result holds "[image withheld" (quote it);
     - every line of ~/.sitelooper/vision.log (the capability decisions: the escalation model z-ai/glm-5.3 should appear as "takes no images" if an escalated instruction had screenshots in its history);
     - any HTTP 400 from OpenRouter (an image refused).
  6. Every instruction reported BLOCKED or FAILURE in the n1 transcript: its first line verbatim, and whether it escalated to z-ai/glm-5.3 (inner.byModel).
  7. For each replay (n2, n3), every step: id, tier, turns and recovered. For any step taking model turns, the reason verbatim.
  8. The compiled script: compiled or not (compile log verbatim if not), exitCode, driftCount, every test error, and the verifier output.
  9. The password value must appear NOWHERE in bench/results-published except as a login equal to it: give a COUNT per file; never paste the value.

RULES: do not retry more than once, and report both attempts if you do. A failed objective, a turn cap, a non-compilable flow or a crash is a legitimate result: do not massage it. Do not change source code. Clean up: stop the target stack and any browser or sitelooper daemon you started.

NEVER end your turn while the sweep or the compiled replay is running, not even with a wakeup scheduled: a run whose session goes idle is lost. Wait on the background job's completion notification.
