import { createClient } from '@supabase/supabase-js';

// Build-time override for staging/E2E (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY); defaults to production.
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mgreapakfchcxcrauheq.supabase.co';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ncmVhcGFrZmNoY3hjcmF1aGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzOTMyNDYsImV4cCI6MjEwMDk2OTI0Nn0.Gv5LwnoTtRdylsbXExKEC-epiGKvunQrAKdfysf2C1k';

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
