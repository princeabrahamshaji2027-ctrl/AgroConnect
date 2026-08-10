import React from 'react';
import defaultAvatar from '../assets/default-avatar.png';

export default function TopNav({ userProfile, onLogout }) {
  return (
    <header className="fixed top-0 right-0 w-[calc(100%-260px)] h-16 bg-surface border-b border-outline-variant flex justify-between items-center px-6 z-40">
      <div className="flex items-center">
        <span className="material-symbols-outlined text-on-surface-variant cursor-pointer mr-4">menu</span>
      </div>

      <div className="flex items-center gap-3 border-l border-outline-variant pl-6 cursor-pointer">
        <div className="flex flex-col items-end">
          <span className="font-label-md text-on-surface font-bold">
            {userProfile?.full_name || 'Admin'}
          </span>
          <span className="font-label-sm text-on-surface-variant">Super Admin</span>
        </div>
        <img
          alt="Admin User Avatar"
          className="w-9 h-9 rounded-full object-cover border border-outline-variant"
          src={userProfile?.profile_image_path || defaultAvatar}
        />
      </div>
    </header>
  );
}
