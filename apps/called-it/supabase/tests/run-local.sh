#!/usr/bin/env bash
# Applies every migration to a fresh local Postgres database and runs the picks and grading checks.
# Usage: supabase/tests/run-local.sh [database name]   (needs createdb/psql on PATH; drops that database first)
set -euo pipefail
cd "$(dirname "$0")/.."
db="${1:-called_it_test}"
fresh() {
  dropdb --if-exists "$db"
  createdb "$db"
  cat tests/local-auth-stub.sql migrations/*.sql | psql -q -v ON_ERROR_STOP=1 -d "$db"
}
fresh
psql -q -d "$db" -f tests/picks.test.sql
fresh
psql -q -d "$db" -f tests/grading.test.sql
