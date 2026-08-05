# PROMPT FOR ANTIGRAVITY — Full Functional Wiring (Mobile App + Admin Panel)

Run this in the order given. **Stop and show me a working demo after each phase** before starting the
next one — do not chain all phases into one uninterrupted run. If phase 3 breaks, I need to know it
was phase 3, not "somewhere in everything."

Assumes: the 25-table schema, RLS, and admin RPC functions from the two earlier prompts already exist
in Supabase.

---

## GROUND RULES

1. Every screen currently importing from `src/mock/*.json` must be rewired to a real
   `supabase.from(...)` call. No mock data may remain reachable from any screen after this is done.
2. Every write from the client goes through Supabase's client SDK (`@supabase/supabase-js`) using the
   logged-in user's session — never a raw fetch, never a hardcoded key in a component.
3. Multi-step actions (place an order, approve an expert, resolve a report) go through the Postgres
   RPC functions already defined — not multiple separate inserts from the frontend, which can leave
   the database half-updated if one call fails.
4. Permissions are requested **contextually** — at the moment the user taps the action that needs
   them, not in bulk at app launch.
5. Large media (video) goes to Supabase Storage as-is for this MVP. No transcoding, no adaptive
   bitrate, no compression pipeline — that is a separate, later project once you have real usage data
   to justify the cost. Flag file-size limits to the user on upload (recommend capping video uploads
   at ~60 seconds / 50MB client-side before you ever hit a storage cost problem).

---

## PHASE 0 — Schema additions this wiring needs

### Media support on posts
```sql
create type post_media_type as enum ('image', 'video');

alter table public.posts
  add column media_type post_media_type not null default 'image',
  add column video_duration_seconds int,
  add column like_count int not null default 0,
  add column comment_count int not null default 0;
```
(`like_count`/`comment_count` were specified as triggers in the first prompt — add them now if not
already present; the Feed screen needs them to avoid a `count(*)` join on every scroll.)

### Seller approval RPC (mirrors the expert approval flow — needed now since sellers can request status)
```sql
create or replace function public.approve_seller(p_seller_id uuid)
returns void language plpgsql security definer as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.seller_profiles set verification_status = 'Verified' where id = p_seller_id;
  insert into public.admin_audit_log (admin_id, action, target_table, target_id)
    values (auth.uid(), 'approve_seller', 'seller_profiles', p_seller_id);
end;
$$;

create or replace function public.reject_seller(p_seller_id uuid, p_notes text default null)
returns void language plpgsql security definer as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.seller_profiles set verification_status = 'Rejected' where id = p_seller_id;
  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
    values (auth.uid(), 'reject_seller', 'seller_profiles', p_seller_id, jsonb_build_object('notes', p_notes));
end;
$$;
```

### Atomic order placement (referenced as "next step" in the original schema prompt — build it now)
```sql
create or replace function public.place_order(p_seller_id uuid, p_items jsonb)
-- p_items = [{ "product_id": "uuid", "quantity": 2 }, ...]
returns uuid language plpgsql security definer as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_price numeric;
  v_stock int;
  v_total numeric := 0;
begin
  insert into public.orders (buyer_id, seller_id, total_amount, status)
    values (auth.uid(), p_seller_id, 0, 'Pending') returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select price, stock into v_price, v_stock from public.products
      where id = (v_item->>'product_id')::uuid for update;

    if v_stock < (v_item->>'quantity')::int then
      raise exception 'Insufficient stock for product %', v_item->>'product_id';
    end if;

    update public.products set stock = stock - (v_item->>'quantity')::int
      where id = (v_item->>'product_id')::uuid;

    insert into public.order_items (order_id, product_id, quantity, price)
      values (v_order_id, (v_item->>'product_id')::uuid, (v_item->>'quantity')::int, v_price);

    v_total := v_total + (v_price * (v_item->>'quantity')::int);
  end loop;

  update public.orders set total_amount = v_total where id = v_order_id;
  return v_order_id;
end;
$$;
```
This is why the whole checkout can't be plain client-side inserts: stock checks and total calculation
have to happen inside one locked transaction, or two buyers can both "succeed" buying the last unit.

---

## PHASE 1 — Capacitor Permissions (contextual, not upfront)

Install: `@capacitor/camera`, `@capacitor/filesystem`.

- **Camera/gallery** — request only when the user taps the image/video picker inside `CreatePost.jsx`.
  Use `Camera.requestPermissions()` right before `Camera.getPhoto()` / gallery pick; if denied, show an
  inline message with a link to app settings, don't silently fail.
- **Microphone** — only if video recording (not just picking an existing video file) is supported;
  request at the moment recording starts.
- Do **not** add a blanket permissions screen on first launch. If you specifically want a one-time
  "here's what we'll ask for and why" explainer screen before the OS prompt appears, that's fine and
  actually good UX — but the OS-level permission dialog itself still only fires at first point of use.

---

## PHASE 2 — Core Social Feed (posts, images, video, likes, comments)

1. **`CreatePost.jsx`**: user picks image or video → upload to Storage bucket
   (`post-images` for images, or a new `post-videos` bucket for video, both public-read) →
   insert into `posts` with `media_type` set correctly → local feed refresh.
2. **`Feed.jsx`**: replace `mock/posts.json` with
   `supabase.from('posts').select('*, profiles(full_name, profile_image_path), like_count, comment_count').eq('status','Approved').order('created_at', {ascending:false})`.
   Video posts render with a `<video>` element (native player), not an `<img>`.
3. **Likes**: tapping like → insert/delete row in `likes` (unique constraint already prevents double-likes)
   → trigger from Phase 3 of the first schema prompt keeps `posts.like_count` in sync — do not
   increment the count from the client, trust the trigger.
4. **Comments**: insert into `comments`, refetch or use Supabase Realtime on that post's comment thread.
5. **Realtime**: subscribe the open Feed screen to `postgres_changes` on `posts` (insert) so new posts
   from other users appear without a manual pull-to-refresh, matching normal social app behavior.

---

## PHASE 3 — Expert & Seller Request Flows

1. **Become an Expert** (`ExpertApplication` screen): upload CV to the private `expert-cvs` bucket →
   insert into `expert_applications` (`status = 'Pending'`) → show pending state to user until admin acts.
2. **Become a Seller** (seller onboarding screen): insert into `seller_profiles`
   (`verification_status = 'Pending'`).
3. **Admin side**: "Approve"/"Reject" buttons on the admin Experts and Sellers screens call
   `supabase.rpc('approve_expert_application', {...})` / `approve_seller` / their reject counterparts —
   these already exist from the previous prompt (expert) and Phase 0 above (seller). Do not write new
   direct-update logic in the admin frontend for these actions.
4. User-facing status: the mobile app's profile/settings screen should reflect
   `expert_applications.status` / `seller_profiles.verification_status` live (Realtime subscription or
   refetch on screen focus) so the user sees "Approved" without reopening the app.

---

## PHASE 4 — Marketplace & Orders

1. **Products browse/detail**: real `supabase.from('products').select()`, filtered by `category_id`.
2. **Cart → Checkout**: client builds the `p_items` array locally, then calls
   `supabase.rpc('place_order', { p_seller_id, p_items })` — one call, one transaction, returns the new
   `order_id`. Do not insert into `orders`/`order_items` directly from the client.
3. **Order history**: `supabase.from('orders').select('*, order_items(*, products(*))').eq('buyer_id', auth.uid())`.

---

## PHASE 5 — Consultations, Chat, Notifications

1. **Book a consultation**: insert into `consultation_bookings`; on confirm, insert `video_meetings`
   row with a generated meeting link (or integrate a real video provider — flag to me if you want a
   specific one, that's a separate integration, not a database task).
2. **Reviews**: after a booking's `status = 'Completed'`, prompt the farmer to submit a review — insert
   into `reviews`; the trigger from the first prompt recalculates `experts.rating` automatically.
3. **Chat**: `conversations`/`messages` wired with Realtime subscription per open conversation —
   this is what makes it behave like a live chat instead of a refresh-to-see-new-messages page.
4. **Notifications**: `notifications` table read + Realtime subscription; mark-as-read updates `is_read`.

---

## PHASE 6 — Admin Panel: Full Authority Wiring

Every "view/remove/approve" button on the admin site maps to something already built — this phase is
pure wiring, no new backend logic:

| Admin action | Call |
|---|---|
| View all posts (incl. pending/rejected) | `select` on `posts`, RLS already grants admin full visibility |
| Remove a post | `delete` on `posts` (RLS admin-override already in place) — or `resolve_report` with `p_delete_content = true` if it originated from a report |
| Approve/reject expert | `approve_expert_application` / `reject_expert_application` |
| Approve/reject seller | `approve_seller` / `reject_seller` |
| Ban a user | `ban_user(user_id, reason)` |
| Resolve a report | `resolve_report(report_id, action, delete_content)` |
| Send broadcast | `send_broadcast(title, message, target_role)` |

Every one of these already writes to `admin_audit_log` inside the function — do not add a second,
separate audit write from the frontend, that would double-log.

---

## VERIFICATION AFTER EACH PHASE

- Phase 2: create a post with a video from one test account, confirm it appears in another test
  account's feed in real time, confirm like/comment counts update correctly.
- Phase 3: submit an expert application, approve it from admin, confirm the user's role flips to
  `Expert` and they can now access expert-only screens.
- Phase 4: place an order for a product with stock = 1 from two accounts near-simultaneously, confirm
  only one succeeds and the other gets the "insufficient stock" error — this is the actual test that
  the transaction is working, not just that happy-path orders succeed.
- Phase 5: send a chat message, confirm it appears on the recipient's open chat screen without a refresh.
- Phase 6: log in as admin, ban a test user, confirm that account can no longer post or comment
  (and remember — this still needs the `is_banned` check added to the write policies, flagged
  previously and still outstanding).