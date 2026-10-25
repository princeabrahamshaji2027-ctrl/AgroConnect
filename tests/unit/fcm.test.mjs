// MOCKED provider tests: the FCM (push) module with a fake fetch. They prove request shapes, secret handling and error
// mapping — NOT that a real phone shows a notification.
//   node --test tests/unit/fcm.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, generateKeyPairSync } from 'node:crypto';
import { deliver, getAccessToken, parseServiceAccount, sendToToken } from '../../supabase/functions/push-dispatch/fcm.js';

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function fakeFetch(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    for (const [match, handler] of routes) if (match(url, init)) return handler(url, init, calls);
    return json(404, { error: 'not-found' });
  };
  f.calls = calls;
  return f;
}

describe('FCM (mocked)', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = { project_id: 'agro-test', client_email: 'push@agro-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token' };

  test('service account JSON is validated', () => {
    assert.equal(parseServiceAccount(''), null);
    assert.throws(() => parseServiceAccount('{"project_id":"x"}'), /missing client_email/);
    assert.throws(() => parseServiceAccount('not json'), /not valid JSON/);
  });

  test('OAuth: a correctly signed RS256 JWT with the messaging scope is exchanged for an access token', async () => {
    let assertion;
    const f = fakeFetch([[(u) => u === sa.token_uri, (u, i) => { assertion = new URLSearchParams(i.body).get('assertion'); return json(200, { access_token: 'ya29.mock' }); }]]);
    assert.equal(await getAccessToken(sa, { fetchImpl: f, now: 1_800_000_000_000, subtle: webcrypto.subtle }), 'ya29.mock');
    const [h, c, s] = assertion.split('.');
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    assert.equal(JSON.parse(Buffer.from(h, 'base64url').toString()).alg, 'RS256');
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging');
    assert.equal(claims.exp - claims.iat, 3600);
    const pub = await webcrypto.subtle.importKey('spki', (await import('node:crypto')).createPublicKey(privateKey).export({ type: 'spki', format: 'der' }),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    assert.ok(await webcrypto.subtle.verify('RSASSA-PKCS1-v1_5', pub, Buffer.from(s, 'base64url'), new TextEncoder().encode(`${h}.${c}`)), 'signature does not verify');
  });

  test('send maps FCM answers: 200 sent, UNREGISTERED/404 invalid, 401 config, 429/5xx/offline retry; data values are strings', async () => {
    let body;
    const ok = fakeFetch([[() => true, (u, i) => { body = JSON.parse(i.body); return json(200, { name: 'm/1' }); }]]);
    assert.equal(await sendToToken({ projectId: 'p', accessToken: 'a', token: 't', title: 'AgroConnect', body: 'b', data: { booking_id: 'x', n: 5 }, fetchImpl: ok }), 'sent');
    assert.deepEqual(body.message.data, { booking_id: 'x', n: '5' });
    assert.equal(body.message.android.notification.channel_id, 'agro_consultations');
    const cases = [
      [404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }, 'invalid'],
      [400, { error: { status: 'INVALID_ARGUMENT' } }, 'invalid'],
      [401, { error: { status: 'UNAUTHENTICATED' } }, 'config'],
      [429, {}, 'retry'],
      [503, {}, 'retry'],
    ];
    for (const [st, b, want] of cases) {
      assert.equal(await sendToToken({ projectId: 'p', accessToken: 'a', token: 't', title: 't', body: 'b', fetchImpl: fakeFetch([[() => true, () => json(st, b)]]) }), want, `HTTP ${st}`);
    }
    assert.equal(await sendToToken({ projectId: 'p', accessToken: 'a', token: 't', title: 't', body: 'b', fetchImpl: async () => { throw new Error('x'); } }), 'retry');
  });

  test('one dead token does not stop the others; results map to outbox states', async () => {
    const item = { devices: [{ id: 'd1', token: 'dead' }, { id: 'd2', token: 'live' }] };
    const r = await deliver(item, async (tok) => (tok === 'dead' ? 'invalid' : 'sent'));
    assert.deepEqual(r, { result: 'sent', delivered: 1, invalid: ['d1'] });
    assert.equal((await deliver({ devices: [] }, async () => 'sent')).result, 'no_device');
    assert.equal((await deliver(item, async () => 'retry')).result, 'retry');
    assert.equal((await deliver(item, async () => 'invalid')).result, 'failed');
    assert.equal((await deliver(item, async () => 'config')).result, 'retry');
  });
});
