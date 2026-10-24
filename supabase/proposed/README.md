# Proposed database changes — NOT APPLIED TO PRODUCTION

Kept outside `supabase/migrations/` so `supabase db push` cannot apply them by accident (Rules.md §4.1).
All of them are tested on a disposable PostgreSQL copy: `npm run test:db` (tests/db, PGlite).
Gate, risks and rollback: `REMEDIATION_STATUS.md`.

| File | Purpose | Writes? |
|---|---|---|
| `00_readonly_verification.sql` | Live policies, triggers, function bodies, data checks. Proven read-only (runs in a READ ONLY transaction). | No |
| `01_protect_profile_privileged_columns.sql` | AUD-003: clients cannot change their own role, ban fields or counters. | Trigger |
| `02_profiles_require_sign_in.sql` | AUD-008: RESTRICTIVE policies block anonymous reads of profiles, farmer_profiles, followers. | Policies |
| `03_fix_security_definer_functions.sql` | AUD-012: working `is_banned()`, pinned `search_path`. | Functions |
| `05_consultation_lifecycle_server_side.sql` | AUD-013/014/032/033: booking, cancel, join, complete, scheduled reminders/no-shows, refund settlement, notification/slot/expert/review guards. Supersedes the old 04. | Functions, triggers, policies, grants, cron |
| `06_repair_test_fixtures.sql` | AUD-015: makes `expert1@agroconnect.local` a valid approved expert; resets the other fixtures. | Fixture data |
| `99_rollback.sql` | Undo 01, 02, 05. | Drops |

Order: 00 (review) → 01 → 02 → 03 → 05 → 06 (staging). Once approved and applied, move them into
`supabase/migrations/` with date prefixes.
