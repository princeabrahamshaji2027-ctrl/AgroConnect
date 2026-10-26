import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mgreapakfchcxcrauheq.supabase.co';
const supabaseAnonKey = 'sb_publishable_JbBPE8eek75KWPjpViDa_A_K4hCuTyZ';

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
