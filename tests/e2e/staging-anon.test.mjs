// Anonymous-attacker checks against the STAGING project over the real HTTP API (PostgREST, RPC, Storage).
// Needs only .env.staging (public anon key). Refuses to run against production. Writes nothing on success:
// every write it attempts must be rejected.
//   node --test tests/e2e/staging-anon.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envPath = new URL('../../.env.staging', import.meta.url);
const env = existsSync(envPath) ? Object.fromEntries(readFileSync(envPath, 'utf8').split('\n')
  .filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])) : {};
const URL_ = env.STAGING_SUPABASE_URL;
const skip = URL_ ? false : '.env.staging not present';
if (URL_?.includes('mgreapakfchcxcrauheq')) throw new Error('Refusing to run against production.');
const anon = () => createClient(URL_, env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const someId = '00000000-0000-4000-8000-000000000000';

test('anon cannot read private tables', { skip }, async () => {
  const c = anon();
  for (const t of ['profiles', 'farmer_profiles', 'followers', 'consultation_bookings', 'messages', 'conversations',
    'notifications', 'expert_applications', 'admin_audit_log', 'reports', 'orders', 'payments', 'video_meetings']) {
    const { data, error } = await c.from(t).select('*').limit(1);
    assert.ok(error || (data || []).length === 0, `${t} readable by anon`);
  }
});

test('anon can read the public catalogue (app needs it before login)', { skip }, async () => {
  const c = anon();
  for (const t of ['posts', 'experts', 'consultation_slots', 'reviews', 'categories', 'news']) {
    const { error } = await c.from(t).select('id').limit(1);
    assert.ifError(error, t);
  }
});

test('anon cannot call admin, booking, scheduler or internal functions', { skip }, async () => {
  const c = anon();
  for (const [fn, args] of [
    ['ban_user', { p_user_id: someId, p_reason: 'x' }],
    ['approve_expert_application', { p_application_id: someId }],
    ['send_broadcast', { p_title: 'x', p_message: 'y' }],
    ['admin_update_booking_status', { p_booking_id: someId, p_new_status: 'Cancelled' }],
    ['admin_settle_refund', { p_booking_id: someId, p_succeeded: true }],
    ['book_consultation_slot', { p_slot_id: someId, p_issue: 'x' }],
    ['start_demo_checkout', { p_slot_id: someId, p_issue: 'x', p_idempotency_key: someId }],
    ['confirm_demo_payment', { p_payment_id: someId }],
    ['cancel_demo_payment', { p_payment_id: someId }],
    ['set_meeting_link', { p_booking_id: someId, p_link: 'https://meet.google.com/abc-defg-hij' }],
    ['cancel_consultation_booking', { p_booking_id: someId, p_reason: 'x' }],
    ['process_consultation_lifecycle', {}],
    ['_notify', { p_user: someId, p_type: 'system', p_message: 'x', p_related: null }],
    ['rls_auto_enable', {}],
  ]) {
    const { error } = await c.rpc(fn, args);
    assert.ok(error, `${fn} callable by anon`);
  }
});

test('anon cannot write anything', { skip }, async () => {
  const c = anon();
  const attempts = [
    c.from('notifications').insert({ user_id: someId, type: 'system', message: 'forged' }),
    c.from('profiles').update({ role: 'Admin' }).eq('id', someId),
    c.from('experts').insert({ user_id: someId }),
    c.from('consultation_bookings').insert({ expert_id: someId, farmer_id: someId, meeting_date: '2026-12-01', meeting_time: '10:00' }),
    c.from('consultation_slots').update({ is_booked: true }).eq('id', someId),
    c.from('posts').insert({ user_id: someId, caption: 'spam' }),
  ];
  for (const r of await Promise.all(attempts)) {
    assert.ok(r.error || (r.data || []).length === 0, `write accepted: ${JSON.stringify(r.data)}`);
  }
});

test('anon cannot list or upload private CVs', { skip }, async () => {
  const c = anon();
  const { data } = await c.storage.from('expert-cvs').list(someId);
  assert.equal((data || []).length, 0);
  const up = await c.storage.from('expert-cvs').upload(`${someId}/x.pdf`, new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
  assert.ok(up.error, 'anonymous CV upload accepted');
});
