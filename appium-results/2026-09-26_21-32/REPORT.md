# AgroConnect — Appium & Localhost Test Pass Report

## 1. Environment Summary

| Metric | Value |
| --- | --- |
| **Test Date** | 2026-10-01 |
| **Execution Host** | `localhost:5174` (Vite / React Web App) & Mobile Viewport |
| **Browser Driver** | `Selenium ChromeDriver 133.0` |
| **Database Target** | Supabase Postgres (`mgreapakfchcxcrauheq`) |
| **Fixture Seed Generator** | `seed/test-fixtures.js` (`npm run seed:fixtures`) |
| **Target App Package** | `com.agroconnect.app` / `http://localhost:5174/` |

---

## 2. Test Accounts (Seed Fixtures)

Dedicated test accounts were created via `seed/test-fixtures.js` (`npm run seed:fixtures`, reset via `npm run seed:fixtures:reset`):

1. `user1@agroconnect.local` (Farmer, `expertStatus: null`)
2. `user2@agroconnect.local` (Farmer, `expertStatus: 'Pending'`)
3. `expert1@agroconnect.local` (Expert, `expertStatus: 'Approved'`, with slots & booking)
4. `user3@agroconnect.local` (Farmer, `expertStatus: null` — fresh account)
5. `user4@agroconnect.local` (Farmer, `expertStatus: 'Rejected'`)

---

## 3. Database Schema Verification

Inspected live Supabase database via Postgres information schema:
- `expert_applications`: `user_id` (uuid), `qualification` (varchar), `experience` (text), `cv_file_path` (text), `status` (`application_status` enum: `'Pending'`, `'Approved'`, `'Rejected'`).
- `experts`: `id` (uuid), `user_id` (uuid), `specialization` (varchar), `verified_date` (date), `rating` (numeric), `meeting_duration_minutes` (int4), `buffer_time_minutes` (int4), `is_active` (bool).
- `profiles`: `id` (uuid), `full_name` (varchar), `role` (`user_role` enum: `'Farmer'`, `'Seller'`, `'Expert'`, `'Admin'`), `is_test` (bool).

---

## 4. Test Execution Table

| Scenario | Step | Result | Screenshot | Notes |
| --- | --- | --- | --- | --- |
| Scenario A | Launch app fresh & observe splash screen | **PASS** | `01_splash_screen.png` | Splash screen captured on app launch. |
| Scenario A | Verify email/password fields present | **PASS** | `02_login_screen_state.png` | Fixed contradiction: Email and password fields verified present. (Was previously incorrectly reporting 0 input fields as PASS; fixed logic to enforce PASS/FAIL alignment). |
| Scenario A | Enter user1 credentials | **PASS** | `03_login_filled_user1.png` | Entered user1 credentials and password. |
| Scenario A | Tap Login & wait for Feed screen | **PASS** | `04_feed_after_login.png` | Navigated to Feed screen after login. |
| Scenario A | Verify 5 bottom nav tabs | **PASS** | `05_nav_bar_5_tabs.png` | Verified all 5 tabs present: Feed, Search, Catch Up, Chat, Profile |
| Scenario B | Navigate to Feed tab | **PASS** | `06_nav_tab_feed.png` | Tab Feed opened successfully without crash. |
| Scenario B | Navigate to Search tab | **PASS** | `07_nav_tab_search.png` | Tab Search opened successfully without crash. |
| Scenario B | Navigate to Catch Up tab | **PASS** | `08_nav_tab_catch_up.png` | Tab Catch Up opened successfully without crash. |
| Scenario B | Navigate to Chat tab | **PASS** | `09_nav_tab_chat.png` | Tab Chat opened successfully without crash. |
| Scenario B | Navigate to Profile tab | **PASS** | `10_nav_tab_profile.png` | Tab Profile opened successfully without crash. |
| Scenario C | Verify top sub-tab row visible & not overlapped by header | **PASS** | `11_catchup_farmer_view.png` | 'Book Expert' sub-tab is fully visible at y=292, height=71. Cropped region: crop_book_expert_tab_region.png |
| Scenario C | Verify rendered farmer sub-tabs | **PASS** | `11_catchup_farmer_view.png` | Rendered sub-tabs: Book Expert, Upcoming, History, Join Lobby, Reviews |
| Scenario C | Tap sub-tab 'Book Expert' | **PASS** | `12_catchup_subtab_book_expert.png` | Sub-tab 'Book Expert' displayed content. |
| Scenario C | Tap sub-tab 'History' | **PASS** | `13_catchup_subtab_history.png` | Sub-tab 'History' displayed content. |
| Scenario C | Tap sub-tab 'Join Lobby' | **PASS** | `14_catchup_subtab_join_lobby.png` | Sub-tab 'Join Lobby' displayed content. |
| Scenario C | Tap sub-tab 'Reviews' | **PASS** | `15_catchup_subtab_reviews.png` | Sub-tab 'Reviews' displayed content. |
| Scenario C | Verify expert card / list on Book Expert | **PASS** | `16_book_expert_list.png` | Expert cards listed. |
| Scenario C | Tap expert calendar | **PASS** | `17_expert_calendar_view.png` | Calendar view opened. |
| Scenario C | Verify time slot picker UI | **PASS** | `17_expert_calendar_view.png` | Pre-marked time slot chips rendered (no native clock picker). |
| Scenario C | Verify slot selection & Confirm Booking button | **PASS** | `18_booking_slot_selected_state.png` | Confirm Booking button state: enabled=True. |
| Scenario D | Login as expert1 & verify Expert dashboard | **PASS** | `25_scenario_d_expert_dashboard.png` | Logged in as expert1@agroconnect.local. Verified Expert feed header. |
| Scenario D | Open Catch Up tab & verify expert meeting view | **PASS** | `26_scenario_d_expert_catchup_view.png` | Verified Catch Up view for Expert account (Upcoming meetings & slots). |
| Scenario D | Open Expert Menu & verify expert-specific options | **PASS** | `27_scenario_d_expert_menu_options.png` | Expert menu options visible (Availability, Profile Edit, Leave Expert). |
| Scenario D | Open meeting/booking history | **PASS** | `28_scenario_d_expert_history_view.png` | Verified meeting history for Expert account. |
| Scenario D | Verify availability/date customization is visible | **PASS** | `29_scenario_d_expert_availability_customization.png` | Availability customization grid and time slot controls verified. |
| Scenario D | Verify 'Leave Expert' or equivalent option exists | **PASS** | `30_scenario_d_leave_expert_option.png` | Verified 'Leave Expert' / modal option is accessible in Expert View. |
| Scenario E1 | Confirm 'Become an Expert' is visible and enabled | **PASS** | `31_scenario_e1_profile_user3.png` | 'Become Verified Expert' button is visible and active for fresh account. |
| Scenario E1 | Submit application & verify Pending status | **PASS** | `35_scenario_e1_pending_status_result.png` | Submitted KYC application with CV. Resulting status displays 'Pending Admin Approval'. |
| Scenario E2 | Verify 'Become an Expert' NOT shown & 'Pending Review' displayed | **PASS** | `36_scenario_e2_pending_application_display.png` | Verified 'Become Verified Expert' button is NOT shown, and UI clearly displays 'Pending Admin Approval' status. |
| Scenario E3 | Verify UI shows Rejected status & Reapply option | **PASS** | `37_scenario_e3_rejected_application_display.png` | Verified UI distinctly shows 'Expert Application Rejected' badge and 'Reapply as Expert' button (not silently treated as no application). |

---

## 5. Summary of Scenario Results (D, E1, E2, E3)

1. **Scenario D (Expert View)**: **PASS** — Logged in as `expert1@agroconnect.local`. Verified expert home header, Catch Up meeting view with consultation slots, Expert Menu sheet, meeting history, and availability customization options.
2. **Scenario E1 (Fresh Expert Application)**: **PASS** — Logged in as `user3@agroconnect.local`. Verified 'Become Verified Expert' button present. Completed 3-step KYC flow, uploaded PDF CV, submitted bio, and verified resulting status updated to 'Pending Admin Approval'.
3. **Scenario E2 (Pending Application Display)**: **PASS** — Logged in as `user2@agroconnect.local`. Verified 'Become Verified Expert' prompt is NOT shown, and UI clearly displays '⏳ Expert Application Pending Admin Approval' badge.
4. **Scenario E3 (Rejected Application Display)**: **PASS** — Logged in as `user4@agroconnect.local`. Verified UI displays '❌ Expert Application Rejected' badge and 'Reapply as Expert' button (not silently treated as no application).

---

## 6. Report Inconsistency Resolution (Step 2)

In the previous report, Scenario A's step *"Verify email/password fields present"* had an assertion result of `PASS` alongside note *"Found 0 input fields"*. 
This inconsistency was resolved: the assertion logic was updated so that step results strictly reflect element presence (requiring `>= 2` input fields for `PASS`). Both fields were verified present on the login screen.
