-- PROPOSED — NOT APPLIED TO PRODUCTION. Catch Up meetings end to end (2026-10-25).
-- Depends on: 03, 04 (booking columns), 05 (lifecycle, _notify, consultation_start, pg_cron job), 09. Safe to re-run.
--
-- Times: meeting_date + meeting_time are local times in app_timezone() (Asia/Kolkata); consultation_start() turns
-- them into one instant. Every rule below (reminder, join window, completion) uses that instant and the database
-- clock now() — never the phone's clock.
--
--  * Booking notifications: book_consultation_slot() notifies the expert ("New consultation booked! …") and the
--    farmer ("Your consultation with … is booked …") in the same transaction as the booking, only when a booking is
--    actually created: a rollback sends nothing, a repeated submit returns the existing booking and sends nothing.
--    No more invented meeting links (it used to store https://meet.agroconnect.app/…, a domain that does not exist).
--  * 5-minute reminder to both participants: one more claimed flag (notified_5min) in the existing scheduler
--    (pg_cron job consultation-lifecycle, every minute) — no new job. A booking is claimed once; both rows are
--    inserted together; ineligible (cancelled/completed) bookings are never claimed.
--  * Join window: opens 5 minutes before the start and closes at the end of the booked slot (slot end_time; without
--    a slot, start + the expert's meeting_duration_minutes). Only the booking's farmer or expert, not banned, and
--    only while the booking is Booked. Before this, joining never closed and banned users were not checked.
--  * Completion: not before the scheduled start (and, as before, only after the expert joined). The first
--    completion asks the farmer for a review, once.

alter table public.consultation_bookings add column if not exists notified_5min boolean not null default false;
alter table public.consultation_bookings add column if not exists farmer_joined_at timestamptz;

-- ---------------------------------------------------------------- meeting window
create or replace function public.consultation_window(p_booking public.consultation_bookings)
returns table (opens_at timestamptz, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  with s as (
    select public.consultation_start(p_booking.meeting_date, p_booking.meeting_time) as st,
           (select public.consultation_start(cs.slot_date, cs.end_time) from public.consultation_slots cs where cs.id = p_booking.slot_id) as slot_end,
           (select coalesce(e.meeting_duration_minutes, 30) from public.experts e where e.id = p_booking.expert_id) as dur
  )
  select st - interval '5 minutes',
         st,
         case when slot_end > st then slot_end
              when slot_end is not null then slot_end + interval '1 day'      -- slot ends after midnight
              else st + make_interval(mins => coalesce(dur, 30)) end
    from s;
$$;

-- Decision for the caller p_uid at time p_now. Internal: clients call join_consultation()/consultation_join_status(),
-- which always pass auth.uid() and the database clock.
create or replace function public._consultation_join_check(p_booking_id uuid, p_uid uuid, p_now timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b public.consultation_bookings%rowtype;
  w record;
  v_party text;
  v_reason text;
begin
  select * into b from public.consultation_bookings where id = p_booking_id;
  if not found then return jsonb_build_object('can_join', false, 'reason', 'not_found'); end if;
  v_party := case
    when exists (select 1 from public.experts e where e.id = b.expert_id and e.user_id = p_uid) then 'expert'
    when exists (select 1 from public.farmer_profiles f where f.id = b.farmer_id and f.user_id = p_uid) then 'farmer' end;
  -- a stranger learns nothing about the booking
  if p_uid is null or v_party is null then return jsonb_build_object('can_join', false, 'reason', 'not_participant'); end if;
  select * into w from public.consultation_window(b);
  v_reason := case
    when exists (select 1 from public.profiles p where p.id = p_uid and p.is_banned) then 'banned'
    when b.status = 'Completed' then 'completed'
    when b.status = 'Cancelled' then 'cancelled'
    when p_now < w.opens_at then 'too_early'
    when p_now >= w.ends_at then 'ended'
    else null end;
  return jsonb_build_object('can_join', v_reason is null, 'reason', coalesce(v_reason, 'ok'), 'role', v_party,
                            'status', b.status, 'opens_at', w.opens_at, 'starts_at', w.starts_at, 'ends_at', w.ends_at,
                            'server_now', p_now);
end $$;

-- For the Join button: when it opens/closes and the server's current time (so the app can count down correctly
-- even if the phone clock is wrong). Participants only.
create or replace function public.consultation_join_status(p_booking_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  r := public._consultation_join_check(p_booking_id, auth.uid(), now());
  if r->>'reason' in ('not_found', 'not_participant') then
    raise exception 'not a participant of this booking' using errcode = '42501';
  end if;
  return r;
end $$;

-- Join: same checks, records attendance, returns the room. Every call is validated on the server.
drop function if exists public.join_consultation(uuid);
create function public.join_consultation(p_booking_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_room uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  perform 1 from public.consultation_bookings where id = p_booking_id for update;
  r := public._consultation_join_check(p_booking_id, auth.uid(), now());
  case r->>'reason'
    when 'ok' then null;
    when 'not_found', 'not_participant' then raise exception 'not a participant of this booking' using errcode = '42501';
    when 'banned' then raise exception 'Your account is banned.' using errcode = '42501';
    when 'completed' then raise exception 'This consultation has already been completed.' using errcode = '22023';
    when 'cancelled' then raise exception 'This consultation was cancelled.' using errcode = '22023';
    when 'too_early' then raise exception 'Too early: you can join from % (5 minutes before the start).',
      to_char((r->>'opens_at')::timestamptz at time zone public.app_timezone(), 'HH12:MI AM') using errcode = '22023';
    when 'ended' then raise exception 'This meeting has ended.' using errcode = '22023';
  end case;

  if r->>'role' = 'expert' then
    update public.consultation_bookings set expert_joined_at = coalesce(expert_joined_at, now()) where id = p_booking_id;
  else
    update public.consultation_bookings set farmer_joined_at = coalesce(farmer_joined_at, now()) where id = p_booking_id;
  end if;

  select id into v_room from public.video_meetings where booking_id = p_booking_id order by id limit 1;
  if v_room is null then
    insert into public.video_meetings (booking_id, status) values (p_booking_id, 'Ongoing') returning id into v_room;
  else
    update public.video_meetings set status = 'Ongoing' where id = v_room and status = 'Scheduled';
  end if;
  return r || jsonb_build_object('room_id', v_room);
end $$;

-- ---------------------------------------------------------------- completion
create or replace function public.complete_consultation(p_booking_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  b public.consultation_bookings%rowtype;
  w record;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into b from public.consultation_bookings where id = p_booking_id for update;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if public._booking_party(b) is null then raise exception 'not a participant of this booking' using errcode = '42501'; end if;
  if b.status = 'Completed' then return; end if;  -- idempotent: both participants leave the call
  if b.status <> 'Booked' then raise exception 'booking is not active (status %)', b.status using errcode = '22023'; end if;
  select * into w from public.consultation_window(b);
  if now() < w.starts_at then
    raise exception 'A consultation cannot be completed before its scheduled start.' using errcode = '22023';
  end if;
  -- Evidence rule: a consultation can only complete if the expert actually joined.
  if b.expert_joined_at is null then
    raise exception 'the expert has not joined this meeting' using errcode = '22023';
  end if;
  update public.consultation_bookings set status = 'Completed', updated_at = now() where id = b.id;
  update public.video_meetings set status = 'Completed' where booking_id = b.id;
  perform public._notify((select f.user_id from public.farmer_profiles f where f.id = b.farmer_id), 'booking',
    format('Your consultation with %s is complete. Please rate the session in Catch Up → History.',
           coalesce((select p.full_name from public.experts e join public.profiles p on p.id = e.user_id where e.id = b.expert_id), 'the expert')),
    b.id);
end $$;

-- ---------------------------------------------------------------- booking (+ notifications)
create or replace function public.book_consultation_slot(p_slot_id uuid, p_issue text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_slot public.consultation_slots%rowtype;
  v_farmer uuid;
  v_booking uuid;
  v_expert_user uuid;
  v_expert_name text;
  v_farmer_name text;
  v_when text;
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

  -- Duplicate submission by the same farmer returns the existing booking (and sends nothing again).
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

  -- room record only; no external link until a real video provider is configured
  insert into public.video_meetings (booking_id, status) values (v_booking, 'Scheduled');

  select e.user_id, coalesce(p.full_name, 'the expert') into v_expert_user, v_expert_name
    from public.experts e left join public.profiles p on p.id = e.user_id where e.id = v_slot.expert_id;
  select coalesce(full_name, 'A farmer') into v_farmer_name from public.profiles where id = v_uid;
  v_when := format('%s at %s', to_char(v_slot.slot_date, 'FMDD Mon YYYY'), to_char(v_slot.start_time, 'FMHH12:MI AM'));
  perform public._notify(v_expert_user, 'booking',
    format('New consultation booked! %s booked a session with you for %s. Topic: %s', v_farmer_name, v_when, left(trim(p_issue), 120)),
    v_booking);
  perform public._notify(v_uid, 'booking',
    format('Your consultation with %s is booked for %s.', v_expert_name, v_when), v_booking);

  return v_booking;
end $$;

-- ---------------------------------------------------------------- scheduler (05 + 5-minute reminder)
create or replace function public.process_consultation_lifecycle(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_24h int; v_day int; v_30 int; v_10 int; v_5 int; v_noshow int;
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

  -- 5 min reminder, both participants: the join window opens now
  with c as (
    update public.consultation_bookings b set notified_5min = true
     where status = 'Booked' and not notified_5min
       and public.consultation_start(meeting_date, meeting_time) > p_now
       and public.consultation_start(meeting_date, meeting_time) <= p_now + interval '5 minutes'
    returning b.id) select coalesce(array_agg(id), '{}') into v_ids from c;
  v_5 := cardinality(v_ids);
  insert into public.notifications (user_id, type, message, related_id)
  select p.uid, 'booking',
         format('Reminder: your consultation with %s starts at %s. You can join now from Catch Up → Upcoming.',
                p.other, to_char(b.meeting_time, 'FMHH12:MI AM')), b.id
    from public.consultation_bookings b
    cross join lateral (
      select f.user_id uid, coalesce((select pe.full_name from public.experts e join public.profiles pe on pe.id = e.user_id where e.id = b.expert_id), 'your expert') other
        from public.farmer_profiles f where f.id = b.farmer_id
      union all
      select e.user_id, coalesce((select pf.full_name from public.farmer_profiles f join public.profiles pf on pf.id = f.user_id where f.id = b.farmer_id), 'your farmer')
        from public.experts e where e.id = b.expert_id) p
   where b.id = any(v_ids) and p.uid is not null;

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
    update public.video_meetings set status = 'Cancelled' where booking_id = any(v_ids);
  end if;

  return jsonb_build_object('reminder_24h', v_24h, 'reminder_dayof', v_day, 'reminder_30min', v_30,
                            'reminder_expert_10min', v_10, 'reminder_5min', v_5, 'no_shows', v_noshow);
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function public.consultation_window(public.consultation_bookings) from public, anon, authenticated;
revoke all on function public._consultation_join_check(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.consultation_join_status(uuid) from public, anon;
revoke all on function public.join_consultation(uuid) from public, anon;
revoke all on function public.complete_consultation(uuid) from public, anon;
revoke all on function public.book_consultation_slot(uuid, text) from public, anon;
revoke all on function public.process_consultation_lifecycle(timestamptz) from public, anon, authenticated;
grant execute on function public.consultation_join_status(uuid) to authenticated;
grant execute on function public.join_consultation(uuid) to authenticated;
grant execute on function public.complete_consultation(uuid) to authenticated;
grant execute on function public.book_consultation_slot(uuid, text) to authenticated;
