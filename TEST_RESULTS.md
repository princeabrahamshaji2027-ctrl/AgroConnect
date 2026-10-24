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
