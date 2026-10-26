// Cancellation & refund rules (migration 18) and text messaging with message requests (migrations 16-17) on STAGING,
// through the same RPCs the app calls. Synthetic accounts only; nothing is deleted (bookings and messages stay as records).
//   node --test tests/e2e/staging-cancel-messaging.test.mjs
// Owner rules (2026-10-26):
//   * farmer cancels >= 14 h before the start -> 100% refund; later -> expert keeps half, AgroConnect keeps its 2%, rest refunded
//   * expert / admin / automatic (no-show) cancellation -> 100% refund, at any time
//   * anyone may message anyone; users connected to each other (or sharing a booking) chat normally, others start as a request
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { demoBook } from './demo-booking.mjs';

const envFile = new URL('../../.env.staging', import.meta.url);
const env = existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split('\n')
  .filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])) : {};
const URL_ = env.STAGING_SUPABASE_URL;
if (URL_?.includes('mgreapakfchcxcrauheq')) throw new Error('Refusing to run against production.');
const skip = URL_ && env.FIXTURE_EMAIL_TOKEN ? false : 'staging env not configured';
const fx = (name) => `agroconnect-stg-${name}-${env.FIXTURE_EMAIL_TOKEN}@${env.FIXTURE_EMAIL_DOMAIN}`;
async function signIn(name) {
  const c = createClient(URL_, env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: fx(name), password: name === 'admin' ? env.E2E_ADMIN_PASSWORD : env.FIXTURE_PASSWORD });
  if (error) throw new Error(`sign-in ${name}: ${error.message}`);
  return { c, uid: data.user.id };
}
function istAt(minutes) {
  const d = new Date(Math.ceil((Date.now() + minutes * 60000) / 60000) * 60000 + 330 * 60000);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}
const plus = (hhmm, m) => { const [h, mm] = hhmm.split(':').map(Number); const t = (h * 60 + mm + m) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const commission = (f) => Math.floor((f * 200 + 5000) / 10000);   // 2%, half up (as _commission_paise)

const A = {};
const created = { slots: [], follows: [] };
before(async () => {
  if (skip) return;
  for (const n of ['admin', 'expert1', 'user1', 'user2', 'user3', 'user4']) A[n] = await signIn(n);
  A.expertId = (await A.expert1.c.from('experts').select('id').eq('user_id', A.expert1.uid).single()).data.id;
});
after(async () => {
  if (skip) return;
  for (const id of created.slots) await A.expert1.c.from('consultation_slots').delete().eq('id', id).eq('is_booked', false);
  for (const [who, other] of created.follows) await A[who].c.from('followers').delete().eq('follower_id', A[who].uid).eq('following_id', A[other].uid);
});

// slot `minutes` from now; minute collisions with other test slots retry on the next minute
async function newSlot(minutes) {
  let ins;
  for (let m = minutes; m < minutes + 6; m++) {
    const at = istAt(m);
    ins = await A.expert1.c.from('consultation_slots')
      .insert({ expert_id: A.expertId, slot_date: at.date, start_time: at.time, end_time: plus(at.time, 30), rate: 400 }).select('id').single();
    if (ins.error?.code !== '23505') break;
  }
  assert.ifError(ins.error);
  created.slots.push(ins.data.id);
  return ins.data.id;
}
async function book(farmer, minutes, issue) {
  const r = await demoBook(A[farmer].c, await newSlot(minutes), issue);
  assert.ifError(r.error);
  const fee = (await A.admin.c.from('demo_payments').select('amount_paise').eq('booking_id', r.data).single()).data.amount_paise;
  return { id: r.data, fee };
}
const row = async (id) => (await A.admin.c.from('consultation_bookings')
  .select('status, cancelled_by_role, cancellation_rule, refund_paise, refund_status').eq('id', id).single()).data;

describe('cancellation & refunds', { skip }, () => {
  test('farmer, less than 14 h before: quote = result; expert keeps half, 2% kept, rest refunded; repeat changes nothing', async () => {
    const b = await book('user1', 90, 'late cancel test');
    const q = (await A.user1.c.rpc('consultation_cancellation_quote', { p_booking_id: b.id })).data;
    const keeps = Math.ceil(b.fee / 2); const c = commission(b.fee);
    assert.deepEqual([q.allowed, q.rule, q.full_refund, q.refund_paise, q.expert_keeps_paise, q.platform_keeps_paise],
      [true, 'farmer_late', false, b.fee - keeps - c, keeps, c]);
    assert.match((await A.user1.c.rpc('cancel_consultation_booking', { p_booking_id: b.id, p_reason: '  ' })).error?.message || '', /reason/);
    const res = await A.user1.c.rpc('cancel_consultation_booking', { p_booking_id: b.id, p_reason: 'Cannot make it today' });
    assert.ifError(res.error);
    assert.equal(Math.round(Number(res.data) * 100), q.refund_paise);
    assert.deepEqual(await row(b.id), { status: 'Cancelled', cancelled_by_role: 'farmer', cancellation_rule: 'farmer_late', refund_paise: q.refund_paise, refund_status: 'Pending' });
    const again = await A.user1.c.rpc('cancel_consultation_booking', { p_booking_id: b.id, p_reason: 'again' });
    assert.equal(Math.round(Number(again.data) * 100), q.refund_paise, 'repeat changed the refund');
    const notes = (await A.user1.c.from('notifications').select('message').eq('related_id', b.id).eq('type', 'booking')).data;
    assert.equal(notes.filter((n) => /less than 14 hours/.test(n.message)).length, 1, 'farmer told the late-cancel split once');
    // the cancellation note in their chat (they share a booking, so it is a normal chat)
    const conv = (await A.expert1.c.rpc('get_or_create_conversation', { p_other: A.user1.uid })).data;
    assert.equal(conv.state, 'normal');
    const msgs = (await A.expert1.c.rpc('get_messages', { p_conversation_id: conv.conversation_id, p_limit: 100 })).data;
    assert.ok(msgs.some((m) => m.message_type === 'cancellation_reschedule' && m.metadata?.booking_id === b.id));
  });

  test('farmer, 14 h or more before: full refund', async () => {
    const b = await book('user2', 15 * 60 + 5, 'early cancel test');
    const q = (await A.user2.c.rpc('consultation_cancellation_quote', { p_booking_id: b.id })).data;
    assert.deepEqual([q.rule, q.full_refund, q.refund_paise], ['farmer_early', true, b.fee]);
    assert.ifError((await A.user2.c.rpc('cancel_consultation_booking', { p_booking_id: b.id, p_reason: 'Plans changed' })).error);
    assert.equal((await row(b.id)).refund_paise, b.fee);
  });

  test('expert, inside 14 h: allowed, full refund, must offer another time; strangers cannot cancel or quote', async () => {
    const b = await book('user3', 60, 'expert cancel test');
    assert.ok((await A.user4.c.rpc('consultation_cancellation_quote', { p_booking_id: b.id })).error, 'stranger saw the quote');
    assert.ok((await A.user4.c.rpc('cancel_consultation_booking', { p_booking_id: b.id, p_reason: 'x' })).error, 'stranger cancelled');
    const noSlot = await A.expert1.c.rpc('cancel_consultation_booking', { p_booking_id: b.id, p_reason: 'Emergency', p_offered_slots: [] });
    assert.match(noSlot.error?.message || '', /alternative/);
    const q = (await A.expert1.c.rpc('consultation_cancellation_quote', { p_booking_id: b.id })).data;
    assert.deepEqual([q.allowed, q.rule, q.full_refund], [true, 'expert_cancel', true]);
    const at = istAt(3 * 24 * 60);
    assert.ifError((await A.expert1.c.rpc('cancel_consultation_booking', {
      p_booking_id: b.id, p_reason: 'Emergency', p_offered_slots: [{ date: at.date, time: '10:00' }],
    })).error);
    const r = await row(b.id);
    assert.deepEqual([r.cancelled_by_role, r.cancellation_rule, r.refund_paise], ['expert', 'expert_cancel', b.fee]);
    const n = (await A.user3.c.from('notifications').select('message').eq('related_id', b.id).eq('type', 'booking')).data;
    assert.ok(n.some((x) => /cancelled by the expert\. A full refund/.test(x.message)));
  });

  test('admin summary subtracts refunds from commission and expert share', async () => {
    const s = (await A.admin.c.rpc('admin_consultation_summary', { p_filters: {} })).data;
    for (const k of ['refunds_paise', 'net_commission_paise', 'net_expert_share_paise']) assert.equal(typeof s[k], 'number', k);
    // net = every paid booking minus reversals, so late farmer cancellations (2% and half kept) add to the live bookings' figures
    assert.ok(s.net_commission_paise >= s.commission_paise && s.net_expert_share_paise >= s.expert_share_paise, 'net below live bookings');
    const late = (await A.admin.c.rpc('admin_consultations', { p_filters: { cancellation_rule: 'farmer_late' }, p_limit: 5, p_offset: 0 })).data;
    assert.ok(late.rows.length >= 1 && late.rows.every((r) => r.cancellation_rule === 'farmer_late'));
  });
});

describe('messaging', { skip }, () => {
  const open = (who, other) => A[who].c.rpc('get_or_create_conversation', { p_other: A[other].uid });
  const send = (who, conv, text, key = randomUUID()) => A[who].c.rpc('send_message', { p_conversation_id: conv, p_content: text, p_client_id: key });

  test('message request between farmers who are not connected (first unused pair), then reply accepts', async (t) => {
    // conversations are kept as records, so each pair can show the request flow only once; the DB tests cover it every run
    const pairs = [['user2', 'user3'], ['user3', 'user4'], ['user2', 'user4'], ['user4', 'user1'], ['user1', 'user2'], ['user1', 'user3']];
    let pair = null;
    for (const [a, b] of pairs) {
      // any existing conversation, in either person's inbox or requests, disqualifies the pair
      let used = false;
      for (const [x, y] of [[a, b], [b, a]]) for (const box of ['inbox', 'requests']) {
        if ((await A[x].c.rpc('list_conversations', { p_box: box, p_limit: 200 })).data.some((r) => r.other_user_id === A[y].uid)) used = true;
      }
      if (!used) { pair = [a, b]; break; }
    }
    if (!pair) { t.skip('every farmer pair already has a conversation on staging'); return; }
    const [a, b] = pair;
    const c = (await open(a, b)).data;
    assert.equal(c.state, 'request_outgoing');
    const before = (await A[b].c.rpc('chat_badges')).data;
    assert.ifError((await send(a, c.conversation_id, 'Hello from a staging test')).error);
    const after1 = (await A[b].c.rpc('chat_badges')).data;
    assert.equal(after1.requests, before.requests + 1, 'blue dot count');
    const req = (await A[b].c.rpc('list_conversations', { p_box: 'requests', p_limit: 200 })).data.find((r) => r.conversation_id === c.conversation_id);
    assert.equal(req.state, 'request_incoming');
    assert.equal((await A[b].c.rpc('list_conversations', { p_box: 'inbox', p_limit: 200 })).data.some((r) => r.conversation_id === c.conversation_id), false);
    const note = (await A[b].c.from('notifications').select('message').eq('related_id', c.conversation_id).eq('type', 'message')).data;
    assert.equal(note.length, 1);
    assert.match(note[0].message, /sent you a message request/);
    assert.doesNotMatch(note[0].message, /staging test/);
    assert.ifError((await send(b, c.conversation_id, 'Hi! Accepted by replying')).error);
    assert.equal((await A[b].c.rpc('list_conversations', { p_box: 'inbox', p_limit: 200 })).data.find((r) => r.conversation_id === c.conversation_id)?.state, 'normal');
  });

  test('connected to each other: normal chat; double send stored once; outsiders and direct writes refused', async () => {
    for (const [x, y] of [['user1', 'user4'], ['user4', 'user1']]) {
      const ins = await A[x].c.from('followers').insert({ follower_id: A[x].uid, following_id: A[y].uid });
      if (!ins.error) created.follows.push([x, y]);
    }
    const c = (await open('user1', 'user4')).data;
    assert.equal(c.state, 'normal');
    const key = randomUUID();
    const m1 = await send('user1', c.conversation_id, 'Normal chat message', key);
    const m2 = await send('user1', c.conversation_id, 'Normal chat message', key);
    assert.ifError(m1.error); assert.ifError(m2.error);
    assert.equal(m2.data.id, m1.data.id); assert.equal(m2.data.duplicate, true);
    const notes = (await A.user4.c.from('notifications').select('message, created_at').eq('related_id', c.conversation_id).eq('type', 'message')
      .gte('created_at', m1.data.created_at)).data;
    assert.equal(notes.length, 1, 'one notification for one message');
    assert.match(notes[0].message, /^New message from/);
    assert.equal((await A.user4.c.rpc('mark_conversation_read', { p_conversation_id: c.conversation_id })).error, null);
    assert.ok((await A.user2.c.rpc('get_messages', { p_conversation_id: c.conversation_id })).error, 'outsider read the chat');
    assert.ok((await send('user2', c.conversation_id, 'intrude')).error, 'outsider wrote into the chat');
    assert.equal((await A.user2.c.from('messages').select('id').eq('conversation_id', c.conversation_id)).data.length, 0);
    assert.ok((await A.user4.c.from('messages').insert({ conversation_id: c.conversation_id, sender_id: A.user1.uid, content: 'spoof' })).error, 'direct insert');
    assert.equal((await A.admin.c.from('messages').select('id').eq('conversation_id', c.conversation_id)).data.length, 0, 'admin read message text');
    assert.match((await send('user1', c.conversation_id, 'x'.repeat(2001))).error?.message || '', /2000/);
    const stats = (await A.admin.c.rpc('admin_messaging_stats')).data;
    assert.ok(stats.conversations >= 1 && stats.messages_7d >= 1);
  });
});
