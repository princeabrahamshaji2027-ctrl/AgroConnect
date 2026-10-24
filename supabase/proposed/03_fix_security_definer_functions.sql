-- PROPOSED — NOT APPLIED. AUD-012. Re-runnable.
-- Live state (2026-10-24): is_banned() is correct live (reads profiles.is_banned) — the repo migration
-- 20260814_profiles_rls_fix.sql has a DIFFERENT, broken body (profiles.status does not exist) and must never be
-- applied. is_admin() is SECURITY INVOKER (works only because profiles_select is `true`; it would break as soon as
-- profile reads are narrowed). No SECURITY DEFINER function pins search_path (Supabase linter:
-- function_search_path_mutable).

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'Admin');
$$;

create or replace function public.is_banned()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_banned from public.profiles where id = auth.uid()), false);
$$;

-- Pin search_path on every remaining function in public (Supabase advisor: function_search_path_mutable, 21 hits).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public', f.sig);
  end loop;
end $$;

-- Supabase advisor anon_security_definer_function_executable (14 hits): admin RPCs check is_admin() internally,
-- but anonymous callers have no reason to reach them; trigger functions are never called through the API.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.prorettype = 'trigger'::regtype as is_trigger
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and p.proname in ('admin_update_booking_status', 'approve_expert_application', 'approve_expert_resignation',
                         'approve_seller', 'ban_user', 'demote_expert', 'place_order', 'reject_expert_application',
                         'reject_seller', 'resolve_report', 'send_broadcast', 'handle_new_user')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.is_trigger then
      execute format('revoke execute on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
-- Also enable "Leaked password protection" in Dashboard -> Authentication -> Passwords (not settable from SQL).


-- Trigger functions made SECURITY DEFINER by 01 must not be API-callable either (Postgres refuses direct calls to
-- trigger functions anyway; this keeps the advisor clean). EXECUTE is only checked when a trigger is created, so the
-- triggers keep firing for every role.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
