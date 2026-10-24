-- PROPOSED — NOT APPLIED. AUD-044 (Medium, confirmed live): the supabase_realtime publication contains no tables,
-- so every realtime subscription in the apps (chat messages, notification toasts/broadcast pop-ups, new feed posts,
-- admin dashboard/report refresh) receives nothing. Realtime enforces RLS on these tables. Re-runnable.
do $$
declare t text;
begin
  foreach t in array array['notifications', 'messages', 'posts', 'reports', 'expert_applications', 'orders'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
