import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Seed scripts write with the service-role key, so the target must be explicit: there is no default project and no
// anon-key fallback. These bulk/test seeders never run against production (no override); the launch community is
// created only by scripts/production/seed-community.mjs, which has its own approval steps.
export const PRODUCTION_REF = 'mgreapakfchcxcrauheq';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the project you mean to seed (no default project).');
}
export const isProduction = supabaseUrl.includes(PRODUCTION_REF);
if (isProduction) {
  throw new Error('Refusing to write to PRODUCTION. These seed scripts are for staging/local projects only.');
}

// For scripts that must never touch production, whatever the flags say (cleanup, test fixtures).
export function assertNotProduction(scriptName) {
  if (isProduction) throw new Error(`${scriptName} must never run against production.`);
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
