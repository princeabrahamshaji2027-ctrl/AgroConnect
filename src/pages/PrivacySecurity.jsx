import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { Button } from '../components/Button';
import PasswordRequirements from '../components/PasswordRequirements';
import { validatePassword } from '../utils/validation';
import { accountSignInMethods, changePassword, requestPasswordReset } from '../utils/authRecovery';
import './pages.css';

export default function PrivacySecurity({ onGoBack }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(
    localStorage.getItem('biometric_enabled') === 'true'
  );

  // Google-only accounts have no password; they are not asked for one.
  const [methods, setMethods] = useState(null);
  const [resetSent, setResetSent] = useState('');
  useEffect(() => { accountSignInMethods().then(setMethods); }, []);

  useEffect(() => {
    // Biometric availability is only detectable at native runtime.
    // The toggle appears only when explicitly supported — leave as false on web.
    setBiometricAvailable(false);
  }, []);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (saving) return;
    setMessage(null);

    if (!currentPassword) {
      setMessage({ type: 'error', text: 'Please enter your current password.' });
      return;
    }
    const pwdVal = validatePassword(newPassword, methods?.user?.email || '');
    if (!pwdVal.isValid) {
      setMessage({ type: 'error', text: pwdVal.errors[0] });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    setSaving(true);
    // Supabase Auth checks the current password (not this screen); only then is the new one saved.
    const res = await changePassword(currentPassword, newPassword);
    setSaving(false);
    setCurrentPassword('');
    if (!res.ok) {
      setMessage({ type: 'error', text: res.error });
      return;
    }
    setMessage({ type: 'success', text: 'Password updated successfully.' });
    setNewPassword('');
    setConfirmPassword('');
  };

  // Google-only account that wants a password as well: same e-mailed link as "Forgot Password?".
  const handleSendSetPasswordLink = async () => {
    setResetSent('');
    const res = await requestPasswordReset(methods?.user?.email || '');
    setResetSent(res.ok ? 'We sent a link to your email to set a password.' : res.error);
  };

  const toggleBiometric = () => {
    const next = !biometricEnabled;
    setBiometricEnabled(next);
    localStorage.setItem('biometric_enabled', String(next));
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header title="Privacy &amp; Security" showBack onBackClick={onGoBack} />

      <div className="page-container fade-in" style={{ gap: '20px' }}>
        
        {/* Change Password */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Change Password</h3>
          
          {methods && !methods.hasPassword ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              <p>You sign in with Google, so your account has no AgroConnect password to change. Keep using "Continue with Google".</p>
              <p>Want to sign in with email and password too? We can email you a link to set one.</p>
              <Button type="button" variant="secondary" onClick={handleSendSetPasswordLink}>Email me a link to set a password</Button>
              {resetSent && <div role="status" style={{ color: 'var(--primary-green)' }}>{resetSent}</div>}
            </div>
          ) : (
          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              aria-label="Current password"
              autoComplete="current-password"
              style={{ padding: '14px 16px', borderRadius: '14px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'white', fontSize: '14px', outline: 'none' }}
            />
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="New password"
              aria-label="New password"
              autoComplete="new-password"
              style={{ padding: '14px 16px', borderRadius: '14px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'white', fontSize: '14px', outline: 'none' }}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              aria-label="Confirm new password"
              autoComplete="new-password"
              style={{ padding: '14px 16px', borderRadius: '14px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'white', fontSize: '14px', outline: 'none' }}
            />

            <PasswordRequirements
              password={newPassword}
              confirmPassword={confirmPassword}
            />
            
            {message && (
              <div style={{
                padding: '12px 16px',
                borderRadius: '12px',
                fontSize: '13px',
                backgroundColor: message.type === 'success' ? 'rgba(46, 204, 113, 0.1)' : 'rgba(231, 76, 60, 0.1)',
                color: message.type === 'success' ? 'var(--primary-green)' : 'var(--error)',
                border: `1px solid ${message.type === 'success' ? 'rgba(46, 204, 113, 0.3)' : 'rgba(231, 76, 60, 0.3)'}`
              }}>
                {message.text}
              </div>
            )}

            <Button
              type="submit"
              disabled={saving}
              style={{ marginTop: '4px' }}
            >
              {saving ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
          )}
        </div>

        {/* Biometric Lock — only shown on native devices with biometric support */}
        {biometricAvailable && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Biometric Lock</h3>
            <div
              onClick={toggleBiometric}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)' }}>fingerprint</span>
                <div>
                  <div style={{ fontSize: '15px' }}>Biometric Authentication</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Use fingerprint or face ID to unlock</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={biometricEnabled}
                onChange={toggleBiometric}
                onClick={e => e.stopPropagation()}
                style={{ accentColor: 'var(--primary-green)', width: '20px', height: '20px', cursor: 'pointer' }}
              />
            </div>
          </div>
        )}

        {/* Security Tips */}
        <div style={{ padding: '14px 16px', borderRadius: '14px', backgroundColor: 'rgba(46, 204, 113, 0.05)', border: '1px solid rgba(46, 204, 113, 0.2)' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)', fontSize: '18px', marginTop: '1px' }}>tips_and_updates</span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--primary-green)', marginBottom: '4px' }}>Security Tips</div>
              <ul style={{ fontSize: '12px', color: 'var(--text-secondary)', paddingLeft: '14px', margin: 0, lineHeight: '1.7' }}>
                <li>Use a strong password with letters, numbers, and symbols</li>
                <li>Never share your password with anyone</li>
                <li>Enable biometric login for quick and secure access</li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
