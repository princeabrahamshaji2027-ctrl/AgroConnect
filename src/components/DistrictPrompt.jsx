import React, { useState } from 'react';
import BottomSheet from './BottomSheet';
import { Button } from './Button';
import { SelectField, FormMessage } from './InputField';
import { DISTRICTS } from '../utils/districts';
import { rules } from '../utils/formRules';
import { supabase } from '../supabase';

// Asks a signed-in user without a district (Google sign-up, accounts made before districts existed) to choose one.
// Nothing is ever chosen for them: "Later" keeps the feed in plain time order.
export default function DistrictPrompt({ isOpen, userId, onSaved, onLater }) {
  const [district, setDistrict] = useState('');
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const msg = rules.district(district);
    if (msg) { setError(msg); return; }
    setSaving(true);
    setFormError(null);
    const { error: err } = await supabase.from('profiles').update({ district }).eq('id', userId);
    setSaving(false);
    if (err) {
      setFormError(/fetch|network/i.test(err.message || '') ? 'No connection. Please try again.' : `Your district could not be saved: ${err.message}`);
      return;
    }
    onSaved(district);
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={() => !saving && onLater()}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Choose your district</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
          Posts from your district are shown first in your feed, and experts near you are easier to find.
          You can change it later in Edit Profile.
        </p>
        <SelectField
          label="District"
          placeholder="Choose your district"
          options={DISTRICTS}
          value={district}
          onChange={(e) => { setDistrict(e.target.value); setError(null); }}
          error={error}
        />
        <FormMessage>{formError}</FormMessage>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button variant="secondary" onClick={onLater} disabled={saving}>Later</Button>
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </BottomSheet>
  );
}
