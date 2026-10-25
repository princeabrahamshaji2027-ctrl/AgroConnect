// Admin-only: permanently delete a user (auth account + profile; everything that references the profile cascades,
// see supabase/proposed/09). The service-role key exists only here, as the platform-provided secret
// SUPABASE_SERVICE_ROLE_KEY; it is never sent to the browser or the app.
// Called from the admin dashboard: supabase.functions.invoke('admin-delete-user', { body: { user_id } })
import { createClient } from 'npm:@supabase/supabase-js@2.112.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  // The caller's own session decides who they are; RLS-free checks use the service client below.
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: me } = await caller.auth.getUser();
  if (!me?.user) return reply(401, { error: 'Sign in required' });
  const { data: isAdmin } = await caller.rpc('is_admin');
  if (isAdmin !== true) return reply(403, { error: 'Administrators only' });

  let userId: string | undefined;
  try { userId = (await req.json())?.user_id; } catch { /* handled below */ }
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return reply(400, { error: 'user_id required' });
  if (userId === me.user.id) return reply(400, { error: 'You cannot delete your own account' });

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: target, error: readErr } = await admin.from('profiles').select('id, full_name, role').eq('id', userId).maybeSingle();
  if (readErr) return reply(500, { error: readErr.message });
  if (target?.role === 'Admin') return reply(400, { error: 'Administrator accounts cannot be deleted here' });

  // Audit first: the log row references the admin, not the deleted user, so it survives the delete.
  await admin.from('admin_audit_log').insert({
    admin_id: me.user.id, action: 'delete_user', target_table: 'profiles', target_id: userId,
    details: { full_name: target?.full_name ?? null, role: target?.role ?? null },
  });

  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr && !/not found/i.test(delErr.message)) return reply(500, { error: delErr.message });
  // An orphan profile (no auth account) is removed directly.
  if (target) await admin.from('profiles').delete().eq('id', userId);
  return reply(200, { deleted: userId });
});
