// Android push notifications (FCM through @capacitor/push-notifications). The device token is stored on the server
// only through register_push_device(), which ties it to the signed-in user; nothing here logs tokens.
// Push only works in builds made with android/app/google-services.json (VITE_PUSH_ENABLED=1 is set by the build
// script then): calling register() without Firebase configured crashes the native plugin, so it is never called.
import { supabase } from '../supabase';
import { parsePushTap } from './pushTap';

export { parsePushTap };

const PREF_KEY = 'agro_push_enabled';         // user's in-app choice (Settings)
const TOKEN_KEY = 'agro_push_token';          // last token this device registered

const isNative = () => !!window.Capacitor?.isNativePlatform?.();
export const pushSupported = () => isNative() && import.meta.env.VITE_PUSH_ENABLED === '1';
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage blocked */ } };
export const pushPreference = () => read(PREF_KEY) !== 'off';

let listenersReady = false;
let pendingTap = null;
let tapHandler = null;


async function plugin() {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  return PushNotifications;
}

// Install listeners once, as early as possible, so a tap that cold-starts the app is not lost.
export async function initPushListeners(onTap) {
  tapHandler = onTap;
  if (pendingTap && onTap) { const t = pendingTap; pendingTap = null; onTap(t); }
  if (!pushSupported() || listenersReady) return;
  listenersReady = true;
  const PN = await plugin();
  await PN.addListener('registration', async ({ value }) => {
    const { App } = await import('@capacitor/app');
    const { id } = await App.getInfo();
    const { error } = await supabase.rpc('register_push_device', { p_token: value, p_platform: 'android', p_app_id: id });
    if (!error) write(TOKEN_KEY, value);
  });
  await PN.addListener('registrationError', () => { /* stays in-app only; nothing sensitive to report */ });
  await PN.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const tap = parsePushTap(notification?.data);
    if (!tap) return;
    if (tapHandler) tapHandler(tap); else pendingTap = tap;
  });
  await PN.createChannel?.({ id: 'agro_consultations', name: 'Consultations', description: 'Bookings, reminders and meeting updates', importance: 4 }).catch(() => {});
}

// After sign-in: ask (once, with the OS dialog) and register. Returns 'registered' | 'denied' | 'off' | 'unsupported'.
export async function enablePushForSignedInUser({ ask = true } = {}) {
  if (!pushSupported()) return 'unsupported';
  if (!pushPreference()) return 'off';
  const PN = await plugin();
  let perm = await PN.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    if (!ask) return 'denied';
    perm = await PN.requestPermissions();
  }
  if (perm.receive !== 'granted') return 'denied';
  await PN.register();   // the 'registration' listener stores the token for the current user
  return 'registered';
}

// Sign-out / account switch / user turned push off: this device stops receiving this account's pushes.
export async function disablePushForThisDevice() {
  const token = read(TOKEN_KEY);
  if (token) {
    await supabase.rpc('unregister_push_device', { p_token: token });   // errors are returned, not thrown
    write(TOKEN_KEY, null);
  }
}

export async function setPushPreference(on) {
  write(PREF_KEY, on ? 'on' : 'off');
  if (on) return enablePushForSignedInUser();
  await disablePushForThisDevice();
  return 'off';
}
