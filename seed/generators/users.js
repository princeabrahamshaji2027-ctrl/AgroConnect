import { fakerEN_IN as faker } from '@faker-js/faker';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { INDIAN_LOCATIONS, EXPERT_SPECIALIZATIONS, randomElement, randomInt } from '../lib/randomHelpers.js';

/**
 * Generate test users, profiles, experts, and sellers
 */
export async function generateUsers(targetCount = 800) {
  console.log(`\n🌱 Generating ${targetCount} test users...`);

  const createdUsers = [];
  const BATCH_SIZE = 15;
  const password = 'DemoUser@1234'; // Shared password for test accounts

  for (let i = 0; i < targetCount; i += BATCH_SIZE) {
    const currentBatchSize = Math.min(BATCH_SIZE, targetCount - i);
    const batchPromises = [];

    for (let j = 0; j < currentBatchSize; j++) {
      const idx = i + j + 1;
      const fullName = faker.person.fullName();
      const cleanName = fullName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const email = `user_${idx}_${cleanName.slice(0, 10)}@seedtest.agroconnect.local`;
      const location = randomElement(INDIAN_LOCATIONS);

      // Determine role
      const randRole = Math.random();
      let role = 'Farmer';
      if (randRole > 0.85) role = 'Expert';
      else if (randRole > 0.70) role = 'Seller';

      batchPromises.push(createUserAccount({ email, password, fullName, role, location, idx }));
    }

    const results = await Promise.all(batchPromises);
    for (const res of results) {
      if (res) createdUsers.push(res);
    }

    if ((i + BATCH_SIZE) % 150 === 0 || i + BATCH_SIZE >= targetCount) {
      console.log(`   Progress: ${Math.min(i + BATCH_SIZE, targetCount)} / ${targetCount} users created...`);
    }

    // Small delay between batches to respect auth rate limits
    await new Promise(r => setTimeout(r, 120));
  }

  console.log(`✅ Successfully generated ${createdUsers.length} test users.`);
  return createdUsers;
}

async function createUserAccount({ email, password, fullName, role, location, idx }) {
  try {
    // 1. Create auth user (or fetch existing)
    let userId;
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });

    if (authError) {
      // If user already exists in auth
      const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
      const found = existing?.users?.find(u => u.email === email);
      if (found) userId = found.id;
      else {
        // Fallback: generate a deterministic UUID if auth creation fails
        userId = `00000000-0000-4000-8000-${String(idx).padStart(12, '0')}`;
      }
    } else {
      userId = authData.user.id;
    }

    const avatarUrl = `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(fullName)}`;

    // 2. Upsert profile
    const profilePayload = {
      id: userId,
      full_name: fullName,
      role: role,
      bio: `${role} based in ${location}`,
      location: location,
      profile_image_path: avatarUrl,
      is_test: true
    };

    const { error: profErr } = await supabaseAdmin
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' });

    if (profErr) {
      // Try insert without is_test if column missing
      delete profilePayload.is_test;
      await supabaseAdmin.from('profiles').upsert(profilePayload, { onConflict: 'id' }).catch(() => {});
    }

    // 3. Create Expert record if role is Expert
    if (role === 'Expert') {
      const spec = randomElement(EXPERT_SPECIALIZATIONS);
      const expertPayload = {
        user_id: userId,
        qualification: 'B.Sc / M.Sc Agriculture',
        specialization: spec,
        experience_years: randomInt(3, 20),
        bio: `Certified Agriculture Specialist in ${spec} with ${randomInt(3, 20)} years field experience in ${location}.`,
        status: 'Approved',
        is_test: true
      };
      await supabaseAdmin.from('experts').upsert(expertPayload, { onConflict: 'user_id' }).catch(async () => {
        delete expertPayload.is_test;
        await supabaseAdmin.from('experts').upsert(expertPayload, { onConflict: 'user_id' }).catch(() => {});
      });
    }

    // 4. Create Seller record if role is Seller
    if (role === 'Seller') {
      const sellerPayload = {
        user_id: userId,
        business_name: `${fullName.split(' ')[0]} Agri Store`,
        gst_number: `29${faker.string.alphanumeric({ length: 10 }).toUpperCase()}1Z5`,
        location: location,
        is_test: true
      };
      await supabaseAdmin.from('seller_profiles').upsert(sellerPayload, { onConflict: 'user_id' }).catch(async () => {
        delete sellerPayload.is_test;
        await supabaseAdmin.from('seller_profiles').upsert(sellerPayload, { onConflict: 'user_id' }).catch(() => {});
      });
    }

    return { id: userId, email, fullName, role, location };
  } catch (err) {
    return null;
  }
}
