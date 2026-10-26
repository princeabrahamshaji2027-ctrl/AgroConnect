-- PROPOSED — NOT APPLIED TO PRODUCTION. Cancellation rules, refunds and refund accounting (2026-10-26).
-- Depends on: 05, 11–15 (bookings, demo_payments snapshot, admin reporting), 17 (_post_system_message). Safe to re-run.
--
-- Owner decisions (2026-10-26):
--  * Farmer and expert can cancel an active (Booked) consultation AT ANY TIME. Completed / already cancelled: no.
--  * Cancelled by the EXPERT, an ADMIN or the system (no meeting link 5 min after start): the farmer gets a FULL refund.
--  * Cancelled by the FARMER at least 14 hours before the start (exactly 14 h counts as "before"): FULL refund.
--  * Cancelled by the FARMER later than that: the expert keeps 50 % of the agreed fee, AgroConnect keeps its 2 % commission,
--    the farmer is refunded the rest (48 %). In paise: expert keeps ceil(F / 2) (= half, rounded half up), AgroConnect keeps
--    C = _commission_paise(F, 200), refund R = F − ceil(F / 2) − C.
--  * Times are the database clock and the booking's own start (consultation_start(), Asia/Kolkata) — never the phone's.
-- Accounting: the confirmed payment snapshot (demo_payments) is never changed. A refund is ONE append-only row in
-- demo_payment_adjustments: refund R, commission reversal, expert-share reversal (they add up to R). Full refund → reversals
-- equal the original commission and share, so the booking nets to zero. Late farmer cancellation → commission reversal 0,
-- expert-share reversal R (the expert keeps half the fee). Everything is SIMULATED: no money is moved or refunded for real.
-- Rollback: redefine cancel_consultation_booking / admin_update_booking_status / process_consultation_lifecycle /
-- _admin_consultation_rows / admin_consultation_summary from 15, drop the new functions; the new table and columns can stay.

-- ── 1. columns, adjustment ledger, indexes ───────────────────────────────────────────────────────────────────
alter table public.consultation_bookings add column if not exists cancelled_at timestamptz;
alter table public.consultation_bookings add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;
alter table public.consultation_bookings add column if not exists cancelled_by_role text;
alter table public.consultation_bookings add column if not exists cancellation_rule text;
alter table public.consultation_bookings add column if not exists refund_paise integer;
alter table public.consultation_bookings drop constraint if exists consultation_bookings_cancel_role_check;
alter table public.consultation_bookings add constraint consultation_bookings_cancel_role_check
  check (cancelled_by_role is null or cancelled_by_role in ('farmer', 'expert', 'admin', 'system'));
alter table public.consultation_bookings drop constraint if exists consultation_bookings_cancel_rule_check;
alter table public.consultation_bookings add constraint consultation_bookings_cancel_rule_check
  check (cancellation_rule is null or cancellation_rule in ('farmer_early', 'farmer_late', 'expert_cancel', 'admin_cancel', 'no_show'));
alter table public.consultation_bookings drop constraint if exists consultation_bookings_refund_paise_check;
alter table public.consultation_bookings add constraint consultation_bookings_refund_paise_check check (refund_paise is null or refund_paise >= 0);

create table if not exists public.demo_payment_adjustments (
  id uuid primary key default gen_random_uuid(),
  demo_payment_id uuid not null references public.demo_payments(id) on delete cascade,
  booking_id uuid not null references public.consultation_bookings(id) on delete cascade,
  kind text not null default 'refund' check (kind = 'refund'),
  amount_paise integer not null check (amount_paise >= 0),
  commission_reversal_paise integer not null check (commission_reversal_paise >= 0),
  expert_share_reversal_paise integer not null check (expert_share_reversal_paise >= 0),
  rule text not null,
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (commission_reversal_paise + expert_share_reversal_paise = amount_paise),
  unique (booking_id, kind)
);
comment on table public.demo_payment_adjustments is
  'SIMULATED refund accounting: one append-only row per refunded booking. No money is moved; the original demo_payments snapshot is unchanged.';
alter table public.demo_payment_adjustments enable row level security;
drop policy if exists demo_payment_adjustments_select on public.demo_payment_adjustments;
create policy demo_payment_adjustments_select on public.demo_payment_adjustments for select to authenticated
  using (public.is_admin() or exists (select 1 from public.demo_payments dp where dp.id = demo_payment_id and dp.farmer_user_id = auth.uid()));
revoke all on public.demo_payment_adjustments from public, anon, authenticated;
grant select on public.demo_payment_adjustments to authenticated;
grant all on public.demo_payment_adjustments to service_role;

-- indexes for the Catch Up screens (upcoming / history per farmer and expert), open slots, notifications
create index if not exists bookings_farmer_upcoming_idx on public.consultation_bookings (farmer_id, meeting_date, meeting_time) where status = 'Booked';
create index if not exists bookings_expert_upcoming_idx on public.consultation_bookings (expert_id, meeting_date, meeting_time) where status = 'Booked';
create index if not exists bookings_farmer_history_idx on public.consultation_bookings (farmer_id, meeting_date desc, meeting_time desc) where status <> 'Booked';
create index if not exists slots_open_idx on public.consultation_slots (expert_id, slot_date, start_time) where not is_booked;
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

-- ── 2. the rule, in one place ────────────────────────────────────────────────────────────────────────────────
create or replace function public._inr(p_paise integer) returns text
language sql immutable set search_path = public as $$ select '₹' || to_char(coalesce(p_paise, 0) / 100.0, 'FM999999990.00') $$;

-- What a cancellation by p_role ('farmer' | 'expert' | 'admin' | 'system') at p_now would do. Pure calculation.
create or replace function public._cancellation_terms(p_booking_id uuid, p_role text, p_now timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b public.consultation_bookings%rowtype;
  dp public.demo_payments%rowtype;
  v_start timestamptz; v_cutoff timestamptz;
  f integer; c integer; e integer; v_keep integer;
  v_rule text; r integer; rc integer; re integer;
begin
  select * into b from public.consultation_bookings where id = p_booking_id;
  if not found then return null; end if;
  v_start := public.consultation_start(b.meeting_date, b.meeting_time);
  v_cutoff := v_start - interval '14 hours';
  select * into dp from public.demo_payments where booking_id = b.id and status = 'succeeded';
  if found then f := dp.amount_paise; c := dp.commission_paise; e := dp.expert_share_paise;
  else
    f := round(public._agreed_fee_rupees(b.id) * 100)::integer;   -- bookings made before the checkout existed
    c := public._commission_paise(f, 200); e := f - c;
  end if;
  if p_role = 'farmer' and p_now > v_cutoff then
    v_rule := 'farmer_late';
    v_keep := (f + 1) / 2;                       -- the expert keeps half (rounded half up)
    r := greatest(0, f - v_keep - c);            -- AgroConnect keeps its commission
    rc := 0; re := r;
  else
    v_rule := case p_role when 'farmer' then 'farmer_early' when 'expert' then 'expert_cancel'
                          when 'admin' then 'admin_cancel' else 'no_show' end;
    r := f; rc := c; re := e;
  end if;
  return jsonb_build_object(
    'status', b.status, 'allowed', b.status = 'Booked', 'rule', v_rule,
    'starts_at', v_start, 'cutoff_at', v_cutoff, 'server_now', p_now, 'has_payment', dp.id is not null,
    'fee_paise', f, 'refund_paise', r, 'commission_reversal_paise', rc, 'expert_share_reversal_paise', re,
    'expert_keeps_paise', e - re, 'platform_keeps_paise', c - rc, 'full_refund', r = f);
end $$;

-- What the signed-in participant (or an admin) would get by cancelling now — shown before the user confirms.
create or replace function public.consultation_cancellation_quote(p_booking_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b public.consultation_bookings%rowtype; v_role text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into b from public.consultation_bookings where id = p_booking_id;
  if not found then raise exception 'booking not found' using errcode = '42501'; end if;
  v_role := public._booking_party(b);
  if v_role is null and public.is_admin() then v_role := 'admin'; end if;
  if v_role is null then raise exception 'booking not found' using errcode = '42501'; end if;
  return public._cancellation_terms(b.id, v_role, now()) || jsonb_build_object('role', v_role);
end $$;

-- Apply a cancellation (inside the caller's locked transaction).
create or replace function public._apply_cancellation(p_booking_id uuid, p_role text, p_actor uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t jsonb; dp_id uuid;
begin
  t := public._cancellation_terms(p_booking_id, p_role, now());
  update public.consultation_bookings
     set status = 'Cancelled', cancellation_reason = coalesce(nullif(trim(p_reason), ''), cancellation_reason),
         cancelled_at = now(), cancelled_by = p_actor, cancelled_by_role = p_role, cancellation_rule = t->>'rule',
         refund_paise = (t->>'refund_paise')::integer, refund_amount = (t->>'refund_paise')::integer / 100.0,
         refund_status = case when (t->>'refund_paise')::integer > 0 then 'Pending' else 'None' end,
         updated_at = now()
   where id = p_booking_id;
  update public.consultation_slots s set is_booked = false
    from public.consultation_bookings b where b.id = p_booking_id and s.id = b.slot_id;
  update public.video_meetings set status = 'Cancelled' where booking_id = p_booking_id;
  -- reminders already queued for this booking must not go out any more
  update public.push_outbox set status = 'failed', last_error = 'booking cancelled'
   where status = 'queued' and data->>'booking_id' = p_booking_id::text;
  select id into dp_id from public.demo_payments where booking_id = p_booking_id and status = 'succeeded';
  if dp_id is not null and (t->>'refund_paise')::integer > 0 then
    insert into public.demo_payment_adjustments
      (demo_payment_id, booking_id, kind, amount_paise, commission_reversal_paise, expert_share_reversal_paise, rule, reason, created_by)
    values (dp_id, p_booking_id, 'refund', (t->>'refund_paise')::integer, (t->>'commission_reversal_paise')::integer,
            (t->>'expert_share_reversal_paise')::integer, t->>'rule', nullif(trim(p_reason), ''), p_actor)
    on conflict (booking_id, kind) do nothing;
  end if;
  return t;
end $$;

-- ── 3. farmer / expert cancellation (same signature as before; returns the refund in rupees) ─────────────────
create or replace function public.cancel_consultation_booking(p_booking_id uuid, p_reason text, p_offered_slots jsonb default '[]'::jsonb)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  b public.consultation_bookings%rowtype;
  v_party text;
  v_expert_user uuid; v_farmer_user uuid; v_expert_name text;
  t jsonb; v_refund integer; v_when text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into b from public.consultation_bookings where id = p_booking_id for update;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  v_party := public._booking_party(b);
  if v_party is null then raise exception 'not a participant of this booking' using errcode = '42501'; end if;
  if b.status = 'Cancelled' then return coalesce(b.refund_amount, 0); end if;   -- repeated request: nothing changes
  if b.status <> 'Booked' then raise exception 'This consultation has already been completed and cannot be cancelled.' using errcode = '22023'; end if;
  if coalesce(length(trim(p_reason)), 0) = 0 then raise exception 'Please enter a cancellation reason.' using errcode = '22023'; end if;
  if length(trim(p_reason)) > 500 then raise exception 'Please keep the reason under 500 characters.' using errcode = '22023'; end if;
  if v_party = 'expert' and (jsonb_typeof(p_offered_slots) <> 'array' or jsonb_array_length(p_offered_slots) = 0) then
    raise exception 'Please offer at least one alternative date and time.' using errcode = '22023';
  end if;

  select user_id into v_expert_user from public.experts where id = b.expert_id;
  select user_id into v_farmer_user from public.farmer_profiles where id = b.farmer_id;
  select coalesce(full_name, 'Expert') into v_expert_name from public.profiles where id = v_expert_user;
  v_when := format('%s at %s', to_char(b.meeting_date, 'FMDD Mon YYYY'), to_char(b.meeting_time, 'FMHH12:MI AM'));

  t := public._apply_cancellation(b.id, v_party, auth.uid(), p_reason);
  v_refund := (t->>'refund_paise')::integer;

  if v_party = 'expert' then
    update public.consultation_bookings set offered_reschedule_slots = p_offered_slots where id = b.id;
    perform public._notify(v_farmer_user, 'booking',
      format('Your consultation on %s was cancelled by the expert. A full refund of %s has been requested. Reason: %s',
             v_when, public._inr(v_refund), trim(p_reason)), b.id);
    perform public._post_system_message(v_expert_user, v_farmer_user, format('Meeting Cancelled: %s', trim(p_reason)),
      'cancellation_reschedule', jsonb_build_object('booking_id', b.id, 'expert_id', b.expert_id, 'expert_name', v_expert_name,
        'cancellation_reason', trim(p_reason), 'offered_slots', p_offered_slots));
  else
    perform public._notify(v_expert_user, 'booking',
      format('Meeting on %s was cancelled by the farmer. Reason: %s', v_when, trim(p_reason)), b.id);
    perform public._notify(v_farmer_user, 'booking',
      case when t->>'rule' = 'farmer_early'
           then format('You cancelled your consultation on %s. A full refund of %s has been requested.', v_when, public._inr(v_refund))
           else format('You cancelled your consultation on %s less than 14 hours before the start. A refund of %s has been requested; %s goes to the expert and %s to AgroConnect.',
                       v_when, public._inr(v_refund), public._inr((t->>'expert_keeps_paise')::integer), public._inr((t->>'platform_keeps_paise')::integer)) end,
      b.id);
    perform public._notify_admins('system',
      format('Farmer Cancellation Alert: Meeting %s on %s was cancelled by farmer.', left(b.id::text, 8), b.meeting_date), b.id);
    perform public._post_system_message(v_farmer_user, v_expert_user, format('Meeting Cancelled: %s', trim(p_reason)),
      'cancellation_reschedule', jsonb_build_object('booking_id', b.id, 'cancellation_reason', trim(p_reason)));
  end if;
  return v_refund / 100.0;
end $$;
revoke all on function public.cancel_consultation_booking(uuid, text, jsonb) from public, anon;
grant execute on function public.cancel_consultation_booking(uuid, text, jsonb) to authenticated;

-- ── 4. admin cancellation (full refund, reason required, audited); the status function no longer cancels ─────
create or replace function public.admin_cancel_booking(p_booking_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.consultation_bookings%rowtype; t jsonb; v_when text;
begin
  if not public.is_admin() then raise exception 'Access denied: Admin privileges required.' using errcode = '42501'; end if;
  if coalesce(length(trim(p_reason)), 0) = 0 then raise exception 'Please enter a cancellation reason.' using errcode = '22023'; end if;
  select * into b from public.consultation_bookings where id = p_booking_id for update;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if b.status = 'Cancelled' then return public._cancellation_terms(b.id, coalesce(b.cancelled_by_role, 'admin')) || jsonb_build_object('already_cancelled', true); end if;
  if b.status <> 'Booked' then raise exception 'This consultation has already been completed and cannot be cancelled.' using errcode = '22023'; end if;
  t := public._apply_cancellation(b.id, 'admin', auth.uid(), p_reason);
  v_when := format('%s at %s', to_char(b.meeting_date, 'FMDD Mon YYYY'), to_char(b.meeting_time, 'FMHH12:MI AM'));
  perform public._notify((select user_id from public.farmer_profiles where id = b.farmer_id), 'booking',
    format('Your consultation on %s was cancelled by AgroConnect. A full refund of %s has been requested. Reason: %s',
           v_when, public._inr((t->>'refund_paise')::integer), trim(p_reason)), b.id);
  perform public._notify((select user_id from public.experts where id = b.expert_id), 'booking',
    format('Your consultation on %s was cancelled by AgroConnect. Reason: %s', v_when, trim(p_reason)), b.id);
  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (auth.uid(), 'cancel_booking', 'consultation_bookings', b.id,
          jsonb_build_object('previous_status', b.status, 'reason', trim(p_reason), 'refund_paise', (t->>'refund_paise')::integer,
                             'rule', t->>'rule'));
  return t;
end $$;
revoke all on function public.admin_cancel_booking(uuid, text) from public, anon;
grant execute on function public.admin_cancel_booking(uuid, text) to authenticated;

create or replace function public.admin_update_booking_status(p_booking_id uuid, p_new_status character varying, p_cancellation_reason text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
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
  if v_new_status = 'Cancelled' then
    raise exception 'Use admin_cancel_booking to cancel a consultation (the refund and the audit entry are recorded there).' using errcode = '22023';
  end if;
  select status into v_current_status from public.consultation_bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found with ID %', p_booking_id using errcode = 'P0002';
  end if;
  if v_current_status = 'Cancelled' then
    raise exception 'A cancelled consultation cannot be reopened or completed.' using errcode = '22023';
  end if;
  update public.consultation_bookings
     set status = v_new_status,
         completion_source = case when v_new_status = 'Completed' and v_current_status <> 'Completed' then 'admin' else completion_source end,
         updated_at = now()
   where id = p_booking_id;
  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (auth.uid(), 'update_booking_status', 'consultation_bookings', p_booking_id,
          jsonb_build_object('previous_status', v_current_status, 'new_status', v_new_status));
  return true;
end;
$$;
revoke all on function public.admin_update_booking_status(uuid, character varying, text) from public, anon;
grant execute on function public.admin_update_booking_status(uuid, character varying, text) to authenticated;

revoke all on function public._inr(integer) from public, anon, authenticated;
revoke all on function public._cancellation_terms(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public._apply_cancellation(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.consultation_cancellation_quote(uuid) from public, anon;
grant execute on function public.consultation_cancellation_quote(uuid) to authenticated;

-- ── 5. admin reporting gets cancellation and refund columns ──────────────────────────────────────────────────
drop function if exists public._admin_consultation_rows(jsonb);
create or replace function public._admin_consultation_rows(p_filters jsonb)
returns table (
  booking_id uuid, meeting_date date, start_time time, end_time time, duration_minutes integer, status text,
  farmer_id uuid, farmer_user_id uuid, farmer_name text, farmer_phone text, farmer_location text,
  expert_id uuid, expert_user_id uuid, expert_name text, expert_phone text, expert_location text,
  issue text, created_at timestamptz, confirmed_at timestamptz, payment_id uuid, transaction_type text, payment_status text,
  amount_paise integer, currency text, commission_bps integer, commission_paise integer, expert_share_paise integer,
  link_saved boolean, completion_source text, rating integer, review_comment text, reviewed_at timestamptz,
  cancellation_reason text, refund_status text, refund_amount numeric,
  cancelled_at timestamptz, cancelled_by_role text, cancellation_rule text, refund_paise integer,
  refund_commission_reversal_paise integer, refund_expert_share_reversal_paise integer)
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
         b.cancellation_reason, b.refund_status, b.refund_amount,
         b.cancelled_at, b.cancelled_by_role, b.cancellation_rule, b.refund_paise,
         adj.commission_reversal_paise, adj.expert_share_reversal_paise
    from public.consultation_bookings b
    left join public.consultation_slots s on s.id = b.slot_id
    left join public.farmer_profiles f on f.id = b.farmer_id
    left join public.profiles fp on fp.id = f.user_id
    left join public.experts e on e.id = b.expert_id
    left join public.profiles ep on ep.id = e.user_id
    left join public.demo_payments dp on dp.booking_id = b.id and dp.status = 'succeeded'
    left join public.video_meetings vm on vm.booking_id = b.id
    left join public.reviews r on r.booking_id = b.id
    left join public.demo_payment_adjustments adj on adj.booking_id = b.id and adj.kind = 'refund'
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
     and (p_filters->>'review' is null or (p_filters->>'review' = 'reviewed') = (r.booking_id is not null))
     and (p_filters->>'cancellation_rule' is null or b.cancellation_rule = p_filters->>'cancellation_rule');
$$;
revoke all on function public._admin_consultation_rows(jsonb) from public, anon, authenticated;

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
    'cancelled_value_paise', coalesce(sum(amount_paise) filter (where payment_id is not null and status = 'Cancelled'), 0),
    'refunds_paise', coalesce(sum(refund_paise) filter (where status = 'Cancelled'), 0),
    'net_commission_paise', coalesce(sum(commission_paise - coalesce(refund_commission_reversal_paise, 0)) filter (where payment_id is not null), 0),
    'net_expert_share_paise', coalesce(sum(expert_share_paise - coalesce(refund_expert_share_reversal_paise, 0)) filter (where payment_id is not null), 0))
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

revoke all on function public.admin_consultation_summary(jsonb) from public, anon;
grant execute on function public.admin_consultation_summary(jsonb) to authenticated;

-- ── 6. scheduler: no-show cancellations record who/when/rule and the refund adjustment (otherwise as in 15) ──
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
           refund_paise = round(public._agreed_fee_rupees(b.id) * 100)::integer,
           cancelled_at = p_now, cancelled_by_role = 'system', cancellation_rule = 'no_show',
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
    insert into public.demo_payment_adjustments
      (demo_payment_id, booking_id, kind, amount_paise, commission_reversal_paise, expert_share_reversal_paise, rule, reason)
    select dp.id, dp.booking_id, 'refund', dp.amount_paise, dp.commission_paise, dp.expert_share_paise, 'no_show',
           'The expert did not add a meeting link in time'
      from public.demo_payments dp where dp.booking_id = any(v_ids) and dp.status = 'succeeded'
    on conflict (booking_id, kind) do nothing;
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
