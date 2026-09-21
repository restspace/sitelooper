#!/usr/bin/env bash
#
# One-time instance setup for the OpenProject target: give the admin a FIXED
# API token, so bench/app-reset.mjs and bench/verify-openproject.mjs can call
# /api/v3 (Basic apikey:<token>) without scraping a generated one out of the
# UI. Kanboard does the same thing through its mounted config.php; OpenProject
# has no config hook for it, and it stores tokens hashed, so the token is made
# by presetting its stored value to the hash of the known plaintext — the model
# only generates one when the value is blank.
#
# Everything ELSE the task needs (Bench Project, its seed work packages, the
# Bench Assignee user and membership) is created by the reset, which is the
# idempotent seed, exactly as for kanboard:
#
#   node bench/reset-app.mjs --target openproject
#
# Safe to re-run: an existing bench token is left alone.

set -euo pipefail

CONTAINER="${OPENPROJECT_CONTAINER:-openproject-openproject-1}"
TOKEN="${OPENPROJECT_API_TOKEN:-bench-api-token}"

docker exec -e BENCH_TOKEN="$TOKEN" "$CONTAINER" bash -lc 'cd /app && bundle exec rails runner "
  admin = User.find_by!(login: \"admin\")
  hashed = Token::API.hash_function(ENV.fetch(\"BENCH_TOKEN\"))
  if Token::API.exists?(user: admin, value: hashed)
    puts \"bench API token already present\"
  else
    Token::API.create!(user: admin, value: hashed, token_name: \"bench\")
    puts \"bench API token created\"
  end
"'
