-- ROLLBACK for 01, 02 and 05 (03 only tightens existing helper functions and needs no rollback; 06 only touches
-- *.agroconnect.local test data). Run sections in reverse order of application. Tested in tests/db.
-- After rolling back 05 the OLD client code (direct table writes) works again; the NEW client code does not.

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
-- The unique index and NOT VALID check constraint are harmless to keep; drop only if they block something:
-- drop index if exists public.consultation_bookings_one_active_per_slot;
-- alter table public.consultation_bookings drop constraint if exists consultation_bookings_refund_status_check;
-- (consultation_start, app_timezone, is_client_request are pure helpers and are left in place.)

-- ---- undo 02
drop policy if exists profiles_no_anonymous_read on public.profiles;
drop policy if exists farmer_profiles_no_anonymous_read on public.farmer_profiles;
drop policy if exists followers_no_anonymous_read on public.followers;

-- ---- undo 01
drop trigger if exists protect_profile_privileged_columns on public.profiles;
drop function if exists public.protect_profile_privileged_columns();
