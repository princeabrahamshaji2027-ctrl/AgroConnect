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
