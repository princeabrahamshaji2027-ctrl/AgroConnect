#!/usr/bin/env python3
"""Signed-in smoke test of the STAGING Android app (com.agroconnect.app.staging) on a connected emulator/device.
Reads synthetic account details from .env.staging; never prints passwords. Never opens, clears or screenshots the
production app (it may hold a real signed-in account); only checks from package data that it was not replaced.
Restores the device's rotation settings and does not clear its log, so it is safe on a personal phone.
  ANDROID_SERIAL=<serial> python3 -I scripts/staging/device-smoke.py
Screenshots: appium-results/2026-10-25_staging_device/
"""
import os, re, signal, subprocess, sys, time, xml.etree.ElementTree as ET

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

def texts():
    return ' | '.join(sorted({(n.get('text') or n.get('content-desc') or '').strip() for n in nodes()} - {''}))

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
    raise AssertionError(f'text /{pattern}/ not visible; saw: {t[:300]}')

def check(name, fn):
    try:
        fn(); results.append((name, 'PASS', ''))
    except Exception as e:  # noqa: BLE001 — report and continue
        results.append((name, 'FAIL', str(e)[:300]))
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
    tap_where(lambda n: (n.get('text') or '') == 'Log In', 'Log In button')

# some WebViews merge the Material icon ligature into the label ("personProfile"), so match the label as a suffix
nav = lambda label: tap_where(lambda n: any((n.get(k) or '').endswith(label) and len(n.get(k) or '') <= len(label) + 20
                                            for k in ('content-desc', 'text')), f'nav {label}')

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
                 ('production app not replaced (same version + lastUpdateTime)', production_untouched)]:
    check(name, fn)
crash = adb('logcat', '-d', '-T', T0, check=False)
fatal = [l for l in crash.splitlines() if 'FATAL EXCEPTION' in l and 'agroconnect' in l]
results.append(('no FATAL EXCEPTION in logcat', 'PASS' if not fatal else 'FAIL', fatal[0][:200] if fatal else ''))
print(f'{results[-1][1]:5} no FATAL EXCEPTION in logcat')
print(f'(system ANR dialogs dismissed: {anr_dismissed})')
sys.exit(0 if all(r[1] == 'PASS' for r in results) else 1)
