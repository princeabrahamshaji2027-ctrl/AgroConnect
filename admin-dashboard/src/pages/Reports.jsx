import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('reports')
        .select('*, profiles:reported_by(full_name), posts(id, caption, image_path, user_id, profiles:user_id(full_name))')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();

    // Subscribe to realtime reports updates
    const channel = supabase
      .channel('admin-reports-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, fetchReports)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleResolveReport = async (reportId, actionType, deleteContent) => {
    try {
      const { error } = await supabase.rpc('resolve_report', {
        p_report_id: reportId,
        p_action: actionType, // 'Approved' | 'Rejected' | 'Deleted'
        p_delete_content: deleteContent
      });

      if (error) throw error;
      fetchReports();
    } catch (err) {
      alert(err.message || 'Error resolving report');
    }
  };

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      <div>
        <h1 className="font-headline-xl text-on-surface mb-1">Reports Moderation</h1>
        <p className="font-body-sm text-on-surface-variant">Manage reports submitted by users. Actions update in realtime.</p>
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
                <th className="p-4">Reporter</th>
                <th className="p-4">Reported Content</th>
                <th className="p-4">Reason</th>
                <th className="p-4">Status</th>
                <th className="p-4">Filed At</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-body-sm divide-y divide-outline-variant/20">
              {reports.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-on-surface-variant/50">No reports filed</td>
                </tr>
              ) : (
                reports.map((report) => (
                  <tr key={report.id} className="hover:bg-surface-variant/20 transition-colors">
                    <td className="p-4 font-bold text-on-surface">
                      {report.profiles?.full_name || 'Anonymous'}
                    </td>
                    <td className="p-4 max-w-xs">
                      {report.posts ? (
                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] uppercase font-bold text-primary-container">Post by {report.posts?.profiles?.full_name || 'User'}</span>
                          <p className="text-on-surface-variant line-clamp-2 italic">"{report.posts?.caption}"</p>
                          {report.posts?.image_path && (
                            <img alt="Reported Attachment" className="w-16 h-12 object-cover rounded" src={report.image_path || report.posts?.image_path} />
                          )}
                        </div>
                      ) : (
                        <span className="text-on-surface-variant/40">(Content Deleted)</span>
                      )}
                    </td>
                    <td className="p-4 text-on-surface font-semibold max-w-[200px] leading-relaxed">{report.reason}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        report.status === 'Resolved' ? 'bg-primary-container/20 text-primary-container' : 'bg-[#e74c3c]/20 text-[#e74c3c]'
                      }`}>
                        {report.status}
                      </span>
                    </td>
                    <td className="p-4 text-on-surface-variant font-mono text-[12px]">
                      {new Date(report.created_at).toLocaleString()}
                    </td>
                    <td className="p-4 text-right">
                      {report.status === 'Pending' && report.posts ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleResolveReport(report.id, 'Deleted', true)}
                            className="bg-error/10 text-error hover:bg-error/20 border border-error/30 px-3 py-1.5 rounded font-label-sm transition-colors cursor-pointer"
                          >
                            Delete Post & Resolve
                          </button>
                          <button
                            onClick={() => handleResolveReport(report.id, 'Rejected', false)}
                            className="bg-surface-variant text-on-surface-variant hover:text-on-surface px-3 py-1.5 rounded font-label-sm transition-colors cursor-pointer"
                          >
                            Dismiss Report
                          </button>
                        </div>
                      ) : (
                        <span className="text-on-surface-variant/40">Resolved</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
