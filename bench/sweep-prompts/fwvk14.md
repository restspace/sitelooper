Run ONE sitelooper benchmark learning sweep on this cloud box, then replay the COMPILED Playwright script it produces, and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: vikunja   RUNID: fwvk14   TASK: bench/tasks/vikunja-task-flow.md

OVERRIDES
1. Code: use `main`:
   git fetch origin && git checkout main && git pull --ff-only
   Record `git log --oneline -1` (expect b6966d3 or later). If HEAD is older than b6966d3, STOP and report rather than sweeping. Then `npm ci && npm run build` if cloud-setup.sh does not already build.
2. Environment: do NOT edit ~/.bashrc, ~/.profile or any other shell startup file (an earlier run stalled on a permission prompt doing that). Put the four exports below at the start of every command that needs them, or in a script file under /tmp that each command sources.
   Models: OpenRouter everywhere, never Novita (it has no balance). OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line.
   export SITELOOPER_PROVIDER=openrouter
   export SITELOOPER_MODEL=deepseek/deepseek-v4.1-flash
   export SITELOOPER_FALLBACK_MODEL=z-ai/glm-5.3
   export SITELOOPER_EXTRA_BODY='{"provider":{"only":["DeepSeek"]}}'
   Inner agent loop on deepseek-v4.1-flash, escalating to glm-5.3 when an instruction comes back blocked; EXTRA_BODY pins OpenRouter to DeepSeek's own backend, the price bench/rates.json quotes. Harness orchestrator stays on glm-5.3 (--provider/--model below). Confirm before sweeping: `sitelooper config --session cfgcheck` should show model deepseek/deepseek-v4.1-flash, then `sitelooper stop --session cfgcheck`.
3. Setup: bench/cloud-setup.sh --with-target vikunja   (provisions only vikunja; allow ~15 minutes on a cold box)
4. Sweep (k=3: one recording, then two zero-orchestrator flow replays against a reset app):
   node bench/sweep.mjs --k 3 --base fwvk14 --learn bench/results/fwvk14-skills --flow fwvk14 --verify-cmd "node bench/verify-vikunja.mjs" --arm sitelooper --target vikunja --task bench/tasks/vikunja-task-flow.md --provider openrouter --model z-ai/glm-5.3 --maxUsd 3.00 --coarse --out bench/results 2>&1 | tee bench/results/fwvk14-sweep.log
   This can take 30-90 minutes. Do NOT end your turn while it runs.
   WAITING — IMPORTANT: do NOT use the Monitor tool at all (it needs a permission approval nobody can give on this box; an earlier run sat blocked on a Monitor prompt for eight hours). `sleep N` followed by another command is also blocked. Instead start every long command (setup, sweep, spec replay) with the Bash tool's run_in_background: true, and wait for its completion notification; while waiting, check progress only with short, quick Bash calls such as `tail -20 <logfile>` or `ps aux | grep sweep`.
5. Compiled script (Tier 2 spec arm: no model, no sitelooper runtime at replay time). Run it after the sweep, against a reset app, whatever the sweep's result:
   node bench/spec-replay.mjs --flow bench/results/flows/fwvk14.json --skills bench/results/fwvk14-skills --tag fwvk14-spec --target vikunja --reset --out bench/results 2>&1 | tee bench/results/fwvk14-spec-run.log
   node bench/verify-vikunja.mjs fwvk14-spec 2>&1 | tee bench/results/fwvk14-spec-verify.log
   If the flow is not compilable (compile exit 2), that is a legitimate result: report the compile log verbatim (bench/results/fwvk14-spec-compile.log) and skip the verifier. Do not recompile with --allow-demoted or any other override. Report-only objectives (checked against a finalText) may be UNVERIFIABLE for the compiled arm; that is expected.
6. Publish (a results branch, never main; commit ONLY results):
   mkdir -p bench/results-published && cp -r bench/results/fwvk14-* bench/results-published/ && cp bench/results/flows/fwvk14.json bench/results-published/fwvk14.json && cp ~/.sitelooper/sessions/fwvk14-n1/script.jsonl bench/results-published/fwvk14-n1-script.jsonl
   git checkout -b results/fwvk14 && git add bench/results-published && git commit -m "Add raw results for fwvk14" && git push -u origin results/fwvk14

WHAT THIS IS (commit b6966d3, round 63: the eighth confirmation, after round 62's fixes; rd, kb and ec are
skipped this round as stable, green three sweep rounds running).
New since round 62:
  - round 62: key presses are never folded at compile (an old bug folded ArrowDown ×3 into one press); a key pick
    the journal names becomes a click on that option BY NAME, else the press is verified by name and stops on a
    mismatch; a click that committed a highlighted option (select2) is a pick by name; a reported value equal to
    a part of the step's end url binds to that url part; a url part the step visited is compared only within its
    own route; the pre-submit refill re-checks a document replaced during its own check (Vikunja login); a read
    resolved by an inline heal or positional fallback is published only on the recorded kind of element; a
    pre-filled field cleared and restored around a failed save is dropped when the journal proves it (fields
    now record `was`); a reported list of records is flattened per field;
  - phase C (still SHADOW ONLY): fixed rules (hideRequired, abandonedEdit, flashCause, linkClick, pickerNetState,
    supersededSet) and a new keyPick rule; `carries` now covers multipart bodies with a file part.
Report on these specifically, verbatim:
  1. Any step whose status is "partial" (quote its `partial` reasons) and any step with an `unanswered`
     list (quote it).
  2. Any published value in n2/n3 outputs that does not match that run's own page (another run's record
     number, a recording's date/count, another record's name, a skill id or file path, or a value the run
     only TYPED). Quote it.
  3. Any warning containing "skipped", "echo", "unanswered", "literal", "given", "withheld", "applied",
     "positional", "doubled", "flash", "picked", "named", "off-record" or "stripped", verbatim.
  4. Any objective that fails on n2/n3 but passed on n1: quote it and the evidence it was scored from.
     For every objective the verifier scores from the app's DATABASE, confirm the persisted values match
     what the task asked for (not merely that the step reported success).
  5. Any export warning containing "REFUSE", "re-record" or "asks to report" after run 1, verbatim.
  6. The password value must appear NOWHERE in bench/results-published except as a login that equals it;
     grep and report a COUNT and, per hit, login vs password fill. Never paste the value. Quote
     requiredEnvNames from the compiled spec.
  7. Recording hygiene, from bench/results-published/fwvk14-n1-script.jsonl: the count of eval steps, of
     steps with `failed: true`, of eval refusals in the n1 log, and the script.jsonl size in bytes.
  8. Phase C: how many n1 steps carry `journal`; the row count of every shadow.jsonl under
     bench/results-published/fwvk14-skills (and any other store dir) and EVERY row with "agree": false,
     verbatim (rule, step, fact, heuristic). Make sure shadow.jsonl files are included in the published results.
What I care about most, in order:
  1. Every run's verifier summary (n1, n2, n3) and every FAIL line verbatim.
  2. For each replay (n2, n3), every step: tier, turns, fellBack, and the stored procedure id it replayed. For any step taking model turns, the reason verbatim. Quote every non-routine entry in the flowrun steps' warnings (skip only "value the skill itself set" notes).
  3. The compiled script: did it compile (quote the compile log verbatim if not, including any "demoted", "unsourced-ref", "unbound-pin" or "unfilled-slot"), its exit code, driftCount, every test error, and the verifier output. Report-only objectives may be UNVERIFIABLE for it; that is expected.
  4. Any step that PASSES while a verifier objective FAILS; any DUPLICATE record or EXTRA mutation (the verifier prints *** DUPLICATE WORK *** / *** EXTRA MUTATION *** just BEFORE the '<runid>: objectives passed' line of the run it belongs to); any step SKIPPED as "already in effect".
So: watch for steps REFUSING, stopping, or being SKIPPED, and quote the reason verbatim for the flow replays AND the compiled script. Quote verbatim every warning or [sitelooper skip]/[sitelooper warn] line containing "already in effect", "closes the dialog", "link", "href", "not on the page this procedure starts from", "starts elsewhere", "expected url", "raised an alert", "cannot be found", "adopted", "redid", "undid", "NOT in the flow", "unsourced-ref", "unbound-pin", "unfilled-slot", "never published", "no converged procedure", "demoted", "repinned", "recovered", "different record", "rerecord" - and say whether the page it names was actually the right one.

REPORT, verbatim: git log --oneline -1 and the branch pushed; the sweep's final table and every verifier summary line; for each replay (n2, n3) every step's id, tier, turns, fellBack AND the stored procedure id it replayed, from bench/results/fwvk14-n2-flowrun.json and -n3-flowrun.json, plus their warnings; the export warnings after run 1 (the lines after `stopped: fwvk14-n1`); the `orBackends` field of fwvk14-n1-sitelooper-result.json; for the compiled script, the last line of fwvk14-spec-run.log, every `[sitelooper warn]` and `[sitelooper skip]` line, the `stats`, `exitCode`, `driftCount` and every test's `error` from fwvk14-spec-result.json, and the full verifier output; any step that refused or stopped (replay or compiled), with its reason; anything you had to change to make setup work, with exact commands.

RULES: do not retry more than once, and report both attempts if you do. A failed objective, a turn cap, a non-compilable flow or a crash is a legitimate result: do not massage it or retry until it looks good. Do not change source code. Clean up: stop the target stack and any browser or sitelooper daemon you started.

NEVER end your turn while the sweep or the compiled replay is running, not even with a wakeup scheduled: a run whose session goes idle is lost (fwop13 and fwgt10 were, in round 58). Wait on the background job's completion notification.
