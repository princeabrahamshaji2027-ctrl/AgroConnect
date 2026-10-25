-- PROPOSED — NOT APPLIED TO PRODUCTION. Owner change list of 2026-10-25 (changes.pdf).
-- Depends on: 01, 03, 04 (one_pending_application_per_user), 05 (_notify, refund columns).
-- Safe to re-run: create or replace / if not exists / drop ... if exists.
--
--  * Removing an expert (admin "Remove expert", or an approved resignation) no longer deletes the experts row.
--    The old demote_expert() deleted it, which cascaded to every slot, booking, video meeting and review of that
--    expert: upcoming farmers lost their bookings without notice or refund, and the history was destroyed.
--    Now: role -> Farmer, experts.is_active -> false, upcoming bookings Cancelled with a full refund Pending and
--    the farmer notified, open future slots removed. History and reviews stay. Re-approval reactivates the row.
--  * One open expert request per user: no request while Pending or while already an active expert.
--  * Expert resignations: only active experts, one Pending at a time; admin approves (demotes) or rejects.
--    Experts can no longer set their own role back to Farmer (01 allowed it for the old leave button).
--  * Deleting a user (Edge Function admin-delete-user): foreign keys that blocked deleting a profile now cascade or
--    clear; a booking removed with its farmer frees its slot.

-- ---------------------------------------------------------------- expert removal
create or replace function public.demote_expert(p_user_id uuid) returns void
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
$$;

-- Re-approval reactivates an existing (inactive) experts row instead of silently doing nothing.
create or replace function public.approve_expert_application(p_application_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  select user_id into v_user_id from public.expert_applications where id = p_application_id and status = 'Pending';
  if v_user_id is null then raise exception 'application not found or not pending'; end if;

  update public.expert_applications set status = 'Approved' where id = p_application_id;
  insert into public.experts (user_id, verified_date) values (v_user_id, current_date)
    on conflict (user_id) do update set is_active = true, verified_date = current_date;
  update public.profiles set role = 'Expert' where id = v_user_id;

  perform public._notify(v_user_id, 'announcement', 'Congratulations! Your Expert application has been approved.', v_user_id);
  insert into public.admin_audit_log (admin_id, action, target_table, target_id)
    values (auth.uid(), 'approve_expert', 'expert_applications', p_application_id);
end;
$$;

-- ---------------------------------------------------------------- one expert request per user
create unique index if not exists one_pending_application_per_user
  on public.expert_applications (user_id) where status = 'Pending';

create or replace function public.guard_expert_application_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.experts where user_id = new.user_id and is_active) then
    raise exception 'You are already a verified expert.' using errcode = '23505';
  end if;
  if exists (select 1 from public.expert_applications where user_id = new.user_id and status = 'Pending') then
    raise exception 'You already have an expert application pending review.' using errcode = '23505';
  end if;
  -- definer function, so current_user is the owner here: decide by the caller's admin status instead
  if not public.is_admin() then new.status := 'Pending'; end if;
  return new;
end;
$$;
drop trigger if exists guard_expert_application_insert on public.expert_applications;
create trigger guard_expert_application_insert before insert on public.expert_applications
  for each row execute function public.guard_expert_application_insert();

-- ---------------------------------------------------------------- no self-demotion
-- 01 let an expert set their own role to Farmer ("Leave expert mode" in the old Connect.jsx). Leaving now goes
-- through expert_resignations and an admin decision, so role changes are admin-only again. Body otherwise as in 01.
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
  if new.role is distinct from old.role then
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

-- ---------------------------------------------------------------- resignations
create unique index if not exists one_pending_resignation_per_user
  on public.expert_resignations (user_id) where status = 'Pending';

create or replace function public.guard_expert_resignation_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.experts where user_id = new.user_id and is_active) then
    raise exception 'Only an active expert can request to leave expert mode.';
  end if;
  if length(trim(coalesce(new.reason, ''))) < 5 then
    raise exception 'Please give a reason (at least 5 characters).';
  end if;
  if exists (select 1 from public.expert_resignations where user_id = new.user_id and status = 'Pending') then
    raise exception 'Your request to leave expert mode is already waiting for admin approval.' using errcode = '23505';
  end if;
  -- definer function, so current_user is the owner here: decide by the caller's admin status instead
  if not public.is_admin() then new.status := 'Pending'; end if;
  perform public._notify_admins('system', 'An expert has asked to leave expert mode. Review it under Reports.', new.id);
  return new;
end;
$$;
drop trigger if exists guard_expert_resignation_insert on public.expert_resignations;
create trigger guard_expert_resignation_insert before insert on public.expert_resignations
  for each row execute function public.guard_expert_resignation_insert();

create or replace function public.approve_expert_resignation(p_resignation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  select user_id into v_user_id from public.expert_resignations where id = p_resignation_id and status = 'Pending';
  if v_user_id is null then raise exception 'request not found or not pending'; end if;
  update public.expert_resignations set status = 'Approved' where id = p_resignation_id;
  perform public.demote_expert(v_user_id);
end;
$$;

create or replace function public.reject_expert_resignation(p_resignation_id uuid, p_notes text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  select user_id into v_user_id from public.expert_resignations where id = p_resignation_id and status = 'Pending';
  if v_user_id is null then raise exception 'request not found or not pending'; end if;
  update public.expert_resignations set status = 'Rejected' where id = p_resignation_id;
  perform public._notify(v_user_id, 'system',
    'Your request to leave expert mode was declined' || coalesce(': ' || nullif(trim(p_notes), ''), '.'), p_resignation_id);
  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
    values (auth.uid(), 'reject_expert_resignation', 'expert_resignations', p_resignation_id,
            jsonb_build_object('notes', p_notes));
end;
$$;

-- ---------------------------------------------------------------- user deletion
alter table public.broadcasts drop constraint if exists broadcasts_target_user_id_fkey;
alter table public.broadcasts add constraint broadcasts_target_user_id_fkey
  foreign key (target_user_id) references public.profiles(id) on delete cascade;
alter table public.banners drop constraint if exists banners_created_by_fkey;
alter table public.banners add constraint banners_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;
-- sent_by / admin_audit_log.admin_id stay strict: admins are never deleted through the app (see admin-delete-user).

create or replace function public.free_slot_on_booking_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'Booked' and old.slot_id is not null then
    update public.consultation_slots set is_booked = false where id = old.slot_id;
  end if;
  return old;
end;
$$;
drop trigger if exists free_slot_on_booking_delete on public.consultation_bookings;
create trigger free_slot_on_booking_delete after delete on public.consultation_bookings
  for each row execute function public.free_slot_on_booking_delete();

-- ---------------------------------------------------------------- grants
revoke all on function public.demote_expert(uuid) from public, anon;
revoke all on function public.approve_expert_application(uuid) from public, anon;
revoke all on function public.approve_expert_resignation(uuid) from public, anon;
revoke all on function public.reject_expert_resignation(uuid, text) from public, anon;
revoke all on function public.guard_expert_application_insert() from public, anon, authenticated;
revoke all on function public.guard_expert_resignation_insert() from public, anon, authenticated;
revoke all on function public.free_slot_on_booking_delete() from public, anon, authenticated;
grant execute on function public.demote_expert(uuid) to authenticated;
grant execute on function public.approve_expert_application(uuid) to authenticated;
grant execute on function public.approve_expert_resignation(uuid) to authenticated;
grant execute on function public.reject_expert_resignation(uuid, text) to authenticated;
