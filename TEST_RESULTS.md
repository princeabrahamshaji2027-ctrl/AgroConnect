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
