# AgroConnect — release checklist (staging release candidate, 2026-10-25)

Branch: `feature/recovery-video-push` (on top of `feature/media-fix-catchup-meetings`, which is on GitHub; this
branch is **not pushed**). Nothing here has been applied to production. Every production step needs the owner's
explicit approval.

## 1. What is in this release

| Area | Change | Staging status |
|---|---|---|
| Admin (change request 2026-10-25) | full user delete (Edge Function), remove expert, meeting filters/details/reviews, expert leave requests, menu | verified |
| App (change request) | icons-only bar, profile menu, own-profile routing, Catch Up dates/calendar, profile links, Google sign-in | verified (phone, 2026-10-25) |
| Post media | Android video picking, media inside the card, storage listing closed | verified (web, emulator, phone) |
| Feed | own posts never show "Connect" (also after relaunch) | verified (phone) |
| Catch Up | booking notifications, 5-minute reminder, server join window, honest room | verified (real-time staging + phone) |
| Account recovery | forgot password, set new password, change password checks the current one | verified on staging Auth except the e-mailed link itself (needs a real inbox) |
| Video consultations | Daily integration behind `video-room-token`; expert-only completion; auto-complete | server checks verified; **real video blocked: no Daily account/API key** |
| Push notifications | devices, outbox, FCM dispatcher, app registration/taps | queue + security verified; **delivery blocked: no Firebase project, no scheduler HTTP call** |

## 2. Database migrations (`supabase/proposed/`) — production order

Production today has 01, 02, 03 (+03b), 07, 08 (applied 2026-10-24). Staging has everything below.

| # | Purpose | Depends on | Staging | Re-runnable | Production data effect | Needs app release | Rollback / recovery |
|---|---|---|---|---|---|---|---|
| 04 | Reconcile drift: booking columns (refunds, reminder flags, `updated_at`), `experts.no_show_count`, `posts.title`, one-pending-application index, working `admin_update_booking_status` | 01–03 | applied | yes | adds columns with defaults to 3 existing bookings; index fails only if a user has 2 pending applications (checked: none) | no (additive) | `99_rollback.sql` keeps data; columns can stay |
| 05 | Consultation lifecycle on the server (book/cancel/join/complete RPCs, reminders, no-show, refund states, notification/slot guards) + **pg_cron job** `consultation-lifecycle` every minute | 04 | applied (05a/b/c) | yes | old app versions' direct booking writes stop working | **yes** (app must use the RPCs) | `99_rollback.sql` restores old client paths |
| 09 | Expert lifecycle (safe demote, resignations, one request), user-deletion FK fixes | 05 | applied | yes | demotion no longer deletes history | yes (admin + app) | redefine previous functions from `live_schema_20261024.sql` |
| 10 | Storage: public media buckets no longer listable by anyone; owners can delete/replace own videos | 03 | applied | yes | none (public links keep working) | no | recreate the old "Public buckets are readable by everyone" policy |
| 11 | Catch Up: booking notifications, 5-minute reminder, join window, completion after start, no invented links | 05 | applied | yes | adds `notified_5min`, `farmer_joined_at` | yes | previous function bodies in 05 |
| 12 | Expert-only completion + scheduler auto-complete at slot end; reminder wording | 11 | applied (12 + 12b) | yes | none | **yes** (app shows "End consultation" to experts) | 11's `complete_consultation` / lifecycle |
| 13 | Push: `push_devices`, `push_outbox`, enqueue trigger, claim/finish RPCs, Vault dispatch secret | 05, 11, 12; **Vault** | applied (13 + 13b) | yes (secret kept) | new tables only | yes (app registers devices) | drop trigger `enqueue_push_for_notification`; tables can stay |
| 13-cron (not written yet) | pg_cron job calling `push-dispatch` every minute with the Vault secret | 13, **pg_net** | **not applied** — needs owner approval to install `pg_net` | — | — | — | `cron.unschedule` |

Not for production: `06` (staging fixtures), `supabase/migrations/20260814_profiles_rls_fix.sql` (known destructive).

Edge Functions (none exist in production yet): `admin-delete-user` (verify_jwt on), `video-room-token` (verify_jwt
on, secret `DAILY_API_KEY`), `push-dispatch` (verify_jwt **off**, shared Vault secret; secret `FIREBASE_SERVICE_ACCOUNT`).

## 3. Can be done now on STAGING (owner actions, no production impact)

1. **Daily (video)**: create a Daily account (free tier 10,000 participant-minutes/month, no card needed to start —
   https://www.daily.co/pricing/video-sdk/). Dashboard → Developers → API key → Supabase **staging** → Edge Functions →
   Secrets → `DAILY_API_KEY`. Nothing else: rooms and tokens are created by the function.
2. **Firebase (push)**: create a Firebase project; add an **Android app with package `com.agroconnect.app.staging`**;
   download `google-services.json` to `android/app/` (git-ignored); Project settings → Service accounts → generate a
   private key → put the whole JSON into Supabase **staging** Edge Function secret `FIREBASE_SERVICE_ACCOUNT` (never in
   the repo or chat).
3. **Approve on staging**: installing `pg_net` and one pg_cron job (every minute) that calls `push-dispatch` with the
   Vault secret. Without it queued pushes are not sent.
4. **Password reset on staging**: Authentication → URL Configuration → Redirect URLs must contain
   `com.agroconnect.app.staging://auth-callback` (already there for Google) and the staging web origin if a staging
   website is ever deployed. Optional: custom SMTP (the built-in mailer allows only a few e-mails per hour).
5. **Leaked-password protection** on staging (Authentication → Passwords) — advisor warning on both projects.
6. Phone tests listed in `TEST_RESULTS.md` (password-reset link from a real inbox, a real two-device video call,
   push on a closed phone, notification tap).

## 4. Production — needs explicit owner approval, in this order

1. **Credentials first**: change the passwords of `prince@`, `user1@`, `user2@agroconnect.com` and the five
   `@agroconnect.local` fixtures (or delete the fixtures); "Sign out user" for each (live sessions: 10, 8, 1, 146);
   enable leaked-password protection.
2. **Backup**: dashboard backup / PITR point, plus `scripts/sql/export_schema_ddl.sql` snapshot.
3. **Migrations**: 04 → 05 (with pg_cron) → 09 → 10 → 11 → 12 → 13, each verified as on 2026-10-24
   (always-raise checks, parity fingerprint against staging).
4. **Edge Functions**: deploy `admin-delete-user`, `video-room-token`, `push-dispatch`; production secrets
   `DAILY_API_KEY` (production Daily domain), `FIREBASE_SERVICE_ACCOUNT` (production Firebase project, Android app
   `com.agroconnect.app`); approve `pg_net` + the push cron job in production.
5. **Auth**: Google provider (production OAuth client, redirect `https://mgreapakfchcxcrauheq.supabase.co/auth/v1/callback`);
   Redirect URLs `com.agroconnect.app://auth-callback` + the production web origin; SMTP for reset e-mails.
6. **Web/admin**: merge to `main` (Render deploys `main`); Render rewrite rule `/* → /index.html` for the admin SPA.
   No environment variables are required for production builds (defaults point at production); never set
   `VITE_SUPABASE_URL` to staging on Render.
7. **Android**: production build (`./gradlew assembleRelease` without `-PagroStaging`) → `com.agroconnect.app`, with the
   production `google-services.json`; signing key; Play Console.
8. **Smoke tests after deploy**: login (email + Google), feed media, booking → both notifications, 5-minute reminder,
   join window, video call, expert ends, review, admin meetings, password reset e-mail, push on a closed phone,
   anonymous storage listing denied.
9. **Monitoring / rollback**: `cron.job_run_details` (0 failures), `push_outbox` statuses (`failed`, `expired`),
   Edge Function logs (no secrets logged), Supabase advisors. Rollback: `99_rollback.sql` + previous function bodies;
   redeploy previous Render commit; keep the old APK.

## 5. Known risks and limits

* Real video, push delivery and the reset e-mail link are **not verified end to end** (accounts/credentials missing).
* Attendance = the server issued a room token (Daily webhooks need a paid card on the Daily account).
* In-app notifications remain the source of truth; push is best-effort (FCM acceptance ≠ shown on the phone).
* Changing a password signs out the user's other devices (verified on staging).
* Old app versions in users' hands will break against 05/11/12 — release the app together with the migrations.
