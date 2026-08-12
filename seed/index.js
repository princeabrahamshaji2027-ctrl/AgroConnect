import { generateUsers } from './generators/users.js';
import { generatePosts } from './generators/posts.js';
import { generateComments } from './generators/comments.js';
import { generateLikes } from './generators/likes.js';
import { generateMarketplace } from './generators/marketplace.js';
import { generateExpertQA } from './generators/expert-qa.js';
import { generateNotifications } from './generators/notifications.js';
import { generateNews } from './generators/news.js';

// Parse --scale argument: small (default) | medium | large
const args = process.argv.slice(2);
const scaleArg = args.find(a => a.startsWith('--scale='))?.split('=')[1] || 'small';

const SCALE_CONFIGS = {
  small: { users: 800, posts: 6000, comments: 25000, likes: 30000 },
  medium: { users: 5000, posts: 40000, comments: 150000, likes: 200000 },
  large: { users: 15000, posts: 100000, comments: 400000, likes: 500000 }
};

const config = SCALE_CONFIGS[scaleArg] || SCALE_CONFIGS.small;

async function runSeed() {
  console.log(`\n==================================================`);
  console.log(`🌾 AgroConnect Demo Data Seeding System`);
  console.log(`   Selected Scale: [${scaleArg.toUpperCase()}]`);
  console.log(`   Target: ${config.users} Users | ${config.posts} Posts | ${config.comments} Comments`);
  console.log(`==================================================\n`);

  const startTime = Date.now();

  try {
    // 1. Generate Users & Profiles
    const users = await generateUsers(config.users);

    if (!users || users.length === 0) {
      console.error('❌ User generation failed or produced zero users. Stopping seed process.');
      return;
    }

    // 2. Generate Posts
    const posts = await generatePosts(users, config.posts);

    // 3. Generate Comments
    await generateComments(posts, users, config.comments);

    // 4. Generate Likes
    await generateLikes(posts, users, config.likes);

    // 5. Generate Marketplace Products
    await generateMarketplace(users);

    // 6. Generate Expert Q&A Consultations
    await generateExpertQA(users);

    // 7. Generate Notifications
    await generateNotifications(users, posts);

    // 8. Seed Krishi Jagran News
    await generateNews();

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n==================================================`);
    console.log(`🎉 Demo Data Seeding Completed Successfully!`);
    console.log(`⏱️ Total Time: ${durationSec}s`);
    console.log(`   Run 'npm run seed:cleanup' anytime to clear all test data.`);
    console.log(`==================================================\n`);

  } catch (err) {
    console.error(`\n❌ Error during seeding:`, err);
  }
}

runSeed();
