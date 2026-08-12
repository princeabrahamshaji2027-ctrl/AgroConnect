import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { randomElement, randomInt } from '../lib/randomHelpers.js';

const COMMENT_TEMPLATES = [
  "Great yield! Thanks for sharing brother.",
  "Which fertilizer or bio-input did you use for this?",
  "What is the current market rate per quintal in your Mandi?",
  "Awesome field maintenance! Keep up the good work.",
  "Facing a similar problem in our region. Did you get any expert reply?",
  "Drip irrigation really makes a huge difference in water efficiency.",
  "Very informative post. Thanks for sharing your farm experience!",
  "Nice crop condition! Wish you a bountiful harvest season.",
  "Is this variety suitable for heavy rainfall regions as well?",
  "Thanks for the tip! Will try this method on my farm next season."
];

export async function generateComments(posts, users, targetCount = 25000) {
  console.log(`\n💬 Generating ~${targetCount} comments on posts...`);

  if (!posts || posts.length === 0 || !users || users.length === 0) {
    console.error('Missing posts or users for comment generation!');
    return [];
  }

  const createdComments = [];
  const BATCH_SIZE = 1000;
  let commentBuffer = [];

  for (let pIdx = 0; pIdx < posts.length; pIdx++) {
    const post = posts[pIdx];
    const commentCount = randomInt(1, 6);

    for (let c = 0; c < commentCount; c++) {
      const commenter = randomElement(users);
      const text = randomElement(COMMENT_TEMPLATES);

      // Comment date is slightly after post creation date
      const postTime = new Date(post.created_at || Date.now()).getTime();
      const commentTime = new Date(postTime + randomInt(1, 72) * 60 * 60 * 1000).toISOString();

      commentBuffer.push({
        post_id: post.id,
        user_id: commenter.id,
        comment_text: text,
        created_at: commentTime,
        is_test: true
      });

      if (commentBuffer.length >= BATCH_SIZE) {
        const inserted = await flushComments(commentBuffer);
        createdComments.push(...inserted);
        commentBuffer = [];
        if (createdComments.length % 5000 < BATCH_SIZE) {
          console.log(`   Progress: ~${createdComments.length} comments created...`);
        }
      }
    }
  }

  if (commentBuffer.length > 0) {
    const inserted = await flushComments(commentBuffer);
    createdComments.push(...inserted);
  }

  console.log(`✅ Successfully generated ${createdComments.length} comments.`);
  return createdComments;
}

async function flushComments(batch) {
  let { data, error } = await supabaseAdmin.from('comments').insert(batch).select('id');
  if (error && error.message?.includes('is_test')) {
    const fallback = batch.map(({ is_test, ...rest }) => rest);
    const res = await supabaseAdmin.from('comments').insert(fallback).select('id');
    data = res.data;
  }
  return data || [];
}
