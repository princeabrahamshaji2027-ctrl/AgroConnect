-- PROPOSED — NOT APPLIED TO PRODUCTION. Supersedes 04_book_consultation_rpc.sql.
-- AUD-013 / AUD-014 / AUD-032: move consultation booking, cancellation, join/complete, reminders, no-shows and
-- refunds out of the browser, and stop clients writing notifications for other users.
--
-- Depends on: 04_reconcile_drift.sql (booking columns, experts.no_show_count) and 01/03. Written against the real
-- live schema (supabase/schema/live_schema_20261024.sql): booking status is the booking_status enum and
-- notifications.type is the notification_type enum ('booking'/'system' are used below; the specific event is in the
-- message). The browser code used types such as meeting_reminder_24h that the enum rejects, which is why no
-- booking notification has ever been stored in production (only 'announcement' rows exist).
-- Safe to re-run: every object uses create or replace / if not exists / drop ... if exists.
-- Business rules are copied from src/pages/Connect.jsx as of commit 6635e2f:
--   reminders 24 h, day-of, 30 min (both participants) and 10 min (expert only);
--   join allowed from 5 min before start; expert no-show = not joined 5 min after start
--     -> Cancelled + full slot rate refund (default 500) + expert no_show_count + 1 + admin alert;
--   farmer cancel -> 50 % of slot rate refund (default 500 -> 250) + expert and admin alert;
--   expert cancel -> reason + at least one offered reschedule slot, farmer notified, no refund change.
-- Change from the browser version: refunds go to 'Pending' (no payment system exists; the old code wrote
-- 'Refunded' without moving any money). admin_settle_refund() records the real outcome.
-- Meeting dates/times are stored without a zone; they are interpreted in app_timezone() (Asia/Kolkata).

-- ---------------------------------------------------------------- helpers
create or replace function public.app_timezone() returns text
language sql immutable set search_path = public as $$ select 'Asia/Kolkata'::text $$;

create or replace function public.consultation_start(p_date date, p_time time) returns timestamptz
language sql stable set search_path = public as $$ select (p_date + p_time) at time zone public.app_timezone() $$;

-- True when the statement comes straight from a client (PostgREST runs as anon/authenticated).
-- Inside SECURITY DEFINER functions current_user is the function owner, so trusted code passes.
create or replace function public.is_client_request() returns boolean
language sql stable set search_path = public as $$ select current_user in ('anon', 'authenticated') $$;

-- ---------------------------------------------------------------- data invariants
-- One active booking per slot is already enforced live by the unique index one_booking_per_slot
-- (slot_id) WHERE status <> 'Cancelled'. Create it only if missing (e.g. a fresh staging database).
create unique index if not exists one_booking_per_slot
  on public.consultation_bookings (slot_id) where status <> 'Cancelled';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'consultation_bookings_refund_status_check') then
    -- NOT VALID: enforced for new writes without failing on unexpected historical values.
    alter table public.consultation_bookings add constraint consultation_bookings_refund_status_check
      check (refund_status in ('None', 'Pending', 'Refunded', 'Failed')) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------- internal notify (not callable by clients)
create or replace function public._notify(p_user uuid, p_type text, p_message text, p_related uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, message, related_id)
  select p_user, p_type::public.notification_type, p_message, p_related where p_user is not null;
$$;

create or replace function public._notify_admins(p_type text, p_message text, p_related uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, message, related_id)
  select id, p_type::public.notification_type, p_message, p_related from public.profiles where role = 'Admin';
$$;

-- ---------------------------------------------------------------- booking
create or replace function public.book_consultation_slot(p_slot_id uuid, p_issue text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_slot public.consultation_slots%rowtype;
  v_farmer uuid;
  v_booking uuid;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'account is banned' using errcode = '42501';
  end if;
  if coalesce(length(trim(p_issue)), 0) = 0 then
    raise exception 'issue description is required' using errcode = '22023';
  end if;

  -- Row lock serialises concurrent attempts on the same slot.
  select * into v_slot from public.consultation_slots where id = p_slot_id for update;
  if not found then raise exception 'slot not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.experts where id = v_slot.expert_id and user_id = v_uid) then
    raise exception 'experts cannot book their own slot' using errcode = '42501';
  end if;

  select id into v_farmer from public.farmer_profiles where user_id = v_uid;

  -- Duplicate submission by the same farmer returns the existing booking instead of failing.
  select id into v_booking from public.consultation_bookings
   where slot_id = v_slot.id and status = 'Booked' and farmer_id = v_farmer;
  if v_booking is not null then return v_booking; end if;

  if v_slot.is_booked then raise exception 'slot already booked' using errcode = '23505'; end if;
  if public.consultation_start(v_slot.slot_date, v_slot.start_time) <= now() then
    raise exception 'slot is in the past' using errcode = '22023';
  end if;
  if not exists (select 1 from public.experts where id = v_slot.expert_id and coalesce(is_active, true)) then
    raise exception 'expert is not accepting bookings' using errcode = '22023';
  end if;

  if v_farmer is null then
    insert into public.farmer_profiles (user_id) values (v_uid) returning id into v_farmer;
  end if;

  insert into public.consultation_bookings
    (expert_id, farmer_id, slot_id, meeting_date, meeting_time, issue_description, status)
  values (v_slot.expert_id, v_farmer, v_slot.id, v_slot.slot_date, v_slot.start_time, trim(p_issue), 'Booked')
  returning id into v_booking;

  update public.consultation_slots set is_booked = true where id = v_slot.id;

  insert into public.video_meetings (booking_id, meeting_link, status)
  values (v_booking, 'https://meet.agroconnect.app/AGRI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), 'Scheduled');

  return v_booking;
end $$;

-- ---------------------------------------------------------------- participant helper
create or replace function public._booking_party(p_booking public.consultation_bookings) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.experts e where e.id = p_booking.expert_id and e.user_id = auth.uid()) then 'expert'
    when exists (select 1 from public.farmer_profiles f where f.id = p_booking.farmer_id and f.user_id = auth.uid()) then 'farmer'
  end;
$$;

-- ---------------------------------------------------------------- cancellation
create or replace function public.cancel_consultation_booking(
  p_booking_id uuid, p_reason text, p_offered_slots jsonb default '[]'::jsonb
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  b public.consultation_bookings%rowtype;
  v_party text;
  v_rate numeric;
  v_refund numeric := 0;
  v_expert_user uuid;
  v_farmer_user uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into b from public.consultation_bookings where id = p_booking_id for update;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  v_party := public._booking_party(b);
  if v_party is null then raise exception 'not a participant of this booking' using errcode = '42501'; end if;
  if b.status <> 'Booked' then raise exception 'booking is not active (status %)', b.status using errcode = '22023'; end if;
  if coalesce(length(trim(p_reason)), 0) = 0 then raise exception 'a cancellation reason is required' using errcode = '22023'; end if;

  select user_id into v_expert_user from public.experts where id = b.expert_id;
  select user_id into v_farmer_user from public.farmer_profiles where id = b.farmer_id;
  select rate into v_rate from public.consultation_slots where id = b.slot_id;

  if v_party = 'expert' then
    if jsonb_typeof(p_offered_slots) <> 'array' or jsonb_array_length(p_offered_slots) = 0 then
      raise exception 'offer at least one alternative slot' using errcode = '22023';
    end if;
    update public.consultation_bookings
       set status = 'Cancelled', cancellation_reason = trim(p_reason), offered_reschedule_slots = p_offered_slots,
           updated_at = now()
     where id = b.id;
    perform public._notify(v_farmer_user, 'booking',
      format('Consultation on %s was cancelled by the expert. Reason: %s', b.meeting_date, trim(p_reason)), b.id);
  else
    v_refund := coalesce(v_rate, 500) * 0.5;
    update public.consultation_bookings
       set status = 'Cancelled', cancellation_reason = trim(p_reason),
           refund_status = 'Pending', refund_amount = v_refund, updated_at = now()
     where id = b.id;
    perform public._notify(v_expert_user, 'booking',
      format('Meeting on %s at %s was cancelled by farmer. Reason: %s', b.meeting_date,
             to_char(b.meeting_time, 'HH12:MI AM'), trim(p_reason)), b.id);
    perform public._notify_admins('system',
      format('Farmer Cancellation Alert: Meeting %s on %s was cancelled by farmer.', left(b.id::text, 8), b.meeting_date), b.id);
  end if;

  update public.consultation_slots set is_booked = false where id = b.slot_id;
  return v_refund;
end $$;

-- ---------------------------------------------------------------- join / complete
create or replace function public.join_consultation(p_booking_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.consultation_bookings%rowtype; v_party text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into b from public.consultation_bookings where id = p_booking_id for update;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  v_party := public._booking_party(b);
  if v_party is null then raise exception 'not a participant of this booking' using errcode = '42501'; end if;
  if b.status <> 'Booked' then raise exception 'This meeting is no longer scheduled.' using errcode = '22023'; end if;
  if now() < public.consultation_start(b.meeting_date, b.meeting_time) - interval '5 minutes' then
    raise exception 'The meeting start time has not been reached yet.' using errcode = '22023';
  end if;
  if v_party = 'expert' then
    update public.consultation_bookings set expert_joined_at = coalesce(expert_joined_at, now()) where id = b.id;
  end if;
end $$;

create or replace function public.complete_consultation(p_booking_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.consultation_bookings%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into b from public.consultation_bookings where id = p_booking_id for update;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if public._booking_party(b) is null then raise exception 'not a participant of this booking' using errcode = '42501'; end if;
  if b.status = 'Completed' then return; end if;  -- idempotent: both participants leave the call
  if b.status <> 'Booked' then raise exception 'booking is not active (status %)', b.status using errcode = '22023'; end if;
  -- Evidence rule: a consultation can only complete if the expert actually joined.
  if b.expert_joined_at is null then
    raise exception 'the expert has not joined this meeting' using errcode = '22023';
  end if;
  update public.consultation_bookings set status = 'Completed', updated_at = now() where id = b.id;
end $$;

-- ---------------------------------------------------------------- scheduled lifecycle job
-- Idempotent: each reminder flag / no-show transition is claimed with a conditional UPDATE, and the whole run is
-- one transaction, so a failure rolls back and the next run retries. p_now exists for tests.
create or replace function public.process_consultation_lifecycle(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_24h int; v_day int; v_30 int; v_10 int; v_noshow int;
  v_local_date date := (p_now at time zone public.app_timezone())::date;
begin
  -- 24 h reminder
  with c as (
    update public.consultation_bookings b set notified_24h = true
     where status = 'Booked' and not coalesce(notified_24h, false)
       and public.consultation_start(meeting_date, meeting_time) > p_now
       and public.consultation_start(meeting_date, meeting_time) <= p_now + interval '24 hours'
    returning b.id) select coalesce(array_agg(id), '{}') into v_ids from c;
  v_24h := cardinality(v_ids);
  insert into public.notifications (user_id, type, message, related_id)
  select p.uid, 'booking',
         format('Reminder: Consultation on %s at %s is tomorrow', b.meeting_date, to_char(b.meeting_time, 'HH12:MI AM')), b.id
    from public.consultation_bookings b
    cross join lateral (select f.user_id uid from public.farmer_profiles f where f.id = b.farmer_id
                        union all select e.user_id from public.experts e where e.id = b.expert_id) p
   where b.id = any(v_ids);

  -- day-of reminder
  with c as (
    update public.consultation_bookings b set notified_dayof = true
     where status = 'Booked' and not coalesce(notified_dayof, false)
       and meeting_date = v_local_date
       and public.consultation_start(meeting_date, meeting_time) > p_now
    returning b.id) select coalesce(array_agg(id), '{}') into v_ids from c;
  v_day := cardinality(v_ids);
  insert into public.notifications (user_id, type, message, related_id)
  select p.uid, 'booking',
         format('Reminder: You have a consultation scheduled today at %s', to_char(b.meeting_time, 'HH12:MI AM')), b.id
    from public.consultation_bookings b
    cross join lateral (select f.user_id uid from public.farmer_profiles f where f.id = b.farmer_id
                        union all select e.user_id from public.experts e where e.id = b.expert_id) p
   where b.id = any(v_ids);

  -- 30 min reminder
  with c as (
    update public.consultation_bookings b set notified_30min = true
     where status = 'Booked' and not coalesce(notified_30min, false)
       and public.consultation_start(meeting_date, meeting_time) > p_now
       and public.consultation_start(meeting_date, meeting_time) <= p_now + interval '30 minutes'
    returning b.id) select coalesce(array_agg(id), '{}') into v_ids from c;
  v_30 := cardinality(v_ids);
  insert into public.notifications (user_id, type, message, related_id)
  select p.uid, 'booking',
         format('Reminder: Consultation starts in 30 minutes (%s)', to_char(b.meeting_time, 'HH12:MI AM')), b.id
    from public.consultation_bookings b
    cross join lateral (select f.user_id uid from public.farmer_profiles f where f.id = b.farmer_id
                        union all select e.user_id from public.experts e where e.id = b.expert_id) p
   where b.id = any(v_ids);

  -- 10 min reminder, expert only
  with c as (
    update public.consultation_bookings b set notified_expert_10min = true
     where status = 'Booked' and not coalesce(notified_expert_10min, false)
       and public.consultation_start(meeting_date, meeting_time) > p_now
       and public.consultation_start(meeting_date, meeting_time) <= p_now + interval '10 minutes'
    returning b.id) select coalesce(array_agg(id), '{}') into v_ids from c;
  v_10 := cardinality(v_ids);
  insert into public.notifications (user_id, type, message, related_id)
  select e.user_id, 'booking',
         'Upcoming consultation starts in 10 minutes. Please prepare to join.', b.id
    from public.consultation_bookings b join public.experts e on e.id = b.expert_id
   where b.id = any(v_ids);

  -- expert no-show: not joined 5 minutes after start
  with c as (
    update public.consultation_bookings b
       set status = 'Cancelled',
           cancellation_reason = 'Expert did not join within 5 minutes of the scheduled start time (auto-cancelled)',
           refund_status = 'Pending',
           refund_amount = coalesce((select s.rate from public.consultation_slots s where s.id = b.slot_id), 500),
           updated_at = p_now
     where status = 'Booked' and expert_joined_at is null
       and p_now >= public.consultation_start(meeting_date, meeting_time) + interval '5 minutes'
    returning b.id) select coalesce(array_agg(id), '{}') into v_ids from c;
  v_noshow := cardinality(v_ids);
  if v_noshow > 0 then
    update public.consultation_slots s set is_booked = false
      from public.consultation_bookings b where b.id = any(v_ids) and s.id = b.slot_id;
    update public.experts e set no_show_count = coalesce(e.no_show_count, 0) + x.n
      from (select expert_id, count(*) n from public.consultation_bookings where id = any(v_ids) group by expert_id) x
     where e.id = x.expert_id;
    insert into public.notifications (user_id, type, message, related_id)
    select f.user_id, 'booking',
           format('Meeting on %s was auto-cancelled because expert did not join within 5 minutes. Full refund of ₹%s requested.',
                  b.meeting_date, b.refund_amount), b.id
      from public.consultation_bookings b join public.farmer_profiles f on f.id = b.farmer_id where b.id = any(v_ids);
    insert into public.notifications (user_id, type, message, related_id)
    select e.user_id, 'system',
           format('You missed your scheduled consultation on %s at %s. The session was auto-cancelled.',
                  b.meeting_date, to_char(b.meeting_time, 'HH12:MI AM')), b.id
      from public.consultation_bookings b join public.experts e on e.id = b.expert_id where b.id = any(v_ids);
    insert into public.notifications (user_id, type, message, related_id)
    select a.id, 'system',
           format('Expert No-Show Alert: Meeting %s on %s was auto-cancelled.', left(b.id::text, 8), b.meeting_date), b.id
      from public.consultation_bookings b cross join public.profiles a
     where b.id = any(v_ids) and a.role = 'Admin';
  end if;

  return jsonb_build_object('reminder_24h', v_24h, 'reminder_dayof', v_day, 'reminder_30min', v_30,
                            'reminder_expert_10min', v_10, 'no_shows', v_noshow);
end $$;

-- ---------------------------------------------------------------- refunds
-- Pending -> Refunded | Failed. Failed -> Pending via admin_retry_refund. Refunded is terminal.
-- A real payment provider call belongs in an Edge Function that calls this with the service role afterwards.
create or replace function public.admin_settle_refund(p_booking_id uuid, p_succeeded boolean, p_reference text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare b public.consultation_bookings%rowtype; v_new text;
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into b from public.consultation_bookings where id = p_booking_id for update;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if b.refund_status is distinct from 'Pending' then
    raise exception 'refund is not pending (status %)', coalesce(b.refund_status, 'None') using errcode = '22023';
  end if;
  v_new := case when p_succeeded then 'Refunded' else 'Failed' end;
  update public.consultation_bookings set refund_status = v_new, updated_at = now() where id = b.id;
  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (auth.uid(), 'settle_refund', 'consultation_bookings', b.id,
          jsonb_build_object('outcome', v_new, 'amount', b.refund_amount, 'reference', p_reference));
  if p_succeeded then
    perform public._notify((select user_id from public.farmer_profiles where id = b.farmer_id), 'booking',
      format('Your refund of ₹%s has been processed.', b.refund_amount), b.id);
  end if;
  return v_new;
end $$;

create or replace function public.admin_retry_refund(p_booking_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.consultation_bookings set refund_status = 'Pending', updated_at = now()
   where id = p_booking_id and refund_status = 'Failed';
  if not found then raise exception 'refund is not in Failed state' using errcode = '22023'; end if;
end $$;

-- ---------------------------------------------------------------- client write guards (independent of policy names)
-- Notifications: a client may only create notifications for itself (admins: anyone). Everything else goes
-- through the SECURITY DEFINER functions above.
create or replace function public.guard_notifications_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_client_request() and new.user_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'cannot create notifications for other users' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_notifications_insert on public.notifications;
create trigger guard_notifications_insert before insert on public.notifications
  for each row execute function public.guard_notifications_insert();

-- Slots: experts manage their own unbooked slots; is_booked is server-controlled.
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
drop trigger if exists guard_consultation_slots on public.consultation_slots;
create trigger guard_consultation_slots before insert or update or delete on public.consultation_slots
  for each row execute function public.guard_consultation_slots();

-- Experts: owners may edit their profile fields and switch themselves inactive; nothing else.
create or replace function public.guard_experts_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_client_request() or public.is_admin() then return new; end if;
  if new.user_id is distinct from old.user_id or new.rating is distinct from old.rating
     or new.verified_date is distinct from old.verified_date or new.no_show_count is distinct from old.no_show_count
     or (new.is_active and not coalesce(old.is_active, true)) then
    raise exception 'this field can only be changed by an administrator' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_experts_update on public.experts;
create trigger guard_experts_update before update on public.experts
  for each row execute function public.guard_experts_update();

-- Reviews: only the farmer of a completed booking, once, for that booking's expert.
create or replace function public.guard_reviews_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_client_request() then return new; end if;
  if not exists (
    select 1 from public.consultation_bookings b join public.farmer_profiles f on f.id = b.farmer_id
     where b.id = new.booking_id and f.user_id = auth.uid() and b.status = 'Completed' and b.expert_id = new.expert_id)
     or new.reviewer_id is distinct from auth.uid() then
    raise exception 'you can only review your own completed consultations' using errcode = '42501';
  end if;
  if exists (select 1 from public.reviews where booking_id = new.booking_id and reviewer_id = new.reviewer_id) then
    raise exception 'this consultation has already been reviewed' using errcode = '23505';
  end if;
  return new;
end $$;
drop trigger if exists guard_reviews_insert on public.reviews;
create trigger guard_reviews_insert before insert on public.reviews
  for each row execute function public.guard_reviews_insert();

-- Bookings and video meetings: clients read through RLS, all writes go through the functions above.
revoke insert, update, delete on public.consultation_bookings from anon, authenticated;
revoke insert, update, delete on public.video_meetings from anon, authenticated;

-- ---------------------------------------------------------------- execute grants
revoke all on function public._notify(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public._notify_admins(text, text, uuid) from public, anon, authenticated;
revoke all on function public._booking_party(public.consultation_bookings) from public, anon, authenticated;
revoke all on function public.process_consultation_lifecycle(timestamptz) from public, anon, authenticated;
revoke all on function public.book_consultation_slot(uuid, text) from public, anon;
revoke all on function public.cancel_consultation_booking(uuid, text, jsonb) from public, anon;
revoke all on function public.join_consultation(uuid) from public, anon;
revoke all on function public.complete_consultation(uuid) from public, anon;
revoke all on function public.admin_settle_refund(uuid, boolean, text) from public, anon;
revoke all on function public.admin_retry_refund(uuid) from public, anon;
grant execute on function public.book_consultation_slot(uuid, text) to authenticated;
grant execute on function public.cancel_consultation_booking(uuid, text, jsonb) to authenticated;
grant execute on function public.join_consultation(uuid) to authenticated;
grant execute on function public.complete_consultation(uuid) to authenticated;
grant execute on function public.admin_settle_refund(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.admin_retry_refund(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- scheduler
-- Requires the pg_cron extension (Supabase Dashboard -> Database -> Extensions -> pg_cron). Without it, nothing
-- runs the job: enable it, or call process_consultation_lifecycle() from a scheduled Edge Function.
do $$ begin
  -- pg_cron is available on Supabase (not installed on production as of 2026-10-24); install it when possible.
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'consultation-lifecycle';
    perform cron.schedule('consultation-lifecycle', '* * * * *', 'select public.process_consultation_lifecycle()');
  else
    raise notice 'pg_cron is not enabled: consultation reminders/no-shows will not run until a scheduler is configured';
  end if;
end $$;

-- ---------------------------------------------------------------- read access
-- RESTRICTIVE policies are ANDed with whatever permissive policies exist live, so this narrows access without
-- needing the live policy names: bookings are visible only to their two participants and admins.
drop policy if exists bookings_participants_only on public.consultation_bookings;
create policy bookings_participants_only on public.consultation_bookings as restrictive for select to anon, authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.experts e where e.id = expert_id and e.user_id = auth.uid())
    or exists (select 1 from public.farmer_profiles f where f.id = farmer_id and f.user_id = auth.uid())
  );
drop policy if exists video_meetings_participants_only on public.video_meetings;
create policy video_meetings_participants_only on public.video_meetings as restrictive for select to anon, authenticated
  using (exists (select 1 from public.consultation_bookings b where b.id = booking_id));  -- inherits the rule above
