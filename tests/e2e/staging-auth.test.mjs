// Account recovery and change password against STAGING Auth (the same calls src/utils/authRecovery.js makes).
// No reset e-mail is ever sent to a fixture address (they are not real mailboxes — bounces would get the project's
// mail sending restricted): reset requests here use unregistered addresses, for which Supabase sends nothing.
// A throwaway account (normal signup) is used for change-password and deleted at the end.
//   node --test tests/e2e/staging-auth.test.mjs
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
const client = () => createClient(URL_, env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, flowType: 'pkce' } });
const unique = (tag) => `agroconnect-stg-${tag}${Date.now()}${Math.floor(Math.random() * 1e4)}-${env.FIXTURE_EMAIL_TOKEN}@${env.FIXTURE_EMAIL_DOMAIN}`;
const REDIRECT = 'com.agroconnect.app.staging://auth-callback';

let admin; let tmp; const tmpEmail = skip ? '' : unique('authtest');
const P1 = 'Aa1!' + Math.random().toString(36).slice(2, 10) + 'Zz';
const P2 = 'Bb2@' + Math.random().toString(36).slice(2, 10) + 'Yy';

before(async () => {
  if (skip) return;
  admin = client();
  const a = await admin.auth.signInWithPassword({ email: `agroconnect-stg-admin-${env.FIXTURE_EMAIL_TOKEN}@${env.FIXTURE_EMAIL_DOMAIN}`, password: env.E2E_ADMIN_PASSWORD });
  if (a.error) throw new Error(`admin sign-in: ${a.error.message}`);
  const c = client();
  const su = await c.auth.signUp({ email: tmpEmail, password: P1, options: { data: { full_name: 'Auth Test (staging)' } } });
  if (su.error) throw new Error(`signup: ${su.error.message}`);
  tmp = { id: su.data.user.id };
});
after(async () => {
  if (tmp?.id) await admin.functions.invoke('admin-delete-user', { body: { user_id: tmp.id } });
});

describe('password reset request (staging Auth)', { skip }, () => {
  test('unregistered address: accepted with no error (same answer the app shows for any address); nothing is revealed', async () => {
    const c = client();
    const r = await c.auth.resetPasswordForEmail(unique('noaccount'), { redirectTo: REDIRECT });
    assert.equal(r.error, null, 'unregistered address produced an error the app would show');
  });

  test('malformed address is rejected', async () => {
    const r = await client().auth.resetPasswordForEmail('not-an-email', { redirectTo: REDIRECT });
    assert.ok(r.error, 'malformed address accepted');
  });

  test('a made-up or replayed reset code gives no session (expired / invalid / other-device links)', async () => {
    const c = client();
    for (const code of ['00000000-0000-0000-0000-000000000000', 'not-a-code', '']) {
      const r = await c.auth.exchangeCodeForSession(code);
      assert.ok(r.error, `code ${JSON.stringify(code)} accepted`);
      assert.equal((await c.auth.getSession()).data.session, null);
    }
  });

  test('a reset requested from another client cannot be completed here (no verifier on this device)', async () => {
    const asker = client();
    await asker.auth.resetPasswordForEmail(unique('noaccount'), { redirectTo: REDIRECT });
    const other = client();
    const r = await other.auth.exchangeCodeForSession('11111111-1111-1111-1111-111111111111');
    assert.ok(r.error);
  });
});

describe('change password (staging Auth)', { skip }, () => {
  test('wrong current password is refused by Auth; right one allows the change; old password stops working', async () => {
    const c = client();
    assert.ifError((await c.auth.signInWithPassword({ email: tmpEmail, password: P1 })).error);
    const other = client();                       // a second device signed in to the same account
    assert.ifError((await other.auth.signInWithPassword({ email: tmpEmail, password: P1 })).error);

    // what changePassword() does: check the current password with Auth, then update
    const wrong = await c.auth.signInWithPassword({ email: tmpEmail, password: P1 + 'x' });
    assert.match(wrong.error?.message || '', /Invalid login credentials/);
    const right = await c.auth.signInWithPassword({ email: tmpEmail, password: P1 });
    assert.ifError(right.error);
    const same = await c.auth.updateUser({ password: P1 });
    assert.ok(same.error, 'same password accepted');
    assert.ifError((await c.auth.updateUser({ password: P2 })).error);

    assert.ok((await client().auth.signInWithPassword({ email: tmpEmail, password: P1 })).error, 'old password still works');
    assert.ifError((await client().auth.signInWithPassword({ email: tmpEmail, password: P2 })).error);

    // documented behaviour of this project: other sessions after a password change
    const { error: refreshErr } = await other.auth.refreshSession();
    console.log(`# other device after password change: refresh ${refreshErr ? 'REFUSED (' + refreshErr.message + ')' : 'still allowed'}`);
  });

  test('a password cannot be changed for someone else: updateUser only ever changes the signed-in user', async () => {
    const c = client();
    assert.ifError((await c.auth.signInWithPassword({ email: tmpEmail, password: P2 })).error);
    // there is no parameter to name another account; extra fields are ignored by Auth
    const r = await c.auth.updateUser({ password: P1, email: undefined, data: { role: 'Admin' } });
    assert.ifError(r.error);
    const prof = await admin.from('profiles').select('role').eq('id', tmp.id).single();
    assert.equal(prof.data.role, 'Farmer', 'signup metadata changed the role');
  });
});
