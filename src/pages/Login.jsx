import React, { useState } from 'react';
import InputField from '../components/InputField';
import { Button } from '../components/Button';
import './pages.css';

export default function Login({ onLoginSuccess, onGoToRegister, onGoToAdminLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please fill in all fields');
      return;
    }
    // Perform dummy login
    setError('');
    onLoginSuccess(username === 'admin' ? 'admin' : 'user');
  };

  return (
    <div className="auth-container fade-in">
      <div className="auth-header">
        <img src="/logo.png" alt="Agro Connect Logo" className="auth-logo" />
        <h2 className="auth-title">Welcome Back</h2>
        <p className="auth-subtitle">Log in to connect with your farming community</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {error && (
          <div style={{ color: 'var(--error)', backgroundColor: 'rgba(255, 90, 90, 0.1)', padding: '12px', borderRadius: '12px', fontSize: '13px', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <InputField
          label="Email or Username"
          placeholder="Enter your email or username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          icon="person"
          required
        />

        <InputField
          label="Password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon="lock"
          required
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', marginTop: '-4px' }}>
          <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input type="checkbox" id="remember" style={{ accentColor: 'var(--primary-green)' }} />
            <label htmlFor="remember">Remember me</label>
          </span>
          <span className="auth-link" style={{ fontSize: '13px' }}>Forgot Password?</span>
        </div>

        <Button type="submit" variant="primary" style={{ marginTop: '16px' }}>
          Log In
        </Button>
      </form>

      <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0', gap: '12px' }}>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }}></div>
        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>OR</span>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }}></div>
      </div>

      <Button variant="secondary" icon="google" style={{ display: 'flex', justifyContent: 'center' }}>
        Continue with Google
      </Button>

      <div className="auth-footer">
        <p>Don't have an account? <span className="auth-link" onClick={onGoToRegister}>Sign Up</span></p>
        <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
          Are you an admin? <span className="auth-link" style={{ color: 'var(--text-secondary)' }} onClick={onGoToAdminLogin}>Admin Portal</span>
        </p>
      </div>
    </div>
  );
}
