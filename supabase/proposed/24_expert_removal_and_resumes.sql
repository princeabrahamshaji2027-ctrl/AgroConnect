-- PROPOSED — 2026-10-28. Depends on: 05, 09, 15, 18. Safe to re-run. Rollback: "undo 24" in 99_rollback.sql.
-- 1. Removing an expert: the admin sees a preview first; upcoming consultations are never cancelled unless the admin
--    confirms (p_cancel_upcoming); cancellations use _apply_cancellation (migration 18 accounting). No self/admin change.
-- 2. A removed (inactive) expert can no longer set a fee or manage availability.
-- 3. ban_user refuses self and administrators; unban_user replaces the browser-side profile update.
-- 4. Resume paths are attached only by the server (Edge Function submit-resume, service role) after the file is checked.

-- ── 1. preview ─────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_expert_removal_preview(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_role public.user_role; v_name text; v_expert uuid;
begin
  if not public.is_admin() then raise exception 'Access denied: Admin privileges required.' using errcode = '42501'; end if;
  select role, full_name into v_role, v_name from public.profiles where id = p_user_id;
  if not found then raise exception 'User not found.' using errcode = 'P0002'; end if;
  select id into v_expert from public.experts where user_id = p_user_id;
  return jsonb_build_object(
    'user_id', p_user_id, 'full_name', v_name, 'role', v_role, 'is_self', p_user_id = auth.uid(),
    'upcoming', coalesce((
      select jsonb_agg(jsonb_build_object('booking_id', b.id, 'meeting_date', b.meeting_date, 'meeting_time', b.meeting_time,
               'farmer_name', (select pr.full_name from public.farmer_profiles f join public.profiles pr on pr.id = f.user_id
                                where f.id = b.farmer_id)) order by b.meeting_date, b.meeting_time)
        from public.consultation_bookings b where b.expert_id = v_expert and b.status = 'Booked'), '[]'::jsonb),
    'open_future_slots', (select count(*) from public.consultation_slots s
                           where s.expert_id = v_expert and s.slot_date >= current_date and not s.is_booked),
    'completed_consultations', (select count(*) from public.consultation_bookings where expert_id = v_expert and status = 'Completed'),
    'posts', (select count(*) from public.posts where user_id = p_user_id));
end $$;
revoke all on function public.admin_expert_removal_preview(uuid) from public, anon;
grant execute on function public.admin_expert_removal_preview(uuid) to authenticated;

-- ── 2. demote_expert (signature gains p_cancel_upcoming; returns what was done) ────────────────────────────────
drop function if exists public.demote_expert(uuid);
create or replace function public.demote_expert(p_user_id uuid, p_cancel_upcoming boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role; v_expert uuid; v_active boolean; b record; t jsonb; v_when text;
  n_upcoming integer; n_cancelled integer := 0;
begin
  if not public.is_admin() then raise exception 'Access denied: Admin privileges required.' using errcode = '42501'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot change your own role.' using errcode = '42501'; end if;
  select role into v_role from public.profiles where id = p_user_id for update;
  if not found then raise exception 'User not found.' using errcode = 'P0002'; end if;
  if v_role = 'Admin' then raise exception 'Administrator accounts cannot be changed here.' using errcode = '42501'; end if;
  select id, coalesce(is_active, true) into v_expert, v_active from public.experts where user_id = p_user_id for update;
  if v_role <> 'Expert' and not coalesce(v_active, false) then
    raise exception 'This account is not an expert.' using errcode = '22023';
  end if;
  select count(*) into n_upcoming from public.consultation_bookings where expert_id = v_expert and status = 'Booked';
  if n_upcoming > 0 and not p_cancel_upcoming then
    raise exception 'This expert has % upcoming consultation(s). Confirm that they should be cancelled with a full refund, or cancel them first.', n_upcoming
      using errcode = 'P0001', hint = 'upcoming_bookings';
  end if;
  if v_expert is not null then
    for b in select * from public.consultation_bookings where expert_id = v_expert and status = 'Booked' order by meeting_date, meeting_time for update loop
      t := public._apply_cancellation(b.id, 'admin', auth.uid(), 'Expert is no longer available on AgroConnect');
      v_when := format('%s at %s', to_char(b.meeting_date, 'FMDD Mon YYYY'), to_char(b.meeting_time, 'FMHH12:MI AM'));
      perform public._notify((select user_id from public.farmer_profiles where id = b.farmer_id), 'booking',
        format('Your consultation on %s was cancelled because the expert is no longer available on AgroConnect. A full refund of %s has been requested.',
               v_when, public._inr((t->>'refund_paise')::integer)), b.id);
      n_cancelled := n_cancelled + 1;
    end loop;
    -- open future slots disappear; slots referenced by any booking stay for the history
    delete from public.consultation_slots s
     where s.expert_id = v_expert and s.slot_date >= current_date
       and not exists (select 1 from public.consultation_bookings bk where bk.slot_id = s.id);
    update public.experts set is_active = false where id = v_expert;
  end if;
  update public.profiles set role = 'Farmer' where id = p_user_id and role = 'Expert';
  perform public._notify(p_user_id, 'system', 'Your account is now a normal user account. Expert features have been removed.', p_user_id);
  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
    values (auth.uid(), 'demote_expert', 'profiles', p_user_id,
            jsonb_build_object('previous_role', v_role, 'cancelled_bookings', n_cancelled));
  return jsonb_build_object('user_id', p_user_id, 'cancelled_bookings', n_cancelled);
end $$;
revoke all on function public.demote_expert(uuid, boolean) from public, anon;
grant execute on function public.demote_expert(uuid, boolean) to authenticated;

-- resignation approval passes the same confirmation through
drop function if exists public.approve_expert_resignation(uuid);
create or replace function public.approve_expert_resignation(p_resignation_id uuid, p_cancel_upcoming boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid; r jsonb;
begin
  if not public.is_admin() then raise exception 'Access denied: Admin privileges required.' using errcode = '42501'; end if;
  select user_id into v_user_id from public.expert_resignations where id = p_resignation_id and status = 'Pending' for update;
  if v_user_id is null then raise exception 'request not found or not pending' using errcode = 'P0002'; end if;
  r := public.demote_expert(v_user_id, p_cancel_upcoming);   -- raises (and rolls back) when bookings need confirmation
  update public.expert_resignations set status = 'Approved' where id = p_resignation_id;
  return r;
end $$;
revoke all on function public.approve_expert_resignation(uuid, boolean) from public, anon;
grant execute on function public.approve_expert_resignation(uuid, boolean) to authenticated;

-- ── 3. a removed expert cannot set a fee or manage availability ─────────────────────────────────────────────────
create or replace function public.set_consultation_fee(p_fee_paise integer) returns integer
language plpgsql security definer set search_path = public as $$
declare v_expert uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_banned) then raise exception 'Your account is banned.' using errcode = '42501'; end if;
  select id into v_expert from public.experts where user_id = auth.uid() and coalesce(is_active, true);
  if v_expert is null then raise exception 'Only experts can set a consultation fee.' using errcode = '42501'; end if;
  if p_fee_paise is null or p_fee_paise < 100 or p_fee_paise > 10000000 then
    raise exception 'The consultation fee must be between ₹1 and ₹1,00,000.' using errcode = '22023';
  end if;
  update public.experts set consultation_fee_paise = p_fee_paise where id = v_expert;
  return p_fee_paise;
end $$;

create or replace function public.guard_consultation_slots() returns trigger
language plpgsql set search_path = public as $$
declare v_row public.consultation_slots%rowtype := case when tg_op = 'DELETE' then old else new end;
begin
  if not public.is_client_request() or public.is_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if not exists (select 1 from public.experts where id = v_row.expert_id and user_id = auth.uid()) then
    raise exception 'you can only manage your own slots' using errcode = '42501';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and not exists (select 1 from public.experts where id = v_row.expert_id and coalesce(is_active, true)) then
    raise exception 'Only active experts can publish availability.' using errcode = '42501';
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
end $$;

-- ── 4. ban / unban ──────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.ban_user(p_user_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot ban your own account.' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = p_user_id and role = 'Admin') then
    raise exception 'Administrator accounts cannot be banned here.' using errcode = '42501';
  end if;
  update public.profiles set is_banned = true, ban_reason = p_reason, banned_at = now() where id = p_user_id;
  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
    values (auth.uid(), 'ban_user', 'profiles', p_user_id, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.unban_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Access denied: Admin privileges required.' using errcode = '42501'; end if;
  update public.profiles set is_banned = false, ban_reason = null, banned_at = null where id = p_user_id and is_banned;
  if not found then raise exception 'This account is not banned.' using errcode = '22023'; end if;
  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
    values (auth.uid(), 'unban_user', 'profiles', p_user_id, jsonb_build_object('reason', 'Unbanned by administrator'));
end $$;
revoke all on function public.unban_user(uuid) from public, anon;
grant execute on function public.unban_user(uuid) to authenticated;

-- ── 5. resumes: only the server attaches a resume path ─────────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose (current_user must be the caller's role, as in protect_profile_privileged_columns).
create or replace function public.guard_expert_application_cv() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_client_request() and not public.is_admin() then
    if tg_op = 'INSERT' then
      raise exception 'Expert applications are sent from the app after the resume has been checked. Please update the app and try again.' using errcode = '42501';
    end if;
    if new.cv_file_path is distinct from old.cv_file_path then
      raise exception 'Resumes are attached by the server after the file has been checked.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_expert_application_cv on public.expert_applications;
create trigger guard_expert_application_cv before insert or update of cv_file_path on public.expert_applications
  for each row execute function public.guard_expert_application_cv();

-- called only by the Edge Function submit-resume and by the seed script (service role)
create or replace function public._attach_resume(p_user_id uuid, p_path text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_app uuid; v_old text;
begin
  if p_path !~ ('^' || p_user_id::text || '/[0-9]{10,16}_cv\.pdf$') then
    raise exception 'invalid resume path' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'expert-cvs' and name = p_path
                   and metadata->>'mimetype' = 'application/pdf' and (metadata->>'size')::bigint between 1 and 5242880) then
    raise exception 'resume file not found' using errcode = 'P0002';
  end if;
  select id, cv_file_path into v_app, v_old from public.expert_applications
   where user_id = p_user_id and status in ('Pending', 'Approved') order by created_at desc limit 1 for update;
  if v_app is null then raise exception 'no application to attach the resume to' using errcode = 'P0002'; end if;
  update public.expert_applications set cv_file_path = p_path where id = v_app;
  -- not admin_audit_log: its admin_id (NOT NULL, no cascade) would make the applicant's account undeletable.
  -- The previous file stays in storage; admins are told.
  perform public._notify_admins('system',
    format('%s uploaded a new resume%s.', coalesce((select full_name from public.profiles where id = p_user_id), 'An applicant'),
           case when v_old is null then '' else ' (the previous file is kept)' end), v_app);
  return v_app;
end $$;
revoke all on function public._attach_resume(uuid, text) from public, anon, authenticated;
grant execute on function public._attach_resume(uuid, text) to service_role;

notify pgrst, 'reload schema';
