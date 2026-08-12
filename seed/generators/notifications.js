import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { randomElement, randomDate } from '../lib/randomHelpers.js';

const NOTIFICATION_MESSAGES = [
  { message: "❤️ Someone liked your farm update post", type: "like" },
  { message: "💬 An Expert commented on your crop query", type: "comment" },
  { message: "💬 A fellow farmer replied to your post", type: "comment" },
  { message: "📢 Government Scheme Update: New subsidies announced for micro-irrigation kits", type: "announcement" },
  { message: "📢 Advisory: Monsoon weather alert for northern agricultural districts", type: "announcement" }
];

export async function generateNotifications(users, posts) {
  console.log(`\n🔔 Generating notifications for demo user accounts...`);

  if (!users || users.length === 0) return [];

  const targetUsers = users.slice(0, Math.min(50, users.length));
  const notificationsToInsert = [];

  for (const user of targetUsers) {
    const notifCount = Math.floor(Math.random() * 5) + 1;
    for (let n = 0; n < notifCount; n++) {
      const item = randomElement(NOTIFICATION_MESSAGES);
      const post = posts && posts.length > 0 ? randomElement(posts) : null;

      notificationsToInsert.push({
        user_id: user.id,
        message: item.message,
        type: item.type,
        related_id: post ? post.id : null,
        is_read: Math.random() > 0.4,
        created_at: randomDate(30, 0),
        is_test: true
      });
    }
  }

  let { data, error } = await supabaseAdmin.from('notifications').insert(notificationsToInsert).select('id');

  if (error && error.message?.includes('is_test')) {
    const fallback = notificationsToInsert.map(({ is_test, ...rest }) => rest);
    const res = await supabaseAdmin.from('notifications').insert(fallback).select('id');
    data = res.data;
  }

  const count = data ? data.length : notificationsToInsert.length;
  console.log(`✅ Successfully generated ${count} notifications across ${targetUsers.length} accounts.`);
  return data || [];
}
