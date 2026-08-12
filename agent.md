# PROMPT FOR ANTIGRAVITY — Demo Data Seeding System (Supabase, extends seed-demo-users.js)

This builds on the existing `seed-demo-users.js` pattern already in the repo — same architecture
(Node script, `@supabase/supabase-js` Admin API, `service_role` key from an env var, never committed).
Do not introduce Django or any other backend framework — this project has none, and none is needed;
the Supabase Admin API already gives correct password hashing and auth handling without one.

**Volume**: build for the "development/demo" tier, not millions of rows — 800 users, ~6,000 posts,
~25,000 comments, realistic likes/notifications on top. This is enough to make every screen, filter,
and admin chart look fully populated without bloating the database or making seeding slow. A `--scale`
flag (see Phase 4) allows re-running at a larger size later if actually needed for stress testing.

---

## SECURITY FIRST — fix before anything else in this prompt

1. Rotate the `prince@agroconnect.com` admin account's password in the Supabase dashboard right now —
   the current one is exposed in the public GitHub repo's commit history and will remain recoverable
   there even after the file is changed.
2. Add a `.env` file (gitignored) holding `SUPABASE_SERVICE_ROLE_KEY`, and confirm `.env` is listed in
   `.gitignore`. Never hardcode a password or the service role key directly in any `.js` file again,
   demo data or otherwise.
3. Add `is_test` as a real column so seeded accounts can always be told apart from real ones and wiped
   cleanly:
```sql
alter table public.profiles add column if not exists is_test boolean not null default false;
create index if not exists idx_profiles_is_test on public.profiles(is_test);

alter table public.posts add column if not exists is_test boolean not null default false;
alter table public.comments add column if not exists is_test boolean not null default false;
alter table public.products add column if not exists is_test boolean not null default false;
alter table public.likes add column if not exists is_test boolean not null default false;
alter table public.notifications add column if not exists is_test boolean not null default false;
```

---

## PHASE 1 — Project structure

Organize under a new `seed/` folder at the project root (not inside `src/`, this never ships to the
app bundle):
```
seed/
  index.js              — orchestrator, runs generators in dependency order
  cleanup.js            — deletes everything where is_test = true
  generators/
    users.js
    posts.js
    comments.js
    likes.js
    marketplace.js
    expert-qa.js
    notifications.js
  lib/
    supabaseAdmin.js     — the admin client, reused from seed-demo-users.js's pattern
    randomHelpers.js      — shared random pickers (Indian states, crop names, etc.)
```
Install: `npm install --save-dev @faker-js/faker`.

`seed/lib/supabaseAdmin.js`:
```js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in .env before running seed scripts.');
  process.exit(1);
}

module.exports = createClient(
  process.env.SUPABASE_URL || 'https://mgreapakfchcxcrauheq.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
```

---

## PHASE 2 — Generators (agriculture-context, not generic Faker defaults)

### `generators/users.js`
Use `@faker-js/faker`'s `en_IN` locale where available for names, and a hand-written pool of Indian
states/districts (Punjab, Kerala, Maharashtra, Karnataka, Uttar Pradesh, Tamil Nadu, etc.) for
location — generic Faker city names won't read as authentically Indian agricultural users.
```js
const ROLE_WEIGHTS = [
  { role: 'Farmer', weight: 0.70 },
  { role: 'Seller', weight: 0.15 },
  { role: 'Expert', weight: 0.10 },
  { role: 'Distributor', weight: 0.05 }, // if this role exists in your enum; otherwise fold into Seller
];

// For each fake user:
// - email: faker-generated but must be unique and end in a clearly fake domain, e.g. `@seedtest.agroconnect.local`
//   so seeded accounts can never collide with or be mistaken for real signups
// - password: a single shared strong-but-known demo password (e.g. crypto-random per user, doesn't
//   matter — nobody needs to log into 800 fake accounts individually)
// - Create via adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })
// - Upsert into profiles with is_test: true, role, location (from the Indian state/district pool),
//   profile_image_path set to a DiceBear URL: `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(fullName)}`
// - For Expert-role users, also insert a matching row into `experts` (specialization from a pool:
//   'Soil Health', 'Pest Control', 'Organic Farming', 'Irrigation', 'Crop Disease', etc.)
// - For Seller-role users, also insert a matching row into `seller_profiles`
```
Batch this with Supabase Admin API's rate limits in mind — `createUser` calls cannot be parallelized
without limit; run them in small concurrent batches (10-20 at a time) with a short delay between
batches, not all 800 at once, or you'll hit rate limiting and get partial failures.

### `generators/posts.js`
This is the one that replaces the "scrape a news site" idea — realistic, synthetic, agriculture-themed
posts, not copied articles. Build a template pool with placeholders filled from Faker + crop/location
data, e.g.:
```js
const POST_TEMPLATES = [
  "🌾 {crop} harvest looking great this season in {location}! {sentiment}",
  "Need advice — my {crop} leaves are showing {symptom}. Any experts around?",
  "Just tried {technique} on my farm and the results are {sentiment2}. Recommend to fellow farmers.",
  "Selling fresh {crop} directly from the farm in {location}. DM for details.",
  "Weather has been {weather} this week — how is everyone's {crop} holding up?",
  "Attended a workshop on {technique} today, learned a lot. Sharing what I learned soon.",
  // 15-20 total templates covering: harvest updates, questions to experts, technique sharing,
  // produce-for-sale mentions, weather/crop condition chat, community shoutouts
];
```
Fill `{crop}` from a pool of real Indian crops (rice, wheat, sugarcane, cotton, tomato, chili, banana,
coconut, tea, coffee, etc.), `{location}` from the same state/district pool used for users,
`{technique}` from real farming methods (drip irrigation, crop rotation, vermicomposting, organic
pest control, mulching), and pick 1-3 posts per fake user, with `image_path` set to
`https://picsum.photos/seed/${postId}/800/600` for a deterministic, varied placeholder photo per post,
`status: 'Approved'`, `is_test: true`, and a randomized `created_at` spread across the last 90 days
(not all "now") so the feed's timestamps look organic rather than a visible bulk-insert timestamp
cluster.

### `generators/comments.js`
Short template pool ("Great work! 👏", "What's the yield like?", "Nice crop!", "How much per kg?",
"Following your farm's journey, keep it up", "Which fertilizer did you use?") — attach 0-8 comments
per seeded post, from other seeded users, `is_test: true`, randomized timestamps after the post's own
`created_at`.

### `generators/likes.js`
For each seeded post, insert a random 5-150 `likes` rows from random seeded users (respecting the
`unique(post_id, user_id)` constraint — dedupe user selection per post), `is_test: true`. Let the
existing database trigger recompute `posts.like_count` from these — don't manually set the counter
column from the seed script, that would double up with the trigger.

### `generators/marketplace.js`
For each seeded Seller-role user, insert 2-8 products using a template pool of real agricultural
products (Organic Fertilizer, Neem Oil, Vermicompost, Drip Irrigation Kit, Bio Pesticide, Seed
varieties, farming tools), realistic INR pricing ranges per product type, `image_path` via
`picsum.photos`, `is_test: true`.

### `generators/expert-qa.js`
For a subset of seeded Farmer users, create posts/comments framed as questions directed at Experts
(reuses the posts/comments tables — there's no separate Q&A table in the current schema; if a
dedicated distinction is wanted later, that's a schema decision to raise separately, not part of this
seed pass) using a template pool: "Why are my {crop} leaves turning yellow?", "Best time to plant
{crop} in {location}?", "How do I treat {symptom} on {crop}?" — and have a random seeded Expert reply
via `comments`.

### `generators/notifications.js`
For realism in the Notifications screen, insert a batch of `notifications` rows for a handful of the
seeded users (not all 800 — just enough, e.g. 30-50, so a demo login into a specific seeded account
shows a populated notifications feed), using the real `type` enum values already defined
(`like`, `comment`, `announcement`), `is_test: true`.

---

## PHASE 3 — Orchestration and cleanup

`seed/index.js` runs generators in dependency order (users → experts/sellers → posts → comments →
likes → marketplace → notifications), logs progress per phase (`✅ 800 users created`,
`✅ 6000 posts created`, etc.), and wraps each generator's bulk inserts in batches of ~500 rows per
`.insert()` call rather than one row at a time — Supabase/Postgres handles large batched inserts far
faster than thousands of individual round-trips, which is the actual performance lesson from the
"Method 2 is fast" observation in the source document, achieved here without bypassing Supabase Auth
for the user-creation step where correctness (password hashing) actually matters.

`seed/cleanup.js`:
```js
// Delete in reverse dependency order so foreign keys don't block deletion:
await supabaseAdmin.from('notifications').delete().eq('is_test', true);
await supabaseAdmin.from('likes').delete().eq('is_test', true);
await supabaseAdmin.from('comments').delete().eq('is_test', true);
await supabaseAdmin.from('products').delete().eq('is_test', true);
await supabaseAdmin.from('posts').delete().eq('is_test', true);
// Then delete the actual auth users (this cascades to profiles/experts/seller_profiles via FK):
const { data: testProfiles } = await supabaseAdmin.from('profiles').select('id').eq('is_test', true);
for (const p of testProfiles) {
  await supabaseAdmin.auth.admin.deleteUser(p.id);
}
console.log(`✅ Cleaned up ${testProfiles.length} test users and all their content.`);
```

Add both as `package.json` scripts:
```json
"scripts": {
  "seed": "node seed/index.js",
  "seed:cleanup": "node seed/cleanup.js"
}
```

---

## PHASE 4 — Scale flag (optional, only if actually needed later)

Support `npm run seed -- --scale=small|medium|large` mapping to:
- `small` (default): 800 users, ~6,000 posts — this is what Phase 1-3 above targets.
- `medium`: 5,000 users, ~40,000 posts — only run this against a staging project, never production.
- `large`: reserved for explicit stress-testing only, not for demo purposes — do not run this without
  a specific reason, per the source document's own caution about unnecessary million-row seeds
  slowing down normal development.

---

## PHASE 5 — News module (the legitimate way to use Krishi Jagran content)

Separately from the fake-post seeding above: for the `news` table, pull a small number (10-20) of
**real, current** articles from Krishi Jagran's own published RSS feed if they provide one (check
`krishijagran.com` for a `/rss` or similar published feed — using a site's own provided RSS feed is
the legitimate, intended way to redistribute headlines/summaries), storing only `title`,
a short excerpt (not the full article body), `source: 'Krishi Jagran'`, and a `link` back to the
original article on their site for the full read. Do not scrape article bodies wholesale, and do not
attribute these to any fake user — they populate the News module as News, exactly matching how
the schema already models it. If no public RSS feed exists, use a small hand-curated set of real
recent headlines with proper source links instead of automated scraping.

---

## VERIFICATION

- [ ] Admin account password has been rotated (see Security First section) before this seed data is
      even generated, independent of everything else in this prompt
- [ ] `.env` holds the service role key; `.gitignore` excludes it; nothing in the repo history after
      this point contains a real secret
- [ ] Running `npm run seed` populates ~800 users, ~6,000 posts, comments, likes, products, and
      notifications, all tagged `is_test = true`, in a reasonable time (batched inserts, not one row
      at a time)
- [ ] Every mobile screen (Feed, Search, Marketplace, Connect/Nearby Experts, Notifications) and every
      admin screen (Dashboard KPIs/charts, Users, Experts, Products, Orders) shows populated, varied,
      realistic-looking data after seeding
- [ ] Running `npm run seed:cleanup` removes every seeded row and leaves real accounts (like your own)
      completely untouched
- [ ] News module shows real Krishi Jagran headlines with correct source attribution and working links
      back to the original articles — not full article text, and not attributed to any fake user