#!/usr/bin/env bash
#
# One-time instance setup for the Grocy target:
#   0. the database. Grocy creates and migrates grocy.db on the first request
#      to "/" (SystemController::Root runs DatabaseMigrationService; "/" is
#      public and answers 302). Until then /login answers 500 (the layout
#      queries tables that do not exist yet), so this waits on "/" first.
#   1. the bench admin. Migration 0027 creates one user, admin / admin; this
#      sets its password to bench-admin-pass (Argon2id, as Grocy hashes it).
#      Grocy signs in by USERNAME, so the bench "email" is the username admin.
#   2. a FIXED API key for that user, so bench/app-reset.mjs,
#      bench/verify-grocy.mjs and bench/oracle-grocy.mjs need no key file.
#      Grocy keeps API keys in plain text in the api_keys table
#      (ApiKeyService::IsValidApiKey: api_key = ? AND expires > now AND
#      key_type = 'default'), so the row is written directly:
#        bench-grocy-api-key-0000000000000000000000000001
#      sent as   GROCY-API-KEY: <key>
#      Public on purpose: the app is bound to 127.0.0.1 on a throwaway box.
#
# Both are written with PHP's PDO SQLite (the image's php has pdo_sqlite, Grocy
# needs it) as the image's app user abc, so grocy.db never gains a root-owned
# journal. HOME is set because abc's home (/config) is not where a CLI wants
# to write (BookStack's tinker needed HOME on 2026-10-05).
#
# Everything ELSE the task needs (locations, quantity units, product groups,
# seed products) is created by the reset, which is the idempotent seed:
#
#   node bench/reset-app.mjs --target grocy
#
# Safe to re-run.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL="${GROCY_URL:-http://127.0.0.1:8106}"
KEY="${GROCY_API_KEY:-bench-grocy-api-key-0000000000000000000000000001}"
PASS="${GROCY_PASSWORD:-bench-admin-pass}"
DB="${GROCY_DB:-/config/data/grocy.db}"
CONTAINER="${GROCY_CONTAINER:-$(docker compose -f "$HERE/docker-compose.yml" ps -q grocy 2>/dev/null | head -1)}"
[ -n "$CONTAINER" ] || { echo "grocy: container not found (is the stack up?)" >&2; exit 1; }

# 0. "/" runs the migrations (a fresh database: ~250 of them, give it time) and
#    then redirects; 302 means php-fpm answered and the schema is current.
code=""
for _ in $(seq 1 150); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 120 "$URL/" || true)"
  [ "$code" = "302" ] && break
  sleep 2
done
[ "$code" = "302" ] || { echo "grocy: $URL/ never answered 302 (last: ${code:-none})" >&2; docker logs --tail 40 "$CONTAINER" >&2 || true; exit 1; }
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$URL/login" || true)"
[ "$code" = "200" ] || { echo "grocy: /login answers ${code:-nothing} after migrating (want 200)" >&2; exit 1; }
# "/" can answer 302 before the migrations have written the schema (grocy.db is
# a 0-byte file until they finish; seed failed with "no such table: users"
# on 2026-10-06), so wait for the file to hold a schema too.
size=0
for _ in $(seq 1 150); do
  size="$(docker exec "$CONTAINER" sh -c 'stat -c %s "$1" 2>/dev/null || echo 0' _ "$DB" || echo 0)"
  [ "${size:-0}" -gt 100000 ] && break
  curl -s -o /dev/null --max-time 120 "$URL/" || true
  sleep 2
done
[ "${size:-0}" -gt 100000 ] || { echo "grocy: $DB still ${size} bytes, never migrated" >&2; exit 1; }
echo "grocy: database migrated, /login answers 200"

# 1 + 2. Password and API key, straight into grocy.db. The script comes in on
# stdin (php with no file argument reads it), the values through the env.
docker exec -i -u abc -e HOME=/tmp -e G_DB="$DB" -e G_KEY="$KEY" -e G_PASS="$PASS" "$CONTAINER" \
  sh -c 'P="$(command -v php || command -v php85 || command -v php84 || command -v php83)"; [ -n "$P" ] || { echo "no php in the container" >&2; exit 1; }; exec "$P"' <<'PHP'
<?php
$db = new PDO('sqlite:' . getenv('G_DB'));
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('PRAGMA busy_timeout = 10000');
$pass = getenv('G_PASS');
$key = getenv('G_KEY');

$u = $db->query("SELECT id, password FROM users WHERE username = 'admin'")->fetch(PDO::FETCH_ASSOC);
if (!$u) {
	fwrite(STDERR, "grocy: no user 'admin' in the database (did the migrations run?)\n");
	exit(1);
}
if (password_verify($pass, $u['password'])) {
	echo "grocy admin password already set\n";
} else {
	$hash = defined('PASSWORD_ARGON2ID') ? password_hash($pass, PASSWORD_ARGON2ID) : password_hash($pass, PASSWORD_DEFAULT);
	$db->prepare('UPDATE users SET password = ? WHERE id = ?')->execute([$hash, $u['id']]);
	echo "grocy admin password set\n";
}

$row = $db->prepare('SELECT id, user_id, expires, key_type FROM api_keys WHERE api_key = ?');
$row->execute([$key]);
$k = $row->fetch(PDO::FETCH_ASSOC);
if ($k && intval($k['user_id']) === intval($u['id']) && $k['key_type'] === 'default' && $k['expires'] >= '2999-01-01') {
	echo "grocy API key already installed\n";
} else {
	if ($k) $db->prepare('DELETE FROM api_keys WHERE id = ?')->execute([$k['id']]);
	$db->prepare("INSERT INTO api_keys (api_key, user_id, expires, key_type, description) VALUES (?, ?, '2999-12-31 23:59:59', 'default', 'bench')")
		->execute([$key, $u['id']]);
	echo "grocy API key installed\n";
}
PHP

c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H "GROCY-API-KEY: $KEY" -H 'Accept: application/json' "$URL/api/system/info" || true)"
[ "$c" = "200" ] || { echo "grocy: the API key does not authenticate (GET /api/system/info: HTTP $c)" >&2; exit 1; }
echo "grocy API key authenticates"

# The browser's sign-in: a good password redirects to "/", a bad one to /login?invalid=true.
loc="$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 10 --data-urlencode 'username=admin' --data-urlencode "password=$PASS" "$URL/login" || true)"
case "$loc" in
  *invalid*|"") echo "grocy: admin / bench password does not sign in (redirect: ${loc:-none})" >&2; exit 1 ;;
esac
echo "grocy admin signs in with the bench password"
