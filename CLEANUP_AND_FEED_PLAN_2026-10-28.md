# Plan: remove visible test data and build a natural agricultural feed (2026-10-28)

Plan only. Nothing below has been done yet. Every fact comes from read-only checks of the code and both databases on
2026-10-28.

> **The pasted prompt was cut off** at "3. Build a rich, natural agricultural feed — I want the fe…". Part C below is
> built from the section title and the opening of the prompt (natural posts, images, videos, variety). If section 3 or
> later sections had more requirements, send the rest and Part C will be updated.

---

## A. Where the test names come from (inventory)

### A1. Not the app code
- No hardcoded "Test User" / "Demo User" / "User 1" in `src/` or `admin-dashboard/src/`.
- `src/mock/` (`users.json`, `posts.json`, `notifications.json`, `communities.json`, `adminStats.json`, with names like
  "Ramesh Kumar") is **not imported anywhere**: dead files.
- Fallback labels exist for missing names: "Anonymous" (Feed, Search, UserProfile, admin pages), "Farmer", "Expert",
  "User", "Customer". These are normal fallbacks, not test data.
- `src/pages/Search.jsx` line 371: the empty-search hint suggests searching for "Ramesh".

### A2. The databases (the real source)

**Staging** (`ahkgvuewgbjyahbiehrx`, used by the "AgroConnect Staging" app on your phone):

| Display name | Role | District | Where it comes from |
|---|---|---|---|
| Test User 1 (Farmer) | Farmer | Kottayam | `scripts/staging/create-test-accounts.mjs` fixture `user1` |
| Test User 2 (Pending Expert) | Farmer | Pathanamthitta | fixture `user2` |
| Test User 3 (Fresh Farmer) | Farmer | Kannur | fixture `user3` |
| Test User 4 (Rejected Expert) | Farmer | Idukki | fixture `user4` |
| Dr. Ramesh Expert | Expert | Kottayam | fixture `expert1` (has the 1 staging post) |
| Staging Admin | Admin | — | fixture `admin` |
| Delete Me (staging test) | Farmer | — | leftover from a `staging-workflows` run on 2026-10-25 whose clean-up failed |
| PRINCE ABRAHAM SHAJI RMCA 2025-2027 | Farmer | Kannur | your own sign-up (genuine) |
| Prince Abraham Shaji | Farmer | — | your own sign-up (genuine) |

Test traffic stored as text on staging (renaming a profile does **not** change these):

| Table | Total | With test wording ("Test User", "Ramesh Expert", "E2E", "staging", "Phone flow" …) |
|---|---:|---:|
| notifications | 2,652 | 1,073 |
| messages | 156 | 98 |
| consultation_bookings | 389 (350 cancelled) | 354 |
| reviews | — | 12 |
| posts | 1 ("Best Source of Protein", video) | — |

The automated tests create new rows like these on **every** run, so a one-time clean-up would fill up again (B4 deals
with this).

**Production** (`mgreapakfchcxcrauheq`): 9 accounts, 1 post, 13 notifications (none with test wording), 0 messages, 0
products. **No seed (demo) accounts yet.**

| Display name | Role | E-mail domain | Notes |
|---|---|---|---|
| Prince Abraham Shaji | Admin | gmail.com | genuine (you), not touched |
| Prince | Admin | agroconnect.com | admin, not touched |
| jacob | Expert | mca.ajce.in | your test account? resume broken (photo) |
| Anandh | Expert | gmail.com | genuine; the name has a trailing space ("Anandh "); 1 post |
| Ravi Kumar | Farmer | agroconnect.com | 3 bookings (history) |
| Amita Singh | Farmer | agroconnect.com | — |
| **User Two** | Farmer | agroconnect.com | placeholder-style name |
| **Dr. Anita Rao** | Expert | agroconnect.com | no photo |
| **Dr. Ramesh Expert** | Expert | agroconnect.local (reserved test domain) | test fixture (`06_repair_test_fixtures.sql`); Expert role but **no experts row** |

None of these has seed metadata. Whether `@agroconnect.com` accounts are real people is **your decision** (D1). By the
safety rules, a name alone is not proof.

### A3. Tests that depend on the fixture names
The names are hardcoded in **32 places**:

| File | Uses |
|---|---:|
| `tests/e2e/app.spec.mjs` | 13 |
| `scripts/staging/device-smoke.py` | 8 |
| `scripts/staging/create-test-accounts.mjs` | 6 |
| `tests/e2e/staging-catchup.test.mjs` | 4 (notification texts) |
| `tests/e2e/staging-workflows.test.mjs` | 1 |

Renaming the staging fixtures without changing these breaks the tests.

---

## B. Remove visible test identities

### B1. One source of truth for fixture names (code)
1. New file `tests/fixtures/staging-accounts.json`: for each fixture key (`user1` … `user4`, `expert1`, `admin`) the
   display name. The names are fictional, natural and distinct from the 50 seed names in `seed-lib.mjs`. Decided
   2026-10-28 (D3):

   | Key | New name |
   |---|---|
   | user1 | Anil Varghese |
   | user2 | Deepa Kurian |
   | user3 | Manoj Pillai |
   | user4 | Sreelakshmi Nair |
   | expert1 | Ramesh Menon |
   | admin | AgroConnect Admin |

   No "Dr.", for the same reason as the seed experts. The file also records `"synthetic": true` for each account.
2. `scripts/staging/create-test-accounts.mjs`, `tests/e2e/app.spec.mjs`, `tests/e2e/staging-catchup.test.mjs` and
   `tests/e2e/staging-workflows.test.mjs` read the names from that JSON. `scripts/staging/device-smoke.py` reads it with
   `json.load`. Every hardcoded name in A3 is replaced by the lookup; regexes are built with an escape helper.
3. A new regression test checks that `tests/` and `scripts/` contain no "Test User" / "Ramesh Expert" literal outside
   the JSON.

### B2. Rename the staging fixture accounts (staging only)
New script `scripts/staging/rename-fixtures.mjs`. It refuses anything but the staging ref.
- It signs in as each fixture with the passwords from `.env.staging` (no service key needed) and updates its own
  `profiles.full_name` (users may edit their own name) to the JSON name.
- It also sets `auth` user metadata `synthetic: true` and `fixture: <key>`, so the accounts stay identifiable
  internally.
- Dry run by default; `--execute` to write. Prints old → new names only.

### B3. Staging leftovers and text clean-up (staging only, exact rules, dry run first)
Run through the Supabase MCP on **staging only**. First a `select count(*)` per rule, shown to you, then the deletes in
one transaction. Fixture accounts = the 6 in B1, found by their fixture e-mail pattern
`agroconnect-stg-%-<FIXTURE_EMAIL_TOKEN>@<FIXTURE_EMAIL_DOMAIN>`.

| Rule | Rows | Why |
|---|---|---|
| R1 | delete the account "Delete Me (staging test)" with `admin-delete-user` | leftover of a failed test clean-up |
| R2 | delete `notifications` whose `user_id` is a fixture account | old notices carry the old names and test topics |
| R3 | delete `messages` + `conversations` where **both** participants are fixture accounts | test chats ("E2E hello …") |
| R4 | delete `consultation_bookings` (and their `demo_payments`, `demo_payment_adjustments`, `video_meetings`, `reviews`; their `push_outbox` rows go via notification cascade) where farmer **and** expert are fixture accounts and the status is Cancelled or Completed | test bookings; Booked ones are left for running tests |
| R5 | delete the free past `consultation_slots` of `expert1` (`slot_date < current_date`, not booked) | test slots |

Never touched: your two genuine staging accounts and anything involving them, and production. Booked rows are not
deleted. The exact SQL goes in `scripts/sql/staging_cleanup_test_traffic.sql` with the dry-run counts at the top.

### B4. Stop the tests from refilling it
- Tests that create bookings, messages or notifications already clean up some rows. Add an `after()` hook to
  `staging-catchup`, `staging-cancel-messaging`, `staging-meet-payment-push` and the Playwright booking tests. It runs
  the B3 rules R2–R4 limited to rows created during that run (`created_at >= run start`), through a staging-only helper
  `tests/e2e/cleanup.mjs`.
- The helper needs the service role (RLS hides other users' rows). So it is **blocked until
  `STAGING_SUPABASE_SERVICE_ROLE_KEY` is in `.env.staging`**, the same key the 50-user seed needs. Without the key, run
  B3 again after test runs.

### B5. Production (decided 2026-10-28: keep all four accounts unchanged; this section is kept for reference only)
`scripts/sql/production_name_preview.sql` (read-only) lists for D1's accounts: posts, comments, likes, messages,
bookings, reviews, applications. Then, by your decision per account:
- **User Two**: rename (you give the name) **or** delete with `admin-delete-user`, if you confirm it is a test account
  (it has no posts, messages or bookings).
- **Dr. Ramesh Expert** (`agroconnect.local` fixture, no experts row, no activity): delete with `admin-delete-user`, or
  set role Farmer, after your yes.
- **Dr. Anita Rao**: keep as is, or rename / add a photo, as you decide (it may be a real expert).
- **Anandh**: remove the trailing space in the name only if you agree.

### B6. Small code clean-ups (no data)
- Delete the unused `src/mock/` folder.
- Change the Search empty-state hint (`Search.jsx` line 371) from "Ramesh" to a crop word, e.g. "pepper".
- Keep the "Anonymous" fallbacks (they only show when a profile has no name).

---

## C. A natural, content-rich agricultural feed (staging first)

### C1. Facts that shape it
- Posts: `title` (in caption), `caption`, `category`, `image_path`, `media_type` (`image` / `video`; text-only = `image`
  with no file), `video_duration_seconds` (0–600, migration 23), `district` (set by the server from the author).
- Categories the app offers: General, Organic Farming, Pest Control, Agri Tech, Market Prices.
- Storage limits:
  - `post-images`: JPG/PNG/WEBP up to 10 MB;
  - `post-videos`: MP4/WEBM/MOV/QuickTime up to 50 MB.
- Feed order (`get_feed`): the viewer's district first, then newest first, keyset pages.
- `seed-posts.mjs` today: 8 text-only posts. It resets the author's password **for every post**, which would break
  the demo logins; fix it as was done in `seed-community.mjs`.

### C2. Content library (new file `scripts/production/feed-content.mjs`)
- **48 posts**:

  | District | Posts |
  |---|---:|
  | Kannur | 16 |
  | Pathanamthitta | 16 |
  | Idukki | 8 |
  | Kottayam | 8 |

  Each is written by a seed account living in that district. At most 3 posts per author, and experts write about
  their own speciality.
- Media mix: about 50 % with a photo, 20 % with a short video (under 60 s, under 20 MB), 30 % text. Spread over the 5
  categories.
- Kerala crops by district, matching the seed bios:
  - Kannur: coconut, arecanut, pepper, cashew, mango;
  - Pathanamthitta: banana, rubber, tapioca, vegetables;
  - Idukki: cardamom, tea, pepper, coffee;
  - Kottayam: paddy, rubber, kitchen gardens.
- Natural captions: questions, field observations, harvest updates, market notes, how-I-did-it. 1–4 sentences, no
  marketing tone. Varied openings (no repeated template).
- No medical or chemical dosage advice presented as expert fact, no named real people, no claims of real events. Expert
  posts are general good practice and say "in my experience" rather than prescribing.
- Engagement: 2–8 likes per post and 0–4 short comments from other seed accounts (mostly from the same district).
- The posts' `created_at` is spread over the last 45 days (set by the service role after insert), so the feed doesn't
  look created in one minute.

### C3. Images and videos: openly licensed, with credits (decided 2026-10-28, D2)
**Sources, in this order:**
1. **Wikimedia Commons**: CC0, Public domain, CC BY, CC BY-SA.
2. **Pexels / Pixabay**: their own free licences. Only when Commons has nothing that fits.

Not allowed: anything "non-commercial" (NC), "no derivatives" (ND), "all rights reserved", or an unclear licence.

**What the read-only check on 2026-10-28 found:**
- **Photos:** Commons has fitting Kerala photos, e.g. "Paddy field in Kerala.jpg" (CC BY-SA 4.0), "Coconut tree climbing
  DSCN0223.jpg" (CC BY-SA 3.0), "Rubber tapped.JPG" (public domain), "Rubber tapping (15056).jpg" (CC BY-SA 4.0). Most
  are CC BY-SA, so credit is required and the resized copy stays CC BY-SA.
- **Videos:** fewer and noisier, often not from Kerala and often large. Usable examples: "Cardamom harvest in
  Kalimpong, West Bengal.webm" (13 s, CC BY-SA 4.0), "Coconut Plantation.webm" (8 s, CC BY-SA 4.0). A video is used only
  if it really shows what the caption says. The caption names the real place ("a cardamom harvest video from
  Kalimpong"), never pretending it is Idukki.

**Steps for every file (script `scripts/production/fetch-media.mjs`, then a manual look):**
1. Search the Commons API (`prop=imageinfo`, `iiprop=extmetadata|size|mime|url`). Keep only results whose
   `LicenseShortName` is in the allowed list. Record `LicenseShortName`, `LicenseUrl`, `Artist`, the file page URL, the
   original size, and for video the duration.
2. Download the original into `seed/media/originals/` (git-ignored; only the converted files are committed).
3. Look at every file. Reject it if it shows people's faces close up, brand logos, text overlays, watermarks, or
   anything that doesn't match the planned caption.
4. Convert:
   - photos: `sips -s format jpeg -Z 1600 -s formatOptions 82`, which gives a JPG ≤ 1600 px, well under 10 MB;
   - videos: `ffmpeg -t 60 -vf scale=-2:720 -c:v libx264 -crf 28 -preset slow -an -movflags +faststart`, which gives an
     MP4 ≤ 60 s with no sound, and must come out under 20 MB, or the file is shortened or rejected. `ffprobe` gives the
     real duration for `video_duration_seconds`.
   - `ffmpeg` is not installed: `brew install ffmpeg` first.
5. Save the converted file as `seed/media/<district>/<slug>.jpg|mp4`.
6. Add one line to `seed/media/CREDITS.md`: file, title, author, licence and licence URL, source URL, "resized" or
   "re-encoded, shortened to N s, sound removed". Also add the same data to `seed/media/manifest.json`, which the seed
   script and the tests read.
7. CC BY and CC BY-SA posts end with a credit line in the caption, e.g. "Photo: Shagil Kannur, CC BY-SA 4.0,
   Wikimedia Commons". CC0 and public domain files get the same line, for honesty.

**Targets:**
- about 24 photos and about 10 videos (48 posts: about 50 % photo, about 20 % video, the rest text);
- at least 4 photos per district theme: Kannur coconut / arecanut / pepper / cashew; Pathanamthitta banana / rubber /
  tapioca; Idukki cardamom / tea / pepper; Kottayam paddy / rubber / kitchen garden;
- if fewer good videos are found, those posts become photo posts. No video is used just to reach a number.

### C4. Upload path (same as the app)
New script `scripts/production/seed-feed.mjs`:
- dry run by default;
- uploads as each author to `post-images/<uid>/…` or `post-videos/<uid>/…`;
- inserts the post as that author (RLS applies; the server sets the district), then likes and comments as other seed
  authors;
- idempotent by (author, caption).

It needs the 50 seed accounts, so it is **blocked until the staging service key is added** (seed-community first).

### C5. Verify
- New `tests/unit/feed-content.test.mjs`:
  - 48 posts, district split 16/16/8/8;
  - every author exists in `seed-lib` and lives in the post's district;
  - no duplicate captions, no repeated first five words;
  - categories are valid;
  - every media file in `manifest.json` exists, is within the size limits and has an allowed licence plus a credit
    line in its caption;
  - no "test" / "demo" / "lorem" / "user \d" words.
- Staging checks:
  - `get_feed` for one user per district returns local posts first;
  - three pages with no repeats;
  - all media URLs load (HTTP 200).
- Playwright (staging build): the feed shows image, video and text cards; no visible text matches
  `/test user|demo|lorem|e2e/i` on the feed, Catch Up, search, chat list and notifications for a seed farmer.
- Phone (staging APK): scroll the feed, play a video, open profiles, the expert list and chat; screenshots; check that
  no test name is visible.

---

## D. Decisions needed from you
| ID | Question | Default if you don't say |
|---|---|---|
| D1 | Production "User Two", "Dr. Ramesh Expert" (fixture), "Dr. Anita Rao", "Anandh " | **decided 2026-10-28: keep all unchanged** (B5 is not run) |
| D2 | Photo/video source | **decided: openly licensed with credits (C3)** |
| D3 | Staging fixture names in B1 | **decided 2026-10-28: the proposed names** (Anil Varghese, Deepa Kurian, Manoj Pillai, Sreelakshmi Nair, Ramesh Menon, AgroConnect Admin) |
| D4 | Add `STAGING_SUPABASE_SERVICE_ROLE_KEY` to `.env.staging` (needed for B4, the 50-user seed and C4) | B4/C4 blocked |
| D5 | Send the rest of the prompt after "I want the fe…" | Part C as written |

## E. Order of work (after the decisions)
1. B6 and B1 (code and tests), with the test suites run.
2. B2: rename the staging fixtures, then rerun `npm run test:staging` and Playwright.
3. B3: staging clean-up (counts shown first).
4. With the key (D4):
   1. seed the 50 demo users;
   2. build C2 / C3 content;
   3. C4: seed the feed;
   4. B4: test clean-up hooks.
   Before C4: `brew install ffmpeg`, then fetch, check and convert the media (C3) and commit the converted files with
   `CREDITS.md`.
5. C5 verification (unit, staging, Playwright, phone).
6. Production: no account changes (D1: keep). Production feed seeding only after you approve the staging result.

---

## F. Status (2026-10-28, end of implementation)
| Step | Status |
|---|---|
| B6: unused `src/mock/` removed, Search hint changed | DONE |
| B1: names in `tests/fixtures/staging-accounts.json` (+ `.mjs`); all tests and scripts read them; regression test "no Test User literals" | DONE |
| B2: staging test accounts renamed (Anil Varghese, Deepa Kurian, Manoj Pillai, Sreelakshmi Nair, Ramesh Menon, AgroConnect Admin); metadata `synthetic`/`fixture` set | DONE (staging) |
| B3: leftover "Delete Me (staging test)" deleted; R2–R5 run once (2,652 notifications, 10 conversations / 156 messages, 389 bookings + 269 payments / 143 adjustments / 389 meetings / 35 reviews, 195 slots) | DONE (staging); SQL in `scripts/sql/staging_cleanup_test_traffic.sql` |
| B4: `tests/e2e/cleanup.mjs` in the `after()` of the three booking/messaging staging files + Playwright `globalTeardown` | DONE in code; **no-op until `STAGING_SUPABASE_SERVICE_ROLE_KEY` is in `.env.staging`** |
| B5: production accounts | not run (D1: keep) |
| C3 media | DONE: 22 photos + 6 videos (Wikimedia Commons; CC BY / CC BY-SA / CC0 / public domain), looked at one by one. One photo replaced (watermark); one video rejected (close-up faces). `seed/media/CREDITS.md`, `manifest.json` |
| C3 tooling change | `ffmpeg` could not be installed (no Homebrew bottle for macOS 13 Intel; building its Python dependency fails with this compiler). Videos use Wikimedia's own 360p MPEG-4 version, re-encoded with macOS AVFoundation (`scripts/production/video-export.swift`): H.264, video only. |
| C2 content | DONE: 48 posts (16/16/8/8; 22 photo, 6 video, 20 text), comments included; `scripts/production/feed-content.mjs`, `tests/unit/feed-content.test.mjs` |
| C4: `scripts/production/seed-feed.mjs` (uploads as each author; idempotent; spreads dates over 45 days) | written; `--plan` works; **blocked: needs the staging service key** (and the 50 demo accounts first) |
| Tests | lint 0 errors; `npm test` 27 + 62 + 132 pass; `npm run test:staging` 58/58 (no skips); Playwright 53/53, all with the renamed accounts |

**To finish C4 after adding the key:**
1. `node scripts/production/seed-community.mjs --target staging --execute --demo-credentials`
2. `node scripts/production/seed-feed.mjs --target staging` (dry run)
3. `node scripts/production/seed-feed.mjs --target staging --execute`
4. C5 staging and phone checks.
