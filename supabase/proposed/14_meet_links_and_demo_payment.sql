-- PROPOSED — NOT APPLIED TO PRODUCTION. Google Meet links + DEMO payment checkout (2026-10-25, final Catch Up flow).
-- Depends on: 05, 11, 12 (consultation_window, _booking_party, _notify, lifecycle job), 13 (push trigger picks up the
-- new 'booking' notifications by itself). Safe to re-run.
--
-- Owner decisions (final master prompt, 2026-10-25):
--  * No embedded/paid video provider. The expert creates a Google Meet meeting outside AgroConnect and pastes its link;
--    the farmer opens it with Join Meeting inside the existing join window. AgroConnect has NO attendance data for Meet.
--  * Payment is a DEMO only — "DEMO PAYMENT — NO REAL MONEY CHARGED". No provider, no card/UPI data, nothing collected.
--
-- What changes:
--  1. demo_payments: one row per checkout attempt (pending → succeeded | failed | cancelled | expired). Amount is copied
--     from the slot's fee (consultation_slots.rate, INR — the existing per-slot fee the expert sets) by the server; the
--     client never sends an amount. Clients can only read their own rows; every write goes through the functions below.
--  2. start_demo_checkout() / confirm_demo_payment() / cancel_demo_payment(). Confirming runs the existing
--     book_consultation_slot() in the same transaction (slot row lock = only one farmer can win a slot), so the booking
--     and both booking notifications exist only after the demo payment is confirmed. book_consultation_slot() is no
--     longer callable by clients (it would skip the checkout). Retries: same idempotency key → same attempt; confirming
--     a succeeded attempt again returns the same booking. Pending attempts never hold the slot and expire after 15 min.
--  3. set_meeting_link(): only the booking's expert, only while the booking is active and before the slot ends; the
--     link must be https://meet.google.com/<abc-defg-hij> (validated + normalised here, independently of the app).
--     Saving the same link again changes nothing and notifies nobody; a new/changed link notifies the farmer once.
--     The notification text never contains the link.
--  4. join_consultation() also returns the saved link and refuses while there is none.
--  5. Completion (business rule change, documented): the expert may mark a consultation completed after its start once
--     a Meet link was saved (opening Meet is not proof of attendance, so "expert joined" is no longer required).
--     The scheduler no longer completes a meeting at slot end; a booking still open 24 h after its slot ended is closed
--     with completion_source = 'slot_ended' ("closed after the scheduled time, not confirmed by the expert").
--     No-show: a booking with NO meeting link 5 minutes after the start is auto-cancelled with a full (demo) refund.
--  6. Reviews: a reviewer can no longer move a review to another booking/expert (UPDATE guard); comment ≤ 1000 chars.
--  7. Slot fees written by experts must be whole rupees or paise between ₹1 and ₹1,00,000.

-- ── 1. fee helper ────────────────────────────────────────────────────────────────────────────────────────────
-- Fee of a slot in paise, or null when the configured fee is unusable (missing, ≤ 0, > ₹1,00,000, fractions of paise).
create or replace function public._fee_paise(p_rate numeric) returns integer
language sql immutable set search_path = public as $$
  select case when p_rate is null or p_rate <= 0 or p_rate > 100000 or (p_rate * 100) <> trunc(p_rate * 100) then null
              else (p_rate * 100)::integer end;
$$;

-- ── 2. demo payments ─────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.demo_payments (
  id uuid primary key default gen_random_uuid(),
  farmer_user_id uuid not null references public.profiles(id) on delete cascade,
  slot_id uuid references public.consultation_slots(id) on delete set null,
  expert_id uuid references public.experts(id) on delete set null,
  booking_id uuid unique references public.consultation_bookings(id) on delete set null,
  issue text not null,
  amount_paise integer not null check (amount_paise > 0 and amount_paise <= 10000000),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'cancelled', 'expired')),
  failure_reason text,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  expires_at timestamptz not null,
  unique (farmer_user_id, idempotency_key)
);
comment on table public.demo_payments is
  'DEMO PAYMENTS — NO REAL MONEY. Simulated checkout attempts for consultation bookings; no payment provider, no card/bank data.';
create index if not exists demo_payments_pending_idx on public.demo_payments (expires_at) where status = 'pending';

alter table public.demo_payments enable row level security;
drop policy if exists demo_payments_own_or_admin on public.demo_payments;
create policy demo_payments_own_or_admin on public.demo_payments for select to authenticated
  using (farmer_user_id = auth.uid() or public.is_admin());
revoke all on public.demo_payments from public, anon, authenticated;
grant select on public.demo_payments to authenticated;
grant all on public.demo_payments to service_role;

-- Summary the checkout screen shows (all values from the database).
create or replace function public._demo_payment_view(p public.demo_payments) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'payment_id', p.id, 'status', p.status, 'failure_reason', p.failure_reason, 'booking_id', p.booking_id,
    'amount_paise', p.amount_paise, 'currency', p.currency, 'expires_at', p.expires_at, 'demo', true,
    'expert_name', (select coalesce(pr.full_name, 'Expert') from public.experts e left join public.profiles pr on pr.id = e.user_id where e.id = p.expert_id),
    'slot_date', s.slot_date, 'start_time', s.start_time, 'end_time', s.end_time,
    'duration_minutes', case when s.id is null then null
                             else (extract(epoch from (public.consultation_start(s.slot_date, s.end_time) - public.consultation_start(s.slot_date, s.start_time)))::int / 60 + 1440) % 1440 end)
  from (select 1) one left join public.consultation_slots s on s.id = p.slot_id;
$$;

create or replace function public.start_demo_checkout(p_slot_id uuid, p_issue text, p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_slot public.consultation_slots%rowtype;
  v_fee integer;
  p public.demo_payments%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then raise exception 'Your account is banned.' using errcode = '42501'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key is required' using errcode = '22023'; end if;

  select * into p from public.demo_payments where farmer_user_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if p.slot_id is distinct from p_slot_id then raise exception 'this checkout belongs to another slot' using errcode = '22023'; end if;
    return public._demo_payment_view(p);
  end if;

  if coalesce(length(trim(p_issue)), 0) = 0 then raise exception 'Please describe your issue.' using errcode = '22023'; end if;
  if length(trim(p_issue)) > 1000 then raise exception 'Please keep the issue under 1000 characters.' using errcode = '22023'; end if;
  select * into v_slot from public.consultation_slots where id = p_slot_id;
  if not found then raise exception 'This slot no longer exists. Please choose another slot.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.experts where id = v_slot.expert_id and user_id = v_uid) then
    raise exception 'experts cannot book their own slot' using errcode = '42501';
  end if;
  if v_slot.is_booked then raise exception 'This slot has just been booked. Please choose another slot.' using errcode = '23505'; end if;
  if public.consultation_start(v_slot.slot_date, v_slot.start_time) <= now() then
    raise exception 'This slot has already started. Please choose another slot.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.experts where id = v_slot.expert_id and coalesce(is_active, true)) then
    raise exception 'This expert is not accepting bookings right now.' using errcode = '22023';
  end if;
  v_fee := public._fee_paise(v_slot.rate);
  if v_fee is null then raise exception 'This slot has no valid fee. Please choose another slot.' using errcode = '22023'; end if;

  insert into public.demo_payments (farmer_user_id, slot_id, expert_id, issue, amount_paise, idempotency_key, expires_at)
  values (v_uid, v_slot.id, v_slot.expert_id, trim(p_issue), v_fee, p_idempotency_key, now() + interval '15 minutes')
  on conflict (farmer_user_id, idempotency_key) do nothing;
  select * into p from public.demo_payments where farmer_user_id = v_uid and idempotency_key = p_idempotency_key;
  return public._demo_payment_view(p);
end $$;

create or replace function public.confirm_demo_payment(p_payment_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  p public.demo_payments%rowtype;
  v_slot public.consultation_slots%rowtype;
  v_booking uuid;
  v_reason text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into p from public.demo_payments where id = p_payment_id for update;
  if not found or p.farmer_user_id <> v_uid then raise exception 'demo payment not found' using errcode = '42501'; end if;
  if p.status = 'succeeded' then return public._demo_payment_view(p) || jsonb_build_object('already_confirmed', true); end if;
  if p.status <> 'pending' then return public._demo_payment_view(p); end if;   -- failed / cancelled / expired stay so
  if p.expires_at <= now() then
    update public.demo_payments set status = 'expired', failure_reason = 'expired' where id = p.id returning * into p;
    return public._demo_payment_view(p);
  end if;

  select * into v_slot from public.consultation_slots where id = p.slot_id for update;
  if not found then v_reason := 'slot_missing';
  elsif v_slot.expert_id is distinct from p.expert_id then v_reason := 'slot_changed';
  elsif public._fee_paise(v_slot.rate) is distinct from p.amount_paise then v_reason := 'fee_changed';
  end if;

  if v_reason is null then
    begin
      v_booking := public.book_consultation_slot(p.slot_id, p.issue);   -- creates the booking + both notifications
    exception
      when sqlstate '23505' then v_reason := 'slot_taken';
      when sqlstate 'P0002' then v_reason := 'slot_missing';
      when sqlstate '22023' then
        v_reason := case when sqlerrm ilike '%past%' then 'slot_started'
                         when sqlerrm ilike '%expert%' then 'expert_unavailable' else 'invalid_request' end;
    end;
  end if;
  -- the same farmer already holds this slot through another (succeeded) attempt: do not link one booking twice
  if v_reason is null and exists (select 1 from public.demo_payments where booking_id = v_booking and id <> p.id) then
    v_reason := 'already_booked';
  end if;

  if v_reason is not null then
    update public.demo_payments set status = 'failed', failure_reason = v_reason where id = p.id returning * into p;
    return public._demo_payment_view(p) || jsonb_build_object('existing_booking_id', case when v_reason = 'already_booked' then v_booking end);
  end if;
  update public.demo_payments set status = 'succeeded', booking_id = v_booking, confirmed_at = now()
   where id = p.id returning * into p;
  return public._demo_payment_view(p);
end $$;

create or replace function public.cancel_demo_payment(p_payment_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.demo_payments%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into p from public.demo_payments where id = p_payment_id for update;
  if not found or p.farmer_user_id <> auth.uid() then raise exception 'demo payment not found' using errcode = '42501'; end if;
  if p.status = 'pending' then
    update public.demo_payments set status = 'cancelled', failure_reason = 'cancelled_by_farmer' where id = p.id returning * into p;
  end if;
  return public._demo_payment_view(p);
end $$;

revoke all on function public._fee_paise(numeric) from public, anon;
grant execute on function public._fee_paise(numeric) to authenticated;   -- the slot guard runs as the caller
revoke all on function public._demo_payment_view(public.demo_payments) from public, anon, authenticated;
revoke all on function public.start_demo_checkout(uuid, text, uuid) from public, anon;
revoke all on function public.confirm_demo_payment(uuid) from public, anon;
revoke all on function public.cancel_demo_payment(uuid) from public, anon;
grant execute on function public.start_demo_checkout(uuid, text, uuid) to authenticated;
grant execute on function public.confirm_demo_payment(uuid) to authenticated;
grant execute on function public.cancel_demo_payment(uuid) to authenticated;
-- Booking only through the demo checkout from now on (the function itself is unchanged).
revoke all on function public.book_consultation_slot(uuid, text) from public, anon, authenticated;

-- ── 3. slot fees written by experts must be usable ──────────────────────────────────────────────────────────
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
  if tg_op in ('INSERT', 'UPDATE') and public._fee_paise(new.rate) is null then
    raise exception 'The consultation fee must be between ₹1 and ₹1,00,000.' using errcode = '22023';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- ── 4. Google Meet links ─────────────────────────────────────────────────────────────────────────────────────
alter table public.video_meetings add column if not exists meeting_link_set_at timestamptz;
alter table public.consultation_bookings add column if not exists completion_source text;
alter table public.consultation_bookings drop constraint if exists consultation_bookings_completion_source_check;
alter table public.consultation_bookings add constraint consultation_bookings_completion_source_check
  check (completion_source is null or completion_source in ('expert', 'slot_ended', 'admin'));

-- https://meet.google.com/abc-defg-hij (optionally with a query string such as ?authuser=0, dropped) → normalised link.
-- Anything else (http, other/lookalike hosts, user@host, ports, other paths, whitespace inside) → null.
create or replace function public.normalize_meet_link(p_link text) returns text
language sql immutable set search_path = public as $$
  select case when v ~ '^https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}/?(\?[a-z0-9=&_.%-]*)?$'
              then 'https://meet.google.com/' || substring(v from '^https://meet\.google\.com/([a-z]{3}-[a-z]{4}-[a-z]{3})')
         end
    from (select lower(btrim(p_link)) v where length(btrim(coalesce(p_link, ''))) between 1 and 200) x;
$$;

create or replace function public.set_meeting_link(p_booking_id uuid, p_link text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.consultation_bookings%rowtype;
  w record;
  v_party text;
  v_link text;
  v_old text;
  v_farmer_user uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into b from public.consultation_bookings where id = p_booking_id for update;
  if not found then raise exception 'not a participant of this booking' using errcode = '42501'; end if;
  v_party := public._booking_party(b);
  if v_party is null then raise exception 'not a participant of this booking' using errcode = '42501'; end if;
  if v_party <> 'expert' then raise exception 'Only the expert can set the meeting link.' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_banned) then raise exception 'Your account is banned.' using errcode = '42501'; end if;
  if b.status <> 'Booked' then raise exception 'This consultation is no longer active (%).', b.status using errcode = '22023'; end if;
  select * into w from public.consultation_window(b);
  if now() >= w.ends_at then raise exception 'This consultation has ended.' using errcode = '22023'; end if;
  v_link := public.normalize_meet_link(p_link);
  if v_link is null then
    raise exception 'Enter a valid Google Meet link, like https://meet.google.com/abc-defg-hij' using errcode = '22023';
  end if;

  select meeting_link into v_old from public.video_meetings where booking_id = b.id for update;
  if v_old is not distinct from v_link then
    return jsonb_build_object('changed', false, 'meeting_link', v_link);       -- retry / same link: nobody notified
  end if;
  insert into public.video_meetings (booking_id, status, meeting_link, meeting_link_set_at)
  values (b.id, 'Scheduled', v_link, now())
  on conflict (booking_id) do update set meeting_link = excluded.meeting_link, meeting_link_set_at = excluded.meeting_link_set_at;

  select user_id into v_farmer_user from public.farmer_profiles where id = b.farmer_id;
  perform public._notify(v_farmer_user, 'booking',
    format(case when v_old is null
                then 'Your expert added the Google Meet link for your consultation on %s at %s. Join from Catch Up → Upcoming (opens 5 minutes before the start).'
                else 'Your expert updated the Google Meet link for your consultation on %s at %s.' end,
           to_char(b.meeting_date, 'FMDD Mon YYYY'), to_char(b.meeting_time, 'FMHH12:MI AM')),
    b.id);
  return jsonb_build_object('changed', true, 'updated', v_old is not null, 'meeting_link', v_link);
end $$;
revoke all on function public.normalize_meet_link(text) from public, anon;
grant execute on function public.normalize_meet_link(text) to authenticated;
revoke all on function public.set_meeting_link(uuid, text) from public, anon;
grant execute on function public.set_meeting_link(uuid, text) to authenticated;

-- ── 5. join returns the link ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.join_consultation(p_booking_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_room uuid;
  v_link text;
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

  select id, meeting_link into v_room, v_link from public.video_meetings where booking_id = p_booking_id order by id limit 1;
  if v_link is null then
    raise exception '%', case when r->>'role' = 'expert' then 'Add the Google Meet link first.'
                              else 'The expert has not added the Google Meet link yet.' end using errcode = '22023';
  end if;
  -- "opened the meeting from AgroConnect" — not proof that anyone attended the Google Meet call
  if r->>'role' = 'expert' then
    update public.consultation_bookings set expert_joined_at = coalesce(expert_joined_at, now()) where id = p_booking_id;
  else
    update public.consultation_bookings set farmer_joined_at = coalesce(farmer_joined_at, now()) where id = p_booking_id;
  end if;
  update public.video_meetings set status = 'Ongoing' where id = v_room and status = 'Scheduled';
  return r || jsonb_build_object('room_id', v_room, 'meeting_link', v_link);
end $$;

-- ── 6. completion ────────────────────────────────────────────────────────────────────────────────────────────
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
  if not exists (select 1 from public.video_meetings where booking_id = b.id and meeting_link is not null) then
    raise exception 'Add the Google Meet link before completing the consultation.' using errcode = '22023';
  end if;
  update public.consultation_bookings set status = 'Completed', completion_source = 'expert', updated_at = now() where id = b.id;
  update public.video_meetings set status = 'Completed' where booking_id = b.id;
  perform public._notify((select f.user_id from public.farmer_profiles f where f.id = b.farmer_id), 'booking',
    format('Your consultation with %s is complete. Please rate the session in Catch Up → History.',
           coalesce((select p.full_name from public.experts e join public.profiles p on p.id = e.user_id where e.id = b.expert_id), 'the expert')),
    b.id);
end $$;
revoke all on function public.complete_consultation(uuid) from public, anon;
grant execute on function public.complete_consultation(uuid) to authenticated;

-- ── 7. scheduler: reminders unchanged; no-show = no link; no completion at slot end; stale demo checkouts expire ──
create or replace function public.process_consultation_lifecycle(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_24h int; v_day int; v_30 int; v_10 int; v_5 int; v_noshow int; v_closed int; v_expired int;
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

  -- 10 min reminder, expert only (now also a nudge to add the Meet link when it is missing)
  with c as (
    update public.consultation_bookings b set notified_expert_10min = true
     where status = 'Booked' and not coalesce(notified_expert_10min, false)
       and public.consultation_start(meeting_date, meeting_time) > p_now
       and public.consultation_start(meeting_date, meeting_time) <= p_now + interval '10 minutes'
    returning b.id) select coalesce(array_agg(id), '{}') into v_ids from c;
  v_10 := cardinality(v_ids);
  insert into public.notifications (user_id, type, message, related_id)
  select e.user_id, 'booking',
         case when exists (select 1 from public.video_meetings vm where vm.booking_id = b.id and vm.meeting_link is not null)
              then 'Upcoming consultation starts in 10 minutes. Please prepare to join.'
              else 'Upcoming consultation starts in 10 minutes. Add the Google Meet link now — without it the booking is cancelled 5 minutes after the start.' end,
         b.id
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

  -- closed after the scheduled time: the expert never marked it completed (24 h after the slot ended). Not a claim
  -- that the meeting happened: completion_source = 'slot_ended'. The farmer may still rate it.
  with c as (
    update public.consultation_bookings b set status = 'Completed', completion_source = 'slot_ended', updated_at = p_now
     where b.status = 'Booked'
       and exists (select 1 from public.video_meetings vm where vm.booking_id = b.id and vm.meeting_link is not null)
       and p_now >= (select w.ends_at from public.consultation_window(b) w) + interval '24 hours'
    returning b.id) select coalesce(array_agg(id), '{}') into v_ids from c;
  v_closed := cardinality(v_ids);
  if v_closed > 0 then
    update public.video_meetings set status = 'Completed' where booking_id = any(v_ids);
    insert into public.notifications (user_id, type, message, related_id)
    select f.user_id, 'booking',
           format('Your consultation with %s on %s was closed after its scheduled time (the expert did not mark it completed). You can rate it in Catch Up → History.',
                  coalesce((select p.full_name from public.experts e join public.profiles p on p.id = e.user_id where e.id = b.expert_id), 'the expert'),
                  to_char(b.meeting_date, 'FMDD Mon YYYY')),
           b.id
      from public.consultation_bookings b join public.farmer_profiles f on f.id = b.farmer_id where b.id = any(v_ids);
  end if;

  -- no-show: still no Google Meet link 5 minutes after the start
  with c as (
    update public.consultation_bookings b
       set status = 'Cancelled',
           cancellation_reason = 'The expert did not add a meeting link within 5 minutes of the scheduled start time (auto-cancelled)',
           refund_status = 'Pending',
           refund_amount = coalesce((select s.rate from public.consultation_slots s where s.id = b.slot_id), 500),
           updated_at = p_now
     where status = 'Booked'
       and not exists (select 1 from public.video_meetings vm where vm.booking_id = b.id and vm.meeting_link is not null)
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
           format('Meeting on %s was auto-cancelled because the expert did not add a meeting link in time. A full demo refund of ₹%s was recorded (no real money was charged).',
                  to_char(b.meeting_date, 'FMDD Mon YYYY'), b.refund_amount), b.id
      from public.consultation_bookings b join public.farmer_profiles f on f.id = b.farmer_id where b.id = any(v_ids);
    insert into public.notifications (user_id, type, message, related_id)
    select e.user_id, 'system',
           format('You did not add a meeting link for your consultation on %s at %s. The session was auto-cancelled.',
                  to_char(b.meeting_date, 'FMDD Mon YYYY'), to_char(b.meeting_time, 'HH12:MI AM')), b.id
      from public.consultation_bookings b join public.experts e on e.id = b.expert_id where b.id = any(v_ids);
    insert into public.notifications (user_id, type, message, related_id)
    select a.id, 'system',
           format('Expert No-Show Alert: Meeting %s on %s was auto-cancelled (no meeting link).', left(b.id::text, 8), b.meeting_date), b.id
      from public.consultation_bookings b cross join public.profiles a
     where b.id = any(v_ids) and a.role = 'Admin';
    update public.video_meetings set status = 'Cancelled' where booking_id = any(v_ids);
  end if;

  -- abandoned demo checkouts
  with c as (update public.demo_payments set status = 'expired', failure_reason = 'expired'
              where status = 'pending' and expires_at <= p_now returning id)
  select count(*) into v_expired from c;

  return jsonb_build_object('reminder_24h', v_24h, 'reminder_dayof', v_day, 'reminder_30min', v_30,
                            'reminder_expert_10min', v_10, 'reminder_5min', v_5, 'closed_after_slot', v_closed,
                            'no_shows', v_noshow, 'demo_checkouts_expired', v_expired);
end $$;
revoke all on function public.process_consultation_lifecycle(timestamptz) from public, anon, authenticated;

-- ── 8. reviews ───────────────────────────────────────────────────────────────────────────────────────────────
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
  if char_length(coalesce(new.comment, '')) > 1000 then
    raise exception 'Please keep the review under 1000 characters.' using errcode = '22023';
  end if;
  return new;
end $$;

-- SECURITY INVOKER on purpose: is_client_request() is only meaningful in the caller's role.
create or replace function public.guard_reviews_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_client_request() or public.is_admin() then return new; end if;
  if new.booking_id is distinct from old.booking_id or new.expert_id is distinct from old.expert_id
     or new.reviewer_id is distinct from old.reviewer_id then
    raise exception 'a review stays with its consultation' using errcode = '42501';
  end if;
  if char_length(coalesce(new.comment, '')) > 1000 then
    raise exception 'Please keep the review under 1000 characters.' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists guard_reviews_update on public.reviews;
create trigger guard_reviews_update before update on public.reviews for each row execute function public.guard_reviews_update();
revoke all on function public.guard_reviews_update() from public, anon, authenticated;
