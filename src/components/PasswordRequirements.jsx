import React from 'react';
import { validatePassword } from '../utils/validation';

export default function PasswordRequirements({ password = '', email = '', username = '', confirmPassword = null }) {
  if (!password && confirmPassword === null) return null;

  const result = validatePassword(password, email, username);
  const match = confirmPassword !== null ? (password.length > 0 && password === confirmPassword) : true;

  const rules = [
    { key: 'length', label: 'At least 8 characters', pass: result.length },
    { key: 'uppercase', label: 'One uppercase letter (A-Z)', pass: result.uppercase },
    { key: 'lowercase', label: 'One lowercase letter (a-z)', pass: result.lowercase },
    { key: 'number', label: 'One number (0-9)', pass: result.number },
    { key: 'special', label: 'One special character (!@#$%^&*)', pass: result.special },
    { key: 'noSpaces', label: 'No spaces', pass: result.noSpaces },
    { key: 'notCommon', label: 'Not a common password', pass: result.notCommon },
  ];

  if (email) {
    rules.push({ key: 'noEmail', label: 'Does not contain email', pass: result.noEmail });
  }
  if (username) {
    rules.push({ key: 'noUsername', label: 'Does not contain username', pass: result.noUsername });
  }
  if (confirmPassword !== null) {
    rules.push({ key: 'match', label: 'Passwords match', pass: match });
  }

  return (
    <div style={{
      backgroundColor: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid var(--border-color, #2a342c)',
      borderRadius: '12px',
      padding: '12px 14px',
      fontSize: '12px',
      marginTop: '4px',
      marginBottom: '8px'
    }}>
      <div style={{ fontWeight: '600', color: 'var(--text-secondary, #a0aec0)', marginBottom: '8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Password Requirements
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
        {rules.map((rule) => (
          <div key={rule.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: '15px',
                color: rule.pass ? 'var(--primary-green, #2ecc71)' : 'var(--error, #e74c3c)',
                fontWeight: 'bold'
              }}
            >
              {rule.pass ? 'check_circle' : 'cancel'}
            </span>
            <span style={{ color: rule.pass ? 'var(--text-primary, #ffffff)' : 'var(--text-secondary, #a0aec0)', transition: 'color 0.2s' }}>
              {rule.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
