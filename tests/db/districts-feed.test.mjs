// SQL behaviour tests for supabase/proposed/20 (launch districts + district-priority feed) on the REAL production
// schema in PGlite. Run with: npm run test:db
// Owner rules (2026-10-26, Idukki added 2026-10-27 by 21): districts are Kannur, Pathanamthitta, Idukki, Kottayam; the viewer's own district comes
// first, newest first inside each group; a post's district is the author's, set by the server; no district → chronological.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDb, as, ids, seed, signUp, rejects, ALL } from './harness.mjs';

const setup = async () => {
  const db = await createDb({ proposed: [...ALL, '09', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'] });
  await seed(db);
  return db;
};
const setDistrict = (db, uid, d) => db.query('update public.profiles set district = $2 where id = $1', [uid, d]);
// post by `uid` (inserted as that user, like the app), created `minutesAgo` minutes ago
async function post(db, uid, caption, minutesAgo, { status = 'Approved', district } = {}) {
  const r = await as(db, uid, `insert into public.posts (user_id, caption, status${district ? ', district' : ''})
                               values ($1, $2, $3${district ? ', $4' : ''}) returning id`,
    district ? [uid, caption, status, district] : [uid, caption, status]);
  const id = r.rows[0].id;
  await db.query(`update public.posts set created_at = now() - make_interval(mins => $2) where id = $1`, [id, minutesAgo]);
  return id;
}
const feed = async (db, uid, limit = 50, after = {}) => (await as(db, uid,
  'select caption, district, feed_rank, created_at, id, liked_by_me from public.get_feed($1, $2, $3, $4)',
  [limit, after.rank ?? null, after.created_at ?? null, after.id ?? null])).rows;

// three authors, one per district, posting alternately
async function threeDistricts(db) {
  await setDistrict(db, ids.farmerA, 'Kottayam');
  await setDistrict(db, ids.farmerB, 'Pathanamthitta');
  await setDistrict(db, ids.expertUser, 'Kannur');
  await post(db, ids.farmerA, 'K-old', 60); await post(db, ids.farmerB, 'P-old', 50); await post(db, ids.expertUser, 'N-old', 40);
  await post(db, ids.farmerA, 'K-new', 30); await post(db, ids.farmerB, 'P-new', 20); await post(db, ids.expertUser, 'N-new', 10);
}

describe('20 — district-priority feed', () => {
  test('Kottayam viewer: Kottayam posts first (newest first), then the others by time', async () => {
    const db = await setup(); await threeDistricts(db);
    assert.deepEqual((await feed(db, ids.farmerA)).map((r) => r.caption), ['K-new', 'K-old', 'N-new', 'P-new', 'N-old', 'P-old']);
  });

  test('Pathanamthitta viewer and Kannur viewer get their own district first', async () => {
    const db = await setup(); await threeDistricts(db);
    assert.deepEqual((await feed(db, ids.farmerB)).map((r) => r.caption), ['P-new', 'P-old', 'N-new', 'K-new', 'N-old', 'K-old']);
    assert.deepEqual((await feed(db, ids.expertUser)).map((r) => r.caption), ['N-new', 'N-old', 'P-new', 'K-new', 'P-old', 'K-old']);
  });

  test('viewer without a district: plain chronological; posts without a district keep their time position', async () => {
    const db = await setup(); await threeDistricts(db);
    await setDistrict(db, ids.admin, null);
    await db.query(`update public.profiles set district = null where id = $1`, [ids.farmerA]);
    await post(db, ids.farmerA, 'no-district', 25);   // author has no district now → post has none
    const rows = await feed(db, ids.admin);
    assert.deepEqual(rows.map((r) => r.caption), ['N-new', 'P-new', 'no-district', 'K-new', 'N-old', 'P-old', 'K-old']);
    assert.ok(rows.every((r) => r.feed_rank === 1));
  });

  test('pages of 3 over 10 posts (two with the same timestamp): no duplicates, no gaps, same order as one page', async () => {
    const db = await setup();
    await setDistrict(db, ids.farmerA, 'Kottayam'); await setDistrict(db, ids.farmerB, 'Kannur');
    for (let i = 0; i < 10; i++) await post(db, i % 2 ? ids.farmerA : ids.farmerB, `p${i}`, 100 - i * 5);
    await db.query(`update public.posts set created_at = (select created_at from public.posts where caption = 'p4') where caption = 'p5'`);
    const all = await feed(db, ids.farmerA, 50);
    const pages = []; let after = {};
    for (;;) {
      const page = await feed(db, ids.farmerA, 3, after);
      pages.push(...page);
      if (page.length < 3) break;
      const last = page.at(-1); after = { rank: last.feed_rank, created_at: last.created_at, id: last.id };
    }
    assert.equal(pages.length, 10);
    assert.equal(new Set(pages.map((r) => r.id)).size, 10);
    assert.deepEqual(pages.map((r) => r.id), all.map((r) => r.id));
  });

  test('the post district comes from the author; clients cannot set or change it; later moves keep old posts', async () => {
    const db = await setup();
    await setDistrict(db, ids.farmerA, 'Kottayam');
    const id = await post(db, ids.farmerA, 'mine', 5, { district: 'Kannur' });
    const district = async () => (await db.query('select district from public.posts where id = $1', [id])).rows[0].district;
    assert.equal(await district(), 'Kottayam');
    await as(db, ids.farmerA, `update public.posts set district = 'Kannur', caption = 'edited' where id = $1`, [id]);
    assert.equal(await district(), 'Kottayam');
    await as(db, ids.farmerA, `update public.profiles set district = 'Kannur' where id = $1`, [ids.farmerA]);
    assert.equal(await district(), 'Kottayam', 'old post moved with the author');
  });

  test('changing my district changes the order on the next load', async () => {
    const db = await setup(); await threeDistricts(db);
    assert.equal((await feed(db, ids.farmerA))[0].caption, 'K-new');
    await as(db, ids.farmerA, `update public.profiles set district = 'Kannur' where id = $1`, [ids.farmerA]);
    assert.deepEqual((await feed(db, ids.farmerA)).slice(0, 2).map((r) => r.caption), ['N-new', 'N-old']);
  });

  test('hidden posts stay hidden; anon cannot read the feed; liked_by_me is per viewer', async () => {
    const db = await setup(); await setDistrict(db, ids.farmerB, 'Kottayam');
    await post(db, ids.farmerB, 'pending', 5, { status: 'Pending' });
    await post(db, ids.farmerB, 'rejected', 6, { status: 'Rejected' });
    const ok = await post(db, ids.farmerB, 'visible', 7);
    assert.deepEqual((await feed(db, ids.farmerA)).map((r) => r.caption), ['visible']);
    await rejects(as(db, null, 'select * from public.get_feed()'), /permission denied/);
    await as(db, ids.farmerA, 'insert into public.likes (post_id, user_id) values ($1, $2)', [ok, ids.farmerA]);
    assert.equal((await feed(db, ids.farmerA))[0].liked_by_me, true);
    assert.equal((await feed(db, ids.expertUser))[0].liked_by_me, false);
  });
});

describe('20 — districts on profiles and sign-up', () => {
  test('only canonical districts are stored; sign-up keeps the district, ignores unknown ones and never grants a role', async () => {
    const db = await setup();
    await rejects(db.query(`update public.profiles set district = 'Kottayam District' where id = $1`, [ids.farmerA]), /profiles_district_check/);
    await rejects(db.query(`update public.profiles set district = 'കോട്ടയം' where id = $1`, [ids.farmerA]), /profiles_district_check/);
    const a = randomUUID(); const b = randomUUID();
    await signUp(db, a, 'kerala@example.test', { district: 'Pathanamthitta', phone: '9876543210', location: 'Ranni, Pathanamthitta, Kerala', role: 'Admin' });
    await signUp(db, b, 'other@example.test', { district: 'Ludhiana' });
    const pa = (await db.query('select role, district, phone, location from public.profiles where id = $1', [a])).rows[0];
    assert.deepEqual(pa, { role: 'Farmer', district: 'Pathanamthitta', phone: '9876543210', location: 'Ranni, Pathanamthitta, Kerala' });
    assert.equal((await db.query('select district from public.profiles where id = $1', [b])).rows[0].district, null);
  });

  test('admin_district_stats: admins only; counts by district including "not set"', async () => {
    const db = await setup(); await threeDistricts(db);
    await rejects(as(db, ids.farmerA, 'select public.admin_district_stats()'), /Admin privileges/);
    const rows = (await as(db, ids.admin, 'select public.admin_district_stats() s')).rows[0].s;
    const by = Object.fromEntries(rows.map((r) => [r.district ?? 'none', r]));
    assert.deepEqual([by.Kottayam.farmers, by.Kottayam.posts, by.Kottayam.posts_7d], [1, 2, 2]);
    assert.deepEqual([by.Pathanamthitta.farmers, by.Pathanamthitta.posts], [1, 2]);
    assert.deepEqual([by.Kannur.experts, by.Kannur.posts], [1, 2]);
    assert.ok(by.none.farmers + by.none.experts >= 0 && 'none' in by);
  });

  test('20 is re-runnable', async () => {
    const db = await setup(); await threeDistricts(db);
    const { applyProposed } = await import('./harness.mjs');
    await applyProposed(db, '20');
    assert.equal((await feed(db, ids.farmerA))[0].caption, 'K-new');
  });
});

// ── 21: Idukki added (owner decision 2026-10-27: Kannur, Pathanamthitta, Idukki, Kottayam) ───────────────────────
const setup21 = async () => {
  const db = await createDb({ proposed: [...ALL, '09', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21'] });
  await seed(db);
  return db;
};
// one author per district; the local post is always the OLDEST, so only the district rule can put it first
const FOUR = [
  ['Kannur', ids.farmerA, 'kannur-1min', 1],
  ['Pathanamthitta', ids.farmerB, 'pathanamthitta-2min', 2],
  ['Idukki', ids.expertUser, 'idukki-3min', 3],
  ['Kottayam', ids.admin, 'kottayam-10min', 10],
];
async function fourDistricts(db) {
  for (const [d, uid] of FOUR) await setDistrict(db, uid, d);
  for (const [, uid, caption, mins] of FOUR) await post(db, uid, caption, mins);
}

describe('21 — four launch districts', () => {
  test('every district sees its own post first even when it is the oldest; the rest newest-first', async () => {
    const db = await setup21(); await fourDistricts(db);
    for (const [d, viewer, ownCaption] of FOUR) {
      const rows = await feed(db, viewer);
      assert.equal(rows[0].caption, ownCaption, `${d}: own district first`);
      assert.equal(rows[0].district, d);
      assert.equal(rows[0].feed_rank, 0);
      const rest = rows.slice(1);
      assert.equal(rest.length, 3, `${d}: other districts are not hidden`);
      assert.ok(rest.every((r) => r.feed_rank === 1 && r.district !== d));
      for (let i = 1; i < rest.length; i++) assert.ok(new Date(rest[i - 1].created_at) >= new Date(rest[i].created_at), `${d}: newest first`);
    }
  });

  test('equal timestamps are ordered by id (deterministic), and pages of 1 equal one page with no repeats', async () => {
    const db = await setup21(); await fourDistricts(db);
    const extra = await post(db, ids.farmerB, 'pathanamthitta-same-time', 2);
    await db.query(`update public.posts set created_at = (select created_at from public.posts where caption = 'pathanamthitta-2min') where id = $1`, [extra]);
    const all = await feed(db, ids.farmerA);
    const same = all.filter((r) => r.caption.startsWith('pathanamthitta'));
    assert.equal(same.length, 2);
    assert.ok(same[0].id > same[1].id, 'tie broken by id desc');
    assert.deepEqual((await feed(db, ids.farmerA)).map((r) => r.id), all.map((r) => r.id), 'same order on every call');
    const paged = []; let after = {};
    for (let i = 0; i < 20; i++) {
      const page = await feed(db, ids.farmerA, 1, after);
      if (!page.length) break;
      paged.push(...page);
      const last = page.at(-1);
      after = { rank: last.feed_rank, created_at: last.created_at, id: last.id };
    }
    assert.deepEqual(paged.map((r) => r.id), all.map((r) => r.id));
    assert.equal(new Set(paged.map((r) => r.id)).size, paged.length);
  });

  test('Idukki is accepted everywhere; any other district is still rejected', async () => {
    const db = await setup21();
    await setDistrict(db, ids.farmerA, 'Idukki');
    await rejects(db.query(`update public.profiles set district = 'Wayanad' where id = $1`, [ids.farmerA]), /profiles_district_check/);
    await rejects(db.query(`update public.profiles set district = 'idukki' where id = $1`, [ids.farmerA]), /profiles_district_check/);
    const u = randomUUID();
    await signUp(db, u, 'idukki@example.test', { district: 'Idukki', location: 'Thodupuzha, Idukki, Kerala' });
    assert.equal((await db.query('select district from public.profiles where id = $1', [u])).rows[0].district, 'Idukki');
    const p = await post(db, ids.farmerA, 'idukki-post', 1);
    assert.equal((await db.query('select district from public.posts where id = $1', [p])).rows[0].district, 'Idukki');
    const stats = (await as(db, ids.admin, 'select public.admin_district_stats() s')).rows[0].s;
    assert.deepEqual(stats.map((r) => r.district), ['Idukki', 'Kannur', 'Kottayam', 'Pathanamthitta', null]);
    assert.equal(stats.find((r) => r.district === 'Idukki').farmers, 2);
  });

  test('a district with no local posts, and a user with no district, still see every other district', async () => {
    const db = await setup21(); await fourDistricts(db);
    // remove the only Kannur post: a Kannur viewer now has no local post at all
    await db.query(`delete from public.posts where caption = 'kannur-1min'`);
    const kannur = await feed(db, ids.farmerA);
    assert.deepEqual(kannur.map((r) => r.district), ['Pathanamthitta', 'Idukki', 'Kottayam'], 'others, newest first');
    assert.ok(kannur.every((r) => r.feed_rank === 1));
    // a viewer without a district: everything, newest first (nothing hidden, nothing ranked first)
    await setDistrict(db, ids.farmerA, null);
    const none = await feed(db, ids.farmerA);
    assert.deepEqual(none.map((r) => r.district), ['Pathanamthitta', 'Idukki', 'Kottayam']);
    // a post whose author has no district is shown to everyone too (after the local group)
    await setDistrict(db, ids.farmerB, null);
    await post(db, ids.farmerB, 'no-district-post', 0);
    for (const [d, viewer] of [['Idukki', ids.expertUser], ['Kottayam', ids.admin]]) {
      const rows = await feed(db, viewer);
      assert.equal(rows[0].district, d, `${d}: own first`);
      assert.ok(rows.some((r) => r.caption === 'no-district-post'), `${d}: post without a district is visible`);
    }
  });

  test('21 is re-runnable', async () => {
    const db = await setup21(); await fourDistricts(db);
    const { applyProposed } = await import('./harness.mjs');
    await applyProposed(db, '21');
    assert.equal((await feed(db, ids.farmerA))[0].caption, 'kannur-1min');
  });
});
