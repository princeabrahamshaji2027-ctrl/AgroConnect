# AgroConnect — Presentation Screenshot & Asset Index

This document catalogues every genuine screenshot and interface asset embedded in `AgroConnect_Project_Review.pptx`, detailing its origin in the repository, description, and target slide.

---

| Slide # | Slide Title | Asset Filename | Source Location in Repository | Description |
|:---:|---|---|---|---|
| **1** | Title Slide | `splash_screen.png` | `appium-results/2026-09-26_21-32/01_splash_screen.png` | Native AgroConnect mobile splash screen running on Android emulator. |
| **4** | Introducing AgroConnect | `farmer_feed.png` | `appium-results/2026-10-25_staging_device/01_farmer_feed.png` | Live farmer feed interface on connected Android phone showing localized agricultural posts. |
| **6** | Farmer Onboarding & Profile | `login_screen.png` | `appium-results/2026-09-26_21-32/02_login_screen_state.png` | User sign-in interface showing Email/Password and Continue with Google OAuth button. |
| **6** | Farmer Onboarding & Profile | `farmer_profile.png` | `appium-results/2026-10-25_staging_device/13_farmer_profile_menu.png` | Farmer profile screen showing name, district badge (Kerala), posts, and connections. |
| **7** | District-First Feed | `farmer_feed.png` | `appium-results/2026-10-25_staging_device/01_farmer_feed.png` | Feed interface demonstrating district-first sorting header and regional posts. |
| **8** | Multimedia Posts & Interaction | `feed_video_post.png` | `appium-results/2026-10-25_staging_device/23_phone_feed_video_post.png` | Feed card with embedded HTML5 video player showing crop observation. |
| **9** | PEA AI Agricultural Assistant | *Card Component* | Code: `src/pages/PeaAI.jsx` | Structured UI card reproducing the exact PEA AI interactive dialogue for organic vermicomposting. |
| **10** | Crop Disease Triage | *Pipeline & Case Study* | Code: `src/pages/PeaAI.jsx` | Diagnostic triage flow for Tomato Early Blight (*Alternaria solani*) with biological remedies. |
| **11** | Expert Catch Up Booking | `book_expert_list.png` | `appium-results/2026-09-26_21-32/16_book_expert_list.png` | Verified experts directory showing specialization, ratings, and transparent fees. |
| **11** | Expert Catch Up Booking | `catchup_slots.png` | `appium-results/2026-10-25_staging_device/16_catchup_times_for_date.png` | Interactive time-slot reservation interface for 30-minute consultation appointments. |
| **12** | Booking Economics & Refunds | `payment_processing.png` | `appium-results/2026-10-25_staging_device/37_phone_payment_processing.png` | Demonstration checkout interface showing secure transaction processing simulation. |
| **12** | Booking Economics & Refunds | `cancel_terms.png` | `appium-results/2026-10-25_staging_device/46_phone_cancel_terms.png` | Server-enforced cancellation terms showing the 14-hour boundary refund policy. |
| **13** | Video Tele-Consultations | `join_enabled.png` | `appium-results/2026-10-25_staging_device/42_phone_join_enabled.png` | Catch Up meeting card with the 'Join in Google Meet' button activated 5 min before call. |
| **13** | Video Tele-Consultations | `meeting_room.png` | `appium-results/2026-10-25_staging_device/28_phone_meeting_room.png` | Native Google Meet room interface on Android device during consultation session. |
| **14** | Direct Messaging & Requests | `chat_sent.png` | `appium-results/2026-10-25_staging_device/50_phone_chat_sent.png` | Private messaging screen showing direct consultation chat with timestamp tracking. |
| **14** | Direct Messaging & Requests | `request_accepted.png` | `appium-results/2026-10-25_staging_device/54_phone_request_accepted.png` | Message request interface confirming successful acceptance into main conversations. |
| **15** | Expert KYC Onboarding | `kyc_cv_uploaded.png` | `appium-results/2026-09-26_21-32/33_scenario_e1_kyc_step2_cv_uploaded.png` | Expert application screen with degree details and uploaded PDF CV resume attachment. |
| **15** | Expert KYC Onboarding | `expert_catchup.png` | `appium-results/2026-10-25_staging_device/06_expert_catchup.png` | Approved agronomist dashboard displaying consultation schedule and availability settings. |
| **16** | Admin Dashboard & Governance | `admin_dashboard_login.png` | Playwright Desktop Capture / `docs/presentation_assets/` | Cloud-hosted Admin Dashboard desktop interface on Render Static Cloud. |

---

### Asset Integrity Notes
1. **Zero Stock Images**: All embedded interface captures were gathered directly from actual test runs, device sessions, and web builds of AgroConnect.
2. **Confidentiality Maintained**: All captures use synthetic test data (`user1@agroconnect.com`, `expert1`, demo accounts) or anonymized placeholders. Zero private phone numbers, personal Gmail addresses, passwords, or production database secrets appear on any slide.
3. **Aspect Ratios**: Screen captures are fitted and centered with dark container backings to prevent distortion, stretching, or pixelation when projected in classroom settings.
