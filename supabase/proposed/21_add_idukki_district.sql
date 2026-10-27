-- PROPOSED — owner decision 2026-10-27: the launch districts are Kannur, Pathanamthitta, Idukki and Kottayam.
-- Depends on: 20. Safe to re-run. Only widens the allowed values; no stored district is changed.
-- Rollback: "undo 21" in 99_rollback.sql (refuses while any profile or post uses 'Idukki').

alter table public.profiles drop constraint if exists profiles_district_check;
alter table public.profiles add constraint profiles_district_check
  check (district is null or district in ('Kannur', 'Pathanamthitta', 'Idukki', 'Kottayam'));
alter table public.posts drop constraint if exists posts_district_check;
alter table public.posts add constraint posts_district_check
  check (district is null or district in ('Kannur', 'Pathanamthitta', 'Idukki', 'Kottayam'));

-- sign-up: same as 20, with the fourth district
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to '' as $$
declare v_d text := nullif(btrim(new.raw_user_meta_data->>'district'), '');
begin
  insert into public.profiles (id, full_name, role, district, phone, location)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', ''),
          'Farmer'::public.user_role,                                   -- never from metadata (AUD-003b)
          case when v_d in ('Kannur', 'Pathanamthitta', 'Idukki', 'Kottayam') then v_d end,
          left(nullif(btrim(new.raw_user_meta_data->>'phone'), ''), 15),
          left(nullif(btrim(new.raw_user_meta_data->>'location'), ''), 150));
  return new;
end $$;

-- admin report: same as 20, with the fourth district
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
    from (values ('Kannur'), ('Pathanamthitta'), ('Idukki'), ('Kottayam'), (null)) d(district)) x);
end $$;

revoke all on function public.admin_district_stats() from public, anon;
grant execute on function public.admin_district_stats() to authenticated;
