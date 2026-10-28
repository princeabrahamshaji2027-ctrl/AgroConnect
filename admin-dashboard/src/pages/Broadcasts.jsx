import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { validateRequiredText, validateImageFile } from '../utils/validation';
import InlineNotice from '../components/InlineNotice';

export default function Broadcasts() {
  const [notice, setNotice] = useState(null);   // in-page message (was window.alert)
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Broadcast Form State
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState('all'); // 'all' | 'Expert' | 'Farmer' | 'Seller' | 'user'
  const [targetUserId, setTargetUserId] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // User search state for targetType === 'user'
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUserObj, setSelectedUserObj] = useState(null);

  const fetchBroadcasts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('broadcasts')
        .select('*, sender:profiles!broadcasts_sent_by_fkey(full_name, role)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBroadcasts(data || []);
    } catch (err) {
      console.error('Error fetching broadcasts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBroadcasts();
    // an expert's submission notifies every admin (supabase/proposed/25); refresh the list when one arrives
    let channel = null;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      channel = supabase.channel('admin-broadcast-reviews')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          () => fetchBroadcasts())
        .subscribe();
    });
    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  const pending = broadcasts.filter(b => b.status === 'pending');
  const history = broadcasts.filter(b => b.status !== 'pending');
  const [reviewingId, setReviewingId] = useState(null);
  const [rejectNotes, setRejectNotes] = useState({});

  const handleReview = async (b, approve) => {
    const note = (rejectNotes[b.id] || '').trim();
    if (!approve && note.length < 3) {
      setNotice({ type: 'error', text: 'Please write a short reason for the expert (at least 3 characters).' });
      return;
    }
    setReviewingId(b.id);
    const { data, error } = await supabase.rpc('review_broadcast', { p_broadcast_id: b.id, p_approve: approve, p_note: approve ? null : note });
    setReviewingId(null);
    if (error) {
      setNotice({ type: 'error', text: error.message });
    } else {
      setNotice({ type: 'success', text: approve ? `Approved and sent to ${data} users.` : 'Rejected. The expert has been told why.' });
      setRejectNotes(prev => ({ ...prev, [b.id]: '' }));
    }
    fetchBroadcasts();
  };

  // Search users when targetType is 'user' and input changes
  useEffect(() => {
    if (targetType !== 'user' || !userSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, role, phone')
        .ilike('full_name', `%${userSearch}%`)
        .limit(5);
      setSearchResults(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch, targetType]);

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const imgVal = await validateImageFile(file, 5);
    if (!imgVal.isValid) {
      setNotice({ type: 'error', text: imgVal.error });
      e.target.value = '';
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmitBroadcast = async (e) => {
    e.preventDefault();

    const titleVal = validateRequiredText(title, 'Broadcast Title', 2, 150);
    if (!titleVal.isValid) {
      setNotice({ type: 'error', text: titleVal.error });
      return;
    }

    const messageVal = validateRequiredText(message, 'Message Content', 5, 3000);
    if (!messageVal.isValid) {
      setNotice({ type: 'error', text: messageVal.error });
      return;
    }
    if (targetType === 'user' && !targetUserId) {
      setNotice({ type: 'error', text: 'Please select a specific target user.' });
      return;
    }

    setSubmitting(true);
    try {
      let imagePath = null;
      if (imageFile) {
        const ext = imageFile.name.split('.').pop() || 'png';
        const fileName = `broadcast_${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, imageFile, { upsert: true });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName);
        imagePath = publicUrl;
      }

      let targetRole = null;
      if (targetType === 'Expert' || targetType === 'Farmer' || targetType === 'Seller') {
        targetRole = targetType;
      }

      const { error: rpcError } = await supabase.rpc('send_broadcast', {
        p_title: title.trim(),
        p_message: message.trim(),
        p_image_path: imagePath,
        p_target_role: targetRole,
        p_target_user_id: targetType === 'user' ? targetUserId : null,
        p_action_type: 'dismissible'   // every announcement can be closed by the user
      });

      if (rpcError) throw rpcError;

      setNotice({ type: 'success', text: 'Broadcast sent to the selected recipients.' });
      setTitle('');
      setMessage('');
      setImageFile(null);
      setImagePreview('');
      setTargetType('all');
      setTargetUserId('');
      setSelectedUserObj(null);
      fetchBroadcasts();
    } catch (err) {
      setNotice({ type: 'error', text: `Broadcast failed: ${err.message}` });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      <InlineNotice notice={notice} onClose={() => setNotice(null)} />
      <div>
        <h1 className="font-headline-xl text-on-surface mb-1">System Broadcasts</h1>
        <p className="font-body-sm text-on-surface-variant">Send system announcements and alerts to users across Agro Connect. Users can always close them.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* New Broadcast Form */}
        <div className="lg:col-span-6 card-bg rounded-xl border border-outline-variant p-6 flex flex-col gap-5">
          <h2 className="font-headline-lg-mobile text-on-surface flex items-center gap-2 border-b border-outline-variant/30 pb-3">
            <span className="material-symbols-outlined text-primary-container">campaign</span>
            <span>Create New Announcement</span>
          </h2>

          <form onSubmit={handleSubmitBroadcast} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-label-md text-on-surface-variant font-bold">Broadcast Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Important Platform Update & Maintenance"
                className="w-full bg-[#1c221e] border border-outline-variant rounded-xl px-4 py-2.5 text-on-surface text-body-sm focus:outline-none focus:border-primary-container"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-label-md text-on-surface-variant font-bold">Message Content *</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your announcement message here..."
                rows="4"
                className="w-full bg-[#1c221e] border border-outline-variant rounded-xl p-3 text-on-surface text-body-sm focus:outline-none focus:border-primary-container resize-none"
                required
              />
            </div>

            {/* Optional Image */}
            <div className="flex flex-col gap-1.5">
              <label className="font-label-md text-on-surface-variant font-bold">Banner Image (Optional)</label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageChange}
                  className="bg-[#1c221e] border border-outline-variant rounded-xl p-2 text-body-sm text-on-surface-variant file:bg-surface-variant file:text-on-surface file:border-none file:px-3 file:py-1 file:rounded-lg file:cursor-pointer"
                />
                {imagePreview && (
                  <img src={imagePreview} alt="Preview" className="w-12 h-12 object-cover rounded-lg border border-primary-container" />
                )}
              </div>
            </div>

            {/* Target Selector */}
            <div className="flex flex-col gap-2 border-t border-outline-variant/30 pt-3">
              <label className="font-label-md text-on-surface-variant font-bold">Target Audience</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'all', label: 'Everyone' },
                  { id: 'Farmer', label: 'Only Farmers' },
                  { id: 'Expert', label: 'Only Experts' },
                  { id: 'Seller', label: 'Only Sellers' },
                  { id: 'user', label: 'Specific User' }
                ].map(opt => (
                  <label
                    key={opt.id}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer text-body-sm font-semibold transition-colors ${
                      targetType === opt.id
                        ? 'bg-primary-container/10 border-primary-container text-primary-container'
                        : 'bg-[#1c221e] border-outline-variant/40 text-on-surface-variant'
                    }`}
                  >
                    <input
                      type="radio"
                      name="targetAudience"
                      checked={targetType === opt.id}
                      onChange={() => setTargetType(opt.id)}
                      className="accent-primary-container"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>

              {targetType === 'user' && (
                <div className="relative mt-2">
                  <label className="font-label-md text-on-surface-variant font-bold block mb-1">Search & Select Target User</label>
                  <input
                    type="text"
                    value={selectedUserObj ? selectedUserObj.full_name : userSearch}
                    onChange={(e) => {
                      setSelectedUserObj(null);
                      setTargetUserId('');
                      setUserSearch(e.target.value);
                    }}
                    placeholder="Type name to search..."
                    className="w-full bg-[#1c221e] border border-outline-variant rounded-xl px-4 py-2 text-on-surface text-body-sm focus:outline-none focus:border-primary-container"
                  />
                  {searchResults.length > 0 && !selectedUserObj && (
                    <div className="absolute top-full left-0 right-0 bg-[#1c221e] border border-outline-variant rounded-xl mt-1 z-20 overflow-hidden shadow-xl max-h-40 overflow-y-auto">
                      {searchResults.map(u => (
                        <div
                          key={u.id}
                          onClick={() => {
                            setSelectedUserObj(u);
                            setTargetUserId(u.id);
                            setUserSearch('');
                            setSearchResults([]);
                          }}
                          className="p-2.5 hover:bg-surface-variant/40 cursor-pointer flex justify-between items-center text-body-sm"
                        >
                          <span className="font-bold text-on-surface">{u.full_name}</span>
                          <span className="text-[10px] text-primary-container bg-[#1f2924] px-2 py-0.5 rounded uppercase">{u.role}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>


            <button
              type="submit"
              disabled={submitting}
              className="bg-primary-container hover:bg-primary-container/90 text-on-primary-container font-semibold py-3 px-4 rounded-xl mt-2 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <span className="animate-spin h-5 w-5 border-2 border-on-primary-container border-t-transparent rounded-full" />
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">send</span>
                  <span>Send Broadcast Announcement</span>
                </>
              )}
            </button>

          </form>
        </div>

        {/* Broadcast History */}
        <div className="lg:col-span-6 flex flex-col gap-6">
        <div data-testid="pending-broadcasts" className="card-bg rounded-xl border border-outline-variant p-6 flex flex-col gap-4">
          <h2 className="font-headline-lg-mobile text-on-surface border-b border-outline-variant/30 pb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-container">pending_actions</span>
            <span>Expert Announcements Waiting for Review ({pending.length})</span>
          </h2>
          {pending.length === 0 ? (
            <div className="p-4 text-center text-on-surface-variant/50 text-body-sm">Nothing waiting. Experts' announcements appear here before anyone receives them.</div>
          ) : pending.map(b => (
            <div key={b.id} data-testid="pending-broadcast" className="bg-surface-variant/30 p-4 rounded-xl border border-primary-container/40 flex flex-col gap-2">
              <div className="flex justify-between items-start gap-2">
                <h3 className="font-bold text-on-surface text-body-sm">{b.title}</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#F5A623]/20 text-[#F5A623]">pending</span>
              </div>
              <p className="text-on-surface-variant text-body-sm whitespace-pre-wrap">{b.message}</p>
              <div className="text-[11px] text-on-surface-variant/70">
                From <strong className="text-on-surface">{b.sender?.full_name || 'Expert'}</strong> · To {b.target_role ? `${b.target_role}s` : 'everyone'} · {new Date(b.created_at).toLocaleString()}
              </div>
              <input
                type="text"
                value={rejectNotes[b.id] || ''}
                onChange={(e) => setRejectNotes(prev => ({ ...prev, [b.id]: e.target.value }))}
                placeholder="Reason, if you reject it (sent to the expert)"
                className="w-full bg-[#1c221e] border border-outline-variant rounded-xl px-3 py-2 text-on-surface text-body-sm focus:outline-none focus:border-primary-container"
              />
              <div className="flex gap-2">
                <button type="button" disabled={reviewingId === b.id} onClick={() => handleReview(b, true)}
                  className="flex-1 bg-primary-container text-on-primary-container font-semibold py-2 rounded-xl cursor-pointer disabled:opacity-50">
                  Approve &amp; send
                </button>
                <button type="button" disabled={reviewingId === b.id} onClick={() => handleReview(b, false)}
                  className="flex-1 bg-error/20 text-error font-semibold py-2 rounded-xl cursor-pointer disabled:opacity-50">
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="card-bg rounded-xl border border-outline-variant p-6 flex flex-col gap-4">
          <h2 className="font-headline-lg-mobile text-on-surface border-b border-outline-variant/30 pb-3">
            Recent Broadcasts ({history.length})
          </h2>

          {loading ? (
            <div className="flex items-center justify-center p-12">
              <span className="animate-spin h-8 w-8 border-4 border-primary-container border-t-transparent rounded-full" />
            </div>
          ) : history.length === 0 ? (
            <div className="p-8 text-center text-on-surface-variant/50">No broadcasts sent yet</div>
          ) : (
            <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto pr-1">
              {history.map(b => (
                <div key={b.id} className="bg-surface-variant/30 p-4 rounded-xl border border-outline-variant/30 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <h3 className="font-bold text-on-surface text-body-sm">{b.title}</h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      b.status === 'rejected' ? 'bg-error/20 text-error' : 'bg-primary-container/20 text-primary-container'
                    }`}>
                      {b.status === 'rejected' ? 'rejected' : 'sent'}
                    </span>
                  </div>
                  <p className="text-on-surface-variant text-body-sm line-clamp-2">{b.message}</p>
                  {b.sender?.role === 'Expert' && (
                    <span className="text-[11px] text-on-surface-variant/70">
                      Written by expert {b.sender.full_name}{b.review_note ? ` · Reason: ${b.review_note}` : ''}
                    </span>
                  )}
                  <div className="flex justify-between items-center text-[11px] text-on-surface-variant/70 border-t border-outline-variant/20 pt-2 mt-1">
                    <span>Recipients: <strong className="text-on-surface">{b.recipient_count || 0} users</strong></span>
                    <span>{new Date(b.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>

      </div>
    </div>
  );
}
