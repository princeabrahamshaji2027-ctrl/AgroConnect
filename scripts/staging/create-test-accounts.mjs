// Creates the synthetic agroconnect-stg-*-<token>@<FIXTURE_EMAIL_DOMAIN> test accounts on the STAGING project through the normal public signup API
// (the same call Register.jsx makes). Reads .env.staging; never prints passwords. Refuses to target production.
//   node scripts/staging/create-test-accounts.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { NAMES } from '../../tests/fixtures/staging-accounts.mjs';

const env = Object.fromEntries(readFileSync(new URL('../../.env.staging', import.meta.url), 'utf8')
  .split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));

const STAGING_REF = 'ahkgvuewgbjyahbiehrx';
if (!env.STAGING_SUPABASE_URL?.includes(STAGING_REF)) {
  throw new Error('Refusing to run: STAGING_SUPABASE_URL is not the staging project.');
}

// Supabase Auth rejects reserved domains such as .local; set FIXTURE_EMAIL_DOMAIN in .env.staging to a domain
// Auth accepts (06_repair_test_fixtures.sql and the staging tests must use the same addresses).
const domain = env.FIXTURE_EMAIL_DOMAIN;
const token = env.FIXTURE_EMAIL_TOKEN;
if (!domain || !token || !env.FIXTURE_PASSWORD || !env.E2E_ADMIN_PASSWORD) throw new Error('.env.staging is incomplete');
// Unique, non-guessable local parts so a public domain (e.g. gmail.com) never points at a real person's address.
const fx = (name) => `agroconnect-stg-${name}-${token}@${domain}`;

const ACCOUNTS = [
  [fx('user1'), NAMES.user1, env.FIXTURE_PASSWORD],
  [fx('user2'), NAMES.user2, env.FIXTURE_PASSWORD],
  [fx('user3'), NAMES.user3, env.FIXTURE_PASSWORD],
  [fx('user4'), NAMES.user4, env.FIXTURE_PASSWORD],
  [fx('expert1'), NAMES.expert1, env.FIXTURE_PASSWORD],
  [fx('admin'), NAMES.admin, env.E2E_ADMIN_PASSWORD],
];

const emails = ACCOUNTS.map(([e]) => e);
if (new Set(emails.map((e) => e.toLowerCase())).size !== emails.length) throw new Error('duplicate test email addresses');
if (process.argv.includes('--dry-run')) {
  console.log(`dry run (no network calls). project: ${STAGING_REF}`);
  for (const e of emails) console.log(`  ${e}`);
  process.exit(0);
}

for (const [email, fullName, password] of ACCOUNTS) {
  const c = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  // role metadata deliberately included: after 01 the server must ignore it
  const { data, error } = await c.auth.signUp({ email, password, options: { data: { full_name: fullName, role: 'Admin' } } });
  if (error) {
    // Stop at the first rejection or rate limit: no retries, no further addresses.
    console.log(`${email}: signup ERROR status=${error.status ?? ''} code=${error.code ?? ''} message=${error.message}`);
    console.log('Stopped.');
    process.exit(1);
  }
  const confirmed = Boolean(data.user?.email_confirmed_at || data.session);
  console.log(`${email}: created=${Boolean(data.user)} session=${Boolean(data.session)} confirmed=${confirmed}`);
}
