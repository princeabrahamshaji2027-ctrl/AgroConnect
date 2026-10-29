#!/usr/bin/env node
// The 30 agriculture posts of "demo post s.pdf" (data/agroconnect_demo_posts.json) published through the normal post
// system: each post is inserted AS its demo author (normal RLS; the server sets the post's district from the author's
// profile), with the PDF's own title, description and image URL (the app shows external image URLs as they are).
// Authors are the designated demo accounts of seed-community.mjs (run that first). Assignment is deterministic and
// balanced: post n goes to district [Kannur, Pathanamthitta, Idukki, Kottayam][(n-1) % 4] → 8 / 8 / 7 / 7 posts, and
// inside a district to its demo accounts in turn. created_at = now − (n−1)·6 h at first insert, so post 01 is newest.
// Idempotent by (title, image_path): a re-run skips what exists and never deletes or edits anything.
//   node scripts/production/import-demo-posts.mjs --plan                                   offline: assignment table
//   node scripts/production/import-demo-posts.mjs --target production                      dry run (reads only)
//   CONFIRM_PRODUCTION_SEED=I-HAVE-APPROVAL node … --target production --execute           only after the owner approved
// Same env files and production guard as seed-feed.mjs; keys are read from the git-ignored env file and never printed.
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { SEED_TAG, accounts } from './seed-lib.mjs';

const args = process.argv.slice(2);
const ROOT = new URL('../../', import.meta.url);
const REFS = { staging: 'ahkgvuewgbjyahbiehrx', production: 'mgreapakfchcxcrauheq' };
const DISTRICTS = ['Kannur', 'Pathanamthitta', 'Idukki', 'Kottayam'];
const manifest = JSON.parse(readFileSync(new URL('data/agroconnect_demo_posts.json', ROOT), 'utf8'));
if (manifest.posts.length !== 30) fail(`manifest has ${manifest.posts.length} posts, expected 30`);

const byDistrict = Object.fromEntries(DISTRICTS.map((d) => [d, accounts().filter((a) => a.district === d)]));
const plan = manifest.posts.map((p) => {
  const n = p.source_index; const district = DISTRICTS[(n - 1) % 4];
  const pool = byDistrict[district]; const author = pool[Math.floor((n - 1) / 4) % pool.length];
  return { ...p, district, author };
});

if (args.includes('--plan')) {
  console.table(plan.map((p) => ({ n: p.source_index, district: p.district, author: p.author.name, role: p.author.role, title: p.title })));
  console.log(Object.fromEntries(DISTRICTS.map((d) => [d, plan.filter((p) => p.district === d).length])));
  process.exit(0);
}

const target = args.includes('--target') ? args[args.indexOf('--target') + 1] : 'staging';
const execute = args.includes('--execute');
if (!REFS[target]) fail('--target must be staging or production');
const env = loadEnv(target === 'production' ? '.env.production.local' : '.env.staging');
const P = target === 'production' ? 'PROD' : 'STAGING';
const url = env[`${P}_SUPABASE_URL`];
if (!url || !url.includes(REFS[target])) fail(`${P}_SUPABASE_URL is missing or does not point at the ${target} project`);
const serviceKey = env[`${P}_SUPABASE_SERVICE_ROLE_KEY`]; const anonKey = env[`${P}_SUPABASE_ANON_KEY`];
if (!serviceKey || !anonKey) fail(`${P}_SUPABASE_SERVICE_ROLE_KEY and ${P}_SUPABASE_ANON_KEY are required (read from the env file, never printed)`);
if (execute && target === 'production') await confirmProduction(REFS.production);

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const users = await listAllUsers();
const uidOf = (a) => users.find((u) => (u.email || '').toLowerCase() === a.email && u.user_metadata?.seed === SEED_TAG)?.id;
const sessions = new Map();
async function as(a) {
  if (sessions.has(a.email)) return sessions.get(a.email);
  const pw = randomBytes(32).toString('base64url');
  const up = await admin.auth.admin.updateUserById(uidOf(a), { password: pw });
  if (up.error) fail(`prepare ${a.email}: ${up.error.message}`);
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const si = await c.auth.signInWithPassword({ email: a.email, password: pw });
  if (si.error) fail(`sign-in ${a.email}: ${si.error.message}`);
  sessions.set(a.email, c);
  return c;
}

const rows = []; const start = Date.now();
for (const p of plan) {
  const uid = uidOf(p.author);
  const base = { n: p.source_index, district: p.district, author: p.author.name, title: p.title };
  if (!uid) { rows.push({ ...base, state: 'author missing — run seed-community.mjs first' }); continue; }
  const { data: found, error: fe } = await admin.from('posts').select('id, district').eq('title', p.title).eq('image_path', p.image_url).limit(1);
  if (fe) fail(`lookup ${p.title}: ${fe.message}`);
  if (found?.length) { rows.push({ ...base, state: 'exists — skipped', postDistrict: found[0].district }); continue; }
  if (!execute) { rows.push({ ...base, state: 'would publish' }); continue; }
  const c = await as(p.author);
  const ins = await c.from('posts').insert({ user_id: uid, title: p.title, caption: `${p.title}\n\n${p.description}`,
    category: p.category, location: p.author.location, status: 'Approved', image_path: p.image_url, media_type: 'image' })
    .select('id, district').single();
  if (ins.error) fail(`${p.title}: ${ins.error.message}`);
  const when = new Date(start - (p.source_index - 1) * 6 * 3600e3).toISOString();
  const dated = await admin.from('posts').update({ created_at: when }).eq('id', ins.data.id);
  if (dated.error) fail(`${p.title}: date ${dated.error.message}`);
  rows.push({ ...base, state: 'published', postDistrict: ins.data.district });
}
console.log(`Target: ${target} (${REFS[target]}) — ${execute ? 'EXECUTE' : 'dry run'}; source: ${manifest.source_pdf}`);
console.table(rows);
const count = (s) => rows.filter((r) => r.state.startsWith(s)).length;
console.log({ source: plan.length, wouldPublish: count('would'), published: count('published'), skippedExisting: count('exists'), authorMissing: count('author missing') });
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
