-- PROPOSED — NOT APPLIED. AUD-042: reconcile production with the repo's migration history. Re-runnable, additive.
-- (Replaces the superseded 04_book_consultation_rpc.sql, whose content now lives in 05.)
--
-- Comparing supabase/schema/live_schema_20261024.sql with supabase/migrations/ shows:
--   20260807  NOT applied: no one_pending_application_per_user index, no posts.title column.
--   20260814  NOT applied as written — and must NOT be: its is_banned() references profiles.status (does not exist)
--             and its profiles_select would hide every other user's name from the app. Superseded by 02 + 03.
--   20260909  applied (products/expert_applications CHECK constraints exist).
--   20260913  applied (cancellation_reason, offered_reschedule_slots, messages.message_type/metadata, experts.is_active).
--   20260914  applied, but admin_update_booking_status() cannot work: it assigns a varchar to the booking_status enum
--             column (rejected) and writes consultation_bookings.updated_at (missing) -> every admin Cancel/Complete
--             in the Meetings page fails. Fixed below (column added, function redefined with a cast).
--   20260918  NOT applied: none of its columns exist (the current Catch Up code writes them and silently fails).
--   live-only: migration `agent_fixes_20261024` (demote_expert, expert_resignations, ...) is applied but its file is
--             only in the main checkout's uncommitted work.

alter table public.consultation_bookings
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists expert_joined_at timestamptz,
  add column if not exists notified_24h boolean not null default false,
  add column if not exists notified_dayof boolean not null default false,
  add column if not exists notified_30min boolean not null default false,
  add column if not exists notified_expert_10min boolean not null default false,
  add column if not exists refund_status text not null default 'None',
  add column if not exists refund_amount numeric not null default 0;

alter table public.experts add column if not exists no_show_count integer not null default 0;

-- 20260807
alter table public.posts add column if not exists title varchar(150);
create unique index if not exists one_pending_application_per_user
  on public.expert_applications (user_id) where status = 'Pending';

-- admin_update_booking_status: same behaviour as the 20260914 migration, with the enum cast it was missing.
create or replace function public.admin_update_booking_status(
  p_booking_id uuid, p_new_status character varying, p_cancellation_reason text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
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
