// Catch Up meeting lifecycle on STAGING in real time, against the real pg_cron job (every minute):
// slot -> booking + notifications -> join denied early -> 5-minute reminder (scheduler) -> both join -> completion
// -> one review; plus strangers and cancelled bookings. Takes ~8 minutes. Synthetic accounts only.
//   node --test tests/e2e/staging-catchup.test.mjs
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
const fx = (name) => `agroconnect-stg-${name}-${env.FIXTURE_EMAIL_TOKEN}@${env.FIXTURE_EMAIL_DOMAIN}`;
async function signIn(name) {
  const c = createClient(URL_, env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: fx(name), password: name === 'admin' ? env.E2E_ADMIN_PASSWORD : env.FIXTURE_PASSWORD });
  if (error) throw new Error(`sign-in ${name}: ${error.message}`);
  return { c, uid: data.user.id };
}
// Asia/Kolkata wall clock `minutes` from now, at whole minutes (slots are stored as local date + time)
function istAt(minutes) {
  const d = new Date(Math.ceil((Date.now() + minutes * 60000) / 60000) * 60000 + 330 * 60000);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}
const plus = (hhmm, m) => { const [h, mm] = hhmm.split(':').map(Number); const t = (h * 60 + mm + m) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms, label) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out: ${label}`);
    await sleep(5000);
  }
}

const A = {};
const created = { slots: [] };
before(async () => {
  if (skip) return;
  for (const n of ['admin', 'expert1', 'user1', 'user2']) A[n] = await signIn(n);
  A.expertId = (await A.expert1.c.from('experts').select('id').eq('user_id', A.expert1.uid).single()).data.id;
});
after(async () => {
  for (const id of created.slots) await A.expert1.c.from('consultation_slots').delete().eq('id', id).eq('is_booked', false);
});

async function newSlot(minutes, rate = 450) {
  const at = istAt(minutes);
  const { data, error } = await A.expert1.c.from('consultation_slots')
    .insert({ expert_id: A.expertId, slot_date: at.date, start_time: at.time, end_time: plus(at.time, 30), rate }).select('id').single();
  assert.ifError(error);
  created.slots.push(data.id);
  return data.id;
}
const myNotes = async (who, booking) =>
  (await who.c.from('notifications').select('message').eq('user_id', who.uid).eq('related_id', booking).order('created_at')).data.map((n) => n.message);

describe('Catch Up meeting lifecycle (staging, real time)', { skip }, () => {
  test('book -> notify both -> early join denied -> 5-min reminder -> both join -> complete -> one review', { timeout: 900000 }, async () => {
    const slot = await newSlot(7);
    const book = await A.user1.c.rpc('book_consultation_slot', { p_slot_id: slot, p_issue: 'Catch Up lifecycle test' });
    assert.ifError(book.error);
    const id = book.data;

    // immediate notifications, one each, with names
    const e1 = await myNotes(A.expert1, id);
    const f1 = await myNotes(A.user1, id);
    assert.equal(e1.length, 1); assert.match(e1[0], /^New consultation booked! Test User 1 \(Farmer\) booked a session with you for .+ at \d{1,2}:\d{2} [AP]M\./);
    assert.equal(f1.length, 1); assert.match(f1[0], /^Your consultation with Dr\. Ramesh Expert is booked for .+ at \d{1,2}:\d{2} [AP]M\.$/);
    // duplicate submit: same booking, nothing new; another farmer cannot take the slot and gets nothing
    assert.equal((await A.user1.c.rpc('book_consultation_slot', { p_slot_id: slot, p_issue: 'again' })).data, id);
    assert.ok((await A.user2.c.rpc('book_consultation_slot', { p_slot_id: slot, p_issue: 'race' })).error, 'slot double-booked');
    assert.equal((await myNotes(A.expert1, id)).length, 1);
    const vm = (await A.user1.c.from('video_meetings').select('meeting_link').eq('booking_id', id)).data;
    assert.deepEqual(vm.map((r) => r.meeting_link), [null], 'invented meeting link stored');

    // too early (window opens 5 minutes before the start); strangers learn nothing
    const st = (await A.user1.c.rpc('consultation_join_status', { p_booking_id: id })).data;
    assert.deepEqual([st.can_join, st.reason], [false, 'too_early']);
    assert.ok(Math.abs(Date.parse(st.server_now) - Date.now()) < 120000, 'server clock far off');
    const early = await A.user1.c.rpc('join_consultation', { p_booking_id: id });
    assert.match(early.error?.message || '', /Too early: you can join from/);
    assert.match((await A.user2.c.rpc('join_consultation', { p_booking_id: id })).error?.message || '', /not a participant/);
    assert.ok((await A.user2.c.rpc('consultation_join_status', { p_booking_id: id })).error, 'stranger read join status');

    // the real scheduler sends the 5-minute reminder to both, once
    await waitFor(async () => (await myNotes(A.user1, id)).some((m) => m.startsWith('Reminder: your consultation with Dr. Ramesh Expert starts at')), 240000, 'farmer 5-min reminder');
    await waitFor(async () => (await myNotes(A.expert1, id)).some((m) => m.startsWith('Reminder: your consultation with Test User 1 (Farmer) starts at')), 60000, 'expert 5-min reminder');

    // window open: both participants join, same room
    const fj = await waitFor(async () => { const r = await A.user1.c.rpc('join_consultation', { p_booking_id: id }); return r.error ? null : r.data; }, 120000, 'farmer join');
    const ej = await A.expert1.c.rpc('join_consultation', { p_booking_id: id });
    assert.ifError(ej.error);
    assert.equal(fj.role, 'farmer'); assert.equal(ej.data.role, 'expert');
    assert.equal(fj.room_id, ej.data.room_id);
    assert.match((await A.user2.c.rpc('join_consultation', { p_booking_id: id })).error?.message || '', /not a participant/);

    // completion only after the scheduled start
    const tooSoon = await A.user1.c.rpc('complete_consultation', { p_booking_id: id });
    assert.match(tooSoon.error?.message || '', /before its scheduled start/);
    await waitFor(async () => Date.now() >= Date.parse(fj.starts_at) + 2000, 420000, 'meeting start');
    assert.ifError((await A.user1.c.rpc('complete_consultation', { p_booking_id: id })).error);
    assert.ifError((await A.expert1.c.rpc('complete_consultation', { p_booking_id: id })).error);   // both leave
    const f2 = await myNotes(A.user1, id);
    assert.equal(f2.filter((m) => /Please rate/.test(m)).length, 1, 'review request not exactly once');
    assert.equal(f2.filter((m) => m.startsWith('Reminder: your consultation')).length, 1, '5-min reminder not exactly once');
    assert.match((await A.user1.c.rpc('join_consultation', { p_booking_id: id })).error?.message || '', /already been completed/);

    // one review per completed booking, by the farmer
    const rev = { booking_id: id, reviewer_id: A.user1.uid, expert_id: A.expertId, rating: 5, comment: 'Catch Up lifecycle test' };
    assert.ifError((await A.user1.c.from('reviews').insert(rev)).error);
    assert.ok((await A.user1.c.from('reviews').insert({ ...rev, rating: 4 })).error, 'second review accepted');

    // admin sees the whole record
    const adm = (await A.admin.c.from('consultation_bookings').select('status, farmer_joined_at, expert_joined_at, reviews(rating)').eq('id', id).single()).data;
    assert.equal(adm.status, 'Completed');
    assert.ok(adm.farmer_joined_at && adm.expert_joined_at);
    assert.equal(adm.reviews[0]?.rating ?? adm.reviews?.rating, 5);
  });

  test('a cancelled booking cannot be joined and is never reminded', async () => {
    const slot = await newSlot(240);
    const id = (await A.user1.c.rpc('book_consultation_slot', { p_slot_id: slot, p_issue: 'cancel test' })).data;
    assert.ok(id);
    assert.ifError((await A.user1.c.rpc('cancel_consultation_booking', { p_booking_id: id, p_reason: 'test', p_offered_slots: [] })).error);
    const st = (await A.user1.c.rpc('consultation_join_status', { p_booking_id: id })).data;
    assert.equal(st.reason, 'cancelled');
    assert.match((await A.user1.c.rpc('join_consultation', { p_booking_id: id })).error?.message || '', /cancelled/);
    const b = (await A.admin.c.from('consultation_bookings').select('notified_5min').eq('id', id).single()).data;
    assert.equal(b.notified_5min, false);
  });
});
