// SQL behaviour tests for supabase/proposed/11 (Catch Up meetings) on the REAL production schema in PGlite.
// The join window is checked to the second through the internal _consultation_join_check(booking, user, time);
// clients can only reach it through join_consultation()/consultation_join_status(), which pass now().
// Run with: npm run test:db
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, applyProposed, as, ids, seed, signUp, addSlot, addBookingStartingIn, startOf, rejects, ALL } from './harness.mjs';

const count = async (db, sql, params) => Number((await db.query(sql, params)).rows[0].count);
const setup = async () => {
  const db = await createDb({ proposed: [...ALL, '09', '11'] });
  await seed(db);
  await db.query(`update public.profiles set full_name = 'Asha Farmer' where id = $1`, [ids.farmerA]);
  await db.query(`update public.profiles set full_name = 'Dr. Ravi Expert' where id = $1`, [ids.expertUser]);
  return db;
};
const book = (db, uid, slot, issue = 'Leaf curl on tomatoes') =>
  as(db, uid, 'select public.book_consultation_slot($1, $2) as id', [slot, issue]).then((r) => r.rows[0].id);
const check = (db, booking, uid, at) =>
  db.query('select public._consultation_join_check($1, $2, $3::timestamptz) as r', [booking, uid, at]).then((r) => r.rows[0].r);
const notes = (db, uid, booking) =>
  db.query('select message from public.notifications where user_id = $1 and related_id = $2 order by created_at', [uid, booking]).then((r) => r.rows.map((x) => x.message));

describe('11 — booking notifications', () => {
  test('a new booking notifies the expert and the farmer once, with names, date and time; no invented meeting link', async () => {
    const db = await setup();
    const slot = await addSlot(db, { time: '15:00' });
    const id = await book(db, ids.farmerA, slot);
    const [exp] = await notes(db, ids.expertUser, id);
    const [farm] = await notes(db, ids.farmerA, id);
    assert.match(exp, /^New consultation booked! Asha Farmer booked a session with you for \d{1,2} \w{3} \d{4} at 3:00 PM\./);
    assert.match(farm, /^Your consultation with Dr\. Ravi Expert is booked for \d{1,2} \w{3} \d{4} at 3:00 PM\.$/);
    const vm = (await db.query('select meeting_link, status from public.video_meetings where booking_id = $1', [id])).rows;
    assert.deepEqual(vm.map((r) => [r.meeting_link, r.status]), [[null, 'Scheduled']]);

    // repeated submit: same booking, nothing sent again
    assert.equal(await book(db, ids.farmerA, slot), id);
    assert.equal(await count(db, 'select count(*) from public.notifications where related_id = $1', [id]), 2);
  });

  test('a failed booking notifies nobody', async () => {
    const db = await setup();
    const slot = await addSlot(db);
    await book(db, ids.farmerA, slot);
    const before = await count(db, 'select count(*) from public.notifications');
    await rejects(book(db, ids.farmerB, slot), /already booked/);
    await rejects(book(db, ids.farmerB, await addSlot(db, { days: -1 })), /past/);
    await rejects(book(db, ids.farmerB, await addSlot(db, { time: '11:00' }), ' '), /issue/);
    assert.equal(await count(db, 'select count(*) from public.notifications'), before);
  });
});

describe('11 — 5-minute reminder (scheduler, controlled clock)', () => {
  test('sent to both participants exactly once when the start is 5 minutes away; not earlier; never for cancelled/completed', async () => {
    const db = await setup();
    const id = await book(db, ids.farmerA, await addSlot(db, { time: '15:00' }));
    const start = await startOf(db, id);
    const run = (offsetSec) => db.query(`select public.process_consultation_lifecycle($1::timestamptz + make_interval(secs => $2)) as r`, [start, offsetSec]).then((r) => r.rows[0].r);
    const fiveMin = async () => count(db, `select count(*) from public.notifications where related_id = $1 and message like 'Reminder: your consultation with %'`, [id]);

    assert.equal((await run(-301)).reminder_5min, 0);           // 2:54:59
    assert.equal(await fiveMin(), 0);
    assert.equal((await run(-300)).reminder_5min, 1);           // 2:55:00
    assert.deepEqual((await db.query(`select user_id from public.notifications where related_id = $1 and message like 'Reminder: your consultation with %' order by user_id`, [id])).rows.map((r) => r.user_id).sort(),
      [ids.farmerA, ids.expertUser].sort());
    assert.match((await notes(db, ids.farmerA, id)).at(-1), /with Dr\. Ravi Expert starts at 3:00 PM/);
    assert.match((await notes(db, ids.expertUser, id)).at(-1), /with Asha Farmer starts at 3:00 PM/);
    assert.equal((await run(-240)).reminder_5min, 0);           // scheduler runs again / retries
    assert.equal(await fiveMin(), 2);

    // cancelled and completed bookings are never reminded
    const c = await book(db, ids.farmerB, await addSlot(db, { time: '16:00' }));
    await db.query(`update public.consultation_bookings set status = 'Cancelled' where id = $1`, [c]);
    const d = await book(db, ids.farmerB, await addSlot(db, { time: '17:00' }));
    await db.query(`update public.consultation_bookings set status = 'Completed' where id = $1`, [d]);
    for (const b of [c, d]) {
      const s = await startOf(db, b);
      await db.query(`select public.process_consultation_lifecycle($1::timestamptz - interval '4 minutes')`, [s]);
      assert.equal(await count(db, `select count(*) from public.notifications where related_id = $1 and message like 'Reminder: your consultation with %'`, [b]), 0);
    }
  });
});

describe('11 — join window and participants (trusted clock)', () => {
  test('3:00 PM meeting: 2:54:59 denied, 2:55:00 allowed, 3:00 allowed, slot end denied; strangers, cancelled, completed and banned denied', async () => {
    const db = await setup();
    const id = await book(db, ids.farmerA, await addSlot(db, { time: '15:00' }));   // slot 15:00–15:30
    const start = await startOf(db, id);
    const at = (sec) => db.query(`select ($1::timestamptz + make_interval(secs => $2))::text as t`, [start, sec]).then((r) => r.rows[0].t);

    const r1 = await check(db, id, ids.farmerA, await at(-301));
    assert.deepEqual([r1.can_join, r1.reason], [false, 'too_early']);
    for (const [sec, who] of [[-300, ids.farmerA], [-300, ids.expertUser], [0, ids.farmerA], [1799, ids.expertUser]]) {
      const r = await check(db, id, who, await at(sec));
      assert.equal(r.can_join, true, `t=${sec}s ${who}`);
    }
    assert.equal((await check(db, id, ids.farmerA, await at(1800))).reason, 'ended');   // 3:30 = slot end

    assert.equal((await check(db, id, ids.farmerB, await at(0))).reason, 'not_participant');
    await signUp(db, 'cccccccc-0000-4000-8000-000000000020', 'other-expert@test.local');
    await db.query(`update public.profiles set role = 'Expert' where id = 'cccccccc-0000-4000-8000-000000000020'`);
    await db.query(`insert into public.experts (user_id) values ('cccccccc-0000-4000-8000-000000000020')`);
    assert.equal((await check(db, id, 'cccccccc-0000-4000-8000-000000000020', await at(0))).reason, 'not_participant');
    assert.equal((await check(db, id, null, await at(0))).reason, 'not_participant');

    await db.query('update public.profiles set is_banned = true where id = $1', [ids.farmerA]);
    assert.equal((await check(db, id, ids.farmerA, await at(0))).reason, 'banned');
    await db.query('update public.profiles set is_banned = false where id = $1', [ids.farmerA]);
    await db.query(`update public.consultation_bookings set status = 'Cancelled' where id = $1`, [id]);
    assert.equal((await check(db, id, ids.farmerA, await at(0))).reason, 'cancelled');
    await db.query(`update public.consultation_bookings set status = 'Completed' where id = $1`, [id]);
    assert.equal((await check(db, id, ids.expertUser, await at(0))).reason, 'completed');
  });

  test('clients cannot pass their own time: only the now()-based wrappers are callable; strangers get nothing', async () => {
    const db = await setup();
    const id = await book(db, ids.farmerA, await addSlot(db, { days: 2 }));
    await rejects(as(db, ids.farmerA, `select public._consultation_join_check($1, $2, now() + interval '2 days')`, [id, ids.farmerA]), /permission denied/);
    await rejects(as(db, ids.farmerA, `select public.consultation_window(b) from public.consultation_bookings b where id = $1`, [id]), /permission denied/);
    await rejects(as(db, ids.farmerA, 'select public.join_consultation($1)', [id]), /Too early/);
    const st = (await as(db, ids.farmerA, 'select public.consultation_join_status($1) as r', [id])).rows[0].r;
    assert.deepEqual([st.can_join, st.reason, st.role], [false, 'too_early', 'farmer']);
    assert.ok(st.server_now && st.opens_at && st.ends_at);
    await rejects(as(db, ids.farmerB, 'select public.consultation_join_status($1)', [id]), /not a participant/);
    await rejects(as(db, ids.farmerB, 'select public.join_consultation($1)', [id]), /not a participant/);
    await rejects(as(db, null, 'select public.join_consultation($1)', [id]), /permission denied/);
  });

  test('inside the window both participants join; attendance and room are recorded; the room id goes only to them', async () => {
    const db = await setup();
    const b = await addBookingStartingIn(db, 3);   // starts in 3 minutes -> window open
    const f = (await as(db, ids.farmerA, 'select public.join_consultation($1) as r', [b.id])).rows[0].r;
    const e = (await as(db, ids.expertUser, 'select public.join_consultation($1) as r', [b.id])).rows[0].r;
    assert.equal(f.role, 'farmer');
    assert.equal(e.role, 'expert');
    assert.ok(f.room_id && f.room_id === e.room_id);
    const row = (await db.query('select farmer_joined_at, expert_joined_at from public.consultation_bookings where id = $1', [b.id])).rows[0];
    assert.ok(row.farmer_joined_at && row.expert_joined_at);
    assert.equal((await db.query('select status from public.video_meetings where id = $1', [f.room_id])).rows[0].status, 'Ongoing');
  });
});

describe('11 — completion and review', () => {
  test('not before the start; after the start with the expert present: completes once, one review request', async () => {
    const db = await setup();
    const early = await addBookingStartingIn(db, 3, { joined: true });
    await rejects(as(db, ids.farmerA, 'select public.complete_consultation($1)', [early.id]), /before its scheduled start/);

    const b = await addBookingStartingIn(db, -2, { joined: true });
    await rejects(as(db, ids.farmerB, 'select public.complete_consultation($1)', [b.id]), /not a participant/);
    await as(db, ids.farmerA, 'select public.complete_consultation($1)', [b.id]);
    await as(db, ids.expertUser, 'select public.complete_consultation($1)', [b.id]);   // both leave the call
    assert.equal((await db.query('select status from public.consultation_bookings where id = $1', [b.id])).rows[0].status, 'Completed');
    assert.equal(await count(db, `select count(*) from public.notifications where related_id = $1 and message like '%Please rate%'`, [b.id]), 1);

    await as(db, ids.farmerA, `insert into public.reviews (booking_id, reviewer_id, expert_id, rating, comment) values ($1, $2, $3, 5, 'Helpful')`, [b.id, ids.farmerA, ids.expertRow]);
    await rejects(as(db, ids.farmerA, `insert into public.reviews (booking_id, reviewer_id, expert_id, rating, comment) values ($1, $2, $3, 4, 'Again')`, [b.id, ids.farmerA, ids.expertRow]));
  });

  test('cancelled bookings cannot be completed; no-show scheduler still cancels with a full refund', async () => {
    const db = await setup();
    const b = await addBookingStartingIn(db, -6, { rate: 700 });   // expert never joined, 6 minutes late
    const r = (await db.query('select public.process_consultation_lifecycle() as r')).rows[0].r;
    assert.equal(r.no_shows, 1);
    const row = (await db.query('select status, refund_status, refund_amount from public.consultation_bookings where id = $1', [b.id])).rows[0];
    assert.deepEqual([row.status, row.refund_status, Number(row.refund_amount)], ['Cancelled', 'Pending', 700]);
    await rejects(as(db, ids.farmerA, 'select public.complete_consultation($1)', [b.id]), /not active/);
    await rejects(as(db, ids.farmerA, 'select public.join_consultation($1)', [b.id]), /cancelled/);
  });

  test('11 is re-runnable', async () => {
    const db = await setup();
    await applyProposed(db, '11');
  });
});
