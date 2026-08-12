import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { randomInt, shuffleArray } from '../lib/randomHelpers.js';

export async function generateLikes(posts, users, targetTotalLikes = 30000) {
  console.log(`\n❤️ Generating ~${targetTotalLikes} likes across posts...`);

  if (!posts || posts.length === 0 || !users || users.length === 0) {
    console.error('Missing posts or users for like generation!');
    return 0;
  }

  let totalLikesCreated = 0;
  const BATCH_SIZE = 2000;
  let likeBuffer = [];

  for (let p = 0; p < posts.length; p++) {
    const post = posts[p];
    const likesCount = randomInt(5, 45); // Random likes per post
    const shuffledUsers = shuffleArray(users);
    const selectedUsers = shuffledUsers.slice(0, Math.min(likesCount, users.length));

    for (const u of selectedUsers) {
      likeBuffer.push({
        post_id: post.id,
        user_id: u.id,
        is_test: true
      });

      if (likeBuffer.length >= BATCH_SIZE) {
        const count = await flushLikes(likeBuffer);
        totalLikesCreated += count;
        likeBuffer = [];
        if (totalLikesCreated % 10000 < BATCH_SIZE) {
          console.log(`   Progress: ~${totalLikesCreated} likes inserted...`);
        }
      }
    }
  }

  if (likeBuffer.length > 0) {
    const count = await flushLikes(likeBuffer);
    totalLikesCreated += count;
  }

  console.log(`✅ Successfully generated ${totalLikesCreated} likes.`);
  return totalLikesCreated;
}

async function flushLikes(batch) {
  let { data, error } = await supabaseAdmin.from('likes').insert(batch).select('id');
  if (error && error.message?.includes('is_test')) {
    const fallback = batch.map(({ is_test, ...rest }) => rest);
    const res = await supabaseAdmin.from('likes').insert(fallback).select('id');
    data = res.data;
  }
  return data ? data.length : batch.length;
}
