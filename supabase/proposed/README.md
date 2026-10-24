# Database remediation scripts

**Applied to production 2026-10-24 (owner-approved): 01, 02, 03 (+03b block), 07, 08.** Held: 04, 05. Staging only: 06.
Exact pre-apply restore: `supabase/backups/20261024_pre_remediation_restore.sql`.

## Original notes

Kept outside `supabase/migrations/` so `supabase db push` cannot apply them by accident (Rules.md §4.1).
All of them are tested on a disposable PostgreSQL loaded with the REAL production schema export
(`supabase/schema/live_schema_20261024.sql`): `npm run test:db` (tests/db, PGlite).
Gate, risks and rollback: `REMEDIATION_STATUS.md`.

| File | Purpose | Writes? |
|---|---|---|
| `00_readonly_verification.sql` | Live policies, triggers, function bodies, data checks. Proven read-only (runs in a READ ONLY transaction). | No |
| `01_protect_profile_privileged_columns.sql` | AUD-003/003b/040/041: no role via signup, no self-promotion, no self-made experts, counters fixed. | Functions, triggers |
| `02_profiles_require_sign_in.sql` | AUD-008: RESTRICTIVE policies block anonymous reads of profiles, farmer_profiles, followers. | Policies |
| `03_fix_security_definer_functions.sql` | AUD-012/048: definer `is_admin()`/`is_banned()`, pinned `search_path` everywhere, no anon execute on admin RPCs. | Functions, grants |
| `04_reconcile_drift.sql` | AUD-042: columns/index from repo migrations never applied live; working `admin_update_booking_status`. | Columns, index, function |
| `05_consultation_lifecycle_server_side.sql` | AUD-013/014/032/033: booking, cancel, join, complete, scheduled reminders/no-shows, refund settlement, notification/slot/expert/review guards. Supersedes the old 04. | Functions, triggers, policies, grants, cron |
| `06_repair_test_fixtures.sql` | AUD-015: makes `expert1@agroconnect.local` a valid approved expert; resets the other fixtures. | Fixture data |
| `07_storage_privacy.sql` | AUD-043: expert CVs readable only by owner/admin; uploads only under own folder. | Storage policies |
| `08_enable_realtime.sql` | AUD-044: publish the tables the apps subscribe to. | Publication |
| `99_rollback.sql` | Undo 01 (guards), 02, 05, 07, 08. | Drops |

Order: 00 (review) → 01 → 02 → 03 → 04 → 07 → 08 → 05 (with the new client release) → 06 (staging). Never push the
repo's `supabase/migrations/20260814_profiles_rls_fix.sql` (see 04). Once approved and applied, move them into
`supabase/migrations/` with date prefixes.
