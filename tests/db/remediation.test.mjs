// SQL behaviour tests for supabase/proposed/* against the REAL production schema (exported 2026-10-24) loaded into a
// disposable PGlite database. Run with: npm run test:db
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createDb, applyProposed, applyFile, as, ids, seed, signUp, addSlot, addBookingStartingIn, startOf, rejects, PROPOSED, ALL,
} from './harness.mjs';

const root = new URL('../..', import.meta.url).pathname;
const count = async (db, sql, params) => Number((await db.query(sql, params)).rows[0].count);

describe('live schema export', () => {
  test('rebuilds cleanly in a fresh database (32 tables, 111 policies, 22 functions, 8 triggers)', async () => {
    const db = await createDb();
    const r = (await db.query(`select (select count(*) from pg_tables where schemaname='public')::int t,
      (select count(*) from pg_policies)::int p,
      (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where nspname='public')::int f,
      (select count(*) from pg_trigger where not tgisinternal)::int tr`)).rows[0];
    assert.deepEqual(r, { t: 32, p: 111, f: 22, tr: 8 });
  });

  test('the repo migration 20260814 would BREAK production (never apply it)', async () => {
    const db = await createDb();
    await seed(db);
    await db.exec('set check_function_bodies = off');
    await applyFile(db, 'supabase/migrations/20260814_profiles_rls_fix.sql');
    // its is_banned() reads profiles.status, which does not exist -> every policy calling is_banned() errors
    await rejects(as(db, ids.farmerA, `insert into public.posts (user_id, caption) values ($1, 'x')`, [ids.farmerA]), /status/);
    // and its profiles_select hides every other user's profile (names/avatars vanish from the feed)
    assert.equal((await as(db, ids.farmerA, 'select id from public.profiles')).rows.length, 1);
  });
});

describe('00_readonly_verification.sql', () => {
  test('contains no write or DDL statements (static check)', () => {
    const sql = readFileSync(root + 'supabase/proposed/00_readonly_verification.sql', 'utf8')
      .replace(/--.*$/gm, '').replace(/'[^']*'/g, "''");
    for (const kw of ['insert', 'update', 'delete', 'truncate', 'alter', 'drop', 'create', 'grant', 'revoke',
      'copy', 'execute', 'perform', 'do', 'call', 'vacuum', 'set']) {
      assert.doesNotMatch(sql, new RegExp(`\\b${kw}\\b`, 'i'), kw);
    }
  });

  test('every statement runs inside a READ ONLY transaction against the live schema', async () => {
    const db = await createDb();
    await seed(db);
    const sql = readFileSync(root + 'supabase/proposed/00_readonly_verification.sql', 'utf8');
    const statements = sql.replace(/--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
    assert.ok(statements.length >= 13);
    await db.exec('begin transaction read only');
    for (const s of statements) await db.query(s);
    await db.exec('rollback');
  });
});

describe('01 — privilege escalation (AUD-003, AUD-003b, AUD-040, AUD-041)', () => {
  test('BEFORE 01 (live behaviour): signup as Admin, self-promotion, self-made experts work; counters drift', async () => {
    const db = await createDb();
    await seed(db);
    const attacker = 'cccccccc-0000-4000-8000-000000000001';
    await signUp(db, attacker, 'attacker@test.local', { role: 'Admin' });
    assert.equal((await db.query('select role from public.profiles where id = $1', [attacker])).rows[0].role, 'Admin');
    await as(db, ids.farmerA, `update public.profiles set role = 'Admin' where id = $1`, [ids.farmerA]);
    assert.equal((await db.query('select role from public.profiles where id = $1', [ids.farmerA])).rows[0].role, 'Admin');
    await as(db, ids.farmerB, `insert into public.experts (user_id) values ($1)`, [ids.farmerB]);
    assert.equal(await count(db, 'select count(*) from public.experts where user_id = $1', [ids.farmerB]), 1);
    await as(db, ids.farmerB, `insert into public.followers (follower_id, following_id) values ($1, $2)`, [ids.farmerB, ids.expertUser]);
    assert.equal((await db.query('select follower_count from public.profiles where id = $1', [ids.expertUser])).rows[0].follower_count, 0);
  });

  test('AFTER 01: all of the above are blocked or fixed; normal use still works', async () => {
    const db = await createDb({ proposed: ['01', '03'] });
    await seed(db);
    const attacker = 'cccccccc-0000-4000-8000-000000000001';
    await signUp(db, attacker, 'attacker@test.local', { role: 'Admin' });
    assert.equal((await db.query('select role from public.profiles where id = $1', [attacker])).rows[0].role, 'Farmer');
    await rejects(as(db, ids.farmerA, `update public.profiles set role = 'Admin' where id = $1`, [ids.farmerA]), /administrator/);
    await rejects(as(db, ids.farmerA, `update public.profiles set is_banned = false, follower_count = 999 where id = $1`, [ids.farmerA]));
    await rejects(as(db, ids.farmerB, `insert into public.experts (user_id) values ($1)`, [ids.farmerB]), /administrator/);
    await as(db, ids.farmerA, `update public.profiles set bio = 'hello' where id = $1`, [ids.farmerA]);
    await as(db, ids.expertUser, `update public.profiles set role = 'Farmer' where id = $1`, [ids.expertUser]);
    await as(db, ids.admin, `update public.profiles set role = 'Expert' where id = $1`, [ids.farmerB]);
    await as(db, ids.farmerA, `insert into public.posts (user_id, caption) values ($1, 'first post')`, [ids.farmerA]);
    assert.equal((await db.query('select post_count from public.profiles where id = $1', [ids.farmerA])).rows[0].post_count, 1);
    await as(db, ids.farmerA, `insert into public.followers (follower_id, following_id) values ($1, $2)`, [ids.farmerA, ids.admin]);
    assert.equal((await db.query('select follower_count from public.profiles where id = $1', [ids.admin])).rows[0].follower_count, 1);
  });

  test('AFTER 01: the real approve_expert_application() still promotes (and is admin-only)', async () => {
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
  test('BEFORE: anon reads every profile; AFTER: none, signed-in users unchanged', async () => {
    const db = await createDb();
    await seed(db);
    assert.equal((await as(db, null, 'select id from public.profiles')).rows.length, 4);
    await applyProposed(db, '02');
    assert.equal((await as(db, null, 'select id from public.profiles')).rows.length, 0);
    assert.equal((await as(db, null, 'select id from public.followers')).rows.length, 0);
    assert.equal((await as(db, ids.farmerA, 'select id from public.profiles')).rows.length, 4);
  });
});

describe('03 — security definer helpers (AUD-012)', () => {
  test('is_admin/is_banned work and every SECURITY DEFINER function pins search_path', async () => {
    const db = await createDb({ proposed: ['01', '03'] });
    await seed(db);
    assert.equal((await as(db, ids.admin, 'select public.is_admin() as a')).rows[0].a, true);
    assert.equal((await as(db, ids.farmerA, 'select public.is_admin() as a')).rows[0].a, false);
    const { rows } = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    assert.deepEqual(rows, []);
    await rejects(as(db, null, `select public.ban_user($1, 'x')`, [ids.farmerA]), /permission denied/);
    await rejects(as(db, ids.farmerA, `select public.ban_user($1, 'x')`, [ids.farmerB]), /not authorized/);
    await as(db, ids.admin, `select public.ban_user($1, 'spam')`, [ids.farmerB]);
    assert.equal((await as(db, ids.farmerB, 'select public.is_banned() as b')).rows[0].b, true);
  });
});

describe('04 — drift reconciliation (AUD-042)', () => {
  test('admin_update_booking_status fails on the live schema and works after 04', async () => {
    const db = await createDb({ proposed: ['01', '03'] });
    await seed(db);
    const slot = await addSlot(db);
    const { rows: fp } = await db.query(`insert into public.farmer_profiles (user_id) values ($1) returning id`, [ids.farmerA]);
    const { rows: b } = await db.query(`insert into public.consultation_bookings (expert_id, farmer_id, slot_id, meeting_date, meeting_time)
      select expert_id, $1, id, slot_date, start_time from public.consultation_slots where id = $2 returning id`, [fp[0].id, slot]);
    // live function: varchar -> enum assignment is rejected (and updated_at would be missing too)
    await rejects(as(db, ids.admin, `select public.admin_update_booking_status($1, 'Cancelled', 'x')`, [b[0].id]), /booking_status|updated_at/);
    await applyProposed(db, '04');
    await as(db, ids.admin, `select public.admin_update_booking_status($1, 'Cancelled', 'x')`, [b[0].id]);
    assert.equal((await db.query('select status from public.consultation_bookings where id = $1', [b[0].id])).rows[0].status, 'Cancelled');
    await rejects(as(db, ids.admin, `select public.admin_update_booking_status($1, 'Bogus')`, [b[0].id]), /Invalid booking status/);
    await rejects(as(db, ids.farmerA, `select public.admin_update_booking_status($1, 'Completed')`, [b[0].id]), /Admin privileges/);
    await applyProposed(db, '04');
  });
});

describe('05 — consultation lifecycle on the server (AUD-013/014/032/033)', () => {
  const setup = async () => {
    const db = await createDb({ proposed: ALL });
    await seed(db);
    return db;
  };
  const book = (db, uid, slot, issue = 'Leaf curl on tomatoes') =>
    as(db, uid, 'select public.book_consultation_slot($1, $2) as id', [slot, issue]).then((r) => r.rows[0].id);

  test('live bug reproduced: the browser\'s notification types are rejected by the notification_type enum', async () => {
    const db = await createDb();
    await seed(db);
    await rejects(as(db, ids.farmerA, `insert into public.notifications (user_id, type, message) values ($1, 'meeting_reminder_24h', 'x')`, [ids.expertUser]),
      /notification_type/);
  });

  test('live bug reproduced: a farmer cannot mark the slot booked, so the slot stays "free"', async () => {
    const db = await createDb();
    await seed(db);
    const slot = await addSlot(db);
    const r = await as(db, ids.farmerA, 'update public.consultation_slots set is_booked = true where id = $1', [slot]);
    assert.equal(r.affectedRows, 0);
  });

  test('valid booking creates booking + video room and locks the slot atomically', async () => {
    const db = await setup();
    const slot = await addSlot(db);
    const id = await book(db, ids.farmerA, slot);
    assert.equal((await db.query('select status from public.consultation_bookings where id = $1', [id])).rows[0].status, 'Booked');
    assert.equal((await db.query('select is_booked from public.consultation_slots where id = $1', [slot])).rows[0].is_booked, true);
    assert.equal(await count(db, 'select count(*) from public.video_meetings where booking_id = $1', [id]), 1);
    assert.equal((await as(db, ids.farmerA, 'select id from public.consultation_bookings')).rows.length, 1);
    assert.equal((await as(db, ids.farmerB, 'select id from public.consultation_bookings')).rows.length, 0);
    assert.equal((await as(db, ids.expertUser, 'select id from public.consultation_bookings')).rows.length, 1);
  });

  test('unavailable, past, own and empty-issue bookings are rejected without partial records', async () => {
    const db = await setup();
    const slot = await addSlot(db);
    await book(db, ids.farmerA, slot);
    await rejects(book(db, ids.farmerB, slot), /already booked/);
    await rejects(book(db, ids.farmerB, await addSlot(db, { days: -1 })), /past/);
    const other = await addSlot(db, { time: '11:00' });
    await rejects(book(db, ids.expertUser, other), /own slot/);
    await rejects(book(db, ids.farmerB, other, '  '), /issue/);
    await rejects(as(db, null, 'select public.book_consultation_slot($1, $2)', [other, 'x']), /permission denied/);
    assert.equal(await count(db, 'select count(*) from public.consultation_bookings'), 1);
    assert.equal((await db.query('select is_booked from public.consultation_slots where id = $1', [other])).rows[0].is_booked, false);
  });

  test('duplicate submission returns the same booking; DB index blocks any second active booking', async () => {
    const db = await setup();
    const slot = await addSlot(db);
    const a = await book(db, ids.farmerA, slot);
    assert.equal(await book(db, ids.farmerA, slot), a);
    const { rows: fp } = await db.query(`insert into public.farmer_profiles (user_id) values ($1) returning id`, [ids.farmerB]);
    await rejects(db.query(`insert into public.consultation_bookings (expert_id, farmer_id, slot_id, meeting_date, meeting_time)
       select expert_id, $1, id, slot_date, start_time from public.consultation_slots where id = $2`, [fp[0].id, slot]), /one_booking_per_slot/);
  });

  test('clients cannot write bookings, slot state or expert counters directly', async () => {
    const db = await setup();
    const slot = await addSlot(db);
    const id = await book(db, ids.farmerA, slot);
    await rejects(as(db, ids.farmerA, `update public.consultation_bookings set status = 'Completed' where id = $1`, [id]), /permission denied/);
    await rejects(as(db, ids.expertUser, `delete from public.consultation_bookings where id = $1`, [id]), /permission denied/);
    await rejects(as(db, ids.expertUser, 'update public.consultation_slots set is_booked = false where id = $1', [slot]), /booking functions|booked slot/);
    await rejects(as(db, ids.expertUser, 'delete from public.consultation_slots where id = $1', [slot]), /booked slot/);
    await rejects(as(db, ids.expertUser, 'update public.experts set no_show_count = 5 where id = $1', [ids.expertRow]), /administrator/);
    await rejects(as(db, ids.expertUser, 'update public.experts set rating = 5 where id = $1', [ids.expertRow]), /administrator/);
    await as(db, ids.expertUser, `insert into public.consultation_slots (expert_id, slot_date, start_time, end_time) values ($1, current_date + 3, '09:00', '09:30')`, [ids.expertRow]);
    await as(db, ids.expertUser, `update public.experts set specialization = 'Soil health', is_active = false where id = $1`, [ids.expertRow]);
  });

  test('cancellation: participants only; farmer refund 50 % Pending; expert must offer slots; correct recipients', async () => {
    const db = await setup();
    const slot = await addSlot(db, { rate: 400 });
    const id = await book(db, ids.farmerA, slot);
    await rejects(as(db, ids.farmerB, 'select public.cancel_consultation_booking($1, $2)', [id, 'nope']), /participant/);
    await rejects(as(db, ids.expertUser, 'select public.cancel_consultation_booking($1, $2)', [id, 'sick']), /alternative slot/);
    assert.equal(Number((await as(db, ids.farmerA, 'select public.cancel_consultation_booking($1, $2) as r', [id, 'Rain'])).rows[0].r), 200);
    const b = (await db.query('select status, refund_status, refund_amount from public.consultation_bookings where id = $1', [id])).rows[0];
    assert.deepEqual([b.status, b.refund_status, Number(b.refund_amount)], ['Cancelled', 'Pending', 200]);
    assert.equal((await db.query('select is_booked from public.consultation_slots where id = $1', [slot])).rows[0].is_booked, false);
    const notes = (await db.query('select user_id, type::text as type from public.notifications where related_id = $1', [id])).rows;
    assert.deepEqual(notes.map((n) => [n.user_id, n.type]).sort(), [[ids.admin, 'system'], [ids.expertUser, 'booking']].sort());
    await rejects(as(db, ids.farmerA, 'select public.cancel_consultation_booking($1, $2)', [id, 'again']), /not active/);
    const id2 = await book(db, ids.farmerB, await addSlot(db, { time: '12:00' }));
    await as(db, ids.expertUser, 'select public.cancel_consultation_booking($1, $2, $3)', [id2, 'Field visit', JSON.stringify([{ date: '2026-12-01', time: '10:00' }])]);
    assert.equal((await db.query('select refund_status from public.consultation_bookings where id = $1', [id2])).rows[0].refund_status, 'None');
    assert.deepEqual((await db.query('select user_id from public.notifications where related_id = $1', [id2])).rows.map((r) => r.user_id), [ids.farmerB]);
  });

  test('notification forgery blocked for farmers and experts; own/admin inserts allowed; read-state owner-only', async () => {
    const db = await setup();
    await rejects(as(db, ids.farmerA, `insert into public.notifications (user_id, type, message) values ($1, 'booking', 'fake reminder')`, [ids.farmerB]), /other users/);
    await rejects(as(db, ids.expertUser, `insert into public.notifications (user_id, type, message) values ($1, 'system', 'fake alert')`, [ids.admin]), /other users/);
    await as(db, ids.farmerA, `insert into public.notifications (user_id, type, message) values ($1, 'system', 'self')`, [ids.farmerA]);
    await as(db, ids.admin, `insert into public.notifications (user_id, type, message) values ($1, 'announcement', 'from admin')`, [ids.farmerB]);
    await rejects(as(db, ids.farmerA, `select public._notify($1, 'booking', 'y', null)`, [ids.farmerB]), /permission denied/);
    const r = await as(db, ids.farmerA, `update public.notifications set is_read = true where user_id = $1`, [ids.farmerB]);
    assert.equal(r.affectedRows, 0);
    assert.equal(await count(db, 'select count(*) from public.notifications where user_id = $1', [ids.farmerB]), 1);
  });

  test('reminders: right recipients, exactly once over repeated runs, none for cancelled bookings', async () => {
    const db = await setup();
    const keep = await book(db, ids.farmerA, await addSlot(db, { time: '10:00' }));
    const cancelled = await book(db, ids.farmerB, await addSlot(db, { time: '14:00' }));
    await as(db, ids.farmerB, 'select public.cancel_consultation_booking($1, $2)', [cancelled, 'changed plans']);
    const start = await startOf(db, keep);
    const run = (m) => db.query(`select public.process_consultation_lifecycle($1::timestamptz - make_interval(mins => $2))`, [start, m]);
    await run(20 * 60); await run(20 * 60); await run(25); await run(8); await run(8);
    const kind = `case when message like '%tomorrow%' then '24h' when message like '%30 minutes%' then '30m'
                       when message like '%10 minutes%' then '10m' when message like '%today%' then 'day' else 'other' end`;
    const rows = (await db.query(`select user_id, ${kind} as kind, count(*)::int n from public.notifications
      where related_id = $1 group by 1, 2`, [keep])).rows;
    const of = (k) => rows.filter((r) => r.kind === k);
    assert.deepEqual(of('24h').map((r) => [r.user_id, r.n]).sort(), [[ids.farmerA, 1], [ids.expertUser, 1]].sort());
    assert.deepEqual(of('30m').map((r) => r.n), [1, 1]);
    assert.deepEqual(of('10m').map((r) => [r.user_id, r.n]), [[ids.expertUser, 1]]);
    assert.ok(rows.every((r) => r.n === 1), 'no duplicates');
    assert.equal(await count(db, `select count(*) from public.notifications where related_id = $1 and message like 'Reminder%'`, [cancelled]), 0);
  });

  test('time zone: a 10:00 Asia/Kolkata meeting starts at 04:30 UTC', async () => {
    const db = await setup();
    const r = (await db.query(`select public.consultation_start('2026-11-02', '10:00') as s`)).rows[0].s;
    assert.equal(new Date(r).toISOString(), '2026-11-02T04:30:00.000Z');
  });

  test('no-show: only Booked + not joined + 5 min late; processed once; full refund Pending; counter +1', async () => {
    const db = await setup();
    const late = await addBookingStartingIn(db, -10, { rate: 600 });
    const joined = await addBookingStartingIn(db, -11, { farmer: ids.farmerB, joined: true });
    const notYet = await addBookingStartingIn(db, -3, { farmer: ids.farmerB });
    assert.equal((await db.query('select public.process_consultation_lifecycle() as r')).rows[0].r.no_shows, 1);
    assert.equal((await db.query('select public.process_consultation_lifecycle() as r')).rows[0].r.no_shows, 0);
    const st = async (b) => (await db.query('select status::text, refund_status, refund_amount::text from public.consultation_bookings where id = $1', [b.id])).rows[0];
    assert.deepEqual(Object.values(await st(late)), ['Cancelled', 'Pending', '600']);
    assert.equal((await st(joined)).status, 'Booked');
    assert.equal((await st(notYet)).status, 'Booked');
    assert.equal((await db.query('select no_show_count from public.experts where id = $1', [ids.expertRow])).rows[0].no_show_count, 1);
    assert.equal((await db.query('select is_booked from public.consultation_slots where id = $1', [late.slot_id])).rows[0].is_booked, false);
    assert.equal(await count(db, `select count(*) from public.notifications where related_id = $1`, [late.id]), 3);
    await rejects(as(db, ids.farmerA, 'select public.process_consultation_lifecycle()'), /permission denied/);
  });

  test('join and complete are validated on the server; reviews only for own completed bookings', async () => {
    const db = await setup();
    const far = await book(db, ids.farmerA, await addSlot(db));
    await rejects(as(db, ids.expertUser, 'select public.join_consultation($1)', [far]), /not been reached/);
    const soon = await addBookingStartingIn(db, 2, { farmer: ids.farmerB });
    await rejects(as(db, ids.farmerA, 'select public.join_consultation($1)', [soon.id]), /participant/);
    await rejects(as(db, ids.farmerB, 'select public.complete_consultation($1)', [soon.id]), /expert has not joined/);
    await as(db, ids.farmerB, 'select public.join_consultation($1)', [soon.id]);
    await as(db, ids.expertUser, 'select public.join_consultation($1)', [soon.id]);
    await as(db, ids.farmerB, 'select public.complete_consultation($1)', [soon.id]);
    await as(db, ids.expertUser, 'select public.complete_consultation($1)', [soon.id]);
    assert.equal((await db.query('select status from public.consultation_bookings where id = $1', [soon.id])).rows[0].status, 'Completed');
    const review = (uid) => as(db, uid, `insert into public.reviews (booking_id, reviewer_id, expert_id, rating, comment) values ($1, $2, $3, 5, 'great')`, [soon.id, uid, ids.expertRow]);
    await rejects(review(ids.farmerA), /own completed|row-level security/);
    await review(ids.farmerB);
    await rejects(review(ids.farmerB), /already been reviewed|duplicate/);
    // the rating trigger (SECURITY DEFINER after 01) now updates the expert's rating
    assert.equal(Number((await db.query('select rating from public.experts where id = $1', [ids.expertRow])).rows[0].rating), 5);
  });

  test('refunds: eligibility, no double settlement, provider failure then retry', async () => {
    const db = await setup();
    const id = await book(db, ids.farmerA, await addSlot(db, { rate: 400 }));
    await rejects(as(db, ids.admin, 'select public.admin_settle_refund($1, true)', [id]), /not pending/);
    await as(db, ids.farmerA, 'select public.cancel_consultation_booking($1, $2)', [id, 'Rain']);
    await rejects(as(db, ids.farmerA, 'select public.admin_settle_refund($1, true)', [id]), /not authorized/);
    assert.equal((await as(db, ids.admin, 'select public.admin_settle_refund($1, false, $2) as s', [id, 'mock-fail'])).rows[0].s, 'Failed');
    await rejects(as(db, ids.admin, 'select public.admin_settle_refund($1, true)', [id]), /not pending/);
    await as(db, ids.admin, 'select public.admin_retry_refund($1)', [id]);
    assert.equal((await as(db, ids.admin, 'select public.admin_settle_refund($1, true, $2) as s', [id, 'mock-ok'])).rows[0].s, 'Refunded');
    await rejects(as(db, ids.admin, 'select public.admin_settle_refund($1, true)', [id]), /not pending/);
    await rejects(as(db, ids.admin, 'select public.admin_retry_refund($1)', [id]), /Failed state/);
    assert.equal(await count(db, `select count(*) from public.admin_audit_log where action = 'settle_refund' and target_id = $1`, [id]), 2);
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
    assert.equal(await count(db, `select count(*) from public.notifications where related_id = $1 and message like '%tomorrow%'`, [id]), 2);
  });

  test('all scripts are re-runnable', async () => {
    const db = await setup();
    for (const k of ALL) await applyProposed(db, k);
  });
});

describe('06 — expert1 fixture repair (AUD-015)', () => {
  test('repairs the drift observed live, is idempotent, and leaves real users alone', async () => {
    const db = await createDb({ proposed: ALL });
    const u = (n) => `11111111-1111-4000-8000-00000000000${n}`;
    for (const [n, email, role] of [[1, 'user1', 'Farmer'], [2, 'user2', 'Expert'], [3, 'expert1', 'Expert'], [4, 'user3', 'Expert'], [5, 'user4', 'Farmer']]) {
      await signUp(db, u(n), `${email}@agroconnect.local`);
      await db.query('update public.profiles set role = $2 where id = $1', [u(n), role]);
    }
    await db.query('insert into public.experts (user_id) values ($1), ($2)', [u(2), u(4)]);
    await signUp(db, ids.farmerA, 'real@gmail.com');
    await db.query(`update public.profiles set role = 'Expert' where id = $1`, [ids.farmerA]);
    await applyProposed(db, '06');
    await applyProposed(db, '06');
    const by = Object.fromEntries((await db.query(`
      select u.email, p.role::text as role, e.id is not null as has_expert,
        (select string_agg(status::text, ',') from public.expert_applications a where a.user_id = p.id) apps,
        (select count(*)::int from public.consultation_slots s where s.expert_id = e.id and s.slot_date > current_date and not s.is_booked) slots
      from auth.users u join public.profiles p on p.id = u.id left join public.experts e on e.user_id = p.id`)).rows.map((r) => [r.email, r]));
    const e1 = by['expert1@agroconnect.local'];
    assert.deepEqual([e1.role, e1.has_expert, e1.apps, e1.slots], ['Expert', true, 'Approved', 28]);
    assert.deepEqual([by['user2@agroconnect.local'].role, by['user2@agroconnect.local'].has_expert, by['user2@agroconnect.local'].apps], ['Farmer', false, 'Pending']);
    assert.deepEqual([by['user3@agroconnect.local'].role, by['user3@agroconnect.local'].has_expert, by['user3@agroconnect.local'].apps], ['Farmer', false, null]);
    assert.deepEqual([by['user4@agroconnect.local'].role, by['user4@agroconnect.local'].apps], ['Farmer', 'Rejected']);
    assert.equal(by['real@gmail.com'].role, 'Expert');
    assert.equal((await as(db, u(3), 'select id from public.experts where user_id = $1 and is_active', [u(3)])).rows.length, 1);
    assert.equal((await as(db, u(3), 'select public.is_admin() as a')).rows[0].a, false);
    await rejects(as(db, u(3), `update public.profiles set role = 'Admin' where id = $1`, [u(3)]), /administrator/);
    const slot = (await db.query(`select s.id from public.consultation_slots s join public.experts e on e.id = s.expert_id where e.user_id = $1 limit 1`, [u(3)])).rows[0].id;
    const booking = (await as(db, u(1), 'select public.book_consultation_slot($1, $2) as id', [slot, 'Soil test'])).rows[0].id;
    assert.equal((await as(db, u(3), 'select id from public.consultation_bookings')).rows[0].id, booking);
    assert.equal((await as(db, u(5), 'select id from public.consultation_bookings')).rows.length, 0);
  });
});

describe('07 — expert CV privacy (AUD-043)', () => {
  test('BEFORE: any signed-in user reads another user\'s CV; AFTER: owner and admin only; uploads only in own folder', async () => {
    const db = await createDb({ proposed: ['01', '03'] });
    await seed(db);
    await db.query(`insert into storage.objects (bucket_id, name) values ('expert-cvs', $1)`, [`${ids.farmerA}/123_cv.pdf`]);
    const readCv = (uid) => as(db, uid, `select name from storage.objects where bucket_id = 'expert-cvs'`).then((r) => r.rows.length);
    assert.equal(await readCv(ids.farmerB), 1);
    await applyProposed(db, '07');
    assert.equal(await readCv(ids.farmerB), 0);
    assert.equal(await readCv(ids.farmerA), 1);
    assert.equal(await readCv(ids.admin), 1);
    await as(db, ids.farmerB, `insert into storage.objects (bucket_id, name) values ('expert-cvs', $1)`, [`${ids.farmerB}/1_cv.pdf`]);
    await rejects(as(db, ids.farmerB, `insert into storage.objects (bucket_id, name) values ('expert-cvs', $1)`, [`${ids.farmerA}/evil.pdf`]), /row-level security/);
    await as(db, ids.farmerB, `insert into storage.objects (bucket_id, name) values ('post-videos', $1)`, [`${ids.farmerB}/1.mp4`]);
    await rejects(as(db, ids.farmerB, `insert into storage.objects (bucket_id, name) values ('post-videos', 'loose.mp4')`), /row-level security/);
  });
});

describe('08 — realtime publication (AUD-044)', () => {
  test('publishes the tables the apps subscribe to, idempotently', async () => {
    const db = await createDb({ proposed: ['08', '08'] });
    const t = (await db.query(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`)).rows.map((r) => r.tablename);
    assert.deepEqual(t, ['expert_applications', 'messages', 'notifications', 'orders', 'posts', 'reports']);
  });
});

describe('99 — rollback', () => {
  test('restores the old client paths, keeps data and the safe fixes, is re-runnable', async () => {
    const db = await createDb({ proposed: ALL });
    await seed(db);
    const id = (await as(db, ids.farmerA, 'select public.book_consultation_slot($1, $2) as id', [await addSlot(db), 'x'])).rows[0].id;
    await applyProposed(db, '99');
    await applyProposed(db, '99');
    await as(db, ids.farmerA, `update public.consultation_bookings set status = 'Completed' where id = $1`, [id]);
    await as(db, ids.farmerA, `insert into public.notifications (user_id, type, message) values ($1, 'system', 'y')`, [ids.farmerB]);
    assert.equal((await as(db, null, 'select id from public.profiles')).rows.length, 4);
    assert.equal((await db.query('select status from public.consultation_bookings where id = $1', [id])).rows[0].status, 'Completed');
    await signUp(db, 'cccccccc-0000-4000-8000-000000000009', 'x@test.local', { role: 'Admin' });
    assert.equal((await db.query(`select role from public.profiles where id = 'cccccccc-0000-4000-8000-000000000009'`)).rows[0].role, 'Farmer');
  });
});

test('proposed file list matches the harness', () => {
  for (const p of Object.values(PROPOSED)) readFileSync(root + p);
});
