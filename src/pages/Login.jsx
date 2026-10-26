import React, { useState, useEffect } from 'react';
import InputField, { FormMessage } from '../components/InputField';
import { rules } from '../utils/formRules';
import { useFormValidation } from '../utils/useFormValidation';
import { Button } from '../components/Button';
import GoogleButton from '../components/GoogleButton';
import './pages.css';

import { supabase } from '../supabase';

export default function Login({ onLoginSuccess, onGoToRegister, onGoToAdminLogin, onForgotPassword }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');   // sign-in / network errors only (field errors are shown under the fields)
  const v = useFormValidation({ username: rules.emailOrUsername, password: rules.password });
  const values = { username, password };

  const getErrorMessage = (err) => {
    if (!err) return '';
    if (typeof err === 'string') return err;
    if (err.message && typeof err.message === 'string') return err.message;
    if (err.error_description && typeof err.error_description === 'string') return err.error_description;
    return 'Login failed. Please check your credentials and try again.';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanUser = username.trim();
    const cleanPwd = password;

    setError('');
    if (!v.validateAll(values)) return;

    try {
      // Check if user is using simple username or email
      const emailStr = cleanUser.includes('@') ? cleanUser : `${cleanUser}@agroconnect.com`;

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: emailStr,
        password: cleanPwd
      });

      if (authError) {
        setError(getErrorMessage(authError));
        return;
      }

      if (data?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();

        let role = profile?.role?.toLowerCase();

        if (!role) {
          const { data: expertRow } = await supabase
            .from('experts')
            .select('id')
            .eq('user_id', data.user.id)
            .maybeSingle();
          role = expertRow ? 'expert' : 'farmer';
        }

        onLoginSuccess(role);
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="auth-container fade-in">
      <div className="auth-header">
        <img src="/logo.png" alt="Agro Connect Logo" className="auth-logo" />
        <h2 className="auth-title">Welcome Back</h2>
        <p className="auth-subtitle">Log in to connect with your farming community</p>
      </div>

      <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <FormMessage>{error}</FormMessage>

        <InputField
          label="Email or Username"
          placeholder="Enter your email or username"
          value={username}
          onChange={(e) => { setUsername(e.target.value); v.changed('username', { ...values, username: e.target.value }); }}
          icon="person"
          autoComplete="username"
          {...v.field('username', values)}
        />

        <InputField
          label="Password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); v.changed('password', { ...values, password: e.target.value }); }}
          icon="lock"
          autoComplete="current-password"
          {...v.field('password', values)}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', marginTop: '-4px' }}>
          <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input type="checkbox" id="remember" style={{ accentColor: 'var(--primary-green)' }} />
            <label htmlFor="remember">Remember me</label>
          </span>
          <button
            type="button"
            className="auth-link"
            onClick={onForgotPassword}
            style={{ fontSize: '13px', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            Forgot Password?
          </button>
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

      <GoogleButton onError={setError} />

      <div className="auth-footer">
        <p>Don't have an account? <span className="auth-link" onClick={onGoToRegister}>Sign Up</span></p>
      </div>
    </div>
  );
}
