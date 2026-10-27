# AGROCONNECT — FINAL PRODUCTION FIX, GOOGLE SIGN-IN, USER MANAGEMENT, SEED DATA AND COMPLETE HANDOVER

I am the owner/developer of AgroConnect, an agricultural social networking and AI-assisted farming platform. The application already runs on Render and on my Android phone. Do not rebuild the project from scratch or replace its architecture unnecessarily.

I need you to inspect the existing project, implement the requested changes, test them, deploy where authorized, and create a complete beginner-friendly handover document.

I may have limited remaining AI usage, so work continuously in one run. Prioritize fixing existing authentication and core features before optional enhancements. Do not stop after providing a plan.

## A. EXISTING PROJECT

GitHub repository:
https://github.com/princeabrahamshaji2027-ctrl/AgroConnect.git

Production admin website:
https://agroconnect-h7nj.onrender.com/

Production Supabase project:
https://supabase.com/dashboard/project/mgreapakfchcxcrauheq

Production project reference:
mgreapakfchcxcrauheq

Staging Supabase project:
https://supabase.com/dashboard/project/ahkgvuewgbjyahbiehrx

Staging project reference:
ahkgvuewgbjyahbiehrx

The project includes a web/admin dashboard, an Android app, Supabase authentication and database, farmer community posts, expert accounts, consultation/booking functionality, and an agricultural marketplace/AI assistance.

Inspect the actual repository, branches, package structure, current deployment, environment variables and latest commits before assuming anything is up to date.

## B. ABSOLUTE PRODUCTION SAFETY RULES

This is an existing production application.

1. Never rebuild the application from scratch.
2. Never delete all users indiscriminately.
3. Never delete genuine users, admins, experts, bookings, conversations, posts or related data merely because they appear old or inactive.
4. Do not change any genuine user's password or promote/demote an account without explicit authorization.
5. Preserve existing administrator accounts and the existing admin authorization mechanism.
6. Identify demo/test accounts using verifiable metadata, known test IDs, seed records or confirmed evidence.
7. Before deleting any test account, inspect foreign-key relationships and dependencies, and report the exact affected records.
8. If test accounts cannot be distinguished reliably from genuine users, leave them untouched and ask for confirmation.
9. Do not reset the production database.
10. Do not disable RLS, authentication, authorization, email verification or security policies.
11. Do not put Supabase secret/service-role keys, OAuth client secrets, passwords or recovery tokens in frontend code, GitHub commits, Android assets, logs or this report.
12. Never invent credentials or claim a user has been created when it has not.
13. Do not modify unrelated booking, payment, refund or commission logic.
14. Use staging for destructive experiments and database migration rehearsals.
15. Review the diff, tests, and deployment target before committing or deploying.

## C. FIX LOGIN, EMAIL VERIFICATION AND PASSWORD RECOVERY

First inspect the existing web and Android authentication flows.

Previously reported problems include:
- Invalid API key on the admin login page.
- New users experiencing sign-in or registration problems.
- Password recovery emails redirecting to localhost.
- The admin dashboard lacking a complete recovery flow.
- Email verification not consistently behaving as intended.

Verify the actual current state rather than assuming these problems remain unchanged.

Implement and test:

1. Existing email/password login.
2. New user registration.
3. Email confirmation for normal registered users.
4. Clear handling of unverified email addresses.
5. Password recovery from the admin and user applications.
6. Correct password-reset redirect URLs for the deployed production website.
7. Secure password update and return to login.
8. Session restoration, logout and expired-session handling.
9. Correct production Supabase URL and public API key configuration.
10. Correct error handling for invalid credentials, missing configuration, rate limits and network failures.

Never repeatedly send recovery emails or bypass Supabase rate limits. If an action requires my inbox or dashboard approval, finish the independent work and provide the exact remaining steps.

## D. GOOGLE SIGN-IN — WEB AND ANDROID

I want genuine users to be able to register and sign in using their own Google accounts. I plan to add two genuine users separately from the demonstration accounts.

Inspect the existing application and implement Google OAuth using the supported Supabase authentication flow.

Requirements:

1. Add or fix a clearly visible "Continue with Google" button on the registration/login screen.
2. Support the correct browser redirect and Android OAuth callback.
3. Configure account/session handling and return users to the correct screen after authentication.
4. Ensure Google sign-in creates or retrieves the corresponding Supabase authentication user and profile.
5. Preserve existing roles and authorization checks.
6. Do not automatically grant admin or expert privileges to a Google user.
7. Do not create duplicate profiles on repeated Google logins.
8. Handle cancellation, rejected authorization, missing email, redirect mismatch and network failures gracefully.
9. Test the Google flow on the web and Android wherever authorized tools and test credentials permit.
10. Do not claim real Google authentication is verified merely because a button appears.

### Google Cloud and Supabase configuration

Inspect the exact callback URLs, Android package identity and redirect URI required by the implementation.

If credentials are missing, do not invent them or expose secrets. Tell me exactly where to configure them.

Provide a beginner-friendly guide covering:

- Google Cloud Console.
- Creating or selecting a Google Cloud project.
- OAuth consent screen and application branding.
- OAuth client creation and the correct client type.
- Authorized redirect URI for Supabase.
- Authorized JavaScript origins where required.
- Android package name and SHA fingerprints where required.
- Supabase Authentication → Providers → Google.
- Supabase Site URL and allowed Redirect URLs.
- Any Android deep-link, intent-filter or callback configuration required by the actual app.
- Testing Google login with two genuine Google accounts.
- Consent-screen testing/publishing requirements if applicable.

Do not ask me to paste client secrets or credentials into chat. If values must be entered, tell me which field receives them in the relevant dashboard.

Do not guess the callback URL. Derive it from the actual production Supabase project and implementation, then report the exact value.

## E. USER PROFILE AND DISTRICT REGISTRATION

For this phase, the application is intended for Kerala only.

The four permitted districts are:
- Kannur
- Pathanamthitta
- Idukki
- Kottayam

Inspect all registration screens, profile editing screens, database constraints, profile-creation triggers and district filters.

Implement:
1. Country/state/address fields are not required for this phase beyond what the existing authentication system needs.
2. No GPS-based location detection or precise-location permission should be required.
3. Remove unnecessary country, state, village, detailed-address, latitude and longitude fields from the registration UI if they are not required by existing functionality.
4. Require selection of one of the four permitted districts.
5. Validate the district on the server/database side, not only in the frontend.
6. Ensure profile creation and editing work consistently on web and Android.
7. Ensure Google sign-in users are asked to complete their district profile if missing.
8. Do not assign a district based on IP address or inferred location.
9. Preserve valid existing profile information unless explicitly approved for cleanup.

## F. DISTRICT-PRIORITIZED FEED

Implement or verify the district-first feed:

- A Kannur user sees Kannur posts first, then posts from the other supported districts.
- A Pathanamthitta user sees Pathanamthitta posts first.
- Idukki and Kottayam users receive the same district-priority behavior for their respective districts.
- Within each district group, use the existing intended chronological/approval order.
- Do not expose unpublished, deleted, private or unauthorized content.
- Keep pagination stable and avoid duplicate or missing posts.
- Enforce access and filtering rules securely.
- Ensure the behavior works for both new and existing users.

Test each district separately using non-production test data or staging accounts.

## G. ADMIN DASHBOARD AND EXPERT MANAGEMENT

Inspect and fix these issues:

1. Admin cannot reliably remove an expert's expert status.
2. Admin cannot view expert resumes.
3. User/expert management actions must be properly authorized.
4. Role changes must update all related records consistently.
5. Admin should be able to distinguish farmers, experts and administrators.
6. Preserve auditability where existing functionality supports it.
7. Verify the admin can review expert information and resume attachments securely.
8. Do not expose private resumes through public storage links.
9. Ensure an expert cannot make themselves an admin or bypass approval.

Do not alter or remove genuine expert accounts without my authorization.

## H. EXPERT BROADCAST APPROVAL

Implement or verify this workflow:

1. Experts can submit a proposed broadcast message.
2. A submitted broadcast becomes a pending request.
3. The admin dashboard shows pending expert broadcasts in a clear column or queue.
4. Admin can review the complete proposed message.
5. Admin can approve or dismiss/reject the request.
6. Only approved messages are published to the intended audience.
7. Only an authorized admin can approve the request.
8. Admin-created broadcasts remain dismissible by recipients; do not force an unremovable announcement.
9. Store the relevant status, requester, reviewer and timestamps if supported by the existing architecture.
10. Prevent duplicate publication and unauthorized approval.

Test the full workflow on staging before production deployment.

## I. MESSAGING REQUEST IMPROVEMENTS

Implement or verify:

1. The message-request icon displays a notification dot only when pending requests exist.
2. When no pending requests exist, the dot is hidden.
3. Incoming requests from unconnected users appear in the request section.
4. After the recipient accepts or replies to a request according to the app's intended behavior, the conversation moves to normal messaging.
5. The conversation must no longer appear incorrectly in both the request section and normal inbox.
6. Preserve message history when moving a conversation.
7. Prevent unauthorized access to conversations.
8. Ensure notification counts update correctly on both web and Android.

Do not delete messages or conversation histories to implement this behavior.

## J. SEED USERS AND DEMONSTRATION DATA

I need demonstration accounts for my project presentation, but I also have genuine users that must be preserved.

First inspect the existing seed scripts, accounts and database schema.

The demonstration target from my project notes is 50 seed/demo accounts, excluding genuine accounts that I explicitly choose to preserve. The planned seed distribution is:

- 20 Kannur accounts.
- 20 Pathanamthitta accounts.
- 5 Idukki accounts.
- 5 Kottayam accounts.

The seed set should include 10 experts and the remaining accounts as normal farmer/users. Preserve existing authorized admins; do not count them as ordinary seed accounts unless the original project specification explicitly does so.

Before writing anything to production:
1. Count existing accounts and classify only those that can be identified reliably.
2. Determine whether seed accounts already exist.
3. Inspect foreign-key relationships, posts, bookings, messages and storage records.
4. Calculate the exact additions and any proposed cleanup.
5. Do not create duplicate seed accounts.
6. Do not delete existing genuine users.
7. If cleanup cannot be done safely, leave the questionable records untouched and explain the impact.

Do not run a destructive production seed or cleanup automatically. First rehearse the seed process on staging, then prepare a production-safe, repeatable seed script and report the exact production impact for approval.

### Seed login credentials

For demonstration accounts, generate unique, strong passwords where supported and store the credentials only in a local, Git-ignored file, for example `private/demo-credentials.txt`.

- Ensure the file is excluded from Git.
- Do not commit it, upload it to a public repository, or display its passwords in logs.
- Provide a safe local way for me to view the demo credentials.
- Identify one demonstration expert account and its email/login ID for me.
- Do not use or alter the passwords of genuine users.
- Do not send credentials to the user through an insecure public endpoint.
- If seed users require email confirmation, use a supported, authorized development/admin workflow. Do not fake verification status in production or bypass security.

I will create two genuine user accounts separately using Google Sign-In. Keep those genuine accounts distinct from the demonstration seed accounts.

## K. DEMONSTRATION POSTS

If the seed process is approved and safe, create suitable sample agricultural posts associated with the demo accounts and districts.

Posts should cover realistic topics such as:
- Crop care and cultivation practices.
- Pest and disease observations.
- Irrigation and soil management.
- Harvest experiences.
- Local agricultural questions.

Use clearly identifiable demonstration content. Do not invent genuine testimonials, real farmer success stories, actual expert endorsements or verified consultation outcomes.

Ensure the district-first feed can be demonstrated with multiple posts per district.

## L. TESTING REQUIREMENTS

Run relevant existing tests and add tests where necessary.

Test:
- Email registration and verification behavior.
- Email/password login.
- Google OAuth initiation and callback handling.
- Password recovery.
- Missing/duplicate profiles.
- District validation.
- District-first feed and pagination.
- Admin/expert role protections.
- Resume viewing permissions.
- Expert broadcast approval and rejection.
- Messaging request transition and notification dot.
- Seed script idempotency on staging.
- Build, lint, type checks and regression tests.

Use fake credentials for negative authentication tests. Do not claim a real Google login or email delivery was verified unless it was actually completed.

Do not use production data for destructive testing.

## M. DEPLOYMENT

- Inspect the actual Render service and current deployed commit.
- Confirm which branch and build directory the service uses.
- Build and test locally.
- Review the Git diff for secrets and unrelated modifications.
- Commit focused changes with descriptive messages.
- Push only to the intended branch.
- Deploy if authorized access is available.
- Verify the live website and actual deployed commit.
- Test important routes and check for stale bundles.
- Do not claim a deployment succeeded merely because a commit was pushed.
- If a dashboard approval or manual action is required, complete all independent work first and give the exact remaining action.

Production website:
https://agroconnect-h7nj.onrender.com/

## N. ANDROID PHONE AND APP

Inspect the existing Android project and production package identity.

- Preserve the existing package name and signing configuration.
- Verify the production Supabase configuration.
- Verify Google Sign-In callback/deep-link configuration.
- Build the appropriate APK if possible.
- Do not fabricate or replace the original release keystore.
- If the APK is unsigned, explicitly state that it is not ready for normal production distribution.
- Provide the verified APK artifact path.
- Do not claim the app is installed on my phone unless a real device connection confirms it.
- Include beginner-friendly steps to connect my Android phone to my Mac, enable USB debugging, authorize the computer, install an APK and launch the app.
- Include a manual APK transfer alternative.

## O. COMPLETE BEGINNER HANDOVER

Create `docs/AGROCONNECT_HANDOVER.md` based on the actual repository.

Include:
1. Verified project architecture.
2. GitHub repository, branch and latest commit.
3. How to open the correct local folder.
4. How to inspect status, commit, push, pull and recover safely.
5. How to run the web/admin dashboard locally.
6. How to run the Android app and install it on my phone.
7. How to access Render, inspect logs and deploy.
8. How to access production and staging Supabase safely.
9. Environment variable names only; never include secret values.
10. Google Cloud OAuth setup, callback URLs and testing.
11. Email verification and password-reset configuration.
12. Admin, expert, farmer and seed-account management.
13. Safe seeding and cleanup workflow.
14. How to run tests and diagnose failures.
15. Common authentication, build, deployment and Android issues.
16. A list of incomplete features and manual steps.
17. Exact artifact paths and signing status.
18. A simple daily workflow that I can follow without Claude.

Verify each command, path, branch, callback URL and deployment setting before writing it into the guide. Do not invent values.

## P. FINAL REPORT

At the end, provide a concise report showing:

1. Actual root causes discovered.
2. Changes implemented.
3. Test/build results.
4. Git commits and push status.
5. Render deployment status and deployed commit.
6. Google Sign-In configuration status.
7. Email verification and password recovery status.
8. Expert-management, broadcast and messaging status.
9. Seed-account plan, exact counts and whether production writes were performed.
10. The local path of the demonstration credentials file, if created.
11. The verified demonstration expert login ID; never reveal genuine-user passwords.
12. Android APK path and signing status.
13. Handover document path.
14. Exact remaining manual steps.

Never report unverified success.

START NOW. Inspect the real project first, then implement and test the highest-priority fixes in one continuous run. Preserve genuine accounts and production data.