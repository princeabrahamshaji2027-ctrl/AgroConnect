import React, { useEffect, useState } from 'react';
import InputField from '../components/InputField';
import { Button } from '../components/Button';
import PasswordRequirements from '../components/PasswordRequirements';
import { validatePassword } from '../utils/validation';
import { friendlyAuthError } from '../utils/authRecovery';
import { supabase } from '../supabase';
import './pages.css';

// "Set new password", shown only after a password-reset link was exchanged for a recovery session on this device.
// The password is changed for the account in that session — the screen takes no user id or e-mail from the link.
export default function ResetPassword({ onDone, onCancel }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [hasSession, setHasSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      setEmail(session?.user?.email || '');
    });
  }, []);

  const policy = validatePassword(password, email);
  const canSubmit = hasSession && policy.isValid && password === confirm && !saving;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) { setError(friendlyAuthError(err)); return; }
    onDone();
  };

  return (
    <div className="auth-container fade-in">
      <div className="auth-header">
        <h2 className="auth-title">Set a new password</h2>
        <p className="auth-subtitle">{email ? 'Choose a new password for your account.' : 'Choose a new password.'}</p>
      </div>

      {!hasSession ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div role="alert" style={{ backgroundColor: 'rgba(231, 76, 60, 0.15)', color: '#ff6b6b', padding: '12px 16px', borderRadius: '12px', fontSize: '13px' }}>
            This reset link is no longer valid. Please request a new one.
          </div>
          <Button type="button" variant="primary" onClick={onCancel}>Back to Log In</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {error && (
            <div role="alert" style={{ backgroundColor: 'rgba(231, 76, 60, 0.15)', color: '#ff6b6b', padding: '12px 16px', borderRadius: '12px', fontSize: '13px', border: '1px solid rgba(231, 76, 60, 0.3)' }}>
              {error}
            </div>
          )}
          <InputField label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} icon="lock" autoComplete="new-password" required />
          <InputField label="Confirm new password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} icon="lock" autoComplete="new-password" required />
          <PasswordRequirements password={password} confirmPassword={confirm} />
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {saving ? 'Saving…' : 'Save new password'}
          </Button>
          <Button type="button" variant="text" onClick={onCancel} disabled={saving}>Cancel</Button>
        </form>
      )}
    </div>
  );
}
