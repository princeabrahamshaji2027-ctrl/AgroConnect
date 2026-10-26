#!/usr/bin/env node
// Initial community accounts for the AgroConnect launch. Idempotent (stable e-mail per profile), with a dry run.
//
//   node scripts/production/seed-community.mjs --plan                         offline: what would be created
//   node scripts/production/seed-community.mjs --target staging               dry run against staging (default)
//   node scripts/production/seed-community.mjs --target production            dry run against production
//   CONFIRM_PRODUCTION_SEED=I-HAVE-APPROVAL node … --target production --execute   (asks you to type the project ref)   only after the owner approved the dry run
//
// Needs (never committed, never printed): .env.staging or .env.production.local with
//   <PREFIX>_SUPABASE_URL, <PREFIX>_SUPABASE_ANON_KEY, <PREFIX>_SUPABASE_SERVICE_ROLE_KEY,
//   <PREFIX>_ADMIN_EMAIL, <PREFIX>_ADMIN_PASSWORD   (PREFIX = STAGING or PROD; the admin approves the expert applications)
// Accounts are created only through the Supabase Admin API; the sign-up trigger creates their profiles. Each synthetic
// account gets a random password that is never stored or shown; to act as it, the script sets a fresh random one.
// Synthetic experts get NO availability slots: nobody can book (or pay for) a consultation with a demo profile.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { SEED_TAG, accounts, plan, EXPERTS } from './seed-lib.mjs';

const args = process.argv.slice(2);
const ROOT = new URL('../../', import.meta.url);
const REFS = { staging: 'ahkgvuewgbjyahbiehrx', production: 'mgreapakfchcxcrauheq' };

if (args.includes('--plan')) {
  const p = plan([]);
  console.log(`Plan (offline): ${p.toCreate.length} synthetic accounts — ${p.toCreate.filter((a) => a.role === 'Expert').length} experts, ${p.toCreate.filter((a) => a.role === 'Farmer').length} farmers`);
  for (const a of accounts()) console.log(`  ${a.role.padEnd(6)} ${a.district.padEnd(14)} ${a.name.padEnd(22)} ${a.email}`);
  writeManifest();
  process.exit(0);
}

const target = args.includes('--target') ? args[args.indexOf('--target') + 1] : 'staging';
const execute = args.includes('--execute');
if (!REFS[target]) fail(`--target must be staging or production (got ${target})`);
const env = loadEnv(target === 'production' ? '.env.production.local' : '.env.staging');
const P = target === 'production' ? 'PROD' : 'STAGING';
const url = env[`${P}_SUPABASE_URL`] || (target === 'staging' ? env.STAGING_SUPABASE_URL : undefined);
if (!url || !url.includes(REFS[target])) fail(`${P}_SUPABASE_URL is missing or does not point at the ${target} project`);
const serviceKey = env[`${P}_SUPABASE_SERVICE_ROLE_KEY`];
const anonKey = env[`${P}_SUPABASE_ANON_KEY`] || (target === 'staging' ? env.STAGING_SUPABASE_ANON_KEY : undefined);
if (!serviceKey || !anonKey) fail(`${P}_SUPABASE_SERVICE_ROLE_KEY and ${P}_SUPABASE_ANON_KEY are required (read from the env file, never printed)`);
if (execute && target === 'production') await confirmProduction(REFS.production);

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const client = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

const users = await listAllUsers();
const { data: profiles, error: pErr } = await admin.from('profiles').select('id, full_name, role, district');
if (pErr) fail(`profiles: ${pErr.message}`);
const profileById = new Map(profiles.map((p) => [p.id, p]));
const existing = users.map((u) => ({ id: u.id, email: u.email, synthetic: u.user_metadata?.seed === SEED_TAG,
  full_name: profileById.get(u.id)?.full_name, role: profileById.get(u.id)?.role, district: profileById.get(u.id)?.district }));
const p = plan(existing);

console.log(`Target: ${target} (${REFS[target]}) — ${execute ? 'EXECUTE' : 'dry run'}`);
console.log(`Existing accounts: ${existing.length} (retained, not synthetic: ${p.retainedCount}); already seeded: ${p.alreadySeeded.length}`);
console.log(`To create: ${p.toCreate.length} (${p.toCreate.filter((a) => a.role === 'Expert').length} experts, ${p.toCreate.filter((a) => a.role === 'Farmer').length} farmers)`);
if (p.nameClashes.length) console.log(`Name already used by another account (review): ${p.nameClashes.join(', ')}`);
console.log(`Final total: ${p.finalCount} (target ≈ ${p.target})`);
console.table(p.totals);
const admins = existing.filter((u) => u.role === 'Admin').length;
if (admins !== 2) console.log(`NOTE: ${admins} admin accounts exist (plan expects exactly 2; this script never creates admins).`);
if (!execute) { console.log('Dry run only — nothing was written.'); process.exit(0); }

// ── execute ──────────────────────────────────────────────────────────────────────────────────────────────────────
const adminEmail = env[`${P}_ADMIN_EMAIL`] || (target === 'staging' ? env.E2E_ADMIN_EMAIL : undefined);
const adminPassword = env[`${P}_ADMIN_PASSWORD`] || (target === 'staging' ? env.E2E_ADMIN_PASSWORD : undefined);
const adminSession = client();
{
  const { error } = await adminSession.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  if (error) fail(`admin sign-in failed: ${error.message}`);
}
for (const a of accounts()) {
  let user = users.find((u) => (u.email || '').toLowerCase() === a.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: a.email, password: randomBytes(32).toString('base64url'), email_confirm: true,
      user_metadata: { full_name: a.name, district: a.district, location: a.location, seed: SEED_TAG, synthetic: true },
    });
    if (error) fail(`create ${a.email}: ${error.message}`);
    user = data.user;
    console.log(`  created ${a.role} ${a.name} (${a.district})`);
  } else if (user.user_metadata?.seed !== SEED_TAG) {
    console.log(`  SKIP ${a.email}: exists but is not a seed account`); continue;
  }
  const me = await actAs(user.id, a.email);
  if (a.bio) await must(me.from('profiles').update({ bio: a.bio, location: a.location }).eq('id', user.id), `profile ${a.email}`);
  if (a.role !== 'Expert') continue;
  const { data: ex } = await admin.from('experts').select('id, is_active').eq('user_id', user.id).maybeSingle();
  if (!ex || ex.is_active === false) {
    const { data: open } = await admin.from('expert_applications').select('id, status').eq('user_id', user.id).eq('status', 'Pending').maybeSingle();
    let appId = open?.id;
    if (!appId) {
      const ins = await must(me.from('expert_applications').insert({ user_id: user.id, qualification: 'Agricultural specialist',
        experience: `${a.specialization}. (AgroConnect community demo profile)`, status: 'Pending' }).select('id').single(), `apply ${a.email}`);
      appId = ins.data.id;
    }
    await must(adminSession.rpc('approve_expert_application', { p_application_id: appId }), `approve ${a.email}`);
  }
  const expert = EXPERTS.find((e) => e.name === a.name);
  await must(me.rpc('set_consultation_fee', { p_fee_paise: expert.feePaise }), `fee ${a.email}`);
  await must(me.from('experts').update({ specialization: expert.specialization }).eq('user_id', user.id), `specialization ${a.email}`);
  console.log(`  expert ready: ${a.name} — no availability slots (not bookable)`);
}
console.log('Done. Re-run without --execute to verify totals.');

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────
async function actAs(userId, email) {
  const pw = randomBytes(32).toString('base64url');   // fresh, in memory only
  const { error } = await admin.auth.admin.updateUserById(userId, { password: pw });
  if (error) fail(`prepare ${email}: ${error.message}`);
  const c = client();
  const r = await c.auth.signInWithPassword({ email, password: pw });
  if (r.error) fail(`sign-in ${email}: ${r.error.message}`);
  return c;
}
async function listAllUsers() {
  const out = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`listUsers: ${error.message}`);
    out.push(...data.users);
    if (data.users.length < 200) return out;
  }
}
async function must(promise, what) {
  const r = await promise;
  if (r.error) fail(`${what}: ${r.error.message}`);
  return r;
}
function loadEnv(file) {
  const path = new URL(file, ROOT);
  if (!existsSync(path)) fail(`${file} not found (ask the owner for the values; it is git-ignored)`);
  return Object.fromEntries(readFileSync(path, 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
}
function writeManifest() {
  const dir = new URL('seed/manifests/', ROOT);
  mkdirSync(dir, { recursive: true });
  const rows = accounts().map(({ name, role, district, slug, email, location }) => ({ name, role, district, slug, email, location, synthetic: true }));
  writeFileSync(new URL(`${SEED_TAG}.json`, dir), `${JSON.stringify({ seed: SEED_TAG, note: 'Synthetic demo profiles for the launch community. Not real people. Experts publish no availability.', accounts: rows }, null, 2)}\n`);
  console.log(`manifest written: seed/manifests/${SEED_TAG}.json`);
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
