import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Appointments() {
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('consultation_bookings')
        .select('*, experts:expert_id(profiles:user_id(full_name)), farmer_profiles:farmer_id(profiles:user_id(full_name))')
        .order('meeting_date', { ascending: false });
      setAppts(data || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      <div><h1 className="font-headline-xl text-on-surface mb-1">Appointments</h1>
        <p className="font-body-sm text-on-surface-variant">Expert consultation bookings.</p></div>
      <div className="card-bg rounded-xl overflow-hidden border border-outline-variant">
        {loading ? <div className="flex items-center justify-center p-12"><span className="animate-spin h-8 w-8 border-4 border-primary-container border-t-transparent rounded-full" /></div> : (
          <table className="w-full text-left border-collapse">
            <thead><tr className="border-b border-outline-variant/30 text-on-surface-variant text-[11px] font-bold uppercase tracking-wider bg-surface-container">
              <th className="p-4">Expert</th><th className="p-4">Farmer</th><th className="p-4">Date</th><th className="p-4">Time</th><th className="p-4">Status</th>
            </tr></thead>
            <tbody className="text-body-sm divide-y divide-outline-variant/20">
              {appts.length === 0 ? <tr><td colSpan="5" className="p-8 text-center text-on-surface-variant/50">No appointments yet</td></tr> : appts.map(a => (
                <tr key={a.id} className="hover:bg-surface-variant/20">
                  <td className="p-4 font-bold text-on-surface">{a.experts?.profiles?.full_name || 'Expert'}</td>
                  <td className="p-4 text-on-surface-variant">{a.farmer_profiles?.profiles?.full_name || 'Farmer'}</td>
                  <td className="p-4 text-on-surface-variant">{a.meeting_date}</td>
                  <td className="p-4 text-on-surface-variant">{a.meeting_time}</td>
                  <td className="p-4"><span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${a.status === 'Booked' ? 'bg-primary-container/20 text-primary-container' : 'bg-secondary-container/20 text-secondary-container'}`}>{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
