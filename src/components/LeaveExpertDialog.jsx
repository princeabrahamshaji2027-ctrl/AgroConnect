import React, { useState } from 'react';
import Dialog from './Dialog';
import { supabase } from '../supabase';

// "Leave being an expert": the expert writes why, and the request goes to the admin panel (Reports → Expert leave
// requests). Nothing changes until an admin approves it; then the badge and expert tools are removed.
export default function LeaveExpertDialog({ isOpen, onClose, onSubmitted, onShowToast }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (reason.trim().length < 5) {
      alert('Please tell us why you are leaving (at least 5 characters).');
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from('expert_resignations').insert({ user_id: user.id, reason: reason.trim() });
    setSubmitting(false);
    if (error) {
      alert(error.message);
      return;
    }
    setReason('');
    onClose();
    if (onShowToast) onShowToast('📨 Request sent. An admin will review it.');
    if (onSubmitted) onSubmitted();
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="Leave being an expert"
      confirmText={submitting ? 'Sending...' : 'Submit request'}
      onConfirm={handleSubmit}
      onCancel={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '12px 0' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
          Your request goes to the AgroConnect admin. After approval your expert badge and expert tools are removed and
          your account becomes a normal user account. Your meeting history is kept.
        </p>
        <div className="form-group">
          <label className="form-label">Why are you leaving? *</label>
          <div className="input-container" style={{ padding: '8px 16px' }}>
            <textarea
              className="input-field"
              rows="3"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. I am retiring from consulting"
              style={{ resize: 'none', height: '80px' }}
              required
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
