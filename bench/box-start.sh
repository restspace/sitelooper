#!/usr/bin/env bash
# SessionStart hook (.claude/settings.json). On a cloud sweep box whose
# environment setup was restored from cache ("Setup script cached from previous
# run"), the files are there but nothing is running: no dockerd, no app. Bring
# the target named in the setup log back up. A no-op anywhere else: no
# /tmp/setup.log (a dev machine, the Verify environment), or the app already up.
set -u
LOG=/tmp/setup.log
[ -f "$LOG" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-/home/user/sitelooper}" || exit 0
# say() wraps headings in bold escapes, so the line never starts with ==>
# An environment may bring up several targets (the held-out env starts three);
# restore every one the setup log started, not only the last.
targets=$(grep -o '==> Starting target: [a-z]*' "$LOG" | awk '{print $4}' | sort -u)
if [ -n "$targets" ]; then
  up=1
  for t in $targets; do
    docker ps --format '{{.Names}}' 2>/dev/null | grep -q "$t" || up=0
  done
  [ "$up" = 1 ] && exit 0
  # the cached snapshot keeps the first run's pid file and socket; a stale
  # pid file makes a new dockerd exit at once
  rm -f /var/run/docker.pid /var/run/docker.sock /var/run/docker/containerd/containerd.pid
  args=(--with-arm-b)
  for t in $targets; do args+=(--with-target "$t"); done
else
  # repairdesk: the app is a node server, not a container
  pgrep -f bench/app/server.mjs >/dev/null && exit 0
  args=(--with-arm-b)
fi
setsid -w bench/cloud-setup.sh "${args[@]}" > /tmp/session-start.log 2>&1 < /dev/null
rc=$?
{
  echo "--- session-start (restored box)"
  tail -8 /tmp/session-start.log
  echo "--- dockerd.log"
  tail -15 /tmp/dockerd.log 2>/dev/null
  echo "--- docker ps"
  docker ps --format '{{.Names}}' 2>&1
  echo "EXIT $rc"
} >> "$LOG"
exit 0
