# AgroConnect — Production Audit (2026-10-28)

Scope: the final-release request (feed, experts, Google Meet links, header, admin and expert workflows, resumes,
counts, tests, Android, GitHub, Render). Every statement below was checked on 2026-10-28. Nothing in production was
written for this audit; production changes that still need the owner's approval are listed in §9.

## 1. Environments (verified)

| What | Value | How it was checked |
|---|---|---|
| Production Supabase | `mgreapakfchcxcrauheq` | `.env.production`, the Render bundle, the production APK bundle |
| Staging Supabase | `ahkgvuewgbjyahbiehrx` | `.env.staging`; every staging script refuses the production ref |
| Render admin site | `https://agroconnect-h7nj.onrender.com` | serves a bundle that calls production and already contains the migration-24 code (`admin_expert_removal_preview`) → it was deployed from `origin/main` after `1289b3e` |
| Work branch | `feat/admin-roles-resumes-branding` | `git status`; `main` is only fast-forwarded |
| Production migrations | up to `remediation_25_expert_broadcasts` (applied 2026-10-29) | `list_migrations` |
| Staging migrations | up to `remediation_25_expert_broadcasts` | applied in this round (staging only) |
| Service-role keys on this Mac | none (`.env.production.local` holds only comments; `.env.staging` has no service key) | file inspection, values never printed |

## 2. Feed — "Kannur feed is empty"

**Root cause.** The server is correct. `get_feed` returns every approved post from all four districts. Posts from the
caller's own district come first (rank 0), then everything else newest first, with `id` as the tie-break. This was
reproduced on staging: one Kottayam post was returned to Kannur, Pathanamthitta, Idukki and Kottayam users. The empty
feed seen on the phone came from the **two different apps**:

- *AgroConnect* talks to production, which has 1 post.
- *AgroConnect Staging* talks to staging.

A post made in one app never appears in the other.

**Changes:**
- `src/pages/Feed.jsx`: the "Posts from X first" banner is removed. The prompt "Choose your district to see local posts
  first." appears only when no district is set.
- `src/pages/Feed.jsx`: the feed is fetched again when the app returns to the foreground. Realtime inserts were
  already handled.
- New test in `tests/db/districts-feed.test.mjs`: a district with no local posts, and a user with no district, both
  still see every other district.

## 3. Experts

**Root cause.** `src/pages/Connect.jsx` hid every expert who had no open time slots.

**Changes:**
- Every active expert with a profile is now listed. Experts from the user's own district come first, then experts who
  have open times, then by name and `id`. There are no "(yours)" labels.
- An expert with no open times shows "No open times yet" and no Book button.
- Empty states: "No verified experts yet. Please check again later." and "No verified expert in {district} yet."

## 4. Header

The eco/PEA button next to the bell duplicated the PEA pill in the centre, so it was removed. The brand control and
the bell (now `aria-label="Notifications"`) stay.

## 5. Resumes ("Resume missing" in the admin)

**Logic.** An expert application can only be created with a server-checked PDF (`submit-resume` Edge Function plus the
`expert_applications_cv_pdf_check` constraint). The "Resume missing" message therefore only appears for rows that
existed before that rule.

| Environment | Rows | State |
|---|---|---|
| Staging | 3 applications | Each now has a real PDF: user2 (Pending) through `submit-resume`; user4 (Rejected) by uploading a demo PDF and updating its path. The fake path came from `06_repair_test_fixtures.sql`. |
| Production | 3 rows | Still without a valid PDF: jacob and Anandh (their uploads are photos, which the PDF constraint refuses) and the "Dr. Ramesh Expert" fixture. Needs the owner's approval and a production service key (§9). The plan is to convert each person's own photo into a PDF, and to give the fixture a sample PDF. |

## 6. Google Meet links

- The expert pastes a Meet URL and `set_meeting_link` saves it.
  - It must be HTTPS on `meet.google.com`.
  - Only the booking's expert can set it.
- The farmer gets a `booking` notification. The Join button opens the same stored URL.
- **New this round:** Catch Up reloads when a `booking` notification arrives or the app returns to the foreground, so
  an open Catch Up screen shows the link without a manual refresh.
- Covered by `tests/db/meet-and-demo-payment.test.mjs`, `tests/e2e/staging-meet-payment-push.test.mjs` and
  `staging-catchup.test.mjs`.
- The app never generates a Meet link itself. Leaving a meeting happens in Google Meet.

## 7. Expert broadcasts with admin approval (new — migration 25)

**Database:** `supabase/proposed/25_expert_broadcasts.sql`, rollback in `99_rollback.sql`.

- **New columns** on `broadcasts`:
  - `status`: `pending` / `approved` / `rejected`, default `approved`, so admin broadcasts are unchanged;
  - `reviewed_by`, `reviewed_at`, `review_note`.
- **`submit_expert_broadcast(title, message, target_role)`:**
  - only active, unbanned experts may call it;
  - title is 2–120 characters, message 5–1000;
  - the audience is everyone, farmers or experts;
  - at most 3 can be pending at once;
  - every admin is notified.
- **`review_broadcast(id, approve, note)`:**
  - admin only;
  - a broadcast can be reviewed only once;
  - approving delivers the broadcast exactly like `send_broadcast`, one `announcement` notification per recipient;
  - rejecting tells the expert the reason.
  - Both actions write to the audit log.
- **New select policy:** a sender can read their own broadcasts, and a recipient can read approved broadcasts they
  received. Before this, the app's announcement pop-up could not load the broadcast and showed a toast instead.
- **`sent_by` foreign key** is now `on delete cascade`, so an expert who sent a broadcast can still be deleted.

**App:** the expert menu (Catch Up ☰) has a new item, **Send an Announcement**
(`src/components/ExpertBroadcastDialog.jsx`). It shows the expert's recent announcements and their status.

**Admin:** the Broadcasts page has a new panel, **Expert Announcements Waiting for Review**.
- Each announcement can be approved and sent, or rejected with a reason.
- The panel refreshes when a new submission arrives.
- The history shows who wrote each announcement.

## 8. User counts (read-only, production)

| | Count |
|---|---|
| All profiles | 9 |
| Admins | 2 |
| Experts (role) | 4 |
| Active expert rows | 3 |
| Farmers | 3 |
| Seed/demo users | 0 |
| Approved posts | 1 |
| Profiles with a district set | 0 |

The target was 50 users (Kannur 20, Pathanamthitta 20, Idukki 5, Kottayam 5) with 10 experts. It is **not met**.

- Seeding needs the production service key on this Mac and the owner's explicit approval; neither is in place.
- `scripts/production/seed-community.mjs` is ready and is idempotent.
- No user was created, changed or deleted.

## 9. Waiting for the owner

1. ~~Apply migration 25 to production~~ **Done 2026-10-29 with the owner's approval.** The two functions and the read
   policy match staging exactly (md5 of the definitions); `anon` cannot execute them; the 1 existing broadcast is
   `approved`. Security advisors show no new findings.
2. **Repair the production resumes** (§5). Needs a production service key in `.env.production.local`.
3. **Seed production** (§8). Needs a service key and approval.
4. **Render.** Run Manual Deploy of the pushed `main` if auto-deploy is off, then smoke-test the site.
5. **Demo backend.** All three clients must use the same database.
   - The Render admin site and the installed production app use production.
   - A localhost web app built with `.env.production` also uses production.
   - The staging APK and `dist-staging` use staging.

## 10. Follow-up 2026-10-29

- **"Expert post not in the admin":** the post ("Best Source of Protein", Ramesh Menon, 01:57 UTC) was created in the
  **staging** app on the phone. The Render admin reads **production**, which has 0 posts. No code fault.
- **"Resume missing" on production:** jacob's and Anandh's records point to `<ts>_cv.pdf`, while their files are stored
  as `<ts>_cv.jpeg` / `<ts>_cv.jpg` (images of their resumes). The admin now opens the stored file, labelled
  "(image)". The test account "Dr. Ramesh Expert" has no file at all and shows a neutral "No resume file uploaded".
  Commit `269237e`; no data was changed.
- **Render** last served a build from 02:04 UTC (`index-B__bAgdk.js`). It contains the announcement review panel but
  not `269237e`. A Manual Deploy of the latest `main` is needed.
