#!/usr/bin/env bash
# Seed the recording container with the contribution's own E2eSeeder (files/database/seeders),
# exactly what the upstream CI job runs. Idempotent: it is also build's reset command.
# Needs E2E_ADMIN_PASSWORD in the environment (the throwaway CI value).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
C="${SNIPEIT_E2E_CONTAINER:-snipeit-e2e-app-1}"
URL="${SNIPEIT_E2E_URL:-http://127.0.0.1:8000}"
: "${E2E_ADMIN_PASSWORD:?set E2E_ADMIN_PASSWORD}"

for _ in $(seq 1 120); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$URL/login" || true)"
  { [ "$code" = "200" ] || [ "$code" = "302" ]; } && break
  sleep 2
done

# Passport signing keys: without them the UI's own /api/v1 calls (lists, select2 dropdowns) fail.
if ! docker exec "$C" test -s /var/lib/snipeit/keys/oauth-private.key; then
  docker exec "$C" php artisan passport:keys --force
  docker exec "$C" chown docker:root /var/lib/snipeit/keys/oauth-private.key /var/lib/snipeit/keys/oauth-public.key
fi

APP_ROOT="${SNIPEIT_E2E_APP_ROOT:-/var/www/html}"
docker cp "$HERE/files/database/seeders/E2eSeeder.php" "$C:$APP_ROOT/database/seeders/E2eSeeder.php"
docker exec "$C" chown docker:root "$APP_ROOT/database/seeders/E2eSeeder.php"
# As the app user, so storage/logs/laravel.log is never created root-owned.
docker exec -u docker -e E2E_ADMIN_USERNAME="${E2E_ADMIN_USERNAME:-e2e-admin}" -e E2E_ADMIN_PASSWORD \
  "$C" php artisan db:seed --class='Database\Seeders\E2eSeeder' --force
