import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://mgreapakfchcxcrauheq.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ncmVhcGFrZmNoY3hjcmF1aGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzOTMyNDYsImV4cCI6MjEwMDk2OTI0Nn0.Gv5LwnoTtRdylsbXExKEC-epiGKvunQrAKdfysf2C1k';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️ WARNING: SUPABASE_SERVICE_ROLE_KEY is not set in .env.');
  console.warn('   Will attempt operations using available API key / fallback.');
}

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
