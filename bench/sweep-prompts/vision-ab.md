# Vision A/B: sweep prompt template

An A/B of the recording model with and without vision (SITELOOPER_VISION, src/agent/vision.ts).
Both arms run xiaomi/mimo-v2.6-flash, pinned to Xiaomi's own OpenRouter backend.

- **Apps:** gitea (gt), grafana (gr) and openproject (op).
- **Arms:** `v` has vision on; `n` has vision off. Nothing else differs between them.
- **Replicates:** k=3 recordings per app and arm, R = 1, 2, 3. Each is its own sweep: one recording,
  then two zero-orchestrator replays, then the compiled script.
- **Total:** 18 cloud runs. Launch them in batches of at most five (Docker Hub's anonymous pull limit,
  round 56).

**Run ids:** `v<app><R><arm>`. For gitea replicate 1 they are `vgt1v` (vision) and `vgt1n` (no
vision); replicates 2 and 3 are `vgt2v`/`vgt2n` and `vgt3v`/`vgt3n`. Grafana and openproject follow
the same pattern with `gr` and `op`.

**Filling the template:** copy it once per run and fill:
- `{RUNID}`
- `{TARGET}`: gitea / grafana / openproject
- `{TASK}`: bench/tasks/gitea-issue-flow.md, grafana-dashboard-flow.md, openproject-work-package-flow.md
- `{VERIFY}`: bench/verify-gitea.mjs, verify-grafana.mjs, verify-openproject.mjs
- `{VISION}`: `on` for arm v, `off` for arm n
- `{SETUP_NOTE}`: "allow ~15 minutes on a cold box" for gitea and openproject; empty for grafana

Pair the arms of a replicate: launch vgt1v and vgt1n together, so both arms see the same box
generation, the same app images and the same OpenRouter load.

**Why pin Xiaomi.** Checked on 2026-09-24 from the OpenRouter endpoints API: Xiaomi and DeepInfra
serve xiaomi/mimo-v2.6-flash at the same price (0.14 in, 0.28 out, 0.0028 cache read per 1M tokens).
- Xiaomi answered in 1-9s.
- DeepInfra took 44-65s, and read an 8x8 test image as "white" when it was red.

So both arms pin Xiaomi, and `served` in the result must show only Xiaomi. The escalation model,
z-ai/glm-5.3, takes no images; the vision module strips them from anything it is sent, and it gets
no extra body.

---

```
Run ONE sitelooper benchmark learning sweep on this cloud box, then replay the COMPILED Playwright script it produces, and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: {TARGET}   RUNID: {RUNID}   TASK: {TASK}   VISION ARM: {VISION}

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
   export SITELOOPER_VISION={VISION}
   Do NOT set SITELOOPER_VISION_AUTO (this A/B measures model-requested screenshots only) and do NOT set SITELOOPER_FALLBACK_EXTRA_BODY.
   Confirm before sweeping: `sitelooper config --session cfgcheck` shows model xiaomi/mimo-v2.6-flash, then `sitelooper stop --session cfgcheck`.
   Also confirm the flag is read: `node -e "import('./dist/agent/vision.js').then(m=>console.log(JSON.stringify(m.visionSettings())))"` must print "on":true for arm v and "on":false for arm n.
3. Setup: bench/cloud-setup.sh --with-target {TARGET}   ({SETUP_NOTE})
4. Sweep (k=3: one recording, then two zero-orchestrator flow replays against a reset app):
   node bench/sweep.mjs --k 3 --base {RUNID} --learn bench/results/{RUNID}-skills --flow {RUNID} --verify-cmd "node {VERIFY}" --arm sitelooper --target {TARGET} --task {TASK} --provider openrouter --model z-ai/glm-5.3 --maxUsd 3.00 --coarse --out bench/results 2>&1 | tee bench/results/{RUNID}-sweep.log
   This can take 30-90 minutes. Do NOT end your turn while it runs.
   WAITING — IMPORTANT: do NOT use the Monitor tool at all (it needs a permission approval nobody can give on this box). `sleep N` followed by another command is also blocked. Start every long command (setup, sweep, spec replay) with the Bash tool's run_in_background: true and wait for its completion notification; while waiting, check progress only with short Bash calls such as `tail -20 <logfile>`.
5. Compiled script (no model at replay time), after the sweep, against a reset app, whatever the sweep's result:
   node bench/spec-replay.mjs --flow bench/results/flows/{RUNID}.json --skills bench/results/{RUNID}-skills --tag {RUNID}-spec --target {TARGET} --reset --out bench/results 2>&1 | tee bench/results/{RUNID}-spec-run.log
   node {VERIFY} {RUNID}-spec 2>&1 | tee bench/results/{RUNID}-spec-verify.log
   If the flow is not compilable (compile exit 2), that is a legitimate result: report the compile log verbatim and skip the verifier. Do not recompile with --allow-demoted or any other override.
6. Publish (a results branch, never main; commit ONLY results). The recording's timing and trace are part of this A/B's measurements; copy them too:
   mkdir -p bench/results-published && cp -r bench/results/{RUNID}-* bench/results-published/ && cp bench/results/flows/{RUNID}.json bench/results-published/{RUNID}.json
   for f in script timing trace; do cp ~/.sitelooper/sessions/{RUNID}-n1/$f.jsonl bench/results-published/{RUNID}-n1-$f.jsonl; done
   Before committing: `grep -c 'data:image\|;base64,' bench/results-published/{RUNID}-*` must be 0 for every file (no image bytes are ever written); report the counts.
   git checkout -b results/{RUNID} && git add bench/results-published && git commit -m "Add raw results for {RUNID}" && git push -u origin results/{RUNID}
7. Measure: node bench/ab-metrics.mjs --dir bench/results-published --base {RUNID}
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
  4. Of `served` in {RUNID}-n1-sitelooper-result.json (inner.servedByModel): anything but Xiaomi for xiaomi/mimo-v2.6-flash means the cost is not the rate-table figure; say so.
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
```

---

## Reading the A/B

When all 18 runs are in, fetch every `results/v*` branch and run:

    node bench/ab-metrics.mjs --dir <extracted results-published> --base vgt1v --base vgt1n … --json

Compare the arms per app, over R = 1-3:

| measure | where | the question |
|---|---|---|
| rec_model_calls | timing.jsonl | does seeing the page cost or save model turns? |
| rec_blocked, rec_errors | transcript | does vision rescue instructions the text-only model blocks on? |
| rec_failed_steps | script.jsonl `failed: true` | fewer failed gestures? |
| rec_repeated_clicks | trace.jsonl | fewer "did that click work?" repeats? |
| rec_evals, eval_refusals | script.jsonl, trace.jsonl | fewer DOM probes by eval? |
| rec_screenshots, images_shown | trace.jsonl | how often the model looks, and how often it is allowed to |
| n2/n3 turns, tiers | flowrun | does a vision-recorded flow replay as cleanly (it must: nothing visual is recorded)? |
| compiled, spec_objectives | spec result, verifier | same question for the artifact |
| n1..n3 verified | sweep.json | objectives |
| inner_usd, total_usd | result, sweep.json | image tokens are prompt tokens: ~1,200 per 1280x900 shot |

Three replicates per cell cannot separate a small effect from recording noise; a per-app clean rate near 50%
(round 56) swings more than that. Read differences as a direction worth a larger run, not a verdict,
unless they are large and consistent across all three apps.
