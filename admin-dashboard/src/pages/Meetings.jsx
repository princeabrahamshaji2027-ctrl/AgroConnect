import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import defaultAvatar from '../assets/profile-placeholder.png';

// Meeting times are stored as the expert's local (India) date + time.
const todayIST = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const nowTimeIST = () => new Date(Date.now() + 330 * 60000).toISOString().slice(11, 19);

// Upcoming = still Booked and not yet started; everything else (done, cancelled, missed) is history.
const isUpcoming = (m) => m.status === 'Booked'
  && (m.meeting_date > todayIST() || (m.meeting_date === todayIST() && (m.meeting_time || '') >= nowTimeIST()));

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'history', label: 'History' },
];

const statusClass = (status) =>
  status === 'Booked' ? 'bg-primary-container/20 text-primary-container' :
  status === 'Completed' ? 'bg-emerald-500/20 text-emerald-400' :
  'bg-error/20 text-error';

const Stars = ({ value }) => (
  <span className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((n) => (
      <span key={n} className="material-symbols-outlined text-[18px]"
        style={{ color: n <= value ? '#FFA726' : 'rgba(255,255,255,0.2)', fontVariationSettings: "'FILL' 1" }}>star</span>
    ))}
  </span>
);

export default function Meetings() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  const fetchMeetings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('consultation_bookings')
        .select(`
          *,
          experts:expert_id (
            id,
            profiles:user_id (
              full_name,
              profile_image_path
            )
          ),
          farmer_profiles:farmer_id (
            id,
            profiles:user_id (
              full_name,
              profile_image_path
            )
          ),
          video_meetings (
            id,
            meeting_link,
            status
          ),
          reviews (
            rating,
            comment,
            created_at
          )
        `)
        .order('meeting_date', { ascending: false })
        .order('meeting_time', { ascending: false });

      if (error) throw error;
      setMeetings(data || []);
    } catch (err) {
      console.error('Error fetching meetings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, []);

  const handleUpdateStatus = async (bookingId, newStatus, reason = null) => {
    if (!window.confirm(`Are you sure you want to mark this meeting as ${newStatus}?`)) return;
    try {
      setActionLoading(bookingId);
      const { error } = await supabase.rpc('admin_update_booking_status', {
        p_booking_id: bookingId,
        p_new_status: newStatus,
        p_cancellation_reason: reason || (newStatus === 'Cancelled' ? 'Cancelled by Administrator' : null)
      });

      if (error) throw error;
      setSelected(null);
      fetchMeetings();
    } catch (err) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const upcoming = meetings.filter(isUpcoming)
    // soonest first
    .sort((a, b) => `${a.meeting_date} ${a.meeting_time}`.localeCompare(`${b.meeting_date} ${b.meeting_time}`));
  const history = meetings.filter((m) => !isUpcoming(m));
  const shown = filter === 'upcoming' ? upcoming : filter === 'history' ? history : meetings;
  const counts = { all: meetings.length, upcoming: upcoming.length, history: history.length };

  const expertOf = (m) => m.experts?.profiles || {};
  const farmerOf = (m) => m.farmer_profiles?.profiles || {};
  const reviewOf = (m) => (Array.isArray(m.reviews) ? m.reviews[0] : m.reviews) || null;

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h1 className="font-headline-xl text-on-surface mb-1">Meetings Management</h1>
          <p className="font-body-sm text-on-surface-variant">All expert consultations, their reviews and outcomes. Click a meeting for details.</p>
        </div>
        <div className="flex gap-2" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-1.5 rounded-full font-label-md border transition-colors cursor-pointer ${
                filter === f.id
                  ? 'border-primary-container text-primary-container bg-primary-container/10 font-bold'
                  : 'border-outline-variant text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {f.label} ({counts[f.id]})
            </button>
          ))}
        </div>
      </div>

      <div className="card-bg rounded-xl overflow-hidden border border-outline-variant">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <span className="animate-spin h-8 w-8 border-4 border-primary-container border-t-transparent rounded-full" />
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/30 text-on-surface-variant text-[11px] font-bold uppercase tracking-wider bg-surface-container">
                <th className="p-4">Expert</th>
                <th className="p-4">Farmer</th>
                <th className="p-4">Date & Time</th>
                <th className="p-4">Topic / Issue</th>
                <th className="p-4">Rating</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="text-body-sm divide-y divide-outline-variant/20">
              {shown.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-on-surface-variant/50">
                    {filter === 'upcoming' ? 'No upcoming meetings' : filter === 'history' ? 'No past meetings' : 'No consultation meetings found'}
                  </td>
                </tr>
              ) : (
                shown.map((m) => {
                  const review = reviewOf(m);
                  return (
                    <tr key={m.id} onClick={() => setSelected(m)}
                      className="hover:bg-surface-variant/30 transition-colors cursor-pointer" title="View meeting details">
                      <td className="p-4 font-bold text-on-surface">{expertOf(m).full_name || 'Expert'}</td>
                      <td className="p-4 text-on-surface-variant">{farmerOf(m).full_name || 'Farmer'}</td>
                      <td className="p-4 text-on-surface-variant font-mono text-[12px]">
                        <div>{m.meeting_date}</div>
                        <div className="text-[11px] text-on-surface-variant/70">{(m.meeting_time || '').slice(0, 5)}</div>
                      </td>
                      <td className="p-4 text-on-surface max-w-[250px] truncate" title={m.issue_description || ''}>
                        {m.issue_description || '(No topic specified)'}
                      </td>
                      <td className="p-4">
                        {review ? <Stars value={review.rating} /> : <span className="text-on-surface-variant/40 text-[12px]">—</span>}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${statusClass(m.status)}`}>
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {selected && (() => {
        const m = selected;
        const review = reviewOf(m);
        const video = (Array.isArray(m.video_meetings) ? m.video_meetings[0] : m.video_meetings) || null;
        const canAct = isUpcoming(m) || m.status === 'Booked';
        const Person = ({ label, p }) => (
          <div className="flex items-center gap-3">
            <img src={p.profile_image_path || defaultAvatar} alt="" className="w-10 h-10 rounded-full object-cover border border-outline-variant" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">{label}</div>
              <div className="text-on-surface font-bold">{p.full_name || label}</div>
            </div>
          </div>
        );
        const Row = ({ k, v }) => (
          <div className="flex justify-between gap-4 py-2 border-b border-outline-variant/20 text-body-sm">
            <span className="text-on-surface-variant">{k}</span>
            <span className="text-on-surface text-right">{v}</span>
          </div>
        );
        return (
          <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
            <div className="max-w-lg w-full card-bg rounded-2xl border border-outline-variant p-6 flex flex-col gap-5 shadow-2xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Meeting details">
              <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3">
                <h2 className="font-headline-lg text-on-surface">Meeting details</h2>
                <button onClick={() => setSelected(null)} className="text-on-surface-variant hover:text-on-surface cursor-pointer" aria-label="Close">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Person label="Expert" p={expertOf(m)} />
                <Person label="Farmer" p={farmerOf(m)} />
              </div>

              <div>
                <Row k="Date" v={m.meeting_date} />
                <Row k="Time" v={(m.meeting_time || '').slice(0, 5)} />
                <Row k="Status" v={<span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${statusClass(m.status)}`}>{m.status}</span>} />
                <Row k="Topic / issue" v={m.issue_description || '—'} />
                {m.cancellation_reason && <Row k="Cancellation reason" v={m.cancellation_reason} />}
                {m.refund_status && m.refund_status !== 'None' && (
                  <Row k="Refund" v={`₹${Number(m.refund_amount || 0)} · ${m.refund_status}`} />
                )}
                {m.expert_joined_at && <Row k="Expert joined" v={new Date(m.expert_joined_at).toLocaleString()} />}
                {m.farmer_joined_at && <Row k="Farmer joined" v={new Date(m.farmer_joined_at).toLocaleString()} />}
                {video?.status && <Row k="Video session" v={video.status} />}
                <Row k="Booked on" v={new Date(m.created_at).toLocaleString()} />
              </div>

              <div className="rounded-xl border border-outline-variant p-4 flex flex-col gap-2">
                <div className="text-[11px] uppercase tracking-wider text-on-surface-variant font-bold">Farmer's review</div>
                {review ? (
                  <>
                    <div className="flex items-center gap-2"><Stars value={review.rating} /><span className="text-on-surface font-bold">{review.rating}/5</span></div>
                    <p className="text-on-surface text-body-sm leading-relaxed">{review.comment || '(No written comment)'}</p>
                    <span className="text-[11px] text-on-surface-variant">{new Date(review.created_at).toLocaleString()}</span>
                  </>
                ) : (
                  <span className="text-on-surface-variant/60 text-body-sm">
                    {m.status === 'Completed' ? 'The farmer has not reviewed this meeting yet.' : 'Reviews are possible after a completed meeting.'}
                  </span>
                )}
              </div>

              {canAct && (
                <div className="flex justify-end gap-2 border-t border-outline-variant/30 pt-3">
                  <button
                    disabled={actionLoading === m.id}
                    onClick={() => handleUpdateStatus(m.id, 'Completed')}
                    className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded text-[12px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Mark completed
                  </button>
                  <button
                    disabled={actionLoading === m.id}
                    onClick={() => handleUpdateStatus(m.id, 'Cancelled')}
                    className="bg-error/10 hover:bg-error/20 text-error border border-error/30 px-3 py-1.5 rounded text-[12px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancel meeting
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
