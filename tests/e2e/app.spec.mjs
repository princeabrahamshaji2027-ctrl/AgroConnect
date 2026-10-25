import { test, expect } from '@playwright/test';

const fx = (name) => (process.env.FIXTURE_EMAIL_TOKEN
  ? `agroconnect-stg-${name}-${process.env.FIXTURE_EMAIL_TOKEN}@${process.env.FIXTURE_EMAIL_DOMAIN}`
  : `${name}@agroconnect.local`);

const staging = process.env.E2E_STAGING === '1' && process.env.FIXTURE_PASSWORD;

async function toLogin(page) {
  await page.goto('/');
  await expect(page.getByText('Welcome Back')).toBeVisible({ timeout: 20_000 }); // after the splash animation
}

async function login(page, email) {
  await toLogin(page);
  await page.getByPlaceholder('Enter your email or username').fill(email);
  await page.getByPlaceholder('Enter your password').fill(process.env.FIXTURE_PASSWORD);
  await page.getByRole('button', { name: 'Log In' }).click();
}

const nav = (page, label) => page.locator(`.bottom-nav-item:has-text("${label}"), .bottom-nav-item[aria-label="${label}"]`).first();

test('splash leads to an empty login form; register validates', async ({ page }) => {
  await toLogin(page);
  await expect(page.getByPlaceholder('Enter your email or username')).toHaveValue('');
  await page.locator('.auth-link', { hasText: 'Sign Up' }).click();
  await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
  await page.evaluate(() => document.querySelectorAll('form [required]').forEach((e) => e.removeAttribute('required')));
  await page.locator('form button[type=submit]').click();
  await expect(page.getByText('Full Name is required.')).toBeVisible();
});

test('wrong credentials show an error', async ({ page }) => {
  await toLogin(page);
  await page.getByPlaceholder('Enter your email or username').fill('nobody@example.invalid');
  await page.getByPlaceholder('Enter your password').fill('not-a-real-password');
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page.getByText(/invalid login credentials/i)).toBeVisible({ timeout: 15_000 });
});

test.describe('authenticated (staging)', () => {
  test.skip(!staging, 'set E2E_STAGING=1 and FIXTURE_PASSWORD and build the app against staging');

  test('normal user: feed, profile, Catch Up lists expert1, no expert tools, session survives reload', async ({ page }) => {
    await login(page, fx('user1'));
    await expect(nav(page, 'Feed')).toBeVisible({ timeout: 20_000 });
    await nav(page, 'Profile').click();
    await expect(page.getByText('Test User 1 (Farmer)')).toBeVisible();
    await nav(page, 'Catch Up').click();
    await expect(page.getByText('Available Verified Experts')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Dr. Ramesh Expert')).toBeVisible();
    await expect(page.getByText('Manage Availability')).toHaveCount(0);
    await page.reload();
    await expect(nav(page, 'Feed')).toBeVisible({ timeout: 20_000 });
  });

  test('expert1: Catch Up opens in expert mode with availability tools', async ({ page }) => {
    await login(page, fx('expert1'));
    await nav(page, 'Catch Up').click();
    await expect(page.getByText('Expert Catch Up — Scheduled Meetings')).toBeVisible({ timeout: 20_000 });
    await page.getByText('Manage Availability').first().click();
    await expect(page.getByRole('heading', { name: 'Manage Availability' })).toBeVisible();
  });

  test('admin accounts are sent to the admin website', async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_EMAIL, 'needs E2E_ADMIN_EMAIL');
    await toLogin(page);
    await page.getByPlaceholder('Enter your email or username').fill(process.env.E2E_ADMIN_EMAIL);
    await page.getByPlaceholder('Enter your password').fill(process.env.E2E_ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page.getByText(/must log in via the Admin Panel/i)).toBeVisible({ timeout: 20_000 });
  });
});
