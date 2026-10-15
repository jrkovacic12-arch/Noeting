#!/usr/bin/env python3
"""Exercise the installed release app on an isolated AOSP emulator via ADB.

Never accepts a physical device. Use a fresh AOSP AVD and the verified x86_64 APK,
then run with --serial emulator-5554. An explicit --reset-emulator-data clears
only synthetic app fixtures on that emulator. Evidence stays in artifacts.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import shlex
import sqlite3
import subprocess
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--serial', required=True)
parser.add_argument('--resume-after-pins', action='store_true', help='Resume saved same-APK evidence after validating the pin fixtures.')
parser.add_argument('--adb', default='/workspace/.android-sdk/platform-tools/adb')
parser.add_argument('--reset-emulator-data', action='store_true', help='Clear only this isolated emulator app\'s synthetic fixtures before running.')
args = parser.parse_args()
PACKAGE = 'com.noeting.app'
output = ROOT / 'artifacts/android-smoke'
output.mkdir(parents=True, exist_ok=True)
report = {'status': 'running', 'scope': 'Native Android emulator; physical-device acceptance remains separate.', 'checks': []}


def adb(*words, timeout=60, binary=False):
    return subprocess.run([args.adb, '-s', args.serial, *words], check=True,
                          capture_output=True, text=not binary, timeout=timeout).stdout


def shell(command, timeout=60):
    return adb('shell', command, timeout=timeout).strip()


def check(name, condition=True):
    if not condition:
        raise AssertionError(name)
    report['checks'].append(name)
    print('PASS:', name, flush=True)


def tree():
    shell('uiautomator dump /sdcard/noeting-smoke.xml', timeout=90)
    xml = adb('exec-out', 'cat', '/sdcard/noeting-smoke.xml')
    (output / 'latest-layout.xml').write_text(xml)
    return ET.fromstring(xml)


def find(label, timeout=120):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            for node in tree().iter('node'):
                if label in (node.get('content-desc'), node.get('text')):
                    return node
        except (subprocess.SubprocessError, ET.ParseError):
            pass
        time.sleep(1)
    raise AssertionError(f'UI label not found: {label}')


def tap(label):
    deadline = time.monotonic() + 120
    while True:
        node = find(label)
        if node.get('enabled') != 'false':
            break
        if time.monotonic() >= deadline:
            raise AssertionError(f'Control stayed disabled: {label}')
        time.sleep(1)
    left, top, right, bottom = map(int, re.findall(r'\d+', node.get('bounds')))
    shell(f'input tap {(left + right) // 2} {(top + bottom) // 2}')


def type_text(text):
    # Only ASCII fixture text is sent through Android's stock input command.
    shell('input text ' + shlex.quote(text.replace(' ', '%s')))


def capture(text, task=False):
    tap('+ Add task' if task else 'Capture')
    find('Capture text')
    if task:
        check('Add task preselects Task', find('Task').get('checked') == 'true')
    tap('Capture text')
    for index, line in enumerate(text.split('\n')):
        if index:
            shell('input keyevent 66')
        type_text(line)
    shell('input keyevent 4')  # Dismiss the keyboard, preserving the draft.
    tap('Save & close')
    find('Make room for what matters')


def launch():
    shell(f'am start -W -n {PACKAGE}/.MainActivity', timeout=120)
    find('Make room for what matters')


def restart():
    shell(f'am force-stop {PACKAGE}')
    launch()


def read_database(name):
    shell(f'am force-stop {PACKAGE}')
    # AOSP userdebug emulator permits adb root, unlike a production phone.
    adb('root')
    adb('wait-for-device', timeout=120)
    remote = f'/data/user/0/{PACKAGE}/files/SQLite/noeting.db'
    path = output / f'{name}.db'
    adb('pull', remote, str(path))
    with sqlite3.connect(f'file:{path}?mode=ro', uri=True) as db:
        check(f'{name}: SQLite integrity', db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok')
        check(f'{name}: no foreign-key violations', not db.execute('PRAGMA foreign_key_check').fetchall())
        return {
            'entries': db.execute('SELECT kind, original_text FROM entries ORDER BY rowid').fetchall(),
            'tasks': db.execute('SELECT title, status, pinned FROM tasks ORDER BY rowid').fetchall(),
        }


try:
    check('Target is an emulator', shell('getprop ro.kernel.qemu') == '1')
    if args.resume_after_pins and args.reset_emulator_data:
        raise AssertionError('Do not reset fixtures when resuming')
    # Root is only for protected OS broadcasts and inspecting the synthetic DB.
    adb('root')
    adb('wait-for-device', timeout=120)
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline:
        try:
            if shell('getprop sys.boot_completed', timeout=15) == '1' and shell('service check settings', timeout=15).endswith(': found'):
                break
        except subprocess.SubprocessError:
            pass
        time.sleep(3)
    else:
        raise AssertionError('Android framework did not become ready within 15 minutes')
    report['device'] = {key: shell(f'getprop {prop}') for key, prop in {
        'model': 'ro.product.model', 'android': 'ro.build.version.release',
        'api': 'ro.build.version.sdk', 'abi': 'ro.product.cpu.abi', 'fingerprint': 'ro.build.fingerprint',
    }.items()}
    apk = ROOT / 'artifacts/noeting-m1-android-x86_64-test.apk'
    report['apkSha256'] = hashlib.sha256(apk.read_bytes()).hexdigest()
    installed = shell(f'pm path {PACKAGE}')
    installed_hash = shell('sha256sum ' + shlex.quote(installed.removeprefix('package:'))) if installed else ''
    if not installed_hash.startswith(report['apkSha256']):
        check('Verified release APK installs', 'Success' in adb('install', '-r', str(apk), timeout=300))
    else:
        check('Installed release APK matches verified artifact')
    if args.reset_emulator_data:
        check('Isolated emulator fixtures reset', shell(f'pm clear {PACKAGE}', timeout=120) == 'Success')
    shell('wm size 540x1600')
    shell('wm density 210')
    shell('settings put global window_animation_scale 0')
    shell('settings put global transition_animation_scale 0')
    shell('settings put global animator_duration_scale 0')
    shell('settings put secure show_ime_with_hard_keyboard 1')
    shell('input keyevent 82')
    original = '  Native thought\nwith a second line.  '
    if args.resume_after_pins:
        prior = json.loads((output / 'report.json').read_text())
        if prior.get('apkSha256') != report['apkSha256'] or prior.get('device') != report['device'] or 'Completing a pinned task releases a pin' not in prior.get('checks', []):
            raise AssertionError('No matching prior pin-check evidence to resume')
        report['checks'] = prior['checks'] + report['checks']
        report['resumedAfterPins'] = True
        fixture = read_database('resume-fixtures')
        check('Resumed fixtures match prior native pin checks', fixture['entries'] == [
            ('note', original), ('task', 'First focus'), ('task', 'Second focus'),
            ('task', 'Third focus'), ('task', 'Fourth focus'),
        ] and fixture['tasks'] == [
            ('First focus', 'pending', 1), ('Second focus', 'completed', 0),
            ('Third focus', 'pending', 1), ('Fourth focus', 'pending', 1),
        ])
    else:
        launch()
        check('Standalone release launches without Metro or Expo Go')
        find('No pending tasks')
        original = '  Native thought\nwith a second line.  '
        capture(original)
        find('0 open · 0 completed · 1 saved entries')
        find('No pending tasks')
        check('Note capture closes and creates no task')
        for title in ['First focus', 'Second focus', 'Third focus', 'Fourth focus']:
            capture(title, task=True)
            find('Complete ' + title)
        for title in ['First focus', 'Second focus', 'Third focus']:
            tap('Pin ' + title)
            find('Unpin ' + title)
        check('Fourth pin is disabled', find('Pin Fourth focus').get('enabled') == 'false')
        tap('Complete Second focus')
        find('Pin Fourth focus')
        tap('Pin Fourth focus')
        find('Unpin Fourth focus')
        check('Completing a pinned task releases a pin')
    if int(report['device']['api']) >= 30:
        shell('cmd connectivity airplane-mode enable')
    else:
        shell('settings put global airplane_mode_on 1')
        shell('am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true')
    shell('svc wifi disable')
    shell('svc data disable')
    check('Airplane mode enabled', shell('settings get global airplane_mode_on') == '1')
    restart()
    for title in ['First focus', 'Third focus', 'Fourth focus']:
        find('Unpin ' + title)
    find('3 open · 1 completed · 5 saved entries')
    check('Notes and task pins survive force-stop/relaunch offline')
    capture('Offline native note')
    restart()
    find('3 open · 1 completed · 6 saved entries')
    tap('Library')
    find('Your saved words')
    tap('Notes')
    tap('Search saved entries')
    type_text('native')
    shell('input keyevent 4')
    find('2 of 6 saved entries · Newest first')
    check('Native Library searches and filters saved Notes offline')
    (output / 'library.png').write_bytes(adb('exec-out', 'screencap', '-p', binary=True))
    tap('Today')
    before = read_database('before-reboot')
    check('Native SQLite preserves exact multiline whitespace', ('note', original) in before['entries'])
    check('Each accepted task is stored once', len(before['tasks']) == 4)
    check('Completion and three pins are durable', before['tasks'] == [
        ('First focus', 'pending', 1), ('Second focus', 'completed', 0),
        ('Third focus', 'pending', 1), ('Fourth focus', 'pending', 1),
    ])
    adb('reboot')
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline:
        try:
            if shell('getprop sys.boot_completed', timeout=15) == '1':
                break
        except subprocess.SubprocessError:
            pass
        time.sleep(3)
    else:
        raise AssertionError('Emulator did not finish rebooting within 15 minutes')
    check('Airplane mode persists after emulator reboot', shell('settings get global airplane_mode_on') == '1')
    launch()
    find('3 open · 1 completed · 6 saved entries')
    for title in ['First focus', 'Third focus', 'Fourth focus']:
        find('Unpin ' + title)
    after = read_database('after-reboot')
    check('All native records survive full emulator reboot offline', after == before)
    report['status'] = 'passed'
except Exception as error:
    report['status'] = 'failed'
    report['error'] = str(error) + ('; ' + str(error.stderr) if isinstance(error, subprocess.CalledProcessError) else '')
    raise
finally:
    (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
