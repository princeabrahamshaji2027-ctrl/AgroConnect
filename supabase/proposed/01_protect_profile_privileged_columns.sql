-- PROPOSED — NOT APPLIED. Privilege escalation fixes, written against the real live schema
-- (supabase/schema/live_schema_20261024.sql). Re-runnable. Tested: npm run test:db.
--
-- Confirmed live on 2026-10-24 (read-only inspection):
--  AUD-003b CRITICAL  handle_new_user() copies raw_user_meta_data->>'role' into profiles.role, so anyone holding the
--                     public anon key can sign up with {"role":"Admin"} and become an administrator.
--  AUD-003  CRITICAL  profiles_update lets a user update every column of their own row, including role/is_banned.
--  AUD-040  HIGH      experts_insert lets any user insert their own experts row = expert without admin approval.
--  AUD-041  MEDIUM    counter trigger functions run as the caller, so RLS silently drops follower_count /
--                     like_count / comment_count / rating updates on other users' rows (counts drift).
-- No account has exploited the signup hole yet (no user has role metadata 'Admin').

-- Clients reach PostgREST as anon/authenticated. Inside SECURITY DEFINER functions current_user is the owner,
-- so trusted server code passes these checks.
create or replace function public.is_client_request() returns boolean
language sql stable set search_path = public as $$ select current_user in ('anon', 'authenticated') $$;

-- 1. Signup can never choose a role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), 'Farmer'::public.user_role);
  return new;
end;
$$;

-- 2. Counter triggers run with the owner's rights (also required so the guard below does not reject them).
alter function public.handle_comment_count() security definer set search_path = public;
alter function public.handle_community_member_count() security definer set search_path = public;
alter function public.handle_like_count() security definer set search_path = public;
alter function public.handle_profile_post_count() security definer set search_path = public;
alter function public.handle_review_rating() security definer set search_path = public;
alter function public.update_follower_count() security definer set search_path = public;

-- 3. Clients cannot change role, ban fields or counters on profiles.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
-- SECURITY INVOKER on purpose: the check relies on current_user being the caller's role.
set search_path = public
as $$
begin
  if not public.is_client_request() or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.role is distinct from 'Farmer' then
      raise exception 'role can only be assigned by an administrator' using errcode = '42501';
    end if;
    return new;
  end if;
  -- "Leave expert mode" (Connect.jsx) lets an expert step down to Farmer; nothing else.
  if new.role is distinct from old.role and not (old.role = 'Expert' and new.role = 'Farmer') then
    raise exception 'role can only be changed by an administrator' using errcode = '42501';
  end if;
  if new.is_banned is distinct from old.is_banned or new.ban_reason is distinct from old.ban_reason
     or new.banned_at is distinct from old.banned_at or new.follower_count is distinct from old.follower_count
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

-- 4. Expert status only through approve_expert_application() (or an admin).
create or replace function public.guard_experts_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_client_request() and not public.is_admin() then
    raise exception 'expert status is granted by an administrator' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_experts_insert on public.experts;
create trigger guard_experts_insert before insert on public.experts
  for each row execute function public.guard_experts_insert();
