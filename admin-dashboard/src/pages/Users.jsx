import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import UserProfileModal from '../components/UserProfileModal';
import defaultAvatar from '../assets/profile-placeholder.png';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showBanModal, setShowBanModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [banReason, setBanReason] = useState('');
  const [viewingProfileUserId, setViewingProfileUserId] = useState(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleBanClick = (e, user) => {
    e.stopPropagation();
    setSelectedUser(user);
    setBanReason('');
    setShowBanModal(true);
  };

  const handleBanUserSubmit = async () => {
    if (!selectedUser || !banReason) return;
    try {
      const { error } = await supabase.rpc('ban_user', {
        p_user_id: selectedUser.id,
        p_reason: banReason
      });
      if (error) throw error;
      setShowBanModal(false);
      fetchUsers();
    } catch (err) {
      alert(err.message || 'Error banning user');
    }
  };

  const handleUnbanUser = async (e, userId) => {
    e.stopPropagation();
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
        details: { reason: 'Manually unbanned by administrator' }
      });

      fetchUsers();
    } catch (err) {
      alert(err.message || 'Error unbanning user');
    }
  };

  const filteredUsers = users.filter(user => {
    const term = searchQuery.toLowerCase();
    return (
      user.full_name?.toLowerCase().includes(term) ||
      user.phone?.toLowerCase().includes(term) ||
      user.role?.toLowerCase().includes(term) ||
      user.location?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-headline-xl text-on-surface mb-1">Users</h1>
          <p className="font-body-sm text-on-surface-variant">Manage Agro Connect user accounts, view profiles, and handle bans.</p>
        </div>
        <div className="relative w-80">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
          <input
            className="w-full bg-[#171A1D] border border-outline-variant rounded-lg pl-10 pr-4 py-2 text-on-surface text-body-sm focus:outline-none focus:border-primary-container transition-colors"
            placeholder="Search users..."
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
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
                <th className="p-4">User</th>
                <th className="p-4">Phone</th>
                <th className="p-4">Role</th>
                <th className="p-4">Location</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-body-sm divide-y divide-outline-variant/20">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-on-surface-variant/50">No users found</td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => setViewingProfileUserId(user.id)}
                    className="hover:bg-surface-variant/30 transition-colors cursor-pointer"
                  >
                    <td className="p-4 flex items-center gap-3">
                      <img
                        alt={user.full_name}
                        className="w-9 h-9 rounded-full object-cover border border-outline-variant"
                        src={user.profile_image_path || defaultAvatar}
                      />
                      <div className="flex flex-col">
                        <span className="font-bold text-on-surface hover:text-primary transition-colors">{user.full_name || 'Anonymous'}</span>
                        <span className="text-[10px] text-on-surface-variant font-mono">{user.id.substring(0, 8)}...</span>
                      </div>
                    </td>
                    <td className="p-4 text-on-surface-variant font-mono">{user.phone || 'N/A'}</td>
                    <td className="p-4">
                      <span className="bg-[#1f2924] text-primary-container text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">
                        {user.role}
                      </span>
                    </td>
                    <td className="p-4 text-on-surface-variant">{user.location || 'N/A'}</td>
                    <td className="p-4">
                      {user.is_banned ? (
                        <div className="flex flex-col">
                          <span className="text-error font-bold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">block</span>
                            <span>Banned</span>
                          </span>
                          <span className="text-[10px] text-on-surface-variant max-w-[150px] truncate">{user.ban_reason}</span>
                        </div>
                      ) : (
                        <span className="text-primary font-bold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">check_circle</span>
                          <span>Active</span>
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {user.is_banned ? (
                        <button
                          onClick={(e) => handleUnbanUser(e, user.id)}
                          className="bg-primary-container/10 text-primary-container hover:bg-primary-container/20 border border-primary-container/30 px-3 py-1.5 rounded font-label-sm transition-colors cursor-pointer"
                        >
                          Unban
                        </button>
                      ) : (
                        <button
                          onClick={(e) => handleBanClick(e, user)}
                          className="bg-error/10 text-error hover:bg-error/20 border border-error/30 px-3 py-1.5 rounded font-label-sm transition-colors cursor-pointer"
                        >
                          Ban User
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* User Profile Detail Modal */}
      {viewingProfileUserId && (
        <UserProfileModal
          userId={viewingProfileUserId}
          onClose={() => setViewingProfileUserId(null)}
          onRefresh={fetchUsers}
        />
      )}

      {/* Ban Reason Dialog Modal */}
      {showBanModal && selectedUser && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="max-w-md w-full card-bg rounded-xl border border-outline-variant p-6 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-3">
              <span className="material-symbols-outlined text-error text-[28px]">warning</span>
              <h2 className="font-headline-lg-mobile text-on-surface">Ban User Account</h2>
            </div>
            <p className="font-body-sm text-on-surface-variant">
              Are you sure you want to ban <strong className="text-on-surface">{selectedUser.full_name}</strong>? They will be blocked from performing any read/write actions on the platform.
            </p>
            <div className="flex flex-col gap-2">
              <label className="font-label-md text-on-surface-variant font-bold">Ban Reason</label>
              <textarea
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Enter formal reason for ban..."
                className="w-full bg-[#1c221e] border border-outline-variant rounded-lg p-3 text-on-surface text-body-sm focus:outline-none focus:border-error transition-colors h-24 placeholder:text-on-surface-variant/40"
              />
            </div>
            <div className="flex justify-end gap-3 mt-2 border-t border-outline-variant/30 pt-3">
              <button
                onClick={() => setShowBanModal(false)}
                className="bg-surface-variant text-on-surface hover:text-on-surface-variant px-4 py-2 rounded-lg font-label-md transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleBanUserSubmit}
                disabled={!banReason}
                className="bg-error hover:bg-error/95 text-on-error font-semibold px-4 py-2 rounded-lg font-label-md transition-colors cursor-pointer disabled:opacity-50"
              >
                Confirm Ban
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
