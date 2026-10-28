// Regression guards for defects found in the 2026-10-24 audit (see AUDIT_ISSUES.md).
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');

test('AUD-001: admin login does not pre-fill or auto-submit credentials', () => {
  const src = read('admin-dashboard/src/pages/Login.jsx');
  assert.match(src, /const \[email, setEmail\] = useState\(''\)/);
  assert.match(src, /const \[password, setPassword\] = useState\(''\)/);
  assert.doesNotMatch(src, /useEffect\(\s*\(\)\s*=>\s*\{\s*handleLogin/);
});

test('AUD-001: user app login does not pre-fill credentials', () => {
  const src = read('src/pages/Login.jsx');
  assert.match(src, /const \[username, setUsername\] = useState\(''\)/);
  assert.match(src, /const \[password, setPassword\] = useState\(''\)/);
});

test('AUD-002: seed-demo-users.js reads passwords from the environment', () => {
  const src = read('seed-demo-users.js');
  assert.doesNotMatch(src, /password:\s*'[^']+'/);
  assert.match(src, /process\.env\.DEMO_ADMIN_PASSWORD/);
});

test('AUD-002: no built admin bundle contains the admin email as a default value', () => {
  const dir = join(root, 'admin-dashboard/dist/assets');
  if (!existsSync(dir)) return; // bundle not built in this checkout
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    // minified form is e.g. (0,_.useState)(`prince@agroconnect.com`)
    assert.doesNotMatch(readFileSync(join(dir, f), 'utf8'), /useState\)?\(\s*["'`]prince@agroconnect\.com["'`]/, f);
  }
});

test('AUD-004: comment ownership uses the author id, not mock display names', () => {
  const src = read('src/pages/Feed.jsx');
  assert.doesNotMatch(src, /Ramesh Kumar/);
  assert.match(src, /isCommentOwner = !!currentUserId && c\.userId === currentUserId/);
  assert.match(src, /isReplyOwner = !!currentUserId && reply\.userId === currentUserId/);
  // both comment queries must select user_id so ownership can be computed
  assert.equal((src.match(/\n\s+id,\n\s+user_id,\n\s+comment,/g) || []).length, 2);
});

test('AUD-005: feed tolerates profiles with a null full_name', () => {
  const src = read('src/pages/Feed.jsx');
  assert.doesNotMatch(src, /p\.full_name\.toLowerCase\(\)/);
});

test('AUD-006: like writes are checked and the post card rolls back on failure', () => {
  const feed = read('src/pages/Feed.jsx');
  assert.match(feed, /Like failed/);
  const card = read('src/components/Card.jsx');
  assert.match(card, /await onLike\(post\.id, newLiked\)\) === false/);
});

test('AUD-007: expert application aborts on CV upload failure and keeps history', () => {
  const src = read('src/pages/UserProfile.jsx');
  assert.doesNotMatch(src, /CV upload notice/);
  assert.doesNotMatch(src, /from\('expert_applications'\)\.delete\(\)/);
  assert.match(src, /CV upload failed/);
});

test('AUD-009: admin dashboard shows no fabricated statistics', () => {
  const src = read('admin-dashboard/src/pages/Dashboard.jsx');
  for (const fake of ['* 0.65', '~65% Monthly Active', '>45%<', '>100 GB<', '>32<', '>Up to date<']) {
    assert.ok(!src.includes(fake), `found fabricated value ${fake}`);
  }
});

test('AUD-010: admin deletes are verified before an audit entry is written', () => {
  for (const p of [
    'admin-dashboard/src/pages/Posts.jsx',
    'admin-dashboard/src/pages/Comments.jsx',
    'admin-dashboard/src/components/PostDetailModal.jsx',
  ]) {
    const src = read(p);
    assert.match(src, /if \(!deleted\?\.length\) throw new Error/, p);
  }
});

test('AUD-011: keep-alive declares timestamp outside try so the catch block can log it', () => {
  const src = read('keep-alive.js');
  assert.ok(src.indexOf('const timestamp') < src.indexOf('try {'));
});

test('AUD-013/014: Catch Up writes go through server functions, not direct table writes', () => {
  const src = read('src/pages/Connect.jsx');
  assert.doesNotMatch(src, /from\('notifications'\)/, 'browser must not create notifications');
  assert.doesNotMatch(src, /from\('consultation_bookings'\)\s*\.(insert|update|delete|upsert)\(/);
  assert.doesNotMatch(src, /from\('video_meetings'\)/);
  assert.doesNotMatch(src, /is_booked: true/);
  for (const fn of ['cancel_consultation_booking', 'complete_consultation', 'join_consultation', 'set_meeting_link']) {
    assert.match(src, new RegExp(`rpc\\('${fn}'`), fn);
  }
  // booking only through the DEMO checkout (migration 14): the old direct booking call is gone from the app
  assert.doesNotMatch(src, /book_consultation_slot/);
  const checkout = read('src/components/DemoCheckout.jsx');
  for (const fn of ['start_demo_checkout', 'confirm_demo_payment', 'cancel_demo_payment']) assert.match(checkout, new RegExp(`rpc\\('${fn}'`), fn);
  // product decision: no demo / mock / "no real money" wording anywhere the user can see it
  for (const f of ['src/components/DemoCheckout.jsx', 'src/pages/Connect.jsx', 'src/pages/Terms.jsx', 'src/components/ConsultationFeeEditor.jsx']) {
    const visible = read(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l)).map((l) => l.replace(/\s\/\/ .*$/, '')).join('\n');
    assert.doesNotMatch(visible.replace(/demo_payments|demo-|DemoCheckout|confirm_demo_payment|start_demo_checkout|cancel_demo_payment|\.demo/g, ''), /demo payment|mock payment|no real money|simulated payment/i, f);
  }
  // one price source: the expert's fee; no per-slot price in the app
  assert.match(src, /consultation_fee_paise/);
  assert.doesNotMatch(src, /\bslot\.rate\b|\.rate\)|rate: 500|minRate|minDateRate/, 'slot rates are not shown or used any more');
  assert.doesNotMatch(checkout, /p_amount/, 'client sends an amount');
  assert.doesNotMatch(src, /checkRemindersAndNoShows/);
  assert.doesNotMatch(src, /setNowTick/, 'no whole-page re-render every second');
});

test('Catch Up uses Google Meet links and a demo checkout: no embedded/paid video, no payment provider', () => {
  const pkg = read('package.json');
  assert.doesNotMatch(pkg, /daily-co|razorpay|stripe|paypal|agora|twilio|jitsi|100ms/i);
  for (const f of ['src/pages/Connect.jsx', 'src/components/DemoCheckout.jsx', 'src/utils/meetLink.js', 'src/App.jsx']) {
    assert.doesNotMatch(read(f), /daily-co|video-room-token|razorpay|stripe|paypal|card number|cvv|upi pin/i, f);
  }
  const meet = read('src/utils/meetLink.js');
  assert.match(meet, /new URL\(raw\)/, 'links are parsed, not substring-matched');
  assert.match(meet, /url\.hostname !== 'meet\.google\.com'/);
  assert.doesNotMatch(read('android/app/src/main/AndroidManifest.xml'), /RECORD_AUDIO|android\.permission\.CAMERA/);
});

test('AUD-015: fixture seeder creates the experts row and has no hard-coded password', () => {
  const src = read('seed/test-fixtures.js');
  assert.doesNotMatch(src, /SHARED_PASSWORD/);
  assert.doesNotMatch(src, /password:\s*'[^']+'/i);
  assert.match(src, /from\('experts'\)\.upsert/);
  assert.match(src, /Refusing to seed fixtures into the production project/);
});

test('AUD-035/034: app fonts and icons are bundled; no broken "google" icon ligature', () => {
  assert.doesNotMatch(read('index.html'), /fonts\.googleapis\.com/);
  const main = read('src/main.jsx');
  assert.match(main, /import 'material-symbols\/outlined\.css'/);
  assert.match(main, /import '@fontsource-variable\/inter'/);
  for (const p of ['src/pages/Login.jsx', 'src/pages/Register.jsx']) assert.doesNotMatch(read(p), /icon="google"/, p);
});

test('inline validation: no blocking alert()/confirm() popups in the user app pages and components', () => {
  for (const dir of ['src/pages', 'src/components']) {
    for (const f of readdirSync(join(root, dir)).filter((n) => n.endsWith('.jsx'))) {
      const src = read(`${dir}/${f}`).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      assert.doesNotMatch(src, /(^|[^.\w])(window\.)?alert\(/m, `${dir}/${f} uses alert()`);
      // deleting a comment now asks in an in-app Dialog too: no window.confirm() anywhere
      assert.doesNotMatch(src, /window\.confirm\(/, `${dir}/${f} uses confirm()`);
    }
  }
});

test('messaging and cancellation go through server functions (migrations 17/18), never direct table writes', () => {
  const chat = read('src/pages/Chat.jsx');
  assert.doesNotMatch(chat, /from\('messages'\)\s*\.(insert|update|delete)/);
  assert.doesNotMatch(chat, /from\('conversations'\)/);
  for (const fn of ['send_message', 'get_messages', 'list_conversations', 'chat_badges', 'mark_conversation_read', 'respond_to_message_request']) {
    assert.match(chat, new RegExp(`rpc\\('${fn}'`), fn);
  }
  const connect = read('src/pages/Connect.jsx');
  assert.doesNotMatch(connect, /from\('messages'\)/);
  assert.match(connect, /rpc\('consultation_cancellation_quote'/);
  const meetings = read('admin-dashboard/src/pages/Meetings.jsx');
  assert.match(meetings, /rpc\('admin_cancel_booking'/);
  assert.doesNotMatch(meetings, /p_new_status:\s*'Cancelled'/);
});

test('admin dashboard: Pending Reports is red only while something is pending', () => {
  const src = read('admin-dashboard/src/pages/Dashboard.jsx');
  assert.match(src, /stats\.pendingReports > 0 \? \(/);
  assert.match(src, /No pending reports/);
});

test('forms: every `const xValues = { … }` uses state declared above it (a later one crashed Catch Up on render)', () => {
  for (const dir of ['src/pages', 'src/components']) {
    for (const f of readdirSync(join(root, dir)).filter((n) => n.endsWith('.jsx'))) {
      const lines = read(`${dir}/${f}`).split('\n');
      lines.forEach((l, i) => {
        const m = l.match(/^\s*const (\w+Values) = \{(.*)\};/);
        if (!m) return;
        for (const part of m[2].split(',')) {
          const name = part.split(':').pop().trim();
          if (!/^\w+$/.test(name)) continue;
          const decl = lines.findIndex((x) => new RegExp(`const \\[\\s*${name}\\b|const ${name}\\b`).test(x));
          assert.ok(decl >= 0 && decl < i, `${dir}/${f}:${i + 1} ${m[1]} uses ${name} before it is declared`);
        }
      });
    }
  }
});

test('registration: no undefined variables after sign-up; district, phone and location go in the sign-up metadata', () => {
  const src = read('src/pages/Register.jsx');
  assert.doesNotMatch(src, /\b(phoneVal|cityVal|stateVal|countryVal|districtVal)\b/, 'removed validation variables are still used');
  assert.match(src, /options:\s*\{\s*data:\s*\{[^}]*district[^}]*phone[^}]*location/);
  assert.doesNotMatch(src, /handleGPSDetect|Detect Location via GPS/);
  const lint = JSON.parse(read('.oxlintrc.json'));
  assert.equal(lint.rules['no-undef'], 'error', 'oxlint must report undefined variables');
});

test('no invented Punjab / Ludhiana locations or fake distances in the app', () => {
  for (const dir of ['src/pages', 'src/components']) {
    for (const f of readdirSync(join(root, dir)).filter((n) => n.endsWith('.jsx'))) {
      const src = read(`${dir}/${f}`);
      assert.doesNotMatch(src, /Punjab, India|Ludhiana|Gill Village|km away/, `${dir}/${f}`);
    }
  }
});

test('feed uses the district-priority server function; seed scripts have no default project', () => {
  assert.match(read('src/pages/Feed.jsx'), /rpc\('get_feed'/);
  const admin = read('seed/lib/supabaseAdmin.js');
  assert.doesNotMatch(admin, /https:\/\/[a-z]+\.supabase\.co/, 'seed scripts must not default to a project');
  assert.doesNotMatch(admin, /SUPABASE_ANON_KEY/, 'no anon-key fallback for seeding');
  for (const f of ['seed/cleanup.js', 'seed/test-fixtures.js']) assert.match(read(f), /assertNotProduction\(/, f);
  assert.match(read('seed-demo-users.js'), /process\.exit\(1\);/, 'retired production seeder must refuse');
  assert.doesNotMatch(admin, /ALLOW_PRODUCTION_SEED/, 'no production override for bulk/test seeders');
  for (const f of ['scripts/production/seed-community.mjs', 'scripts/production/seed-posts.mjs']) {
    const src = read(f);
    assert.match(src, /confirmProduction\(REFS\.production\)/, `${f}: production writes need the typed confirmation`);
    assert.match(src, /process\.stdin\.isTTY/, `${f}: never from a pipe or CI`);
  }
});

test('no location tracking: the app never asks for GPS (district is chosen by the user)', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies?.['@capacitor/geolocation'], undefined);
  for (const f of readdirSync(join(root, 'src'), { recursive: true }).filter((x) => /\.(jsx?|mjs)$/.test(x))) {
    assert.doesNotMatch(readFileSync(join(root, 'src', f), 'utf8'), /Geolocation|getCurrentPosition/, f);
  }
  assert.doesNotMatch(readFileSync(join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8'), /LOCATION/);
});

test('admin broadcasts can always be closed (no forced "Leave App" screen)', () => {
  const app = readFileSync(join(root, 'src/App.jsx'), 'utf8');
  const modal = app.slice(app.indexOf('{broadcastModalData && ('));
  assert.doesNotMatch(modal.slice(0, modal.indexOf('\n      )}')), /exitApp\(|Leave App/);   // (back twice to exit is fine)
  assert.doesNotMatch(app, /document\.body\.innerHTML/);
  assert.match(modal, /Close/);
  assert.doesNotMatch(readFileSync(join(root, 'admin-dashboard/src/pages/Broadcasts.jsx'), 'utf8'), /setActionType\('forced'\)/);
});

test('no browser alert()/confirm() popups in the admin site or the app pages', () => {
  for (const dir of ['admin-dashboard/src', 'src/pages', 'src/components']) {
    for (const f of readdirSync(join(root, dir), { recursive: true }).filter((x) => /\.jsx?$/.test(x))) {
      const src = readFileSync(join(root, dir, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      assert.doesNotMatch(src, /(?<![\w.])alert\(|window\.confirm\(/, `${dir}/${f}`);
    }
  }
});

test('resumes go through the server check: no direct application insert, the path is always .pdf', () => {
  const src = read('src/pages/UserProfile.jsx');
  assert.doesNotMatch(src, /from\('expert_applications'\)\s*\.insert\(/);
  assert.doesNotMatch(src, /cvFile\.name\.split\('\.'\)/);
  assert.match(src, /functions\.invoke\('submit-resume'/);
  assert.match(src, /_cv\.pdf`/);
  assert.match(read('src/components/ResumeUploadDialog.jsx'), /action: 'replace'/);
});

test('admin: no District Overview card; unban and role changes go through server functions', () => {
  assert.doesNotMatch(read('admin-dashboard/src/pages/Dashboard.jsx'), /district-stats|admin_district_stats/);
  const users = read('admin-dashboard/src/pages/Users.jsx');
  assert.doesNotMatch(users, /from\('profiles'\)\s*\.update\(/);
  assert.match(users, /rpc\('unban_user'/);
  assert.match(read('admin-dashboard/src/components/RemoveExpertDialog.jsx'), /admin_expert_removal_preview[\s\S]*p_cancel_upcoming/);
});

test('branding: launcher icons, logo PNGs and favicons come from logo.svg', () => {
  assert.ok(existsSync(join(root, 'logo.svg')));
  for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) for (const f of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground']) {
    assert.ok(existsSync(join(root, `android/app/src/main/res/mipmap-${d}/${f}.png`)), `${d}/${f}`);
  }
  assert.equal(read('public/favicon.svg'), read('logo.svg'));
  assert.equal(read('admin-dashboard/public/favicon.svg'), read('logo.svg'));
  assert.match(read('admin-dashboard/index.html'), /rel="icon"[^>]*favicon\.svg/);
});
