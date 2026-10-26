# AgroConnect — implementation prompt: validation, cancellation/refunds, performance, skeletons, messaging, admin, release readiness

You are working in the AgroConnect repository (React 19 + Vite app in `src/`, React + Tailwind admin in `admin-dashboard/src/`,
Capacitor Android in `android/`, Supabase SQL in `supabase/proposed/`, tests in `tests/`). Everything below was found by
reading the code and the STAGING database read-only on 2026-10-26. **Line numbers are from commit `5640f72` on branch
`feature/meet-demo-payment`.** If a line has moved, find it by the quoted code — the quote is authoritative, the number is a hint.

Do the work in the order of the sections. Do not stop after a plan. Do not rebuild unrelated screens.

---------------------------------------------------------------------------------------------------------------------------

## 0. Rules (non-negotiable)

* Supabase **staging** ref `ahkgvuewgbjyahbiehrx` — the only project you may write to. **Production** ref
  `mgreapakfchcxcrauheq` — never write, never migrate, never change settings. Android: staging `com.agroconnect.app.staging`,
  production `com.agroconnect.app`.
* Do not push, merge into `main`, deploy Render, release an APK, change auth settings/credentials, or delete booking/message rows.
* Start with `git status` and `git log --oneline -5`. Expected state: branch `feature/meet-demo-payment`, HEAD `5640f72`,
  one modified file `scripts/staging/device-smoke.py` (keep it — it is a working improvement), untracked screenshots
  `appium-results/2026-10-25_staging_device/34_…42_*.png` (keep). Create branch `feature/validation-cancel-messaging` from HEAD.
* Migrations: write each as a new file `supabase/proposed/NN_name.sql` (next numbers: **16, 17, 18**), re-runnable
  (`create or replace`, `if not exists`, `drop … if exists`), with a header comment (purpose, depends on, rollback). Add each to
  `PROPOSED` in `tests/db/harness.mjs` (pattern: `'15': 'supabase/proposed/15_expert_fee_and_commission.sql',`). Apply to staging
  **only** (Supabase MCP `apply_migration` with `project_id: "ahkgvuewgbjyahbiehrx"`, name `remediation_NN_…`), then verify the
  function bodies on staging equal the file (compare `md5` of `pg_get_functiondef` with comments/whitespace stripped against a
  PGlite run — see `tests/db/harness.mjs`). If you have no Supabase MCP, stop after the local tests and list the files for the owner.
* Facts learned the hard way in this repo — follow them:
  * `public.is_client_request()` is true only inside **SECURITY INVOKER** code. Guard triggers must be INVOKER; inside a
    SECURITY DEFINER function it is always false.
  * `alter type public.notification_type add value 'message'` must be **its own migration** (a new enum value cannot be used in
    the same transaction). Put it in 16, use it from 17.
  * The PGlite DB tests (`npm run test:db`) load the real schema + `supabase/proposed/*`; every new function needs tests there.
  * Staging test files share fixture accounts: they run with `--test-concurrency=1` (`package.json` → `test:staging`). New
    staging files go into that list. Slots of `expert1` are unique per (date, start minute): when creating a slot in a test,
    retry the next minute on Postgres error `23505` (see `freshSlot()` in `tests/e2e/staging-meet-payment-push.test.mjs`).
  * Supabase Auth rate-limits sign-ins per IP: after a full staging run, wait ~7 minutes before a full Playwright run.
  * Never call `book_consultation_slot` from clients (revoked in 14). Bookings in tests: `tests/e2e/demo-booking.mjs` → `demoBook()`.
  * Payments are **simulated** (`demo_payments.transaction_type = 'simulated'`). User screens must not show "demo"/"mock"/
    "no real money" (a regression test in `tests/regression.test.js` enforces this). Admin screens and docs say "simulated".
  * Money is integer paise. Commission = `public._commission_paise(fee, 200)` (round half up), share = fee − commission. The
    `demo_payments` snapshot of a succeeded payment is immutable (trigger `guard_demo_payment_snapshot`) — never update those columns.
* Test commands: `npm test` (validation 27 + regression/unit 22 + DB 86 today), `npm run test:staging` (45 today),
  `E2E_STAGING=1 npx playwright test` (34 today; needs `vite preview` of staging builds on :4173 admin / :4174 app —
  `npx vite build --mode staging --outDir dist-staging` in both apps, then `npx vite preview --port 417x --strictPort --outDir dist-staging`;
  load env with `set -a; . ./.env.staging; set +a`). Lint: `npx oxlint` (0 errors, 52 warnings today — do not add warnings).
  Staging APK: `bash scripts/staging/build-staging-apk.sh`.
* Report test counts exactly as run. Never count a test that did not run or that ran while the machine slept.

---------------------------------------------------------------------------------------------------------------------------

## 1. Decisions the owner must confirm (use these defaults if no answer; write them into the docs as "default, owner to confirm")

| # | Question | Default to implement |
|---|---|---|
| D1 | Refund when the **farmer** cancels ≥ 14 h before start | 50 % of the agreed fee (this is today's rule and is already in `src/pages/Terms.jsx` lines 41–45). Keep it. |
| D2 | Refund when the **expert** cancels ≥ 14 h before start | Today: no refund is recorded at all (`cancel_consultation_booking` expert branch sets none — a gap, the farmer paid). Default: **100 % refund** (the farmer did nothing wrong). Mark as owner decision. |
| D3 | Can the expert cancel inside 14 h? | No (same cutoff as farmers). |
| D4 | Admin cancellation inside 14 h / after start | Allowed only through the admin override function, with a mandatory reason, audit-logged; refund 100 %. |
| D5 | Accounting of a refund | Append-only adjustment row: refund amount R; commission reversal = round-half-up(R × 2 %); expert-share reversal = R − commission reversal. Original snapshot untouched. Net for a 100 % refund = 0. |
| D6 | Who may message whom | Two users may have a conversation if **either follows the other** (`followers` = "Connect") **or** they share a consultation booking (any status, so cancellation/reschedule notes keep working). Banned users cannot send. Admins do **not** read message content. |
| D7 | Max message length | 2000 characters, text only. |

---------------------------------------------------------------------------------------------------------------------------

## 2. Shared inline form validation (no popups for field errors)

### 2.1 Build the shared pieces (new/changed files)

1. **`src/components/InputField.jsx`** (whole file is 50 lines). Add props `error` (string|null), `name`, `onBlur`, `maxLength`,
   `inputRef`, `as` ('input'|'textarea'), `hint`. Render:
   * `aria-invalid={!!error}`, `aria-describedby={error ? errId : hint ? hintId : undefined}` on the `<input>`/`<textarea>`
     (ids from the existing `useId()` at line 15: `${inputId}-err`, `${inputId}-hint`).
   * add class `has-error` to the `.input-container` div (line 22) when `error`.
   * below the container: `{error && <p id={errId} className="field-error" role="alert">{error}</p>}`.
   * keep the password toggle (lines 33–44) unchanged.
2. **`src/components/components.css`**: after `.input-container:focus-within` (line 114) add
   `.input-container.has-error { border-color: var(--error); }` and
   `.field-error { color: var(--error); font-size: 12px; margin: 4px 2px 0; display: flex; gap: 4px; }`
   plus `.field-error::before { content: '⚠'; }` (so the error is not colour-only). Also `.form-message` (form-level, non-blocking)
   with variants `.form-message.error` / `.success` reusing the existing banner style from `src/pages/Login.jsx` line 83.
3. **New `src/utils/useFormValidation.js`**: a hook `useFormValidation(rules)` where `rules = { fieldName: (value, all) => errorString|null }`.
   Returns `{ errors, touched, setTouched(name), validateField(name, value, all), validateAll(values) → boolean, clearError(name), focusFirstError(refs) }`.
   Behaviour: no error shown before blur or submit; on submit validate all, set all touched, focus/scroll (`scrollIntoView({block:'center'})`)
   the first invalid field; editing a field re-validates only that field once it is touched.
4. **New `src/utils/formRules.js`**: field-specific messages (use exactly these strings):
   `required(label)` → `Please enter ${label}.`; email → `Please enter your email address.` / `Enter a valid email address.`
   (wrap `validateEmail` from `src/utils/validation.js` line 83); password → first entry of `validatePassword(...).errors`
   (line 14); confirm → `Passwords do not match.`; meeting description → `Please enter a meeting description.` and
   `Please keep the description under 1000 characters.` (matches `start_demo_checkout` limit);
   slot → `Please select an available time slot.`; date → `Please select a meeting date.`;
   fee → wrap `parseFeeInput` (`src/utils/money.js`) → `Please enter a valid consultation fee.`;
   Meet link → `normalizeMeetLink` (`src/utils/meetLink.js`) → `Please enter a valid Google Meet link.`;
   cancellation reason → `Please enter a cancellation reason.`; review → `Please choose a rating from 1 to 5.` /
   `Please write a short review.` / `Please keep the review under 1000 characters.` (DB limit from migration 14);
   message → `Please type a message.` / `Messages can be up to 2000 characters.`.
5. **Admin**: same pattern in `admin-dashboard/src/components/FormField.jsx` (new; Tailwind: `border-error`, `text-error text-[12px]`)
   and `admin-dashboard/src/utils/useFormValidation.js` (copy of the app hook). Add a small non-blocking toast/banner component
   `admin-dashboard/src/components/InlineNotice.jsx` for server errors (replaces `alert` for non-field errors).

### 2.2 Replace popup / banner validation — exact places

App (`src/`):

| File:line (quote) | Change |
|---|---|
| `pages/Login.jsx:27-29` `if (!cleanUser || !cleanPwd) { setError('Please fill in both…` | Per-field errors on the two `InputField`s (lines 88 and 97): `Please enter your email or username.` / `Please enter your password.`. Keep the banner (line 82) only for auth/network errors from `getErrorMessage`. Do not change sign-in logic. |
| `pages/Register.jsx:73-126` (`setError(nameVal.error)` … `'Please fill in all required location details.'`) | Validate all fields at once; errors on the matching `InputField` (Full Name 187, Username 196, Email 205, Phone 215, Password 225, Confirm 235, Country 268, State 277, District 286, City/Village 295, Detailed Address 325). Banner (line 181) only for `signUpError`. |
| `pages/ForgotPassword.jsx:15-23` | Email error under the field (line 51). Keep the generic success reply. |
| `pages/ResetPassword.jsx:30-37`, fields 62-63 | Password + confirm errors under their fields; `role="alert"` banners (lines 50, 58) only for link/server errors. |
| `pages/PrivacySecurity.jsx:31-61` (`setMessage({ type: 'error', text: 'Please enter your current password.' })` …) and raw `<input>`s 95/104/113 | Switch the three inputs to `InputField` with `error`; field errors inline; `message` stays for server result. |
| `pages/EditProfile.jsx:95,101` `alert(nameVal.error)` / `alert(phoneVal.error)` | Inline under Full Name (176) / Phone (214). Lines 52, 84 (`alert(imgVal.error)`, avatar upload failed) → inline message under the avatar picker. Line 121 (`Failed to save profile`) → form message. Line 141 `Loading profile...` → skeleton (section 5). |
| `pages/CreatePost.jsx:145,150` `alert(titleVal.error)` / `alert(contentVal.error)` | Inline under Post Title (355) and the textarea (368). |
| `pages/UserProfile.jsx:210,216,228,244,248` (expert application: `'Please fill out all required professional details.'`, CV, bio) and `298` (shop name) | Inline errors in the expert-application and seller sheets of this file. Lines 197, 285, 327 (`Connect action failed`, `Submission failed`, `Seller registration failed`) → form message / toast via the existing `onShowToast`. |
| `components/LeaveExpertDialog.jsx:13` `alert('Please tell us why you are leaving…')` (textarea at 47) | Inline under the textarea; line 22 server error → form message. |
| `pages/Connect.jsx:878-893` `handleConfirmBooking` (`alert('Please explain the consultation topic/issue')`, `'This slot is already booked…'`, `'Please select an available time slot.'`) | Booking dialog (JSX starts ~line 2245 `{/* Book Session Dialog */}`): error under the time list (`Please select an available time slot.`) and under the topic textarea (`Please enter a meeting description.`). Disable "Pay & Book" only while submitting, never silently. |
| `pages/Connect.jsx:973-974` `handleSubmitReview` → `if (!reviewTextInput.trim()) return;` (silent!) | Inline errors in the review dialog (`title="Write Consultation Review"` ~line 2336): rating and text. Show insert errors as form message (duplicate review → `You have already reviewed this consultation.`). |
| `pages/Connect.jsx:1052-1058, 1135-1137` cancellation reason / offered slots alerts | Replaced by the new cancel sheet in section 3. |
| `pages/Connect.jsx:809, 843, 1233` (`Expert profile not found…`, `Error saving availability`, `Update failed`) | Form messages (non-field). |
| `pages/Connect.jsx:1032, 1038, 1042` join errors `alert(joinErrorText(...))` | Non-blocking message on the booking card / detail sheet (not a field error, not `alert`). |
| `components/ConsultationFeeEditor.jsx` and the Meet-link sheet in `Connect.jsx` (`{/* ── Expert: add / update the Google Meet link` ~line 2496) | Already inline — switch them to the shared `InputField`/`field-error` styling for consistency. |
| `pages/Chat.jsx:158-189` `handleSendMessage` | Rewritten in section 6 (inline `Please type a message.` / length). |
| `pages/Feed.jsx:415` `window.confirm('Delete comment permanently?')`, `505` alert | Keep confirm as an in-app confirm dialog (`src/components/Dialog.jsx`), error → toast. |
| `pages/Community.jsx:91` | Toast. |

Admin (`admin-dashboard/src/`): `pages/Products.jsx:98,104,110` (name/price/stock) and `pages/News.jsx:38,44` and
`pages/Broadcasts.jsx:67,81,87,91` → inline field errors with `FormField`. Server errors (`Products.jsx:89,136`,
`News.jsx:61`, `Broadcasts.jsx:139`, `Users.jsx:54,78`, `Sellers.jsx:42`, `Comments.jsx:59`, `Posts.jsx:59`, `Reports.jsx:28,36,86`,
`Experts.jsx:56,77,85,94,97`, `Dashboard.jsx:119,129`, `Meetings.jsx:81,94`, `components/UserProfileModal.jsx:78,105,127`,
`components/PostDetailModal.jsx:60,82`, `components/TopNav.jsx:16,60`) → `InlineNotice`. `Broadcasts.jsx:128` success alert → notice.
Destructive `window.confirm` calls (`Products.jsx:83`, `Posts.jsx:36`, `Comments.jsx:36`, `News.jsx:68`, `Reports.jsx:24`,
`Experts.jsx:83`, `Meetings.jsx:87`, `PostDetailModal.jsx:43,65`) may stay as confirmations but should become the in-page modal
pattern already used in `admin-dashboard/src/pages/Meetings.jsx` (dialog with role="dialog").

### 2.3 Tests

* New `tests/unit/form-rules.test.mjs`: every rule above (empty, invalid, valid, trimming, max length).
* Playwright `tests/e2e/app.spec.mjs`: register with empty fields → each field shows its own message and the first gets focus,
  no `dialog` event (`page.on('dialog', …)` must not fire); fix one field → its error disappears; booking dialog without slot/topic;
  review dialog empty; Meet link invalid; fee invalid; message too long; network failure on booking keeps typed topic.
* `tests/regression.test.js`: add a guard that `src/pages/{Login,Register,Connect,EditProfile,CreatePost}.jsx` and
  `src/components/LeaveExpertDialog.jsx` contain no `alert(`.

---------------------------------------------------------------------------------------------------------------------------

## 3. Cancellation (14-hour cutoff) and refunds

### 3.1 What exists today (do not build a second system)

* Server: `public.cancel_consultation_booking(p_booking_id, p_reason, p_offered_slots)` — current body is in
  `supabase/proposed/15_expert_fee_and_commission.sql` lines 300–348. It checks participant + `status = 'Booked'`, but has
  **no 14-hour cutoff**, no actor/timestamp columns, and the expert branch records **no refund**. Farmer branch:
  `refund_amount = round(_agreed_fee_rupees(id) * 0.5, 2)`, `refund_status = 'Pending'`.
* Admin: `public.admin_update_booking_status` (same file, lines 351–392) can cancel anything at any time, records no refund.
* App: the cutoff is only client-side with the **phone clock**: `src/pages/Connect.jsx:2397-2398`
  `const hoursUntilStart = (startMs - Date.now()) / 3600000; const isCancelledBlocked = hoursUntilStart < 14;`
  (the start comes from `new Date(\`${date}T${timeClean}\`)` = device time zone, wrong outside India).
* App also inserts chat messages itself on cancel (`Connect.jsx:1076-1113` expert, `1150-1185` farmer) — remove; the server does it.

### 3.2 Migration `supabase/proposed/18_cancellation_policy_and_refunds.sql` (write/apply it after the messaging migrations 16 and 17 in section 6.2 — it calls `_post_system_message`; the app work can still follow the section order)

1. Columns on `consultation_bookings` (all nullable, `add column if not exists`): `cancelled_at timestamptz`,
   `cancelled_by uuid references public.profiles(id) on delete set null`, `cancelled_by_role text check (cancelled_by_role in
   ('farmer','expert','admin','system'))`, `cancellation_rule text` (e.g. `farmer_before_cutoff`, `expert_before_cutoff`,
   `admin_override`, `no_show`), `refund_paise integer check (refund_paise >= 0)`.
2. Table `public.demo_payment_adjustments` (append-only accounting): `id uuid pk`, `demo_payment_id uuid not null references
   demo_payments(id)`, `booking_id uuid not null references consultation_bookings(id)`, `kind text check (kind in ('refund'))`,
   `amount_paise int > 0`, `commission_reversal_paise int >= 0`, `expert_share_reversal_paise int >= 0`,
   check `commission_reversal_paise + expert_share_reversal_paise = amount_paise`, `reason text`, `created_by uuid`,
   `created_at timestamptz default now()`, `unique (booking_id, kind)` (prevents duplicate refunds). RLS on; select policy:
   `is_admin()` or the booking's farmer; **no** client insert/update/delete (revoke). Comment: simulated, no money moves.
3. Helper `public._cancellation_quote(b consultation_bookings, p_actor_role text, p_now timestamptz)` returns jsonb
   `{allowed, reason_code, message, cutoff_at, starts_at, refund_paise}` using **database time** and
   `public.consultation_start(b.meeting_date, b.meeting_time)` (Asia/Kolkata via `app_timezone()`):
   * `status <> 'Booked'` → not allowed (`already_cancelled` / `completed`).
   * `p_now >= starts_at` → not allowed (`started`; the no-show rule in `process_consultation_lifecycle` handles it).
   * `p_now > starts_at - interval '14 hours'` → not allowed for farmer/expert with message
     `Meetings cannot be cancelled within 14 hours of their scheduled start time.` (boundary: **exactly 14 h before is still allowed** —
     `p_now <= starts_at - 14h` allowed; a 6:00 PM meeting can be cancelled until 4:00:00 AM the same day).
   * refund: farmer 50 % (D1), expert 100 % (D2), admin 100 % (D4), of the succeeded `demo_payments.amount_paise` (round half up);
     0 if there is no payment row (old bookings).
4. `public.consultation_cancellation_quote(p_booking_id uuid)` (definer, participants or admin, `stable`) → the quote for the caller's
   role — the app shows this before confirming.
5. Rewrite `public.cancel_consultation_booking(p_booking_id, p_reason, p_offered_slots)`: lock the row `for update`, recompute the
   quote at commit time, refuse with the quote message (errcode `22023`) if not allowed; set status/`cancelled_*`/`cancellation_rule`/
   `refund_paise`/`refund_amount = refund_paise/100.0`/`refund_status = case when refund_paise > 0 then 'Pending' else 'None' end`;
   insert the `demo_payment_adjustments` row when refund > 0 (`on conflict (booking_id, kind) do nothing`); free the slot; keep the
   existing notifications (texts from lines 330–345 of file 15) but add the refund amount for the farmer; mark queued reminder pushes
   for this booking as failed: `update push_outbox set status='failed', last_error='booking cancelled' where status='queued' and
   data->>'booking_id' = p_booking_id::text`; post the reschedule note into the participants' conversation via the internal
   `_post_system_message` from migration 17. Keep the expert's "offer alternative slots" requirement. Idempotent: a second call
   on a cancelled booking returns the existing refund without changes (no error, no second adjustment).
6. `public.admin_cancel_booking(p_booking_id uuid, p_reason text)` (admin only, reason required): override of the cutoff, 100 % refund,
   `cancelled_by_role='admin'`, `cancellation_rule='admin_override'`, audit row in `admin_audit_log` (admin id, booking, reason,
   previous status, refund). Change `admin_update_booking_status` to refuse `'Cancelled'` (point to `admin_cancel_booking`) so there
   is one cancellation path.
7. `process_consultation_lifecycle` no-show branch (file 15 from line 523, the `no-show` block): also set `cancelled_at = p_now`,
   `cancelled_by_role = 'system'`, `cancellation_rule = 'no_show'`, `refund_paise`, and insert the adjustment row.
8. Extend `_admin_consultation_rows` (file 15 line 400) with `cancelled_at, cancelled_by_role, cancellation_rule, refund_paise,
   refund_commission_reversal_paise, refund_expert_share_reversal_paise` (left join the adjustment) and `admin_consultation_summary`
   with `refunds_paise`, `net_commission_paise` (= commission of non-cancelled + commission of cancelled − reversals).
9. Indexes (only these, they match the queries in section 4): `create index if not exists bookings_farmer_upcoming_idx on
   consultation_bookings (farmer_id, meeting_date, meeting_time) where status = 'Booked'`; same for `expert_id`;
   `create index if not exists bookings_farmer_history_idx on consultation_bookings (farmer_id, meeting_date desc, meeting_time desc)
   where status <> 'Booked'`; `create index if not exists slots_open_idx on consultation_slots (expert_id, slot_date, start_time)
   where not is_booked`; `create index if not exists notifications_user_created_idx on notifications (user_id, created_at desc)`.
   Run `explain` on staging for the new queries before and after and paste the plans into `TEST_RESULTS.md`.

### 3.3 App changes for cancellation

* `src/pages/Connect.jsx`, meeting detail sheet (`{/* ── Meeting Detail Bottom Sheet` ~line 2389): when the sheet opens, call
  `consultation_cancellation_quote` once. Delete lines 2395–2398 (client clock cutoff). Show: meeting date/time, the cutoff time
  (`cutoff_at` formatted in Asia/Kolkata), refund line (`Refund if you cancel now: ₹X (50% of ₹Y)` / `Full refund ₹Y`), and either an
  enabled **Cancel Meeting** button or a disabled one with the server `message` (lines 2447–2465 today).
* Cancel sheet (`{/* ── Cancellation & Reschedule Bottom Sheet` ~line 2542): inline errors for reason (and expert's offered slots);
  a confirmation step that repeats the refund result; on submit call the RPC only (delete the client conversation/message code
  at 1076–1113 and 1150–1185); show server refusal as a form message; after success refresh only the affected lists.
* `src/pages/Terms.jsx` lines 41–45: add the 14-hour rule and the D2/D4 outcomes once confirmed.
* Admin `admin-dashboard/src/pages/Meetings.jsx`: detail dialog (the "Booking accounting" block and the rows under it) shows
  cancelled at/by/role, rule, refund amount + reversals, net; replace the "Cancel consultation" button (`updateStatus(d.booking_id,
  'Cancelled')`) with an override form (reason textarea, inline error) calling `admin_cancel_booking`; never show "refunded" as real.

### 3.4 Tests

* DB (`tests/db/cancellation.test.mjs`): boundary at exactly 14 h (allowed), 14 h − 1 s (refused), after start (refused),
  completed/cancelled (refused), stranger/other expert (refused), farmer 50 %, expert 100 %, admin override 100 % + audit row,
  duplicate cancel idempotent (one adjustment), concurrent cancel (two sessions, one adjustment), reversal sums, no-show
  adjustment, admin summary net = 0 for a 100 % refund, `admin_update_booking_status(…,'Cancelled')` refused. Use a controlled
  clock: pass `p_now` where the function accepts it, or create bookings at computed offsets (`addBookingStartingIn` in `tests/db/harness.mjs`).
* Staging (`tests/e2e/staging-cancellation.test.mjs`, add to `test:staging`): farmer ≥14 h cancel, inside-14 h refusal via direct RPC,
  expert cancel, admin override.
* Playwright: disabled button with the 14-hour message for a booking 3 h ahead; enabled + refund text for a booking 2 days ahead.

---------------------------------------------------------------------------------------------------------------------------

## 4. Performance — measured bottleneck and exact fixes

**Measured baseline (2026-10-26, staging build, Playwright, desktop network, 2 runs each):** opening Catch Up made
**13 requests over 2.4–2.6 s for a farmer** and **11 requests over 1.7–2.2 s for an expert**, all **sequential**. Data is small
(192 slots, 230 bookings, 20 reviews) — latency per round trip to the Tokyo region is the cost, not volume. Repeat the same
measurement after the change (method: count `requestfinished` to `supabase.co/rest|auth/v1/user` after clicking the Catch Up
tab until 1.5 s without a new request) and record both in `TEST_RESULTS.md`.

`src/pages/Connect.jsx` `fetchData` (line 397 to ~690) runs, one after another:
`auth.getUser()` (network) → `experts` (me) → `profiles` (me) → `reviews select expert_id` (ALL rows, only to count) →
`consultation_slots select *` (**ALL slots of ALL experts incl. 136 past ones**) → `experts` list → bookings (upcoming) →
`farmer_profiles` (again, line ~597) → history (ALL, no limit) → `reviews select booking_id` (ALL) → reviews with joins (ALL) →
`products` (ALL). It is called again after every action.

Change it to:
1. `const { data: { session } } = await supabase.auth.getSession()` instead of `getUser()` (no network); same in the other 4 calls
   in this file and in `Chat.jsx`, `Feed.jsx` (3), `Notifications.jsx` (3), `UserProfile.jsx` (4), `EditProfile.jsx` (3) where only
   the id is needed.
2. Split by tab. On mount load only what the **active sub-tab** needs, in **parallel** (`Promise.all`):
   * identity (my expert row + my farmer_profiles id) — one round trip each, cached in state for the session;
   * `upcoming`: bookings `status = 'Booked'` with `meeting_date >= today (IST)` ordered by date/time, selecting only the columns the
     card uses (`id, meeting_date, meeting_time, issue_description, slot_id, expert_id/farmer_id` + embedded slot end time, video link,
     demo payment amount, other party name/avatar) — no `*`;
   * `book`: experts with `consultation_fee_paise` + only **future, open** slots (`.eq('is_booked', false).gte('slot_date', todayIST)`),
     reviews count via a grouped select or an `experts.review_count`-style view (do not download all reviews to count);
   * `history`: first 15 rows with `.range(0, 14)` (the UI already pages at 15: `historyShown`), reviewed flags only for those ids
     (`.in('booking_id', ids)`);
   * `reviews` / `marketplace`: only when that tab is opened.
3. Guard against stale/duplicate loads: a `loadSeq` ref (ignore results from older calls), and an `inFlight` ref so a second call
   while one is running is coalesced. After an action refresh only the affected tab (booking → upcoming; cancel → upcoming + history;
   link save → that card; review → history).
4. Loading state: add `const [loadState, setLoadState] = useState({ upcoming: 'idle', … })` with `'loading' | 'ready' | 'error'`;
   today the empty texts (`No upcoming consultations scheduled.` line 2088, `No scheduled meetings` line 1969,
   `No expert has open dates right now.` line 1329) are shown while data is still loading — show skeletons (section 5) during the
   first load and an error + Retry on failure; keep existing cards visible during refresh.
5. `src/pages/Chat.jsx:54-104` `fetchConversations` downloads every message of every conversation (embedded `messages(…)`) and then
   one `profiles` request per conversation (N+1, line 79). Replace with the RPC `list_conversations` from section 6.
6. `src/pages/Notifications.jsx:21` — select only needed columns, `limit(50)`, newest first (index from 3.2 step 9).

Tests: keep all existing Catch Up Playwright tests green (they cover booking, join window, link, checkout); add one that asserts
≤ 6 requests when opening the Upcoming tab as a farmer.

---------------------------------------------------------------------------------------------------------------------------

## 5. Skeleton loading

* There is already a shimmer class `.skeleton` in `src/index.css` lines 146–152 (used by `src/pages/Splash.jsx` 66–90). Build on it.
* New `src/components/Skeleton.jsx` exporting `Skeleton` (bar/circle), `ProfileSkeleton` (circle 72px + 2 bars + stats row + 3 post
  cards), `MeetingCardSkeleton` (avatar + 2 bars + topic block + button bar), `ExpertCardSkeleton`, `ConversationRowSkeleton`,
  `MessageBubbleSkeleton` (alternating left/right), `NotificationRowSkeleton`. Add to `index.css`:
  `@media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }` and `aria-busy="true"` + visually hidden
  "Loading…" text on the container for screen readers.
* Replace:
  * `src/pages/UserProfile.jsx:334-338` (`if (loading || !user) { … Loading profile... }`) → `ProfileSkeleton` (and an error state with Retry when the fetch fails — today `loading` stays true forever if the profile is missing).
  * `src/pages/EditProfile.jsx:141` `Loading profile...` → form skeleton.
  * `src/pages/Chat.jsx:208-211` `Loading conversations...` → 5 × `ConversationRowSkeleton`; message history → bubbles.
  * Catch Up first load (section 4.4): `MeetingCardSkeleton` × 3 in Upcoming, `ExpertCardSkeleton` × 2 in Book, rows in History.
  * `src/pages/Notifications.jsx` (no loading state today; shows "No notifications to display." line 212 while loading) → rows.
  * `src/pages/Feed.jsx` initial load (no loading state today) → reuse the Splash post-card skeleton markup (Splash.jsx 79–90).
  * Admin: new `admin-dashboard/src/components/TableSkeleton.jsx` (n rows × m cells, `animate-pulse bg-surface-variant/40`) replacing
    the centred spinners in `pages/Users.jsx:112-114`, `Experts.jsx:131-133`, `Posts.jsx:70-72`, `Products.jsx:157-159`,
    `Comments.jsx:71-73`, `Reports.jsx:159-161`, `News.jsx:110-112`, `Broadcasts.jsx:336-338`, `Sellers.jsx:54-56`,
    `Orders.jsx:25`, `Meetings.jsx:176-178`; `Categories.jsx:22-23` (`<p>Loading...</p>`); card skeletons for `Dashboard.jsx:151`
    and the modals `UserProfileModal.jsx:150-152`, `PostDetailModal.jsx:99-101`. Keep button spinners (`Login.jsx:100`, `TopNav.jsx:167`, `Broadcasts.jsx:318`).
* Every skeleton must give way to an error + Retry when the request fails (never infinite).

---------------------------------------------------------------------------------------------------------------------------

## 6. Text-only messaging (reuse existing tables)

### 6.1 What exists (staging, checked 2026-10-26)

* Tables: `conversations (id, user_one, user_two, last_message_at, created_at)` with `unique (user_one, user_two)` and
  `check (user_one <> user_two)`; `messages (id, conversation_id, sender_id, content text, is_read bool, created_at,
  message_type varchar default 'text', metadata jsonb)`; indexes `idx_messages_conversation (conversation_id, created_at)`,
  `idx_messages_sender`. Both tables are empty on staging.
* **Security gaps to close:** `conversations_insert` lets anyone open a conversation with anyone (no Connect check);
  `messages_update` lets **either participant update any message** (could rewrite the other person's text or `sender_id`);
  `messages_select` / `conversations_select` include `is_admin()` (admins read private messages); no length limit; `(a,b)` and
  `(b,a)` can both exist; no notification on a new message; `notification_type` has no `message` value
  (`like,comment,follow,booking,order,announcement,system`).
* "Connect" = a one-way follow in `followers (follower_id, following_id)`; code: `src/pages/UserProfile.jsx:175-197`
  (`handleToggleConnect`), `src/pages/Feed.jsx:480-505`. There is **no "Message" button** anywhere; the Chat tab exists
  (`src/components/NavBar.jsx:9`, `src/App.jsx:409-418` renders `<Chat …/>`).
* React renders message text as text (no `dangerouslySetInnerHTML` anywhere in `src/` or the admin) — keep it that way.

### 6.2 Migrations

* **`16_message_notification_type.sql`** (alone): `alter type public.notification_type add value if not exists 'message';`
* **`17_messaging.sql`** (depends on 13 for push, 16):
  1. Canonical pair: add `check (user_one < user_two)` as `not valid` + a unique index on `(least(user_one,user_two), greatest(...))`
     (tables are empty on staging; on production check for rows first and report).
  2. `messages`: `alter column content set not null`, check `char_length(btrim(content)) between 1 and 2000`; check
     `message_type in ('text','cancellation_reschedule')`; add `client_id uuid` + `unique (conversation_id, sender_id, client_id)` for
     idempotent sends; add `read_at timestamptz`.
  3. `public._can_message(a uuid, b uuid) returns boolean` (definer, stable): D6 rule (follow either way, or shared booking), and
     neither is banned.
  4. RPCs (definer, `auth.uid()` only, revoke from anon):
     * `get_or_create_conversation(p_other uuid) returns uuid` — refuses self, unknown user, `_can_message` false
       (`You can message people you are connected with.`).
     * `send_message(p_conversation_id uuid, p_content text, p_client_id uuid) returns jsonb` — participant check, not banned,
       trim, length 1–2000, insert with `sender_id = auth.uid()`, `on conflict (conversation_id, sender_id, client_id) do nothing`
       then return the existing row (double tap = one message); update `last_message_at`; notify the **other** participant once
       (`_notify(other, 'message', format('New message from %s', sender_name), conversation_id)` — **no message text in the
       notification**), only when the insert actually happened. Optional rate limit: 30 messages / minute / sender.
     * `list_conversations(p_limit int default 30, p_before timestamptz default null)` — one query: other participant id/name/avatar,
       last message preview (first 80 chars, text), last time, unread count (`messages where sender_id <> me and read_at is null`).
     * `get_messages(p_conversation_id uuid, p_before timestamptz default null, p_limit int default 30)` — newest 30, older pages by `p_before`.
     * `mark_conversation_read(p_conversation_id uuid)` — sets `read_at = now(), is_read = true` only on messages **sent by the other**
       participant; returns count.
     * `_post_system_message(p_booking_id, p_sender uuid, p_content, p_metadata)` (internal, not granted) — used by cancellation (section 3).
  5. Policies: drop `conversations_insert`, `conversations_update`, `messages_insert`, `messages_update`; recreate select policies
     **without** `is_admin()`; revoke insert/update/delete on both tables from `anon, authenticated` (writes only via RPCs). Admin
     operations view: `admin_messaging_stats()` (counts only: conversations, messages last 7 days, notifications/pushes per status for
     type `message`) — no content.
  6. Push: replace `public.enqueue_push_for_notification()` (body in `supabase/proposed/13_push_notifications.sql` ~lines 90–110,
     **must stay SECURITY INVOKER**) so that type `'message'` also queues a push with `title 'New message'`, body = notification text,
     `data = {kind:'message', conversation_id, notification_id}`.
  7. Realtime: `messages` is already in the realtime publication (migration 08); RLS on select keeps it private.

### 6.3 App

* `src/utils/pushTap.js:5-7`: accept `{kind:'message', conversation_id: UUID}` → `{ kind: 'message', conversationId }`.
* `src/App.jsx:162-171` (push tap effect): for `kind === 'message'` set `activeTab('chat')` and a new `focusConversationId` state
  passed to `<Chat>` (line ~411). Clear all chat state on logout (`const handleLogout = async () => {` at line 261).
* `src/pages/Notifications.jsx:121-131` `handleNotificationTap`: today booking/system taps do nothing (line 125 `return`). Route
  `booking` → Catch Up with `focusBookingId` (prop from App, like the push path), `message` → Chat with `focusConversationId`.
* `src/pages/UserProfile.jsx:438-446` (the Connect button): add a **Message** button next to it when `_can_message` would allow
  (connected either way) — on tap `get_or_create_conversation` then open Chat with that id. Show the server refusal inline.
* `src/pages/Chat.jsx` (414 lines) — rewrite the data layer, keep the look:
  * `fetchConversations` (54–106) → `list_conversations`; conversation rows show unread badge.
  * `openConversation` (109–129) → `get_messages` (latest 30) + `mark_conversation_read`; one realtime channel per open conversation
    (`removeChannel` the previous one first — keep 115–117 logic), de-duplicate incoming rows by `id` (today line 123 appends blindly,
    so the sender sees their own message twice once sends return rows); "Load earlier messages" button using `p_before`, preserving
    scroll position (measure `scrollHeight` before/after prepend); only auto-scroll to bottom when the user is already near the bottom
    (today `useEffect` 151–156 always scrolls).
  * `handleSendMessage` (158–189) → `send_message` with a `client_id = crypto.randomUUID()` created per draft; disable Send while
    sending; on failure keep the draft and show an inline error; inline validation (`Please type a message.` / 2000 chars) with a
    live counter after 1800 chars.
  * Render cancellation/reschedule messages (`isCancellation`, 266–360) unchanged.
  * Android keyboard: make the input bar `position: sticky; bottom: 0` with `padding-bottom: env(safe-area-inset-bottom)`; add
    `android:windowSoftInputMode="adjustResize"` to the `MainActivity` `<activity>` in `android/app/src/main/AndroidManifest.xml`
    (it is not set today), then `npx cap sync android`.
  * Re-subscribe on reconnect and refetch the latest page so missed messages appear.

### 6.4 Tests

* DB `tests/db/messaging.test.mjs`: connected users can create/send; unconnected refused; booking participants allowed; third user
  cannot read/insert/mark read; sender id cannot be spoofed (direct insert refused); empty/2001-char refused; HTML stored as text;
  `message_type` other than the two refused; same `client_id` twice = one row and one notification; sender not notified; push queued
  once with `kind = 'message'` and no message text; admin cannot select messages; `mark_conversation_read` only touches the other
  side; `(b,a)` after `(a,b)` returns the same conversation.
* Unit: `pushTap` message parsing.
* Staging `tests/e2e/staging-messaging.test.mjs` (add to `test:staging`): same core cases over the API with fixtures user1↔expert1.
* Playwright: open profile → Message → send → other account sees it (two pages) with unread badge; reload keeps history; `<b>x</b>`
  shows literally; overlong message inline error.

---------------------------------------------------------------------------------------------------------------------------

## 7. Admin dashboard fixes

* **Pending Reports card shows red "Requires Moderation" even with 0** — `admin-dashboard/src/pages/Dashboard.jsx` lines 247–260:
  the icon colour `text-[#e74c3c]` (line 251), the red footer `text-[#e74c3c]` (line 256) and the text `Requires Moderation`
  (line 258) are hard-coded. Make them depend on `stats.pendingReports > 0`: when 0 → icon `task_alt` in `text-primary-container`,
  icon background `bg-[#1b2a1e]`, footer `text-on-surface-variant` with icon `check_circle` and text `No pending reports`;
  when > 0 → today's red look and `Requires moderation`. Apply the same rule to the **Expert Apps** card (lines 216–229:
  `Pending Review` in green even when `stats.expertApps` is 0 → `No pending applications`). The count query is
  `Dashboard.jsx:33` (`reports … .eq('status','Pending')`); the Reports page also has "Expert leave requests" — if the owner wants
  them counted, add `expert_resignations` pending to the same card (ask; default: show a separate small line "N leave requests"
  only when N > 0).
* `admin-dashboard/src/pages/Meetings.jsx` (Bookings & Payments): cancellation/refund fields and override form from 3.3; filter
  `cancellation_rule`; summary cards "Refunds recorded (simulated)" and "Net platform commission".
* Messaging: a small "Messaging" panel on the Dashboard from `admin_messaging_stats()` (counts and push failures only, no content).
* Replace admin `alert`s per section 2.2; skeletons per section 5.

---------------------------------------------------------------------------------------------------------------------------

## 8. Production-readiness audit and checklist (documentation only — do not touch production)

Facts from 2026-10-26 (read-only):
* Production migrations applied: base `01_extensions_and_enums … 07_admin_rls_override`, `phase0_*`, `20260914_admin_booking_actions`,
  `agent_fixes_20261024`, `remediation_01, 02, 03, 03b, 07, 08`. **Not applied:** 04, 05 (+pg_cron), 09, 10, 11, 12, 13, 14, 15 and
  every new one. Production has **no Edge Functions** (needs `admin-delete-user`, `push-dispatch`; never `video-room-token`).
* **Leaked-password protection is OFF on production and staging** → release blocker (Dashboard → Authentication → Passwords).
* Advisor on production: only the expected definer-function warnings.
* Staging leftovers to know about: `expert1`'s fee is ₹450 (a stopped phone run did not restore ₹500); many cancelled test bookings.

Update `RELEASE_CHECKLIST.md` (existing sections 1–5 + addendum) with: backups (PITR/backup + `scripts/sql/export_schema_ddl.sql`),
migration order **04 → 05 → 09 → 10 → 11 → 12 → 13 → 14 → 15 → 16 (message enum) → 17 (messaging) → 18 (cancellation)**, verification per step (always-raise checks, function-body fingerprint vs staging), production config (Google OAuth,
redirect URLs `com.agroconnect.app://auth-callback`, SMTP for reset e-mails, Firebase + `FIREBASE_SERVICE_ACCOUNT`, `pg_net` +
push cron), credential rotation/session revocation still pending from the 2026-10-24 audit, web/admin deploy order (DB first, then
admin, then app, then APK — old APKs break after 05/11/14/15/18), Android release signing, smoke tests (add cancellation, messaging,
inline validation), monitoring (`cron.job_run_details`, `push_outbox` failed/expired, Edge Function logs, advisors), rollback.

---------------------------------------------------------------------------------------------------------------------------

## 9. Documentation to update

`MODULE_PLAN.md`, `FEATURE_MATRIX.md`, `TEST_RESULTS.md`, `REMEDIATION_STATUS.md`, `RELEASE_CHECKLIST.md`,
`CHANGE_REQUEST_2026-10-25.md`, `supabase/staging/README.md` (table of applied staging migrations — append rows), `supabase/proposed/README.md`
(file table + order). Record: validation behaviour, 14-hour rule with the exact boundary, refund + accounting (D1–D5), performance
before/after with method, skeleton components, messaging model + policy (D6, D7), notifications, migrations + staging status,
exact test counts, owner decisions still open, release blockers.

---------------------------------------------------------------------------------------------------------------------------

## 10. Final steps

1. `npm test`, `npm run test:db`, `npm run test:staging` (serial), wait ~7 min, `E2E_STAGING=1 npx playwright test`, `npx oxlint`.
2. Builds: app + admin production (`npx vite build`; bundles must contain `mgreapakfchcxcrauheq` only) and staging
   (`--mode staging --outDir dist-staging`; `ahkgvuewgbjyahbiehrx` only); grep bundles for `service_role`, `daily-co`, `razorpay`,
   and user-facing "demo payment"/"no real money" (must be 0); staging APK via the script (package `com.agroconnect.app.staging`).
3. Commit locally on `feature/validation-cancel-messaging` (one commit per section is fine), message ends with the attribution line the
   environment asks for. Do not push.
4. Final report: starting branch/commit, commits, files added/changed/removed, each section's result, migrations + staging status,
   Edge Functions (none expected to change), exact test counts per suite, failed/skipped/mocked tests, builds, security findings,
   open owner decisions (D1–D7, expert-resignation counting), remaining blockers (leaked-password protection, production migrations,
   Firebase, SMTP), and confirmation that production, `main`, GitHub and Render were not modified.
5. Device checks need the owner's phone (USB debugging): `ANDROID_SERIAL=<serial> python3 -I scripts/staging/device-smoke.py`
   after `adb install -r android/app/build/staging-apk/app-staging-debug.apk`. Ask for the phone only after everything else is done.
