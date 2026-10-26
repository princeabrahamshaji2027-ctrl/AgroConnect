import React, { useState } from 'react';
import { supabase } from '../supabase';
import PasswordRequirements from '../components/PasswordRequirements';
import { validatePassword } from '../utils/validation';
import logoImg from '../assets/logo.png';

// Shown after opening a password-reset link (recovery session). Sets the new password for the signed-in account
// only (supabase.auth.updateUser); afterwards the admin signs in again with it.
export default function ResetPassword({ email, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const v = validatePassword(password, email);
    if (!v.isValid) { setError(v.errors[0]); return; }
    if (password !== confirm) { setError('The passwords do not match.'); return; }
    setError('');
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) {
      const m = err.message || '';
      setError(/same_password|should be different/i.test(m) ? 'Your new password must be different from your current password.'
        : /session|JWT|expired/i.test(m) ? 'This reset link has expired. Please request a new one.'
        : 'The password could not be changed. Please try again.');
      return;
    }
    onDone('Your password has been changed. Please sign in with your new password.');
  };

  const field = 'w-full bg-[#1c221e] border border-outline-variant rounded-xl px-4 py-3 text-on-surface text-body-sm focus:outline-none focus:border-primary-container';
  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center px-4">
      <form onSubmit={submit} className="max-w-md w-full card-bg rounded-2xl border border-outline-variant p-8 flex flex-col gap-4 shadow-2xl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl overflow-hidden border border-primary-container/30">
            <img src={logoImg} alt="AgroConnect Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="font-headline-xl text-on-surface font-bold">Set a new password</h1>
          {email && <p className="text-on-surface-variant text-body-sm">{email}</p>}
        </div>
        {error && (
          <div className="bg-error-container/20 border border-error/30 text-error rounded-xl p-4 text-[13px] text-center font-medium" role="alert">{error}</div>
        )}
        <label className="font-label-md text-on-surface-variant font-bold" htmlFor="new-password">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} required />
        <label className="font-label-md text-on-surface-variant font-bold" htmlFor="confirm-password">Confirm new password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} required />
        <PasswordRequirements password={password} email={email} confirmPassword={confirm} />
        <button type="submit" disabled={saving} className="w-full bg-primary-container text-on-primary-container font-semibold py-3 rounded-xl mt-2 disabled:opacity-50 cursor-pointer">
          {saving ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </div>
  );
}
