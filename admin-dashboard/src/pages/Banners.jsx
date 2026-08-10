import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Banners() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const tableMap = {
    Meetings: 'video_meetings',
    Reviews: 'reviews',
    Banners: 'banners',
    Broadcasts: 'broadcasts',
    Analytics: null,
    Admins: 'profiles',
    ActivityLogs: 'admin_audit_log',
  };
  const table = tableMap['Banners'];

  useEffect(() => {
    if (!table) { setLoading(false); return; }
    supabase.from(table).select('*').order('created_at', { ascending: false }).then(({ data }) => {
      setItems(data || []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      <div>
        <h1 className="font-headline-xl text-on-surface mb-1">Banners</h1>
        <p className="font-body-sm text-on-surface-variant">Manage Banners data.</p>
      </div>
      <div className="card-bg rounded-xl border border-outline-variant p-6">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <span className="animate-spin h-8 w-8 border-4 border-primary-container border-t-transparent rounded-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-on-surface-variant/50">No Banners data found.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <div key={item.id} className="bg-surface-container rounded-xl p-4 text-body-sm text-on-surface-variant font-mono text-[11px] break-all">
                {JSON.stringify(item, null, 2).substring(0, 300)}...
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
