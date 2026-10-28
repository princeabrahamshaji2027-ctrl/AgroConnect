# AgroConnect final application audit (2026-10-28)

Branch `feat/admin-roles-resumes-branding` (from `main` = `e34d870`). Plan: `AUDIT_PROMPT_2026-10-28.md`.
Details: `docs/ADMIN_AND_RESUME_WORKFLOW.md`, `docs/SEED_USERS_AUDIT.md`, `docs/PHONE_TEST_CHECKLIST.md`.

## What was inspected
- Git state; the migration history of production (`mgreapakfchcxcrauheq`) and staging (`ahkgvuewgbjyahbiehrx`); live
  function bodies (`demote_expert`, `ban_user`, `set_consultation_fee`, `guard_consultation_slots`).
- The expert application / resume flow (app), the admin Users / Experts / Dashboard / Reports pages, the seed scripts,
  the Android launcher resources and permissions.
- Read-only data audit of both projects (counts, roles, resumes, storage objects).

## Problems found and fixed
| # | Problem | Fix |
|---|---|---|
| 1 | Removing an expert cancelled bookings without the admin seeing them, used the old refund fields (no `refund_paise`, no refund adjustment, reminders not stopped) and allowed demoting yourself or an admin | migration 24: `admin_expert_removal_preview` + `demote_expert(p_user_id, p_cancel_upcoming)` (explicit confirmation, `_apply_cancellation` accounting, guards); same for `approve_expert_resignation` |
| 2 | A removed expert could still set a fee and publish slots | `set_consultation_fee` and the slot trigger require an active expert |
| 3 | An admin could ban themselves or another admin; unban wrote `profiles` from the browser | guards in `ban_user`; new `unban_user` RPC |
| 4 | The resume extension came from the file name (how the JPEG "resumes" got in); an upload failure left files behind; no server-side check of the file | path always `<uid>/<time>_cv.pdf`; new Edge Function `submit-resume` (real-PDF check, deletes refused files); client inserts / path changes refused by trigger `guard_expert_application_cv` |
| 5 | No way to replace a resume | "Update Resume (PDF)" for experts (Catch Up ☰) and pending applicants (Profile) |
| 6 | Admin could not see missing files before clicking | Experts page marks "Resume missing — ask the expert to upload a PDF again" |
| 7 | Combined qualification text could exceed `varchar(150)` → raw DB error | checked in the app and in `submit-resume` |
| 8 | No admin account creation; no role filter | `admin-create-user` Edge Function (Farmer only, one-time set-up link), Add user form, role filter, no actions on own/admin rows |
| 9 | "District overview" card on the dashboard | removed (DB function, filters, districts and Idukki kept) |
| 10 | Demo experts had no resume and showed "Dr." titles | synthetic PDF resumes ("DEMO DOCUMENT - NOT A REAL QUALIFICATION"), titles removed, re-runs don't change passwords |
| 11 | App icon was the default | `logo.svg` → launcher icons (adaptive + legacy + round, 5 densities), app/admin logo PNG, favicons; version 1.2 (3) |

Found while testing (deviations from the written plan, both fixed and covered by tests):
- `submit-resume`: a repeated "apply" with the same path would have deleted the already attached resume. It now never
  deletes a file that an application references.
- `_attach_resume`: writing the applicant into `admin_audit_log.admin_id` (NOT NULL, no cascade) made that account
  impossible to delete. It now notifies the admins instead, and the old file is kept. Applied to staging as
  `remediation_24b_attach_resume_no_applicant_audit`. The migration 24 file contains the fixed version.

## Verified honestly as not implemented
- PEA "AI" assistant: canned keyword replies after a timer, no model.
- Crop disease assistance: none.
- Shop: product list only, no ordering.

## Test results (real runs, 2026-10-28)
| Suite | Result |
|---|---|
| `npm run lint` | 0 errors (3 old `exhaustive-deps` warnings in `Connect.jsx`) |
| `npm test`: validation | 27 / 27 |
| `npm test`: unit + regression | 58 / 58 |
| `npm test`: database (PGlite, incl. 8 new migration-24 tests and the rollback) | 132 / 132 |
| `npm run test:staging` (10 files, incl. new `staging-admin-roles`) | 56 passed, 1 skipped (every farmer pair already has a conversation), **1 failed**: the old workflows test applied with a direct insert, which migration 24 now refuses. Updated to apply through `submit-resume`; rerun **passed** |
| `npx playwright test` (signed in, staging builds) | 51 passed, 1 skipped, **1 failed**: new resume test, ambiguous "Upload" button selector. Fixed; rerun **passed** |
| `npm run build`, admin build | OK |
| Function fingerprints, staging = PGlite | 9 / 9 match |

## Migration and deployment state
| | Production | Staging |
|---|---|---|
| Migrations | + `remediation_24_expert_removal_and_resumes` (applied 2026-10-28 with the owner's approval; the file already contains the `_attach_resume` fix; 9/9 function fingerprints = staging) | + `remediation_24_expert_removal_and_resumes`, `remediation_24b_attach_resume_no_applicant_audit` |
| Edge Functions | + `submit-resume`, `admin-create-user` (2026-10-28, same code hashes as staging; both refuse calls without a session) | + `submit-resume`, `admin-create-user` |
| Admin website (Render) | still commit `1289b3e` (manual deploy needed) | — |
| Git | `main` = `e34d870` | branch `feat/admin-roles-resumes-branding` pushed |

**Required order for production:**
1. migration 24 (one file, with the fix);
2. the two Edge Functions;
3. merge to `main`;
4. Render Manual Deploy;
5. production seeding (the owner runs it).

The new app/admin code needs 1 and 2 first: without `submit-resume`, expert applications from the new app fail.

## Risks / open items
- The staging seed (50 demo users) is blocked until `STAGING_SUPABASE_SERVICE_ROLE_KEY` is in `.env.staging`.
- The two broken production resumes (jacob, Anandh) wait for the experts (owner decision).
- Old app versions (1.0/1.1) can no longer submit expert applications ("Please update the app").
- Physical device: done on 2026-10-28 (Nothing Phone (2), Android 16, staging APK 1.2). See "Phone test" below.

## Phone test (Nothing Phone (2), Android 16, `com.agroconnect.app.staging` 1.2-staging)
`scripts/staging/device-smoke.py` with the staging test accounts (user1 farmer, expert1 expert; the 50 demo users are not
seeded yet):
- **First full run: 18 of 19 checks passed.** The full consultation stopped at saving the Meet link: the sheet stayed
  open, most likely a missed tap.
- **Rerun 1** failed before starting: the phone had locked (empty screen reads).
- **Rerun 2**, with the phone unlocked: **passed**. Booking → fee → Meet link → join at T-5 → completion → rating →
  2 % admin record.
- No ANR, no FATAL EXCEPTION. The production app (1.1) stayed unchanged; the script checks this.

Launcher icon: on the phone the first icon clipped the "Agro Connect" text, because Nothing's circle mask is smaller
than assumed. The logo is now scaled to fit Android's guaranteed 66 dp safe circle (46 %). Verified on the phone (App
info shows the whole logo inside the circle).

"Update Resume (PDF)" on the phone needs the system file picker, which the script does not drive. The same flow passed
in the Playwright run against the staging build (a `.txt` file refused, a real PDF accepted).
