# AgroConnect feature matrix — 2026-10-25

Evidence-based status of every module. **Code existing is not counted as working**: a cell says PASS only where a test
or a recorded manual run exercised it, and says which environment.

Legend — **PASS** exercised and correct · **FAIL** exercised and wrong · **UNTESTED** code exists, nothing exercised it ·
**STUB** UI that does not do the real thing · **—** not applicable / no UI there · **NONE** no code at all.
Env — **STG** staging project `ahkgvuewgbjyahbiehrx` (real Supabase) · **LOCAL** PGlite copy of the real schema
(`npm run test:db`) or local unit tests · **PROD-RO** read-only checks on production.
Surfaces — **Web** app build in Chrome (Playwright) · **Android** staging APK on a physical phone (Nothing Phone 2,
Android 16, `device-smoke.py` 7/7 on 2026-10-25, screenshots `appium-results/2026-10-25_staging_device/`) and/or the emulator · **Admin** admin dashboard (Playwright).

Test sources: `npm run test:db` (30), `npm test` (validation 27, regression 14), `tests/e2e/staging-anon` (5),
`staging-api` (8), `staging-workflows` (8 incl. realtime + pg_cron), Playwright `app.spec`/`admin.spec` against staging
builds (10), `scripts/staging/device-smoke.py` on the phone.

## Accounts and roles

| Feature | Code | Web | Android | Admin | Env | Evidence | Issues / failures | Next action |
|---|---|---|---|---|---|---|---|---|
| Email/password login | yes | PASS | PASS (phone; emulator earlier) | PASS | STG | app.spec, admin.spec, device-smoke | — | — |
| Wrong credentials rejected | yes | PASS | UNTESTED | PASS | STG | app.spec, admin.spec | — | add to device smoke |
| Registration + validation | yes | PASS (validation only) | UNTESTED | — | STG + LOCAL | app.spec (form), signup API used to create fixtures; DB test: signup cannot pick `Admin` | live signup was exercised via API, not via the form | form signup E2E on staging (needs disposable address strategy) |
| Session persistence | yes | PASS (reload) | PASS (force-stop + relaunch, phone) | PASS (refresh) | STG | app.spec, admin.spec, device-smoke | — | — |
| "Remember me" | **checkbox only** | STUB | STUB | — | — | `Login.jsx`: unbound checkbox; sessions always persist | misleading control | wire it or remove it |
| Sign-out ends access | yes | UNTESTED (UI) | UNTESTED | UNTESTED | STG | staging-api (API level) | — | UI sign-out check |
| Google sign-in / sign-up | yes (2026-10-25) | PASS (button; "not available yet" while the provider is off) | code + deep link in staging APK; untested end to end | — | STG | Playwright; APK manifest has `com.agroconnect.app.staging://auth-callback` | Google provider is **off** on staging and production | owner: Google OAuth client + enable provider + redirect URLs (CHANGE_REQUEST_2026-10-25.md) |
| Password reset | **link only** | STUB | STUB (seen on phone) | — | — | `Login.jsx`: "Forgot Password?" is a `<span>` with no handler; no reset code anywhere | users cannot recover accounts; dead link | implement (MODULE_PLAN A, priority) |
| Role separation (farmer / expert / admin) | yes | PASS | PASS (phone) | PASS | STG + LOCAL | app.spec, admin.spec, staging-api (no self-promotion), DB tests | — | — |
| Admin blocked from mobile app | yes | PASS | PASS (phone) | — | STG | app.spec, device-smoke screenshot 08 | after the refusal the admin's email and (masked) password stay in the form | clear the form on refusal (minor) |
| Ban / unban | yes | — | — | API PASS, UI UNTESTED | STG + LOCAL | staging-workflows (ban), DB tests | — | Users-page ban click E2E |
| Delete user (full) | yes (2026-10-25) | — | — | API PASS (Edge Function) | STG | staging-workflows: admin-only, self refused, account + profile gone | production needs `09` + function deploy | release |

## Feed, posts, profiles, search

| Feature | Code | Web | Android | Admin | Env | Evidence | Issues / failures | Next action |
|---|---|---|---|---|---|---|---|---|
| Feed renders | yes | PASS | PASS (phone) | — | STG | app.spec, device-smoke screenshots | staging has no posts, so only the empty state is exercised | seed synthetic posts on staging |
| Create post: text / image / video | yes (video fixed 2026-10-25) | PASS (image, video, text-only, bad file refused, reload) | PASS emulator (image via photo picker; video via system chooser, plays in card; survives relaunch) | — | STG | staging-media (3), Playwright post media; emulator screenshots | **Root cause:** Android video picker returned photos only and labelled them video/mp4; player drawn outside the card; card drew videos as `<img>`. One attachment per post (schema) | phone check |
| Post media storage access | yes (10, staging) | — | — | — | STG | staging-media: anonymous/other-user listing 0, owner can list/delete, strangers cannot write/delete, video bucket rejects images | public buckets: anyone with a file's URL can view it (existing design; paths unguessable) | production needs `10` |
| Likes / comments | yes | UNTESTED | UNTESTED | — | — | none (RLS covered by DB tests) | — | staging E2E |
| Follow / followers | yes | UNTESTED | UNTESTED | — | — | none | — | staging E2E |
| Own profile view | yes | PASS | PASS (phone) | — | STG | app.spec, device-smoke | — | — |
| Edit profile + avatar upload | yes | UNTESTED (UI) | UNTESTED | — | STG | staging-api: profile edit persists (API) | avatar upload never exercised | UI + storage E2E |
| View another user's profile | yes | UNTESTED | UNTESTED | PASS (modal opens via Users) | STG | admin.spec visits Users | — | — |
| Search (users, posts, communities) | yes | UNTESTED | UNTESTED | — | — | none | — | staging E2E with seeded data |
| Communities | page exists, **not routed** | — | — | — | — | `Community.jsx` is never imported by `App.jsx` | unreachable code; tables exist | product decision: route or remove (Task 4) |
| News / announcements | admin page exists, **not routed**; no app UI | — | — | — | — | `admin/News.jsx` not in the admin switch; app never reads `news` | unreachable | product decision |
| Banners | table only | NONE | NONE | NONE | — | `banners` not referenced | — | — |

## Experts and consultations

| Feature | Code | Web | Android | Admin | Env | Evidence | Issues / failures | Next action |
|---|---|---|---|---|---|---|---|---|
| Expert directory (Catch Up) | yes | PASS | PASS (phone) | — | STG | app.spec, device-smoke | — | — |
| Expert application (apply → approve/reject) | yes | UNTESTED (UI) | UNTESTED | API PASS; one row per user | STG + LOCAL | staging-workflows, DB tests (09: one open request, no request while expert) | — | UI E2E: apply as user, approve in admin |
| Remove expert / leave expert mode | yes (2026-10-25) | PASS (menu + dialog) | UNTESTED on device | API PASS; Remove button + Reports tab PASS | STG + LOCAL | DB tests 09; staging-workflows (request → reject → request → approve); Playwright | production needs `09` | phone test |
| Expert availability editor | yes | PASS | PASS (phone, view only) | — | STG | app.spec, device-smoke | — | — |
| Booking a slot + notifications | yes (11, staging) | PASS (confirmation shown in Notifications) | — | — | STG + LOCAL | DB tests 11; staging-catchup real time: expert "New consultation booked! …", farmer "Your consultation with … is booked …", once; duplicate submit / race / past / empty issue notify nobody | in-app only — no push (no FCM) | production needs `04`,`05`,`09`,`11` |
| Cancel booking + refund flag | yes | UNTESTED (UI) | UNTESTED | API PASS | STG | staging-api (refund Pending, slot freed), admin cancel RPC | refunds are only a status; no money moves | payments module (Task 4) |
| Join window / completion / review | yes (11, staging) | PASS (disabled "Join opens …" with live countdown; Join inside window) | PASS emulator (button opened by itself at T−5 min; farmer + expert joined; completion after start; review request) | — | STG + LOCAL | DB tests 11 (2:54:59 deny, 2:55:00/3:00 allow, slot end deny, strangers/cancelled/completed/banned deny, no client clock); staging-catchup real time | window ends at slot end; completion needs start reached + expert joined | — |
| Scheduler: reminders 24 h / day-of / 30 min / 10 min (expert) / **5 min (both)**, no-show | yes (server) | — | — | — | STG | DB tests (controlled clock); staging-catchup: real pg_cron sent the 5-min reminder to both, once; 60/60 runs ok | one existing job, flag-claimed, retries safe | production needs `05`+`11` |
| Video consultation | superseded 2026-10-25 | — | — | — | — | no in-app video any more (`MeetingRoom.jsx` and Daily removed) | — | see "Consultations in Google Meet" below |
| Admin: meetings (filters, details, review, join times) | yes | — | — | PASS | STG | Playwright (All/Upcoming/History, details dialog with review); staging-catchup (admin reads status, both join times, review) | Appointments/Reviews pages removed (merged) | — |
| Admin: reviews | merged into Meetings details | — | — | PASS | STG | Playwright | — | — |

## Messaging and notifications

| Feature | Code | Web | Android | Admin | Env | Evidence | Issues / failures | Next action |
|---|---|---|---|---|---|---|---|---|
| 1:1 chat (conversations, messages, realtime) | yes | UNTESTED | UNTESTED | — | — | none; RLS reviewed in audit only | — | staging E2E: two users exchange messages |
| In-app notifications (realtime) | yes | PASS (booking confirmation visible in Notifications) | PASS emulator | — | STG | staging-workflows realtime; staging-catchup (booking + 5-min reminder rows delivered); Playwright | in-app only | push = module B |
| Push notifications (FCM) | yes (staging) | — | NOT TESTED (no Firebase) | — | STG + LOCAL | DB tests 13; staging: devices own-only, outbox gets server notices once, client notices never, dispatcher refuses without secret, 503 without FCM; mocked FCM unit tests | **no delivery verified** — no Firebase project / scheduler call | owner: Firebase + approve pg_net/cron; phone test |
| Consultations in Google Meet (link per booking) | yes (staging) | PASS (expert saves/updates link, invalid links refused, farmer "link ready", Join opens Meet in a new tab — stand-in page, Google not contacted) | NOT TESTED (phone not connected) | Admin shows "Google Meet link: saved / not added" | STG + LOCAL | DB 14 tests; staging-meet-payment-push; staging-catchup real-time; Playwright | no attendance data (external service) | phone: Meet app hand-off |
| Checkout (simulated payment, no demo wording on screen) | yes (staging) | PASS (one price: expert card = checkout = booking history; stale fee → new amount re-confirmed; cancel; MOCKED network cut; slot conflict; no payment host contacted) | PHONE: earlier version passed, final version pending | Consultations page: fee / 2 % commission / expert share per booking | STG + LOCAL | DB 15 tests (rounding, snapshot immutability, races); staging scenarios; Playwright | simulated: no money moves | final phone run |
| Expert-set consultation fee | yes (staging) | PASS (invalid values refused, 98 %/2 % preview, saved, farmers see it, farmer cannot change it) | pending | expert fee changes audited (admin function) | STG + LOCAL | migration 15 | in-range but unreasonable fees are the expert's call | phone run |
| Admin Consultations dashboard | yes (staging) | — | — | PASS (summary cards = sum of rows, filters, pagination, detail, read-only accounting) | STG | admin.spec + staging functions | — | review with owner |
| Terms & Conditions (2 % commission) | yes | PASS (Settings → Terms & Conditions) | pending | — | STG | Playwright | no acceptance recorded (none exists) | decide on acceptance tracking |
| Account recovery (forgot / reset / change password) | yes | PASS | NOT TESTED (reset link) | — | STG | staging-auth 6/6; Playwright 4 | e-mailed link not opened on a phone | owner inbox + phone |
| Admin broadcasts | yes | — | — | UNTESTED | LOCAL | DB tests cover `send_broadcast` gating | — | admin E2E |
| Reports / moderation | yes | UNTESTED (report) | UNTESTED | UNTESTED | LOCAL | DB tests (`resolve_report` admin-only) | — | E2E: user reports, admin resolves |

## Marketplace, AI, disease detection, IoT

| Feature | Code | Web | Android | Admin | Env | Evidence | Issues / failures | Next action |
|---|---|---|---|---|---|---|---|---|
| Seller registration | handler exists, **button shows Coming Soon** | STUB | STUB | Sellers page UNTESTED | — | `UserProfile.jsx` `handleBecomeSellerClick` opens Coming Soon | AUD-047 RLS gap on marketplace tables | Task 4 |
| Products / orders / categories | admin pages exist, **routed to Coming Soon** | NONE | NONE | STUB | — | admin `App.jsx` products/orders/categories → `ComingSoon` | tables exist (`products`, `orders`, `order_items`, `payments`) unused | Task 4 |
| Pea AI assistant | UI only | STUB | STUB | — | — | `PeaAI.jsx` returns canned text after `setTimeout` 1.5 s; `ai_chat_logs` unused | no model behind it | Task 4 |
| Crop disease detection | **table only** | NONE | NONE | NONE | — | `crop_disease_detections` not referenced anywhere | — | Task 4 |
| IoT / sensors | NONE | NONE | NONE | NONE | — | no code, no tables | — | Task 4 (needs hardware decision) |

## Platform

| Feature | Code | Web | Android | Admin | Env | Evidence | Issues / failures | Next action |
|---|---|---|---|---|---|---|---|---|
| No service-role key shipped | — | PASS | PASS | PASS | STG builds | admin.spec scans bundles; build script checks the APK | — | — |
| Staging/production separation | yes | PASS | PASS | PASS | STG | bundles + APK contain only the staging ref; staging APK installs as `com.agroconnect.app.staging` next to production | — | — |
| Rotation / back button | — | — | PASS (phone) | — | STG | device-smoke: landscape renders signed-in UI; one back press keeps the app in front | — | — |
| Admin SPA deep-link refresh | yes | — | — | PASS (vite preview) | LOCAL | admin.spec | Render needs a rewrite rule | configure on Render (owner) |

## Validation, cancellation & refunds, messaging — 2026-10-26 (staging only)
| Feature | Code | Web | Android | Admin | Env | Evidence | Issues / failures | Next action |
|---|---|---|---|---|---|---|---|---|
| Inline form validation (red border + reason under the field, first invalid field focused, no popups) | yes | see TEST_RESULTS §2026-10-26 | PASS (phone, login) | PASS (admin cancel reason) | LOCAL + STG | unit `form-rules.test.mjs`; regression guard: no `alert()` in app pages/components; Playwright login/register checks | Feed keeps one deliberate `confirm()` before deleting a comment | phone check |
| Cancellation terms shown before confirming (server quote) | yes | see TEST_RESULTS | PASS (phone) | — | STG | `consultation_cancellation_quote`; staging-cancel-messaging (quote = result) | — | phone check |
| Farmer ≥ 14 h → full refund; < 14 h → expert ceil(F/2), 2 % kept, rest refunded | yes | — | PASS (phone, < 14 h) | PASS | LOCAL + STG | DB `cancellation.test.mjs`; staging-cancel-messaging | refunds are simulated bookkeeping (`Pending`) | — |
| Expert / admin / no-show → full refund, any time | yes | — | UNTESTED | PASS | LOCAL + STG | same; admin cancel needs a reason, audit-logged | — | — |
| Admin: refund cards, net commission/share, cancellation filter, cancellation detail | yes | — | — | see TEST_RESULTS | STG | admin.spec | — | — |
| Messaging: anyone → anyone; connected-to-each-other or shared booking = normal chat; otherwise message request | yes | see TEST_RESULTS | PASS (phone) | — | LOCAL + STG | DB `messaging.test.mjs` (9); staging-cancel-messaging (2) | each farmer pair can show the request flow on staging only once (conversations are kept) | phone check |
| Requests icon (top right) with blue dot; Accept / Decline / reply-accepts | yes | see TEST_RESULTS | PASS (phone: icon, list, notification → chat, Accept) | — | STG | app.spec message-request test | — | phone check |
| Message notifications + push (no message text in push) | yes | — | UNTESTED | counts only | LOCAL + STG | DB tests; push delivery still needs Firebase | Firebase not configured | owner |
| Skeleton loading + error/Retry (Catch Up lists, Chat, Notifications, Profile, Edit Profile) | yes | see TEST_RESULTS | UNTESTED | — | STG | — | — | phone check |
| Admin Pending Reports / Expert Apps red only when something is pending | yes | — | — | see TEST_RESULTS | STG | admin.spec + regression guard | — | — |

## Launch districts — 2026-10-26 (staging)
| Feature | Code | Web | Android | Admin | Env | Evidence | Issues / failures | Next action |
|---|---|---|---|---|---|---|---|---|
| Registration (fixed: crashed after sign-up on the previous branch) with required district | yes | see TEST_RESULTS | UNTESTED | — | LOCAL + STG | regression test, Playwright register test, DB test (sign-up stores district) | — | phone check |
| District-priority feed (own district first, newest first, pages) | yes | see TEST_RESULTS | UNTESTED | — | LOCAL + STG | DB `districts-feed.test.mjs` (10), staging-districts (4), Playwright | — | phone check |
| Choose-your-district prompt, district in Edit Profile | yes | see TEST_RESULTS | UNTESTED | — | STG | Playwright | — | — |
| Expert discovery: own district first, district filter | yes | UNTESTED | UNTESTED | — | STG | — | — | Playwright / phone |
| Admin: district overview, Users/Posts district filter | yes | — | — | see TEST_RESULTS | STG | admin.spec | — | — |
| No invented locations (Punjab/Ludhiana, fake distances, fake articles) | removed | — | — | — | LOCAL | regression test | — | — |
