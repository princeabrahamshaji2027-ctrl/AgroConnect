# AGRO-CONNECT — PROJECT RULEBOOK (rules.md)

This file is binding. Read it before starting any task on this project. If a request from the
user conflicts with a rule below, stop and flag the conflict instead of silently picking one side —
do not guess which one wins.

---

## 1. Branding & Visual Identity

1.1. The app logo is located at `AgroConnect/UI/logo/logo.jpg`. This exact file is the only logo
asset for the project — never generate a new logo, never substitute a placeholder icon, never use
a different crop/version of it.

1.2. Every screen, page, or component that displays a logo — mobile app header, splash screen,
login screen, admin website sidebar, admin login, email templates, favicon — must reference this
same file. If a screen currently has no logo and a logo is being added, use this file; do not
source or generate an alternative.

1.3. If the required logo dimensions or format for a specific placement (e.g. a favicon) genuinely
cannot be met by the source file, stop and ask the user for an exported variant rather than
generating a new one.

---

## 2. UI Consistency (Theme, Style, Fonts, Layout)

2.1. The current UI — color theme, typography, spacing, and layout — is finalized. Do not change
it as a side effect of any other task, ever.

2.2. A change to the theme, font, colors, or overall layout is permitted **only** when the user
explicitly asks for that specific change. "Add a feature" is not permission to also adjust the
look of surrounding elements.

2.3. Every new screen, component, or element built after this point must visually match the
existing UI: same color tokens, same font family/sizes, same spacing units, same button and card
styles, same corner radius, same iconography style. Do not introduce a new visual pattern because
it seems cleaner or more modern — match what already exists, including when it means copying an
imperfect pattern for consistency.

2.4. Before building any new screen, look at the closest existing equivalent screen in the project
and reuse its structure, spacing, and component choices rather than designing from scratch.

2.5. If a task requires a UI element that has no existing precedent in the app (e.g. a new type of
card), design it using the existing design tokens (colors, fonts, spacing scale) already in use —
never introduce a new token, font, or color outside the existing palette without explicit
confirmation.

---

## 3. Architecture Rules

3.1. Supabase is the entire backend: database, auth, storage, and business logic (via Postgres
functions / Edge Functions). Do not introduce a separate backend server, framework, or API layer
(Django, Node/Express, etc.) for any reason. If a task seems to need one, stop and say so instead
of building it.

3.2. The mobile app and the admin website are two separate frontends against the same Supabase
project. Never create a second database, a second Supabase project, or duplicated tables for the
admin side. If a table doesn't exist yet for something the admin needs, that's a schema change —
see Section 4 — not a reason to spin up a parallel store.

3.3. Never place the Supabase `service_role` key in any frontend code (mobile app or admin
website). All access from either frontend goes through the `anon` key plus Row Level Security.
Elevated admin actions are granted through RLS policies checking the caller's role, or through
`security definer` Postgres functions — never through a bypass key shipped to the client.

3.4. Multi-step actions that touch more than one table (approving an expert, placing an order,
banning a user, resolving a report) must go through a single Postgres RPC function, not multiple
sequential client-side calls. If no such function exists yet for a needed action, that is a
database change — flag it and propose the function before wiring a button to it.

---

## 4. Database Rules

4.1. Do not alter the schema — add, remove, or rename a table or column — without explicit
confirmation from the user first. Propose the change, explain why it's needed, and wait.

4.2. New tables follow the existing conventions already in use in this project: `uuid` primary
keys via `gen_random_uuid()`, `timestamptz` timestamps defaulting to `now()`, Postgres `enum`
types for any status/role/category field instead of free-text strings.

4.3. Row Level Security must be enabled on every table, with no exceptions. A new table without an
RLS policy is treated as an incomplete task, not a shortcut to revisit later.

4.4. Never store a password, auth token, or email address outside Supabase's own `auth.users` —
user identity data belongs there, not duplicated into `profiles` or any other table.

---

## 5. Feature Scope Discipline

5.1. Do not invent features, tables, or screens that were not specified. If a design reference
(mockup, template, another app) shows something not discussed for this project, do not build it
silently — flag it and ask whether it's in scope.

5.2. If a nav item, button, or screen in an uploaded design has no clear backing data or purpose in
this project, say so explicitly rather than building a placeholder for it or quietly dropping it.

5.3. When asked to "make everything functional" or similarly broad requests, break the work into
phases and confirm the plan before executing, rather than attempting the full scope in one
uninterrupted pass.

---

## 6. Build Process Rules

6.1. Work in the order specified when a task is phased. Do not skip ahead or combine phases even
if it looks faster — each phase should be verifiable independently before the next starts.

6.2. After finishing a phase or a discrete piece of work, state clearly what was built, what was
verified, and what is still outstanding. Do not report a task as complete if a known gap (e.g. a
missing policy check, an unimplemented edge case) remains — name the gap explicitly.

6.3. When told to discard or replace an old implementation (e.g. an old in-app admin panel), fully
remove its reachability — dead code, orphaned mock-data imports, and unused routes should not be
left behind pointing at a screen that's supposed to be gone.

6.4. No mock or placeholder data may remain reachable from any finished screen. If a screen still
depends on `mock/*.json` or hardcoded sample data, it is not done, regardless of how it looks.

---

## 7. Security & Permissions

7.1. Device permissions (camera, media/gallery, microphone, storage) are requested contextually —
at the moment the user performs the action requiring them — never in bulk at app launch.

7.2. Every admin action that changes data (approve, reject, ban, delete, resolve) must be recorded
in the audit log table. Do not add a new admin-write action without also wiring its audit entry.

7.3. Treat every user-facing form as adversarial input: validate and constrain on the database
side (constraints, checks, RLS) — not only in the frontend UI.

---

## 8. Communication Protocol

8.1. If a request is ambiguous, or could be satisfied multiple conflicting ways, stop and ask
rather than guessing and proceeding.

8.2. If a request would violate any rule in this file, do not silently comply and do not silently
refuse — state the conflict plainly and ask how to proceed.

8.3. Never claim a feature is fully working without having verified it end-to-end. If verification
wasn't possible, say that explicitly instead of implying it was tested.

---

## HOW THIS FILE IS USED

This file is checked before starting any new task on the AgroConnect project. It does not expire
and does not get overridden by an old chat, an old prompt, or an assumption from a different
project. If the user wants a rule changed, they update this file directly — an instruction in
conversation that contradicts this file is a signal to pause and confirm, not to override it
silently.