import React from 'react';

export default function ComingSoon({ feature }) {
  return (
    <div className="flex flex-col items-center justify-center h-[70vh] gap-4 text-center p-8 max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-primary-container/10 border border-primary-container/30 flex items-center justify-center text-primary-container">
        <span className="material-symbols-outlined text-[36px]">schedule</span>
      </div>
      <h2 className="font-headline-xl text-on-surface font-bold">{feature} — Coming Soon</h2>
      <p className="font-body-sm text-on-surface-variant leading-relaxed">
        This feature is currently under active development and will be released in an upcoming update.
      </p>
    </div>
  );
}
