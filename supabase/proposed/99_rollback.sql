-- ROLLBACK for 01, 02, 05, 07, 08. Run sections in reverse order of application. Tested in tests/db.
-- Not rolled back on purpose: 03 (helper hardening), 04 (additive columns/index), 06 (fixture data), and in 01 the
-- handle_new_user() fix and SECURITY DEFINER counter triggers — restoring those would only re-open holes.
-- After rolling back 05 the OLD client code (direct table writes) works again; the NEW client code does not.

-- ---- undo 08
do $$
declare t text;
begin
  foreach t in array array['notifications', 'messages', 'posts', 'reports', 'expert_applications', 'orders'] loop
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

-- ---- undo 07 (re-opens the CV exposure — only if uploads break)
drop policy if exists "post-videos-insert" on storage.objects;
create policy "post-videos-insert" on storage.objects as permissive for insert to authenticated
  with check (bucket_id = 'post-videos'::text);
drop policy if exists "expert-cvs-insert" on storage.objects;
create policy "expert-cvs-insert" on storage.objects as permissive for insert to authenticated
  with check (bucket_id = 'expert-cvs'::text);
drop policy if exists "expert-cvs-select" on storage.objects;
create policy "expert-cvs-select" on storage.objects as permissive for select to authenticated
  using (bucket_id = 'expert-cvs'::text);

-- ---- undo 05
drop trigger if exists guard_notifications_insert on public.notifications;
drop trigger if exists guard_consultation_slots on public.consultation_slots;
drop trigger if exists guard_experts_update on public.experts;
drop trigger if exists guard_reviews_insert on public.reviews;
drop policy if exists bookings_participants_only on public.consultation_bookings;
drop policy if exists video_meetings_participants_only on public.video_meetings;
grant insert, update, delete on public.consultation_bookings to authenticated;
grant insert, update, delete on public.video_meetings to authenticated;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'consultation-lifecycle';
  end if;
end $$;
drop function if exists public.process_consultation_lifecycle(timestamptz);
drop function if exists public.book_consultation_slot(uuid, text);
drop function if exists public.cancel_consultation_booking(uuid, text, jsonb);
drop function if exists public.join_consultation(uuid);
drop function if exists public.complete_consultation(uuid);
drop function if exists public.admin_settle_refund(uuid, boolean, text);
drop function if exists public.admin_retry_refund(uuid);
drop function if exists public._booking_party(public.consultation_bookings);
drop function if exists public._notify(uuid, text, text, uuid);
drop function if exists public._notify_admins(text, text, uuid);
drop function if exists public.guard_notifications_insert();
drop function if exists public.guard_consultation_slots();
drop function if exists public.guard_experts_update();
drop function if exists public.guard_reviews_insert();
-- The NOT VALID check constraint is harmless to keep (one_booking_per_slot existed before 05):
-- alter table public.consultation_bookings drop constraint if exists consultation_bookings_refund_status_check;
-- (consultation_start, app_timezone, is_client_request are pure helpers and are left in place.)

-- ---- undo 02
drop policy if exists profiles_no_anonymous_read on public.profiles;
drop policy if exists farmer_profiles_no_anonymous_read on public.farmer_profiles;
drop policy if exists followers_no_anonymous_read on public.followers;

-- ---- undo 01
drop trigger if exists protect_profile_privileged_columns on public.profiles;
drop function if exists public.protect_profile_privileged_columns();
drop trigger if exists guard_experts_insert on public.experts;
drop function if exists public.guard_experts_insert();

-- ---- undo 23 (numeric ranges) --------------------------------------------------------------------------------
alter table public.experts drop constraint if exists experts_meeting_duration_range;
alter table public.experts drop constraint if exists experts_buffer_time_range;
alter table public.products drop constraint if exists products_price_max;
alter table public.products drop constraint if exists products_stock_max;
alter table public.farmer_profiles drop constraint if exists farmer_profiles_farm_size_range;
alter table public.posts drop constraint if exists posts_video_duration_range;
alter table public.video_meetings drop constraint if exists video_meetings_duration_range;
alter table public.consultation_bookings drop constraint if exists consultation_bookings_refund_amount_nonneg;

-- ---- undo 22 (storage file limits) ---------------------------------------------------------------------------
update storage.buckets set allowed_mime_types = null, file_size_limit = null
 where id in ('expert-cvs', 'avatars', 'product-images', 'community-images', 'news-images', 'disease-images', 'post-images');

-- ---- undo 21 (Idukki) -----------------------------------------------------------------------------------------
-- Back to the three districts of 20. Refuses while any profile or post uses 'Idukki' (that data would be invalid).
do $$ begin
  -- only where 20 was applied (the district columns exist)
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'district') then
    if exists (select 1 from public.profiles where district = 'Idukki') or exists (select 1 from public.posts where district = 'Idukki') then
      raise exception 'undo 21: Idukki is in use; reassign those rows first';
    end if;
    alter table public.profiles drop constraint if exists profiles_district_check;
    alter table public.profiles add constraint profiles_district_check
      check (district is null or district in ('Kottayam', 'Pathanamthitta', 'Kannur'));
    alter table public.posts drop constraint if exists posts_district_check;
    alter table public.posts add constraint posts_district_check
      check (district is null or district in ('Kottayam', 'Pathanamthitta', 'Kannur'));
  end if;
end $$;
-- the sign-up trigger and the report as in 20
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to '' as $$
declare v_d text := nullif(btrim(new.raw_user_meta_data->>'district'), '');
begin
  insert into public.profiles (id, full_name, role, district, phone, location)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', ''),
          'Farmer'::public.user_role,                                   -- never from metadata (AUD-003b)
          case when v_d in ('Kottayam', 'Pathanamthitta', 'Kannur') then v_d end,
          left(nullif(btrim(new.raw_user_meta_data->>'phone'), ''), 15),
          left(nullif(btrim(new.raw_user_meta_data->>'location'), ''), 150));
  return new;
end $$;
create or replace function public.admin_district_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Access denied: Admin privileges required.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(row_to_json(x) order by x.district nulls last), '[]'::jsonb) from (
    select d.district,
           (select count(*) from public.profiles p where p.district is not distinct from d.district and p.role = 'Farmer') as farmers,
           (select count(*) from public.profiles p join public.experts e on e.user_id = p.id and coalesce(e.is_active, true)
             where p.district is not distinct from d.district and p.role = 'Expert') as experts,
           (select count(*) from public.posts po where po.district is not distinct from d.district and po.status = 'Approved') as posts,
           (select count(*) from public.posts po where po.district is not distinct from d.district and po.status = 'Approved'
              and po.created_at > now() - interval '7 days') as posts_7d
    from (values ('Kottayam'), ('Pathanamthitta'), ('Kannur'), (null)) d(district)) x);
end $$;


-- ---- undo 20 (districts / district feed) ----------------------------------------------------------------------
-- Restores the sign-up trigger body that was live before 20 (md5 1328337ccb5a7ff8559b25ec69edaad1) and removes the
-- feed/report functions. The district columns and their values are kept (dropping them would lose user choices);
-- the app's Feed then needs the previous release (it calls get_feed).
drop trigger if exists posts_set_district on public.posts;
drop function if exists public._posts_set_district();
drop function if exists public.get_feed(integer, integer, timestamptz, uuid);
drop function if exists public.admin_district_stats();
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to '' as $function$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), 'Farmer'::public.user_role);
  return new;
end;
$function$;
