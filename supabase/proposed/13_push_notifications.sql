-- PROPOSED — NOT APPLIED TO PRODUCTION. Push notifications to Android (FCM), 2026-10-25.
-- Depends on: 05 (notifications guards), 11/12 (consultation notifications). Safe to re-run.
--
-- Separation of concerns:
--   business event  -> public.notifications row (unchanged; the in-app list keeps working with or without push)
--   push queue      -> public.push_outbox, one row per server-created 'booking' notification (unique: no duplicates)
--   delivery        -> Edge Function push-dispatch (FCM HTTP v1, credentials only in its secrets) claims queued rows
--                      with claim_push_batch() and reports with finish_push(); retries with backoff, gives up after
--                      5 attempts; FCM "unregistered/invalid token" disables only that device.
--   devices         -> public.push_devices, written only through register_push_device()/unregister_push_device(),
--                      which always use auth.uid(): a client cannot attach a token to someone else.
-- Scope (documented decision): consultation notifications (type 'booking': booked, 5-minute reminder, cancelled,
-- auto-cancelled, completed/rate, reschedule offers). Likes/comments/announcements stay in-app only.
-- Push text never includes the farmer's issue description or a typed cancellation reason; the full text stays in the app.
-- Pushes older than 2 hours are dropped (marked failed, 'expired') rather than delivered late.

-- ---------------------------------------------------------------- devices
create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android' check (platform in ('android', 'ios', 'web')),
  app_id text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  failure_count integer not null default 0
);
create index if not exists push_devices_user_idx on public.push_devices (user_id) where disabled_at is null;
alter table public.push_devices enable row level security;
drop policy if exists push_devices_select_own on public.push_devices;
create policy push_devices_select_own on public.push_devices for select to authenticated using (user_id = auth.uid());
-- no insert/update/delete policies: writes go through the functions below
revoke all on public.push_devices from anon;
revoke insert, update, delete on public.push_devices from authenticated;
grant select on public.push_devices to authenticated;

create or replace function public.register_push_device(p_token text, p_platform text default 'android', p_app_id text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_token is null or length(p_token) < 20 or length(p_token) > 4096 or p_token ~ '\s' then
    raise exception 'invalid device token' using errcode = '22023';
  end if;
  if coalesce(p_platform, 'android') not in ('android', 'ios', 'web') then
    raise exception 'invalid platform' using errcode = '22023';
  end if;
  -- one row per token; the same phone signing in to another account moves the token to that account
  insert into public.push_devices (user_id, token, platform, app_id)
  values (v_uid, p_token, coalesce(p_platform, 'android'), left(p_app_id, 100))
  on conflict (token) do update
    set user_id = v_uid, platform = excluded.platform, app_id = excluded.app_id,
        last_seen_at = now(), disabled_at = null, failure_count = 0;
end $$;

create or replace function public.unregister_push_device(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  delete from public.push_devices where token = p_token and user_id = auth.uid();
end $$;

-- ---------------------------------------------------------------- outbox
create table if not exists public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'no_device')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  delivered_devices integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists push_outbox_due_idx on public.push_outbox (next_attempt_at) where status = 'queued';
alter table public.push_outbox enable row level security;   -- no policies: server only
revoke all on public.push_outbox from anon, authenticated;

-- Short, private-safe push text from the in-app message: drops "Topic: …" (the farmer's issue) and "Reason: …"
-- (typed cancellation reasons), which would otherwise show on a lock screen. The full text stays in the app.
create or replace function public._push_text(p_message text) returns text
language sql immutable set search_path = public as $$
  select left(regexp_replace(coalesce(p_message, ''), '\s*(Topic|Reason):.*$', ''), 180);
$$;

create or replace function public.enqueue_push_for_notification() returns trigger
-- SECURITY INVOKER on purpose: a client's own insert runs as anon/authenticated and stops at the check below (it
-- could not write push_outbox anyway); server functions run as their owner and may enqueue.
language plpgsql set search_path = public as $$
begin
  -- only notifications created by trusted server code (booking functions, scheduler), never by a client
  if public.is_client_request() then return new; end if;
  if new.type <> 'booking' then return new; end if;
  insert into public.push_outbox (notification_id, user_id, title, body, data)
  values (new.id, new.user_id, 'AgroConnect', public._push_text(new.message),
          jsonb_build_object('kind', 'booking', 'booking_id', coalesce(new.related_id::text, ''), 'notification_id', new.id::text))
  on conflict (notification_id) do nothing;
  return new;
end $$;
drop trigger if exists enqueue_push_for_notification on public.notifications;
create trigger enqueue_push_for_notification after insert on public.notifications
  for each row execute function public.enqueue_push_for_notification();

-- Claim due rows for the dispatcher (service role only). Rows stuck in 'sending' for 10 minutes are retried.
create or replace function public.claim_push_batch(p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  update public.push_outbox set status = 'queued'
   where status = 'sending' and next_attempt_at < now() - interval '10 minutes';
  -- consultation pushes are time-bound: never deliver one more than 2 hours late (e.g. queued while push was off)
  update public.push_outbox set status = 'failed', last_error = 'expired before delivery'
   where status = 'queued' and created_at < now() - interval '2 hours';
  with c as (
    select id from public.push_outbox
     where status = 'queued' and next_attempt_at <= now()
     order by created_at limit greatest(1, least(p_limit, 200))
     for update skip locked)
  , u as (
    update public.push_outbox o set status = 'sending', attempts = o.attempts + 1, next_attempt_at = now()
      from c where o.id = c.id
    returning o.id, o.user_id, o.title, o.body, o.data, o.attempts)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'title', u.title, 'body', u.body, 'data', u.data, 'attempts', u.attempts,
           'devices', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'token', d.token)), '[]'::jsonb)
                         from public.push_devices d where d.user_id = u.user_id and d.disabled_at is null))), '[]'::jsonb)
    into v from u;
  return v;
end $$;

-- Report one row. p_result: 'sent' | 'no_device' | 'retry' | 'failed'. Invalid tokens are disabled, not deleted.
create or replace function public.finish_push(p_id uuid, p_result text, p_error text default null,
                                              p_delivered integer default 0, p_invalid_device_ids uuid[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare v_attempts int;
begin
  if p_result not in ('sent', 'no_device', 'retry', 'failed') then raise exception 'bad result'; end if;
  update public.push_devices set disabled_at = now(), failure_count = failure_count + 1
   where id = any(coalesce(p_invalid_device_ids, '{}'));
  select attempts into v_attempts from public.push_outbox where id = p_id for update;
  if not found then return; end if;
  update public.push_outbox set
    status = case when p_result = 'retry' and v_attempts >= 5 then 'failed'
                  when p_result = 'retry' then 'queued' else p_result end,
    next_attempt_at = case when p_result = 'retry' then now() + make_interval(secs => 30 * power(2, v_attempts)::int) else next_attempt_at end,
    last_error = left(p_error, 300),
    delivered_devices = greatest(delivered_devices, coalesce(p_delivered, 0)),
    sent_at = case when p_result = 'sent' then now() else sent_at end
  where id = p_id;
end $$;

-- Shared secret between the scheduler and the push-dispatch function (generated in the database, never printed).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_dispatch_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_dispatch_secret',
                                'Header secret: pg_cron -> Edge Function push-dispatch');
  end if;
end $$;

create or replace function public.push_dispatch_secret() returns text
language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_secret';
$$;

-- ---------------------------------------------------------------- grants
revoke all on function public.register_push_device(text, text, text) from public, anon;
revoke all on function public.unregister_push_device(text) from public, anon;
grant execute on function public.register_push_device(text, text, text) to authenticated;
grant execute on function public.unregister_push_device(text) to authenticated;
revoke all on function public._push_text(text) from public, anon, authenticated;
revoke all on function public.enqueue_push_for_notification() from public, anon, authenticated;
revoke all on function public.claim_push_batch(integer) from public, anon, authenticated;
revoke all on function public.finish_push(uuid, text, text, integer, uuid[]) from public, anon, authenticated;
revoke all on function public.push_dispatch_secret() from public, anon, authenticated;
grant execute on function public.claim_push_batch(integer) to service_role;
grant execute on function public.finish_push(uuid, text, text, integer, uuid[]) to service_role;
grant execute on function public.push_dispatch_secret() to service_role;
grant all on public.push_outbox, public.push_devices to service_role;
