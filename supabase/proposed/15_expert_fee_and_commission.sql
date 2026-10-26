-- PROPOSED — NOT APPLIED TO PRODUCTION. Expert-set consultation fee, booking fee snapshot, 2 % platform commission,
-- admin consultation reporting (2026-10-25, final pricing pass). Depends on: 05, 11, 12, 13, 14. Safe to re-run.
--
-- ROOT CAUSE of the "three different amounts" bug: there was no fee per expert. The price lived on every time slot
-- (consultation_slots.rate, set per weekday in the availability editor, default 500), and every screen picked a
-- different slot: the expert card showed the cheapest open slot ("From ₹300", or a hard-coded ₹500), each calendar
-- day the cheapest slot of that day, each time button its own slot, and checkout/refunds the chosen slot's rate.
--
-- What changes:
--  1. experts.consultation_fee_paise — THE fee (integer paise, ₹1 – ₹1,00,000, same limits as 14). Set by the expert
--     through set_consultation_fee() or by an admin through admin_set_consultation_fee() (audited). Direct table
--     writes of the fee are refused for every API caller, admins included. Backfill: the expert's most common slot
--     rate (open future slots first), else ₹500. consultation_slots.rate is now legacy and no longer used for money.
--  2. Checkout quotes the expert's fee (start_demo_checkout). confirm_demo_payment() refuses a quote whose amount is no
--     longer the expert's current fee ("fee_changed" + the new amount) — the farmer must confirm a fresh quote.
--  3. On confirmation the demo_payments row is the immutable accounting snapshot of the booking: amount (F),
--     commission rate (200 bps), commission C = round-half-up(F × 2 %) in paise, expert share E = F − C, so F = C + E
--     always. A trigger makes these fields read-only once succeeded (for everyone). transaction_type = 'simulated':
--     NO real money moves; these are ledger figures of the simulated checkout, never settled funds.
--  4. Refunds (farmer cancellation 50 %, no-show 100 %) use the agreed fee snapshot, not the slot rate.
--  5. Admin reporting: admin_consultations() (server-side filters + pagination), admin_consultation_summary()
--     (same filters) and admin_consultation_detail() (incl. the Meet link and notification/push state). Admin only.
--  6. admin_update_booking_status() records completion_source = 'admin' when an admin completes a booking.
--  7. The no-show notice no longer says "demo"; user-facing texts never mention a demo or simulated payment.

-- ── 1. the expert's fee ──────────────────────────────────────────────────────────────────────────────────────
alter table public.experts add column if not exists consultation_fee_paise integer;
update public.experts e
   set consultation_fee_paise = coalesce(
     (select public._fee_paise(s.rate) from public.consultation_slots s
       where s.expert_id = e.id and not s.is_booked and public._fee_paise(s.rate) is not null
         and public.consultation_start(s.slot_date, s.start_time) > now()
       group by s.rate order by count(*) desc, s.rate desc limit 1),
     (select public._fee_paise(s.rate) from public.consultation_slots s
       where s.expert_id = e.id and public._fee_paise(s.rate) is not null
       group by s.rate order by count(*) desc, s.rate desc limit 1),
     50000)
 where e.consultation_fee_paise is null;
alter table public.experts alter column consultation_fee_paise set default 50000;
alter table public.experts alter column consultation_fee_paise set not null;
alter table public.experts drop constraint if exists experts_consultation_fee_range;
alter table public.experts add constraint experts_consultation_fee_range
  check (consultation_fee_paise between 100 and 10000000);
comment on column public.experts.consultation_fee_paise is
  'The expert''s consultation fee in paise (INR). Single source of truth for new bookings. Change only via set_consultation_fee()/admin_set_consultation_fee().';
comment on column public.consultation_slots.rate is
  'LEGACY (before migration 15): per-slot price. Not used for any amount any more; the fee is experts.consultation_fee_paise.';

-- Direct writes of the fee are refused for every API caller (admins too): the two functions below are the only way.
create or replace function public.guard_experts_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_client_request() and new.consultation_fee_paise is distinct from old.consultation_fee_paise then
    raise exception 'Use the consultation fee setting to change the fee.' using errcode = '42501';
  end if;
  if not public.is_client_request() or public.is_admin() then return new; end if;
  if new.user_id is distinct from old.user_id or new.rating is distinct from old.rating
     or new.verified_date is distinct from old.verified_date or new.no_show_count is distinct from old.no_show_count
     or (new.is_active and not coalesce(old.is_active, true)) then
    raise exception 'this field can only be changed by an administrator' using errcode = '42501';
  end if;
  return new;
end $$;

-- An expert row created by a client may not pick its own fee either (the default applies; then the setting).
create or replace function public.guard_experts_fee_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_client_request() and not public.is_admin() then new.consultation_fee_paise := 50000; end if;
  return new;
end $$;
drop trigger if exists guard_experts_fee_insert on public.experts;
create trigger guard_experts_fee_insert before insert on public.experts for each row execute function public.guard_experts_fee_insert();

create or replace function public.set_consultation_fee(p_fee_paise integer) returns integer
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
end $$;

create or replace function public.admin_set_consultation_fee(p_expert_id uuid, p_fee_paise integer, p_reason text) returns integer
language plpgsql security definer set search_path = public as $$
declare v_old integer;
begin
  if not public.is_admin() then raise exception 'Access denied: Admin privileges required.' using errcode = '42501'; end if;
  if coalesce(length(trim(p_reason)), 0) = 0 then raise exception 'a reason is required' using errcode = '22023'; end if;
  if p_fee_paise is null or p_fee_paise < 100 or p_fee_paise > 10000000 then
    raise exception 'The consultation fee must be between ₹1 and ₹1,00,000.' using errcode = '22023';
  end if;
  select consultation_fee_paise into v_old from public.experts where id = p_expert_id for update;
  if not found then raise exception 'expert not found' using errcode = 'P0002'; end if;
  update public.experts set consultation_fee_paise = p_fee_paise where id = p_expert_id;
  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (auth.uid(), 'set_consultation_fee', 'experts', p_expert_id,
          jsonb_build_object('previous_fee_paise', v_old, 'new_fee_paise', p_fee_paise, 'reason', trim(p_reason)));
  return p_fee_paise;
end $$;

revoke all on function public.set_consultation_fee(integer) from public, anon;
grant execute on function public.set_consultation_fee(integer) to authenticated;
revoke all on function public.admin_set_consultation_fee(uuid, integer, text) from public, anon;
grant execute on function public.admin_set_consultation_fee(uuid, integer, text) to authenticated;
revoke all on function public.guard_experts_fee_insert() from public, anon, authenticated;

-- ── 2. commission (2 %), snapshot on the accounting record ───────────────────────────────────────────────────
create or replace function public.platform_commission_bps() returns integer
language sql immutable set search_path = public as $$ select 200 $$;   -- 2 % = 200 basis points

-- C = round half up (F × bps / 10000) in whole paise; E = F − C, so C + E = F exactly.
create or replace function public._commission_paise(p_fee_paise integer, p_bps integer) returns integer
language sql immutable set search_path = public as $$
  select ((p_fee_paise::bigint * p_bps + 5000) / 10000)::integer;
$$;
revoke all on function public.platform_commission_bps() from public, anon;
grant execute on function public.platform_commission_bps() to authenticated;
revoke all on function public._commission_paise(integer, integer) from public, anon, authenticated;

alter table public.demo_payments add column if not exists transaction_type text not null default 'simulated';
alter table public.demo_payments add column if not exists commission_bps integer;
alter table public.demo_payments add column if not exists commission_paise integer;
alter table public.demo_payments add column if not exists expert_share_paise integer;
alter table public.demo_payments drop constraint if exists demo_payments_transaction_type_check;
alter table public.demo_payments add constraint demo_payments_transaction_type_check check (transaction_type = 'simulated');
comment on column public.demo_payments.transaction_type is
  'Always ''simulated'': no payment provider, no money received, no commission collected, no expert paid.';

-- succeeded attempts made before this migration: split their own agreed amount (never a later fee)
update public.demo_payments
   set commission_bps = 200,
       commission_paise = public._commission_paise(amount_paise, 200),
       expert_share_paise = amount_paise - public._commission_paise(amount_paise, 200)
 where status = 'succeeded' and commission_bps is null;

alter table public.demo_payments drop constraint if exists demo_payments_split_check;
alter table public.demo_payments add constraint demo_payments_split_check check (
  status <> 'succeeded' or (commission_bps is not null and commission_paise >= 0 and expert_share_paise >= 0
                             and commission_paise + expert_share_paise = amount_paise));

-- Once succeeded, the snapshot is history: nobody (admins and the service role included) can rewrite it.
create or replace function public.guard_demo_payment_snapshot() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status = 'succeeded' and (
       new.status is distinct from old.status or new.amount_paise is distinct from old.amount_paise
       or new.currency is distinct from old.currency or new.commission_bps is distinct from old.commission_bps
       or new.commission_paise is distinct from old.commission_paise or new.expert_share_paise is distinct from old.expert_share_paise
       or new.booking_id is distinct from old.booking_id or new.transaction_type is distinct from old.transaction_type
       or new.farmer_user_id is distinct from old.farmer_user_id or new.confirmed_at is distinct from old.confirmed_at) then
    if new.booking_id is null and old.booking_id is not null and new.status = old.status
       and new.amount_paise = old.amount_paise and new.commission_paise is not distinct from old.commission_paise then
      return new;   -- the booking itself was deleted (ON DELETE SET NULL): keep the money record
    end if;
    raise exception 'a confirmed booking''s amount and commission cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_demo_payment_snapshot on public.demo_payments;
create trigger guard_demo_payment_snapshot before update on public.demo_payments
  for each row execute function public.guard_demo_payment_snapshot();
revoke all on function public.guard_demo_payment_snapshot() from public, anon, authenticated;

-- Agreed fee of a booking in rupees (refund amounts are stored in rupees): the snapshot, else the legacy slot rate.
create or replace function public._agreed_fee_rupees(p_booking_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select dp.amount_paise / 100.0 from public.demo_payments dp where dp.booking_id = p_booking_id and dp.status = 'succeeded'),
    (select s.rate from public.consultation_bookings b join public.consultation_slots s on s.id = b.slot_id where b.id = p_booking_id),
    500);
$$;
revoke all on function public._agreed_fee_rupees(uuid) from public, anon, authenticated;

-- ── 3. checkout uses the expert's fee ────────────────────────────────────────────────────────────────────────
create or replace function public._demo_payment_view(p public.demo_payments) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'payment_id', p.id, 'status', p.status, 'failure_reason', p.failure_reason, 'booking_id', p.booking_id,
    'amount_paise', p.amount_paise, 'currency', p.currency, 'expires_at', p.expires_at, 'transaction_type', p.transaction_type,
    'expert_name', (select coalesce(pr.full_name, 'Expert') from public.experts e left join public.profiles pr on pr.id = e.user_id where e.id = p.expert_id),
    'slot_date', s.slot_date, 'start_time', s.start_time, 'end_time', s.end_time,
    'duration_minutes', case when s.id is null then null
                             else (extract(epoch from (public.consultation_start(s.slot_date, s.end_time) - public.consultation_start(s.slot_date, s.start_time)))::int / 60 + 1440) % 1440 end)
  from (select 1) one left join public.consultation_slots s on s.id = p.slot_id;
$$;
revoke all on function public._demo_payment_view(public.demo_payments) from public, anon, authenticated;

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
  select consultation_fee_paise into v_fee from public.experts where id = v_slot.expert_id and coalesce(is_active, true);
  if not found then raise exception 'This expert is not accepting bookings right now.' using errcode = '22023'; end if;
  if v_fee is null or v_fee < 100 or v_fee > 10000000 then
    raise exception 'This expert has no valid consultation fee yet.' using errcode = '22023';
  end if;

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
  v_fee integer;
  v_booking uuid;
  v_reason text;
  v_bps integer := public.platform_commission_bps();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into p from public.demo_payments where id = p_payment_id for update;
  if not found or p.farmer_user_id <> v_uid then raise exception 'demo payment not found' using errcode = '42501'; end if;
  if p.status = 'succeeded' then return public._demo_payment_view(p) || jsonb_build_object('already_confirmed', true); end if;
  if p.status <> 'pending' then return public._demo_payment_view(p); end if;
  if p.expires_at <= now() then
    update public.demo_payments set status = 'expired', failure_reason = 'expired' where id = p.id returning * into p;
    return public._demo_payment_view(p);
  end if;

  select * into v_slot from public.consultation_slots where id = p.slot_id for update;
  select consultation_fee_paise into v_fee from public.experts where id = p.expert_id for share;
  if v_slot.id is null then v_reason := 'slot_missing';
  elsif v_slot.expert_id is distinct from p.expert_id then v_reason := 'slot_changed';
  elsif v_fee is distinct from p.amount_paise then v_reason := 'fee_changed';   -- stale quote: never charge another amount
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
  if v_reason is null and exists (select 1 from public.demo_payments where booking_id = v_booking and id <> p.id) then
    v_reason := 'already_booked';
  end if;

  if v_reason is not null then
    update public.demo_payments set status = 'failed', failure_reason = v_reason where id = p.id returning * into p;
    return public._demo_payment_view(p) || jsonb_build_object(
      'existing_booking_id', case when v_reason = 'already_booked' then v_booking end,
      'current_amount_paise', case when v_reason = 'fee_changed' then v_fee end);
  end if;
  update public.demo_payments
     set status = 'succeeded', booking_id = v_booking, confirmed_at = now(),
         commission_bps = v_bps,
         commission_paise = public._commission_paise(p.amount_paise, v_bps),
         expert_share_paise = p.amount_paise - public._commission_paise(p.amount_paise, v_bps)
   where id = p.id returning * into p;
  return public._demo_payment_view(p);
end $$;
revoke all on function public.start_demo_checkout(uuid, text, uuid) from public, anon;
revoke all on function public.confirm_demo_payment(uuid) from public, anon;
grant execute on function public.start_demo_checkout(uuid, text, uuid) to authenticated;
grant execute on function public.confirm_demo_payment(uuid) to authenticated;

-- ── 4. refunds use the agreed fee ────────────────────────────────────────────────────────────────────────────
create or replace function public.cancel_consultation_booking(p_booking_id uuid, p_reason text, p_offered_slots jsonb default '[]'::jsonb)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  b public.consultation_bookings%rowtype;
  v_party text;
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
    v_refund := round(public._agreed_fee_rupees(b.id) * 0.5, 2);
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
revoke all on function public.cancel_consultation_booking(uuid, text, jsonb) from public, anon;
grant execute on function public.cancel_consultation_booking(uuid, text, jsonb) to authenticated;

-- ── 5. admin completes → completion_source = 'admin' ─────────────────────────────────────────────────────────
create or replace function public.admin_update_booking_status(p_booking_id uuid, p_new_status character varying, p_cancellation_reason text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_slot_id uuid;
  v_current_status public.booking_status;
  v_new_status public.booking_status;
begin
  if not public.is_admin() then
    raise exception 'Access denied: Admin privileges required.' using errcode = '42501';
  end if;
  begin
    v_new_status := p_new_status::public.booking_status;
  exception when invalid_text_representation then
    raise exception 'Invalid booking status %', p_new_status using errcode = '22023';
  end;

  select status, slot_id into v_current_status, v_slot_id from public.consultation_bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found with ID %', p_booking_id using errcode = 'P0002';
  end if;

  update public.consultation_bookings
     set status = v_new_status,
         cancellation_reason = coalesce(p_cancellation_reason, cancellation_reason),
         completion_source = case when v_new_status = 'Completed' and v_current_status <> 'Completed' then 'admin' else completion_source end,
         updated_at = now()
   where id = p_booking_id;

  if v_new_status = 'Cancelled' and v_slot_id is not null then
    update public.consultation_slots set is_booked = false where id = v_slot_id;
  end if;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (auth.uid(), 'update_booking_status', 'consultation_bookings', p_booking_id,
          jsonb_build_object('previous_status', v_current_status, 'new_status', v_new_status,
                             'cancellation_reason', p_cancellation_reason));
  return true;
end;
$$;
revoke all on function public.admin_update_booking_status(uuid, character varying, text) from public, anon;
grant execute on function public.admin_update_booking_status(uuid, character varying, text) to authenticated;

-- ── 6. admin consultation reporting (read-only) ──────────────────────────────────────────────────────────────
-- One row per booking with everything the admin dashboard lists; filters are applied here (server side) so that the
-- list, its total count and the summary always describe exactly the same set of bookings.
--   p_filters keys (all optional): from_date, to_date (slot date), expert_id, farmer_id (farmer_profiles.id), q (name
--   search, farmer or expert), status (Booked|Completed|Cancelled), payment (succeeded|none), link (saved|missing),
--   completion (expert|slot_ended|admin|open), review (reviewed|not_reviewed).
create or replace function public._admin_consultation_rows(p_filters jsonb)
returns table (
  booking_id uuid, meeting_date date, start_time time, end_time time, duration_minutes integer, status text,
  farmer_id uuid, farmer_user_id uuid, farmer_name text, farmer_phone text, farmer_location text,
  expert_id uuid, expert_user_id uuid, expert_name text, expert_phone text, expert_location text,
  issue text, created_at timestamptz, confirmed_at timestamptz, payment_id uuid, transaction_type text, payment_status text,
  amount_paise integer, currency text, commission_bps integer, commission_paise integer, expert_share_paise integer,
  link_saved boolean, completion_source text, rating integer, review_comment text, reviewed_at timestamptz,
  cancellation_reason text, refund_status text, refund_amount numeric)
language sql stable security definer set search_path = public as $$
  select b.id, b.meeting_date, b.meeting_time, s.end_time,
         case when s.id is null then null
              else (extract(epoch from (public.consultation_start(s.slot_date, s.end_time) - public.consultation_start(s.slot_date, s.start_time)))::int / 60 + 1440) % 1440 end,
         b.status::text,
         f.id, f.user_id, fp.full_name::text, fp.phone::text, fp.location::text,
         e.id, e.user_id, ep.full_name::text, ep.phone::text, ep.location::text,
         b.issue_description, b.created_at, dp.confirmed_at, dp.id, dp.transaction_type, dp.status,
         dp.amount_paise, dp.currency, dp.commission_bps, dp.commission_paise, dp.expert_share_paise,
         coalesce(vm.meeting_link is not null, false), b.completion_source, r.rating, r.comment, r.created_at,
         b.cancellation_reason, b.refund_status, b.refund_amount
    from public.consultation_bookings b
    left join public.consultation_slots s on s.id = b.slot_id
    left join public.farmer_profiles f on f.id = b.farmer_id
    left join public.profiles fp on fp.id = f.user_id
    left join public.experts e on e.id = b.expert_id
    left join public.profiles ep on ep.id = e.user_id
    left join public.demo_payments dp on dp.booking_id = b.id and dp.status = 'succeeded'
    left join public.video_meetings vm on vm.booking_id = b.id
    left join public.reviews r on r.booking_id = b.id
   where (p_filters->>'from_date' is null or b.meeting_date >= (p_filters->>'from_date')::date)
     and (p_filters->>'to_date' is null or b.meeting_date <= (p_filters->>'to_date')::date)
     and (p_filters->>'expert_id' is null or b.expert_id = (p_filters->>'expert_id')::uuid)
     and (p_filters->>'farmer_id' is null or b.farmer_id = (p_filters->>'farmer_id')::uuid)
     and (coalesce(p_filters->>'q', '') = '' or fp.full_name ilike '%' || (p_filters->>'q') || '%'
          or ep.full_name ilike '%' || (p_filters->>'q') || '%')
     and (p_filters->>'status' is null or b.status::text = p_filters->>'status')
     and (p_filters->>'payment' is null or (p_filters->>'payment' = 'succeeded') = (dp.id is not null))
     and (p_filters->>'link' is null or (p_filters->>'link' = 'saved') = coalesce(vm.meeting_link is not null, false))
     and (p_filters->>'completion' is null
          or (p_filters->>'completion' = 'open' and b.status = 'Booked')
          or b.completion_source = p_filters->>'completion')
     and (p_filters->>'review' is null or (p_filters->>'review' = 'reviewed') = (r.booking_id is not null));
$$;
revoke all on function public._admin_consultation_rows(jsonb) from public, anon, authenticated;

create or replace function public.admin_consultations(p_filters jsonb default '{}'::jsonb, p_limit integer default 25, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_total bigint;
begin
  if not public.is_admin() then raise exception 'Access denied: Admin privileges required.' using errcode = '42501'; end if;
  select count(*) into v_total from public._admin_consultation_rows(coalesce(p_filters, '{}'::jsonb));
  select coalesce(jsonb_agg(to_jsonb(x) order by x.meeting_date desc, x.start_time desc, x.booking_id), '[]'::jsonb) into v
    from (select * from public._admin_consultation_rows(coalesce(p_filters, '{}'::jsonb))
           order by meeting_date desc, start_time desc, booking_id
           limit greatest(1, least(coalesce(p_limit, 25), 100)) offset greatest(0, coalesce(p_offset, 0))) x;
  return jsonb_build_object('total', v_total, 'rows', v);
end $$;

-- Totals are over the filtered bookings. Money totals count only bookings with a succeeded (simulated) payment that
-- are not cancelled — Booked or Completed — and are ledger figures of the simulated checkout, not funds received.
create or replace function public.admin_consultation_summary(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'Access denied: Admin privileges required.' using errcode = '42501'; end if;
  select jsonb_build_object(
    'total', count(*),
    'confirmed_upcoming', count(*) filter (where status = 'Booked'),
    'completed', count(*) filter (where status = 'Completed'),
    'cancelled', count(*) filter (where status = 'Cancelled'),
    'awaiting_link', count(*) filter (where status = 'Booked' and not link_saved),
    'reviews', count(*) filter (where rating is not null),
    'value_paise', coalesce(sum(amount_paise) filter (where payment_id is not null and status <> 'Cancelled'), 0),
    'commission_paise', coalesce(sum(commission_paise) filter (where payment_id is not null and status <> 'Cancelled'), 0),
    'expert_share_paise', coalesce(sum(expert_share_paise) filter (where payment_id is not null and status <> 'Cancelled'), 0),
    'cancelled_value_paise', coalesce(sum(amount_paise) filter (where payment_id is not null and status = 'Cancelled'), 0))
    into v
    from public._admin_consultation_rows(coalesce(p_filters, '{}'::jsonb));
  -- checkouts in progress are not bookings: counted separately (same date/expert filters)
  return v || jsonb_build_object('pending_checkouts', (
    select count(*) from public.demo_payments dp join public.consultation_slots s on s.id = dp.slot_id
     where dp.status = 'pending' and dp.expires_at > now()
       and (p_filters->>'from_date' is null or s.slot_date >= (p_filters->>'from_date')::date)
       and (p_filters->>'to_date' is null or s.slot_date <= (p_filters->>'to_date')::date)
       and (p_filters->>'expert_id' is null or dp.expert_id = (p_filters->>'expert_id')::uuid)));
end $$;

create or replace function public.admin_consultation_detail(p_booking_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'Access denied: Admin privileges required.' using errcode = '42501'; end if;
  select to_jsonb(x) into v from public._admin_consultation_rows(jsonb_build_object()) x where x.booking_id = p_booking_id;
  if v is null then raise exception 'booking not found' using errcode = 'P0002'; end if;
  return v || jsonb_build_object(
    'meeting_link', (select meeting_link from public.video_meetings where booking_id = p_booking_id),
    'meeting_link_set_at', (select meeting_link_set_at from public.video_meetings where booking_id = p_booking_id),
    'expert_opened_at', (select expert_joined_at from public.consultation_bookings where id = p_booking_id),
    'farmer_opened_at', (select farmer_joined_at from public.consultation_bookings where id = p_booking_id),
    'updated_at', (select updated_at from public.consultation_bookings where id = p_booking_id),
    'payment_created_at', (select created_at from public.demo_payments where booking_id = p_booking_id),
    'attempts', (select count(*) from public.demo_payments dp join public.consultation_bookings b on b.slot_id = dp.slot_id
                  where b.id = p_booking_id and dp.farmer_user_id = (select f.user_id from public.farmer_profiles f where f.id = b.farmer_id)),
    'notifications', (select coalesce(jsonb_agg(jsonb_build_object(
                         'created_at', n.created_at, 'recipient', case when n.user_id = (select f.user_id from public.farmer_profiles f join public.consultation_bookings b on b.farmer_id = f.id where b.id = p_booking_id) then 'farmer'
                                                                       when n.user_id = (select e.user_id from public.experts e join public.consultation_bookings b on b.expert_id = e.id where b.id = p_booking_id) then 'expert'
                                                                       else 'admin' end,
                         'type', n.type, 'message', n.message, 'is_read', n.is_read,
                         'push', (select o.status from public.push_outbox o where o.notification_id = n.id)) order by n.created_at), '[]'::jsonb)
                        from public.notifications n where n.related_id = p_booking_id));
end $$;

revoke all on function public.admin_consultations(jsonb, integer, integer) from public, anon;
revoke all on function public.admin_consultation_summary(jsonb) from public, anon;
revoke all on function public.admin_consultation_detail(uuid) from public, anon;
grant execute on function public.admin_consultations(jsonb, integer, integer) to authenticated;
grant execute on function public.admin_consultation_summary(jsonb) to authenticated;
grant execute on function public.admin_consultation_detail(uuid) to authenticated;

-- ── 7. scheduler: refunds from the agreed fee; no "demo" wording in user notices (otherwise as in 14) ─────────
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
           refund_amount = public._agreed_fee_rupees(b.id),
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
           format('Meeting on %s was auto-cancelled because the expert did not add a meeting link in time. A full refund of ₹%s has been requested.',
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
