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
| Catch Up shows a newly saved link without a manual refresh | three-client test (phone saves, web farmer watching) | link appears on the open screen | appeared after about 6.5 s, no reload | PASS (2026-10-29, phone) |
| Joining and leaving the Meet call | three-client test: farmer Join; Meet tab closed | Join opens exactly the saved URL; Catch Up still there after leaving | same URL; card still shown | PASS for the app side. Signing in to a real Meet call was not tested; the test used a stand-in page. |
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
| Same feed post on 3 clients at once (web, phone, admin) | three-client test | post appears on all 3 | web about 1 s; phone 3.5–6 s, no reload; admin Posts page lists it | PASS (2026-10-29, phone) |
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

## Three-client run on the phone (2026-10-29)

`ANDROID_SERIAL=cda20634 node scripts/staging/three-client-test.mjs`

Setup:
- **Farmer:** web app on localhost:4174, `dist-staging`.
- **Expert:** Nothing Phone (2), staging app 1.2-staging.
- **Admin:** localhost:4173, `dist-staging`.

Screenshots are in `appium-results/2026-10-29_three_clients/`.

| Check | Result |
|---|---|
| Sign-in on all three clients | PASS |
| Feed: the farmer's post reaches the phone without a reload | PASS (3.5–6.2 s) |
| Feed: the admin Posts page lists the post | PASS |
| Chat: farmer (web) to expert (phone, conversation open) | PASS (about 2.6 s) |
| Chat: expert reply from the phone to the farmer (web) | PASS (about 4 s) |
| Meet: the expert saves the link on the phone | PASS |
| Meet: the farmer's open Catch Up shows it without a reload | PASS (about 6.5 s) |
| Meet: the stored URL is the same one the expert typed | PASS |
| Meet: Join opens that same URL; the farmer leaves and is back in Catch Up | PASS |
| Announcement: the expert submits on the phone; the admin sees it waiting | PASS |
| Announcement: after approval, the farmer gets the pop-up | PASS on the final run (1.6 s). Missed once in 3 approved runs: it did not appear within 20 s, and the cause was not found. |
| Announcement: the expert is told it was approved | PASS |
| Admin: the booking is listed with the link "Saved", and the detail shows the issue | PASS |
| Admin: no "Resume missing" on the Experts page (staging) | PASS (0 shown) |

The final run passed 17/17. Earlier runs failed only on the script's own screen-matching and timing, which were fixed.

**Not covered:**
- signing in to a real Google Meet call;
- joining from the phone (it opens the Google Meet app);
- the admin opening a resume PDF (the "View Resume" button was not on the tab the script opened);
- the production app (all data was staging).

**Clean-up:** the test removes its own post, booking and slot, and the announcement it created. Approved announcements
also reach the other staging farmers, so the script prints a delete statement for those notifications, which must be
run afterwards. Leftovers from earlier runs were removed on staging: 7 test posts, and 14 announcement notifications,
4 of which had gone to 2 staging accounts that are not test accounts. The chat messages are kept.

## 30-post content rollout (2026-10-29)

| Test | Result |
|---|---|
| PDF extraction: 30 posts, markers match, unique titles and images, full descriptions | PASS (`demo-posts-feed.test.mjs`, manifest test) |
| All 30 image URLs reachable (HTTP 200 image/jpeg), also with the app's addresses as referrer | PASS (curl, 2026-10-29) |
| All 30 visible to each of the 4 districts, local first, through pagination, no duplicates | PASS in PGlite on the production schema |
| Older local post ranks above a newer non-local post | PASS in PGlite |
| No district / district with no local posts still sees all the other posts | PASS in PGlite |
| Production import | NOT RUN: production has 0 designated demo accounts; needs owner approval and a production service key |
| 30 posts visible in the production UI and the Android app | BLOCKED until the import runs |
