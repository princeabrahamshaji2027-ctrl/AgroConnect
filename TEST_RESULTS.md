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
| Android device scenario on staging | **BLOCKED** | a staging APK would replace the production app id `com.agroconnect.app`; needs an approved staging app-id variant |
| Post-test integrity | PASS | fixtures restored, 0 double bookings, 0 booking/slot mismatches |
