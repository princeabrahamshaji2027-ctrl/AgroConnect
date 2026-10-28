// After a staging test run: remove what the run created between the staging test accounts (rules R2–R4 of
// scripts/sql/staging_cleanup_test_traffic.sql, limited to rows created since `since`), so test topics and old
// notices do not pile up in the staging app. Test accounts = auth users with user_metadata.fixture.
// Needs STAGING_SUPABASE_SERVICE_ROLE_KEY (RLS hides other users' rows); without it this does nothing.
// Refuses anything but the staging project.
import { createClient } from '@supabase/supabase-js';

const STAGING_REF = 'ahkgvuewgbjyahbiehrx';

export async function cleanupTestTraffic(since, env = process.env) {
  const key = env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !env.STAGING_SUPABASE_URL?.includes(STAGING_REF)) return { skipped: true };
  const admin = createClient(env.STAGING_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`cleanup listUsers: ${error.message}`);
  const fx = list.users.filter((u) => u.user_metadata?.fixture).map((u) => u.id);
  if (!fx.length) return { skipped: true };
  const iso = new Date(since).toISOString();
  const ids = async (q) => ((await q).data || []).map((r) => r.id);
  const farmers = await ids(admin.from('farmer_profiles').select('id').in('user_id', fx));
  const experts = await ids(admin.from('experts').select('id').in('user_id', fx));
  const bookings = farmers.length && experts.length ? await ids(admin.from('consultation_bookings').select('id')
    .in('farmer_id', farmers).in('expert_id', experts).in('status', ['Cancelled', 'Completed']).gte('created_at', iso)) : [];
  const convs = await ids(admin.from('conversations').select('id').in('user_one', fx).in('user_two', fx).gte('created_at', iso));
  const del = async (table, col, values) => {
    if (!values.length) return 0;
    const { error: e, count } = await admin.from(table).delete({ count: 'exact' }).in(col, values);
    if (e) throw new Error(`cleanup ${table}: ${e.message}`);
    return count;
  };
  const out = {};
  out.notifications = (await admin.from('notifications').delete({ count: 'exact' }).in('user_id', fx).gte('created_at', iso)).count;
  out.messages = await del('messages', 'conversation_id', convs);
  out.conversations = await del('conversations', 'id', convs);
  for (const t of ['reviews', 'demo_payment_adjustments', 'demo_payments', 'video_meetings']) out[t] = await del(t, 'booking_id', bookings);
  out.bookings = await del('consultation_bookings', 'id', bookings);
  return out;
}
