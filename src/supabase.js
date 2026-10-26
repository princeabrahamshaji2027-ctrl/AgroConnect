import { createClient } from '@supabase/supabase-js';

// Build-time override for staging/E2E (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY); defaults to production and its
// public PUBLISHABLE key (sb_publishable_…), which keeps working if the legacy JWT anon key is turned off.
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mgreapakfchcxcrauheq.supabase.co';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_JbBPE8eek75KWPjpViDa_A_K4hCuTyZ';

// PKCE: Google sign-in returns a one-time code (to the web origin, or to the Android app's deep link) that is
// exchanged for a session, instead of putting tokens in the URL. Email/password sign-in is unaffected.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { flowType: 'pkce' } });

// Web: a password-reset link comes back to this site with ?code=…; supabase-js exchanges it while starting and
// announces PASSWORD_RECOVERY (only for a reset this browser requested). Remember it until App shows the screen.
export const RECOVERY_FLAG = 'agro_password_recovery';
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    try { sessionStorage.setItem(RECOVERY_FLAG, '1'); } catch { /* storage blocked: the user can request a new link */ }
  }
});
