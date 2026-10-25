-- PROPOSED — NOT APPLIED. AUD-015: repair the *.agroconnect.local test fixtures.
-- Run as the database owner (Supabase SQL editor / service role) on STAGING first.
-- Touches only the five fixture accounts, and only if their auth.users email ends in @agroconnect.local.
-- Re-runnable. Equivalent to what approve_expert_application() produces for a real approval.
--
-- Found on 2026-10-24 (read-only): expert1 has profiles.role = 'Expert' but NO experts row, so Connect.jsx
-- (which decides expert mode from the experts row) shows it the farmer view. user2 and user3 drifted to 'Expert'
-- (with experts rows) during earlier test runs, so they no longer represent Pending / fresh farmers.

-- ---- expert1: approved expert with an experts row, application history and future open slots
-- Fixtures are found by email (accounts created through normal signup get random ids).
do $$
declare
  v_user uuid := (select id from auth.users where email = 'expert1@agroconnect.local');
begin
  if v_user is null then
    raise notice 'expert1 fixture not present; skipped';
    return;
  end if;

  update public.profiles set role = 'Expert' where id = v_user;

  insert into public.experts (user_id, specialization, verified_date, is_active)
  values (v_user, 'Soil & Agronomy', current_date, true)
  on conflict (user_id) do update set is_active = true;

  if not exists (select 1 from public.expert_applications where user_id = v_user and status = 'Approved') then
    insert into public.expert_applications (user_id, qualification, experience, cv_file_path, status)
    values (v_user, 'Ph.D Soil Science', '12 years research & consultation', 'expert-cvs/expert1_cv.pdf', 'Approved');
  end if;

  -- 10:00 and 15:00 on each of the next 14 days (local), skipping slots that already exist.
  insert into public.consultation_slots (expert_id, slot_date, start_time, end_time, rate, is_booked)
  select e.id, d::date, t::time, (t::time + interval '30 minutes')::time, 500, false
    from public.experts e
   cross join generate_series(current_date + 1, current_date + 14, interval '1 day') d
   cross join (values ('10:00'), ('15:00')) as times(t)
   where e.user_id = v_user
  on conflict (expert_id, slot_date, start_time) do nothing;
end $$;

-- ---- user1 / user3: plain farmers without applications; user2: Pending; user4: Rejected.
-- Removing an experts row cascades to that fixture's slots and bookings (test data only).
do $$
declare
  r record;
begin
  for r in
    select u.id as user_id, f.app_status from (values
      ('user1@agroconnect.local', null::text),
      ('user2@agroconnect.local', 'Pending'),
      ('user3@agroconnect.local', null),
      ('user4@agroconnect.local', 'Rejected')
    ) as f(email, app_status) join auth.users u on u.email = f.email
  loop
    delete from public.experts where user_id = r.user_id;
    update public.profiles set role = 'Farmer' where id = r.user_id;
    delete from public.expert_applications where user_id = r.user_id;
    if r.app_status is not null then
      insert into public.expert_applications (user_id, qualification, experience, cv_file_path, status)
      values (r.user_id, 'B.Sc Agriculture', '5 years organic farming', 'expert-cvs/fixture_cv.pdf',
              r.app_status::public.application_status);
    end if;
  end loop;
end $$;
