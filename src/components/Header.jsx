import React from 'react';
import './components.css';

export default function Header({
  title,
  showLogo = false,
  showBack = false,
  onBackClick,
  rightActions
}) {
  return (
    <header className="glass-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {showBack && (
          <button 
            onClick={onBackClick}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>arrow_back</span>
          </button>
        )}
        
        {showLogo ? (
          <img 
            src="/logo.png" 
            alt="Agro Connect Logo" 
            style={{ height: '32px', width: 'auto', objectFit: 'contain' }} 
          />
        ) : (
          <h1 style={{ fontSize: '18px', fontWeight: '700', letterSpacing: '-0.5px' }}>{title}</h1>
        )}
      </div>

      {rightActions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {rightActions}
        </div>
      )}
    </header>
  );
}
