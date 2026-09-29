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
target=$(grep -o '^==> Starting target: [a-z]*' "$LOG" | tail -1 | awk '{print $4}')
if [ -n "$target" ]; then
  docker ps --format '{{.Names}}' 2>/dev/null | grep -q "$target" && exit 0
  args=(--with-arm-b --with-target "$target")
else
  # repairdesk: the app is a node server, not a container
  pgrep -f bench/app/server.mjs >/dev/null && exit 0
  args=(--with-arm-b)
fi
bench/cloud-setup.sh "${args[@]}" > /tmp/session-start.log 2>&1
echo "EXIT $?" >> /tmp/session-start.log
exit 0