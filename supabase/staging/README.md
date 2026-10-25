# Staging environment — `agroconnect-staging` (`ahkgvuewgbjyahbiehrx`, ap-northeast-1)

Built 2026-10-25 through the Supabase connector. Every write was preceded by a `get_project` check that returned
`ahkgvuewgbjyahbiehrx`. Production (`mgreapakfchcxcrauheq`) was only **read**, for the parity fingerprint.

## What was applied (in order — `supabase_migrations.schema_migrations` on staging)
| # | Migration | Source |
|---|---|---|
| 1 | `staging_00a_live_schema_types_tables` | `supabase/schema/live_schema_20261024.sql` §10–50 |
| 2 | `staging_00b_live_schema_functions_triggers_rls` | same file §60–80 |
| 3 | `staging_00c1/00c2_live_schema_policies_*` | same file §90 (split in two after a connector HTTP/2 drop; the failed attempt was confirmed not applied) |
| 4 | `staging_00c3_live_schema_storage` | same file §100–110 |
| 5 | `staging_00d_production_grant_parity` | staging-only: this new project grants API roles no SELECT/INSERT/UPDATE on new tables (newer Supabase default); production does. Also revokes API access to the Supabase-managed `rls_auto_enable()` |
| 6–10 | `remediation_01`, `02`, `03` (incl. 03b), `07`, `08` | `supabase/proposed/` — identical to production |
| 11 | `remediation_04_reconcile_drift` | held for production |
| 12–13 | `remediation_05a_lifecycle_functions`, `05b_refunds_guards_grants` | `05_…sql` without the pg_cron block |
| 14 | `remediation_05c_scheduler_pg_cron` | 05's scheduler block — **owner-approved 2026-10-25**: `pg_cron` 1.6.4 installed, job `consultation-lifecycle` (`* * * * *`, as `postgres`) |

Not applied: `supabase/migrations/20260814_profiles_rls_fix.sql` (known destructive), `06` (needs the test accounts).
Pre-setup state: `supabase/backups/20261025_staging_pre_setup_state.sql`.

## Verification of the build
* After step 4 the schema was **byte-identical** to the production snapshot: 356 objects, md5 `0c0bd1d0…e491`, all 11 sections.
* After step 10 staging was compared with **current production** with `scripts/sql/parity_fingerprint.sql`
  (489 items: schema + function ACLs + table grants + realtime publication). Every section matched except function ACLs,
  where the 3 functions created by 01 carry the default ACL on staging and explicit per-role grants on production —
  same effective privileges (EXECUTE via PUBLIC).
* Advisor: only by-design findings (`is_admin`/`is_banned` anon-callable because RLS needs them; admin/booking RPCs
  callable by signed-in users and gated internally).

## Configuration
* `.env.staging` (repo root) and `admin-dashboard/.env.staging` — git-ignored, mode 600. Contain the staging URL and
  **public** anon key, plus locally generated test-account passwords (never printed). Build with
  `npx vite build --mode staging --outDir dist-staging` (also git-ignored). Verified: staging bundles reference only
  `ahkgvuewgbjyahbiehrx`, never production. The default `npm run build` is unchanged (production).
* Android: no staging APK was built or installed (it would replace the production app id `com.agroconnect.app`).

## Rebuild from scratch
Apply the files in the table above in order (or re-run them: every remediation script is idempotent).

## Blocked: test accounts
The normal signup API rejected `*@agroconnect.local` (`email_address_invalid`) and, with email confirmation on, the
built-in mailer hit `over_email_send_rate_limit`. No account was created (0 users). Owner action needed — see
`REMEDIATION_STATUS.md` → "Staging". Then: `node scripts/staging/create-test-accounts.mjs`, apply `06`, promote the
staging admin (`update public.profiles set role = 'Admin' where id = (select id from auth.users where email = …)`, a
public-table update), and run `node --test tests/e2e/staging-api.test.mjs` and the Playwright suite with `E2E_STAGING=1`.
