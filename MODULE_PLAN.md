# New-module plan (dependency-aware) — 2026-10-25

Planning only: nothing here is implemented. Status of what exists is in `FEATURE_MATRIX.md`. Each module lists what it
depends on, what must be decided by the owner before work starts, and how it would be verified on staging
(`ahkgvuewgbjyahbiehrx`) before production. Every module follows the pattern already used for consultations: server-side
SECURITY DEFINER RPCs for state changes, RLS for reads, DB tests on the PGlite copy, then staging E2E, then the
Android staging APK.

## 0. Prerequisites (block everything below)

| # | Item | Why it blocks | Owner action |
|---|---|---|---|
| P1 | Apply `04` + `05` (with pg_cron) to production together with the app release that expects them | new modules build on the server-side lifecycle and reconciled schema; building on drift doubles the work | approve release window |
| P2 | Rotate the exposed production password; enable leaked-password protection | auth is the base of every module | owner, in Supabase dashboard |
| P3 | Fix AUD-047 (marketplace RLS gap) before any marketplace UI is enabled | the tables are already reachable through the API | approve migration |
| P4 | Keep staging in step: every migration goes to staging first, parity fingerprint must match afterwards | evidence for every module comes from staging | — (process) |
| P5 | Server-side secret store for third-party keys (Supabase Edge Functions + secrets) | AI, payments, push and video all need keys that must never ship in the APK | enable Edge Functions on both projects |

## 1. Dependency graph

```
P1..P5
 ├─ A. Account recovery (password reset, real or removed Google button)
 ├─ B. Push notifications (FCM) ───────────────┐
 │                                             ├─ E. Real video consultations (provider webhook → completion)
 ├─ C. Payments (provider, server-verified) ───┤
 │        └─ D. Marketplace (seller → products → orders) ─ uses B for order updates
 ├─ F. AI assistant (server proxy, logging to ai_chat_logs)
 │        └─ G. Crop disease detection (image upload → model → crop_disease_detections) ─ can hand off to experts (existing bookings)
 └─ H. IoT sensors (device registry, ingestion, alerts) ─ uses B for alerts, F/G optional for advice
 Product decisions, no technical dependency: Communities (route or delete), News (route or delete)
```

## 2. Modules, in recommended order

### A. Account recovery — small, high value
* **Depends on:** P2. **Decide:** keep or remove Google sign-in; email sender (Supabase default mailer is rate-limited,
  seen on staging) → configure SMTP.
* **Scope:** "Forgot password" → `resetPasswordForEmail` → deep link into the app (Capacitor App URL listener) →
  update password. Google: either implement OAuth with an Android client ID, or hide the button now.
* **Verify:** staging E2E with a synthetic mailbox the owner controls; deep link on the staging APK.

### B. Push notifications — enables C/D/E/H
* **Depends on:** P5. **Decide:** Firebase project (staging and production separate).
* **Scope:** `@capacitor/push-notifications`; `device_tokens` table (RLS: own rows); an Edge Function called by a
  trigger/queue on `notifications` insert. In-app realtime stays as is.
* **Verify:** staging APK on the phone receives a push for a booking cancel (same scenario the realtime test uses).

### C. Payments — required before any real refund or paid booking
* **Depends on:** P1 (refund_status lifecycle exists), P5. **Decide:** provider (e.g. Razorpay for INR), who carries
  fees, refund policy. **Legal/financial sign-off needed.**
* **Scope:** `payments` table already exists, unused. Create order server-side, verify the provider signature in an
  Edge Function webhook, only then mark the booking paid; refunds triggered from the existing `refund_status = Pending`.
  No client ever writes payment state.
* **Verify:** provider test mode on staging only; DB tests for "client cannot mark paid".

### D. Marketplace — largest module
* **Depends on:** P3, C, (B for order updates). **Decide:** what is sold, who ships, commission, seller KYC.
* **Scope:** enable seller application (code exists, button shows Coming Soon), admin seller approval (page exists),
  products/categories CRUD (admin pages exist but are routed to Coming Soon), cart → order → payment (C), order status.
* **Verify:** RLS tests (seller edits only own products, buyers see only own orders), staging E2E end to end.

### E. Real video consultations
* **Depends on:** B (call reminders), existing bookings/join window. **Decide:** provider (Jitsi self-host / Daily /
  Agora / 100ms), recording policy, cost.
* **Scope:** replace the simulated call screen; room tokens minted server-side for the booked pair only; provider
  webhook records attendance into `video_meetings` and drives `complete_consultation` (today: leaving the fake call).
* **Verify:** two devices (phone + emulator) join the same staging booking; non-participant token refused.

### F. AI assistant (Pea AI)
* **Depends on:** P5. **Decide:** model provider, languages, cost cap, safety wording (agronomy advice disclaimer).
* **Scope:** Edge Function proxy (key server-side), per-user rate limit, conversation stored in `ai_chat_logs` (exists,
  unused). Replace the canned `setTimeout` replies.
* **Verify:** staging E2E with a mocked provider + one live smoke call; key absent from APK (existing bundle scan).

### G. Crop disease detection
* **Depends on:** F's server pattern, Storage bucket with owner-only policy (same pattern as the CV bucket).
  **Decide:** model (hosted vision API vs. on-device TFLite), supported crops, accuracy threshold for showing results.
* **Scope:** camera capture (plugin already used by posts) → upload → classify → row in `crop_disease_detections`
  (exists, unused) → "ask an expert" shortcut into existing booking flow.
* **Verify:** labelled sample images on staging; RLS: users see only their detections.

### H. IoT sensors — needs hardware decisions first
* **Depends on:** B (alerts); no tables or code exist. **Decide:** devices, protocol (MQTT/HTTP), who provisions them.
* **Scope:** device registry, per-device ingest keys (never a user JWT), time-series table with retention, threshold
  alerts → notifications/push.
* **Verify:** simulated device posting to staging; ingest key cannot read other farms.

### Product decisions (no build needed to decide)
* **Communities**: page exists but is not routed. Route it (needs E2E + moderation via reports) or delete it.
* **News**: admin page exists but is not routed and the app never reads `news`. Same choice.

## 3. Out of scope until asked
No module above will be implemented without an explicit go-ahead naming it; production changes keep needing separate
approval.

## Next implementation (recommended 2026-10-25): finish A — password reset

**Actual status (checked in code, not assumed):** Google sign-in/sign-up is done and verified on staging (phone, new and
existing accounts). Password reset does **not** exist: `Login.jsx` "Forgot Password?" is a `<span>` without a handler;
no `resetPasswordForEmail`, no recovery screen in the app or the admin site. "Change password" exists
(`PrivacySecurity.jsx`) but never checks the current password it asks for. "Remember me" is an unbound checkbox.

**Requirements**
1. "Forgot Password?" → enter email → always the same neutral confirmation (no "account exists" leak), with the
   Supabase rate-limit error shown politely.
2. The reset email link opens the app (`<applicationId>://auth-callback?next=reset`, the callback already used for
   Google; web: the site origin) → **Set new password** screen (same rules as sign-up, `validatePassword`) → signed in.
3. Expired, reused or other-device links → a friendly message and a way to request a new email (also replaces the raw
   "PKCE code verifier not found …" text seen in the Google error test).
4. Change password checks the current password first (re-sign-in) and, for Google-only accounts, says "Set a password"
   instead of asking for one they never had.

**Files:** `src/pages/Login.jsx` (link → forgot screen), new `src/pages/ForgotPassword.jsx` and
`src/pages/ResetPassword.jsx`, `src/utils/googleAuth.js` → general auth-link handling (`next=reset`, friendly errors),
`src/App.jsx` (route to Reset Password after a recovery link), `src/pages/PrivacySecurity.jsx` (current-password check),
tests in `tests/e2e/app.spec.mjs` + `scripts/staging/device-smoke.py`.
**Database:** none. **Owner config (staging only):** allow `com.agroconnect.app.staging://auth-callback**` (wildcard so
`?next=reset` matches) in Redirect URLs; keep the default mailer for testing (≈2 emails/hour) or add SMTP.

**Staging test plan**
* Unit: link parsing (`code`, `next`, `error`, unrelated links) and error-message mapping.
* Playwright (staging build): forgot screen validates input, shows the same message for a known and an unknown address;
  reset screen rejects weak/mismatched passwords; change password rejects a wrong current password.
* Phone (owner's own address on a staging email account — fixture addresses are not real mailboxes): request → open the
  email on the phone → app opens on Set new password → sign in with the new password; reuse the same link → friendly
  "link expired"; request on phone A, open on another device → friendly message; Google account → "Set a password".
* Regression: full `npm test`, `npm run test:staging`, Playwright, `device-smoke.py`.
