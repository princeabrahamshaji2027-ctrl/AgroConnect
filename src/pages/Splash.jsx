import React, { useEffect } from 'react';
import './pages.css';

export default function Splash({ onFinish }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      if (onFinish) onFinish();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div className="splash-container fade-in">
      <img src="/logo.png" alt="Agro Connect Logo" className="splash-logo" />
      <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--primary-green)', letterSpacing: '-1px' }}>
        Agro Connect
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginTop: '8px', fontSize: '15px' }}>
        Connecting Farmers, Sharing Knowledge
      </p>
      
      <div style={{ marginTop: '48px', display: 'flex', gap: '6px' }}>
        <span className="material-symbols-outlined" style={{ animation: 'spin 1.5s infinite linear', color: 'var(--primary-green)', fontSize: '28px' }}>
          progress_activity
        </span>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}} />
    </div>
  );
}
