import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { Button } from './Button';
import { formatInr, parseFeeInput, commissionSplit } from '../utils/money';

// The expert's own consultation fee (experts.consultation_fee_paise). Saved only through set_consultation_fee(), which
// re-validates on the server; farmers see this fee on the expert card and pay it at checkout. Changing it never
// changes bookings that are already confirmed.
export default function ConsultationFeeEditor({ feePaise, onSaved, onShowToast }) {
  const [value, setValue] = useState(feePaise ? String(feePaise / 100) : '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);   // show why Save is disabled as soon as the expert edits the field
  useEffect(() => { if (feePaise) setValue(String(feePaise / 100)); }, [feePaise]);

  const parsed = parseFeeInput(value);
  const preview = parsed.paise ? commissionSplit(parsed.paise) : null;
  const unchanged = parsed.paise === feePaise;

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (parsed.error) { setError(parsed.error); return; }
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('set_consultation_fee', { p_fee_paise: parsed.paise });
    setSaving(false);
    if (err) {
      setError(/Failed to fetch|NetworkError|network/i.test(err.message || '') ? 'No connection. Your fee was not saved — please try again.' : err.message);
      return;
    }
    onSaved?.(data);
    onShowToast?.(`Consultation fee saved: ${formatInr(data)}`);
  };

  return (
    <form onSubmit={save} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px', border: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '700' }}>Consultation fee</h4>
        <span data-testid="current-fee" style={{ fontSize: '13px', color: 'var(--primary-green)', fontWeight: 700 }}>
          {feePaise ? formatInr(feePaise) : '—'}
        </span>
      </div>
      <label htmlFor="consultation-fee-input" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
        Your fee per consultation (₹1 – ₹1,00,000). Farmers see it beside your name and pay it when they book.
      </label>
      <div className="input-container" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>₹</span>
        <input
          id="consultation-fee-input"
          className="input-field"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); setTouched(true); }}
          disabled={saving}
          aria-invalid={!!(error || (touched && parsed.error))}
        />
      </div>
      {(error || (touched && parsed.error)) && (
        <div role="alert" style={{ fontSize: '12px', color: 'var(--error)' }}>{error || parsed.error}</div>
      )}
      {preview && (
        <div data-testid="fee-split" style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          You receive <strong style={{ color: 'var(--text-primary)' }}>{formatInr(preview.share)}</strong> (98%) ·
          AgroConnect commission {formatInr(preview.commission)} (2%)
        </div>
      )}
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
        AgroConnect keeps 2% of each agreed fee as a platform commission. A new fee applies to new bookings only;
        confirmed bookings keep the fee agreed at booking time. See Settings → Terms &amp; Conditions.
      </div>
      <Button type="submit" variant="primary" icon="save" disabled={saving || !!parsed.error || unchanged}>
        {saving ? 'Saving…' : unchanged ? 'Saved' : 'Save fee'}
      </Button>
    </form>
  );
}
