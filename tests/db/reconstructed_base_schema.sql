-- RECONSTRUCTED BASELINE — FOR LOCAL TESTS ONLY. NOT A MIGRATION. NOT A COPY OF PRODUCTION.
--
-- The repo cannot recreate the live database (base tables, most RLS policies and RPCs exist only in Supabase;
-- see AUDIT_ISSUES.md). This file rebuilds the subset AgroConnect uses, from:
--   * column names observed read-only through the anon REST API on 2026-10-24,
--   * enum values recorded in appium-results/2026-09-26_21-32/REPORT.md,
--   * the queries in src/ and admin-dashboard/src/.
-- Column types that could not be observed are best guesses and marked "guess".
-- Policies are the PERMISSIVE behaviour the current client code needs in order to work (e.g. any signed-in user
-- may insert a notification for anyone). That lets the security tests show the hole before the fix.
-- Replace this file with the real schema export (scripts/export-live-schema.sh) when it is available.

-- ---------- Supabase platform stand-ins ----------
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text unique, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create type public.user_role as enum ('Farmer', 'Seller', 'Expert', 'Admin');
create type public.application_status as enum ('Pending', 'Approved', 'Rejected');

-- ---------- Tables ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name varchar(150), role public.user_role not null default 'Farmer', bio text, location text,
  phone varchar(20), profile_image_path text, is_banned boolean not null default false, ban_reason text,
  banned_at timestamptz, follower_count int not null default 0, post_count int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.farmer_profiles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references public.profiles(id) on delete cascade,
  farm_size numeric default 0, crop_type text, soil_type text, location text, created_at timestamptz not null default now()
);
create table public.experts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references public.profiles(id) on delete cascade,
  specialization varchar(150), verified_date date, rating numeric(2,1) default 5.0,
  meeting_duration_minutes int default 30, buffer_time_minutes int default 10, created_at timestamptz not null default now()
);
create table public.expert_applications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  qualification varchar(255), experience text, cv_file_path text, status public.application_status not null default 'Pending',
  admin_notes text, created_at timestamptz not null default now()
);
create table public.consultation_slots (
  id uuid primary key default gen_random_uuid(), expert_id uuid not null references public.experts(id) on delete cascade,
  slot_date date not null, start_time time not null, end_time time, rate numeric default 500,
  is_booked boolean not null default false, created_at timestamptz not null default now(),
  unique (expert_id, slot_date, start_time)
);
create table public.consultation_bookings (
  id uuid primary key default gen_random_uuid(),
  expert_id uuid not null references public.experts(id) on delete cascade,
  farmer_id uuid not null references public.farmer_profiles(id) on delete cascade,
  slot_id uuid references public.consultation_slots(id) on delete set null,
  meeting_date date not null, meeting_time time not null, issue_description text,
  status varchar(20) not null default 'Booked',  -- guess: varchar (admin_update_booking_status takes varchar)
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.video_meetings (
  id uuid primary key default gen_random_uuid(), booking_id uuid references public.consultation_bookings(id) on delete cascade,
  meeting_link text, status varchar(20) default 'Scheduled', created_at timestamptz not null default now()
);
create table public.reviews (
  id uuid primary key default gen_random_uuid(), booking_id uuid references public.consultation_bookings(id) on delete cascade,
  reviewer_id uuid references public.profiles(id) on delete cascade, expert_id uuid references public.experts(id) on delete cascade,
  rating int check (rating between 1 and 5), comment text, created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  type varchar(50), message text, related_id uuid, is_read boolean not null default false, created_at timestamptz not null default now()
);
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(), admin_id uuid, action text, target_table text, target_id uuid,
  details jsonb, created_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid, sender_id uuid, content text,
  is_read boolean default false, created_at timestamptz not null default now()
);
create table public.followers (
  id uuid primary key default gen_random_uuid(), follower_id uuid references public.profiles(id) on delete cascade,
  following_id uuid references public.profiles(id) on delete cascade, created_at timestamptz not null default now()
);
create table public.posts (
  id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id) on delete cascade,
  caption text, status varchar(20) default 'Approved', created_at timestamptz not null default now()
);
create table public.products (id uuid primary key default gen_random_uuid(), price numeric, stock int);

-- ---------- Permissive baseline policies (what the current client code relies on) ----------
do $$ declare t text; begin
  foreach t in array array['profiles','farmer_profiles','experts','expert_applications','consultation_slots',
    'consultation_bookings','video_meetings','reviews','notifications','admin_audit_log','messages','products',
    'followers','posts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select on public.%I to anon', t);
  end loop;
end $$;

-- Observed live: anonymous visitors can read these.
create policy base_profiles_read_all on public.profiles for select using (true);
create policy base_farmer_profiles_read_all on public.farmer_profiles for select using (true);
create policy base_experts_read_all on public.experts for select using (true);
create policy base_slots_read_all on public.consultation_slots for select using (true);
create policy base_reviews_read_all on public.reviews for select using (true);
create policy base_followers_read_all on public.followers for select using (true);
create policy base_bookings_read_all on public.consultation_bookings for select using (true);
create policy base_video_read_all on public.video_meetings for select using (true);

create policy base_farmer_profiles_own on public.farmer_profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy base_experts_own_update on public.experts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy base_apps_own on public.expert_applications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Needed by Connect.jsx today: experts write their slots; farmers flip is_booked when booking/cancelling.
create policy base_slots_write on public.consultation_slots for all to authenticated using (true) with check (true);
-- Needed by Connect.jsx today: either participant (and the reminder loop of *any* participant's browser) updates bookings.
create policy base_bookings_all on public.consultation_bookings for all to authenticated using (true) with check (true);
create policy base_video_all on public.video_meetings for all to authenticated using (true) with check (true);
create policy base_reviews_insert on public.reviews for insert to authenticated with check (reviewer_id = auth.uid());
-- Needed by Connect.jsx today: browsers insert reminders / alerts for other users and for every admin.
create policy base_notifications_insert_any on public.notifications for insert to authenticated with check (true);
create policy base_notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy base_notifications_own_update on public.notifications for update to authenticated using (user_id = auth.uid());
create policy base_audit_insert on public.admin_audit_log for insert to authenticated with check (true);
create policy base_messages_own on public.messages for all to authenticated using (sender_id = auth.uid()) with check (sender_id = auth.uid());

-- ---------- Reconstructed RPC (live definition not in the repo) ----------
-- Behaviour as described in agent.md: approval inserts the experts row and sets profiles.role = 'Expert'.
create function public.approve_expert_application(p_application_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'Admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.expert_applications set status = 'Approved'
   where id = p_application_id and status = 'Pending' returning user_id into v_user;
  if v_user is null then raise exception 'application not pending'; end if;
  insert into public.experts (user_id, verified_date) values (v_user, current_date)
    on conflict (user_id) do nothing;
  update public.profiles set role = 'Expert' where id = v_user;
  insert into public.admin_audit_log (admin_id, action, target_table, target_id)
    values (auth.uid(), 'approve_expert', 'expert_applications', p_application_id);
end $$;
