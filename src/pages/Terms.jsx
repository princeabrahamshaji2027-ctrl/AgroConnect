import React from 'react';
import Header from '../components/Header';
import './pages.css';

// Terms & Conditions (consultations). Read-only: AgroConnect has no terms-acceptance record, and this page does not
// create one. The amounts described here are bookkeeping figures of the booking flow; this page does not state that
// money is transferred or settled.
const Section = ({ title, children }) => (
  <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
    <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {children}
    </div>
  </section>
);

export default function Terms({ onGoBack }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header title="Terms &amp; Conditions" showBack onBackClick={onGoBack} />
      <div className="page-container fade-in" style={{ gap: '22px', paddingBottom: '40px' }}>
        <Section title="Expert consultations">
          <p>Verified experts offer paid consultations in Catch Up. Each expert sets their own consultation fee, which is
            shown beside the expert's name and again on the checkout screen before you book.</p>
          <p>The fee shown at checkout is the fee agreed for that booking. If an expert later changes their fee, the change
            applies to new bookings only; a confirmed booking keeps the fee agreed when it was booked.</p>
        </Section>

        <Section title="Platform commission">
          <p>AgroConnect retains a platform commission of <strong style={{ color: 'var(--text-primary)' }}>2%</strong> of the
            agreed consultation fee. The commission is part of the fee, not an extra charge to the farmer.</p>
          <p>The remaining <strong style={{ color: 'var(--text-primary)' }}>98%</strong> is the expert's share, before any other
            applicable adjustments, taxes or legally required deductions.</p>
          <p>The commission is calculated on the fee agreed for each booking and rounded to the nearest paisa (half a paisa
            rounds up); the expert's share is the fee minus the commission, so the two always add up to the fee. Example: a
            fee of ₹1,000.00 gives a commission of ₹20.00 and an expert share of ₹980.00.</p>
          <p>Changing an expert's future fee never changes the fee, commission or expert share recorded for a booking that
            is already confirmed.</p>
        </Section>

        <Section title="Meetings, cancellations and refunds">
          <p>Consultations take place in Google Meet. The expert adds the meeting link to the booking; you can join from
            Catch Up from 5 minutes before the start until the booked time ends.</p>
          <p>If a farmer cancels a booking, half of the agreed fee is marked for refund. If the expert has not added a
            meeting link 5 minutes after the start, the booking is cancelled and the full agreed fee is marked for refund.</p>
          <p>The expert marks a consultation as completed. After that, the farmer can rate and review it once.</p>
        </Section>
      </div>
    </div>
  );
}
