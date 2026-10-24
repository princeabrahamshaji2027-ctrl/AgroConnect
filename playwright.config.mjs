// Browser E2E for the admin website and the user app's web build. Run with: npm run test:e2e
// Uses the locally installed Google Chrome (no browser download).
// - Without credentials only the unauthenticated tests run (against local `vite preview` builds).
// - With E2E_STAGING=1 plus credentials, build both apps against staging first:
//     VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run build (and in admin-dashboard/)
//   or point E2E_ADMIN_URL / E2E_APP_URL at deployed staging sites.
import { defineConfig } from '@playwright/test';

const adminURL = process.env.E2E_ADMIN_URL || 'http://localhost:4173';
const appURL = process.env.E2E_APP_URL || 'http://localhost:4174';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.mjs/,
  timeout: 60_000,
  reporter: [['list']],
  outputDir: 'test-results/e2e',
  use: { channel: 'chrome', headless: true, screenshot: 'only-on-failure' },
  projects: [
    { name: 'admin', testMatch: /admin\.spec\.mjs/, use: { baseURL: adminURL, viewport: { width: 1280, height: 800 } } },
    { name: 'app', testMatch: /app\.spec\.mjs/, use: { baseURL: appURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    !process.env.E2E_ADMIN_URL && { command: 'npx vite preview --port 4173 --strictPort', cwd: 'admin-dashboard', url: adminURL, reuseExistingServer: true },
    !process.env.E2E_APP_URL && { command: 'npx vite preview --port 4174 --strictPort', url: appURL, reuseExistingServer: true },
  ].filter(Boolean),
});
