#!/usr/bin/env python3
"""Upgrade the isolated legacy AOSP emulator without clearing its saved data."""
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
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--serial', required=True)
a = p.parse_args()
ADB = '/workspace/.android-sdk/platform-tools/adb'
PACKAGE = 'com.noeting.app'
OUT = ROOT / 'artifacts/android-v03'
OUT.mkdir(parents=True, exist_ok=True)
report = {'status':'running', 'checks':[], 'scope':'AOSP emulator upgrade and native UI; physical phone acceptance remains pending.'}

def adb(*words, timeout=90, binary=False):
    return subprocess.run([ADB,'-s',a.serial,*words], check=True, capture_output=True, text=not binary, timeout=timeout).stdout

def shell(command, timeout=90):
    return adb('shell',command,timeout=timeout).strip()

def check(name, condition=True):
    if not condition: raise AssertionError(name)
    report['checks'].append(name)
    print('PASS:',name,flush=True)

def wait_ready():
    deadline=time.monotonic()+900
    while time.monotonic()<deadline:
        try:
            if shell('getprop sys.boot_completed',15)=='1' and shell('service check settings',15).endswith(': found'): return
        except subprocess.SubprocessError: pass
        time.sleep(3)
    raise AssertionError('Android did not finish booting')

def tree():
    shell('uiautomator dump /sdcard/noeting-v03.xml')
    xml=adb('exec-out','cat','/sdcard/noeting-v03.xml')
    (OUT/'layout.xml').write_text(xml)
    return ET.fromstring(xml)

def find(label, enabled=False):
    deadline=time.monotonic()+180
    attempts=0
    while time.monotonic()<deadline:
        nodes=list(tree().iter('node'))
        # Software emulation can produce a system-only startup ANR.
        if any(n.get('text')=="System UI isn't responding" for n in nodes):
            for n in nodes:
                if n.get('text')=='Wait': touch(n);report['systemUiWaitUsed']=True
        for n in nodes:
            if label in [n.get('text'),n.get('content-desc')] and (not enabled or n.get('enabled')=='true'):
                return n
        # Scan the scrollable content in both directions. No fixed button coords.
        if attempts%5==0: shell('input swipe 270 400 270 1200 400')
        elif attempts%5 in (1,2,3): shell('input swipe 270 1200 270 400 400')
        else: shell('input swipe 270 400 270 1200 400')
        attempts+=1
        time.sleep(1)
    raise AssertionError('UI label not found: '+label)

def touch(n):
    x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')))
    shell(f'input tap {(x1+x2)//2} {(y1+y2)//2}')

footer_anchor = None

def tap(label):
    global footer_anchor
    node=find(label,True)
    if label=='Capture':
        bounds=list(map(int,re.findall(r'\d+',node.get('bounds'))))
        nodes=list(ET.parse(OUT/'layout.xml').iter('node'))
        right=max(int(re.findall(r'\d+',n.get('bounds'))[2]) for n in nodes if n.get('package')==PACKAGE)
        footer_anchor=(bounds,right)
    touch(node)

def tap_undo():
    # Stock `uiautomator dump` waits for idle up to 10 seconds, longer than the
    # eight-second Undo toast. Touch the transient button using measured footer
    # bounds/density, then verify its real state changes through UI and SQLite.
    bounds,right=footer_anchor
    x1,y1,x2,y2=bounds;density=(x2-x1)/52
    time.sleep(1)
    screenshot('undo-visible')
    shell(f'input tap {round(right-68*density)} {round((y1+y2)/2-74*density)}')
    report['undoTouchStrategy']='Measured footer bounds/density; avoid idle-waiting hierarchy for transient Undo.'


def type_text(text): shell('input text '+shlex.quote(text.replace(' ','%s')))

def snapshot(name):
    shell(f'am force-stop {PACKAGE}')
    adb('root');adb('wait-for-device')
    file=OUT/(name+'.db')
    adb('pull',f'/data/user/0/{PACKAGE}/files/SQLite/noeting.db',str(file))
    with sqlite3.connect(f'file:{file}?mode=ro',uri=True) as db:
        check(name+': SQLite integrity',db.execute('PRAGMA integrity_check').fetchone()[0]=='ok')
        check(name+': foreign-key integrity',not db.execute('PRAGMA foreign_key_check').fetchall())
        result={'version':db.execute('PRAGMA user_version').fetchone()[0],
                'entries':db.execute('SELECT * FROM entries ORDER BY rowid').fetchall(),
                'tasks':db.execute('SELECT * FROM tasks ORDER BY rowid').fetchall()}
        if result['version']>=2:
            result['links']=db.execute('SELECT * FROM thinking_links ORDER BY rowid').fetchall()
            result['selection']=db.execute('SELECT * FROM today_selection').fetchall()
        return result

def launch():
    shell(f'am start -W -n {PACKAGE}/.MainActivity',180)
    find('Make room for what matters')

def screenshot(name): (OUT/(name+'.png')).write_bytes(adb('exec-out','screencap','-p',binary=True))


def reveal_bars():
    shell('input swipe 270 450 270 1200 250')

def wait_text(label, expected):
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        node=find(label)
        if node.get('text')==expected:return node
        time.sleep(0.5)
    raise AssertionError(f'Field {label} did not update to {expected!r}')

def longpress(label):
    n=find(label,True); x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')))
    x=(x1+x2)//2;y=(y1+y2)//2
    shell(f'input swipe {x} {y} {x} {y} 650');find('Tools')

try:
    check('Only an isolated AOSP emulator is targeted',a.serial.startswith('emulator-') and shell('getprop ro.kernel.qemu')=='1')
    wait_ready()
    before=snapshot('before-upgrade')
    check('Existing schema v2 fixtures are present',before['version']==2 and len(before['entries'])>=6)
    apk=ROOT/'artifacts/noeting-m1-android-x86_64-test.apk'
    verify=json.loads((ROOT/'artifacts/noeting-v03-x86_64-verification.json').read_text())
    check('Verified v0.3.0 emulator APK selected',hashlib.sha256(apk.read_bytes()).hexdigest()==verify['sha256'] and verify['manifest']['versionName']=='0.3.0')
    adb('install','-r',str(apk),timeout=300)
    launch();upgraded=snapshot('after-upgrade')
    check('Upgrade retains every original entry column', [row[:5] for row in upgraded['entries']]==before['entries'])
    check('Upgrade retains all task, link and Today records', upgraded['tasks']==before['tasks'] and upgraded['links']==before['links'] and upgraded['selection']==before['selection'])
    check('Schema v3 opened natively',upgraded['version']==3)
    launch();reveal_bars();tap('Capture');find('Close capture');tap('Capture text');type_text('Native toolbox note');wait_text('Capture text','Native toolbox note');tap('Save & close')
    longpress('Today note tools');tap('Copy');reveal_bars();tap('Capture');tap('Capture text');shell('input keyevent 279')
    check('Native clipboard Copy pastes exact note text',wait_text('Capture text','Native toolbox note').get('text')=='Native toolbox note')
    tap('Close capture');longpress('Today note tools');tap('Edit')
    field=wait_text('Edit entry text','Native toolbox note');touch(field);shell('input keyevent 123')
    shell('input keyevent '+' '.join(['67']*len(field.get('text'))))
    type_text('Native edited note');wait_text('Edit entry text','Native edited note');tap('Save changes');find('Today note tools')
    check('Today note edit appears natively')
    longpress('Today note tools');tap('Remove');tap_undo();find('Today note tools');check('Native note removal Undo restores selection')
    reveal_bars();tap('Capture');tap('Task');tap('Capture text');type_text('Native review task');wait_text('Capture text','Native review task');tap('Save & close');tap('Complete Native review task')
    reveal_bars();tap('Review');tap('Remove completed task: Native review task');tap_undo();find('Native review task');check('Completed task Review removal has working Undo')
    reveal_bars();tap('Today');find('Today note tools');tap('Reflect');tap('Linked entry text');type_text('Native linked thinking');wait_text('Linked entry text','Native linked thinking');tap('Save reflection')
    reveal_bars();tap('Review');tap('Remove reflection: Native linked thinking');tap_undo();find('Native linked thinking');check('Linked thinking remove and Undo preserve source')
    reveal_bars();tap('Library');find('Edit note: Native edited note');find('Remove note: Native edited note');check('Native Library exposes edit and remove icons')
    screenshot('library');reveal_bars();tap('Today');screenshot('today')
    after=snapshot('after-workflows')
    check('Legacy records remain unchanged after native workflows', [row[:5] for row in after['entries'][:len(before['entries'])]]==before['entries'] and after['tasks'][:len(before['tasks'])]==before['tasks'])
    newest=next(row for row in after['entries'] if row[3]=='Native toolbox note')
    check('Edited note retains first capture and current words',newest[5]=='Native edited note' and newest[6] is None and after['selection']==[(1,newest[0])])
    shell('settings put global airplane_mode_on 1');shell('svc wifi disable');shell('svc data disable');
    shell('am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true')
    launch();find('Today note tools');reveal_bars();tap('Review');find('Native linked thinking')
    reopened=snapshot('offline-reopened');check('Offline native relaunch retains edited records and selection',reopened==after)
    report['status']='passed';report['apkSha256']=verify['sha256']
except Exception as exc:
    report['status']='failed';report['error']=str(exc)
    try:screenshot('failure')
    except Exception:pass
    raise
finally:
    (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
