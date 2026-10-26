# Database remediation scripts

**Applied to production 2026-10-24 (owner-approved): 01, 02, 03 (+03b block), 07, 08.**
**Applied to production 2026-10-26 (launch, owner-approved): 04, 05 (as 05ab + 05c scheduler), 09–20** as migrations `remediation_NN_*`; all 96 public functions verified identical (md5 of the comment/whitespace-stripped definition) to the PGlite rehearsal. Before applying: schema `backup_20261026` (copies of the public tables, functions, policies; no API access). Edge Functions `admin-delete-user` (verify_jwt) and `push-dispatch` (no JWT, shared Vault secret) deployed. Never on production: 06.
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
| `14_meet_links_and_demo_payment.sql` | Final Catch Up flow: Google Meet link per booking (`set_meeting_link`, expert only, validated + normalised, farmer notified once), `join_consultation` returns it; DEMO payment checkout (`demo_payments`, `start_/confirm_/cancel_demo_payment`, fee from the slot, idempotent, no slot hold, 15-min expiry); `book_consultation_slot` no longer client-callable; completion needs a link; no-show = no link; close 24 h after slot as `slot_ended`; review update guard; slot fee range. | Table, columns, functions, triggers, grants |
| `15_expert_fee_and_commission.sql` | Expert-set fee, 2 % commission snapshot, admin reporting. | Columns, functions |
| `16_message_notification_type.sql` | Notification type `message` (own file: enum values cannot be used in the same transaction). | Enum value |
| `17_messaging.sql` | Text messaging with message requests (owner decision 2026-10-26): RPCs only, participants-only reads, requests for users not connected to each other, Accept/Decline, read state, idempotent sends, 30/min limit, 2000 characters, push without message text, admin counts only. | Columns, policies, functions, trigger update |
| `18_cancellation_and_refunds.sql` | Cancellation & refunds (owner decision 2026-10-26): farmer ≥ 14 h before = full refund, < 14 h = expert keeps ceil(F/2), AgroConnect keeps its 2 %, rest refunded; expert/admin/no-show = full refund at any time; quote RPC; refund ledger; `admin_cancel_booking`; reporting; indexes. | Columns, table, functions, indexes |
| `19_messaging_keep_normal_chats.sql` | A chat that was normal stays normal after a disconnect. | Trigger |
| `20_districts_and_district_feed.sql` | Launch districts (Kottayam, Pathanamthitta, Kannur): `profiles.district`, `posts.district` (set by the server from the author), sign-up stores district/phone/location, `get_feed()` (own district first, newest first, keyset pages), `admin_district_stats()`. | Columns, trigger, functions |
| `99_rollback.sql` | Undo 01 (guards), 02, 05, 07, 08. | Drops |

Order: 00 (review) → 01 → 02 → 03 → 04 → 07 → 08 → 05 → 09 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 + deploy `admin-delete-user`, `push-dispatch` (`video-room-token` is retired) (all with the new client release) → 06 (staging). Never push the
repo's `supabase/migrations/20260814_profiles_rls_fix.sql` (see 04). Once approved and applied, move them into
`supabase/migrations/` with date prefixes.
