// Account recovery (password reset) and change-password helpers. Uses Supabase Auth's own flows only:
// resetPasswordForEmail -> e-mailed link -> PKCE code exchanged on THIS device -> recovery session -> updateUser.
// Nothing here logs e-mail addresses, codes or passwords.
import { supabase } from '../supabase';
import { validateEmail } from './validation';

const isNative = () => !!window.Capacitor?.isNativePlatform?.();

// Where the reset e-mail sends the user back to. Android: the app's own deep link (also used by Google sign-in);
// web: this site. Both must be in Supabase → Authentication → URL Configuration → Redirect URLs.
export async function recoveryRedirectUrl() {
  if (isNative()) {
    const { App } = await import('@capacitor/app');
    const { id } = await App.getInfo();
    return `${id}://auth-callback`;
  }
  return window.location.origin;
}

// Same public answer whether or not the address has an account (no account enumeration). Real problems (offline,
// rate limit, misconfiguration) are still reported, without saying anything about the account.
export const GENERIC_RESET_REPLY = 'If an account exists for this email, password-reset instructions will be sent.';

export async function requestPasswordReset(email) {
  const v = validateEmail(email);
  if (!v.isValid) return { ok: false, error: v.error || 'Please enter a valid email address.' };
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: await recoveryRedirectUrl() });
    if (error) return { ok: false, error: friendlyAuthError(error) };
    return { ok: true, message: GENERIC_RESET_REPLY };
  } catch (err) {
    return { ok: false, error: friendlyAuthError(err) };
  }
}

// Supabase / network errors in words a farmer can act on. Never echoes codes or tokens.
export function friendlyAuthError(err) {
  const m = `${err?.message || err || ''}`;
  const status = err?.status;
  if (/code verifier not found|PKCE/i.test(m)) {
    return 'This link was opened on a different device or browser, or was already used. Please request a new link on this device.';
  }
  if (/access_denied|cancel/i.test(m)) return 'Sign-in was cancelled.';
  if (/expired|otp_expired|invalid flow state|flow state/i.test(m)) return 'This link has expired or was already used. Please request a new one.';
  if (/rate limit|too many|over_email_send_rate_limit/i.test(m) || status === 429) return 'Too many attempts. Please wait a few minutes and try again.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'No internet connection. Please check your connection and try again.';
  if (/same_password|should be different/i.test(m)) return 'Your new password must be different from your current password.';
  if (/weak|pwned|leaked|compromised/i.test(m)) return 'This password is too weak or has appeared in a data breach. Please choose another.';
  if (/Invalid login credentials/i.test(m)) return 'Your current password is incorrect.';
  if (/Auth session missing|not authenticated|JWT/i.test(m)) return 'Your reset session has ended. Please request a new reset link.';
  if (/redirect/i.test(m)) return 'Password reset is not configured for this app yet. Please contact support.';
  return 'Something went wrong. Please try again.';
}

// Which sign-in methods the signed-in account has. Google-only accounts have no password to verify.
export async function accountSignInMethods() {
  const { data: { user } } = await supabase.auth.getUser();
  const providers = new Set((user?.identities || []).map((i) => i.provider));
  return { user, hasPassword: providers.has('email'), hasGoogle: providers.has('google') };
}

// Change password for an email/password account: the current password is checked by Supabase Auth (a fresh
// password sign-in for the signed-in user's own e-mail, never a client-side comparison), then updateUser.
export async function changePassword(currentPassword, newPassword) {
  const { user, hasPassword } = await accountSignInMethods();
  if (!user) return { ok: false, error: 'Please sign in again.' };
  if (!hasPassword) return { ok: false, error: 'This account signs in with Google and has no password to change.' };
  if (!currentPassword) return { ok: false, error: 'Please enter your current password.' };
  const check = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (check.error) return { ok: false, error: friendlyAuthError(check.error) };
  if (check.data.user?.id !== user.id) {   // cannot happen with the same e-mail; never continue as someone else
    await supabase.auth.signOut();
    return { ok: false, error: 'Please sign in again.' };
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: friendlyAuthError(error) };
  return { ok: true };
}
