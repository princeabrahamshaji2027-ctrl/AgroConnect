// Read-only RLS probe: what can an unauthenticated visitor read with the public anon key?
// It performs only SELECTs with `limit=1` and prints column names / row counts, never row values.
// Run with: npm run test:rls
// Exit code 1 means at least one table exposes data that should require sign-in.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/supabase.js', import.meta.url), 'utf8');
const url = src.match(/supabaseUrl = .*?'(https:[^']+)'/)[1];
const key = src.match(/supabaseAnonKey = .*?'(eyJ[^']+)'/)[1];

// Tables that must return nothing to an anonymous caller, with the reason.
const MUST_BE_PRIVATE = {
  profiles: 'contains phone numbers and ban reasons',
  farmer_profiles: 'contains farm location details',
  followers: 'social graph of private users',
  consultation_bookings: 'private consultation records',
  messages: 'private chat messages',
  conversations: 'private chat metadata',
  notifications: 'per-user notifications',
  expert_applications: 'CV paths and qualifications',
  admin_audit_log: 'admin activity',
  reports: 'moderation reports',
  orders: 'purchase records',
};

let failures = 0;
for (const [table, why] of Object.entries(MUST_BE_PRIVATE)) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
  });
  const range = res.headers.get('content-range') || '';
  const total = Number(range.split('/')[1] || 0);
  const body = await res.json().catch(() => null);
  const cols = Array.isArray(body) && body[0] ? Object.keys(body[0]).sort().join(',') : '';
  const exposed = res.ok && total > 0;
  if (exposed) failures++;
  console.log(`${exposed ? 'FAIL' : 'PASS'}  ${table.padEnd(22)} anon rows=${total}${exposed ? `  (${why}; columns: ${cols})` : ''}`);
}

console.log(`\n${failures} table(s) readable by anonymous visitors.`);
process.exit(failures ? 1 : 0);
