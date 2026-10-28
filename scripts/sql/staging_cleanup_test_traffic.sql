-- STAGING ONLY (ahkgvuewgbjyahbiehrx). Removes the text the automated tests leave behind (old names, "E2E" topics) so
-- the staging app looks natural. Test accounts = auth users with raw_user_meta_data.fixture set
-- (scripts/staging/rename-fixtures.mjs). Nothing involving any other account is touched; Booked bookings are kept.
-- Run the counts query in CLEANUP_AND_FEED_PLAN_2026-10-28.md §B3 first. First run 2026-10-28: R2 2,652 notifications,
-- R3 10 conversations / 156 messages, R4 389 bookings (+269 payments, 143 adjustments, 389 meetings, 35 reviews),
-- R5 195 past free slots.
do $$
begin
  -- refuse to run where the staging fixtures do not exist (e.g. production has none of these markers)
  if not exists (select 1 from auth.users where raw_user_meta_data->>'fixture' = 'expert1') then
    raise exception 'no staging fixture accounts here — refusing to run';
  end if;
end $$;

create temp table _fx on commit drop as select id from auth.users where raw_user_meta_data->>'fixture' is not null;
create temp table _bk on commit drop as
  select b.id from public.consultation_bookings b
   where b.farmer_id in (select f.id from public.farmer_profiles f where f.user_id in (select id from _fx))
     and b.expert_id in (select e.id from public.experts e where e.user_id in (select id from _fx))
     and b.status in ('Cancelled', 'Completed');
create temp table _cv on commit drop as
  select c.id from public.conversations c where c.user_one in (select id from _fx) and c.user_two in (select id from _fx);

-- R2 notifications of test accounts (their push_outbox rows cascade)
delete from public.notifications where user_id in (select id from _fx);
-- R3 chats between test accounts
delete from public.messages where conversation_id in (select id from _cv);
delete from public.conversations where id in (select id from _cv);
-- R4 finished bookings between test accounts and their dependent rows
delete from public.reviews where booking_id in (select id from _bk);
delete from public.demo_payment_adjustments where booking_id in (select id from _bk);
delete from public.demo_payments where booking_id in (select id from _bk);
delete from public.video_meetings where booking_id in (select id from _bk);
delete from public.consultation_bookings where id in (select id from _bk);
-- R5 past free slots of the test expert (slots of the deleted bookings included; booked or referenced ones stay)
delete from public.consultation_slots s
 where s.expert_id in (select e.id from public.experts e where e.user_id in (select id from _fx))
   and s.slot_date < current_date and not s.is_booked
   and not exists (select 1 from public.consultation_bookings b where b.slot_id = s.id);
