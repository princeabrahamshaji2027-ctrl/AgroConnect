// What a push-notification tap may open: only a booking id of the right shape; everything else is ignored.
// The booking itself is then loaded with the signed-in user's own permissions (RLS), never trusted from the push.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePushTap(data) {
  if (!data || data.kind !== 'booking') return null;
  return UUID.test(data.booking_id || '') ? { kind: 'booking', bookingId: data.booking_id } : null;
}
