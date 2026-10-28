import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import ConfirmDialog from './ConfirmDialog';

// "Remove expert role → normal user". Shows what changes first (admin_expert_removal_preview); upcoming consultations
// are cancelled only when the admin ticks the box (demote_expert p_cancel_upcoming). userId null = closed.
export default function RemoveExpertDialog({ userId, onClose, onDone }) {
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setPreview(null); setLoadError(null); setConfirmCancel(false); setError(null);
    if (!userId) return;
    let live = true;
    supabase.rpc('admin_expert_removal_preview', { p_user_id: userId }).then(({ data, error: e }) => {
      if (!live) return;
      if (e) setLoadError(e.message || 'The account could not be loaded.');
      else setPreview(data);
    });
    return () => { live = false; };
  }, [userId]);

  if (!userId) return null;
  const close = () => { if (!busy) onClose(); };

  if (loadError || (preview && (preview.is_self || preview.role === 'Admin'))) {
    return (
      <ConfirmDialog open title="Remove expert role" message={loadError || 'This account cannot be changed here.'}
        cancelLabel="Close" onCancel={close} onConfirm={close} confirmLabel="OK" />
    );
  }
  if (!preview) {
    return <ConfirmDialog open title="Remove expert role" message="Loading…" onCancel={close} onConfirm={() => {}} busy />;
  }

  const upcoming = preview.upcoming || [];
  const name = preview.full_name || 'this expert';
  const confirm = async () => {
    if (upcoming.length > 0 && !confirmCancel) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('demote_expert', { p_user_id: userId, p_cancel_upcoming: upcoming.length > 0 });
    setBusy(false);
    if (e) { setError(e.message || 'The expert role could not be removed.'); return; }
    const n = data?.cancelled_bookings || 0;
    onDone({ ...data, text: `${name} is now a normal user.${n > 0 ? ` ${n} consultation${n === 1 ? ' was' : 's were'} cancelled with a full refund.` : ''}` });
  };

  return (
    <ConfirmDialog
      open
      danger
      busy={busy || (upcoming.length > 0 && !confirmCancel)}
      title={`Remove ${name}'s expert role?`}
      message="They become a normal user. Their account, profile, posts, messages, past consultations, reviews and expert application history are kept. They can no longer set a fee, publish availability or appear in Catch Up."
      confirmLabel="Remove expert role"
      onConfirm={confirm}
      onCancel={close}
    >
      {upcoming.length > 0 && (
        <div className="flex flex-col gap-2 border border-error/30 rounded-lg p-3" data-testid="removal-upcoming">
          <span className="text-body-sm font-semibold text-error">Upcoming consultations ({upcoming.length})</span>
          <ul className="text-body-sm text-on-surface-variant list-disc pl-5">
            {upcoming.map((b) => (
              <li key={b.booking_id}>{b.meeting_date} at {String(b.meeting_time).slice(0, 5)} with {b.farmer_name || 'a farmer'}</li>
            ))}
          </ul>
          <label className="flex items-start gap-2 text-body-sm text-on-surface cursor-pointer">
            <input type="checkbox" checked={confirmCancel} onChange={(e) => setConfirmCancel(e.target.checked)} className="mt-1" />
            <span>Cancel these {upcoming.length} upcoming consultations. Each farmer gets a full refund and a notification.</span>
          </label>
        </div>
      )}
      {error && <p role="alert" className="text-body-sm text-error">{error}</p>}
    </ConfirmDialog>
  );
}
