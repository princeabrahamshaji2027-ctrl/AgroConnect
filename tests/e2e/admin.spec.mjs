import { test, expect } from '@playwright/test';

const fx = (name) => (process.env.FIXTURE_EMAIL_TOKEN
  ? `agroconnect-stg-${name}-${process.env.FIXTURE_EMAIL_TOKEN}@${process.env.FIXTURE_EMAIL_DOMAIN}`
  : `${name}@agroconnect.local`);

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
    await page.getByPlaceholder('admin@agroconnect.com').fill(fx('user1'));
    await page.locator('input[type=password]').fill(process.env.FIXTURE_PASSWORD);
    await page.getByText('Sign In to Dashboard').click();
    await expect(page.getByText(/do not have administrator privileges/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Total Users')).toHaveCount(0);
  });
});

test.describe('change list 2026-10-25 (staging)', () => {
  test.skip(!staging, 'set E2E_STAGING=1, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD and build against staging');

  const signIn = async (page) => {
    await page.goto('/');
    await page.getByPlaceholder('admin@agroconnect.com').fill(process.env.E2E_ADMIN_EMAIL);
    await page.locator('input[type=password]').fill(process.env.E2E_ADMIN_PASSWORD);
    await page.getByText('Sign In to Dashboard').click();
    await expect(page.getByText('Total Users')).toBeVisible({ timeout: 20_000 });
  };

  test('menu: ☰ only while hidden; Appointments and Reviews are gone (part of Consultations)', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('button', { name: 'Show menu' })).toHaveCount(0);
    await expect(page.getByText('Appointments', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Reviews', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Hide menu' }).click();
    await expect(page.getByRole('button', { name: 'Show menu' })).toBeVisible();
    await page.getByRole('button', { name: 'Show menu' }).click();
    await expect(page.getByRole('button', { name: 'Hide menu' })).toBeVisible();
  });

  test('consultations: summary cards, server-side filters, pagination info, detail with accounting and review', async ({ page }) => {
    await signIn(page);
    await page.getByText('Bookings & Payments', { exact: true }).first().click();
    const summary = page.getByTestId('consultation-summary');
    await expect(summary).toBeVisible({ timeout: 15_000 });
    for (const label of ['Total consultations', 'Awaiting meeting link', 'Platform commission (2%) recorded', 'Expert share recorded']) {
      await expect(summary.getByText(label)).toBeVisible();
    }
    await expect(page.getByText(/no money has been received, collected or paid out/)).toBeVisible();   // honest internal label
    await page.getByLabel('Booking status').selectOption('Completed');
    await page.getByLabel('Review').selectOption('reviewed');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    const rows = page.locator('tbody tr[title="Open details"]');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    for (const t of await rows.locator('td:nth-child(5)').allTextContents()) expect(t.trim()).toBe('Completed');
    await expect(page.getByTestId('pagination-info')).toContainText(/\d+ consultations? · page 1 of \d+/);
    await rows.first().click();
    const dialog = page.getByRole('dialog', { name: 'Consultation details' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Booking accounting (snapshot, read-only)')).toBeVisible();
    await expect(dialog.getByText("Farmer's review")).toBeVisible();
    await expect(dialog.locator('input')).toHaveCount(0);   // accounting is not editable
  });

  test('a booking at ₹1,000 shows ₹20 commission and ₹980 share, also after the expert raises the fee to ₹1,200', async ({ page }) => {
    const { createClient } = await import('@supabase/supabase-js');
    const mk = () => createClient(process.env.STAGING_SUPABASE_URL, process.env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { demoBook } = await import('./demo-booking.mjs');
    const expert = mk(); const farmer = mk();
    const e = await expert.auth.signInWithPassword({ email: fx('expert1'), password: process.env.FIXTURE_PASSWORD });
    await farmer.auth.signInWithPassword({ email: fx('user1'), password: process.env.FIXTURE_PASSWORD });
    const expertId = (await expert.from('experts').select('id, consultation_fee_paise').eq('user_id', e.data.user.id).single()).data;
    const before = expertId.consultation_fee_paise;
    // a slot far in the future so it is first in the admin list (newest slot date first)
    let slot;
    for (let k = 0; k < 30 && !slot; k++) {
      const d = new Date(Date.now() + (400 + k) * 86400000).toISOString().slice(0, 10);
      const r = await expert.from('consultation_slots').insert({ expert_id: expertId.id, slot_date: d, start_time: '06:07', end_time: '06:37' }).select('id').single();
      if (!r.error) slot = r.data.id;
    }
    let booking;
    try {
      expect((await expert.rpc('set_consultation_fee', { p_fee_paise: 100000 })).error).toBeNull();
      const b = await demoBook(farmer, slot, 'E2E admin accounting check');
      expect(b.error).toBeNull(); booking = b.data;
      expect((await expert.rpc('set_consultation_fee', { p_fee_paise: 120000 })).error).toBeNull();
      await signIn(page);
      await page.getByText('Bookings & Payments', { exact: true }).first().click();
      const row = page.locator('tbody tr', { hasText: booking.slice(0, 8) });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row).toContainText('₹1,000.00');
      await expect(row).toContainText('₹20.00');
      await expect(row).toContainText('₹980.00');
      await row.click();
      const dialog = page.getByRole('dialog', { name: 'Consultation details' });
      await expect(dialog.getByText('2.00%')).toBeVisible();
      await expect(dialog.getByText(/simulated — no money received or paid out/)).toBeVisible();
      await expect(dialog).not.toContainText('₹1,200.00');
    } finally {
      if (booking) await farmer.rpc('cancel_consultation_booking', { p_booking_id: booking, p_reason: 'E2E cleanup', p_offered_slots: [] });
      await expert.rpc('set_consultation_fee', { p_fee_paise: before });
    }
  });

  test('districts: dashboard overview, users and posts filter by district', async ({ page }) => {
    await signIn(page);
    const overview = page.getByTestId('district-stats');
    await expect(overview).toBeVisible({ timeout: 15_000 });
    for (const d of ['Kannur', 'Pathanamthitta', 'Idukki', 'Kottayam', 'Not set']) await expect(overview.getByText(d, { exact: true })).toBeVisible();
    await page.getByText('Users', { exact: true }).first().click();
    await expect(page.getByRole('columnheader', { name: 'District' })).toBeVisible();
    await page.getByLabel('District').selectOption('Kannur');
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    for (const t of await rows.locator('td:nth-child(4)').allTextContents()) expect(t.trim()).toBe('Kannur');
    await page.getByText('Posts', { exact: true }).first().click();
    await expect(page.getByLabel('District')).toBeVisible();
  });

  test('dashboard: Pending Reports is red only when something is pending; messaging shows counts only', async ({ page }) => {
    await signIn(page);
    const status = page.getByTestId('reports-status');
    await expect(status).toBeVisible();
    const count = Number((await page.locator('div', { has: page.getByText('Pending Reports', { exact: true }) }).locator('.font-headline-xl').first().textContent()).trim());
    if (count > 0) await expect(status).toHaveText(/Requires Moderation/);
    else {
      await expect(status).toHaveText(/No pending reports/);
      await expect(status).not.toHaveClass(/e74c3c/);
    }
    await expect(page.getByTestId('messaging-stats')).toContainText('Conversations');
  });

  test('consultations: cancellation filter and refund cards; admin cancel needs a written reason (form only, nothing cancelled)', async ({ page }) => {
    await signIn(page);
    await page.getByText('Bookings & Payments', { exact: true }).first().click();
    const summary = page.getByTestId('consultation-summary');
    for (const label of ['Refunds recorded (simulated)', 'Net platform commission', 'Net expert share']) {
      await expect(summary.getByText(label)).toBeVisible({ timeout: 15_000 });
    }
    await page.getByLabel('Cancellation').selectOption('farmer_late');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    const rows = page.locator('tbody tr[title="Open details"]');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    await rows.first().click();
    const dialog = page.getByRole('dialog', { name: 'Consultation details' });
    await expect(dialog.getByTestId('cancellation-detail')).toContainText('less than 14 h');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Reset' }).click();
    await page.getByLabel('Booking status').selectOption('Booked');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    const booked = page.locator('tbody tr[title="Open details"]');
    if (await booked.count() === 0) return;
    await booked.first().click();
    await dialog.getByRole('button', { name: 'Cancel consultation' }).click();
    await dialog.getByRole('button', { name: 'Cancel with full refund' }).click();
    await expect(dialog.getByText('Please enter a cancellation reason.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Keep booking' }).click();
    await expect(dialog.getByRole('button', { name: 'Cancel consultation' })).toBeVisible();
  });

  test('experts: verified experts have a Remove expert action; reports has the expert leave requests tab', async ({ page }) => {
    await signIn(page);
    await page.getByText('Experts', { exact: true }).first().click();
    await page.getByText(/^Verified Experts/).click();
    await expect(page.getByRole('button', { name: 'Remove expert' }).first()).toBeVisible({ timeout: 15_000 });
    await page.getByText('Reports', { exact: true }).first().click();
    await page.getByRole('tab', { name: /Expert leave requests/ }).click();
    await expect(page.getByText('Reason for leaving')).toBeVisible();
  });
});
