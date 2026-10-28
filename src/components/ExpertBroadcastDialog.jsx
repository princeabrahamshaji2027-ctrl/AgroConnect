import React, { useEffect, useState } from 'react';
import Dialog from './Dialog';
import InputField, { FormMessage } from './InputField';
import { supabase } from '../supabase';

// "Send an announcement": an expert writes a short notice for everyone, farmers or experts. It goes to the admin panel
// (Broadcasts → Waiting for review) and reaches people only after an admin approves it (supabase/proposed/25).
const AUDIENCES = [
  { id: 'all', label: 'Everyone', role: null },
  { id: 'Farmer', label: 'Farmers', role: 'Farmer' },
  { id: 'Expert', label: 'Experts', role: 'Expert' },
];
const STATUS_TEXT = { pending: 'Waiting for admin', approved: 'Sent', rejected: 'Not approved' };
const STATUS_COLOR = { pending: '#F5A623', approved: 'var(--primary-green)', rejected: 'var(--error)' };
const titleRule = (v) => (v.trim().length < 2 ? 'Please add a title (at least 2 characters).' : v.trim().length > 120 ? 'Keep the title under 120 characters.' : null);
const messageRule = (v) => (v.trim().length < 5 ? 'Please write the announcement (at least 5 characters).' : v.trim().length > 1000 ? 'Keep it under 1000 characters.' : null);

export default function ExpertBroadcastDialog({ isOpen, onClose, onShowToast }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState('all');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [mine, setMine] = useState([]);

  const loadMine = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('broadcasts')
      .select('id, title, status, review_note, recipient_count, created_at')
      .eq('sent_by', user.id).order('created_at', { ascending: false }).limit(5);
    setMine(data || []);
  };
  useEffect(() => { if (isOpen) loadMine(); }, [isOpen]);

  const handleSubmit = async () => {
    if (submitting) return;
    setFormError(null);
    const next = { title: titleRule(title), message: messageRule(message) };
    setErrors(next);
    if (next.title || next.message) return;
    setSubmitting(true);
    const { error } = await supabase.rpc('submit_expert_broadcast', {
      p_title: title.trim(),
      p_message: message.trim(),
      p_target_role: AUDIENCES.find((a) => a.id === audience).role,
    });
    setSubmitting(false);
    if (error) { setFormError(error.message); return; }
    setTitle(''); setMessage(''); setAudience('all'); setErrors({});
    onClose();
    onShowToast?.('📨 Announcement sent to the admin for approval.');
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="Send an announcement"
      confirmText={submitting ? 'Sending...' : 'Send for approval'}
      confirmDisabled={submitting}
      onConfirm={handleSubmit}
      onCancel={onClose}
    >
      <div data-testid="expert-broadcast-form" style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '12px 0' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
          An admin checks every announcement before it is sent. You will get a notification when it is approved or declined.
        </p>
        <InputField label="Title *" value={title} placeholder="e.g. Rhinoceros beetle alert"
          onChange={(e) => { setTitle(e.target.value); if (errors.title) setErrors((p) => ({ ...p, title: titleRule(e.target.value) })); }}
          error={errors.title} />
        <InputField label="Announcement *" as="textarea" rows={4} value={message}
          placeholder="What should farmers know or do?"
          onChange={(e) => { setMessage(e.target.value); if (errors.message) setErrors((p) => ({ ...p, message: messageRule(e.target.value) })); }}
          error={errors.message} />
        <div style={{ display: 'flex', gap: '8px' }}>
          {AUDIENCES.map((a) => (
            <button key={a.id} type="button" onClick={() => setAudience(a.id)} aria-pressed={audience === a.id}
              style={{ flex: 1, padding: '8px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${audience === a.id ? 'var(--primary-green)' : 'var(--border-color)'}`,
                backgroundColor: audience === a.id ? 'rgba(46, 204, 113, 0.12)' : 'transparent',
                color: audience === a.id ? 'var(--primary-green)' : 'var(--text-secondary)' }}>
              {a.label}
            </button>
          ))}
        </div>
        <FormMessage>{formError}</FormMessage>
        {mine.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Your recent announcements</span>
            {mine.map((b) => (
              <div key={b.id} data-testid="my-broadcast" style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                <span style={{ color: STATUS_COLOR[b.status], fontWeight: 700, whiteSpace: 'nowrap' }}>{STATUS_TEXT[b.status]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
