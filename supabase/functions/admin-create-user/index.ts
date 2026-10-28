// Admin-only: create a normal (Farmer) account and return a one-time link the user opens to set their own password.
// The role is always Farmer (handle_new_user forces it); experts come only from an approved application and Admin is
// never granted here. The service-role key exists only here, as the platform-provided secret SUPABASE_SERVICE_ROLE_KEY.
// Called from the admin dashboard: supabase.functions.invoke('admin-create-user', { body: { email, full_name, district } })
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
  // The caller's own session decides who they are; RLS-free work uses the service client below.
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: me } = await caller.auth.getUser();
  if (!me?.user) return reply(401, { error: 'Sign in required' });
  const { data: isAdmin } = await caller.rpc('is_admin');
  if (isAdmin !== true) return reply(403, { error: 'Administrators only' });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* handled below */ }
  const email = String(body.email ?? '').trim().toLowerCase();
  const fullName = String(body.full_name ?? '').trim();
  const district = body.district == null || body.district === '' ? null : String(body.district);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return reply(400, { error: 'Enter a valid e-mail address.' });
  if (fullName.length < 2 || fullName.length > 100) return reply(400, { error: 'Enter the full name (2–100 characters).' });
  if (district && !['Kannur', 'Pathanamthitta', 'Idukki', 'Kottayam'].includes(district)) return reply(400, { error: 'Choose one of the four districts.' });

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, email_confirm: true, password: crypto.randomUUID() + crypto.randomUUID(),   // never shown; the user sets their own
    user_metadata: { full_name: fullName, district, created_by_admin: true },
  });
  if (cErr) return reply(/already|registered|exists/i.test(cErr.message) ? 409 : 400,
    { error: /already|registered|exists/i.test(cErr.message) ? 'An account with this e-mail already exists.' : cErr.message });
  const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: 'recovery', email,
    options: { redirectTo: 'com.agroconnect.app://auth-callback' } });
  await admin.from('admin_audit_log').insert({ admin_id: me.user.id, action: 'create_user', target_table: 'profiles',
    target_id: created.user!.id, details: { full_name: fullName, district } });
  return reply(200, { user_id: created.user!.id, setup_link: lErr ? null : link.properties?.action_link ?? null });
});
