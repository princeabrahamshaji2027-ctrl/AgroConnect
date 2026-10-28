#!/usr/bin/env node
// Demo feed: the 48 posts of feed-content.mjs with their licensed photos/videos (seed/media/manifest.json), plus likes
// and comments from other demo accounts. Each post is uploaded and inserted AS its synthetic author (normal RLS; the
// server sets the district), then its created_at is spread over the last 45 days with the service role. Idempotent by
// (author, title). Needs the 50 accounts of seed-community.mjs. Same env files and production guard as that script.
//   node scripts/production/seed-feed.mjs --plan                                     offline: posts, media, districts
//   node scripts/production/seed-feed.mjs --target staging                           dry run
//   node scripts/production/seed-feed.mjs --target staging --execute
//   CONFIRM_PRODUCTION_SEED=I-HAVE-APPROVAL node … --target production --execute     only after the owner approved
// Each author is signed in once per run with a fresh in-memory password, and only when something must be written —
// so the demo logins in private/demo-credentials.txt are only replaced if that account has to post or comment.
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { SEED_TAG, accounts } from './seed-lib.mjs';
import { FEED, captionWithCredit, daysAgo } from './feed-content.mjs';

const args = process.argv.slice(2);
const ROOT = new URL('../../', import.meta.url);
const REFS = { staging: 'ahkgvuewgbjyahbiehrx', production: 'mgreapakfchcxcrauheq' };
const byName = new Map(accounts().map((a) => [a.name, a]));
const media = JSON.parse(readFileSync(new URL('seed/media/manifest.json', ROOT), 'utf8'));
const mediaBySlug = new Map(media.map((m) => [m.slug, m]));

if (args.includes('--plan')) {
  console.table(FEED.map((p, i) => ({ author: p.author, district: byName.get(p.author)?.district, category: p.category,
    media: p.media ? `${mediaBySlug.get(p.media)?.kind} ${p.media}` : 'text', comments: p.comments.length, daysAgo: daysAgo(i), title: p.title })));
  process.exit(0);
}

const target = args.includes('--target') ? args[args.indexOf('--target') + 1] : 'staging';
const execute = args.includes('--execute');
if (!REFS[target]) fail('--target must be staging or production');
const env = loadEnv(target === 'production' ? '.env.production.local' : '.env.staging');
const P = target === 'production' ? 'PROD' : 'STAGING';
const url = env[`${P}_SUPABASE_URL`] || (target === 'staging' ? env.STAGING_SUPABASE_URL : undefined);
if (!url || !url.includes(REFS[target])) fail(`${P}_SUPABASE_URL is missing or does not point at the ${target} project`);
const serviceKey = env[`${P}_SUPABASE_SERVICE_ROLE_KEY`];
const anonKey = env[`${P}_SUPABASE_ANON_KEY`] || (target === 'staging' ? env.STAGING_SUPABASE_ANON_KEY : undefined);
if (!serviceKey || !anonKey) fail(`${P}_SUPABASE_SERVICE_ROLE_KEY and ${P}_SUPABASE_ANON_KEY are required (read from the env file, never printed)`);
if (execute && target === 'production') await confirmProduction(REFS.production);

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const users = await listAllUsers();
const uidOf = (name) => users.find((u) => (u.email || '').toLowerCase() === byName.get(name)?.email && u.user_metadata?.seed === SEED_TAG)?.id;
const sessions = new Map();
async function as(name) {
  if (sessions.has(name)) return sessions.get(name);
  const a = byName.get(name); const pw = randomBytes(32).toString('base64url');
  const up = await admin.auth.admin.updateUserById(uidOf(name), { password: pw });
  if (up.error) fail(`prepare ${a.email}: ${up.error.message}`);
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const si = await c.auth.signInWithPassword({ email: a.email, password: pw });
  if (si.error) fail(`sign-in ${a.email}: ${si.error.message}`);
  sessions.set(name, c);
  return c;
}

const rows = [];
for (const [i, p] of FEED.entries()) {
  const a = byName.get(p.author); const uid = uidOf(p.author);
  if (!uid) { rows.push({ author: p.author, title: p.title, state: 'author missing — run seed-community first' }); continue; }
  const caption = captionWithCredit(p, mediaBySlug);
  const { data: found } = await admin.from('posts').select('id').eq('user_id', uid).like('caption', `${p.title}\n\n%`).limit(1);
  let postId = found?.[0]?.id;
  if (!postId && !execute) { rows.push({ author: p.author, district: a.district, title: p.title, state: 'would publish' }); continue; }
  if (!postId) {
    const c = await as(p.author);
    const m = p.media ? mediaBySlug.get(p.media) : null;
    let imagePath = null;
    if (m) {
      const bucket = m.kind === 'video' ? 'post-videos' : 'post-images';
      const path = `${uid}/feed-${m.slug}.${m.kind === 'video' ? 'mp4' : 'jpg'}`;
      const up = await c.storage.from(bucket).upload(path, readFileSync(new URL(m.file, ROOT)),
        { upsert: true, contentType: m.kind === 'video' ? 'video/mp4' : 'image/jpeg' });
      if (up.error) fail(`${p.title}: upload ${up.error.message}`);
      imagePath = c.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    }
    const ins = await c.from('posts').insert({ user_id: uid, caption, category: p.category, location: a.location, status: 'Approved',
      image_path: imagePath, media_type: m?.kind === 'video' ? 'video' : 'image', video_duration_seconds: m?.kind === 'video' ? m.duration : null })
      .select('id').single();
    if (ins.error) fail(`${p.title}: ${ins.error.message}`);
    postId = ins.data.id;
    const when = new Date(Date.now() - daysAgo(i) * 864e5 - (i % 10) * 3600e3).toISOString();
    const dated = await admin.from('posts').update({ created_at: when }).eq('id', postId);
    if (dated.error) fail(`${p.title}: date ${dated.error.message}`);
  }
  // likes: 2–8 neighbours from the same district (deterministic), comments as written in feed-content.mjs
  const neighbours = accounts().filter((x) => x.district === a.district && x.name !== p.author);
  const likers = neighbours.filter((_, k) => (k * 31 + i * 17) % 5 < 2).slice(0, 2 + (i % 7));
  let liked = 0; let commented = 0;
  for (const l of likers) {
    const luid = uidOf(l.name); if (!luid) continue;
    const { data: has } = await admin.from('likes').select('id').eq('post_id', postId).eq('user_id', luid).limit(1);
    if (has?.length) continue;
    if (!execute) { liked++; continue; }
    const r = await (await as(l.name)).from('likes').insert({ post_id: postId, user_id: luid });
    if (r.error && r.error.code !== '23505') fail(`like ${p.title}: ${r.error.message}`);
    liked++;
  }
  for (const cm of p.comments) {
    const cuid = uidOf(cm.author); if (!cuid) continue;
    const { data: has } = await admin.from('comments').select('id').eq('post_id', postId).eq('user_id', cuid).eq('comment', cm.text).limit(1);
    if (has?.length) continue;
    if (!execute) { commented++; continue; }
    const r = await (await as(cm.author)).from('comments').insert({ post_id: postId, user_id: cuid, comment: cm.text });
    if (r.error) fail(`comment ${p.title}: ${r.error.message}`);
    commented++;
  }
  rows.push({ author: p.author, district: a.district, title: p.title, state: found?.length ? 'exists' : 'published', newLikes: liked, newComments: commented });
}
console.log(`Target: ${target} (${REFS[target]}) — ${execute ? 'EXECUTE' : 'dry run'}`);
console.table(rows);
if (!execute) console.log('Dry run only — nothing was written.');

async function listAllUsers() {
  const out = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`listUsers: ${error.message}`);
    out.push(...data.users);
    if (data.users.length < 200) return out;
  }
}
function loadEnv(file) {
  const path = new URL(file, ROOT);
  if (!existsSync(path)) fail(`${file} not found (ask the owner for the values; it is git-ignored)`);
  return Object.fromEntries(readFileSync(path, 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
}
async function confirmProduction(ref) {
  if (process.env.CONFIRM_PRODUCTION_SEED !== 'I-HAVE-APPROVAL') fail('Production --execute needs CONFIRM_PRODUCTION_SEED=I-HAVE-APPROVAL (owner approval of the dry run).');
  if (!process.stdin.isTTY) fail('Production --execute must be run interactively in a terminal.');
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await rl.question(`Type the production project ref (${ref.length} characters) to write to PRODUCTION: `)).trim();
  rl.close();
  if (typed !== ref) fail('Confirmation did not match. Nothing was written.');
}
function fail(msg) { console.error(`ERROR: ${msg}`); process.exit(1); }
