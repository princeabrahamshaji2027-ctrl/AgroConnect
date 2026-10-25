import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

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

// Owner change list 2026-10-25 (changes.pdf) + Google sign-in.
test.describe('change list 2026-10-25 (staging)', () => {
  test.skip(!staging, 'set E2E_STAGING=1 and FIXTURE_PASSWORD and build the app against staging');

  test('Google button is on Log In and Sign Up; with the provider off it explains instead of failing', async ({ page }) => {
    await toLogin(page);
    await page.getByRole('button', { name: /Continue with Google/ }).click();
    await expect(page.getByText(/Google sign-in is not available yet/)).toBeVisible({ timeout: 15_000 });
    await page.getByText('Sign Up', { exact: true }).click();
    await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible();
  });

  test('bottom bar shows icons only; profile options live in the ☰ menu', async ({ page }) => {
    await login(page, fx('user1'));
    await expect(nav(page, 'Feed')).toBeVisible({ timeout: 20_000 });
    for (const label of ['Feed', 'Search', 'Catch Up', 'Chat', 'Profile']) {
      await expect(page.locator('.bottom-nav')).not.toContainText(label);
    }
    await nav(page, 'Profile').click();
    await expect(page.getByText('Test User 1 (Farmer)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit Profile' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log Out' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Profile menu' }).click();
    for (const item of ['Settings', 'Become a Verified Expert', 'Become a Seller', 'Log Out']) {
      await expect(page.getByRole('button', { name: new RegExp(item) })).toBeVisible();
    }
    await expect(page.getByText('Leave being an expert')).toHaveCount(0);
  });

  test('Catch Up: experts show their dates; calendar opens on Book; a date shows its times; date is not typed', async ({ page }) => {
    await login(page, fx('user1'));
    await nav(page, 'Catch Up').click();
    const card = page.locator('.card', { hasText: 'Dr. Ramesh Expert' });
    await expect(card.getByText('Available:')).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText('Select a Date')).toHaveCount(0);
    await card.getByRole('button', { name: 'Book Consultation' }).click();
    await expect(card.getByText('Select a Date')).toBeVisible();
    await card.locator('div[style*="var(--primary-green)"][style*="cursor: pointer"]').first().click();
    await expect(page.getByText('Choose a time *')).toBeVisible();
    await expect(page.getByText(/^Date: /)).toBeVisible();
    await expect(page.locator('input[type=date], input[type=time]')).toHaveCount(0);
  });

  test('tapping an expert opens their profile', async ({ page }) => {
    await login(page, fx('user1'));
    await nav(page, 'Catch Up').click();
    await page.getByRole('img', { name: 'Dr. Ramesh Expert' }).first().click();
    await expect(page.getByText("Dr. Ramesh Expert's Posts")).toBeVisible({ timeout: 15_000 });
  });

  test('expert: ☰ menu has "Leave being an expert"; the request needs a reason and waits for the admin', async ({ page }) => {
    await login(page, fx('expert1'));
    await expect(nav(page, 'Profile')).toBeVisible({ timeout: 20_000 });
    await nav(page, 'Profile').click();
    await page.getByRole('button', { name: 'Profile menu' }).click();
    await page.getByRole('button', { name: /Leave being an expert/ }).click();
    await expect(page.getByText('Why are you leaving? *')).toBeVisible();
    // The full submit -> admin decision loop runs in staging-workflows.test.mjs (it must not demote expert1 here).
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
});

test.describe('own profile from a post (staging)', () => {
  test.skip(!staging || !process.env.STAGING_SUPABASE_URL, 'needs staging env');
  let api; let postId;
  test.beforeAll(async () => {
    api = createClient(process.env.STAGING_SUPABASE_URL, process.env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await api.auth.signInWithPassword({ email: fx('user1'), password: process.env.FIXTURE_PASSWORD });
    if (error) throw error;
    const ins = await api.from('posts').insert({ user_id: data.user.id, caption: 'E2E own-avatar check (removed after the test)' }).select('id').single();
    if (ins.error) throw ins.error;
    postId = ins.data.id;
  });
  test.afterAll(async () => { if (postId) await api.from('posts').delete().eq('id', postId); });

  test('tapping my own avatar on my post opens my profile, not a "Connect with yourself" page', async ({ page }) => {
    await login(page, fx('user1'));
    const post = page.locator('.card', { hasText: 'E2E own-avatar check' }).first();
    await expect(post).toBeVisible({ timeout: 20_000 });
    await post.getByText('Test User 1 (Farmer)').first().click();
    await expect(page.getByRole('button', { name: 'Edit Profile' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /^Connect/ })).toHaveCount(0);
    await expect(page.getByText('My Posts')).toBeVisible();
  });
});

// Post media (2026-10-25 bug): what a user sees after posting through the real form.
test.describe('post media (staging)', () => {
  test.skip(!staging || !process.env.STAGING_SUPABASE_URL, 'needs staging env');
  const tag = `E2E media ${Date.now()}`;
  let api;
  test.beforeAll(async () => {
    api = createClient(process.env.STAGING_SUPABASE_URL, process.env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { error } = await api.auth.signInWithPassword({ email: fx('user1'), password: process.env.FIXTURE_PASSWORD });
    if (error) throw error;
  });
  test.afterAll(async () => {
    const { data } = await api.from('posts').select('id, image_path, media_type').like('caption', `${tag}%`);
    for (const p of data || []) {
      await api.from('posts').delete().eq('id', p.id);
      const m = p.image_path?.match(/\/object\/public\/(post-images|post-videos)\/(.+)$/);
      if (m) await api.storage.from(m[1]).remove([m[2]]);
    }
  });

  const publish = async (page, { kind, file, title }) => {
    await page.getByRole('button', { name: 'Floating action button' }).or(page.locator('.fab')).first().click();
    if (kind === 'video') await page.getByRole('button', { name: /videocam\s*video/i }).click();
    if (file) await page.locator(`input[type=file][accept="${kind}/*"]`).setInputFiles(file);
    await page.getByPlaceholder('e.g. Pest damage on Rice crop leaves').fill(`${tag} ${title}`);
    await page.locator('textarea').first().fill('Synthetic caption for the post media test');
    await page.getByRole('button', { name: 'Publish Post' }).click();
  };

  test('image, video and text-only posts render in the feed card; a non-video file is refused', async ({ page }) => {
    await login(page, fx('user1'));
    await expect(nav(page, 'Feed')).toBeVisible({ timeout: 20_000 });

    await publish(page, { kind: 'image', file: 'tests/fixtures/media/sample.png', title: 'image' });
    const imgCard = page.locator('.card', { hasText: `${tag} image` }).first();
    await expect(imgCard).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => imgCard.locator('img.post-card-image').evaluate((e) => e.complete && e.naturalWidth > 0), { timeout: 15_000 }).toBe(true);

    await publish(page, { kind: 'video', file: 'tests/fixtures/media/sample.webm', title: 'video' });
    const vidCard = page.locator('.card', { hasText: `${tag} video` }).first();
    await expect(vidCard).toBeVisible({ timeout: 20_000 });
    const video = vidCard.locator('video.post-card-video');
    await expect(video).toHaveAttribute('controls', '');
    await expect.poll(() => video.evaluate((v) => v.readyState >= 1 && v.duration > 0), { timeout: 15_000 }).toBe(true);
    await expect(vidCard.locator('img.post-card-image')).toHaveCount(0); // no broken picture next to the player

    await publish(page, { kind: 'image', title: 'text only' });
    const txtCard = page.locator('.card', { hasText: `${tag} text only` }).first();
    await expect(txtCard).toBeVisible({ timeout: 20_000 });
    await expect(txtCard.locator('img.post-card-image, video')).toHaveCount(0);

    // a photo picked as a video is refused before anything is uploaded
    await page.getByRole('button', { name: 'Floating action button' }).or(page.locator('.fab')).first().click();
    await page.getByRole('button', { name: /videocam\s*video/i }).click();
    await page.locator('input[type=file][accept="video/*"]').setInputFiles({ name: 'photo.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not really a video') });
    await expect(page.getByText(/does not look like a video/)).toBeVisible();

    // media survives a reload
    await page.reload();
    await expect(nav(page, 'Feed')).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => page.locator('.card', { hasText: `${tag} image` }).first().locator('img.post-card-image').evaluate((e) => e.complete && e.naturalWidth > 0), { timeout: 20_000 }).toBe(true);
    await expect(page.locator('.card', { hasText: `${tag} video` }).first().locator('video.post-card-video')).toBeVisible();
  });
});
