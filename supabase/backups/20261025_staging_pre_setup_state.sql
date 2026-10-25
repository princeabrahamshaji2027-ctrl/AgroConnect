-- STAGING (ahkgvuewgbjyahbiehrx) state captured 2026-10-25, before any setup writes. Read-only capture.
-- public: 0 tables, 0 enums, 0 policies; storage: 0 buckets, 0 policies; auth.users: 0; supabase_realtime: 0 tables;
-- migration history: none; edge functions: none.
-- Extensions: pg_stat_statements 1.11, pgcrypto 1.3, plpgsql 1.0, supabase_vault 0.3.1, uuid-ossp 1.1.
-- Platform defaults on this (new) project that differ from production:
--   * tables created by postgres in public grant anon/authenticated only DELETE/TRUNCATE/REFERENCES/TRIGGER
--     (no SELECT/INSERT/UPDATE)  -> setup must grant explicitly to match production;
--   * event trigger `ensure_rls` -> public.rls_auto_enable() enables RLS on every new public table.
-- The only pre-existing public object (Supabase-managed). To return staging to this state: drop schema contents
-- created by the setup migrations (see supabase/staging/README.md) — this function is left untouched by setup.

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;
