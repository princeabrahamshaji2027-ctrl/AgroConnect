import { createClient } from '@supabase/supabase-js';

// Build-time override for staging/E2E (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY); defaults to production.
// The default is the project's PUBLISHABLE key (sb_publishable_…): public by design and independent of the legacy
// JWT keys, so turning the legacy anon key off in Supabase no longer breaks sign-in ("Invalid API key").
const PROD_URL = 'https://mgreapakfchcxcrauheq.supabase.co';
const PROD_PUBLISHABLE_KEY = 'sb_publishable_JbBPE8eek75KWPjpViDa_A_K4hCuTyZ';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || PROD_URL;
// Production always uses the publishable key, even when the host (Render) still injects the legacy JWT anon key as
// VITE_SUPABASE_ANON_KEY: production logs showed that legacy key being refused ("Invalid API key") whenever legacy
// keys were switched off in Supabase. Other projects (staging/E2E) keep the key they are given.
const configuredKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseAnonKey = supabaseUrl === PROD_URL && (!configuredKey || configuredKey.startsWith('eyJ'))
  ? PROD_PUBLISHABLE_KEY
  : configuredKey;

// Refuse a privileged key in the browser (never print it).
const jwtRole = (k) => { try { return JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; } catch { return null; } };
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(supabaseUrl) || !supabaseAnonKey
    || supabaseAnonKey.startsWith('sb_secret_') || jwtRole(supabaseAnonKey) === 'service_role') {
  throw new Error('Supabase is not configured correctly for the admin website (URL or public key).');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// A password-reset link opens this site with a recovery session; supabase-js announces PASSWORD_RECOVERY while it
// starts (before React mounts), so remember it here until App shows the "set a new password" screen.
export const RECOVERY_FLAG = 'agro_admin_password_recovery';
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    try { sessionStorage.setItem(RECOVERY_FLAG, '1'); } catch { /* storage blocked: request a new link */ }
  }
});
