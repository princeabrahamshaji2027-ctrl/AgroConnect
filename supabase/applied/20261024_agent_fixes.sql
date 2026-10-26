-- APPLIED TO PRODUCTION 2026-10-24 as migration `agent_fixes_20261024`. Kept for history; do not re-run.
-- Source: the main checkout's untracked supabase/migrations/20261024_agent_fixes.sql (copied unchanged below).

-- ============================================================
-- AgroConnect Agent Fixes Migration — 2026-10-24
-- Implements items 2, 4, 9 from agent.md
-- ============================================================

-- ---------------------------------------------------------------
-- Fix #2: demote_expert RPC
-- Allows admin to remove Expert status from a verified expert.
-- Restores role to Farmer, removes from experts table,
-- leaves expert_applications history intact, and logs the action.
-- ---------------------------------------------------------------
create or replace function public.demote_expert(p_user_id uuid)
returns void language plpgsql security definer as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.profiles set role = 'Farmer' where id = p_user_id;
  delete from public.experts where user_id = p_user_id;
  -- leave expert_applications history intact — don't delete past application records
  insert into public.admin_audit_log (admin_id, action, target_table, target_id)
    values (auth.uid(), 'demote_expert', 'profiles', p_user_id);
end;
$$;

-- ---------------------------------------------------------------
-- Fix #4: One-time cleanup of duplicate expert applications
-- Keeps only the most recent application per user, deletes the rest
-- (pre-existing duplicates created before the unique index existed).
-- ---------------------------------------------------------------
delete from public.expert_applications a
using public.expert_applications b
where a.user_id = b.user_id
  and a.created_at < b.created_at;

-- ---------------------------------------------------------------
-- Fix #9: expert_resignations table for "Leave Being Expert"
-- Expert users can submit a reason; admin approves/rejects.
-- ---------------------------------------------------------------
create table if not exists public.expert_resignations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  status application_status not null default 'Pending',
  created_at timestamptz not null default now()
);

alter table public.expert_resignations enable row level security;

-- Drop policies if they exist so this migration is safe to re-run
drop policy if exists "resignations_insert" on public.expert_resignations;
drop policy if exists "resignations_select" on public.expert_resignations;

create policy "resignations_insert" on public.expert_resignations
  for insert with check (user_id = auth.uid());

create policy "resignations_select" on public.expert_resignations
  for select using (user_id = auth.uid() or public.is_admin());

-- Fix #9: approve_expert_resignation RPC
-- Admin approves a resignation → calls demote_expert to handle the state change.
create or replace function public.approve_expert_resignation(p_resignation_id uuid)
returns void language plpgsql security definer as $$
declare v_user_id uuid;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  select user_id into v_user_id from public.expert_resignations where id = p_resignation_id;
  update public.expert_resignations set status = 'Approved' where id = p_resignation_id;
  perform public.demote_expert(v_user_id); -- reuses fix #2's function, same end state
end;
$$;
