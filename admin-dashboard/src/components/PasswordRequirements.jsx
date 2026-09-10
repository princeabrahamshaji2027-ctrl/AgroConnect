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
    <div className="bg-[#181f1a] border border-outline-variant/40 rounded-xl p-3 text-[12px] my-1 flex flex-col gap-2">
      <div className="font-bold text-on-surface-variant/70 text-[10px] uppercase tracking-wider">
        Password Requirements
      </div>
      <div className="flex flex-col gap-1.5">
        {rules.map((rule) => (
          <div key={rule.key} className="flex items-center gap-2">
            <span
              className={`material-symbols-outlined text-[15px] font-bold ${
                rule.pass ? 'text-primary-container' : 'text-error'
              }`}
            >
              {rule.pass ? 'check_circle' : 'cancel'}
            </span>
            <span className={rule.pass ? 'text-on-surface' : 'text-on-surface-variant/70'}>
              {rule.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
