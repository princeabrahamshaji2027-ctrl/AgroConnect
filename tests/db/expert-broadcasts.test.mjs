// SQL behaviour tests for supabase/proposed/25 (expert broadcasts that an admin approves or rejects; recipients can read
// the approved broadcasts they received) on the production schema in PGlite (01–25 applied). Run with: npm run test:db
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, applyProposed, as, ids, seed, rejects, ALL } from './harness.mjs';

const UPTO_24 = [...ALL, '09', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24'];
const setup = async () => {
  const db = await createDb({ proposed: [...UPTO_24, '25'] });
  await seed(db);
  return db;
};
const count = async (db, sql, params) => Number((await db.query(sql, params)).rows[0].count);
const submit = (db, uid, title = 'Pest alert', message = 'Rhinoceros beetle season: check coconut crowns this week.', role = null) =>
  as(db, uid, 'select public.submit_expert_broadcast($1, $2, $3) as id', [title, message, role]).then((r) => r.rows[0].id);
const review = (db, uid, id, approve, note = null) =>
  as(db, uid, 'select public.review_broadcast($1, $2, $3) as n', [id, approve, note]).then((r) => r.rows[0].n);

describe('25 — who may submit an expert broadcast', () => {
  test('farmers, anonymous callers, inactive or banned experts are refused; direct inserts are refused', async () => {
    const db = await setup();
    await rejects(submit(db, ids.farmerA), /Only verified experts can send announcements/);
    await rejects(submit(db, null), /permission denied for function submit_expert_broadcast/);
    await rejects(as(db, ids.expertUser, `insert into public.broadcasts (title, message, sent_by, status) values ('x', 'yyyyy', $1, 'approved')`,
      [ids.expertUser]), /row-level security/);
    await rejects(as(db, ids.expertUser, `select public.send_broadcast('t', 'message', null::text, null::user_role, null::uuid, 'dismissible')`),
      /not authorized/);
    await db.query('update public.experts set is_active = false where id = $1', [ids.expertRow]);
    await rejects(submit(db, ids.expertUser), /Only verified experts/);
    await db.query('update public.experts set is_active = true where id = $1', [ids.expertRow]);
    await db.query('update public.profiles set is_banned = true where id = $1', [ids.expertUser]);
    await rejects(submit(db, ids.expertUser), /account is banned/);
  });

  test('input is validated and at most 3 can wait at once', async () => {
    const db = await setup();
    await rejects(submit(db, ids.expertUser, 'x'), /Title must be 2 to 120/);
    await rejects(submit(db, ids.expertUser, 'Ok title', 'hey'), /Message must be 5 to 1000/);
    await rejects(submit(db, ids.expertUser, 'Ok title', 'Long enough', 'Admin'), /everyone, farmers or experts/);
    for (let i = 0; i < 3; i++) await submit(db, ids.expertUser, `Alert ${i}`);
    await rejects(submit(db, ids.expertUser), /already have 3 announcements waiting/);
  });
});

describe('25 — pending until reviewed', () => {
  test('a pending broadcast reaches nobody; admins are told; the expert sees their own, others see nothing', async () => {
    const db = await setup();
    const id = await submit(db, ids.expertUser);
    assert.equal(await count(db, `select count(*) from public.notifications where related_id = $1 and type = 'announcement'`, [id]), 0);
    assert.equal(await count(db, `select count(*) from public.notifications where related_id = $1 and type = 'system' and user_id = $2`,
      [id, ids.admin]), 1);
    assert.equal((await as(db, ids.expertUser, 'select status from public.broadcasts where id = $1', [id])).rows[0].status, 'pending');
    assert.equal((await as(db, ids.farmerA, 'select id from public.broadcasts where id = $1', [id])).rows.length, 0);
    await rejects(review(db, ids.expertUser, id, true), /Admin privileges required/);
    await rejects(review(db, ids.farmerA, id, true), /Admin privileges required/);
  });

  test('approval delivers it to the target audience exactly once and the recipients can read it', async () => {
    const db = await setup();
    const id = await submit(db, ids.expertUser, 'For farmers', 'Apply lime before the monsoon.', 'Farmer');
    assert.equal(await review(db, ids.admin, id, true), 2);
    const to = (await db.query(`select user_id from public.notifications where related_id = $1 and type = 'announcement' order by user_id`, [id]))
      .rows.map((r) => r.user_id);
    assert.deepEqual(to, [ids.farmerA, ids.farmerB]);
    const row = (await as(db, ids.farmerA, 'select title, status, recipient_count from public.broadcasts where id = $1', [id])).rows[0];
    assert.deepEqual(row, { title: 'For farmers', status: 'approved', recipient_count: 2 });
    // the expert was not a recipient but sent it, so they can read it; the reviewer note and audit are recorded
    assert.equal((await as(db, ids.expertUser, 'select status from public.broadcasts where id = $1', [id])).rows[0].status, 'approved');
    assert.equal(await count(db, `select count(*) from public.notifications where related_id = $1 and user_id = $2 and message like '%approved%'`,
      [id, ids.expertUser]), 1);
    assert.equal(await count(db, `select count(*) from public.admin_audit_log where action = 'approve_broadcast' and target_id = $1`, [id]), 1);
    await rejects(review(db, ids.admin, id, true), /already reviewed/);
    await rejects(review(db, ids.admin, id, false), /already reviewed/);
  });

  test('rejection delivers nothing, tells the expert why, and frees a pending place', async () => {
    const db = await setup();
    const id = await submit(db, ids.expertUser);
    assert.equal(await review(db, ids.admin, id, false, 'Please add the district'), 0);
    assert.equal(await count(db, `select count(*) from public.notifications where related_id = $1 and type = 'announcement'`, [id]), 0);
    assert.equal(await count(db, `select count(*) from public.notifications where related_id = $1 and user_id = $2
                                   and message like '%not approved: Please add the district%'`, [id, ids.expertUser]), 1);
    assert.equal((await as(db, ids.farmerA, 'select id from public.broadcasts where id = $1', [id])).rows.length, 0);
    const row = (await db.query('select status, review_note, reviewed_by from public.broadcasts where id = $1', [id])).rows[0];
    assert.deepEqual(row, { status: 'rejected', review_note: 'Please add the district', reviewed_by: ids.admin });
  });

  test('cannot approve after the expert was removed; rejecting still works', async () => {
    const db = await setup();
    const id = await submit(db, ids.expertUser);
    await db.query('update public.experts set is_active = false where id = $1', [ids.expertRow]);
    await rejects(review(db, ids.admin, id, true), /no longer active/);
    assert.equal(await review(db, ids.admin, id, false), 0);
  });
});

describe('25 — admin broadcasts and history', () => {
  test('send_broadcast still delivers immediately as approved; recipients read it, non-recipients do not', async () => {
    const db = await setup();
    const id = (await as(db, ids.admin, `select public.send_broadcast('Maintenance', 'App update tonight.', null::text, 'Expert'::user_role,
                                          null::uuid, 'dismissible') as id`)).rows[0].id;
    assert.equal((await db.query('select status from public.broadcasts where id = $1', [id])).rows[0].status, 'approved');
    assert.equal((await as(db, ids.expertUser, 'select id from public.broadcasts where id = $1', [id])).rows.length, 1);
    assert.equal((await as(db, ids.farmerA, 'select id from public.broadcasts where id = $1', [id])).rows.length, 0);
  });

  test('an expert who sent a broadcast can still be deleted; their broadcast goes with them', async () => {
    const db = await setup();
    const id = await submit(db, ids.expertUser);
    await review(db, ids.admin, id, false);
    await db.query('delete from public.profiles where id = $1', [ids.expertUser]);
    assert.equal(await count(db, 'select count(*) from public.broadcasts where id = $1', [id]), 0);
  });

  test('rollback removes 25 and keeps approved broadcasts', async () => {
    const db = await createDb({ proposed: UPTO_24 });
    await seed(db);
    await applyProposed(db, '25');
    const keep = await submit(db, ids.expertUser);
    await review(db, ids.admin, keep, true);
    await submit(db, ids.expertUser, 'Still pending');
    await applyProposed(db, '99');
    assert.equal(await count(db, `select count(*) from pg_proc where proname in ('review_broadcast', 'submit_expert_broadcast')`), 0);
    assert.equal(await count(db, 'select count(*) from public.broadcasts'), 1);
    await applyProposed(db, '25');   // re-applying works after a rollback
  });
});
