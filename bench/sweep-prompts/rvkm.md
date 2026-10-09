Run ONE omitted-work recovery box for kimai: rebuild two PUBLISHED held-out recordings (results/hbkm3, results/hbkm1) offline from their n1 scripts with this branch's code, run the product's own `sitelooper build` (convergence, then the readiness gate) on each, and publish the raw results. The model is called only by build's re-records. Do not run bench/sweep.mjs or bench/harness.mjs.

1. Code: cd /home/user/sitelooper && git fetch origin && git checkout -B bench/compile-g1-ab origin/bench/compile-g1-ab && npm ci && npm run build   (never push main or bench/compile-g1-ab). Record `git log --oneline -1`. Check: `git diff --stat origin/fix/compile-g1 HEAD -- src test package.json` MUST print nothing, and `grep -q omittedToRecover src/spec/converge.ts && grep -q insertOmittedStep src/spec/rerecord.ts` must succeed; else STOP and report.
2. Environment: do NOT edit ~/.bashrc, ~/.profile or any other shell startup file. Put the five exports below at the start of every command that needs them, or in a script file under /tmp that each command sources.
   Models: OpenRouter everywhere, never Novita. OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line.
   export SITELOOPER_PROVIDER=openrouter
   export SITELOOPER_MODEL=deepseek/deepseek-v4.1-flash
   export SITELOOPER_FALLBACK_MODEL=openai/gpt-6-luna
   export SITELOOPER_EXTRA_BODY='{"provider":{"only":["DeepSeek"]}}'
   export SITELOOPER_SOURCING_HOLD=on
3. Setup ALREADY RAN (node, build, browser; see /tmp/setup.log); the environment may also have started other held-out apps; ignore them. Do NOT run cloud-setup.sh. Bring THIS box's app up from the checked-out files, on a fresh volume (1-5 minutes; it ends with `kimai: up, seeded and reset`). bring-up.sh is this repository's own script: it runs `docker compose` on bench/thirdparty/kimai/docker-compose.yml, committed here, then this repository's seed and reset; it talks only to the local app:
   mkdir -p bench/results/flows && bash bench/heldout/bring-up.sh kimai 2>&1 | tee bench/results/rvkm-bring-up.log
   If it fails with Docker Hub "429 Too Many Requests" (the pull rate limit), pull the two pinned images through Google's Docker Hub mirror and retag them, then run the same bring-up command ONCE more:
     for i in kimai/kimai2:2.68.0 mariadb:11.4.13; do m=mirror.gcr.io/$i; case $i in */*) ;; *) m=mirror.gcr.io/library/$i;; esac; docker pull $m && docker tag $m $i; done
   (If the mirror lacks an image, wait 10 minutes and pull it from Docker Hub directly, once.) If bring-up still exits non-zero, paste its output verbatim and STOP.
4. For EACH of hbkm3 then hbkm1 (call it R), rebuild its n1 recording into a flow and a skill store (seconds, no model, no app):
   mkdir -p /tmp/rec/R && git show origin/results/R:bench/results-published/R-n1-script.jsonl > /tmp/rec/R/R-n1-script.jsonl
   REBUILD_STORE_DIR="$PWD/bench/results/rvkm-R-skills" REBUILD_DUMP="$PWD/bench/results/flows/rvkm-R.json" node bench/rebuild-flow.mjs --tag R --dir /tmp/rec/R > bench/results/rvkm-R-rebuild.log 2>&1
   Then print what the flow says was left out (expect one entry with "step": "04b-verify" for hbkm3): node -e 'const f=require(process.argv[1]);console.log(f.steps.map(s=>s.id).join(" "));console.log(JSON.stringify(f.omitted??null,null,1))' "$PWD/bench/results/flows/rvkm-R.json" | tee bench/results/rvkm-R-omitted.txt
   If the flow file or the store directory is missing, paste the rebuild log's last 30 lines and STOP.
5. For EACH R, in order (10-60 minutes each; start it with the Bash tool's run_in_background: true and wait for its completion notification; do NOT use the Monitor tool and do not chain sleep; check progress only with `tail -20 bench/results/rvkm-R-cv-build.log`):
   node bench/heldout/converge-build.mjs --from rvkm-R --target kimai --rounds 3 2>&1 | tee bench/results/rvkm-R-cv-wrapper.log
   A refused compile, a failed spec, a build that does not converge or a FAIL objective is a legitimate result: do not change any code, config, task or test, and do not rerun.
6. Publish, ONE command on its own, before reading any result: node bench/publish-results.mjs --base rvkm

WHAT THIS IS: kimai hbkm3's recording set a project's order number in an instruction that reported blocked (and whose retry failed); the flow left that instruction out and the compiled spec passed with no order number (verifier objective 4). `build` now puts such an instruction back as a step (04b-…) and re-records it. hbkm1 has the same kind of omission but its spec has other failures too.

REPORT, verbatim, for each R: git log --oneline -1 (once); the contents of bench/results/rvkm-R-omitted.txt; build's exit code; the last 40 lines of bench/results/rvkm-R-cv-build.log; from rvkm-R-cv-build.json the converge status, why, modelTurns and each round (compile outcome and codes; check passed, step and drift; rerecord step, ok, attempt and turns), and the readiness object's outcome, blockers and warnings; the step ids of bench/results/rvkm-R-cv-flow.json and its `omitted` field; the full verifier output of rvkm-R-cv-spec (bench/results/rvkm-R-cv-spec-verify.log); any model-side error (HTTP 4xx/5xx, MODEL_PROVIDER_FAILED, STEP_TIMEOUT); the branch pushed.
Clean up at the end: stop any browser or sitelooper daemon you started and the app stack.
NEVER end your turn while a command runs in the background: wait on its completion notification.
