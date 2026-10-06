# PROMPT FOR ANTIGRAVITY — Fix Blocked/Ambiguous Appium Scenarios (Expert Lifecycle)

Scope: this touches only test data and the two blocked/ambiguous scenarios below. Do not modify
unrelated app functionality, UI, or the wider test suite. Do not re-run Appium scenarios that already
passed — only Scenario D and Scenario E (split into E1/E2/E3 below).

## Why the current test data is the problem, not the app

- **Scenario D (BLOCKED)**: no approved Expert account exists to log in with.
- **Scenario E (ambiguous PASS)**: `user2` apparently already has an expert application in some
  state, so "Become an Expert" wasn't actually exercised as a fresh flow — this scenario didn't prove
  what it claims to prove.

The fix is dedicated, fixed-state test accounts — not repeatedly mutating one account's role to make
whichever scenario is running next pass.

---

## STEP 1 — Reuse the existing seed infrastructure, don't build a second one

This project already has a seed system at `seed/` (`seed/lib/supabaseAdmin.js`,
`seed/generators/users.js`, `seed/cleanup.js`) using the Supabase Admin API with `is_test` flagging.
**Do not write a separate ad-hoc script or a new Supabase client for this** — import and reuse
`seed/lib/supabaseAdmin.js` exactly as the existing generators do.

Create a new file, `seed/test-fixtures.js`, separate from the random bulk-data generators (these are
fixed, memorable accounts for manual/automated testing, not random demo filler — keep them in their
own file so they're never overwritten or duplicated by a `npm run seed` bulk run):

```js
const supabaseAdmin = require('./lib/supabaseAdmin');

const FIXTURES = [
  { email: 'user1@agroconnect.local', role: 'Farmer', expertStatus: null },
  { email: 'user2@agroconnect.local', role: 'Farmer', expertStatus: 'Pending' },
  { email: 'expert1@agroconnect.local', role: 'Expert', expertStatus: 'Approved' },
  { email: 'user3@agroconnect.local', role: 'Farmer', expertStatus: null }, // fresh, no application
  { email: 'user4@agroconnect.local', role: 'Farmer', expertStatus: 'Rejected' },
];
```

Before writing the creation logic, **inspect the actual current schema first** — run
`select column_name, data_type from information_schema.columns where table_name = 'expert_applications';`
and confirm the real column names and the `application_status` enum's exact values (established
earlier in this project as `Pending` / `Approved` / `Rejected` — confirm this is still accurate rather
than assuming it). Do the same for `experts` and `profiles.role`. Do not invent or rename a field —
use exactly what's already there.

For each fixture:
1. Create the `auth.users` account via `supabaseAdmin.auth.admin.createUser(...)` (same pattern as
   `seed/generators/users.js`), with `is_test: true` on the resulting `profiles` row.
2. For `expertStatus: 'Pending'`, `'Approved'`, or `'Rejected'` — insert a matching row into
   `expert_applications` with that exact `status` value and realistic `qualification`,
   `experience`, and a real (small, valid) PDF at `cv_file_path` in the `expert-cvs` bucket, since the
   CV-PDF check constraint added in an earlier migration requires a `.pdf` path.
3. For `expertStatus: 'Approved'` specifically — also insert the matching `experts` row and set
   `profiles.role = 'Expert'`, exactly what `approve_expert_application()` does for a real approval,
   so this account is indistinguishable from one that went through the real approval flow. Also
   ensure this account has at least 2-3 real rows in `consultation_slots` (some booked, some open) and
   at least one row in `consultation_bookings`, so the Expert Catch Up / meeting history / availability
   screens have real data to render instead of appearing empty.
4. For `expertStatus: null` (user1, user3) — no `expert_applications` row at all, confirming these are
   genuinely fresh accounts.

Add an npm script:
```json
"seed:fixtures": "node seed/test-fixtures.js",
"seed:fixtures:reset": "node seed/test-fixtures.js --reset"
```
`--reset` should delete and recreate all five fixture accounts from scratch (same approach as
`seed/cleanup.js`, scoped to only these five emails) — this is the "how to reset test accounts" step
the test report needs to document.

---

## STEP 2 — Fix the internal inconsistency in the existing report before adding new results

The current report has a contradiction: an assertion says *"Verify email/password fields present"*
but the evidence recorded is *"Found 0 input fields"*, and the scenario is still marked PASS. A
scenario can't pass evidence that contradicts its own assertion. Before running anything new, find
this Appium test case, determine which is actually true (are the fields present or not), fix the
assertion or the PASS/FAIL result so they agree, and note in the report which one it was and why.

---

## STEP 3 — Run only these Appium scenarios, not the full suite

**Scenario D — Expert View** (login as `expert1@agroconnect.local`):
```
Login → Verify Expert dashboard/home → Open Catch Up → Verify expert meeting view →
Open Expert Menu → Verify expert-specific options → Open meeting/booking history →
Verify availability/date customization is visible → Verify a "Leave Expert" or equivalent option exists
```

**Scenario E1 — Fresh Expert Application** (login as `user3@agroconnect.local`):
```
Login → Profile → Confirm "Become an Expert" is visible and enabled →
Fill application → Upload CV → Submit → Verify resulting status shows Pending
```

**Scenario E2 — Pending Application Display** (login as `user2@agroconnect.local`, already fixtured
as Pending):
```
Login → Profile → Verify "Become an Expert" is NOT shown/enabled (already applied) →
Verify the UI displays "Pending Review" status text correctly
```

**Scenario E3 — Rejected Application Display** (login as `user4@agroconnect.local`) — this state
wasn't in the original report at all; add it since the fixture now exists and the app should handle it
distinctly from Pending, not silently show the same "Become an Expert" prompt as a fresh user:
```
Login → Profile → Verify the UI shows a Rejected status (not silently treated as "no application")
```

Do not re-run any scenario before D that already reported PASS.

---

## STEP 4 — Report back

Update `REPORT.md` with:
1. Where the fixture accounts were created (`seed/test-fixtures.js`) and the exact command to run/
   reset them.
2. The five fixture emails and their intended states (no real passwords need to be shared in the
   report itself — reference that they're in `seed/test-fixtures.js`, not retyped in `REPORT.md`,
   consistent with not committing real credentials in plaintext).
3. The actual schema fields/enum values used, confirmed from Step 1's inspection (don't just restate
   this prompt's guess at them).
4. Pass/fail for Scenario D, E1, E2, and E3, with screenshots.
5. Confirmation that Step 2's assertion/evidence contradiction was fixed, and what the correct
   result actually was.

## Do NOT

- Do not modify any existing production/demo account.
- Do not change `Login.jsx`, `App.jsx`, or any other already-verified-correct file as part of this
  task — this is test-data and test-scenario work only.
- Do not re-run the full Appium suite — only D, E1, E2, E3.
- Do not invent new database fields — if something genuinely doesn't exist yet (e.g. no clean way to
  represent "Rejected" distinctly in the UI), report that as a finding rather than silently patching
  the schema to make a test pass.