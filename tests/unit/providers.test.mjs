// MOCKED provider tests: Daily (video) and FCM (push) modules with a fake fetch. They prove request shapes, secret
// handling and error mapping — NOT that a real call connects or a real phone shows a notification.
//   node --test tests/unit/providers.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, generateKeyPairSync } from 'node:crypto';
import { createDailyProvider, roomNameFor, VideoProviderError } from '../../supabase/functions/video-room-token/daily.js';
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

describe('Daily provider (mocked)', () => {
  test('room names come from the server room id only', () => {
    assert.equal(roomNameFor('8f1c…/../x'), 'agro-8f1cx');
  });

  test('missing API key: "not configured", never a fake room', () => {
    assert.throws(() => createDailyProvider({ apiKey: '' }), (e) => e instanceof VideoProviderError && e.status === 503 && !e.retryable);
  });

  test('creates a PRIVATE 2-person room limited to the join window, then a non-owner token for the caller', async () => {
    const f = fakeFetch([
      [(u, i) => u.endsWith('/rooms/agro-r1') && (i.method || 'GET') === 'GET', () => json(404, { error: 'not-found' })],
      [(u, i) => u.endsWith('/rooms') && i.method === 'POST', () => json(200, { name: 'agro-r1', url: 'https://x.daily.co/agro-r1' })],
      [(u) => u.endsWith('/meeting-tokens'), () => json(200, { token: 'tok-123' })],
    ]);
    const p = createDailyProvider({ apiKey: 'k-secret', fetchImpl: f });
    const room = await p.ensureRoom('agro-r1', { nbf: 1000, exp: 2800 });
    assert.equal(room.url, 'https://x.daily.co/agro-r1');
    const create = JSON.parse(f.calls[1].body);
    assert.deepEqual([create.privacy, create.properties.max_participants, create.properties.nbf, create.properties.exp, create.properties.eject_at_room_exp],
      ['private', 2, 1000, 2800, true]);
    const token = await p.createToken({ roomName: 'agro-r1', userId: 'u-1', userName: 'Asha', exp: 2800 });
    assert.equal(token, 'tok-123');
    const props = JSON.parse(f.calls[2].body).properties;
    assert.deepEqual([props.room_name, props.user_id, props.is_owner, props.exp, props.eject_at_token_exp], ['agro-r1', 'u-1', false, 2800, true]);
    for (const c of f.calls) assert.equal(c.headers.Authorization, 'Bearer k-secret');   // key only in the header
  });

  test('existing room is reused; provider errors are mapped (bad key -> 503 not retryable, 5xx/offline -> 502 retryable)', async () => {
    const reuse = fakeFetch([[(u) => u.includes('/rooms/agro-r2'), () => json(200, { url: 'https://x.daily.co/agro-r2' })]]);
    await createDailyProvider({ apiKey: 'k', fetchImpl: reuse }).ensureRoom('agro-r2', { nbf: 1, exp: 2 });
    assert.equal(reuse.calls.filter((c) => c.method === 'POST').length, 0);

    const badKey = createDailyProvider({ apiKey: 'k', fetchImpl: fakeFetch([[() => true, () => json(401, {})]]) });
    await assert.rejects(badKey.ensureRoom('agro-x', { nbf: 1, exp: 2 }), (e) => e.status === 503 && !e.retryable);
    const down = createDailyProvider({ apiKey: 'k', fetchImpl: fakeFetch([[() => true, () => json(503, {})]]) });
    await assert.rejects(down.createToken({ roomName: 'a', userId: 'u', exp: 1 }), (e) => e.status === 502 && e.retryable);
    const offline = createDailyProvider({ apiKey: 'k', fetchImpl: async () => { throw new TypeError('fetch failed'); } });
    await assert.rejects(offline.ensureRoom('a', { nbf: 1, exp: 2 }), (e) => e.status === 502);
  });
});

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
