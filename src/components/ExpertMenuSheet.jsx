import React from 'react';
import BottomSheet from './BottomSheet';

export default function ExpertMenuSheet({
  isOpen,
  onClose,
  expertProfile,
  onCustomizeAvailability,
  onMeetingHistory,
  onExpertProfile,
  onUpdateResume,
  onLeaveExpertMode
}) {
  if (!expertProfile) return null;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Identity Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '8px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
          <img
            src={expertProfile.avatar || '/profile-placeholder.png'}
            alt={expertProfile.name}
            style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', border: '2.5px solid var(--primary-green)' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
            <h3 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text-primary)' }}>{expertProfile.name}</h3>
            <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)', fontSize: '18px' }}>verified</span>
          </div>
          <span className="badge-role">{expertProfile.role}</span>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '280px', lineHeight: '1.4' }}>
            {expertProfile.bio}
          </p>
        </div>

        {/* Menu Item Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Row 1: Customize Availability */}
          <div
            onClick={() => { onClose(); onCustomizeAvailability(); }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '12px', backgroundColor: '#1E1E1E', cursor: 'pointer', border: '1px solid var(--border-color)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)' }}>edit_calendar</span>
              <span style={{ fontSize: '14px', fontWeight: '600' }}>Customize Availability</span>
            </div>
            <span className="material-symbols-outlined" style={{ color: 'var(--text-secondary)' }}>chevron_right</span>
          </div>

          {/* Row 2: Meeting History */}
          <div
            onClick={() => { onClose(); onMeetingHistory(); }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '12px', backgroundColor: '#1E1E1E', cursor: 'pointer', border: '1px solid var(--border-color)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)' }}>history</span>
              <span style={{ fontSize: '14px', fontWeight: '600' }}>Meeting History</span>
            </div>
            <span className="material-symbols-outlined" style={{ color: 'var(--text-secondary)' }}>chevron_right</span>
          </div>

          {/* Row 3: Expert Profile */}
          <div
            onClick={() => { onClose(); onExpertProfile(); }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '12px', backgroundColor: '#1E1E1E', cursor: 'pointer', border: '1px solid var(--border-color)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)' }}>badge</span>
              <span style={{ fontSize: '14px', fontWeight: '600' }}>Expert Profile</span>
            </div>
            <span className="material-symbols-outlined" style={{ color: 'var(--text-secondary)' }}>chevron_right</span>
          </div>

          {/* Row 3b: Update Resume */}
          <div
            onClick={() => { onClose(); onUpdateResume(); }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '12px', backgroundColor: '#1E1E1E', cursor: 'pointer', border: '1px solid var(--border-color)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)' }}>upload_file</span>
              <span style={{ fontSize: '14px', fontWeight: '600' }}>Update Resume (PDF)</span>
            </div>
            <span className="material-symbols-outlined" style={{ color: 'var(--text-secondary)' }}>chevron_right</span>
          </div>

          {/* Row 4: Leave Expert Mode */}
          <div
            onClick={() => { onClose(); onLeaveExpertMode(); }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '12px', backgroundColor: 'rgba(231, 76, 60, 0.1)', cursor: 'pointer', border: '1px solid rgba(231, 76, 60, 0.3)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--error)' }}>logout</span>
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--error)' }}>Leave Expert Mode</span>
            </div>
            <span className="material-symbols-outlined" style={{ color: 'var(--error)' }}>chevron_right</span>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
