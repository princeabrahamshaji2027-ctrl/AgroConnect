import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Meetings() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

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
          )
        `)
        .order('meeting_date', { ascending: false });

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
      fetchMeetings();
    } catch (err) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      <div>
        <h1 className="font-headline-xl text-on-surface mb-1">Meetings Management</h1>
        <p className="font-body-sm text-on-surface-variant">View and manage expert consultation meetings and video session statuses.</p>
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
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-body-sm divide-y divide-outline-variant/20">
              {meetings.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-on-surface-variant/50">No consultation meetings found</td>
                </tr>
              ) : (
                meetings.map((m) => {
                  const expertName = m.experts?.profiles?.full_name || 'Expert';
                  const farmerName = m.farmer_profiles?.profiles?.full_name || 'Farmer';
                  const isPendingOrBooked = m.status === 'Booked' || m.status === 'Scheduled';

                  return (
                    <tr key={m.id} className="hover:bg-surface-variant/20 transition-colors">
                      <td className="p-4 font-bold text-on-surface">
                        {expertName}
                      </td>
                      <td className="p-4 text-on-surface-variant">
                        {farmerName}
                      </td>
                      <td className="p-4 text-on-surface-variant font-mono text-[12px]">
                        <div>{m.meeting_date}</div>
                        <div className="text-[11px] text-on-surface-variant/70">{m.meeting_time}</div>
                      </td>
                      <td className="p-4 text-on-surface max-w-[250px] truncate" title={m.issue_description || ''}>
                        {m.issue_description || '(No topic specified)'}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                          m.status === 'Booked' ? 'bg-primary-container/20 text-primary-container' :
                          m.status === 'Completed' ? 'bg-emerald-500/20 text-emerald-400' :
                          'bg-error/20 text-error'
                        }`}>
                          {m.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {isPendingOrBooked ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              disabled={actionLoading === m.id}
                              onClick={() => handleUpdateStatus(m.id, 'Completed')}
                              className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                            >
                              Complete
                            </button>
                            <button
                              disabled={actionLoading === m.id}
                              onClick={() => handleUpdateStatus(m.id, 'Cancelled')}
                              className="bg-error/10 hover:bg-error/20 text-error border border-error/30 px-2.5 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-on-surface-variant/50 font-mono">No actions</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
