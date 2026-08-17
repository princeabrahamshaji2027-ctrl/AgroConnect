# PROMPT FOR ANTIGRAVITY — AgroConnect Feature Build & Fixes (per correction-doc pass)

Every item below was checked against the actual current code at the time of this audit — file paths
and behavior described are real, not assumed. Some of these are genuine new features (not bugs) —
they're called out as such so effort is scoped correctly. After implementing all of this, run the app
and admin site and manually test every item in the checklist at the end; do not report this done from
a code read alone.

---

## A. ADMIN — View a user's full profile (currently doesn't exist)

**Current state**: `admin-dashboard/src/pages/Users.jsx` only supports a ban/unban action per row —
there is no way to open a user's full profile at all right now.

**Build**: add a profile detail view — either a modal or a dedicated sub-view — that opens when an
admin clicks a user row (not just the ban button). It should render the same profile data the mobile
app's own `UserProfile.jsx` shows (name, avatar, bio, location, role, post count, their posts), plus
an admin-only action bar with **Ban** (already exists, wire it in here too) and **Delete**. For
Delete: per the existing project rules, prefer disabling/anonymizing over a hard delete when the user
has orders, posts, or reviews attached (hard-deleting cascades and destroys that history) — surface a
confirmation that explains this distinction rather than silently doing a soft-ban when the admin asked
to delete.

**Extend this pattern everywhere**: in `admin-dashboard/src/pages/Posts.jsx` and `Comments.jsx`,
clicking a post or comment should navigate to that actual post (with its comments) rather than just
showing it as a flat table row, and clicking the author's name/avatar within that view should open the
same user-profile view built above. One profile view, reused everywhere an admin can click into a
user, not a separate implementation per page.

---

## B. ADMIN — Duplicate application spam (partially fixed, confirm scope)

Expert applications already have duplicate-prevention (`one_pending_application_per_user` unique
index from an earlier migration) — this part is done, don't rebuild it.

**Sellers are structurally different and don't need the same fix**: `seller_profiles.user_id` already
has a `unique` constraint from the original schema, so a user cannot end up with multiple seller
profile rows — the database already prevents this. If repeated seller-application clicks are still a
problem, it's a UX issue (a confusing raw constraint-violation error on the second click), not a
duplicate-data issue — wrap the insert in `AgroConnect/src/pages/UserProfile.jsx`'s seller-signup
handler with a check: if the insert fails with a unique-violation error, show "You've already applied
to become a seller" instead of a raw error message.

---

## C. ADMIN — Expert resume link doesn't open

**Root cause, verified**: `admin-dashboard/src/pages/Experts.jsx` line ~144 does:
```jsx
<a href={app.cv_file_path} target="_blank" rel="noreferrer">
```
`cv_file_path` is a **storage path** (e.g. `expert-cvs/<uuid>/resume.pdf`), not a real URL — and this
bucket is private (by design, resumes shouldn't be publicly readable). A raw `<a href>` pointing at a
storage path doesn't resolve to anything openable; it needs a signed URL generated on demand.

**Fix**:
```jsx
// replace the static href with an onClick that generates a signed URL first
const handleViewResume = async (path) => {
  const { data, error } = await supabase.storage
    .from('expert-cvs')
    .createSignedUrl(path, 3600); // 1 hour validity
  if (error) { alert('Could not open resume: ' + error.message); return; }
  window.open(data.signedUrl, '_blank');
};

// in the table cell:
{app.cv_file_path ? (
  <button onClick={() => handleViewResume(app.cv_file_path)} className="text-primary-container hover:underline flex items-center gap-1 font-semibold">
    <span className="material-symbols-outlined text-[16px]">file_open</span>
    <span>View Resume</span>
  </button>
) : ...}
```

---

## D. ADMIN — Hamburger menu icon does nothing

**Root cause, verified**: `admin-dashboard/src/components/TopNav.jsx` line 7:
```jsx
<span className="material-symbols-outlined text-on-surface-variant cursor-pointer mr-4">menu</span>
```
Styled as clickable (`cursor-pointer`) but has no `onClick` at all, and `TopNav` doesn't even receive
a prop to control sidebar visibility.

**Fix**: add sidebar collapse state at the `App.jsx` level and thread it through both components.
`admin-dashboard/src/App.jsx`:
```jsx
const [sidebarOpen, setSidebarOpen] = useState(true);
...
<Sidebar activeTab={activeTab} onTabChange={setActiveTab} onLogout={handleLogout} isOpen={sidebarOpen} />
<div className={`flex flex-col flex-1 transition-all ${sidebarOpen ? 'ml-[260px]' : 'ml-0'}`}>
  <TopNav userProfile={profile} onMenuClick={() => setSidebarOpen(o => !o)} />
```
`TopNav.jsx`:
```jsx
<span
  className="material-symbols-outlined text-on-surface-variant cursor-pointer mr-4"
  onClick={onMenuClick}
>menu</span>
```
`Sidebar.jsx`: use the `isOpen` prop to toggle a `-translate-x-full` transform (or conditionally
render) so the sidebar actually hides/shows, and update its own width-dependent siblings accordingly.

---

## E. ADMIN — Add profile picture for the admin account

**Current state**: `TopNav.jsx` displays the admin's avatar from `userProfile.profile_image_path` but
there is no upload control anywhere for the admin to set it.

**Build**: make the admin avatar in `TopNav.jsx` clickable, opening a small profile-settings panel
(or reuse the pattern from the mobile app's `EditProfile.jsx` for image upload/crop) that lets the
logged-in admin upload a photo to the `avatars` storage bucket and update their own `profiles` row.

---

## F. ADMIN — Remove Admins and Activity Logs from the sidebar

`admin-dashboard/src/components/Sidebar.jsx`, delete the `"System"` group entirely (lines 36-41):
```jsx
// delete this whole block
{
  title: "System",
  items: [
    { id: "admins", label: "Admins", icon: "admin_panel_settings" },
    { id: "activity_logs", label: "Activity Logs", icon: "history" }
  ]
}
```
Remove the matching `case 'admins':` and `case 'activity_logs':` branches from
`admin-dashboard/src/App.jsx`'s `renderPage()`, and delete `Admins.jsx` and `ActivityLogs.jsx` from
`admin-dashboard/src/pages/` rather than leaving them as orphaned dead files.

---

## G. ADMIN — Build the Broadcast feature (new feature, not currently built)

**Current state**: a `broadcasts` table and a basic `send_broadcast(title, message, target_role)`
RPC function were designed in an earlier pass, but there is no admin UI for it at all right now, and
the function doesn't support an image, a single specific recipient, or the forced-acknowledgement
"Leave App" button behavior described in the spec.

**Database changes needed** — extend the broadcast function and table:
```sql
alter table public.broadcasts add column if not exists image_path text;
alter table public.broadcasts add column if not exists target_user_id uuid references public.profiles(id);
alter table public.broadcasts add column if not exists action_type text default 'dismissible';
-- action_type: 'dismissible' (Cancel only) or 'forced' (Leave App only, no Cancel)

create or replace function public.send_broadcast(
  p_title text, p_message text, p_image_path text default null,
  p_target_role user_role default null, p_target_user_id uuid default null,
  p_action_type text default 'dismissible'
) returns uuid language plpgsql security definer as $$
declare
  v_broadcast_id uuid;
  v_count int;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;

  insert into public.broadcasts (title, message, image_path, target_role, target_user_id, action_type, sent_by)
    values (p_title, p_message, p_image_path, p_target_role, p_target_user_id, p_action_type, auth.uid())
    returning id into v_broadcast_id;

  insert into public.notifications (user_id, type, message, related_id)
  select id, 'announcement', p_message, v_broadcast_id from public.profiles
  where (p_target_user_id is not null and id = p_target_user_id)
     or (p_target_user_id is null and (p_target_role is null or role = p_target_role));

  get diagnostics v_count = row_count;
  update public.broadcasts set recipient_count = v_count where id = v_broadcast_id;
  return v_broadcast_id;
end;
$$;
```

**Admin UI** (new page, `admin-dashboard/src/pages/Broadcasts.jsx`, and re-add its sidebar entry —
this is a real feature now, unlike Reviews/Banners/Analytics which stay removed): a form with title,
message, optional image upload, a target selector (radio: Everyone / Only Experts / Only Farmers /
Only Sellers / Specific User — the last option reveals a user search-and-select field), and an action
type selector (Dismissible / Forced "Leave App"). Submitting calls `send_broadcast` via
`supabase.rpc(...)`.

**Mobile side**: when a user receives a broadcast notification, `AgroConnect/src/App.jsx` (which
already has a realtime notification listener) should show it as a full-screen or prominent modal
rather than a normal toast, reading `action_type` from the related broadcast row:
- `dismissible`: show a "Cancel" button that just closes the modal, user continues normally.
- `forced`: show only a "Leave App" button; per the spec, no back/cancel/dismiss path — clicking it
  should close the app (`App.exitApp()` from `@capacitor/app` on native, or `window.close()` /
  redirect to a blank state on web where `exitApp` isn't available — note to the user that true
  "force-quit" isn't something a web page can do to itself, only a native app can, so confirm this
  behavior is acceptable on the web build vs the Android build before treating it as fully done there).

---

## H. LOGO — asset not yet in the project

The correction doc references `/AgroConnect/UI/logo/logo-removebg-preview.png`, but this file does
**not exist** in the repository — only `UI/logo/logo.jpg` (the old logo) is present. Do not guess at
a path; this needs the actual new logo file added to `UI/logo/logo-removebg-preview.png` in the
project first. Once it's there, copy it to `src/assets/logo.png` (mobile) and
`admin-dashboard/src/assets/logo.png` (admin) — reuse the same pattern as the original logo copy step
from `Rules.md` — and update every import currently pointing at `logo.jpg` in both apps to point at
this new file instead (`Sidebar.jsx`, `Login.jsx`, `Splash.jsx`, and anywhere else `logoImg` is
imported).

---

## I. "COMING SOON" placeholders

Build one small reusable component rather than repeating a modal in five places:

`admin-dashboard/src/components/ComingSoon.jsx` (and an equivalent in mobile `src/components/`):
```jsx
export default function ComingSoon({ feature }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
      <span className="material-symbols-outlined text-[48px] text-primary-container">schedule</span>
      <p className="font-headline-lg-mobile text-on-surface">{feature} — Coming Soon</p>
      <p className="font-body-sm text-on-surface-variant">This feature is still in development and will be available in a future update.</p>
    </div>
  );
}
```
Apply it to:
- `admin-dashboard/src/App.jsx`: `case 'products':`, `case 'orders':`, and `case 'categories':` —
  render `<ComingSoon feature="Marketplace Management" />` instead of the real `Products`/`Orders`/
  `Categories` components for now (keep the sidebar entries visible so admins know it's planned, per
  the doc's own instruction to show "coming soon" rather than hide it entirely).
- `AgroConnect/src/pages/UserProfile.jsx` lines ~348 and ~354: replace the "Become a Seller" button's
  `onClick={handleBecomeSellerClick}` with a handler that opens the ComingSoon message instead
  (a simple `Dialog` with just this content works fine here, doesn't need a full page).

---

## J. NOTIFICATIONS — expert-approval redirect

Confirm the general tap-to-navigate mechanism (built in an earlier pass) correctly handles the
`type: 'announcement'` case specifically for expert approvals: when
`approve_expert_application` fires, the notification it creates for that user should carry a
`related_id` pointing at their own `profiles.id` (not the application id, which the user can't do
anything with), so tapping it in `AgroConnect/src/pages/Notifications.jsx` navigates to their own
`UserProfile` screen and they can see their new verified badge immediately. Check
`approve_expert_application`'s notification insert (if it doesn't currently create one at all, add
it) and set `related_id` accordingly.

---

## K. SPLASH ANIMATION — not filling the screen

**Root cause, verified**: `src/index.css` sets `body { height: 100vh }`, but `#root` (React's mount
element, and the direct ancestor of everything the app renders, including `.splash-container`) has
**no height rule anywhere in the codebase**. Since `.splash-container` in `src/pages/pages.css` uses
`height: 100%`, and percentage heights only resolve against an ancestor with an actual set height,
this chain breaks at `#root` — it defaults to auto/content-sized, so the splash content doesn't
actually fill the viewport.

**Fix** — `src/index.css`, add:
```css
#root {
  height: 100%;
  width: 100%;
}
```
Additionally, the Lottie animation itself may still visually letterbox (show empty bars) if its
source animation's aspect ratio doesn't match the phone screen, since Lottie's default SVG rendering
preserves aspect ratio by fitting-within rather than filling. In `src/pages/Splash.jsx`, add renderer
settings to crop-to-fill instead:
```jsx
<Lottie
  animationData={splashAnimation}
  loop={false}
  onComplete={handleAnimationEnd}
  style={{ width: '100%', height: '100%' }}
  rendererSettings={{ preserveAspectRatio: 'xMidYMid slice' }}
/>
```

---

## L. CONNECT/FOLLOW FEATURE — new feature, not a bug

This does not exist anywhere in the current codebase — no `followers` table, no connect button, no
connection count. It was previously scoped out as unused; this document gives a concrete spec for it,
so build it now as new work, not a fix.

**Schema**:
```sql
create table public.followers (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (follower_id <> following_id),
  unique (follower_id, following_id)
);
alter table public.profiles add column if not exists follower_count int not null default 0;

-- trigger to keep follower_count in sync, same pattern as like_count/comment_count
create or replace function public.update_follower_count() returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update public.profiles set follower_count = follower_count + 1 where id = new.following_id;
  elsif TG_OP = 'DELETE' then
    update public.profiles set follower_count = follower_count - 1 where id = old.following_id;
  end if;
  return null;
end;
$$;
create trigger followers_count_trigger
  after insert or delete on public.followers
  for each row execute function public.update_follower_count();

alter table public.followers enable row level security;
create policy "followers_select" on public.followers for select using (true);
create policy "followers_insert" on public.followers for insert using (follower_id = auth.uid());
create policy "followers_delete" on public.followers for delete using (follower_id = auth.uid());
```

**UI**: on `UserProfile.jsx`, show `follower_count` where the spec's UI mockup shows "11" connections,
and a Connect button next to posts by other users in `Feed.jsx` (top-right of each post card, per the
spec) that inserts/deletes a `followers` row on click and swaps its own label between "Connect" and
"Connected ✓" based on whether a row already exists for `(auth.uid(), post.user_id)`.

---

## M. BOTTOM NAV — rename "Connect" to "Catch Up"

`AgroConnect/src/components/NavBar.jsx` line 8:
```jsx
// before
{ id: 'connect', label: 'Connect', icon: 'handshake' },

// after — keep the id and icon the same, only the label changes
{ id: 'connect', label: 'Catch Up', icon: 'handshake' },
```
Don't rename the `id` — other code likely branches on `activeTab === 'connect'`; renaming the id would
break that routing for no reason. Only the visible label changes.

---

## N. CATCH UP (consultation booking) — availability & slot-locking

Confirm/build against this spec in `AgroConnect/src/pages/Connect.jsx`:
- Experts need a "Manage Availability" flow (per the doc's mockup) to select available days, then add
  one or more time slots per day, each slot minimum 1 hour, with a rate attached — this maps to the
  `consultation_slots`-style data your experts already have some booking logic around; confirm slots
  are stored with `expert_id`, `date`, `start_time`, `end_time` (1 hour apart), `rate`, and an
  `is_booked` boolean.
- When a farmer books a slot, that slot must flip to booked/unavailable for everyone else immediately
  — enforce this with a unique constraint or a status check at the database level (not just hiding it
  client-side), so two farmers can't both book the same slot in a race:
```sql
-- if not already present on the slots table:
alter table public.consultation_slots add column if not exists is_booked boolean not null default false;
create unique index if not exists one_booking_per_slot on public.consultation_bookings(slot_id) where status != 'Cancelled';
```
- Booked slots render greyed-out/disabled in the date picker UI shown to other farmers, matching the
  spec's mockup.

---

## O. PROFILE PICTURE — confirm the earlier fix actually covers editing, not just the default

An earlier pass already consolidated the *default* placeholder avatar into one shared constant across
both apps. Confirm this pass also covers the *user-editable* path end to end: `EditProfile.jsx`'s
upload should write to the `avatars` storage bucket and update `profiles.profile_image_path`, and
every screen that renders a user's avatar (`Feed.jsx`, `Chat.jsx`, `UserProfile.jsx`, `Search.jsx`,
`Connect.jsx`, and the admin pages) should be reading `profile_image_path` live from the `profiles`
table (via join or direct fetch), not from any cached/local copy — if any screen still caches an
avatar URL at load time and doesn't refresh after the user changes their photo, that's the same class
of bug as before and needs the same fix (read from the live joined column, not a stale local value).

---

## VERIFICATION — test all of this, don't just read the code back

- [ ] Admin can click into a user and see their full profile with working Ban/Delete
- [ ] Clicking a post/comment in the admin panel opens that exact post, not just a table row
- [ ] Expert resume opens immediately in a new tab when clicked
- [ ] Hamburger menu actually hides/shows the sidebar
- [ ] Admin can upload their own profile photo and see it reflected in the top nav
- [ ] Admins and Activity Logs are gone from the sidebar and unreachable
- [ ] Admin can send a broadcast with an image to a specific user, a role, or everyone, and the
      "Leave App" forced type genuinely can't be dismissed any other way
- [ ] New logo file exists in the repo and renders everywhere the old one did
- [ ] Products/Orders/Categories (admin) and Become a Seller (mobile) show "Coming Soon" instead of a
      real flow
- [ ] Tapping an expert-approval notification opens the user's own profile
- [ ] Splash animation fills the entire screen edge to edge on an actual phone, not just in a browser
- [ ] Connect button appears on other users' posts, toggles to "Connected ✓", and profile connection
      counts update correctly and match reality (test with 2-3 test accounts connecting to one user)
- [ ] Bottom nav shows "Catch Up" label; tapping it still opens the same screen as before
- [ ] Two test farmer accounts attempting to book the same expert time slot — only one succeeds, the
      other sees it as unavailable
- [ ] Changing your profile photo in Edit Profile immediately reflects on every other screen without
      needing to log out and back in