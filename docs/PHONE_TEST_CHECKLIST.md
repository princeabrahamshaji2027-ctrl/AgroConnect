# Phone test checklist (2026-10-28)

## APKs
| | Production debug | Staging debug |
|---|---|---|
| File | `~/Desktop/AgroConnect-1.2-debug.apk` | `android/app/build/staging-apk/app-staging-debug.apk` (also copied to `~/Desktop/AgroConnect-1.2-staging-debug.apk`) |
| Package | `com.agroconnect.app` | `com.agroconnect.app.staging` (installs **beside** the production app) |
| Version | 1.2 (versionCode 3) | 1.2-staging (versionCode 3) |
| Backend | production Supabase `mgreapakfchcxcrauheq` only | staging Supabase `ahkgvuewgbjyahbiehrx` only |
| Location permission | none | none |
| Launcher icon | new AgroConnect logo (adaptive: logo on white) | same |

The demo accounts exist only on **staging** (after the staging seed), so the phone test uses the **staging APK**.

## Connect the phone
1. Settings → About phone → tap **Build number** 7 times.
2. Settings → System → Developer options → **USB debugging** on.
3. Connect by USB. On the phone, allow "this computer" (RSA key prompt).
4. Check: `~/Library/Android/sdk/platform-tools/adb devices -l` shows the phone as `device`.

## Install
- Staging: `adb install -r android/app/build/staging-apk/app-staging-debug.apk`. It doesn't affect the installed
  production app.
- Production APK over an existing `com.agroconnect.app`: **ask first**. If `adb install -r` fails with
  `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, don't uninstall (that would erase the app's data).

## Farmer flow (demo farmer from `private/demo-credentials.txt`)
| Step | Expected |
|---|---|
| Home screen | AgroConnect logo icon |
| Log in | feed opens; wrong password shows the error under the field |
| Profile | name, district Kannur |
| Feed | "Posts from Kannur first", local posts before others; Load more adds posts without repeats |
| Create post (text / photo) | appears in the feed; a non-image file is refused |
| Like / comment | counts update |
| Search | finds people and posts |
| Messages | message an expert; a new contact becomes a message request |
| Catch Up | verified experts listed; booking opens checkout (simulated payment, no real money) |
| Notifications | booking and message notifications |
| PEA assistant | **not real AI**: canned replies (report as not implemented) |
| Crop disease assistance | **not implemented** |
| Shop | lists products only; **no ordering** |

## Expert flow (demo expert)
| Step | Expected |
|---|---|
| Log in | Catch Up opens in expert mode |
| ☰ Expert menu | Customize Availability, Meeting History, Expert Profile, **Update Resume (PDF)**, Leave Expert Mode |
| Update Resume: pick a non-PDF | "Resume must be a PDF file…" under the button |
| Update Resume: pick a PDF | "✅ Resume updated. The admin can now view it." |
| Fee / availability | can set fee ₹1–₹1,00,000 and add slots |
| Admin pages | not reachable from the app |

## Admin flow (website, staging admin)
| Step | Expected |
|---|---|
| Dashboard | **no "District overview" card**; cards stack at phone width |
| Users | role and district filters; own row and Admin rows show "—"; **Add user** gives a one-time set-up link; Unban works |
| Remove expert role | preview lists upcoming consultations; confirmation tick needed when there are any |
| Experts → View Resume | demo resumes open; missing files show "Resume missing — ask the expert to upload a PDF again" |
| Reports → Expert leave requests | approving with bookings asks a second time |

## After the run
`adb logcat -d | grep -E "FATAL|AndroidRuntime"` must be empty for the app. Take a home-screen screenshot
(`adb exec-out screencap -p > icon.png`).

## Known issues
PEA is canned, there's no crop disease feature, and the Shop has no ordering. The two old production resumes (jacob,
Anandh) wait for the experts. Render needs a manual deploy.
