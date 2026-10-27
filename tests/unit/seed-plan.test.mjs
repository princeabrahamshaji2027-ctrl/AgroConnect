// Launch community seed plan (scripts/production/seed-lib.mjs): idempotent, four canonical districts, no admins.
// Owner target (2026-10-27): 50 users — Kannur 20, Pathanamthitta 20, Idukki 5, Kottayam 5 — of which 10 experts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts, plan, POSTS, EMAIL_DOMAIN, DISTRICTS, TARGET } from '../../scripts/production/seed-lib.mjs';

const retained = [
  { email: 'owner@example.com', role: 'Admin' }, { email: 'prince@agroconnect.com', role: 'Admin' },
  { email: 'a@example.com', role: 'Expert' }, { email: 'b@example.com', role: 'Expert' },
  { email: 'user1@agroconnect.com', role: 'Farmer' },
];

test('50 accounts: Kannur 20, Pathanamthitta 20, Idukki 5, Kottayam 5; 10 experts (4/4/1/1), 40 farmers (16/16/4/4)', () => {
  const all = accounts();
  assert.deepEqual(DISTRICTS, ['Kannur', 'Pathanamthitta', 'Idukki', 'Kottayam']);
  assert.equal(all.length, 50);
  assert.deepEqual(DISTRICTS.map((d) => all.filter((a) => a.district === d).length), [20, 20, 5, 5]);
  assert.deepEqual(DISTRICTS.map((d) => TARGET[d]), [20, 20, 5, 5]);
  assert.deepEqual(DISTRICTS.map((d) => all.filter((a) => a.role === 'Expert' && a.district === d).length), [4, 4, 1, 1]);
  assert.deepEqual(DISTRICTS.map((d) => all.filter((a) => a.role === 'Farmer' && a.district === d).length), [16, 16, 4, 4]);
  assert.equal(all.filter((a) => a.role === 'Admin').length, 0);
  assert.equal(new Set(all.map((a) => a.email)).size, 50, 'unique e-mails');
  assert.equal(new Set(all.map((a) => a.name)).size, 50, 'unique names');
  assert.ok(all.every((a) => a.email.endsWith(`@${EMAIL_DOMAIN}`) && DISTRICTS.includes(a.district)));
  assert.ok(all.every((a) => a.location.endsWith(`, ${a.district}, Kerala`)));
  assert.ok(all.filter((a) => a.role === 'Expert').every((a) => /demo profile/.test(a.bio)), 'experts must be marked as demo profiles');
  assert.ok(all.filter((a) => a.role === 'Expert').every((a) => a.feePaise >= 30000 && a.feePaise <= 60000));
});

test('existing accounts are kept and counted separately; the plan creates exactly the 50', () => {
  const p = plan(retained);
  assert.deepEqual([p.toCreate.length, p.retainedCount, p.target], [50, 5, 50]);
  for (const d of DISTRICTS) assert.equal(p.totals.Farmer[d] + p.totals.Expert[d], TARGET[d], d);
});

test('running again creates nothing (idempotent by e-mail)', () => {
  const seeded = accounts().map((a) => ({ email: a.email, role: a.role, district: a.district, full_name: a.name }));
  const p = plan([...retained, ...seeded]);
  assert.equal(p.toCreate.length, 0);
  assert.equal(p.alreadySeeded.length, 50);
});

test('starter posts: two per district, authors live in the post district; no testimonials or diagnoses', () => {
  const byName = new Map(accounts().map((a) => [a.name, a]));
  const districts = POSTS.map((p) => byName.get(p.author)?.district);
  assert.ok(districts.every(Boolean), 'every author exists');
  assert.deepEqual(DISTRICTS.map((d) => districts.filter((x) => x === d).length), [2, 2, 2, 2]);
  for (const p of POSTS) assert.doesNotMatch(p.text, /recommend(ed)? by|thanks to Dr|consultation (helped|worked)|diagnos/i);
});
