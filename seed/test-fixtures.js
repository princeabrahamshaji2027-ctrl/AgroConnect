// Fixed-state test accounts for manual/automated testing (STAGING ONLY).
//   npm run seed:fixtures          create/repair the five accounts
//   npm run seed:fixtures:reset    same, and wipe their applications/experts rows first
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and FIXTURE_PASSWORD in .env (never committed).
// Mirrors supabase/proposed/06_repair_test_fixtures.sql. The old version never created the `experts` row for
// expert1, which is why the expert Catch Up view did not appear (AUD-015).
import { supabaseAdmin, assertNotProduction } from './lib/supabaseAdmin.js';

assertNotProduction('seed/test-fixtures.js');

const FIXTURES = [
  { email: 'user1@agroconnect.local', fullName: 'Test User 1 (Farmer)', expertStatus: null },
  { email: 'user2@agroconnect.local', fullName: 'Test User 2 (Pending Expert)', expertStatus: 'Pending' },
  { email: 'expert1@agroconnect.local', fullName: 'Dr. Ramesh Expert', expertStatus: 'Approved', specialization: 'Soil & Agronomy' },
  { email: 'user3@agroconnect.local', fullName: 'Test User 3 (Fresh Farmer)', expertStatus: null },
  { email: 'user4@agroconnect.local', fullName: 'Test User 4 (Rejected Expert)', expertStatus: 'Rejected' },
];

const PRODUCTION_REF = 'mgreapakfchcxcrauheq';

function must(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function findUserByEmail(email) {
  for (let page = 1; page < 50; page++) {
    const { users } = must(await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 }), 'listUsers');
    const hit = users.find((u) => u.email === email);
    if (hit || users.length < 200) return hit || null;
  }
  return null;
}

export async function seedFixtures(reset = false) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.FIXTURE_PASSWORD) {
    throw new Error('Set SUPABASE_SERVICE_ROLE_KEY and FIXTURE_PASSWORD (in .env) before seeding fixtures.');
  }
  if ((process.env.SUPABASE_URL || '').includes(PRODUCTION_REF) && process.env.ALLOW_PRODUCTION_FIXTURES !== 'yes') {
    throw new Error('Refusing to seed fixtures into the production project. Point SUPABASE_URL at staging '
      + '(or set ALLOW_PRODUCTION_FIXTURES=yes if the owner has approved it).');
  }

  for (const fix of FIXTURES) {
    let user = await findUserByEmail(fix.email);
    if (!user) {
      user = must(await supabaseAdmin.auth.admin.createUser({
        email: fix.email, password: process.env.FIXTURE_PASSWORD, email_confirm: true,
        user_metadata: { full_name: fix.fullName },
      }), `create ${fix.email}`).user;
    } else {
      must(await supabaseAdmin.auth.admin.updateUserById(user.id, { password: process.env.FIXTURE_PASSWORD }), `password ${fix.email}`);
    }
    const isExpert = fix.expertStatus === 'Approved';

    if (reset) {
      must(await supabaseAdmin.from('expert_applications').delete().eq('user_id', user.id), 'reset applications');
    }
    if (!isExpert) {
      // cascades to this fixture's slots/bookings
      must(await supabaseAdmin.from('experts').delete().eq('user_id', user.id), 'remove experts row');
    }

    must(await supabaseAdmin.from('profiles').upsert({
      id: user.id, full_name: fix.fullName, role: isExpert ? 'Expert' : 'Farmer',
      bio: `Test fixture account: ${fix.email}`, location: 'Punjab, India',
    }, { onConflict: 'id' }), 'profile');

    if (fix.expertStatus) {
      const existing = must(await supabaseAdmin.from('expert_applications').select('id')
        .eq('user_id', user.id).eq('status', fix.expertStatus), 'read applications');
      if (existing.length === 0) {
        must(await supabaseAdmin.from('expert_applications').insert({
          user_id: user.id, qualification: 'B.Sc Agriculture', experience: '5 years organic farming',
          cv_file_path: `expert-cvs/${fix.email.split('@')[0]}_cv.pdf`, status: fix.expertStatus,
        }), 'application');
      }
    }

    if (isExpert) {
      const expert = must(await supabaseAdmin.from('experts').upsert({
        user_id: user.id, specialization: fix.specialization, verified_date: isoDate(new Date()), is_active: true,
      }, { onConflict: 'user_id' }).select('id').single(), 'experts row');
      const slots = [];
      for (let day = 1; day <= 14; day++) {
        const d = new Date(Date.now() + day * 86400000);
        for (const [start, end] of [['10:00', '10:30'], ['15:00', '15:30']]) {
          slots.push({ expert_id: expert.id, slot_date: isoDate(d), start_time: start, end_time: end, rate: 500, is_booked: false });
        }
      }
      must(await supabaseAdmin.from('consultation_slots')
        .upsert(slots, { onConflict: 'expert_id,slot_date,start_time', ignoreDuplicates: true }), 'slots');
    }
    console.log(`  ✓ ${fix.email} (${isExpert ? 'Expert' : 'Farmer'}${fix.expertStatus ? `, application ${fix.expertStatus}` : ''})`);
  }
  console.log('\n✅ Fixture accounts ready.');
}

if (process.argv[1] && process.argv[1].endsWith('test-fixtures.js')) {
  seedFixtures(process.argv.includes('--reset')).then(() => process.exit(0)).catch((err) => {
    console.error('❌ Error seeding fixtures:', err.message);
    process.exit(1);
  });
}
