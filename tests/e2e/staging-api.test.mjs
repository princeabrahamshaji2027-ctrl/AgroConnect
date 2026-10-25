// Authenticated API-level E2E tests against a STAGING Supabase project (never production).
// Run with: npm run test:staging
// Required env (put them in .env.staging or your CI secret store, never in git):
//   STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY
//   FIXTURE_PASSWORD            password of the *.agroconnect.local fixtures (npm run seed:fixtures on staging)
//   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD   (optional: admin tests are skipped without them)
// Staging must have supabase/schema/live_schema_20261024.sql and supabase/proposed/01–08 applied (see REMEDIATION_STATUS.md).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';

// Falls back to .env.staging (git-ignored) when the variables are not exported in the shell.
const envFile = new URL('../../.env.staging', import.meta.url);
if (existsSync(envFile)) {
  for (const l of readFileSync(envFile, 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
const fx = (name) => (process.env.FIXTURE_EMAIL_TOKEN
  ? `agroconnect-stg-${name}-${process.env.FIXTURE_EMAIL_TOKEN}@${process.env.FIXTURE_EMAIL_DOMAIN}`
  : `${name}@agroconnect.local`);

const URL_ = process.env.STAGING_SUPABASE_URL;
const KEY = process.env.STAGING_SUPABASE_ANON_KEY;
const PW = process.env.FIXTURE_PASSWORD;
const PRODUCTION_REF = 'mgreapakfchcxcrauheq';
const configured = Boolean(URL_ && KEY && PW);
const skip = configured ? false : 'STAGING_SUPABASE_URL / STAGING_SUPABASE_ANON_KEY / FIXTURE_PASSWORD not set';

if (URL_?.includes(PRODUCTION_REF)) {
  throw new Error('Refusing to run E2E tests against the production Supabase project.');
}

const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function signIn(email, password = PW) {
  const c = client();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return { c, uid: data.user.id };
}

describe('staging: anonymous', { skip }, () => {
  test('cannot read profiles, bookings or notifications', async () => {
    const c = client();
    for (const t of ['profiles', 'consultation_bookings', 'notifications', 'farmer_profiles', 'followers']) {
      const { data } = await c.from(t).select('*').limit(1);
      assert.equal((data || []).length, 0, t);
    }
  });
});

describe('staging: normal user (user1)', { skip }, () => {
  let u;
  before(async () => { u = await signIn(fx('user1')); });

  test('loads own profile and persists an edit', async () => {
    const bio = `e2e ${Date.now()}`;
    const { error } = await u.c.from('profiles').update({ bio }).eq('id', u.uid);
    assert.ifError(error);
    const { data } = await u.c.from('profiles').select('bio, role').eq('id', u.uid).single();
    assert.equal(data.bio, bio);
    assert.equal(data.role, 'Farmer');
  });

  test('cannot promote itself, forge notifications or call admin/scheduler functions', async () => {
    const promote = await u.c.from('profiles').update({ role: 'Admin' }).eq('id', u.uid);
    assert.ok(promote.error, 'role change must fail');
    const expert = await u.c.from('profiles').select('id').eq('role', 'Expert').limit(1).single();
    const forge = await u.c.from('notifications').insert({ user_id: expert.data.id, type: 'booking', message: 'forged' });
    assert.ok(forge.error, 'notification forgery must fail');
    for (const [fn, args] of [['process_consultation_lifecycle', {}], ['admin_settle_refund', { p_booking_id: expert.data.id, p_succeeded: true }],
      ['approve_expert_application', { p_application_id: expert.data.id }], ['ban_user', { p_user_id: expert.data.id, p_reason: 'x' }]]) {
      const { error } = await u.c.rpc(fn, args);
      assert.ok(error, `${fn} must be rejected`);
    }
  });

  test('cannot write bookings directly', async () => {
    const { error } = await u.c.from('consultation_bookings').update({ status: 'Completed' }).neq('status', 'x');
    assert.ok(error);
  });

  test('sign-out ends access', async () => {
    const tmp = await signIn(fx('user1'));
    await tmp.c.auth.signOut();
    const { data } = await tmp.c.from('notifications').select('id').limit(1);
    assert.equal((data || []).length, 0);
  });
});

describe('staging: expert1 + booking lifecycle', { skip }, () => {
  test('expert1 is a recognised, active expert with open slots and no admin rights', async () => {
    const e = await signIn(fx('expert1'));
    const { data: me } = await e.c.from('experts').select('id, is_active').eq('user_id', e.uid).maybeSingle();
    assert.ok(me, 'experts row exists (AUD-015)');
    assert.equal(me.is_active, true);
    const { data: slots } = await e.c.from('consultation_slots').select('id').eq('expert_id', me.id).eq('is_booked', false)
      .gte('slot_date', new Date().toISOString().slice(0, 10));
    assert.ok(slots.length > 0, 'has future open slots');
    const { data: isAdmin } = await e.c.rpc('is_admin');
    assert.equal(isAdmin, false);
  });

  test('farmer books -> expert sees it -> other farmer does not -> farmer cancels -> refund Pending, slot freed', async () => {
    const e = await signIn(fx('expert1'));
    const f = await signIn(fx('user1'));
    const other = await signIn(fx('user3'));
    const { data: me } = await e.c.from('experts').select('id').eq('user_id', e.uid).single();
    const { data: slot } = await f.c.from('consultation_slots').select('id').eq('expert_id', me.id).eq('is_booked', false)
      .gt('slot_date', new Date().toISOString().slice(0, 10)).limit(1).single();

    const { data: bookingId, error } = await f.c.rpc('book_consultation_slot', { p_slot_id: slot.id, p_issue: 'E2E soil test' });
    assert.ifError(error);
    const again = await f.c.rpc('book_consultation_slot', { p_slot_id: slot.id, p_issue: 'E2E soil test' });
    assert.equal(again.data, bookingId, 'duplicate submission is idempotent');
    const stolen = await other.c.rpc('book_consultation_slot', { p_slot_id: slot.id, p_issue: 'mine' });
    assert.ok(stolen.error, 'slot cannot be double booked');

    const seen = await e.c.from('consultation_bookings').select('id').eq('id', bookingId);
    assert.equal(seen.data.length, 1);
    const hidden = await other.c.from('consultation_bookings').select('id').eq('id', bookingId);
    assert.equal(hidden.data.length, 0);
    const cancelByOther = await other.c.rpc('cancel_consultation_booking', { p_booking_id: bookingId, p_reason: 'x' });
    assert.ok(cancelByOther.error);

    const { data: refund, error: cErr } = await f.c.rpc('cancel_consultation_booking', { p_booking_id: bookingId, p_reason: 'E2E cleanup' });
    assert.ifError(cErr);
    assert.ok(Number(refund) > 0);
    const { data: b } = await f.c.from('consultation_bookings').select('status, refund_status').eq('id', bookingId).single();
    assert.deepEqual([b.status, b.refund_status], ['Cancelled', 'Pending']);
    const { data: s } = await f.c.from('consultation_slots').select('is_booked').eq('id', slot.id).single();
    assert.equal(s.is_booked, false);
    const { data: note } = await e.c.from('notifications').select('id').eq('related_id', bookingId).eq('type', 'booking');
    assert.equal(note.length, 1, 'expert notified by the server');
  });
});

const adminSkip = skip || ((process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD) ? false : 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set');
describe('staging: admin', { skip: adminSkip }, () => {
  test('admin can read users and applications and is_admin() is true', async () => {
    const a = await signIn(process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD);
    const { data: isAdmin } = await a.c.rpc('is_admin');
    assert.equal(isAdmin, true);
    const { count } = await a.c.from('profiles').select('*', { count: 'exact', head: true });
    assert.ok(count >= 5);
    const apps = await a.c.from('expert_applications').select('id, status');
    assert.ifError(apps.error);
    assert.ok(apps.data.some((x) => x.status === 'Pending'), 'user2 fixture is Pending');
  });
});
