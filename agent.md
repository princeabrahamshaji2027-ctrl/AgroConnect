# PROMPT FOR ANTIGRAVITY — Rebuild Catch Up Availability & Booking UI

## Correction before starting

No zip file exists anywhere in the repo — only two PNG screenshots are present:
`UI/expert_user_catchup page.png` and `UI/user_catchup page.png`. Treat these two images as the visual
spec directly; there is nothing to extract from an archive. (Note the filenames have spaces in them —
don't reference these paths directly in code for the same reason flagged with other assets before;
they're design references only, not runtime assets.)

## A gap in the spec worth flagging before building — don't silently guess

The expert's "Manage Availability" mockup (`expert_user_catchup page.png`) has no rate/price field
anywhere on it — just day selection, time slots, meeting duration, and buffer time. But the farmer-
facing calendar mockup (`user_catchup page.png`) shows a different rate on almost every date
(₹10, ₹20, ₹30, ₹40...). Those two things don't fully reconcile: the mockup doesn't show where a
per-date or per-slot rate would actually be entered by the expert. Rather than guessing at a UI that
isn't shown, **keep the existing working rate-per-slot input** from the current implementation
(`src/pages/Connect.jsx` line 665, `<InputField label="Rate (₹)" ...>`) and fold it into the rebuilt
time-slot chips (each slot the expert adds carries a rate, matching what the farmer's calendar view
needs to display per date). If a global/simpler rate model was actually intended instead, that needs
to come from the user directly — don't have Antigravity remove working rate functionality on the
strength of an incomplete mockup.

---

## PART 1 — Expert-side: rebuild "Manage Availability" to match the new mockup

**Current state**: `src/pages/Connect.jsx`, the `activeSubTab === 'availability'` block (lines
652-690ish) is a flat one-slot-at-a-time form: pick one date, one start/end time, one rate, click
"Add Available Slot," repeat manually for every single slot. This works but requires an expert to
click through this form dozens of times to set up a normal week — it doesn't match the new mockup's
day-toggle + multi-slot-per-day UX at all.

**Rebuild** this section as:

1. **Day-of-week selector** — seven toggle buttons (Mon-Sun), matching the mockup's calendar-icon
   chip style. Selecting a day expands a per-day time-slot section (only the first selected day
   expanded by default, others collapsed — matching the mockup's Monday-expanded/Tuesday-Wednesday-
   collapsed state).
2. **Per-day time slot chips** — for each selected day, show the times already added as removable
   chips (`09:00 AM ✕`, `11:00 AM ✕`, etc.), plus an "+ Add Time Slot" row that opens a time picker.
   Each slot is exactly 1 hour long (per the original spec) — when the expert picks a start time,
   compute the end time as start + 1 hour automatically rather than asking for both.
3. **Meeting Settings** — two dropdowns, "Meeting Duration" (default 30 mins) and "Buffer Time"
   (default 10 mins). These don't exist anywhere in the schema yet — add them:
```sql
alter table public.experts
  add column if not exists meeting_duration_minutes int not null default 30,
  add column if not exists buffer_time_minutes int not null default 10;
```
4. **"Save Availability" button** — on save, this needs to actually generate real dated
   `consultation_slots` rows, since the schema stores specific dated slots (`slot_date`,
   `start_time`, `end_time`), not a recurring weekly pattern. Expand the recurring day+time selection
   into concrete slots for the next 8 weeks:
```js
const handleSaveAvailability = async () => {
  const slotsToInsert = [];
  const today = new Date();
  for (let week = 0; week < 8; week++) {
    for (const day of selectedDays) {           // e.g. ['Mon', 'Tue', 'Wed']
      const date = getNextDateForWeekday(today, day, week); // helper: compute the actual calendar date
      for (const time of timesByDay[day]) {      // e.g. { Mon: ['09:00', '11:00', '14:00', '16:00'] }
        const endTime = addOneHour(time);
        slotsToInsert.push({
          expert_id: currentExpertId,
          slot_date: formatDate(date),
          start_time: time,
          end_time: endTime,
          rate: rateForSlot(day, time),          // per the rate note above — reuse existing rate input per slot
          is_booked: false
        });
      }
    }
  }
  // Insert in one batch, and use upsert with a conflict target on (expert_id, slot_date, start_time)
  // so re-saving availability doesn't create duplicate slots for weeks already generated:
  const { error } = await supabase
    .from('consultation_slots')
    .upsert(slotsToInsert, { onConflict: 'expert_id,slot_date,start_time', ignoreDuplicates: true });
  if (error) { alert(error.message); return; }
  if (onShowToast) onShowToast('✅ Availability saved!');
};
```
For the `upsert` conflict target to work, add a unique constraint if one doesn't already exist:
```sql
create unique index if not exists unique_expert_slot on public.consultation_slots(expert_id, slot_date, start_time);
```
5. **Do not touch** the existing booking-lock logic (`is_booked` flip on booking, the unique-booking-
   per-slot constraint, the race-condition handling in `handleConfirmBooking` around line 329) — that
   part is already correctly built and tested; this task is a UI/generation-logic rebuild in front of
   it, not a replacement of the booking flow itself.

---

## PART 2 — Farmer-side: rebuild the date picker into a real calendar grid

**Current state**: there is no calendar grid anywhere in `Connect.jsx` today — `handleBookClick`
fetches all of an expert's slots into a flat array (`availableSlots`), and (per the earlier code)
they're rendered as a list, not a month grid.

**Rebuild** to match `user_catchup page.png`:
1. A month-view calendar (Su-Sa columns, current month, prev/next month navigation arrows) where each
   date cell shows either the lowest available rate for that date (e.g. "3 ₹10") if any unbooked
   slots exist that day, or "--" in a dimmed/disabled style if none do.
2. Tapping an available date should reveal that date's individual time slots for final selection —
   this is where the existing flat time-slot list (already correctly built, including the "already
   booked = greyed out and unselectable" behavior) fits in, just triggered from a date tap instead of
   being the very first thing shown. Two reasonable ways to implement the transition — pick whichever
   fits the existing component structure better: expand the time slots inline below the tapped date
   cell, or navigate to a second step within the same booking flow. Either is fine; don't invent a new
   separate route/page for it.
3. Group `availableSlots` by `slot_date` client-side to build both the per-date rate summary for the
   grid and the per-date slot list for the expanded view — no new query needed, this is a client-side
   reshaping of data already being fetched in `handleBookClick`.

---

## PART 3 — Bonus bug found while reading this section: hardcoded price and rating

`src/pages/Connect.jsx` around lines 622-625, in the expert list card:
```jsx
<div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--primary-green)' }}>₹500</div>
<div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>per session</div>
...
<strong>4.9</strong> (15+ reviews)
```
`₹500` and `4.9 (15+ reviews)` are hardcoded literals shown for every expert regardless of their real
data — every expert in the list shows the identical fake price and rating no matter what they've
actually set or earned. Fix while this section is already being touched:
- Price: since rate now lives per-slot rather than per-expert (per Part 1's design), show either "From
  ₹X" using the lowest rate among that expert's current available slots, or omit the price from this
  summary card entirely and only show it once the farmer reaches the actual date/slot picker — either
  is reasonable, pick whichever requires less extra querying given the data already being fetched for
  the expert list.
- Rating: pull the real average from `experts.rating` (already maintained by an existing trigger off
  the `reviews` table) instead of the hardcoded `4.9`, and show the real review count via
  `count(*) from reviews where expert_id = ...` rather than the fake "15+".

---

## VERIFICATION

- [ ] Expert can select multiple days, add several 1-hour time slots per day, set meeting duration
      and buffer time, and save — this generates real bookable slots for the next 8 weeks, not just
      one
- [ ] Saving availability a second time doesn't create duplicate slots for dates already generated
- [ ] Farmer sees a real month calendar with per-date rate summaries, not a flat form
- [ ] Tapping an available date reveals that day's specific time slots
- [ ] A slot booked by one farmer immediately shows as unavailable/greyed to other farmers viewing the
      same expert (test with two accounts, same as the earlier race-condition test)
- [ ] Expert list cards show each expert's real rating and review count, not a hardcoded 4.9
- [ ] Existing booking flow (issue description, confirm, video meeting row creation) still works
      end-to-end after this rebuild — this was working before and shouldn't regress