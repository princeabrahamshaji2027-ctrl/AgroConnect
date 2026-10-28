#!/usr/bin/env python3
"""Reads every visible text on the main screens of the STAGING Android app (com.agroconnect.app.staging) as the test
farmer and the test expert, and reports anything that looks like test data ("Test User", "E2E", "demo", "lorem",
"staging", numbered users ...). Plan CLEANUP_AND_FEED_PLAN_2026-10-28.md, C5. Never opens the production app; never
reads password fields; never prints passwords.
  ANDROID_SERIAL=<serial> python3 -I scripts/staging/visible-text-audit.py <screenshot-dir>
Exit code 0 = nothing found."""
import json, os, re, subprocess, sys, time, xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ADB = os.path.expanduser('~/Library/Android/sdk/platform-tools/adb')
PKG = 'com.agroconnect.app.staging'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'test-results', 'visible-text-audit')
os.makedirs(OUT, exist_ok=True)
env = dict(l.split('=', 1) for l in open(os.path.join(ROOT, '.env.staging')).read().splitlines() if re.match(r'^[A-Z0-9_]+=', l))
NAMES = {k: v['name'] for k, v in json.load(open(os.path.join(ROOT, 'tests', 'fixtures', 'staging-accounts.json')))['accounts'].items()}
fx = lambda key: f"agroconnect-stg-{key}-{env['FIXTURE_EMAIL_TOKEN']}@{env['FIXTURE_EMAIL_DOMAIN']}"
SUSPICIOUS = re.compile(r'test ?user|\be2e\b|\bdemo\b|lorem|placeholder|dummy|\bstaging\b|delete me|user ?\d\b|farmer ?\d\b|'
                        r'ramesh expert|phone (flow|hello|cancel)|\btest\b', re.I)
# the app's own words that contain a flagged token legitimately (none expected; listed here if ever needed)
ALLOWED = []

def adb(*a, check=True):
    return subprocess.run([ADB, *a], capture_output=True, text=True, check=check).stdout

def nodes():
    for _ in range(6):
        adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml', check=False)
        try:
            return list(ET.fromstring(adb('shell', 'cat', '/sdcard/ui.xml')).iter('node'))
        except ET.ParseError:
            time.sleep(2)
    return []

def texts():
    seen = []
    for n in nodes():
        if n.get('password') == 'true' or n.get('package') not in (PKG, None):
            continue
        t = (n.get('text') or n.get('content-desc') or '').strip()
        if t and t not in seen:
            seen.append(t)
    return seen

def center(n):
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', n.get('bounds')))
    return str((x1 + x2) // 2), str((y1 + y2) // 2)

def tap(pred, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        for n in nodes():
            if pred(n):
                adb('shell', 'input', 'tap', *center(n)); time.sleep(2.5); return True
        time.sleep(1)
    return False

def wait(pattern, timeout=40):
    end = time.time() + timeout
    while time.time() < end:
        adb('shell', 'input', 'keyevent', '59', check=False)   # keep the screen on (Shift = user activity)
        if re.search(pattern, ' | '.join(texts())):
            return True
        time.sleep(1.5)
    return False

SCREEN_H = int(re.findall(r'(\d+)x(\d+)', adb('shell', 'wm', 'size'))[-1][1])
def nav(label):
    return tap(lambda n: int(re.findall(r'\d+', n.get('bounds'))[1]) > SCREEN_H * 0.85
               and any((n.get(k) or '').endswith(label) and len(n.get(k) or '') <= len(label) + 20 for k in ('content-desc', 'text')))

def login(key, password):
    adb('shell', 'am', 'force-stop', PKG); adb('shell', 'pm', 'clear', PKG)
    adb('shell', 'am', 'start', '-W', '-n', f'{PKG}/com.agroconnect.app.MainActivity')
    if not wait(r'Welcome Back', 40):
        raise SystemExit('login screen did not appear')
    for i, value in enumerate([fx(key), password]):
        tap(lambda n, c=[0]: n.get('class') == 'android.widget.EditText' and (c.__setitem__(0, c[0] + 1) or c[0] == i + 1))
        adb('shell', 'input', 'text', value.replace('!', '\\!')); adb('shell', 'input', 'keyevent', '111'); time.sleep(0.8)
    tap(lambda n: (n.get('text') or '') == 'Log In')
    if not wait(r'Catch Up.*Profile|Profile.*Catch Up', 40):
        raise SystemExit(f'{key}: sign-in did not finish')

found, visited = [], []
def capture(who, screen):
    time.sleep(3)
    ts = texts()
    with open(os.path.join(OUT, f'{who}-{screen}.png'), 'wb') as f:
        f.write(subprocess.run([ADB, 'exec-out', 'screencap', '-p'], capture_output=True).stdout)
    hits = [t for t in ts if SUSPICIOUS.search(t) and t not in ALLOWED]
    visited.append((who, screen, len(ts)))
    for h in hits:
        found.append((who, screen, h[:120]))
    print(f"{'FOUND' if hits else 'clean'}  {who:8} {screen:14} {len(ts):3} texts" + (f"  -> {hits[:3]}" if hits else ''), flush=True)

for key, pw in [('user1', env['FIXTURE_PASSWORD']), ('expert1', env['FIXTURE_PASSWORD'])]:
    login(key, pw)
    capture(key, 'feed')
    nav('Search'); capture(key, 'search')
    nav('Catch Up'); capture(key, 'catch-up')
    nav('Chat'); capture(key, 'chat')
    nav('Profile'); capture(key, 'profile')
    if tap(lambda n: re.search(r'notifications', (n.get('content-desc') or '') + (n.get('text') or ''), re.I) is not None, 10):
        capture(key, 'notifications')

print(f"\nscreens: {len(visited)}; names shown for the test accounts: {', '.join(NAMES.values())}")
print('RESULT:', 'nothing that looks like test data' if not found else f'{len(found)} suspicious text(s)')
sys.exit(1 if found else 0)
