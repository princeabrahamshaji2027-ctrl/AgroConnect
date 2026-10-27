-- PROPOSED — 2026-10-27. Range checks for numbers the app lets people type or choose, so a negative or absurd value is
-- refused by the database even if a client skips the form checks. Existing rows were checked on production and staging
-- (all within range). Each check is added NOT VALID, then validated (fails loudly instead of rewriting data).
-- Safe to re-run. Rollback: "undo 23" in 99_rollback.sql.
-- Limits: meeting length 15–240 min and buffer 0–120 min (the app offers 15/30/45/60 and 0/5/10/15/30);
-- product price ₹0.01–₹1,00,000 and stock 0–1,00,000 (admin Products form); farm size 0–10,000 acres;
-- video length 0–600 s (post videos are limited to 10 minutes); meeting length record 0–600 min; refunds never negative.
do $$
declare c record;
begin
  for c in select * from (values
    ('experts', 'experts_meeting_duration_range', 'meeting_duration_minutes is null or meeting_duration_minutes between 15 and 240'),
    ('experts', 'experts_buffer_time_range', 'buffer_time_minutes is null or buffer_time_minutes between 0 and 120'),
    ('products', 'products_price_max', 'price <= 100000'),
    ('products', 'products_stock_max', 'stock <= 100000'),
    ('farmer_profiles', 'farmer_profiles_farm_size_range', 'farm_size is null or farm_size between 0 and 10000'),
    ('posts', 'posts_video_duration_range', 'video_duration_seconds is null or video_duration_seconds between 0 and 600'),
    ('video_meetings', 'video_meetings_duration_range', 'duration_minutes is null or duration_minutes between 0 and 600'),
    ('consultation_bookings', 'consultation_bookings_refund_amount_nonneg', 'refund_amount is null or refund_amount >= 0')
  ) v(tbl, name, expr) loop
    execute format('alter table public.%I drop constraint if exists %I', c.tbl, c.name);
    execute format('alter table public.%I add constraint %I check (%s) not valid', c.tbl, c.name, c.expr);
    execute format('alter table public.%I validate constraint %I', c.tbl, c.name);
  end loop;
end $$;
