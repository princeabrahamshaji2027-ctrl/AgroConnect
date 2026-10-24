-- PROPOSED — NOT APPLIED. AUD-008 (High, confirmed live 2026-10-24 with `npm run test:rls`).
-- The live database lets an unauthenticated caller holding the public anon key read every profile
-- (including `phone` and `ban_reason`), every farmer_profile and the whole followers graph.
-- The repo's profiles_select policy is "own row or admin", so a broader policy was added outside the repo.
--
-- Step 1: find the permissive policies (00_readonly_verification.sql section 1) and drop them by name, e.g.
--   drop policy "<name shown for profiles with roles {public} or {anon}>" on public.profiles;
--
-- Step 2: re-grant read access to signed-in users only (the app needs other users' names/avatars).

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);

drop policy if exists "farmer_profiles_select_authenticated" on public.farmer_profiles;
create policy "farmer_profiles_select_authenticated" on public.farmer_profiles
  for select to authenticated using (true);

drop policy if exists "followers_select_authenticated" on public.followers;
create policy "followers_select_authenticated" on public.followers
  for select to authenticated using (true);

-- Remaining risk after this: any signed-in user can still read other users' `phone`. Fixing that needs either a
-- `public_profiles` view without `phone` or moving `phone` to an owner-only table; both change how the app
-- queries profiles (select('*') is used widely), so they are left for a separate, approved change.
--
-- Also check: keep-alive.js pings `profiles` with the anon key. After this change it gets 0 rows but no error,
-- so the ping still succeeds.
