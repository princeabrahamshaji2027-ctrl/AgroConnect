# Admin user management, expert removal and resumes (2026-10-28)

Code: migration `supabase/proposed/24_expert_removal_and_resumes.sql`, Edge Functions `submit-resume` and
`admin-create-user`, admin `Users.jsx` / `Experts.jsx` / `Reports.jsx` / `components/RemoveExpertDialog.jsx`, app
`UserProfile.jsx` / `components/ResumeUploadDialog.jsx` / `components/ExpertMenuSheet.jsx`.
Status: **staging** has all of it. **Production** has none of it yet (needs the owner's approval: migration 24 and the two
functions).

## 1. Admin user management (Users page)
| Action | How it works | Safety |
|---|---|---|
| Search, district filter, **role filter** | in the page | — |
| **Add user** | `admin-create-user` Edge Function: Admin API creates the account (e-mail confirmed, random unknown password), returns a **one-time set-up link** (password recovery link, 1 h) shown once to the admin | admin-only (checked with `is_admin()` from the caller's session); role is always **Farmer** (`handle_new_user` forces it); duplicate e-mail → "An account with this e-mail already exists."; audit row `create_user` |
| Ban | `ban_user` RPC | refuses your own account and administrators (new in 24) |
| Unban | `unban_user` RPC (new) | admin-only, audited; replaces the old browser-side profile update |
| Remove expert role | `RemoveExpertDialog` → `admin_expert_removal_preview` → `demote_expert(p_user_id, p_cancel_upcoming)` | see §2 |
| Own row, Admin rows | no action buttons | the server refuses as well |

Admin rights are never granted from the UI.

## 2. Remove expert role → normal user
1. The admin opens the dialog (Users or Experts → Verified Experts). The server preview lists the account, its
   **upcoming consultations** (date, time, farmer), its open future slots and its posts.
2. With upcoming consultations, the admin must tick "Cancel these N upcoming consultations. Each farmer gets a full
   refund and a notification." Without the tick the server refuses (`P0001`, hint `upcoming_bookings`) and nothing
   changes.
3. `demote_expert` (one transaction):
   - each upcoming booking is cancelled through `_apply_cancellation(…, 'admin', …)` (the migration-18 accounting:
     `refund_paise`, the demo-payment refund adjustment, queued reminders stopped), and each farmer is notified;
   - open future slots are deleted (slots with bookings stay as history);
   - `experts.is_active = false`;
   - role → Farmer;
   - the user is notified;
   - an audit row `demote_expert` is written with the previous role and the number of cancelled bookings.
4. Kept: the account, profile, posts, messages, past consultations, reviews and expert application history (resume
   included).
5. Locked out on the server:
   - `set_consultation_fee` and the `consultation_slots` trigger require an **active** expert;
   - Catch Up lists only active experts;
   - the role can only be changed by an admin (`protect_profile_privileged_columns`).
6. Expert resignation requests (Reports → Expert leave requests) use the same rule: `approve_expert_resignation(id,
   p_cancel_upcoming)`, with a second confirmation when bookings exist.

## 3. Resume upload and validation
- Bucket `expert-cvs` (migration 22): `application/pdf` only, 5 MB. It is private: owners and admins can read.
- Check constraint `expert_applications_cv_pdf_check` (path ends in `.pdf`) is **unchanged**.
- **Applying** (app → Profile → Become a Verified Expert):
  1. The app checks the file (type, extension, `%PDF` header, 5 MB).
  2. It uploads to `<uid>/<time>_cv.pdf`. The path is always `.pdf`; the old code took the extension from the file
     name.
  3. It calls `submit-resume` with `action: 'apply'`.
  4. The function downloads the object and checks it is a real PDF: starts with `%PDF-`, `%%EOF` near the end, at most
     5 MB. Only then does it insert the application.
  5. A refused file is **deleted**. A file that an application already references is never deleted.
- **Re-upload**:
  - Experts: Catch Up → ☰ → *Update Resume (PDF)*. Pending applicants: Profile → *Update resume (PDF)*.
  - `submit-resume` with `action: 'replace'` → `_attach_resume` (service role only) sets the new path on the latest
    Pending/Approved application.
  - The old file stays in storage. Admins get a notification.
- **Direct client writes are refused** by the trigger `guard_expert_application_cv`: no client insert into
  `expert_applications`, no client change of `cv_file_path`. Old app versions (1.0/1.1) therefore get "Please update
  the app" when applying.
- **Admin view** (Experts):
  - "View Resume" opens a 1-hour signed link.
  - The page checks storage for each referenced file. Missing files show "Resume missing — ask the expert to upload a
    PDF again". Opening a missing file shows "The resume file is missing from storage. Ask the expert to upload it
    again."
  - No path shows "No resume".

## 4. Resume audit, production (read-only, 2026-10-28)
Applications:

| App | Expert | Status | Stored path | File exists | Class |
|---|---|---|---|---|---|
| `ce0b2636` | jacob | Approved | `1323aace…/1786075138342_cv.pdf` | no | referenced-missing |
| `6ba4a4b2` | Anandh | Approved | `94e83e83…/1786694585471_cv.pdf` | no | referenced-missing |
| (fixture) | Dr. Ramesh Expert | Approved | `expert-cvs/expert1_cv.pdf` | no | referenced-missing |

Storage `expert-cvs`: 20 objects, **0 referenced**.

| Folder | Files | Class |
|---|---|---|
| `1323aace` (jacob) | `1786075138342_cv.jpeg` (84,147 B) | orphan-intended (the photo jacob's record meant) |
| `1323aace` (jacob) | 15 other `…_cv.jpeg`, each 84,147 B, uploaded within ~14 s | orphan-duplicate |
| `94e83e83` (Anandh) | `1786694585471_cv.jpg` (356,407 B) | orphan-intended |
| `11111111` (no auth user with that id) | `1790833912175_cv.pdf`, `1791261589989_test.pdf`, `1791264622008_cv.pdf` (312 B each) | orphan-other (old test uploads) |

Cause:
- Missing objects: none of the three referenced paths exists.
- Invalid format: the two intended files are JPEG photos, and the PDF-only rule refuses `.jpeg`/`.jpg` paths.
- Not a permission or frontend bug: the admin's signed link works for files that exist.

Also found (Q3): "Dr. Ramesh Expert" (`11111111…`) has the Expert role but **no experts row**. Reported, not changed.

## 5. Repair procedure (owner approval required for each step, nothing done yet)
Owner decision 2026-10-28: leave both records unchanged until the experts reply. If an expert agrees to converting
their photo:
1. Download the intended photo to `private/resume-repair/` and confirm it is their resume. For jacob, first check the
   16 copies are identical (`shasum -a 256`).
2. `sips -s format pdf in.jpg --out out.pdf`, and check that it starts with `%PDF-` and opens.
3. Upload it as `<user_id>/<Date.now()>_cv.pdf`, then `select public._attach_resume('<user_id>', '<path>');`. The
   photos are kept.
4. Check that the admin View opens it.

Deleting jacob's 15 duplicates is a separate yes/no.

## 6. Permissions summary
| Function | Who |
|---|---|
| `admin_expert_removal_preview`, `demote_expert`, `approve_expert_resignation`, `ban_user`, `unban_user` | admins (checked inside; refuse self / admins) |
| `_attach_resume` | `service_role` only (Edge Function, seed script) |
| `submit-resume` | any signed-in user, for their own folder only (`<uid>/…`); banned users refused |
| `admin-create-user`, `admin-delete-user` | admins (service-role key only inside the functions) |
