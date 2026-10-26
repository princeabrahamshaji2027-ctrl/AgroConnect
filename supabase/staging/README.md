# Staging environment — `agroconnect-staging` (`ahkgvuewgbjyahbiehrx`, ap-northeast-1)

Built 2026-10-25 through the Supabase connector. Every write was preceded by a `get_project` check that returned
`ahkgvuewgbjyahbiehrx`. Production (`mgreapakfchcxcrauheq`) was only **read**, for the parity fingerprint.

## What was applied (in order — `supabase_migrations.schema_migrations` on staging)
| # | Migration | Source |
|---|---|---|
| 1 | `staging_00a_live_schema_types_tables` | `supabase/schema/live_schema_20261024.sql` §10–50 |
| 2 | `staging_00b_live_schema_functions_triggers_rls` | same file §60–80 |
| 3 | `staging_00c1/00c2_live_schema_policies_*` | same file §90 (split in two after a connector HTTP/2 drop; the failed attempt was confirmed not applied) |
| 4 | `staging_00c3_live_schema_storage` | same file §100–110 |
| 5 | `staging_00d_production_grant_parity` | staging-only: this new project grants API roles no SELECT/INSERT/UPDATE on new tables (newer Supabase default); production does. Also revokes API access to the Supabase-managed `rls_auto_enable()` |
| 6–10 | `remediation_01`, `02`, `03` (incl. 03b), `07`, `08` | `supabase/proposed/` — identical to production |
| 11 | `remediation_04_reconcile_drift` | held for production |
| 12–13 | `remediation_05a_lifecycle_functions`, `05b_refunds_guards_grants` | `05_…sql` without the pg_cron block |
| 14 | `remediation_05c_scheduler_pg_cron` | 05's scheduler block — **owner-approved 2026-10-25**: `pg_cron` 1.6.4 installed, job `consultation-lifecycle` (`* * * * *`, as `postgres`) |
| 15 | `remediation_09_expert_lifecycle_and_user_deletion` | `supabase/proposed/09_…sql` (2026-10-25 change request); plus Edge Function `admin-delete-user` v1 (verify_jwt on) |
| 16 | `remediation_10_post_media_storage` | `supabase/proposed/10_…sql` |
| 17 | `remediation_11_consultation_meetings` | `supabase/proposed/11_…sql` (function bodies verified identical to the file) |
| 18 | `remediation_12_expert_controlled_completion` | `supabase/proposed/12_…sql` — only the expert ends a consultation; the scheduler auto-completes at slot end |
| 19 | `remediation_13_push_notifications` | `supabase/proposed/13_…sql` — `push_devices`, `push_outbox`, enqueue trigger, claim/finish RPCs, Vault secret `push_dispatch_secret` |
| 22 | `remediation_15_expert_fee_and_commission` | `supabase/proposed/15_…sql` — `experts.consultation_fee_paise` (backfilled ₹500 for both staging experts), checkout quotes the expert fee + stale-quote refusal, 2 % commission snapshot on `demo_payments` (`commission_bps/commission_paise/expert_share_paise`, `transaction_type = 'simulated'`, immutable once succeeded), refunds from the agreed fee, admin reporting functions (`admin_consultations`, `_summary`, `_detail`), `admin_set_consultation_fee` (audited). 18 function bodies verified identical to the file. |
| 21 | `remediation_14_meet_links_and_demo_payment` | `supabase/proposed/14_…sql` — Google Meet links, DEMO payment checkout, booking only via the checkout (13 function bodies verified identical to the file, comments ignored) |
| 20 | `remediation_12b_13b_reminder_wording_push_privacy_expiry` | fixes found on staging, already folded into the `12`/`13` files: date-correct 24 h reminder text, cancellation reasons never in a push, queued pushes expire after 2 h |
| 23 | `remediation_16_message_notification_type` | `supabase/proposed/16_…sql` — notification type `message` (alone: an enum value cannot be used in the transaction that adds it) |
| 24 | `remediation_17_messaging` | `supabase/proposed/17_…sql` — text messaging through RPCs only (`get_or_create_conversation`, `send_message`, `list_conversations`, `chat_badges`, `get_messages`, `mark_conversation_read`, `respond_to_message_request`, `admin_messaging_stats` = counts only); message requests for users not connected to each other; participants-only reads; no client writes to `messages`/`conversations`; one push per message notification without message text. Function bodies verified identical to the file. |
| 25 | `remediation_18_cancellation_and_refunds` | `supabase/proposed/18_…sql` — cancellation columns, `demo_payment_adjustments` ledger, `consultation_cancellation_quote`, new `cancel_consultation_booking` rules (farmer ≥ 14 h full refund; < 14 h expert keeps half, 2 % kept; expert/admin/no-show full refund), `admin_cancel_booking` (reason + audit), `admin_update_booking_status` no longer cancels, reporting with refunds/net figures, Catch Up indexes. Function bodies verified identical to the file. |
| 26 | `remediation_19_messaging_keep_normal_chats` | `supabase/proposed/19_…sql` — trigger: the first message in a normal chat records it as accepted, so a later disconnect does not move it back to requests (body verified identical to the file) |

| 27 | `remediation_20_districts_and_district_feed` | `supabase/proposed/20_…sql` — districts on profiles/posts, district-priority `get_feed`, `admin_district_stats`, sign-up stores district (4 function bodies verified identical to the file). Staging fixtures have districts: user1, user4, expert1 Kottayam; user2 Pathanamthitta; user3 Kannur. |
Edge Functions on staging: `admin-delete-user` (verify_jwt on), `video-room-token` v2 = **retired stub** (answers 410; the Daily code is gone — delete the function in the dashboard), `push-dispatch` (verify_jwt off, checks the Vault secret; secret `FIREBASE_SERVICE_ACCOUNT` **not set** → `push_not_configured`, rows stay queued). Not installed: `pg_net` and a push-dispatch cron job (need owner approval).

Not applied: `supabase/migrations/20260814_profiles_rls_fix.sql` (known destructive), `06` (needs the test accounts).
Pre-setup state: `supabase/backups/20261025_staging_pre_setup_state.sql`.

## Verification of the build
* After step 4 the schema was **byte-identical** to the production snapshot: 356 objects, md5 `0c0bd1d0…e491`, all 11 sections.
* After step 10 staging was compared with **current production** with `scripts/sql/parity_fingerprint.sql`
  (489 items: schema + function ACLs + table grants + realtime publication). Every section matched except function ACLs,
  where the 3 functions created by 01 carry the default ACL on staging and explicit per-role grants on production —
  same effective privileges (EXECUTE via PUBLIC).
* Advisor: only by-design findings (`is_admin`/`is_banned` anon-callable because RLS needs them; admin/booking RPCs
  callable by signed-in users and gated internally).

## Configuration
* `.env.staging` (repo root) and `admin-dashboard/.env.staging` — git-ignored, mode 600. Contain the staging URL and
  **public** anon key, plus locally generated test-account passwords (never printed). Build with
  `npx vite build --mode staging --outDir dist-staging` (also git-ignored). Verified: staging bundles reference only
  `ahkgvuewgbjyahbiehrx`, never production. The default `npm run build` is unchanged (production).
* Android: opt-in staging build, `scripts/staging/build-staging-apk.sh` (→ `android/app/build/staging-apk/app-staging-debug.apk`).
  `-PagroStaging` gives app id `com.agroconnect.app.staging`, label "AgroConnect Staging", version `1.0-staging`, and
  packages the staging web bundle from `android/app/build/staging-assets`. Without the property the Gradle build is the
  production configuration (verified: `com.agroconnect.app`, label AgroConnect, production ref only). The script
  refuses to finish if the APK contains the production ref. Installs side by side with the production app.
  Device check: `ANDROID_SERIAL=<serial> python3 -I scripts/staging/device-smoke.py` (safe on a personal phone: never
  opens the production app, restores rotation settings, does not clear logcat).

## Rebuild from scratch
Apply the files in the table above in order (or re-run them: every remediation script is idempotent).

## Test accounts
Six synthetic accounts `agroconnect-stg-<role>-<FIXTURE_EMAIL_TOKEN>@<FIXTURE_EMAIL_DOMAIN>` (admin, expert1, user1–4)
were created through the public signup API on 2026-10-25 with "Confirm email" off (`scripts/staging/create-test-accounts.mjs`),
admin promoted via `profiles`, then `06` applied. Passwords live only in `.env.staging`.
