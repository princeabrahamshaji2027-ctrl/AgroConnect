// Migration 24 + Edge Functions submit-resume / admin-create-user against the STAGING project (never production).
// Run with: npm run test:staging   (env from .env.staging: STAGING_SUPABASE_URL/ANON_KEY, FIXTURE_*, E2E_ADMIN_PASSWORD)
// Throwaway accounts are made through the normal signup (fixture naming scheme) and always deleted afterwards with
// the admin-delete-user function.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { demoBook } from './demo-booking.mjs';
import { demoResumePdf } from '../../scripts/production/demo-resume.mjs';

const envFile = new URL('../../.env.staging', import.meta.url);
if (existsSync(envFile)) {
  for (const l of readFileSync(envFile, 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
const env = process.env;
const URL_ = env.STAGING_SUPABASE_URL;
const skip = URL_ && env.STAGING_SUPABASE_ANON_KEY && env.FIXTURE_PASSWORD && env.E2E_ADMIN_PASSWORD && env.FIXTURE_EMAIL_TOKEN
  ? false : 'staging env not set';
if (URL_?.includes('mgreapakfchcxcrauheq')) throw new Error('Refusing to run against the production Supabase project.');

const client = () => createClient(URL_, env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const fx = (name) => `agroconnect-stg-${name}-${env.FIXTURE_EMAIL_TOKEN}@${env.FIXTURE_EMAIL_DOMAIN}`;
const unique = (tag) => fx(`${tag}${Date.now()}${Math.floor(Math.random() * 1e4)}`);
async function signIn(email, password = env.FIXTURE_PASSWORD) {
  const c = client();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return { c, uid: data.user.id };
}
async function signUp(tag, fullName) {
  const email = unique(tag);
  const c = client();
  const su = await c.auth.signUp({ email, password: env.FIXTURE_PASSWORD, options: { data: { full_name: fullName } } });
  if (su.error) throw new Error(`signup: ${su.error.message}`);
  const s = await signIn(email);
  return { ...s, email };
}
const status = (r) => r.error?.context?.status ?? (r.error ? 'error' : 200);
const upload = (c, path, bytes, type = 'application/pdf') =>
  c.storage.from('expert-cvs').upload(path, new Blob([bytes], { type }), { upsert: false, contentType: type });
const submit = (c, body) => c.functions.invoke('submit-resume', { body });
const exists = async (c, path) => {
  const i = path.lastIndexOf('/');
  const { data } = await c.storage.from('expert-cvs').list(path.slice(0, i), { limit: 1000 });
  return (data || []).some((o) => o.name === path.slice(i + 1));
};
const realPdf = (name) => demoResumePdf({ name, district: 'Kannur', specialization: 'staging test' });

let admin; let user1; const throwaway = [];
before(async () => {
  if (skip) return;
  admin = await signIn(fx('admin'), env.E2E_ADMIN_PASSWORD);
  user1 = await signIn(fx('user1'));
});
after(async () => {
  if (skip) return;
  for (const t of throwaway) {
    // own folder first (the account's storage objects are not removed by the account deletion)
    const { data } = await t.c.storage.from('expert-cvs').list(t.uid, { limit: 1000 });
    if (data?.length) await t.c.storage.from('expert-cvs').remove(data.map((o) => `${t.uid}/${o.name}`));
    await admin.c.functions.invoke('admin-delete-user', { body: { user_id: t.uid } });
  }
});

describe('submit-resume (server-side PDF check)', { skip }, () => {
  test('real PDF applies; renamed text/JPEG, foreign folder, oversized and anonymous calls are refused', { timeout: 120_000 }, async () => {
    const u = await signUp('resume', 'Resume Test (staging)');
    throwaway.push(u);
    // a client can no longer insert an application itself
    const direct = await u.c.from('expert_applications').insert({ user_id: u.uid, qualification: 'x', experience: 'y' });
    assert.match(direct.error?.message || '', /sent from the app/);

    const txt = `${u.uid}/${Date.now()}_cv.pdf`;
    assert.ifError((await upload(u.c, txt, 'hello, not a pdf')).error);
    const r1 = await submit(u.c, { action: 'apply', path: txt, qualification: 'MSc', experience: '5 years' });
    assert.equal(status(r1), 422);
    assert.equal(await exists(u.c, txt), false, 'refused file was not deleted');

    const jpg = `${u.uid}/${Date.now()}_cv.pdf`;
    assert.ifError((await upload(u.c, jpg, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]))).error);
    assert.equal(status(await submit(u.c, { action: 'apply', path: jpg, qualification: 'MSc', experience: '5 years' })), 422);

    assert.equal(status(await submit(u.c, { action: 'apply', path: `${user1.uid}/${Date.now()}_cv.pdf`, qualification: 'MSc', experience: '5y' })), 400);
    const big = await upload(u.c, `${u.uid}/${Date.now()}_cv.pdf`, new Uint8Array(6 * 1024 * 1024));
    assert.ok(big.error, 'a 6 MB file was accepted by the bucket');
    assert.equal(status(await client().functions.invoke('submit-resume', { body: { action: 'apply', path: txt } })), 401);

    const good = `${u.uid}/${Date.now()}_cv.pdf`;
    assert.ifError((await upload(u.c, good, realPdf('Resume Test'))).error);
    const ok = await submit(u.c, { action: 'apply', path: good, qualification: 'MSc in Agronomy', experience: '5 years. Specialization: soil.' });
    assert.equal(status(ok), 200, JSON.stringify(ok.error && await ok.error.context?.json?.()));
    const app = await admin.c.from('expert_applications').select('id, status, cv_file_path').eq('id', ok.data.application_id).single();
    assert.deepEqual([app.data.status, app.data.cv_file_path], ['Pending', good]);
    const signed = await admin.c.storage.from('expert-cvs').createSignedUrl(good, 60);
    assert.ifError(signed.error);
    assert.equal(status(await submit(u.c, { action: 'apply', path: good, qualification: 'x', experience: 'y' })), 409, 'second pending application');

    // replace: a new real PDF becomes the application's resume; the old file stays
    const newer = `${u.uid}/${Date.now()}_cv.pdf`;
    assert.ifError((await upload(u.c, newer, realPdf('Resume Test v2'))).error);
    assert.equal(status(await submit(u.c, { action: 'replace', path: newer })), 200);
    assert.equal((await admin.c.from('expert_applications').select('cv_file_path').eq('id', app.data.id).single()).data.cv_file_path, newer);
    assert.equal(await exists(u.c, good), true);
  });
});

describe('remove expert role (migration 24)', { skip }, () => {
  test('preview lists the booking; removal needs confirmation; the former expert is locked out', { timeout: 180_000 }, async () => {
    const x = await signUp('rolesexp', 'Roles Expert (staging)');
    throwaway.push(x);
    const cv = `${x.uid}/${Date.now()}_cv.pdf`;
    assert.ifError((await upload(x.c, cv, realPdf('Roles Expert'))).error);
    const applied = await submit(x.c, { action: 'apply', path: cv, qualification: 'MSc', experience: '3 years' });
    assert.equal(status(applied), 200);
    assert.ifError((await admin.c.rpc('approve_expert_application', { p_application_id: applied.data.application_id })).error);
    const x2 = await signIn(x.email);   // fresh session after the role change
    assert.ifError((await x2.c.rpc('set_consultation_fee', { p_fee_paise: 40000 })).error);
    const expert = (await x2.c.from('experts').select('id').eq('user_id', x.uid).single()).data;
    const d = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    const slot = await x2.c.from('consultation_slots').insert({ expert_id: expert.id, slot_date: d, start_time: '11:00', end_time: '11:30', rate: 400 }).select('id').single();
    assert.ifError(slot.error);
    const booked = await demoBook(user1.c, slot.data.id, 'roles staging test');
    assert.ifError(booked.error);

    const preview = await admin.c.rpc('admin_expert_removal_preview', { p_user_id: x.uid });
    assert.ifError(preview.error);
    assert.equal(preview.data.upcoming.length, 1);
    const refused = await admin.c.rpc('demote_expert', { p_user_id: x.uid });
    assert.equal(refused.error?.hint, 'upcoming_bookings');
    const done = await admin.c.rpc('demote_expert', { p_user_id: x.uid, p_cancel_upcoming: true });
    assert.ifError(done.error);
    assert.equal(done.data.cancelled_bookings, 1);
    const b = await admin.c.from('consultation_bookings').select('status, cancelled_by_role, refund_paise').eq('slot_id', slot.data.id).single();
    assert.deepEqual([b.data.status, b.data.cancelled_by_role, b.data.refund_paise], ['Cancelled', 'admin', 40000]);

    assert.match((await x2.c.rpc('set_consultation_fee', { p_fee_paise: 50000 })).error?.message || '', /Only experts/);
    const slot2 = await x2.c.from('consultation_slots').insert({ expert_id: expert.id, slot_date: d, start_time: '12:00', end_time: '12:30', rate: 400 });
    assert.ok(slot2.error, 'a former expert published a slot');
    const listed = await user1.c.from('experts').select('id, is_active').eq('id', expert.id).maybeSingle();
    assert.notEqual(listed.data?.is_active, true, 'still an active expert in Catch Up');
    assert.equal((await admin.c.from('profiles').select('role').eq('id', x.uid).single()).data.role, 'Farmer');
    assert.match((await admin.c.rpc('demote_expert', { p_user_id: admin.uid })).error?.message || '', /your own role/);
  });
});

describe('admin-create-user', { skip }, () => {
  test('admins only; creates a Farmer with a one-time set-up link; duplicate e-mail refused', { timeout: 120_000 }, async () => {
    const fn = (c, body) => c.functions.invoke('admin-create-user', { body });
    const email = unique('created');
    assert.equal(status(await fn(user1.c, { email, full_name: 'Not Allowed' })), 403);
    assert.equal(status(await fn(admin.c, { email: 'not-an-email', full_name: 'Bad Mail' })), 400);
    const ok = await fn(admin.c, { email, full_name: 'Created By Admin (staging)', district: 'Idukki' });
    assert.equal(status(ok), 200);
    throwaway.push({ uid: ok.data.user_id, c: admin.c });
    assert.match(ok.data.setup_link || '', /^https:\/\//);
    const prof = (await admin.c.from('profiles').select('role, district').eq('id', ok.data.user_id).single()).data;
    assert.deepEqual([prof.role, prof.district], ['Farmer', 'Idukki']);
    assert.equal(status(await fn(admin.c, { email, full_name: 'Again' })), 409);
  });
});

describe('expert announcements need admin approval (migration 25)', { skip }, () => {
  test('expert submits; farmers cannot see it; admin rejects with a reason, then approves another for experts', { timeout: 120_000 }, async () => {
    const expert = await signIn(fx('expert1'));
    const made = [];
    try {
      // farmers cannot submit, and nobody but an admin reviews
      const f = await user1.c.rpc('submit_expert_broadcast', { p_title: 'Hello', p_message: 'Farmers cannot send this.' });
      assert.match(f.error?.message || '', /Only verified experts/);
      const bad = await expert.c.rpc('submit_expert_broadcast', { p_title: 'x', p_message: 'Too short title' });
      assert.match(bad.error?.message || '', /Title must be 2 to 120/);

      const one = await expert.c.rpc('submit_expert_broadcast', { p_title: 'Coconut mite advisory',
        p_message: 'Spray neem oil 2% on young nuts this week.', p_target_role: null });
      assert.equal(one.error, null); made.push(one.data);
      assert.equal((await user1.c.from('broadcasts').select('id').eq('id', one.data)).data.length, 0, 'farmer cannot read a pending one');
      assert.match((await user1.c.rpc('review_broadcast', { p_broadcast_id: one.data, p_approve: true })).error?.message || '',
        /Admin privileges required/);
      assert.match((await expert.c.rpc('review_broadcast', { p_broadcast_id: one.data, p_approve: true })).error?.message || '',
        /Admin privileges required/);
      const waiting = await admin.c.from('broadcasts').select('status, sender:profiles!broadcasts_sent_by_fkey(full_name)').eq('id', one.data).single();
      assert.equal(waiting.data.status, 'pending');
      assert.ok(waiting.data.sender.full_name);
      const rej = await admin.c.rpc('review_broadcast', { p_broadcast_id: one.data, p_approve: false, p_note: 'Please add the dose per litre' });
      assert.equal(rej.error, null); assert.equal(rej.data, 0);
      const mine = await expert.c.from('broadcasts').select('status, review_note').eq('id', one.data).single();
      assert.deepEqual(mine.data, { status: 'rejected', review_note: 'Please add the dose per litre' });

      // approval for experts only (staging has a single expert: the test expert) reaches them as an announcement
      const two = await expert.c.rpc('submit_expert_broadcast', { p_title: 'Expert meeting note',
        p_message: 'Please keep your Meet links ready ten minutes early.', p_target_role: 'Expert' });
      made.push(two.data);
      const ok = await admin.c.rpc('review_broadcast', { p_broadcast_id: two.data, p_approve: true });
      assert.equal(ok.error, null); assert.ok(ok.data >= 1);
      const got = await expert.c.from('notifications').select('id').eq('related_id', two.data).eq('type', 'announcement');
      assert.equal(got.data.length, 1);
      assert.equal((await expert.c.from('broadcasts').select('title').eq('id', two.data).single()).data.title, 'Expert meeting note');
      assert.equal((await user1.c.from('broadcasts').select('id').eq('id', two.data)).data.length, 0, 'not a recipient');
      assert.match((await admin.c.rpc('review_broadcast', { p_broadcast_id: two.data, p_approve: true })).error?.message || '',
        /already reviewed/);
    } finally {
      // the test's own rows: the expert's notifications about them, then the broadcasts (admin-only delete)
      if (made.length) {
        await expert.c.from('notifications').delete().in('related_id', made);
        await admin.c.from('notifications').delete().in('related_id', made);
        await admin.c.from('broadcasts').delete().in('id', made);
      }
    }
  });
});
