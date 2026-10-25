// Push-notification tap payloads: only a well-formed booking id is ever acted on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePushTap } from '../../src/utils/pushTap.js';

test('valid booking tap -> booking id; anything else ignored', () => {
  const id = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
  assert.deepEqual(parsePushTap({ kind: 'booking', booking_id: id }), { kind: 'booking', bookingId: id });
  for (const bad of [null, {}, { kind: 'like', booking_id: id }, { kind: 'booking' }, { kind: 'booking', booking_id: '' },
    { kind: 'booking', booking_id: `${id}' or 1=1` }, { kind: 'booking', booking_id: 'javascript:alert(1)' }, { kind: 'booking', booking_id: '../admin' }]) {
    assert.equal(parsePushTap(bad), null, JSON.stringify(bad));
  }
});
