-- Minimal stand-in for the parts of the Supabase platform the AgroConnect schema depends on, so that
-- supabase/schema/live_schema_*.sql (the real production schema) can be loaded into PGlite for tests.
-- Mirrors Supabase behaviour: auth.uid()/auth.role() read the request JWT claims, API calls run as the
-- anon/authenticated roles, and those roles hold full table privileges that RLS then narrows.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  last_sign_in_at timestamptz
);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,   -- as on Supabase: mimetype, size, …
  path_tokens text[] generated always as (string_to_array(name, '/')) stored
);
alter table storage.objects enable row level security;

create publication supabase_realtime;

grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;

-- Vault + pgcrypto stand-ins (test only): enough for create_secret / decrypted_secrets / gen_random_bytes.
create schema if not exists vault;
create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text, description text);
create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret, description from vault.secrets;
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '')
returns uuid language sql as $$ insert into vault.secrets (name, secret, description) values (new_name, new_secret, new_description) returning id $$;
create schema if not exists extensions;
create or replace function extensions.gen_random_bytes(n integer) returns bytea language sql volatile as $$
  select decode(substr(string_agg(md5(random()::text), ''), 1, n * 2), 'hex') from generate_series(1, (n / 16) + 1)
$$;
