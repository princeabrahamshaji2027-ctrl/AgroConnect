// Three clients at once against STAGING: farmer in a browser (app on http://localhost:4174, dist-staging), expert on
// the phone (com.agroconnect.app.staging), admin in a browser (http://localhost:4173, admin dist-staging).
// Checks that a post, a chat message, a Google Meet link and an approved expert announcement reach the other clients
// without reloading. Never opens the production app; refuses the production project; prints no passwords.
//   ANDROID_SERIAL=<serial> node scripts/staging/three-client-test.mjs [screenshot-dir]
// Test rows it creates are removed at the end (post, booking + slot, announcement); the chat messages stay.
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { demoBook } from '../../tests/e2e/demo-booking.mjs';
import { NAMES } from '../../tests/fixtures/staging-accounts.mjs';

const env = Object.fromEntries(readFileSync(new URL('../../.env.staging', import.meta.url), 'utf8').split('\n')
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
if (!env.STAGING_SUPABASE_URL.includes('ahkgvuewgbjyahbiehrx')) throw new Error('not the staging project');
const OUT = process.argv[2] || 'appium-results/2026-10-29_three_clients';
mkdirSync(OUT, { recursive: true });
const ADB = `${homedir()}/Library/Android/sdk/platform-tools/adb`;
const PKG = 'com.agroconnect.app.staging';
const fx = (k) => `agroconnect-stg-${k}-${env.FIXTURE_EMAIL_TOKEN}@${env.FIXTURE_EMAIL_DOMAIN}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); };

// ---------------------------------------------------------------- phone (uiautomator)
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', maxBuffer: 1 << 24 });
function nodes() {
  for (let i = 0; i < 5; i++) {
    try {
      adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
      const xml = adb('shell', 'cat', '/sdcard/ui.xml');
      return [...xml.matchAll(/<node [^>]*>/g)].map((m) => {
        const at = (k) => (m[0].match(new RegExp(` ${k}="([^"]*)"`)) || [])[1] || '';
        const b = at('bounds').match(/\d+/g)?.map(Number) || [0, 0, 0, 0];
        return { text: at('text'), desc: at('content-desc'), cls: at('class'), pkg: at('package'), pw: at('password') === 'true',
          x: (b[0] + b[2]) >> 1, y: (b[1] + b[3]) >> 1, top: b[1] };
      });
    } catch { /* dump can fail while the screen changes */ }
  }
  return [];
}
const label = (n) => (n.text || n.desc).replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
const screenText = () => nodes().filter((n) => !n.pw).map(label).filter(Boolean).join(' | ');
const H = Number(adb('shell', 'wm', 'size').match(/(\d+)x(\d+)\s*$/m)[2]);
async function phoneWait(re, ms = 30_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    adb('shell', 'input', 'keyevent', '59');   // keep the screen on
    if (re.test(screenText())) return true;
    await sleep(700);
  }
  return false;
}
async function phoneTap(pred, ms = 20_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const n = nodes().find(pred);
    if (n) { adb('shell', 'input', 'tap', String(n.x), String(n.y)); await sleep(1500); return true; }
    await sleep(700);
  }
  return false;
}
const tapText = (re, ms) => phoneTap((n) => re.test(label(n)), ms);
const tapNav = (name) => phoneTap((n) => n.top > H * 0.85 && label(n).endsWith(name) && label(n).length <= name.length + 20);
const phoneType = (s) => adb('shell', 'input', 'text', s.replace(/ /g, '%s').replace(/(['"&()!?;<>|*$`\\])/g, '\\$1'));
const shot = (name) => writeFileSync(`${OUT}/${name}.png`, execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 1 << 26 }));

async function phoneLogin(key) {
  adb('shell', 'am', 'force-stop', PKG); adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'am', 'start', '-W', '-n', `${PKG}/com.agroconnect.app.MainActivity`);
  if (!(await phoneWait(/Welcome Back/, 40_000))) throw new Error('phone: login screen did not appear');
  for (const [i, value] of [[0, fx(key)], [1, env.FIXTURE_PASSWORD]]) {
    const edits = nodes().filter((n) => n.cls === 'android.widget.EditText');
    adb('shell', 'input', 'tap', String(edits[i].x), String(edits[i].y)); await sleep(500);
    phoneType(value); adb('shell', 'input', 'keyevent', '111'); await sleep(600);
  }
  await tapText(/^Log In$/);
  if (!(await phoneWait(/Catch Up/, 40_000))) throw new Error('phone: sign-in did not finish');
}

// ---------------------------------------------------------------- API clients (for set-up and clean-up only)
const api = async (key, pw = env.FIXTURE_PASSWORD) => {
  const c = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: key.includes('@') ? key : fx(key), password: pw });
  if (error) throw new Error(`api sign-in ${key}: ${error.message}`);
  return { c, uid: data.user.id };
};
const farmerApi = await api('user1');
const expertApi = await api('expert1');
const adminApi = await api(env.E2E_ADMIN_EMAIL, env.E2E_ADMIN_PASSWORD);
const expertId = (await expertApi.c.from('experts').select('id').eq('user_id', expertApi.uid).single()).data.id;

// ---------------------------------------------------------------- browsers
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const farmerCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
// Google Meet is not contacted: the opened tab gets a local stand-in page, the URL is what is checked
await farmerCtx.route('https://meet.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Google Meet</title>' }));
const farmer = await farmerCtx.newPage();
const farmerErrors = [];
farmer.on('console', (m) => { if (m.type() === 'error' || /CHANNEL|realtime/i.test(m.text())) farmerErrors.push(m.text().slice(0, 160)); });
const admin = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
const nav = (page, name) => page.locator(`.bottom-nav-item:has-text("${name}"), .bottom-nav-item[aria-label="${name}"]`).first();

const stamp = new Date().toISOString().slice(11, 16).replace(':', '');
const created = { post: null, slot: null, booking: null, broadcast: null };
try {
  // ---- sign in on all three
  await phoneLogin('expert1');
  await farmer.goto('http://localhost:4174/');
  await farmer.getByText('Welcome Back').waitFor({ timeout: 30_000 });
  await farmer.getByPlaceholder('Enter your email or username').fill(fx('user1'));
  await farmer.getByPlaceholder('Enter your password').fill(env.FIXTURE_PASSWORD);
  await farmer.getByRole('button', { name: 'Log In' }).click();
  await nav(farmer, 'Feed').waitFor({ timeout: 30_000 });
  await admin.goto('http://localhost:4173/');
  await admin.getByPlaceholder('admin@agroconnect.com').fill(env.E2E_ADMIN_EMAIL);
  await admin.locator('input[type=password]').fill(env.E2E_ADMIN_PASSWORD);
  await admin.getByText('Sign In to Dashboard').click();
  await admin.getByText('Total Users').waitFor({ timeout: 30_000 });
  record('sign-in on all three clients', true, `farmer web, expert phone (${NAMES.expert1}), admin web`);

  // ---- 1. feed: the farmer posts on the web; the phone (already on Feed) and the admin see it
  const caption = `Drained the paddy field before the rain, water level looks good now ${stamp}`;
  await farmer.getByRole('button', { name: 'Floating action button' }).or(farmer.locator('.fab')).first().click();
  await farmer.getByPlaceholder('e.g. Pest damage on Rice crop leaves').fill('Paddy field drainage');
  await farmer.locator('textarea').first().fill(caption);
  const t0 = Date.now();
  await farmer.getByRole('button', { name: 'Publish Post' }).click();
  await farmer.locator('.card', { hasText: caption }).first().waitFor({ timeout: 20_000 });
  record('feed: farmer sees own post', true, `${Date.now() - t0} ms`);
  // the app stores "<title>\n\n<text>" in caption
  created.post = (await farmerApi.c.from('posts').select('id').like('caption', `%${caption}`).single()).data?.id;
  const onPhone = await phoneWait(new RegExp(stamp), 20_000);
  record('feed: post reaches the expert phone without reload', onPhone, `${Date.now() - t0} ms`);
  shot('01_phone_feed_new_post');
  await admin.getByText('Posts', { exact: true }).first().click();
  const onAdmin = await admin.getByText(new RegExp(stamp)).first().waitFor({ timeout: 20_000 }).then(() => true, () => false);
  record('feed: admin Posts lists the post', onAdmin, `${Date.now() - t0} ms (page opened after posting)`);
  await admin.screenshot({ path: `${OUT}/02_admin_posts.png` });

  // ---- 2. chat: farmer → expert (phone), then expert (phone) → farmer
  const hello = `Good morning doctor, my coconut leaves are turning yellow ${stamp}`;
  await nav(farmer, 'Catch Up').click();
  await farmer.getByRole('img', { name: NAMES.expert1 }).first().click();
  await farmer.getByRole('button', { name: 'Message' }).click();
  await farmer.getByLabel('Message', { exact: true }).waitFor({ timeout: 20_000 });
  await tapNav('Chat');
  await tapText(new RegExp(NAMES.user1));
  const t1 = Date.now();
  await farmer.getByLabel('Message', { exact: true }).fill(hello);
  await farmer.getByRole('button', { name: 'Send message' }).click();
  const chatOnPhone = await phoneWait(new RegExp(`yellow ${stamp}`), 20_000);
  record('chat: farmer message appears on the expert phone (conversation open)', chatOnPhone, `${Date.now() - t1} ms`);
  shot('03_phone_chat_received');
  const reply = `Please send a photo of the lower leaves ${stamp}`;
  await phoneTap((n) => n.cls === 'android.widget.EditText');
  phoneType(reply);
  const t2 = Date.now();
  await phoneTap((n) => /Send message/.test(n.desc) || /Send message/.test(n.text), 10_000);
  const replyOnWeb = await farmer.locator('.chat-bubble', { hasText: `lower leaves ${stamp}` }).first()
    .waitFor({ timeout: 20_000 }).then(() => true, () => false);
  record('chat: expert reply from the phone appears on the farmer web', replyOnWeb, `${Date.now() - t2} ms`);
  await farmer.screenshot({ path: `${OUT}/04_web_chat_reply.png` });

  // ---- 3. Google Meet link: booking starting in ~4 min; expert saves the link on the phone; farmer's open Catch Up updates
  const ist = (min) => { const d = new Date(Math.ceil((Date.now() + min * 60000) / 60000) * 60000 + 330 * 60000); return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) }; };
  const plus30 = (t) => { const [h, m] = t.split(':').map(Number); const x = (h * 60 + m + 30) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  for (let m = 4; m < 12 && !created.slot; m++) {
    const at = ist(m);
    const s = await expertApi.c.from('consultation_slots').insert({ expert_id: expertId, slot_date: at.date, start_time: at.time, end_time: plus30(at.time) }).select('id').single();
    if (!s.error) created.slot = s.data.id;
  }
  const issue = `Coconut leaf yellowing ${stamp}`;
  const b = await demoBook(farmerApi.c, created.slot, issue);
  if (b.error) throw new Error(`booking: ${b.error.message}`);
  created.booking = b.data;
  await nav(farmer, 'Catch Up').click();
  await farmer.getByRole('button', { name: /^Upcoming/ }).click().catch(() => {});
  const card = () => farmer.locator('.card', { hasText: issue }).first();
  await card().getByText('Waiting for expert to add meeting link').waitFor({ timeout: 20_000 });
  const link = `https://meet.google.com/agr-${[...stamp].map((d) => 'abcdefghij'[d]).join('')}-tst`;   // test code, no real meeting
  await tapNav('Catch Up');
  await tapText(new RegExp(issue), 30_000);
  await tapText(/Add Google Meet Link$/, 15_000);
  await phoneTap((n) => n.cls === 'android.widget.EditText');
  phoneType(link);
  adb('shell', 'input', 'keyevent', '111');
  const t3 = Date.now();
  await tapText(/Save link$/);
  const saved = await phoneWait(/Meeting link saved/, 15_000);
  shot('05_phone_meet_link_saved');
  record('meet: expert saves the link on the phone', saved, link);
  const ready = await card().getByText('Google Meet link ready').waitFor({ timeout: 25_000 }).then(() => true, () => false);
  record('meet: farmer Catch Up shows the link without reload', ready, `${Date.now() - t3} ms`);
  const stored = (await farmerApi.c.from('video_meetings').select('meeting_link').eq('booking_id', created.booking).single()).data?.meeting_link;
  record('meet: the farmer gets exactly the URL the expert saved', stored === link, `${stored}`);
  const joinBtn = card().getByRole('button', { name: 'Join Meeting' });
  // Join opens 5 minutes before the start; wait for it (the booking starts 4–12 minutes after it was made)
  let canJoin = false;
  for (const end = Date.now() + 9 * 60_000; Date.now() < end && !(canJoin = await joinBtn.isEnabled().catch(() => false));) await sleep(5_000);
  if (canJoin) {
    const popupP = farmer.waitForEvent('popup');
    await joinBtn.click();
    const popup = await popupP;
    await popup.waitForURL(link, { timeout: 15_000 }).catch(() => {});   // the app opens a blank tab first, then sets its address
    record('meet: farmer Join opens that same URL (enter)', popup.url() === link, popup.url());
    await popup.close();
    record('meet: farmer leaves (closes the Meet tab) and is back in Catch Up', await card().isVisible(), 'card still shown');
  } else {
    record('meet: farmer Join opens that same URL (enter)', false, 'Join button not enabled');
  }
  await farmer.screenshot({ path: `${OUT}/06_web_meet_ready.png` });

  // ---- 4. announcement: expert submits on the phone, admin approves, farmer gets the pop-up
  const aTitle = `Rhinoceros beetle alert ${stamp}`;
  adb('shell', 'input', 'keyevent', '4'); await sleep(1200);   // close the meeting sheet
  await tapNav('Catch Up');
  await phoneTap((n) => /Expert Menu/.test(n.desc) || /Expert Menu/.test(n.text));
  await phoneWait(/Send an Announcement/, 10_000); await sleep(1200);   // let the menu finish sliding up
  for (let i = 0; i < 3 && !(await phoneWait(/Send for approval/, 4_000)); i++) await tapText(/Send an Announcement/);
  await sleep(800);
  const edits = nodes().filter((n) => n.cls === 'android.widget.EditText');
  adb('shell', 'input', 'tap', String(edits[0].x), String(edits[0].y)); await sleep(400); phoneType(aTitle);
  adb('shell', 'input', 'keyevent', '61'); await sleep(600);   // Tab into the message box (its position moves with the keyboard)
  phoneType('Check coconut crowns this week and clean the breeding sites in compost pits.'); adb('shell', 'input', 'keyevent', '111');
  await tapText(/^Farmers$/);
  await tapText(/Send for approval$/);
  const sent = await phoneWait(/sent to the admin for approval/, 15_000);
  shot('07_phone_announcement_sent');
  record('announcement: expert submits on the phone', sent, aTitle);
  created.broadcast = (await adminApi.c.from('broadcasts').select('id').eq('title', aTitle).maybeSingle()).data?.id;
  await nav(farmer, 'Feed').click();
  await admin.getByText('Broadcasts', { exact: true }).first().click();
  const pend = admin.getByTestId('pending-broadcast').filter({ hasText: aTitle });
  record('announcement: admin sees it waiting for review', await pend.waitFor({ timeout: 20_000 }).then(() => true, () => false), '');
  await admin.screenshot({ path: `${OUT}/08_admin_pending_announcement.png` });
  const t4 = Date.now();
  await pend.getByRole('button', { name: /Approve/ }).click();
  await admin.getByText(/Approved and sent to \d+ users/).waitFor({ timeout: 15_000 });
  const seen = await Promise.race([
    farmer.getByText(aTitle).first().waitFor({ timeout: 20_000 }).then(() => 'pop-up'),
    farmer.getByText(/Check coconut crowns/).first().waitFor({ timeout: 20_000 }).then(() => 'toast only'),
  ]).catch(() => 'nothing');
  record('announcement: farmer web gets the pop-up after approval', seen === 'pop-up',
    `${seen} after ${Date.now() - t4} ms${farmerErrors.length ? `; console: ${farmerErrors.slice(-3).join(' / ')}` : ''}`);
  await farmer.screenshot({ path: `${OUT}/09_web_announcement_popup.png` });
  const expertTold = await phoneWait(/approved and sent|Rhinoceros/, 5_000);
  record('announcement: expert is notified of the approval', expertTold || !!(await expertApi.c.from('notifications')
    .select('id').eq('related_id', created.broadcast).ilike('message', '%approved%')).data?.length, '');

  // ---- 5. admin: the booking and the expert's resume
  await admin.getByText('Bookings & Payments', { exact: true }).first().click();
  const row = admin.locator('tr', { hasText: created.booking.slice(0, 8) }).first();
  const listed = await row.waitFor({ timeout: 20_000 }).then(() => true, () => false);
  const linkSaved = listed && (await row.textContent()).includes('Saved');
  if (listed) await row.click();
  const detail = listed && await admin.getByText(new RegExp(issue)).first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
  await admin.screenshot({ path: `${OUT}/10b_admin_booking_detail.png` });
  await admin.keyboard.press('Escape');
  await admin.locator('div.fixed.inset-0').first().waitFor({ state: 'detached', timeout: 5_000 }).catch(async () => {
    await admin.getByRole('button', { name: /close/i }).first().click().catch(() => {});
  });
  record('admin: the booking is listed with the Meet link saved, and its detail shows the issue', listed && linkSaved && detail,
    `row ${listed}, link Saved ${linkSaved}, detail ${detail}`);
  await admin.screenshot({ path: `${OUT}/10_admin_booking.png` });
  await admin.getByText('Experts', { exact: true }).first().click();
  await admin.getByRole('heading', { name: 'Experts Management' }).waitFor({ timeout: 20_000 });
  const missing = await admin.getByText(/Resume missing/).count();
  record('admin: no "Resume missing" on the Experts page', missing === 0, `${missing} shown`);
  const view = admin.getByText('View Resume').first();
  if (await view.count()) {
    const pdfP = admin.context().waitForEvent('page', { timeout: 15_000 }).catch(() => null);
    await view.click();
    const pdf = await pdfP;
    record('admin: View Resume opens the PDF', !!pdf && /expert-cvs|\.pdf/.test(pdf.url()), pdf ? pdf.url().split('?')[0].replace(/.*\/object\//, '…/object/') : 'no tab');
    if (pdf) await pdf.close();
  }
  await admin.screenshot({ path: `${OUT}/11_admin_experts.png` });
} catch (e) {
  record('run', false, e.message);
} finally {
  if (created.booking) await farmerApi.c.rpc('cancel_consultation_booking', { p_booking_id: created.booking, p_reason: 'Test finished', p_offered_slots: [] });
  if (created.slot) await expertApi.c.from('consultation_slots').delete().eq('id', created.slot).eq('is_booked', false);
  if (created.post) await farmerApi.c.from('posts').delete().eq('id', created.post);
  if (created.broadcast) {
    for (const c of [farmerApi.c, expertApi.c, adminApi.c]) await c.from('notifications').delete().eq('related_id', created.broadcast);
    await adminApi.c.from('broadcasts').delete().eq('id', created.broadcast);
  }
  await browser.close();
  if (created.broadcast) console.log(`other staging farmers received announcement ${created.broadcast}; remove their notifications with:\n  delete from public.notifications where related_id = '${created.broadcast}';`);
  writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
