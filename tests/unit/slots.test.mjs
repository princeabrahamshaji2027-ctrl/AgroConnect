// Availability slot rules (src/utils/slots.js) used by Connect.jsx when an expert publishes slots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotEndTime, slotStartsSoonEnough } from '../../src/utils/slots.js';

test('a slot lasts the chosen meeting length', () => {
  assert.equal(slotEndTime('09:00', 15), '09:15');
  assert.equal(slotEndTime('09:00', 30), '09:30');
  assert.equal(slotEndTime('09:45', 45), '10:30');
  assert.equal(slotEndTime('22:00', 60), '23:00');
});

test('a slot never runs past midnight; bad input gives null', () => {
  assert.equal(slotEndTime('23:30', 30), null);
  assert.equal(slotEndTime('23:00', 60), null);
  assert.equal(slotEndTime('23:28', 30), '23:58');
  for (const [t, m] of [['', 30], ['9am', 30], ['09:00', 0], ['09:00', -15], ['09:00', 7.5]]) assert.equal(slotEndTime(t, m), null, `${t}/${m}`);
});

test('a new slot must start at least 30 minutes from now (Asia/Kolkata)', () => {
  const now = Date.parse('2026-10-27T10:00:00+05:30');
  assert.equal(slotStartsSoonEnough('2026-10-27', '09:00', now), false, 'already started');
  assert.equal(slotStartsSoonEnough('2026-10-27', '10:15', now), false, 'within 30 minutes');
  assert.equal(slotStartsSoonEnough('2026-10-27', '10:30', now), true);
  assert.equal(slotStartsSoonEnough('2026-10-28', '06:00', now), true);
  assert.equal(slotStartsSoonEnough('bad', '10:30', now), false);
});
