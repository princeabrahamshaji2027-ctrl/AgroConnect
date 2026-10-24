-- PROPOSED — NOT APPLIED. AUD-003 (Critical, suspected).
-- profiles_update (20260814_profiles_rls_fix.sql) lets a user update *any column* of their own row,
-- including `role`. is_admin() trusts profiles.role, so `update profiles set role = 'Admin' where id = auth.uid()`
-- from the browser console would grant full admin rights unless some trigger outside the repo prevents it.
-- Run 00_readonly_verification.sql section 3 first; if no such trigger exists, apply this.

create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
-- SECURITY INVOKER on purpose: the check below relies on current_user being the caller's role.
set search_path = public
as $$
begin
  -- Only enforce for statements sent straight from a client: PostgREST runs them as anon/authenticated.
  -- Inside SECURITY DEFINER functions (admin RPCs, counter triggers, the auth signup trigger) current_user is the
  -- function owner, and service-role scripts run as service_role, so those keep working.
  if current_user not in ('anon', 'authenticated') or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role is distinct from 'Farmer' then
      raise exception 'role can only be assigned by an administrator' using errcode = '42501';
    end if;
    return new;
  end if;

  -- A user may step down from Expert to Farmer ("Leave expert mode" in Connect.jsx); nothing else.
  if new.role is distinct from old.role
     and not (old.role = 'Expert' and new.role = 'Farmer') then
    raise exception 'role can only be changed by an administrator' using errcode = '42501';
  end if;

  if new.is_banned is distinct from old.is_banned
     or new.ban_reason is distinct from old.ban_reason
     or new.banned_at is distinct from old.banned_at
     or new.follower_count is distinct from old.follower_count
     or new.post_count is distinct from old.post_count then
    raise exception 'this field can only be changed by an administrator' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_privileged_columns on public.profiles;
create trigger protect_profile_privileged_columns
  before insert or update on public.profiles
  for each row execute function public.protect_profile_privileged_columns();

-- NOTE: if follower_count/post_count are maintained by triggers that are NOT security definer, they run as the
-- calling user and will now be rejected. Check 00_readonly_verification.sql section 9 before applying.
