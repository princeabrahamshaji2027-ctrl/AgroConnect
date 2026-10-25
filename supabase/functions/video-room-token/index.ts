// RETIRED (2026-10-25). Consultations now use a Google Meet link that the expert saves with set_meeting_link() and
// participants open with join_consultation() (migration 14). There is no embedded/paid video provider any more.
// This stub only exists so the function already deployed on staging stops doing anything; delete the function from
// the Supabase dashboard (Edge Functions → video-room-token → Delete) and then remove this folder.
Deno.serve(() =>
  new Response(JSON.stringify({ error: 'This endpoint was retired. Use the Google Meet link in Catch Up.', code: 'retired' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  }));
