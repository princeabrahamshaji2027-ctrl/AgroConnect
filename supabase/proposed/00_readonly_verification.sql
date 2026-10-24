-- READ-ONLY. Run in the Supabase SQL editor to confirm the audit's suspected database issues.
-- Nothing here modifies data.

-- 1. Every RLS policy on public tables (AUD-003, AUD-008, AUD-013)
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- 2. Tables with RLS disabled (Rules.md §4.3 says there must be none)
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- 3. Triggers on profiles / auth.users: is there anything that blocks a user from changing their own role?
select event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where event_object_table in ('profiles', 'users')
order by 1, 2, 3;

-- 4. Signup trigger body: does it copy raw_user_meta_data->>'role' into profiles.role? (AUD-003b)
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('handle_new_user', 'is_admin', 'is_banned',
  'approve_expert_application', 'reject_expert_application', 'ban_user', 'send_broadcast',
  'resolve_report', 'approve_seller', 'reject_seller', 'admin_update_booking_status',
  'demote_expert', 'approve_expert_resignation');

-- 5. SECURITY DEFINER functions without a pinned search_path (AUD-012)
select p.proname, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');

-- 6. Data consistency: Expert role without an experts row (explains the missing expert Catch Up view, AUD-015)
select pr.id, pr.full_name
from public.profiles pr
left join public.experts e on e.user_id = pr.id
where pr.role = 'Expert' and e.id is null;

-- 7. Who holds the Admin role (two Admin profiles were visible on 2026-10-24 — confirm both are intended)
select id, full_name, created_at from public.profiles where role = 'Admin';

-- 8. Double-booked slots, if any (AUD-014)
select slot_id, count(*) from public.consultation_bookings
where slot_id is not null and status = 'Booked'
group by slot_id having count(*) > 1;

-- 9. Functions that write notifications or profile counters, and whether they are SECURITY DEFINER.
--    Any row with prosecdef = false that is used by a trigger will be blocked by 01/05 guards: make it
--    SECURITY DEFINER (or move it into a definer function) before applying 01 and 05.
select p.proname, p.prosecdef,
       pg_get_functiondef(p.oid) ~* 'insert\s+into\s+(public\.)?notifications' as writes_notifications,
       pg_get_functiondef(p.oid) ~* '(follower_count|post_count)' as writes_profile_counters
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and (pg_get_functiondef(p.oid) ~* 'insert\s+into\s+(public\.)?notifications'
       or pg_get_functiondef(p.oid) ~* '(follower_count|post_count)');

-- 10. All triggers in public (which functions above are actually wired to tables)
select event_object_table, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers where trigger_schema = 'public' order by 1, 2;

-- 11. Is pg_cron available/enabled for the 05 lifecycle job?
select name, default_version, installed_version from pg_available_extensions where name = 'pg_cron';

-- 12. Unexpected refund_status values (05 adds a NOT VALID check constraint). Written via to_jsonb so it also runs
--     before 04 has added the column (production on 2026-10-24 had no refund_status column).
select to_jsonb(b) ->> 'refund_status' as refund_status, count(*) from public.consultation_bookings b group by 1;

-- 13. Test-fixture state (AUD-015): role vs experts row vs latest application, for the *.agroconnect.local accounts
select u.email, p.role, (e.id is not null) as has_experts_row, e.is_active,
       (select a.status from public.expert_applications a where a.user_id = p.id order by a.created_at desc limit 1) as latest_application,
       (select count(*) from public.consultation_slots s where s.expert_id = e.id and s.slot_date >= current_date) as future_slots
from auth.users u join public.profiles p on p.id = u.id left join public.experts e on e.user_id = p.id
where u.email like '%@agroconnect.local' order by u.email;
