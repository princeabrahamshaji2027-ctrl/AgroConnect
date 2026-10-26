import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import InputField, { FieldError, FormMessage } from '../components/InputField';
import { FormSkeleton } from '../components/Skeleton';
import { rules } from '../utils/formRules';
import { useFormValidation } from '../utils/useFormValidation';
import { Button } from '../components/Button';
import { validateImageFile, validateName, validatePhone } from '../utils/validation';
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
  const [avatarError, setAvatarError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const values = { name, phone, bio };
  const v = useFormValidation({
    name: rules.name('Full name'),
    phone: rules.phone(false),
    bio: rules.maxLength(500, 'Please keep your bio under 500 characters.'),
  });
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

    setAvatarError(null);
    const imgVal = await validateImageFile(file, 5);
    if (!imgVal.isValid) {
      setAvatarError(imgVal.error);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
      setAvatarError(`The picture could not be uploaded. ${/fetch|network/i.test(err.message || '') ? 'Check your connection and try again.' : err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    if (!v.validateAll(values)) return;
    const nameVal = validateName(name, 'Full Name');
    const phoneVal = validatePhone(phone, false);
    setSaving(true);

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const targetUserId = userId === 'user1' ? authUser?.id : userId;
    if (!targetUserId) { setSaving(false); return; }

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: nameVal.value,
        bio: bio.trim(),
        location: location.trim(),
        phone: phoneVal.value,
        profile_image_path: avatar
      })
      .eq('id', targetUserId);

    setSaving(false);
    if (error) {
      setFormError(/fetch|network/i.test(error.message || '') ? 'No connection. Your changes were not saved — please try again.' : `Your profile could not be saved: ${error.message}`);
      return;
    }

    if (onSave) {
      onSave({
        id: targetUserId,
        name: nameVal.value,
        username,
        bio: bio.trim(),
        location: location.trim(),
        phone: phoneVal.value,
        avatar
      });
    }
  };

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Header title="Edit Profile" showBack onBackClick={onCancel} />
        <FormSkeleton fields={5} />
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header title="Edit Profile" showBack onBackClick={onCancel} />
      
      <form onSubmit={handleSave} noValidate className="page-container fade-in" style={{ gap: '16px' }}>
        <FormMessage>{formError}</FormMessage>
        
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
          <FieldError>{avatarError}</FieldError>
        </div>

        <InputField
          label="Full Name"
          value={name}
          onChange={(e) => { setName(e.target.value); v.changed('name', { ...values, name: e.target.value }); }}
          icon="badge"
          {...v.field('name', values)}
        />

        <InputField
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          icon="person"
          disabled
        />

        <InputField
          label="Bio"
          as="textarea"
          rows={3}
          value={bio}
          placeholder="Tell us about yourself..."
          onChange={(e) => { setBio(e.target.value); v.changed('bio', { ...values, bio: e.target.value }); }}
          {...v.field('bio', values)}
        />

        <InputField
          label="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          icon="location_on"
        />

        <InputField
          label="Phone Number"
          value={phone}
          type="tel"
          onChange={(e) => { setPhone(e.target.value); v.changed('phone', { ...values, phone: e.target.value }); }}
          icon="phone"
          {...v.field('phone', values)}
        />

        <div style={{ display: 'flex', gap: '12px', marginTop: '16px', paddingBottom: '32px' }}>
          <Button variant="secondary" onClick={onCancel} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving} style={{ flex: 1 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>

      </form>
    </div>
  );
}
