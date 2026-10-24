import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mgreapakfchcxcrauheq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ncmVhcGFrZmNoY3hjcmF1aGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzOTMyNDYsImV4cCI6MjEwMDk2OTI0Nn0.Gv5LwnoTtRdylsbXExKEC-epiGKvunQrAKdfysf2C1k';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function pingSupabase() {
  const timestamp = new Date().toISOString();
  try {
    const { data, error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
      console.error(`[${timestamp}] ❌ Supabase ping error:`, error.message);
    } else {
      console.log(`[${timestamp}] 🟢 Supabase keep-alive ping successful. Inactivity timer reset!`);
    }
  } catch (err) {
    console.error(`[${timestamp}] ❌ Ping failed:`, err.message);
  }
}

pingSupabase();
