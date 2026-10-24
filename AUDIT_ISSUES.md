# AgroConnect — Audit Issue Register (2026-10-24)

Audited commit `f7e5750` (branch `claude/great-rhodes-fd3ce8`). Uncommitted Antigravity work in the main checkout
(`changes.pdf` items) was reviewed but not modified.
Status values: **Fixed** (code changed + regression test), **Proposed** (SQL written in `supabase/proposed/`, not
applied), **Open** (documented, not changed). "Confirmed" = reproduced or observed; "Suspected" = strong evidence
from code but not reproducible without writing to production.

No secrets are reproduced here. Where a credential is involved, only the file is named.

## A. Confirmed bugs

| ID | Sev | Module | Description & evidence | Root cause | Fix / status | Regression test | Remaining risk |
|---|---|---|---|---|---|---|---|
| AUD-001 | **Critical** | Admin web — `pages/Login.jsx` | The admin login pre-filled the live admin email **and password** and called `handleLogin` in a mount `useEffect`. Anyone opening the admin site was signed in as admin. Confirmed: the credential string was present in the baseline built bundle `admin-dashboard/dist/assets/index-*.js`. | Demo convenience from commit `807524e`. | **Fixed**: empty fields, auto-submit removed. Verified in browser: fields empty, no `auth/v1` request on load, wrong credentials show "Invalid login credentials". | `tests/regression.test.js` AUD-001, AUD-002 (bundle scan — fails on the old bundle, passes on the new one) | **Rotate the admin password now** — it is in git history and in any deployed bundle built before this fix. Redeploy the admin site. |
| AUD-002 | **Critical** | Repo hygiene | Real passwords for the admin and two demo users were committed in `seed-demo-users.js` and earlier in `user.md` / `src`/`admin` login pages (commits `052b81b`, `54be730`, `807524e`). | Credentials kept in code. | **Fixed in working tree**: `seed-demo-users.js` now reads `DEMO_ADMIN_PASSWORD`, `DEMO_USER1_PASSWORD`, `DEMO_USER2_PASSWORD` and exits if missing (it also used `require` in an ESM package, so it could not run at all — now `import`). | AUD-002 | History still contains them: rotate all three passwords. Rewriting history is optional once rotated. `seed/test-fixtures.js` keeps a shared password for `*.agroconnect.local` test accounts (test-only, acceptable if those accounts never get privileges). |
| AUD-004 | High | User app — Feed comments | Users could never edit/delete their own comments; edit/delete showed only for comments whose author name was "You" or "Ramesh Kumar". | Leftover mock check `c.userName === 'You' \|\| c.userName === 'Ramesh Kumar'`; comment queries did not select `user_id`. | **Fixed**: queries select `user_id`; ownership = `c.userId === currentUserId`; verified-expert badge now uses the joined `role` (`Expert`) instead of a name lookup for the never-used role `Agronomist`. Delete/edit now check that a row was actually changed (RLS denials are silent). | AUD-004 | Comment likes/dislikes and replies are still local-only (AUD-026). |
| AUD-005 | Medium | User app — Feed | `p.full_name.toLowerCase()` throws when any profile has a null `full_name`, aborting the mention-user list load. | Missing null guard. | **Fixed** (`(p.full_name \|\| '')`). | AUD-005 | — |
| AUD-006 | Medium | User app — Feed likes | Like/unlike ignored the Supabase error; double taps or RLS denials made the counter drift from the DB. | Unchecked write, optimistic UI without rollback. | **Fixed**: error toast + `PostCard` rolls back its optimistic state when `onLike` resolves `false`. | AUD-006 | Profile/Search post cards still pass no `onLike` (likes there are local-only — AUD-026). |
| AUD-007 | High | User app — Become Expert (KYC) | If the CV upload failed the app only `console.warn`ed and still inserted an application pointing at a non-existent file. Before inserting, it also deleted **all** previous applications of the user (history loss; if the insert then failed, the user had none). | Error swallowed; destructive client-side cleanup. | **Fixed**: upload failure aborts with a message; history is kept; duplicate pending (`23505`) gives a clear message. | AUD-007 | Admin "Applications" list now shows a re-applicant's Rejected and new Pending rows (each with status badge). That is the intended audit trail; group by user in the UI if preferred. |
| AUD-009 | Medium | Admin — Dashboard | "Active Users" was `users × 0.65` ("simulated"); "~65% Monthly Active", Storage 45 %, 100 GB, Backup "Up to date", 32 active sessions and "Online/Connected" were hard-coded. | Placeholder values (violates Rules.md §6.4). | **Fixed**: Active Users = distinct users who posted in the last 30 days (real query, labelled as such); Server/DB status reflect whether the dashboard queries succeeded; untracked metrics say "Not tracked". Layout unchanged. | AUD-009 | — |
| AUD-010 | Medium | Admin — Posts, Comments, PostDetailModal | Deletes ignored errors (modal) and never checked that a row was removed, then wrote an audit-log entry anyway → false audit trail and "deleted" posts that still exist. | RLS denials return success with 0 rows. | **Fixed** for the three delete paths (`.select('id')` + row check before audit). | AUD-010 | Same pattern remains in `Users.jsx`/`UserProfileModal.jsx` unban and `News.jsx` delete (low impact). |
| AUD-011 | Low | `keep-alive.js` | `timestamp` was declared inside `try` and used in `catch` → `ReferenceError` exactly when a ping fails. | Scope bug. | **Fixed**. | AUD-011 | — |
| AUD-008 | High | Database — RLS | **Confirmed live** (`npm run test:rls`): an anonymous caller with the public anon key reads all 14 `profiles` rows (incl. `phone`, `ban_reason`, `role`), all `farmer_profiles` and the `followers` graph. The repo's `profiles_select` policy says "own row or admin", so a broader policy exists only in the live DB (schema drift). | Live policy not tracked in migrations. | **Proposed** `supabase/proposed/02_profiles_require_sign_in.sql`. | `tests/rls-anon-probe.mjs` (currently **FAILS**: 3 tables) | Phone numbers remain visible to all signed-in users until a view/owner-only table is introduced. |
| AUD-015 | High | Data / Catch Up (expert view) | The expert fixture `expert1@agroconnect.local` has `profiles.role = 'Expert'` but **no `experts` row** (read-only check 2026-10-24). `Connect.jsx` decides expert mode from the `experts` row, so this expert sees the farmer view and no availability editor. This is the root cause asked for in `agent.md` item 12. Fixture users `user2`/`user3` are now also `Expert`, so the documented fixture states have drifted. | `seed/test-fixtures.js` sets `role` but never inserts `experts`; data mutated by later test runs. | **Open** — fix data via admin approval flow or service-role script (needs your go-ahead). Query in `00_readonly_verification.sql` §6 lists all such users. | — | Any expert approved outside `approve_expert_application()` has the same problem. |
| AUD-016 | High | Test evidence | `appium-results/2026-09-26_21-32/REPORT.md` marks Scenario D (expert view, 5 steps) **PASS**, but its five screenshots (26–30) are byte-identical 2.7 KB blank dark images (same MD5). Combined with AUD-015, Scenario D is **not** evidenced. | Script recorded PASS without asserting on content. | **Open** — treat Scenario D as NOT TESTED; re-run after AUD-015 is fixed. | — | Other scenarios in that report were not re-verified here. |
| AUD-017 | Medium | Uncommitted WIP — `supabase/functions/delete-user` | The new Edge Function has no CORS/`OPTIONS` handling (returns 405 for every non-POST). `supabase.functions.invoke` from the admin browser sends a preflight, so hard delete will fail with a CORS error. The WIP migration `20261024_agent_fixes.sql` also contains a one-time `DELETE` of older `expert_applications` rows (irreversible) and `approve_expert_resignation` does not check that the resignation is still Pending. `expert_resignations` already exists live, so that migration appears to have been applied. | — | **Open** (your uncommitted work; not modified). Add `if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })` and CORS headers on every response. | — | — |

## B. Confirmed design/integrity issues (not fixed — need DB changes or product decisions)

| ID | Sev | Module | Description | Proposal |
|---|---|---|---|---|
| AUD-013 | High | Catch Up — `Connect.jsx` L293-427 | Reminders, 5-minute expert no-show auto-cancel, refunds (`refund_status='Refunded'` with no payment system), `experts.no_show_count` increments and admin alerts all run **in each participant's browser** every 60 s. This only works if RLS lets any user insert notifications for anyone and update other people's bookings/expert rows; it double-fires when both participants are online and never fires when neither is. | Move to a scheduled Edge Function / `pg_cron` job; restrict `notifications` INSERT to own rows or SECURITY DEFINER RPCs. |
| AUD-014 | High | Catch Up booking | Booking = insert booking → update slot → insert video meeting as three client calls (race: double booking; partial failure). Violates Rules.md §3.4. Live data (2026-10-24): 6 of 24 slots are future and unbooked; the expert list correctly hides experts without open slots in the next 7 days. | **Proposed** `04_book_consultation_rpc.sql`. |
| AUD-018 | Medium | Create Post | Client inserts posts with `status: 'Approved'` — moderation is advisory only; `title` column (migration 20260807) is unused (title is concatenated into `caption`); tags are computed and discarded. | Default `status` server-side; decide if pre-moderation is wanted. |
| AUD-019 | Medium | Consultation call | Video call is simulated in-app; `meeting_link` points to a non-existent domain; whoever leaves the call first marks the booking `Completed`. | Integrate a real provider (e.g. Jitsi/Daily) or label as demo. |
| AUD-012 | Medium | DB functions | `is_banned()` in `20260814` references `profiles.status`, which does not exist (live table has `is_banned`). SECURITY DEFINER helpers have no pinned `search_path`. | **Proposed** `03_fix_security_definer_functions.sql`. |
| AUD-022 | Medium | Register | "Detect GPS" stores real coordinates but always fills the address with a fixed Punjab village; AndroidManifest declares no location/camera permissions, so in the APK it always falls back to the hard-coded location. | Reverse-geocode or leave fields for the user; add permissions requested contextually (Rules.md §7.1). |
| AUD-024 | Medium | Performance | Main JS chunk 1.84 MB (834 kB gzip) — two ~0.9 MB Lottie JSON files are bundled; `Connect.jsx` re-renders the whole 2.9k-line page every second via an unused `nowTick` state; feed loads all posts (no pagination); Chat does one profile query per conversation. | Lazy-load Lottie JSON, paginate feed, drop `nowTick` or scope it to the countdown. |
| AUD-029 | Medium | Marketplace / Sellers | App "Become a Seller" opens Coming Soon; admin Products/Orders/Categories routes render Coming Soon (their page components are dead code); admin Sellers approves `seller_profiles` that the app cannot create. | Product decision. |

## C. Suspected risks (need the read-only SQL in `supabase/proposed/00_readonly_verification.sql`)

| ID | Sev | Description | Proposal |
|---|---|---|---|
| AUD-003 | **Critical (suspected)** | `profiles_update` allows a user to update every column of their own row, and `is_admin()` trusts `profiles.role`. Unless a trigger outside the repo blocks it, any signed-in user can make themselves Admin from the browser console. `seed/test-fixtures.js` sets `role`/`status` while signed in as the user, which suggests this works. Not reproduced (would require writing to production). | **Proposed** `01_protect_profile_privileged_columns.sql`. |
| AUD-003b | High (suspected) | `Register.jsx` sends `role: 'Farmer'` in signup metadata. If the (untracked) `handle_new_user` trigger copies `raw_user_meta_data->>'role'`, a direct API signup with `role: 'Admin'` would create an admin. | Check §4 of the verification SQL; `01_…` also blocks non-Farmer inserts by API callers. |
| AUD-028 | Info | Two profiles hold `role = 'Admin'`. Confirm both are intended. | §7 of the verification SQL. |

## D. Lower-severity findings / improvements

| ID | Sev | Description |
|---|---|---|
| AUD-020 | Medium | "PEA AI" returns canned answers chosen by keyword matching (no model or API). Classified UI-only. |
| AUD-021 | Low | "Continue with Google", "Forgot Password?" and "Remember me" do nothing (verified in browser: no handler, no network request). |
| AUD-023 | Low | `Register.jsx` ignores errors from the post-signup `profiles` update and `farmer_profiles` insert (they fail silently if email confirmation is on and there is no session yet). |
| AUD-025 | Low | Android build is machine-specific: `android/gradlew` hard-codes `JAVA_HOME=$APP_HOME/../jdk17/...` and `gradle.properties` pins an absolute JDK path. |
| AUD-026 | Low | Likes on Profile/Search post cards, comment likes/dislikes and comment replies are local-only (never persisted). Bookmarks are local-only. |
| AUD-027 | Low | Dead code: `src/mock/*.json` (unreferenced), admin `Products.jsx`, `Orders.jsx`, `Categories.jsx` (routes show Coming Soon). 52 oxlint warnings (unused vars, hook deps), 0 errors. |
| AUD-030 | Low | `seed/lib/supabaseAdmin.js` silently falls back to the anon key when the service key is missing, so seed scripts "succeed" with partial writes. |
| AUD-031 | Low | `android:allowBackup="true"` lets the Supabase session in WebView storage be included in device backups. |

---

## Remediation pass (2026-10-24, second session) — status updates

"Ready" = code/SQL written and tested on the disposable PostgreSQL copy (`npm run test:db`); **not applied to production**.

| ID | New status | What changed / evidence |
|---|---|---|
| AUD-001/002 | Fixed in code; **rotation BLOCKED on owner** | Credential map and rotation steps in `REMEDIATION_STATUS.md`. |
| AUD-003 | Ready (01) | Test shows a farmer CAN self-promote on the baseline, and CANNOT after 01. Admin RPCs, "leave expert mode" and normal edits still work. Bug caught in my own first draft: the trigger function must be SECURITY INVOKER (fixed). |
| AUD-008 | Ready (02, now RESTRICTIVE policies — no need to know live policy names) | Test: anon reads 4→0 rows, signed-in unchanged. Live probe still FAILS until applied. |
| AUD-012 | Ready (03) | Test proves the repo's `is_banned()` errors at runtime (`profiles.status` doesn't exist) and that this also breaks non-admin profile updates; fixed by 03. |
| AUD-013 | Ready (05) + client refactored | Reminders, no-show cancellation, refunds and admin alerts now run only in `process_consultation_lifecycle()` (pg_cron, every minute). `Connect.jsx` has no notification writes left. |
| AUD-014 | Ready (05) + client refactored | `book_consultation_slot` (row lock + partial unique index + idempotent duplicate submit); cancel/join/complete RPCs; direct booking writes revoked. |
| AUD-015 | Diagnosed; repair Ready (06, `seed/test-fixtures.js`) | Root cause confirmed (no `experts` row; seeder never created one). |
| AUD-016 | Unchanged | Scenario D still unevidenced; the device run is BLOCKED on staging. |
| AUD-024 | Partly fixed | Removed the unused `nowTick` state that re-rendered Catch Up every second. |
| AUD-030 | Fixed | `seed/test-fixtures.js` refuses to run without the service-role key and refuses the production project. |

### New findings

| ID | Sev | Module | Description | Status |
|---|---|---|---|---|
| AUD-032 | High | Catch Up — farmer cancel | The farmer's appointment objects had no `slotId`, so a farmer cancellation never freed the slot (it stayed `is_booked` forever). Also, notifications were written for the expert and **every admin** from the farmer's browser. | Fixed by the 05 RPC (server frees the slot via `slot_id`). Test: cancellation test. |
| AUD-033 | High | Refunds | The browser set `refund_status = 'Refunded'` (no-show: full rate; farmer cancel: 50 %) although no payment system exists. No money moved. | 05: refunds become `Pending`; `admin_settle_refund` (admin/service role) records Refunded/Failed with an audit entry; `admin_retry_refund` Failed→Pending. Terminal states block double refunds. |
| AUD-034 | Low | Login UI | "Continue with Google" shows the word "google"/"GOOGLE" instead of an icon (`google` is not a Material Symbols name). The button also does nothing (AUD-021). | Open (device screenshot `appium-results/2026-10-24_emulator/02_login.png`). |
| AUD-035 | Medium | App shell | Inter and Material Symbols load from fonts.googleapis.com at runtime. On a cold device launch before the network was ready, every icon rendered as its ligature name ("person", "lock", "visibility") and the text fell back to Roboto. Rural users on poor connections will see this. | Open. Recommend bundling the fonts (e.g. `@fontsource/inter`, `material-symbols` packages) — same look, no network dependency. |
| AUD-036 | Low | Android | Every launch logs `Error injecting safe area CSS: TypeError: Cannot read properties of null (reading 'style')` from the Capacitor bridge (runs before `<body>` exists). No visible effect observed. | Open. |
| AUD-037 | Medium | Seeds | `seed/generators/users.js` hard-coded the shared password for all generated demo users. | Fixed (reads `DEMO_SEED_PASSWORD`). Old value is in git history: rotate/delete those accounts if they exist in production. |
| AUD-038 | High | Release process | 05 and the new `Connect.jsx` must ship together. The new client calls RPCs that production doesn't have yet, and after 05, already-installed old APKs can no longer book or cancel. | Documented release order in `REMEDIATION_STATUS.md`. Consider a forced-update broadcast (the app already supports `action_type = 'forced'`). |
| AUD-039 | Info | Business rule | When an **expert** cancels, the farmer gets no refund (copied from the existing code). Probably unintended. | Product decision; not changed. |
