# PROMPT FOR ANTIGRAVITY — Fix Admin Login at the Database Layer + Repo Cleanup

## PART 1 — The login bug (do this first, it's the priority)

The React code for admin login (`admin-dashboard/src/App.jsx`, `admin-dashboard/src/pages/Login.jsx`)
has already been verified correct in this repo — there is no competing state-setter, no race
condition, the `profile === undefined` (loading) vs `profile === null` (failed) states are properly
separated. If the bug is still happening, the code is not the cause. Do not re-edit `App.jsx` or
`Login.jsx` before completing the diagnostic below — editing working code while chasing a database-side
bug just adds risk without addressing the actual cause.

### Step 1 — Use the Supabase MCP connection to check the live RLS policy directly

Run this against the live project:
```sql
select policyname, cmd, qual from pg_policies where tablename = 'profiles';
```
Look specifically at the `select` policy's `qual` (the `USING` clause). The bug this is checking for:
if an admin's own profile row can only be read via a check that itself requires reading that same row
first (e.g. a `select` policy that only allows access via `is_admin()`, where `is_admin()` internally
runs `select role from profiles where id = auth.uid()`), the very first read is blocked by the same
rule it's trying to satisfy — so the admin's own profile fetch returns zero rows, `profile` stays
`null` in the app, and `App.jsx` correctly (from the code's perspective) treats that as "not an admin"
and signs them back out. This reproduces the exact symptom — looks like a login bug, is actually a
data-access bug — every time, for every admin account, unconditionally.

**If the `select` policy does not include `id = auth.uid()` as a standalone allowed condition, fix it
now:**
```sql
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or public.is_admin());
```
(Use the actual current policy name from the `pg_policies` query above if it differs from
`profiles_select` — do not assume the name, confirm it first.)

### Step 2 — Confirm the account's role value is exactly correct

```sql
select id, email, role, length(role::text) as len from public.profiles p
join auth.users u on u.id = p.id
where u.email = 'prince@agroconnect.com';
```
Confirm `role` is exactly `Admin` — capital A, no extra characters, no whitespace. If it's anything
else (`admin`, `Admin ` with trailing space, etc.), fix the row directly:
```sql
update public.profiles set role = 'Admin' where id = '<the id from the query above>';
```

### Step 3 — Reproduce and confirm

After Step 1 and/or Step 2's fix, log in as the admin in a fresh incognito/private window (to rule out
a stale cached session hiding whether the fix worked) and confirm it succeeds on the first attempt.
Check the browser console for the diagnostic log already present in `App.jsx`
(`console.error('Bounced to login — profile:', ...)`) — it should no longer appear at all once this is
fixed. If it still appears, paste the exact object it logs — that tells us precisely what `profile`
and `session` looked like at the moment of failure, which is more useful than guessing further.

### Step 4 — Commit the schema so this can't silently drift again

Once the correct RLS policy is confirmed live and working, add it to version control — right now
`supabase/migrations/` has only one 9-line file, and the actual security policies protecting this
database exist only inside the Supabase dashboard where they can't be reviewed, diffed, or rolled
back. Create `supabase/migrations/<timestamp>_profiles_rls_fix.sql` containing the corrected policy
from Step 1, and separately export/commit the **full current set** of RLS policies across every table
(not just this one) as a baseline migration, so the actual live security configuration has a record in
this repo going forward.

---

## PART 2 — Repo cleanup (lower priority, do after Part 1 is confirmed working)

### Rotate and stop committing the admin password
`user.md` currently contains the live admin password (`prince@agroconnect.com` / `Prince@1234`) in
plain text, and this is a public repository. This has already been flagged once and is still present
in the latest commit. Rotate this password in the Supabase dashboard now, and remove real credentials
from `user.md` going forward — if a credentials reference file is genuinely useful for development,
add it to `.gitignore` and keep it local-only, never committed.

### Delete orphaned admin page files
`admin-dashboard/src/pages/Reviews.jsx`, `Banners.jsx`, `Broadcasts.jsx`, and `Analytics.jsx` still
exist in the repo even though their sidebar entries and `App.jsx` routes were correctly removed in an
earlier pass. They're unreachable dead code — delete the files themselves rather than leaving them
behind.

### Remove stale unused assets
- `public/animation.mp4` (1.8 MB) — this was the old splash video, replaced by the Lottie animation.
  Nothing references it anymore (`Splash.jsx` now uses the Lottie file). Delete it.
- `src/assets/logo.png` (466 KB) — appears to be a leftover duplicate; the app now uses
  `src/assets/logo.jpg` per the branding rules in `Rules.md`. Confirm nothing imports `logo.png` and
  delete it if so.

---

## VERIFICATION

- [ ] `pg_policies` on `profiles` confirmed to include `id = auth.uid()` in the select policy (not
      only `is_admin()`)
- [ ] The admin account's `role` value confirmed to be exactly `Admin`
- [ ] Fresh incognito login as admin succeeds on the first attempt, five times in a row
- [ ] The `console.error('Bounced to login'...)` diagnostic no longer fires during a normal login
- [ ] RLS policies are now committed to `supabase/migrations/`, not only live in the dashboard
- [ ] Admin password has been rotated; `user.md` no longer contains a real, working password
- [ ] Reviews.jsx, Banners.jsx, Broadcasts.jsx, Analytics.jsx deleted from admin-dashboard/src/pages
- [ ] public/animation.mp4 and src/assets/logo.png removed if confirmed unused