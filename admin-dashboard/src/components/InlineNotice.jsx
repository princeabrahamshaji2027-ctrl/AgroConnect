import React from 'react';

// In-page message (replaces window.alert). notice = { type: 'error' | 'success' | 'info', text } or null.
export default function InlineNotice({ notice, onClose, className = '' }) {
  if (!notice?.text) return null;
  const tone = notice.type === 'error'
    ? 'bg-error-container/20 border-error/30 text-error'
    : notice.type === 'success'
      ? 'bg-primary-container/15 border-primary-container/40 text-on-surface'
      : 'bg-surface-variant/40 border-outline-variant text-on-surface';
  return (
    <div
      role={notice.type === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 border rounded-xl px-4 py-3 text-[13px] font-medium leading-5 ${tone} ${className}`}
    >
      <span className="material-symbols-outlined text-[18px] shrink-0">
        {notice.type === 'error' ? 'error' : notice.type === 'success' ? 'check_circle' : 'info'}
      </span>
      <span className="flex-1">{notice.text}</span>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close message" className="opacity-70 hover:opacity-100 cursor-pointer bg-transparent border-none p-0 text-inherit">
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      )}
    </div>
  );
}

// Message under a single form field.
export function FieldError({ message }) {
  if (!message) return null;
  return <p role="alert" className="text-error text-[12px] font-medium mt-0.5">{message}</p>;
}
