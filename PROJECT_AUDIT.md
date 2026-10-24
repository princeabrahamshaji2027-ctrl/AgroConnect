# AgroConnect — Project Audit (2026-10-24)

Audited commit `f7e5750` on branch `claude/great-rhodes-fd3ce8` (git worktree). Companion files:
`AUDIT_ISSUES.md` (issue register), `TEST_RESULTS.md` (test-by-test), `supabase/proposed/` (DB changes awaiting
approval), `AGENT_MD_PROPOSED_UPDATE.md` (suggested status entry; `agent.md` itself was not touched).

## 1. Executive summary

AgroConnect is a working Supabase-backed social and consultation app for farmers. It has two React frontends: a
Capacitor-wrapped mobile app and an admin website. The core social features (feed, posts, comments, follows, chat,
notifications) and the expert lifecycle (apply → admin approve/reject → book a slot → consult → review) read and
write real data. Marketplace, AI assistant, video calls, Google login and password reset are UI-only or missing.

The audit found **two critical security problems that were live**:

1. The admin website signed itself in with a hardcoded admin password that was shipped in the public JS bundle.
   **Fixed in code.** The password still needs rotating and the site redeploying.
2. Anonymous visitors can read every user profile, including phone numbers. **Confirmed live; fix proposed.**

A third critical issue is strongly suspected: any signed-in user may be able to set their own `role` to `Admin`.
I did not reproduce it, because that would mean writing to production. Nine code defects were fixed, each with a
regression test, and both apps plus the Android APK build cleanly.

**Score: baseline 3.8/10 → final 4.7/10.** The 9/10 target was **not** reached. The biggest remaining blockers are
the unapplied RLS fixes, the client-side business logic in Catch Up, and the lack of any signed-in end-to-end testing.
That testing is blocked because no staging Supabase project exists.

## 2. Actual technology stack (verified from source)

| Layer | Technology |
|---|---|
| Mobile app | React 19 + Vite 8 SPA (`src/`), wrapped by **Capacitor 8** (`android/`, `com.agroconnect.app`). It is a WebView app, not native Android UI. Plugins: app, camera, filesystem, geolocation. No router: navigation is state in `src/App.jsx`. |
| Admin website | React 19 + Vite 8 + Tailwind 3 (`admin-dashboard/`), single page, tab state in `App.jsx`. |
| Backend | **None besides Supabase** (Rules.md §3.1): Postgres + RLS, Auth (email/password), Storage (`avatars`, `post-images`, `post-videos`, `expert-cvs`), Realtime (`postgres_changes` on notifications, posts, messages, reports …), SECURITY DEFINER RPCs. Uncommitted WIP adds one Edge Function (`delete-user`). |
| Data access | Both frontends call Supabase **directly from the browser** with the anon key (`src/supabase.js`, `admin-dashboard/src/supabase.js`). Security therefore depends entirely on RLS and RPC checks. No service-role key is in frontend code. |
| Scripts | `seed/` (Faker demo data and fixtures, service-role key from `.env`), `seed-demo-users.js`, `keep-alive.js` (pings Supabase). Python Selenium/Appium scripts at the repo root. |
| Deployment | Render is mentioned by the owner, but **no Render config is in the repo** (no `render.yaml`). The build is assumed to be `vite build` → static `dist/`. The live Render URL and settings were not verifiable from here. |

## 3. Architecture & data flow

```
Android (Capacitor WebView) ──┐
                               ├──> supabase-js (anon key + user JWT) ──> Supabase: Auth · PostgREST(RLS) · Storage · Realtime · RPCs
Admin website (browser) ───────┘                                              └─ (WIP) Edge Function delete-user (service role)
```

- **Auth flow (app):** `Login.jsx` → `signInWithPassword`. A bare username becomes `<username>@agroconnect.com`.
  Then `profiles.role` is read and Admins are signed out and sent to the admin site. The session persists in
  localStorage (supabase-js default). Splash checks `getSession()` on relaunch.
- **Auth flow (admin):** `signInWithPassword` → `App.jsx` loads `profiles` → anyone who is not `Admin` is signed out.
  This gate is client-side only, so admin data must be (and mostly is) protected by `is_admin()` in RLS/RPCs.
- **Roles:** `user_role` enum `Farmer | Seller | Expert | Admin` (per the previous report). Expert mode in the app is
  decided by an `experts` row, **not** by `profiles.role` (see AUD-015).

### Module map

| Path | Purpose |
|---|---|
| `src/App.jsx` | Screen/tab/sub-screen state machine, back button, notification toast + broadcast modal (realtime). |
| `src/pages/Feed.jsx`, `CreatePost.jsx`, `Search.jsx`, `Notifications.jsx` | Social feed, posting (Storage upload), search, notifications. |
| `src/pages/UserProfile.jsx`, `EditProfile.jsx`, `Settings.jsx`, `PrivacySecurity.jsx` | Profile, follow, Become Expert KYC, Become Seller (Coming Soon), settings, password change. |
| `src/pages/Connect.jsx` (2,895 lines) | "Catch Up": expert list, calendar, booking, upcoming/history, lobby, simulated call, reviews, expert availability editor, cancellation with reschedule offers, client-side reminders/no-shows, Leave Expert. |
| `src/pages/Chat.jsx` | 1:1 conversations + realtime messages. |
| `src/pages/PeaAI.jsx` | Keyword-matched canned "AI" answers. |
| `src/pages/Community.jsx`, `src/mock/*.json` | Not routed / unreferenced (dead). |
| `admin-dashboard/src/pages/*` | Dashboard, Users, Experts, Sellers, Posts, Comments, Reports, Appointments, Meetings, Reviews, Broadcasts. Products/Orders/Categories routes render Coming Soon. `News.jsx` is not in the sidebar. |
| `supabase/migrations/` | **Incremental only**: 6 files plus the WIP file. The base schema, most RLS policies, triggers and RPCs (`approve_expert_application`, `ban_user`, `send_broadcast`, …) exist only in the live DB, so the repo cannot recreate the database. |

### Tables (from code usage + read-only observation)
`profiles` (id=auth.uid, full_name, role, bio, location, phone, profile_image_path, is_banned, ban_reason, banned_at,
follower_count, post_count), `farmer_profiles`, `experts` (user_id, specialization, rating, meeting/buffer minutes,
is_active, no_show_count), `expert_applications` (status `application_status` Pending/Approved/Rejected, unique
pending per user, CV must end in .pdf), `seller_profiles`, `posts` (status, media_type, title unused), `comments`,
`likes`, `followers`, `conversations`, `messages`, `notifications`, `broadcasts`, `reports`, `admin_audit_log`,
`consultation_slots`, `consultation_bookings` (slot_id, status, cancellation/refund/notification flags),
`video_meetings`, `reviews` (booking_id, expert_id, reviewer_id, rating), `products`, `orders`, `categories`,
`news`, `communities`, `community_members`, and `expert_resignations` (WIP).

## 4. Feature implementation matrix

| Feature | Classification | Evidence |
|---|---|---|
| Email/password login, logout, session persistence | Implemented, not tested signed-in | Code; previous report screenshots 03–04, 22. Signed-in flows BLOCKED here. |
| Registration with validation | Implemented; validation verified | Browser: empty submit → "Full Name is required."; 27 validation unit tests pass. GPS address is fabricated (AUD-022). |
| Google login, Forgot password, Remember me | Not implemented (UI only) | Browser: no handler, no request. |
| Feed (approved posts, realtime inserts) | Implemented, not fully tested | Real queries; 1 approved post live. No pagination. |
| Create post (image/video upload) | Implemented | Bypasses moderation (`status: 'Approved'`, AUD-018). |
| Edit/delete own post (app) | Not implemented | No UI found. |
| Comments add | Implemented | — |
| Comments edit/delete own | **Was broken → fixed** | AUD-004 regression test. |
| Comment likes/replies, bookmarks, likes on Profile/Search cards | UI only | Local state only (AUD-026). |
| Post likes (feed) | Implemented; error handling fixed | AUD-006. |
| Follow / connect | Implemented | `followers` inserts/deletes. |
| Search (posts, profiles) | Implemented | Queries `posts`, `profiles` and `communities` (0 rows live; the Community page itself is not routed). |
| Chat 1:1 + realtime | Implemented, not tested signed-in | No "new conversation" entry point except via consultation flows. |
| Notifications + realtime toast + admin broadcasts | Implemented | `send_broadcast` RPC. A "forced" broadcast closes the app. |
| Profile view/edit, avatar upload | Implemented | — |
| Become Expert (3-step KYC, CV PDF upload) | Implemented; upload/history bugs fixed | AUD-007. |
| Expert approval/rejection (admin) | Implemented via RPC | `approve_expert_application` / `reject_expert_application` (definitions not in repo). |
| Expert view (Catch Up availability, history) | **Broken for fixture expert1** | Missing `experts` row (AUD-015); previous PASS was blank screenshots (AUD-016). |
| Expert discovery & booking | Implemented, **non-atomic** | AUD-014. |
| Cancellation / reschedule offers / reviews | Implemented (client-side logic) | Reminders, no-shows and refunds run in the browser (AUD-013). Refund is a status label only. |
| Video consultation | Simulated | AUD-019. |
| Leave Expert (self) | Implemented in Connect.jsx; WIP adds admin-approved resignation | — |
| Seller registration, marketplace, orders | Not implemented (Coming Soon) | AUD-029. |
| PEA AI assistant | UI only (canned) | AUD-020. |
| Crop disease detection, IoT, onboarding/interest selection, offline mode | Not implemented | No code. |
| Admin: dashboard stats | **Fabricated → fixed** | AUD-009. Counts are real queries. |
| Admin: users (ban/unban, profile modal, soft/hard delete) | Implemented; hard delete silently fails in committed code | WIP moves it to an Edge Function (AUD-017: CORS bug). |
| Admin: posts/comments moderation | Implemented; delete verification fixed | AUD-010. |
| Admin: reports, broadcasts, meetings (status RPC), reviews, sellers approve/reject | Implemented, not tested signed-in | — |
| Admin: products/orders/categories, news | Coming Soon / unreachable | — |
| Admin audit log | Partially implemented | Written client-side after most actions; not for every action (e.g. News). |

## 5. Baseline (Phase B)

- `git status`: clean worktree at `f7e5750`. The main checkout has **uncommitted Antigravity work** (11 files,
  `supabase/functions/delete-user`, `20261024_agent_fixes.sql`, and a newer `agent.md` for `changes.pdf`). It was
  left untouched. Merge note: my edits avoid the hunks that work changes, but both touch `src/pages/UserProfile.jsx`
  in different regions, so expect a clean or trivial merge.
- Builds: user app PASS, admin PASS, Android debug APK PASS (needs the local `jdk17`). Lint: 0 errors, 54 warnings.
  Tests: 27/27 validation tests; 1 template Android unit test; Appium/Selenium Python scripts need a device and
  Appium (not available).
- Docs vs code discrepancies: `README.md` is the Vite template. `uml.md` is a prompt, not documentation. The previous
  REPORT says `profiles.is_test` exists, but the live anon `select=*` shows no such column. `agent.md` in this commit
  describes the fixtures task; the newer one in the main checkout describes `changes.pdf`.

## 6. Security findings (summary — details in AUDIT_ISSUES.md)

| ID | Severity | Status |
|---|---|---|
| AUD-001 admin auto-login with hard-coded password in public bundle | Critical | Fixed in code; **rotate password + redeploy** |
| AUD-002 real passwords in repo/history | Critical | Fixed in file; **rotate** |
| AUD-003 self-assignable `role` via `profiles_update` (suspected) | Critical | Proposed SQL `01` |
| AUD-008 anonymous read of all profiles incl. phone | High (confirmed) | Proposed SQL `02` |
| AUD-013 browser-side notifications/no-show/refund logic implies permissive RLS | High | Open |
| AUD-012 broken `is_banned()`, mutable search_path | Medium | Proposed SQL `03` |

The anon key in the frontends is public by design and is not a leak. No service-role key appears in either frontend.
The service-role key is only in the git-ignored `.env`.

## 7. Database & API findings
- The repo can't recreate the database: the base schema, policies and RPCs exist only live. Run
  `supabase db pull` (or `pg_dump --schema-only`) and commit the result so policies can be reviewed and tested.
- Multi-table actions (booking, cancellation, no-show) are done as sequences of client calls (AUD-013/014), which
  breaks Rules.md §3.4.
- Data drift: expert fixtures are inconsistent (AUD-015), and there are 2 Admin profiles (AUD-028).

## 8. Fixes applied

| Issue | Files |
|---|---|
| AUD-001 | `admin-dashboard/src/pages/Login.jsx` |
| AUD-002 | `seed-demo-users.js` |
| AUD-004/005/006 | `src/pages/Feed.jsx`, `src/components/Card.jsx` |
| AUD-007 | `src/pages/UserProfile.jsx` |
| AUD-009 | `admin-dashboard/src/pages/Dashboard.jsx` |
| AUD-010 | `admin-dashboard/src/pages/Posts.jsx`, `Comments.jsx`, `components/PostDetailModal.jsx` |
| AUD-011 | `keep-alive.js` |
| Tests | `tests/regression.test.js`, `tests/rls-anon-probe.mjs`, `package.json` (`test`, `test:rls`) |
| Proposals | `supabase/proposed/*` (not applied) |

## 9. Final results
Both web builds PASS, APK PASS, lint 0 errors / 52 warnings, `npm test` 38/38 PASS, and the browser checks of the
admin and app login screens PASS. `npm run test:rls` still FAILS (3 tables) until `02_…` is applied. See
`TEST_RESULTS.md`.

## 10. Quality score (evidence-based)

| Category | Weight | Baseline | Final | Evidence |
|---|---:|---:|---:|---|
| Core feature correctness | 25% | 5.0 | 5.5 | Social and expert flows are real. Comment ownership and KYC fixed. Marketplace, AI and video are UI-only. Expert view broken for the fixture. |
| Integration & persistence | 20% | 5.0 | 5.5 | Real Supabase writes. Silent-failure paths fixed in feed and admin deletes. Booking is non-atomic; business logic is client-side. |
| Security & authorization | 20% | 1.0 | 3.0 | Admin auto-login removed, but the password is not rotated yet. Anonymous PII exposure is confirmed and unfixed. Role escalation is suspected. |
| Automated testing & regression | 15% | 2.0 | 3.5 | +11 regression guards and a live RLS probe. No signed-in E2E tests. Previous Appium evidence is partly invalid. |
| Stability & error handling | 10% | 5.0 | 6.0 | Crash and error-swallowing fixes. Many `alert()`s and unchecked writes remain. |
| Performance, accessibility, usability | 10% | 5.0 | 5.0 | 1.8 MB bundle, 1-second re-renders, no pagination. Unchanged. |
| **Weighted total** | | **3.8** | **4.7** | |

What blocks 9/10, in order:
1. Apply `01`–`03` (after running `00`) and rotate the leaked passwords. This alone would take security to about 7.
2. Move booking (`04`), reminders, no-shows and refunds into RPCs or scheduled functions (AUD-013/014).
3. Create a staging Supabase project, or authorise fixture use. Then add Playwright E2E tests for the signed-in app
   and admin flows, and re-run Appium on a device.
4. Commit the live schema so RLS can be tested in CI.
5. Either implement or clearly hide the UI-only features (Google login, password reset, AI, marketplace, video).

## 11. Deployment status / readiness
- **Render:** current builds are fine, but **the deployed admin site must be rebuilt and redeployed now**. Any
  version deployed before this fix signs every visitor in as admin. Rotate the admin password at the same time.
- Not production-ready until AUD-003 and AUD-008 are closed and the business logic leaves the browser.

## 12. Environment variables
| Variable | Where | Used by |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | local `.env` only (git-ignored) | `seed/`, `seed-demo-users.js` |
| `DEMO_ADMIN_PASSWORD`, `DEMO_USER1_PASSWORD`, `DEMO_USER2_PASSWORD` | local `.env` / shell (new) | `seed-demo-users.js` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Function secrets (set automatically) | WIP `delete-user` |

Note: `.env.example` is matched by the `.env.*` ignore rule and is therefore not in git.

---

## 13. Remediation pass (2026-10-24, second session)

Full checklist, credential map, Render settings and the production gate: **`REMEDIATION_STATUS.md`**.

### Architecture change (ready, not deployed)
Consultation lifecycle moved from the browser into PostgreSQL. This needs `supabase/proposed/05_*.sql` to be applied
**together with** the new client.

```
Browser (Connect.jsx) ── rpc ──> book_consultation_slot / cancel_consultation_booking / join_consultation / complete_consultation
                                   (SECURITY DEFINER, validate caller + state, one transaction each)
pg_cron (every minute) ─────────> process_consultation_lifecycle()  reminders · expert no-show · refund Pending · admin alerts
Admin / payment Edge Function ──> admin_settle_refund / admin_retry_refund
Guards (triggers, independent of live policy names): notifications only for self/admin · slot is_booked server-only ·
expert counters admin-only · reviews only for own completed bookings. Direct INSERT/UPDATE/DELETE on bookings revoked.
RESTRICTIVE read policies: bookings visible to their two participants and admins only.
```
Both frontends now accept `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` at build time (defaults unchanged), so a
staging build is possible.

### Test infrastructure added
`npm run test:db` (24 SQL tests on a disposable PGlite copy), `npm run test:e2e` (Playwright, local Chrome),
`npm run test:staging` (authenticated API E2E; staging only), `scripts/export-live-schema.sh` (schema-only export).

### Updated quality score

| Category | Weight | After audit | Now | Why |
|---|---:|---:|---:|---|
| Core feature correctness | 25% | 5.5 | 6.0 | Farmer-cancel slot leak and fake refunds fixed in code; signed-in flows still unverified. |
| Integration & persistence | 20% | 5.5 | 6.5 | Booking lifecycle is transactional and tested, but only on the reconstructed copy. |
| Security & authorization | 20% | 3.0 | 4.0 | Fixes for privilege escalation, PII exposure and notification forgery are written and tested, but **none are applied to production**, and the passwords are **not rotated**. Live exposure is unchanged. |
| Automated testing & regression | 15% | 3.5 | 6.0 | 24 DB, 13 regression, 5 browser E2E passing; staging suites written but BLOCKED. |
| Stability & error handling | 10% | 6.0 | 6.5 | Server-side validation gives consistent errors; no device crash. |
| Performance, accessibility, usability | 10% | 5.0 | 5.5 | Removed per-second re-render; found font/icon network dependency (AUD-035). |
| **Weighted** | | **4.7** | **5.7** | |

Expected once you rotate the passwords, apply 01–03 and 05, and the staging E2E plus device expert scenario pass:
about 7.5. Reaching 9 additionally needs the real schema in git with CI running `test:db` against it, bundled fonts,
a real video/payment provider or honest labelling of those features, and pagination.

---

## 14. Third pass (2026-10-24) — verified against the live database

The Supabase connector gave read-only visibility into production. It confirmed suspected problems and found new ones;
nothing was changed in production. The real schema is now in git (`supabase/schema/live_schema_20261024.sql`),
the test harness runs on it, and every proposed script was rewritten and re-tested against it (30/30).
Full details: `REMEDIATION_STATUS.md` (third pass), `AUDIT_ISSUES.md` (AUD-040…050).

Most important new facts:
- **Anyone can create an Admin account through public signup** (AUD-003b), and existing users can promote themselves (AUD-003).
- **Every signed-in user can read every expert's CV** (AUD-043).
- Consultation notifications have **never** been delivered (enum mismatch, AUD-045). The admin's booking Cancel/Complete is broken (AUD-042). Realtime is off (AUD-044).
- Repo migrations do not describe production. One of them (`20260814`) would take production down if pushed.

### Score, re-evaluated (7 categories, weights 20/20/15/15/15/7.5/7.5)
| Category | Production as deployed today | Code in this branch, if the approved scripts are applied (verified locally only) |
|---|---:|---:|
| Core feature correctness | 5.5 | 6.5 |
| Security & authorization | 2.0 | 6.5 |
| Database/API integrity | 4.5 | 7.5 |
| Integration & persistence | 5.0 | 6.5 |
| Test coverage | 6.5 | 6.5 |
| Stability & error handling | 6.0 | 6.5 |
| Performance & usability | 5.5 | 6.0 |
| **Weighted** | **4.8** | **6.6** |

The earlier 5.7 was computed before these live findings. It is superseded. **Not 9/10.** The blockers, in order:
password rotation; your approval to apply 01–08 (prevents the Admin-signup takeover and the CV leak); a staging
project for signed-in E2E and the expert device scenario; a coordinated 05 + app release; the admin redeploy.

### Production after the approved apply (2026-10-24)
01, 02, 03 (+03b), 07 and 08 are live and verified. The Admin-signup takeover, self-promotion, self-made experts,
anonymous profile reads and the expert-CV leak are **closed in production**. Counters now update correctly.
04 and 05 are held for the coordinated app release.

| Category | Before apply | Production now |
|---|---:|---:|
| Core feature correctness | 5.5 | 5.5 |
| Security & authorization | 2.0 | 5.0 |
| Database/API integrity | 4.5 | 5.5 |
| Integration & persistence | 5.0 | 5.5 |
| Test coverage | 6.5 | 7.0 |
| Stability & error handling | 6.0 | 6.0 |
| Performance & usability | 5.5 | 5.5 |
| **Weighted** | **4.8** | **5.7** |
Security is not higher yet: the exposed passwords are not rotated, and notifications/bookings remain client-writable until 05 ships.
