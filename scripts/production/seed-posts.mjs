#!/usr/bin/env node
// Five starter community posts (text only), each inserted AS its synthetic author so normal RLS applies and the
// server sets the post's district from the author. Idempotent: a post whose caption already exists for that author
// is skipped. Same guards and env files as seed-community.mjs.
//   node scripts/production/seed-posts.mjs --plan
//   node scripts/production/seed-posts.mjs --target staging|production            dry run
//   CONFIRM_PRODUCTION_SEED=I-HAVE-APPROVAL node … --target production --execute   (asks you to type the project ref)
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { SEED_TAG, POSTS, accounts, captionOf } from './seed-lib.mjs';

const args = process.argv.slice(2);
const ROOT = new URL('../../', import.meta.url);
const REFS = { staging: 'ahkgvuewgbjyahbiehrx', production: 'mgreapakfchcxcrauheq' };
const byName = new Map(accounts().map((a) => [a.name, a]));

if (args.includes('--plan')) {
  console.table(POSTS.map((p) => ({ author: p.author, district: byName.get(p.author).district, category: p.category, title: p.title, status: 'Approved' })));
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
if (!serviceKey || !anonKey) fail(`${P}_SUPABASE_SERVICE_ROLE_KEY and ${P}_SUPABASE_ANON_KEY are required`);
if (execute && target === 'production') await confirmProduction(REFS.production);

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const users = [];
for (let page = 1; ; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) fail(error.message);
  users.push(...data.users);
  if (data.users.length < 200) break;
}
const rows = [];
for (const p of POSTS) {
  const a = byName.get(p.author);
  const u = users.find((x) => (x.email || '').toLowerCase() === a.email && x.user_metadata?.seed === SEED_TAG);
  if (!u) { rows.push({ author: p.author, district: a.district, title: p.title, state: 'author missing — run seed-community first' }); continue; }
  const { data: found } = await admin.from('posts').select('id').eq('user_id', u.id).eq('caption', captionOf(p)).limit(1);
  if (found?.length) { rows.push({ author: p.author, district: a.district, title: p.title, state: 'exists' }); continue; }
  if (!execute) { rows.push({ author: p.author, district: a.district, title: p.title, state: 'would publish' }); continue; }
  const pw = randomBytes(32).toString('base64url');
  const up = await admin.auth.admin.updateUserById(u.id, { password: pw });
  if (up.error) fail(up.error.message);
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const si = await c.auth.signInWithPassword({ email: a.email, password: pw });
  if (si.error) fail(si.error.message);
  const ins = await c.from('posts').insert({ user_id: u.id, caption: captionOf(p), category: p.category, location: a.location,
    media_type: 'image', status: 'Approved' }).select('id, district').single();
  if (ins.error) fail(`${p.title}: ${ins.error.message}`);
  rows.push({ author: p.author, district: ins.data.district, title: p.title, state: 'published' });
}
console.log(`Target: ${target} — ${execute ? 'EXECUTE' : 'dry run'}`);
console.table(rows);

function loadEnv(file) {
  const path = new URL(file, ROOT);
  if (!existsSync(path)) fail(`${file} not found`);
  return Object.fromEntries(readFileSync(path, 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
}
// Production --execute: approval token AND an interactive confirmation (type the project ref) — never from a pipe/CI.
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
