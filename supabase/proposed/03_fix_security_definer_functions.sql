-- PROPOSED — NOT APPLIED. AUD-012 (Medium).
-- 1. 20260814_profiles_rls_fix.sql defines is_banned() as `... AND status = 'Banned'`, but the live
--    profiles table has no `status` column (it has `is_banned boolean`). Depending on what is deployed, the
--    function either failed to create or errors at runtime — either way the "banned users cannot edit their
--    profile" clause of profiles_update is not doing what it says.
-- 2. SECURITY DEFINER functions without `set search_path` can be hijacked via objects in a schema earlier in
--    the caller's search_path (Supabase linter: function_search_path_mutable).

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'Admin');
$$;

create or replace function public.is_banned()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_banned = true);
$$;

alter function public.admin_update_booking_status(uuid, varchar, text) set search_path = public;
-- Repeat `alter function ... set search_path = public` for every function listed by section 5 of
-- 00_readonly_verification.sql (approve_expert_application, ban_user, send_broadcast, ... live only in the DB).
