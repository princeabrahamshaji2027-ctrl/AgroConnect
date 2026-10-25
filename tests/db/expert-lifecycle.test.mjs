// SQL behaviour tests for supabase/proposed/09 (owner change list 2026-10-25) on the REAL production schema in PGlite.
// Run with: npm run test:db
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, as, ids, seed, addSlot, rejects, ALL } from './harness.mjs';

const count = async (db, sql, params) => Number((await db.query(sql, params)).rows[0].count);
const setup = async () => {
  const db = await createDb({ proposed: [...ALL, '09'] });
  await seed(db);
  return db;
};
const book = (db, uid, slot) =>
  as(db, uid, 'select public.book_consultation_slot($1, $2) as id', [slot, 'Leaf curl']).then((r) => r.rows[0].id);

describe('09 — removing an expert keeps history and protects farmers', () => {
  test('old behaviour reproduced: demote_expert deleted the expert\'s bookings and reviews', async () => {
    const db = await createDb({ proposed: ALL });
    await seed(db);
    const id = await book(db, ids.farmerA, await addSlot(db));
    await as(db, ids.admin, 'select public.demote_expert($1)', [ids.expertUser]);
    assert.equal(await count(db, 'select count(*) from public.consultation_bookings where id = $1', [id]), 0);
  });

  test('admin removal: role Farmer, row inactive, upcoming booking cancelled with full refund, farmer notified', async () => {
    const db = await setup();
    const booked = await addSlot(db, { rate: 450 });
    const free = await addSlot(db, { time: '12:00' });
    const id = await book(db, ids.farmerA, booked);
    await rejects(as(db, ids.expertUser, 'select public.demote_expert($1)', [ids.expertUser]), /not authorized/);
    await as(db, ids.admin, 'select public.demote_expert($1)', [ids.expertUser]);

    assert.equal((await db.query('select role from public.profiles where id = $1', [ids.expertUser])).rows[0].role, 'Farmer');
    assert.equal((await db.query('select is_active from public.experts where id = $1', [ids.expertRow])).rows[0].is_active, false);
    const b = (await db.query('select status, refund_status, refund_amount from public.consultation_bookings where id = $1', [id])).rows[0];
    assert.deepEqual([b.status, b.refund_status, Number(b.refund_amount)], ['Cancelled', 'Pending', 450]);
    assert.equal(await count(db, `select count(*) from public.notifications where user_id = $1 and related_id = $2`, [ids.farmerA, id]) >= 1, true);
    assert.equal(await count(db, 'select count(*) from public.consultation_slots where id = $1', [free]), 0, 'open slot removed');
    assert.equal(await count(db, 'select count(*) from public.consultation_slots where id = $1', [booked]), 1, 'booked slot kept for history');
  });

  test('re-approval reactivates the same experts row', async () => {
    const db = await setup();
    await as(db, ids.admin, 'select public.demote_expert($1)', [ids.expertUser]);
    const app = (await as(db, ids.expertUser,
      `insert into public.expert_applications (user_id, qualification, experience) values ($1, 'MSc', '5y') returning id`,
      [ids.expertUser])).rows[0].id;
    await as(db, ids.admin, 'select public.approve_expert_application($1)', [app]);
    const e = (await db.query('select id, is_active from public.experts where user_id = $1', [ids.expertUser])).rows;
    assert.deepEqual(e.map((r) => [r.id, r.is_active]), [[ids.expertRow, true]]);
    assert.equal((await db.query('select role from public.profiles where id = $1', [ids.expertUser])).rows[0].role, 'Expert');
    await rejects(as(db, ids.admin, 'select public.approve_expert_application($1)', [app]), /not pending/);
  });
});

describe('09 — one expert request per user', () => {
  const apply = (db, uid) => as(db, uid,
    `insert into public.expert_applications (user_id, qualification, experience, status) values ($1, 'BSc', '2y', 'Approved') returning status`, [uid]);

  test('second request while one is pending is refused; client cannot pre-approve', async () => {
    const db = await setup();
    assert.equal((await apply(db, ids.farmerA)).rows[0].status, 'Pending');
    await rejects(apply(db, ids.farmerA), /pending review/);
    assert.equal(await count(db, 'select count(*) from public.expert_applications where user_id = $1', [ids.farmerA]), 1);
  });

  test('an active expert cannot apply again', async () => {
    const db = await setup();
    await rejects(apply(db, ids.expertUser), /already a verified expert/);
  });
});

describe('09 — leaving expert mode needs admin approval', () => {
  const resign = (db, uid, reason = 'Retiring from consulting') => as(db, uid,
    `insert into public.expert_resignations (user_id, reason, status) values ($1, $2, 'Approved') returning id, status`, [uid, reason]);

  test('expert request is Pending, admins are notified, duplicates and non-experts refused', async () => {
    const db = await setup();
    const r = (await resign(db, ids.expertUser)).rows[0];
    assert.equal(r.status, 'Pending');
    assert.equal(await count(db, 'select count(*) from public.notifications where user_id = $1 and related_id = $2', [ids.admin, r.id]), 1);
    await rejects(resign(db, ids.expertUser), /already waiting/);
    await rejects(resign(db, ids.farmerA), /Only an active expert/);
    assert.equal((await db.query('select role from public.profiles where id = $1', [ids.expertUser])).rows[0].role, 'Expert');
  });

  test('admin approval demotes; rejection keeps expert and tells them why; only admins decide', async () => {
    const db = await setup();
    const r1 = (await resign(db, ids.expertUser)).rows[0].id;
    await rejects(as(db, ids.expertUser, 'select public.approve_expert_resignation($1)', [r1]), /not authorized/);
    await as(db, ids.admin, `select public.reject_expert_resignation($1, 'Please finish October bookings first')`, [r1]);
    assert.equal((await db.query('select role from public.profiles where id = $1', [ids.expertUser])).rows[0].role, 'Expert');
    assert.equal(await count(db, `select count(*) from public.notifications where user_id = $1 and message like '%October bookings%'`, [ids.expertUser]), 1);

    const r2 = (await resign(db, ids.expertUser)).rows[0].id;
    await as(db, ids.admin, 'select public.approve_expert_resignation($1)', [r2]);
    assert.equal((await db.query('select role from public.profiles where id = $1', [ids.expertUser])).rows[0].role, 'Farmer');
    assert.equal((await db.query('select is_active from public.experts where id = $1', [ids.expertRow])).rows[0].is_active, false);
    assert.equal((await db.query('select status from public.expert_resignations where id = $1', [r2])).rows[0].status, 'Approved');
  });
});

describe('09 — deleting a user', () => {
  test('a targeted broadcast no longer blocks deletion; a deleted farmer\'s booking frees the slot', async () => {
    const db = await setup();
    const slot = await addSlot(db);
    await book(db, ids.farmerA, slot);
    await db.query(`insert into public.broadcasts (title, message, sent_by, target_user_id) values ('Hi', 'x', $1, $2)`, [ids.admin, ids.farmerA]);
    await db.query('delete from auth.users where id = $1', [ids.farmerA]);
    assert.equal(await count(db, 'select count(*) from public.profiles where id = $1', [ids.farmerA]), 0);
    assert.equal((await db.query('select is_booked from public.consultation_slots where id = $1', [slot])).rows[0].is_booked, false);
  });

  test('deleting an expert user removes the expert and their data', async () => {
    const db = await setup();
    await book(db, ids.farmerA, await addSlot(db));
    await db.query('delete from auth.users where id = $1', [ids.expertUser]);
    assert.equal(await count(db, 'select count(*) from public.experts'), 0);
    assert.equal(await count(db, 'select count(*) from public.consultation_bookings'), 0);
  });

  test('09 is re-runnable', async () => {
    const db = await setup();
    const { readFileSync } = await import('node:fs');
    await db.exec(readFileSync(new URL('../../supabase/proposed/09_expert_lifecycle_and_user_deletion.sql', import.meta.url), 'utf8'));
  });
});

describe('09 — no self-demotion', () => {
  test('an expert cannot switch their own role to Farmer (01 allowed it); admin still can', async () => {
    const db = await setup();
    await rejects(as(db, ids.expertUser, `update public.profiles set role = 'Farmer' where id = $1`, [ids.expertUser]), /administrator/);
    await as(db, ids.admin, `update public.profiles set role = 'Farmer' where id = $1`, [ids.expertUser]);
    assert.equal((await db.query('select role from public.profiles where id = $1', [ids.expertUser])).rows[0].role, 'Farmer');
  });
});
