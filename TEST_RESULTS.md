# AgroConnect — Test Results (audit of 2026-10-24)

Environment: macOS, Node 24.11.1, JDK 17 (local `jdk17/`), Android SDK present, **no adb/device/emulator, no Appium**.
Live Supabase project `mgreapakfchcxcrauheq` was accessed **read-only with the public anon key only**. The service-role
key in the local `.env` was not used. No account was signed into, because every test account lives in the production
project (signing in or writing would touch production data).

Statuses: PASS · FAIL · BLOCKED · NOT TESTED · NOT IMPLEMENTED.

## 1. Builds and static analysis

| Test | Baseline | Final | Evidence / notes |
|---|---|---|---|
| User app production build (`npx vite build`) | PASS | PASS | Warnings: direct `eval` inside `lottie-web`; main chunk 1,835 kB (834 kB gzip). |
| Admin build (`admin-dashboard: npx vite build`) | PASS | PASS | Main chunk 526 kB (134 kB gzip). Admin `node_modules` installed with `npm ci` in this worktree. |
| Android debug APK (`./gradlew assembleDebug`) | PASS | PASS | Needed the JDK at `../jdk17` (AUD-025). Final APK 10.7 MB, contains the fixed web bundle (checked inside the APK: no mock owner names left). |
| Android unit tests (`testDebugUnitTest`) | PASS (1/1) | PASS (1/1) | Only the Capacitor template `ExampleUnitTest`; no real native tests exist. |
| Android instrumented tests | BLOCKED | BLOCKED | No device/emulator attached (`adb` not on PATH). |
| oxlint (root config, both apps) | PASS — 0 errors, 54 warnings | PASS — 0 errors, 52 warnings | 42 unused vars, 8 hook-deps, 4 useless escapes at baseline. |
| Admin bundle contains hard-coded admin credential default | FAIL | PASS | Baseline bundle had the admin email/password as `useState` defaults; rebuilt bundle does not. |

## 2. Automated tests (`npm test`)

| Test | Result |
|---|---|
| Validation unit tests (`src/utils/validation.test.js`) — 27 cases | PASS 27/27 (baseline and final) |
| AUD-001 admin login has no pre-filled/auto-submitted credentials | PASS (would FAIL on baseline) |
| AUD-001 user login has no pre-filled credentials | PASS |
| AUD-002 seed-demo-users reads passwords from env | PASS (FAIL on baseline) |
| AUD-002 built admin bundle has no credential default | PASS (verified it FAILS against the baseline bundle) |
| AUD-004 comment ownership by author id | PASS (FAIL on baseline) |
| AUD-005 null-safe full_name | PASS (FAIL on baseline) |
| AUD-006 like errors checked + rollback | PASS (FAIL on baseline) |
| AUD-007 KYC aborts on upload failure, keeps history | PASS (FAIL on baseline) |
| AUD-009 no fabricated dashboard stats | PASS (FAIL on baseline) |
| AUD-010 admin deletes verified before audit log | PASS (FAIL on baseline) |
| AUD-011 keep-alive timestamp scope | PASS (FAIL on baseline) |

These are source-level regression guards. They prove the defective code is gone and stays gone; they do not
exercise the flows against a database (see §4).

## 3. Live, read-only security probe (`npm run test:rls`)

| Table | Anonymous rows readable | Result |
|---|---|---|
| profiles | 14 (incl. `phone`, `ban_reason`, `role`) | **FAIL** (AUD-008) |
| farmer_profiles | 2 | **FAIL** |
| followers | 4 | **FAIL** |
| consultation_bookings, messages, conversations, notifications, expert_applications, admin_audit_log, reports, orders | 0 | PASS |

Also observed read-only: `experts`, `consultation_slots`, `reviews` and approved `posts` are readable anonymously
(arguably public content); `expert_resignations` exists live (WIP migration already applied).

## 4. UI checks in the built-in browser (production builds served by `vite preview` on localhost)

| Feature | Role | Steps | Expected | Actual | Status |
|---|---|---|---|---|---|
| Admin login page | anonymous | Open admin site | Empty fields, no automatic sign-in | Empty fields; no `auth/v1` request | PASS |
| Admin login error | anonymous | Submit a non-existent account (`audit-nonexistent@example.invalid`) | Error shown, stays on login | "Invalid login credentials" | PASS |
| App splash → login | anonymous | Open app at 375×812 | Splash animation then login | Lottie splash, then login screen; no console errors | PASS |
| Register client validation | anonymous | Submit empty form | First validation error | "Full Name is required." | PASS |
| Continue with Google | anonymous | Tap button | OAuth flow | Nothing happens, no request | NOT IMPLEMENTED |
| Forgot Password | anonymous | — | Reset flow | Plain text, no handler | NOT IMPLEMENTED |

## 5. Feature flows that need a signed-in session

| Feature | Status | Reason |
|---|---|---|
| Login/logout/session persistence, feed, create/edit/delete post, comments, likes, follow, chat, notifications, profile edit, avatar upload, Become Expert, Catch Up booking/cancel/review, expert availability, admin approve/reject/ban/moderate/broadcast | BLOCKED | All test accounts live in the production Supabase project; no staging project exists. Signing in and writing there is a production change. A staging Supabase project (or explicit authorisation to use the `*.agroconnect.local` fixtures in production) would unblock this. |
| Previous Appium report Scenario D (expert view) | NOT TESTED | Its PASS is unsupported: 5 identical blank screenshots (AUD-016); data shows the expert fixture lacks an `experts` row (AUD-015). |
| Previous Appium report Scenarios A–C, E1–E3 | NOT TESTED (here) | Not re-run (no device / Appium). Screenshots exist in `appium-results/2026-09-26_21-32/`. |
| Marketplace (products, orders, seller onboarding) | NOT IMPLEMENTED | Coming Soon screens. |
| AI assistant | NOT IMPLEMENTED (UI only) | Keyword-matched canned text. |
| Video consultation | NOT IMPLEMENTED (simulated) | No real call provider. |
| IoT / crop disease detection | NOT IMPLEMENTED | No code present. |

---

## Second session (2026-10-24) — remediation verification

### A. Database tests on a disposable PostgreSQL copy (`npm run test:db`, PGlite 0.5.8 = PostgreSQL 18.3)
The copy is the reconstructed base schema (`tests/db/reconstructed_base_schema.sql`, built from observed columns and
client code; **not** the live schema) plus the repo's 6 real migrations, then the proposed scripts.
**24/24 PASS.**

| Area | Tests |
|---|---|
| 00 read-only | static keyword scan; all statements execute inside `BEGIN TRANSACTION READ ONLY` |
| 01 | baseline vulnerability reproduced (farmer → Admin); after 01: role/ban/counter edits rejected, Admin insert rejected, bio edit OK, Expert→Farmer OK, admin edit OK, `approve_expert_application` still works |
| 02 | anon 4→0 rows on profiles, 0 on followers; authenticated unchanged |
| 03 | old `is_banned()` errors (and breaks profile updates); fixed; banned user's edit filtered; search_path pinned |
| 05 booking | valid booking + video room + slot lock; booked/past/own/empty-issue/anon rejected with no partial rows; duplicate submit idempotent; unique-index backstop vs double booking; direct table writes rejected; legit expert slot/profile edits allowed |
| 05 cancel/notify | only participants; farmer refund 50 % Pending; expert must offer slots; recipients exact (expert + admins / farmer); forgery rejected; own/admin inserts OK; `_notify` not callable by clients |
| 05 scheduler | 24 h / 30 min / expert 10 min reminders to the right people, exactly once over repeated runs; none for cancelled bookings; no-show only when Booked + not joined + 5 min late, processed once, counter +1 once, slot freed, 3 notifications; clients can't run the job |
| 05 join/complete/review | join window enforced; non-participant rejected; completion requires expert attendance; idempotent; reviews only by the farmer of a completed booking, once |
| 05 refunds | not eligible before cancel; non-admin rejected; simulated provider failure → Failed → retry → Pending → Refunded; no double settlement; audit + farmer notice |
| 05 recovery | injected delivery outage rolls back the whole run (flags unchanged); next run delivers exactly once |
| 05/99 | 05 re-runnable; rollback restores old behaviour, keeps data, re-runnable |
| 06 | expert1 → Expert + experts row + Approved + 28 future slots; user1/3 Farmer none; user2 Pending; user4 Rejected; idempotent; non-fixture user untouched; expert1 detected as expert through RLS, not admin, can't escalate; fixture farmer books expert1 end to end |

Limit: PGlite is single-connection, so two truly parallel bookings were not executed. The row lock is in the
function, and the unique index is proven to reject a second active booking.

### B. Unit/regression (`npm test` first two stages)
Validation 27/27 PASS. Regression guards 13/13 PASS (2 new: Catch Up uses RPCs only; fixture seeder safety).

### C. Browser E2E (`npm run test:e2e`, Playwright 1.64 with local Chrome, production builds via `vite preview`)
| Test | Result |
|---|---|
| admin: login empty, no auto sign-in request, no service-role JWT or admin email in any JS | PASS |
| admin: wrong credentials → "Invalid login credentials", no dashboard | PASS |
| admin: refresh on nested path `/users/123` serves the app | PASS (local preview; Render needs the rewrite rule) |
| app: splash → empty login; register validation | PASS |
| app: wrong credentials error | PASS |
| admin signed-in (dashboard, Users, Experts, refresh), non-admin refused; app normal user, expert1, admin redirect | BLOCKED — skipped, needs staging (`E2E_STAGING=1` + credentials) |
Screenshots: `appium-results/2026-10-24_web/`.

### D. Staging API E2E (`npm run test:staging`)
8 tests (anon isolation, profile persistence, self-promotion, notification forgery, admin/scheduler RPC
rejection, direct booking writes, sign-out, expert1 validity, full book → see → isolate → cancel → refund →
notify cycle, admin reads). **BLOCKED — all skipped** (no staging project). The suite refuses the production URL.

### E. Android emulator (Pixel-class AVD, API 36.1, debug APK with the refactor)
| Step | Result | Evidence |
|---|---|---|
| Install + launch (`am start`, 3.8 s) | PASS | — |
| Splash → login, empty fields | PASS | `appium-results/2026-10-24_emulator/01_splash.png`, `02_login.png` |
| Wrong credentials | PASS ("Invalid login credentials") | `03_invalid_login.png` |
| Hardware back on login | PASS (stays in app) | — |
| Landscape rotation | PASS (login still rendered) | `04_landscape_login.png` |
| Force-stop + relaunch | PASS (back to login, no crash) | `05_relaunch.png` |
| Crash check (logcat FATAL/AndroidRuntime) | PASS (none) | — |
| Icon/font rendering on cold start | **FAIL** (AUD-035) | observed before fonts loaded |
| Expert scenario (sign in as expert1, Catch Up expert view, availability, upcoming, history, lobby, reviews, restrictions, relaunch persistence) | **BLOCKED** | needs staging fixtures |
| Normal-user signed-in flows | **BLOCKED** | same |

Note: the first wrong-credentials run showed "Failed to fetch". The cause was the emulator clock: the snapshot
was 82 days behind, which breaks TLS. After a cold boot with the correct time it passed. Environment issue, not an
app defect.

### F. Builds
User app build PASS. Admin build PASS. Android `assembleDebug` + unit test PASS. oxlint 0 errors.

---

## Third pass (2026-10-24) — Supabase connector available

### A. Live production checks (read-only SELECTs via the connector, project `mgreapakfchcxcrauheq`)
| Check | Result |
|---|---|
| Project identity / staging exists | 1 project only = production (matches `src/supabase.js`). No staging. |
| `00_readonly_verification.sql` sections 2, 5, 6, 8, 9, 11, 12 + policies/triggers/functions | Ran. RLS on all 32 tables; 13 definer functions without search_path; 1 Expert without experts row; 0 double bookings; 2 non-definer counter writers; pg_cron available, not installed; refund columns absent. |
| Signup-role hole exploited? | No (no user with `role: Admin` in signup metadata). |
| Supabase security advisor | 21 mutable search_path, 14 anon-executable definer RPCs, leaked-password protection off. |
| Schema export | 356 objects, byte-identical (server/local md5 `0c0bd1d0…e491`). |

### B. Database tests on the REAL schema (`npm run test:db`) — **30/30 PASS**
Export reconstruction (32/111/22/8) · repo migration 20260814 proven destructive · 00 read-only (static + READ ONLY txn) ·
01 before/after (signup as Admin, self-promotion, self-made expert, counter drift → all fixed; approve RPC still works; posting still works) ·
02 anon 4→0 · 03 helpers, search_path everywhere, anon blocked from admin RPC, admin ban works ·
04 admin booking RPC fails live, works after (bad status rejected, non-admin rejected) ·
05 live bugs reproduced (enum-rejected notification types; farmer's slot lock affects 0 rows), booking/duplicate/index/past/own/empty/anon,
direct writes blocked, cancellation + refunds + recipients, forgery by farmer and by expert blocked, read-state owner-only,
reminders exactly once, Asia/Kolkata → UTC, no-show once, join/complete/review rules, rating trigger, refund state machine with
simulated provider failure, scheduler failure rollback/retry, all scripts re-runnable ·
06 fixture repair on the live drift pattern · 07 CV leak reproduced and closed, upload paths enforced · 08 publication · 99 rollback.

Not covered: real concurrency (single connection), pg_cron execution itself (extension not in PGlite), Supabase Auth/GoTrue,
PostgREST, Storage HTTP. These need the staging project.

### C. Other suites
| Suite | Result |
|---|---|
| Validation unit tests | 27/27 PASS |
| Regression guards | 14/14 PASS (new: bundled fonts / no "google" ligature) |
| Playwright (local builds, unauthenticated) | 5 PASS, 5 SKIPPED (signed-in, need staging) |
| Staging API E2E | SKIPPED — no staging project (creation blocked by environment permission) |
| Builds | user app, admin, Android `assembleDebug` PASS |

### D. Android emulator (API 36.1)
| Step | Result | Evidence |
|---|---|---|
| Airplane mode + cleared app data + launch | PASS — login renders real icons (person/lock/eye) and Inter; Google button shows text, no "GOOGLE" | `appium-results/2026-10-24_emulator/06_offline_login_bundled_icons.png` |
| Signed-in expert/normal-user scenarios | BLOCKED — staging | — |

---

## Production apply verification (2026-10-24)
All behavioural checks ran in forced-rollback DO blocks on production; persistence check afterwards: nothing left.
| Check | Result |
|---|---|
| Snapshot current before apply (md5) | PASS |
| Restore script returns exact prior catalog (local) | PASS (empty diff) |
| 01: signup as Admin / self-promote / self-expert / bio edit | Farmer / blocked / blocked / ok — PASS |
| 02: anon HTTP probe | 0 tables readable — PASS |
| 02: signed-in reads unchanged | 14/4/2 — PASS |
| 03: search_path, definer helpers, admin vs farmer vs anon on `ban_user` | PASS |
| 03b: trigger functions not callable; counters update across users | PASS |
| 07: foreign CV visibility 20→0; owner 3; admin 20 | PASS |
| 08: publication contents, RLS on published tables | PASS (delivery NOT TESTED) |
| Data row counts unchanged | PASS |
| Playwright smoke (admin + app login, production auth) | 5/5 PASS |
| Supabase security advisor | 21+14 warnings → 2 by design + 14 by design + leaked-password (dashboard) |

---

## Staging (`ahkgvuewgbjyahbiehrx`) — 2026-10-25
| Test | Result |
|---|---|
| Schema reconstruction on a real Supabase project (export md5) | PASS (356 objects identical) |
| Staging ⇄ production parity fingerprint (489 items) | PASS (only ACL notation differs for 3 functions, same rights) |
| Anonymous attacker suite over HTTP (`staging-anon.test.mjs`): private reads, admin/booking/scheduler/internal RPCs, writes, CV list/upload | 5/5 PASS; no rows created |
| Playwright unauthenticated vs staging builds | 5/5 PASS |
| Staging bundles contain no production ref | PASS |
| Local `npm test` (validation 27, regression 14, DB 30) | PASS |
| Test-account signup via public API | BLOCKED (`email_address_invalid` for `.local`; email rate limit, confirmation on) |
| Signed-in API suite (`staging-api.test.mjs`), signed-in Playwright, expert device scenario, realtime delivery, pg_cron runs | BLOCKED (accounts / scheduler approval) |

### Staging, signed in — 2026-10-25 (accounts created through the public signup API; owner-approved)
Accounts: 6 synthetic `agroconnect-stg-<role>-<token>@gmail.com` addresses (random token, not real mailboxes), created
in one run, all with an immediate session ("Confirm email" off). Every signup requested `role: Admin`; all were
created as **Farmer** (01's signup fix verified end to end). Admin promoted via `profiles`; 06 applied.

| Suite / scenario | Result | Notes |
|---|---|---|
| `staging-api.test.mjs` | **8/8 PASS** | profile edit persists; self-promotion, notification forgery, admin/scheduler RPCs, direct booking writes rejected; sign-out; expert1 valid; book → isolate → cancel → refund Pending → slot freed → expert notified; admin reads |
| Ban: admin bans, banned user cannot edit/post, admin unbans, user cannot change own ban flag | PASS | |
| Expert application: no self-approval (update, RPC, direct experts insert); admin approves → Expert; admin demotes | PASS | fixture restored |
| CV privacy (Storage HTTP): owner upload/download; other user cannot list/download/write; admin can | PASS | object removed |
| Concurrent booking race (two farmers, one slot) | PASS | exactly one winner |
| Join window, completion needs expert, review only by farmer and only once, rating trigger | PASS | |
| Admin booking cancel RPC frees slot (broken in production until 04) | PASS | |
| Realtime: farmer receives server-created booking notification | **FAIL first run (20 s timeout), PASS on re-run (2.4 s)** | isolated trace showed SUBSCRIBED → event; first-connection latency on the new project suspected; test unchanged |
| pg_cron no-show (real scheduler, real time) | PASS | auto-cancelled ≈6.3 min after booking; refund Pending ₹400; one farmer notice |
| pg_cron health | PASS | 21 runs, 0 failures |
| Playwright vs staging builds (admin + app, signed in) | **10/10 PASS** | admin dashboard/Users/Experts + refresh; non-admin refused; farmer feed/profile/Catch Up; **expert1 expert mode + availability**; admin redirected from app |
| Screenshots | — | `appium-results/2026-10-25_staging/` (admin dashboard/experts, user feed/profile/Catch Up, expert Catch Up/availability) |
| Android device scenario on staging | superseded | see "Android staging app" below (opt-in `com.agroconnect.app.staging` build) |
| Post-test integrity | PASS | fixtures restored, 0 double bookings, 0 booking/slot mismatches |

## Android staging app, realtime fix and staging reruns — 2026-10-25

### Android staging app (`com.agroconnect.app.staging`)
Built with `scripts/staging/build-staging-apk.sh` (opt-in `-PagroStaging`; see `supabase/staging/README.md`).
| Check | Result | Notes |
|---|---|---|
| Normal `assembleDebug` unchanged | PASS | `com.agroconnect.app`, 1.0, label AgroConnect, production ref only |
| Staging APK identity + backend | PASS | `com.agroconnect.app.staging`, 1.0-staging, "AgroConnect Staging", staging ref only (script fails otherwise) |
| Emulator (API 36.1): installs next to production | PASS | production `lastUpdateTime` unchanged |
| Emulator: signed-in smoke | **NOT VALID** | the emulator's `system_server` kept raising "isn't responding" dialogs (load avg 24–30, Play Store updates); first run's two passes were false (they only checked the login text was absent). Script hardened; run moved to a physical phone |
| **Physical phone** (Nothing Phone 2, Android 16), `device-smoke.py` | **7/7 PASS** | farmer login → feed → profile → Catch Up lists Dr. Ramesh Expert, no expert tools; session survives force-stop + relaunch; landscape renders signed-in UI, one back press keeps the app in front; expert1 Catch Up in expert mode + Manage Availability; admin signed out with "Administrators must log in via the Admin Panel website"; production app not replaced (1.0, lastUpdateTime 2026-09-16 09:31:07 before and after); no FATAL EXCEPTION; 0 ANR dialogs |
| Screenshots | — | `appium-results/2026-10-25_staging_device/01…08` (staging app only; the production app is never opened) |

The smoke script is safe on a personal phone: it never opens, clears or screenshots the production app, restores the
rotation settings (also on SIGTERM), reads logcat from its start time instead of clearing it, and declines system
"save password" offers.

### Realtime test — root cause and fix
* **Cause:** realtime readiness has two steps. `SUBSCRIBED` (channel join) arrives first; the `postgres_changes` listener
  is confirmed ~1–3 s later by a `system` message (`"Subscribed to PostgreSQL"`; probe: 2.2 s then 4.1 s). The old test
  fired the trigger at `SUBSCRIBED`, so on a cold project the INSERT could land before the listener existed and was
  never delivered → the first-run 20 s timeout.
* **Fix** (`tests/e2e/staging-workflows.test.mjs`): wait for `SUBSCRIBED` (20 s) and then the listener `ok` (20 s),
  each with its own error (`CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` and listener errors are reported, not swallowed); only
  then trigger; event deadline 30 s. On a missed event the error says whether the notification row **was written**,
  separating "not pushed" from "never created" — both still fail. No retry of delivery. The booking is cleaned up in
  `finally`. Sign-in retries once **only** on a network-level `fetch failed`.
* **Reproducibility:** 16 runs today — 15 PASS (1.4–14.8 s), 1 failed before the test body (`sign-in admin: fetch failed`,
  staging health endpoint answered 200 seconds later).

### Staging reruns
| Suite | Run during emulator reboot (network saturated) | Rerun, quiet network |
|---|---|---|
| `npm run test:staging` (anon 5 + api 8 + workflows 8) | 16/21 — the 5 failures were all `fetch failed` / `ConnectTimeoutError` to the Supabase edge (not counted as passes) | **21/21 PASS** |
| Playwright vs staging builds (`E2E_STAGING=1`) | — | **10/10 PASS** |
| Scheduler (pg_cron) no-show | PASS (≈6.2 min) | PASS (≈6.2 min); `cron.job_run_details`: 90 runs, 0 failures |
| Post-run integrity (staging SQL) | — | 15 realtime-test bookings, 0 left open; 0 double bookings; 3 slot/booking "mismatches" are all `Completed` consultations, which keep their slot booked by design |

## Change request 2026-10-25 (`changes.pdf`) + Google sign-in
Item-by-item status: `CHANGE_REQUEST_2026-10-25.md`. Everything below ran against **staging** or locally; production
is unchanged.

| Suite | Result | Notes |
|---|---|---|
| `npm test` (validation 27, regression 14, DB 41 incl. 11 new for `09`) | **PASS** | 09 tests also reproduce the old bug (demote deleted the expert's bookings) and found one real flaw in the first draft: a client could submit an application/resignation already "Approved" (definer trigger saw the owner role) — fixed before applying |
| `09` applied to staging + Edge Function `admin-delete-user` deployed (staging) | done | target re-confirmed with `get_project` before the write |
| `staging-workflows`: expert application → no second request while expert → no self-demotion → leave request → admin reject (expert stays) → new request → admin approve (Farmer, record inactive) | PASS | user3, fixtures restored |
| `staging-workflows`: admin deletes a throwaway signup through the function; non-admin 403; self 400; deleted user cannot sign in; profile gone | PASS | one failure in a full parallel run: staging-api signs user1 out globally, so user1 got 401 not 403 — test now uses user2 |
| Full `npm run test:staging` after the fix | **22/22 PASS** | incl. realtime and the pg_cron no-show (auto-cancelled ≈5.5 min) |
| Playwright vs staging builds | **19/19 PASS** | + Google button message, icons-only bar, ☰ profile menu, Catch Up dates/calendar/times, expert card → profile, own avatar → own profile (temporary post, removed), expert leave dialog, admin ☰ behaviour, Meetings filters/details/review, Remove expert, Reports leave tab |
| Staging APK rebuilt | PASS | `com.agroconnect.app.staging`, staging ref only, deep link `com.agroconnect.app.staging://auth-callback`, `@capacitor/browser` included |
| **Phone** (Nothing Phone 2, Android 16), new staging APK, `device-smoke.py` | **11/11 PASS** | base checks (farmer, session, rotation/back, expert tools, admin refused) + Google button message on Log In/Sign Up, icons-only bar, profile ☰ menu (farmer and expert), Catch Up dates → calendar on Book → date → that day's times (date not editable), expert card → expert profile, own avatar on own post → own profile (temporary post via API, deleted), expert "Leave being an expert" reason dialog (not submitted); production app unchanged (1.0, 2026-09-16 09:31:07); no crash; screenshots `appium-results/2026-10-25_staging_device/10…20` |
| Script fixes during the phone run | — | matcher added a trailing space; Python certificate store missing (API calls now via curl); one lost Log In tap (one retry, stops on any app answer); icon names merged into row text on this WebView. **Incident:** one failure message included the text of the password field (this device exposes it to UI Automator) — the staging fixture password appeared in the tool output once. Fixed: password fields are never read and every message is redacted. Rotating the staging fixture password is recommended |
| Staging after the phone run | clean | 0 leftover test posts, 0 pending leave requests, expert1 still Expert |
| Google sign-in end to end | **not possible yet** | provider disabled on both projects (checked `/auth/v1/settings`); owner setup in `CHANGE_REQUEST_2026-10-25.md` |

## Google sign-in on staging — 2026-10-25 (provider enabled by the owner; production still off)
| Check | Result | Notes |
|---|---|---|
| Provider status (`/auth/v1/settings`) | staging **on**, production **off** | |
| Phone, **existing** Google account (owner picked the account): sign in → Farmer profile → menu without expert tools → force-stop + relaunch keeps session → Log Out → relaunch stays signed out | **7/7 PASS** | no duplicate account: still 1 Google user, new sign-in time |
| Phone, **new** Google account: same 7 checks | **7/7 PASS** | created once, role Farmer, no role in signup metadata, 1 identity, no expert row |
| Self-promotion as each Google user (staging SQL, always rolled back): set role Admin / Expert, insert own experts row, application sent as "Approved", approve own application, `is_admin()` | all **refused**; application stored as Pending; role stays Farmer | nothing kept |
| `handle_new_user` on staging | always Farmer, never reads a role from signup data | |
| Callback handling on the phone: error callback, invalid code, unrelated deep link, no crash | **5/5 PASS** | the invalid-code message is Supabase's raw developer text (PKCE verifier …) — needs a friendly message |
| Installed staging APK | identical to the verified artifact; staging ref only; only the `anon` key | |
| Test tools | staging-anon/api/workflows refuse the production ref; create-test-accounts and device-smoke allow only the staging ref; build script refuses a production ref in the bundle/APK | Playwright has **no** guard of its own (tests whatever build is served on :4173/:4174) |
| Leftover | 1 throwaway `deltest` account from the earlier failed full run (assertion before the delete) | test now deletes in `finally`; account left for owner approval |

## Post media fix + Catch Up meetings — 2026-10-25 (branch `feature/media-fix-catchup-meetings`, staging only)

### Post media
**Reproduced first.** Web: image posts worked (upload 200, image loaded). Emulator (Android 16): image posts worked;
**video posts could not be made** — the Video picker used the camera plugin's photo picker (videos not offered); a photo
picked there was uploaded labelled `video/mp4`, shown as a dead player *above* the card plus the photo. Real videos (web)
showed a player outside the card and a broken `<img>` inside it. Search dropped the media type. Production data was
healthy (1 post, its file exists; 2 orphan uploads from posts that were never created).
| Check | Result |
|---|---|
| `staging-media.test.mjs` (farmer image, expert video, text-only; other user reads them; served bytes + content type; anonymous/other-user listing 0; owner lists/deletes own; strangers cannot write/delete; video bucket rejects images) | **3/3 PASS** |
| Playwright post media (image, video plays — duration > 0 —, no broken `<img>` beside the player, text-only, fake video refused, survives reload) | PASS |
| Emulator: expert picks a real video in the system chooser → validated → posted → **plays in the card** ("Agro 28" frame, 0:01/0:01); image post; both survive force-stop + relaunch | PASS (screenshots in scratch, not committed) |
| Pagination | not applicable: the feed loads all approved posts (no pagination exists) |

### Catch Up meetings (`supabase/proposed/11`, staging)
| Check | Result |
|---|---|
| DB tests 11 (PGlite, real schema, controlled clock): booking notifications once / failed booking notifies nobody; 5-min reminder at 2:55:00 not 2:54:59, both participants, once, never for cancelled/completed; join 2:54:59 denied, 2:55:00 + 3:00 allowed, slot end denied; other farmer/expert, anon, cancelled, completed, banned denied; client cannot pass a time; room only for participants; completion not before start; one review; no-show still cancels + refunds | **9/9 PASS** (`npm run test:db` 50/50) |
| `staging-catchup.test.mjs` — **real time, real pg_cron**: book → expert + farmer notified once (exact wording) → duplicate/race send nothing → no invented link → join "Too early" → stranger refused → scheduler 5-min reminder to both → both join, same room → completion refused before start, allowed after → one review request → one review | **2/2 PASS** (7.8 min) |
| pg_cron | 1 job (no duplicate), 60 runs/hour, 0 failures |
| Playwright Catch Up: disabled "Join opens … (in …)" counting down without reload; Join inside the window → room says "Video not connected" (no fake audio/camera) → Leave explains why not completed; booking confirmation in Notifications | **2/2 PASS** |
| Emulator: Upcoming showed "Join Meeting" / "Join opens 1:51 PM (in 0m 15s)" → second button opened by itself; farmer joined → honest room → left ("stays open until the expert joins"); the no-show scheduler then cancelled that booking (expert never joined) with refund Pending; expert joined the other one → left after start → **Completed**, room Completed, 1 review request | PASS |
| Review submitted from the emulator UI | **not done** (History list long with test data; covered by DB + staging tests) |

### Problems found while testing and fixed
* **"Isn't responding" on Android** (owner saw it on the emulator): reproduced by scrolling Catch Up → History. Causes
  in the app: (1) a `backdrop-filter: blur` bar over the scrolling list — with it gone, the same scroll test went from
  1 ANR per run to 0 (twice, incl. 45 entries); (2) my first Join-button version re-rendered the whole 2,600-line page
  every second (the existing regression test caught it) — now only the button ticks. History is also paged (15).
  Separately the emulator itself is overloaded (load average up to 42, System UI and launcher not responding with
  AgroConnect not running) — those dialogs are not the app.
* History sorted by date only → also by time.
* Tests that expected exactly one notification per booking (now booking notices exist) and a Google test written
  while the provider was off — updated; Playwright **22/22**, staging-api lifecycle PASS.

### Physical phone (Nothing Phone 2, Android 16) — final, after the emulator became unusable
`device-smoke.py` **14/14 PASS in one run**, 0 ANR, 0 crash, production app unchanged (1.0, 2026-09-16 09:31:07):
base checks; Google button (Google is now **on** in staging: the browser opens, the script never reads or captures it);
icons-only bar / profile menu / Catch Up calendar; own avatar → own profile; expert leave dialog; **image + video
posts in the feed card**; **Catch Up**: "Join opens 3:44 pm (in 0m 41s)" disabled → the 5-minute reminder arrived live
in the app at 3:44 → button switched to "Join Meeting" by itself → honest room ("Video not connected") → leave;
**own post shows no "Connect", also after a relaunch**. Video playback checked separately: tap → frame "Agro 19" playing.
Screenshots 23–30 in `appium-results/2026-10-25_staging_device/`.

Fixed from the phone screenshots: meeting room title under the status bar (safe-area padding); "Connect" on the user's
own posts after a relaunch (feed read the user id with a network call that had not answered yet — now from the saved
session, and the button is hidden until the viewer is known). Final suites after these fixes: `npm test` 27 + 14 + 50,
`npm run test:staging` **27/27**, Playwright **22/22**.

**Incidents (my test scripts, now fixed):** (1) the first phone run's Google check failed while the provider was on and
its error text + failure screenshot contained the owner's Google account chooser (one account name and address) — the
screenshot was deleted before any commit, the log scrubbed, and the script now reads only the app's own screen and never
captures the browser. (2) Earlier, the emulator's "isn't responding" dialogs: partly the app (blur bar over History,
fixed), partly the emulator itself (load average 42 after a clean reboot with System UI not responding).

## Account recovery, video, push + release audit — 2026-10-25 (branch `feature/recovery-video-push`, staging only)

No phone and no emulator were used for this round (owner: phone not connected, emulator broken). **Nothing below was run
on a device.** Production was not written to.

| Suite | Result | Notes |
|---|---|---|
| `npm test` — validation | **27/27 PASS** | |
| `npm test` — regression + unit (incl. 8 MOCKED Daily/FCM provider tests, 1 push-tap test) | **23/23 PASS** | AUD-013/014 updated: join now goes through the `video-room-token` function, which calls `join_consultation` as the caller |
| `npm run test:db` (PGlite, real schema, 01–13) | **60/60 PASS** | incl. 10 new for 12/13 |
| `npm run test:staging` (now 7 files, run one file at a time — they share fixture accounts) | **37/38 in the full run; the 1 failure fixed and its file re-run 9/9 PASS** | failure was a test-isolation bug (two tests created a slot in the same minute for the same expert → `unique_expert_slot`); older Catch Up tests updated: only the expert ends a consultation (12) |
| — `staging-auth` (reset request for unknown/malformed address, fake codes, change password: wrong/same password refused, old password dead, other device signed out, role unchanged) | 6/6 PASS | throwaway account deleted |
| — `staging-video-push` (401/403/409/400; both participants pass; `video_not_configured` with no room/token; devices own-only; outbox; dispatcher secret; 503 without FCM) | 5/5 PASS | provider NOT configured — no real video/push |
| Playwright, E2E_STAGING=1 against fresh staging builds (global guard: bundles contain the staging ref only) | **29/29 PASS** | 3 use MOCKED responses and say so: Google-only identities, video provider down, room that cannot connect |
| Production web/admin builds | PASS | production ref only, no push flag |
| Staging APK build | PASS | camera/mic/notification permissions + push plugin; push off (no `google-services.json`) |

**BLOCKED / device-required (not run, not counted as passed):** real Daily video call between two devices (no
`DAILY_API_KEY`); push delivery to a closed phone and notification-tap routing (no Firebase project, no `pg_net`/cron);
password-reset e-mail opened on the phone (needs the owner's inbox); camera/microphone permission prompts on Android.

## Final Catch Up pass — Google Meet + DEMO payment — 2026-10-25 (branch `feature/meet-demo-payment`, staging only)

No phone and no emulator were used (owner: phone not connected, emulator broken). Nothing below ran on a device.
Production was only read (slot fees: all ₹500, valid); nothing was written there.

| Suite | Result | Notes |
|---|---|---|
| `npm test` — validation | **27/27 PASS** | |
| `npm test` — regression + unit | **22/22 PASS** | new: Meet link parsing (client), no Daily/payment SDK in package/app, manifest without camera/mic; 4 FCM tests are MOCKED |
| `npm run test:db` (PGlite, real schema, 01–14) | **74/74 PASS** | 14 new for migration 14: fee from slot, double tap/retry idempotent, two-farmer race → one booking, cancel/expiry/ownership, no client writes or skipping the checkout, fee changed, invalid fee/own/past slot/inactive expert, link validation (15 bad inputs), link permissions + notify-once + push without link, join window + link, completion rules, scheduler (no link → cancel with demo refund; link → closed after 24 h as `slot_ended`), reviews (own/once/≤1000/rating/cannot move), re-runnable |
| `npm run test:staging` (7 files, one at a time) | **41/42 in the full run; the 1 failure fixed and its file re-run 9/9 PASS** | failure = test set-up collision (`unique_expert_slot`, two files used the same minute for the same expert); helper now takes the next free minute |
| — Scenario A (real time, real pg_cron): demo checkout → both notified once → expert saves Meet link (farmer refused, stranger refused, lookalike refused, retry changes nothing) → farmer told once (no link in text) → too early → 5-min reminder → both join, link returned → expert completes (`completion_source = expert`) → one review | PASS | `staging-catchup` |
| — Scenarios B, C, D, E, F, G + join window + retired function + push | 9/9 PASS | `staging-meet-payment-push` |
| Playwright, E2E_STAGING=1, fresh staging builds | **30/30 PASS** | new: Pay & Book → checkout (fee ₹450.00 from the server, no input fields, cancel books nothing, confirm → processing → success → one booking, demo_payments `cancelled` + `succeeded`, **no request to any host except the app, staging Supabase and Google Fonts**); MOCKED network cut on confirm → no false success → Try again books once; slot taken by another farmer during checkout → clear message → slot no longer offered; expert link editor (3 invalid links refused, valid saved/normalised, retry "already saved", kept after reload, farmer notified once); farmer "Waiting for link" → "link ready" → Join opens a new tab at the Meet URL (a local stand-in page — Google is never contacted) and no in-app call screen |
| Lint (oxlint, both apps) | 0 errors, 52 warnings | same count as before this pass |
| Type check | not applicable / not run | the apps are JavaScript; Edge Functions are TypeScript but `deno` is not installed here |
| Builds | PASS | app + admin production (production ref only, no staging ref, no service_role, no Daily/payment SDK); app + admin staging (staging ref only); staging APK `com.agroconnect.app.staging` (permissions: INTERNET, POST_NOTIFICATIONS + FCM's own; **no CAMERA/RECORD_AUDIO**; plugins incl. `@capacitor/app-launcher`; push off — no `google-services.json`) |
| Secret scan | PASS | only tracked key = production **anon** key (public by design); no `.env`, keystore, service account or `google-services.json` tracked |
| Visual check (390×844) | PASS | booking dialog (fee line, demo note) and checkout (banner, summary, buttons) screenshots reviewed; not committed |

**Not run / device-required (not counted as passed):** checkout and Join on the Android phone (Meet app hand-off via
App Launcher), push delivery to a closed phone, the reset e-mail link on the phone. `device-smoke.py` was updated for
these (new checks: demo checkout, Meet hand-off — the script never reads or captures the other app).

**Staging leftovers:** 26 free future slots of the synthetic expert from today's runs (their cancelled test bookings
keep them via the foreign key); no open test bookings.
