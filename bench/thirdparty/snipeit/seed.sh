#!/usr/bin/env bash
#
# One-time instance setup for the Snipe-IT target:
#   1. the admin account and the settings row. Snipe-IT redirects every page to
#      its /setup wizard until BOTH a user and a settings row exist; this makes
#      them the way the wizard's final step would, so no wizard is left open.
#      Asset tags auto-increment (BA-00001, BA-00002, ...) so a created asset
#      gets a minted tag the task reports.
#   2. a Passport personal API token for the admin, which bench/app-reset.mjs
#      and bench/verify-snipeit.mjs send as a Bearer token. Passport tokens are
#      signed JWTs, so a fixed one cannot be preset (as OpenProject's is): it is
#      minted here and written to bench/thirdparty/snipeit/.api-token
#      (gitignored), or to $SNIPEIT_TOKEN_FILE. The token is re-minted only when
#      the stored one no longer authenticates.
#
# Everything ELSE the task needs (category, manufacturer, model, status labels,
# location, the assignee user, seed assets) is created by the reset, which is
# the idempotent seed, as for kanboard:
#
#   node bench/reset-app.mjs --target snipeit
#
# Safe to re-run.

set -euo pipefail

CONTAINER="${SNIPEIT_CONTAINER:-snipeit-app-1}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_FILE="${SNIPEIT_TOKEN_FILE:-$HERE/.api-token}"
URL="${SNIPEIT_URL:-http://127.0.0.1:8098}"

for _ in $(seq 1 90); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$URL/login" || true)"
  [ "$code" = "200" ] || [ "$code" = "302" ] && break
  sleep 2
done

# The image's startup script does not generate Passport's signing keys, and
# without them both the API token and the web UI's own /api/v1 calls (every
# bootstrap-table list and select2 dropdown) fail. They live in the data volume.
if docker exec "$CONTAINER" test -s /var/lib/snipeit/keys/oauth-private.key; then
  echo "passport keys already present"
else
  docker exec "$CONTAINER" php artisan passport:keys --force
  docker exec "$CONTAINER" chown docker:root /var/lib/snipeit/keys/oauth-private.key /var/lib/snipeit/keys/oauth-public.key
fi

docker exec "$CONTAINER" php artisan tinker --execute='
  $u = App\Models\User::withTrashed()->where("username", "admin")->first();
  if (!$u) {
    $u = new App\Models\User;
    $u->first_name = "Bench"; $u->last_name = "Admin"; $u->username = "admin";
    $u->email = "admin@example.com"; $u->activated = 1;
    $u->permissions = json_encode(["superuser" => 1]);
    $u->password = bcrypt("bench-admin-pass");
    $u->forceSave();
    echo "snipeit admin created\n";
  } else { echo "snipeit admin already present\n"; }
  if (App\Models\Setting::count() === 0) {
    $s = new App\Models\Setting;
    $s->site_name = "Bench Assets"; $s->alert_email = "admin@example.com";
    $s->alerts_enabled = 0; $s->pwd_secure_min = 10; $s->brand = 1;
    $s->link_light_color = "#296282"; $s->link_dark_color = "#296282"; $s->nav_link_color = "#FFFFFF";
    $s->locale = "en-US"; $s->default_currency = "USD"; $s->created_by = $u->id;
    $s->full_multiple_companies_support = 0;
    $s->auto_increment_assets = 1; $s->auto_increment_prefix = "BA-"; $s->zerofill_count = 5;
    $s->next_auto_tag_base = 1;
    $s->forceSave();
    echo "snipeit settings created\n";
  } else { echo "snipeit settings already present\n"; }
  if (!Illuminate\Support\Facades\DB::table("oauth_clients")->where("personal_access_client", 1)->exists()) {
    Illuminate\Support\Facades\Artisan::call("passport:client", ["--personal" => true, "--name" => "Bench Personal Access Client", "--no-interaction" => true]);
    echo "passport personal access client created\n";
  }
'

api_ok() {
  [ -s "$TOKEN_FILE" ] || return 1
  local c
  c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H "Authorization: Bearer $(cat "$TOKEN_FILE")" \
    -H 'Accept: application/json' "$URL/api/v1/users/me" || true)"
  [ "$c" = "200" ]
}

if api_ok; then
  echo "snipeit API token already valid ($TOKEN_FILE)"
else
  ADMIN_ID="$(docker exec "$CONTAINER" php artisan tinker --execute='echo App\Models\User::where("username","admin")->value("id");' | tr -d '[:space:]')"
  docker exec "$CONTAINER" php artisan snipeit:make-api-key --user_id="$ADMIN_ID" --name=bench --key-only \
    | tr -d '[:space:]' >"$TOKEN_FILE"
  api_ok || { echo "snipeit API token minted but does not authenticate" >&2; exit 1; }
  echo "snipeit API token minted into $TOKEN_FILE"
fi
