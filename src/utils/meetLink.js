// Google Meet links for consultations. The expert creates the meeting in Google Meet and pastes its link; the server
// (normalize_meet_link / set_meeting_link, migration 14) validates it again and is the authority. Both sides accept
// only https://meet.google.com/abc-defg-hij (a query such as ?authuser=0 is dropped) and store that normalised form.

const CODE_PATH = /^\/([a-z]{3}-[a-z]{4}-[a-z]{3})\/?$/;
const SAFE_QUERY = /^(\?[a-z0-9=&_.%-]*)?$/i;

export const MEET_LINK_HINT = 'https://meet.google.com/abc-defg-hij';

// Returns the normalised link, or null for anything else (http, lookalike hosts, user@host, ports, other paths, …).
export function normalizeMeetLink(input) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw || raw.length > 200 || /[\s#]/.test(raw)) return null;
  if (!raw.toLowerCase().startsWith('https://meet.google.com/')) return null;   // also rules out :443, user@, lookalikes
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (url.hostname !== 'meet.google.com') return null;      // URL() lower-cases the host; exact match, no suffixes
  if (!SAFE_QUERY.test(raw.includes('?') ? raw.slice(raw.indexOf('?')) : '')) return null;   // raw text: URL() would percent-encode
  const m = CODE_PATH.exec(url.pathname.toLowerCase());
  return m ? `https://meet.google.com/${m[1]}` : null;
}

const isNative = () => !!window.Capacitor?.isNativePlatform?.();

// Web: browsers only allow a new tab during the tap itself, but the link comes from the server a moment later. Open an
// empty tab now (without a reference back to this app) and point it at the link once the server answered.
export function prepareMeetWindow() {
  if (isNative()) return null;
  const w = window.open('about:blank', '_blank');
  if (w) w.opener = null;
  return w;
}

// Opens the saved link outside AgroConnect: the Google Meet app (or the browser) on Android, a new tab on the web.
// The link is validated again here, so nothing else can ever be opened by this button.
export async function openMeetingLink(link, preparedWindow = null) {
  const safe = normalizeMeetLink(link);
  if (!safe) {
    preparedWindow?.close();
    return { ok: false, error: 'This meeting link is not a valid Google Meet link. Ask the expert to update it.' };
  }
  if (isNative()) {
    try {
      const { AppLauncher } = await import('@capacitor/app-launcher');
      const { completed } = await AppLauncher.openUrl({ url: safe });
      if (completed) return { ok: true };
    } catch { /* no app took it: try the browser below */ }
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: safe });
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not open Google Meet. Install the Google Meet app or a web browser and try again.' };
    }
  }
  if (preparedWindow && !preparedWindow.closed) {
    preparedWindow.location.replace(safe);
    return { ok: true };
  }
  const w = window.open(safe, '_blank', 'noopener,noreferrer');
  if (w === null && !preparedWindow) {
    // with noopener most browsers return null even when the tab opened, so this is only a hint
    return { ok: true, maybeBlocked: true };
  }
  return { ok: true };
}
