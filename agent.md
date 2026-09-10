You are acting as a **senior full-stack engineer and security-focused code reviewer** working on my existing **AgroConnect** project.

Your task is to **inspect the entire existing codebase first and then implement a comprehensive, production-quality form validation system throughout the project**.

Do NOT blindly create new validation code before understanding the existing architecture.

The existing project may contain a Django/Django REST Framework backend, database models, APIs, authentication, user registration, expert applications, marketplace forms, social posts, comments, profile editing, and an admin panel. **Adapt everything below to the actual architecture and existing code. Do not assume model names, field names, routes, or frontend framework names.**

---

# 1. FIRST: AUDIT THE ENTIRE PROJECT

Before modifying anything:

1. Inspect the complete project structure.
2. Identify:

   * Frontend framework
   * Backend framework
   * Authentication implementation
   * User model
   * Profile model
   * Expert application model
   * Resume/document upload implementation
   * Post creation forms
   * Marketplace/product forms
   * Comment/reply forms
   * Profile editing forms
   * Admin forms
   * API endpoints
   * Serializers
   * Django forms/model validation if present
   * Existing frontend validation
   * Existing backend validation
   * File-upload/storage configuration
3. Find every user-facing form/input in the application.
4. Identify where validation currently exists.
5. Identify missing or inconsistent validation.
6. Determine whether validation is currently happening:

   * only in frontend
   * only in backend
   * or in both.
7. Preserve the existing architecture wherever possible.

### IMPORTANT

Do not duplicate validation logic unnecessarily.

If the same rule is used in multiple places, create a **centralized validation strategy** where practical.

Before making changes, understand the actual code and use the project's existing conventions.

---

# 2. CORE VALIDATION PRINCIPLE

Implement validation at **two levels** wherever applicable:

### Frontend validation

Used for immediate user feedback.

Example:

```text
Password must contain at least one uppercase letter.
```

The user should know what is wrong before submitting.

### Backend validation

Used as the authoritative security/business validation.

Never trust frontend validation.

A malicious user can bypass frontend JavaScript and directly call the API.

Therefore:

```text
Frontend validation
        ↓
User experience
        ↓
API request
        ↓
Backend validation
        ↓
Database
```

The backend must reject invalid data even if frontend validation is bypassed.

---

# 3. PASSWORD VALIDATION

Create one clearly defined AgroConnect password policy and use it consistently during:

* Sign up
* Password reset
* Change password
* Any password creation form
* Admin-created users, if applicable

Use the following policy unless the existing project has a security requirement that makes an adjustment necessary:

### Password must:

* Be at least **8 characters**
* Contain at least **1 uppercase letter**
* Contain at least **1 lowercase letter**
* Contain at least **1 number**
* Contain at least **1 special character**
* Contain **NO spaces**
* Not contain the user's email address
* Not contain the username
* Not be an extremely common password
* Password confirmation must exactly match the password

Example valid password:

```text
Agro@2026Farm
```

Examples that must fail:

```text
agroconnect
```

Reason:
No uppercase, number, or special character.

```text
Agroconnect
```

Reason:
No number or special character.

```text
Agro123456
```

Reason:
No special character.

```text
AGRO@123
```

Reason:
No lowercase character.

```text
Agro @123
```

Reason:
Contains a space.

```text
password
```

Reason:
Common/weak password.

---

# 4. PASSWORD UI

Do not make the user guess why their password is invalid.

While the user is entering the password, display a password requirements checklist such as:

```text
Password requirements

✓ At least 8 characters
✓ One uppercase letter
✓ One lowercase letter
✓ One number
✓ One special character
✓ No spaces
✓ Passwords match
```

Use the project's existing UI design system.

Do NOT introduce an unrelated visual style.

Show clear error messages.

Examples:

```text
Password must contain at least one uppercase letter.
```

```text
Password must contain at least one number.
```

```text
Password cannot contain spaces.
```

```text
Passwords do not match.
```

Do not expose internal backend errors to users.

---

# 5. USERNAME VALIDATION

Inspect the existing username rules first.

Then implement appropriate restrictions.

Recommended policy:

* Required
* Trim leading/trailing whitespace
* No spaces
* Only allow:

  * letters
  * numbers
  * underscore
* Minimum 3 characters
* Maximum length according to the existing database model
* Must be unique
* Case-insensitive uniqueness if compatible with the existing system

Examples:

Valid:

```text
farmer_123
agroexpert
john_2026
```

Invalid:

```text
john smith
```

```text
john@123
```

```text
ab
```

Return a clear error message explaining the problem.

---

# 6. EMAIL VALIDATION

For every email input:

* Required where applicable
* Validate email structure
* Trim accidental leading/trailing whitespace
* Normalize appropriately
* Enforce uniqueness where the application's business rules require it
* Prevent obviously malformed values

Examples of invalid input:

```text
john
john@
@example.com
john @gmail.com
```

Do not rely exclusively on a frontend regex.

Backend validation must also exist.

---

# 7. NAME VALIDATION

For first name, last name, full name, etc.:

* Required where the field is required
* Trim whitespace
* Reject values consisting only of spaces
* Prevent unreasonable lengths
* Do not allow accidental leading/trailing whitespace to be stored
* Support legitimate human names rather than using an overly restrictive alphabet-only regex

Do NOT create a stupid validation rule that rejects legitimate names containing characters such as:

```text
O'Connor
Mary-Jane
José
```

Validation should prevent garbage input, not discriminate against legitimate names.

---

# 8. PHONE NUMBER VALIDATION

Where phone numbers exist:

* Validate format according to the application's intended countries/region.
* Do not blindly accept arbitrary strings.
* Trim whitespace.
* Reject clearly invalid values.
* Store numbers consistently according to the existing database design.

If the project already has a country-code system, use it.

If it does not, do not redesign the entire authentication system unnecessarily.

---

# 9. REQUIRED FIELD VALIDATION

Every required field throughout the application must actually be validated.

A form should never allow:

```text
""
"   "
null
undefined
```

when the field is required.

For text inputs:

```text
Trim → validate → submit
```

Do not merely check:

```javascript
if (value)
```

without considering whitespace.

For example:

```text
"     "
```

must not pass required-field validation.

---

# 10. EXPERT APPLICATION — RESUME UPLOAD

This is especially important.

When a user applies to become an **Expert**, the resume upload must accept **PDF files only**.

The system must reject:

```text
.jpg
.jpeg
.png
.webp
.gif
.doc
.docx
.xls
.xlsx
.ppt
.pptx
.zip
.rar
.exe
.js
.html
.svg
etc.
```

Only:

```text
.pdf
```

should be accepted.

---

# 11. DO NOT TRUST FILE EXTENSION

Do NOT implement the PDF restriction only by checking:

```text
filename.endsWith(".pdf")
```

That is insufficient.

A malicious user could rename:

```text
malware.exe
```

to:

```text
resume.pdf
```

Therefore implement validation at multiple levels.

### Frontend

Use:

```text
accept="application/pdf"
```

where supported.

Also check:

* selected file type
* extension
* file size

### Backend

The backend must independently validate:

1. File exists.
2. File size is within the allowed limit.
3. Extension is `.pdf`.
4. MIME/content type is PDF.
5. File content actually represents a valid PDF.
6. Reject renamed non-PDF files.

Do not trust:

```text
Content-Type
```

alone either.

---

# 12. RESUME SIZE LIMIT

Inspect the existing project's upload/storage configuration.

If no limit exists, introduce a reasonable default such as:

```text
Maximum resume size: 5 MB
```

Make the limit configurable.

The user should receive:

```text
Resume must be a PDF file.
```

or:

```text
Resume must be smaller than 5 MB.
```

Do not return vague errors such as:

```text
Upload failed.
```

---

# 13. RESUME SECURITY

Treat uploaded resumes as untrusted files.

Ensure:

* Only PDF files are accepted.
* Dangerous file types are rejected.
* File names are sanitized.
* User-provided filenames cannot manipulate storage paths.
* Uploaded files cannot overwrite arbitrary existing files.
* Files are stored using safe/generated names where appropriate.
* The upload path is controlled by the backend.
* The application does not execute uploaded files.
* Existing authentication/authorization rules are preserved.
* Users cannot access another user's private resume unless the application explicitly allows it.

If the project already has cloud storage such as S3 or another provider, adapt the implementation to it instead of creating a parallel storage system.

---

# 14. EXPERT FORM VALIDATION

The expert application form should validate at minimum:

```text
Full name
Email
Phone
Professional title
Experience
Specialization
Bio/description
Resume
Any other existing required fields
```

Do not invent fields that don't exist.

Use the existing project's actual fields.

Validate:

* Required fields
* Maximum lengths
* Minimum lengths where meaningful
* Whitespace
* Numeric ranges
* File type
* File size
* Valid choices/options
* Duplicate applications if the business rules require prevention

---

# 15. NUMERIC INPUT VALIDATION

For fields such as:

```text
Age
Experience
Price
Quantity
Year
Followers
Crop quantity
Product quantity
etc.
```

inspect the actual business meaning and enforce sensible ranges.

Examples:

```text
Price > 0
Quantity > 0
Experience >= 0
Age within a sensible human range if age is actually required
```

Do not allow:

```text
NaN
Infinity
negative values
alphabetic garbage
unexpected decimals
```

unless the actual business logic permits them.

Do not use arbitrary restrictions just for the sake of validation.

---

# 16. MARKETPLACE / PRODUCT FORMS

Inspect every marketplace-related form.

Validate things such as:

### Product name

* Required
* Trimmed
* Reasonable maximum length

### Price

* Required where applicable
* Numeric
* Greater than zero
* Reasonable decimal precision

### Quantity

* Numeric
* Non-negative or positive according to business rules

### Description

* Required where applicable
* Trimmed
* Maximum length

### Images

If the application allows product images:

* Validate allowed image formats.
* Validate MIME type.
* Validate file size.
* Reject unsupported files.
* Prevent dangerous uploads.

Do not automatically apply the PDF-only rule to image fields.

Each upload field must have its own correct validation policy.

---

# 17. PROFILE EDITING

Users should not be able to bypass validation simply because they are editing an existing profile.

Apply the same relevant rules to:

* Name
* Email
* Phone
* Username
* Bio
* Location
* Interests
* Profile image
* Other editable fields

Do not allow invalid values to enter the database through profile updates.

---

# 18. SOCIAL POSTS

Inspect the post creation/editing system.

Implement appropriate validation for:

* Post content
* Character limits
* Required fields
* Images/media
* Links if supported
* Hashtags if supported

Prevent completely empty posts such as:

```text
""
"   "
```

If the application allows image-only posts, preserve that existing functionality.

Do not accidentally force text when the existing product intentionally supports media-only posts.

---

# 19. COMMENTS AND REPLIES

Validate:

* Required content
* Empty/whitespace-only comments
* Maximum length
* Safe handling of user-generated text

Preserve existing functionality.

Do not unnecessarily strip legitimate user content.

---

# 20. SELECT / ENUM FIELDS

For fields such as:

```text
Role
Gender
Category
Crop type
Experience level
Location
Product category
etc.
```

do not trust arbitrary values sent by the client.

The backend must verify that submitted values exist in the allowed choices.

For example, if role choices are:

```text
farmer
seller
expert
distributor
```

reject:

```text
admin
superuser
random_value
```

unless the authenticated user is explicitly authorized to set that value.

---

# 21. ROLE / PRIVILEGE VALIDATION

This is critical.

Never rely on a form field such as:

```text
role = "admin"
```

to determine privileges.

Backend authorization must determine whether a user is allowed to:

* Become an expert
* Change their role
* Create admin users
* Approve experts
* Modify another user's data
* Delete another user's data
* Access private documents

A malicious client must not be able to manipulate role fields through API requests.

---

# 22. FRONTEND ERROR UX

Validation errors should appear next to the relevant field whenever possible.

Example:

```text
Password
[ Agro123 ]

❌ Password must contain at least one special character.
```

Not:

```text
Something went wrong.
```

For multiple errors:

```text
Please fix the following:

❌ Password needs one special character.
❌ Phone number is invalid.
❌ Resume must be a PDF.
```

Preserve the user's valid form input when possible.

Do not clear the entire form just because one field failed.

---

# 23. BACKEND API ERROR FORMAT

Inspect the project's current API error format.

Do not introduce an incompatible error format unless necessary.

If using Django REST Framework, return structured field-level errors where appropriate.

For example:

```json
{
  "password": [
    "Password must contain at least one uppercase letter."
  ],
  "resume": [
    "Only PDF files are allowed."
  ]
}
```

The frontend should map these errors to the appropriate fields.

---

# 24. VALIDATION ARCHITECTURE

Avoid scattering hundreds of random regex checks throughout components.

Where practical, create reusable validation utilities.

For example:

```text
validators/
    passwordValidator
    emailValidator
    usernameValidator
    phoneValidator
    fileValidator
```

On the backend, use appropriate centralized validators, serializers, model validation, or service-layer validation according to the project's existing architecture.

There should be a clear separation between:

```text
Validation
Business logic
Database operations
UI
```

---

# 25. DATABASE-LEVEL PROTECTION

Where appropriate, add database constraints for rules that must ALWAYS be true.

Examples:

* Unique username
* Unique email where required
* Valid relationships
* Non-negative numeric values where appropriate

Do not rely exclusively on frontend or backend checks for fundamental database integrity.

However, do not add destructive migrations or alter production data blindly.

Create proper migrations and inspect them before applying.

---

# 26. SECURITY AGAINST CLIENT-SIDE BYPASS

After implementation, test the API directly.

Do not assume the frontend is secure.

Attempt requests such as:

```text
POST /signup
```

with:

```text
weak password
```

and verify the backend rejects it.

Attempt:

```text
resume.jpg
```

renamed as:

```text
resume.pdf
```

and verify it is rejected.

Attempt invalid role values.

Attempt missing required fields.

Attempt whitespace-only values.

Attempt oversized uploads.

Attempt invalid numeric values.

Attempt malformed emails.

The backend must reject these independently of the frontend.

---

# 27. VALIDATION TESTS

Create or update automated tests for the important validation rules.

At minimum test:

### Password

* Valid password
* Too short
* No uppercase
* No lowercase
* No number
* No special character
* Contains space
* Password mismatch
* Common/weak password
* Username included
* Email included

### Email

* Valid
* Invalid
* Empty
* Duplicate if uniqueness applies

### Username

* Valid
* Too short
* Spaces
* Invalid characters
* Duplicate

### Resume

* Valid PDF
* JPG
* PNG
* DOCX
* EXE
* Fake PDF extension
* Oversized PDF
* Empty upload

### Required fields

* Empty
* Null
* Whitespace-only

### Numeric fields

* Valid positive number
* Zero where invalid
* Negative number
* Text
* Decimal where inappropriate

### Authorization

* User attempting unauthorized role changes
* User attempting unauthorized expert/admin operations

---

# 28. DO NOT BREAK EXISTING FEATURES

This is extremely important.

Before finishing:

Run the existing test suite if available.

Check:

* Sign up
* Login
* Logout
* Password reset
* Profile editing
* Expert application
* Resume upload
* Posts
* Comments
* Marketplace
* Admin panel
* Existing API endpoints
* Existing database relationships

Do not change unrelated functionality.

Do not redesign the UI.

Do not replace existing components unnecessarily.

Do not rename API endpoints unless absolutely required.

Do not change database fields unless necessary.

---

# 29. VALIDATION DOCUMENTATION

Create a concise developer document in the project explaining:

```text
AgroConnect Validation Rules
```

Include:

1. Password policy
2. Username policy
3. Email policy
4. Phone policy
5. Required-field policy
6. Resume upload policy
7. Image upload policy
8. Numeric validation
9. Marketplace validation
10. Expert application validation
11. Backend vs frontend responsibilities
12. How to add validation to a new form
13. How to run validation tests

This should become the project's reference for future development.

---

# 30. IMPLEMENTATION PROCESS

Follow this exact workflow:

### STEP 1 — AUDIT

Inspect the entire repository.

### STEP 2 — REPORT

Before making major changes, identify:

```text
Current validation:
Missing validation:
Duplicate validation:
Security risks:
Forms requiring validation:
Upload fields:
Relevant backend endpoints:
Relevant frontend components:
```

### STEP 3 — DESIGN

Create a validation strategy based on the actual codebase.

### STEP 4 — IMPLEMENT

Implement reusable frontend and backend validation.

### STEP 5 — FILE SECURITY

Implement strict resume PDF validation and appropriate validation for other upload fields.

### STEP 6 — DATABASE

Add only necessary constraints/migrations.

### STEP 7 — TEST

Test valid and invalid inputs.

### STEP 8 — BYPASS TEST

Directly attack the API with invalid requests to verify frontend validation cannot be bypassed.

### STEP 9 — REGRESSION TEST

Verify existing features still work.

### STEP 10 — FINAL REPORT

Give me a concise final report containing:

```text
Files changed:
Validation rules implemented:
Frontend validation:
Backend validation:
Database constraints:
File upload security:
Tests added:
Tests passed:
Potential remaining issues:
```

---

# 31. IMPORTANT CODING RULES

Do NOT:

* blindly trust frontend validation
* validate passwords only with JavaScript
* validate PDFs only using `.pdf`
* trust MIME type alone
* trust client-supplied role values
* accept arbitrary enum values
* allow whitespace-only required fields
* duplicate the same validation logic everywhere
* remove existing functionality
* create unnecessary migrations
* expose internal exceptions to users
* silently swallow validation errors
* hardcode secrets
* hardcode production URLs
* disable CSRF/authentication/security mechanisms to make validation work
* weaken existing authentication
* modify production configuration

Do:

* inspect first
* reuse existing architecture
* centralize reusable validation
* validate on frontend and backend
* enforce security-sensitive rules on backend
* provide clear field-level errors
* test malicious/bypassed requests
* keep the implementation maintainable
* preserve existing UI/UX
* use migrations properly
* document the final validation system

---

# 32. FINAL ACCEPTANCE CRITERIA

Consider this task complete ONLY when:

### Signup

A user cannot register with an invalid password, username, email, or required field.

### Password

The defined password policy is enforced both frontend and backend.

### Expert application

A user cannot submit an invalid resume.

Only genuine PDF files within the allowed size are accepted.

### Other forms

Every important user-facing form has appropriate validation based on its actual business purpose.

### Backend

Direct API requests containing invalid data are rejected.

### Security

Client-side validation can be bypassed without allowing invalid data into the database.

### UX

Users receive clear, understandable validation messages.

### Tests

Important validation rules have automated tests.

### Existing application

Existing functionality continues to work.

---

## MOST IMPORTANT INSTRUCTION

**Do not start by writing code.**

First inspect the actual AgroConnect repository and understand how the current application works.

Then implement the validation system **inside the existing architecture**, rather than creating a parallel system.

If an instruction above conflicts with the actual application's existing business rules, **do not blindly override the application**. Identify the conflict, preserve the existing business requirement where appropriate, and explain the decision in the final report.

Your goal is not merely to make forms display red error messages.

Your goal is to make **AgroConnect reject invalid, malformed, unsafe, and unauthorized data at the correct architectural layer while keeping the application functional and maintainable.**
