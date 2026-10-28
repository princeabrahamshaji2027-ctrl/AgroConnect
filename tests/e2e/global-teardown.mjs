// After the Playwright run: remove what the signed-in browser tests created between the staging test accounts.
// No-op without STAGING_SUPABASE_SERVICE_ROLE_KEY or without E2E_STAGING=1.
import { cleanupTestTraffic } from './cleanup.mjs';

export default async function globalTeardown() {
  if (process.env.E2E_STAGING !== '1') return;
  await cleanupTestTraffic(Number(process.env.E2E_RUN_START) || Date.now() - 60 * 60 * 1000);
}
