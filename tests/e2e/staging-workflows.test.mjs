// Signed-in workflow tests against the STAGING project (real Auth, PostgREST, Storage, Realtime, pg_cron).
// Uses only the synthetic agroconnect-stg-* accounts from .env.staging; restores fixture state where it changes it.
//   node --test tests/e2e/staging-workflows.test.mjs
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
  const password = name === 'admin' ? env.E2E_ADMIN_PASSWORD : env.FIXTURE_PASSWORD;
  let { data, error } = await c.auth.signInWithPassword({ email: fx(name), password });
  // one retry for a network-level failure only (seen once: "fetch failed"); Auth errors are never retried
  if (error && /fetch failed/i.test(error.message)) ({ data, error } = await c.auth.signInWithPassword({ email: fx(name), password }));
  if (error) throw new Error(`sign-in ${name}: ${error.message}`);
  return { c, uid: data.user.id };
}

// Local (Asia/Kolkata) date + HH:MM a given number of minutes from now — slots are stored in local time.
function istFromNow(minutes) {
  const d = new Date(Date.now() + minutes * 60000 + 330 * 60000);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}
const plus30 = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); const t = (h * 60 + m + 30) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

let A = {};
before(async () => {
  if (skip) return;
  for (const n of ['admin', 'expert1', 'user1', 'user2', 'user3', 'user4']) A[n] = await signIn(n);
  A.expertId = (await A.expert1.c.from('experts').select('id').eq('user_id', A.expert1.uid).single()).data.id;
});

describe('roles and admin', { skip }, () => {
  test('admin bans a user: banned user cannot edit profile or post; admin unbans', async () => {
    const ban = await A.admin.c.rpc('ban_user', { p_user_id: A.user4.uid, p_reason: 'staging test' });
    assert.ifError(ban.error);
    const upd = await A.user4.c.from('profiles').update({ bio: 'should not save' }).eq('id', A.user4.uid).select('id');
    assert.ok(upd.error || upd.data.length === 0, 'banned user edited profile');
    const post = await A.user4.c.from('posts').insert({ user_id: A.user4.uid, caption: 'banned post' });
    assert.ok(post.error, 'banned user posted');
    const unban = await A.admin.c.from('profiles').update({ is_banned: false, ban_reason: null, banned_at: null }).eq('id', A.user4.uid).select('id');
    assert.ifError(unban.error);
    assert.equal(unban.data.length, 1);
    const self = await A.user1.c.from('profiles').update({ is_banned: true }).eq('id', A.user1.uid);
    assert.ok(self.error, 'user changed own ban flag');
  });

  test('expert application: user cannot self-approve or self-create expert; admin approval works; admin demotion works', async () => {
    const app = await A.user3.c.from('expert_applications')
      .insert({ user_id: A.user3.uid, qualification: 'B.Sc', experience: '3 years', cv_file_path: `${A.user3.uid}/cv.pdf` }).select('id').single();
    assert.ifError(app.error);
    const self = await A.user3.c.from('expert_applications').update({ status: 'Approved' }).eq('id', app.data.id).select('id');
    assert.ok(self.error || self.data.length === 0, 'self-approved');
    const selfExpert = await A.user3.c.from('experts').insert({ user_id: A.user3.uid });
    assert.ok(selfExpert.error, 'self-created experts row');
    const selfRpc = await A.user3.c.rpc('approve_expert_application', { p_application_id: app.data.id });
    assert.ok(selfRpc.error, 'user called approve RPC');
    const ok = await A.admin.c.rpc('approve_expert_application', { p_application_id: app.data.id });
    assert.ifError(ok.error);
    const prof = await A.user3.c.from('profiles').select('role').eq('id', A.user3.uid).single();
    assert.equal(prof.data.role, 'Expert');
    // restore fixture: demote and remove the application
    assert.ifError((await A.admin.c.rpc('demote_expert', { p_user_id: A.user3.uid })).error);
    assert.ifError((await A.admin.c.from('expert_applications').delete().eq('id', app.data.id)).error);
    assert.equal((await A.user3.c.from('profiles').select('role').eq('id', A.user3.uid).single()).data.role, 'Farmer');
  });
});

describe('expert CV privacy (storage)', { skip }, () => {
  test('owner uploads own CV; other users cannot list/download it or upload into it; admin can', async () => {
    const path = `${A.user3.uid}/staging_cv.pdf`;
    const body = new Blob(['%PDF-1.4 staging test'], { type: 'application/pdf' });
    const up = await A.user3.c.storage.from('expert-cvs').upload(path, body, { upsert: true });
    assert.ifError(up.error);
    const otherList = await A.user1.c.storage.from('expert-cvs').list(A.user3.uid);
    assert.equal((otherList.data || []).length, 0);
    const otherGet = await A.user1.c.storage.from('expert-cvs').download(path);
    assert.ok(otherGet.error, 'other user downloaded CV');
    const otherUp = await A.user1.c.storage.from('expert-cvs').upload(`${A.user3.uid}/evil.pdf`, body);
    assert.ok(otherUp.error, 'other user wrote into foreign CV folder');
    const adminGet = await A.admin.c.storage.from('expert-cvs').download(path);
    assert.ifError(adminGet.error);
    const ownGet = await A.user3.c.storage.from('expert-cvs').download(path);
    assert.ifError(ownGet.error);
    assert.ifError((await A.user3.c.storage.from('expert-cvs').remove([path])).error);
  });
});

describe('consultations', { skip }, () => {
  test('two farmers race for one slot: exactly one booking wins', async () => {
    const { data: slots } = await A.user1.c.from('consultation_slots').select('id').eq('expert_id', A.expertId).eq('is_booked', false)
      .gt('slot_date', istFromNow(0).date).order('slot_date', { ascending: false }).limit(1);
    const slot = slots[0].id;
    const [a, b] = await Promise.all([
      A.user1.c.rpc('book_consultation_slot', { p_slot_id: slot, p_issue: 'race A' }),
      A.user3.c.rpc('book_consultation_slot', { p_slot_id: slot, p_issue: 'race B' }),
    ]);
    const winners = [a, b].filter((r) => !r.error);
    assert.equal(winners.length, 1, `expected one winner, got ${winners.length}`);
    const loser = [a, b].find((r) => r.error);
    assert.match(loser.error.message, /already booked|duplicate|one_booking_per_slot/);
    const winnerClient = a.error ? A.user3 : A.user1;
    assert.ifError((await winnerClient.c.rpc('cancel_consultation_booking', { p_booking_id: winners[0].data, p_reason: 'race cleanup' })).error);
  });

  test('join window, completion requires expert attendance, review by the farmer only, once', async () => {
    const at = istFromNow(3);
    const ins = await A.expert1.c.from('consultation_slots')
      .insert({ expert_id: A.expertId, slot_date: at.date, start_time: at.time, end_time: plus30(at.time), rate: 300 }).select('id').single();
    assert.ifError(ins.error);
    const booking = (await A.user1.c.rpc('book_consultation_slot', { p_slot_id: ins.data.id, p_issue: 'completion test' })).data;
    assert.ok(booking);
    assert.ok((await A.user1.c.rpc('complete_consultation', { p_booking_id: booking })).error, 'completed without expert');
    assert.ok((await A.user3.c.rpc('join_consultation', { p_booking_id: booking })).error, 'non-participant joined');
    assert.ifError((await A.expert1.c.rpc('join_consultation', { p_booking_id: booking })).error);
    assert.ifError((await A.user1.c.rpc('join_consultation', { p_booking_id: booking })).error);
    assert.ifError((await A.user1.c.rpc('complete_consultation', { p_booking_id: booking })).error);
    const b = await A.user1.c.from('consultation_bookings').select('status').eq('id', booking).single();
    assert.equal(b.data.status, 'Completed');
    const fake = await A.user3.c.from('reviews').insert({ booking_id: booking, reviewer_id: A.user3.uid, expert_id: A.expertId, rating: 1, comment: 'fake' });
    assert.ok(fake.error, 'non-participant reviewed');
    const real = await A.user1.c.from('reviews').insert({ booking_id: booking, reviewer_id: A.user1.uid, expert_id: A.expertId, rating: 5, comment: 'great' });
    assert.ifError(real.error);
    const again = await A.user1.c.from('reviews').insert({ booking_id: booking, reviewer_id: A.user1.uid, expert_id: A.expertId, rating: 5, comment: 'again' });
    assert.ok(again.error, 'reviewed twice');
    const rating = await A.user1.c.from('experts').select('rating').eq('id', A.expertId).single();
    assert.ok(Number(rating.data.rating) > 0, 'rating trigger did not update');
  });

  test('admin consultation management: cancel via admin RPC frees the slot (previously broken in production)', async () => {
    const { data: slots } = await A.user1.c.from('consultation_slots').select('id').eq('expert_id', A.expertId).eq('is_booked', false)
      .gt('slot_date', istFromNow(0).date).order('slot_date', { ascending: false }).limit(1);
    const booking = (await A.user1.c.rpc('book_consultation_slot', { p_slot_id: slots[0].id, p_issue: 'admin cancel test' })).data;
    assert.ok((await A.user1.c.rpc('admin_update_booking_status', { p_booking_id: booking, p_new_status: 'Cancelled' })).error, 'farmer used admin RPC');
    assert.ifError((await A.admin.c.rpc('admin_update_booking_status', { p_booking_id: booking, p_new_status: 'Cancelled', p_cancellation_reason: 'staging admin test' })).error);
    const s = await A.user1.c.from('consultation_slots').select('is_booked').eq('id', slots[0].id).single();
    assert.equal(s.data.is_booked, false);
  });
});

// Realtime readiness has two steps: the channel join ('SUBSCRIBED') and, ~1-3 s later, the server's postgres_changes
// listener ('system' message status 'ok', "Subscribed to PostgreSQL"). An INSERT made between the two is never
// delivered, which is what made the first cold run of this test time out. Each phase gets its own deadline and error,
// and the trigger only fires once the listener is ready; there is no retry of the delivery itself.
const RT = { subscribeMs: 20000, listenerMs: 20000, eventMs: 30000 };
const phase = (ms, what) => { let t; const p = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`realtime: ${what} within ${ms / 1000} s`)), ms); }); return [p, () => clearTimeout(t)]; };

describe('realtime', { skip }, () => {
  test('farmer receives a server-created booking notification over realtime', { timeout: 120000 }, async () => {
    const { data: slots } = await A.user1.c.from('consultation_slots').select('id').eq('expert_id', A.expertId).eq('is_booked', false)
      .gt('slot_date', istFromNow(0).date).order('slot_date', { ascending: false }).limit(1);
    assert.ok(slots?.length, 'no free future expert1 slot to book');
    const booked = await A.user1.c.rpc('book_consultation_slot', { p_slot_id: slots[0].id, p_issue: 'realtime test' });
    assert.ifError(booked.error);
    const booking = booked.data;
    const c = A.user1.c;
    await c.realtime.setAuth((await c.auth.getSession()).data.session.access_token);
    let onEvent, onListener, onStatus;
    const event = new Promise((r) => { onEvent = r; });
    const listener = new Promise((res, rej) => { onListener = { res, rej }; });
    const joined = new Promise((res, rej) => { onStatus = { res, rej }; });
    const ch = c.channel(`stg-notif-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${A.user1.uid}` },
        (p) => { if (p.new.related_id === booking) onEvent(p.new); })
      .on('system', {}, (p) => {
        if (p.extension !== 'postgres_changes') return;
        if (p.status === 'ok') onListener.res(); else onListener.rej(new Error(`realtime: postgres_changes listener failed: ${p.message}`));
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') onStatus.res();
        else onStatus.rej(new Error(`realtime: channel ${status}${err ? `: ${err.message}` : ''}`)); // CHANNEL_ERROR / TIMED_OUT / CLOSED
      });
    try {
      const [t1, c1] = phase(RT.subscribeMs, 'channel not SUBSCRIBED');
      await Promise.race([joined, t1]).finally(c1);
      const [t2, c2] = phase(RT.listenerMs, 'postgres_changes listener not ready');
      await Promise.race([listener, t2]).finally(c2);
      const cancel = await A.expert1.c.rpc('cancel_consultation_booking', {
        p_booking_id: booking, p_reason: 'realtime test', p_offered_slots: [{ date: '2026-12-01', time: '10:00' }],
      });
      assert.ifError(cancel.error);
      const [t3, c3] = phase(RT.eventMs, 'notification INSERT not delivered');
      const n = await Promise.race([event, t3]).catch(async (e) => {
        // tell "never written" apart from "written but not pushed": both are failures, with different causes
        const row = await c.from('notifications').select('id').eq('related_id', booking).eq('user_id', A.user1.uid);
        throw new Error(`${e.message} (notification row ${row.data?.length ? 'exists in the table' : 'was NOT written'})`);
      }).finally(c3);
      assert.equal(n.type, 'booking');
    } finally {
      await c.removeChannel(ch);
      const b = await A.admin.c.from('consultation_bookings').select('status').eq('id', booking).single();
      if (b.data?.status === 'Booked') await A.admin.c.rpc('admin_update_booking_status', { p_booking_id: booking, p_new_status: 'Cancelled', p_cancellation_reason: 'realtime test cleanup' });
    }
  });
});

describe('scheduler (pg_cron, real time)', { skip }, () => {
  test('no-show: booking whose expert never joins is auto-cancelled by the scheduled job within ~7 minutes', { timeout: 600000 }, async () => {
    const at = istFromNow(1);
    const ins = await A.expert1.c.from('consultation_slots')
      .insert({ expert_id: A.expertId, slot_date: at.date, start_time: at.time, end_time: plus30(at.time), rate: 400 }).select('id').single();
    assert.ifError(ins.error);
    const booking = (await A.user3.c.rpc('book_consultation_slot', { p_slot_id: ins.data.id, p_issue: 'no-show test' })).data;
    assert.ok(booking);
    const deadline = Date.now() + 9 * 60000;
    let b;
    while (Date.now() < deadline) {
      b = (await A.user3.c.from('consultation_bookings').select('status, refund_status, refund_amount').eq('id', booking).single()).data;
      if (b.status !== 'Booked') break;
      await new Promise((r) => setTimeout(r, 20000));
    }
    assert.deepEqual([b.status, b.refund_status, Number(b.refund_amount)], ['Cancelled', 'Pending', 400]);
    const notes = await A.user3.c.from('notifications').select('message').eq('related_id', booking);
    assert.equal(notes.data.length, 1, 'farmer should get exactly one auto-cancel notice');
    assert.match(notes.data[0].message, /auto-cancelled/);
  });
});

after(async () => { for (const k of Object.keys(A)) if (A[k]?.c) await A[k].c.removeAllChannels?.(); });
