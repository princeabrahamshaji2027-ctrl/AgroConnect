import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import defaultAvatar from '../assets/profile-placeholder.png';

export default function Experts() {
  const [activeSubTab, setActiveSubTab] = useState('applications'); // 'applications' | 'verified'
  const [applications, setApplications] = useState([]);
  const [verifiedExperts, setVerifiedExperts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Rejection notes modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [rejectNotes, setRejectNotes] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      if (activeSubTab === 'applications') {
        const { data, error } = await supabase
          .from('expert_applications')
          .select('*, profiles(full_name, phone, profile_image_path, email:id)')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setApplications(data || []);
      } else {
        const { data, error } = await supabase
          .from('experts')
          .select('*, profiles:user_id(full_name, phone, profile_image_path, location)')
          .order('verified_date', { ascending: false });
        if (error) throw error;
        setVerifiedExperts(data || []);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeSubTab]);

  const handleApprove = async (appId) => {
    try {
      const { error } = await supabase.rpc('approve_expert_application', { p_application_id: appId });
      if (error) throw error;
      fetchData();
    } catch (err) {
      alert(err.message || 'Error approving application');
    }
  };

  const handleRejectClick = (app) => {
    setSelectedApp(app);
    setRejectNotes('');
    setShowRejectModal(true);
  };

  const handleRejectSubmit = async () => {
    if (!selectedApp || !rejectNotes) return;
    try {
      const { error } = await supabase.rpc('reject_expert_application', {
        p_application_id: selectedApp.id,
        p_notes: rejectNotes
      });
      if (error) throw error;
      setShowRejectModal(false);
      fetchData();
    } catch (err) {
      alert(err.message || 'Error rejecting application');
    }
  };

  const handleViewResume = async (path) => {
    try {
      const { data, error } = await supabase.storage
        .from('expert-cvs')
        .createSignedUrl(path, 3600);
      if (error) { alert('Could not open resume: ' + error.message); return; }
      window.open(data.signedUrl, '_blank');
    } catch (err) {
      alert('Could not open resume: ' + err.message);
    }
  };

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
                      {app.cv_file_path ? (
                        <button
                          onClick={() => handleViewResume(app.cv_file_path)}
                          className="text-primary-container hover:underline flex items-center gap-1 font-semibold cursor-pointer bg-transparent border-none p-0"
                        >
                          <span className="material-symbols-outlined text-[16px]">file_open</span>
                          <span>View Resume</span>
                        </button>
                      ) : (
                        <span className="text-on-surface-variant/40">No CV attached</span>
                      )}
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
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-body-sm divide-y divide-outline-variant/20">
              {verifiedExperts.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-on-surface-variant/50">No verified experts found</td>
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
                    <td className="p-4 text-right text-on-surface-variant/40">
                      <span>No actions available</span>
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
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="Enter feedback notes..."
                className="w-full bg-[#1c221e] border border-outline-variant rounded-lg p-3 text-on-surface text-body-sm focus:outline-none focus:border-error transition-colors h-24 placeholder:text-on-surface-variant/40"
              />
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
                disabled={!rejectNotes}
                className="bg-error hover:bg-error/95 text-on-error font-semibold px-4 py-2 rounded-lg font-label-md transition-colors cursor-pointer disabled:opacity-50"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
