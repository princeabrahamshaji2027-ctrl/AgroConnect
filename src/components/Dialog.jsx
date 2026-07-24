import React from 'react';
import './components.css';

export default function Dialog({ 
  isOpen, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel',
  children
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        {title && <h3 className="dialog-title">{title}</h3>}
        {message && <p className="dialog-body">{message}</p>}
        {children}
        <div className="dialog-actions">
          {onCancel && (
            <button className="btn btn-secondary" onClick={onCancel} style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '12px' }}>
              {cancelText}
            </button>
          )}
          {onConfirm && (
            <button className="btn btn-primary" onClick={onConfirm} style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '12px' }}>
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
