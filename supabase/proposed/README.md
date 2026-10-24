# Proposed database changes — NOT APPLIED

These SQL files come out of the 2026-10-24 audit (`AUDIT_ISSUES.md`). They are deliberately **outside**
`supabase/migrations/` so that no `supabase db push` picks them up by accident. Rules.md §4.1 requires explicit
owner approval before any schema/policy change.

| File | Purpose | Writes? |
|---|---|---|
| `00_readonly_verification.sql` | Dumps live RLS policies, triggers and function bodies so the suspected issues below can be confirmed. Run first in the Supabase SQL editor. | No (read-only) |
| `01_protect_profile_privileged_columns.sql` | AUD-003: stops a signed-in user from changing their own `role`, ban fields or counters through the `profiles_update` policy. | Trigger + function |
| `02_profiles_require_sign_in.sql` | AUD-008: removes anonymous read access to `profiles`, `farmer_profiles`, `followers`. | Policies |
| `03_fix_security_definer_functions.sql` | AUD-012: `is_banned()` references a column that does not exist; pins `search_path` on SECURITY DEFINER helpers. | Functions |
| `04_book_consultation_rpc.sql` | AUD-014: atomic, race-free booking RPC (Rules.md §3.4). Client is **not** switched to it yet. | Function |

Recommended order: run `00`, review the output, then apply `01`–`03` in a staging copy first, re-run `npm run test:rls`
(expects 0 failures after `02`), and smoke-test login, feed, profile and Catch Up.
