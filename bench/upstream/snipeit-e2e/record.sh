#!/usr/bin/env bash
# Record, build and check the Snipe-IT asset check-out spec with the PUBLISHED sitelooper,
# in a project laid out as the upstream repo's tests/e2e. Fixed instructions, so the run
# is reproducible: no orchestrator splits the task.
#
#   bash bench/upstream/snipeit-e2e/record.sh <runid>
#
# Writes everything to bench/results/<runid>-snipeit-e2e/ (publish with publish-results.mjs).
set -uo pipefail
BOX="${1:?runid}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HERE="$REPO/bench/upstream/snipeit-e2e"
OUT="$REPO/bench/results/$BOX-snipeit-e2e"
PROJ="/tmp/$BOX/tests/e2e"
mkdir -p "$OUT" "$PROJ"
log() { echo "[record] $*" | tee -a "$OUT/steps.log"; }

export E2E_ADMIN_USERNAME=e2e-admin
export E2E_ADMIN_PASSWORD=e2e-ci-password
export SITELOOPER_HOME="/tmp/$BOX/sitelooper-home"

cp -r "$HERE/files/tests/e2e/." "$PROJ/"
cd "$PROJ"
npm ci >"$OUT/npm-ci.log" 2>&1 || { log "npm ci failed"; exit 2; }
npx playwright install chromium >"$OUT/pw-install.log" 2>&1 || log "playwright install chromium failed (may already be present)"
log "sitelooper $(sitelooper --version)"
sitelooper doctor >"$OUT/doctor.txt" 2>&1; log "doctor exit $?"

cat > sitelooper.config.json <<'JSON'
{
  "vars": {},
  "requiredVars": ["runid"],
  "outputDir": "specs",
  "snapshotFile": ".sitelooper/procedures.json",
  "verificationRuns": 3,
  "fixtureIsolation": false,
  "playwright": { "config": "playwright.config.ts" }
}
JSON

S=si
step() { # name, then the sitelooper args
  local name="$1"; shift
  sitelooper --session "$S" "$@" --json >"$OUT/$name.json" 2>"$OUT/$name.stderr"
  local rc=$?
  log "$name exit $rc: $(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log((j.outcome??"")+" "+(j.report?.summary??"").slice(0,300))}catch{console.log("(no json)")}' "$OUT/$name.json")"
  return $rc
}

step 01-open --learn open http://127.0.0.1:8000/ || exit 1
step 02-var var runid=demo || exit 1
step 03-signin do 'Sign in as {{env:E2E_ADMIN_USERNAME}} with password {{env:E2E_ADMIN_PASSWORD}} and verify the dashboard opens' || exit 1
step 04-create do "Create an asset named 'demo E2E Laptop' of model 'E2E Laptop Model' with status 'Ready to Deploy', default location 'E2E Office' and purchase date 2026-03-15. Save it, verify its asset page opens, and report its asset tag." || exit 1
step 05-checkout do "Check out the asset 'demo E2E Laptop' to the user 'E2E Assignee' with the note 'demo checkout'. Verify the asset's page then shows it is checked out to E2E Assignee." || exit 1
step 06-assert assert "the page of the asset 'demo E2E Laptop' shows it is checked out to E2E Assignee" || exit 1
step 07-stop stop --save-flow asset-checkout || exit 1
sitelooper flow export asset-checkout --out .sitelooper/procedures.json --json >"$OUT/08-export.json" 2>"$OUT/08-export.stderr"; log "export exit $?"

sitelooper build asset-checkout --var 'runid=e2e-{n}' --reset-cmd "bash $HERE/seed.sh" --json --progress >"$OUT/09-build.json" 2>"$OUT/09-build.stderr"
BUILD=$?; log "build exit $BUILD"

# The proof that matters upstream: plain Playwright, no sitelooper involved.
bash "$HERE/seed.sh" >>"$OUT/seed.log" 2>&1

RUNID="plain-$(date +%s)" npx playwright test --reporter=list >"$OUT/10-plain-playwright.txt" 2>&1
PLAIN=$?; log "plain playwright exit $PLAIN"

# The contribution's files, as they would be committed upstream (no node_modules, no sessions).
mkdir -p "$OUT/tests-e2e"
tar --exclude=node_modules --exclude=test-results --exclude=playwright-report --exclude=.sitelooper/sessions -cf - . | tar -xf - -C "$OUT/tests-e2e"
log "done: build=$BUILD plain=$PLAIN"
exit $(( BUILD != 0 ? BUILD : PLAIN ))
