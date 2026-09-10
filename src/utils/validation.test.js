import {
  validatePassword,
  validateUsername,
  validateEmail,
  validateName,
  validatePhone,
  validateRequiredText,
  validateNumeric
} from './validation.js';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`✓ PASS: ${testName}`);
  } else {
    failed++;
    console.error(`❌ FAIL: ${testName}`);
  }
}

console.log('=== AgroConnect Validation Unit Tests ===\n');

// 1. Password Tests
assert(validatePassword('Agro@2026Farm').isValid === true, 'Valid password passes');
assert(validatePassword('short').isValid === false, 'Too short password fails');
assert(validatePassword('AGROCONNECT123!').isValid === false, 'No lowercase fails');
assert(validatePassword('agroconnect123!').isValid === false, 'No uppercase fails');
assert(validatePassword('AgroConnect!').isValid === false, 'No number fails');
assert(validatePassword('AgroConnect123').isValid === false, 'No special char fails');
assert(validatePassword('Agro 2026!').isValid === false, 'Space in password fails');
assert(validatePassword('User1Pass!', 'user1@agroconnect.com').isValid === false, 'Password containing email prefix fails');
assert(validatePassword('Farmer123!', '', 'farmer123').isValid === false, 'Password containing username fails');
assert(validatePassword('password', '', '').isValid === false, 'Common password fails');

// 2. Username Tests
assert(validateUsername('farmer_123').isValid === true, 'Valid username passes');
assert(validateUsername('ab').isValid === false, 'Too short username fails');
assert(validateUsername('john smith').isValid === false, 'Username with spaces fails');
assert(validateUsername('user@name').isValid === false, 'Username with special chars fails');

// 3. Email Tests
assert(validateEmail('test@example.com').isValid === true, 'Valid email passes');
assert(validateEmail('invalid-email').isValid === false, 'Invalid email structure fails');
assert(validateEmail('user@').isValid === false, 'Incomplete email fails');

// 4. Name Tests
assert(validateName("O'Connor").isValid === true, 'Name with apostrophe passes');
assert(validateName('Mary-Jane').isValid === true, 'Hyphenated name passes');
assert(validateName('   ').isValid === false, 'Whitespace name fails');

// 5. Phone Tests
assert(validatePhone('+91 9876543210').isValid === true, 'Valid phone with country code passes');
assert(validatePhone('abc12345').isValid === false, 'Alphabetic phone fails');

// 6. Required Text Tests
assert(validateRequiredText('Valid content').isValid === true, 'Non-empty text passes');
assert(validateRequiredText('   ').isValid === false, 'Whitespace-only text fails');

// 7. Numeric Range Tests
assert(validateNumeric(50, { min: 1 }).isValid === true, 'Positive price passes');
assert(validateNumeric(-10, { min: 0 }).isValid === false, 'Negative stock fails');
assert(validateNumeric('NaN').isValid === false, 'NaN numeric fails');

console.log(`\nResults: ${passed} Passed, ${failed} Failed.`);
if (failed > 0) process.exit(1);
