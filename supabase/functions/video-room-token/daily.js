// Daily (daily.co) REST calls for one consultation room. Used by the video-room-token Edge Function and by the unit
// tests (with a mocked fetch). The API key never leaves the server; tokens are short-lived and per participant.
// Docs: https://docs.daily.co/reference/rest-api/rooms/create-room, .../meeting-tokens/create-meeting-token
const API = 'https://api.daily.co/v1';

export class VideoProviderError extends Error {
  constructor(message, { status = 502, retryable = true } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

// Room name from the server-side room id (video_meetings.id): unguessable and stable for the booking.
export const roomNameFor = (roomId) => `agro-${String(roomId).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 60)}`;

export function createDailyProvider({ apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new VideoProviderError('video provider not configured', { status: 503, retryable: false });
  const call = async (method, path, body) => {
    let res;
    try {
      res = await fetchImpl(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new VideoProviderError('video provider unreachable', { status: 502 });
    }
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new VideoProviderError('video provider rejected the API key', { status: 503, retryable: false });
    if (res.status === 429 || res.status >= 500) throw new VideoProviderError(`video provider error ${res.status}`, { status: 502 });
    return { status: res.status, json };
  };

  return {
    // Private room for exactly the two participants, open only during the join window.
    async ensureRoom(name, { nbf, exp }) {
      const existing = await call('GET', `/rooms/${encodeURIComponent(name)}`);
      if (existing.status === 200 && existing.json?.url) return existing.json;
      const created = await call('POST', '/rooms', {
        name,
        privacy: 'private',
        properties: { nbf, exp, max_participants: 2, eject_at_room_exp: true, enable_chat: true, enable_screenshare: false },
      });
      if (created.status === 200 && created.json?.url) return created.json;
      // created in parallel by the other participant: read it again
      const again = await call('GET', `/rooms/${encodeURIComponent(name)}`);
      if (again.status === 200 && again.json?.url) return again.json;
      throw new VideoProviderError(`could not create room (${created.status})`, { status: 502 });
    },

    // Token for one participant: their user id + display name, never owner, ends with the meeting.
    async createToken({ roomName, userId, userName, exp }) {
      const r = await call('POST', '/meeting-tokens', {
        properties: {
          room_name: roomName,
          user_id: String(userId).slice(0, 36),
          user_name: String(userName || 'Participant').slice(0, 60),
          is_owner: false,
          exp,
          eject_at_token_exp: true,
          enable_screenshare: false,
        },
      });
      if (r.status !== 200 || !r.json?.token) throw new VideoProviderError(`could not create token (${r.status})`, { status: 502 });
      return r.json.token;
    },
  };
}
