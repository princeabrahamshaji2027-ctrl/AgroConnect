import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import UserProfileModal from '../components/UserProfileModal';
import defaultAvatar from '../assets/profile-placeholder.png';
import { DISTRICTS } from '../constants/districts';
import InlineNotice, { FieldError } from '../components/InlineNotice';
import ConfirmDialog from '../components/ConfirmDialog';
import RemoveExpertDialog from '../components/RemoveExpertDialog';

const ROLES = ['Farmer', 'Expert', 'Admin', 'Seller'];
const EMPTY_NEW_USER = { email: '', full_name: '', district: '' };

export default function Users() {
  const [notice, setNotice] = useState(null);   // in-page message (was window.alert)
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');   // '' = all, 'none' = not set
  const [showBanModal, setShowBanModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [banReason, setBanReason] = useState('');
  const [viewingProfileUserId, setViewingProfileUserId] = useState(null);
  const [roleFilter, setRoleFilter] = useState('');           // '' = all roles
  const [myId, setMyId] = useState(null);                     // the signed-in admin: no actions on their own row
  const [removeExpertId, setRemoveExpertId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newUser, setNewUser] = useState(EMPTY_NEW_USER);
  const [newUserErrors, setNewUserErrors] = useState({});
  const [adding, setAdding] = useState(false);
  const [setupLink, setSetupLink] = useState(null);           // shown once after creating an account; never stored

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
    supabase.auth.getUser().then(({ data }) => setMyId(data?.user?.id ?? null));
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
      setNotice({ type: 'error', text: err.message || 'Error banning user' });
    }
  };

  const handleUnbanUser = async (e, userId) => {
    e.stopPropagation();
    const { error } = await supabase.rpc('unban_user', { p_user_id: userId });
    if (error) { setNotice({ type: 'error', text: error.message || 'Error unbanning user' }); return; }
    setNotice({ type: 'success', text: 'The account is unbanned.' });
    fetchUsers();
  };

  // Admin-created accounts are always normal users; the admin gets a one-time link for the user to set a password.
  const handleAddUser = async () => {
    const errs = {};
    const email = newUser.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errs.email = 'Enter a valid e-mail address.';
    if (newUser.full_name.trim().length < 2 || newUser.full_name.trim().length > 100) errs.full_name = 'Enter the full name (2–100 characters).';
    setNewUserErrors(errs);
    if (Object.keys(errs).length) return;
    setAdding(true);
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: { email, full_name: newUser.full_name.trim(), district: newUser.district || null },
    });
    setAdding(false);
    if (error) {
      let msg = 'The account could not be created. Please try again.';
      let status = 0;
      try { status = error.context?.status; msg = (await error.context.json())?.error || msg; } catch { /* keep default */ }
      if (status === 409) setNewUserErrors({ email: 'An account with this e-mail already exists.' });
      else setNewUserErrors({ form: msg });
      return;
    }
    setAddOpen(false);
    setNewUser(EMPTY_NEW_USER);
    setSetupLink(data?.setup_link || '');
    fetchUsers();
  };


  const filteredUsers = users.filter(user => {
    if (roleFilter && user.role !== roleFilter) return false;
    const term = searchQuery.toLowerCase();
    if (districtFilter === 'none' ? !!user.district : districtFilter && user.district !== districtFilter) return false;
    return (
      user.full_name?.toLowerCase().includes(term) ||
      user.phone?.toLowerCase().includes(term) ||
      user.role?.toLowerCase().includes(term) ||
      user.location?.toLowerCase().includes(term) ||
      user.district?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      <InlineNotice notice={notice} onClose={() => setNotice(null)} />
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-headline-xl text-on-surface mb-1">Users</h1>
          <p className="font-body-sm text-on-surface-variant">Manage Agro Connect user accounts, view profiles, and handle bans.</p>
        </div>
        <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => { setNewUser(EMPTY_NEW_USER); setNewUserErrors({}); setAddOpen(true); }}
          className="bg-primary-container text-on-primary-container font-semibold px-4 py-2 rounded-lg font-label-md cursor-pointer whitespace-nowrap"
        >
          Add user
        </button>
        <select
          aria-label="Role"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-[#171A1D] border border-outline-variant rounded-lg px-3 py-2 text-on-surface text-body-sm"
        >
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          aria-label="District"
          value={districtFilter}
          onChange={(e) => setDistrictFilter(e.target.value)}
          className="bg-[#171A1D] border border-outline-variant rounded-lg px-3 py-2 text-on-surface text-body-sm"
        >
          <option value="">All districts</option>
          {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
          <option value="none">District not set</option>
        </select>
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
                <th className="p-4">District</th>
                <th className="p-4">Location</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-body-sm divide-y divide-outline-variant/20">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-on-surface-variant/50">No users found</td>
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
                    <td className="p-4 text-on-surface">{user.district || <span className="text-on-surface-variant/60">Not set</span>}</td>
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
                    <td className="p-4 text-right whitespace-nowrap">
                      {user.id === myId || user.role === 'Admin' ? (
                        <span className="text-on-surface-variant/50">—</span>
                      ) : (
                      <div className="inline-flex items-center gap-2 justify-end">
                      {user.role === 'Expert' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setRemoveExpertId(user.id); }}
                          className="bg-surface-variant text-on-surface hover:bg-surface-variant/70 border border-outline-variant px-3 py-1.5 rounded font-label-sm transition-colors cursor-pointer"
                        >
                          Remove expert role
                        </button>
                      )}
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
                      </div>
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
      <RemoveExpertDialog
        userId={removeExpertId}
        onClose={() => setRemoveExpertId(null)}
        onDone={(r) => { setRemoveExpertId(null); setNotice({ type: 'success', text: r.text }); fetchUsers(); }}
      />

      <ConfirmDialog
        open={addOpen}
        busy={adding}
        title="Add user"
        message="Creates a normal user account. Expert status comes only from an approved application."
        confirmLabel="Create account"
        onConfirm={handleAddUser}
        onCancel={() => { if (!adding) setAddOpen(false); }}
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
            E-mail
            <input type="email" aria-label="E-mail" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              className="bg-[#171A1D] border border-outline-variant rounded-lg px-3 py-2 text-on-surface" />
            <FieldError message={newUserErrors.email} />
          </label>
          <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
            Full name
            <input type="text" aria-label="Full name" maxLength={100} value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
              className="bg-[#171A1D] border border-outline-variant rounded-lg px-3 py-2 text-on-surface" />
            <FieldError message={newUserErrors.full_name} />
          </label>
          <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
            District (optional)
            <select aria-label="New user district" value={newUser.district} onChange={(e) => setNewUser({ ...newUser, district: e.target.value })}
              className="bg-[#171A1D] border border-outline-variant rounded-lg px-3 py-2 text-on-surface">
              <option value="">Not set</option>
              {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <FieldError message={newUserErrors.form} />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={setupLink !== null}
        title="Account created"
        message={setupLink ? 'Send this one-time link to the user so they can set their password. It expires in 1 hour.' : 'The account was created, but no set-up link could be made. The user can use "Forgot password" on the login screen.'}
        confirmLabel="Done"
        cancelLabel="Copy link"
        onConfirm={() => setSetupLink(null)}
        onCancel={() => { if (setupLink) navigator.clipboard?.writeText(setupLink); }}
      >
        {setupLink && <textarea readOnly aria-label="Set-up link" value={setupLink} rows={3} className="w-full bg-[#171A1D] border border-outline-variant rounded-lg p-2 text-[12px] text-on-surface" />}
      </ConfirmDialog>
    </div>
  );
}
