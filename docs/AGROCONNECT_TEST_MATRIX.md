# AgroConnect — Test Matrix (2026-10-28)

Only tests that were actually run are marked PASS. BLOCKED means the test could not run here, and the reason is given.
Every automated run used **staging** (`ahkgvuewgbjyahbiehrx`); the scripts refuse the production ref.

## Automated suites

| Suite | Command | Preconditions | Result |
|---|---|---|---|
| Lint, user app | `npm run lint` (oxlint) | none | PASS: 0 errors; only warnings that already existed |
| Lint, admin | `cd admin-dashboard && npm run lint` | none | PASS: 0 errors |
| Unit and validation | first part of `npm test` | none | PASS: 62/62 |
| Database behaviour (PGlite, migrations 01–25) | `npm run test:db` | none | PASS: 142/142 |
| Staging API (RLS, RPCs, Edge Functions, realtime) | `npm run test:staging` | `.env.staging` | PASS: 59/59 (20 min) |
| Browser E2E, app and admin, signed in | `E2E_STAGING=1 npx playwright test` against `dist-staging` builds on :4173/:4174 | `.env.staging`; both apps built with `--mode staging` | PASS: 55/55, 0 skipped (9.7 min) |
| Web build, user app (production) | `npx vite build` | `.env.production` | PASS: bundle references production only |
| Web build, admin (production) | `cd admin-dashboard && npx vite build` | `admin-dashboard/.env` | PASS |
| Android APK, production | `npx cap copy android && ./gradlew assembleDebug` | JDK 17 | PASS: `com.agroconnect.app` 1.2 (3); bundle points to production only |
| Android APK, staging | `scripts/staging/build-staging-apk.sh` | JDK 17 | PASS: `com.agroconnect.app.staging`; bundle points to staging only |

## Requirement → test

| Requirement | Test | Expected | Actual | Result |
|---|---|---|---|---|
| Feed shows all 4 districts, own district first | db `districts-feed` and Playwright "district feed: four districts + pagination" (4 users) | first card is local; every district appears after Load more | as expected for Kannur, Pathanamthitta, Idukki and Kottayam | PASS |
| District with no local posts, user with no district | db "a district with no local posts, and a user with no district, still see every other district" | all other districts are returned | as expected | PASS |
| Pagination has no duplicates | Playwright "Load more appends the next page without repeating a post" | no repeated ids | as expected | PASS |
| No "X Feed First" banner | Playwright districts tests | text count is 0 | 0 | PASS |
| District prompt only without a district | Playwright "a user without a district is asked once" | prompt appears, then disappears after saving | as expected | PASS |
| Experts from every district listed, local first | code change in `Connect.jsx`; staging check through the app | experts without open times still listed, with "No open times yet" | verified in the staging UI (one staging expert) | PASS (single expert on staging; the zero-local case is the same code path) |
| Duplicate header button removed | Playwright app suite (header and bell tests) | one bell, no eco button beside it | as expected | PASS |
| Meet link: only HTTPS Meet, only the booking's expert, persists, farmer sees it | db `meet-and-demo-payment`; staging `staging-meet-payment-push`; Playwright "expert: invalid link refused, valid Google Meet link saved and kept after reload; farmer sees link ready" | invalid link refused; link kept; farmer sees the same URL | as expected | PASS |
| Catch Up shows a newly saved link without a manual refresh | new realtime and visibility reload in `Connect.jsx`; realtime delivery tested by staging "farmer receives a server-created booking notification over realtime" | screen reloads on the `booking` notification | notification delivery passed; on-screen refresh not yet seen on a device | PASS (delivery) / phone check pending |
| Joining and leaving the Meet call | — | opens Google Meet; leaving happens in Meet | — | BLOCKED: needs the phone and a Google account (physical test) |
| Expert announcement: only active experts submit; validation; max 3 pending | db `expert-broadcasts` (9 tests); staging "expert announcements need admin approval" | farmer, banned or inactive experts and anonymous callers refused | as expected | PASS |
| Pending announcement reaches nobody; admin is notified | db and staging | 0 announcement notifications; farmer cannot read it | as expected | PASS |
| Admin approves: delivered once to the chosen audience; recipient can read it | db; staging (experts-only audience) | `recipient_count` matches; one notification each; second review refused | as expected | PASS |
| Admin rejects with a reason; expert told | db; staging; Playwright admin "a pending expert announcement is listed; reject needs a reason" | reason required in the UI; status rejected; note stored | as expected | PASS |
| Expert UI: Send an Announcement | Playwright app "expert1: Send an Announcement validates the form…" | inline errors; toast; listed as "Waiting for admin" | as expected | PASS |
| Admin broadcasts unchanged | db "send_broadcast still delivers immediately as approved" | status approved; only recipients read it | as expected | PASS |
| Resume always a PDF; "Resume missing" never shown on staging | staging "submit-resume (server-side PDF check)"; Playwright "Update Resume (PDF)"; staging data check | non-PDF refused; all 3 staging applications have real PDFs | as expected | PASS (staging) |
| Production resumes | — | — | 3 rows without a valid PDF | BLOCKED: needs owner approval and a production service key |
| Admin workflow (login, users, experts, remove expert with preview, ban, consultations, reports) | Playwright admin suite; staging `staging-admin-roles` | as each test describes | as expected | PASS |
| Chat delivery | staging `staging-cancel-messaging`; Playwright messaging tests | message sent once; request flow | as expected | PASS |
| Production user counts (50 target) | read-only SQL | 50 users | 9 users | FAIL (data): seeding is blocked; see audit §8 |
| Same feed post on 3 clients at once (web, phone, admin) | — | post appears on all 3 | — | BLOCKED: phone test pending (see the checklist below) |
| Release signing | — | — | debug certificate only (CN=Android Debug); no release keystore on this Mac | NOT SIGNED for release |

## Physical demo checklist (to run with the phone)

Use one database for all three clients:
- **Production demo:** the Render admin site, plus the production app on the phone, plus `npm run dev` on localhost
  (production `.env`).
- **Staging demo:** `dist-staging` admin, plus the staging APK, plus `dist-staging` app.

1. **Feed.** The farmer on the web creates a post.
   - It appears on the expert's phone feed with no reload.
   - The admin sees it.
2. **Chat.** The farmer messages the expert; the message appears on the phone at once. Then reply from the phone.
3. **Booking.** The farmer books the expert.
   - On the phone: Catch Up → meeting → paste a `https://meet.google.com/...` link → Save.
   - On the web farmer's open Catch Up screen, the same link appears without a reload. Join opens the same URL.
   - Leave in Meet.
4. **Announcement.** On the phone: ☰ → Send an Announcement.
   - Admin → Broadcasts → Approve & send.
   - The web farmer sees the announcement pop-up.
5. **Admin data.** Check that the bookings, reviews and resume (PDF opens) are shown in the admin.
