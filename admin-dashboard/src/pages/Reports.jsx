import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import InlineNotice from '../components/InlineNotice';
import { useConfirm } from '../components/ConfirmDialog';

export default function Reports() {
  const [notice, setNotice] = useState(null);   // in-page message (was window.alert)
  const [confirm, confirmDialog] = useConfirm();   // was window.confirm
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('posts'); // 'posts' | 'resignations'
  const [resignations, setResignations] = useState([]);
  const [rejecting, setRejecting] = useState(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [busy, setBusy] = useState(null);

  // Experts asking to leave expert mode (sent from the app's profile menu).
  const fetchResignations = async () => {
    const { data, error } = await supabase
      .from('expert_resignations')
      .select('*, profiles:user_id(full_name, profile_image_path)')
      .order('created_at', { ascending: false });
    if (error) console.error('Error fetching leave requests:', error);
    setResignations(data || []);
  };

  const handleApproveResignation = async (r) => {
    if (!(await confirm({ title: `Approve ${r.profiles?.full_name || 'this expert'}'s request?`, message: 'Their expert badge and expert tools are removed, upcoming meetings are cancelled with a full refund and the farmers are notified.', confirmLabel: 'Approve', danger: true }))) return;
    setBusy(r.id);
    const { error } = await supabase.rpc('approve_expert_resignation', { p_resignation_id: r.id });
    setBusy(null);
    if (error) { setNotice({ type: 'error', text: error.message }); return; }
    fetchResignations();
  };

  const handleRejectResignation = async () => {
    setBusy(rejecting.id);
    const { error } = await supabase.rpc('reject_expert_resignation', { p_resignation_id: rejecting.id, p_notes: rejectNotes || null });
    setBusy(null);
    if (error) { setNotice({ type: 'error', text: error.message }); return; }
    setRejecting(null);
    setRejectNotes('');
    fetchResignations();
  };

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
    fetchResignations();

    // Subscribe to realtime reports updates
    const channel = supabase
      .channel('admin-reports-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, fetchReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expert_resignations' }, fetchResignations)
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
      setNotice({ type: 'error', text: err.message || 'Error resolving report' });
    }
  };

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      <InlineNotice notice={notice} onClose={() => setNotice(null)} />
      {confirmDialog}
      <div>
        <h1 className="font-headline-xl text-on-surface mb-1">Reports Moderation</h1>
        <p className="font-body-sm text-on-surface-variant">Manage reports submitted by users and experts' requests to leave expert mode.</p>
      </div>

      <div className="flex gap-2" role="tablist">
        {[
          { id: 'posts', label: `Post reports (${reports.filter((r) => r.status === 'Pending').length} pending)` },
          { id: 'resignations', label: `Expert leave requests (${resignations.filter((r) => r.status === 'Pending').length} pending)` },
        ].map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-full font-label-md border transition-colors cursor-pointer ${
              tab === t.id ? 'border-primary-container text-primary-container bg-primary-container/10 font-bold' : 'border-outline-variant text-on-surface-variant hover:text-on-surface'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resignations' ? (
        <div className="card-bg rounded-xl overflow-hidden border border-outline-variant">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/30 text-on-surface-variant text-[11px] font-bold uppercase tracking-wider bg-surface-container">
                <th className="p-4">Expert</th>
                <th className="p-4">Reason for leaving</th>
                <th className="p-4">Status</th>
                <th className="p-4">Requested</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-body-sm divide-y divide-outline-variant/20">
              {resignations.length === 0 ? (
                <tr><td colSpan="5" className="p-8 text-center text-on-surface-variant/50">No leave requests</td></tr>
              ) : resignations.map((r) => (
                <tr key={r.id} className="hover:bg-surface-variant/20 transition-colors">
                  <td className="p-4 font-bold text-on-surface">{r.profiles?.full_name || 'Expert'}</td>
                  <td className="p-4 text-on-surface max-w-md leading-relaxed whitespace-pre-wrap">{r.reason}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                      r.status === 'Approved' ? 'bg-primary-container/20 text-primary-container' :
                      r.status === 'Rejected' ? 'bg-error/20 text-error' : 'bg-secondary-container/20 text-secondary-container'
                    }`}>{r.status}</span>
                  </td>
                  <td className="p-4 text-on-surface-variant font-mono text-[12px]">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-4 text-right">
                    {r.status === 'Pending' ? (
                      <div className="flex justify-end gap-2">
                        <button disabled={busy === r.id} onClick={() => handleApproveResignation(r)}
                          className="bg-primary-container/10 text-primary-container hover:bg-primary-container/20 border border-primary-container/30 px-3 py-1.5 rounded font-label-sm transition-colors cursor-pointer disabled:opacity-50">
                          Approve
                        </button>
                        <button disabled={busy === r.id} onClick={() => { setRejecting(r); setRejectNotes(''); }}
                          className="bg-surface-variant text-on-surface-variant hover:text-on-surface px-3 py-1.5 rounded font-label-sm transition-colors cursor-pointer disabled:opacity-50">
                          Reject
                        </button>
                      </div>
                    ) : <span className="text-on-surface-variant/40">Decided</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (

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
      )}

      {rejecting && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="max-w-md w-full card-bg rounded-xl border border-outline-variant p-6 flex flex-col gap-4 shadow-2xl">
            <h2 className="font-headline-lg-mobile text-on-surface">Keep {rejecting.profiles?.full_name || 'this expert'} as an expert?</h2>
            <p className="font-body-sm text-on-surface-variant">The expert is told the request was declined, with your note.</p>
            <textarea value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} placeholder="Note to the expert (optional)"
              className="w-full bg-[#1c221e] border border-outline-variant rounded-lg p-3 text-on-surface text-body-sm h-24" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setRejecting(null)} className="bg-surface-variant text-on-surface px-4 py-2 rounded-lg font-label-md cursor-pointer">Cancel</button>
              <button disabled={busy === rejecting.id} onClick={handleRejectResignation}
                className="bg-error text-on-error font-semibold px-4 py-2 rounded-lg font-label-md cursor-pointer disabled:opacity-50">Reject request</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
