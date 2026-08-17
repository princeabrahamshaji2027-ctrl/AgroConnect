import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Broadcasts() {
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Broadcast Form State
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState('all'); // 'all' | 'Expert' | 'Farmer' | 'Seller' | 'user'
  const [targetUserId, setTargetUserId] = useState('');
  const [actionType, setActionType] = useState('dismissible'); // 'dismissible' | 'forced'
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
        .select('*')
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
  }, []);

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

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmitBroadcast = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      alert('Please fill out Title and Message');
      return;
    }
    if (targetType === 'user' && !targetUserId) {
      alert('Please select a specific target user.');
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
        p_action_type: actionType
      });

      if (rpcError) throw rpcError;

      alert('📢 Broadcast sent successfully to target recipients!');
      setTitle('');
      setMessage('');
      setImageFile(null);
      setImagePreview('');
      setTargetType('all');
      setTargetUserId('');
      setSelectedUserObj(null);
      setActionType('dismissible');
      fetchBroadcasts();
    } catch (err) {
      alert(`Broadcast failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      <div>
        <h1 className="font-headline-xl text-on-surface mb-1">System Broadcasts</h1>
        <p className="font-body-sm text-on-surface-variant">Send system announcements, alerts, and forced notices to users across Agro Connect.</p>
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
                  accept="image/*"
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

            {/* Action Type Selector */}
            <div className="flex flex-col gap-2 border-t border-outline-variant/30 pt-3">
              <label className="font-label-md text-on-surface-variant font-bold">Action / Dismiss Behavior</label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`flex flex-col gap-1 p-3 rounded-xl border cursor-pointer transition-colors ${
                  actionType === 'dismissible'
                    ? 'bg-primary-container/10 border-primary-container text-primary-container'
                    : 'bg-[#1c221e] border-outline-variant/40 text-on-surface-variant'
                }`}>
                  <div className="flex items-center gap-2 font-bold text-body-sm">
                    <input
                      type="radio"
                      name="actionType"
                      checked={actionType === 'dismissible'}
                      onChange={() => setActionType('dismissible')}
                      className="accent-primary-container"
                    />
                    <span>Dismissible (Cancel)</span>
                  </div>
                  <span className="text-[11px] opacity-80">User sees a Cancel button and can close notice to continue.</span>
                </label>

                <label className={`flex flex-col gap-1 p-3 rounded-xl border cursor-pointer transition-colors ${
                  actionType === 'forced'
                    ? 'bg-error/10 border-error text-error'
                    : 'bg-[#1c221e] border-outline-variant/40 text-on-surface-variant'
                }`}>
                  <div className="flex items-center gap-2 font-bold text-body-sm">
                    <input
                      type="radio"
                      name="actionType"
                      checked={actionType === 'forced'}
                      onChange={() => setActionType('forced')}
                      className="accent-error"
                    />
                    <span>Forced ("Leave App")</span>
                  </div>
                  <span className="text-[11px] opacity-80">User cannot dismiss. Only button is "Leave App" (force quit).</span>
                </label>
              </div>
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
        <div className="lg:col-span-6 card-bg rounded-xl border border-outline-variant p-6 flex flex-col gap-4">
          <h2 className="font-headline-lg-mobile text-on-surface border-b border-outline-variant/30 pb-3">
            Recent Sent Broadcasts ({broadcasts.length})
          </h2>

          {loading ? (
            <div className="flex items-center justify-center p-12">
              <span className="animate-spin h-8 w-8 border-4 border-primary-container border-t-transparent rounded-full" />
            </div>
          ) : broadcasts.length === 0 ? (
            <div className="p-8 text-center text-on-surface-variant/50">No broadcasts sent yet</div>
          ) : (
            <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto pr-1">
              {broadcasts.map(b => (
                <div key={b.id} className="bg-surface-variant/30 p-4 rounded-xl border border-outline-variant/30 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <h3 className="font-bold text-on-surface text-body-sm">{b.title}</h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      b.action_type === 'forced' ? 'bg-error/20 text-error' : 'bg-primary-container/20 text-primary-container'
                    }`}>
                      {b.action_type}
                    </span>
                  </div>
                  <p className="text-on-surface-variant text-body-sm line-clamp-2">{b.message}</p>
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
  );
}
