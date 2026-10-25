import React, { useId, useState } from 'react';
import './components.css';

export default function InputField({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  icon,
  required = false,
  autoComplete
}) {
  const [showPassword, setShowPassword] = useState(false);
  const inputId = useId(); // ties the label to the input for screen readers
  const isPassword = type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className="form-group">
      {label && <label className="form-label" htmlFor={inputId}>{label}</label>}
      <div className="input-container">
        {icon && <span className="material-symbols-outlined input-icon">{icon}</span>}
        <input
          id={inputId}
          type={inputType}
          autoComplete={autoComplete}
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
            aria-label={showPassword ? 'Hide password' : 'Show password'}
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
