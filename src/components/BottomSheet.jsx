import React from 'react';
import './components.css';

export default function BottomSheet({ 
  isOpen, 
  onClose, 
  children 
}) {
  if (!isOpen) return null;

  return (
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div className="bottom-sheet-content" onClick={(e) => e.stopPropagation()}>
        <div className="bottom-sheet-drag-handle" onClick={onClose}></div>
        {children}
      </div>
    </div>
  );
}
