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
