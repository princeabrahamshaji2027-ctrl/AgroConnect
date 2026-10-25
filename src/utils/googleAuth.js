// Google sign-in / sign-up (same flow: Supabase creates the account on first use, as a Farmer).
// Web: full-page redirect to Google and back to this origin; supabase-js finishes the PKCE exchange on load.
// Android: Google refuses sign-in inside an embedded WebView, so the system browser opens and Google returns to
// <applicationId>://auth-callback (intent filter in AndroidManifest.xml); App.jsx exchanges the code.
import { supabase, supabaseUrl, supabaseAnonKey } from '../supabase';

const isNative = () => !!window.Capacitor?.isNativePlatform?.();
export const AUTH_CALLBACK_HOST = 'auth-callback';

async function nativeRedirectUrl() {
  const { App } = await import('@capacitor/app');
  const { id } = await App.getInfo(); // com.agroconnect.app or com.agroconnect.app.staging
  return `${id}://${AUTH_CALLBACK_HOST}`;
}

// The Supabase project must have the Google provider switched on; otherwise the user would land on a raw JSON error.
async function googleEnabled() {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabaseAnonKey } });
    return (await res.json())?.external?.google === true;
  } catch {
    return true; // offline or blocked: let the normal flow report the problem
  }
}

export async function signInWithGoogle() {
  if (!(await googleEnabled())) {
    throw new Error('Google sign-in is not available yet. Please use email and password for now.');
  }
  if (!isNative()) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
    return;
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: await nativeRedirectUrl(), skipBrowserRedirect: true },
  });
  if (error) throw error;
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url: data.url });
}

// Android: called with the deep link Google/Supabase sent back. Returns true when a session was created.
export async function completeNativeGoogleSignIn(url) {
  if (!url || !url.includes(`://${AUTH_CALLBACK_HOST}`)) return false;
  const { Browser } = await import('@capacitor/browser');
  Browser.close().catch(() => {});
  const params = new URL(url.replace(/#/, '?')).searchParams;
  const err = params.get('error_description') || params.get('error');
  if (err) throw new Error(err);
  const code = params.get('code');
  if (!code) return false;
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return true;
}
