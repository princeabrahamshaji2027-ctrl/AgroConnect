// Checks an uploaded resume on the server and only then attaches it to the caller's expert application.
// Called from the app: supabase.functions.invoke('submit-resume', { body: { action: 'apply' | 'replace', path, qualification?, experience? } })
// The object must already be in expert-cvs at <uid>/<digits>_cv.pdf (uploaded with the caller's session).
// A file that is not a real PDF (first bytes "%PDF-", "%%EOF" near the end) or is over 5 MB is deleted again
// (unless an application already references it).
import { createClient } from 'npm:@supabase/supabase-js@2.112.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const MAX_BYTES = 5 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: me } = await caller.auth.getUser();
  if (!me?.user) return reply(401, { error: 'Please sign in again.' });
  const uid = me.user.id;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* handled below */ }
  const action = body.action;
  const path = typeof body.path === 'string' ? body.path : '';
  if (action !== 'apply' && action !== 'replace') return reply(400, { error: 'Unknown action.' });
  if (!new RegExp(`^${uid}/[0-9]{10,16}_cv\\.pdf$`).test(path)) return reply(400, { error: 'Please upload your resume again.' });

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: prof } = await admin.from('profiles').select('is_banned').eq('id', uid).maybeSingle();
  if (prof?.is_banned) return reply(403, { error: 'Your account is banned.' });

  // Never delete a file an application already points at (e.g. a repeated request with the same path).
  const remove = async () => {
    const { data: used } = await admin.from('expert_applications').select('id').eq('cv_file_path', path).limit(1);
    if (!used?.length) await admin.storage.from('expert-cvs').remove([path]);
  };
  const { data: blob, error: dlErr } = await admin.storage.from('expert-cvs').download(path);
  if (dlErr || !blob) return reply(404, { error: 'The uploaded resume was not found. Please upload it again.' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_BYTES) { await remove(); return reply(422, { error: 'Resume must be a PDF smaller than 5 MB.' }); }
  const latin1 = new TextDecoder('latin1');
  const head = latin1.decode(bytes.slice(0, 5));
  const tail = latin1.decode(bytes.slice(Math.max(0, bytes.length - 1024)));
  if (head !== '%PDF-' || !tail.includes('%%EOF')) {
    await remove();
    return reply(422, { error: 'This file is not a real PDF. Save or export your resume as a PDF and upload it again.' });
  }

  if (action === 'apply') {
    const qualification = String(body.qualification ?? '').trim();
    const experience = String(body.experience ?? '').trim();
    if (!qualification || qualification.length > 150) { await remove(); return reply(400, { error: 'Qualification is required (up to 150 characters in total).' }); }
    if (!experience || experience.length > 2000) { await remove(); return reply(400, { error: 'Experience is required (up to 2000 characters).' }); }
    const { data, error } = await admin.from('expert_applications')
      .insert({ user_id: uid, qualification, experience, cv_file_path: path, status: 'Pending' }).select('id').single();
    if (error) { await remove(); return reply(error.code === '23505' ? 409 : 400, { error: error.message }); }
    return reply(200, { application_id: data.id });
  }

  const { data: appId, error } = await admin.rpc('_attach_resume', { p_user_id: uid, p_path: path });
  if (error) {
    await remove();
    return reply(error.code === 'P0002' ? 404 : 400,
      { error: error.code === 'P0002' ? 'You have no expert application to attach a resume to.' : error.message });
  }
  return reply(200, { application_id: appId });
});
