#!/usr/bin/env node
// Gives the STAGING test accounts the display names in tests/fixtures/staging-accounts.json (fictional people instead
// of the old numbered placeholder names). Each account signs in with its own password from .env.staging and updates its own
// profile name; its auth metadata is marked synthetic + fixture key so it stays identifiable. No service key needed.
// Refuses anything but the staging project. Dry run by default:
//   node scripts/staging/rename-fixtures.mjs            show old -> new
//   node scripts/staging/rename-fixtures.mjs --execute  write
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { NAMES } from '../../tests/fixtures/staging-accounts.mjs';

const STAGING_REF = 'ahkgvuewgbjyahbiehrx';
const env = Object.fromEntries(readFileSync(new URL('../../.env.staging', import.meta.url), 'utf8')
  .split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
if (!env.STAGING_SUPABASE_URL?.includes(STAGING_REF)) throw new Error('Refusing to run: STAGING_SUPABASE_URL is not the staging project.');
const execute = process.argv.includes('--execute');
const fx = (key) => `agroconnect-stg-${key}-${env.FIXTURE_EMAIL_TOKEN}@${env.FIXTURE_EMAIL_DOMAIN}`;

for (const [key, name] of Object.entries(NAMES)) {
  const c = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const password = key === 'admin' ? env.E2E_ADMIN_PASSWORD : env.FIXTURE_PASSWORD;
  const { data, error } = await c.auth.signInWithPassword({ email: fx(key), password });
  if (error) { console.log(`${key.padEnd(8)} SKIP: cannot sign in (${error.message})`); continue; }
  const uid = data.user.id;
  const { data: prof } = await c.from('profiles').select('full_name').eq('id', uid).single();
  const before = prof?.full_name ?? '(no profile)';
  if (before === name && data.user.user_metadata?.fixture === key) { console.log(`${key.padEnd(8)} ok: ${name}`); continue; }
  console.log(`${key.padEnd(8)} ${before} -> ${name}${execute ? '' : '   (dry run)'}`);
  if (!execute) continue;
  const up = await c.from('profiles').update({ full_name: name }).eq('id', uid);
  if (up.error) throw new Error(`${key}: ${up.error.message}`);
  const meta = await c.auth.updateUser({ data: { full_name: name, synthetic: true, fixture: key } });
  if (meta.error) throw new Error(`${key} metadata: ${meta.error.message}`);
  await c.auth.signOut({ scope: 'local' });
}
