-- 25 — Expert broadcasts with administrator approval.
-- An active expert may write an announcement; it waits as 'pending' until an admin approves it (then it is delivered
-- exactly like send_broadcast: one 'announcement' notification per recipient, related_id = broadcast id) or rejects it.
-- Admin broadcasts (send_broadcast) are unchanged and stay 'approved' by default.
-- Recipients can now read the approved broadcasts they received (the app's announcement pop-up needs title/image),
-- and a sender can read their own; everything else stays admin-only.

alter table public.broadcasts add column if not exists status text not null default 'approved';
alter table public.broadcasts add column if not exists reviewed_by uuid;
alter table public.broadcasts add column if not exists reviewed_at timestamptz;
alter table public.broadcasts add column if not exists review_note text;
alter table public.broadcasts drop constraint if exists broadcasts_status_check;
alter table public.broadcasts add constraint broadcasts_status_check check (status in ('pending', 'approved', 'rejected'));
alter table public.broadcasts drop constraint if exists broadcasts_reviewed_by_fkey;
alter table public.broadcasts add constraint broadcasts_reviewed_by_fkey
  foreign key (reviewed_by) references public.profiles(id) on delete set null;
-- experts now send broadcasts too; their account must stay deletable (admins are never deleted through the app)
alter table public.broadcasts drop constraint if exists broadcasts_sent_by_fkey;
alter table public.broadcasts add constraint broadcasts_sent_by_fkey
  foreign key (sent_by) references public.profiles(id) on delete cascade;
create index if not exists broadcasts_pending_idx on public.broadcasts (created_at) where status = 'pending';

drop policy if exists broadcasts_read_own_or_received on public.broadcasts;
create policy broadcasts_read_own_or_received on public.broadcasts as permissive for select to authenticated
  using (sent_by = auth.uid()
         or (status = 'approved' and exists (select 1 from public.notifications n
                                              where n.related_id = broadcasts.id and n.user_id = auth.uid()
                                                and n.type = 'announcement')));

create or replace function public.submit_expert_broadcast(p_title text, p_message text, p_target_role public.user_role default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_title text := trim(coalesce(p_title, ''));
  v_message text := trim(coalesce(p_message, ''));
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'account is banned' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p join public.experts e on e.user_id = p.id
                  where p.id = v_uid and p.role = 'Expert' and e.is_active) then
    raise exception 'Only verified experts can send announcements' using errcode = '42501';
  end if;
  if length(v_title) not between 2 and 120 then
    raise exception 'Title must be 2 to 120 characters' using errcode = '22023';
  end if;
  if length(v_message) not between 5 and 1000 then
    raise exception 'Message must be 5 to 1000 characters' using errcode = '22023';
  end if;
  if p_target_role is not null and p_target_role not in ('Farmer', 'Expert') then
    raise exception 'Announcements can go to everyone, farmers or experts' using errcode = '22023';
  end if;
  if (select count(*) from public.broadcasts where sent_by = v_uid and status = 'pending') >= 3 then
    raise exception 'You already have 3 announcements waiting for review' using errcode = '54000';
  end if;

  insert into public.broadcasts (title, message, target_role, sent_by, status, action_type)
    values (v_title, v_message, p_target_role, v_uid, 'pending', 'dismissible')
    returning id into v_id;
  perform public._notify_admins('system',
    format('%s sent an announcement for review: "%s".',
           coalesce((select full_name from public.profiles where id = v_uid), 'An expert'), v_title), v_id);
  return v_id;
end $$;

create or replace function public.review_broadcast(p_broadcast_id uuid, p_approve boolean, p_note text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_b public.broadcasts%rowtype;
  v_count int := 0;
begin
  if not public.is_admin() then raise exception 'Admin privileges required' using errcode = '42501'; end if;
  if p_approve is null then raise exception 'approve or reject' using errcode = '22023'; end if;
  select * into v_b from public.broadcasts where id = p_broadcast_id for update;
  if v_b.id is null then raise exception 'announcement not found' using errcode = 'P0002'; end if;
  if v_b.status <> 'pending' then raise exception 'This announcement was already reviewed' using errcode = '55000'; end if;

  if p_approve then
    if not exists (select 1 from public.experts e join public.profiles p on p.id = e.user_id
                    where e.user_id = v_b.sent_by and e.is_active and p.role = 'Expert' and not p.is_banned) then
      raise exception 'The expert who wrote this is no longer active; reject it instead' using errcode = '55000';
    end if;
    insert into public.notifications (user_id, type, message, related_id)
    select id, 'announcement', v_b.message, v_b.id from public.profiles
     where v_b.target_role is null or role = v_b.target_role;
    get diagnostics v_count = row_count;
  end if;

  update public.broadcasts
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = nullif(trim(coalesce(p_note, '')), ''),
         recipient_count = v_count
   where id = v_b.id;
  perform public._notify(v_b.sent_by, 'system',
    case when p_approve then format('Your announcement "%s" was approved and sent to %s people.', v_b.title, v_count)
         else format('Your announcement "%s" was not approved%s', v_b.title,
                     coalesce(': ' || nullif(trim(coalesce(p_note, '')), ''), '.')) end, v_b.id);
  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
    values (auth.uid(), case when p_approve then 'approve_broadcast' else 'reject_broadcast' end, 'broadcasts', v_b.id,
            jsonb_build_object('note', p_note, 'recipients', v_count));
  return v_count;
end $$;

revoke all on function public.submit_expert_broadcast(text, text, public.user_role) from public, anon;
grant execute on function public.submit_expert_broadcast(text, text, public.user_role) to authenticated;
revoke all on function public.review_broadcast(uuid, boolean, text) from public, anon;
grant execute on function public.review_broadcast(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';
