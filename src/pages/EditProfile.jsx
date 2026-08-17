import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import InputField from '../components/InputField';
import { Button } from '../components/Button';
import { supabase } from '../supabase';
import './pages.css';

export default function EditProfile({ onSave, onCancel, userId = 'user1' }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const targetUserId = userId === 'user1' ? authUser?.id : userId;
      if (!targetUserId) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetUserId)
        .single();

      if (profile) {
        setName(profile.full_name || '');
        setUsername(profile.full_name?.toLowerCase().replace(/\s+/g, '') || '');
        setBio(profile.bio || '');
        setLocation(profile.location || '');
        setPhone(profile.phone || '');
        setAvatar(profile.profile_image_path || '/profile-placeholder.png');
      }
      setLoading(false);
    };

    loadProfile();
  }, [userId]);

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Image file must be under 5MB');
      return;
    }

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const filePath = `user_${authUser.id}_${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setAvatar(publicUrl);

      // Save immediately to DB
      await supabase
        .from('profiles')
        .update({ profile_image_path: publicUrl })
        .eq('id', authUser.id);

    } catch (err) {
      alert(`Avatar upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const targetUserId = userId === 'user1' ? authUser?.id : userId;
    if (!targetUserId) return;

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: name,
        bio,
        location,
        phone,
        profile_image_path: avatar
      })
      .eq('id', targetUserId);

    if (error) {
      alert(`Failed to save profile: ${error.message}`);
      return;
    }

    if (onSave) {
      onSave({
        id: targetUserId,
        name,
        username,
        bio,
        location,
        phone,
        avatar
      });
    }
  };

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-dark)' }}>
        <span style={{ color: 'var(--primary-green)' }}>Loading profile...</span>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header title="Edit Profile" showBack onBackClick={onCancel} />
      
      <form onSubmit={handleSave} className="page-container fade-in" style={{ gap: '16px' }}>
        
        {/* Avatar change */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '16px 0' }}>
          <img 
            src={avatar} 
            alt="Profile Avatar" 
            style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary-green)', marginBottom: '8px' }} 
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ background: 'transparent', border: 'none', color: 'var(--primary-green)', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
          >
            {uploading ? '⏳ Uploading...' : 'Change Profile Picture'}
          </button>
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
          disabled
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
