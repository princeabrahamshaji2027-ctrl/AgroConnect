import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { formatInr } from '../utils/money';
import './DemoCheckout.css';

// DEMO checkout for a consultation — NO REAL MONEY. No payment provider, no card/UPI/bank fields, nothing is collected.
// The server decides everything (migration 14): start_demo_checkout() reads the fee from the slot, and
// confirm_demo_payment() books the slot in the same transaction, so "success" is shown only after the booking exists.
// The animation is presentation only; it never decides the outcome.

const MIN_PROCESSING_MS = 1200;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const newKey = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  }));


const formatWhen = (p) => {
  if (!p?.slot_date) return '';
  const day = new Date(`${p.slot_date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const t = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
  return `${day} · ${t(p.start_time)} – ${t(p.end_time)}`;
};

// Messages for the server's failure reasons. `reselect` = the farmer has to pick another slot.
const FAILURES = {
  slot_taken: { text: 'Another farmer booked this slot moments ago. Nothing was booked — please choose another time.', reselect: true },
  already_booked: { text: 'You already have a booking for this slot. Open Catch Up → Upcoming to see it.', reselect: false },
  slot_started: { text: 'This slot has already started. Please choose another time.', reselect: true },
  slot_missing: { text: 'This slot is no longer available. Please choose another time.', reselect: true },
  slot_changed: { text: 'This slot is no longer available. Please choose another time.', reselect: true },
  fee_changed: { text: 'The expert changed the fee for this slot. Please choose the slot again to see the new fee.', reselect: true },
  expert_unavailable: { text: 'This expert is not accepting bookings right now.', reselect: true },
  expired: { text: 'This checkout expired after 15 minutes. Please start again.', reselect: true },
  cancelled: { text: 'This demo payment was cancelled. Nothing was booked.', reselect: true },
  invalid_request: { text: 'The booking could not be confirmed. Please try again.', reselect: true },
};
const isNetworkError = (e) => /Failed to fetch|NetworkError|network|timeout|Load failed/i.test(e?.message || '');

export default function DemoCheckout({ slotId, issue, onClose }) {
  const keyRef = useRef(newKey());               // one checkout = one key: a double tap or retry reuses the attempt
  const busyRef = useRef(false);
  const [state, setState] = useState('starting'); // starting | ready | processing | success | failed
  const [payment, setPayment] = useState(null);
  const [failure, setFailure] = useState(null);   // { text, reselect, retry }

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.rpc('start_demo_checkout', { p_slot_id: slotId, p_issue: issue, p_idempotency_key: keyRef.current });
      if (!alive) return;
      if (error) {
        setFailure(isNetworkError(error)
          ? { text: 'No connection. Nothing was booked — check your internet and try again.', reselect: false, restart: true }
          : { text: error.message || 'This slot cannot be booked right now.', reselect: true });
        setState('failed');
        return;
      }
      setPayment(data);
      setState(data.status === 'pending' ? 'ready' : data.status === 'succeeded' ? 'success' : 'failed');
    })();
    return () => { alive = false; };
  }, [slotId, issue]);

  const confirm = async () => {
    if (busyRef.current || !payment) return;
    busyRef.current = true;
    setState('processing');
    setFailure(null);
    try {
      const [{ data, error }] = await Promise.all([
        supabase.rpc('confirm_demo_payment', { p_payment_id: payment.payment_id }),
        wait(MIN_PROCESSING_MS),
      ]);
      if (error) {
        // the request may or may not have reached the server: retrying the same attempt is safe (idempotent)
        setFailure(isNetworkError(error)
          ? { text: 'No connection. Your demo payment was not confirmed yet — check your internet and tap Try again.', retry: true }
          : { text: error.message || 'The booking could not be confirmed.', retry: true });
        setState('failed');
        return;
      }
      setPayment(data);
      if (data.status === 'succeeded') { setState('success'); return; }
      setFailure(FAILURES[data.failure_reason] || FAILURES.invalid_request);
      setState('failed');
    } finally {
      busyRef.current = false;
    }
  };

  const cancel = async () => {
    if (busyRef.current) return;
    if (payment?.status === 'pending') {
      busyRef.current = true;
      await supabase.rpc('cancel_demo_payment', { p_payment_id: payment.payment_id });   // errors returned, not thrown
      busyRef.current = false;
    }
    onClose({ cancelled: true });
  };

  const amount = payment ? formatInr(payment.amount_paise) : '';
  return (
    <div className="demo-checkout-overlay" role="dialog" aria-modal="true" aria-labelledby="demo-checkout-title">
      <div className="demo-checkout">
        <div className="demo-banner" role="note">
          <span className="material-symbols-outlined" aria-hidden="true">science</span>
          DEMO PAYMENT — NO REAL MONEY CHARGED
        </div>

        {state === 'starting' && (
          <div className="demo-center">
            <div className="demo-spinner" aria-hidden="true" />
            <p className="demo-muted">Preparing your booking…</p>
          </div>
        )}

        {(state === 'ready' || state === 'processing') && payment && (
          <>
            <h2 id="demo-checkout-title" className="demo-title">Confirm your consultation</h2>
            <dl className="demo-summary">
              <div><dt>Expert</dt><dd>{payment.expert_name}</dd></div>
              <div><dt>When</dt><dd>{formatWhen(payment)}</dd></div>
              <div><dt>Duration</dt><dd>{payment.duration_minutes} minutes</dd></div>
              <div className="demo-total"><dt>Consultation fee</dt><dd>{amount} <span className="demo-cur">INR</span></dd></div>
            </dl>
            <p className="demo-note">
              This is a simulated checkout for demonstration only. No money is charged and no payment details are asked for
              or stored. Your booking is confirmed by AgroConnect when you tap the button below.
            </p>
            {state === 'processing' ? (
              <div className="demo-center" aria-live="polite">
                <div className="demo-spinner" aria-hidden="true" />
                <p className="demo-muted">Processing demo payment and confirming your booking…</p>
              </div>
            ) : (
              <div className="demo-actions">
                <button type="button" className="btn btn-secondary demo-btn" onClick={cancel}>Cancel</button>
                <button type="button" className="btn btn-primary demo-btn" onClick={confirm}>Confirm Demo Payment</button>
              </div>
            )}
          </>
        )}

        {state === 'success' && payment && (
          <div className="demo-center" aria-live="polite">
            <svg className="demo-check" viewBox="0 0 52 52" aria-hidden="true">
              <circle cx="26" cy="26" r="24" fill="none" />
              <path fill="none" d="M15 27 l7 7 l15 -16" />
            </svg>
            <h2 id="demo-checkout-title" className="demo-title">Booking confirmed</h2>
            <p className="demo-muted">
              Demo payment of {amount} recorded — no real money was charged. {payment.expert_name} will add a Google Meet
              link before the session; you will be notified.
            </p>
            <div className="demo-actions">
              <button type="button" className="btn btn-primary demo-btn" onClick={() => onClose({ booked: true, bookingId: payment.booking_id })}>
                View my booking
              </button>
            </div>
          </div>
        )}

        {state === 'failed' && (
          <div className="demo-center" aria-live="assertive">
            <span className="material-symbols-outlined demo-fail-icon" aria-hidden="true">error</span>
            <h2 id="demo-checkout-title" className="demo-title">Booking not confirmed</h2>
            <p className="demo-muted">{failure?.text || (payment && FAILURES[payment.failure_reason]?.text) || 'The booking could not be confirmed.'}</p>
            <div className="demo-actions">
              {failure?.retry ? (
                <>
                  <button type="button" className="btn btn-secondary demo-btn" onClick={cancel}>Cancel</button>
                  <button type="button" className="btn btn-primary demo-btn" onClick={confirm}>Try again</button>
                </>
              ) : (
                <button type="button" className="btn btn-primary demo-btn"
                  onClick={() => onClose({ failed: true, reselect: failure?.reselect ?? FAILURES[payment?.failure_reason]?.reselect ?? true })}>
                  {(failure?.reselect ?? FAILURES[payment?.failure_reason]?.reselect ?? true) ? 'Choose another slot' : 'Close'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
