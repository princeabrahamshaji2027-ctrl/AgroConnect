import React, { useState } from 'react';
import './components.css';

export default function InputField({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  icon,
  required = false
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <div className="input-container">
        {icon && <span className="material-symbols-outlined input-icon">{icon}</span>}
        <input
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          className="input-field"
        />
        {isPassword && (
          <button
            type="button"
            className="input-toggle"
            onClick={() => setShowPassword(!showPassword)}
          >
            <span className="material-symbols-outlined">
              {showPassword ? 'visibility_off' : 'visibility'}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
