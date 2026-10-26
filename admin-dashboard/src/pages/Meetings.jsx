import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';

// Catch Up consultations (admin). Everything comes from three admin-only database functions (migration 15):
// admin_consultation_summary / admin_consultations (same server-side filters, paginated) / admin_consultation_detail.
// Amounts are the booking's own snapshot (fee, 2 % commission, expert share) — never the expert's current fee.
// Payments are SIMULATED (transaction_type 'simulated'): figures are bookkeeping of the simulated checkout, not money
// received, collected or paid out. Booking accounting is read-only here.

const PAGE = 25;
const inr = (paise) => (paise == null ? '—'
  : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(paise / 100));
const t5 = (t) => (t || '').slice(0, 5);
const when = (ts) => (ts ? new Date(ts).toLocaleString() : '—');

const statusClass = (status) =>
  status === 'Booked' ? 'bg-primary-container/20 text-primary-container' :
  status === 'Completed' ? 'bg-emerald-500/20 text-emerald-400' :
  'bg-error/20 text-error';
const completionText = (r) => (r.status === 'Cancelled' ? 'Cancelled'
  : r.completion_source === 'expert' ? 'Completed by expert'
  : r.completion_source === 'admin' ? 'Completed by admin'
  : r.completion_source === 'slot_ended' ? 'Closed after slot (not confirmed)'
  : 'Open');

const Stars = ({ value }) => (
  <span className="flex items-center gap-0.5" aria-label={`${value} of 5 stars`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <span key={n} className="material-symbols-outlined text-[16px]"
        style={{ color: n <= value ? '#FFA726' : 'rgba(255,255,255,0.2)', fontVariationSettings: "'FILL' 1" }}>star</span>
    ))}
  </span>
);

const RULE_TEXT = {
  farmer_early: 'Farmer cancelled 14 h or more before — full refund',
  farmer_late: 'Farmer cancelled less than 14 h before — 50% to expert, 2% commission kept',
  expert_cancel: 'Expert cancelled — full refund',
  admin_cancel: 'Admin cancelled — full refund',
  no_show: 'Nobody joined — full refund',
};
const ROLE_TEXT = { farmer: 'Farmer', expert: 'Expert', admin: 'Admin', system: 'System (automatic)' };

// Non-blocking message instead of alert(): stays until dismissed or replaced.
function InlineNotice({ notice, onClose }) {
  if (!notice) return null;
  const tone = notice.type === 'error' ? 'border-error/40 bg-error/10 text-error' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  return (
    <div role={notice.type === 'error' ? 'alert' : 'status'} className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-body-sm ${tone}`}>
      <span>{notice.text}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="cursor-pointer opacity-80 hover:opacity-100">
        <span className="material-symbols-outlined text-[16px]">close</span>
      </button>
    </div>
  );
}

const EMPTY = { from_date: '', to_date: '', q: '', status: '', payment: '', link: '', completion: '', review: '', cancellation_rule: '' };
const clean = (f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v != null));

function Select({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-on-surface-variant font-bold">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-surface-container border border-outline-variant rounded-lg px-2 py-1.5 text-body-sm text-on-surface normal-case tracking-normal font-normal">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export default function Meetings() {
  const [filters, setFilters] = useState(EMPTY);
  const [applied, setApplied] = useState({});
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState(null);            // page-level { type, text }
  const [detailNotice, setDetailNotice] = useState(null); // inside the detail dialog
  const [cancelForm, setCancelForm] = useState(null);     // { reason, error } while the admin cancel form is open
  const [confirmComplete, setConfirmComplete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [list, sum] = await Promise.all([
      supabase.rpc('admin_consultations', { p_filters: applied, p_limit: PAGE, p_offset: page * PAGE }),
      supabase.rpc('admin_consultation_summary', { p_filters: applied }),
    ]);
    if (list.error || sum.error) setError((list.error || sum.error).message);
    else { setRows(list.data.rows); setTotal(list.data.total); setSummary(sum.data); }
    setLoading(false);
  }, [applied, page]);

  useEffect(() => { load(); }, [load]);

  const apply = (e) => { e?.preventDefault(); setPage(0); setApplied(clean(filters)); };
  const reset = () => { setFilters(EMPTY); setPage(0); setApplied({}); };

  const openDetail = async (id) => {
    const { data, error: err } = await supabase.rpc('admin_consultation_detail', { p_booking_id: id });
    if (err) { setNotice({ type: 'error', text: `Could not open the consultation: ${err.message}` }); return; }
    setDetailNotice(null);
    setCancelForm(null);
    setConfirmComplete(false);
    setDetail(data);
  };

  const closeDetail = () => {
    if (actionLoading) return;
    setDetail(null);
    setCancelForm(null);
    setConfirmComplete(false);
    setDetailNotice(null);
  };

  // server-side authorised and audit-logged; accounting fields are never edited here
  const markCompleted = async (id) => {
    setActionLoading(true);
    const { error: err } = await supabase.rpc('admin_update_booking_status', {
      p_booking_id: id, p_new_status: 'Completed', p_cancellation_reason: null,
    });
    setActionLoading(false);
    if (err) { setDetailNotice({ type: 'error', text: `Action failed: ${err.message}` }); return; }
    setDetail(null);
    setConfirmComplete(false);
    setNotice({ type: 'success', text: 'Consultation marked as completed.' });
    load();
  };

  // Admin cancellation: always a full refund to the farmer; the reason is stored and written to the audit log.
  const cancelBooking = async (id) => {
    const reason = (cancelForm?.reason || '').trim();
    if (!reason) { setCancelForm({ ...cancelForm, error: 'Please enter a cancellation reason.' }); return; }
    if (reason.length > 500) { setCancelForm({ ...cancelForm, error: 'Please keep the reason under 500 characters.' }); return; }
    setActionLoading(true);
    const { data, error: err } = await supabase.rpc('admin_cancel_booking', { p_booking_id: id, p_reason: reason });
    setActionLoading(false);
    if (err) { setDetailNotice({ type: 'error', text: `Cancellation failed: ${err.message}` }); return; }
    setDetail(null);
    setCancelForm(null);
    setNotice({ type: 'success', text: data?.has_payment
      ? `Consultation cancelled. Full refund recorded (simulated): ${inr(data.refund_paise)}. Farmer and expert were notified.`
      : 'Consultation cancelled. There was no payment to refund. Farmer and expert were notified.' });
    load();
  };

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const cards = summary ? [
    ['Total consultations', summary.total],
    ['Confirmed (upcoming)', summary.confirmed_upcoming],
    ['Checkouts in progress', summary.pending_checkouts],
    ['Completed', summary.completed],
    ['Cancelled', summary.cancelled],
    ['Awaiting meeting link', summary.awaiting_link],
    ['Reviews submitted', summary.reviews],
    ['Agreed consultation value', inr(summary.value_paise)],
    ['Platform commission (2%) recorded', inr(summary.commission_paise)],
    ['Expert share recorded', inr(summary.expert_share_paise)],
    ['Refunds recorded (simulated)', inr(summary.refunds_paise)],
    ['Net platform commission', inr(summary.net_commission_paise)],
    ['Net expert share', inr(summary.net_expert_share_paise)],
  ] : [];

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6 min-w-0 w-full">
      <div>
        <h1 className="font-headline-xl text-on-surface mb-1">Catch Up Consultations</h1>
        <p className="font-body-sm text-on-surface-variant">
          Bookings, simulated payments, the 2% platform commission, meeting links, completion and reviews. Amounts are the
          fee agreed for each booking. Payments are simulated: these figures are bookkeeping only — no money has been received,
          collected or paid out.
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="consultation-summary">
          {cards.map(([label, value]) => (
            <div key={label} className="card-bg rounded-xl border border-outline-variant p-4">
              <div className="text-[11px] uppercase tracking-wider text-on-surface-variant font-bold">{label}</div>
              <div className="text-on-surface text-headline-sm font-bold mt-1">{value}</div>
            </div>
          ))}
        </div>
      )}
      {summary && (
        <p className="text-[12px] text-on-surface-variant -mt-3">
          Value, commission and expert share count confirmed bookings that are not cancelled (status Booked or Completed) in the
          current filter. Cancelled bookings' agreed value: {inr(summary.cancelled_value_paise)}. Net figures subtract refunds: a late
          farmer cancellation keeps 50% for the expert and the 2% commission; every other cancellation is a full refund. Checkouts in
          progress are not bookings.
        </p>
      )}

      <form onSubmit={apply} className="card-bg rounded-xl border border-outline-variant p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end" aria-label="Filters">
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-on-surface-variant font-bold">
          From (slot date)
          <input type="date" value={filters.from_date} onChange={(e) => setFilters({ ...filters, from_date: e.target.value })}
            className="bg-surface-container border border-outline-variant rounded-lg px-2 py-1.5 text-body-sm text-on-surface" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-on-surface-variant font-bold">
          To
          <input type="date" value={filters.to_date} onChange={(e) => setFilters({ ...filters, to_date: e.target.value })}
            className="bg-surface-container border border-outline-variant rounded-lg px-2 py-1.5 text-body-sm text-on-surface" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-on-surface-variant font-bold md:col-span-1">
          Farmer or expert name
          <input type="search" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Search names"
            className="bg-surface-container border border-outline-variant rounded-lg px-2 py-1.5 text-body-sm text-on-surface" />
        </label>
        <Select label="Booking status" value={filters.status} onChange={(v) => setFilters({ ...filters, status: v })}
          options={[['', 'All'], ['Booked', 'Booked'], ['Completed', 'Completed'], ['Cancelled', 'Cancelled']]} />
        <Select label="Payment" value={filters.payment} onChange={(v) => setFilters({ ...filters, payment: v })}
          options={[['', 'All'], ['succeeded', 'Confirmed (simulated)'], ['none', 'No payment record']]} />
        <Select label="Meeting link" value={filters.link} onChange={(v) => setFilters({ ...filters, link: v })}
          options={[['', 'All'], ['saved', 'Saved'], ['missing', 'Missing']]} />
        <Select label="Completion" value={filters.completion} onChange={(v) => setFilters({ ...filters, completion: v })}
          options={[['', 'All'], ['open', 'Open'], ['expert', 'By expert'], ['admin', 'By admin'], ['slot_ended', 'Closed after slot']]} />
        <Select label="Review" value={filters.review} onChange={(v) => setFilters({ ...filters, review: v })}
          options={[['', 'All'], ['reviewed', 'Reviewed'], ['not_reviewed', 'Not reviewed']]} />
        <Select label="Cancellation" value={filters.cancellation_rule} onChange={(v) => setFilters({ ...filters, cancellation_rule: v })}
          options={[['', 'All'], ['farmer_early', 'Farmer, 14 h+ before'], ['farmer_late', 'Farmer, under 14 h'], ['expert_cancel', 'By expert'],
            ['admin_cancel', 'By admin'], ['no_show', 'Nobody joined']]} />
        <div className="flex gap-2 md:col-span-2">
          <button type="submit" className="bg-primary-container text-on-primary-container px-4 py-2 rounded-lg font-bold text-[13px] cursor-pointer">Apply filters</button>
          <button type="button" onClick={reset} className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-lg text-[13px] cursor-pointer">Reset</button>
        </div>
      </form>

      <InlineNotice notice={notice} onClose={() => setNotice(null)} />
      {error && <div role="alert" className="text-error text-body-sm">Could not load consultations: {error}</div>}

      <div className="card-bg rounded-xl overflow-x-auto border border-outline-variant min-w-0 max-w-full">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <span className="animate-spin h-8 w-8 border-4 border-primary-container border-t-transparent rounded-full" />
          </div>
        ) : (
          <table className="w-full text-left border-collapse min-w-[1300px]">
            <thead>
              <tr className="border-b border-outline-variant/30 text-on-surface-variant text-[11px] font-bold uppercase tracking-wider bg-surface-container">
                <th className="p-3">Booking</th>
                <th className="p-3">Farmer</th>
                <th className="p-3">Expert</th>
                <th className="p-3">Slot</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Agreed fee</th>
                <th className="p-3 text-right">Commission</th>
                <th className="p-3 text-right">Expert share</th>
                <th className="p-3">Payment</th>
                <th className="p-3">Link</th>
                <th className="p-3">Completion</th>
                <th className="p-3">Review</th>
              </tr>
            </thead>
            <tbody className="text-body-sm divide-y divide-outline-variant/20">
              {rows.length === 0 ? (
                <tr><td colSpan="12" className="p-8 text-center text-on-surface-variant/50">No consultations match these filters</td></tr>
              ) : rows.map((r) => (
                <tr key={r.booking_id} onClick={() => openDetail(r.booking_id)} className="hover:bg-surface-variant/30 cursor-pointer" title="Open details">
                  <td className="p-3 font-mono text-[11px] text-on-surface-variant">{r.booking_id.slice(0, 8)}</td>
                  <td className="p-3 text-on-surface">{r.farmer_name || 'Farmer'}</td>
                  <td className="p-3 text-on-surface font-bold">{r.expert_name || 'Expert'}</td>
                  <td className="p-3 font-mono text-[12px] text-on-surface-variant">
                    <div>{r.meeting_date}</div>
                    <div className="text-[11px]">{t5(r.start_time)}–{t5(r.end_time)} · {r.duration_minutes ?? '—'} min</div>
                  </td>
                  <td className="p-3"><span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${statusClass(r.status)}`}>{r.status}</span></td>
                  <td className="p-3 text-right text-on-surface">{inr(r.amount_paise)}</td>
                  <td className="p-3 text-right text-on-surface-variant">{inr(r.commission_paise)}</td>
                  <td className="p-3 text-right text-on-surface-variant">{inr(r.expert_share_paise)}</td>
                  <td className="p-3 text-[12px] text-on-surface-variant">{r.payment_id ? `Confirmed (${r.transaction_type})` : 'No payment record'}</td>
                  <td className="p-3 text-[12px]">{r.link_saved ? <span className="text-emerald-400">Saved</span> : <span className="text-amber-400">Missing</span>}</td>
                  <td className="p-3 text-[12px] text-on-surface-variant">{completionText(r)}</td>
                  <td className="p-3">{r.rating ? <Stars value={r.rating} /> : <span className="text-on-surface-variant/40 text-[12px]">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between text-body-sm text-on-surface-variant">
        <span data-testid="pagination-info">{total} consultation{total === 1 ? '' : 's'} · page {page + 1} of {pages}</span>
        <div className="flex gap-2">
          <button disabled={page === 0 || loading} onClick={() => setPage(page - 1)} className="border border-outline-variant px-3 py-1.5 rounded-lg disabled:opacity-40 cursor-pointer">Previous</button>
          <button disabled={page + 1 >= pages || loading} onClick={() => setPage(page + 1)} className="border border-outline-variant px-3 py-1.5 rounded-lg disabled:opacity-40 cursor-pointer">Next</button>
        </div>
      </div>

      {detail && (() => {
        const d = detail;
        const Row = ({ k, v }) => (
          <div className="flex justify-between gap-4 py-2 border-b border-outline-variant/20 text-body-sm">
            <span className="text-on-surface-variant">{k}</span>
            <span className="text-on-surface text-right break-all">{v}</span>
          </div>
        );
        return (
          <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={closeDetail}>
            <div className="max-w-2xl w-full card-bg rounded-2xl border border-outline-variant p-6 flex flex-col gap-4 shadow-2xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Consultation details">
              <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3">
                <h2 className="font-headline-lg text-on-surface">Consultation {d.booking_id.slice(0, 8)}</h2>
                <button onClick={closeDetail} className="text-on-surface-variant hover:text-on-surface cursor-pointer" aria-label="Close">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div>
                <Row k="Farmer" v={`${d.farmer_name || '—'}${d.farmer_phone ? ` · ${d.farmer_phone}` : ''}${d.farmer_location ? ` · ${d.farmer_location}` : ''}`} />
                <Row k="Expert" v={`${d.expert_name || '—'}${d.expert_phone ? ` · ${d.expert_phone}` : ''}${d.expert_location ? ` · ${d.expert_location}` : ''}`} />
                <Row k="Slot" v={`${d.meeting_date} · ${t5(d.start_time)}–${t5(d.end_time)} (${d.duration_minutes ?? '—'} min)`} />
                <Row k="Status" v={d.status} />
                <Row k="Topic / issue" v={d.issue || '—'} />
              </div>

              <div className="rounded-xl border border-outline-variant p-4">
                <div className="text-[11px] uppercase tracking-wider text-on-surface-variant font-bold mb-1">Booking accounting (snapshot, read-only)</div>
                <Row k="Agreed consultation fee" v={inr(d.amount_paise)} />
                <Row k="Commission rate" v={d.commission_bps != null ? `${(d.commission_bps / 100).toFixed(2)}%` : '—'} />
                <Row k="Platform commission" v={inr(d.commission_paise)} />
                <Row k="Expert share" v={inr(d.expert_share_paise)} />
                <Row k="Transaction type" v={d.payment_id ? `${d.transaction_type} — no money received or paid out` : 'No payment record (booked before the checkout existed)'} />
                <Row k="Payment status" v={d.payment_status || '—'} />
                <Row k="Checkout attempts for this slot" v={d.attempts} />
              </div>

              <div>
                <Row k="Booked" v={when(d.created_at)} />
                <Row k="Payment confirmed" v={when(d.confirmed_at)} />
                <Row k="Google Meet link" v={d.meeting_link || 'Not added'} />
                <Row k="Link saved at" v={when(d.meeting_link_set_at)} />
                <Row k="Expert opened Meet from the app" v={when(d.expert_opened_at)} />
                <Row k="Farmer opened Meet from the app" v={when(d.farmer_opened_at)} />
                <Row k="Completion" v={completionText(d)} />
                <Row k="Last update" v={when(d.updated_at)} />
              </div>

              {d.status === 'Cancelled' && (
                <div className="rounded-xl border border-error/30 p-4" data-testid="cancellation-detail">
                  <div className="text-[11px] uppercase tracking-wider text-on-surface-variant font-bold mb-1">Cancellation &amp; refund (simulated)</div>
                  <Row k="Cancelled at" v={when(d.cancelled_at)} />
                  <Row k="Cancelled by" v={ROLE_TEXT[d.cancelled_by_role] || '—'} />
                  <Row k="Rule applied" v={RULE_TEXT[d.cancellation_rule] || '—'} />
                  <Row k="Reason" v={d.cancellation_reason || '—'} />
                  <Row k="Refund to farmer" v={d.refund_paise != null ? inr(d.refund_paise) : '—'} />
                  <Row k="Commission reversed" v={d.refund_commission_reversal_paise != null ? inr(d.refund_commission_reversal_paise) : '—'} />
                  <Row k="Expert share reversed" v={d.refund_expert_share_reversal_paise != null ? inr(d.refund_expert_share_reversal_paise) : '—'} />
                </div>
              )}

              <div className="rounded-xl border border-outline-variant p-4 flex flex-col gap-2">
                <div className="text-[11px] uppercase tracking-wider text-on-surface-variant font-bold">Farmer's review</div>
                {d.rating ? (
                  <>
                    <div className="flex items-center gap-2"><Stars value={d.rating} /><span className="text-on-surface font-bold">{d.rating}/5</span></div>
                    <p className="text-on-surface text-body-sm leading-relaxed">{d.review_comment || '(No written comment)'}</p>
                    <span className="text-[11px] text-on-surface-variant">{when(d.reviewed_at)}</span>
                  </>
                ) : <span className="text-on-surface-variant/60 text-body-sm">No review yet.</span>}
              </div>

              <div className="rounded-xl border border-outline-variant p-4">
                <div className="text-[11px] uppercase tracking-wider text-on-surface-variant font-bold mb-2">Notifications ({d.notifications.length})</div>
                <ul className="flex flex-col gap-1.5 text-[12px]">
                  {d.notifications.map((n, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="text-on-surface"><span className="text-on-surface-variant">{n.recipient}:</span> {n.message}</span>
                      <span className="text-on-surface-variant whitespace-nowrap">{n.is_read ? 'read' : 'unread'}{n.push ? ` · push ${n.push}` : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <InlineNotice notice={detailNotice} onClose={() => setDetailNotice(null)} />

              {d.status === 'Booked' && !cancelForm && (
                <div className="flex justify-end items-center gap-2 border-t border-outline-variant/30 pt-3 flex-wrap">
                  {confirmComplete ? (
                    <>
                      <span className="text-[12px] text-on-surface-variant mr-auto">Mark as completed? The agreed fee and commission stay as recorded.</span>
                      <button disabled={actionLoading} onClick={() => setConfirmComplete(false)}
                        className="border border-outline-variant text-on-surface-variant px-3 py-1.5 rounded text-[12px] cursor-pointer disabled:opacity-50">Back</button>
                      <button disabled={actionLoading} onClick={() => markCompleted(d.booking_id)}
                        className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-3 py-1.5 rounded text-[12px] font-bold cursor-pointer disabled:opacity-50">
                        {actionLoading ? 'Saving…' : 'Yes, mark completed'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button disabled={actionLoading} onClick={() => setConfirmComplete(true)}
                        className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded text-[12px] font-bold cursor-pointer disabled:opacity-50">
                        Mark completed
                      </button>
                      <button disabled={actionLoading} onClick={() => { setConfirmComplete(false); setCancelForm({ reason: '', error: null }); }}
                        className="bg-error/10 hover:bg-error/20 text-error border border-error/30 px-3 py-1.5 rounded text-[12px] font-bold cursor-pointer disabled:opacity-50">
                        Cancel consultation
                      </button>
                    </>
                  )}
                </div>
              )}

              {d.status === 'Booked' && cancelForm && (
                <form noValidate onSubmit={(e) => { e.preventDefault(); cancelBooking(d.booking_id); }}
                  className="flex flex-col gap-2 border-t border-outline-variant/30 pt-3" aria-label="Cancel consultation">
                  <p className="text-[12px] text-on-surface-variant">
                    An admin cancellation always gives the farmer a full refund
                    {d.amount_paise != null && d.payment_id ? ` (${inr(d.amount_paise)}, simulated)` : ''}. Farmer and expert are notified and the
                    reason is written to the audit log.
                  </p>
                  <label htmlFor="admin-cancel-reason" className="text-[11px] uppercase tracking-wider text-on-surface-variant font-bold">Cancellation reason *</label>
                  <textarea id="admin-cancel-reason" rows={3} maxLength={500} autoFocus
                    value={cancelForm.reason}
                    aria-invalid={cancelForm.error ? true : undefined}
                    aria-describedby={cancelForm.error ? 'admin-cancel-reason-err' : undefined}
                    onChange={(e) => setCancelForm({ reason: e.target.value, error: null })}
                    className={`bg-surface-container border rounded-lg px-2 py-1.5 text-body-sm text-on-surface ${cancelForm.error ? 'border-error' : 'border-outline-variant'}`} />
                  {cancelForm.error && <p id="admin-cancel-reason-err" role="alert" className="text-error text-[12px]">{cancelForm.error}</p>}
                  <div className="flex justify-end gap-2">
                    <button type="button" disabled={actionLoading} onClick={() => setCancelForm(null)}
                      className="border border-outline-variant text-on-surface-variant px-3 py-1.5 rounded text-[12px] cursor-pointer disabled:opacity-50">Keep booking</button>
                    <button type="submit" disabled={actionLoading}
                      className="bg-error/20 text-error border border-error/40 px-3 py-1.5 rounded text-[12px] font-bold cursor-pointer disabled:opacity-50">
                      {actionLoading ? 'Cancelling…' : 'Cancel with full refund'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
