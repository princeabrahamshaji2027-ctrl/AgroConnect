// Every form's checks against awkward input (empty, spaces, negative, zero, decimals, huge, letters, script tags,
// emoji, one character over the limit) and every file check against renamed / wrong-type files. Exact messages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rules } from '../../src/utils/formRules.js';
import { parseFeeInput } from '../../src/utils/money.js';
import * as appV from '../../src/utils/validation.js';
import * as adminV from '../../admin-dashboard/src/utils/validation.js';

// Node has File/Blob but no FileReader (the validators read the first bytes with it, as browsers do).
globalThis.FileReader ??= class {
  static DONE = 2;
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => { this.readyState = 2; this.result = buf; this.onloadend?.({ target: this }); },
      () => this.onerror?.());
  }
};
const file = (bytes, name, type) => new File([new Uint8Array(bytes)], name, { type });
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0];
const TXT = [...Buffer.from('hello world, not a file')];
const MP4 = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32];

test('consultation fee (expert): only rupees with up to 2 decimals between ₹1 and ₹1,00,000', () => {
  const FORMAT = 'Enter a fee in rupees, for example 500 or 499.50.';
  const RANGE = 'The consultation fee must be between ₹1 and ₹1,00,000.';
  for (const v of ['-1', '-500', '0.001', '1e5', 'abc', '<script>', '५००', '😀', '12.345']) assert.deepEqual(parseFeeInput(v), { error: FORMAT }, v);
  for (const v of ['', '   ', null, undefined]) assert.deepEqual(parseFeeInput(v), { error: 'Enter your consultation fee.' }, String(v));
  for (const v of ['0', '0.99', '100000.01', '9999999']) assert.deepEqual(parseFeeInput(v), { error: RANGE }, v);
  assert.deepEqual(parseFeeInput(' 500 '), { paise: 50000 });
  assert.deepEqual(parseFeeInput('1,000.5'), { paise: 100050 });
  assert.deepEqual(parseFeeInput('₹1'), { paise: 100 });
  assert.deepEqual(parseFeeInput('100000'), { paise: 10000000 });
});

for (const [label, V] of [['app', appV], ['admin', adminV]]) {
  test(`${label} validateNumeric: price ₹0.01–₹1,00,000 (2 decimals), stock 0–1,00,000 whole numbers`, () => {
    const price = (v) => V.validateNumeric(v, { min: 0.01, max: 100000, maxDecimals: 2, fieldName: 'Price' });
    const stock = (v) => V.validateNumeric(v, { min: 0, max: 100000, allowDecimal: false, fieldName: 'Stock Quantity' });
    assert.equal(price('').error, 'Price is required.');
    assert.equal(price('   ').error, 'Price is required.');
    assert.equal(price('-5').error, 'Price must be at least 0.01.');
    assert.equal(price('0').error, 'Price must be at least 0.01.');
    assert.equal(price('100000.01').error, 'Price cannot exceed 100000.');
    assert.equal(price('1.999').error, 'Price can have at most 2 decimal places.');
    for (const v of ['1e3', 'abc', '12abc', '1.2.3', '<script>', '😀', '1 000', 'Infinity', 'NaN']) assert.equal(price(v).error, 'Price must be a valid number.', v);
    assert.deepEqual([price('249.50').isValid, price('249.50').value], [true, 249.5]);
    assert.equal(stock('-1').error, 'Stock Quantity must be at least 0.');
    assert.equal(stock('2.5').error, 'Stock Quantity must be a whole number.');
    assert.equal(stock('100001').error, 'Stock Quantity cannot exceed 100000.');
    assert.equal(stock('0').isValid, true);
  });
}

test('years of experience, district, city, cancellation reason, review, message: limits and exact messages', () => {
  assert.equal(rules.district('Idukki'), null);
  assert.equal(rules.district('Wayanad'), 'Please choose your district.');
  assert.equal(rules.maxLength(100, 'Please keep the city or village under 100 characters.')('a'.repeat(101)),
    'Please keep the city or village under 100 characters.');
  assert.equal(rules.maxLength(100, 'x')('a'.repeat(100)), null);
  assert.equal(rules.cancellationReason(''), 'Please enter a cancellation reason.');
  assert.equal(rules.cancellationReason('   '), 'Please enter a cancellation reason.');
  assert.equal(rules.cancellationReason('a'.repeat(501)), 'Please keep the reason under 500 characters.');
  assert.equal(rules.review('a'.repeat(1001)), 'Please keep the review under 1000 characters.');
  assert.equal(rules.message('a'.repeat(2001)), 'Messages can be up to 2000 characters.');
  assert.equal(rules.message('😀'), null, 'emoji is a valid message');
  assert.equal(rules.rating(0), 'Please choose a rating from 1 to 5.');
  assert.equal(rules.rating(6), 'Please choose a rating from 1 to 5.');
  assert.equal(rules.rating(4.5), 'Please choose a rating from 1 to 5.');
  assert.equal(rules.rating(5), null);
});

test('resume upload: only a genuine PDF up to 5 MB', async () => {
  assert.equal((await appV.validatePdfFile(file(PDF, 'cv.pdf', 'application/pdf'))).isValid, true);
  assert.equal((await appV.validatePdfFile(null)).error, 'Please select a resume PDF file.');
  assert.equal((await appV.validatePdfFile(file(JPG, 'cv.jpg', 'image/jpeg'))).error, 'Resume must be a PDF file (.pdf extension required).');
  assert.equal((await appV.validatePdfFile(file(PDF, 'cv.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).error,
    'Resume must be a PDF file (.pdf extension required).');
  assert.equal((await appV.validatePdfFile(file(TXT, 'cv.pdf', 'text/plain'))).error, 'Resume must be a PDF file (MIME type must be application/pdf).');
  assert.equal((await appV.validatePdfFile(file(TXT, 'cv.pdf', 'application/pdf'))).error, 'File appears to be renamed or corrupted. Genuine PDF file required.');
  const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'cv.pdf', { type: 'application/pdf' });
  assert.equal((await appV.validatePdfFile(big)).error, 'Resume must be smaller than 5 MB.');
});

for (const [label, V] of [['app', appV], ['admin', adminV]]) {
  test(`${label} image upload: only genuine JPG/PNG/WEBP within the size limit`, async () => {
    assert.equal((await V.validateImageFile(file(JPG, 'a.jpg', 'image/jpeg'))).isValid, true);
    assert.equal((await V.validateImageFile(file(PNG, 'a.png', 'image/png'))).isValid, true);
    assert.equal((await V.validateImageFile(file(GIF, 'a.gif', 'image/gif'))).error, 'Allowed image formats: JPG, JPEG, PNG, WEBP.');
    assert.equal((await V.validateImageFile(file(PDF, 'a.pdf', 'application/pdf'))).error, 'Allowed image formats: JPG, JPEG, PNG, WEBP.');
    assert.equal((await V.validateImageFile(file(TXT, 'a.jpg', 'image/jpeg'))).error,
      'File header does not match a supported image format (JPG/PNG/WEBP).');
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.jpg', { type: 'image/jpeg' });
    assert.equal((await V.validateImageFile(big, 5)).error, 'Image must be smaller than 5 MB.');
  });
}

test('post video: only genuine MP4/WEBM/MOV', async () => {
  assert.equal((await appV.validateVideoFile(file(MP4, 'v.mp4', 'video/mp4'))).isValid, true);
  assert.equal((await appV.validateVideoFile(file(MP4, 'v.avi', 'video/x-msvideo'))).error, 'Allowed video formats: MP4, WEBM, MOV.');
  assert.equal((await appV.validateVideoFile(file(TXT, 'v.mp4', 'video/mp4'))).error,
    'File does not look like a video. Please choose an MP4, WEBM or MOV video.');
});

test('file pickers only offer the allowed types', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  for (const p of ['src/pages/EditProfile.jsx', 'src/pages/CreatePost.jsx', 'admin-dashboard/src/components/TopNav.jsx', 'admin-dashboard/src/pages/Broadcasts.jsx']) {
    const src = read(p);
    assert.doesNotMatch(src, /accept="image\/\*"|accept="video\/\*"/, p);
  }
  assert.match(read('src/pages/CreatePost.jsx'), /accept="video\/mp4,video\/webm,video\/quicktime"/);
  assert.match(read('src/pages/UserProfile.jsx'), /accept="application\/pdf"/);
});
