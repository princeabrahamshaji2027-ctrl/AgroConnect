import React, { useState } from 'react';
import InputField, { FormMessage } from '../components/InputField';
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

  // Location States
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [address, setAddress] = useState('');

  const [error, setError] = useState('');   // sign-up / network errors only; field errors appear under each field

  const values = { name, username, email, phone, password, confirmPassword, country, state, district, city };
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
    country: rules.required('Please enter your country.'),
    state: rules.required('Please enter your state.'),
    district: rules.required('Please enter your district.'),
    city: rules.required('Please enter your city or village.'),
  });
  const setters = { name: setName, username: setUsername, email: setEmail, phone: setPhone, password: setPassword,
    confirmPassword: setConfirmPassword, country: setCountry, state: setState, district: setDistrict, city: setCity };
  // props for a validated field: value, onChange (re-checks once touched), error, ref, onBlur
  const bind = (key) => ({
    value: values[key],
    onChange: (e) => { setters[key](e.target.value); v.changed(key, { ...values, [key]: e.target.value }); },
    ...v.field(key, values),
  });

  const handleGPSDetect = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setLatitude(lat.toFixed(6));
          setLongitude(lng.toFixed(6));
          setCountry('India');
          setState('Punjab');
          setDistrict('Ludhiana');
          setCity('Gill Village');
          setAddress('Gill Village, Ludhiana, Punjab, 141006, India');
        },
        (err) => {
          // Punjab default fallback
          setLatitude('30.900965');
          setLongitude('75.857277');
          setCountry('India');
          setState('Punjab');
          setDistrict('Ludhiana');
          setCity('Gill Village');
          setAddress('Gill Village, Ludhiana, Punjab, 141006, India');
        }
      );
    } else {
      setLatitude('30.900965');
      setLongitude('75.857277');
      setCountry('India');
      setState('Punjab');
      setDistrict('Ludhiana');
      setCity('Gill Village');
      setAddress('Gill Village, Ludhiana, Punjab, 141006, India');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!v.validateAll(values)) return;   // every field shows its own message; the first one gets focus
    const nameVal = validateName(name, 'Full Name');
    const usernameVal = validateUsername(username);
    const emailVal = validateEmail(email);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: emailVal.value,
      password,
      options: {
        data: {
          full_name: nameVal.value,
          username: usernameVal.value,
          role: 'Farmer'
        }
      }
    });

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data?.user) {
      // Update profiles with phone and location
      await supabase
        .from('profiles')
        .update({
          full_name: nameVal.value,
          phone: phoneVal.value,
          location: `${cityVal.value}, ${stateVal.value}`
        })
        .eq('id', data.user.id);

      // Insert farmer profile extension
      await supabase
        .from('farmer_profiles')
        .insert({
          user_id: data.user.id,
          farm_size: 0.0,
          crop_type: '',
          soil_type: '',
          location: `${cityVal.value}, ${stateVal.value}`
        });

      onRegisterSuccess();
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary-green)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Location Details
          </h3>
          <Button 
            type="button" 
            variant="secondary" 
            icon="my_location" 
            onClick={handleGPSDetect} 
            style={{ padding: '10px 16px', fontSize: '13px', borderRadius: '12px', display: 'flex', justifyContent: 'center' }}
          >
            Detect Location via GPS
          </Button>
        </div>

        <InputField
          label="Country"
          placeholder="e.g. India"
          {...bind('country')}
          icon="public"
        />

        <InputField
          label="State"
          placeholder="e.g. Punjab"
          {...bind('state')}
          icon="map"
        />

        <InputField
          label="District"
          placeholder="e.g. Ludhiana"
          {...bind('district')}
          icon="explore"
        />

        <InputField
          label="City / Village"
          placeholder="e.g. Gill Village"
          {...bind('city')}
          icon="home_pin"
        />

        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <InputField
              label="Latitude"
              placeholder="e.g. 30.900965"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              icon="pin_drop"
            />
          </div>
          <div style={{ flex: 1 }}>
            <InputField
              label="Longitude"
              placeholder="e.g. 75.857277"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              icon="pin_drop"
            />
          </div>
        </div>

        <InputField
          label="Detailed Address"
          placeholder="Enter your exact street/village address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          icon="location_on"
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

      <GoogleButton onError={setError} />

      <div className="auth-footer" style={{ paddingBottom: '24px' }}>
        <p>Already have an account? <span className="auth-link" onClick={onGoToLogin}>Log In</span></p>
      </div>
    </div>
  );
}
