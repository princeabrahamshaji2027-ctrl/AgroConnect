// District-priority feed (migration 20) on STAGING, through the same RPC the app calls. Synthetic accounts only.
//   node --test tests/e2e/staging-districts.test.mjs
// The fixtures keep their districts afterwards (the app asks users without one to choose, which would cover the
// screens other UI tests drive): user1 + expert1 Kottayam, user2 Pathanamthitta, user3 Kannur, user4 Idukki.
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
export const FIXTURE_DISTRICTS = { user1: 'Kottayam', user2: 'Pathanamthitta', user3: 'Kannur', user4: 'Idukki', expert1: 'Kottayam' };

const A = {};
const created = [];
before(async () => {
  if (skip) return;
  for (const n of ['admin', ...Object.keys(FIXTURE_DISTRICTS)]) A[n] = await signIn(n);
  for (const [n, d] of Object.entries(FIXTURE_DISTRICTS)) {
    const r = await A[n].c.from('profiles').update({ district: d }).eq('id', A[n].uid);
    assert.ifError(r.error);
  }
});
after(async () => {
  if (skip) return;
  for (const [n, id] of created) await A[n].c.from('posts').delete().eq('id', id);
});

const stamp = Date.now() % 1e6;
async function post(n, text, extra = {}) {
  const r = await A[n].c.from('posts').insert({ user_id: A[n].uid, caption: `${text} ${stamp}`, status: 'Approved', ...extra }).select('id, district').single();
  assert.ifError(r.error);
  created.push([n, r.data.id]);
  return r.data;
}
const feed = async (n, args = {}) => {
  const r = await A[n].c.rpc('get_feed', { p_limit: 50, p_after_rank: null, p_after_created_at: null, p_after_id: null, ...args });
  assert.ifError(r.error);
  return r.data;
};

describe('district-priority feed (staging)', { skip }, () => {
  test('a post gets its author\'s district; the client cannot choose another one', async () => {
    const p = await post('user2', 'district-from-author', { district: 'Kannur' });
    assert.equal(p.district, 'Pathanamthitta');
  });

  test('each district sees its own posts first, newest first inside each group', async () => {
    await post('user3', 'kannur-post');
    await post('user1', 'kottayam-post');
    await post('user2', 'pathanamthitta-post');
    await post('user4', 'idukki-post');
    for (const [n, d] of [['user1', 'Kottayam'], ['user2', 'Pathanamthitta'], ['user3', 'Kannur'], ['user4', 'Idukki']]) {
      const rows = await feed(n);
      const firstOther = rows.findIndex((r) => r.district !== d);
      assert.ok(firstOther > 0, `${n}: no local post first`);
      assert.ok(rows.slice(0, firstOther).every((r) => r.feed_rank === 0 && r.district === d), `${n}: local group mixed`);
      assert.ok(rows.slice(firstOther).every((r) => r.feed_rank === 1 && r.district !== d), `${n}: local post after others`);
      for (const group of [rows.slice(0, firstOther), rows.slice(firstOther)]) {
        for (let i = 1; i < group.length; i++) assert.ok(new Date(group[i - 1].created_at) >= new Date(group[i].created_at), `${n}: not newest first`);
      }
    }
  });

  test('pages of 2 return the same posts as one page, without repeats', async () => {
    const all = await feed('user1');
    const pages = []; let args = {};
    for (let i = 0; i < 100; i++) {
      const page = await feed('user1', { p_limit: 2, ...args });
      pages.push(...page);
      if (page.length < 2) break;
      const last = page.at(-1);
      args = { p_after_rank: last.feed_rank, p_after_created_at: last.created_at, p_after_id: last.id };
    }
    assert.deepEqual(pages.map((r) => r.id), all.map((r) => r.id));
  });

  test('anonymous callers get nothing; admins see district counts', async () => {
    const anon = createClient(URL_, env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    assert.ok((await anon.rpc('get_feed', {})).error, 'anon read the feed');
    assert.ok((await A.user1.c.rpc('admin_district_stats')).error, 'farmer read admin stats');
    const s = await A.admin.c.rpc('admin_district_stats');
    assert.ifError(s.error);
    assert.deepEqual(s.data.map((r) => r.district), ['Idukki', 'Kannur', 'Kottayam', 'Pathanamthitta', null]);
    assert.ok(s.data.find((r) => r.district === 'Kottayam').farmers >= 1);
    assert.ok(s.data.find((r) => r.district === 'Idukki').farmers >= 1);
  });
});
