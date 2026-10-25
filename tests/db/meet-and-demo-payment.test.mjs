// SQL behaviour tests for supabase/proposed/14 (Google Meet links + DEMO payment checkout) on the REAL production
// schema in PGlite (01–13 applied first, like staging). Run with: npm run test:db
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDb, as, ids, seed, signUp, addSlot, addBookingStartingIn, rejects, ALL } from './harness.mjs';

const count = async (db, sql, params) => Number((await db.query(sql, params)).rows[0].count);
const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];
const setup = async () => {
  const db = await createDb({ proposed: [...ALL, '09', '11', '12', '13', '14'] });
  await seed(db);
  return db;
};
const start = (db, uid, slot, key = randomUUID(), issue = 'Leaf curl on tomato') =>
  as(db, uid, 'select public.start_demo_checkout($1, $2, $3) as r', [slot, issue, key]).then((x) => x.rows[0].r);
const confirm = (db, uid, payment) =>
  as(db, uid, 'select public.confirm_demo_payment($1) as r', [payment]).then((x) => x.rows[0].r);
const otherExpert = async (db) => {
  const uid = 'aaaaaaaa-0000-4000-8000-000000000009';
  await signUp(db, uid, 'expert2@test.local');
  await db.query(`update public.profiles set role = 'Expert' where id = $1`, [uid]);
  await db.query(`insert into public.experts (user_id, specialization, verified_date) values ($1, 'Pests', current_date)`, [uid]);
  return uid;
};
const LINK = 'https://meet.google.com/abc-defg-hij';
const setLink = (db, uid, booking, link = LINK) =>
  as(db, uid, 'select public.set_meeting_link($1, $2) as r', [booking, link]).then((x) => x.rows[0].r);

describe('14 — demo payment checkout', () => {
  test('fee comes from the slot (paise, INR, demo); nothing is booked or notified until the demo payment is confirmed', async () => {
    const db = await setup();
    const slot = await addSlot(db, { rate: 450 });
    const p = await start(db, ids.farmerA, slot);
    assert.equal(p.status, 'pending'); assert.equal(p.amount_paise, 45000); assert.equal(p.currency, 'INR'); assert.equal(p.demo, true);
    assert.equal(p.duration_minutes, 30);
    assert.equal(await count(db, 'select count(*) from public.consultation_bookings'), 0);
    assert.equal(await count(db, 'select count(*) from public.notifications'), 0);
    assert.equal((await one(db, 'select is_booked from public.consultation_slots where id = $1', [slot])).is_booked, false, 'pending attempt holds the slot');
    const c = await confirm(db, ids.farmerA, p.payment_id);
    assert.equal(c.status, 'succeeded'); assert.ok(c.booking_id);
    assert.equal(await count(db, 'select count(*) from public.consultation_bookings where id = $1', [c.booking_id]), 1);
    assert.equal(await count(db, 'select count(*) from public.notifications where related_id = $1', [c.booking_id]), 2, 'farmer + expert');
  });

  test('double tap / retry: same key → same attempt; confirming twice → same booking, no new notifications', async () => {
    const db = await setup();
    const slot = await addSlot(db);
    const key = randomUUID();
    const a = await start(db, ids.farmerA, slot, key);
    const b = await start(db, ids.farmerA, slot, key);
    assert.equal(a.payment_id, b.payment_id);
    assert.equal(await count(db, 'select count(*) from public.demo_payments'), 1);
    const c1 = await confirm(db, ids.farmerA, a.payment_id);
    const c2 = await confirm(db, ids.farmerA, a.payment_id);
    assert.equal(c2.booking_id, c1.booking_id); assert.equal(c2.already_confirmed, true);
    assert.equal(await count(db, 'select count(*) from public.consultation_bookings'), 1);
    assert.equal(await count(db, 'select count(*) from public.notifications'), 2);
    // a second attempt by the same farmer for the slot they already hold fails without a second booking
    const again = await start(db, ids.farmerA, slot).catch((e) => e);
    assert.match(String(again.message || ''), /just been booked/);
  });

  test('two farmers, one slot: exactly one booking; the loser gets slot_taken and nothing else changes', async () => {
    const db = await setup();
    const slot = await addSlot(db);
    const pa = await start(db, ids.farmerA, slot);
    const pb = await start(db, ids.farmerB, slot);        // both reach the checkout: pending attempts do not hold the slot
    assert.equal((await confirm(db, ids.farmerB, pb.payment_id)).status, 'succeeded');
    const lost = await confirm(db, ids.farmerA, pa.payment_id);
    assert.deepEqual([lost.status, lost.failure_reason, lost.booking_id], ['failed', 'slot_taken', null]);
    assert.equal(await count(db, 'select count(*) from public.consultation_bookings'), 1);
    assert.equal(await count(db, `select count(*) from public.notifications where user_id = $1`, [ids.farmerA]), 0);
    assert.equal((await confirm(db, ids.farmerA, pa.payment_id)).status, 'failed', 'a failed attempt never becomes confirmed');
  });

  test('cancel, expiry and ownership: none of them books; another farmer cannot confirm or cancel my attempt', async () => {
    const db = await setup();
    const slot = await addSlot(db);
    const p = await start(db, ids.farmerA, slot);
    await rejects(confirm(db, ids.farmerB, p.payment_id), /demo payment not found/);
    await rejects(as(db, ids.farmerB, 'select public.cancel_demo_payment($1)', [p.payment_id]), /demo payment not found/);
    assert.equal((await as(db, ids.farmerB, 'select id from public.demo_payments')).rows.length, 0, 'sees another farmer attempt');
    const c = (await as(db, ids.farmerA, 'select public.cancel_demo_payment($1) as r', [p.payment_id])).rows[0].r;
    assert.equal(c.status, 'cancelled');
    assert.equal((await confirm(db, ids.farmerA, p.payment_id)).status, 'cancelled', 'cancelled became confirmed');
    const q = await start(db, ids.farmerA, slot);
    await db.query(`update public.demo_payments set expires_at = now() - interval '1 second' where id = $1`, [q.payment_id]);
    assert.equal((await confirm(db, ids.farmerA, q.payment_id)).status, 'expired');
    const r = await start(db, ids.farmerA, slot);
    await db.query(`update public.demo_payments set expires_at = now() - interval '1 second' where id = $1`, [r.payment_id]);
    assert.equal((await db.query('select public.process_consultation_lifecycle() as r')).rows[0].r.demo_checkouts_expired, 1);
    assert.equal(await count(db, 'select count(*) from public.consultation_bookings'), 0);
    assert.equal((await one(db, 'select is_booked from public.consultation_slots where id = $1', [slot])).is_booked, false);
  });

  test('clients cannot write payments, pick the amount, or skip the checkout', async () => {
    const db = await setup();
    const slot = await addSlot(db);
    await rejects(as(db, ids.farmerA, `insert into public.demo_payments (farmer_user_id, slot_id, issue, amount_paise, idempotency_key, expires_at)
                                       values ($1, $2, 'x', 1, gen_random_uuid(), now() + interval '1 hour')`, [ids.farmerA, slot]));
    const p = await start(db, ids.farmerA, slot);
    await rejects(as(db, ids.farmerA, `update public.demo_payments set status = 'succeeded', amount_paise = 1 where id = $1`, [p.payment_id]));
    await rejects(as(db, ids.farmerA, 'select public.book_consultation_slot($1, $2)', [slot, 'skip the checkout']), /permission denied/);
    await rejects(as(db, ids.farmerA, `insert into public.consultation_bookings (expert_id, farmer_id, slot_id, meeting_date, meeting_time, status)
                                       select expert_id, gen_random_uuid(), id, slot_date, start_time, 'Booked' from public.consultation_slots where id = $1`, [slot]));
    // fee changed by the expert after the checkout opened → the old amount is not used
    await as(db, ids.expertUser, 'update public.consultation_slots set rate = 900 where id = $1', [slot]);
    assert.equal((await confirm(db, ids.farmerA, p.payment_id)).failure_reason, 'fee_changed');
    await rejects(as(db, null, 'select public.start_demo_checkout($1, $2, $3)', [slot, 'x', randomUUID()]), /permission denied|not authenticated/);
  });

  test('invalid fee configuration, own slot, past slot, inactive expert are refused at checkout', async () => {
    const db = await setup();
    const bad = await addSlot(db, { rate: 0 });       // superuser seed bypasses the slot guard
    await rejects(start(db, ids.farmerA, bad), /no valid fee/);
    await rejects(as(db, ids.expertUser, 'update public.consultation_slots set rate = -5 where id = $1', [await addSlot(db, { time: '12:00' })]), /fee must be between/);
    await rejects(as(db, ids.expertUser, `insert into public.consultation_slots (expert_id, slot_date, start_time, end_time, rate)
                                          values ($1, current_date + 3, '09:00', '09:30', 100000.001)`, [ids.expertRow]), /fee must be between/);
    await rejects(start(db, ids.expertUser, await addSlot(db, { time: '13:00' })), /own slot/);
    const past = (await addBookingStartingIn(db, -60)).slot_id;
    await db.query('update public.consultation_slots set is_booked = false where id = $1', [past]);
    await rejects(start(db, ids.farmerB, past), /already started/);
    const slot = await addSlot(db, { time: '15:00' });
    await db.query('update public.experts set is_active = false where id = $1', [ids.expertRow]);
    await rejects(start(db, ids.farmerA, slot), /not accepting/);
    await rejects(start(db, ids.farmerA, slot, randomUUID(), '   '), /describe your issue/);
  });
});

describe('14 — Google Meet links', () => {
  test('link validation: only https://meet.google.com/<code>, normalised', async () => {
    const db = await setup();
    const n = async (v) => (await db.query('select public.normalize_meet_link($1) as v', [v])).rows[0].v;
    assert.equal(await n('  HTTPS://Meet.Google.com/ABC-DEFG-HIJ?authuser=0 '), LINK);
    assert.equal(await n('https://meet.google.com/abc-defg-hij/'), LINK);
    for (const bad of ['http://meet.google.com/abc-defg-hij', 'https://meet.google.com.attacker.example/abc-defg-hij',
      'https://evil.example/meet.google.com/abc-defg-hij', 'https://user:pw@meet.google.com/abc-defg-hij',
      'https://meet.google.com:8443/abc-defg-hij', 'https://meet.google.com:443/abc-defg-hij', 'javascript:alert(1)//https://meet.google.com/abc-defg-hij',
      'data:text/html,meet.google.com', 'https://meet.google.com/', 'https://meet.google.com/abc-defg-hij#x',
      'https://meet.google.com/abc defg hij', 'https://meet.google.com/abc-defg-hij\n.evil', 'meet.google.com/abc-defg-hij',
      '   ', '', null]) {
      assert.equal(await n(bad), null, `accepted ${JSON.stringify(bad)}`);
    }
  });

  test('only the booking\'s expert saves the link; the farmer is notified once; same link again notifies nobody; update notifies once', async () => {
    const db = await setup();
    const b = await addBookingStartingIn(db, 120);
    const stranger = await otherExpert(db);
    await rejects(setLink(db, ids.farmerA, b.id), /Only the expert/);
    await rejects(setLink(db, stranger, b.id), /not a participant/);
    await rejects(setLink(db, ids.farmerB, b.id), /not a participant/);
    await rejects(setLink(db, ids.expertUser, b.id, 'https://meet.google.com.attacker.example/abc-defg-hij'), /valid Google Meet link/);
    await rejects(as(db, ids.expertUser, 'update public.video_meetings set meeting_link = $2 where booking_id = $1', [b.id, LINK]));
    assert.equal(await count(db, 'select count(*) from public.notifications'), 0, 'notified before a successful save');
    const r1 = await setLink(db, ids.expertUser, b.id, LINK + '?authuser=1');
    assert.deepEqual([r1.changed, r1.meeting_link], [true, LINK]);
    assert.equal((await setLink(db, ids.expertUser, b.id)).changed, false);       // retry
    const notes = () => db.query(`select message from public.notifications where user_id = $1 and related_id = $2`, [ids.farmerA, b.id]).then((x) => x.rows.map((r) => r.message));
    assert.equal((await notes()).length, 1);
    assert.match((await notes())[0], /added the Google Meet link/);
    assert.doesNotMatch((await notes())[0], /meet\.google\.com/, 'link inside the notification');
    await setLink(db, ids.expertUser, b.id, 'https://meet.google.com/xyz-abcd-efg');
    assert.equal((await notes()).filter((m) => /updated the Google Meet link/.test(m)).length, 1);
    assert.equal(await count(db, 'select count(*) from public.video_meetings where booking_id = $1', [b.id]), 1, 'duplicate rows');
    // visibility: the two participants only
    assert.equal((await as(db, ids.farmerA, 'select meeting_link from public.video_meetings where booking_id = $1', [b.id])).rows[0].meeting_link, 'https://meet.google.com/xyz-abcd-efg');
    assert.equal((await as(db, ids.farmerB, 'select meeting_link from public.video_meetings where booking_id = $1', [b.id])).rows.length, 0);
    assert.equal((await as(db, stranger, 'select meeting_link from public.video_meetings where booking_id = $1', [b.id])).rows.length, 0);
    assert.equal((await as(db, null, 'select meeting_link from public.video_meetings')).rows.length, 0);
    // push queue got exactly the two link notifications for the farmer, without the link
    const pushes = (await db.query(`select body from public.push_outbox where user_id = $1`, [ids.farmerA])).rows;
    assert.equal(pushes.length, 2);
    for (const p of pushes) assert.doesNotMatch(p.body, /meet\.google\.com/);
  });

  test('cancelled / completed / ended bookings: no link changes', async () => {
    const db = await setup();
    const c = await addBookingStartingIn(db, 120);
    await db.query(`update public.consultation_bookings set status = 'Cancelled' where id = $1`, [c.id]);
    await rejects(setLink(db, ids.expertUser, c.id), /no longer active/);
    const ended = await addBookingStartingIn(db, -45, { farmer: ids.farmerB });
    await rejects(setLink(db, ids.expertUser, ended.id), /has ended/);
  });

  test('join: window enforced, link returned only inside it, refused without a link', async () => {
    const db = await setup();
    const early = await addBookingStartingIn(db, 30);
    await setLink(db, ids.expertUser, early.id);
    await rejects(as(db, ids.farmerA, 'select public.join_consultation($1)', [early.id]), /Too early/);
    const now = await addBookingStartingIn(db, 3, { farmer: ids.farmerB });
    await rejects(as(db, ids.farmerB, 'select public.join_consultation($1)', [now.id]), /not added the Google Meet link/);
    await rejects(as(db, ids.expertUser, 'select public.join_consultation($1)', [now.id]), /Add the Google Meet link first/);
    await setLink(db, ids.expertUser, now.id);
    const j = (await as(db, ids.farmerB, 'select public.join_consultation($1) as r', [now.id])).rows[0].r;
    assert.equal(j.meeting_link, LINK); assert.equal(j.role, 'farmer');
    await rejects(as(db, ids.farmerA, 'select public.join_consultation($1)', [now.id]), /not a participant/);
    await db.query(`update public.consultation_bookings set status = 'Cancelled' where id = $1`, [now.id]);
    await rejects(as(db, ids.farmerB, 'select public.join_consultation($1)', [now.id]), /cancelled/);
  });
});

describe('14 — completion, scheduler and reviews', () => {
  test('completion: only the assigned expert, after start, with a link; idempotent; farmer/other expert/cancelled refused', async () => {
    const db = await setup();
    const b = await addBookingStartingIn(db, -2);
    const stranger = await otherExpert(db);
    await rejects(as(db, ids.expertUser, 'select public.complete_consultation($1)', [b.id]), /Add the Google Meet link/);
    await db.query(`update public.video_meetings set meeting_link = $2 where booking_id = $1`, [b.id, LINK]);
    await db.query(`insert into public.video_meetings (booking_id, meeting_link) select $1, $2 where not exists (select 1 from public.video_meetings where booking_id = $1)`, [b.id, LINK]);
    await rejects(as(db, ids.farmerA, 'select public.complete_consultation($1)', [b.id]), /Only the expert/);
    await rejects(as(db, stranger, 'select public.complete_consultation($1)', [b.id]), /not a participant/);
    await as(db, ids.expertUser, 'select public.complete_consultation($1)', [b.id]);
    await as(db, ids.expertUser, 'select public.complete_consultation($1)', [b.id]);   // duplicate request
    const row = await one(db, 'select status, completion_source from public.consultation_bookings where id = $1', [b.id]);
    assert.deepEqual([row.status, row.completion_source], ['Completed', 'expert']);
    assert.equal(await count(db, `select count(*) from public.notifications where related_id = $1 and message like '%Please rate%'`, [b.id]), 1);
    await rejects(as(db, ids.farmerA, `update public.consultation_bookings set status = 'Booked' where id = $1`, [b.id]));
    const x = await addBookingStartingIn(db, -3, { farmer: ids.farmerB });
    await db.query(`update public.consultation_bookings set status = 'Cancelled' where id = $1`, [x.id]);
    await rejects(as(db, ids.expertUser, 'select public.complete_consultation($1)', [x.id]), /not active/);
  });

  test('scheduler: no link 5 min after start → cancelled with demo refund; link but never completed → closed 24 h after the slot as slot_ended', async () => {
    const db = await setup();
    const noLink = await addBookingStartingIn(db, -6);
    const withLink = await addBookingStartingIn(db, -7, { farmer: ids.farmerB });
    await db.query(`insert into public.video_meetings (booking_id, meeting_link) values ($1, $2) on conflict (booking_id) do update set meeting_link = excluded.meeting_link`, [withLink.id, LINK]);
    const old = await addBookingStartingIn(db, -(25 * 60));
    await db.query(`insert into public.video_meetings (booking_id, meeting_link) values ($1, $2) on conflict (booking_id) do update set meeting_link = excluded.meeting_link`, [old.id, LINK]);
    const r = (await db.query('select public.process_consultation_lifecycle() as r')).rows[0].r;
    assert.equal(r.no_shows, 1); assert.equal(r.closed_after_slot, 1);
    const s = async (id) => one(db, 'select status, completion_source, refund_status from public.consultation_bookings where id = $1', [id]);
    assert.deepEqual(Object.values(await s(noLink.id)), ['Cancelled', null, 'Pending']);
    assert.deepEqual(Object.values(await s(withLink.id)).slice(0, 2), ['Booked', null], 'a meeting with a link is not cancelled or completed early');
    assert.deepEqual(Object.values(await s(old.id)).slice(0, 2), ['Completed', 'slot_ended']);
    const msg = (await one(db, `select message from public.notifications where related_id = $1 and message like '%auto-cancelled%'`, [noLink.id])).message;
    assert.match(msg, /demo refund/); assert.match(msg, /no real money/);
    await db.query('select public.process_consultation_lifecycle()');
    assert.equal(await count(db, `select count(*) from public.notifications where related_id = $1 and message like '%closed after its scheduled time%'`, [old.id]), 1);
  });

  test('reviews: own completed booking only, once, ≤ 1000 chars, rating 1–5; cannot be moved to another booking', async () => {
    const db = await setup();
    const b = await addBookingStartingIn(db, -40);
    const open = await addBookingStartingIn(db, 300);
    await db.query(`update public.consultation_bookings set status = 'Completed' where id = $1`, [b.id]);
    const review = (uid, booking, rating = 5, comment = 'Helpful') => as(db, uid,
      `insert into public.reviews (booking_id, reviewer_id, expert_id, rating, comment) values ($1, $2, $3, $4, $5)`,
      [booking, uid, ids.expertRow, rating, comment]);
    await rejects(review(ids.farmerB, b.id), /only review your own/);
    await rejects(review(ids.farmerA, open.id), /only review your own/);
    await rejects(review(ids.farmerA, b.id, 6));
    await rejects(review(ids.farmerA, b.id, 4, 'x'.repeat(1001)), /under 1000/);
    await review(ids.farmerA, b.id);
    await rejects(review(ids.farmerA, b.id), /already been reviewed|duplicate/);
    await rejects(as(db, ids.farmerA, 'update public.reviews set booking_id = $2 where booking_id = $1', [b.id, open.id]), /stays with its consultation/);
    await as(db, ids.farmerA, 'update public.reviews set rating = 4 where booking_id = $1', [b.id]);   // editing own rating still works
    assert.equal(Number((await one(db, 'select rating from public.experts where id = $1', [ids.expertRow])).rating), 4);
  });

  test('re-runnable', async () => {
    const db = await setup();
    await db.exec((await import('node:fs')).readFileSync(new URL('../../supabase/proposed/14_meet_links_and_demo_payment.sql', import.meta.url), 'utf8'));
    assert.equal(await count(db, `select count(*) from pg_trigger where tgname = 'guard_reviews_update'`), 1);
  });
});
