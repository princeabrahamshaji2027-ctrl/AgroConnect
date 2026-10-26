// SQL behaviour tests for supabase/proposed/18 (cancellation rules, refunds, refund accounting) on the REAL production
// schema in PGlite (01–18 applied, like staging). Run with: npm run test:db
// Owner rules (2026-10-26): farmer/expert may cancel any time while Booked; expert/admin/system cancellation → full refund;
// farmer ≥ 14 h before start → full refund; farmer later → expert keeps half, AgroConnect its 2 %, farmer gets the rest.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, as, ids, seed, signUp, addBookingStartingIn, rejects, ALL } from './harness.mjs';

const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];
const count = async (db, sql, params) => Number((await db.query(sql, params)).rows[0].count);
const setup = async () => {
  const db = await createDb({ proposed: [...ALL, '09', '11', '12', '13', '14', '15', '16', '17', '18', '19'] });
  await seed(db);
  return db;
};
// A Booked booking starting `minutes` from now with a confirmed (simulated) payment of `fee` paise.
async function paidBooking(db, minutes, { farmer = ids.farmerA, fee = 100000 } = {}) {
  const b = await addBookingStartingIn(db, minutes, { farmer, rate: fee / 100 });
  await db.query(`insert into public.demo_payments (farmer_user_id, slot_id, expert_id, booking_id, issue, amount_paise, status,
                    idempotency_key, expires_at, confirmed_at, commission_bps, commission_paise, expert_share_paise)
                  values ($1, $2, $3, $4, 'x', $5, 'succeeded', gen_random_uuid(), now(), now(), 200,
                          public._commission_paise($5, 200), $5 - public._commission_paise($5, 200))`,
  [farmer, b.slot_id, ids.expertRow, b.id, fee]);
  return b;
}
const cancel = (db, uid, id, reason = 'Cannot make it', slots = []) =>
  as(db, uid, 'select public.cancel_consultation_booking($1, $2, $3) as r', [id, reason, JSON.stringify(slots)]).then((x) => Number(x.rows[0].r));
const adj = (db, id) => one(db, 'select * from public.demo_payment_adjustments where booking_id = $1', [id]);
const booking = (db, id) => one(db, 'select * from public.consultation_bookings where id = $1', [id]);

describe('18 — the 14-hour boundary (database clock)', () => {
  test('exactly 14 h before the start is still "before" (full refund); one second later is late', async () => {
    const db = await setup();
    const b = await paidBooking(db, 3 * 24 * 60);
    const start = (await one(db, 'select public.consultation_start(meeting_date, meeting_time) s from public.consultation_bookings where id = $1', [b.id])).s;
    const at = async (offsetSec) => (await db.query(`select public._cancellation_terms($1, 'farmer', $2::timestamptz - interval '14 hours' + make_interval(secs => $3)) t`,
      [b.id, start, offsetSec])).rows[0].t;
    const exact = await at(0);
    assert.deepEqual([exact.rule, exact.refund_paise, exact.full_refund], ['farmer_early', 100000, true]);
    const late = await at(1);
    assert.deepEqual([late.rule, late.refund_paise, late.expert_keeps_paise, late.platform_keeps_paise], ['farmer_late', 48000, 50000, 2000]);
    assert.equal((await at(-3600)).rule, 'farmer_early');
    // 6:00 PM meeting → boundary 4:00:00 AM the same day
    assert.equal(new Date(new Date(exact.starts_at).getTime() - 14 * 3600e3).toISOString(), new Date(exact.cutoff_at).toISOString());
  });
});

describe('18 — who cancels, what is refunded, how it is accounted', () => {
  test('farmer ≥ 14 h before: full refund; snapshot untouched; adjustment reverses commission and share (nets to zero)', async () => {
    const db = await setup();
    const b = await paidBooking(db, 20 * 60);
    assert.equal(await cancel(db, ids.farmerA, b.id), 1000);
    const row = await booking(db, b.id);
    assert.deepEqual([row.status, row.cancelled_by_role, row.cancellation_rule, row.refund_paise, row.refund_status, row.cancelled_by],
      ['Cancelled', 'farmer', 'farmer_early', 100000, 'Pending', ids.farmerA]);
    assert.ok(row.cancelled_at);
    const a = await adj(db, b.id);
    assert.deepEqual([a.amount_paise, a.commission_reversal_paise, a.expert_share_reversal_paise], [100000, 2000, 98000]);
    const p = await one(db, 'select amount_paise, commission_paise, expert_share_paise from public.demo_payments where booking_id = $1', [b.id]);
    assert.deepEqual([p.amount_paise, p.commission_paise, p.expert_share_paise], [100000, 2000, 98000], 'snapshot changed');
    assert.equal((await one(db, 'select is_booked from public.consultation_slots where id = $1', [b.slot_id])).is_booked, false);
  });

  test('farmer later than 14 h before: expert keeps 50 %, AgroConnect 2 %, farmer refunded 48 %; still allowed after the start', async () => {
    const db = await setup();
    const b = await paidBooking(db, 3 * 60);
    assert.equal(await cancel(db, ids.farmerA, b.id), 480);
    const a = await adj(db, b.id);
    assert.deepEqual([a.amount_paise, a.commission_reversal_paise, a.expert_share_reversal_paise, a.rule], [48000, 0, 48000, 'farmer_late']);
    const msg = (await one(db, `select message from public.notifications where user_id = $1 and related_id = $2 and message like 'You cancelled%'`, [ids.farmerA, b.id])).message;
    assert.match(msg, /refund of ₹480\.00.*₹500\.00 goes to the expert and ₹20\.00 to AgroConnect/);
    const started = await paidBooking(db, -10, { farmer: ids.farmerB, fee: 45001 });   // odd fee, already started
    assert.equal(await cancel(db, ids.farmerB, started.id), (45001 - 22501 - 900) / 100);
    const a2 = await adj(db, started.id);
    assert.equal(a2.commission_reversal_paise + a2.expert_share_reversal_paise, a2.amount_paise);
  });

  test('expert cancels (any time, even inside 14 h): full refund to the farmer, reschedule note in the chat', async () => {
    const db = await setup();
    const b = await paidBooking(db, 60);
    await rejects(cancel(db, ids.expertUser, b.id, 'Sick'), /offer at least one alternative/);
    assert.equal(await cancel(db, ids.expertUser, b.id, 'Sick', [{ date: '2030-01-01', time: '10:00' }]), 1000);
    const row = await booking(db, b.id);
    assert.deepEqual([row.cancellation_rule, row.refund_paise], ['expert_cancel', 100000]);
    assert.deepEqual(Object.values(await one(db, 'select amount_paise, commission_reversal_paise, expert_share_reversal_paise from public.demo_payment_adjustments where booking_id = $1', [b.id])), [100000, 2000, 98000]);
    assert.match((await one(db, `select message from public.notifications where user_id = $1 and related_id = $2`, [ids.farmerA, b.id])).message, /cancelled by the expert\. A full refund of ₹1000\.00/);
    const m = await one(db, `select m.message_type, m.sender_id, m.metadata from public.messages m`);
    assert.deepEqual([m.message_type, m.sender_id], ['cancellation_reschedule', ids.expertUser]);
    assert.equal(m.metadata.booking_id, b.id);
  });

  test('repeated and concurrent cancellation: one cancellation, one adjustment, same refund returned', async () => {
    const db = await setup();
    const b = await paidBooking(db, 3 * 60);
    const r = await Promise.all([cancel(db, ids.farmerA, b.id), cancel(db, ids.farmerA, b.id)]);
    assert.deepEqual(r, [480, 480]);
    assert.equal(await cancel(db, ids.farmerA, b.id, 'again'), 480);
    assert.equal(await count(db, 'select count(*) from public.demo_payment_adjustments where booking_id = $1', [b.id]), 1);
    assert.equal(await count(db, `select count(*) from public.notifications where related_id = $1 and message like 'Meeting on%'`, [b.id]), 1);
  });

  test('refused: strangers, other farmer, completed bookings, empty reason; nobody writes the ledger directly', async () => {
    const db = await setup();
    const b = await paidBooking(db, 20 * 60);
    await rejects(cancel(db, ids.farmerB, b.id), /not a participant/);
    const stranger = 'aaaaaaaa-0000-4000-8000-000000000009';
    await signUp(db, stranger, 'expert2@test.local');
    await db.query(`insert into public.experts (user_id, verified_date) values ($1, current_date)`, [stranger]);
    await rejects(cancel(db, stranger, b.id, 'x', [{ date: '2030-01-01' }]), /not a participant/);
    await rejects(cancel(db, ids.farmerA, b.id, '   '), /cancellation reason/);
    await db.query(`update public.consultation_bookings set status = 'Completed' where id = $1`, [b.id]);
    await rejects(cancel(db, ids.farmerA, b.id), /already been completed/);
    await rejects(as(db, ids.farmerA, `insert into public.demo_payment_adjustments (demo_payment_id, booking_id, amount_paise, commission_reversal_paise, expert_share_reversal_paise, rule)
                                       select id, booking_id, 1, 0, 1, 'x' from public.demo_payments limit 1`));
    await rejects(as(db, ids.farmerA, `update public.consultation_bookings set status = 'Cancelled', refund_paise = 999999 where id = $1`, [b.id]));
  });

  test('quote: the participant sees exactly what cancelling now would do; strangers get nothing', async () => {
    const db = await setup();
    const b = await paidBooking(db, 3 * 60);
    const q = (await as(db, ids.farmerA, 'select public.consultation_cancellation_quote($1) q', [b.id])).rows[0].q;
    assert.deepEqual([q.role, q.allowed, q.rule, q.refund_paise], ['farmer', true, 'farmer_late', 48000]);
    const qe = (await as(db, ids.expertUser, 'select public.consultation_cancellation_quote($1) q', [b.id])).rows[0].q;
    assert.deepEqual([qe.role, qe.rule, qe.refund_paise], ['expert', 'expert_cancel', 100000]);
    await rejects(as(db, ids.farmerB, 'select public.consultation_cancellation_quote($1)', [b.id]), /not found/);
    assert.equal(await count(db, 'select count(*) from public.consultation_bookings where status = $1', ['Cancelled']), 0, 'quote changed something');
  });
});

describe('18 — admin and scheduler', () => {
  test('admin cancels with a reason (full refund, audit entry); the status function can no longer cancel', async () => {
    const db = await setup();
    const b = await paidBooking(db, 30);
    await rejects(as(db, ids.farmerA, `select public.admin_cancel_booking($1, 'x')`, [b.id]), /Admin privileges/);
    await rejects(as(db, ids.admin, `select public.admin_cancel_booking($1, ' ')`, [b.id]), /cancellation reason/);
    await rejects(as(db, ids.admin, `select public.admin_update_booking_status($1, 'Cancelled')`, [b.id]), /admin_cancel_booking/);
    const t = (await as(db, ids.admin, `select public.admin_cancel_booking($1, 'Expert unreachable') t`, [b.id])).rows[0].t;
    assert.deepEqual([t.rule, t.refund_paise], ['admin_cancel', 100000]);
    const row = await booking(db, b.id);
    assert.deepEqual([row.cancelled_by_role, row.cancelled_by, row.cancellation_reason], ['admin', ids.admin, 'Expert unreachable']);
    const log = await one(db, `select details from public.admin_audit_log where action = 'cancel_booking'`);
    assert.deepEqual([log.details.reason, log.details.refund_paise], ['Expert unreachable', 100000]);
    await rejects(as(db, ids.admin, `select public.admin_update_booking_status($1, 'Completed')`, [b.id]), /cannot be reopened/);
  });

  test('no-show (no link 5 min after start): full refund recorded with an adjustment', async () => {
    const db = await setup();
    const b = await paidBooking(db, -6);
    await db.query('select public.process_consultation_lifecycle()');
    const row = await booking(db, b.id);
    assert.deepEqual([row.status, row.cancelled_by_role, row.cancellation_rule, row.refund_paise], ['Cancelled', 'system', 'no_show', 100000]);
    assert.equal((await adj(db, b.id)).amount_paise, 100000);
  });

  test('admin report: refunds and net commission / expert share reconcile', async () => {
    const db = await setup();
    const early = await paidBooking(db, 20 * 60);
    const late = await paidBooking(db, 3 * 60, { farmer: ids.farmerB });
    const kept = await paidBooking(db, 5 * 24 * 60);
    await cancel(db, ids.farmerA, early.id);
    await cancel(db, ids.farmerB, late.id);
    const s = (await as(db, ids.admin, 'select public.admin_consultation_summary() s')).rows[0].s;
    assert.equal(s.refunds_paise, 100000 + 48000);
    // early: nets 0 / 0; late: commission 2000 kept, expert 50000 kept; kept booking: 2000 / 98000
    assert.equal(s.net_commission_paise, 0 + 2000 + 2000);
    assert.equal(s.net_expert_share_paise, 0 + 50000 + 98000);
    const rows = (await as(db, ids.admin, `select public.admin_consultations('{"cancellation_rule":"farmer_late"}') l`)).rows[0].l;
    assert.equal(rows.total, 1);
    assert.deepEqual([rows.rows[0].refund_paise, rows.rows[0].refund_expert_share_reversal_paise], [48000, 48000]);
    assert.ok(kept.id);
  });
});
