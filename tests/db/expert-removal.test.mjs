// SQL behaviour tests for supabase/proposed/24 (removing an expert with a preview and explicit booking confirmation,
// inactive experts locked out of fee/availability, ban/unban guards, server-attached resumes) on the production schema
// in PGlite (01–24 applied). Run with: npm run test:db
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, applyProposed, as, ids, seed, addSlot, addBookingStartingIn, rejects, ALL } from './harness.mjs';

const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];
const count = async (db, sql, params) => Number((await db.query(sql, params)).rows[0].count);
const setup = async () => {
  const db = await createDb({ proposed: [...ALL, '09', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24'] });
  await seed(db);
  return db;
};
// Run as the Edge Function / seed script would (service role: not a client request, bypasses RLS).
async function asService(db, sql, params = []) {
  await db.query(`select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'service_role', false)`);
  await db.exec('set role service_role');
  try { return await db.query(sql, params); } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.role', '', false)`);
  }
}
async function paidBooking(db, minutes, { farmer = ids.farmerA, fee = 100000 } = {}) {
  const b = await addBookingStartingIn(db, minutes, { farmer, rate: fee / 100 });
  await db.query(`insert into public.demo_payments (farmer_user_id, slot_id, expert_id, booking_id, issue, amount_paise, status,
                    idempotency_key, expires_at, confirmed_at, commission_bps, commission_paise, expert_share_paise)
                  values ($1, $2, $3, $4, 'x', $5, 'succeeded', gen_random_uuid(), now(), now(), 200,
                          public._commission_paise($5, 200), $5 - public._commission_paise($5, 200))`,
  [farmer, b.slot_id, ids.expertRow, b.id, fee]);
  return b;
}
const demote = (db, uid, target, flag) => as(db, uid, flag === undefined
  ? 'select public.demote_expert($1) as r' : 'select public.demote_expert($1, $2) as r', flag === undefined ? [target] : [target, flag]);
const fp = (db, name) => one(db, `select md5(regexp_replace(regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g'), '\\s+', '', 'g')) m
                                   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [name]).then((r) => r.m);

describe('24 — who may remove an expert', () => {
  test('only admins; never yourself or an administrator; preview is admin-only', async () => {
    const db = await setup();
    await rejects(demote(db, ids.farmerA, ids.expertUser, false), /Admin privileges required/);
    await rejects(as(db, ids.farmerA, 'select public.admin_expert_removal_preview($1)', [ids.expertUser]), /Admin privileges required/);
    await rejects(demote(db, ids.admin, ids.admin, false), /You cannot change your own role/);
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ('aaaaaaaa-0000-4000-8000-000000000009', 'admin2@test.local', '{}')`);
    await db.query(`update public.profiles set role = 'Admin' where id = 'aaaaaaaa-0000-4000-8000-000000000009'`);
    await rejects(demote(db, ids.admin, 'aaaaaaaa-0000-4000-8000-000000000009', false), /Administrator accounts cannot be changed here/);
    await rejects(demote(db, ids.admin, ids.farmerA, false), /This account is not an expert/);
    await rejects(as(db, ids.admin, `select public.ban_user($1, 'x')`, [ids.admin]), /You cannot ban your own account/);
    await rejects(as(db, ids.admin, `select public.ban_user($1, 'x')`, ['aaaaaaaa-0000-4000-8000-000000000009']), /Administrator accounts cannot be banned/);
  });
});

describe('24 — removing an expert', () => {
  test('no bookings: becomes Farmer, inactive, open future slots gone; posts, applications and conversations kept', async () => {
    const db = await setup();
    await addSlot(db, { days: 3 });
    await db.query(`insert into public.posts (user_id, caption, status) values ($1, 'kept', 'Approved')`, [ids.expertUser]);
    // the 09 guard refuses applications from an active expert, so record the (historical) approved one while inactive
    await db.query('update public.experts set is_active = false where id = $1', [ids.expertRow]);
    await db.query(`insert into public.expert_applications (user_id, qualification, experience, status) values ($1, 'MSc', '5y', 'Approved')`, [ids.expertUser]);
    await db.query('update public.experts set is_active = true where id = $1', [ids.expertRow]);
    await db.query(`insert into public.conversations (user_one, user_two) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid))`, [ids.expertUser, ids.farmerA]);
    const kept = async () => [await count(db, 'select count(*) from public.posts where user_id = $1', [ids.expertUser]),
      await count(db, 'select count(*) from public.expert_applications where user_id = $1', [ids.expertUser]),
      await count(db, 'select count(*) from public.conversations where $1 in (user_one, user_two)', [ids.expertUser])];
    const before = await kept();
    const preview = (await as(db, ids.admin, 'select public.admin_expert_removal_preview($1) p', [ids.expertUser])).rows[0].p;
    assert.deepEqual([preview.role, preview.upcoming.length, Number(preview.open_future_slots), preview.is_self], ['Expert', 0, 1, false]);
    const r = (await demote(db, ids.admin, ids.expertUser, false)).rows[0].r;
    assert.equal(r.cancelled_bookings, 0);
    assert.equal((await one(db, 'select role from public.profiles where id = $1', [ids.expertUser])).role, 'Farmer');
    assert.equal((await one(db, 'select is_active from public.experts where id = $1', [ids.expertRow])).is_active, false);
    assert.equal(await count(db, 'select count(*) from public.consultation_slots where expert_id = $1', [ids.expertRow]), 0);
    assert.equal(await count(db, `select count(*) from public.admin_audit_log where action = 'demote_expert' and target_id = $1`, [ids.expertUser]), 1);
    assert.equal(await count(db, `select count(*) from public.notifications where user_id = $1 and message like 'Your account is now a normal user%'`, [ids.expertUser]), 1);
    assert.deepEqual(await kept(), before);
  });

  test('upcoming bookings: refused without confirmation (nothing changes); with it, cancelled with migration-18 accounting', async () => {
    const db = await setup();
    const paid = await paidBooking(db, 3 * 24 * 60);
    const unpaid = await addBookingStartingIn(db, 4 * 24 * 60, { farmer: ids.farmerB, rate: 500 });
    const push = await one(db, `insert into public.notifications (user_id, type, message, related_id) values ($1, 'booking', 'r', $2) returning id`, [ids.farmerA, paid.id]);
    // the notification trigger (13) queued its push; make it a reminder for this booking
    await db.query(`update public.push_outbox set status = 'queued', data = $2 where notification_id = $1`, [push.id, JSON.stringify({ booking_id: paid.id })]);
    assert.equal(await count(db, `select count(*) from public.push_outbox where notification_id = $1 and status = 'queued'`, [push.id]), 1);
    const preview = (await as(db, ids.admin, 'select public.admin_expert_removal_preview($1) p', [ids.expertUser])).rows[0].p;
    assert.equal(preview.upcoming.length, 2);
    const err = await rejects(demote(db, ids.admin, ids.expertUser, false), /has 2 upcoming consultation\(s\)/);
    assert.equal(err.code, 'P0001');
    assert.equal(err.hint, 'upcoming_bookings');
    assert.equal((await one(db, 'select role from public.profiles where id = $1', [ids.expertUser])).role, 'Expert');
    assert.equal(await count(db, `select count(*) from public.consultation_bookings where status = 'Booked'`), 2);

    const r = (await demote(db, ids.admin, ids.expertUser, true)).rows[0].r;
    assert.equal(r.cancelled_bookings, 2);
    const b = await one(db, 'select * from public.consultation_bookings where id = $1', [paid.id]);
    assert.deepEqual([b.status, b.cancelled_by_role, b.cancellation_rule, b.refund_paise, b.cancelled_by], ['Cancelled', 'admin', 'admin_cancel', 100000, ids.admin]);
    assert.equal((await one(db, 'select status from public.consultation_bookings where id = $1', [unpaid.id])).status, 'Cancelled');
    const a = await one(db, 'select * from public.demo_payment_adjustments where booking_id = $1', [paid.id]);
    assert.deepEqual([a.kind, a.amount_paise], ['refund', 100000]);
    assert.equal((await one(db, 'select status from public.push_outbox where notification_id = $1', [push.id])).status, 'failed');
    assert.equal(await count(db, `select count(*) from public.notifications where message like '%expert is no longer available on AgroConnect%'`), 2);
  });

  test('a removed expert cannot set a fee, publish availability or make themselves Expert again', async () => {
    const db = await setup();
    await demote(db, ids.admin, ids.expertUser, false);
    await rejects(as(db, ids.expertUser, 'select public.set_consultation_fee(50000)'), /Only experts can set a consultation fee/);
    await rejects(as(db, ids.expertUser, `insert into public.consultation_slots (expert_id, slot_date, start_time, end_time, rate)
                                          values ($1, current_date + 3, '10:00', '10:30', 0)`, [ids.expertRow]), /Only active experts can publish availability|row-level security/);
    await rejects(as(db, ids.expertUser, `update public.profiles set role = 'Expert' where id = $1`, [ids.expertUser]), /role can only be changed by an administrator/);
  });

  test('resignation approval needs the same confirmation when bookings exist', async () => {
    const db = await setup();
    await paidBooking(db, 2 * 24 * 60);
    const { id } = await one(db, `insert into public.expert_resignations (user_id, reason) values ($1, 'moving') returning id`, [ids.expertUser]);
    await rejects(as(db, ids.admin, 'select public.approve_expert_resignation($1)', [id]), /upcoming consultation/);
    assert.equal((await one(db, 'select status from public.expert_resignations where id = $1', [id])).status, 'Pending');
    await as(db, ids.admin, 'select public.approve_expert_resignation($1, true)', [id]);
    assert.equal((await one(db, 'select status from public.expert_resignations where id = $1', [id])).status, 'Approved');
    assert.equal((await one(db, 'select role from public.profiles where id = $1', [ids.expertUser])).role, 'Farmer');
  });
});

describe('24 — resumes are attached only by the server', () => {
  test('clients cannot insert applications or change cv_file_path; _attach_resume checks path, type and size', async () => {
    const db = await setup();
    await rejects(as(db, ids.farmerA, `insert into public.expert_applications (user_id, qualification, experience) values ($1, 'MSc', '5y')`, [ids.farmerA]),
      /Expert applications are sent from the app/);
    const app = await one(db, `insert into public.expert_applications (user_id, qualification, experience, status) values ($1, 'MSc', '5y', 'Pending') returning id`, [ids.farmerA]);
    try { await as(db, ids.farmerA, `update public.expert_applications set cv_file_path = $2 where id = $1`, [app.id, `${ids.farmerA}/1_cv.pdf`]); } catch { /* refused */ }
    assert.equal((await one(db, 'select cv_file_path from public.expert_applications where id = $1', [app.id])).cv_file_path, null);

    const good = `${ids.farmerA}/1767225600000_cv.pdf`;
    await rejects(asService(db, 'select public._attach_resume($1, $2)', [ids.farmerA, `${ids.farmerB}/1767225600000_cv.pdf`]), /invalid resume path/);
    await rejects(asService(db, 'select public._attach_resume($1, $2)', [ids.farmerA, `${ids.farmerA}/1767225600000_cv.jpg`]), /invalid resume path/);
    await rejects(asService(db, 'select public._attach_resume($1, $2)', [ids.farmerA, good]), /resume file not found/);
    await db.query(`insert into storage.objects (bucket_id, name, metadata) values ('expert-cvs', $1, '{"mimetype":"image/jpeg","size":1000}')`, [good]);
    await rejects(asService(db, 'select public._attach_resume($1, $2)', [ids.farmerA, good]), /resume file not found/);
    await db.query(`update storage.objects set metadata = '{"mimetype":"application/pdf","size":1000}' where name = $1`, [good]);
    assert.equal((await asService(db, 'select public._attach_resume($1, $2) id', [ids.farmerA, good])).rows[0].id, app.id);
    assert.equal((await one(db, 'select cv_file_path from public.expert_applications where id = $1', [app.id])).cv_file_path, good);
    assert.equal(await count(db, `select count(*) from public.notifications where user_id = $1 and related_id = $2 and message like '%uploaded a new resume%'`, [ids.admin, app.id]), 1);
    assert.equal(await count(db, `select count(*) from public.admin_audit_log where admin_id = $1`, [ids.farmerA]), 0, 'applicant in admin_audit_log blocks account deletion');
    await rejects(as(db, ids.farmerA, 'select public._attach_resume($1, $2)', [ids.farmerA, good]), /permission denied/);
  });
});

describe('24 — unban and re-running', () => {
  test('unban_user clears the ban with an audit row; refuses accounts that are not banned', async () => {
    const db = await setup();
    await as(db, ids.admin, `select public.ban_user($1, 'spam')`, [ids.farmerA]);
    await as(db, ids.admin, 'select public.unban_user($1)', [ids.farmerA]);
    assert.equal((await one(db, 'select is_banned from public.profiles where id = $1', [ids.farmerA])).is_banned, false);
    assert.equal(await count(db, `select count(*) from public.admin_audit_log where action = 'unban_user' and target_id = $1`, [ids.farmerA]), 1);
    await rejects(as(db, ids.admin, 'select public.unban_user($1)', [ids.farmerA]), /This account is not banned/);
    await rejects(as(db, ids.farmerB, 'select public.unban_user($1)', [ids.farmerA]), /Admin privileges required/);
  });

  test('migration 24 is re-runnable without changes', async () => {
    const db = await setup();
    const names = ['demote_expert', 'set_consultation_fee', 'guard_consultation_slots', 'ban_user', '_attach_resume'];
    const before = await Promise.all(names.map((n) => fp(db, n)));
    await applyProposed(db, '24');
    assert.deepEqual(await Promise.all(names.map((n) => fp(db, n))), before);
  });
});
