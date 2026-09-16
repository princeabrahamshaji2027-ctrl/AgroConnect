# AgroConnect — Connect Page Completion: Audit & Master Implementation Prompt

**Repository inspected**: `https://github.com/princeabrahamshaji2027-ctrl/AgroConnect.git`
(local clone, `main` branch, HEAD `ff3d94c`, 13 commits, clean working tree, single remote
`origin`.) **Client document inspected**: `Prompt_f.pdf` ("Connect page completion").
Every finding below was verified by opening the actual file and line — nothing here is
inferred from the PDF alone. Where the PDF describes something I could not locate in the
repository, that is stated explicitly rather than assumed to exist.

---

# SECTION A — AUDIT FINDINGS

## 1. Current architecture (recap, relevant to this change only)

`src/pages/Connect.jsx` (1,718 lines) is the single file that implements **everything** this
change request touches: the sub-tab bar (`Book Expert / Upcoming / History / Join Lobby /
Reviews / Shop / Manage Availability`), the booking calendar, the expert's availability
builder, and the video-call screen. There is no router — `activeSubTab` is a local
`useState` string. The admin side lives in `admin-dashboard/src/pages/Appointments.jsx` and
`admin-dashboard/src/pages/Meetings.jsx`, two **separate, non-identical** admin pages that
both relate to meetings (see Finding 6).

## 2. Requirements extracted from the PDF, mapped to actual code state

| # | Requirement (from PDF) | Current state found in repo | Status |
|---|---|---|---|
| R1 | Expert's Connect page should show **Upcoming** first (ordered), or if empty, a button to Manage Availability | `Connect.jsx` line 79: `useState('book')` — every user, expert or not, lands on **Book Expert** tab. No role-based default exists. | ❌ MISSING |
| R2 | Remove the "History" filter/tab from the top row (it will live inside a 3-bar menu instead) | `Connect.jsx` lines 767–772: a `History` chip exists in the always-visible top row. **No 3-bar menu exists anywhere in the codebase** — confirmed by grepping for the exact menu item text visible in the client's screenshot (`Customize Availability`, `Meeting History`, `Expert Profile`, `Leave Expert Mode`): zero matches in `src/`. | ❌ MISSING (the removal *and* its replacement) |
| R3 | Top "filter options": expert can filter across meetings and arrange meetings with **other experts** | Zero filter UI of any kind found in `Connect.jsx` (grepped for `filter` outside of array `.filter()` calls — no results). Expert-to-expert meetings are not representable in the schema: `consultation_bookings.farmer_id` is a foreign key to `farmer_profiles`, not `experts` — an expert has no `farmer_profiles` row by default, so two experts cannot book each other today without a schema change. | ❌ MISSING — this is a net-new feature, not a bug fix |
| R4 | Calendar shows only dates the expert marked available; selecting a date auto-fills the booking form | `Connect.jsx` lines 888–930: `hasAvailableSlots` is computed live from `expertSlots`/`is_booked`, and the date cell's `onClick` calls `setBookingDate(cell.dateStr)`. | ✅ MOSTLY COMPLETE — but see Finding 4 (race condition) for why this is not fully reliable |
| R5 | Clicking the time field shows pre-marked slots, not a manual clock | `Connect.jsx` lines 1596–1633 does this correctly **when `availableSlots.length > 0`**. But lines 1636–1651 fall back to native `<InputField type="date">` / `<InputField type="time">` whenever `availableSlots.length === 0` — i.e. exactly when an expert has never added a single slot, the app lets a farmer type in *any* arbitrary date/time with zero validation against real availability. | ⚠️ PARTIALLY IMPLEMENTED — the fallback path directly contradicts the requirement |
| R6 | Once booked, that time slot "vanishes" from the expert's slots for other users | `Connect.jsx` line 1611–1628: a booked slot is **not removed from the list** — it's still rendered, just greyed out (`opacity: 0.45`) with a "Booked (Unavailable)" label and `cursor: not-allowed`. | ⚠️ AMBIGUOUS / DIFFERS FROM LITERAL WORDING — functionally unbookable either way, but visually still present. Needs client confirmation on which behaviour is wanted (see Section B, AC-004). |
| R7 | Whole day greys out for **all users** once every slot that day is booked | `Connect.jsx` lines 897–899: `unbookedOnDate = dateSlots.filter(s => !s.is_booked)`; if empty, the cell renders muted/disabled. Because `is_booked` is a real column read fresh from Postgres on every `handleBookClick`, this is already global — any user who opens that expert's calendar sees the same greyed day. The Ramu/Shiva example in the PDF is **already the actual, correct behaviour of this code**. | ✅ COMPLETE — no change needed; worth telling the client this already works |
| R8 | User page: the "Catch Up" title/Pea AI header hides the filter/tab row underneath it | Root cause found precisely: `src/index.css` line 158, `.glass-header { position: absolute; top:0; ... }` with **no `z-index`**. `Connect.jsx` line 749 pushes the tab row down with `marginTop: 'var(--header-height)'` only — it omits `+ var(--safe-top)`, while `src/index.css` line 92 shows the *correct* pattern used elsewhere in the app: `padding-top: calc(var(--header-height) + var(--safe-top))`. On any device where `--safe-top` (the notch/status-bar inset) is non-zero, the tab row sits exactly `--safe-top` pixels too high and is covered by the absolutely-positioned header. | ❌ CONFIRMED CSS BUG, root cause identified |
| R9 | "Fix the nav bar, it should navigate properly" | The global bottom `NavBar.jsx` (`Feed / Search / Catch Up / Chat / Profile`) was inspected line-by-line and its click handling is correct and simple — `onClick={() => onTabChange(tab.id)}`, no bug found. Given this line appears directly under the header-overlap complaint in the PDF, the more likely reading is that it refers to the **same Connect-page tab row** being visually blocked by Finding R8, which would look like "navigation doesn't work" even though the click handlers themselves are fine. | ⚠️ INFERRED — flagged as an assumption; confirm with client before implementing a fix to the wrong component |
| R10 | Admin panel: meeting details visible and controllable under "Meetings"; reviews of meetings visible to admin | See Finding 6 below — two different, inconsistent admin pages exist, and Reviews has no admin page at all. | ❌ MISSING / BROKEN |

## 3. Bugs discovered independently of the PDF (found while tracing the above)

**Finding 4 — Race condition between the calendar's date filter and the async slot fetch.**
`Connect.jsx`, the calendar date cell's `onClick` (line ~896):
```javascript
onClick={() => {
  if (hasAvailableSlots) {
    handleBookClick(exp);              // async — awaits a Supabase query
    setBookingDate(cell.dateStr);
    setAvailableSlots(dateSlots);       // synchronous — runs immediately
  }
}}
```
`handleBookClick` (line 348) is `async` and its own `setAvailableSlots(slots || [])` (line
361) only runs *after* its `await supabase.from('consultation_slots').select(...)` resolves.
Because the synchronous `setAvailableSlots(dateSlots)` on the line right after fires and
completes before that network round-trip finishes, `handleBookClick`'s internal
`setAvailableSlots` call **always wins and runs last**, overwriting the correctly
date-filtered `dateSlots` with the expert's *entire, unfiltered* slot list moments later.
This is a genuine, deterministic bug (not a timing coincidence) — it directly undermines
R4/R5's requirement that tapping a date shows only that date's slots.

**Finding 5 — Manual date/time fallback bypasses the entire slot system.** Already covered
under R5 above; restated here because it is independently a data-integrity concern, not
just a UX mismatch: a booking submitted through that fallback path has no `slot_id`, so
`handleConfirmBooking`'s existing race-condition protection (the unique constraint on
`consultation_slots`, confirmed in the prior audit of this repo) never applies to it.

**Finding 6 — Two inconsistent, overlapping admin "meetings" pages.**
- `admin-dashboard/src/pages/Appointments.jsx` — a real, properly built table reading
  `consultation_bookings` joined to expert/farmer names, with columns Expert/Farmer/Date/
  Time/Status. **Read-only — no action buttons at all**, so even this page doesn't give the
  admin any "control" as the PDF requires.
- `admin-dashboard/src/pages/Meetings.jsx` — a generic stub that reads the **`video_meetings`**
  table and renders each row as `JSON.stringify(item).substring(0, 300)` — raw, truncated
  JSON text, no columns, no names, no actions whatsoever.
- Both are separate items in `Sidebar.jsx` (lines 33–34: `"appointments"` and `"meetings"`).
- **There is no admin page for `reviews` at all** — no `Reviews.jsx` file exists in
  `admin-dashboard/src/pages/`, and no `"reviews"` entry exists in `Sidebar.jsx`'s nav array.
  The PDF's "all reviews of the meetings should be visible to admin" requirement is
  currently **entirely unimplemented**, not merely incomplete.

## 4. Requirements compliance matrix (quick reference)

| Req | Status | Effort |
|---|---|---|
| R1 — Expert-first tab default | ❌ Missing | Small |
| R2 — Remove History chip + build 3-bar menu | ❌ Missing (both halves) | Medium |
| R3 — Filter + expert-to-expert meetings | ❌ Missing, needs schema work | Large |
| R4 — Calendar shows only marked dates | ✅ Done, undermined by Finding 4 | Small (fix the race) |
| R5 — Slot-only time selection | ⚠️ Partial (fallback contradicts it) | Small–Medium |
| R6 — Booked slot "vanishes" | ⚠️ Ambiguous, needs client answer | Small once decided |
| R7 — Day greys out globally | ✅ Already correct | None |
| R8 — Header overlaps filter row | ❌ Confirmed CSS bug | Small |
| R9 — Nav bar doesn't navigate | ⚠️ Likely same as R8, unconfirmed | None until confirmed |
| R10 — Admin Meetings + Reviews | ❌ Missing/broken | Medium–Large |

## 5. Priority

- **P1 (blocks the client's stated acceptance)**: R1, R2, R8, R10 (Meetings half), Finding 4.
- **P2**: R5 fallback removal, R10 (Reviews half), R6 (once clarified).
- **P3 / needs scoping conversation before building**: R3 (expert-to-expert meetings is a
  new feature with schema implications, not a bugfix — flag this to the client explicitly
  rather than silently building a guessed version of it, per the "don't invent scope" rule
  this project's own `Rules.md` (§5) already states).

---

# SECTION B — MASTER IMPLEMENTATION PROMPT
*(Copy everything below into a new Claude Code session.)*

```text
You are taking over the existing AgroConnect repository as a senior full-stack engineer.
Repository: https://github.com/princeabrahamshaji2027-ctrl/AgroConnect.git (branch: main).
Read AgroConnect/Rules.md in full before making any change — it is binding project policy
(Supabase is the entire backend, no separate server; RLS required on every table; multi-table
writes go through a single Postgres RPC; schema changes need explicit confirmation before
being applied; UI must match existing design tokens, never introduce new ones).

## PROJECT CONTEXT

AgroConnect is a React 19 + Vite mobile app (Capacitor-wrapped for Android) plus a separate
React + Tailwind admin dashboard, both talking directly to one shared Supabase project
(Postgres + Auth + Storage + Realtime), with no custom backend server. The feature at the
center of this task is "Connect" — src/pages/Connect.jsx (1,718 lines) — where farmers book
paid video consultations with verified agricultural experts through a calendar of
expert-marked time slots (consultation_slots, consultation_bookings tables).

## CURRENT IMPLEMENTATION (verified, not assumed)

- src/pages/Connect.jsx holds a single `activeSubTab` state (line 79) defaulting to 'book',
  shared by every user regardless of role, rendering a top chip row: Book Expert / Upcoming
  / History / Join Lobby / Reviews / Shop, plus "Manage Availability" only when
  `isCurrentExpert` is true (line 795).
- The booking calendar (lines ~888-930) already correctly shows only dates with
  `unbookedOnDate.length > 0`, sourced live from the `is_booked` column on
  `consultation_slots` — this part is real-time-consistent across all users already; do not
  rewrite this logic, only fix the race condition described below.
- handleBookClick (line 348) is async and fetches ALL of an expert's slots
  (`.eq('expert_id', expert.id)`, no date filter) into `availableSlots`.
- The calendar date cell's onClick (line ~896) calls the async handleBookClick without
  awaiting it, then synchronously calls setBookingDate + setAvailableSlots(dateSlots) right
  after — creating a race where handleBookClick's own, later-resolving setAvailableSlots
  call overwrites the date-filtered list with the full unfiltered one.
- When availableSlots is empty, lines 1636-1651 fall back to native
  <InputField type="date"> / <InputField type="time"> — an unrestricted manual entry path
  with no ties to real expert availability and no slot_id, bypassing the unique-constraint
  protection that handleConfirmBooking otherwise relies on.
- .glass-header (src/index.css line 155) is `position: absolute` with no z-index. The
  Connect.jsx tab row (line 749) is pushed down with `marginTop: 'var(--header-height)'`
  only, omitting `+ var(--safe-top)` — the correct pattern already used elsewhere via
  `.page-container`'s `padding-top: calc(var(--header-height) + var(--safe-top))`
  (src/index.css line 92). This causes the header to overlap the tab row on devices with a
  nonzero safe-area inset.
- No 3-bar/hamburger menu component exists anywhere in src/ containing "Customize
  Availability / Meeting History / Expert Profile / Leave Expert Mode" — this UI must be
  built from scratch; it is not a modification of existing code.
- No filter control of any kind exists in Connect.jsx.
- Expert-to-expert meetings are not representable today: consultation_bookings.farmer_id is
  a foreign key to farmer_profiles, which an expert-only account does not have a row in.
- admin-dashboard/src/pages/Appointments.jsx is a working, read-only table over
  consultation_bookings (Expert/Farmer/Date/Time/Status columns, no actions).
- admin-dashboard/src/pages/Meetings.jsx is a generic stub rendering raw, truncated
  (300-char) JSON.stringify() output of the video_meetings table — not a real UI.
- There is no admin-dashboard/src/pages/Reviews.jsx and no "reviews" entry in
  admin-dashboard/src/components/Sidebar.jsx (which currently only has "appointments" and
  "meetings", lines 33-34).

## REQUIRED CHANGES

### AC-001
Priority: P1
Requirement: When the logged-in user is the expert viewing their own Connect page, the tab
should default to Upcoming instead of Book Expert. If they have zero upcoming appointments,
show a prominent button/empty-state that navigates to the Manage Availability tab instead of
an empty list.
Current behavior: `useState('book')` (Connect.jsx line 79) is the default for every user.
The existing Upcoming empty state ("No scheduled meetings...") at line ~1386 has no button.
Problem: No role-aware default tab exists; the empty state is a dead end for a new expert
who hasn't set availability yet.
Files to modify: src/pages/Connect.jsx.
Backend changes: none.
Frontend changes: Initialize activeSubTab conditionally once isCurrentExpert is known (this
requires restructuring the initial-load effect so the expert-status check resolves before
first render decides the tab, or defaulting to 'book' and switching to 'upcoming' in a
useEffect once isCurrentExpert becomes true and appointments have loaded). In the Upcoming
empty state, when isCurrentExpert is true and appointments.length === 0, render a button
"Set Your Availability" that calls setActiveSubTab('availability').
Database changes: none.
API changes: none.
Validation: n/a.
Security: none additional.
UI behavior: Farmers' default tab (Book Expert) is unchanged — this only affects the
expert's own view of their Connect page.
Acceptance criteria:
- Logging in as a verified expert and opening Connect lands on the Upcoming tab, not Book Expert.
- An expert with 0 upcoming appointments sees a "Set Your Availability" button that switches to Manage Availability.
- Farmers' default tab is unaffected.

### AC-002
Priority: P1
Requirement: Remove the "History" chip from the top tab row; instead expose Meeting History
(plus Customize Availability, Expert Profile, Leave Expert Mode) inside a new 3-bar/hamburger
menu, matching the client's provided screenshot layout, reachable only from the expert's own
Connect page.
Current behavior: History is a permanent top-row chip (Connect.jsx lines 767-772,
content block at line ~1432). No hamburger menu exists anywhere in the app.
Problem: Duplicated access to the same feature (top row vs. planned menu) once the menu is
built; the menu itself doesn't exist yet.
Files to modify: src/pages/Connect.jsx (remove the History chip only for the expert view;
keep 'history' as a valid activeSubTab value since the content panel is reused by the new
menu item), src/components/Header.jsx (or a new component — see below) to add the menu
trigger icon.
Files to create: src/components/ExpertMenuSheet.jsx — a new component built on the existing
src/components/BottomSheet.jsx pattern already used elsewhere in this codebase (reuse it,
don't invent a new sheet primitive, per Rules.md 2.4). It should render exactly four rows:
Customize Availability (→ setActiveSubTab('availability')), Meeting History (→
setActiveSubTab('history')), Expert Profile (→ existing profile navigation callback), Leave
Expert Mode (→ existing "leave expert mode" handler if one exists in UserProfile.jsx/App.jsx;
if none exists, flag this back to the user rather than inventing the behavior — Rules.md 5.1).
Backend changes: none.
Frontend changes: Add a 3-bar icon button to the Connect page header, visible only when
isCurrentExpert is true, opening ExpertMenuSheet. Remove the History chip from the
always-visible top row for the expert view only (farmers should keep whatever their own top
row shows, per Rules.md — do not touch farmer-side UI you weren't asked to touch).
Database changes: none.
API changes: none.
Validation: n/a.
Security: none additional — this is a display/navigation change only.
UI behavior: Icon button in the header (expert view only) → opens bottom sheet → each row
navigates and closes the sheet. Match existing button/icon styling tokens already used in
Header.jsx and BottomSheet.jsx — do not introduce new colors/fonts.
Acceptance criteria:
- Expert view: History chip no longer appears in the top row.
- Expert view: tapping the new 3-bar icon opens a sheet with exactly the four listed items.
- Tapping Meeting History in the sheet shows the same content the old History tab showed.
- Farmer view of Connect is unchanged by this task.
- "Leave Expert Mode" either wires to a real, existing handler, or is reported back as
  needing clarification — do not stub it silently.

### AC-003
Priority: P3 — flag to client before building; do not implement blind
Requirement: Top "filter options" let an expert filter across their meetings and arrange
meetings with other experts.
Current behavior: No filter UI exists anywhere in Connect.jsx. Expert-to-expert meetings are
not representable in the current schema (consultation_bookings.farmer_id references
farmer_profiles, which an expert-only account has no row in).
Problem: This is new scope, not a bug — building it requires a real design/scoping decision
(what fields does the filter operate on? date range, status, other-expert search? does an
expert need a farmer_profiles row created to book another expert, or does this need a new
join table like expert_meetings?).
Files to modify / create: do not create files for this yet.
Database changes: likely required (new join table or a nullable alternate foreign key on
consultation_bookings) — per Rules.md 4.1, propose this change and get explicit confirmation
before touching the schema.
Acceptance criteria: N/A until scoped. Output of this step should be a short written proposal
(filter fields + how expert-to-expert booking would work) presented back to the client for a
yes/no before any code is written.

### AC-004
Priority: P1
Requirement: Selecting a date auto-fills the booking form; the time field shows only the
expert's pre-marked slots; a booked slot updates so other users can't double-book it; a fully
booked day greys out for all users.
Current behavior: Date auto-fill already works (Connect.jsx line ~900,
`setBookingDate(cell.dateStr)`). Day-level greying already works correctly and is already
global/DB-driven (lines 897-899) — do not change this logic, it matches the requirement
exactly as-is. However, a race condition (see below) intermittently replaces the
date-filtered slot list with the expert's full, unfiltered slot list.
Problem — exact root cause: The date cell's onClick (line ~896) calls the async
handleBookClick(exp) without awaiting it, then immediately calls setAvailableSlots(dateSlots)
synchronously. handleBookClick's own internal setAvailableSlots(slots || []) (line 361) runs
after its Supabase query resolves, which is always later than the synchronous call right
after it in the same click handler — so it always wins and overwrites the correct,
date-filtered slot list with every slot the expert has, across all dates.
Files to modify: src/pages/Connect.jsx.
Frontend changes: Refactor so the date-filtering happens after handleBookClick's fetch
resolves, not in a fire-and-forget race against it. Concretely: extract the slot-fetching
part of handleBookClick into a function that returns the fetched slots (or await it directly
in the onClick, since it's already async), then derive dateSlots from the *returned* data and
call setAvailableSlots with that single, correctly-filtered result — never call
setAvailableSlots twice for the same interaction. Example shape (adapt to existing code, do
not paste blindly):
  const onDateCellClick = async () => {
    if (!hasAvailableSlots) return;
    setSelectedExpert(exp);
    setBookingDate(cell.dateStr);
    const { data: slots } = await supabase.from('consultation_slots').select('*')
      .eq('expert_id', exp.id).order('slot_date').order('start_time');
    setAvailableSlots((slots || []).filter(s => s.slot_date === cell.dateStr));
  };
Database changes: none.
API changes: none.
Validation: n/a.
Acceptance criteria:
- Tapping an available date shows ONLY that date's slots, consistently, every time (test at
  least 10 repeated taps across different dates to rule out the race reappearing under load).
- The previously-correct global day-greying behavior (R7) still works identically after this change.

### AC-005
Priority: P2
Requirement: The time column must never show a manual clock/date entry — only pre-marked slots.
Current behavior: Connect.jsx lines 1636-1651 fall back to `<InputField type="date">` /
`<InputField type="time">` whenever availableSlots.length === 0 (i.e., the expert has never
added any slot at all).
Problem: This directly contradicts the requirement and lets a booking be created with no
slot_id, bypassing the existing unique-constraint-based double-booking protection entirely.
Files to modify: src/pages/Connect.jsx.
Frontend changes: Replace the fallback block with a disabled/empty state, e.g. "This expert
hasn't published their availability yet — check back soon," with no input fields and the
Confirm Booking action disabled. Do not allow a booking to be created without a real
selectedSlot from here forward.
Database changes: none required, but confirm no other code path still inserts a
consultation_bookings row with slot_id: null before removing this fallback (grep the file
for `slot_id ? selectedSlot.id : null` — line ~522 in handleConfirmBooking currently allows
a null slot_id; once this fallback is removed, tighten handleConfirmBooking to require a
selectedSlot and reject submission otherwise).
API changes: none (client-side only).
Acceptance criteria:
- An expert with zero slots shows the new empty state, not date/time inputs.
- Confirm Booking cannot be pressed without a selected real slot, for any expert.
- Existing bookings with a slot_id are unaffected.

### AC-006
Priority: P2 — needs one clarifying question before implementation
Requirement: "Once the user finalises the time, that time slot vanishes from that expert's
time slots."
Current behavior: A booked slot remains visible in the slot list, shown disabled/greyed with
a "Booked (Unavailable)" label (Connect.jsx lines 1611-1628).
Ambiguity: The PDF's literal wording ("vanishes") could mean either (a) hide booked slots
entirely from the list, or (b) the current disabled/greyed display, which already makes it
unbookable. Confirm which is wanted with the client before changing this — do not guess.
Files to modify (if (a) is chosen): src/pages/Connect.jsx — filter availableSlots to exclude
slots where is_booked === true before rendering the slot grid, rather than rendering all and
styling booked ones as disabled.
Acceptance criteria (once confirmed): matches whichever of (a)/(b) the client picks; write
the corresponding test for that choice.

### AC-007
Priority: P1
Requirement: Fix the header hiding the filter/tab row on the user/farmer Connect page.
Current behavior: .glass-header (src/index.css line 155) is position: absolute with no
z-index; Connect.jsx's tab row (line 749) uses marginTop: 'var(--header-height)' only,
omitting + var(--safe-top), unlike the correct existing pattern at src/index.css line 92
(padding-top: calc(var(--header-height) + var(--safe-top))).
Problem: On devices with a nonzero safe-area inset, the header visually overlaps the top of
the tab row.
Files to modify: src/pages/Connect.jsx (the inline style at line ~749), OR src/index.css if
you introduce a shared class instead of an inline style — prefer reusing the existing
`.page-container` padding-top pattern already used correctly elsewhere in the app (Rules.md
2.4: reuse existing structure rather than inventing a new one).
Frontend changes: Change `marginTop: 'var(--header-height)'` to
`marginTop: 'calc(var(--header-height) + var(--safe-top))'` (or move the tab row inside a
container that already uses the correct `.page-container` padding-top rule). Also add an
explicit z-index to the tab row lower than any modal/sheet content but confirm it renders
above `.glass-header` by testing on a device/emulator with a simulated notch (non-zero
--safe-top) — do not just check on a desktop browser where --safe-top is 0 and the bug is
invisible.
Database changes: none.
Acceptance criteria:
- On a simulated device with a non-zero safe-area inset (e.g. Capacitor's status bar plugin
  or an iPhone-notch emulator), the tab row is fully visible immediately below the header,
  with no overlap, in both farmer and expert views.
- Desktop/no-notch rendering is unchanged (this fix must not regress the already-working
  zero-inset case).

### AC-008
Priority: P2 — depends on AC-007's outcome; do not act until confirmed with the client
Requirement: "Fix the nav bar, it should navigate properly."
Current behavior: src/components/NavBar.jsx (the global bottom Feed/Search/Catch Up/Chat/
Profile bar) was inspected in full — its click handling (`onClick={() => onTabChange(tab.id)}`)
is correct; no bug found there from source.
Problem: This requirement most likely refers to the same Connect-page tab row being visually
blocked by AC-007 (which would make tapping it look like "navigation doesn't work" even
though the handlers are fine), not the global bottom nav bar.
Required action: After implementing AC-007, re-test navigation on the Connect page tab row
specifically. Do not modify src/components/NavBar.jsx unless a concrete, reproduced bug is
found there independently — ask the client to confirm which nav bar they meant if the AC-007
fix does not resolve their complaint.
Acceptance criteria: Tapping every tab in the Connect page tab row reliably switches
activeSubTab and is immediately clickable/visible with no dead zone, on the same device
configuration used to verify AC-007.

### AC-009
Priority: P1
Requirement: Meeting details must be visible and controllable in the admin panel under
"Meetings"; reviews of meetings must also be visible to admin.
Current behavior: admin-dashboard/src/pages/Appointments.jsx is a working read-only table
over consultation_bookings with no action buttons. admin-dashboard/src/pages/Meetings.jsx is
a generic stub dumping raw, truncated JSON from video_meetings. No Reviews page or sidebar
entry exists at all.
Problem: Two separate, inconsistent "meetings" surfaces exist and neither gives the admin
any control; reviews are entirely unimplemented on the admin side.
Files to modify: admin-dashboard/src/pages/Meetings.jsx (rebuild), 
admin-dashboard/src/components/Sidebar.jsx (add a Reviews nav entry).
Files to create: admin-dashboard/src/pages/Reviews.jsx.
Backend changes: Determine (and confirm with the client) whether "Meetings" should now show
video_meetings (call records) or actually be merged with the existing, better-built
Appointments.jsx (consultation_bookings). Recommendation to propose to the client: keep
Appointments.jsx as the source of truth for booking records, and rebuild Meetings.jsx to show
the same consultation_bookings data joined with video_meetings (call start/end/duration) plus
admin actions (Cancel booking, Mark completed) — since "control it" implies real actions, not
just another read-only table. Any multi-table admin write here (e.g. cancelling a booking AND
freeing its consultation_slots.is_booked flag) must go through a single Postgres RPC per
Rules.md 3.4 — do not wire two sequential client-side writes.
Frontend changes: Rebuild Meetings.jsx using the same table pattern already proven in
Appointments.jsx (reuse its structure per Rules.md 2.4) — real columns (Expert, Farmer, Date,
Time, Status, Call Duration if available), not JSON dumps. Add action buttons (Cancel,
Mark Completed) wired to the new RPC. Build Reviews.jsx following the same table pattern,
reading the `reviews` table joined to expert/farmer profile names, star rating, and comment
text, read-only unless the client confirms admin needs to delete/hide individual reviews (if
so, that delete must also be RLS/RPC-backed, not a raw client-side delete call).
Database changes: A new RPC (e.g. `admin_update_booking_status`) if action buttons are added,
following the existing pattern of approve_expert_application etc. Propose the exact SQL to
the client before applying it, per Rules.md 4.1.
API changes:
  METHOD: rpc call
  PATH: rpc('admin_update_booking_status')
  AUTH: required, admin role only (mirror the is_admin() pattern already used for
        profiles RLS)
  REQUEST: { booking_id, new_status }
  RESPONSE: { success } or an error
  ERRORS: 403 if caller is not admin (enforced by the RPC's own role check, not just the
          frontend), 404 if booking_id doesn't exist
Validation: new_status must be one of the existing valid values used elsewhere in
consultation_bookings.status — confirm the exact enum/allowed values already in use before
adding new ones.
Security: The RPC must check the caller is an admin itself (SECURITY DEFINER + role check,
matching the existing is_admin() pattern) — never trust a role claim only enforced in the
admin dashboard's React state.
UI behavior: Meetings and Reviews both get: loading spinner (matching existing pages'
spinner style), empty state ("No meetings/reviews found", matching existing copy style),
populated table, and (Meetings only) action buttons per row with a confirm step before
Cancel (reuse the existing reject-notes-modal pattern from admin Experts.jsx rather than a
bare `alert`/`confirm`).
Acceptance criteria:
- Admin → Meetings shows real, readable booking/meeting details (not JSON), with working
  Cancel/Mark Completed actions that update the database via the new RPC.
- Admin → Reviews (new sidebar entry) shows every review with expert/farmer name, rating,
  comment.
- A non-admin account calling the new RPC directly (bypassing the UI) receives a 403, proving
  the check is server-side, not just hidden in the React app.

## IMPLEMENTATION ORDER

STEP 1 — Re-clone/inspect current repo state; confirm nothing in this prompt has already
         changed since this audit was written (re-run the same greps cited above).
STEP 2 — Database changes: only AC-009's new RPC, and only after the client confirms the
         proposed Meetings/Reviews design in AC-009 and AC-003 is separately scoped (do NOT
         build AC-003's schema changes without a separate, explicit go-ahead).
STEP 3 — Fix AC-004's race condition and AC-005's fallback removal (Connect.jsx booking
         logic) — do this before touching tab/UI structure so the underlying booking flow is
         solid before rebuilding the UI around it.
STEP 4 — AC-007 (header/z-index fix) — do this before AC-001/AC-002 since those add new UI
         elements (a button, a menu trigger) to the same header/tab-row area, and building on
         top of a known-broken layout would compound the bug.
STEP 5 — AC-001 (expert-first tab default) and AC-002 (remove History chip + build the new
         3-bar menu, reusing BottomSheet.jsx).
STEP 6 — AC-006, once the client has answered the vanish-vs-grey-out clarifying question.
STEP 7 — AC-009 (admin Meetings rebuild + new Reviews page + new RPC + Sidebar entry).
STEP 8 — AC-008 — verify only after AC-007 is confirmed fixed; do not touch NavBar.jsx
         without a separately reproduced bug.
STEP 9 — Testing (see below).
STEP 10 — Regression pass across the full Connect page (farmer view AND expert view) plus the
          admin Appointments/Meetings/Reviews pages together.

## TESTING REQUIREMENTS

- Role tests: verify AC-001's default-tab logic for a farmer account, a pending-but-not-yet-
  approved expert account, and an approved expert account — confirm only the approved-expert
  case changes behavior.
- Race-condition test (AC-004): rapidly tap 10+ different calendar dates in sequence and
  confirm the slot list shown always matches the last-tapped date, never a stale/unfiltered set.
- Marketplace/booking test (AC-005): attempt to book an expert with zero slots — confirm no
  input fields appear and Confirm Booking is unavailable.
- Multi-user test (AC-004/R7, regression only — already working, must not break): two
  accounts booking the same expert's last remaining slot on the same day — confirm the
  existing unique-constraint protection still rejects the loser with the existing friendly
  message, and the day greys out for a third account viewing the calendar afterward.
- Visual/responsive test (AC-007): test on both a zero-inset (desktop/older device) and a
  non-zero-inset (notched device or Capacitor status-bar-simulated) environment.
- Admin authorization test (AC-009): call the new RPC directly with a non-admin JWT (e.g. via
  the browser console or a REST client) and confirm a 403/permission error, not just a
  React-level redirect.
- Regression test: confirm the previously-verified-working booking race-condition handling in
  handleConfirmBooking (unique constraint + friendly error message) still passes after AC-004's
  refactor of the surrounding date-selection code.

## FINAL IMPLEMENTATION ACCEPTANCE CHECKLIST

[ ] AC-001 through AC-009 implemented per their individual acceptance criteria
[ ] AC-003 explicitly NOT implemented until the client confirms scope/schema in writing
[ ] AC-006 NOT implemented until the client answers the vanish-vs-grey-out question
[ ] Existing, already-correct functionality preserved: day-level greying (R7), the
    unique-constraint booking-race protection, farmer-side Connect tabs/behavior outside
    what AC-001/AC-002 explicitly scope to the expert view
[ ] No new P0/P1 security issue introduced (new RPC checks admin role server-side, not
    only in the React app)
[ ] Frontend/backend contracts consistent (no new field-name mismatches introduced)
[ ] Any new database objects (RPC, Reviews query) added as a committed migration file in
    supabase/migrations/, not just applied ad hoc in the Supabase dashboard
[ ] Rules.md followed throughout (no new backend framework, no schema change without
    confirmation, RLS on anything new, RPC for multi-table admin writes, UI reuses existing
    design tokens/components)
[ ] Manual test pass completed for every item in TESTING REQUIREMENTS above
[ ] Build passing, no console errors introduced
[ ] No hardcoded secrets added
[ ] No debug code / console.log left in touched files
```
