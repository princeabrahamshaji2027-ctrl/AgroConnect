#!/usr/bin/env bash
# Export the live Supabase schema (structure only, no table data) into git.
#
# Alternative used on 2026-10-24 without a DB password: run scripts/sql/export_schema_ddl.sql (read-only) through the
# Supabase connector / SQL editor and save the `ddl` column joined with blank lines — that is how
# supabase/schema/live_schema_20261024.sql was produced (md5-verified against the server).
#
#   SUPABASE_DB_URL='postgresql://postgres.<ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres' \
#     scripts/export-live-schema.sh
#
# Get the connection string from Supabase Dashboard -> Project Settings -> Database -> Connection string (Session
# pooler). Keep it in your shell or .env, never in git. Uses the Supabase CLI through npx (needs Docker for
# `supabase db dump`; without Docker use the pg_dump fallback below, which needs PostgreSQL client tools).
set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL (see the header of this script)}"
out_dir="$(cd "$(dirname "$0")/.." && pwd)/supabase/schema"
mkdir -p "$out_dir"
stamp="$(date +%Y%m%d)"

if command -v docker >/dev/null 2>&1; then
  # public + storage schemas (tables, RLS, functions, grants). Triggers on auth.users live in the auth schema
  # and are NOT captured: record them from section 3 of 00_readonly_verification.sql. No table data is dumped.
  npx --yes supabase@2 db dump --db-url "$SUPABASE_DB_URL" --schema public,storage -f "$out_dir/live_schema_$stamp.sql"
  npx --yes supabase@2 db dump --db-url "$SUPABASE_DB_URL" --role-only -f "$out_dir/live_roles_$stamp.sql"
elif command -v pg_dump >/dev/null 2>&1; then
  pg_dump "$SUPABASE_DB_URL" --schema-only --no-owner \
    --schema=public --schema=storage -f "$out_dir/live_schema_$stamp.sql"
else
  echo "Need either Docker (for the Supabase CLI) or pg_dump. Install one, e.g. 'brew install libpq'." >&2
  exit 1
fi

# Safety: refuse to leave anything that looks like data or a credential in the export.
if grep -nE '^COPY |INSERT INTO|postgresql://|service_role.*ey[J]' "$out_dir/live_schema_$stamp.sql"; then
  echo "The export contains data or credentials — review before committing." >&2
  exit 2
fi
echo "Wrote $out_dir/live_schema_$stamp.sql — review, then commit. Do not edit historical migrations;"
echo "differences from supabase/migrations become a new dated reconciliation migration."
