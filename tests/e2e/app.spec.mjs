import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { demoBook } from './demo-booking.mjs';

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
  // inline validation (2026-10-26): the reason under the field, the first invalid field focused, no popup
  await expect(page.getByText('Please enter your full name.')).toBeVisible();
  await expect(page.getByLabel(/Full name/i).first()).toBeFocused();
  await expect(page.getByLabel(/Full name/i).first()).toHaveAttribute('aria-invalid', 'true');
});

test('login: empty submit shows inline errors under the fields and no popup', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`unexpected popup: ${d.message()}`); });
  await toLogin(page);
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page.getByText('Please enter your email or username.')).toBeVisible();
  await expect(page.getByText('Please enter your password.')).toBeVisible();
  await expect(page.getByPlaceholder('Enter your email or username')).toBeFocused();
  await page.getByPlaceholder('Enter your email or username').fill('someone@example.com');
  await page.getByPlaceholder('Enter your email or username').blur();
  await expect(page.getByText('Please enter your email or username.')).toHaveCount(0);   // cleared as soon as it is fixed
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
    await expect(page.locator('.profile-name')).toHaveText('Test User 1 (Farmer)');
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

  test('Google button is on Log In and Sign Up; goes to Google for the staging project (or explains when the provider is off)', async ({ page }) => {
    await toLogin(page);
    // Google on staging was switched on by the owner on 2026-10-25; check whichever state the project is in
    const settings = await (await fetch(`${process.env.STAGING_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: process.env.STAGING_SUPABASE_ANON_KEY } })).json();
    if (settings.external?.google) {
      await Promise.all([
        page.waitForURL(/accounts\.google\.com/, { timeout: 20_000 }),
        page.getByRole('button', { name: /Continue with Google/ }).click(),
      ]);
      expect(page.url()).toContain('ahkgvuewgbjyahbiehrx'); // Google is asked on behalf of the staging project
      await page.goto('/');
      await expect(page.getByText('Welcome Back')).toBeVisible({ timeout: 20_000 });
    } else {
      await page.getByRole('button', { name: /Continue with Google/ }).click();
      await expect(page.getByText(/Google sign-in is not available yet/)).toBeVisible({ timeout: 15_000 });
    }
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
    await expect(page.locator('.profile-name')).toHaveText('Test User 1 (Farmer)');
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

// Catch Up meetings (2026-10-25): Join button follows the server's window; the room is honest about video.
test.describe('Catch Up meetings (staging)', () => {
  test.skip(!staging || !process.env.STAGING_SUPABASE_URL, 'needs staging env');
  const mk = () => createClient(process.env.STAGING_SUPABASE_URL, process.env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  let farmer; let expert; let expertId; const slots = []; const bookings = [];
  const ist = (min) => { const d = new Date(Math.ceil((Date.now() + min * 60000) / 60000) * 60000 + 330 * 60000); return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) }; };
  const plus30 = (t) => { const [h, m] = t.split(':').map(Number); const x = (h * 60 + m + 30) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  const bookIn = async (min, topic) => {
    let s;
    for (let m = min; m < min + 4; m++) {   // another test's slot may hold this minute (unique_expert_slot): take the next one
      const at = ist(m);
      s = await expert.from('consultation_slots').insert({ expert_id: expertId, slot_date: at.date, start_time: at.time, end_time: plus30(at.time), rate: 300 }).select('id').single();
      if (s.error?.code !== '23505') break;
    }
    if (s.error) throw s.error;
    slots.push(s.data.id);
    const r = await demoBook(farmer, s.data.id, topic);
    if (r.error) throw r.error;
    bookings.push(r.data);
    return r.data;
  };
  test.beforeAll(async () => {
    farmer = mk(); expert = mk();
    await farmer.auth.signInWithPassword({ email: fx('user1'), password: process.env.FIXTURE_PASSWORD });
    const e = await expert.auth.signInWithPassword({ email: fx('expert1'), password: process.env.FIXTURE_PASSWORD });
    expertId = (await expert.from('experts').select('id').eq('user_id', e.data.user.id).single()).data.id;
  });
  test.afterAll(async () => {
    for (const id of bookings) await farmer.rpc('cancel_consultation_booking', { p_booking_id: id, p_reason: 'E2E cleanup', p_offered_slots: [] });
    for (const id of slots) await expert.from('consultation_slots').delete().eq('id', id).eq('is_booked', false);
  });

  test('before the window: disabled "Join opens …"; no link: "Waiting for link"; link saved: Join opens Google Meet outside the app', async ({ page, context }) => {
    await bookIn(180, 'E2E far meeting');
    await bookIn(8, 'E2E countdown meeting');
    const soonId = await bookIn(3, 'E2E soon meeting');
    // Google Meet itself is never contacted by the test: the new tab gets a local stand-in page
    await context.route('https://meet.google.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Meet stand-in</title>' }));
    await login(page, fx('user1'));
    await nav(page, 'Catch Up').click();
    await page.getByRole('button', { name: /^Upcoming/ }).click();

    const far = page.locator('.card', { hasText: 'E2E far meeting' }).first();
    await expect(far.getByRole('button', { name: /Join opens .* \(in 2h \d+m\)/ })).toBeDisabled({ timeout: 20_000 });
    const cd = page.locator('.card', { hasText: 'E2E countdown meeting' }).first().getByRole('button', { name: /Join opens/ });
    await expect(cd).toBeDisabled();
    const before = await cd.textContent();
    await page.waitForTimeout(2200);
    expect(await cd.textContent()).not.toBe(before); // seconds keep counting down without a reload

    const soon = () => page.locator('.card', { hasText: 'E2E soon meeting' }).first();
    await expect(soon().getByText('Waiting for expert to add meeting link')).toBeVisible();
    await expect(soon().getByRole('button', { name: 'Waiting for link' })).toBeDisabled({ timeout: 20_000 });

    const set = await expert.rpc('set_meeting_link', { p_booking_id: soonId, p_link: 'https://meet.google.com/eee-soon-tst' });
    expect(set.error).toBeNull();
    await page.reload();
    await nav(page, 'Catch Up').click();
    await page.getByRole('button', { name: /^Upcoming/ }).click();
    await expect(soon().getByText('Google Meet link ready')).toBeVisible({ timeout: 20_000 });
    const popupPromise = page.waitForEvent('popup');
    await soon().getByRole('button', { name: 'Join Meeting' }).click();
    const popup = await popupPromise;
    await popup.waitForURL('https://meet.google.com/eee-soon-tst', { timeout: 15_000 });
    await expect(page.getByText(/Opening Google Meet/)).toBeVisible();
    await expect(page.getByText(/Video not connected|End consultation|Leave room/)).toHaveCount(0);   // no in-app call screen
    await popup.close();
  });

  test('the farmer sees the booking confirmation in Notifications', async ({ page }) => {
    await login(page, fx('user1'));
    await expect(nav(page, 'Feed')).toBeVisible({ timeout: 20_000 });
    await page.locator('.feed-header-icon').last().click();
    await expect(page.getByText(/Your consultation with Dr\. Ramesh Expert is booked for/).first()).toBeVisible({ timeout: 15_000 });
  });
});

// Account recovery (2026-10-25). Reset e-mails are only requested for unregistered addresses (no mail is sent).
test.describe('account recovery (staging)', () => {
  test.skip(!staging || !process.env.STAGING_SUPABASE_URL, 'needs staging env');
  const unique = (tag) => `agroconnect-stg-${tag}${Date.now()}-${process.env.FIXTURE_EMAIL_TOKEN}@${process.env.FIXTURE_EMAIL_DOMAIN}`;

  test('Forgot Password: invalid address, generic reply for an unregistered one, no double submit', async ({ page }) => {
    await toLogin(page);
    await page.getByRole('button', { name: 'Forgot Password?' }).click();
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    const email = page.getByLabel('Email address');
    await email.fill('not-an-email');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('alert')).toContainText(/valid email/i);

    let calls = 0;
    page.on('request', (r) => { if (r.url().includes('/auth/v1/recover')) calls += 1; });
    await email.fill(unique('noacct'));
    const send = page.getByRole('button', { name: 'Send reset link' });
    await send.click();
    await send.click({ timeout: 500 }).catch(() => {});   // second tap while sending is ignored
    await expect(page.getByText('If an account exists for this email, password-reset instructions will be sent.')).toBeVisible({ timeout: 15_000 });
    expect(calls).toBe(1);
    await page.getByRole('button', { name: 'Back to Log In' }).click();
    await expect(page.getByText('Welcome Back')).toBeVisible();
  });

  test('a fake or reused reset link never opens "Set a new password"', async ({ page }) => {
    await page.goto('/?code=00000000-0000-0000-0000-000000000000');
    await expect(page.getByText('Welcome Back')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Set a new password')).toHaveCount(0);
    expect(page.url()).not.toContain('code=');
  });

  test('Change Password checks the current password with Auth; correct one changes it (throwaway account)', async ({ page }) => {
    const api = createClient(process.env.STAGING_SUPABASE_URL, process.env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const adminApi = createClient(process.env.STAGING_SUPABASE_URL, process.env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    await adminApi.auth.signInWithPassword({ email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD });
    const email = unique('chpw');
    const p1 = `Aa1!${Math.random().toString(36).slice(2, 10)}Zz`;
    const p2 = `Bb2@${Math.random().toString(36).slice(2, 10)}Yy`;
    const su = await api.auth.signUp({ email, password: p1, options: { data: { full_name: 'Change Password Test' } } });
    if (su.error) throw su.error;
    try {
      await page.goto('/');
      await expect(page.getByText('Welcome Back')).toBeVisible({ timeout: 20_000 });
      await page.getByPlaceholder('Enter your email or username').fill(email);
      await page.getByPlaceholder('Enter your password').fill(p1);
      await page.getByRole('button', { name: 'Log In' }).click();
      await nav(page, 'Profile').click();
      await page.getByRole('button', { name: 'Profile menu' }).click();
      await page.getByRole('button', { name: /Settings/ }).click();
      await page.getByText(/Privacy/).first().click();
      await page.getByLabel('Current password').fill('Wrong1!password');
      await page.getByLabel('New password', { exact: true }).fill(p2);
      await page.getByLabel('Confirm new password').fill(p2);
      await page.getByRole('button', { name: 'Update Password' }).click();
      await expect(page.getByText('Your current password is incorrect.')).toBeVisible({ timeout: 15_000 });

      await page.getByLabel('Current password').fill(p1);
      await page.getByRole('button', { name: 'Update Password' }).click();
      await expect(page.getByText('Password updated successfully.')).toBeVisible({ timeout: 15_000 });
      const check = createClient(process.env.STAGING_SUPABASE_URL, process.env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      expect((await check.auth.signInWithPassword({ email, password: p1 })).error).toBeTruthy();
      expect((await check.auth.signInWithPassword({ email, password: p2 })).error).toBeNull();
    } finally {
      await adminApi.functions.invoke('admin-delete-user', { body: { user_id: su.data.user.id } });
    }
  });

  test('Google-only account sees no password form (identities mocked to Google only)', async ({ page }) => {
    await login(page, fx('user1'));
    await expect(nav(page, 'Feed')).toBeVisible({ timeout: 20_000 });
    // MOCKED: the Auth user response is rewritten to look like a Google-only account; nothing is saved
    await page.route('**/auth/v1/user', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      body.identities = [{ provider: 'google', id: 'mock', user_id: body.id, identity_data: {} }];
      await route.fulfill({ response: res, json: body });
    });
    await nav(page, 'Profile').click();
    await page.getByRole('button', { name: 'Profile menu' }).click();
    await page.getByRole('button', { name: /Settings/ }).click();
    await page.getByText(/Privacy/).first().click();
    await expect(page.getByText(/You sign in with Google, so your account has no AgroConnect password/)).toBeVisible();
    await expect(page.getByLabel('Current password')).toHaveCount(0);
  });
});

// Final Catch Up flow (2026-10-25): expert fee (migration 15), checkout with a SIMULATED payment (no provider; the UI
// shows no demo label by product decision) and Google Meet links. Real staging backend; the one MOCKED test only cuts
// the network for one request and says so. These tests change expert1's fee: serial, restored afterwards.
test.describe('expert fee, checkout + Google Meet links (staging)', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!staging || !process.env.STAGING_SUPABASE_URL, 'needs staging env');
  const mk = () => createClient(process.env.STAGING_SUPABASE_URL, process.env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  let farmer; let farmer2; let expert; let expertId; let originalFee; const slots = []; const bookings = [];
  const pad = (n) => String(n).padStart(2, '0');
  const t12 = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return `${pad(((h + 11) % 12) + 1)}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; };
  const inr = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(paise / 100);
  const setFee = async (paise) => expect((await expert.rpc('set_consultation_fee', { p_fee_paise: paise })).error).toBeNull();
  // A slot later today (browser + server both use Asia/Kolkata) on a minute nobody else uses. No price on the slot.
  const newSlotToday = async () => {
    for (let k = 0; k < 20; k++) {
      const d = new Date(Date.now() + (95 + k * 7) * 60000 + 330 * 60000);
      const date = d.toISOString().slice(0, 10); const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
      const [h, m] = time.split(':').map(Number); const e = (h * 60 + m + 30) % 1440; const end = `${pad(Math.floor(e / 60))}:${pad(e % 60)}`;
      const s = await expert.from('consultation_slots').insert({ expert_id: expertId, slot_date: date, start_time: time, end_time: end }).select('id, slot_date, start_time, end_time').single();
      if (!s.error) { slots.push(s.data.id); return { ...s.data, label: `${t12(time)} - ${t12(end)}` }; }
    }
    throw new Error('no free slot minute');
  };
  test.beforeAll(async () => {
    farmer = mk(); farmer2 = mk(); expert = mk();
    await farmer.auth.signInWithPassword({ email: fx('user1'), password: process.env.FIXTURE_PASSWORD });
    await farmer2.auth.signInWithPassword({ email: fx('user2'), password: process.env.FIXTURE_PASSWORD });
    const e = await expert.auth.signInWithPassword({ email: fx('expert1'), password: process.env.FIXTURE_PASSWORD });
    const row = (await expert.from('experts').select('id, consultation_fee_paise').eq('user_id', e.data.user.id).single()).data;
    expertId = row.id; originalFee = row.consultation_fee_paise;
  });
  test.afterAll(async () => {
    const mine = await farmer.from('consultation_bookings').select('id').eq('status', 'Booked').in('slot_id', slots);
    for (const { id } of mine.data || []) bookings.push(id);
    for (const id of bookings) for (const c of [farmer, farmer2]) await c.rpc('cancel_consultation_booking', { p_booking_id: id, p_reason: 'E2E cleanup', p_offered_slots: [] });
    for (const id of slots) await expert.from('consultation_slots').delete().eq('id', id).eq('is_booked', false);
    await expert.rpc('set_consultation_fee', { p_fee_paise: originalFee });
  });
  const openCheckout = async (page, slot, issue) => {
    await login(page, fx('user1'));
    await nav(page, 'Catch Up').click();
    const card = page.locator('.card', { hasText: 'Dr. Ramesh Expert' });
    await card.getByRole('button', { name: 'Book Consultation' }).click({ timeout: 20_000 });
    const day = String(Number(slot.slot_date.slice(8, 10)));
    await card.locator('div[style*="cursor: pointer"]').filter({ has: page.locator(`span:text-is("${day}")`) }).first().click();
    await page.getByText(slot.label, { exact: true }).click();
    await page.getByPlaceholder(/Explain the problem/).fill(issue);
    await page.getByRole('button', { name: 'Pay & Book' }).click();
    await expect(page.getByText('Confirm your consultation')).toBeVisible({ timeout: 15_000 });
  };

  test('one price everywhere: expert card = checkout; calendar, day cells and time buttons show no price; no demo wording', async ({ page }) => {
    await setFee(73550);   // ₹735.50 — an amount no slot or fallback ever had
    const slot = await newSlotToday();
    const hosts = new Set();
    page.on('request', (r) => hosts.add(new URL(r.url()).host));
    await login(page, fx('user1'));
    await nav(page, 'Catch Up').click();
    const card = page.locator('.card', { hasText: 'Dr. Ramesh Expert' });
    await expect(card.getByTestId('expert-fee')).toHaveText(`Consultation fee ${inr(73550)}`, { timeout: 20_000 });
    await expect(card.getByText(/From ₹|per session/)).toHaveCount(0);
    await card.getByRole('button', { name: 'Book Consultation' }).click();
    const calendar = card.getByText('Select a Date').locator('xpath=ancestor::div[2]');
    await expect(calendar).not.toContainText('₹');                                           // no prices in the calendar
    const day = String(Number(slot.slot_date.slice(8, 10)));
    await card.locator('div[style*="cursor: pointer"]').filter({ has: page.locator(`span:text-is("${day}")`) }).first().click();
    const dialog = page.locator('.dialog-content');
    await expect(dialog.getByText('Choose a time *')).toBeVisible();
    await expect(dialog).not.toContainText('₹');                                             // no prices on dates/times
    await dialog.getByText(slot.label, { exact: true }).click();
    await page.getByPlaceholder(/Explain the problem/).fill('E2E one price');
    await page.getByRole('button', { name: 'Pay & Book' }).click();
    await expect(page.getByTestId('checkout-amount')).toHaveText(`${inr(73550)} INR`, { timeout: 15_000 });
    await expect(page.getByText('₹', { exact: false }).filter({ hasNotText: inr(73550) }).filter({ visible: true })).toHaveCount(0);
    const payBtn = page.getByRole('button', { name: `Pay ${inr(73550)}` });
    await expect(payBtn).toBeVisible();
    await expect(page.locator('.demo-checkout input')).toHaveCount(0);   // no card / UPI / bank fields at all
    await expect(page.locator('body')).not.toContainText(/demo|no real money|simulated/i);
    await payBtn.click();
    await expect(page.getByText('Processing payment…')).toBeVisible();
    await expect(payBtn).toHaveCount(0);                                     // cannot be tapped twice
    await expect(page.getByText('Booking confirmed')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.demo-checkout').getByText(inr(73550), { exact: false })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/demo|no real money|simulated/i);
    await page.getByRole('button', { name: 'View my booking' }).click();
    const upcoming = page.locator('.card', { hasText: 'E2E one price' }).first();
    await expect(upcoming.getByTestId('agreed-fee')).toHaveText(`Consultation fee ${inr(73550)}`, { timeout: 20_000 });
    const pay = (await farmer.from('demo_payments').select('amount_paise, commission_paise, expert_share_paise, transaction_type').eq('slot_id', slot.id).eq('status', 'succeeded').single()).data;
    expect(pay).toEqual({ amount_paise: 73550, commission_paise: 1471, expert_share_paise: 72079, transaction_type: 'simulated' });
    // the expert raises the fee: the confirmed booking keeps its amount
    await setFee(90000);
    await page.reload();
    await nav(page, 'Catch Up').click();
    await page.getByRole('button', { name: /^Upcoming/ }).click();
    await expect(page.locator('.card', { hasText: 'E2E one price' }).first().getByTestId('agreed-fee')).toHaveText(`Consultation fee ${inr(73550)}`, { timeout: 20_000 });
    const supabaseHost = new URL(process.env.STAGING_SUPABASE_URL).host;
    const unexpected = [...hosts].filter((h) => !['localhost:4174', supabaseHost, 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(h));
    expect(unexpected).toEqual([]);                                          // no payment service contacted
  });

  test('cancel books nothing; fee changed while on checkout → new amount shown and must be confirmed again', async ({ page }) => {
    await setFee(50000);
    const slot = await newSlotToday();
    await openCheckout(page, slot, 'E2E stale quote');
    await expect(page.getByTestId('checkout-amount')).toHaveText(`${inr(50000)} INR`);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Payment cancelled. Nothing was booked.')).toBeVisible();
    expect((await farmer.from('consultation_bookings').select('id').eq('slot_id', slot.id)).data).toHaveLength(0);
    await page.getByRole('button', { name: 'Pay & Book' }).click();
    await expect(page.getByTestId('checkout-amount')).toHaveText(`${inr(50000)} INR`, { timeout: 15_000 });
    await setFee(65000);                                                     // the expert changes the fee meanwhile
    await page.getByRole('button', { name: `Pay ${inr(50000)}` }).click();
    await expect(page.getByRole('alert')).toContainText(`changed from ${inr(50000)} to ${inr(65000)}`, { timeout: 20_000 });
    await expect(page.getByTestId('checkout-amount')).toHaveText(`${inr(65000)} INR`);
    expect((await farmer.from('consultation_bookings').select('id').eq('slot_id', slot.id)).data).toHaveLength(0);   // nothing charged silently
    await page.getByRole('button', { name: `Pay ${inr(65000)}` }).click();
    await expect(page.getByText('Booking confirmed')).toBeVisible({ timeout: 20_000 });
    const pays = (await farmer.from('demo_payments').select('status, amount_paise, failure_reason').eq('slot_id', slot.id)).data;
    expect(pays.map((p) => `${p.status}:${p.amount_paise}:${p.failure_reason ?? ''}`).sort())
      .toEqual(['cancelled:50000:cancelled_by_farmer', 'failed:50000:fee_changed', 'succeeded:65000:']);
  });

  test('MOCKED network failure on confirm: no false success; Try again (same attempt) books once', async ({ page }) => {
    await setFee(50000);
    const slot = await newSlotToday();
    let cut = true;
    await page.route('**/rest/v1/rpc/confirm_demo_payment', (route) => (cut ? (cut = false, route.abort('failed')) : route.continue()));
    await openCheckout(page, slot, 'E2E network failure');
    await page.getByRole('button', { name: `Pay ${inr(50000)}` }).click();
    await expect(page.getByText(/No connection\. Your payment was not confirmed yet/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Booking confirmed')).toHaveCount(0);
    expect((await farmer.from('consultation_bookings').select('id').eq('slot_id', slot.id)).data).toHaveLength(0);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Booking confirmed')).toBeVisible({ timeout: 20_000 });
    expect((await farmer.from('consultation_bookings').select('id').eq('slot_id', slot.id)).data).toHaveLength(1);
    expect((await farmer.from('demo_payments').select('id').eq('slot_id', slot.id)).data).toHaveLength(1);
  });

  test('slot taken by another farmer during checkout: clear message, nothing booked for this farmer, back to slot choice', async ({ page }) => {
    await setFee(50000);
    const slot = await newSlotToday();
    await openCheckout(page, slot, 'E2E slot conflict');
    const other = await demoBook(farmer2, slot.id, 'E2E other farmer wins');
    expect(other.error).toBeNull(); bookings.push(other.data);
    await page.getByRole('button', { name: `Pay ${inr(50000)}` }).click();
    await expect(page.getByText(/Another farmer booked this slot moments ago/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Booking confirmed')).toHaveCount(0);
    await page.getByRole('button', { name: 'Choose another slot' }).click();
    await expect(page.getByText('Choose a time *')).toBeVisible();
    await expect(page.getByText(slot.label, { exact: true })).toHaveCount(0);   // the taken slot is no longer offered
  });

  test('expert sets the fee: invalid values refused, valid fee saved, 98 % / 2 % preview, farmers see the new fee', async ({ page }) => {
    await setFee(50000);
    await newSlotToday();   // so expert1 is listed for farmers
    await login(page, fx('expert1'));
    await nav(page, 'Catch Up').click();
    await page.locator('.chip', { hasText: /Availability/ }).first().click();
    const input = page.getByLabel(/Your fee per consultation/);
    await expect(page.getByTestId('current-fee')).toHaveText(inr(50000), { timeout: 20_000 });
    for (const [bad, msg] of [['0', /between ₹1 and ₹1,00,000/], ['-5', /Enter a fee in rupees/], ['abc', /Enter a fee in rupees/],
      ['12.345', /Enter a fee in rupees/], ['100001', /between ₹1 and ₹1,00,000/], ['', /Enter your consultation fee/]]) {
      await input.fill(bad);
      await expect(page.getByRole('button', { name: /Save fee|Saved/ })).toBeDisabled();
      await expect(page.getByRole('alert')).toContainText(msg);   // the reason is shown, not only a disabled button
    }
    await input.fill('1000');
    await expect(page.getByTestId('fee-split')).toContainText(`You receive ${inr(98000)} (98%)`);
    await expect(page.getByTestId('fee-split')).toContainText(`commission ${inr(2000)} (2%)`);
    await page.getByRole('button', { name: 'Save fee' }).click();
    await expect(page.getByTestId('current-fee')).toHaveText(inr(100000), { timeout: 15_000 });
    expect((await expert.from('experts').select('consultation_fee_paise').eq('id', expertId).single()).data.consultation_fee_paise).toBe(100000);
    const view = await createClient(process.env.STAGING_SUPABASE_URL, process.env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    await view.auth.signInWithPassword({ email: fx('user2'), password: process.env.FIXTURE_PASSWORD });
    expect((await view.from('experts').select('consultation_fee_paise').eq('id', expertId).single()).data.consultation_fee_paise).toBe(100000);
    const sneaky = await farmer.from('experts').update({ consultation_fee_paise: 100 }).eq('id', expertId).select();
    expect(sneaky.error || sneaky.data.length === 0).toBeTruthy();   // a farmer cannot change it
  });

  test('Terms & Conditions explain the 2 % commission (no acceptance recorded)', async ({ page }) => {
    await login(page, fx('user1'));
    await expect(nav(page, 'Profile')).toBeVisible({ timeout: 20_000 });
    await nav(page, 'Profile').click();
    await page.getByRole('button', { name: 'Profile menu' }).click();
    await page.getByText('Settings', { exact: true }).first().click();
    await page.getByText('Terms & Conditions').click();
    await expect(page.getByText(/retains a platform commission of/)).toBeVisible();
    await expect(page.getByText(/₹1,000\.00 gives a commission of ₹20\.00 and an expert share of ₹980\.00/)).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/demo|no real money/i);
  });

  test('expert: invalid link refused, valid Google Meet link saved and kept after reload; farmer sees "link ready"', async ({ page }) => {
    const slot = await newSlotToday(350);
    const b = await demoBook(farmer, slot.id, 'E2E meet link'); expect(b.error).toBeNull(); bookings.push(b.data);
    await login(page, fx('expert1'));
    await nav(page, 'Catch Up').click();
    const card = page.locator('.card', { hasText: 'E2E meet link' }).first();
    await expect(card.getByText('No meeting link yet — add a Google Meet link')).toBeVisible({ timeout: 20_000 });
    await card.click();
    await page.getByRole('button', { name: 'Add Google Meet Link' }).click();
    const input = page.getByLabel('Google Meet link');
    for (const bad of ['https://meet.google.com.attacker.example/abc-defg-hij', 'javascript:alert(1)', 'http://meet.google.com/abc-defg-hij']) {
      await input.fill(bad);
      await page.getByRole('button', { name: 'Save link' }).click();
      await expect(page.getByRole('alert')).toContainText('Paste a Google Meet link');
    }
    await input.fill(' https://meet.google.com/uit-estl-nkk?authuser=0 ');
    await page.getByRole('button', { name: 'Save link' }).click();
    await expect(page.getByRole('status')).toContainText('Meeting link saved. The farmer has been notified.', { timeout: 15_000 });
    await expect(input).toHaveValue('https://meet.google.com/uit-estl-nkk');
    await page.getByRole('button', { name: 'Save link' }).click();
    await expect(page.getByRole('status')).toContainText('This link is already saved.');
    await page.reload();
    await nav(page, 'Catch Up').click();
    await expect(page.locator('.card', { hasText: 'E2E meet link' }).first().getByText('Google Meet link saved')).toBeVisible({ timeout: 20_000 });
    const notes = (await farmer.from('notifications').select('message').eq('related_id', b.data)).data.map((n) => n.message);
    expect(notes.filter((m) => /added the Google Meet link/.test(m))).toHaveLength(1);
    expect(notes.join(' ')).not.toContain('meet.google.com');
  });
});

// Owner decisions 2026-10-26: cancellation & refund rules, messaging with message requests.
test.describe('cancellation & messaging 2026-10-26 (staging)', () => {
  test.skip(!staging || !process.env.STAGING_SUPABASE_URL, 'needs staging env');
  test.describe.configure({ mode: 'serial' });
  const mk = () => createClient(process.env.STAGING_SUPABASE_URL, process.env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const C = {}; const slots = []; const bookings = [];
  const ist = (min) => { const d = new Date(Math.ceil((Date.now() + min * 60000) / 60000) * 60000 + 330 * 60000); return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) }; };
  const plus30 = (t) => { const [h, m] = t.split(':').map(Number); const x = (h * 60 + m + 30) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  test.beforeAll(async () => {
    for (const n of ['expert1', 'user1', 'user2', 'user3', 'user4']) {
      C[n] = mk();
      const r = await C[n].auth.signInWithPassword({ email: fx(n), password: process.env.FIXTURE_PASSWORD });
      C[`${n}Id`] = r.data.user.id;
    }
    C.expertId = (await C.expert1.from('experts').select('id').eq('user_id', C.expert1Id).single()).data.id;
  });
  test.afterAll(async () => {
    for (const id of bookings) await C.user1.rpc('cancel_consultation_booking', { p_booking_id: id, p_reason: 'E2E cleanup', p_offered_slots: [] });
    for (const id of slots) await C.expert1.from('consultation_slots').delete().eq('id', id).eq('is_booked', false);
  });

  test('farmer cancels inside 14 h: terms show the split before confirming; empty reason is an inline error; booking cancelled', async ({ page }) => {
    let s;
    for (let m = 95; m < 101; m++) {
      const at = ist(m);
      s = await C.expert1.from('consultation_slots').insert({ expert_id: C.expertId, slot_date: at.date, start_time: at.time, end_time: plus30(at.time), rate: 300 }).select('id').single();
      if (s.error?.code !== '23505') break;
    }
    expect(s.error).toBeNull();
    slots.push(s.data.id);
    const topic = `E2E late cancel ${Date.now() % 100000}`;
    const b = await demoBook(C.user1, s.data.id, topic);
    expect(b.error).toBeNull();
    bookings.push(b.data);
    page.on('dialog', (d) => { throw new Error(`unexpected popup: ${d.message()}`); });
    await login(page, fx('user1'));
    await nav(page, 'Catch Up').click();
    await page.getByRole('button', { name: /^Upcoming/ }).click();
    await page.locator('.card', { hasText: topic }).first().click();
    const terms = page.getByTestId('cancellation-terms').first();
    await expect(terms).toContainText('less than 14 hours', { timeout: 15_000 });
    await expect(terms).toContainText('goes to the expert');
    await page.getByRole('button', { name: 'Cancel Meeting' }).click();
    await page.getByRole('button', { name: 'Yes, cancel meeting' }).click();
    await expect(page.getByText('Please enter a cancellation reason.')).toBeVisible();
    await page.getByLabel(/Cancellation reason/).fill('Cannot attend, sorry');
    await page.getByRole('button', { name: 'Yes, cancel meeting' }).click();
    await expect.poll(async () => (await C.user1.from('consultation_bookings').select('status, cancellation_rule').eq('id', b.data).single()).data,
      { timeout: 20_000 }).toEqual({ status: 'Cancelled', cancellation_rule: 'farmer_late' });
    await expect(page.locator('.card', { hasText: topic })).toHaveCount(0, { timeout: 15_000 });
  });

  test('Message button on an expert profile opens a normal chat; the message is sent once', async ({ page }) => {
    await login(page, fx('user1'));
    await nav(page, 'Catch Up').click();
    await page.getByRole('img', { name: 'Dr. Ramesh Expert' }).first().click();
    await page.getByRole('button', { name: 'Message' }).click();
    await expect(page.getByLabel('Message', { exact: true })).toBeVisible({ timeout: 15_000 });   // the chat screen
    await expect(page.getByRole('heading', { name: 'Dr. Ramesh Expert', exact: true })).toBeVisible();
    await expect(page.getByText(/will see your messages as a request/)).toHaveCount(0);   // they share a booking
    const text = `E2E hello ${Date.now()}`;
    await page.getByLabel('Message', { exact: true }).fill(text);
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.locator('.chat-bubble.sent', { hasText: text })).toBeVisible();
    await expect(page.locator('.chat-bubble.sent', { hasText: text }).getByText('Sending…')).toHaveCount(0, { timeout: 15_000 });
    const conv = (await C.expert1.rpc('get_or_create_conversation', { p_other: C.user1Id })).data;
    const msgs = (await C.expert1.rpc('get_messages', { p_conversation_id: conv.conversation_id, p_limit: 50 })).data;
    expect(msgs.filter((m) => m.content === text)).toHaveLength(1);
  });

  test('message request: blue dot on the requests icon, request listed, Accept/Decline shown, reply accepts', async ({ page }, info) => {
    // conversations are kept as records, so each farmer pair shows the request flow once (staging-cancel-messaging uses them too)
    const pairs = [['user2', 'user1'], ['user3', 'user1'], ['user3', 'user2'], ['user4', 'user3'], ['user4', 'user2'], ['user1', 'user4']];
    let pair = null;
    for (const [a, b] of pairs) {
      let used = false;
      for (const [x, y] of [[a, b], [b, a]]) for (const box of ['inbox', 'requests']) {
        if ((await C[x].rpc('list_conversations', { p_box: box, p_limit: 200 })).data.some((r) => r.other_user_id === C[`${y}Id`])) used = true;
      }
      if (!used) { pair = [a, b]; break; }
    }
    info.skip(!pair, 'every farmer pair already has a conversation on staging');
    const [a, b] = pair;
    const conv = (await C[a].rpc('get_or_create_conversation', { p_other: C[`${b}Id`] })).data;
    expect(conv.state).toBe('request_outgoing');
    expect((await C[a].rpc('send_message', { p_conversation_id: conv.conversation_id, p_content: 'E2E request hello', p_client_id: crypto.randomUUID() })).error).toBeNull();
    const senderName = (await C[b].from('profiles').select('full_name').eq('id', C[`${a}Id`]).single()).data.full_name;

    await login(page, fx(b));
    await nav(page, 'Chat').click();
    await expect(page.getByTestId('requests-dot')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.chat-thread-item', { hasText: 'E2E request hello' })).toHaveCount(0);   // not in the inbox
    await page.getByRole('button', { name: /Message requests/ }).click();
    await expect(page.getByRole('heading', { name: 'Message requests' })).toBeVisible();
    await page.locator('.chat-thread-item', { hasText: senderName }).first().click();
    await expect(page.getByText('E2E request hello')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Decline' })).toBeVisible();
    await page.getByLabel('Message', { exact: true }).fill('E2E reply accepts');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('button', { name: 'Accept' })).toHaveCount(0, { timeout: 15_000 });
    const st = (await C[b].rpc('list_conversations', { p_box: 'inbox', p_limit: 200 })).data.find((r) => r.conversation_id === conv.conversation_id);
    expect(st?.state).toBe('normal');
  });
});
