import React, { useState } from 'react';
import InputField from '../components/InputField';
import { Button } from '../components/Button';
import { requestPasswordReset } from '../utils/authRecovery';
import './pages.css';

// "Forgot Password?" — sends Supabase's password-reset e-mail. The reply never says whether the address has an
// account. Google accounts keep signing in with Google; they can use this only if they also want a password.
export default function ForgotPassword({ onBackToLogin }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sentMessage, setSentMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sending) return;
    setError('');
    setSending(true);
    const res = await requestPasswordReset(email);
    setSending(false);
    if (res.ok) setSentMessage(res.message);
    else setError(res.error);
  };

  return (
    <div className="auth-container fade-in">
      <div className="auth-header">
        <h2 className="auth-title">Reset your password</h2>
        <p className="auth-subtitle">Enter the email you registered with. We will send you a link to set a new password.</p>
      </div>

      {sentMessage ? (
        <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ padding: '14px 16px', borderRadius: '14px', fontSize: '14px', lineHeight: '1.5', backgroundColor: 'rgba(46, 204, 113, 0.1)', border: '1px solid rgba(46, 204, 113, 0.3)', color: 'var(--primary-green)' }}>
            {sentMessage}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            Open the link on this phone. It works once and expires after a while. If nothing arrives, check your spam
            folder or try again in a few minutes. If you sign in with Google, use "Continue with Google" instead.
          </p>
          <Button type="button" variant="primary" onClick={onBackToLogin}>Back to Log In</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {error && (
            <div role="alert" style={{ backgroundColor: 'rgba(231, 76, 60, 0.15)', color: '#ff6b6b', padding: '12px 16px', borderRadius: '12px', fontSize: '13px', border: '1px solid rgba(231, 76, 60, 0.3)' }}>
              {error}
            </div>
          )}
          <InputField
            label="Email address"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon="mail"
            autoComplete="email"
            required
          />
          <Button type="submit" variant="primary" disabled={sending} style={{ marginTop: '8px' }}>
            {sending ? 'Sending…' : 'Send reset link'}
          </Button>
          <Button type="button" variant="text" onClick={onBackToLogin} disabled={sending}>Back to Log In</Button>
        </form>
      )}
    </div>
  );
}
