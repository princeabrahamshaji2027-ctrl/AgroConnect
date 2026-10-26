// What a push-notification tap may open: only a booking or conversation id of the right shape; everything else is ignored.
// The booking / conversation itself is then loaded with the signed-in user's own permissions (RLS), never trusted from the push.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePushTap(data) {
  if (!data) return null;
  if (data.kind === 'booking') {
    return UUID.test(data.booking_id || '') ? { kind: 'booking', bookingId: data.booking_id } : null;
  }
  if (data.kind === 'message') {
    return UUID.test(data.conversation_id || '') ? { kind: 'message', conversationId: data.conversation_id } : null;
  }
  return null;
}
