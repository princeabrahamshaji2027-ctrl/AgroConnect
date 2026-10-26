import React, { useState } from 'react';
import Dialog from './Dialog';
import InputField, { FormMessage } from './InputField';
import { supabase } from '../supabase';

// "Leave being an expert": the expert writes why, and the request goes to the admin panel (Reports → Expert leave
// requests). Nothing changes until an admin approves it; then the badge and expert tools are removed.
export default function LeaveExpertDialog({ isOpen, onClose, onSubmitted, onShowToast }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reasonError, setReasonError] = useState(null);
  const [formError, setFormError] = useState(null);
  const reasonRule = (val) => (val.trim().length < 5 ? 'Please tell us why you are leaving (at least 5 characters).' : null);

  const handleSubmit = async () => {
    if (submitting) return;
    setFormError(null);
    const err = reasonRule(reason);
    setReasonError(err);
    if (err) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from('expert_resignations').insert({ user_id: user.id, reason: reason.trim() });
    setSubmitting(false);
    if (error) {
      setFormError(/duplicate|already/i.test(error.message || '') ? 'You already have a request waiting for the admin.' : error.message);
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
        <InputField
          label="Why are you leaving? *"
          as="textarea"
          rows={3}
          value={reason}
          placeholder="e.g. I am retiring from consulting"
          onChange={(e) => { setReason(e.target.value); if (reasonError) setReasonError(reasonRule(e.target.value)); }}
          error={reasonError}
        />
        <FormMessage>{formError}</FormMessage>
      </div>
    </Dialog>
  );
}
