// Post media on STAGING: upload -> post row -> what other users (and strangers) can read, with synthetic files from
// tests/fixtures/media. Creates its own posts/files and removes them at the end.
//   node --test tests/e2e/staging-media.test.mjs
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
const client = () => createClient(URL_, env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function signIn(name) {
  const c = client();
  const { data, error } = await c.auth.signInWithPassword({ email: fx(name), password: name === 'admin' ? env.E2E_ADMIN_PASSWORD : env.FIXTURE_PASSWORD });
  if (error) throw new Error(`sign-in ${name}: ${error.message}`);
  return { c, uid: data.user.id };
}
const png = readFileSync(new URL('../fixtures/media/sample.png', import.meta.url));
const webm = readFileSync(new URL('../fixtures/media/sample.webm', import.meta.url));

const A = {};
const created = { posts: [], files: [] }; // { c, bucket, name }

// Same steps as CreatePost.jsx: upload to <uid>/<ts>.<ext>, store the public URL and media type on the post.
async function publish(who, { body, type, bucket, ext, caption }) {
  let image_path = null;
  let media_type = 'image';
  if (body) {
    const name = `${who.uid}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const up = await who.c.storage.from(bucket).upload(name, body, { contentType: type, upsert: false });
    assert.ifError(up.error);
    created.files.push({ c: who.c, bucket, name });
    image_path = who.c.storage.from(bucket).getPublicUrl(name).data.publicUrl;
    media_type = type.startsWith('video/') ? 'video' : 'image';
  }
  const { data, error } = await who.c.from('posts')
    .insert({ user_id: who.uid, caption, image_path, media_type, status: 'Approved' }).select('id').single();
  assert.ifError(error);
  created.posts.push({ c: who.c, id: data.id });
  return data.id;
}

before(async () => {
  if (skip) return;
  for (const n of ['user1', 'user2', 'expert1']) A[n] = await signIn(n);
});

after(async () => {
  for (const p of created.posts) await p.c.from('posts').delete().eq('id', p.id);
  for (const f of created.files) await f.c.storage.from(f.bucket).remove([f.name]);
});

describe('post media (staging)', { skip }, () => {
  test('farmer image, expert video and text-only posts: stored with the right type and readable by another user', async () => {
    const img = await publish(A.user1, { body: png, type: 'image/png', bucket: 'post-images', ext: 'png', caption: 'Media test: farmer image' });
    const vid = await publish(A.expert1, { body: webm, type: 'video/webm', bucket: 'post-videos', ext: 'webm', caption: 'Media test: expert video' });
    const txt = await publish(A.user1, { caption: 'Media test: text only' });

    // what the feed query returns to another user (user2), same select as Feed.jsx
    const { data, error } = await A.user2.c.from('posts').select('id, caption, image_path, media_type')
      .in('id', [img, vid, txt]).eq('status', 'Approved');
    assert.ifError(error);
    const byId = Object.fromEntries(data.map((p) => [p.id, p]));
    assert.equal(byId[img].media_type, 'image');
    assert.equal(byId[vid].media_type, 'video');
    assert.equal(byId[txt].image_path, null);

    // the stored URLs really serve the files, with a content type the <img>/<video> elements can use
    for (const [id, want, bytes] of [[img, 'image/png', png.length], [vid, 'video/webm', webm.length]]) {
      const res = await fetch(byId[id].image_path);
      assert.equal(res.status, 200, `media of ${byId[id].caption} not served`);
      assert.equal(res.headers.get('content-type'), want);
      assert.equal((await res.arrayBuffer()).byteLength, bytes);
    }
  });

  test('nobody can list other people\'s media; the owner can; strangers cannot write or delete it', async () => {
    const name = `${A.user1.uid}/${Date.now()}-list.png`;
    assert.ifError((await A.user1.c.storage.from('post-images').upload(name, png, { contentType: 'image/png' })).error);
    created.files.push({ c: A.user1.c, bucket: 'post-images', name });

    const anon = client();
    for (const bucket of ['post-images', 'post-videos', 'avatars']) {
      const { data } = await anon.storage.from(bucket).list('', { limit: 100 });
      assert.equal((data || []).length, 0, `anonymous listing of ${bucket}`);
    }
    const other = await A.user2.c.storage.from('post-images').list(A.user1.uid, { limit: 100 });
    assert.equal((other.data || []).length, 0, 'another user listed user1 files');
    const own = await A.user1.c.storage.from('post-images').list(A.user1.uid, { limit: 100 });
    assert.ok((own.data || []).some((f) => name.endsWith(f.name)), 'owner cannot list own files');

    const intrude = await A.user2.c.storage.from('post-images').upload(`${A.user1.uid}/intruder.png`, png, { contentType: 'image/png' });
    assert.ok(intrude.error, 'user2 wrote into user1 folder');
    const del = await A.user2.c.storage.from('post-images').remove([name]);
    assert.equal((del.data || []).length, 0, 'user2 deleted user1 file');
    assert.equal((await fetch(A.user1.c.storage.from('post-images').getPublicUrl(name).data.publicUrl)).status, 200, 'file gone');
  });

  test('video bucket rejects non-video files; owner can delete their own video (cleanup after a failed post)', async () => {
    const bad = await A.expert1.c.storage.from('post-videos').upload(`${A.expert1.uid}/${Date.now()}-photo.mp4`, png, { contentType: 'image/png' });
    assert.ok(bad.error, 'image accepted into post-videos');
    const name = `${A.expert1.uid}/${Date.now()}-cleanup.webm`;
    assert.ifError((await A.expert1.c.storage.from('post-videos').upload(name, webm, { contentType: 'video/webm' })).error);
    const rm = await A.expert1.c.storage.from('post-videos').remove([name]);
    assert.ifError(rm.error);
    assert.equal(rm.data.length, 1, 'owner could not delete own video');
    const gone = await fetch(A.expert1.c.storage.from('post-videos').getPublicUrl(name).data.publicUrl);
    assert.ok(gone.status >= 400, `deleted video still served (${gone.status})`);
  });
});
