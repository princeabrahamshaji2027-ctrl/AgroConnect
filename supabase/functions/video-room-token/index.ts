// Video room access for a Catch Up consultation. The caller's own session goes to join_consultation(), which checks —
// with the database clock — that they are the booking's farmer or expert, not banned, the booking is active and the
// join window (5 minutes before start until slot end) is open, and records attendance. Only then a private Daily
// room is ensured and a short-lived token for THIS user is minted. The Daily API key exists only in this function's
// secrets (DAILY_API_KEY). Tokens are never logged.
// POST { booking_id } -> { provider, room_url, token, expires_at, role, starts_at, ends_at, server_now, room_id }
import { createClient } from 'npm:@supabase/supabase-js@2.112.0';
import { createDailyProvider, roomNameFor, VideoProviderError } from './daily.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });

  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: me } = await caller.auth.getUser();
  if (!me?.user) return reply(401, { error: 'Sign in required', code: 'unauthenticated' });

  let bookingId: string | undefined;
  try { bookingId = (await req.json())?.booking_id; } catch { /* handled below */ }
  if (!bookingId || !/^[0-9a-f-]{36}$/i.test(bookingId)) return reply(400, { error: 'booking_id required', code: 'bad_request' });

  // All authorization and timing rules live in the database (same function the app used before video existed).
  const { data: join, error: joinErr } = await caller.rpc('join_consultation', { p_booking_id: bookingId });
  if (joinErr) {
    const forbidden = /not a participant|banned/i.test(joinErr.message);
    return reply(forbidden ? 403 : 409, { error: joinErr.message, code: forbidden ? 'forbidden' : 'not_joinable' });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const endsSec = Math.floor(Date.parse(join.ends_at) / 1000);
  const opensSec = Math.floor(Date.parse(join.opens_at) / 1000);
  const base = { role: join.role, starts_at: join.starts_at, ends_at: join.ends_at, server_now: join.server_now, room_id: join.room_id };

  let provider;
  try {
    provider = createDailyProvider({ apiKey: Deno.env.get('DAILY_API_KEY') });
  } catch (e) {
    // attendance is recorded; the app shows "video not configured" instead of pretending to connect
    return reply(503, { ...base, error: 'Video calling is not configured yet.', code: 'video_not_configured' });
  }

  try {
    const roomName = roomNameFor(join.room_id);
    const room = await provider.ensureRoom(roomName, { nbf: opensSec, exp: endsSec });
    const { data: prof } = await caller.from('profiles').select('full_name').eq('id', me.user.id).single();
    const exp = Math.min(endsSec, nowSec + 2 * 60 * 60);
    const token = await provider.createToken({ roomName, userId: me.user.id, userName: prof?.full_name, exp });
    return reply(200, { ...base, provider: 'daily', room_url: room.url, token, expires_at: new Date(exp * 1000).toISOString() });
  } catch (e) {
    const err = e instanceof VideoProviderError ? e : new VideoProviderError('video provider error');
    console.error(`video-room-token: ${err.message}`);   // never the token, key or user details
    return reply(err.status, { ...base, error: 'The video service is unavailable right now. Please try again.', code: err.retryable ? 'provider_unavailable' : 'provider_misconfigured' });
  }
});
