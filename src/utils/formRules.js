// Field rules shared by every form. Each returns an error message (string) or null. The server re-checks everything;
// these only give the user the reason right under the field, before anything is sent.
import { validateEmail, validatePassword, validateName, validatePhone, validateUsername } from './validation.js';
import { parseFeeInput } from './money.js';
import { normalizeMeetLink } from './meetLink.js';

const text = (v) => (typeof v === 'string' ? v.trim() : '');

export const rules = {
  required: (message) => (v) => (text(v) ? null : message),
  email: (v) => {
    if (!text(v)) return 'Please enter your email address.';
    return validateEmail(text(v)).isValid ? null : 'Enter a valid email address.';
  },
  emailOrUsername: (v) => (text(v) ? null : 'Please enter your email or username.'),
  password: (v) => (v ? null : 'Please enter your password.'),
  newPassword: (emailField) => (v, all) => {
    if (!v) return 'Please enter a password.';
    const res = validatePassword(v, all?.[emailField] || '');
    return res.isValid ? null : res.errors[0];
  },
  confirmPassword: (field) => (v, all) => {
    if (!v) return 'Please confirm your password.';
    return v === all?.[field] ? null : 'Passwords do not match.';
  },
  name: (label = 'Full name') => (v) => {
    if (!text(v)) return `Please enter your ${label.toLowerCase()}.`;
    const res = validateName(text(v), label);
    return res.isValid ? null : res.error;
  },
  username: (v) => {
    if (!text(v)) return 'Please choose a username.';
    const res = validateUsername(text(v));
    return res.isValid ? null : res.error;
  },
  phone: (required) => (v) => {
    if (!text(v)) return required ? 'Please enter your phone number.' : null;
    const res = validatePhone(text(v), required);
    return res.isValid ? null : res.error;
  },
  maxLength: (max, message) => (v) => (text(v).length > max ? message : null),
  meetingDescription: (v) => {
    if (!text(v)) return 'Please enter a meeting description.';
    return text(v).length > 1000 ? 'Please keep the description under 1000 characters.' : null;
  },
  slot: (v) => (v ? null : 'Please select an available time slot.'),
  meetingDate: (v) => (v ? null : 'Please select a meeting date.'),
  fee: (v) => (parseFeeInput(v).error ? 'Please enter a valid consultation fee.' : null),
  meetLink: (v) => {
    if (!text(v)) return 'Please enter the Google Meet link.';
    return normalizeMeetLink(v) ? null : 'Please enter a valid Google Meet link.';
  },
  cancellationReason: (v) => {
    if (!text(v)) return 'Please enter a cancellation reason.';
    return text(v).length > 500 ? 'Please keep the reason under 500 characters.' : null;
  },
  rating: (v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? null : 'Please choose a rating from 1 to 5.'),
  review: (v) => {
    if (!text(v)) return 'Please write a short review.';
    return text(v).length > 1000 ? 'Please keep the review under 1000 characters.' : null;
  },
  message: (v) => {
    if (!text(v)) return 'Please type a message.';
    return text(v).length > 2000 ? 'Messages can be up to 2000 characters.' : null;
  },
};

// Runs every rule of a form; returns { field: message } for the failing ones (in rule order).
export function validateAllFields(ruleMap, values) {
  const errors = {};
  for (const [field, rule] of Object.entries(ruleMap)) {
    const msg = rule(values[field], values);
    if (msg) errors[field] = msg;
  }
  return errors;
}
