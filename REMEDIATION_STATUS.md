# AgroConnect — Remediation Status (2026-10-24)

Branch `claude/great-rhodes-fd3ce8`, on top of audit commit `6635e2f`. Nothing has been pushed, deployed or
applied to the production Supabase project (`mgreapakfchcxcrauheq`). No production data was written. No account
was signed into. The service-role key in the local `.env` was not used.

## Checklist

| # | Task | Status | Evidence / blocker |
|---|---|---|---|
| 1.1 | Read instructions (`agent.md`, `Rules.md`), audit docs, git state | VERIFIED | `agen.md` does not exist; the file is `agent.md`. The main checkout has uncommitted Antigravity work (left untouched). |
| 1.2 | Locate 00–03, fixtures, lifecycle code, E2E tests | VERIFIED | `supabase/proposed/00–03`; `seed/test-fixtures.js`; all booking/reminder/no-show/refund/notification writes in `src/pages/Connect.jsx`. No E2E tests existed (only Python Selenium/Appium scripts). |
| 2.1 | Identify and classify the three passwords | VERIFIED | See the credential map below. All three are Supabase Auth **application user** passwords, not database or service credentials. |
| 2.2 | Rotate the three passwords | **BLOCKED** | Needs you to sign in to the Supabase Dashboard (steps below). I won't set passwords on production accounts or invent new secrets. |
| 2.3 | Redeploy the admin website on Render | **BLOCKED** | The repo has no Render config, there is no Render CLI or credentials here, and the live URL is unknown. Settings are below. |
| 3.1 | Verify `00_readonly_verification.sql` is read-only | VERIFIED | Static keyword scan, and every statement executed inside `BEGIN TRANSACTION READ ONLY` (`tests/db`). |
| 3.1b | Run 00 against the live database | **BLOCKED** | Needs the DB connection string or SQL-editor access (yours). |
| 3.2–3.3 | Review and apply 01→02→03 on an isolated copy | VERIFIED (on a reconstructed copy) | PGlite copy = reconstructed base schema + the repo's 6 real migrations. 01, 02 and 03 each applied, verified, re-run. Not a byte-copy of production (its schema isn't in git). |
| 3.4 | Production migration | **AWAITING YOUR APPROVAL** | Gate summary below. |
| 4.1 | Diagnose `expert1` | VERIFIED | Live, read-only: role `Expert` but **no `experts` row**. The old fixture script never created one. user2/user3 drifted to Expert. |
| 4.2 | Repair `expert1` | READY, not applied | `06_repair_test_fixtures.sql` + rewritten `seed/test-fixtures.js`. Tested on the copy: expert detection, 28 open slots, no admin rights, a fixture farmer can book it, real users untouched. |
| 4.3 | Expert scenario on device | **BLOCKED (signed-in part)** | The emulator ran the new APK: launch, login, error handling, back, rotation, relaunch all PASS. Signing in as `expert1` needs staging (or your OK to use production). |
| 5 | Move booking/reminders/no-show/refunds server-side; fix notification auth | VERIFIED on the copy | `05_consultation_lifecycle_server_side.sql` + `Connect.jsx` now calls RPCs. 16 DB tests cover the required cases. |
| 6 | Export live schema into git | **BLOCKED** | Needs the DB connection string. `scripts/export-live-schema.sh` is ready (schema-only; refuses data or credentials). |
| 7 | Authenticated E2E vs staging | WRITTEN, **BLOCKED** | No staging project exists. `tests/e2e/staging-api.test.mjs` (API) and the Playwright specs skip without staging env vars and refuse the production URL. Unauthenticated E2E: 5/5 PASS. |
| 8A | Admin website opened | PARTIAL | Local production build: login page, error state, mobile layout, nested-path refresh, no secrets in bundle — PASS. Deployed URL unknown. Signed-in pages BLOCKED. |
| 8B | Normal-user interface opened | PARTIAL | Android emulator + web build: splash, login, register validation, invalid login — PASS. Signed-in pages BLOCKED. |
| 8C | Expert interface opened | **BLOCKED** | Needs a signed-in `expert1` session on staging. |
| 9 | Regression, rebuilds, secret scan, docs | VERIFIED | Below and in `TEST_RESULTS.md`. |

## Credential map (no values reproduced)

| Credential | Kind | Where it was exposed | Depends on it | How to rotate |
|---|---|---|---|---|
| Admin account `prince@agroconnect.com` | Supabase Auth user, role Admin | git history (`user.md`, `seed-demo-users.js`, admin `Login.jsx` defaults in commits `052b81b`, `54be730`, `807524e`); **any admin bundle built before `6635e2f`** | Admin website login only | Dashboard → Authentication → Users → the user → *Reset password* (or *Send password recovery*), then revoke that user's sessions (*Sign out user*). |
| `user1@agroconnect.com` | Auth user, Farmer (demo) | git history (`user.md`, `seed-demo-users.js`) | Demo logins | Same as above. |
| `user2@agroconnect.com` | Auth user, Farmer (demo) | git history | Demo logins | Same as above. |
| *Also exposed:* shared password of the five `*@agroconnect.local` fixtures | Auth users in **production** (expert1 has role Expert) | git history of `seed/test-fixtures.js` | Tests | Rotate with `FIXTURE_PASSWORD` + `npm run seed:fixtures` **on staging**. In production, delete or rotate these accounts. |
| *Also exposed:* shared password of generated demo users | Auth users if `npm run seed` ever ran on production | `seed/generators/users.js` (now reads `DEMO_SEED_PASSWORD`) | Demo data | Delete the generated demo users in production, or rotate. |

None of these are database passwords, Supabase API keys or Render secrets. Rotating them interrupts nothing
except existing logins of those accounts. The anon key in the frontends is public by design. The service-role key
appears only in the git-ignored `.env`; it was never committed. Git history still contains the old passwords:
rotation makes them useless. A history rewrite (`git filter-repo`) is optional afterwards and needs a force-push.

## Render — admin website settings to verify

Repo/branch: `princeabrahamshaji2027-ctrl/AgroConnect`, the branch you deploy (merge this work first).
Service type: Static Site. Root directory: `admin-dashboard`. Build command: `npm ci && npm run build`.
Publish directory: `dist`. Add a rewrite `/*` → `/index.html` (the app uses tab state, not URL routes, but this
avoids 404s on refresh). Env vars: none are required. Optionally set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
(anon key only, **never** the service-role key). After deploy, run
`E2E_ADMIN_URL=https://<your-admin>.onrender.com npx playwright test --project=admin`: it checks for empty login
fields, no auto sign-in and no service key in the bundle.

## Production migration gate (needs your explicit approval)

| Script | Changes | Re-runnable | Rollback | Production risk / precondition |
|---|---|---|---|---|
| 00 | none (read-only) | yes | n/a | Run first; review sections 3, 9, 10, 11, 13. |
| 01 | trigger `protect_profile_privileged_columns` on `profiles` | yes | `99_rollback.sql` | If §9 shows **non-definer** functions updating `follower_count`/`post_count`, follows/posts would start failing. Fix those first. |
| 02 | 3 RESTRICTIVE anon-deny policies | yes | `99` | None known; `keep-alive.js` still succeeds (gets 0 rows). |
| 03 | replaces `is_admin`, `is_banned`; pins `search_path` | yes | re-create old definitions (§4 output) | Low. Fixes `is_banned()` referencing a non-existent column. |
| 05 | lifecycle functions, guard triggers, restrictive read policies, unique index, NOT VALID check, revokes direct booking writes, pg_cron job | yes | `99` | **Deploy order matters**: the new app needs 05, and old installed app versions can't book/cancel once 05 is applied. Apply 05 and release the new web build/APK together. Preconditions: §8 shows no double-booked slots; §11 shows pg_cron (otherwise no reminders/no-shows run). |
| 06 | fixture data only (`*@agroconnect.local`) | yes | n/a (test data) | Intended for staging. In production it only touches the five fixture accounts. |

Backup before applying: Supabase Dashboard → Database → Backups (Pro plan: PITR). Otherwise
`pg_dump --schema-only` plus a data export of the touched tables. Apply 01→02→03→05 one at a time, re-running
`npm run test:rls` (expects 0 failures after 02) and smoke-testing login, feed, profile and Catch Up between steps.

## What I need from you
1. Rotate the three passwords (and the fixture/demo passwords) in the Supabase Dashboard; then redeploy the admin site.
2. Create a staging Supabase project and give me (via `.env.staging`, not chat): `STAGING_SUPABASE_URL`,
   `STAGING_SUPABASE_ANON_KEY`, `SUPABASE_DB_URL` for staging, `FIXTURE_PASSWORD`, and optionally an
   `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` for a staging-only admin. Then I can apply 01–06 there, run 00, seed
   fixtures, and run the authenticated API, browser and emulator tests for the admin, user and expert pages.
3. Run `scripts/export-live-schema.sh` with the production `SUPABASE_DB_URL` (or give me read access), so the real
   schema lands in git and replaces `tests/db/reconstructed_base_schema.sql`.
4. Approve (or not) the production migration plan above.

---

# Third pass (2026-10-24) — with the Supabase connector

## What the connector can and cannot do (verified, not assumed)
| Capability | Available? | Used? |
|---|---|---|
| List projects/orgs, project metadata, plan | Yes | Yes. One project: `mgreapakfchcxcrauheq` (= `src/supabase.js`, **production**). Org on the **Free** plan. No staging project exists. |
| Execute SQL / list tables, extensions, migrations; security advisors | Yes | **Read-only SELECTs only** against production. One accidental `create temp view` was blocked by the environment before it ran. |
| Apply migrations (DDL) | Yes | **Not used on production.** Waiting for your approval. |
| Create project / branch | Yes ($0/month project; $0.01344/h branch, which also needs a paid plan) | **Blocked by this environment's permission policy** ("real-world transaction"), so not created. |
| Auth admin (reset passwords, revoke sessions, list users via the Auth API) | **No** | — Rotation stays with you (Dashboard). I won't rewrite `auth.users` or `auth.sessions` with SQL on production. |
| Render / deployment | **No** | — |

## Checklist (updated)
| Task | Status | Evidence |
|---|---|---|
| Read-only live verification (00) | **VERIFIED live** | All sections run on production. Bug found and fixed in my own 00 (§12 referenced a column that doesn't exist live). |
| Live schema exported into git | **VERIFIED** | `supabase/schema/live_schema_20261024.sql`: 356 objects, **byte-identical** to server output (md5 checked both sides). Generator: `scripts/sql/export_schema_ddl.sql`. |
| Clean reconstruction from git | **VERIFIED (local Postgres)** | The export rebuilds in a fresh PGlite/Postgres 18: 32 tables, 111 policies, 22 functions, 8 triggers. |
| 01–08 tested against the **real** schema | **VERIFIED locally**, NOT on a Supabase staging project | `npm run test:db`: 30/30 on the real schema. The previous reconstructed schema was deleted. |
| Staging Supabase project | **BLOCKED** | Creation denied by the permission policy. Needs your OK (allow the tool, or create `agroconnect-staging` yourself). |
| Password rotation / session revocation | **BLOCKED (owner)** | No Auth-admin capability. Live: prince@ has **10** sessions, user1@ 8, user2@ 1. |
| `expert1` repair | READY (06), tested on the real schema | Live state re-confirmed: Expert role, Approved application, **no experts row**, 0 slots. user2/user3 drifted to Expert. |
| pg_cron | **Confirmed available (1.6.4), not installed** | 05 now installs it when available and schedules the job. |
| Login icon issues (AUD-034/035) | **FIXED + VERIFIED on emulator in airplane mode** | `appium-results/2026-10-24_emulator/06_offline_login_bundled_icons.png` |
| Signed-in admin/user/expert pages | **BLOCKED** | No staging project. Signing into production is not authorised, and the old Catch Up code writes on open. |
| Admin redeploy | **BLOCKED** | No Render access or URL. |
| Production migrations | **AWAITING APPROVAL** | Gate below. |

## Production change set (needs your explicit approval) — apply in this order
| # | Script | What it changes | Why (confirmed live) | Data effect |
|---|---|---|---|---|
| 1 | 01 | `handle_new_user` ignores signup role; counter trigger functions → SECURITY DEFINER; guard triggers on `profiles` (role/ban/counters) and `experts` insert | **Anyone can sign up as Admin**; users can self-promote; users can self-create an `experts` row; counts drift | None |
| 2 | 02 | 3 restrictive anon-deny SELECT policies | Anonymous read of all profiles incl. phone | None |
| 3 | 03 | `is_admin`/`is_banned` definer + pinned search_path for all public functions; revoke anon execute on admin RPCs | Advisor: 21 mutable search_path, 14 anon-executable definer funcs | None |
| 4 | 04 | Add booking columns (`updated_at`, reminder flags, refund fields), `experts.no_show_count`, `posts.title`, pending-application unique index; fix `admin_update_booking_status` | Admin Cancel/Complete is broken (enum + missing column); repo/live drift | Additive (3 existing bookings get defaults) |
| 5 | 07 | Remove `expert-cvs-select`/`-insert`; owner-path `post-videos-insert` | **Every signed-in user can read every expert's CV** | None |
| 6 | 08 | Add 6 tables to `supabase_realtime` | Realtime receives nothing today | None |
| 7 | 05 + **new client release together** | Server-side booking/cancel/join/complete, scheduled reminders/no-shows (pg_cron), refunds, notification/slot/expert/review guards, revoke direct booking writes | Booking notifications never delivered (enum); slot locks silently fail; any participant can rewrite a booking; anyone can forge notifications | Additive. Old app builds lose direct booking writes (they are already partly broken). |
| 8 | 06 | Fixture repair | Only on staging, or on production only if you want `*.agroconnect.local` test accounts there | Touches the 5 fixture accounts only |

**Do not** run `supabase db push` with the repo's `supabase/migrations/`. `20260814_profiles_rls_fix.sql` would take production down: its `is_banned()` references a column that doesn't exist, and every policy calls it. This is proven in `tests/db`.
Backup first: on the Free plan there is no PITR, so take the daily backup from Dashboard → Database → Backups, or run `pg_dump` with your DB URL. Rollback: `99_rollback.sql` (tested).

## Actions only you can do
1. **Rotate passwords** (Dashboard → Authentication → Users) for `prince@agroconnect.com`, `user1@agroconnect.com`, `user2@agroconnect.com`, and the 5 `*@agroconnect.local` fixtures. Use *Sign out user* on each to kill their sessions (prince@ has 10). Enable **Leaked password protection** (Authentication → Passwords).
2. **Allow or create staging**: either permit `create_project` in this environment, or create a free `agroconnect-staging` project yourself and give me its ref. I will then apply the export + 01–08 + 06, seed fixtures, and run the signed-in API, browser and emulator suites.
3. **Approve the production change set** above (all of it, or by row).
4. Redeploy the admin site on Render (settings above) after 1, and release the new app together with step 7.

---

# Production apply — 2026-10-24 (approved by owner: 01, 02, 03, 07, 08; 04/05 held)

**Backup.** The connector has no backup tool and the Free plan has no PITR, so no platform backup was confirmed. These
five scripts change **no table rows** (functions, triggers, policies, grants, publication only). Before applying,
the git schema snapshot was re-verified byte-identical to production (md5 `0c0bd1d0…e491`, 356 objects). From it,
`supabase/backups/20261024_pre_remediation_restore.sql` was generated. Locally, applying 01/02/03/07/08 and then
the restore returns every function, grant, policy, trigger and publication entry to its exact prior state (empty
catalog diff).

Behavioural checks on production ran inside DO blocks that always end with `raise exception`, so Postgres rolls
everything back. Subjects were the `*@agroconnect.local` fixtures. A follow-up query confirmed nothing persisted.

| Migration (recorded in `supabase_migrations.schema_migrations`) | Live verification | Result |
|---|---|---|
| `remediation_01_privilege_escalation` | Signup with `role: Admin` → profile role **Farmer**; farmer `role = 'Admin'` → **blocked 42501**; farmer inserts own `experts` row → **blocked 42501**; normal profile edit → **ok**; auth trigger still wired; 14 profiles / role counts unchanged | PASS |
| `remediation_02_profiles_require_sign_in` | Real anon HTTP probe (`npm run test:rls`): profiles 14→**0**, farmer_profiles 2→**0**, followers 4→**0**; signed-in read still 14/2/4; keep-alive ping OK | PASS |
| `remediation_03_definer_helpers_and_grants` + `remediation_03b_trigger_function_grants` | 0 functions without search_path; `is_admin`/`is_banned` definer; real admin `is_admin()=true`; farmer `ban_user` → **not authorized**; anon `ban_user` → **42501**; 0 anon-callable definer functions besides `is_admin`/`is_banned`; counters now update across users (like 0→1, follower 0→1) | PASS |
| `remediation_07_storage_privacy` | Pre-check: all 20 CVs live under a user-id folder. After: another user sees **0** foreign CVs (previously all 20); owner sees own 3; admin sees 20; leaky policies 0 | PASS |
| `remediation_08_enable_realtime` | 6 tables published, all with RLS | PASS (catalog). End-to-end delivery needs a signed-in client: NOT TESTED |
| Post-apply | Advisor: search_path 21→0; anon definer 14→2 (`is_admin`/`is_banned` must stay: RLS evaluates them for anon); leaked-password protection still off (dashboard). 04/05 objects absent. Anon probe 0 tables. Playwright smoke vs production auth 5/5 | PASS |

`03b` is an addition to 03 that I made during the apply: 01 had made the six counter trigger functions SECURITY DEFINER,
which left them anon-executable. The revoke was proven not to stop triggers firing (local test, then live check), and
it is now part of `supabase/proposed/03_fix_security_definer_functions.sql`.

**Still open in production:** passwords not rotated; notification forgery and direct booking rewrites (need 05,
together with the new app release); admin booking Cancel/Complete broken and missing columns (need 04); expert1
fixture (06, staging); marketplace payment/order RLS (AUD-047); leaked-password protection.
To undo: `supabase/backups/20261024_pre_remediation_restore.sql` (re-opens the holes).

---

# Staging — 2026-10-25 (`ahkgvuewgbjyahbiehrx`, owner-approved; production untouched)

Details and rebuild steps: `supabase/staging/README.md`.

| Step | Status | Evidence |
|---|---|---|
| Target verified before every write | DONE | `get_project` → `ahkgvuewgbjyahbiehrx` before each of 13 migrations |
| Pre-setup backup | DONE | `supabase/backups/20261025_staging_pre_setup_state.sql` (staging was empty) |
| Preflight compatibility | DONE | Found: new-project default grants differ from production → explicit parity grants; storage policy creation, bucket inserts, auth trigger all work |
| Schema export applied | PASS | byte-identical to production snapshot (md5 `0c0bd1d0…e491`) |
| 01/02/03/07/08 applied | PASS | parity fingerprint equals current production in every section (function ACL form differs, same effective rights) |
| 04 + 05 (no scheduler) applied | PASS | 14 migrations; guards, revokes, restrictive read policies present; pg_cron **not** installed |
| Test accounts via normal signup | **BLOCKED** | `email_address_invalid` for `.local`; `over_email_send_rate_limit` (email confirmation on). 0 users created |
| 06 fixture repair | BLOCKED (needs accounts) | made email-keyed; still 30/30 in `test:db` |
| Anonymous attacker suite vs staging HTTP API | **5/5 PASS** | `tests/e2e/staging-anon.test.mjs`; afterwards 0 rows anywhere |
| Staging web + admin builds | PASS | `--mode staging`; bundles reference staging only |
| Browser suite vs staging builds | 5 PASS / 5 SKIPPED | unauthenticated pass; signed-in need accounts |
| Signed-in API / browser / device suites | BLOCKED | accounts |
| Scheduler | DONE (approved 2026-10-25) | pg_cron 1.6.4; job `consultation-lifecycle` every minute; runs recorded as `succeeded` in `cron.job_run_details` |

## pg_cron — what approving it means (staging)
* `create extension pg_cron` installs the `cron` schema and a background worker in the staging database; Supabase's
  `issue_pg_cron_access` event trigger then grants `postgres` access. Available on the Free plan.
* `cron.schedule('consultation-lifecycle', '* * * * *', 'select public.process_consultation_lifecycle()')` runs every
  minute as `postgres`: it writes reminder notifications, auto-cancels no-show bookings (refund → `Pending`, slot freed,
  expert `no_show_count` + 1) for **staging data only**.
* Side effects: one short transaction per minute; `cron.job_run_details` grows ~1,440 rows/day (prunable).
  Undo: `select cron.unschedule('consultation-lifecycle'); drop extension pg_cron;`.

## Owner actions to unblock staging accounts (dashboard, staging project only)
1. Authentication → Sign In / Providers → Email → turn **off "Confirm email"** (staging only), so signup sends no email.
2. Choose a test email domain that Supabase Auth accepts (it rejects `.local`). Options: a domain you control, or
   tell me to use a public test domain and I will retry once; set it as `FIXTURE_EMAIL_DOMAIN` in `.env.staging`.
3. Approve (or not) installing pg_cron and scheduling the job on staging.

### Staging update — signed-in verification complete (2026-10-25)
Accounts created via the normal signup flow (6, synthetic addresses), admin promoted, 06 applied, pg_cron installed and
scheduled (owner-approved). API 8/8, workflows 7/7 + realtime pass on re-run, browser 10/10 — see `TEST_RESULTS.md`.
Remaining for staging: Android device run (needs a staging app id so it does not replace the production app).
Production unchanged since the approved 01/02/03/07/08 apply (migration history checked).

**Production release readiness (04 + 05 + new app):** staging now proves the full lifecycle on a real Supabase
project. Release order: (1) owner rotates exposed passwords; (2) apply 04, 05 (incl. pg_cron) to production;
(3) ship the new web build and APK together; (4) optional forced-update broadcast for old APKs.

## 2026-10-25 — media and Catch Up (staging only; production unchanged)
New proposed migrations, applied to **staging** only and held for production with `04`, `05`, `09`:
* `10_post_media_storage.sql` — security: anyone (even signed out) could **list** every file in the public media
  buckets (avatars, post images, …) through the Storage API, incl. uploads of deleted/failed posts. Now owner/admin only.
  Public file links keep working (by design those buckets are public; paths contain the user id + timestamp).
* `11_consultation_meetings.sql` — the join window is now enforced only on the server with the database clock (it
  never closed before, banned users were not checked, completion could happen before the start); the booking function
  no longer stores invented `meet.agroconnect.app` links.
Production release order: backup → 04 → 05 → 09 → 10 → 11 → deploy `admin-delete-user` → new APK + admin build.

## 2026-10-25 — account recovery, video, push (branch `feature/recovery-video-push`, staging only; production unchanged)
* No database change for account recovery (Supabase Auth only). Change Password now verifies the current password.
* `12_expert_controlled_completion.sql` — a farmer could end a paid consultation for both; now only the expert can,
  and a session the expert attended is completed by the scheduler at slot end.
* `13_push_notifications.sql` — push queue. Security notes: device tokens are written only through
  `register_push_device()` (tied to `auth.uid()`); the outbox has RLS on and no policies (service role only); only
  server-made booking notifications are pushed (a client-made notification never is — a DB test caught the first,
  SECURITY DEFINER version of the trigger doing exactly that); the dispatcher must present a Vault secret.
* Staging-found fixes (`12b_13b`): reminder wording, no cancellation reason in pushes, 2-hour expiry.
Production order: see `RELEASE_CHECKLIST.md` (backup → 04 → 05 → 09 → 10 → 11 → 12 → 13 → functions → apps).
