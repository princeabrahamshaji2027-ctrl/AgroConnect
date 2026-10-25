// Booking in tests goes through the DEMO checkout like the app (migration 14): start_demo_checkout → confirm_demo_payment.
// Returns { data: bookingId, error, payment } shaped like a supabase rpc result, so callers can keep their assertions.
import { randomUUID } from 'node:crypto';

export async function demoBook(client, slotId, issue, { key = randomUUID() } = {}) {
  const started = await client.rpc('start_demo_checkout', { p_slot_id: slotId, p_issue: issue, p_idempotency_key: key });
  if (started.error) return { data: null, error: started.error, payment: null };
  const confirmed = await client.rpc('confirm_demo_payment', { p_payment_id: started.data.payment_id });
  if (confirmed.error) return { data: null, error: confirmed.error, payment: started.data };
  const p = confirmed.data;
  if (p.status !== 'succeeded') {
    return { data: null, payment: p, error: { code: p.failure_reason === 'slot_taken' ? '23505' : '22023', message: `demo payment ${p.status}: ${p.failure_reason}` } };
  }
  return { data: p.booking_id, error: null, payment: p };
}
