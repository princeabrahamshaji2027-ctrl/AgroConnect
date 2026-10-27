// SQL behaviour tests for supabase/proposed/22 (storage file rules) and 23 (numeric ranges) on the real production
// schema in PGlite. Run with: npm run test:db
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, ids, seed, rejects, applyProposed, ALL } from './harness.mjs';

const setup = async () => {
  const db = await createDb({ proposed: [...ALL, '09', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'] });
  await seed(db);
  return db;
};

describe('22 — storage file rules', () => {
  test('resumes PDF ≤ 5 MB; images JPG/PNG/WEBP (posts ≤ 10 MB, others ≤ 5 MB); videos unchanged', async () => {
    const db = await setup();
    const b = Object.fromEntries((await db.query('select id, file_size_limit, allowed_mime_types from storage.buckets')).rows
      .map((r) => [r.id, [Number(r.file_size_limit), r.allowed_mime_types]]));
    const img = ['image/jpeg', 'image/png', 'image/webp'];
    assert.deepEqual(b['expert-cvs'], [5242880, ['application/pdf']]);
    for (const id of ['avatars', 'product-images', 'community-images', 'news-images', 'disease-images']) assert.deepEqual(b[id], [5242880, img], id);
    assert.deepEqual(b['post-images'], [10485760, img]);
    assert.deepEqual(b['post-videos'][1], ['video/mp4', 'video/mov', 'video/webm', 'video/quicktime']);
  });
});

describe('23 — numeric ranges', () => {
  test('meeting length 15–240 and buffer 0–120 minutes', async () => {
    const db = await setup();
    const set = (col, v) => db.query(`update public.experts set ${col} = $2 where id = $1`, [ids.expertRow, v]);
    for (const v of [15, 30, 60, 240]) await set('meeting_duration_minutes', v);
    for (const v of [-30, 0, 14, 241]) await rejects(set('meeting_duration_minutes', v), /experts_meeting_duration_range/);
    for (const v of [0, 10, 120]) await set('buffer_time_minutes', v);
    for (const v of [-1, 121]) await rejects(set('buffer_time_minutes', v), /experts_buffer_time_range/);
  });

  test('farm size, video length, meeting record length and refunds are never negative or absurd', async () => {
    const db = await setup();
    await db.query('insert into public.farmer_profiles (user_id, farm_size) values ($1, 2.5)', [ids.farmerA]);
    await rejects(db.query('update public.farmer_profiles set farm_size = -1 where user_id = $1', [ids.farmerA]), /farm_size_range/);
    await rejects(db.query('update public.farmer_profiles set farm_size = 10001 where user_id = $1', [ids.farmerA]), /farm_size_range/);
    const p = (await db.query(`insert into public.posts (user_id, caption, status) values ($1, 'v', 'Approved') returning id`, [ids.farmerA])).rows[0].id;
    await db.query('update public.posts set video_duration_seconds = 600 where id = $1', [p]);
    await rejects(db.query('update public.posts set video_duration_seconds = -5 where id = $1', [p]), /posts_video_duration_range/);
    await rejects(db.query('update public.posts set video_duration_seconds = 601 where id = $1', [p]), /posts_video_duration_range/);
  });

  test('product price ₹0.01–₹1,00,000 and stock 0–1,00,000 (lower bounds were already enforced)', async () => {
    const db = await setup();
    const cols = (await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name='products'`)).rows.map((r) => r.column_name);
    assert.ok(cols.includes('price') && cols.includes('stock'));
    const defs = (await db.query(`select conname, pg_get_constraintdef(oid) d from pg_constraint where conname in ('products_price_max','products_stock_max')`)).rows;
    assert.equal(defs.length, 2);
    assert.match(defs.find((r) => r.conname === 'products_price_max').d, /price <= \(?100000\)?/);
    assert.match(defs.find((r) => r.conname === 'products_stock_max').d, /stock <= \(?100000\)?/);
  });

  test('22 and 23 are re-runnable', async () => {
    const db = await setup();
    await applyProposed(db, '22');
    await applyProposed(db, '23');
    const n = (await db.query(`select count(*)::int n from pg_constraint where conname like '%\\_range' or conname like 'products\\_%\\_max' or conname = 'consultation_bookings_refund_amount_nonneg'`)).rows[0].n;
    assert.ok(n >= 8, `expected the 8 checks, found ${n}`);
  });
});
