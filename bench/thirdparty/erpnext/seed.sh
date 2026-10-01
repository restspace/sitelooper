#!/usr/bin/env bash
#
# One-time instance setup for the ERPNext target: complete the Setup Wizard
# programmatically, so a sign-in lands on the desk and never on
# /app/setup-wizard. It calls the same server method the wizard's last slide
# posts to (frappe.desk.page.setup_wizard.setup_wizard.setup_complete), through
# `bench execute` inside the backend container rather than over HTTP, because
# the stages (fixtures, chart of accounts) can outlast gunicorn's 120s request
# timeout on a cold box:
#
#   company  Bench Company (abbr BC), country United States, currency USD,
#            Standard chart of accounts, fiscal year 2026-01-01..2026-12-31,
#            time zone UTC, no demo data, no first user (Administrator signs in)
#
# It also sets the site's host_name, so links the app generates point at
# http://127.0.0.1:8100.
#
# Everything ELSE the task needs (customers, items, prices, the three Seed:
# sales orders, date format, later fiscal years) is created by the reset,
# which is the idempotent seed, as for kanboard:
#
#   node bench/reset-app.mjs --target erpnext
#
# No API key is minted: the reset and the verifier sign in as Administrator
# with POST /api/method/login and use the session cookie.
#
# Safe to re-run: a completed setup is detected and left alone.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE=(docker compose -f "$HERE/docker-compose.yml")
SITE="${ERPNEXT_SITE:-frontend}"
URL="${ERPNEXT_URL:-http://127.0.0.1:8100}"

say() { echo "[erpnext seed] $*"; }
die() { echo "[erpnext seed] FAILED: $*" >&2; exit 1; }
bench_exec() { "${COMPOSE[@]}" exec -T backend bench --site "$SITE" "$@"; }

# The site must exist and answer before anything else. /api/method/ping is
# whitelisted for guests and answers {"message":"pong"} once the site is up.
code=""
for i in $(seq 1 90); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$URL/api/method/ping" || true)"
  [ "$code" = "200" ] && break
  [ $((i % 15)) -eq 0 ] && say "waiting for $URL/api/method/ping (HTTP ${code:-unreachable})"
  sleep 2
done
[ "$code" = "200" ] || die "$URL/api/method/ping never answered 200 (last: HTTP ${code:-unreachable}); is create-site done? docker compose -f $HERE/docker-compose.yml logs create-site"
say "site answers ping"

is_complete() {
  # bench execute prints a truthy return value as JSON (true) and nothing for False.
  bench_exec execute frappe.is_setup_complete 2>/dev/null | tr -d ' \r' | grep -qx 'true'
}

if is_complete; then
  say "setup wizard already complete"
else
  say "completing the setup wizard (fixtures + chart of accounts; a minute or more)"
  # Values are a Python literal (bench execute eval()s --kwargs); no true/false/null.
  KWARGS='{"args": {"language": "English", "country": "United States", "timezone": "UTC", "currency": "USD", "company_name": "Bench Company", "company_abbr": "BC", "chart_of_accounts": "Standard", "fy_start_date": "2026-01-01", "fy_end_date": "2026-12-31", "setup_demo": 0, "enable_telemetry": 0}}'
  if ! bench_exec execute frappe.desk.page.setup_wizard.setup_wizard.setup_complete --kwargs "$KWARGS"; then
    say "setup_complete raised; the newest Error Log entries:"
    bench_exec execute frappe.get_all --kwargs '{"doctype": "Error Log", "fields": ["creation", "method", "error"], "order_by": "creation desc", "limit_page_length": 2}' || true
    die "setup_complete failed"
  fi
  is_complete || die "setup_complete returned but frappe.is_setup_complete() is still false"
  say "setup wizard complete"
fi

# The company and its fiscal year are what a Sales Order needs; check them
# here rather than letting the first recording find out. (bench execute
# retries a raising method once, which can mark a half-done setup complete.)
# (frappe.db is not an importable module, so bench execute falls back to
# eval()ing the call, which works; the value is printed as JSON.)
bench_exec execute frappe.db.get_value --args '["Company", "Bench Company", "name"]' 2>/dev/null | grep -q '"Bench Company"' \
  || die "company \"Bench Company\" is missing after setup"
bench_exec execute frappe.db.get_single_value --args '["Global Defaults", "default_company"]' 2>/dev/null | grep -q '"Bench Company"' \
  || die "Global Defaults has no default company \"Bench Company\""
say "company Bench Company present and default"

bench_exec set-config host_name "$URL" >/dev/null
say "host_name set to $URL"
