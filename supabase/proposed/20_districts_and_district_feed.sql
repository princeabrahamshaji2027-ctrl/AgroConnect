-- PROPOSED — NOT APPLIED TO PRODUCTION. Launch districts and the district-priority feed (2026-10-26).
-- Depends on: 01–03 (is_admin/is_banned, handle_new_user hardening), 04 (posts.title). Safe to re-run.
--
-- Owner decision (2026-10-26): the launch districts are exactly Kottayam, Pathanamthitta and Kannur. A user's own
-- district comes first in the community feed; inside the local and the non-local group the existing order is kept
-- (newest first). A post's district is the author's district at posting time and is set by the server only.
-- Users or posts without a district are never given one automatically: their feed is plain chronological.

-- ── 1. columns (canonical spellings only) ──────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists district text;
alter table public.profiles drop constraint if exists profiles_district_check;
alter table public.profiles add constraint profiles_district_check
  check (district is null or district in ('Kottayam', 'Pathanamthitta', 'Kannur'));

alter table public.posts add column if not exists district text;
alter table public.posts drop constraint if exists posts_district_check;
alter table public.posts add constraint posts_district_check
  check (district is null or district in ('Kottayam', 'Pathanamthitta', 'Kannur'));

-- ── 2. post district = author's district, set by the server ────────────────────────────────────────────────────
-- backfill BEFORE the trigger exists (the trigger keeps district unchanged on updates)
drop trigger if exists posts_set_district on public.posts;
update public.posts p set district = pr.district
  from public.profiles pr where pr.id = p.user_id and p.district is null and pr.district is not null;

create or replace function public._posts_set_district() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.district := (select district from public.profiles where id = new.user_id);
  else
    new.district := old.district;
  end if;
  return new;
end $$;
revoke all on function public._posts_set_district() from public, anon, authenticated;
create trigger posts_set_district before insert or update on public.posts
  for each row execute function public._posts_set_district();

-- ── 3. sign-up stores district / phone / location from the sign-up metadata (role stays Farmer) ─────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to '' as $$
declare v_d text := nullif(btrim(new.raw_user_meta_data->>'district'), '');
begin
  insert into public.profiles (id, full_name, role, district, phone, location)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', ''),
          'Farmer'::public.user_role,                                   -- never from metadata (AUD-003b)
          case when v_d in ('Kottayam', 'Pathanamthitta', 'Kannur') then v_d end,
          left(nullif(btrim(new.raw_user_meta_data->>'phone'), ''), 15),
          left(nullif(btrim(new.raw_user_meta_data->>'location'), ''), 150));
  return new;
end $$;

-- ── 4. the feed: own district first, newest first inside each group, keyset pages ──────────────────────────────
-- SECURITY INVOKER: the posts RLS policies still decide what the caller may see.
create or replace function public.get_feed(
  p_limit integer default 20, p_after_rank integer default null,
  p_after_created_at timestamptz default null, p_after_id uuid default null)
returns table (id uuid, user_id uuid, title text, caption text, image_path text, media_type public.post_media_type,
               video_duration_seconds integer, category text, location text, district text, like_count integer,
               comment_count integer, created_at timestamptz, author_name text, author_avatar text,
               author_role public.user_role, liked_by_me boolean, feed_rank integer)
language sql stable security invoker set search_path = public as $$
  with me as (select (select pr.district from public.profiles pr where pr.id = auth.uid()) as d),
  ranked as (
    select p.*, case when me.d is not null and p.district = me.d then 0 else 1 end as rnk
    from public.posts p cross join me
    where p.status = 'Approved')
  select r.id, r.user_id, r.title::text, r.caption, r.image_path, r.media_type, r.video_duration_seconds,
         r.category::text, r.location::text, r.district, r.like_count, r.comment_count, r.created_at,
         a.full_name::text, a.profile_image_path, a.role,
         exists (select 1 from public.likes l where l.post_id = r.id and l.user_id = auth.uid()),
         r.rnk
  from ranked r left join public.profiles a on a.id = r.user_id
  where p_after_id is null
     or r.rnk > p_after_rank
     or (r.rnk = p_after_rank and (r.created_at < p_after_created_at
                                   or (r.created_at = p_after_created_at and r.id < p_after_id)))
  order by r.rnk, r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- ── 5. admin: users and posts per district (counts only) ───────────────────────────────────────────────────────
create or replace function public.admin_district_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Access denied: Admin privileges required.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(row_to_json(x) order by x.district nulls last), '[]'::jsonb) from (
    select d.district,
           (select count(*) from public.profiles p where p.district is not distinct from d.district and p.role = 'Farmer') as farmers,
           (select count(*) from public.profiles p join public.experts e on e.user_id = p.id and coalesce(e.is_active, true)
             where p.district is not distinct from d.district and p.role = 'Expert') as experts,
           (select count(*) from public.posts po where po.district is not distinct from d.district and po.status = 'Approved') as posts,
           (select count(*) from public.posts po where po.district is not distinct from d.district and po.status = 'Approved'
              and po.created_at > now() - interval '7 days') as posts_7d
    from (values ('Kottayam'), ('Pathanamthitta'), ('Kannur'), (null)) d(district)) x);
end $$;

revoke all on function public.get_feed(integer, integer, timestamptz, uuid) from public, anon;
grant execute on function public.get_feed(integer, integer, timestamptz, uuid) to authenticated;
revoke all on function public.admin_district_stats() from public, anon;
grant execute on function public.admin_district_stats() to authenticated;
