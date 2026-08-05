import React from 'react';

export default function TopNav({ userProfile, onSearchChange, notificationCount = 0 }) {
  const today = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <header className="fixed top-0 right-0 w-[calc(100%-260px)] h-16 bg-surface border-b border-outline-variant flex justify-between items-center px-6 z-40">
      <div className="flex items-center">
        <span className="material-symbols-outlined text-on-surface-variant cursor-pointer mr-4">menu</span>
      </div>

      <div className="flex-1 max-w-xl mx-4">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
          <input
            className="w-full bg-[#171A1D] border border-outline-variant rounded-lg pl-10 pr-4 py-2 text-on-surface text-body-sm focus:outline-none focus:border-primary-container transition-colors placeholder:text-on-surface-variant/50"
            placeholder="Search anything..."
            type="text"
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="relative cursor-pointer hover:text-primary transition-colors text-on-surface-variant">
            <span className="material-symbols-outlined">notifications</span>
            {notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-container rounded-full flex items-center justify-center text-[10px] font-bold text-on-primary">
                {notificationCount}
              </span>
            )}
          </div>
          <div className="cursor-pointer hover:text-primary transition-colors text-on-surface-variant">
            <span className="material-symbols-outlined">calendar_today</span>
          </div>
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
            src={userProfile?.profile_image_path || "https://lh3.googleusercontent.com/aida-public/AB6AXuCBppjcEyZbhisQCBybkq6-kIO6Nx43RhZKz7bgZ7ecB5kBxE1VrMLz8MFwq7eH0QK-HXaZQ1R9SndR2NOMV4sBtnIzunCDMwZtv4gyxLkuo3ku2x1vR2rx4r3p8BUZkXqTIG2o34p078QeSEYc9YrxW2B2vcTDoi7aJyS3zngube3F720kKwCA6XLKFyKSbhOawoKFdWeT_7v8XdNvcQjqlSIABpjPDLmWmzlAcOsfWvPmxWfp5bYn"}
          />
        </div>
      </div>
    </header>
  );
}
