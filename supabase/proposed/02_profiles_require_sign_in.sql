-- PROPOSED — NOT APPLIED. AUD-008 (High, confirmed live 2026-10-24 with `npm run test:rls`).
-- The live database lets an unauthenticated caller holding the public anon key read every profile
-- (including `phone` and `ban_reason`), every farmer_profile and the whole followers graph.
-- The repo's profiles_select policy is "own row or admin", so a broader policy was added outside the repo.
--
-- RESTRICTIVE policies are ANDed with every permissive policy, so this closes anonymous access without having
-- to know the names of the live permissive policies. Signed-in users keep their current access.
-- Re-runnable.

drop policy if exists profiles_no_anonymous_read on public.profiles;
create policy profiles_no_anonymous_read on public.profiles
  as restrictive for select to anon using (false);

drop policy if exists farmer_profiles_no_anonymous_read on public.farmer_profiles;
create policy farmer_profiles_no_anonymous_read on public.farmer_profiles
  as restrictive for select to anon using (false);

drop policy if exists followers_no_anonymous_read on public.followers;
create policy followers_no_anonymous_read on public.followers
  as restrictive for select to anon using (false);

-- Remaining risk after this: any signed-in user can still read other users' `phone`. Fixing that needs either a
-- `public_profiles` view without `phone` or moving `phone` to an owner-only table; both change how the app
-- queries profiles (select('*') is used widely), so they are left for a separate, approved change.
--
-- keep-alive.js pings `profiles` with the anon key. After this change it gets 0 rows but no error, so the
-- ping still succeeds.
-- Rollback: drop the three policies above.
