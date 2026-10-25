// Firebase Cloud Messaging (HTTP v1) for the push-dispatch Edge Function; also loaded by unit tests with a mocked
// fetch. The service account (JSON) comes only from the function secret FIREBASE_SERVICE_ACCOUNT. Nothing here logs
// tokens, credentials or message text.
// Docs: https://firebase.google.com/docs/cloud-messaging/send/v1-api (send), .../manage-tokens (UNREGISTERED)

const b64url = (bytes) => {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlJson = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

export function parseServiceAccount(raw) {
  if (!raw) return null;
  let sa;
  try { sa = JSON.parse(raw); } catch { throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON'); }
  for (const k of ['project_id', 'client_email', 'private_key']) {
    if (!sa[k]) throw new Error(`FIREBASE_SERVICE_ACCOUNT is missing ${k}`);
  }
  return sa;
}

async function importKey(pem, subtle) {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  return subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

// OAuth2 access token for FCM via a signed JWT (service-account flow).
export async function getAccessToken(sa, { fetchImpl = fetch, now = Date.now(), subtle = crypto.subtle } = {}) {
  const iat = Math.floor(now / 1000);
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  };
  const unsigned = `${b64urlJson({ alg: 'RS256', typ: 'JWT' })}.${b64urlJson(claims)}`;
  const key = await importKey(sa.private_key, subtle);
  const sig = await subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const res = await fetchImpl(claims.aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`FCM auth failed (${res.status})`);
  return json.access_token;
}

// FCM data values must be strings.
const stringData = (data) => Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v ?? '')]));

// One message to one device token. Returns 'sent' | 'invalid' (token is dead: disable it) | 'retry' | 'config'.
export async function sendToToken({ projectId, accessToken, token, title, body, data, fetchImpl = fetch }) {
  let res;
  try {
    res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: stringData(data),
          android: { priority: 'HIGH', notification: { channel_id: 'agro_consultations' } },
        },
      }),
    });
  } catch {
    return 'retry';
  }
  if (res.ok) return 'sent';
  const json = await res.json().catch(() => ({}));
  const code = json?.error?.details?.find?.((d) => d.errorCode)?.errorCode || json?.error?.status || '';
  if (res.status === 404 || code === 'UNREGISTERED') return 'invalid';
  if (res.status === 400 && /INVALID_ARGUMENT/.test(code)) return 'invalid';
  if (res.status === 401 || res.status === 403 || code === 'SENDER_ID_MISMATCH') return 'config';
  return 'retry';   // 429 / 5xx / anything else temporary
}

// Deliver one claimed outbox row to all of its devices; one bad token never stops the others.
export async function deliver(item, send) {
  if (!item.devices?.length) return { result: 'no_device', delivered: 0, invalid: [] };
  let delivered = 0; const invalid = []; let retry = false; let config = false;
  for (const d of item.devices) {
    const r = await send(d.token, item);
    if (r === 'sent') delivered += 1;
    else if (r === 'invalid') invalid.push(d.id);
    else if (r === 'config') config = true;
    else retry = true;
  }
  if (delivered > 0) return { result: 'sent', delivered, invalid };
  if (retry || config) return { result: 'retry', delivered, invalid, error: config ? 'FCM credentials rejected' : 'FCM temporarily unavailable' };
  return { result: 'failed', delivered, invalid, error: 'all device tokens invalid' };
}
