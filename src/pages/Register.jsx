import React, { useState } from 'react';
import InputField, { FormMessage, SelectField } from '../components/InputField';
import { DISTRICTS } from '../utils/districts';
import { rules } from '../utils/formRules';
import { useFormValidation } from '../utils/useFormValidation';
import { Button } from '../components/Button';
import GoogleButton from '../components/GoogleButton';
import PasswordRequirements from '../components/PasswordRequirements';
import {
  validatePassword,
  validateUsername,
  validateEmail,
  validateName
} from '../utils/validation';
import './pages.css';

import { supabase } from '../supabase';

export default function Register({ onRegisterSuccess, onGoToLogin }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Location: one of the launch districts + city/village (the district decides which posts are shown first)
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState('');   // sign-up / network errors only; field errors appear under each field

  const values = { name, username, email, phone, password, confirmPassword, district, city };
  const v = useFormValidation({
    name: rules.name('Full name'),
    username: rules.username,
    email: rules.email,
    phone: rules.phone(true),
    password: (val, all) => {
      if (!val) return 'Please enter a password.';
      const res = validatePassword(val, (all.email || '').trim(), (all.username || '').trim());
      return res.isValid ? null : res.errors[0];
    },
    confirmPassword: rules.confirmPassword('password'),
    district: rules.district,
    city: (val) => rules.required('Please enter your city or village.')(val)
      || rules.maxLength(100, 'Please keep the city or village under 100 characters.')(val),
  });
  const setters = { name: setName, username: setUsername, email: setEmail, phone: setPhone, password: setPassword,
    confirmPassword: setConfirmPassword, district: setDistrict, city: setCity };
  // props for a validated field: value, onChange (re-checks once touched), error, ref, onBlur
  const bind = (key) => ({
    value: values[key],
    onChange: (e) => { setters[key](e.target.value); v.changed(key, { ...values, [key]: e.target.value }); },
    ...v.field(key, values),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (submitting) return;

    if (!v.validateAll(values)) return;   // every field shows its own message; the first one gets focus
    const nameVal = validateName(name, 'Full Name');
    const usernameVal = validateUsername(username);
    const emailVal = validateEmail(email);
    const phoneTrim = phone.trim();
    const location = `${city.trim()}, ${district}, Kerala`;

    setSubmitting(true);
    try {
      // The sign-up trigger (migration 20) stores full name, district, phone and location on the profile;
      // the role is always Farmer there, whatever the client sends.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: emailVal.value,
        password,
        options: { data: { full_name: nameVal.value, username: usernameVal.value, district, phone: phoneTrim, location } },
      });
      if (signUpError) { setError(signUpError.message); return; }

      // With e-mail confirmation on there is no session yet, so nothing more can be written as this user;
      // the trigger already saved the profile. With a session, also create the farmer details row.
      if (data?.session && data?.user) {
        const { error: farmerError } = await supabase
          .from('farmer_profiles')
          .insert({ user_id: data.user.id, farm_size: 0.0, crop_type: '', soil_type: '', location });
        if (farmerError && farmerError.code !== '23505') {
          console.warn('farmer profile not created:', farmerError.message);   // created again on the first booking
        }
      }
      onRegisterSuccess();
    } catch (err) {
      setError(/fetch|network/i.test(err?.message || '') ? 'No connection. Please try again.' : (err?.message || 'Sign-up failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-container fade-in" style={{ justifyContent: 'flex-start', paddingTop: '16px', overflowY: 'auto' }}>
      <div className="auth-header">
        <img src="/logo.png" alt="Agro Connect Logo" className="auth-logo" style={{ height: '40px' }} />
        <h2 className="auth-title">Create Account</h2>
        <p className="auth-subtitle">Join thousands of farmers sharing knowledge</p>
      </div>

      <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <FormMessage>{error}</FormMessage>

        <InputField
          label="Full Name"
          placeholder="Enter your full name"
          {...bind('name')}
          icon="badge"
        />

        <InputField
          label="Username"
          placeholder="Choose a username"
          {...bind('username')}
          icon="person"
        />

        <InputField
          label="Email Address"
          type="email"
          placeholder="Enter your email"
          {...bind('email')}
          icon="mail"
        />

        <InputField
          label="Phone Number"
          type="tel"
          placeholder="Enter your phone number"
          {...bind('phone')}
          icon="phone"
        />

        <InputField
          label="Password"
          type="password"
          placeholder="Create password"
          {...bind('password')}
          icon="lock"
        />

        <InputField
          label="Confirm Password"
          type="password"
          placeholder="Confirm password"
          {...bind('confirmPassword')}
          icon="lock_reset"
        />

        <PasswordRequirements
          password={password}
          email={email}
          username={username}
          confirmPassword={confirmPassword}
        />

        {/* Location Section */}
        <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary-green)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '8px' }}>
          Location Details
        </h3>

        <SelectField
          label="District *"
          placeholder="Choose your district"
          options={DISTRICTS}
          {...bind('district')}
        />

        <InputField
          label="City / Village *"
          placeholder="e.g. Pala"
          {...bind('city')}
          icon="home_pin"
        />

        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create Account'}
        </Button>
      </form>

      <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0', gap: '12px' }}>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }}></div>
        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>OR</span>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }}></div>
      </div>

      <GoogleButton onError={setError} />

      <div className="auth-footer" style={{ paddingBottom: '24px' }}>
        <p>Already have an account? <span className="auth-link" onClick={onGoToLogin}>Log In</span></p>
      </div>
    </div>
  );
}
