-- PROPOSED — NOT APPLIED TO PRODUCTION. Text-only one-to-one messaging with message requests (2026-10-26).
-- Depends on: 01–03 (is_banned, is_admin), 05 (_notify), 13 (push queue), 16 (notification type 'message'). Safe to re-run.
--
-- Owner decision (2026-10-26): anyone may message anyone. Two users who are CONNECTED TO EACH OTHER (each has pressed
-- "Connect" on the other = followers in both directions) chat normally. Otherwise the conversation is a MESSAGE REQUEST:
-- the sender sees it in their inbox, the recipient sees it in "Message requests" (icon at the top right of Chat with a
-- dot). The recipient accepts (or simply replies) to make it a normal chat, or declines it (hidden, the sender is not told).
-- Assumption documented in the docs: a farmer and an expert who share a consultation booking always chat normally, so
-- cancellation / reschedule notes from a booking always reach the inbox.
--
-- Security changes to the existing tables (they had: anyone could create any conversation, either participant could
-- UPDATE the other person's messages, admins could read every private message, no length limit):
--  * no direct client writes at all — only the functions below; sender is always auth.uid().
--  * participants only can read; admins get counts only (admin_messaging_stats), never message text.
--  * text only, 1–2000 characters, idempotent sends (client_id), at most 30 messages per minute per sender.
--  * a notification (type 'message', no message text in it) for the other participant, once per stored message;
--    a pending request notifies only for its first message; a declined request notifies nobody.
-- Rollback: restore the old policies from supabase/schema/live_schema_20261024.sql (conversations_*, messages_*), drop the
-- functions below; the added columns can stay.

-- ── 1. columns and constraints ───────────────────────────────────────────────────────────────────────────────
alter table public.conversations add column if not exists requested_by uuid references public.profiles(id) on delete set null;
alter table public.conversations add column if not exists accepted_at timestamptz;
alter table public.conversations add column if not exists declined_at timestamptz;
-- one conversation per pair: always stored with user_one < user_two (old rows are not rewritten: NOT VALID)
alter table public.conversations drop constraint if exists conversations_canonical_pair;
alter table public.conversations add constraint conversations_canonical_pair check (user_one < user_two) not valid;
create index if not exists conversations_user_two_idx on public.conversations (user_two, last_message_at desc);
create index if not exists conversations_user_one_idx on public.conversations (user_one, last_message_at desc);

alter table public.messages add column if not exists client_id uuid;
alter table public.messages add column if not exists read_at timestamptz;
alter table public.messages drop constraint if exists messages_text_length;
alter table public.messages add constraint messages_text_length
  check (content is not null and char_length(btrim(content)) between 1 and 2000) not valid;
alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages add constraint messages_type_check
  check (message_type in ('text', 'cancellation_reschedule')) not valid;
create unique index if not exists messages_client_id_key on public.messages (conversation_id, sender_id, client_id) where client_id is not null;
create index if not exists messages_unread_idx on public.messages (conversation_id) where read_at is null;

-- ── 2. who may see what ──────────────────────────────────────────────────────────────────────────────────────
drop policy if exists conversations_insert on public.conversations;
drop policy if exists conversations_update on public.conversations;
drop policy if exists conversations_delete on public.conversations;
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated
  using ((user_one = auth.uid() or user_two = auth.uid()) and not public.is_banned());
drop policy if exists messages_insert on public.messages;
drop policy if exists messages_update on public.messages;
drop policy if exists messages_delete on public.messages;
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (not public.is_banned() and exists (select 1 from public.conversations c
          where c.id = messages.conversation_id and (c.user_one = auth.uid() or c.user_two = auth.uid())));
revoke insert, update, delete on public.conversations from anon, authenticated;
revoke insert, update, delete on public.messages from anon, authenticated;
revoke all on public.conversations from anon;
revoke all on public.messages from anon;

-- ── 3. state of a conversation for one viewer ────────────────────────────────────────────────────────────────
create or replace function public._mutually_connected(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.followers where follower_id = a and following_id = b)
     and exists (select 1 from public.followers where follower_id = b and following_id = a);
$$;

create or replace function public._share_booking(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.consultation_bookings bk
      join public.farmer_profiles f on f.id = bk.farmer_id
      join public.experts e on e.id = bk.expert_id
     where (f.user_id = a and e.user_id = b) or (f.user_id = b and e.user_id = a));
$$;

-- 'normal' | 'request_outgoing' (viewer sent it, not accepted yet) | 'request_incoming' | 'declined' (viewer declined it)
create or replace function public._conversation_state(c public.conversations, p_viewer uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when c.requested_by is null or c.accepted_at is not null
         or public._mutually_connected(c.user_one, c.user_two) or public._share_booking(c.user_one, c.user_two) then 'normal'
    when c.requested_by = p_viewer then 'request_outgoing'
    when c.declined_at is not null then 'declined'
    else 'request_incoming' end;
$$;

-- ── 4. functions the app calls ───────────────────────────────────────────────────────────────────────────────
create or replace function public._check_can_chat() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_banned) then
    raise exception 'Your account is banned.' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

create or replace function public.get_or_create_conversation(p_other uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._check_can_chat();
  v_a uuid; v_b uuid;
  c public.conversations%rowtype;
begin
  if p_other is null or p_other = v_me then raise exception 'You cannot message yourself.' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_other) then raise exception 'This user does not exist.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.profiles where id = p_other and is_banned) then
    raise exception 'You cannot message this user.' using errcode = '42501';
  end if;
  v_a := least(v_me, p_other); v_b := greatest(v_me, p_other);
  select * into c from public.conversations
   where (user_one = v_a and user_two = v_b) or (user_one = v_b and user_two = v_a) for update;
  if not found then
    insert into public.conversations (user_one, user_two, requested_by, last_message_at)
    values (v_a, v_b, v_me, null)
    on conflict (user_one, user_two) do nothing;
    select * into c from public.conversations where user_one = v_a and user_two = v_b for update;
  elsif c.requested_by is not null and c.requested_by <> v_me and c.accepted_at is null then
    -- the recipient of a request opens the chat with the requester themselves: that is an acceptance
    update public.conversations set accepted_at = now(), declined_at = null where id = c.id returning * into c;
  end if;
  return jsonb_build_object('conversation_id', c.id, 'state', public._conversation_state(c, v_me), 'other_user_id', p_other);
end $$;

create or replace function public.send_message(p_conversation_id uuid, p_content text, p_client_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._check_can_chat();
  c public.conversations%rowtype;
  v_other uuid;
  v_text text := btrim(coalesce(p_content, ''));
  v_state text;
  m public.messages%rowtype;
  v_inserted boolean := false;
  v_name text;
begin
  select * into c from public.conversations where id = p_conversation_id for update;
  if not found or (c.user_one <> v_me and c.user_two <> v_me) then
    raise exception 'conversation not found' using errcode = '42501';
  end if;
  if v_text = '' then raise exception 'Please type a message.' using errcode = '22023'; end if;
  if char_length(v_text) > 2000 then raise exception 'Messages can be up to 2000 characters.' using errcode = '22023'; end if;
  if p_client_id is null then raise exception 'client id is required' using errcode = '22023'; end if;
  v_other := case when c.user_one = v_me then c.user_two else c.user_one end;

  -- retry of the same send: return the stored message, change nothing
  select * into m from public.messages where conversation_id = c.id and sender_id = v_me and client_id = p_client_id;
  if found then return to_jsonb(m) || jsonb_build_object('duplicate', true); end if;

  if (select count(*) from public.messages where sender_id = v_me and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'You are sending messages too quickly. Please wait a moment.' using errcode = '22023';
  end if;

  v_state := public._conversation_state(c, v_me);
  if v_state in ('request_incoming', 'declined') then
    -- replying to a request accepts it
    update public.conversations set accepted_at = now(), declined_at = null where id = c.id returning * into c;
    v_state := 'normal';
  end if;

  insert into public.messages (conversation_id, sender_id, content, is_read, message_type, client_id)
  values (c.id, v_me, v_text, false, 'text', p_client_id)
  on conflict (conversation_id, sender_id, client_id) where client_id is not null do nothing
  returning * into m;
  v_inserted := m.id is not null;
  if not v_inserted then
    select * into m from public.messages where conversation_id = c.id and sender_id = v_me and client_id = p_client_id;
    return to_jsonb(m) || jsonb_build_object('duplicate', true);
  end if;
  update public.conversations set last_message_at = m.created_at where id = c.id;

  select coalesce(full_name, 'Someone') into v_name from public.profiles where id = v_me;
  if v_state = 'normal' then
    perform public._notify(v_other, 'message', format('New message from %s', v_name), c.id);
  elsif c.declined_at is null
        and not exists (select 1 from public.messages where conversation_id = c.id and sender_id = v_me and id <> m.id) then
    perform public._notify(v_other, 'message', format('%s sent you a message request', v_name), c.id);
  end if;
  return to_jsonb(m);
end $$;

-- inbox ('inbox': normal + requests I sent) or requests I received ('requests'); one query, no N+1
create or replace function public.list_conversations(p_box text default 'inbox', p_limit integer default 50)
returns table (conversation_id uuid, other_user_id uuid, other_name text, other_avatar text, state text,
               last_message text, last_message_at timestamptz, last_from_me boolean, unread_count integer)
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := public._check_can_chat();
begin
  return query
  with mine as (
    select c.*, case when c.user_one = v_me then c.user_two else c.user_one end as other,
           public._conversation_state(c, v_me) as st
      from public.conversations c
     where c.user_one = v_me or c.user_two = v_me)
  select m.id, m.other, p.full_name::text, p.profile_image_path, m.st,
         lm.content_preview, coalesce(lm.created_at, m.last_message_at, m.created_at), lm.sender_id = v_me,
         (select count(*)::int from public.messages x where x.conversation_id = m.id and x.sender_id <> v_me and x.read_at is null)
    from mine m
    left join public.profiles p on p.id = m.other
    left join lateral (select left(x.content, 80) as content_preview, x.created_at, x.sender_id from public.messages x
                        where x.conversation_id = m.id order by x.created_at desc limit 1) lm on true
   where (p_box = 'requests' and m.st = 'request_incoming' and lm.created_at is not null)
      or (coalesce(p_box, 'inbox') = 'inbox' and m.st in ('normal', 'request_outgoing') and lm.created_at is not null)
   order by coalesce(lm.created_at, m.created_at) desc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
end $$;

-- badges: unread messages in the inbox, and pending requests (the blue dot)
create or replace function public.chat_badges() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := public._check_can_chat(); v jsonb;
begin
  select jsonb_build_object(
    'inbox_unread', coalesce(sum(u) filter (where st = 'normal'), 0),
    'requests', count(*) filter (where st = 'request_incoming' and has_msg),
    'requests_unread', coalesce(sum(u) filter (where st = 'request_incoming'), 0)) into v
  from (select public._conversation_state(c, v_me) st,
               exists (select 1 from public.messages x where x.conversation_id = c.id) has_msg,
               (select count(*) from public.messages x where x.conversation_id = c.id and x.sender_id <> v_me and x.read_at is null) u
          from public.conversations c where c.user_one = v_me or c.user_two = v_me) t;
  return v;
end $$;

-- newest p_limit messages (older pages with p_before), returned oldest first
create or replace function public.get_messages(p_conversation_id uuid, p_before timestamptz default null, p_limit integer default 30)
returns setof public.messages
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := public._check_can_chat();
begin
  if not exists (select 1 from public.conversations where id = p_conversation_id and (user_one = v_me or user_two = v_me)) then
    raise exception 'conversation not found' using errcode = '42501';
  end if;
  return query
    select * from (select * from public.messages
                    where conversation_id = p_conversation_id and (p_before is null or created_at < p_before)
                    order by created_at desc, id desc limit greatest(1, least(coalesce(p_limit, 30), 100))) x
    order by x.created_at, x.id;
end $$;

-- marks only the OTHER person's messages as read
create or replace function public.mark_conversation_read(p_conversation_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public._check_can_chat(); n integer;
begin
  if not exists (select 1 from public.conversations where id = p_conversation_id and (user_one = v_me or user_two = v_me)) then
    raise exception 'conversation not found' using errcode = '42501';
  end if;
  update public.messages set read_at = now(), is_read = true
   where conversation_id = p_conversation_id and sender_id <> v_me and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- only the recipient of a request answers it
create or replace function public.respond_to_message_request(p_conversation_id uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public._check_can_chat(); c public.conversations%rowtype;
begin
  select * into c from public.conversations where id = p_conversation_id for update;
  if not found or (c.user_one <> v_me and c.user_two <> v_me) then raise exception 'conversation not found' using errcode = '42501'; end if;
  if c.requested_by is null or c.requested_by = v_me then raise exception 'There is no request to answer.' using errcode = '22023'; end if;
  if p_accept then
    update public.conversations set accepted_at = now(), declined_at = null where id = c.id returning * into c;
  else
    update public.conversations set declined_at = now() where id = c.id and accepted_at is null returning * into c;
  end if;
  return public._conversation_state(c, v_me);
end $$;

-- server-side note in the booking's conversation (cancellation / reschedule); used by cancel_consultation_booking (18)
create or replace function public._post_system_message(p_from uuid, p_to uuid, p_content text, p_type text, p_metadata jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_a uuid := least(p_from, p_to); v_b uuid := greatest(p_from, p_to); v_conv uuid; v_msg uuid;
begin
  if p_from is null or p_to is null or p_from = p_to then return null; end if;
  select id into v_conv from public.conversations
   where (user_one = v_a and user_two = v_b) or (user_one = v_b and user_two = v_a) limit 1;
  if v_conv is null then
    insert into public.conversations (user_one, user_two, requested_by, accepted_at)
    values (v_a, v_b, p_from, now()) on conflict (user_one, user_two) do nothing returning id into v_conv;
    if v_conv is null then select id into v_conv from public.conversations where user_one = v_a and user_two = v_b; end if;
  end if;
  insert into public.messages (conversation_id, sender_id, content, message_type, metadata)
  values (v_conv, p_from, left(btrim(p_content), 2000), coalesce(p_type, 'text'), coalesce(p_metadata, '{}'::jsonb))
  returning id into v_msg;
  update public.conversations set last_message_at = now() where id = v_conv;
  return v_msg;
end $$;

-- admin: operational counts only — never message text
create or replace function public.admin_messaging_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Access denied: Admin privileges required.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'conversations', (select count(*) from public.conversations),
    'pending_requests', (select count(*) from public.conversations where requested_by is not null and accepted_at is null and declined_at is null),
    'messages_7d', (select count(*) from public.messages where created_at > now() - interval '7 days'),
    'message_notifications_7d', (select count(*) from public.notifications where type = 'message' and created_at > now() - interval '7 days'),
    'message_pushes', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select o.status, count(*) n from public.push_outbox o join public.notifications nn on nn.id = o.notification_id
         where nn.type = 'message' group by o.status) s));
end $$;

revoke all on function public._mutually_connected(uuid, uuid) from public, anon, authenticated;
revoke all on function public._share_booking(uuid, uuid) from public, anon, authenticated;
revoke all on function public._conversation_state(public.conversations, uuid) from public, anon, authenticated;
revoke all on function public._check_can_chat() from public, anon, authenticated;
revoke all on function public._post_system_message(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.get_or_create_conversation(uuid) from public, anon;
revoke all on function public.send_message(uuid, text, uuid) from public, anon;
revoke all on function public.list_conversations(text, integer) from public, anon;
revoke all on function public.chat_badges() from public, anon;
revoke all on function public.get_messages(uuid, timestamptz, integer) from public, anon;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
revoke all on function public.respond_to_message_request(uuid, boolean) from public, anon;
revoke all on function public.admin_messaging_stats() from public, anon;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;
grant execute on function public.send_message(uuid, text, uuid) to authenticated;
grant execute on function public.list_conversations(text, integer) to authenticated;
grant execute on function public.chat_badges() to authenticated;
grant execute on function public.get_messages(uuid, timestamptz, integer) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.respond_to_message_request(uuid, boolean) to authenticated;
grant execute on function public.admin_messaging_stats() to authenticated;

-- ── 5. push for message notifications (still SECURITY INVOKER: client-made notifications are never pushed) ──
create or replace function public.enqueue_push_for_notification() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_client_request() then return new; end if;
  if new.type = 'booking' then
    insert into public.push_outbox (notification_id, user_id, title, body, data)
    values (new.id, new.user_id, 'AgroConnect', public._push_text(new.message),
            jsonb_build_object('kind', 'booking', 'booking_id', coalesce(new.related_id::text, ''), 'notification_id', new.id::text))
    on conflict (notification_id) do nothing;
  elsif new.type = 'message' then
    insert into public.push_outbox (notification_id, user_id, title, body, data)
    values (new.id, new.user_id, 'New message', public._push_text(new.message),
            jsonb_build_object('kind', 'message', 'conversation_id', coalesce(new.related_id::text, ''), 'notification_id', new.id::text))
    on conflict (notification_id) do nothing;
  end if;
  return new;
end $$;
