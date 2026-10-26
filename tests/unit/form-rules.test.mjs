// Inline form validation rules (src/utils/formRules.js): every field gets its reason as text under the field.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rules, validateAllFields } from '../../src/utils/formRules.js';

test('account fields: empty, malformed and valid', () => {
  assert.equal(rules.email(''), 'Please enter your email address.');
  assert.equal(rules.email('not-an-email'), 'Enter a valid email address.');
  assert.equal(rules.email('  farmer@example.com '), null);
  assert.equal(rules.password(''), 'Please enter your password.');
  assert.match(rules.newPassword('email')('abc', { email: 'x@example.com' }), /at least 8/);
  assert.equal(rules.newPassword('email')('Str0ng!Passw0rd', { email: 'x@example.com' }), null);
  assert.equal(rules.confirmPassword('password')('a', { password: 'b' }), 'Passwords do not match.');
  assert.equal(rules.confirmPassword('password')('same', { password: 'same' }), null);
  assert.equal(rules.name()(''), 'Please enter your full name.');
  assert.equal(rules.username(''), 'Please choose a username.');
  assert.equal(rules.phone(true)(''), 'Please enter your phone number.');
  assert.equal(rules.phone(false)(''), null, 'optional phone may stay empty');
});

test('Catch Up fields: description, slot, fee, Meet link, cancellation reason, review', () => {
  assert.equal(rules.meetingDescription('   '), 'Please enter a meeting description.');
  assert.match(rules.meetingDescription('x'.repeat(1001)), /1000/);
  assert.equal(rules.meetingDescription('Leaf curl on tomatoes'), null);
  assert.equal(rules.slot(null), 'Please select an available time slot.');
  assert.equal(rules.slot('slot-id'), null);
  assert.equal(rules.fee(''), 'Please enter a valid consultation fee.');
  assert.equal(rules.fee('-1'), 'Please enter a valid consultation fee.');
  assert.equal(rules.fee('500'), null);
  assert.equal(rules.meetLink(''), 'Please enter the Google Meet link.');
  assert.equal(rules.meetLink('https://zoom.us/j/1'), 'Please enter a valid Google Meet link.');
  assert.equal(rules.meetLink('https://meet.google.com/abc-defg-hij'), null);
  assert.equal(rules.cancellationReason(' '), 'Please enter a cancellation reason.');
  assert.match(rules.cancellationReason('x'.repeat(501)), /500/);
  assert.equal(rules.rating(0), 'Please choose a rating from 1 to 5.');
  assert.equal(rules.rating(5), null);
  assert.equal(rules.review(''), 'Please write a short review.');
});

test('messages: empty and over 2000 characters refused, 2000 allowed', () => {
  assert.equal(rules.message('  '), 'Please type a message.');
  assert.equal(rules.message('x'.repeat(2000)), null);
  assert.match(rules.message('x'.repeat(2001)), /2000/);
});

test('validateAllFields returns only the failing fields, in form order', () => {
  const errors = validateAllFields({ email: rules.email, password: rules.password }, { email: 'bad', password: 'secret' });
  assert.deepEqual(Object.keys(errors), ['email']);
});

test('district: only the three launch districts, canonical spelling', () => {
  for (const ok of ['Kottayam', 'Pathanamthitta', 'Kannur']) assert.equal(rules.district(ok), null, ok);
  for (const bad of ['', null, 'Ludhiana', 'Kottayam District', 'kottayam', 'കോട്ടയം']) {
    assert.equal(rules.district(bad), 'Please choose your district.', String(bad));
  }
});
