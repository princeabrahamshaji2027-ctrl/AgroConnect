import React, { useState } from 'react';
import Header from '../components/Header';
import InputField from '../components/InputField';
import { Button } from '../components/Button';
import mockUsers from '../mock/users.json';
import './pages.css';

export default function EditProfile({ onSave, onCancel, userId = 'user1' }) {
  const user = mockUsers.find(u => u.id === userId) || mockUsers[0];

  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio);
  const [location, setLocation] = useState(user.location);
  const [phone, setPhone] = useState(user.phone);

  const handleSave = (e) => {
    e.preventDefault();
    if (onSave) {
      onSave({
        ...user,
        name,
        username,
        bio,
        location,
        phone
      });
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header title="Edit Profile" showBack onBackClick={onCancel} />
      
      <form onSubmit={handleSave} className="page-container fade-in" style={{ gap: '16px' }}>
        
        {/* Avatar change */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '16px 0' }}>
          <img 
            src={user.avatar} 
            alt="Profile Avatar" 
            style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary-green)', marginBottom: '8px' }} 
          />
          <span style={{ color: 'var(--primary-green)', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
            Change Profile Picture
          </span>
        </div>

        <InputField
          label="Full Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          icon="badge"
          required
        />

        <InputField
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          icon="person"
          required
        />

        <div className="form-group">
          <label className="form-label">Bio</label>
          <div className="input-container" style={{ padding: '8px 16px' }}>
            <textarea
              className="input-field"
              rows="3"
              style={{ resize: 'none', height: '80px' }}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself..."
            />
          </div>
        </div>

        <InputField
          label="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          icon="location_on"
        />

        <InputField
          label="Phone Number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          icon="phone"
        />

        <div style={{ display: 'flex', gap: '12px', marginTop: '16px', paddingBottom: '32px' }}>
          <Button variant="secondary" onClick={onCancel} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" style={{ flex: 1 }}>
            Save Changes
          </Button>
        </div>

      </form>
    </div>
  );
}
