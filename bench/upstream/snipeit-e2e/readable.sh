#!/usr/bin/env bash
# Recompile the sie2e1 Snipe-IT recording in the READABLE style with this checkout's sitelooper,
# prove it with build (readiness, converging if needed), then run plain Playwright twice, timed.
#
#   bash bench/upstream/snipeit-e2e/readable.sh <runid>
#
# Needs the recording instance up and seeded (docker-compose.yml + seed.sh beside this file), and
# origin/results/sie2e1 fetched. Writes everything to bench/results/<runid>-snipeit-e2e/.
set -uo pipefail
BOX="${1:?runid}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HERE="$REPO/bench/upstream/snipeit-e2e"
OUT="$REPO/bench/results/$BOX-snipeit-e2e"
PROJ="/tmp/$BOX/tests/e2e"
SL="node $REPO/bin/sitelooper.js"
mkdir -p "$OUT" "$PROJ"
log() { echo "[readable] $*" | tee -a "$OUT/steps.log"; }

export E2E_ADMIN_USERNAME=e2e-admin
export E2E_ADMIN_PASSWORD=e2e-ci-password
export SITELOOPER_HOME="/tmp/$BOX/sitelooper-home"

# The pilot's project as it was published: config, bundle, the user's spec.ts. Not its runtime flow.ts.
SRC=bench/results-published/sie2e1-snipeit-e2e/tests-e2e
git -C "$REPO" archive origin/results/sie2e1 "$SRC" | tar -x -C "$PROJ" --strip-components=4
rm -f "$PROJ"/specs/*.flow.ts "$PROJ"/specs/*.readiness.json; rm -rf "$PROJ"/specs/.sitelooper-check-* "$PROJ"/.sitelooper/procedures.bak-*.json
cp "$HERE/files/tests/e2e/playwright.config.ts" "$HERE/files/tests/e2e/package.json" "$HERE/files/tests/e2e/package-lock.json" "$PROJ/"
cd "$PROJ"
ls -la . specs .sitelooper >"$OUT/project-before.txt" 2>&1
npm ci >"$OUT/npm-ci.log" 2>&1 || { log "npm ci failed"; exit 2; }
npx playwright install chromium >"$OUT/pw-install.log" 2>&1 || true
log "sitelooper $($SL --version) at $(git -C "$REPO" log --oneline -1)"

$SL compile .sitelooper/procedures.json --style readable --json >"$OUT/01-compile.json" 2>"$OUT/01-compile.stderr"; log "compile exit $?"
wc -l specs/*.flow.ts | tee -a "$OUT/steps.log"
cp specs/asset-checkout.flow.ts "$OUT/asset-checkout.flow.first.ts" 2>/dev/null

$SL build .sitelooper/procedures.json --style readable --var 'runid=e2e-{n}' --reset-cmd "bash $HERE/seed.sh" --json --progress >"$OUT/02-build.json" 2>"$OUT/02-build.stderr"
BUILD=$?; log "build exit $BUILD"
wc -l specs/*.flow.ts | tee -a "$OUT/steps.log"

PLAIN=0
for i in 1 2 3 4 5; do
  bash "$HERE/seed.sh" >>"$OUT/seed.log" 2>&1
  t0=$(date +%s)
  RUNID="plain$i-$(date +%s)" npx playwright test --reporter=list >"$OUT/03-plain-$i.txt" 2>&1; rc=$?
  log "plain playwright run $i exit $rc in $(( $(date +%s) - t0 ))s"; [ $rc -ne 0 ] && PLAIN=$rc
done

mkdir -p "$OUT/tests-e2e"
tar --exclude=node_modules --exclude=test-results --exclude=playwright-report -cf - . | tar -xf - -C "$OUT/tests-e2e"
log "done: build=$BUILD plain=$PLAIN"
exit $(( BUILD != 0 ? BUILD : PLAIN ))
