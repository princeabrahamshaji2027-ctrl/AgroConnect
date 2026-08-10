# PROMPT FOR ANTIGRAVITY — Diagnose: Admin Login Still Bounces Back to Login Page

A previous fix targeted a React state race in `Login.jsx`/`App.jsx` for this exact symptom. The
symptom is still occurring. Do not assume that fix was wrong — first confirm whether it's even in the
deployed code, then work through the remaining causes below in order. Do not apply a fix for any item
until you've confirmed it's the actual cause using the diagnostic step given — fixing the wrong thing
first wastes a cycle and makes it harder to tell what actually solved it.

**Ground rule: stop debugging blind.** Before checking anything else, do step 0.

---

## STEP 0 — Add real error visibility (do this first, unconditionally)

`admin-dashboard/src/App.jsx`'s profile-fetch `useEffect` currently swallows errors silently:
```jsx
.then(({ data }) => setProfile(data))
.catch(() => setProfile(null));
```
This throws away the exact information needed to diagnose this bug. Change it to:
```jsx
.then(({ data, error }) => {
  if (error) {
    console.error('Profile fetch failed:', error);
  }
  setProfile(data);
})
.catch((err) => {
  console.error('Profile fetch threw:', err);
  setProfile(null);
});
```
Also add a log right before the redirect-to-login check, so it's visible in the browser console exactly
what state caused the bounce:
```jsx
if (!profile || profile.role !== 'Admin') {
  console.error('Bounced to login — profile:', profile, 'session user id:', session?.user?.id);
  handleLogout();
  return null;
}
```
Reproduce the bug once with these logs in place and report back exactly what they print — that output
determines which of the causes below is real, rather than guessing.

---

## STEP 1 — Confirm the previous fix is actually live

Check `admin-dashboard/src/pages/Login.jsx` and `admin-dashboard/src/App.jsx` for the exact state
described below. If either file still looks like the "before" version, the previous fix was never
applied or never deployed — apply it now before checking anything else.

- `Login.jsx` should **not** call any `onLoginSuccess(...)` / callback prop after a successful admin
  login — session should be set only by `App.jsx`'s own `supabase.auth.onAuthStateChange` listener.
- If `Login.jsx` still contains a line like `onLoginSuccess(user)`, or `App.jsx` still passes
  `onLogin`/`onLoginSuccess` as a prop to `<Login>`, the old race is still present — fix it per the
  previous prompt before moving on.
- Also confirm the browser is actually running the new build, not a cached one: hard-refresh
  (disable cache in devtools) or test in a fresh private/incognito window. A stale service worker or
  browser cache showing the old JS bundle would reproduce the exact same symptom even after the source
  is fixed.

---

## STEP 2 — Check whether RLS is blocking the admin from reading their own profile row

This is the most likely remaining cause if Step 1's fix was already correctly in place. Supabase Row
Level Security policies on the `profiles` table were designed around an `is_admin()` helper function
that itself queries `profiles.role` for the current user. If the `select` policy on `profiles` was
written to depend only on `is_admin()` without also allowing `id = auth.uid()`, a freshly-logged-in
admin cannot read their own row — the RLS check to prove they're an admin requires reading their own
row, which the same check is blocking. The result: the profile fetch returns zero rows (not an error,
just empty), `profile` stays `null`, and the app treats this as "not an admin" and logs them straight
back out — every single time, deterministically, regardless of any React state timing.

**Diagnostic**: run this directly in the Supabase SQL editor, logged in as the actual admin user (or
via `select * from public.profiles where id = '<the admin's auth.users id>';` while impersonating that
role), and separately check the current policy definitions:
```sql
select * from pg_policies where tablename = 'profiles';
```
Look specifically at the `select` policy. It must allow **both** conditions, not only the admin check:
```sql
-- if the current policy looks like this, it's the bug:
create policy "profiles_select" on public.profiles for select
  using (public.is_admin());

-- it needs to be:
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or public.is_admin());
```
If the policy is missing the `id = auth.uid()` clause, add it. This lets any user read their own row
unconditionally (which is safe and necessary — self-read is not a privilege escalation) while still
allowing admins to read everyone else's via `is_admin()`.

---

## STEP 3 — Check the actual data: is the role value exactly `'Admin'`?

`App.jsx` checks `profile.role !== 'Admin'` — an exact, case-sensitive string match against the
Postgres enum value. If the admin account's row actually has `role = 'admin'` (lowercase), a typo, or
trailing whitespace from manual data entry, this check fails even though RLS and the React code are
both working correctly.

**Diagnostic**:
```sql
select id, email, role, length(role::text) as role_length from public.profiles
where id = '<the admin auth user id>';
```
Confirm the value is exactly `Admin` (capital A, 5 characters, no surrounding whitespace) and matches
the `user_role` enum definition precisely.

---

## STEP 4 — Check for a second, stale Login/Auth code path

Confirm there is only one admin login component in the entire `admin-dashboard/` project and that
`App.jsx` is the only place rendering it. If an older or duplicate login/auth file exists anywhere in
the project (from an earlier build pass) and something is still importing it instead of the current
`Login.jsx`, fixes applied to the "real" file would have no effect. Search the whole admin-dashboard
source tree for every file that imports from `../supabase` and calls `signInWithPassword`, and confirm
there's exactly one.

---

## STEP 5 — Confirm signInWithPassword is actually succeeding, not silently failing

It's possible the bounce-back isn't a post-login state bug at all, but the sign-in call itself failing
in a way that isn't surfaced as an error message. Check the Network tab (or add a log) around the
`supabase.auth.signInWithPassword` call in `Login.jsx` to confirm `authError` is genuinely `null` and
`user` is genuinely populated on the attempt that "bounces back." If `signInWithPassword` is actually
failing (wrong password format, email domain suffix mismatch from the `email.includes('@') ? email :
\`${email}@agroconnect.com\`` logic not matching how this admin's account was actually created), the
symptom could look identical from the outside but the real fix is on the credentials/account side, not
the session-handling code at all.

---

## REPORT BACK

After Step 0's logging is in place and the bug is reproduced once more, report:
1. What the two new console.error lines actually printed.
2. Whether Step 1 found the old code still present, or confirms the previous fix was already live.
3. The result of Step 2's `pg_policies` query on `profiles`.
4. The result of Step 3's role-value query for the specific admin account being used to test.

That combination will make the actual cause unambiguous instead of guessed.