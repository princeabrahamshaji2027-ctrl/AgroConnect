# Database remediation scripts

**Applied to production 2026-10-24 (owner-approved): 01, 02, 03 (+03b block), 07, 08.** Held: 04, 05, 09, 10, 11, 12, 13. Staging only: 06; on staging also 09–13 (2026-10-25).
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
| `09_expert_lifecycle_and_user_deletion.sql` | Change request 2026-10-25: safe expert removal (history kept, farmers refunded/notified), one expert request per user, resignations with admin approve/reject, no self-demotion, FK fixes for user deletion. Used with the Edge Function `supabase/functions/admin-delete-user`. | Functions, triggers, indexes, FKs |
| `10_post_media_storage.sql` | Public media buckets no longer listable by anyone (owner/admin only); owners can delete/replace their post videos. | Storage policies |
| `11_consultation_meetings.sql` | Catch Up: booking notifications, 5-minute reminder (existing job), server join window + participants, completion after start, no invented meeting links. | Columns, functions, grants |
| `12_expert_controlled_completion.sql` | Only the booking's expert ends a consultation (after the start, after joining); the scheduler auto-completes at slot end when the expert attended; one review request; date-correct reminder text. | Functions |
| `13_push_notifications.sql` | Push: device registry (own rows only, through RPCs), outbox filled by a trigger on server-made booking notifications, claim/finish RPCs for the `push-dispatch` function (service role), retries/backoff, 2 h expiry, Vault dispatch secret. Requires Vault. | Tables, trigger, functions, Vault secret |
| `99_rollback.sql` | Undo 01 (guards), 02, 05, 07, 08. | Drops |

Order: 00 (review) → 01 → 02 → 03 → 04 → 07 → 08 → 05 → 09 → 10 → 11 → 12 → 13 + deploy `admin-delete-user`, `video-room-token`, `push-dispatch` (all with the new client release) → 06 (staging). Never push the
repo's `supabase/migrations/20260814_profiles_rls_fix.sql` (see 04). Once approved and applied, move them into
`supabase/migrations/` with date prefixes.
