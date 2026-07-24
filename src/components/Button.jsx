import React from 'react';
import './components.css';

export function Button({ 
  children, 
  onClick, 
  variant = 'primary', 
  type = 'button', 
  icon, 
  disabled = false,
  className = '' 
}) {
  const btnClass = variant === 'primary' 
    ? 'btn-primary' 
    : variant === 'secondary' 
      ? 'btn-secondary' 
      : 'btn-text';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn ${btnClass} ${className}`}
    >
      {icon && <span className="material-symbols-outlined">{icon}</span>}
      {children}
    </button>
  );
}

export function FAB({ onClick, icon = 'add', className = '' }) {
  return (
    <button 
      onClick={onClick}
      className={`btn-fab ${className}`}
      aria-label="Floating action button"
    >
      <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>{icon}</span>
    </button>
  );
}
