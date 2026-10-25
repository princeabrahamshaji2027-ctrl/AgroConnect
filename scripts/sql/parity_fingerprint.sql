-- READ-ONLY. Fingerprint used to prove staging matches production (schema + grants + publication).
with
rels as (select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'),
enums as (
  select 10 as ord, t.typname::text as name,
         format('create type public.%I as enum (%s);', t.typname,
                string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)) as ddl
  from pg_type t join pg_namespace n on n.oid = t.typnamespace join pg_enum e on e.enumtypid = t.oid
  where n.nspname = 'public' group by t.typname),
tbls as (
  select 20, r.relname::text,
         format(E'create table public.%I (\n%s\n);', r.relname,
                string_agg(format('  %I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                                  coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''),
                                  case when a.attnotnull then ' not null' else '' end), E',\n' order by a.attnum))
  from rels r join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = r.oid and d.adnum = a.attnum
  group by r.relname),
cons as (
  select case when co.contype = 'f' then 40 else 30 end, r.relname || '.' || co.conname,
         format('alter table public.%I add constraint %I %s;', r.relname, co.conname, pg_get_constraintdef(co.oid))
  from pg_constraint co join rels r on r.oid = co.conrelid),
idx as (
  select 50, ic.relname::text, pg_get_indexdef(i.indexrelid) || ';'
  from pg_index i join rels r on r.oid = i.indrelid join pg_class ic on ic.oid = i.indexrelid
  where not exists (select 1 from pg_constraint co where co.conindid = i.indexrelid)),
fns as (
  select 60, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', pg_get_functiondef(p.oid) || ';'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname <> 'rls_auto_enable'),
trg as (
  select 70, c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) || ';'
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname = 'users'))),
rls as (
  select 80, relname::text, format('alter table public.%I enable row level security;', relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity),
pol as (
  select case when schemaname = 'public' then 90 else 110 end, schemaname || '.' || tablename || '.' || policyname,
         format('create policy %I on %I.%I as %s for %s to %s%s%s;', policyname, schemaname, tablename, lower(permissive), cmd,
                array_to_string(roles, ', '),
                coalesce(E'\n  using (' || qual || ')', ''), coalesce(E'\n  with check (' || with_check || ')', ''))
  from pg_policies where schemaname in ('public', 'storage')),
bkt as (
  select 100, id::text,
         format('insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (%L, %L, %s, %s, %s) on conflict (id) do nothing;',
                id, name, public::text, coalesce(file_size_limit::text, 'null'),
                coalesce(quote_literal(allowed_mime_types::text) || '::text[]', 'null'))
  from storage.buckets),
allrows as (select * from enums union all select * from tbls union all select * from cons union all select * from idx
            union all select * from fns union all select * from trg union all select * from rls union all select * from pol
            union all select * from bkt),
extra as (
  select 200 ord, 'acl ' || p.oid::regprocedure::text name,
         coalesce((select string_agg(a::text, ',' order by a::text) from unnest(p.proacl) a), 'default') ddl
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname <> 'rls_auto_enable'
  union all
  select 210, 'grant ' || table_name || ' ' || grantee, string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role')
  group by table_name, grantee
  union all
  select 220, 'pub ' || tablename, tablename from pg_publication_tables where pubname = 'supabase_realtime'),
everything as (select * from allrows union all select * from extra)
select count(*) n, md5(string_agg(ddl, E'\n\n' order by ord, name)) md5,
       (select json_object_agg(ord, m) from (select ord, md5(string_agg(ddl, E'\n\n' order by ord, name)) m from everything group by ord) s) per_section
from everything
