#!/usr/bin/env bash
# Bring ONE held-out target up from the checked-out compose files, on a fresh
# volume, then seed and reset it: bench/heldout/bring-up.sh <directus|mealie|bookstack|planka|kimai|grocy>
#
# Why a run box needs this: the holdout environment's snapshot is cached after
# its first run, so the session-start hook restarts the stacks from the files
# as they were THEN, not from the branch the box checks out. A fix made to a
# compose file afterwards (bookstack's no-ipv6 init, directus's admin email)
# only takes effect once the stack is recreated from the current files.
set -euo pipefail
t="${1:?usage: bring-up.sh <directus|mealie|bookstack|planka|kimai|grocy>}"
cd "$(dirname "$0")/../.."
compose=(docker compose -f "bench/thirdparty/$t/docker-compose.yml")
case "$t" in
  directus)  url=http://127.0.0.1:8101/server/ping ;;
  mealie)    url=http://127.0.0.1:8102/api/app/about ;;
  bookstack) url=http://127.0.0.1:8103/login ;;
  planka)    url=http://127.0.0.1:8104/ ;;
  kimai)     url=http://127.0.0.1:8105/en/login ;;
  grocy)     url=http://127.0.0.1:8106/robots.txt ;;
  *) echo "unknown held-out target: $t" >&2; exit 2 ;;
esac
# A box restored from the environment's cached snapshot has no docker daemon
# (hodx3/homl2 2026-10-05: "Cannot connect to the Docker daemon"). Start it as
# cloud-setup.sh does, after clearing the snapshot's stale pid file and socket.
if ! docker info >/dev/null 2>&1; then
  echo "docker daemon not running; starting dockerd"
  rm -f /var/run/docker.pid /var/run/docker.sock /var/run/docker/containerd/containerd.pid
  nohup dockerd >/tmp/dockerd.log 2>&1 &
  for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 1; done
  docker info >/dev/null 2>&1 || { tail -30 /tmp/dockerd.log; echo "dockerd did not come up" >&2; exit 1; }
fi
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
# A target whose admin or API token cannot come from env has a seed.sh
# (bookstack, kimai, grocy); directus, mealie and planka have none.
if [ -f "bench/thirdparty/$t/seed.sh" ]; then bash "bench/thirdparty/$t/seed.sh"; fi
node bench/reset-app.mjs --target "$t"
echo "$t: up, seeded and reset"
