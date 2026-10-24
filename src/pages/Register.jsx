import React, { useState } from 'react';
import InputField from '../components/InputField';
import { Button } from '../components/Button';
import PasswordRequirements from '../components/PasswordRequirements';
import {
  validatePassword,
  validateUsername,
  validateEmail,
  validateName,
  validatePhone,
  validateRequiredText
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

  const [error, setError] = useState('');

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

    // 1. Validate Full Name
    const nameVal = validateName(name, 'Full Name');
    if (!nameVal.isValid) {
      setError(nameVal.error);
      return;
    }

    // 2. Validate Username
    const usernameVal = validateUsername(username);
    if (!usernameVal.isValid) {
      setError(usernameVal.error);
      return;
    }

    // 3. Validate Email
    const emailVal = validateEmail(email);
    if (!emailVal.isValid) {
      setError(emailVal.error);
      return;
    }

    // 4. Validate Phone
    const phoneVal = validatePhone(phone, true);
    if (!phoneVal.isValid) {
      setError(phoneVal.error);
      return;
    }

    // 5. Validate Password Policy
    const pwdVal = validatePassword(password, emailVal.value, usernameVal.value);
    if (!pwdVal.isValid) {
      setError(pwdVal.errors[0]);
      return;
    }

    // 6. Confirm Password Match
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    // 7. Validate Location Fields
    const countryVal = validateRequiredText(country, 'Country');
    const stateVal = validateRequiredText(state, 'State');
    const districtVal = validateRequiredText(district, 'District');
    const cityVal = validateRequiredText(city, 'City / Village');

    if (!countryVal.isValid || !stateVal.isValid || !districtVal.isValid || !cityVal.isValid) {
      setError('Please fill in all required location details.');
      return;
    }

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
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          icon="public"
          required
        />

        <InputField
          label="State"
          placeholder="e.g. Punjab"
          value={state}
          onChange={(e) => setState(e.target.value)}
          icon="map"
          required
        />

        <InputField
          label="District"
          placeholder="e.g. Ludhiana"
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
          icon="explore"
          required
        />

        <InputField
          label="City / Village"
          placeholder="e.g. Gill Village"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          icon="home_pin"
          required
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

      {/* "google" is not a Material Symbols icon (it rendered as the word GOOGLE). No official Google mark is in the
          repo, so the button shows text only until the branded asset is added with real Google sign-in. */}
      <Button variant="secondary" style={{ display: 'flex', justifyContent: 'center' }}>
        Continue with Google
      </Button>

      <div className="auth-footer" style={{ paddingBottom: '24px' }}>
        <p>Already have an account? <span className="auth-link" onClick={onGoToLogin}>Log In</span></p>
      </div>
    </div>
  );
}
