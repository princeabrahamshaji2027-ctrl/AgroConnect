import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import defaultAvatar from '../assets/profile-placeholder.png';

export default function UserProfileModal({ userId, onClose, onRefresh }) {
  const [userProfile, setUserProfile] = useState(null);
  const [userPosts, setUserPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBanModal, setShowBanModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [userStats, setUserStats] = useState({ posts: 0, orders: 0, reviews: 0 });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUserData = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // 1. Fetch Profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      setUserProfile(profile);

      // 2. Fetch User Posts
      const { data: posts } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      setUserPosts(posts || []);

      // 3. Check attached records (orders, posts, reviews)
      const { count: orderCount } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('buyer_id', userId);

      const { count: reviewCount } = await supabase
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .eq('reviewer_id', userId);

      setUserStats({
        posts: posts?.length || 0,
        orders: orderCount || 0,
        reviews: reviewCount || 0
      });

    } catch (err) {
      console.error('Error fetching user modal profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, [userId]);

  const handleBanUser = async () => {
    if (!banReason) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc('ban_user', {
        p_user_id: userId,
        p_reason: banReason
      });
      if (error) throw error;
      setShowBanModal(false);
      fetchUserData();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Error banning user: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnbanUser = async () => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_banned: false, ban_reason: null, banned_at: null })
        .eq('id', userId);

      if (error) throw error;

      await supabase.from('admin_audit_log').insert({
        admin_id: (await supabase.auth.getUser()).data.user?.id,
        action: 'unban_user',
        target_table: 'profiles',
        target_id: userId,
        details: { reason: 'Unbanned via user profile modal' }
      });

      fetchUserData();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Error unbanning user: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (mode) => {
    // mode: 'soft' (anonymize + ban) or 'hard' (delete row)
    setActionLoading(true);
    try {
      if (mode === 'soft') {
        const { error } = await supabase
          .from('profiles')
          .update({
            full_name: 'Anonymized User',
            bio: 'This account has been deleted by an administrator.',
            is_banned: true,
            ban_reason: 'Account deleted by admin (anonymized)'
          })
          .eq('id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('profiles')
          .delete()
          .eq('id', userId);
        if (error) throw error;
      }

      await supabase.from('admin_audit_log').insert({
        admin_id: (await supabase.auth.getUser()).data.user?.id,
        action: mode === 'soft' ? 'anonymize_delete_user' : 'hard_delete_user',
        target_table: 'profiles',
        target_id: userId
      });

      setShowDeleteModal(false);
      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      alert(`Error deleting user: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const hasAttachedHistory = userStats.posts > 0 || userStats.orders > 0 || userStats.reviews > 0;

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="max-w-2xl w-full card-bg rounded-2xl border border-outline-variant p-6 flex flex-col gap-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-outline-variant/30 pb-4">
          <h2 className="font-headline-lg text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-container">account_circle</span>
            <span>User Profile Detail</span>
          </h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface cursor-pointer">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <span className="animate-spin h-8 w-8 border-4 border-primary-container border-t-transparent rounded-full" />
          </div>
        ) : !userProfile ? (
          <div className="p-8 text-center text-on-surface-variant">User profile not found.</div>
        ) : (
          <div className="flex flex-col gap-6">
            
            {/* User Overview */}
            <div className="flex items-start gap-4 bg-surface-container p-4 rounded-xl border border-outline-variant/40">
              <img
                src={userProfile.profile_image_path || defaultAvatar}
                alt={userProfile.full_name}
                className="w-16 h-16 rounded-full object-cover border border-outline-variant"
              />
              <div className="flex-1 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-headline-lg-mobile text-on-surface font-bold">
                    {userProfile.full_name || 'Anonymous User'}
                  </h3>
                  <span className="bg-[#1f2924] text-primary-container text-[11px] font-bold px-3 py-1 rounded-full uppercase">
                    {userProfile.role || 'Farmer'}
                  </span>
                </div>
                <p className="text-body-sm text-on-surface-variant font-mono text-[12px]">ID: {userProfile.id}</p>
                <p className="text-body-sm text-on-surface-variant">{userProfile.location || 'Location not specified'}</p>
                {userProfile.bio && <p className="text-body-sm text-on-surface mt-1 italic">"{userProfile.bio}"</p>}
              </div>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="bg-[#171A1D] p-3 rounded-xl border border-outline-variant/30">
                <div className="font-headline-lg text-on-surface font-bold">{userPosts.length}</div>
                <div className="text-[11px] text-on-surface-variant">Posts</div>
              </div>
              <div className="bg-[#171A1D] p-3 rounded-xl border border-outline-variant/30">
                <div className="font-headline-lg text-primary-container font-bold">{userProfile.follower_count || 0}</div>
                <div className="text-[11px] text-on-surface-variant">Connections</div>
              </div>
              <div className="bg-[#171A1D] p-3 rounded-xl border border-outline-variant/30">
                <div className="font-headline-lg text-secondary-container font-bold">{userStats.orders}</div>
                <div className="text-[11px] text-on-surface-variant">Orders</div>
              </div>
              <div className="bg-[#171A1D] p-3 rounded-xl border border-outline-variant/30">
                <div className="font-headline-lg text-on-surface font-bold">{userStats.reviews}</div>
                <div className="text-[11px] text-on-surface-variant">Reviews</div>
              </div>
            </div>

            {/* Account Status & Admin Action Bar */}
            <div className="flex items-center justify-between bg-surface-variant/40 p-4 rounded-xl border border-outline-variant/30">
              <div>
                <span className="text-[12px] text-on-surface-variant font-bold uppercase tracking-wider block">Account Status</span>
                {userProfile.is_banned ? (
                  <span className="text-error font-bold text-body-sm flex items-center gap-1 mt-0.5">
                    <span className="material-symbols-outlined text-[16px]">block</span>
                    <span>Banned ({userProfile.ban_reason || 'No reason specified'})</span>
                  </span>
                ) : (
                  <span className="text-primary font-bold text-body-sm flex items-center gap-1 mt-0.5">
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    <span>Active Account</span>
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                {userProfile.is_banned ? (
                  <button
                    onClick={handleUnbanUser}
                    disabled={actionLoading}
                    className="bg-primary-container/10 text-primary-container hover:bg-primary-container/20 border border-primary-container/30 px-4 py-2 rounded-lg font-label-md transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Unban User
                  </button>
                ) : (
                  <button
                    onClick={() => { setBanReason(''); setShowBanModal(true); }}
                    disabled={actionLoading}
                    className="bg-error/10 text-error hover:bg-error/20 border border-error/30 px-4 py-2 rounded-lg font-label-md transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Ban User
                  </button>
                )}

                <button
                  onClick={() => setShowDeleteModal(true)}
                  disabled={actionLoading}
                  className="bg-error hover:bg-error/90 text-on-error font-semibold px-4 py-2 rounded-lg font-label-md transition-colors cursor-pointer disabled:opacity-50"
                >
                  Delete User
                </button>
              </div>
            </div>

            {/* Posts List */}
            <div>
              <h4 className="font-headline-lg-mobile text-on-surface font-bold mb-3">User Posts ({userPosts.length})</h4>
              {userPosts.length === 0 ? (
                <div className="text-center p-6 text-on-surface-variant/60 bg-[#171A1D] rounded-xl border border-outline-variant/30">
                  No posts published by this user.
                </div>
              ) : (
                <div className="flex flex-col gap-3 max-h-60 overflow-y-auto pr-1">
                  {userPosts.map(post => (
                    <div key={post.id} className="bg-[#171A1D] p-3 rounded-xl border border-outline-variant/30 flex gap-3 items-start">
                      {post.image_path && (
                        <img src={post.image_path} alt="Post" className="w-14 h-14 rounded-lg object-cover" />
                      )}
                      <div className="flex-1">
                        <p className="text-body-sm text-on-surface line-clamp-2">{post.caption}</p>
                        <span className="text-[10px] text-on-surface-variant block mt-1">
                          {post.like_count || 0} Likes • {post.category || 'General'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* Ban Reason Sub-modal */}
        {showBanModal && (
          <div className="fixed inset-0 bg-black/80 z-60 flex items-center justify-center p-4">
            <div className="max-w-md w-full card-bg rounded-xl border border-outline-variant p-6 flex flex-col gap-4 shadow-2xl">
              <h3 className="font-headline-lg-mobile text-on-surface font-bold">Ban Account</h3>
              <p className="text-body-sm text-on-surface-variant">Provide a reason for banning {userProfile?.full_name}:</p>
              <textarea
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Enter formal ban reason..."
                className="w-full bg-[#1c221e] border border-outline-variant rounded-lg p-3 text-on-surface text-body-sm focus:outline-none focus:border-error h-24"
              />
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowBanModal(false)} className="bg-surface-variant text-on-surface px-4 py-2 rounded-lg font-label-md">Cancel</button>
                <button onClick={handleBanUser} disabled={!banReason || actionLoading} className="bg-error text-on-error px-4 py-2 rounded-lg font-label-md font-semibold">Confirm Ban</button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Explanation Sub-modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/80 z-60 flex items-center justify-center p-4">
            <div className="max-w-md w-full card-bg rounded-xl border border-outline-variant p-6 flex flex-col gap-4 shadow-2xl">
              <div className="flex items-center gap-2 text-error">
                <span className="material-symbols-outlined text-[28px]">warning</span>
                <h3 className="font-headline-lg-mobile font-bold text-on-surface">Delete Account Options</h3>
              </div>
              
              {hasAttachedHistory ? (
                <div className="flex flex-col gap-3">
                  <p className="text-body-sm text-on-surface-variant leading-relaxed">
                    This user has active attached history (<strong className="text-on-surface">{userStats.posts} posts, {userStats.orders} orders, {userStats.reviews} reviews</strong>).
                  </p>
                  <div className="bg-error-container/20 border border-error/30 p-3 rounded-lg text-[12px] text-on-surface-variant">
                    <strong className="text-error block mb-1">Recommended Action: Anonymize & Soft Delete</strong>
                    Hard deleting will permanently break order history, reviews, and post references across the platform. Anonymizing replaces personal data while preserving data integrity.
                  </div>
                  <div className="flex flex-col gap-2 mt-2">
                    <button
                      onClick={() => handleDeleteUser('soft')}
                      disabled={actionLoading}
                      className="bg-primary-container text-on-primary-container font-semibold py-2.5 px-4 rounded-lg font-label-md transition-colors text-center cursor-pointer"
                    >
                      Anonymize & Deactivate (Recommended)
                    </button>
                    <button
                      onClick={() => handleDeleteUser('hard')}
                      disabled={actionLoading}
                      className="bg-error/20 hover:bg-error/30 text-error border border-error/40 py-2 px-4 rounded-lg font-label-md transition-colors text-center cursor-pointer"
                    >
                      Force Hard Delete (Cascades & Destroys History)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-body-sm text-on-surface-variant">
                    This user has no attached posts, orders, or reviews. You can safely hard-delete their account profile row.
                  </p>
                  <div className="flex justify-end gap-3 mt-2">
                    <button onClick={() => setShowDeleteModal(false)} className="bg-surface-variant text-on-surface px-4 py-2 rounded-lg font-label-md">Cancel</button>
                    <button onClick={() => handleDeleteUser('hard')} disabled={actionLoading} className="bg-error text-on-error font-semibold px-4 py-2 rounded-lg font-label-md">Confirm Hard Delete</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
