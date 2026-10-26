// Launch community seed plan (scripts/production/seed-lib.mjs): idempotent, canonical districts, no admins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts, plan, POSTS, EMAIL_DOMAIN, DISTRICTS } from '../../scripts/production/seed-lib.mjs';

const retained = [
  { email: 'owner@example.com', role: 'Admin' }, { email: 'prince@agroconnect.com', role: 'Admin' },
  { email: 'a@example.com', role: 'Expert' }, { email: 'b@example.com', role: 'Expert' }, { email: 'c@example.com', role: 'Expert' },
  { email: 'user1@agroconnect.com', role: 'Farmer' }, { email: 'user2@agroconnect.com', role: 'Farmer' },
  { email: 'usertwo@agroconnect.com', role: 'Farmer' }, { email: 'testfarmer@agroconnect.com', role: 'Farmer' },
];

test('41 accounts: 6 experts (2 per district) and 35 farmers (12/12/11); no admins; unique .local e-mails', () => {
  const all = accounts();
  assert.equal(all.length, 41);
  assert.equal(all.filter((a) => a.role === 'Admin').length, 0);
  for (const d of DISTRICTS) assert.equal(all.filter((a) => a.role === 'Expert' && a.district === d).length, 2, d);
  assert.deepEqual(DISTRICTS.map((d) => all.filter((a) => a.role === 'Farmer' && a.district === d).length), [12, 12, 11]);
  assert.equal(new Set(all.map((a) => a.email)).size, 41);
  assert.ok(all.every((a) => a.email.endsWith(`@${EMAIL_DOMAIN}`) && DISTRICTS.includes(a.district)));
  assert.ok(all.filter((a) => a.role === 'Expert').every((a) => /demo profile/.test(a.bio)), 'experts must be marked as demo profiles');
});

test('with the 9 retained accounts the community reaches 50 (2 admins, 9 experts, 39 farmers)', () => {
  const p = plan(retained);
  assert.deepEqual([p.toCreate.length, p.retainedCount, p.finalCount], [41, 9, 50]);
  assert.deepEqual([p.totals.Admin.total, p.totals.Expert.total, p.totals.Farmer.total], [2, 9, 39]);
});

test('running again creates nothing (idempotent by e-mail)', () => {
  const seeded = accounts().map((a) => ({ email: a.email, role: a.role, district: a.district, full_name: a.name }));
  const p = plan([...retained, ...seeded]);
  assert.equal(p.toCreate.length, 0);
  assert.equal(p.alreadySeeded.length, 41);
  assert.equal(p.finalCount, 50);
});

test('starter posts: authors exist and live in the post district; no testimonials', () => {
  const byName = new Map(accounts().map((a) => [a.name, a]));
  assert.deepEqual(POSTS.map((p) => byName.get(p.author)?.district), ['Kottayam', 'Pathanamthitta', 'Kannur', 'Kottayam', 'Pathanamthitta']);
  for (const p of POSTS) assert.doesNotMatch(p.text, /recommend(ed)? by|thanks to Dr|consultation (helped|worked)/i);
});
