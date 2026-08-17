import React, { useState } from 'react';
import { supabase } from '../supabase';
import logoImg from '../assets/logo.png';

export default function Login({ authError: externalError }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      // Format email if needed
      const emailStr = email.includes('@') ? email : `${email}@agroconnect.com`;
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: emailStr,
        password: password,
      });

      if (authErr) throw authErr;

      // On successful sign-in, App.jsx's onAuthStateChange listener & profile useEffect
      // automatically process the session, verify admin role, and render the dashboard.
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'An error occurred during login.');
      setLoading(false);
    }
  };

  const displayError = error || externalError;

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center px-4">
      <div className="max-w-md w-full card-bg rounded-2xl border border-outline-variant p-8 flex flex-col gap-6 shadow-2xl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl overflow-hidden border border-primary-container/30">
            <img src={logoImg} alt="AgroConnect Logo" className="w-full h-full object-cover" />
          </div>
          <div className="text-center">
            <h1 className="font-headline-xl text-on-surface font-bold">Agro Connect</h1>
            <p className="font-label-sm text-primary-container tracking-widest uppercase font-bold mt-1">Admin Panel</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4 mt-2">
          {displayError && (
            <div className="bg-error-container/20 border border-error/30 text-error rounded-xl p-4 text-[13px] text-center font-medium leading-5">
              {displayError}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="font-label-md text-on-surface-variant font-bold">Email or Username</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">person</span>
              <input
                type="text"
                placeholder="admin@agroconnect.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-[#1c221e] border border-outline-variant rounded-xl pl-10 pr-4 py-3 text-on-surface text-body-sm focus:outline-none focus:border-primary-container transition-colors placeholder:text-on-surface-variant/40"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-label-md text-on-surface-variant font-bold">Password</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">lock</span>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-[#1c221e] border border-outline-variant rounded-xl pl-10 pr-4 py-3 text-on-surface text-body-sm focus:outline-none focus:border-primary-container transition-colors placeholder:text-on-surface-variant/40"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-container hover:bg-primary-container/90 text-on-primary-container font-semibold py-3 px-4 rounded-xl mt-4 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <span className="animate-spin h-5 w-5 border-2 border-on-primary-container border-t-transparent rounded-full" />
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">login</span>
                <span>Sign In to Dashboard</span>
              </>
            )}
          </button>
        </form>

        <div className="text-center font-body-sm text-on-surface-variant/60 border-t border-outline-variant/30 pt-4 mt-2">
          &copy; 2026 Agro Connect. All rights reserved.
        </div>
      </div>
    </div>
  );
}
