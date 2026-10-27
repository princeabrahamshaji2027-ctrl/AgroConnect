/**
 * AgroConnect Centralized Form & Security Validation Utilities (Admin Dashboard)
 */

const COMMON_WEAK_PASSWORDS = new Set([
  'password', 'password123', '12345678', '123456789', '1234567890',
  'agroconnect', 'admin123', 'p@ssword', 'qwertyuiop', 'welcome123',
  'letmein123', 'iloveyou123', 'pass1234'
]);

/**
 * Validates a password against AgroConnect security rules.
 */
export function validatePassword(password = '', email = '', username = '') {
  const pwd = String(password);
  const cleanEmail = String(email).trim().toLowerCase();
  const emailPrefix = cleanEmail.includes('@') ? cleanEmail.split('@')[0] : cleanEmail;
  const cleanUsername = String(username).trim().toLowerCase();

  const length = pwd.length >= 8;
  const uppercase = /[A-Z]/.test(pwd);
  const lowercase = /[a-z]/.test(pwd);
  const number = /[0-9]/.test(pwd);
  const special = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd);
  const noSpaces = !/\s/.test(pwd);

  const lowerPwd = pwd.toLowerCase();
  const noEmail = emailPrefix ? !lowerPwd.includes(emailPrefix) : true;
  const noUsername = cleanUsername ? !lowerPwd.includes(cleanUsername) : true;
  const notCommon = !COMMON_WEAK_PASSWORDS.has(lowerPwd);

  const errors = [];
  if (!length) errors.push('Password must be at least 8 characters long.');
  if (!uppercase) errors.push('Password must contain at least one uppercase letter.');
  if (!lowercase) errors.push('Password must contain at least one lowercase letter.');
  if (!number) errors.push('Password must contain at least one number.');
  if (!special) errors.push('Password must contain at least one special character (!@#$%^&*).');
  if (!noSpaces) errors.push('Password cannot contain spaces.');
  if (!noEmail) errors.push('Password cannot contain your email address.');
  if (!noUsername) errors.push('Password cannot contain your username.');
  if (!notCommon) errors.push('Password is too common or easily guessed.');

  const isValid = length && uppercase && lowercase && number && special && noSpaces && noEmail && noUsername && notCommon;

  return {
    length,
    uppercase,
    lowercase,
    number,
    special,
    noSpaces,
    noEmail,
    noUsername,
    notCommon,
    isValid,
    errors
  };
}

/**
 * Validates username policy.
 */
export function validateUsername(username = '') {
  const trimmed = String(username).trim();
  if (!trimmed) {
    return { isValid: false, error: 'Username is required.' };
  }
  if (trimmed.length < 3) {
    return { isValid: false, error: 'Username must be at least 3 characters long.' };
  }
  if (trimmed.length > 30) {
    return { isValid: false, error: 'Username cannot exceed 30 characters.' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
    return { isValid: false, error: 'Username can only contain letters, numbers, and underscores.' };
  }
  return { isValid: true, value: trimmed, error: null };
}

/**
 * Validates email structure.
 */
export function validateEmail(email = '') {
  const trimmed = String(email).trim().toLowerCase();
  if (!trimmed) {
    return { isValid: false, error: 'Email address is required.' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { isValid: false, error: 'Please enter a valid email address.' };
  }
  return { isValid: true, value: trimmed, error: null };
}

/**
 * Validates name fields (first, last, full name).
 */
export function validateName(name = '', fieldName = 'Name') {
  const trimmed = String(name).trim();
  if (!trimmed) {
    return { isValid: false, error: `${fieldName} is required.` };
  }
  if (trimmed.length > 100) {
    return { isValid: false, error: `${fieldName} cannot exceed 100 characters.` };
  }
  const nameRegex = /^[a-zA-Z\s\-''.\u00C0-\u024F]+$/;
  if (!nameRegex.test(trimmed)) {
    return { isValid: false, error: `${fieldName} contains invalid characters.` };
  }
  return { isValid: true, value: trimmed, error: null };
}

/**
 * Validates phone numbers.
 */
export function validatePhone(phone = '', required = false) {
  const trimmed = String(phone).trim();
  if (!trimmed) {
    if (required) return { isValid: false, error: 'Phone number is required.' };
    return { isValid: true, value: '', error: null };
  }
  const phoneRegex = /^\+?[0-9\s\-()]{7,15}$/;
  if (!phoneRegex.test(trimmed)) {
    return { isValid: false, error: 'Please enter a valid phone number.' };
  }
  return { isValid: true, value: trimmed, error: null };
}

/**
 * Validates required text inputs to reject empty or whitespace-only strings.
 */
export function validateRequiredText(text = '', fieldName = 'Field', minLen = 1, maxLen = 5000) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return { isValid: false, error: `${fieldName} cannot be empty or only spaces.` };
  }
  if (trimmed.length < minLen) {
    return { isValid: false, error: `${fieldName} must be at least ${minLen} character(s).` };
  }
  if (trimmed.length > maxLen) {
    return { isValid: false, error: `${fieldName} cannot exceed ${maxLen} characters.` };
  }
  return { isValid: true, value: trimmed, error: null };
}

/**
 * Validates numeric inputs.
 */
export function validateNumeric(value, { min = 0, max = Infinity, allowDecimal = true, maxDecimals = 2, fieldName = 'Value' } = {}) {
  const raw = value === null || value === undefined ? '' : String(value).trim();
  if (raw === '') {
    return { isValid: false, error: `${fieldName} is required.` };
  }
  // Plain digits only: no letters, exponents (1e3), spaces inside, or several dots. A minus sign is recognised so the
  // message can say "at least …" instead of "not a number".
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    return { isValid: false, error: `${fieldName} must be a valid number.` };
  }
  const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
  if (!allowDecimal && decimals > 0) {
    return { isValid: false, error: `${fieldName} must be a whole number.` };
  }
  if (allowDecimal && decimals > maxDecimals) {
    return { isValid: false, error: `${fieldName} can have at most ${maxDecimals} decimal places.` };
  }
  const num = Number(raw);
  if (num < min) {
    return { isValid: false, error: `${fieldName} must be at least ${min}.` };
  }
  if (num > max) {
    return { isValid: false, error: `${fieldName} cannot exceed ${max}.` };
  }
  return { isValid: true, value: num, error: null };
}

/**
 * Validates uploaded CV/Resume PDF file strictly (extension, size, MIME, magic bytes %PDF).
 */
export async function validatePdfFile(file, maxSizeMB = 5) {
  if (!file) {
    return { isValid: false, error: 'Please select a resume PDF file.' };
  }

  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return { isValid: false, error: `Resume must be smaller than ${maxSizeMB} MB.` };
  }

  const filename = file.name || '';
  if (!filename.toLowerCase().endsWith('.pdf')) {
    return { isValid: false, error: 'Resume must be a PDF file (.pdf extension required).' };
  }

  if (file.type && file.type !== 'application/pdf') {
    return { isValid: false, error: 'Resume must be a PDF file (MIME type must be application/pdf).' };
  }

  try {
    const buffer = await readFileHeaderBytes(file, 4);
    const headerStr = String.fromCharCode.apply(null, Array.from(buffer));
    if (headerStr !== '%PDF') {
      return { isValid: false, error: 'File appears to be renamed or corrupted. Genuine PDF file required.' };
    }
  } catch (err) {
    return { isValid: false, error: 'Failed to verify PDF file header integrity.' };
  }

  return { isValid: true, error: null };
}

/**
 * Validates uploaded image file strictly (size, extension, MIME, magic bytes).
 */
export async function validateImageFile(file, maxSizeMB = 5) {
  if (!file) {
    return { isValid: false, error: 'Please select an image file.' };
  }

  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return { isValid: false, error: `Image must be smaller than ${maxSizeMB} MB.` };
  }

  const allowedExts = ['jpg', 'jpeg', 'png', 'webp'];
  const ext = (file.name || '').split('.').pop()?.toLowerCase();
  if (!ext || !allowedExts.includes(ext)) {
    return { isValid: false, error: 'Allowed image formats: JPG, JPEG, PNG, WEBP.' };
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (file.type && !allowedTypes.includes(file.type)) {
    return { isValid: false, error: 'Invalid image format type.' };
  }

  try {
    const headerBytes = await readFileHeaderBytes(file, 8);
    const isJpg = headerBytes[0] === 0xFF && headerBytes[1] === 0xD8 && headerBytes[2] === 0xFF;
    const isPng = headerBytes[0] === 0x89 && headerBytes[1] === 0x50 && headerBytes[2] === 0x4E && headerBytes[3] === 0x47;
    const isWebp = headerBytes[0] === 0x52 && headerBytes[1] === 0x49 && headerBytes[2] === 0x46 && headerBytes[3] === 0x46;

    if (!isJpg && !isPng && !isWebp) {
      return { isValid: false, error: 'File header does not match a supported image format (JPG/PNG/WEBP).' };
    }
  } catch (err) {
    return { isValid: false, error: 'Failed to verify image file header.' };
  }

  return { isValid: true, error: null };
}

function readFileHeaderBytes(file, byteCount = 4) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const blob = file.slice(0, byteCount);
    reader.onloadend = (e) => {
      if (e.target.readyState === FileReader.DONE) {
        resolve(new Uint8Array(e.target.result));
      } else {
        reject(new Error('File read failed'));
      }
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsArrayBuffer(blob);
  });
}
