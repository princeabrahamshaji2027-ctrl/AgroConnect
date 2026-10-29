// The 30 posts of "demo post s.pdf" (data/agroconnect_demo_posts.json), assigned as scripts/production/import-demo-posts.mjs
// assigns them (district = [Kannur, Pathanamthitta, Idukki, Kottayam][(n-1) % 4], post 01 newest, 6 h apart), on the
// production schema in PGlite (01–25). Every district viewer must get all 30 through get_feed pages of 7, own district
// first; a viewer without a district gets all 30 newest first. Run with: npm run test:db
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDb, as, ids, seed, signUp, ALL } from './harness.mjs';

const manifest = JSON.parse(readFileSync(new URL('../../data/agroconnect_demo_posts.json', import.meta.url), 'utf8'));
const DISTRICTS = ['Kannur', 'Pathanamthitta', 'Idukki', 'Kottayam'];
const AUTHORS = DISTRICTS.map((_, i) => `cccccccc-0000-4000-8000-00000000000${i + 1}`);
const VIEWERS = DISTRICTS.map((_, i) => `dddddddd-0000-4000-8000-00000000000${i + 1}`);

const setup = async () => {
  const db = await createDb({ proposed: [...ALL, '09', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25'] });
  await seed(db);
  for (const [i, d] of DISTRICTS.entries()) {
    await signUp(db, AUTHORS[i], `author-${i}@test.local`); await signUp(db, VIEWERS[i], `viewer-${i}@test.local`);
    await db.query('update public.profiles set district = $2 where id = any($1)', [[AUTHORS[i], VIEWERS[i]], d]);
  }
  for (const p of manifest.posts) {
    const author = AUTHORS[(p.source_index - 1) % 4];
    const r = await as(db, author, `insert into public.posts (user_id, title, caption, category, status, image_path, media_type)
                                    values ($1, $2, $3, $4, 'Approved', $5, 'image') returning id`,
      [author, p.title, `${p.title}\n\n${p.description}`, p.category, p.image_url]);
    await db.query(`update public.posts set created_at = now() - make_interval(hours => $2) where id = $1`, [r.rows[0].id, (p.source_index - 1) * 6]);
  }
  return db;
};
async function allPages(db, uid, size = 7) {
  const out = []; let after = {};
  for (let i = 0; i < 20; i++) {
    const rows = (await as(db, uid, 'select title, image_path, caption, district, feed_rank, created_at, id from public.get_feed($1, $2, $3, $4)',
      [size, after.rank ?? null, after.created_at ?? null, after.id ?? null])).rows;
    out.push(...rows);
    if (rows.length < size) break;
    const last = rows.at(-1); after = { rank: last.feed_rank, created_at: last.created_at, id: last.id };
  }
  return out;
}

describe('demo posts from "demo post s.pdf"', () => {
  test('manifest: 30 posts, unique titles and images, HTTPS image links, full descriptions', () => {
    assert.equal(manifest.posts.length, 30);
    assert.deepEqual(manifest.posts.map((p) => p.source_index), Array.from({ length: 30 }, (_, i) => i + 1));
    assert.equal(new Set(manifest.posts.map((p) => p.title)).size, 30);
    assert.equal(new Set(manifest.posts.map((p) => p.image_url)).size, 30);
    for (const p of manifest.posts) {
      assert.match(p.image_url, /^https:\/\/images\.openai\.com\//);
      assert.ok(p.description.length > 500, `post ${p.source_index} description looks cut`);
    }
  });

  test('every district viewer gets all 30 across pages, own district first, no duplicates; images match titles', async () => {
    const db = await setup();
    const byTitle = new Map(manifest.posts.map((p) => [p.title, p]));
    for (const [i, d] of DISTRICTS.entries()) {
      const rows = await allPages(db, VIEWERS[i]);
      assert.equal(rows.length, 30, `${d}: ${rows.length} posts`);
      assert.equal(new Set(rows.map((r) => r.id)).size, 30, `${d}: duplicates across pages`);
      const local = manifest.posts.filter((p) => (p.source_index - 1) % 4 === i).length;
      assert.ok(rows.slice(0, local).every((r) => r.district === d), `${d}: local posts are not first`);
      assert.ok(rows.slice(local).every((r) => r.district !== d), `${d}: a local post after the others`);
      assert.deepEqual(new Set(rows.slice(local).map((r) => r.district)), new Set(DISTRICTS.filter((x) => x !== d)));
      for (const r of rows) {
        assert.equal(r.image_path, byTitle.get(r.title).image_url);
        assert.equal(r.caption, `${r.title}\n\n${byTitle.get(r.title).description}`);
      }
    }
    // an older local post outranks a newer non-local one: post 29 (Kannur, oldest Kannur) is above post 02 (newest overall)
    const kannur = (await allPages(db, VIEWERS[0])).map((r) => r.title);
    assert.ok(kannur.indexOf(manifest.posts[28].title) < kannur.indexOf(manifest.posts[1].title));
  });

  test('a viewer with no district, and a district with no local posts, still get all 30', async () => {
    const db = await setup();
    const none = await allPages(db, ids.farmerA);   // seed farmer: no district
    assert.equal(none.length, 30);
    assert.deepEqual(none.map((r) => r.title), manifest.posts.map((p) => p.title));   // newest first = source order
    await db.query(`delete from public.posts where district = 'Idukki'`);
    const idukki = await allPages(db, VIEWERS[2]);
    assert.equal(idukki.length, 23);
    assert.ok(idukki.every((r) => r.district !== 'Idukki'));
  });
});
