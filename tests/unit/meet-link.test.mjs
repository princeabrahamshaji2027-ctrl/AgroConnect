// Client-side Google Meet link validation (src/utils/meetLink.js). The server repeats the same rules (migration 14).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMeetLink } from '../../src/utils/meetLink.js';

test('accepts real Google Meet links and normalises them', () => {
  assert.equal(normalizeMeetLink('https://meet.google.com/abc-defg-hij'), 'https://meet.google.com/abc-defg-hij');
  assert.equal(normalizeMeetLink('  HTTPS://MEET.GOOGLE.COM/ABC-DEFG-HIJ?authuser=0 '), 'https://meet.google.com/abc-defg-hij');
  assert.equal(normalizeMeetLink('https://meet.google.com/abc-defg-hij/'), 'https://meet.google.com/abc-defg-hij');
});

test('rejects everything else (scheme, lookalike host, credentials, port, path, fragment, whitespace)', () => {
  for (const bad of ['http://meet.google.com/abc-defg-hij', 'https://meet.google.com.attacker.example/abc-defg-hij',
    'https://attacker.example/meet.google.com/abc-defg-hij', 'https://evilmeet.google.com/abc-defg-hij',
    'https://user:pw@meet.google.com/abc-defg-hij', 'https://user@meet.google.com/abc-defg-hij',
    'https://meet.google.com:8443/abc-defg-hij', 'https://meet.google.com:443/abc-defg-hij', 'javascript:alert(1)', 'data:text/html,<script>1</script>',
    'https://meet.google.com/', 'https://meet.google.com/lookup/abc', 'https://meet.google.com/abc-defg-hij#x',
    'https://meet.google.com/abc defg hij', 'meet.google.com/abc-defg-hij', 'https://meet.google.com/abc-defg-hij?x=<script>',
    '', '   ', null, undefined, 42, 'https://meet.google.com/' + 'a'.repeat(300)]) {
    assert.equal(normalizeMeetLink(bad), null, `accepted ${JSON.stringify(bad)}`);
  }
});
