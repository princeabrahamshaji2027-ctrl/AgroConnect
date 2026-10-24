-- EXACT RESTORE of every object changed by supabase/proposed 01, 02, 03, 07, 08 on production (2026-10-24).
-- Generated from supabase/schema/live_schema_20261024.sql, which was re-verified byte-identical to production
-- (md5 0c0bd1d08f4a927932f7c3c1ff52e491) immediately before the scripts were applied. These scripts change no table
-- rows, so this file plus the export is a complete recovery path for them. Run as postgres (SQL editor).
-- WARNING: restoring re-opens the Admin-signup hole, self-promotion and the CV leak.

-- ---- 08: publication was empty
do $$ declare t text; begin
  for t in select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' loop
    execute format('alter publication supabase_realtime drop table public.%I', t);
  end loop;
end $$;

-- ---- 07: original storage policies
drop policy if exists "post-videos-insert" on storage.objects;

create policy "expert-cvs-insert" on storage.objects as permissive for INSERT to authenticated
  with check ((bucket_id = 'expert-cvs'::text));

create policy "expert-cvs-select" on storage.objects as permissive for SELECT to authenticated
  using ((bucket_id = 'expert-cvs'::text));

create policy "post-videos-insert" on storage.objects as permissive for INSERT to authenticated
  with check ((bucket_id = 'post-videos'::text));


-- ---- 02: remove restrictive anon policies
drop policy if exists profiles_no_anonymous_read on public.profiles;
drop policy if exists farmer_profiles_no_anonymous_read on public.farmer_profiles;
drop policy if exists followers_no_anonymous_read on public.followers;

-- ---- 01: remove guards
drop trigger if exists protect_profile_privileged_columns on public.profiles;
drop function if exists public.protect_profile_privileged_columns();
drop trigger if exists guard_experts_insert on public.experts;
drop function if exists public.guard_experts_insert();
drop function if exists public.is_client_request();

-- ---- 01 + 03: original function definitions (CREATE OR REPLACE also resets SECURITY/SET attributes)

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'Farmer'::public.user_role)
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'Admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_banned()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select coalesce((select is_banned from public.profiles where id = auth.uid()), false);
$function$
;

CREATE OR REPLACE FUNCTION public.handle_comment_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if (TG_OP = 'INSERT') then
    update public.posts
    set comment_count = comment_count + 1
    where id = new.post_id;
    return new;
  elsif (TG_OP = 'DELETE') then
    update public.posts
    set comment_count = comment_count - 1
    where id = old.post_id;
    return old;
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_community_member_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if (TG_OP = 'INSERT') then
    update public.communities
    set member_count = member_count + 1
    where id = new.community_id;
    return new;
  elsif (TG_OP = 'DELETE') then
    update public.communities
    set member_count = member_count - 1
    where id = old.community_id;
    return old;
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_like_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if (TG_OP = 'INSERT') then
    update public.posts
    set like_count = like_count + 1
    where id = new.post_id;
    return new;
  elsif (TG_OP = 'DELETE') then
    update public.posts
    set like_count = like_count - 1
    where id = old.post_id;
    return old;
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_profile_post_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if (TG_OP = 'INSERT') then
    update public.profiles
    set post_count = post_count + 1
    where id = new.user_id;
    return new;
  elsif (TG_OP = 'DELETE') then
    update public.profiles
    set post_count = post_count - 1
    where id = old.user_id;
    return old;
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_review_rating()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  update public.experts
  set rating = coalesce((
    select avg(rating)::numeric(2,1)
    from public.reviews
    where expert_id = coalesce(new.expert_id, old.expert_id)
  ), 0.0)
  where id = coalesce(new.expert_id, old.expert_id);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_follower_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET follower_count = follower_count + 1 WHERE id = NEW.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET follower_count = follower_count - 1 WHERE id = OLD.following_id;
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_update_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;


-- ---- 03: remove pinned search_path from the remaining functions and restore default EXECUTE grants
do $$ declare f record; begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('admin_update_booking_status','approve_expert_application',
              'approve_expert_resignation','approve_seller','ban_user','demote_expert','place_order',
              'reject_expert_application','reject_seller','resolve_report','send_broadcast') loop
    execute format('alter function %s reset search_path', f.sig);
  end loop;
end $$;
grant execute on all functions in schema public to public, anon, authenticated, service_role;
