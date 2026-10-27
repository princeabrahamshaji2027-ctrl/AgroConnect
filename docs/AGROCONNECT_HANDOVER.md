# AgroConnect — Complete Handover & Operations Guide

This handover guide provides a complete, autonomous reference for maintaining, building, testing, deploying, and troubleshooting the **AgroConnect** platform (Web Admin Dashboard and Android Mobile Application) without relying on AI assistance.

---

## 1. Project Overview & Verified Architecture

AgroConnect is an agricultural digital platform connecting farmers with agricultural experts and administrators.

```
                    ┌────────────────────────────────────────────────────────┐
                    │                   Production System                    │
                    └────────────────────────────────────────────────────────┘
                                    │                           │
                    ┌───────────────▼───────────────┐ ┌─────────▼────────────┐
                    │     Admin Web Dashboard       │ │ Android Mobile App   │
                    │   (React + Vite + Tailwind)   │ │ (Capacitor + React)  │
                    │   Hosted on Render Static     │ │ Package:             │
                    │ agroconnect-h7nj.onrender.com │ │ com.agroconnect.app  │
                    └───────────────┬───────────────┘ └─────────┬────────────┘
                                    │                           │
                                    │ HTTPS (sb_publishable_…)  │
                                    ▼                           ▼
                    ┌────────────────────────────────────────────────────────┐
                    │               Supabase Production Cloud                │
                    │         URL: https://mgreapakfchcxcrauheq.supabase.co  │
                    │  - Auth (GoTrue API: email/password, recovery)         │
                    │  - PostgreSQL Database (RLS policies, RPC functions)   │
                    │  - Realtime subscriptions                              │
                    │  - Storage buckets (avatars, post-images, post-videos) │
                    └────────────────────────────────────────────────────────┘
```

### Component Architecture
* **Admin Dashboard** (`admin-dashboard/`): React 18 SPA built with Vite, Tailwind CSS, Lucide / Material symbols. Authenticates via Supabase Auth and enforces `profiles.role = 'Admin'`.
* **Mobile / Web App** (`src/`): React 18 mobile web app wrapped in Apache Cordova / Ionic Capacitor for Android.
* **Android Native Wrapper** (`android/`): Gradle 9.2.1 Android project targeting SDK 36 (min SDK 24), version 1.1 (versionCode 2), appId `com.agroconnect.app`.
* **Database & Backend** (`supabase/`): PostgreSQL hosted on Supabase (`mgreapakfchcxcrauheq`). All business logic for bookings, cancellations, consultations, messaging, and role protection is enforced via PostgreSQL functions (`SECURITY DEFINER`) and Row Level Security (RLS).

---

## 2. Current Production Status

| Component | Target URL / ID | Current Live Status | Latest Verified Commit |
|---|---|---|---|
| **Admin Dashboard** | `https://agroconnect-h7nj.onrender.com/` | Pending Render manual rebuild (`1289b3e` on GitHub `main`) | `1289b3e` |
| **Supabase Cloud** | `https://mgreapakfchcxcrauheq.supabase.co` | **Active & Healthy** (HTTP 200 on API endpoints with publishable key) | Live schema verified |
| **Android Package** | `com.agroconnect.app` (v1.1, code 2) | Built debug APK ready for testing; production keystore needed for signed Play Store release | Commit `1289b3e` assets |

---

## 3. Root Cause & Exact Fix for "Invalid API key"

### Verified Root Cause
1. **Supabase Key Format Transition**: Supabase introduced modern publishable keys (`sb_publishable_...`) and deprecated or rotated legacy JWT keys (`eyJ...`). When calling `https://mgreapakfchcxcrauheq.supabase.co/auth/v1/token` or `/recover` with the legacy anon key, the Supabase API Gateway returned:
   ```json
   HTTP/2 401 Unauthorized
   {"message": "Invalid API key", "hint": "Double check your Supabase `anon` or `service_role` API key."}
   ```
2. **Environment Variable Inlining on Render**:
   - In commit `f0e9c76`, the publishable key was added as a fallback default:
     ```javascript
     const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_...';
     ```
   - Render's static site service had `VITE_SUPABASE_ANON_KEY` configured in its environment dashboard with the old legacy JWT anon key (`eyJ...`).
   - During `npm run build` on Render, Vite inlined Render's environment variable, baking the broken legacy key into `dist/assets/index-2qM4PbAf.js`.
3. **The Permanent Code Fix** (Commit `1289b3e`):
   In `admin-dashboard/src/supabase.js`, the key selection logic was updated so that even if Render injects an outdated `eyJ...` key via `VITE_SUPABASE_ANON_KEY`, production always uses the verified publishable key:
   ```javascript
   const configuredKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
   const supabaseAnonKey = supabaseUrl === PROD_URL && (!configuredKey || configuredKey.startsWith('eyJ'))
     ? PROD_PUBLISHABLE_KEY
     : configuredKey;
   ```
   Both `admin-dashboard/src/supabase.js` and `src/supabase.js` also strictly validate that no secret/service-role keys can ever be loaded into the client.

---

## 4. Password Recovery Setup & Verification

### How It Works End-to-End
1. **Requesting Reset**:
   - On the Admin login page (`/`), clicking **"Forgot password?"** displays the recovery request form.
   - The form validates email format (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`).
   - Clicking **"Send reset link"** invokes:
     ```javascript
     supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
     ```
   - Verified with Supabase API: Returns HTTP 200 `{}`.
   - The UI disables repeated clicks to prevent spamming and rate limiting.
2. **Receiving & Opening Link**:
   - Supabase sends an email containing a link back to `https://agroconnect-h7nj.onrender.com/` with `#access_token=...&type=recovery`.
   - `admin-dashboard/src/supabase.js` listens to `supabase.auth.onAuthStateChange`. When `event === 'PASSWORD_RECOVERY'`, it flags recovery mode in `sessionStorage`.
3. **Setting New Password**:
   - `admin-dashboard/src/App.jsx` intercepts the recovery session and immediately renders `<ResetPassword email={...} onDone={...} />`.
   - The user inputs and confirms their new password (validated for strength: min 8 chars, uppercase, lowercase, numbers, special characters).
   - The page executes:
     ```javascript
     await supabase.auth.updateUser({ password });
     ```
   - Upon success, the session signs out cleanly, unsets the recovery flag, and returns the user to the login screen with the message: *"Your password has been changed. Please sign in with your new password."*
4. **Supabase Dashboard Requirement**:
   In **Supabase Dashboard → Authentication → URL Configuration**:
   - **Site URL**: `https://agroconnect-h7nj.onrender.com`
   - **Redirect URLs**:
     - `https://agroconnect-h7nj.onrender.com/**`
     - `com.agroconnect.app://auth-callback` (for the Android mobile app)

---

## 5. Exact Build and Test Commands

All commands can be run from the repository root `/Users/macadmin/Downloads/AgroConnect`.

### 1. Code Quality & Linting
```bash
npx oxlint
```
*Expected output: 0 errors.*

### 2. Full Unit & In-Memory Database Tests (PGlite)
```bash
npm test
```
*Runs 115 tests across 37 test suites including consultation lifecycle, server RPCs, cancellations, refunds, and RLS policies. Expected: 115 passed, 0 failed.*

### 3. Build Web Application
```bash
npm run build
```
*Compiles the mobile web client into `dist/`.*

### 4. Build Admin Dashboard
```bash
cd admin-dashboard
npm ci
npm run build
cd ..
```
*Compiles the admin dashboard into `admin-dashboard/dist/` (includes `404.html` SPA fallback).*

### 5. Run Admin E2E Verification Tests (Playwright)
```bash
npx playwright test --project=admin tests/e2e/admin.spec.mjs:15 tests/e2e/admin.spec.mjs:34 tests/e2e/admin.spec.mjs:43
```
*Launches headless Chrome, serves local build on port 4173, tests negative login, API key acceptance, and SPA deep-link routing. Expected: 3 passed.*

---

## 6. Android Phone & Emulator Installation Guide

### App Identity & Configuration
- **Application ID**: `com.agroconnect.app`
- **Version**: `1.1` (Version Code `2`)
- **Min SDK**: `24` (Android 7.0+)
- **Target SDK**: `36`
- **Java Home**: Built using JDK 17 (`./jdk17/Contents/Home`)

### Artifact Location
- Built Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk` (Size: ~15 MB)

### Method A: Install via USB Debugging (macOS Terminal)

1. **Enable Developer Options on Phone**:
   - Open **Settings** → **About phone**.
   - Tap **Build number** 7 times until you see "You are now a developer!".
   - Go back to **Settings** → **System** → **Developer options**.
   - Enable **USB debugging**.
2. **Connect Phone via USB Cable**:
   - Connect phone to Mac.
   - On phone prompt: tap **Allow USB debugging** (check "Always allow from this computer").
3. **Verify Device Connection in Terminal**:
   ```bash
   /Users/macadmin/Library/Android/sdk/platform-tools/adb devices
   ```
   *Expected output: Your device listed as `device` (not `unauthorized` or `offline`).*
4. **Install APK**:
   ```bash
   /Users/macadmin/Library/Android/sdk/platform-tools/adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```
5. **Launch AgroConnect on Phone**:
   ```bash
   /Users/macadmin/Library/Android/sdk/platform-tools/adb shell monkey -p com.agroconnect.app -c android.intent.category.LAUNCHER 1
   ```

### Method B: Manual File Transfer (AirDrop, Google Drive, WhatsApp, or Finder)
1. Copy `android/app/build/outputs/apk/debug/app-debug.apk` to your phone.
2. On your phone, tap the APK file in **Files** / **Downloads**.
3. Allow "Install unknown apps" for the browser or file manager if prompted.
4. Tap **Install** and open **AgroConnect**.

### How to Rebuild the Android APK After Code Changes
```bash
# 1. Rebuild web assets
npm run build

# 2. Sync web assets into Android project
npx cap copy android

# 3. Build APK with Gradle using local JDK 17
cd android
JAVA_HOME=/Users/macadmin/Downloads/AgroConnect/jdk17/Contents/Home ./gradlew assembleDebug
cd ..
```

### Release Signing Information
- Production release signing keys are loaded from `~/.gradle/gradle.properties` (`AGRO_RELEASE_STORE_FILE`, `AGRO_RELEASE_STORE_PASSWORD`, `AGRO_RELEASE_KEY_ALIAS`, `AGRO_RELEASE_KEY_PASSWORD`).
- **Never fabricate or overwrite the release keystore.** If a new release is to be published on the Google Play Store, the original upload keystore used for version 1.0 must be placed in `~/.gradle/gradle.properties`.

---

## 7. Git & GitHub Guide Specific to This Repository

### Repository Details
- **Repository URL**: `https://github.com/princeabrahamshaji2027-ctrl/AgroConnect.git`
- **Primary Branch**: `main`
- **Release Branch**: `release/production-launch`

### Safe Git Workflow
```bash
# Check status and current branch
git status

# Fetch latest changes from remote
git fetch origin

# Check recent commit history
git log -n 5 --oneline

# Create and switch to a feature branch
git checkout -b feature/my-feature

# Stage specific modified files
git add <file-path>

# Commit with a descriptive message
git commit -m "fix(area): descriptive summary"

# Push branch to GitHub
git push origin feature/my-feature
```

### Safety Rules
- **Never commit `.env` or files containing passwords/keys**.
- Check `git diff --staged` before every commit.
- `.gitignore` is pre-configured to ignore `.env`, `node_modules/`, `dist/`, `*.keystore`, and `google-services.json`.

---

## 8. Render Deployment Guide

### Service Settings
- **Service Type**: Static Site
- **Service Name**: `agroconnect-h7nj`
- **Service URL**: `https://agroconnect-h7nj.onrender.com/`
- **Git Repository**: `https://github.com/princeabrahamshaji2027-ctrl/AgroConnect`
- **Branch**: `main`
- **Root Directory**: `admin-dashboard`
- **Build Command**: `npm ci && npm run build`
- **Publish Directory**: `dist`

### Triggering Deploy on Render
Because Render static site auto-deploy may be disabled or delayed:
1. Log in to [Render Dashboard](https://dashboard.render.com/).
2. Click on the `agroconnect-h7nj` static site service.
3. Click the **Manual Deploy** button in the top right corner.
4. Select **Clear build cache & deploy** (or **Deploy latest commit**).
5. Watch the build logs until it says `Build successful` and `Site is live`.

### SPA Routing & Deep Links
- Vite build automatically copies `index.html` to `404.html`.
- For standard clean HTTP 200 routing on direct refreshes (e.g., `/users`), add a redirect rule in Render:
  - **Redirects/Rewrites**:
    - Source: `/*`
    - Destination: `/index.html`
    - Action: `Rewrite`

---

## 9. Supabase Configuration & Credentials Guide

### Project Details
- **Project Ref**: `mgreapakfchcxcrauheq`
- **Project URL**: `https://mgreapakfchcxcrauheq.supabase.co`
- **Public API Key Format**: Modern publishable key (`sb_publishable_...`)

### Accounts for Login & Testing
* **Admin Account 1 (Primary)**:
  - Email: `prince@agroconnect.com`
  - Role: `Admin`
  - Access: Full access to Admin Panel (`https://agroconnect-h7nj.onrender.com/`)
* **Admin Account 2 (Owner)**:
  - Email: Owner's registered Gmail account
  - Role: `Admin`
* **Expert Account 1**:
  - Email: `expert@agroconnect.com`
  - Name: Dr. Anita Rao
  - Role: `Expert` (Consultation slots, Google Meet consultations)
* **Expert Account 2**:
  - Name: Anandh
  - Role: `Expert`
* **Farmer Account 1**:
  - Email: `user1@agroconnect.com`
  - Name: Ravi Kumar
  - Role: `Farmer`
* **Farmer Account 2**:
  - Email: `user2@agroconnect.com`
  - Name: Amita Singh
  - Role: `Farmer`

> **Note on Passwords**: Passwords for demo accounts can be reset anytime using the verified "Forgot password?" form on the login screen or through the Supabase Dashboard (`Authentication` → `Users` → `Send password recovery`).

---

## 10. Environment Variable Names Reference

Never store values in version control. The application references these variables:

### Web & Admin Frontend
- `VITE_SUPABASE_URL`: Supabase project URL (defaults to production URL)
- `VITE_SUPABASE_ANON_KEY`: Supabase publishable key (defaults to production publishable key)
- `VITE_PUSH_ENABLED`: Set to `'true'` to enable push notification service worker

### Local Scripting / Testing (Never in browser code)
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Privileged backend key (for administrative maintenance scripts only)
- `DEMO_ADMIN_PASSWORD`: Used by seeder scripts
- `DEMO_USER1_PASSWORD`: Used by seeder scripts
- `DEMO_USER2_PASSWORD`: Used by seeder scripts

---

## 11. Troubleshooting Common Issues

1. **"Invalid API key" error**:
   - Cause: Client bundle using outdated JWT anon key.
   - Fix: Ensure commit `1289b3e` is deployed. In Render Dashboard, remove any manual override for `VITE_SUPABASE_ANON_KEY` or set it to the new `sb_publishable_...` key.
2. **Deep link 404 error on page refresh (e.g. `/users`)**:
   - Cause: Static server trying to find file `/users/index.html`.
   - Fix: The `404.html` fallback automatically handles this; in Render dashboard, add rewrite rule `/* -> /index.html`.
3. **Android `adb devices` shows `unauthorized`**:
   - Fix: Check phone screen, unlock it, and accept the USB debugging authorization dialog.
4. **Android installation conflict (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`)**:
   - Cause: App already installed with a different signing key.
   - Fix: Uninstall existing AgroConnect app from the phone before installing the debug APK:
     ```bash
     /Users/macadmin/Library/Android/sdk/platform-tools/adb uninstall com.agroconnect.app
     ```

---

## 12. Verified Artifacts Summary

- **Admin Web Dashboard**: Built in `admin-dashboard/dist/`
- **Mobile Web Bundle**: Built in `dist/`
- **Android APK**: `android/app/build/outputs/apk/debug/app-debug.apk` (15 MB, versionCode 2, versionName 1.1)
- **Handover Document**: `docs/AGROCONNECT_HANDOVER.md`
