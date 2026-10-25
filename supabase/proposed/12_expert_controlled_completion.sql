-- PROPOSED — NOT APPLIED TO PRODUCTION. Expert-controlled completion (2026-10-25, real video module).
-- Depends on: 05, 11 (consultation_window, notified_5min). Safe to re-run.
--
-- Decision (owner request "do not mark a meeting completed merely because a user opened the meeting screen",
-- "expert-controlled completion"):
--  * complete_consultation(): only the booking's EXPERT can end a consultation, and only after its scheduled start
--    and after the expert actually joined (room token issued by the server = attendance). A farmer leaving the call
--    never completes it. Admins keep admin_update_booking_status().
--  * Safety net: the every-minute job completes a booking whose expert attended once the booked slot is over (the
--    expert forgot to press "End consultation"); the farmer gets one review request. Bookings whose expert never
--    joined are still cancelled with a full refund by the existing no-show rule.
--  * Wording fix: the 24-hour reminder said "is tomorrow" even for a meeting later the same day.

create or replace function public.complete_consultation(p_booking_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  b public.consultation_bookings%rowtype;
  w record;
  v_party text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into b from public.consultation_bookings where id = p_booking_id for update;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  v_party := public._booking_party(b);
  if v_party is null then raise exception 'not a participant of this booking' using errcode = '42501'; end if;
  if v_party <> 'expert' then raise exception 'Only the expert can end the consultation.' using errcode = '42501'; end if;
  if b.status = 'Completed' then return; end if;  -- idempotent
  if b.status <> 'Booked' then raise exception 'booking is not active (status %)', b.status using errcode = '22023'; end if;
  select * into w from public.consultation_window(b);
  if now() < w.starts_at then
    raise exception 'A consultation cannot be completed before its scheduled start.' using errcode = '22023';
  end if;
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

create or replace function public.process_consultation_lifecycle(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_24h int; v_day int; v_30 int; v_10 int; v_5 int; v_noshow int; v_done int;
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
         format('Reminder: you have a consultation on %s at %s', to_char(b.meeting_date, 'FMDD Mon YYYY'), to_char(b.meeting_time, 'FMHH12:MI AM')), b.id
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

  -- auto-complete: the expert attended and the booked slot is over (expert forgot to end it); one review request
  with c as (
    update public.consultation_bookings b set status = 'Completed', updated_at = p_now
     where b.status = 'Booked' and b.expert_joined_at is not null
       and p_now >= (select w.ends_at from public.consultation_window(b) w)
    returning b.id) select coalesce(array_agg(id), '{}') into v_ids from c;
  v_done := cardinality(v_ids);
  if v_done > 0 then
    update public.video_meetings set status = 'Completed' where booking_id = any(v_ids);
    insert into public.notifications (user_id, type, message, related_id)
    select f.user_id, 'booking',
           format('Your consultation with %s is complete. Please rate the session in Catch Up → History.',
                  coalesce((select p.full_name from public.experts e join public.profiles p on p.id = e.user_id where e.id = b.expert_id), 'the expert')),
           b.id
      from public.consultation_bookings b join public.farmer_profiles f on f.id = b.farmer_id where b.id = any(v_ids);
  end if;

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
                            'reminder_expert_10min', v_10, 'reminder_5min', v_5, 'auto_completed', v_done, 'no_shows', v_noshow);
end $$;

revoke all on function public.complete_consultation(uuid) from public, anon;
grant execute on function public.complete_consultation(uuid) to authenticated;
revoke all on function public.process_consultation_lifecycle(timestamptz) from public, anon, authenticated;
