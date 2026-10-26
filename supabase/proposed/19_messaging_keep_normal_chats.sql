-- PROPOSED — NOT APPLIED TO PRODUCTION. Messaging follow-up to 17 (2026-10-26). Depends on: 17. Safe to re-run.
--
-- In 17 a conversation between users who are connected to each other (or share a booking) is "normal" only while that
-- is true: if one of them later pressed Connect again to disconnect, an ongoing chat would drop back into the other
-- person's "Message requests". Here, the first message sent while the chat is normal records the conversation as
-- accepted, so a chat that has been a normal chat stays one. Nothing else changes; no data is rewritten.
create or replace function public._accept_normal_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.conversations c set accepted_at = now()
   where c.id = new.conversation_id and c.accepted_at is null and c.requested_by is not null
     and (public._mutually_connected(c.user_one, c.user_two) or public._share_booking(c.user_one, c.user_two));
  return null;
end $$;
revoke all on function public._accept_normal_conversation() from public, anon, authenticated;

drop trigger if exists messages_accept_normal_conversation on public.messages;
create trigger messages_accept_normal_conversation after insert on public.messages
  for each row execute function public._accept_normal_conversation();
