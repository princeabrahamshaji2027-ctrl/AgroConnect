import { createClient } from '@supabase/supabase-js';

// Build-time override for staging/E2E (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY); defaults to production.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mgreapakfchcxcrauheq.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ncmVhcGFrZmNoY3hjcmF1aGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzOTMyNDYsImV4cCI6MjEwMDk2OTI0Nn0.Gv5LwnoTtRdylsbXExKEC-epiGKvunQrAKdfysf2C1k';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
