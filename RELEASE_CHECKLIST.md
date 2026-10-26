# AgroConnect — release checklist (staging release candidate, 2026-10-25)

Branch: `feature/meet-demo-payment` (on top of `feature/recovery-video-push`, on top of
`feature/media-fix-catchup-meetings`, which is on GitHub; the two newer branches are **not pushed**). Nothing here has been applied to production. Every production step needs the owner's
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
| Consultations in Google Meet | expert pastes a Google Meet link (validated + stored on the server, farmer notified once); Join opens it outside the app inside the join window; expert marks completed. Daily removed. | verified on staging (DB, API, browser); **phone: opening the Meet app not yet tested** |
| DEMO payment | "Pay & Book" opens a simulated checkout — DEMO PAYMENT — NO REAL MONEY CHARGED; the server reads the fee from the slot and books in the same transaction | verified on staging (DB, API, browser incl. races, cancel, network failure) |
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
| 14 | Google Meet links (`set_meeting_link`, link returned by `join_consultation`), DEMO payments (`demo_payments`, start/confirm/cancel), booking only through the checkout, completion needs a link, no-show = no link, close 24 h after slot as `slot_ended`, review update guard, slot fee check | 05, 11, 12, 13 | applied (2026-10-25, bodies verified identical) | yes | new table + 2 columns; **`book_consultation_slot` no longer callable by clients**; future bookings without a link are cancelled 5 min after start | **yes** (app must use the checkout + Meet link UI) | redefine 12/13 bodies; `grant execute on book_consultation_slot to authenticated`; drop trigger `guard_reviews_update`; `demo_payments` can stay |
| 13-cron (not written yet) | pg_cron job calling `push-dispatch` every minute with the Vault secret | 13, **pg_net** | **not applied** — needs owner approval to install `pg_net` | — | — | — | `cron.unschedule` |

Not for production: `06` (staging fixtures), `supabase/migrations/20260814_profiles_rls_fix.sql` (known destructive).

Edge Functions (none exist in production yet): `admin-delete-user` (verify_jwt on), `push-dispatch` (verify_jwt **off**,
shared Vault secret; secret `FIREBASE_SERVICE_ACCOUNT`). `video-room-token` is **retired** (staging runs a stub that
answers 410; delete it in the staging dashboard; never deploy it to production). No Daily or payment-provider secrets
exist or are needed.

## 3. Can be done now on STAGING (owner actions, no production impact)

1. **Retired function**: Supabase **staging** → Edge Functions → `video-room-token` → Delete (it only answers 410 now).
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
3. **Migrations**: 04 → 05 (with pg_cron) → 09 → 10 → 11 → 12 → 13 → 14, each verified as on 2026-10-24
   (always-raise checks, parity fingerprint against staging).
4. **Edge Functions**: deploy `admin-delete-user`, `push-dispatch` (not `video-room-token`); production secret
   `FIREBASE_SERVICE_ACCOUNT` (production Firebase project, Android app `com.agroconnect.app`); approve `pg_net` + the
   push cron job in production.
5. **Auth**: Google provider (production OAuth client, redirect `https://mgreapakfchcxcrauheq.supabase.co/auth/v1/callback`);
   Redirect URLs `com.agroconnect.app://auth-callback` + the production web origin; SMTP for reset e-mails.
6. **Web/admin**: merge to `main` (Render deploys `main`); Render rewrite rule `/* → /index.html` for the admin SPA.
   No environment variables are required for production builds (defaults point at production); never set
   `VITE_SUPABASE_URL` to staging on Render.
7. **Android**: production build (`./gradlew assembleRelease` without `-PagroStaging`) → `com.agroconnect.app`, with the
   production `google-services.json`; signing key; Play Console.
8. **Smoke tests after deploy**: login (email + Google), feed media, Pay & Book (demo checkout) → both notifications,
   expert saves Meet link → farmer notified, 5-minute reminder, Join opens Google Meet, expert marks completed, review, admin meetings, password reset e-mail, push on a closed phone,
   anonymous storage listing denied.
9. **Monitoring / rollback**: `cron.job_run_details` (0 failures), `push_outbox` statuses (`failed`, `expired`),
   Edge Function logs (no secrets logged), Supabase advisors. Rollback: `99_rollback.sql` + previous function bodies;
   redeploy previous Render commit; keep the old APK.

## 5. Known risks and limits

* Push delivery and the reset e-mail link are **not verified end to end** (Firebase / a real inbox missing); opening
  Google Meet from the Android app is verified only up to the code path (phone not connected yet).
* AgroConnect has **no attendance data** for Google Meet. "Expert/farmer opened Meet from the app" is recorded, not
  proof that a call happened. The expert confirms completion; otherwise the booking is closed 24 h after its slot as
  `slot_ended` ("not confirmed by the expert") — the farmer may still rate it.
* Business-rule changes in 14 (documented): no-show = **no Meet link** 5 minutes after the start (was: expert did not
  press Join); completion requires a saved link (was: expert joined the in-app room); no completion at slot end.
* Payments are a **demo**: no money moves, refunds are demo refunds; never present them as real transactions.
  Before any real payments, a payment provider, terms and accounting would be a separate project.
* In-app notifications remain the source of truth; push is best-effort (FCM acceptance ≠ shown on the phone).
* Changing a password signs out the user's other devices (verified on staging).
* Old app versions in users' hands will break against 05/11/12/14 (14 removes direct booking) — release the app
  together with the migrations.

## Addendum 2026-10-25 (final pricing pass): migration 15
| 15 | Expert-set consultation fee (`experts.consultation_fee_paise`, ₹1–₹1,00,000, only via `set_consultation_fee` / audited `admin_set_consultation_fee`), checkout quotes it and refuses a stale quote, 2 % platform commission snapshot per confirmed booking (`C = round-half-up(F × 2 %)`, `E = F − C`, immutable), refunds from the agreed fee, admin consultation reporting (server-side filters + pagination) | 05, 11–14 | applied to staging (2026-10-25, 18 bodies verified identical) | yes (backfill only fills NULLs) | adds a NOT NULL column to `experts` (backfill: most common slot rate, else ₹500 — **review each expert's fee before release**); adds columns to `demo_payments`; old direct slot-price UI removed | **yes** (app + admin must be released together) | `drop` the new functions/triggers, restore 14's bodies; the column and snapshot columns can stay |

Production order is now 04 → 05 → 09 → 10 → 11 → 12 → 13 → 14 → **15**. Before release: have each production expert confirm their
fee in the app (the backfill is only a starting value), publish the Terms text (Settings → Terms & Conditions, no acceptance is
recorded) and decide whether to track acceptance. The payment flow is simulated: **no real money is collected, no commission
is received, no expert is paid** — admin screens and `transaction_type = 'simulated'` say so; user screens deliberately do not.

## Addendum 2026-10-26 (validation, cancellation & refunds, messaging): migrations 16–19
| # | Purpose | Depends on | Status | Re-runnable | Data impact | App/admin release needed | Rollback |
|---|---|---|---|---|---|---|---|
| 16 | Notification type `message` | — | applied to staging 2026-10-26 | yes | none | no | not needed (unused enum value is harmless) |
| 17 | Messaging with message requests; RPC-only writes; participants-only reads (admins see counts only) | 01–03, 05, 13, 16 | applied to staging, bodies verified identical | yes | adds columns/indexes; **drops the old insert/update policies on `messages`/`conversations`** and the admin read policy; new CHECKs are `NOT VALID` (old rows untouched) | **yes** — the old Chat screen wrote the tables directly and stops working | restore the previous policies and drop the new functions |
| 18 | Cancellation & refund rules, refund ledger, `admin_cancel_booking`, reporting, indexes | 05, 11–15 | applied to staging, bodies verified identical | yes | adds columns/table/indexes; existing cancelled bookings keep their old figures (no backfill) | **yes** — app (quote + new cancel flow) and admin (cancel with reason) | restore 15's function bodies; columns/table can stay |
| 19 | Normal chats stay normal after a disconnect | 17 | applied to staging, body verified identical | yes | none | no | drop the trigger |

Production order is now 04 → 05 → 09 → 10 → 11 → 12 → 13 → 14 → 15 → **16 → 17 → 18 → 19**, each in its own transaction (16 must
commit before 17). Release the app and the admin website **together with 17 and 18**.

Still blocking a production release (unchanged, owner action): leaked-password protection is off on production and staging;
production migrations 04–19 are not applied; Firebase service account for push not set; SMTP for password-reset e-mails;
installed-app checks on a phone for this pass (not done yet — no device connected).

Business rules shipped in this pass (also in Terms & Conditions): farmers and experts can cancel at any time before completion
with a reason; farmer ≥ 14 h before the start (exactly 14 h counts) → full refund; farmer < 14 h → the expert keeps ceil(F/2),
AgroConnect keeps its 2 % commission, the farmer gets the rest (₹1,000 → ₹500 / ₹20 / ₹480); expert, admin or automatic no-show
cancellation → full refund. Refunds remain simulated bookkeeping (`refund_status = 'Pending'`), no money moves.
