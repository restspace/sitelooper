#!/usr/bin/env bash
# Bring ONE held-out target up from the checked-out compose files, on a fresh
# volume, then seed and reset it: bench/heldout/bring-up.sh <directus|mealie|bookstack>
#
# Why a run box needs this: the holdout environment's snapshot is cached after
# its first run, so the session-start hook restarts the stacks from the files
# as they were THEN, not from the branch the box checks out. A fix made to a
# compose file afterwards (bookstack's no-ipv6 init, directus's admin email)
# only takes effect once the stack is recreated from the current files.
set -euo pipefail
t="${1:?usage: bring-up.sh <directus|mealie|bookstack>}"
cd "$(dirname "$0")/../.."
compose=(docker compose -f "bench/thirdparty/$t/docker-compose.yml")
case "$t" in
  directus)  url=http://127.0.0.1:8101/server/ping ;;
  mealie)    url=http://127.0.0.1:8102/api/app/about ;;
  bookstack) url=http://127.0.0.1:8103/login ;;
  *) echo "unknown held-out target: $t" >&2; exit 2 ;;
esac
"${compose[@]}" down -v --remove-orphans
"${compose[@]}" up -d
code=""
for _ in $(seq 1 150); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)"
  [ "$code" = "200" ] && break
  sleep 2
done
echo "$t: $url answered HTTP ${code:-nothing}"
[ "$code" = "200" ] || { "${compose[@]}" logs --tail 60; exit 1; }
[ "$t" = bookstack ] && bash bench/thirdparty/bookstack/seed.sh
node bench/reset-app.mjs --target "$t"
echo "$t: up, seeded and reset"
