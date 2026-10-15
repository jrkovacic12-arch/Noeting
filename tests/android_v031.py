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
p.add_argument('--reuse-form-evidence',action='store_true')
p.add_argument('--reuse-navigation-evidence',action='store_true')
p.add_argument('--reuse-exit-evidence',action='store_true')
a = p.parse_args()
ADB = '/workspace/.android-sdk/platform-tools/adb'
PACKAGE = 'com.noeting.app'
OUT = ROOT / 'artifacts/android-v031'
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
    # Android's dump may exit successfully without writing a new hierarchy when
    # idle detection fails. Never read the prior screen's leftover XML.
    for attempt in range(8):
        shell('rm -f /sdcard/noeting-v031.xml')
        try:
            shell('uiautomator dump /sdcard/noeting-v031.xml')
            xml=adb('exec-out','cat','/sdcard/noeting-v031.xml')
            parsed=ET.fromstring(xml)
        except (subprocess.CalledProcessError, ET.ParseError):
            print('Retrying accessibility dump: fresh XML unavailable',flush=True);time.sleep(0.5);continue
        (OUT/'layout.xml').write_text(xml)
        return parsed
    raise AssertionError('Android could not provide a fresh accessibility hierarchy')

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
            rect=list(map(int,re.findall(r'\d+',n.get('bounds'))))
            fully_tappable=len(rect)==4 and rect[2]-rect[0]>=50 and rect[3]-rect[1]>=50
            if label in [n.get('text'),n.get('content-desc')] and (not enabled or (n.get('enabled')=='true' and fully_tappable)):
                return n
        # Stay inside the current scroll viewport. A fixed screen swipe can hit
        # the keyboard/backdrop or a clipped button and dismiss a form.
        candidates=[]
        for n in nodes:
            rect=list(map(int,re.findall(r'\d+',n.get('bounds'))))
            if n.get('scrollable')=='true' and len(rect)==4 and rect[2]>rect[0] and rect[3]-rect[1]>100:candidates.append(rect)
        if candidates:
            x1,y1,x2,y2=candidates[-1];x=(x1+x2)//2
            high=y1+(y2-y1)//4;low=y1+3*(y2-y1)//4
            if attempts%5 in (0,4):shell(f'input swipe {x} {high} {x} {low} 400')
            else:shell(f'input swipe {x} {low} {x} {high} 400')
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
    shell(f'input tap {round(right/2)} {round((y1+y2)/2-74*density)}')
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
    result=shell(f'am start -W -n {PACKAGE}/.MainActivity',180)
    print('LAUNCH:',result,flush=True)
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
    shell(f'input swipe {x} {y} {x} {y} 350');find('Copy')

try:
    check('Only an isolated AOSP emulator is targeted',a.serial.startswith('emulator-') and shell('getprop ro.kernel.qemu')=='1')
    wait_ready()
    shell('wm size reset');shell('wm density reset');time.sleep(2)
    report['display']=shell('wm size')+'; '+shell('wm density')
    print('DISPLAY:',report['display'],flush=True)
    report['hierarchyReader']='Fresh stock XML only; stale files removed, visible targets and viewport-scoped swipes.'
    before=snapshot('before-upgrade')
    check('Existing schema v2 fixtures are present',before['version']==2 and len(before['entries'])>=6)
    apk=ROOT/'artifacts/noeting-m1-android-x86_64-test.apk'
    verify=json.loads((ROOT/'artifacts/noeting-v031-x86_64-verification.json').read_text())
    check('Verified v0.3.1 emulator APK selected',hashlib.sha256(apk.read_bytes()).hexdigest()==verify['sha256'] and verify['manifest']['versionName']=='0.3.1')
    adb('install','-r',str(apk),timeout=300)
    launch();upgraded=snapshot('after-upgrade')
    check('Upgrade retains every original entry column', [row[:5] for row in upgraded['entries']]==before['entries'])
    check('Upgrade retains all task, link and Today records', upgraded['tasks']==before['tasks'] and upgraded['links']==before['links'] and upgraded['selection']==before['selection'])
    check('Schema v3 opened natively',upgraded['version']==3)
    if a.reuse_form_evidence:
        prior=json.loads((OUT/'prior-form-checks.json').read_text())
        assert prior['apkSha256']==verify['sha256']
        report['priorFormEvidence']='prior-form-checks.json'
        for name in prior['checks']:check(name+' (same-APK earlier run)')
        launch()
    else:
        launch();reveal_bars();tap('Capture');tap('Capture text');type_text('Session draft');wait_text('Capture text','Session draft')
        shell('input keyevent 4');time.sleep(0.5)
        shell('input tap 40 100');find('Make room for what matters')
        check('Native outside tap dismisses Capture')
        reveal_bars();tap('Capture');field=wait_text('Capture text','Session draft');check('Native dismissed Capture restores session draft')
        touch(field);shell('input keyevent 123');shell('input keyevent '+' '.join(['67']*len('Session draft')))
        wait_text('Capture text','What did you notice?');tap('Close capture')
    if a.reuse_navigation_evidence:
        prior=json.loads((OUT/'prior-navigation-checks.json').read_text())
        assert prior['apkSha256']==verify['sha256']
        report['priorNavigationEvidence']='prior-navigation-checks.json'
        report['scrollPositions']=prior['scrollPositions']
        for name in prior['checks']:check(name+' (same-APK earlier run)')
    else:
        reveal_bars();tap('Library');find('Your saved words');shell('input swipe 270 1200 270 400 400');shell('input swipe 270 700 270 760 250');time.sleep(0.5)
        originals={row[3] for row in before['entries']}
        review_node=find('Review',True)
        current_tree=tree()
        check('Scroll comparison starts on selected Library',any(n.get('content-desc')=='Library' and n.get('selected')=='true' for n in current_tree.iter('node')))
        positions=[(n.get('text'),n.get('bounds')) for n in current_tree.iter('node') if n.get('text') in originals and n.get('bounds')!='[0,0][0,0]']
        screenshot('library-before-back');touch(review_node);find('Review what actually happened');shell('input keyevent 4');time.sleep(1)
        returned=[(n.get('text'),n.get('bounds')) for n in tree().iter('node') if n.get('text') in originals and n.get('bounds')!='[0,0][0,0]']
        report['scrollPositions']={'before':positions,'returned':returned};print('SCROLL:',report['scrollPositions'],flush=True)
        check('Back preserves previous Library scroll position', bool(positions) and returned==positions)
        tap('Search saved entries');type_text('Native');shell('input keyevent 4');time.sleep(0.5)
        reveal_bars();tap('Review');find('Review what actually happened');shell('input keyevent 4');wait_text('Search saved entries','Native')
        check('Back returns Review to previous Library and preserves search')
        shell('input keyevent 4');find('Make room for what matters');check('Back returns Library to Today without exiting')
        shell('input keyevent 4');time.sleep(2.3);find('Make room for what matters');check('Single Today Back and expired countdown keep app open')
    if a.reuse_exit_evidence:
        prior=json.loads((OUT/'prior-exit-checks.json').read_text());assert prior['apkSha256']==verify['sha256']
        report['priorExitEvidence']='prior-exit-checks.json'
        for name in prior['checks']:check(name+' (same-APK earlier run)')
    else:
        shell('input keyevent 4 4');time.sleep(1)
        check('Two Today Back presses within two seconds exit', PACKAGE not in shell('dumpsys activity activities | grep mResumedActivity'))
    launch();reveal_bars();tap('Capture');find('Close capture');tap('Capture text');type_text('Native toolbox note');wait_text('Capture text','Native toolbox note');tap('Save');find('Today note tools',True)
    check('Direct native Save selects the newly captured note',any('Native toolbox note' in (n.get('text') or '') for n in tree().iter('node')))
    longpress('Today note tools');nodes=list(tree().iter('node'))
    check('Native sheet has exactly Copy Edit Remove without content preview', all(any(n.get('content-desc')==label or n.get('text')==label for n in nodes) for label in ['Copy','Edit','Remove']) and not any(n.get('text') in ['Tools','Native toolbox note'] for n in nodes))
    screenshot('toolbox');shell('input keyevent 4');find('Today note tools');check('Back dismisses toolbox without exiting')
    longpress('Today note tools');shell('input tap 40 100');find('Today note tools');check('Outside tap dismisses toolbox')
    longpress('Today note tools');tap('Copy');reveal_bars();tap('Capture');tap('Capture text');shell('input keyevent 279')
    check('Native clipboard Copy pastes exact note text',wait_text('Capture text','Native toolbox note').get('text')=='Native toolbox note')
    tap('Close capture');longpress('Today note tools');tap('Edit')
    field=wait_text('Edit entry text','Native toolbox note');touch(field);shell('input keyevent 123')
    shell('input keyevent '+' '.join(['67']*len(field.get('text'))))
    type_text('Native edited note');wait_text('Edit entry text','Native edited note');tap('Save');find('Today note tools')
    check('Today note edit appears natively')
    longpress('Today note tools');tap('Remove');tap_undo();find('Today note tools');check('Native note removal Undo restores selection')
    reveal_bars();tap('Capture');tap('Task');tap('Capture text');type_text('Native review task');wait_text('Capture text','Native review task');tap('Save');tap('Complete Native review task')
    reveal_bars();tap('Review');tap('Remove completed task: Native review task');tap_undo();find('Native review task');check('Completed task Review removal has working Undo')
    reveal_bars();tap('Today');find('Today note tools');tap('Reflect');tap('Linked entry text');type_text('Native linked thinking');wait_text('Linked entry text','Native linked thinking');tap('Save')
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
    try:
        screenshot('failure')
        (OUT/'failure-logcat.txt').write_text(adb('logcat','-d','-t','1500'))
    except Exception:pass
    raise
finally:
    (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
