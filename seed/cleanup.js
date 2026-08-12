import { supabaseAdmin } from './lib/supabaseAdmin.js';

async function cleanup() {
  console.log('🧹 Starting cleanup of seeded test data...');

  try {
    // 1. Delete notifications
    const { error: notifErr } = await supabaseAdmin.from('notifications').delete().eq('is_test', true);
    if (notifErr) console.log('   Note (notifications):', notifErr.message);

    // 2. Delete likes
    const { error: likeErr } = await supabaseAdmin.from('likes').delete().eq('is_test', true);
    if (likeErr) console.log('   Note (likes):', likeErr.message);

    // 3. Delete comments
    const { error: commErr } = await supabaseAdmin.from('comments').delete().eq('is_test', true);
    if (commErr) console.log('   Note (comments):', commErr.message);

    // 4. Delete products
    const { error: prodErr } = await supabaseAdmin.from('products').delete().eq('is_test', true);
    if (prodErr) console.log('   Note (products):', prodErr.message);

    // 5. Delete posts
    const { error: postErr } = await supabaseAdmin.from('posts').delete().eq('is_test', true);
    if (postErr) console.log('   Note (posts):', postErr.message);

    // 6. Delete test profiles & auth users
    const { data: testProfiles, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('is_test', true);

    if (profErr) {
      console.log('   Note (profiles fetch):', profErr.message);
    } else if (testProfiles && testProfiles.length > 0) {
      console.log(`   Deleting ${testProfiles.length} test user accounts...`);
      for (const p of testProfiles) {
        await supabaseAdmin.auth.admin.deleteUser(p.id).catch(() => {});
        await supabaseAdmin.from('profiles').delete().eq('id', p.id).catch(() => {});
      }
      console.log(`✅ Cleaned up ${testProfiles.length} test users and all associated content.`);
    } else {
      // Fallback: search test emails
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
      const testAuthUsers = authUsers?.users?.filter(u => u.email?.endsWith('@seedtest.agroconnect.local')) || [];
      for (const u of testAuthUsers) {
        await supabaseAdmin.auth.admin.deleteUser(u.id).catch(() => {});
      }
      console.log(`✅ Cleaned up ${testAuthUsers.length} test users.`);
    }

    console.log('✨ Cleanup complete! All real accounts remain untouched.');
  } catch (err) {
    console.error('❌ Cleanup failed:', err.message);
  }
}

cleanup();
