#!/usr/bin/env python3
"""Signed-in smoke test of the STAGING Android app (com.agroconnect.app.staging) on a connected emulator/device.
Reads synthetic account details from .env.staging; never prints passwords. Never opens, clears or screenshots the
production app (it may hold a real signed-in account); only checks from package data that it was not replaced.
Restores the device's rotation settings and does not clear its log, so it is safe on a personal phone.
  ANDROID_SERIAL=<serial> python3 -I scripts/staging/device-smoke.py
Screenshots: appium-results/2026-10-25_staging_device/ (01-09 base run, 10-20 change request 2026-10-25)
"""
import json, os, re, signal, subprocess, sys, time, xml.etree.ElementTree as ET

# a kill (SIGTERM) must still run the finally blocks that restore the device's rotation settings
signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ADB = os.path.expanduser('~/Library/Android/sdk/platform-tools/adb')
PKG, PROD_PKG = 'com.agroconnect.app.staging', 'com.agroconnect.app'
OUT = os.path.join(ROOT, 'appium-results', '2026-10-25_staging_device')
os.makedirs(OUT, exist_ok=True)
env = dict(l.split('=', 1) for l in open(os.path.join(ROOT, '.env.staging')).read().splitlines() if re.match(r'^[A-Z0-9_]+=', l))
fx = lambda n: f"agroconnect-stg-{n}-{env['FIXTURE_EMAIL_TOKEN']}@{env['FIXTURE_EMAIL_DOMAIN']}"
results = []
T0 = None  # device time at start; logcat is read from here instead of being cleared

def adb(*a, check=True):
    return subprocess.run([ADB, *a], capture_output=True, text=True, check=check).stdout

def shot(name):
    with open(os.path.join(OUT, f'{name}.png'), 'wb') as f:
        f.write(subprocess.run([ADB, 'exec-out', 'screencap', '-p'], capture_output=True, check=True).stdout)

SIGNED_IN = r'Catch Up.*Profile|Profile.*Catch Up'  # bottom nav, only rendered for a signed-in user
anr_dismissed = 0

def nodes():
    """UI tree of the screen. A system "isn't responding" dialog (emulator under load, not the app under test) is
    answered with Wait and counted, so it can neither fail nor satisfy a check."""
    global anr_dismissed
    for _ in range(10):
        adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml', check=False)
        ns = list(ET.fromstring(adb('shell', 'cat', '/sdcard/ui.xml')).iter('node'))
        anr = next((n for n in ns if "isn't responding" in (n.get('text') or '')), None)
        screen = ' '.join((n.get('text') or '') for n in ns)
        if anr is None and re.search(r'[Ss]ave password|[Ss]ave to Google', screen):
            decline = next((n for n in ns if (n.get('text') or '') in ('Not now', 'No thanks', 'Never')), None)
            if decline is not None:  # system autofill offer: always declined, the fixture password is never saved
                adb('shell', 'input', 'tap', *center(decline)); time.sleep(1.5); continue
        if anr is None:
            return ns
        if 'agroconnect' in (anr.get('text') or '').lower():
            raise AssertionError(f"app ANR: {anr.get('text')}")
        wait = next((n for n in ns if (n.get('text') or '') == 'Wait'), None)
        if wait is not None:
            adb('shell', 'input', 'tap', *center(wait)); anr_dismissed += 1
        time.sleep(3)
    raise AssertionError('system ANR dialog kept reappearing')

SECRETS = [v for k, v in env.items() if 'PASSWORD' in k and v]

def redact(msg):
    for v in SECRETS: msg = msg.replace(v, '<redacted>')
    return msg

def texts():
    # password inputs expose their value to the accessibility tree on some devices: never read them
    return ' | '.join(sorted({(n.get('text') or n.get('content-desc') or '').strip()
                              for n in nodes() if n.get('password') != 'true'} - {''}))

def center(n):
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', n.get('bounds')))
    return str((x1 + x2) // 2), str((y1 + y2) // 2)

def tap_where(pred, what, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        for n in nodes():
            if pred(n):
                adb('shell', 'input', 'tap', *center(n)); return True
        time.sleep(1)
    raise AssertionError(f'not found: {what}')

def wait_text(pattern, timeout=25):
    end = time.time() + timeout
    while time.time() < end:
        t = texts()
        if re.search(pattern, t): return t
        time.sleep(1.5)
    raise AssertionError(redact(f'text /{pattern}/ not visible; saw: {t[:300]}'))

def check(name, fn):
    try:
        fn(); results.append((name, 'PASS', ''))
    except Exception as e:  # noqa: BLE001 — report and continue
        results.append((name, 'FAIL', redact(str(e))[:300]))
        try: shot(f'FAIL_{len(results):02d}')
        except Exception: pass
    print(f'{results[-1][1]:5} {name}{"  -- " + results[-1][2] if results[-1][2] else ""}', flush=True)

def type_into(index, value):
    tap_where(lambda n, i=[0]: n.get('class') == 'android.widget.EditText' and (i.__setitem__(0, i[0] + 1) or i[0] == index + 1), f'input #{index}')
    time.sleep(0.8)
    adb('shell', 'input', 'text', value.replace('!', '\\!'))
    adb('shell', 'input', 'keyevent', '111'); time.sleep(0.8)

def fresh_login(name, password):
    adb('shell', 'am', 'force-stop', PKG); adb('shell', 'pm', 'clear', PKG)
    adb('shell', 'am', 'start', '-W', '-n', f'{PKG}/com.agroconnect.app.MainActivity')
    wait_text(r'Welcome Back', 40)
    type_into(0, fx(name)); type_into(1, password)
    for _ in range(2):  # a tap that lands while the keyboard is closing is sometimes lost: retry once
        tap_where(lambda n: (n.get('text') or '') == 'Log In', 'Log In button')
        end = time.time() + 15
        # done once signed in, or once the app answered (admin refusal / error message)
        done = lambda t: 'Welcome Back' not in t or re.search(r'Administrators must|[Ii]nvalid', t)
        while time.time() < end and not done(texts()): time.sleep(1.5)
        if done(texts()): return

SCREEN_H = int(re.findall(r'(\d+)x(\d+)', adb('shell', 'wm', 'size'))[-1][1])
in_bottom_bar = lambda n: int(re.findall(r'\d+', n.get('bounds'))[1]) > SCREEN_H * 0.85

# Bottom bar is icons only (2026-10-25); each item keeps its label as aria-label (content-desc). Some WebViews merge
# the icon ligature into the text ("personProfile"), so a suffix match on the text is kept as a fallback.
nav = lambda label: tap_where(lambda n: in_bottom_bar(n) and any((n.get(k) or '').endswith(label) and len(n.get(k) or '') <= len(label) + 20
                                            for k in ('content-desc', 'text')), f'nav {label}')
tap_text = lambda pattern, what=None: tap_where(
    lambda n: any(re.search(pattern, (n.get(k) or '').strip()) for k in ('text', 'content-desc')), what or pattern)
back = lambda: (adb('shell', 'input', 'keyevent', '4'), time.sleep(1.5))

def farmer():
    fresh_login('user1', env['FIXTURE_PASSWORD'])
    wait_text(SIGNED_IN, 40); shot('01_farmer_feed')
    nav('Profile'); wait_text(r'Test User 1 \(Farmer\)'); shot('02_farmer_profile')
    nav('Catch Up'); wait_text(r'Available Verified Experts'); wait_text(r'Dr\. Ramesh Expert'); shot('03_farmer_catchup')
    t = texts(); assert 'Manage Availability' not in t, 'farmer sees expert tools'

def persistence():
    adb('shell', 'am', 'force-stop', PKG); adb('shell', 'am', 'start', '-W', '-n', f'{PKG}/com.agroconnect.app.MainActivity')
    t = wait_text(r'Welcome Back|' + SIGNED_IN, 40)
    assert 'Welcome Back' not in t, 'session lost after relaunch'
    shot('04_farmer_relaunch_session')

def rotation_and_back():
    saved = [adb('shell', 'settings', 'get', 'system', k).strip() for k in ('accelerometer_rotation', 'user_rotation')]
    try:
        adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0'); adb('shell', 'settings', 'put', 'system', 'user_rotation', '1')
        time.sleep(3); wait_text(SIGNED_IN); shot('05_farmer_landscape')
    finally:  # put the device back exactly as it was
        adb('shell', 'settings', 'put', 'system', 'user_rotation', saved[1])
        adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', saved[0])
    time.sleep(2)
    adb('shell', 'input', 'keyevent', '4'); time.sleep(2)
    focus = adb('shell', 'dumpsys', 'window')
    assert re.search(r'mCurrentFocus=.*' + re.escape(PKG), focus), 'app left the foreground on a single back press'

def expert():
    fresh_login('expert1', env['FIXTURE_PASSWORD'])
    wait_text(SIGNED_IN, 40)
    nav('Catch Up'); wait_text(r'Expert Catch Up'); shot('06_expert_catchup')
    tap_where(lambda n: re.search(r'Manage Availability|Set Your Availability', n.get('text') or ''), 'availability')
    wait_text(r'Manage Availability'); shot('07_expert_availability')

def admin_redirect():
    fresh_login('admin', env['E2E_ADMIN_PASSWORD'])
    # the app has no admin UI: an Admin account is signed out and pointed at the admin website
    t = wait_text(r'Administrators must log in via the Admin Panel website', 40); shot('08_admin_redirected')
    assert not re.search(SIGNED_IN, t), 'admin got the farmer/expert app'


# ---- change request 2026-10-25 -------------------------------------------------------------------------------
def api(path, body=None, token=None, method=None):
    """Staging REST call as a synthetic account (for the temporary post), through curl so the system certificate
    store is used. Nothing secret is printed; the request body goes through stdin, not the command line."""
    url = env['STAGING_SUPABASE_URL'] + path
    assert 'ahkgvuewgbjyahbiehrx' in url, 'not staging'
    cmd = ['curl', '-sS', '--fail-with-body', '-X', method or ('POST' if body is not None else 'GET'), url,
           '-H', f"apikey: {env['STAGING_SUPABASE_ANON_KEY']}", '-H', 'Content-Type: application/json',
           '-H', 'Prefer: return=representation', '--data-binary', '@-']
    if token: cmd += ['-H', f'Authorization: Bearer {token}']
    r = subprocess.run(cmd, input=json.dumps(body) if body is not None else '', capture_output=True, text=True)
    if r.returncode: raise AssertionError(redact(f'API {path.split("?")[0]} failed: {r.stdout[:200]} {r.stderr[:200]}'))
    return json.loads(r.stdout) if r.stdout.strip() else None

def google_button():
    adb('shell', 'am', 'force-stop', PKG); adb('shell', 'pm', 'clear', PKG)
    adb('shell', 'am', 'start', '-W', '-n', f'{PKG}/com.agroconnect.app.MainActivity')
    wait_text(r'Welcome Back', 40)
    tap_text(r'Continue with Google')
    wait_text(r'Google sign-in is not available yet'); shot('10_login_google_not_enabled')
    tap_text(r'^Sign Up$'); wait_text(r'Continue with Google'); shot('11_signup_google_button')

def farmer_changes():
    fresh_login('user1', env['FIXTURE_PASSWORD'])
    wait_text(SIGNED_IN, 40)
    bar_text = [n.get('text') or '' for n in nodes() if in_bottom_bar(n)]
    assert not any(re.search(r'(Feed|Search|Catch Up|Chat|Profile)$', t) for t in bar_text), f'bottom bar shows text: {bar_text}'
    shot('12_bottom_bar_icons_only')

    nav('Profile'); wait_text(r'Edit Profile')
    t = texts(); assert 'Log Out' not in t and 'Become a Seller' not in t, 'menu items still on the profile page'
    tap_where(lambda n: (n.get('content-desc') or '') == 'Profile menu' or (n.get('text') or '') == 'menu', 'profile menu')
    t = wait_text(r'Become a Verified Expert')
    for item in ('Settings', 'Become a Seller', 'Log Out'): assert item in t, f'menu lacks {item}'
    assert 'Leave being an expert' not in t, 'farmer sees leave-expert'
    shot('13_farmer_profile_menu'); back()

    nav('Catch Up'); wait_text(r'Dr\. Ramesh Expert')
    t = wait_text(r'Available:'); assert 'Select a Date' not in t, 'calendar open before Book'
    shot('14_catchup_expert_dates')
    tap_text(r'^Book Consultation$'); wait_text(r'Select a Date')
    shot('15_catchup_calendar')
    # a highlighted day reads "26₹500" (or "₹500" on its own, depending on the WebView)
    tap_where(lambda n: re.fullmatch(r'(\d{1,2})?\s*₹\d+', (n.get('text') or '').strip()), 'highlighted date')
    t = wait_text(r'Choose a time'); assert re.search(r'Date: ', t), 'date not fixed in the dialog'
    assert not any((n.get('class') or '').endswith('EditText') and re.search(r'date|time', (n.get('text') or '') + (n.get('hint') or ''), re.I) for n in nodes()), 'date/time field is editable'
    shot('16_catchup_times_for_date')
    tap_text(r'^Cancel$')

    tap_text(r'^Dr\. Ramesh Expert$'); wait_text(r"Dr\. Ramesh Expert's Posts")
    shot('17_expert_profile_from_catchup'); back()

def own_avatar():
    tok = api('/auth/v1/token?grant_type=password', {'email': fx('user1'), 'password': env['FIXTURE_PASSWORD']})
    uid, access = tok['user']['id'], tok['access_token']
    post = api('/rest/v1/posts', {'user_id': uid, 'caption': 'Phone test: own avatar (removed after the test)'}, access)[0]
    try:
        adb('shell', 'am', 'force-stop', PKG); adb('shell', 'am', 'start', '-W', '-n', f'{PKG}/com.agroconnect.app.MainActivity')
        wait_text(SIGNED_IN, 40); nav('Feed'); wait_text(r'Phone test: own avatar')
        tap_text(r'^Test User 1 \(Farmer\)$')
        t = wait_text(r'Edit Profile|Connect')
        assert 'Edit Profile' in t and not re.search(r'(^| \| )Connect( \||$)', t), 'own avatar opened the other-user view'
        shot('18_own_avatar_opens_own_profile')
    finally:
        api(f"/rest/v1/posts?id=eq.{post['id']}", None, access, method='DELETE')

def expert_menu():
    fresh_login('expert1', env['FIXTURE_PASSWORD'])
    wait_text(SIGNED_IN, 40)
    nav('Profile'); wait_text(r'Edit Profile')
    tap_where(lambda n: (n.get('content-desc') or '') == 'Profile menu' or (n.get('text') or '') == 'menu', 'profile menu')
    wait_text(r'Leave being an expert'); shot('19_expert_profile_menu')
    # the row's text can start with the icon ligature ('logoutLeave being an expert...')
    tap_text(r'Leave being an expert'); wait_text(r'Why are you leaving\?')
    shot('20_leave_expert_dialog')
    tap_text(r'^Cancel$')  # not submitted: expert1 must stay an expert (full loop is tested in staging-workflows)

def prod_info():
    out = adb('shell', 'dumpsys', 'package', PROD_PKG)
    return re.findall(r'(?:versionName|lastUpdateTime)=\S+(?: \S+)?', out)[:2]

PROD_BEFORE = prod_info()

def production_untouched():
    assert PROD_BEFORE, f'{PROD_PKG} is not installed on this device'
    assert prod_info() == PROD_BEFORE, f'production app changed: {PROD_BEFORE} -> {prod_info()}'
    print(f'      production app unchanged: {", ".join(PROD_BEFORE)}')

T0 = adb('shell', "date '+%m-%d %H:%M:%S.000'").strip()
for name, fn in [('farmer: login, feed, profile, Catch Up lists expert1, no expert tools', farmer),
                 ('session survives force-stop + relaunch', persistence),
                 ('rotation renders; single back press keeps app open', rotation_and_back),
                 ('expert1: Catch Up in expert mode, availability editor', expert),
                 ('admin account is sent to the admin website', admin_redirect),
                 ('Google button on Log In + Sign Up; explains while the provider is off', google_button),
                 ('farmer: icons-only bar, profile ☰ menu, Catch Up dates/calendar/times, expert profile', farmer_changes),
                 ('own avatar on own post opens own profile', own_avatar),
                 ('expert: ☰ menu has Leave being an expert with reason dialog', expert_menu),
                 ('production app not replaced (same version + lastUpdateTime)', production_untouched)]:
    check(name, fn)
crash = adb('logcat', '-d', '-T', T0, check=False)
fatal = [l for l in crash.splitlines() if 'FATAL EXCEPTION' in l and 'agroconnect' in l]
results.append(('no FATAL EXCEPTION in logcat', 'PASS' if not fatal else 'FAIL', fatal[0][:200] if fatal else ''))
print(f'{results[-1][1]:5} no FATAL EXCEPTION in logcat')
print(f'(system ANR dialogs dismissed: {anr_dismissed})')
sys.exit(0 if all(r[1] == 'PASS' for r in results) else 1)
