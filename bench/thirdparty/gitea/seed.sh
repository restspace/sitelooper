#!/usr/bin/env bash
#
# One-time instance setup for the Gitea target: create the admin account. With
# INSTALL_LOCK set there is no install wizard to create one, and the web UI has
# registration off, so the CLI inside the container is the only way in.
# --must-change-password=false keeps run 1 structurally the same as every
# replay (no forced change on first sign-in).
#
# The API is then reached with HTTP Basic admin:bench-admin-pass, which Gitea
# accepts on /api/v1 - no token to mint. Everything ELSE the task needs (the
# bench org and repo, the assignee user, labels, milestone, seed issues) is
# created by the reset, which is the idempotent seed, as for kanboard:
#
#   node bench/reset-app.mjs --target gitea
#
# Safe to re-run: an existing admin is left alone.

set -euo pipefail

CONTAINER="${GITEA_CONTAINER:-gitea-gitea-1}"

for _ in $(seq 1 60); do
  docker exec "$CONTAINER" gitea admin user list >/dev/null 2>&1 && break
  sleep 2
done

if docker exec "$CONTAINER" gitea admin user list 2>/dev/null | awk '{print $2}' | grep -qx admin; then
  echo "gitea admin already present"
else
  docker exec "$CONTAINER" gitea admin user create --admin --username admin \
    --password bench-admin-pass --email admin@example.com --must-change-password=false
fi
