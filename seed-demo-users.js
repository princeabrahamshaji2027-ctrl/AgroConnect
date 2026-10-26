// Demo user seed script — run once with: node seed-demo-users.js
// Uses the Supabase Management API to create users server-side (bypasses email confirmation)

const SUPABASE_URL = 'https://mgreapakfchcxcrauheq.supabase.co';
// RETIRED (2026-10-26): this one-time script wrote demo accounts straight into PRODUCTION. Those accounts exist; the
// launch community is created by scripts/production/seed-community.mjs (dry run + approval). It never runs now.
console.error('Refusing to run: seed-demo-users.js is retired. Use scripts/production/seed-community.mjs.');
process.exit(1);
// The service role key is needed ONLY in this one-time admin seed script, never in frontend code
// Get it from: Supabase Dashboard → Settings → API → service_role key
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: Set SUPABASE_SERVICE_ROLE_KEY env var before running this script.');
  process.exit(1);
}

import { createClient } from '@supabase/supabase-js';
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const DEMO_USERS = [
  {
    email: 'prince@agroconnect.com',
    password: process.env.DEMO_ADMIN_PASSWORD,
    fullName: 'Prince Abraham',
    role: 'Admin',
  },
  {
    email: 'user1@agroconnect.com',
    password: process.env.DEMO_USER1_PASSWORD,
    fullName: 'Ravi Kumar',
    role: 'Farmer',
  },
  {
    email: 'user2@agroconnect.com',
    password: process.env.DEMO_USER2_PASSWORD,
    fullName: 'Amita Singh',
    role: 'Farmer',
  },
];

const missing = DEMO_USERS.filter(u => !u.password).map(u => u.email);
if (missing.length) {
  console.error(`ERROR: Set DEMO_ADMIN_PASSWORD, DEMO_USER1_PASSWORD and DEMO_USER2_PASSWORD env vars (missing for: ${missing.join(', ')}).`);
  process.exit(1);
}

async function seed() {
  for (const u of DEMO_USERS) {
    console.log(`\nProcessing ${u.email}...`);

    // Check if user already exists
    const { data: existing } = await adminClient.auth.admin.listUsers();
    const found = existing?.users?.find(usr => usr.email === u.email);

    let userId;
    if (found) {
      console.log(`  → Already exists (${found.id}), updating password...`);
      await adminClient.auth.admin.updateUserById(found.id, { password: u.password });
      userId = found.id;
    } else {
      const { data, error } = await adminClient.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { full_name: u.fullName }
      });
      if (error) { console.error(`  ERROR creating user:`, error.message); continue; }
      userId = data.user.id;
      console.log(`  → Created (${userId})`);
    }

    // Upsert profile
    const { error: profileErr } = await adminClient
      .from('profiles')
      .upsert({
        id: userId,
        full_name: u.fullName,
        role: u.role,
        bio: u.role === 'Admin' ? 'AgroConnect Administrator' : `Demo ${u.role} account`,
        location: 'Punjab, India',
      }, { onConflict: 'id' });

    if (profileErr) console.error(`  ERROR upserting profile:`, profileErr.message);
    else console.log(`  → Profile upserted (role: ${u.role})`);
  }

  console.log('\n✅ Seed complete. Demo users ready.');
}

seed().catch(console.error);
