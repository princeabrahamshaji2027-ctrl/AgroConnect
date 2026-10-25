// SQL behaviour tests for supabase/proposed/12 (expert-controlled completion) and 13 (push queue and devices) on the
// REAL production schema in PGlite. Run with: npm run test:db
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, applyProposed, as, ids, seed, addSlot, addBookingStartingIn, startOf, rejects, ALL } from './harness.mjs';

const count = async (db, sql, params) => Number((await db.query(sql, params)).rows[0].count);
const setup = async (extra = ['12', '13']) => {
  const db = await createDb({ proposed: [...ALL, '09', '11', ...extra] });
  await seed(db);
  return db;
};
const book = (db, uid, slot, issue = 'Private crop issue: leaf curl') =>
  as(db, uid, 'select public.book_consultation_slot($1, $2) as id', [slot, issue]).then((r) => r.rows[0].id);
const asService = async (db, sql, params = []) => {
  await db.exec('set role service_role');
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const TOKEN = (n) => `fcm-token-${n}-${'x'.repeat(40)}`;

describe('12 — expert-controlled completion', () => {
  test('the farmer cannot end a consultation; the expert can (after start, having joined)', async () => {
    const db = await setup(['12']);
    const b = await addBookingStartingIn(db, -2, { joined: true });
    await rejects(as(db, ids.farmerA, 'select public.complete_consultation($1)', [b.id]), /Only the expert/);
    await as(db, ids.expertUser, 'select public.complete_consultation($1)', [b.id]);
    assert.equal((await db.query('select status from public.consultation_bookings where id = $1', [b.id])).rows[0].status, 'Completed');
  });

  test('scheduler completes an attended meeting at slot end (one review request); never one the expert skipped', async () => {
    const db = await setup(['12']);
    const attended = await addBookingStartingIn(db, -31, { joined: true });   // 30-minute slot is over
    const running = await addBookingStartingIn(db, -10, { joined: true, farmer: ids.farmerB });   // still running
    const r = (await db.query('select public.process_consultation_lifecycle() as r')).rows[0].r;
    assert.equal(r.auto_completed, 1);
    assert.equal((await db.query('select status from public.consultation_bookings where id = $1', [attended.id])).rows[0].status, 'Completed');
    assert.equal((await db.query('select status from public.consultation_bookings where id = $1', [running.id])).rows[0].status, 'Booked');
    assert.equal(await count(db, `select count(*) from public.notifications where related_id = $1 and message like '%Please rate%'`, [attended.id]), 1);
    await db.query('select public.process_consultation_lifecycle()');   // runs again: nothing new
    assert.equal(await count(db, `select count(*) from public.notifications where related_id = $1 and message like '%Please rate%'`, [attended.id]), 1);
  });
});

describe('13 — device tokens', () => {
  test('register uses the caller; the same phone moving accounts moves the token; no direct writes', async () => {
    const db = await setup();
    await as(db, ids.farmerA, `select public.register_push_device($1, 'android', 'com.agroconnect.app.staging')`, [TOKEN(1)]);
    await as(db, ids.farmerA, `select public.register_push_device($1, 'android', 'com.agroconnect.app.staging')`, [TOKEN(1)]);   // repeat
    assert.equal(await count(db, 'select count(*) from public.push_devices'), 1);
    await as(db, ids.farmerB, `select public.register_push_device($1)`, [TOKEN(1)]);   // account switch on that phone
    assert.equal((await db.query('select user_id from public.push_devices where token = $1', [TOKEN(1)])).rows[0].user_id, ids.farmerB);
    await rejects(as(db, ids.farmerA, `insert into public.push_devices (user_id, token) values ($1, $2)`, [ids.farmerB, TOKEN(2)]));
    await rejects(as(db, ids.farmerA, `update public.push_devices set user_id = $1`, [ids.farmerA]));
    assert.equal((await as(db, ids.farmerA, 'select id from public.push_devices')).rows.length, 0, 'sees another user token');
    await rejects(as(db, ids.farmerA, `select public.register_push_device('short')`), /invalid device token/);
    await rejects(as(db, null, `select public.register_push_device($1)`, [TOKEN(3)]), /permission denied|not authenticated/);
  });

  test('unregister removes only the caller\'s own token (sign-out / notifications off)', async () => {
    const db = await setup();
    await as(db, ids.farmerA, `select public.register_push_device($1)`, [TOKEN(1)]);
    await as(db, ids.farmerB, `select public.unregister_push_device($1)`, [TOKEN(1)]);
    assert.equal(await count(db, 'select count(*) from public.push_devices'), 1);
    await as(db, ids.farmerA, `select public.unregister_push_device($1)`, [TOKEN(1)]);
    assert.equal(await count(db, 'select count(*) from public.push_devices'), 0);
  });
});

describe('13 — push outbox', () => {
  test('a booking queues one push per notification (expert + farmer), without the private issue text', async () => {
    const db = await setup();
    const id = await book(db, ids.farmerA, await addSlot(db));
    const rows = (await db.query('select user_id, body, data, status from public.push_outbox order by user_id')).rows;
    assert.deepEqual(rows.map((r) => r.user_id).sort(), [ids.farmerA, ids.expertUser].sort());
    for (const r of rows) {
      assert.equal(r.status, 'queued');
      assert.doesNotMatch(r.body, /leaf curl|Topic/i, 'issue text in push');
      assert.equal(r.data.booking_id, id);
    }
    // repeated submit: same booking, no new push
    await book(db, ids.farmerA, (await db.query('select slot_id from public.consultation_bookings where id = $1', [id])).rows[0].slot_id);
    assert.equal(await count(db, 'select count(*) from public.push_outbox'), 2);
  });

  test('failed booking queues nothing; client-made notifications are never pushed; the 5-minute reminder queues once per person', async () => {
    const db = await setup();
    const slot = await addSlot(db);
    await book(db, ids.farmerA, slot);
    const before = await count(db, 'select count(*) from public.push_outbox');
    await rejects(book(db, ids.farmerB, slot), /already booked/);
    await as(db, ids.farmerA, `insert into public.notifications (user_id, type, message) values ($1, 'booking', 'self-made')`, [ids.farmerA]);
    assert.equal(await count(db, 'select count(*) from public.push_outbox'), before);

    const b = await addBookingStartingIn(db, 4, { farmer: ids.farmerB });
    await db.query('select public.process_consultation_lifecycle()');
    await db.query('select public.process_consultation_lifecycle()');
    assert.equal(await count(db, `select count(*) from public.push_outbox o join public.notifications n on n.id = o.notification_id
                                   where n.related_id = $1 and n.message like 'Reminder: your consultation%'`, [b.id]), 2);
  });

  test('dispatcher protocol: claim (service only) -> sent / retry with backoff / failed after 5 / invalid token disabled', async () => {
    const db = await setup();
    await as(db, ids.expertUser, `select public.register_push_device($1)`, [TOKEN(1)]);
    await as(db, ids.expertUser, `select public.register_push_device($1)`, [TOKEN(2)]);
    await book(db, ids.farmerA, await addSlot(db));   // farmer has no device
    await rejects(as(db, ids.farmerA, 'select public.claim_push_batch(10)'), /permission denied/);

    const batch = (await asService(db, 'select public.claim_push_batch(10) as b')).rows[0].b;
    assert.equal(batch.length, 2);
    const exp = batch.find((x) => x.devices.length === 2);
    const farm = batch.find((x) => x.devices.length === 0);
    assert.equal((await asService(db, 'select public.claim_push_batch(10) as b')).rows[0].b.length, 0, 'claimed twice');

    const bad = exp.devices.find((d) => d.token === TOKEN(2)).id;
    await asService(db, `select public.finish_push($1, 'sent', null, 1, $2::uuid[])`, [exp.id, [bad]]);
    await asService(db, `select public.finish_push($1, 'no_device')`, [farm.id]);
    const st = (await db.query('select status, delivered_devices from public.push_outbox where id = $1', [exp.id])).rows[0];
    assert.deepEqual([st.status, st.delivered_devices], ['sent', 1]);
    assert.ok((await db.query('select disabled_at from public.push_devices where id = $1', [bad])).rows[0].disabled_at, 'invalid token not disabled');

    // retry path on a fresh row
    const id2 = await book(db, ids.farmerB, await addSlot(db, { time: '12:00' }));
    const row = (await db.query(`select o.id from public.push_outbox o join public.notifications n on n.id = o.notification_id
                                 where n.related_id = $1 and o.user_id = $2`, [id2, ids.expertUser])).rows[0].id;
    for (let i = 1; i <= 5; i += 1) {
      await db.query(`update public.push_outbox set next_attempt_at = now() - interval '1 second' where id = $1`, [row]);
      const claimed = (await asService(db, 'select public.claim_push_batch(50) as b')).rows[0].b.find((x) => x.id === row);
      assert.ok(claimed, `attempt ${i} not claimed`);
      await asService(db, `select public.finish_push($1, 'retry', 'HTTP 503')`, [row]);
      const r = (await db.query('select status, next_attempt_at > now() as later from public.push_outbox where id = $1', [row])).rows[0];
      assert.equal(r.status, i < 5 ? 'queued' : 'failed');
      if (i < 5) assert.equal(r.later, true, 'no backoff');
    }
    // in-app notification is untouched by push failures
    assert.ok(await count(db, 'select count(*) from public.notifications where related_id = $1', [id2]) >= 2);
  });

  test('dispatch secret exists and only the service role can read it; 12 and 13 re-run', async () => {
    const db = await setup();
    await rejects(as(db, ids.admin, 'select public.push_dispatch_secret()'), /permission denied/);
    const s = (await asService(db, 'select public.push_dispatch_secret() as s')).rows[0].s;
    assert.match(s, /^[0-9a-f]{64}$/);
    await applyProposed(db, '12');
    await applyProposed(db, '13');
    assert.equal((await asService(db, 'select public.push_dispatch_secret() as s')).rows[0].s, s, 'secret rotated on re-run');
  });
});

describe('13 — push privacy and staleness', () => {
  test('cancellation reasons and topics never reach the push text; 24-hour reminder does not say "tomorrow"', async () => {
    const db = await setup();
    const id = await book(db, ids.farmerA, await addSlot(db, { days: 3 }));
    await as(db, ids.farmerA, `select public.cancel_consultation_booking($1, 'my cow is sick, private detail', '[]'::jsonb)`, [id]);
    const bodies = (await db.query('select body from public.push_outbox')).rows.map((r) => r.body).join(' | ');
    assert.doesNotMatch(bodies, /cow is sick|leaf curl|Reason:|Topic:/);
    const b = await addBookingStartingIn(db, 120, { farmer: ids.farmerB });
    await db.query('select public.process_consultation_lifecycle()');
    const msg = (await db.query(`select message from public.notifications where related_id = $1 and message like 'Reminder: you have a consultation on%'`, [b.id])).rows;
    assert.equal(msg.length, 2);
    assert.doesNotMatch(msg[0].message, /tomorrow/);
  });

  test('pushes queued more than 2 hours ago are dropped as expired, not sent late', async () => {
    const db = await setup();
    await book(db, ids.farmerA, await addSlot(db));
    await db.query(`update public.push_outbox set created_at = now() - interval '3 hours'`);
    assert.equal((await asService(db, 'select public.claim_push_batch(10) as b')).rows[0].b.length, 0);
    assert.deepEqual((await db.query('select distinct status, last_error from public.push_outbox')).rows, [{ status: 'failed', last_error: 'expired before delivery' }]);
  });
});
