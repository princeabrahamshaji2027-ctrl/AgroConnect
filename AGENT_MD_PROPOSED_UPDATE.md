# Proposed status entry for agent.md (not applied)

`agent.md` holds task prompts and was not modified. If you want a status log there, append this:

---

## Status — 2026-10-24 audit (Claude Code, branch `claude/great-rhodes-fd3ce8`)

- Fixed: admin login auto-sign-in with hard-coded credentials (AUD-001); demo passwords moved to env vars (AUD-002);
  feed comment ownership, null-name crash, like error handling (AUD-004/005/006); KYC CV-upload failure and
  application-history deletion (AUD-007); fabricated admin dashboard stats (AUD-009); unverified admin deletes
  (AUD-010); keep-alive ReferenceError (AUD-011).
- Action required by owner: rotate the admin and demo passwords; redeploy the admin site; review
  `supabase/proposed/` (run `00_readonly_verification.sql` first).
- agent.md item 12 root cause (expert availability not visible): `expert1@agroconnect.local` has role `Expert` but
  no `experts` row. Connect.jsx keys expert mode off the `experts` row (AUD-015). No speculative code change made.
- WIP `delete-user` Edge Function needs CORS/OPTIONS handling before the admin browser can call it (AUD-017).
- Previous Appium Scenario D PASS is not evidenced (five identical blank screenshots, AUD-016).
- Tests: `npm test` (38 checks), `npm run test:rls` (live, read-only; currently fails on profiles/farmer_profiles/followers).
