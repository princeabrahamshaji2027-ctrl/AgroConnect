// SQL behaviour tests for supabase/proposed/00–06 against a disposable PGlite database.
// Run with: npm run test:db
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createDb, applyProposed, as, ids, seed, addSlot, addBookingStartingIn, startOf, rejects, PROPOSED,
} from './harness.mjs';

const root = new URL('../..', import.meta.url).pathname;
const count = async (db, sql, params) => Number((await db.query(sql, params)).rows[0].count);

describe('00_readonly_verification.sql', () => {
  test('contains no write or DDL statements (static check)', () => {
    const sql = readFileSync(root + 'supabase/proposed/00_readonly_verification.sql', 'utf8')
      .replace(/--.*$/gm, '').replace(/'[^']*'/g, "''");
    for (const kw of ['insert', 'update', 'delete', 'truncate', 'alter', 'drop', 'create', 'grant', 'revoke',
      'copy', 'execute', 'perform', 'do', 'call', 'vacuum', 'set']) {
      assert.doesNotMatch(sql, new RegExp(`\\b${kw}\\b`, 'i'), kw);
    }
  });

  test('every statement runs inside a READ ONLY transaction', async () => {
    const db = await createDb();
    await seed(db);
    const sql = readFileSync(root + 'supabase/proposed/00_readonly_verification.sql', 'utf8');
    const statements = sql.replace(/--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
    assert.ok(statements.length >= 13);
    await db.exec('begin transaction read only');
    for (const s of statements) await db.query(s); // a write would raise "cannot execute ... in a read-only transaction"
    await db.exec('rollback');
  });
});

describe('01 — profile privilege escalation (AUD-003)', () => {
  test('BEFORE 01: a farmer can make themselves Admin (the vulnerability is real on this baseline)', async () => {
    const db = await createDb({ proposed: ['03'] }); // 03 so profiles_update's is_banned() works
    await seed(db);
    await as(db, ids.farmerA, `update public.profiles set role = 'Admin' where id = $1`, [ids.farmerA]);
    const { rows } = await db.query('select role from public.profiles where id = $1', [ids.farmerA]);
    assert.equal(rows[0].role, 'Admin');
  });

  test('AFTER 01: self-promotion, ban-field edits and Admin inserts are rejected; normal edits still work', async () => {
    const db = await createDb({ proposed: ['01', '03'] });
    await seed(db);
    await rejects(as(db, ids.farmerA, `update public.profiles set role = 'Admin' where id = $1`, [ids.farmerA]), /administrator/);
    await rejects(as(db, ids.farmerA, `update public.profiles set role = 'Expert' where id = $1`, [ids.farmerA]), /administrator/);
    await rejects(as(db, ids.farmerA, `update public.profiles set is_banned = false, follower_count = 999 where id = $1`, [ids.farmerA]));
    await as(db, ids.farmerA, `update public.profiles set bio = 'hello' where id = $1`, [ids.farmerA]);
    assert.equal((await db.query('select bio from public.profiles where id = $1', [ids.farmerA])).rows[0].bio, 'hello');
    // "Leave expert mode" (Connect.jsx) is still allowed
    await as(db, ids.expertUser, `update public.profiles set role = 'Farmer' where id = $1`, [ids.expertUser]);
    // an admin can still change roles, and the approval RPC still works
    await as(db, ids.admin, `update public.profiles set role = 'Expert' where id = $1`, [ids.farmerB]);
    const newUser = 'aaaaaaaa-0000-4000-8000-0000000000ff';
    await db.query(`insert into auth.users (id, email) values ($1, 'new@test.local')`, [newUser]);
    await rejects(as(db, newUser, `insert into public.profiles (id, role) values ($1, 'Admin')`, [newUser]), /administrator/);
  });

  test('AFTER 01: approve_expert_application (SECURITY DEFINER, called by admin) still promotes', async () => {
    const db = await createDb({ proposed: ['01', '03'] });
    await seed(db);
    const { rows } = await db.query(
      `insert into public.expert_applications (user_id, cv_file_path) values ($1, 'x.pdf') returning id`, [ids.farmerB]);
    await rejects(as(db, ids.farmerB, 'select public.approve_expert_application($1)', [rows[0].id]), /not authorized/);
    await as(db, ids.admin, 'select public.approve_expert_application($1)', [rows[0].id]);
    assert.equal((await db.query('select role from public.profiles where id = $1', [ids.farmerB])).rows[0].role, 'Expert');
    assert.equal(await count(db, 'select count(*) from public.experts where user_id = $1', [ids.farmerB]), 1);
  });
});

describe('02 — anonymous read of profiles (AUD-008)', () => {
  test('BEFORE: anon reads every profile; AFTER: anon reads none, signed-in users still read', async () => {
    const db = await createDb({ proposed: ['03'] });
    await seed(db);
    assert.equal((await as(db, null, 'select id from public.profiles')).rows.length, 4);
    await applyProposed(db, '02');
    assert.equal((await as(db, null, 'select id from public.profiles')).rows.length, 0);
    assert.equal((await as(db, null, 'select id from public.followers')).rows.length, 0);
    assert.equal((await as(db, ids.farmerA, 'select id from public.profiles')).rows.length, 4);
  });
});

describe('03 — security definer helpers (AUD-012)', () => {
  test('BEFORE 03: is_banned() from the repo migration fails at runtime (profiles.status does not exist)', async () => {
    const db = await createDb();
    await seed(db);
    await rejects(as(db, ids.farmerA, 'select public.is_banned()'), /status/);
    // ...which also breaks every non-admin profile update through profiles_update
    await rejects(as(db, ids.farmerA, `update public.profiles set bio = 'x' where id = $1`, [ids.farmerA]), /status/);
  });

  test('AFTER 03: is_banned() works, banned users cannot edit, search_path is pinned', async () => {
    const db = await createDb({ proposed: ['03'] });
    await seed(db);
    assert.equal((await as(db, ids.farmerA, 'select public.is_banned() as b')).rows[0].b, false);
    await db.query('update public.profiles set is_banned = true where id = $1', [ids.farmerB]);
    await as(db, ids.farmerB, `update public.profiles set bio = 'x' where id = $1`, [ids.farmerB]);
    assert.equal((await db.query('select bio from public.profiles where id = $1', [ids.farmerB])).rows[0].bio, null);
    const { rows } = await db.query(`select proname, proconfig from pg_proc where proname in ('is_admin','is_banned','admin_update_booking_status')`);
    for (const r of rows) assert.ok((r.proconfig || []).some((c) => c.startsWith('search_path=')), r.proname);
  });
});

describe('05 — consultation lifecycle on the server (AUD-013/014/032)', () => {
  const setup = async () => {
    const db = await createDb({ proposed: ['01', '02', '03', '05'] });
    await seed(db);
    return db;
  };
  const book = (db, uid, slot, issue = 'Leaf curl on tomatoes') =>
    as(db, uid, 'select public.book_consultation_slot($1, $2) as id', [slot, issue]).then((r) => r.rows[0].id);

  test('valid booking creates booking + video meeting and locks the slot atomically', async () => {
    const db = await setup();
    const slot = await addSlot(db);
    const id = await book(db, ids.farmerA, slot);
    const { rows } = await db.query('select status, slot_id from public.consultation_bookings where id = $1', [id]);
    assert.equal(rows[0].status, 'Booked');
    assert.equal((await db.query('select is_booked from public.consultation_slots where id = $1', [slot])).rows[0].is_booked, true);
    assert.equal(await count(db, 'select count(*) from public.video_meetings where booking_id = $1', [id]), 1);
    // the farmer sees it, the other farmer does not
    assert.equal((await as(db, ids.farmerA, 'select id from public.consultation_bookings')).rows.length, 1);
    assert.equal((await as(db, ids.farmerB, 'select id from public.consultation_bookings')).rows.length, 0);
    assert.equal((await as(db, ids.expertUser, 'select id from public.consultation_bookings')).rows.length, 1);
  });

  test('unavailable, past, own and empty-issue bookings are rejected without partial records', async () => {
    const db = await setup();
    const slot = await addSlot(db);
    await book(db, ids.farmerA, slot);
    await rejects(book(db, ids.farmerB, slot), /already booked/);
    const past = await addSlot(db, { days: -1 });
    await rejects(book(db, ids.farmerB, past), /past/);
    const other = await addSlot(db, { time: '11:00' });
    await rejects(book(db, ids.expertUser, other), /own slot/);
    await rejects(book(db, ids.farmerB, other, '  '), /issue/);
    await rejects(as(db, null, 'select public.book_consultation_slot($1, $2)', [other, 'x']), /permission denied/);
    assert.equal(await count(db, 'select count(*) from public.consultation_bookings'), 1);
    assert.equal((await db.query('select is_booked from public.consultation_slots where id = $1', [other])).rows[0].is_booked, false);
  });

  test('duplicate submission by the same farmer returns the same booking', async () => {
    const db = await setup();
    const slot = await addSlot(db);
    const a = await book(db, ids.farmerA, slot);
    const b = await book(db, ids.farmerA, slot);
    assert.equal(a, b);
    assert.equal(await count(db, 'select count(*) from public.consultation_bookings'), 1);
  });

  test('concurrency backstop: the database refuses a second active booking for one slot', async () => {
    // PGlite is single-connection, so two truly parallel transactions cannot be run here. The function takes a
    // FOR UPDATE row lock; this test proves the unique index rejects a double booking even if that lock were bypassed.
    const db = await setup();
    const slot = await addSlot(db);
    await book(db, ids.farmerA, slot);
    const { rows: fp } = await db.query(`insert into public.farmer_profiles (user_id) values ($1) returning id`, [ids.farmerB]);
    await rejects(db.query(
      `insert into public.consultation_bookings (expert_id, farmer_id, slot_id, meeting_date, meeting_time, status)
       select expert_id, $1, id, slot_date, start_time, 'Booked' from public.consultation_slots where id = $2`, [fp[0].id, slot]),
    /consultation_bookings_one_active_per_slot/);
  });

  test('clients cannot write bookings, slots state or expert counters directly', async () => {
    const db = await setup();
    const slot = await addSlot(db);
    const id = await book(db, ids.farmerA, slot);
    await rejects(as(db, ids.farmerA, `update public.consultation_bookings set status = 'Completed' where id = $1`, [id]), /permission denied/);
    await rejects(as(db, ids.farmerB, `insert into public.consultation_bookings (expert_id, farmer_id, meeting_date, meeting_time)
      values ($1, $1, current_date, '10:00')`, [ids.expertRow]), /permission denied/);
    await rejects(as(db, ids.farmerB, 'update public.consultation_slots set is_booked = false where id = $1', [slot]), /own slots/);
    await rejects(as(db, ids.expertUser, 'update public.consultation_slots set is_booked = false where id = $1', [slot]), /booking functions|booked slot/);
    await rejects(as(db, ids.expertUser, 'delete from public.consultation_slots where id = $1', [slot]), /booked slot/);
    await rejects(as(db, ids.expertUser, 'update public.experts set no_show_count = 5 where id = $1', [ids.expertRow]), /administrator/);
    // legitimate expert actions still work
    await as(db, ids.expertUser, `insert into public.consultation_slots (expert_id, slot_date, start_time) values ($1, current_date + 3, '09:00')`, [ids.expertRow]);
    await as(db, ids.expertUser, `update public.experts set specialization = 'Soil health', is_active = false where id = $1`, [ids.expertRow]);
    await rejects(as(db, ids.expertUser, 'update public.experts set is_active = true where id = $1', [ids.expertRow]), /administrator/);
  });

  test('cancellation: only participants; farmer refund 50 % Pending; expert must offer slots; notifications go to the right people', async () => {
    const db = await setup();
    const slot = await addSlot(db, { rate: 400 });
    const id = await book(db, ids.farmerA, slot);
    await rejects(as(db, ids.farmerB, 'select public.cancel_consultation_booking($1, $2)', [id, 'nope']), /participant/);
    await rejects(as(db, ids.expertUser, 'select public.cancel_consultation_booking($1, $2)', [id, 'sick']), /alternative slot/);
    const { rows } = await as(db, ids.farmerA, 'select public.cancel_consultation_booking($1, $2) as refund', [id, 'Rain']);
    assert.equal(Number(rows[0].refund), 200);
    const b = (await db.query('select status, refund_status, refund_amount from public.consultation_bookings where id = $1', [id])).rows[0];
    assert.deepEqual([b.status, b.refund_status, Number(b.refund_amount)], ['Cancelled', 'Pending', 200]);
    assert.equal((await db.query('select is_booked from public.consultation_slots where id = $1', [slot])).rows[0].is_booked, false);
    const notes = (await db.query('select user_id, type from public.notifications where related_id = $1 order by type', [id])).rows;
    assert.deepEqual(notes.map((n) => [n.user_id, n.type]), [
      [ids.admin, 'farmer_cancellation_admin_alert'], [ids.expertUser, 'meeting_cancelled_by_farmer']]);
    await rejects(as(db, ids.farmerA, 'select public.cancel_consultation_booking($1, $2)', [id, 'again']), /not active/);
    // expert cancel path: farmer notified, no refund change
    const slot2 = await addSlot(db, { time: '12:00' });
    const id2 = await book(db, ids.farmerB, slot2);
    await as(db, ids.expertUser, 'select public.cancel_consultation_booking($1, $2, $3)', [id2, 'Field visit', JSON.stringify([{ date: '2026-12-01', time: '10:00' }])]);
    const b2 = (await db.query('select refund_status, offered_reschedule_slots from public.consultation_bookings where id = $1', [id2])).rows[0];
    assert.equal(b2.refund_status, 'None');
    assert.equal(b2.offered_reschedule_slots.length, 1);
    assert.deepEqual((await db.query('select user_id from public.notifications where related_id = $1', [id2])).rows.map((r) => r.user_id), [ids.farmerB]);
  });

  test('notification forgery: a user cannot notify someone else; own and admin inserts still work', async () => {
    const db = await setup();
    await rejects(as(db, ids.farmerA, `insert into public.notifications (user_id, type, message) values ($1, 'x', 'fake')`, [ids.farmerB]), /other users/);
    await as(db, ids.farmerA, `insert into public.notifications (user_id, type, message) values ($1, 'x', 'self')`, [ids.farmerA]);
    await as(db, ids.admin, `insert into public.notifications (user_id, type, message) values ($1, 'x', 'from admin')`, [ids.farmerB]);
    await rejects(as(db, ids.farmerA, `select public._notify($1, 'x', 'y', null)`, [ids.farmerB]), /permission denied/);
    assert.equal(await count(db, 'select count(*) from public.notifications where user_id = $1', [ids.farmerB]), 1);
  });

  test('reminders: right recipients, no duplicates on repeated runs, none for cancelled bookings', async () => {
    const db = await setup();
    const keep = await book(db, ids.farmerA, await addSlot(db, { time: '10:00' }));
    const cancelled = await book(db, ids.farmerB, await addSlot(db, { time: '14:00' }));
    await as(db, ids.farmerB, 'select public.cancel_consultation_booking($1, $2)', [cancelled, 'changed plans']);
    const start = await startOf(db, keep);
    const run = (offsetMin) => db.query(`select public.process_consultation_lifecycle($1::timestamptz - make_interval(mins => $2)) as r`, [start, offsetMin]);
    await run(20 * 60); // 20 h before
    await run(20 * 60); // repeated run
    await run(25); // 25 min before -> 30-min reminder (+ day-of if same local date)
    await run(8); // 8 min before -> expert 10-min reminder
    await run(8);
    const rows = (await db.query(`select user_id, type, count(*)::int n from public.notifications where related_id = $1 group by 1, 2 order by 2, 1`, [keep])).rows;
    const byType = Object.groupBy(rows, (r) => r.type);
    assert.deepEqual(byType.meeting_reminder_24h.map((r) => [r.user_id, r.n]).sort(), [[ids.farmerA, 1], [ids.expertUser, 1]].sort());
    assert.deepEqual(byType.meeting_reminder_30min.map((r) => r.n), [1, 1]);
    assert.deepEqual(byType.meeting_reminder_expert_10min.map((r) => [r.user_id, r.n]), [[ids.expertUser, 1]]);
    assert.ok(rows.every((r) => r.n === 1), 'no duplicate reminders');
    assert.equal(await count(db, `select count(*) from public.notifications where related_id = $1 and type like 'meeting_reminder%'`, [cancelled]), 0);
  });

  test('no-show: only Booked + not joined + 5 min late; processed once; full refund Pending; counter +1', async () => {
    const db = await setup();
    const late = await addBookingStartingIn(db, -10, { rate: 600 });
    const joined = await addBookingStartingIn(db, -11, { farmer: ids.farmerB, joined: true });
    const notYet = await addBookingStartingIn(db, -3, { farmer: ids.farmerB });
    const r1 = (await db.query('select public.process_consultation_lifecycle() as r')).rows[0].r;
    const r2 = (await db.query('select public.process_consultation_lifecycle() as r')).rows[0].r;
    assert.equal(r1.no_shows, 1);
    assert.equal(r2.no_shows, 0);
    const st = async (b) => (await db.query('select status, refund_status, refund_amount from public.consultation_bookings where id = $1', [b.id])).rows[0];
    assert.deepEqual(Object.values(await st(late)).map(String), ['Cancelled', 'Pending', '600']);
    assert.equal((await st(joined)).status, 'Booked');
    assert.equal((await st(notYet)).status, 'Booked');
    assert.equal((await db.query('select no_show_count from public.experts where id = $1', [ids.expertRow])).rows[0].no_show_count, 1);
    assert.equal((await db.query('select is_booked from public.consultation_slots where id = $1', [late.slot_id])).rows[0].is_booked, false);
    assert.equal(await count(db, `select count(*) from public.notifications where related_id = $1`, [late.id]), 3); // farmer, expert, 1 admin
    // clients cannot run the job or fake a no-show
    await rejects(as(db, ids.farmerA, 'select public.process_consultation_lifecycle()'), /permission denied/);
  });

  test('join and complete are validated on the server', async () => {
    const db = await setup();
    const far = await book(db, ids.farmerA, await addSlot(db));
    await rejects(as(db, ids.expertUser, 'select public.join_consultation($1)', [far]), /not been reached/);
    const soon = await addBookingStartingIn(db, 2, { farmer: ids.farmerB });
    await rejects(as(db, ids.farmerA, 'select public.join_consultation($1)', [soon.id]), /participant/);
    await rejects(as(db, ids.farmerB, 'select public.complete_consultation($1)', [soon.id]), /expert has not joined/);
    await as(db, ids.farmerB, 'select public.join_consultation($1)', [soon.id]);
    await as(db, ids.expertUser, 'select public.join_consultation($1)', [soon.id]);
    await as(db, ids.farmerB, 'select public.complete_consultation($1)', [soon.id]);
    await as(db, ids.expertUser, 'select public.complete_consultation($1)', [soon.id]); // idempotent
    assert.equal((await db.query('select status from public.consultation_bookings where id = $1', [soon.id])).rows[0].status, 'Completed');
    // reviews: only the farmer of the completed booking, once
    const review = (uid) => as(db, uid, `insert into public.reviews (booking_id, reviewer_id, expert_id, rating, comment) values ($1, $2, $3, 5, 'great')`, [soon.id, uid, ids.expertRow]);
    await rejects(review(ids.farmerA), /own completed/);
    await review(ids.farmerB);
    await rejects(review(ids.farmerB), /already been reviewed/);
  });

  test('refunds: eligibility, duplicate settlement blocked, provider failure then retry', async () => {
    const db = await setup();
    const id = await book(db, ids.farmerA, await addSlot(db, { rate: 400 }));
    await rejects(as(db, ids.admin, 'select public.admin_settle_refund($1, true)', [id]), /not pending/); // not eligible yet
    await as(db, ids.farmerA, 'select public.cancel_consultation_booking($1, $2)', [id, 'Rain']);
    await rejects(as(db, ids.farmerA, 'select public.admin_settle_refund($1, true)', [id]), /not authorized/);
    // simulated payment-provider failure
    assert.equal((await as(db, ids.admin, 'select public.admin_settle_refund($1, false, $2) as s', [id, 'mock-fail'])).rows[0].s, 'Failed');
    await rejects(as(db, ids.admin, 'select public.admin_settle_refund($1, true)', [id]), /not pending/);
    await as(db, ids.admin, 'select public.admin_retry_refund($1)', [id]);
    assert.equal((await as(db, ids.admin, 'select public.admin_settle_refund($1, true, $2) as s', [id, 'mock-ok'])).rows[0].s, 'Refunded');
    await rejects(as(db, ids.admin, 'select public.admin_settle_refund($1, true)', [id]), /not pending/); // no double refund
    await rejects(as(db, ids.admin, 'select public.admin_retry_refund($1)', [id]), /Failed state/);
    assert.equal(await count(db, `select count(*) from public.admin_audit_log where action = 'settle_refund' and target_id = $1`, [id]), 2);
    assert.equal(await count(db, `select count(*) from public.notifications where type = 'refund_completed' and user_id = $1`, [ids.farmerA]), 1);
  });

  test('a failed scheduler run rolls back completely and the next run delivers exactly once', async () => {
    const db = await setup();
    const id = await book(db, ids.farmerA, await addSlot(db));
    const start = await startOf(db, id);
    await db.exec(`create function public._fail() returns trigger language plpgsql as $$ begin raise exception 'delivery outage'; end $$;
                   create trigger _fail before insert on public.notifications for each row execute function public._fail();`);
    await rejects(db.query(`select public.process_consultation_lifecycle($1::timestamptz - interval '20 hours')`, [start]), /delivery outage/);
    assert.equal((await db.query('select notified_24h from public.consultation_bookings where id = $1', [id])).rows[0].notified_24h, false);
    await db.exec('drop trigger _fail on public.notifications');
    await db.query(`select public.process_consultation_lifecycle($1::timestamptz - interval '20 hours')`, [start]);
    await db.query(`select public.process_consultation_lifecycle($1::timestamptz - interval '20 hours')`, [start]);
    assert.equal(await count(db, `select count(*) from public.notifications where related_id = $1 and type = 'meeting_reminder_24h'`, [id]), 2);
  });

  test('05 is safe to re-run', async () => {
    const db = await setup();
    await applyProposed(db, '05');
    await applyProposed(db, '05');
  });
});

describe('06 — expert1 fixture repair (AUD-015)', () => {
  const fixture = async () => {
    const db = await createDb({ proposed: ['01', '02', '03', '05'] });
    const u = (n) => `11111111-1111-4000-8000-00000000000${n}`;
    for (const [n, role] of [[1, 'Farmer'], [2, 'Expert'], [3, 'Expert'], [4, 'Expert'], [5, 'Farmer']]) {
      const email = n === 3 ? 'expert1@agroconnect.local' : `user${n === 1 ? 1 : n === 2 ? 2 : n === 4 ? 3 : 4}@agroconnect.local`;
      await db.query('insert into auth.users (id, email) values ($1, $2)', [u(n), email]);
      await db.query('insert into public.profiles (id, full_name, role) values ($1, $2, $3)', [u(n), email, role]);
    }
    // the drift observed live on 2026-10-24: user2/user3 have experts rows, expert1 has none
    await db.query('insert into public.experts (user_id) values ($1), ($2)', [u(2), u(4)]);
    // a real user that must not be touched
    await db.query(`insert into auth.users (id, email) values ($1, 'real@gmail.com')`, [ids.farmerA]);
    await db.query(`insert into public.profiles (id, full_name, role) values ($1, 'Real', 'Expert')`, [ids.farmerA]);
    return { db, u };
  };

  test('repairs the fixture states, is idempotent and leaves real users alone', async () => {
    const { db, u } = await fixture();
    await applyProposed(db, '06');
    await applyProposed(db, '06');
    const state = (await db.query(`
      select u.email, p.role, e.id is not null as has_expert, e.is_active,
        (select string_agg(status::text, ',') from public.expert_applications a where a.user_id = p.id) apps,
        (select count(*)::int from public.consultation_slots s where s.expert_id = e.id and s.slot_date > current_date and not s.is_booked) slots
      from auth.users u join public.profiles p on p.id = u.id left join public.experts e on e.user_id = p.id order by u.email`)).rows;
    const by = Object.fromEntries(state.map((r) => [r.email, r]));
    assert.deepEqual([by['expert1@agroconnect.local'].role, by['expert1@agroconnect.local'].has_expert, by['expert1@agroconnect.local'].apps],
      ['Expert', true, 'Approved']);
    assert.equal(by['expert1@agroconnect.local'].slots, 28);
    assert.deepEqual([by['user1@agroconnect.local'].role, by['user1@agroconnect.local'].apps], ['Farmer', null]);
    assert.deepEqual([by['user2@agroconnect.local'].role, by['user2@agroconnect.local'].has_expert, by['user2@agroconnect.local'].apps], ['Farmer', false, 'Pending']);
    assert.deepEqual([by['user3@agroconnect.local'].role, by['user3@agroconnect.local'].has_expert, by['user3@agroconnect.local'].apps], ['Farmer', false, null]);
    assert.deepEqual([by['user4@agroconnect.local'].role, by['user4@agroconnect.local'].apps], ['Farmer', 'Rejected']);
    assert.equal(by['real@gmail.com'].role, 'Expert');

    // What Connect.jsx does to decide expert mode, run as expert1 through RLS:
    const me = await as(db, u(3), 'select id, is_active from public.experts where user_id = $1', [u(3)]);
    assert.equal(me.rows.length, 1);
    assert.equal(me.rows[0].is_active, true);
    // expert1 is not an admin and cannot escalate
    assert.equal((await as(db, u(3), 'select public.is_admin() as a')).rows[0].a, false);
    await rejects(as(db, u(3), `update public.profiles set role = 'Admin' where id = $1`, [u(3)]), /administrator/);
    // and a farmer fixture can book expert1 end to end
    const slot = (await db.query(`select s.id from public.consultation_slots s join public.experts e on e.id = s.expert_id where e.user_id = $1 limit 1`, [u(3)])).rows[0].id;
    const booking = (await as(db, u(1), 'select public.book_consultation_slot($1, $2) as id', [slot, 'Soil test'])).rows[0].id;
    assert.equal((await as(db, u(3), 'select id from public.consultation_bookings')).rows[0].id, booking);
    assert.equal((await as(db, u(5), 'select id from public.consultation_bookings')).rows.length, 0);
  });
});

describe('99 — rollback', () => {
  test('restores the pre-remediation behaviour (old client writes work again) and is re-runnable', async () => {
    const db = await createDb({ proposed: ['01', '02', '03', '05'] });
    await seed(db);
    const slot = await addSlot(db);
    const id = (await as(db, ids.farmerA, 'select public.book_consultation_slot($1, $2) as id', [slot, 'x'])).rows[0].id;
    await applyProposed(db, '99');
    await applyProposed(db, '99');
    await as(db, ids.farmerA, `update public.consultation_bookings set status = 'Completed' where id = $1`, [id]);
    await as(db, ids.farmerA, `insert into public.notifications (user_id, type, message) values ($1, 'x', 'y')`, [ids.farmerB]);
    await as(db, ids.farmerA, `update public.profiles set role = 'Admin' where id = $1`, [ids.farmerA]);
    assert.equal((await as(db, null, 'select id from public.profiles')).rows.length, 4);
    // existing data survived
    assert.equal((await db.query('select status from public.consultation_bookings where id = $1', [id])).rows[0].status, 'Completed');
  });
});

test('proposed file list matches the harness', () => {
  for (const p of Object.values(PROPOSED)) readFileSync(root + p);
});
