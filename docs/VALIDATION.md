# AgroConnect Validation Rules & Guidelines

This document serves as the authoritative developer reference for form validation, security policies, and data integrity enforcement across the **AgroConnect** platform.

---

## 1. Core Principles

1. **Two-Layer Security Architecture**:
   - **Frontend (Client UX)**: Immediate feedback to prevent invalid submissions and guide user input.
   - **Backend (Supabase / Postgres Authority)**: Authoritative enforcement via Postgres Check Constraints, Column Types, Row Level Security (RLS), and Edge Functions. Never trust client inputs alone.
2. **Whitespace Trimming**: All text inputs are trimmed prior to validation and database insertion to prevent whitespace-only entries (`"   "`).
3. **Magic-Byte Header File Verification**: File uploads (PDF resumes and media images) are validated using asynchronous binary header reading (magic bytes) to reject renamed, malicious, or spoofed files.

---

## 2. Validation Policies

### 2.1 Password Policy
Used during Sign Up, Password Reset, and Password Update.

**Requirements**:
- Minimum 8 characters
- At least 1 uppercase letter (`A-Z`)
- At least 1 lowercase letter (`a-z`)
- At least 1 number (`0-9`)
- At least 1 special character (`!@#$%^&*()_+-=[]{}|;:',.<>?/`)
- No spaces
- Must not contain user's email prefix or username
- Must not be a common weak password (e.g. `password`, `12345678`, `agroconnect`)
- Password confirmation must match password exactly

**UX Implementation**:
`PasswordRequirements.jsx` renders a real-time requirement checklist with visual indicators (`✓` / `❌`).

### 2.2 Username Policy
- Required, minimum 3 characters, maximum 30 characters
- Allows only alphanumeric characters and underscores (`a-z`, `A-Z`, `0-9`, `_`)
- Trimmed automatically, no spaces permitted

### 2.3 Email Policy
- Required for registration and authentication
- RFC 5322 structural structure check (`user@domain.ext`)
- Trimmed and normalized to lowercase

### 2.4 Phone Policy
- Validates standard phone format: 7 to 15 digits, allowing optional leading `+` and spaces/hyphens/parentheses.

### 2.5 Name & Text Policy
- Trimmed automatically
- Rejects whitespace-only inputs
- Supports international human names (allows letters, spaces, hyphens `-`, apostrophes `'`, and dots `.`).

### 2.6 Expert Application Resume (PDF Only)
- **Allowed Formats**: Genuine PDF files only (`.pdf`)
- **File Size**: Maximum 5 MB (configurable)
- **Validation**:
  1. Frontend `accept="application/pdf"`
  2. Asynchronous binary header magic bytes check (`%PDF` / `0x25 0x50 0x44 0x46`)
  3. Supabase database check constraint: `CHECK (cv_file_path ~* '\.pdf$')`

### 2.7 Image Upload Policy (Avatars, Posts, Marketplace)
- **Allowed Formats**: JPG, JPEG, PNG, WEBP
- **File Size**: Maximum 5 MB (10 MB for high-res post images)
- **Validation**: Binary magic header check (JPEG: `FF D8 FF`, PNG: `89 50 4E 47`, WEBP: `52 49 46 46`).

### 2.8 Numeric Range Policy
- **Product Price**: Must be greater than 0 (`CHECK (price > 0)`).
- **Stock Quantity**: Must be non-negative integer (`CHECK (stock >= 0)`).
- **Consultation Rates & Booking Slots**: Must be non-negative numbers.

---

## 3. Developer Guide: Adding Validation to a New Form

1. Import centralized validation helper functions from `utils/validation`:
   ```javascript
   import {
     validatePassword,
     validateEmail,
     validateUsername,
     validateName,
     validateRequiredText,
     validateNumeric,
     validatePdfFile,
     validateImageFile
   } from '../utils/validation';
   ```
2. Validate inputs inside `handleSubmit` before making API calls:
   ```javascript
   const nameVal = validateName(fullName, 'Full Name');
   if (!nameVal.isValid) {
     setError(nameVal.error);
     return;
   }
   ```
3. Use `PasswordRequirements` component for password fields:
   ```jsx
   <PasswordRequirements password={password} email={email} username={username} confirmPassword={confirmPassword} />
   ```
4. Perform async file header validation for file pickers:
   ```javascript
   const pdfVal = await validatePdfFile(file, 5);
   if (!pdfVal.isValid) {
     alert(pdfVal.error);
     return;
   }
   ```

---

## 4. Running Validation Unit Tests

Run the unit test suite from the root directory:
```bash
node src/utils/validation.test.js
```
