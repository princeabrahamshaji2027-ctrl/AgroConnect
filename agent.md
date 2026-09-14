PROJECT: AgroConnect — https://github.com/princeabrahamshaji2027-ctrl/AgroConnect.git

Before doing anything, read Rules.md and agent.md at the repo root. They are binding.
In particular: the current color theme, typography, spacing, corner radii, and iconography
are frozen. Do NOT change them anywhere as a side effect of this task. Every new screen or
component must visually match the existing app exactly — reuse existing CSS variables, the
existing Material Symbols icon style, existing Card/Button/BottomSheet/Dialog components.
Do not touch the logo asset rules in Rules.md section 1.

CONTEXT: Two reference images from the client are in AgroConnect/UI, uploaded as "1" and "2"
(in that order, matching the order they appear in the client's spec below). Use them only as
a functional/layout reference for the new expert-mode screens — restyle them to match the
app's existing dark theme and component set, don't import their raw colors/fonts as-is.

SCOPE — do not break any existing functionality in src/pages/Connect.jsx. It already handles
both normal-user and expert views via the isCurrentExpert flag, and already has tabs for
book / upcoming / history / lobby / reviews / marketplace / availability. Everything below is
ADDITIVE to that file and its related components — audit the existing logic before editing so
nothing currently working (booking, slot management, appointments fetch) regresses.

REQUESTED CHANGES (client spec, from a PDF titled "EXPERT PAGE"):

1. Expert's Catch Up page — meeting cards (reference image "1")
   - Upcoming meetings for an expert are grouped by date, then ordered by time, each showing
     the booking user's name (matches existing appointment/expert query pattern already in
     Connect.jsx).
   - Tapping a meeting card opens a detail view (use BottomSheet.jsx) showing: the user's name,
     the description the user entered at booking time, a "Join" button, and a "Cancel" button.
   - Join button: must show a countdown to the meeting's start time and stay disabled until the
     scheduled date/time is reached — compute this client-side against the slot's stored
     date/time (and re-validate server-side before allowing the call room to open).
   - Cancel button: opens a second sheet/dialog requiring the expert to type a cancellation
     reason (mandatory, non-empty) and offer 1+ alternative dates/times for a new meeting.
     On submit: mark the appointment cancelled, store the reason, store the offered
     dates/times.

2. Cancellation reaching the user via chat
   - When an expert cancels with a reason + offered dates, the booking user must receive this
     as a message in their existing Chat.jsx conversation with that expert — not as a
     generic text bubble. This requires extending the messages schema/table with a structured
     message type (e.g. a `message_type` + `metadata` JSON field) so the message can render as
     an interactive card: cancellation reason text + tappable date/time options.
   - When the user taps one of the offered date/time options in that chat card, they are
     routed to their own Catch Up (booking) page with that date/time pre-selected, and the
     normal booking form/flow continues from that point (skip the date/time selection step
     since it's already been made from chat).

3. Expert page top-left menu button (reference image "2")
   - A button in the top-left of the expert's Catch Up header opens a bottom sheet (reuse
     BottomSheet.jsx) showing the expert's identity (avatar, name, role, "Expert" badge, tagline)
     followed by four rows: Customize Availability, Meeting History, Expert Profile, Leave
     Expert Mode. Style rows to match existing list/menu patterns already used elsewhere in
     the app — do not invent a new list style.
   - Customize Availability: opens the expert's existing availability-management UI (the
     `activeSubTab === 'availability'` section already in Connect.jsx) — do not duplicate this
     logic, just make it reachable from this menu as well. If this expert has zero slots set up
     yet, show a "Mark your availability" prompt (in place of the empty meetings list) that
     opens this same screen.
   - Meeting History: opens the existing history view (`activeSubTab === 'history'`) — same
     reuse rule, don't duplicate.
   - Expert Profile: edit view for the expert's skills/bio — check if this already exists under
     any existing profile-edit component (EditProfile.jsx) before building a new one.
   - Leave Expert Mode: opens a dialog requiring a mandatory text reason for leaving. On
     submit: revert the account to a normal user (remove expert badge/verification tick from
     their profile, remove access to all expert-only UI/tabs in Connect.jsx, and stop treating
     isCurrentExpert as true for this account going forward).

DATA/SCHEMA WORK REQUIRED (flag clearly if any of this already exists so it isn't duplicated):
   - appointments (or equivalent table used in Connect.jsx): add cancellation_reason field and
     a way to store offered reschedule date/time options per cancellation.
   - messages table used by Chat.jsx: add a message type/metadata mechanism so a message can
     carry structured, interactive content (the cancellation + reschedule-options card),
     distinct from plain text messages.
   - experts table: add whatever field is needed to support leaving expert mode cleanly
     (e.g. an is_active/status flag) rather than deleting the expert record outright, if
     meeting history for that expert needs to be preserved.

Do a pass over src/pages/Connect.jsx, src/pages/Chat.jsx, src/pages/UserProfile.jsx, and
src/components/ first to confirm exactly what's reusable vs. what's genuinely new before
writing any code, and don't introduce new UI patterns where an existing component
(BottomSheet, Dialog, Card, Button) already covers the need.