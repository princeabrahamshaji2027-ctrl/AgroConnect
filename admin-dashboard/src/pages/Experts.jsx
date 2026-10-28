import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import defaultAvatar from '../assets/profile-placeholder.png';
import InlineNotice from '../components/InlineNotice';
import RemoveExpertDialog from '../components/RemoveExpertDialog';

export default function Experts() {
  const [activeSubTab, setActiveSubTab] = useState('applications'); // 'applications' | 'verified'
  const [applications, setApplications] = useState([]);
  const [verifiedExperts, setVerifiedExperts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Rejection notes modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [rejectError, setRejectError] = useState('');

  const [notice, setNotice] = useState(null);            // page message (was window.alert)
  const [resumeByUser, setResumeByUser] = useState({});   // verified experts: user_id -> latest approved CV path
  const [removeTarget, setRemoveTarget] = useState(null); // expert awaiting "Remove expert role" (RemoveExpertDialog)
  const [missingPaths, setMissingPaths] = useState(new Set()); // referenced CV paths with no file in storage

  const fetchData = async () => {
    try {
      setLoading(true);
      if (activeSubTab === 'applications') {
        const { data, error } = await supabase
          .from('expert_applications')
          .select('*, profiles(full_name, phone, profile_image_path, email:id)')
          .order('created_at', { ascending: false });
        if (error) throw error;
        // One row per applicant: their latest request. Older repeats (e.g. sent before the one-request rule) are
        // history, not separate applicants.
        const latest = new Map();
        for (const a of data || []) if (!latest.has(a.user_id)) latest.set(a.user_id, a);
        setApplications([...latest.values()]);
      } else {
        const { data, error } = await supabase
          .from('experts')
          .select('*, profiles:user_id(full_name, phone, profile_image_path, location)')
          .eq('is_active', true)
          .order('verified_date', { ascending: false });
        if (error) throw error;
        setVerifiedExperts(data || []);
        // One query for all resume paths (latest approved application per expert), not one per row.
        const userIds = (data || []).map((e) => e.user_id);
        if (userIds.length) {
          const { data: apps } = await supabase
            .from('expert_applications')
            .select('user_id, cv_file_path, created_at')
            .in('user_id', userIds)
            .eq('status', 'Approved')
            .order('created_at', { ascending: false });
          const paths = {};
          for (const a of apps || []) if (!(a.user_id in paths) && a.cv_file_path) paths[a.user_id] = a.cv_file_path;
          setResumeByUser(paths);
        } else {
          setResumeByUser({});
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setNotice({ type: 'error', text: 'The list could not be loaded. Please check your connection and try again.' });
    } finally {
      setLoading(false);
    }
  };

  // Which referenced CV files really exist: one storage listing per applicant folder (admins may read every CV).
  const [pendingPaths, setPendingPaths] = useState([]);
  useEffect(() => {
    const paths = activeSubTab === 'applications'
      ? applications.map((a) => a.cv_file_path).filter(Boolean)
      : Object.values(resumeByUser).filter(Boolean);
    setPendingPaths(paths);
  }, [activeSubTab, applications, resumeByUser]);
  useEffect(() => {
    let live = true;
    (async () => {
      const missing = new Set();
      const byFolder = new Map();
      for (const p of pendingPaths) {
        const i = p.lastIndexOf('/');
        const folder = i > 0 ? p.slice(0, i) : '';
        if (!byFolder.has(folder)) byFolder.set(folder, []);
        byFolder.get(folder).push(p);
      }
      for (const [folder, paths] of byFolder) {
        const { data, error } = await supabase.storage.from('expert-cvs').list(folder, { limit: 1000 });
        if (error) continue;   // unknown: keep the View button; opening it explains a missing file
        const names = new Set((data || []).map((o) => o.name));
        for (const p of paths) if (!names.has(p.slice(p.lastIndexOf('/') + 1))) missing.add(p);
      }
      if (live) setMissingPaths(missing);
    })();
    return () => { live = false; };
  }, [pendingPaths]);

  useEffect(() => {
    fetchData();
  }, [activeSubTab]);

  const handleApprove = async (appId) => {
    try {
      const { error } = await supabase.rpc('approve_expert_application', { p_application_id: appId });
      if (error) throw error;
      setNotice({ type: 'success', text: 'Application approved. The user is now an expert.' });
      fetchData();
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Error approving application' });
    }
  };

  const handleRejectClick = (app) => {
    setSelectedApp(app);
    setRejectNotes('');
    setRejectError('');
    setShowRejectModal(true);
  };

  const handleRejectSubmit = async () => {
    if (!selectedApp) return;
    if (!rejectNotes.trim()) { setRejectError('Please enter a reason for the rejection.'); return; }
    if (rejectNotes.trim().length > 500) { setRejectError('Please keep the reason under 500 characters.'); return; }
    try {
      const { error } = await supabase.rpc('reject_expert_application', {
        p_application_id: selectedApp.id,
        p_notes: rejectNotes
      });
      if (error) throw error;
      setShowRejectModal(false);
      setNotice({ type: 'success', text: 'Application rejected. The applicant has been notified.' });
      fetchData();
    } catch (err) {
      setRejectError(err.message || 'Error rejecting application');
    }
  };


  // expert-cvs is a PRIVATE bucket: open a short-lived signed link (admins may read every CV by storage policy).
  const handleViewResume = async (path) => {
    setNotice(null);
    try {
      const { data, error } = await supabase.storage
        .from('expert-cvs')
        .createSignedUrl(path, 3600);
      if (error) {
        const missing = /not found|404|400/i.test(`${error.message} ${error.statusCode ?? ''} ${error.status ?? ''}`);
        setNotice({ type: 'error', text: missing
          ? 'The resume file is missing from storage. Ask the expert to upload it again.'
          : 'The resume could not be opened. Please try again.' });
        return;
      }
      window.open(data.signedUrl, '_blank', 'noopener');
    } catch {
      setNotice({ type: 'error', text: 'The resume could not be opened. Please check your connection and try again.' });
    }
  };

  const resumeButton = (path) => (path && missingPaths.has(path) ? (
    <span className="text-error font-semibold inline-flex items-center gap-1" data-testid="resume-missing">
      <span className="material-symbols-outlined text-[16px]">error</span>
      <span>Resume missing — ask the expert to upload a PDF again</span>
    </span>
  ) : path ? (
    <button
      onClick={() => handleViewResume(path)}
      className="text-primary-container hover:underline inline-flex items-center gap-1 font-semibold cursor-pointer bg-transparent border-none p-0"
    >
      <span className="material-symbols-outlined text-[16px]">file_open</span>
      <span>View Resume</span>
    </button>
  ) : null);

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-headline-xl text-on-surface mb-1">Experts Management</h1>
          <p className="font-body-sm text-on-surface-variant">Review agricultural expert applications and monitor verified specialists.</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-[#171A1D] border border-outline-variant rounded-lg p-1">
          <button
            onClick={() => setActiveSubTab('applications')}
            className={`px-4 py-1.5 rounded-md font-label-md transition-colors cursor-pointer ${
              activeSubTab === 'applications' ? 'bg-surface-container-highest text-primary-container font-bold' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Applications ({applications.filter(a => a.status === 'Pending').length} Pending)
          </button>
          <button
            onClick={() => setActiveSubTab('verified')}
            className={`px-4 py-1.5 rounded-md font-label-md transition-colors cursor-pointer ${
              activeSubTab === 'verified' ? 'bg-surface-container-highest text-primary-container font-bold' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Verified Experts ({verifiedExperts.length})
          </button>
        </div>
      </div>

      <InlineNotice notice={notice} onClose={() => setNotice(null)} />

      <div className="card-bg rounded-xl overflow-hidden border border-outline-variant">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <span className="animate-spin h-8 w-8 border-4 border-primary-container border-t-transparent rounded-full" />
          </div>
        ) : activeSubTab === 'applications' ? (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/30 text-on-surface-variant text-[11px] font-bold uppercase tracking-wider bg-surface-container">
                <th className="p-4">Applicant</th>
                <th className="p-4">Qualification</th>
                <th className="p-4">Experience</th>
                <th className="p-4">CV Document</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-body-sm divide-y divide-outline-variant/20">
              {applications.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-on-surface-variant/50">No applications found</td>
                </tr>
              ) : (
                applications.map((app) => (
                  <tr key={app.id} className="hover:bg-surface-variant/20 transition-colors">
                    <td className="p-4 flex items-center gap-3">
                      <img
                        alt="Applicant avatar"
                        className="w-9 h-9 rounded-full object-cover border border-outline-variant"
                        src={app.profiles?.profile_image_path || defaultAvatar}
                      />
                      <div className="flex flex-col">
                        <span className="font-bold text-on-surface">{app.profiles?.full_name || 'Anonymous'}</span>
                        <span className="text-[10px] text-on-surface-variant font-mono">{app.profiles?.phone || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="p-4 text-on-surface">{app.qualification}</td>
                    <td className="p-4 text-on-surface-variant max-w-[250px] truncate">{app.experience}</td>
                    <td className="p-4">
                      {resumeButton(app.cv_file_path) || <span className="text-on-surface-variant/40">No resume</span>}
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        app.status === 'Approved' ? 'bg-primary-container/20 text-primary-container' : 
                        app.status === 'Rejected' ? 'bg-error/20 text-error' : 'bg-secondary-container/20 text-secondary-container'
                      }`}>
                        {app.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {app.status === 'Pending' && (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleApprove(app.id)}
                            className="bg-primary-container/10 text-primary-container hover:bg-primary-container/20 border border-primary-container/30 px-3 py-1.5 rounded font-label-sm transition-colors cursor-pointer"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectClick(app)}
                            className="bg-surface-variant text-on-surface-variant hover:text-on-surface px-3 py-1.5 rounded font-label-sm transition-colors cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/30 text-on-surface-variant text-[11px] font-bold uppercase tracking-wider bg-surface-container">
                <th className="p-4">Expert</th>
                <th className="p-4">Specialization</th>
                <th className="p-4">Verified Date</th>
                <th className="p-4">Rating</th>
                <th className="p-4">Resume</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-body-sm divide-y divide-outline-variant/20">
              {verifiedExperts.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-on-surface-variant/50">No verified experts found</td>
                </tr>
              ) : (
                verifiedExperts.map((exp) => (
                  <tr key={exp.id} className="hover:bg-surface-variant/20 transition-colors">
                    <td className="p-4 flex items-center gap-3">
                      <img
                        alt="Expert avatar"
                        className="w-9 h-9 rounded-full object-cover border border-outline-variant"
                        src={exp.profiles?.profile_image_path || defaultAvatar}
                      />
                      <div className="flex flex-col">
                        <span className="font-bold text-on-surface">{exp.profiles?.full_name || 'Anonymous'}</span>
                        <span className="text-[10px] text-on-surface-variant">{exp.profiles?.phone || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="p-4 text-on-surface">{exp.specialization || 'General Agronomy'}</td>
                    <td className="p-4 text-on-surface-variant">{new Date(exp.verified_date).toLocaleDateString('en-US')}</td>
                    <td className="p-4">
                      <span className="text-secondary font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                        <span>{parseFloat(exp.rating || 0).toFixed(1)} / 5.0</span>
                      </span>
                    </td>
                    <td className="p-4">
                      {resumeButton(resumeByUser[exp.user_id]) || <span className="text-on-surface-variant/40">No resume</span>}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => setRemoveTarget(exp)}
                        className="bg-error/10 text-error hover:bg-error/20 border border-error/30 px-3 py-1.5 rounded font-label-sm transition-colors cursor-pointer"
                      >
                        Remove expert
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && selectedApp && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="max-w-md w-full card-bg rounded-xl border border-outline-variant p-6 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-3">
              <span className="material-symbols-outlined text-error text-[28px]">cancel</span>
              <h2 className="font-headline-lg-mobile text-on-surface">Reject Application</h2>
            </div>
            <p className="font-body-sm text-on-surface-variant">
              Provide formal reasons or feedback for rejecting <strong className="text-on-surface">{selectedApp.profiles?.full_name}</strong>'s expert application.
            </p>
            <div className="flex flex-col gap-2">
              <label className="font-label-md text-on-surface-variant font-bold">Rejection Notes</label>
              <textarea
                value={rejectNotes}
                onChange={(e) => { setRejectNotes(e.target.value); if (rejectError) setRejectError(''); }}
                placeholder="Enter feedback notes..."
                maxLength={500}
                aria-invalid={!!rejectError}
                className="w-full bg-[#1c221e] border border-outline-variant rounded-lg p-3 text-on-surface text-body-sm focus:outline-none focus:border-error transition-colors h-24 placeholder:text-on-surface-variant/40"
              />
              {rejectError && <p role="alert" className="text-error text-[12px] font-medium">{rejectError}</p>}
            </div>
            <div className="flex justify-end gap-3 mt-2 border-t border-outline-variant/30 pt-3">
              <button
                onClick={() => setShowRejectModal(false)}
                className="bg-surface-variant text-on-surface hover:text-on-surface-variant px-4 py-2 rounded-lg font-label-md transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                className="bg-error hover:bg-error/95 text-on-error font-semibold px-4 py-2 rounded-lg font-label-md transition-colors cursor-pointer disabled:opacity-50"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      <RemoveExpertDialog
        userId={removeTarget?.user_id || null}
        onClose={() => setRemoveTarget(null)}
        onDone={(r) => { setRemoveTarget(null); setNotice({ type: 'success', text: r.text }); fetchData(); }}
      />
    </div>
  );
}
