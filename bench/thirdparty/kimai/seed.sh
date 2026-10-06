#!/usr/bin/env bash
#
# One-time instance setup for the Kimai target (the box runs it as root, with
# docker). The image's entrypoint already creates the admin (username "admin",
# admin@example.com / bench-admin-pass, ROLE_SUPER_ADMIN) from ADMINMAIL /
# ADMINPASS. This adds what neither the entrypoint nor the API can:
#
#   1. the admin exists, is enabled, has the bench email and password
#      (kimai:user:create / kimai:user:password, as the image's www-data user
#      with HOME set, so nothing under var/ becomes root-owned);
#   2. a FIXED API token for that admin, so bench/app-reset.mjs,
#      bench/verify-kimai.mjs and bench/oracle-kimai.mjs need no token file.
#      Kimai 2 stores API tokens in plain text in kimai2_access_token (looked
#      up by AccessTokenHandler) and has no console command to make one, so the
#      row is written directly:  Authorization: Bearer benchkimaiapitoken000000000000001
#   3. the admin's first-login wizard (intro, profile) marked seen — it is
#      shown to every admin until the "__wizards__" preference lists both — and
#      the admin's timezone preference pinned to UTC, so the browser, the API
#      and the verifier read the same wall-clock times;
#   4. project ids start at 40001 (AUTO_INCREMENT), so the id a run reports
#      from the address bar cannot be confused with a small number elsewhere in
#      its report (a date, a time, an order number).
#
# Everything ELSE the task needs (customers, projects, activities, tags) is
# created by the reset, which is the idempotent seed, as for kanboard:
#
#   node bench/reset-app.mjs --target kimai
#
# Safe to re-run.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL="${KIMAI_URL:-http://127.0.0.1:8105}"
TOKEN="${KIMAI_API_TOKEN:-benchkimaiapitoken000000000000001}"
EMAIL="admin@example.com"
PASSWORD="bench-admin-pass"
compose=(docker compose -f "$HERE/docker-compose.yml")
APP="${KIMAI_CONTAINER:-$("${compose[@]}" ps -q kimai 2>/dev/null | head -1)}"
DB="${KIMAI_DB_CONTAINER:-$("${compose[@]}" ps -q db 2>/dev/null | head -1)}"
[ -n "$APP" ] || { echo "kimai: app container not found (is the stack up?)" >&2; exit 1; }
[ -n "$DB" ] || { echo "kimai: db container not found (is the stack up?)" >&2; exit 1; }

# The entrypoint installs the schema and creates the admin before Apache starts;
# /en/login answers 200 once it serves.
code=""
for _ in $(seq 1 150); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$URL/en/login" || true)"
  [ "$code" = "200" ] && break
  sleep 2
done
[ "$code" = "200" ] || { echo "kimai: $URL/en/login never answered 200 (last: ${code:-none})" >&2; exit 1; }

console() { docker exec -u www-data -e HOME=/tmp -w /opt/kimai "$APP" /opt/kimai/bin/console --no-interaction "$@"; }
sql() { docker exec -i "$DB" mariadb -ukimai -pbench-db-pass kimai "$@"; }

# 1. The admin.
if [ -z "$(sql -N -e "SELECT id FROM kimai2_users WHERE username='admin'")" ]; then
  console kimai:user:create admin "$EMAIL" ROLE_SUPER_ADMIN "$PASSWORD"
  echo "kimai admin created"
fi
sql -e "UPDATE kimai2_users SET email='$EMAIL', enabled=1 WHERE username='admin'"
console kimai:user:password admin "$PASSWORD" >/dev/null
echo "kimai admin is admin / $EMAIL, enabled, bench password set"

# 2-4. Token, wizard, timezone, project ids.
sql <<SQL
SET @u := (SELECT id FROM kimai2_users WHERE username='admin');
DELETE FROM kimai2_access_token WHERE token='$TOKEN' AND user_id <> @u;
INSERT INTO kimai2_access_token (user_id, token, name, expires_at)
  SELECT @u, '$TOKEN', 'bench', NULL FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM kimai2_access_token WHERE token='$TOKEN');
UPDATE kimai2_access_token SET expires_at = NULL WHERE token='$TOKEN';
INSERT INTO kimai2_user_preferences (user_id, name, value) VALUES
  (@u, '__wizards__', 'intro,profile'),
  (@u, 'timezone', 'UTC')
  ON DUPLICATE KEY UPDATE value = VALUES(value);
SQL
# AUTO_INCREMENT only moves up, never below MAX(id)+1, so this is idempotent.
sql -e "ALTER TABLE kimai2_projects AUTO_INCREMENT = 40001"
echo "kimai API token, wizard, timezone and project ids set"

# Doctrine may hold the user's preferences in its cache; clear it so the
# web session reads the rows just written.
console cache:pool:clear cache.app >/dev/null 2>&1 || true

c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' "$URL/api/version" || true)"
[ "$c" = "200" ] || { echo "kimai: the API token does not authenticate (GET /api/version: HTTP $c)" >&2; exit 1; }
echo "kimai API token authenticates"
