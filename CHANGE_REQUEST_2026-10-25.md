# Change request 2026-10-25 (`changes.pdf`) + Google sign-in — status

"Before" is what this branch had when the PDF was received (the PDF screenshots come from an older production APK).
"Verified" says where it was checked (all app items were also checked on a physical phone, 11/11, see TEST_RESULTS.md); nothing here is in production yet (see "Release" at the end).

## Admin dashboard

| # | Request | Before | Now | Verified |
|---|---|---|---|---|
| A1 | Delete user (user, expert, everything) on click | **Broken**: the button deleted from `profiles` in the browser; `profiles` has no delete policy, so 0 rows were removed with no error, and the login account was never touched | One confirmed **Delete permanently** → Edge Function `admin-delete-user` (admin-only, service key server-side) deletes the login account; profile and all their data cascade. Blocks deleting yourself or another admin; audit-logged. `09` fixes the foreign keys that blocked deletes | staging: function test (non-admin 403, self 400, deleted user cannot sign in, profile gone) |
| A2 | Experts page: remove an expert → normal user, no green tick, normal Catch Up | Missing (no action) | **Remove expert** button (confirm). `09`'s `demote_expert`: role → Farmer, expert record inactive, upcoming meetings cancelled with full refund Pending + farmers notified, open slots removed; history and reviews kept (the old function deleted them all) | DB tests; staging; Playwright (button present) |
| A3 | ☰ disappears while the menu is open; shown only when hidden | ☰ always shown | ☰ only when the menu is hidden; open menu has its own hide button | Playwright |
| A4 | Remove "jacob" spam; one expert request per user | Production data is already clean (1 application each, checked read-only). The one-pending rule is in `04`, never applied to production | List shows one row per user (latest). `09`: no new request while one is pending **or** while already an active expert; status always starts Pending | DB tests; staging |
| A5 | Meetings: All / Upcoming / History filters; click → details with the stars and review | Flat table | Filter tabs with counts (Upcoming = Booked and not started, soonest first; History = everything else); click a row → details: both people, date/time, status, topic, cancellation reason, refund, expert joined, **farmer's rating and review** | Playwright |
| A6 | Remove Appointments and Reviews from the menu | Present | Removed (pages deleted; covered by Meetings) | Playwright |
| A7 | Expert's "leave" request with reason appears in Reports for approval | No such flow (old app button switched the role directly) | Reports → **Expert leave requests** tab: reason, Approve (removes badge and expert tools) / Reject (with a note to the expert) | DB tests; staging |

## User and expert app

| # | Request | Before | Now | Verified |
|---|---|---|---|---|
| U1 | Bottom bar: icons only | Icons + text | Icons only (labels kept for screen readers) | Playwright |
| U2 | Profile: Log out, Become a Verified Expert, Become a Seller, Settings inside the ☰ (top right) | Buttons on the page, gear icon top right | ☰ top right opens a menu with Settings, Become a Verified Expert (or its status), Become a Seller (or status), Log Out. Page keeps only **Edit Profile** | Playwright |
| U3 | Expert ☰: also "Leave being an expert" → reason → admin approves in Reports | Old button changed role directly, no reason sent, admin never asked | Same menu + **Leave being an expert** → reason (required) → request to admin; "waiting for approval" shown until decided. Experts can no longer demote themselves (`09`) | Playwright (dialog); staging (full loop) |
| U4 | Tapping my own avatar on a post → my profile (not "connect with yourself") | Bug: own id opened the "other user" view | Own id always opens the Profile tab | Playwright with a temporary post |
| U5 | Catch Up: only experts with dates; calendar opens on Book; date → that day's times; user types only the issue | Mostly there (calendar on Book, date from calendar); list used a 7-day window | Experts listed only with an open future slot, their next dates shown on the card; date fixed from the calendar; only that day's open future times; only the issue is typed | Playwright |
| U6 | Calendar with no dates (2nd screenshot) | Calendar opened on the current month even when the expert's slots were later, and past/booked times were offered | Calendar opens on the first month with an open slot; past and booked slots are never offered | Playwright |
| U7 | Tap any user's/expert's picture anywhere → their profile | Feed/search/notifications only | Also Catch Up (expert cards, meetings, history, reviews, booking dialog) and Chat (list and conversation) | Playwright (expert card) |
| U8 | Expert's Catch Up not visible | Production: "Dr. Ramesh Expert" has role Expert but **no expert record**, so the farmer view appeared (fixture repair `06` never applied to production) | App now says the expert record is missing instead of silently showing the farmer page. Data fix needs `06`-style repair in production (owner decision) | staging |
| — | Green tick on posts for experts | Only shown for the legacy roles Agronomist/Distributor | Also for Expert | build |

## Google sign-in (Log In and Sign Up)

Code done: "Continue with Google" on both screens (first use creates a Farmer account; the profile is created by the
existing signup trigger). Web: redirect and back. Android: opens the phone's browser (Google blocks sign-in inside app
WebViews) and returns through `<app id>://auth-callback` (`com.agroconnect.app.staging://auth-callback` for the staging
app, `com.agroconnect.app://auth-callback` for production). PKCE code exchange; no tokens in URLs.

**Not working yet — needs the owner (cannot be done through the tools available here):**
1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID, type **Web application**; Authorized
   redirect URI `https://<project-ref>.supabase.co/auth/v1/callback` (one client per Supabase project, or add both URIs).
2. Supabase Dashboard → Authentication → Sign In / Providers → **Google**: enable, paste the client ID and secret.
3. Supabase Dashboard → Authentication → URL Configuration → Redirect URLs: add
   `com.agroconnect.app.staging://auth-callback` (staging) or `com.agroconnect.app://auth-callback` (production), plus
   the web app's address.
Until then the button says "Google sign-in is not available yet" (checked against the project's settings) instead of
showing a raw error — verified on staging with Playwright.

## Release (owner approval needed)
Production still lacks `04`, `05` (held for the coordinated app release) and now `09` + the `admin-delete-user`
function. The app in this branch needs all of them. Order: backup → `04` → `05` → `09` → deploy function → new APK and
admin build. Optional: `06`-style repair for "Dr. Ramesh Expert" (expert record missing).

## Follow-up 2026-10-25 — recovery, video, push (staging only)
"Forgot Password?" on the login screen now works (it was a dead link), Change Password asks for and checks the current
password, Catch Up meetings have a real video room (Daily; waiting for the owner's Daily key) and the expert ends the
consultation, and push notifications are prepared (waiting for Firebase). Production release: `RELEASE_CHECKLIST.md`.

## Final pass 2026-10-25 — Google Meet + demo payment (staging only)
Video calls inside the app (Daily) were replaced by Google Meet links that the expert pastes; "Pay & Book" opens a
clearly labelled demo checkout (no real money, no payment provider). Details and production order:
`RELEASE_CHECKLIST.md`; tests: `TEST_RESULTS.md`.

## Final pricing pass 2026-10-25 (staging only)
Prices are now consistent: the expert sets one fee, farmers see it once and pay exactly it, bookings keep the agreed amount, 2 % commission
is recorded per booking, and the admin website has a Consultations page for bookings, commission and reviews. The "demo" labels were
removed from the user screens (the payment is still simulated; internal records and admin say so). See `RELEASE_CHECKLIST.md`.
