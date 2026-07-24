import React, { useState } from 'react';
import InputField from '../components/InputField';
import { Button } from '../components/Button';
import './pages.css';

export default function Register({ onRegisterSuccess, onGoToLogin }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || !username || !email || !phone || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    onRegisterSuccess();
  };

  return (
    <div className="auth-container fade-in" style={{ justifyContent: 'flex-start', paddingTop: '16px' }}>
      <div className="auth-header">
        <img src="/logo.png" alt="Agro Connect Logo" className="auth-logo" style={{ height: '40px' }} />
        <h2 className="auth-title">Create Account</h2>
        <p className="auth-subtitle">Join thousands of farmers sharing knowledge</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {error && (
          <div style={{ color: 'var(--error)', backgroundColor: 'rgba(255, 90, 90, 0.1)', padding: '12px', borderRadius: '12px', fontSize: '13px', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <InputField
          label="Full Name"
          placeholder="Enter your full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          icon="badge"
          required
        />

        <InputField
          label="Username"
          placeholder="Choose a username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          icon="person"
          required
        />

        <InputField
          label="Email Address"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          icon="mail"
          required
        />

        <InputField
          label="Phone Number"
          type="tel"
          placeholder="Enter your phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          icon="phone"
          required
        />

        <InputField
          label="Password"
          type="password"
          placeholder="Create password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon="lock"
          required
        />

        <InputField
          label="Confirm Password"
          type="password"
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          icon="lock_reset"
          required
        />

        <Button type="submit" variant="primary" style={{ marginTop: '16px' }}>
          Create Account
        </Button>
      </form>

      <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0', gap: '12px' }}>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }}></div>
        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>OR</span>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }}></div>
      </div>

      <Button variant="secondary" icon="google" style={{ display: 'flex', justifyContent: 'center' }}>
        Continue with Google
      </Button>

      <div className="auth-footer" style={{ paddingBottom: '24px' }}>
        <p>Already have an account? <span className="auth-link" onClick={onGoToLogin}>Log In</span></p>
      </div>
    </div>
  );
}
