// Demo payment checkout, Google Meet links and push-device registration on STAGING (migrations 13 + 14, Edge Functions).
// Scenarios B–G of the final Catch Up audit (A is the real-time test in staging-catchup). No real money, no payment or
// video provider. FCM is NOT configured: push tests prove the server side only. Synthetic accounts only.
//   node --test tests/e2e/staging-meet-payment-push.test.mjs
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { demoBook } from './demo-booking.mjs';
import { cleanupTestTraffic } from './cleanup.mjs';

const RUN_START = Date.now();   // rows this file creates between test accounts are removed again in after()

const envFile = new URL('../../.env.staging', import.meta.url);
const env = existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split('\n')
  .filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])) : {};
const URL_ = env.STAGING_SUPABASE_URL;
if (URL_?.includes('mgreapakfchcxcrauheq')) throw new Error('Refusing to run against production.');
const skip = URL_ && env.FIXTURE_EMAIL_TOKEN ? false : 'staging env not configured';
const fx = (n) => `agroconnect-stg-${n}-${env.FIXTURE_EMAIL_TOKEN}@${env.FIXTURE_EMAIL_DOMAIN}`;
const mk = () => createClient(URL_, env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function signIn(name) {
  const c = mk();
  const { data, error } = await c.auth.signInWithPassword({ email: fx(name), password: name === 'admin' ? env.E2E_ADMIN_PASSWORD : env.FIXTURE_PASSWORD });
  if (error) throw new Error(`sign-in ${name}: ${error.message}`);
  return { c, uid: data.user.id };
}
const ist = (min) => { const d = new Date(Math.ceil((Date.now() + min * 60000) / 60000) * 60000 + 330 * 60000); return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) }; };
const plus30 = (t) => { const [h, m] = t.split(':').map(Number); const x = (h * 60 + m + 30) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };

const A = {}; const bookings = []; const slots = [];
before(async () => {
  if (skip) return;
  for (const n of ['expert1', 'user1', 'user2', 'admin']) A[n] = await signIn(n);
  const me = (await A.expert1.c.from('experts').select('id, consultation_fee_paise').eq('user_id', A.expert1.uid).single()).data;
  A.expertId = me.id; A.originalFee = me.consultation_fee_paise;
  assert.ifError((await A.expert1.c.rpc('set_consultation_fee', { p_fee_paise: FEE })).error);
});
after(async () => {
  for (const id of bookings) for (const who of [A.user1, A.user2]) await who.c.rpc('cancel_consultation_booking', { p_booking_id: id, p_reason: 'meet/payment test cleanup', p_offered_slots: [] });
  for (const id of slots) await A.expert1.c.from('consultation_slots').delete().eq('id', id).eq('is_booked', false);
  if (A.originalFee) await A.expert1?.c.rpc('set_consultation_fee', { p_fee_paise: A.originalFee });
  await A.user1?.c.rpc('unregister_push_device', { p_token: `test-token-${env.FIXTURE_EMAIL_TOKEN}-${'y'.repeat(30)}` });
  await cleanupTestTraffic(RUN_START);   // no-op without STAGING_SUPABASE_SERVICE_ROLE_KEY
});
const MEET = 'https://meet.google.com/stg-test-lnk';
const FEE = 30000;   // ₹300 — set on expert1 for these tests, original fee restored afterwards
const notesFor = async (who, booking) =>
  (await who.c.from('notifications').select('message').eq('user_id', who.uid).eq('related_id', booking)).data.map((n) => n.message);
// another file may already use this minute for the same expert (unique_expert_slot): take the next free one
async function freshSlot(min) {   // no price on slots: the fee is the expert's (migration 15)
  let s;
  for (let k = 0; k < 6; k++) {
    const at = ist(min + k);
    s = await A.expert1.c.from('consultation_slots').insert({ expert_id: A.expertId, slot_date: at.date, start_time: at.time, end_time: plus30(at.time) }).select('id').single();
    if (s.error?.code !== '23505') break;
  }
  assert.ifError(s.error); slots.push(s.data.id);
  return s.data.id;
}

describe('demo payment checkout (staging) — no real money, no provider', { skip }, () => {
  test('B: cancelled demo payment books nothing and notifies nobody; cancelled never becomes confirmed', async () => {
    const slot = await freshSlot(200);
    const p = (await A.user1.c.rpc('start_demo_checkout', { p_slot_id: slot, p_issue: 'scenario B', p_idempotency_key: crypto.randomUUID() })).data;
    assert.deepEqual([p.status, p.transaction_type, p.currency, p.amount_paise], ['pending', 'simulated', 'INR', FEE]);
    assert.equal((await A.user1.c.rpc('cancel_demo_payment', { p_payment_id: p.payment_id })).data.status, 'cancelled');
    assert.equal((await A.user1.c.rpc('confirm_demo_payment', { p_payment_id: p.payment_id })).data.status, 'cancelled');
    assert.equal((await A.expert1.c.from('consultation_slots').select('is_booked').eq('id', slot).single()).data.is_booked, false);
    assert.equal((await A.expert1.c.from('consultation_bookings').select('id').eq('slot_id', slot)).data.length, 0);
  });

  test('C: a failed confirmation shows no booking; a new checkout afterwards succeeds once', async () => {
    const slot = await freshSlot(210);
    const p = (await A.user1.c.rpc('start_demo_checkout', { p_slot_id: slot, p_issue: 'scenario C', p_idempotency_key: crypto.randomUUID() })).data;
    assert.ifError((await A.expert1.c.rpc('set_consultation_fee', { p_fee_paise: FEE + 5000 })).error);   // fee changed meanwhile
    const failed = (await A.user1.c.rpc('confirm_demo_payment', { p_payment_id: p.payment_id })).data;
    assert.deepEqual([failed.status, failed.failure_reason, failed.booking_id], ['failed', 'fee_changed', null]);
    assert.equal((await A.expert1.c.from('consultation_bookings').select('id').eq('slot_id', slot)).data.length, 0);
    const ok = await demoBook(A.user1.c, slot, 'scenario C retry');
    assert.ifError(ok.error); bookings.push(ok.data);
    assert.equal(ok.payment.amount_paise, FEE + 5000, 'new checkout uses the current fee');
    assert.equal((await notesFor(A.user1, ok.data)).length, 1, 'farmer booking notice exactly once');
    assert.equal((await notesFor(A.expert1, ok.data)).length, 1, 'expert booking notice exactly once');
    // G: after "restarting" (a new session) the authoritative state is read back from the server
    const again = await signIn('user1');
    const row = (await again.c.from('demo_payments').select('status, booking_id, amount_paise, currency').eq('id', ok.payment.payment_id).single()).data;
    assert.deepEqual([row.status, row.booking_id, row.amount_paise, row.currency], ['succeeded', ok.data, FEE + 5000, 'INR']);
  });

  test('D: two farmers confirm the same slot at once: exactly one booking', async () => {
    const slot = await freshSlot(220);
    const [a, b] = await Promise.all([demoBook(A.user1.c, slot, 'scenario D a'), demoBook(A.user2.c, slot, 'scenario D b')]);
    const won = [a, b].filter((r) => !r.error);
    assert.equal(won.length, 1, `winners: ${won.length}`);
    bookings.push(won[0].data);
    assert.match([a, b].find((r) => r.error).error.message, /slot_taken|just been booked/);
    assert.equal((await A.expert1.c.from('consultation_bookings').select('id').eq('slot_id', slot)).data.length, 1);
  });

  test('F: no amount from the client, no skipping the checkout, no touching another farmer\'s payment', async () => {
    const slot = await freshSlot(230);
    const p = (await A.user1.c.rpc('start_demo_checkout', { p_slot_id: slot, p_issue: 'scenario F', p_idempotency_key: crypto.randomUUID() })).data;
    assert.ok((await A.user2.c.rpc('confirm_demo_payment', { p_payment_id: p.payment_id })).error, 'other farmer confirmed');
    assert.ok((await A.user2.c.rpc('cancel_demo_payment', { p_payment_id: p.payment_id })).error, 'other farmer cancelled');
    assert.equal((await A.user2.c.from('demo_payments').select('id').eq('id', p.payment_id)).data.length, 0, 'other farmer reads it');
    assert.ok((await A.user1.c.from('demo_payments').update({ status: 'succeeded', amount_paise: 1 }).eq('id', p.payment_id).select()).error
      || (await A.user1.c.from('demo_payments').select('status').eq('id', p.payment_id).single()).data.status === 'pending', 'payment edited');
    assert.ok((await A.user1.c.from('demo_payments').insert({ farmer_user_id: A.user1.uid, issue: 'x', amount_paise: 1, idempotency_key: crypto.randomUUID(), expires_at: new Date(Date.now() + 1e6).toISOString() })).error, 'payment inserted');
    assert.match((await A.user1.c.rpc('book_consultation_slot', { p_slot_id: slot, p_issue: 'skip' })).error?.message || '', /permission denied/);
    assert.ok((await A.user1.c.rpc('start_demo_checkout', { p_slot_id: slot, p_issue: 'x', p_idempotency_key: crypto.randomUUID(), p_amount: 1 })).error, 'client amount accepted');
    assert.ok((await A.expert1.c.rpc('set_consultation_fee', { p_fee_paise: 0 })).error, 'invalid fee saved');
    await A.user1.c.rpc('cancel_demo_payment', { p_payment_id: p.payment_id });
  });
});

describe('expert fee, 2 % commission and admin reporting (staging)', { skip }, () => {
  test('fee: only the expert sets it (₹1–₹1,00,000); farmers and direct writes are refused; farmers can read it', async () => {
    assert.equal((await A.expert1.c.rpc('set_consultation_fee', { p_fee_paise: 100000 })).data, 100000);
    for (const bad of [0, 99, -1, 10000001]) assert.ok((await A.expert1.c.rpc('set_consultation_fee', { p_fee_paise: bad })).error, `accepted ${bad}`);
    assert.match((await A.user1.c.rpc('set_consultation_fee', { p_fee_paise: 100 })).error?.message || '', /Only experts/);
    const direct = await A.expert1.c.from('experts').update({ consultation_fee_paise: 5000 }).eq('id', A.expertId).select();
    assert.match(direct.error?.message || '', /consultation fee setting/);
    assert.ok((await A.admin.c.from('experts').update({ consultation_fee_paise: 5000 }).eq('id', A.expertId).select()).error, 'admin wrote the column directly');
    const sneaky = await A.user1.c.from('experts').update({ consultation_fee_paise: 100 }).eq('id', A.expertId).select();
    assert.ok(sneaky.error || sneaky.data.length === 0);
    assert.equal((await A.user2.c.from('experts').select('consultation_fee_paise').eq('id', A.expertId).single()).data.consultation_fee_paise, 100000);
    assert.match((await A.user1.c.rpc('admin_set_consultation_fee', { p_expert_id: A.expertId, p_fee_paise: 100, p_reason: 'x' })).error?.message || '', /Admin privileges/);
  });

  test('₹1,000 → commission ₹20, expert share ₹980; a later fee change leaves the booking as it was; admin sees the same', async () => {
    const slot = await freshSlot(260);
    assert.ifError((await A.expert1.c.rpc('set_consultation_fee', { p_fee_paise: 100000 })).error);
    const b = await demoBook(A.user1.c, slot, 'commission check'); assert.ifError(b.error); bookings.push(b.data);
    assert.ifError((await A.expert1.c.rpc('set_consultation_fee', { p_fee_paise: 120000 })).error);
    const snap = (await A.user1.c.from('demo_payments').select('amount_paise, commission_bps, commission_paise, expert_share_paise, transaction_type').eq('booking_id', b.data).single()).data;
    assert.deepEqual(snap, { amount_paise: 100000, commission_bps: 200, commission_paise: 2000, expert_share_paise: 98000, transaction_type: 'simulated' });
    assert.ok((await A.user1.c.from('demo_payments').update({ commission_paise: 0 }).eq('booking_id', b.data).select()).error
      || (await A.user1.c.from('demo_payments').select('commission_paise').eq('booking_id', b.data).single()).data.commission_paise === 2000, 'commission edited');
    const list = (await A.admin.c.rpc('admin_consultations', { p_filters: { expert_id: A.expertId }, p_limit: 100, p_offset: 0 })).data;
    const row = list.rows.find((r) => r.booking_id === b.data);
    assert.deepEqual([row.amount_paise, row.commission_paise, row.expert_share_paise, row.transaction_type], [100000, 2000, 98000, 'simulated']);
    assert.equal(row.amount_paise, row.commission_paise + row.expert_share_paise);
    assert.equal(row.meeting_link, undefined, 'link in the list');
    const detail = (await A.admin.c.rpc('admin_consultation_detail', { p_booking_id: b.data })).data;
    assert.ok(detail.notifications.length >= 2 && detail.confirmed_at);
    assert.ok((await A.admin.c.rpc('admin_set_consultation_fee', { p_expert_id: A.expertId, p_fee_paise: FEE, p_reason: 'restore test fee' })).data === FEE);
    assert.ifError((await A.expert1.c.rpc('set_consultation_fee', { p_fee_paise: FEE })).error);
  });

  test('admin functions refuse farmers, experts and anonymous callers; summary equals the sum of its rows', async () => {
    for (const [fn, args] of [['admin_consultations', {}], ['admin_consultation_summary', {}], ['admin_consultation_detail', { p_booking_id: A.expertId }]]) {
      for (const who of [A.user1, A.expert1, { c: mk() }]) assert.ok((await who.c.rpc(fn, args)).error, `${fn} callable`);
    }
    const f = { expert_id: A.expertId };
    const sum = (await A.admin.c.rpc('admin_consultation_summary', { p_filters: f })).data;
    const first = (await A.admin.c.rpc('admin_consultations', { p_filters: f, p_limit: 100, p_offset: 0 })).data;
    const all = { total: first.total, rows: [...first.rows] };
    for (let off = 100; off < first.total; off += 100) all.rows.push(...(await A.admin.c.rpc('admin_consultations', { p_filters: f, p_limit: 100, p_offset: off })).data.rows);   // every page, nothing skipped
    assert.equal(all.rows.length, first.total, 'pagination dropped rows');
    assert.equal(sum.total, all.total);
    const live = all.rows.filter((r) => r.payment_id && r.status !== 'Cancelled');
    assert.equal(sum.value_paise, live.reduce((t, r) => t + r.amount_paise, 0));
    assert.equal(sum.commission_paise + sum.expert_share_paise, sum.value_paise);
    const page1 = (await A.admin.c.rpc('admin_consultations', { p_filters: f, p_limit: 3, p_offset: 0 })).data;
    const page2 = (await A.admin.c.rpc('admin_consultations', { p_filters: f, p_limit: 3, p_offset: 3 })).data;
    assert.equal(page1.total, sum.total);
    assert.equal(new Set([...page1.rows, ...page2.rows].map((r) => r.booking_id)).size, page1.rows.length + page2.rows.length, 'pages overlap');
  });
});

describe('Google Meet links (staging)', { skip }, () => {
  test('E: only the assigned expert saves a valid link; the farmer is told once; strangers neither read nor change it', async () => {
    const slot = await freshSlot(240);
    const b = await demoBook(A.user1.c, slot, 'scenario E'); assert.ifError(b.error); bookings.push(b.data);
    for (const bad of ['http://meet.google.com/abc-defg-hij', 'https://meet.google.com.attacker.example/abc-defg-hij', 'javascript:alert(1)',
      'https://user@meet.google.com/abc-defg-hij', 'https://example.com/abc-defg-hij', '   ']) {
      assert.match((await A.expert1.c.rpc('set_meeting_link', { p_booking_id: b.data, p_link: bad })).error?.message || '', /valid Google Meet link/, bad);
    }
    assert.match((await A.user1.c.rpc('set_meeting_link', { p_booking_id: b.data, p_link: MEET })).error?.message || '', /Only the expert/);
    assert.match((await A.user2.c.rpc('set_meeting_link', { p_booking_id: b.data, p_link: MEET })).error?.message || '', /not a participant/);
    assert.ok((await A.expert1.c.from('video_meetings').update({ meeting_link: MEET }).eq('booking_id', b.data).select()).error
      || !(await A.expert1.c.from('video_meetings').select('meeting_link').eq('booking_id', b.data).single()).data.meeting_link, 'direct write');
    const saved = (await A.expert1.c.rpc('set_meeting_link', { p_booking_id: b.data, p_link: `${MEET.toUpperCase()}?authuser=0` })).data;
    assert.deepEqual([saved.changed, saved.meeting_link], [true, MEET]);
    assert.equal((await A.expert1.c.rpc('set_meeting_link', { p_booking_id: b.data, p_link: MEET })).data.changed, false);
    assert.equal((await notesFor(A.user1, b.data)).filter((m) => /Google Meet link/.test(m)).length, 1);
    assert.equal((await A.user1.c.from('video_meetings').select('meeting_link').eq('booking_id', b.data).single()).data.meeting_link, MEET);
    assert.equal((await A.user2.c.from('video_meetings').select('meeting_link').eq('booking_id', b.data)).data.length, 0);
    assert.match((await A.user1.c.rpc('join_consultation', { p_booking_id: b.data })).error?.message || '', /Too early/);
    // cancelled: no joining, no link changes
    assert.ifError((await A.user1.c.rpc('cancel_consultation_booking', { p_booking_id: b.data, p_reason: 'scenario E done', p_offered_slots: [] })).error);
    assert.match((await A.user1.c.rpc('join_consultation', { p_booking_id: b.data })).error?.message || '', /cancelled/);
    assert.match((await A.expert1.c.rpc('set_meeting_link', { p_booking_id: b.data, p_link: 'https://meet.google.com/new-link-abc' })).error?.message || '', /no longer active/);
  });

  test('join inside the window returns the saved link to each participant; without a link nobody can join', async () => {
    const slot = await freshSlot(3);
    const b = await demoBook(A.user1.c, slot, 'join window'); assert.ifError(b.error); bookings.push(b.data);
    assert.match((await A.user1.c.rpc('join_consultation', { p_booking_id: b.data })).error?.message || '', /not added the Google Meet link/);
    assert.match((await A.expert1.c.rpc('join_consultation', { p_booking_id: b.data })).error?.message || '', /Add the Google Meet link first/);
    assert.ifError((await A.expert1.c.rpc('set_meeting_link', { p_booking_id: b.data, p_link: MEET })).error);
    for (const who of [A.user1, A.expert1]) assert.equal((await who.c.rpc('join_consultation', { p_booking_id: b.data })).data.meeting_link, MEET);
    assert.match((await A.user2.c.rpc('join_consultation', { p_booking_id: b.data })).error?.message || '', /not a participant/);
    assert.match((await A.user1.c.rpc('complete_consultation', { p_booking_id: b.data })).error?.message || '', /Only the expert/);
    assert.match((await A.expert1.c.rpc('complete_consultation', { p_booking_id: b.data })).error?.message || '', /before its scheduled start/);
  });

  test('the retired video-room-token function no longer issues anything', async () => {
    const r = await fetch(`${URL_}/functions/v1/video-room-token`, { method: 'POST', headers: { apikey: env.STAGING_SUPABASE_ANON_KEY, Authorization: `Bearer ${(await A.user1.c.auth.getSession()).data.session.access_token}`, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 410);
    assert.doesNotMatch(await r.text(), /token|room_url|daily/i);
  });
});

describe('push devices and dispatcher (staging, FCM not configured)', { skip }, () => {
  const token = `test-token-${env.FIXTURE_EMAIL_TOKEN}-${'y'.repeat(30)}`;
  test('register is tied to the caller, repeatable, invisible to others; direct writes refused', async () => {
    assert.ifError((await A.user1.c.rpc('register_push_device', { p_token: token, p_platform: 'android', p_app_id: 'com.agroconnect.app.staging' })).error);
    assert.ifError((await A.user1.c.rpc('register_push_device', { p_token: token, p_platform: 'android', p_app_id: 'com.agroconnect.app.staging' })).error);
    const mine = await A.user1.c.from('push_devices').select('token');
    assert.equal(mine.data.filter((d) => d.token === token).length, 1);
    assert.equal((await A.user2.c.from('push_devices').select('id').eq('token', token)).data.length, 0);
    assert.ok((await A.user2.c.from('push_devices').insert({ user_id: A.user1.uid, token: `${token}z` })).error, 'direct insert allowed');
    assert.ok((await A.user1.c.rpc('register_push_device', { p_token: 'short' })).error, 'invalid token accepted');
    assert.ok((await mk().rpc('register_push_device', { p_token: token })).error, 'anonymous registration allowed');
    // stranger cannot unregister it
    await A.user2.c.rpc('unregister_push_device', { p_token: token });
    assert.equal((await A.user1.c.from('push_devices').select('id').eq('token', token)).data.length, 1);
  });

  test('outbox and dispatcher secret are not reachable by users; dispatcher refuses callers without the secret', async () => {
    assert.ok((await A.user1.c.from('push_outbox').select('id').limit(1)).error, 'user can read the outbox');
    assert.ok((await A.user1.c.rpc('claim_push_batch', { p_limit: 1 })).error, 'user can claim pushes');
    assert.ok((await A.user1.c.rpc('push_dispatch_secret')).error, 'user can read the dispatch secret');
    for (const headers of [{}, { 'x-dispatch-secret': 'guess' }]) {
      const r = await fetch(`${URL_}/functions/v1/push-dispatch`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' });
      assert.equal(r.status, 401);
    }
  });
});
