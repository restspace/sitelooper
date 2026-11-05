#!/usr/bin/env bash
# Compile the sie2e1 Snipe-IT recording with --standalone (the file handed to the upstream project)
# and run it with plain Playwright five times, reseeding between runs.
#
#   bash bench/upstream/snipeit-e2e/standalone.sh <runid>
#
# Run after readable.sh <runid>: it reuses that project's installed node_modules. Writes to
# bench/results/<runid>-snipeit-e2e/standalone/.
set -uo pipefail
BOX="${1:?runid}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HERE="$REPO/bench/upstream/snipeit-e2e"
OUT="$REPO/bench/results/$BOX-snipeit-e2e/standalone"
SRC="/tmp/$BOX/tests/e2e"
PROJ="/tmp/$BOX/standalone/tests/e2e"
SL="node $REPO/bin/sitelooper.js"
mkdir -p "$OUT" "$PROJ"
log() { echo "[standalone $(date -u +%H:%M:%S)] $*" | tee -a "$OUT/steps.log"; }
[ -d "$SRC/node_modules" ] || { log "no $SRC/node_modules: run readable.sh $BOX first"; exit 2; }

export E2E_ADMIN_USERNAME=e2e-admin
export E2E_ADMIN_PASSWORD=e2e-ci-password
export SITELOOPER_HOME="/tmp/$BOX/sitelooper-home"

cp -r "$SRC/." "$PROJ/"
rm -rf "$PROJ"/specs/*.ts "$PROJ"/specs/*.readiness.json "$PROJ"/specs/.sitelooper-check-* "$PROJ"/test-results "$PROJ"/playwright-report
cd "$PROJ"
$SL compile .sitelooper/procedures.json --style readable --standalone --json >"$OUT/01-compile.json" 2>"$OUT/01-compile.stderr"; log "compile exit $?"
wc -l specs/*.ts | tee -a "$OUT/steps.log"
cp specs/*.ts "$OUT/" 2>/dev/null

PLAIN=0
for i in 1 2 3 4 5; do
  bash "$HERE/seed.sh" >>"$OUT/seed.log" 2>&1
  rm -rf test-results
  t0=$(date +%s)
  RUNID="sa$i-$(date +%s)" npx playwright test --reporter=list --trace on >"$OUT/03-plain-$i.txt" 2>&1; rc=$?
  log "plain playwright run $i exit $rc in $(( $(date +%s) - t0 ))s"; [ $rc -ne 0 ] && PLAIN=$rc
  [ $rc -ne 0 ] && cp -r test-results "$OUT/03-plain-$i-test-results" 2>/dev/null
  python3 "$HERE/api-summary.py" trace $(find test-results -name trace.zip) >"$OUT/03-plain-$i-api.txt" 2>&1
  log "run $i api: $(sed -n 2p "$OUT/03-plain-$i-api.txt")"
done
log "done: plain=$PLAIN"
exit $PLAIN
