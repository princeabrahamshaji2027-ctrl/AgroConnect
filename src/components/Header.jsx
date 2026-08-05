import React from 'react';
import './components.css';

export default function Header({
  title,
  showLogo = false,
  showBack = false,
  onBackClick,
  rightActions,
  onPeaAIClick
}) {
  return (
    <header className="glass-header" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', width: '100%', paddingLeft: '16px', paddingRight: '16px' }}>
      {/* Left section: Back button + Logo/Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifySelf: 'start' }}>
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
          <h1 style={{ fontSize: '15px', fontWeight: '700', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>
            {title}
          </h1>
        )}
      </div>

      {/* Center section: PEA AI Button */}
      <div style={{ justifySelf: 'center' }}>
        {onPeaAIClick && (
          <button 
            type="button"
            onClick={onPeaAIClick}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px', 
              background: 'rgba(136, 217, 130, 0.15)', 
              border: 'none', 
              color: 'var(--primary-green)', 
              padding: '6px 12px', 
              borderRadius: '20px', 
              cursor: 'pointer', 
              fontWeight: '700',
              fontSize: '12px'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--primary-green)' }}>eco</span>
            <span>PEA</span>
          </button>
        )}
      </div>

      {/* Right section: Action items */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifySelf: 'end' }}>
        {rightActions}
      </div>
    </header>
  );
}
