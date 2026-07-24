import React, { useState } from 'react';
import InputField from '../components/InputField';
import { Button } from '../components/Button';
import './pages.css';

export default function AdminLogin({ onLoginSuccess, onGoToUserLogin }) {
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!adminEmail || !adminPassword) {
      setError('Please fill in all fields');
      return;
    }
    // Verify admin credentials
    if (adminEmail === 'admin@agroconnect.com' && adminPassword === 'admin123') {
      setError('');
      onLoginSuccess('admin');
    } else {
      setError('Invalid admin credentials. Use admin@agroconnect.com / admin123');
    }
  };

  return (
    <div className="auth-container fade-in">
      <div className="auth-header">
        <img src="/logo.png" alt="Agro Connect Logo" className="auth-logo" />
        <h2 className="auth-title" style={{ color: 'var(--primary-green)' }}>Admin Portal</h2>
        <p className="auth-subtitle">Login to access platform administration panel</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {error && (
          <div style={{ color: 'var(--error)', backgroundColor: 'rgba(255, 90, 90, 0.1)', padding: '12px', borderRadius: '12px', fontSize: '13px', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <InputField
          label="Admin Email"
          placeholder="admin@agroconnect.com"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          icon="admin_panel_settings"
          required
        />

        <InputField
          label="Password"
          type="password"
          placeholder="••••••••"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          icon="lock"
          required
        />

        <Button type="submit" variant="primary" style={{ marginTop: '16px' }}>
          Access Dashboard
        </Button>
      </form>

      <div className="auth-footer" style={{ marginTop: '24px' }}>
        <p>Looking for the member login? <span className="auth-link" onClick={onGoToUserLogin}>Go Back</span></p>
      </div>
    </div>
  );
}
