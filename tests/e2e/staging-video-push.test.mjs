// Video room access and push-device registration on STAGING, through the deployed Edge Functions and RPCs.
// The video provider (Daily) and push provider (FCM) are NOT configured yet: these tests prove every server-side
// check up to the provider call, and that a missing provider is reported honestly. Synthetic accounts only.
//   node --test tests/e2e/staging-video-push.test.mjs
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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
  for (const n of ['expert1', 'user1', 'user2']) A[n] = await signIn(n);
  A.expertId = (await A.expert1.c.from('experts').select('id').eq('user_id', A.expert1.uid).single()).data.id;
});
after(async () => {
  for (const id of bookings) await A.user1.c.rpc('cancel_consultation_booking', { p_booking_id: id, p_reason: 'video test cleanup', p_offered_slots: [] });
  for (const id of slots) await A.expert1.c.from('consultation_slots').delete().eq('id', id).eq('is_booked', false);
  await A.user1?.c.rpc('unregister_push_device', { p_token: `test-token-${env.FIXTURE_EMAIL_TOKEN}-${'y'.repeat(30)}` });
});
async function bookIn(min, topic) {
  const at = ist(min);
  const s = await A.expert1.c.from('consultation_slots').insert({ expert_id: A.expertId, slot_date: at.date, start_time: at.time, end_time: plus30(at.time), rate: 300 }).select('id').single();
  assert.ifError(s.error); slots.push(s.data.id);
  const b = await A.user1.c.rpc('book_consultation_slot', { p_slot_id: s.data.id, p_issue: topic });
  assert.ifError(b.error); bookings.push(b.data);
  return b.data;
}
const roomToken = async (who, bookingId) => {
  const r = await who.functions.invoke('video-room-token', { body: { booking_id: bookingId } });
  let body = r.data;
  if (r.error) { try { body = await r.error.context.json(); } catch { body = {}; } }
  return { status: r.error ? r.error.context?.status : 200, body };
};

describe('video-room-token (staging, provider not configured)', { skip }, () => {
  test('no session -> 401; stranger -> 403; too early -> 409; bad id -> 400', async () => {
    const id = await bookIn(120, 'video auth test far');
    const anon = await fetch(`${URL_}/functions/v1/video-room-token`, { method: 'POST', headers: { apikey: env.STAGING_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: id }) });
    assert.equal(anon.status, 401);
    const stranger = await roomToken(A.user2.c, id);
    assert.deepEqual([stranger.status, stranger.body.code], [403, 'forbidden']);
    assert.equal(stranger.body.token, undefined);
    const early = await roomToken(A.user1.c, id);
    assert.deepEqual([early.status, early.body.code], [409, 'not_joinable']);
    assert.match(early.body.error, /Too early/);
    assert.equal((await roomToken(A.user1.c, 'not-a-uuid')).status, 400);
  });

  test('inside the window both participants pass every check; missing provider is reported (no fake room, no token)', async () => {
    const id = await bookIn(3, 'video auth test now');
    const f = await roomToken(A.user1.c, id);
    const e = await roomToken(A.expert1.c, id);
    for (const [r, role] of [[f, 'farmer'], [e, 'expert']]) {
      assert.deepEqual([r.status, r.body.code, r.body.role], [503, 'video_not_configured', role]);
      assert.equal(r.body.token, undefined);
      assert.equal(r.body.room_url, undefined);
    }
    assert.equal(f.body.room_id, e.body.room_id, 'participants got different rooms');
    // attendance was recorded by the server (it decides completion / no-show)
    const b = await A.user1.c.from('consultation_bookings').select('farmer_joined_at, expert_joined_at').eq('id', id).single();
    assert.ok(b.data.farmer_joined_at && b.data.expert_joined_at);
    // 12: only the expert can end it, and not before the start
    assert.match((await A.user1.c.rpc('complete_consultation', { p_booking_id: id })).error?.message || '', /Only the expert/);
    assert.match((await A.expert1.c.rpc('complete_consultation', { p_booking_id: id })).error?.message || '', /before its scheduled start/);
  });

  test('cancelled booking -> 409, no room', async () => {
    const id = await bookIn(150, 'video auth test cancel');
    assert.ifError((await A.user1.c.rpc('cancel_consultation_booking', { p_booking_id: id, p_reason: 'test', p_offered_slots: [] })).error);
    const r = await roomToken(A.user1.c, id);
    assert.deepEqual([r.status, r.body.code], [409, 'not_joinable']);
    assert.match(r.body.error, /cancelled/);
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
