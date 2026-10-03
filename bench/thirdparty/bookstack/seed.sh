#!/usr/bin/env bash
#
# One-time instance setup for the BookStack target:
#   1. the bench admin. A fresh install has one admin, admin@admin.com /
#      password; this turns THAT account into admin@bench.local /
#      bench-admin-pass (Bench Admin), email confirmed, in the Admin role.
#      If neither account exists it creates one with bookstack:create-admin.
#   2. a FIXED API token for that admin, so bench/app-reset.mjs,
#      bench/verify-bookstack.mjs and bench/oracle-bookstack.mjs need no token
#      file. BookStack stores only a hash of the secret (Hash::make, checked
#      with Hash::check by its ApiTokenGuard), so the row is written directly:
#        token_id  benchbookstacktokenid00000000001
#        secret    benchbookstacktokensecret0000001
#      sent as   Authorization: Token <token_id>:<secret>
#      The Admin role has "Access System API" on a fresh install. Public on
#      purpose: the app is bound to 127.0.0.1 on a throwaway box. The API token
#      and the browser sign-in are the SAME user, so the API also lists that
#      user's unsaved draft pages (drafts are visible only to their creator).
#
# Everything ELSE the task needs (books, chapters, seed pages, tags) is created
# by the reset, which is the idempotent seed, as for kanboard:
#
#   node bench/reset-app.mjs --target bookstack
#
# Safe to re-run.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL="${BOOKSTACK_URL:-http://127.0.0.1:8103}"
TOKEN="${BOOKSTACK_API_TOKEN:-benchbookstacktokenid00000000001:benchbookstacktokensecret0000001}"
TOKEN_ID="${TOKEN%%:*}"
TOKEN_SECRET="${TOKEN#*:}"
CONTAINER="${BOOKSTACK_CONTAINER:-$(docker compose -f "$HERE/docker-compose.yml" ps -q app 2>/dev/null | head -1)}"
[ -n "$CONTAINER" ] || { echo "bookstack: app container not found (is the stack up?)" >&2; exit 1; }

# The image migrates the database on start; /login answers 200 once it serves.
code=""
for _ in $(seq 1 150); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$URL/login" || true)"
  [ "$code" = "200" ] && break
  sleep 2
done
[ "$code" = "200" ] || { echo "bookstack: $URL/login never answered 200 (last: ${code:-none})" >&2; exit 1; }

# As the image's own app user (abc), so nothing under storage/ becomes root-owned.
docker exec -u abc "$CONTAINER" php /app/www/artisan tinker --execute='
  $User = "BookStack\\Users\\Models\\User";
  $u = $User::where("email", "admin@bench.local")->first() ?? $User::where("email", "admin@admin.com")->first();
  if (!$u) {
    Illuminate\Support\Facades\Artisan::call("bookstack:create-admin", [
      "--email" => "admin@bench.local", "--name" => "Bench Admin", "--password" => "bench-admin-pass",
    ]);
    $u = $User::where("email", "admin@bench.local")->firstOrFail();
    echo "bookstack admin created\n";
  }
  $changed = $u->email !== "admin@bench.local" || $u->name !== "Bench Admin" || !$u->email_confirmed
    || !Illuminate\Support\Facades\Hash::check("bench-admin-pass", $u->password);
  if ($changed) {
    $u->name = "Bench Admin";
    $u->email = "admin@bench.local";
    $u->password = Illuminate\Support\Facades\Hash::make("bench-admin-pass");
    $u->email_confirmed = true;
    $u->save();
    echo "bookstack admin set to admin@bench.local\n";
  } else { echo "bookstack admin already set\n"; }
  $role = BookStack\Users\Models\Role::getSystemRole("admin");
  if (!$u->roles()->where("roles.id", $role->id)->exists()) { $u->attachRole($role); echo "admin role attached\n"; }
  $t = BookStack\Api\ApiToken::where("token_id", "'"$TOKEN_ID"'")->first() ?? new BookStack\Api\ApiToken;
  if (!$t->exists || intval($t->user_id) !== intval($u->id) || !Illuminate\Support\Facades\Hash::check("'"$TOKEN_SECRET"'", $t->secret)) {
    $t->token_id = "'"$TOKEN_ID"'";
    $t->secret = Illuminate\Support\Facades\Hash::make("'"$TOKEN_SECRET"'");
    $t->name = "bench";
    $t->user_id = $u->id;
    $t->expires_at = "2099-12-31";
    $t->save();
    echo "bookstack API token installed\n";
  } else { echo "bookstack API token already installed\n"; }
'

c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H "Authorization: Token $TOKEN" \
  -H 'Accept: application/json' "$URL/api/books" || true)"
[ "$c" = "200" ] || { echo "bookstack: the API token does not authenticate (GET /api/books: HTTP $c)" >&2; exit 1; }
echo "bookstack API token authenticates"
