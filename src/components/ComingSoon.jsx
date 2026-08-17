import React from 'react';

export default function ComingSoon({ feature }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '32px 16px', textAlign: 'center', gap: '12px' }}>
      <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--primary-green)' }}>schedule</span>
      <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>{feature} — Coming Soon</h3>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', maxWidth: '320px' }}>
        This feature is currently under active development and will be available in a future update.
      </p>
    </div>
  );
}
