import React, { useId, useState } from 'react';
import './components.css';

// Text input / textarea with an inline error under the field (no popups for field validation).
// `error` (string) turns the border red, shows the message below and exposes it to screen readers.
export default function InputField({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  onBlur,
  icon,
  required = false,
  autoComplete,
  error,
  hint,
  name,
  maxLength,
  inputRef,
  as = 'input',
  rows = 3,
  disabled = false,
  inputMode,
}) {
  const [showPassword, setShowPassword] = useState(false);
  const inputId = useId(); // ties the label to the input for screen readers
  const errId = `${inputId}-err`;
  const hintId = `${inputId}-hint`;
  const isPassword = type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;
  const describedBy = error ? errId : hint ? hintId : undefined;
  const common = {
    id: inputId,
    name,
    placeholder,
    value,
    onChange,
    onBlur,
    required,
    maxLength,
    disabled,
    ref: inputRef,
    className: 'input-field',
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  };

  return (
    <div className="form-group">
      {label && <label className="form-label" htmlFor={inputId}>{label}</label>}
      <div className={`input-container${error ? ' has-error' : ''}`}>
        {icon && <span className="material-symbols-outlined input-icon">{icon}</span>}
        {as === 'textarea' ? (
          <textarea {...common} rows={rows} style={{ resize: 'none' }} />
        ) : (
          <input {...common} type={inputType} autoComplete={autoComplete} inputMode={inputMode} />
        )}
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
      {error ? <p id={errId} className="field-error" role="alert">{error}</p>
        : hint ? <p id={hintId} className="field-hint">{hint}</p> : null}
    </div>
  );
}

// Field error for custom controls (slot lists, star ratings, pickers) that are not an InputField.
export function FieldError({ id, children }) {
  if (!children) return null;
  return <p id={id} className="field-error" role="alert">{children}</p>;
}

// Non-blocking message for a whole form (network/server/permission errors, success) — not for field validation.
export function FormMessage({ type = 'error', children }) {
  if (!children) return null;
  return <div className={`form-message ${type}`} role={type === 'error' ? 'alert' : 'status'}>{children}</div>;
}
