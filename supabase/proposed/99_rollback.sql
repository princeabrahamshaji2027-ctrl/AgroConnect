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

-- ---- undo 25 (expert broadcasts with admin approval) ---------------------------------------------------------
-- Pending/rejected expert rows are removed (they were never delivered); approved ones stay as ordinary broadcasts.
do $u25$ begin
  if to_regprocedure('public.review_broadcast(uuid,boolean,text)') is not null then
    drop function public.review_broadcast(uuid, boolean, text);
    drop function if exists public.submit_expert_broadcast(text, text, public.user_role);
    drop policy if exists broadcasts_read_own_or_received on public.broadcasts;
    delete from public.broadcasts where status <> 'approved';
    drop index if exists public.broadcasts_pending_idx;
    alter table public.broadcasts drop constraint if exists broadcasts_reviewed_by_fkey;
    alter table public.broadcasts drop constraint if exists broadcasts_status_check;
    alter table public.broadcasts drop column if exists review_note, drop column if exists reviewed_at,
      drop column if exists reviewed_by, drop column if exists status;
    alter table public.broadcasts drop constraint if exists broadcasts_sent_by_fkey;
    alter table public.broadcasts add constraint broadcasts_sent_by_fkey foreign key (sent_by) references public.profiles(id);
  end if;
end $u25$;

-- ---- undo 24 (expert removal, ban guards, server-attached resumes) -------------------------------------------
-- Only where 24 was applied (_attach_resume exists). Restores the 09 / 15 / 05 bodies and the pre-24 live ban_user.
do $u24$ begin
  if to_regprocedure('public._attach_resume(uuid,text)') is not null then
    drop trigger if exists guard_expert_application_cv on public.expert_applications;
    drop function if exists public.guard_expert_application_cv();
    drop function if exists public._attach_resume(uuid, text);
    drop function if exists public.unban_user(uuid);
    drop function if exists public.admin_expert_removal_preview(uuid);
    drop function if exists public.approve_expert_resignation(uuid, boolean);
    drop function if exists public.demote_expert(uuid, boolean);
    execute $q$create or replace function public.demote_expert(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_expert uuid;
  b record;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  select id into v_expert from public.experts where user_id = p_user_id;

  if v_expert is not null then
    for b in
      select bk.id, bk.meeting_date, f.user_id as farmer_uid,
             coalesce((select s.rate from public.consultation_slots s where s.id = bk.slot_id), 500) as rate
        from public.consultation_bookings bk
        join public.farmer_profiles f on f.id = bk.farmer_id
       where bk.expert_id = v_expert and bk.status = 'Booked'
    loop
      update public.consultation_bookings
         set status = 'Cancelled', cancellation_reason = 'Expert is no longer available on AgroConnect',
             refund_status = 'Pending', refund_amount = b.rate, updated_at = now()
       where id = b.id;
      perform public._notify(b.farmer_uid, 'booking',
        format('Your meeting on %s was cancelled because the expert is no longer available. A full refund of ₹%s has been requested.',
               b.meeting_date, b.rate), b.id);
    end loop;

    -- open future slots disappear; slots referenced by bookings stay for the history
    delete from public.consultation_slots s
     where s.expert_id = v_expert and s.slot_date >= current_date
       and not exists (select 1 from public.consultation_bookings bk where bk.slot_id = s.id);
    update public.consultation_slots set is_booked = false
     where expert_id = v_expert and slot_date >= current_date;

    update public.experts set is_active = false where id = v_expert;
  end if;

  update public.profiles set role = 'Farmer' where id = p_user_id and role = 'Expert';
  perform public._notify(p_user_id, 'system', 'Your account is now a normal user account. Expert features have been removed.', p_user_id);
  insert into public.admin_audit_log (admin_id, action, target_table, target_id)
    values (auth.uid(), 'demote_expert', 'profiles', p_user_id);
end;
$$;$q$;
    execute $q$create or replace function public.approve_expert_resignation(p_resignation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  select user_id into v_user_id from public.expert_resignations where id = p_resignation_id and status = 'Pending';
  if v_user_id is null then raise exception 'request not found or not pending'; end if;
  update public.expert_resignations set status = 'Approved' where id = p_resignation_id;
  perform public.demote_expert(v_user_id);
end;
$$;$q$;
    execute $q$create or replace function public.set_consultation_fee(p_fee_paise integer) returns integer
language plpgsql security definer set search_path = public as $$
declare v_expert uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_banned) then raise exception 'Your account is banned.' using errcode = '42501'; end if;
  select id into v_expert from public.experts where user_id = auth.uid();
  if v_expert is null then raise exception 'Only experts can set a consultation fee.' using errcode = '42501'; end if;
  if p_fee_paise is null or p_fee_paise < 100 or p_fee_paise > 10000000 then
    raise exception 'The consultation fee must be between ₹1 and ₹1,00,000.' using errcode = '22023';
  end if;
  update public.experts set consultation_fee_paise = p_fee_paise where id = v_expert;
  return p_fee_paise;
end $$;$q$;
    execute $q$create or replace function public.guard_consultation_slots() returns trigger
language plpgsql set search_path = public as $$
declare v_row public.consultation_slots%rowtype := case when tg_op = 'DELETE' then old else new end;
begin
  if not public.is_client_request() or public.is_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if not exists (select 1 from public.experts where id = v_row.expert_id and user_id = auth.uid()) then
    raise exception 'you can only manage your own slots' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.is_booked then
    raise exception 'is_booked is set by the booking functions' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.is_booked is distinct from old.is_booked or new.expert_id is distinct from old.expert_id) then
    raise exception 'is_booked/expert_id are set by the booking functions' using errcode = '42501';
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.is_booked then
    raise exception 'a booked slot cannot be changed; cancel the booking instead' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;$q$;
    execute $q$create or replace function public.ban_user(p_user_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.profiles set is_banned = true, ban_reason = p_reason, banned_at = now() where id = p_user_id;
  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
    values (auth.uid(), 'ban_user', 'profiles', p_user_id, jsonb_build_object('reason', p_reason));
end;
$$;$q$;
    revoke all on function public.demote_expert(uuid) from public, anon;
    revoke all on function public.approve_expert_resignation(uuid) from public, anon;
    grant execute on function public.demote_expert(uuid) to authenticated;
    grant execute on function public.approve_expert_resignation(uuid) to authenticated;
  end if;
end $u24$;

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
