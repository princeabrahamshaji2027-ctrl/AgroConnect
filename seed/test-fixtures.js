import { supabaseAdmin } from './lib/supabaseAdmin.js';

const FIXTURES = [
  {
    id: '11111111-1111-4000-8000-000000000001',
    email: 'user1@agroconnect.local',
    fullName: 'Test User 1 (Farmer)',
    role: 'Farmer',
    expertStatus: null,
  },
  {
    id: '11111111-1111-4000-8000-000000000002',
    email: 'user2@agroconnect.local',
    fullName: 'Test User 2 (Pending Expert)',
    role: 'Farmer',
    expertStatus: 'Pending',
    qualification: 'B.Sc Agriculture',
    experience: '5 years organic farming',
    cvPath: 'expert-cvs/user2_cv.pdf',
  },
  {
    id: '11111111-1111-4000-8000-000000000003',
    expertId: '22222222-2222-4000-8000-000000000003',
    email: 'expert1@agroconnect.local',
    fullName: 'Dr. Ramesh Expert',
    role: 'Expert',
    expertStatus: 'Approved',
    specialization: 'Soil & Agronomy',
    qualification: 'Ph.D Soil Science',
    experience: '12 years research & consultation',
    cvPath: 'expert-cvs/expert1_cv.pdf',
  },
  {
    id: '11111111-1111-4000-8000-000000000004',
    email: 'user3@agroconnect.local',
    fullName: 'Test User 3 (Fresh Farmer)',
    role: 'Farmer',
    expertStatus: null,
  },
  {
    id: '11111111-1111-4000-8000-000000000005',
    email: 'user4@agroconnect.local',
    fullName: 'Test User 4 (Rejected Expert)',
    role: 'Farmer',
    expertStatus: 'Rejected',
    qualification: 'Diploma in Agriculture',
    experience: '1 year intern',
    cvPath: 'expert-cvs/user4_cv.pdf',
  },
];

const SHARED_PASSWORD = 'Password123!';

export async function seedFixtures(reset = false) {
  console.log(`🌱 ${reset ? 'Resetting and creating' : 'Seeding'} fixed test accounts...`);

  for (const fix of FIXTURES) {
    console.log(`\nProcessing fixture account: ${fix.email}...`);

    // Authenticate as this user so RLS checks match auth.uid()
    const { data: authData, error: authErr } = await supabaseAdmin.auth.signInWithPassword({
      email: fix.email,
      password: SHARED_PASSWORD
    });

    if (authErr) {
      console.warn(`  ⚠️ Could not sign in as ${fix.email}:`, authErr.message);
    }

    if (reset && authData?.user) {
      try { await supabaseAdmin.from('consultation_bookings').delete().eq('farmer_id', fix.id); } catch (e) {}
      if (fix.expertId) {
        try { await supabaseAdmin.from('consultation_bookings').delete().eq('expert_id', fix.expertId); } catch (e) {}
        try { await supabaseAdmin.from('consultation_slots').delete().eq('expert_id', fix.expertId); } catch (e) {}
        try { await supabaseAdmin.from('experts').delete().eq('user_id', fix.id); } catch (e) {}
      }
      try { await supabaseAdmin.from('expert_applications').delete().eq('user_id', fix.id); } catch (e) {}
    }

    // Update Profile as authenticated user
    try {
      const { error: profErr } = await supabaseAdmin.from('profiles').update({
        full_name: fix.fullName,
        role: fix.role,
        bio: `Test fixture account: ${fix.email}`,
        location: 'Punjab, India',
        profile_image_path: `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(fix.fullName)}`
      }).eq('id', fix.id);
      if (profErr) console.warn('Profile update warning:', profErr.message);
    } catch (e) {
      console.warn('Profile update exception:', e.message);
    }

    // Upsert Expert Application if set
    if (fix.expertStatus && authData?.user) {
      try {
        await supabaseAdmin.from('expert_applications').delete().eq('user_id', fix.id);
        const { error: appErr } = await supabaseAdmin.from('expert_applications').insert({
          user_id: fix.id,
          qualification: fix.qualification,
          experience: fix.experience,
          cv_file_path: fix.cvPath,
          status: fix.expertStatus
        });
        if (appErr) console.warn('Expert app insert warning:', appErr.message);
      } catch (e) {
        console.warn('Expert app insert exception:', e.message);
      }
    }

    console.log(`  ✓ ${fix.email} configured successfully.`);
  }

  console.log('\n✅ All 5 fixture test accounts seeded successfully!');
}

if (process.argv[1] && process.argv[1].endsWith('test-fixtures.js')) {
  const isReset = process.argv.includes('--reset');
  seedFixtures(isReset).then(() => process.exit(0)).catch((err) => {
    console.error('❌ Error seeding fixtures:', err);
    process.exit(1);
  });
}
