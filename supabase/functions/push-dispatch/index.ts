// Push dispatcher. Called every minute by pg_cron (header x-dispatch-secret = the Vault secret push_dispatch_secret).
// Claims queued rows from push_outbox, sends them through FCM and reports each result; the in-app notification row
// is never touched, so a failed push never loses the notification. Secrets: FIREBASE_SERVICE_ACCOUNT (JSON) set in
// this function's secrets; SUPABASE_SERVICE_ROLE_KEY is provided by the platform. Deployed with verify_jwt = false
// because the caller is the database scheduler, authenticated by the shared secret instead.
import { createClient } from 'npm:@supabase/supabase-js@2.112.0';
import { deliver, getAccessToken, parseServiceAccount, sendToToken } from './fcm.js';

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// constant-time comparison of the shared secret
const same = (a: string, b: string) => {
  if (!a || !b || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i += 1) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: secret } = await db.rpc('push_dispatch_secret');
  if (!same(req.headers.get('x-dispatch-secret') ?? '', secret ?? '')) return reply(401, { error: 'unauthorized' });

  let sa;
  try {
    sa = parseServiceAccount(Deno.env.get('FIREBASE_SERVICE_ACCOUNT'));
  } catch (e) {
    console.error(`push-dispatch: ${(e as Error).message}`);
    return reply(503, { error: 'push provider misconfigured', code: 'push_misconfigured' });
  }
  if (!sa) return reply(503, { error: 'push provider not configured', code: 'push_not_configured' });   // rows stay queued

  const { data: batch, error } = await db.rpc('claim_push_batch', { p_limit: 50 });
  if (error) return reply(500, { error: 'claim failed' });
  if (!batch?.length) return reply(200, { claimed: 0 });

  let accessToken: string;
  try {
    accessToken = await getAccessToken(sa);
  } catch (e) {
    for (const item of batch) await db.rpc('finish_push', { p_id: item.id, p_result: 'retry', p_error: 'FCM auth failed' });
    console.error(`push-dispatch: ${(e as Error).message}`);
    return reply(502, { error: 'FCM auth failed', claimed: batch.length });
  }

  const counts: Record<string, number> = {};
  for (const item of batch) {
    const out = await deliver(item, (token: string, it: any) =>
      sendToToken({ projectId: sa.project_id, accessToken, token, title: it.title, body: it.body, data: it.data }));
    counts[out.result] = (counts[out.result] ?? 0) + 1;
    await db.rpc('finish_push', {
      p_id: item.id, p_result: out.result, p_error: out.error ?? null, p_delivered: out.delivered, p_invalid_device_ids: out.invalid,
    });
  }
  // FCM "accepted" is not "displayed on the phone": counts are provider acceptance only.
  return reply(200, { claimed: batch.length, ...counts });
});
