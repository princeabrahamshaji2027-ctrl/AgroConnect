import { test, expect } from '@playwright/test';

const staging = process.env.E2E_STAGING === '1' && process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD;

function jwtRoles(text) {
  return [...text.matchAll(/eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)].map((m) => {
    try { return JSON.parse(Buffer.from(m[1], 'base64url').toString()).role; } catch { return null; }
  });
}

test('login page renders empty, does not sign in by itself, and ships no service key', async ({ page }) => {
  const authCalls = [];
  page.on('request', (r) => { if (r.url().includes('/auth/v1/token')) authCalls.push(r.url()); });
  const scripts = [];
  page.on('response', async (r) => { if (r.url().endsWith('.js')) scripts.push(await r.text()); });
  await page.goto('/');
  await expect(page.getByText('Sign In to Dashboard')).toBeVisible();
  await expect(page.getByPlaceholder('admin@agroconnect.com')).toHaveValue('');
  await expect(page.locator('input[type=password]')).toHaveValue('');
  await page.waitForTimeout(1500);
  expect(authCalls).toEqual([]);
  await expect(page.getByText('Total Users')).toHaveCount(0); // dashboard not rendered
  expect(scripts.length).toBeGreaterThan(0);
  for (const s of scripts) {
    expect(jwtRoles(s)).not.toContain('service_role');
    expect(s).not.toMatch(/prince@agroconnect\.com/);
  }
});

test('wrong credentials show an error and stay on the login page', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('admin@agroconnect.com').fill('nobody@example.invalid');
  await page.locator('input[type=password]').fill('not-a-real-password');
  await page.getByText('Sign In to Dashboard').click();
  await expect(page.getByText(/invalid login credentials/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Total Users')).toHaveCount(0);
});

test('unknown nested path still serves the app (no 404 on refresh)', async ({ page }) => {
  const res = await page.goto('/users/123');
  // vite preview falls back to index.html; on Render a rewrite rule /* -> /index.html is needed (see PROJECT_AUDIT.md)
  expect(res.status()).toBe(200);
  await expect(page.getByText('Sign In to Dashboard')).toBeVisible();
});

test.describe('authenticated (staging)', () => {
  test.skip(!staging, 'set E2E_STAGING=1, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD and build against staging');

  test('admin logs in, dashboard + Users + Experts load, refresh keeps the session', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    await page.goto('/');
    await page.getByPlaceholder('admin@agroconnect.com').fill(process.env.E2E_ADMIN_EMAIL);
    await page.locator('input[type=password]').fill(process.env.E2E_ADMIN_PASSWORD);
    await page.getByText('Sign In to Dashboard').click();
    await expect(page.getByText('Total Users')).toBeVisible({ timeout: 20_000 });
    await page.getByText('Users', { exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    await page.getByText('Experts', { exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Experts Management' })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Total Users')).toBeVisible({ timeout: 20_000 });
    expect(consoleErrors.filter((e) => !/favicon/.test(e))).toEqual([]);
  });

  test('a non-admin account is refused', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('admin@agroconnect.com').fill('user1@agroconnect.local');
    await page.locator('input[type=password]').fill(process.env.FIXTURE_PASSWORD);
    await page.getByText('Sign In to Dashboard').click();
    await expect(page.getByText(/do not have administrator privileges/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Total Users')).toHaveCount(0);
  });
});
