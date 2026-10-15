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
OUT = ROOT / 'artifacts/android-v02'
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
    shell('uiautomator dump /sdcard/noeting-v02.xml')
    xml=adb('exec-out','cat','/sdcard/noeting-v02.xml')
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

def tap(label): touch(find(label,True))

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
        if result['version']==2:
            result['links']=db.execute('SELECT * FROM thinking_links ORDER BY rowid').fetchall()
            result['selection']=db.execute('SELECT * FROM today_selection').fetchall()
        return result

def launch():
    shell(f'am start -W -n {PACKAGE}/.MainActivity',180)
    find('Make room for what matters')

def screenshot(name): (OUT/(name+'.png')).write_bytes(adb('exec-out','screencap','-p',binary=True))

try:
    check('Isolated emulator target',shell('getprop ro.kernel.qemu')=='1')
    wait_ready();adb('root');adb('wait-for-device')
    before=snapshot('before-upgrade')
    check('Legacy schema v1 present before upgrade',before['version']==1)
    check('Legacy fixture counts',len(before['entries'])==6 and len(before['tasks'])==4)
    apk=ROOT/'artifacts/noeting-m1-android-x86_64-test.apk'
    report['apkSha256']=hashlib.sha256(apk.read_bytes()).hexdigest()
    check('In-place signed APK upgrade installs','Success' in adb('install','-r',str(apk),timeout=300))
    launch()
    find('3 open · 1 completed · 6 saved entries')
    after=snapshot('after-upgrade')
    check('Version 2 migration preserves every original entry and task',after['version']==2 and after['entries']==before['entries'] and after['tasks']==before['tasks'])
    check('No automatic links or chosen note',not after['links'] and not after['selection'])
    launch()
    active=find('Unpin First focus')
    title=find('First focus')
    pin_bounds=list(map(int,re.findall(r'\d+',active.get('bounds'))))
    title_bounds=list(map(int,re.findall(r'\d+',title.get('bounds'))))
    check('Compact active pin at right edge',active.get('selected')=='true' and pin_bounds[0]>=title_bounds[2])
    tap('Unpin First focus');find('Pin First focus')
    tap('Pin First focus');find('Unpin First focus')
    check('Pin / unpin icon interaction works')
    screenshot('today-tasks')
    tap('Library');find('Your saved words')
    tap('Search saved entries');type_text('Native thought');shell('input keyevent 4')
    find('1 of 6 saved entries · Newest first')
    tap('Today note')
    find('Today note')
    check('Library Today note returns to Today')
    tap('Reflect')
    find('What changed in your thinking?')
    tap('Linked entry text');type_text('Native reflection');shell('input keyevent 4')
    tap('Save reflection');find('3 open · 1 completed · 7 saved entries')
    tap('Create');find('What can you make from this?')
    tap('Linked entry text');type_text('Native creation');shell('input keyevent 4')
    tap('Save creation');find('3 open · 1 completed · 8 saved entries')
    check('Native Reflect and Create save separate entries offline')
    tap('Review');find('Review what actually happened');find('Task review')
    find('Second focus');find('Native reflection');find('Native creation')
    check('Review shows completed task and linked thinking')
    screenshot('review')
    data=snapshot('linked-state')
    check('Legacy source records remain byte-for-byte unchanged',data['entries'][:6]==before['entries'] and data['tasks']==before['tasks'])
    check('Two correct provenance links and no additional tasks',len(data['links'])==2 and {x[2] for x in data['links']}=={'reflection','creation'} and len(data['tasks'])==4)
    check('Today note and both links point to the chosen original',len(data['selection'])==1 and data['selection'][0][1]==before['entries'][0][0] and all(link[1]==data['selection'][0][1] for link in data['links']))
    check('Airplane mode remains enabled',shell('settings get global airplane_mode_on')=='1')
    launch();find('3 open · 1 completed · 8 saved entries');find('Today note')
    tap('Review');find('Native reflection');find('Native creation')
    check('Linked thinking and selection survive offline force-stop/relaunch')
    adb('reboot');wait_ready();launch()
    find('3 open · 1 completed · 8 saved entries');find('Today note')
    rebooted=snapshot('after-reboot')
    check('All schema v2 records and chosen note survive reboot offline',rebooted==data and shell('settings get global airplane_mode_on')=='1')
    report['status']='passed'
except Exception as error:
    report['status']='failed';report['error']=str(error)
    raise
finally:
    (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
