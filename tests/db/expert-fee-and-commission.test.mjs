// SQL behaviour tests for supabase/proposed/15 (expert fee, booking fee snapshot, 2 % commission, admin reporting) on
// the REAL production schema in PGlite (01–15 applied, like staging). Run with: npm run test:db
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDb, as, ids, seed, addSlot, addBookingStartingIn, rejects, ALL } from './harness.mjs';

const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];
const count = async (db, sql, params) => Number((await db.query(sql, params)).rows[0].count);
const setup = async () => {
  const db = await createDb({ proposed: [...ALL, '09', '11', '12', '13', '14', '15'] });
  await seed(db);
  return db;
};
const setFee = (db, uid, paise) => as(db, uid, 'select public.set_consultation_fee($1) as v', [paise]).then((r) => r.rows[0].v);
const start = (db, uid, slot, key = randomUUID()) =>
  as(db, uid, 'select public.start_demo_checkout($1, $2, $3) as r', [slot, 'Leaf curl', key]).then((x) => x.rows[0].r);
const confirm = (db, uid, payment) =>
  as(db, uid, 'select public.confirm_demo_payment($1) as r', [payment]).then((x) => x.rows[0].r);
const book = async (db, uid, slot) => confirm(db, uid, (await start(db, uid, slot)).payment_id);
const pay = (db, booking) => one(db, 'select * from public.demo_payments where booking_id = $1', [booking]);

describe('15 — the expert sets one fee; everything uses it', () => {
  test('backfill: the expert\'s most common slot rate becomes the fee; the column is required and range-checked', async () => {
    const db = await createDb({ proposed: [...ALL, '09', '11', '12', '13', '14'] });
    await seed(db);
    for (const [t, r] of [['09:00', 450], ['10:00', 450], ['11:00', 300]]) await addSlot(db, { time: t, rate: r });
    await db.exec((await import('node:fs')).readFileSync(new URL('../../supabase/proposed/15_expert_fee_and_commission.sql', import.meta.url), 'utf8'));
    assert.equal((await one(db, 'select consultation_fee_paise from public.experts where id = $1', [ids.expertRow])).consultation_fee_paise, 45000);
    await rejects(db.query('update public.experts set consultation_fee_paise = 50 where id = $1', [ids.expertRow]), /experts_consultation_fee_range/);
  });

  test('only the expert changes it, through the setting, within ₹1–₹1,00,000; nobody writes the column directly', async () => {
    const db = await setup();
    assert.equal(await setFee(db, ids.expertUser, 100000), 100000);
    assert.equal(await setFee(db, ids.expertUser, 100000), 100000);   // double submit: same result, nothing else
    for (const bad of [0, 99, -500, 10000001, null]) await rejects(setFee(db, ids.expertUser, bad), /between ₹1 and ₹1,00,000/);
    await rejects(as(db, ids.expertUser, 'select public.set_consultation_fee($1)', ['NaN']));
    await rejects(setFee(db, ids.farmerA, 30000), /Only experts/);
    await rejects(as(db, null, 'select public.set_consultation_fee(30000)'), /permission denied|not authenticated/);
    await rejects(as(db, ids.expertUser, 'update public.experts set consultation_fee_paise = 1000 where id = $1', [ids.expertRow]), /consultation fee setting/);
    await rejects(as(db, ids.admin, 'update public.experts set consultation_fee_paise = 1000 where id = $1', [ids.expertRow]), /consultation fee setting/);
    // a farmer's UPDATE matches no row at all (RLS): silently nothing — checked right below
    await as(db, ids.farmerA, 'update public.experts set consultation_fee_paise = 1000 where id = $1', [ids.expertRow]);
    assert.equal((await one(db, 'select consultation_fee_paise from public.experts where id = $1', [ids.expertRow])).consultation_fee_paise, 100000);
    // admin: only through the audited function, with a reason
    await rejects(as(db, ids.farmerA, 'select public.admin_set_consultation_fee($1, 20000, $2)', [ids.expertRow, 'x']), /Admin privileges/);
    await rejects(as(db, ids.admin, 'select public.admin_set_consultation_fee($1, 20000, $2)', [ids.expertRow, ' ']), /reason is required/);
    await as(db, ids.admin, 'select public.admin_set_consultation_fee($1, 120000, $2)', [ids.expertRow, 'expert asked by phone']);
    const log = await one(db, `select details from public.admin_audit_log where action = 'set_consultation_fee'`);
    assert.deepEqual([log.details.previous_fee_paise, log.details.new_fee_paise], [100000, 120000]);
  });

  test('checkout quotes the expert\'s fee, whatever the legacy slot rate says', async () => {
    const db = await setup();
    await setFee(db, ids.expertUser, 100000);
    const slot = await addSlot(db, { rate: 300 });
    const p = await start(db, ids.farmerA, slot);
    assert.deepEqual([p.amount_paise, p.currency, p.transaction_type], [100000, 'INR', 'simulated']);
    assert.equal(p.demo, undefined, 'no user-facing demo flag');
  });
});

describe('15 — commission (2 %) and the booking snapshot', () => {
  test('₹1,000 → commission ₹20, expert share ₹980; stored once on the accounting record', async () => {
    const db = await setup();
    await setFee(db, ids.expertUser, 100000);
    const c = await book(db, ids.farmerA, await addSlot(db));
    assert.equal(c.status, 'succeeded');
    const p = await pay(db, c.booking_id);
    assert.deepEqual([p.amount_paise, p.commission_bps, p.commission_paise, p.expert_share_paise, p.transaction_type], [100000, 200, 2000, 98000, 'simulated']);
    await confirm(db, ids.farmerA, p.id);   // retry
    const again = await pay(db, c.booking_id);
    assert.deepEqual([again.commission_paise, again.expert_share_paise], [2000, 98000], 'commission applied twice');
    assert.equal(await count(db, 'select count(*) from public.demo_payments where booking_id = $1', [c.booking_id]), 1);
  });

  test('rounding: half up in paise, and commission + share = fee for every amount', async () => {
    const db = await setup();
    const r = (await db.query(`select f, public._commission_paise(f, 200) c from (values (100), (125), (149), (150), (24999), (25000), (33333), (10000000)) v(f)`)).rows;
    assert.deepEqual(r.map((x) => x.c), [2, 3, 3, 3, 500, 500, 667, 200000]);
    const bad = await one(db, `select count(*) from generate_series(100, 20000) f
                               where public._commission_paise(f, 200) + (f - public._commission_paise(f, 200)) <> f
                                  or public._commission_paise(f, 200) <> round(f * 0.02)`);
    assert.equal(Number(bad.count), 0);
  });

  test('the farmer pays exactly the quoted fee (no extra charge); a fee change makes the quote stale', async () => {
    const db = await setup();
    await setFee(db, ids.expertUser, 100000);
    const slot = await addSlot(db);
    const q = await start(db, ids.farmerA, slot);
    await setFee(db, ids.expertUser, 120000);
    const stale = await confirm(db, ids.farmerA, q.payment_id);
    assert.deepEqual([stale.status, stale.failure_reason, stale.current_amount_paise, stale.booking_id], ['failed', 'fee_changed', 120000, null]);
    assert.equal(await count(db, 'select count(*) from public.consultation_bookings'), 0);
    const fresh = await start(db, ids.farmerA, slot);
    assert.equal(fresh.amount_paise, 120000);
    const ok = await confirm(db, ids.farmerA, fresh.payment_id);
    assert.equal(ok.amount_paise, 120000, 'farmer total differs from the fee');
  });

  test('a later fee change never rewrites a confirmed booking; nobody can edit the snapshot', async () => {
    const db = await setup();
    await setFee(db, ids.expertUser, 100000);
    const c = await book(db, ids.farmerA, await addSlot(db));
    await setFee(db, ids.expertUser, 120000);
    const p = await pay(db, c.booking_id);
    assert.deepEqual([p.amount_paise, p.commission_paise, p.expert_share_paise], [100000, 2000, 98000]);
    await rejects(as(db, ids.farmerA, 'update public.demo_payments set commission_paise = 0 where id = $1', [p.id]));
    await rejects(as(db, ids.expertUser, 'update public.demo_payments set expert_share_paise = 100000 where id = $1', [p.id]));
    await rejects(db.query('update public.demo_payments set amount_paise = 120000 where id = $1', [p.id]), /cannot be changed/);   // not even the service role / SQL editor
    await rejects(db.query('update public.demo_payments set commission_bps = 0 where id = $1', [p.id]), /cannot be changed/);
    await rejects(db.query('update public.demo_payments set commission_paise = 1 where id = $1', [p.id]), /cannot be changed|split_check/);
  });

  test('refunds use the agreed fee: farmer cancels → 50 % of ₹1,000; no-show → 100 %, wording without "demo"', async () => {
    const db = await setup();
    await setFee(db, ids.expertUser, 100000);
    const c = await book(db, ids.farmerA, await addSlot(db, { rate: 300 }));
    await setFee(db, ids.expertUser, 70000);
    const refund = (await as(db, ids.farmerA, `select public.cancel_consultation_booking($1, 'cannot attend') as r`, [c.booking_id])).rows[0].r;
    assert.equal(Number(refund), 500);
    // no-show: a booking with a payment snapshot, start 6 minutes ago, no link
    const b = await addBookingStartingIn(db, -6, { farmer: ids.farmerB, rate: 300 });
    const fp = (await one(db, 'select user_id from public.farmer_profiles where id = (select farmer_id from public.consultation_bookings where id = $1)', [b.id])).user_id;
    await db.query(`insert into public.demo_payments (farmer_user_id, slot_id, expert_id, booking_id, issue, amount_paise, status, idempotency_key, expires_at, confirmed_at, commission_bps, commission_paise, expert_share_paise)
                    values ($1, $2, $3, $4, 'x', 80000, 'succeeded', gen_random_uuid(), now(), now(), 200, 1600, 78400)`, [fp, b.slot_id, ids.expertRow, b.id]);
    await db.query('select public.process_consultation_lifecycle()');
    assert.equal(Number((await one(db, 'select refund_amount from public.consultation_bookings where id = $1', [b.id])).refund_amount), 800);
    const msgs = (await db.query('select message from public.notifications where related_id = $1', [b.id])).rows.map((r) => r.message).join(' | ');
    assert.match(msgs, /full refund of ₹800/);
    assert.doesNotMatch(msgs, /demo|simulated|no real money/i);
  });
});

describe('15 — admin reporting', () => {
  const seedBookings = async (db) => {
    await setFee(db, ids.expertUser, 100000);
    const a = await book(db, ids.farmerA, await addSlot(db, { time: '09:00' }));
    const b = await book(db, ids.farmerB, await addSlot(db, { time: '10:00' }));
    await setFee(db, ids.expertUser, 120000);
    const c = await book(db, ids.farmerA, await addSlot(db, { time: '11:00' }));
    await as(db, ids.farmerB, `select public.cancel_consultation_booking($1, 'changed plans')`, [b.booking_id]);
    await as(db, ids.expertUser, 'select public.set_meeting_link($1, $2)', [a.booking_id, 'https://meet.google.com/abc-defg-hij']);
    await start(db, ids.farmerB, await addSlot(db, { time: '12:00' }));   // checkout in progress, not a booking
    return { a, b, c };
  };

  test('admin only; summary totals match the rows (money only for succeeded, non-cancelled bookings)', async () => {
    const db = await setup();
    const { a, c } = await seedBookings(db);
    for (const fn of ['admin_consultations()', 'admin_consultation_summary()', `admin_consultation_detail('${a.booking_id}')`]) {
      await rejects(as(db, ids.farmerA, `select public.${fn}`), /Admin privileges/);
      await rejects(as(db, ids.expertUser, `select public.${fn}`), /Admin privileges/);
      await rejects(as(db, null, `select public.${fn}`), /permission denied|Admin privileges/);
    }
    const s = (await as(db, ids.admin, 'select public.admin_consultation_summary() as s')).rows[0].s;
    assert.deepEqual([s.total, s.confirmed_upcoming, s.completed, s.cancelled, s.awaiting_link, s.reviews, s.pending_checkouts], [3, 2, 0, 1, 1, 0, 1]);
    assert.deepEqual([s.value_paise, s.commission_paise, s.expert_share_paise, s.cancelled_value_paise], [220000, 4400, 215600, 100000]);
    const list = (await as(db, ids.admin, 'select public.admin_consultations() as l')).rows[0].l;
    assert.equal(list.total, 3);
    const live = list.rows.filter((r) => r.status !== 'Cancelled');
    assert.equal(live.reduce((t, r) => t + r.amount_paise, 0), s.value_paise);
    assert.equal(live.reduce((t, r) => t + r.commission_paise + r.expert_share_paise, 0), s.value_paise);
    const rowA = list.rows.find((r) => r.booking_id === a.booking_id);
    assert.deepEqual([rowA.amount_paise, rowA.commission_paise, rowA.expert_share_paise, rowA.transaction_type, rowA.link_saved], [100000, 2000, 98000, 'simulated', true]);
    assert.equal(rowA.meeting_link, undefined, 'link in the list');
    assert.equal(list.rows.find((r) => r.booking_id === c.booking_id).amount_paise, 120000);
  });

  test('filters and pagination run on the server and never drop rows', async () => {
    const db = await setup();
    const { a } = await seedBookings(db);
    const q = async (f, limit = 25, offset = 0) => (await as(db, ids.admin, 'select public.admin_consultations($1, $2, $3) as l', [JSON.stringify(f), limit, offset])).rows[0].l;
    assert.equal((await q({ status: 'Cancelled' })).total, 1);
    assert.equal((await q({ link: 'saved' })).rows[0].booking_id, a.booking_id);
    assert.equal((await q({ link: 'missing', status: 'Booked' })).total, 1);
    assert.equal((await q({ review: 'reviewed' })).total, 0);
    assert.equal((await q({ payment: 'succeeded' })).total, 3);
    assert.equal((await q({ completion: 'open' })).total, 2);
    assert.equal((await q({ q: 'farmer-b' })).total, 1);
    assert.equal((await q({ from_date: '2999-01-01' })).total, 0);
    const pages = [await q({}, 1, 0), await q({}, 1, 1), await q({}, 1, 2), await q({}, 1, 3)];
    assert.deepEqual(pages.map((p) => p.rows.length), [1, 1, 1, 0]);
    assert.equal(new Set(pages.flatMap((p) => p.rows.map((r) => r.booking_id))).size, 3);
    const s = (await as(db, ids.admin, 'select public.admin_consultation_summary($1) as s', [JSON.stringify({ status: 'Booked' })])).rows[0].s;
    assert.equal(s.total, 2);
  });

  test('detail shows the link, timestamps, notifications; admin completion is recorded as admin', async () => {
    const db = await setup();
    const { a } = await seedBookings(db);
    const d = (await as(db, ids.admin, 'select public.admin_consultation_detail($1) as d', [a.booking_id])).rows[0].d;
    assert.equal(d.meeting_link, 'https://meet.google.com/abc-defg-hij');
    assert.ok(d.confirmed_at && d.created_at && d.meeting_link_set_at);
    assert.ok(d.notifications.some((n) => n.recipient === 'expert') && d.notifications.some((n) => n.recipient === 'farmer'));
    assert.ok(d.notifications.every((n) => n.push === 'queued'), 'push queue state shown');
    await as(db, ids.admin, `select public.admin_update_booking_status($1, 'Completed')`, [a.booking_id]);
    assert.equal((await one(db, 'select completion_source from public.consultation_bookings where id = $1', [a.booking_id])).completion_source, 'admin');
  });

  test('re-runnable', async () => {
    const db = await setup();
    await setFee(db, ids.expertUser, 100000);
    const c = await book(db, ids.farmerA, await addSlot(db));
    await db.exec((await import('node:fs')).readFileSync(new URL('../../supabase/proposed/15_expert_fee_and_commission.sql', import.meta.url), 'utf8'));
    assert.equal((await pay(db, c.booking_id)).commission_paise, 2000);
    assert.equal((await one(db, 'select consultation_fee_paise from public.experts where id = $1', [ids.expertRow])).consultation_fee_paise, 100000);
  });
});
