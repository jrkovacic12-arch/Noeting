import { randomUUID } from 'expo-crypto';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, AppState, BackHandler, Image, PanResponder, ToastAndroid, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { openRepository } from './src/data/sqlite';
import type { Entry, Repository, Snapshot, ThinkingKind, Removal, Task, PinSchedule } from './src/data/repository';

import { localPinFields, parseLocalPinTime } from './src/reminders';
import { clearLegacyNotifications } from './src/notificationDriver';
import { ThemeProvider, useTheme, type Palette, type ThemePreference } from './src/theme';

function useAppTheme() {
  const theme=useTheme();
  const styles=useMemo(()=>createStyles(theme.colors),[theme.colors]);
  return {...theme,styles};
}
type Kind = Entry['kind'];
type MainScreen = 'today' | 'library' | 'review' | 'settings';
type Screen = MainScreen | 'entry';
type Draft = {text:string; requestId:string};
const entryLabel = (entry: Entry) => entry.thinkingKind === 'reflection' ? 'Reflection' : entry.thinkingKind === 'creation' ? 'Creation' : entry.kind === 'task' ? 'Task' : 'Note';

function Button({ label, onPress, disabled = false, primary = false, accessibilityLabel, compact = false, ghost = false }: {
  label: string; onPress: () => void; disabled?: boolean; primary?: boolean; accessibilityLabel?: string; compact?: boolean; ghost?: boolean;
}) {
  const {styles}=useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, compact && styles.compactButton, ghost && styles.ghostButton, primary && styles.primary, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <Text style={[styles.buttonText, compact && styles.compactButtonText, primary && styles.primaryText]}>{label}</Text>
  </Pressable>;
}

function PinIcon({ active }: { active: boolean }) {
  const {styles,colors}=useAppTheme();
  return <Image accessible={false} style={[styles.pinGlyph,{tintColor:active?colors.green:colors.muted}]}
    source={active ? require('./assets/icons/pin-active.png') : require('./assets/icons/pin.png')} />;
}

const iconSources = {
  settings: require('./assets/icons/settings.png'),
  today: require('./assets/icons/today.png'), library: require('./assets/icons/library.png'),
  review: require('./assets/icons/review.png'), edit: require('./assets/icons/edit.png'),
  remove: require('./assets/icons/remove.png'), copy: require('./assets/icons/copy.png'),
};
type IconName = keyof typeof iconSources;
function Icon({name}: {name:IconName}) {
  const {styles,colors}=useAppTheme();
  return <Image accessible={false} source={iconSources[name]} style={[styles.controlIcon,{tintColor:name==='remove'?colors.danger:colors.green}]} />;
}
function IconButton({name, label, onPress, disabled=false}: {name:IconName | 'close' | 'plus' | 'clock' | 'reopen' | 'back'; label:string; onPress:()=>void; disabled?:boolean}) {
  const {styles,colors}=useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
    accessibilityState={{disabled}} onPress={onPress}
    style={({pressed})=>[styles.iconTarget,disabled&&styles.disabled,pressed&&styles.pressed]}>
    {name === 'clock' ? <View accessible={false} style={styles.closeGlyph}>
      <View style={[styles.clockFace,{borderColor:colors.green}]} />
      <View style={[styles.clockVertical,{backgroundColor:colors.green}]} /><View style={[styles.clockHorizontal,{backgroundColor:colors.green}]} />
    </View> : name === 'reopen' ? <View accessible={false} style={styles.closeGlyph}>
      <View style={[styles.returnCurve,{borderColor:colors.green}]} />
      <View style={[styles.returnHead,{top:2,backgroundColor:colors.green,transform:[{rotate:'-45deg'}]}]} /><View style={[styles.returnHead,{top:6,backgroundColor:colors.green,transform:[{rotate:'45deg'}]}]} />
    </View> : name === 'back' ? <Text accessible={false} allowFontScaling={false} style={[styles.arrowGlyph,{color:colors.green}]}>←</Text> : name === 'close' || name === 'plus' ? <View accessible={false} style={styles.closeGlyph}>
      <View style={[styles.closeLine,name==='plus'&&styles.plusLine,{transform:[{rotate:name==='close'?'45deg':'0deg'}]}]} />
      <View style={[styles.closeLine,name==='plus'&&styles.plusLine,{transform:[{rotate:name==='close'?'-45deg':'90deg'}]}]} />
    </View> : <Icon name={name} />}
  </Pressable>;
}

function Brand() {
  const {styles,colors,dark}=useAppTheme();
  return <View style={styles.brandRow}>
    <Image accessible={false} source={require('./assets/brand/generated/symbol.png')} style={[styles.brandSymbol,dark&&{tintColor:colors.green}]} />
    <Text style={styles.brand}>noeting.</Text>
  </View>;
}

function Noeting() {
  const {styles,colors,preference,dark,saving:themeSaving,error:themeError,changeTheme}=useAppTheme();
  const [repository, setRepository] = useState<Repository | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({ entries: [], tasks: [], chosenEntryId: null });
  const [pinSchedules, setPinSchedules] = useState<PinSchedule[]>([]);
  const legacyCleaned = useRef(false);
  const [detailEntryId,setDetailEntryId] = useState<string | null>(null);
  const [reminderTask, setReminderTask] = useState<Task | null>(null);
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [startupError, setStartupError] = useState(false);
  const [dialog, setDialog] = useState<'capture' | 'linked' | 'choose' | 'edit' | 'toolbox' | 'derive' | 'reminder' | 'actions' | null>(null);
  const [kind, setKind] = useState<Kind>('note');
  const [thinkingKind, setThinkingKind] = useState<ThinkingKind>('reflection');
  const [source, setSource] = useState<Entry | null>(null);
  const [text, setText] = useState('');
  const requestId = useRef('');
  const drafts = useRef(new Map<string,Draft>());
  const draftKey = useRef<string | null>(null);
  const busyLock = useRef(false);
  const selectingText = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('today');
  const [target, setTarget] = useState<Entry | null>(null);
  const [toast, setToast] = useState<{message:string; removal?:Removal} | null>(null);
  const visitedScreens = useRef(new Set<Screen>(['today']));
  const sheetMotion = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if(dialog !== 'toolbox' && dialog !== 'actions'){sheetMotion.stopAnimation();sheetMotion.setValue(1);return;}
    sheetMotion.setValue(1);
    const animation=Animated.timing(sheetMotion,{toValue:0,duration:180,useNativeDriver:Platform.OS !== 'web'});
    animation.start();
    return () => animation.stop();
  },[dialog,sheetMotion]);
  const history = useRef<{screen:Screen; y:number; entryId?:string|null}[]>([]);
  const lastBack = useRef(0);
  const restoringScroll = useRef(false);
  const pendingScroll = useRef<{screen:Screen;y:number} | null>(null);
  const undoGesture = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_, gesture) => {if(gesture.dy > 28 || gesture.vy > 0.5)setToast(null);},
  })).current;
  const [barsVisible, setBarsVisible] = useState(true);
  const chrome = useRef(new Animated.Value(0)).current;
  const scrollView = useRef<ScrollView>(null);
  const scrolling = useRef({y:0, travel:0, direction:0, height:0, content:0});
  useEffect(() => {
    Animated.timing(chrome, {toValue:barsVisible ? 0 : 1, duration:160, useNativeDriver:Platform.OS !== 'web'}).start();
  }, [barsVisible, chrome]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const [noteFilter,setNoteFilter] = useState<'all' | ThinkingKind>('all');

  useEffect(() => {
    let active = true;
    setStartupError(false);
    (async () => {
      try {
        const repo = await openRepository();
        await repo.applyDuePins();
        const data = await repo.readSnapshot();
        const schedules = await repo.readScheduledPins();
        if (active) {
          setSnapshot(data); setPinSchedules(schedules); setRepository(repo);
          try { await clearLegacyNotifications(); legacyCleaned.current=true; }
          catch { if(active)setError('Could not cancel old notification reminders. Refresh saved items to retry.'); }
        }
      } catch { if (active) setStartupError(true); }
    })();
    return () => { active = false; };
  }, [startupAttempt]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if(state === 'active' && repository) void mutate(async () => undefined);
    });
    return () => listener.remove();
  }, [repository]);

  useEffect(() => {
    if(!repository)return;
    const waiting=pinSchedules.filter(p=>p.status==='waiting' && p.dueAt);
    if(!waiting.length)return;
    const next=Math.min(...waiting.map(p=>Date.parse(p.dueAt!)));
    let timer:ReturnType<typeof setTimeout>;
    const apply=()=>{
      if(busyLock.current){timer=setTimeout(apply,250);return;}
      void mutate(async()=>undefined);
    };
    timer=setTimeout(apply,Math.max(0,Math.min(2147483647,next-Date.now())));
    return ()=>clearTimeout(timer);
  },[repository,pinSchedules]);

  const pending = snapshot.tasks.filter(task => task.status === 'pending')
    .sort((a,b)=>Number(b.pinned)-Number(a.pinned) || (a.pinned ? (b.pinnedAt ?? '').localeCompare(a.pinnedAt ?? '') || b.pinOrder-a.pinOrder : 0));
  const completed = snapshot.tasks.filter(task => task.status === 'completed').reverse();
  const pinnedCount = pending.filter(task => task.pinned).length;
  const visibleEntries = snapshot.entries.filter(entry => !entry.removed);
  const notes = visibleEntries.filter(entry => entry.kind === 'note');
  const search = query.trim().toLowerCase();
  const libraryEntries = visibleEntries.filter(entry =>
    (filter === 'all' || (entry.kind === filter && (filter !== 'note' || noteFilter === 'all' || entry.thinkingKind === noteFilter))) && entry.text.toLowerCase().includes(search)
  ).reverse();
  const tasksByEntry = new Map(snapshot.tasks.map(task => [task.entryId, task]));
  const entriesById = new Map(snapshot.entries.map(entry => [entry.id, entry]));
  const chosen = snapshot.chosenEntryId ? entriesById.get(snapshot.chosenEntryId) : undefined;
  const linked = visibleEntries.filter(entry => entry.sourceEntryId).reverse();

  function rememberDraft() {
    if(draftKey.current) drafts.current.set(draftKey.current,{text,requestId:requestId.current});
  }
  function loadDraft(key:string, initialText='') {
    lastBack.current=0;
    draftKey.current=key;
    const draft=drafts.current.get(key);
    requestId.current=draft?.requestId ?? randomUUID();
    setText(draft?.text ?? initialText); setCaptureError(null);
  }
  function dismissDialog() {
    if(busyLock.current)return;
    rememberDraft(); draftKey.current=null; lastBack.current=0;
    setDialog(null);
  }
  useEffect(() => {
    if(Platform.OS !== 'android')return;
    const listener=BackHandler.addEventListener('hardwareBackPress',()=>{
      if(dialog){dismissDialog();return true;}
      if(busyLock.current)return true;
      if(screen === 'today'){
        const now=Date.now();
        if(lastBack.current && now-lastBack.current<=2000){lastBack.current=0;BackHandler.exitApp();}
        else {lastBack.current=now;ToastAndroid.show('Press back again to exit.',ToastAndroid.SHORT);}
      }else{
        lastBack.current=0;
        goBack();
      }
      return true;
    });
    return ()=>listener.remove();
  },[dialog,screen,text,detailEntryId]);

  function startCapture(nextKind: Kind) {
    if (busyLock.current || !repository) return;
    setBarsVisible(true);
    loadDraft(`capture:${nextKind}`);
    setKind(nextKind); setDialog('capture');
  }

  function openLinkedActions(entry:Entry) {
    if(busyLock.current || entry.removed)return;
    draftKey.current=null;lastBack.current=0;setSource(entry);setCaptureError(null);setDialog('actions');
  }
  function startLinked(entry: Entry, nextKind: ThinkingKind) {
    if (busyLock.current || !repository) return;
    loadDraft(`linked:${entry.id}:${nextKind}`);
    setSource(entry); setThinkingKind(nextKind); setDialog('linked');
  }

  function startDerived(entry: Entry) {
    if (busyLock.current || !repository || entry.removed) return;
    loadDraft(`derive:${entry.id}`,entry.text);
    setSource(entry); setDialog('derive');
  }
  function showEntry(entry: Entry) {
    if(busyLock.current)return;
    draftKey.current=null;lastBack.current=0;setDialog(null);navigate('entry',entry.id);
  }
  function startReminder(task: Task) {
    if(busyLock.current)return;
    const fields=localPinFields(pinSchedules.find(r=>r.taskId===task.id && r.status==='waiting')?.dueAt);
    setReminderDate(fields.date);setReminderTime(fields.time);setReminderTask(task);
    draftKey.current=null;lastBack.current=0;setCaptureError(null);setDialog('reminder');
  }
  async function saveReminder(cancel=false) {
    if(!repository || !reminderTask || busyLock.current)return;
    let dueAt: string | null;
    try {dueAt=cancel?null:parseLocalPinTime(reminderDate,reminderTime);}
    catch(err){setCaptureError((err as Error).message);return;}
    busyLock.current=true;setBusy(true);setCaptureError(null);
    try {
      await repository.setScheduledPin(reminderTask.id,dueAt);
      await repository.applyDuePins();
      setPinSchedules(await repository.readScheduledPins());setDialog(null);
    } catch {setCaptureError('Could not save this scheduled pin. Please try again.');}
    finally {busyLock.current=false;setBusy(false);}
  }
  async function refreshRecords() {
    await repository!.applyDuePins();
    if(!legacyCleaned.current){
      try {await clearLegacyNotifications();legacyCleaned.current=true;}
      catch {setError('Could not cancel old notification reminders. Refresh saved items to retry.');}
    }
    setSnapshot(await repository!.readSnapshot());setPinSchedules(await repository!.readScheduledPins());
  }

  async function save() {
    if (!repository || busyLock.current || !text.trim()) return;
    busyLock.current = true; setBusy(true); setCaptureError(null);
    try {
      if (dialog === 'edit' && target) await repository.editEntry(target.id, text);
      else if (dialog === 'derive' && source) await repository.saveDerivedTask({requestId:requestId.current,sourceEntryId:source.id,text});
      else if (dialog === 'linked' && source) await repository.saveLinked({ requestId: requestId.current, sourceEntryId: source.id, kind: thinkingKind, text });
      else await repository.saveCapture({ requestId: requestId.current, kind, text });
      if(draftKey.current)drafts.current.delete(draftKey.current);
      draftKey.current=null; setDialog(null); setText('');
      try { await refreshRecords(); }
      catch { setError('Your entry was saved, but the list could not refresh. Please refresh saved items.'); }
    } catch {
      setCaptureError('Could not confirm the save. Your text is still here. Please try again.');
    } finally { busyLock.current = false; setBusy(false); }
  }

  async function mutate(action: (repo: Repository) => Promise<void>) {
    if (!repository || busyLock.current) return false;
    busyLock.current = true; setBusy(true); setError(null);
    try {
      await action(repository);
      try { await refreshRecords(); }
      catch { setError('Your change was saved, but the list could not refresh. Please refresh saved items.'); }
      return true;
    } catch { setError('Could not save the change. Please try again.'); return false; }
    finally { busyLock.current = false; setBusy(false); }
  }

  async function selectNote(entry: Entry) {
    if (await mutate(repo => repo.chooseTodayNote(entry.id))) { setDialog(null); navigate('today'); }
  }

  function restoreScreen(next:Screen,y:number,nextEntryId?:string|null) {
    setBarsVisible(true); lastBack.current=0;
    scrolling.current.y=y; scrolling.current.travel=0; scrolling.current.direction=0;
    if(next===screen && (next!=='entry' || nextEntryId===detailEntryId)){
      scrollView.current?.scrollTo({y,animated:false});
      return;
    }
    restoringScroll.current=true; pendingScroll.current={screen:next,y};
    // Retained Library inputs must not keep their keyboard over another screen.
    Keyboard.dismiss();
    visitedScreens.current.add(next);
    if(next==='entry')setDetailEntryId(nextEntryId ?? null);
    setScreen(next);
  }
  function restorePendingScroll() {
    const restore=pendingScroll.current;
    if(restore?.screen!==screen)return;
    scrollView.current?.scrollTo({y:restore.y,animated:false});
    pendingScroll.current=null;
    requestAnimationFrame(()=>{restoringScroll.current=false;});
  }
  useEffect(()=>{
    if(screen==='entry' && pendingScroll.current)requestAnimationFrame(restorePendingScroll);
  },[screen,detailEntryId]);

  function navigate(next:Screen,entryId?:string) {
    if(next!==screen || (next==='entry' && entryId!==detailEntryId))history.current.push({screen,y:scrolling.current.y,entryId:detailEntryId});
    restoreScreen(next,0,entryId);
  }
  function goBack() {
    if(busyLock.current)return;
    const previous=history.current.pop() ?? {screen:'today' as Screen,y:0};
    restoreScreen(previous.screen,previous.y,previous.entryId);
  }
  function startEdit(entry:Entry) {
    if (busyLock.current) return;
    loadDraft(`edit:${entry.id}`,entry.text);
    setTarget(entry); setDialog('edit');
  }
  function openTools(entry:Entry) {
    if (busyLock.current) return;
    draftKey.current=null; lastBack.current=0;
    setTarget(entry); setCaptureError(null); setDialog('toolbox');
  }
  async function copyEntry(entry:Entry) {
    if (busyLock.current) return;
    busyLock.current = true; setBusy(true); setCaptureError(null);
    try {
      if (!await Clipboard.setStringAsync(entry.text)) throw new Error('Clipboard unavailable');
      setDialog(null); setToast({message:'Copied'});
    } catch { setCaptureError('Could not copy. Please try again.'); }
    finally { busyLock.current = false; setBusy(false); }
  }
  async function removeEntry(entry:Entry) {
    let removal:Removal | undefined;
    if (await mutate(async repo => {removal = await repo.removeEntry(entry.id);})) {
      drafts.current.delete(`edit:${entry.id}`); draftKey.current=null;
      setDialog(null); setToast({message:'Undo',removal});
    }
  }
  function accessibleTools(entry:Entry) {
    return {
      accessibilityActions: [{name:'copy',label:'Copy'}, {name:'edit',label:'Edit'}, {name:'remove',label:'Remove'}],
      onAccessibilityAction: (event:{nativeEvent:{actionName:string}}) => {
        if (event.nativeEvent.actionName === 'edit') startEdit(entry);
        else if (event.nativeEvent.actionName === 'remove') void removeEntry(entry);
        else if (event.nativeEvent.actionName === 'copy') void copyEntry(entry);
      },
    };
  }
  function navigation(next:MainScreen) {
    const label = next === 'today' ? 'Today' : next === 'library' ? 'Library' : next === 'review' ? 'Review' : 'Settings';
    return <Pressable accessibilityRole="tab" accessibilityLabel={label} aria-selected={screen === next}
      accessibilityState={{selected:screen === next}} onPress={() => navigate(next)}
      style={({pressed})=>[styles.navItem,screen===next&&styles.navActive,pressed&&styles.pressed]}>
      <View style={screen !== next && styles.inactiveIcon}><Icon name={next} /></View>
    </Pressable>;
  }

  function completion(task:Task, linked=false) {
    const checked=task.status==='completed';
    const disabled=busy || !!entriesById.get(task.entryId)?.removed;
    return <Pressable accessibilityRole="checkbox" accessibilityLabel={`${checked?'Reopen':'Complete'} ${linked?'linked task: ':''}${task.title}`}
      accessibilityState={{checked,disabled}} aria-checked={checked} disabled={disabled} onPress={()=>{setToast(null);void mutate(repo=>checked?repo.reopenTask(task.id):repo.completeTask(task.id));}}
      style={({pressed})=>[styles.iconTarget,pressed&&styles.pressed,disabled&&styles.disabled]}>
      <View style={[styles.checkbox,checked&&{borderColor:colors.green,backgroundColor:colors.green}]}>
        {checked && <><View style={[styles.checkShort,{backgroundColor:colors.onAccent}]} /><View style={[styles.checkLong,{backgroundColor:colors.onAccent}]} /></>}
      </View>
    </Pressable>;
  }
  function todayPin(entry:Entry) {
    const active=snapshot.chosenEntryId===entry.id;
    return <Pressable accessibilityRole="button" accessibilityLabel={`Choose as Today note: ${entry.text}`} accessibilityState={{selected:active,disabled:busy}}
      {...(Platform.OS==='web'?{'aria-pressed':active}:{})} disabled={busy} style={({pressed})=>[styles.iconTarget,pressed&&styles.pressed,busy&&styles.disabled]}
      onPress={()=>{if(!active)void mutate(repo=>repo.chooseTodayNote(entry.id));}}><PinIcon active={active} /></Pressable>;
  }
  function taskPinControls(task:Task) {
    if(task.status!=='pending')return null;
    const schedule=pinSchedules.find(r=>r.taskId===task.id && r.status==='waiting');
    return <View style={styles.edgeControls}>
      <IconButton name="clock" label={`${schedule?'Change scheduled pin':'Schedule pin'}: ${task.title}`} disabled={busy} onPress={()=>startReminder(task)} />
      <Pressable accessibilityRole="button" accessibilityLabel={`${task.pinned?'Unpin':'Pin'} ${task.title}`}
        {...(Platform.OS==='web'?{'aria-pressed':task.pinned}:{})} accessibilityState={{selected:task.pinned,disabled:busy}} disabled={busy}
        onPress={()=>void mutate(repo=>repo.setPinned(task.id,!task.pinned))} style={({pressed})=>[styles.iconTarget,busy&&styles.disabled,pressed&&styles.pressed]}>
        <PinIcon active={task.pinned} />
      </Pressable>
    </View>;
  }
  function taskDetails(task: Task) {
    const schedule=pinSchedules.find(r=>r.taskId===task.id && r.status==='waiting');
    return <View style={[styles.taskBody,{gap:4}]}>
      {schedule?.dueAt && <Text style={styles.localStatus}>Pins {new Date(schedule.dueAt).toLocaleString()}</Text>}
    </View>;
  }
  function entryBody(entry:Entry, full=false, quote=false, label?:string) {
    const counts=linkedCounts(entry);
    const content=<>
      {quote?<Text style={styles.quote}>“<Text testID="chosen-note-text" selectable>{entry.text}</Text>”</Text>:<Text testID={`original-${entry.id}`} selectable style={styles.originalText}>{entry.text}</Text>}
      <View style={{gap:3}}><Text style={styles.localStatus}>Captured {new Date(entry.createdAt).toLocaleString()}</Text>
        {!!counts && <Text testID={`linked-counts-${entry.id}`} style={styles.localStatus}>{counts}</Text>}
      </View>
    </>;
    if(full)return <View style={styles.entryBody}>{content}</View>;
    return <Pressable accessibilityRole="button" accessibilityLabel={label ?? `Open entry: ${entry.text}`} disabled={busy}
      onPressIn={()=>{selectingText.current=false;}} onLongPress={()=>{selectingText.current=true;}} delayLongPress={350}
      onPress={()=>{if(!selectingText.current && !(Platform.OS==='web' && globalThis.getSelection?.()?.toString()))showEntry(entry);}}
      style={styles.entryBody}>{content}</Pressable>;
  }
  function children(entry:Entry) {
    return visibleEntries.filter(e=>e.taskSourceId===entry.id || e.sourceEntryId===entry.id);
  }
  function linkedCounts(entry:Entry) {
    const related=children(entry);
    return (['task','reflection','creation'] as const).map(kind=>{
      const count=related.filter(e=>kind==='task'?e.kind==='task':e.thinkingKind===kind).length;
      const label=kind==='task'?'Task':kind==='reflection'?'Reflection':'Creation';
      return count?`${count} ${label}${count===1?'':'s'}`:null;
    }).filter(Boolean).join(' · ');
  }
  function entryCard(entry: Entry, full=false) {
    const task=tasksByEntry.get(entry.id);
    const sourceId=entry.sourceEntryId ?? entry.taskSourceId;
    const original=sourceId?entriesById.get(sourceId):undefined;
    return <View key={entry.id} testID={full?'entry-detail-content':`entry-${entry.id}`} style={styles.panel}>
      <View style={styles.panelHeader}><View style={styles.entryHeading}>
        {task && completion(task)}
        <Text style={[styles.eyebrow,{flex:1}]}>{entryLabel(entry).toUpperCase()}{task ? ` · ${task.status==='completed'?'Completed':'Pending'}` : ''}{entry.removed?' · Removed':''}</Text>
      </View>{!entry.removed && <View style={styles.cornerActions}>
        <IconButton name="edit" label={`Edit ${entryLabel(entry).toLowerCase()}: ${entry.text}`} disabled={busy} onPress={()=>startEdit(entry)} />
        <IconButton name="remove" label={`Remove ${entryLabel(entry).toLowerCase()}: ${entry.text}`} disabled={busy} onPress={()=>void removeEntry(entry)} />
        {(!task || task.status==='pending') && <IconButton name="plus" label={`Linked actions: ${entry.text}`} disabled={busy} onPress={()=>openLinkedActions(entry)} />}
      </View>}</View>
      {entryBody(entry,full)}
      {original && (entry.thinkingKind || full) && <Pressable accessibilityRole="button" accessibilityLabel={`Open original ${original.kind}: ${entry.text}`} disabled={busy} onPress={()=>showEntry(original)} style={styles.source}>
        <Text style={styles.eyebrow}>ORIGINAL · UNCHANGED{original.removed?' · Removed':''}</Text><Text numberOfLines={full?undefined:3} style={styles.muted}>{original.originalText}</Text>
      </Pressable>}
      {full && entry.text!==entry.originalText && <View style={styles.source}><Text style={styles.eyebrow}>FIRST CAPTURE · UNCHANGED</Text><Text selectable style={styles.originalText}>{entry.originalText}</Text></View>}
      {full && entry.taskSourceText!=null && <View style={styles.source}><Text style={styles.eyebrow}>SOURCE WHEN TASK WAS CREATED</Text><Text selectable style={styles.originalText}>{entry.taskSourceText}</Text></View>}
      {task?.status==='pending' && <View style={styles.entryFooter}>{taskDetails(task)}{taskPinControls(task)}</View>}
      {(full || (entry.kind==='note' && !entry.removed)) && <View style={styles.entryFooter}>
        {full?<IconButton name="copy" label="Copy entry" disabled={busy} onPress={()=>void copyEntry(entry)} />:<View />}
        {entry.kind==='note' && !entry.removed && todayPin(entry)}
      </View>}
    </View>;
  }
  function linkedGroups(entry:Entry) {
    const related=children(entry);
    return <View style={styles.screenContent}><Text accessibilityRole="header" style={styles.panelTitle}>Linked entries</Text>
      {related.length===0 && <Text style={styles.muted}>No linked entries yet.</Text>}
      {(['task','reflection','creation'] as const).map(kind=>{
        const group=related.filter(e=>kind==='task'?e.kind==='task':e.thinkingKind===kind);
        if(!group.length)return null;
        return <View key={kind} style={styles.screenContent}><Text accessibilityRole="header" style={styles.eyebrow}>{kind==='task'?'TASKS':kind==='reflection'?'REFLECTIONS':'CREATIONS'} · {group.length}</Text>
          {group.map(child=>{const task=tasksByEntry.get(child.id);return <View key={child.id} style={styles.source}>
            <View style={styles.panelHeader}><View style={styles.entryHeading}>{task && completion(task,true)}<Text style={[styles.eyebrow,{flex:1}]}>{entryLabel(child).toUpperCase()}{task?` · ${task.status}`:''}</Text></View>
              {(!task || task.status==='pending') && <IconButton name="plus" label={`Linked actions: ${child.text}`} disabled={busy} onPress={()=>openLinkedActions(child)} />}</View>
            {entryBody(child,false,false,`Open linked ${entryLabel(child).toLowerCase()}: ${child.text}`)}
            {task?(task.status==='pending' && <View style={styles.entryFooter}>{taskDetails(task)}{taskPinControls(task)}</View>):<View style={styles.entryFooter}><View />{todayPin(child)}</View>}
          </View>;})}
        </View>;
      })}
    </View>;
  }

  if (!repository) return <SafeAreaView style={styles.safe}><View style={styles.loading}>
    <Brand />
    {startupError ? <>
      <Text accessibilityRole="alert" style={styles.error}>Could not open local storage. Your data has not been cleared.
        {Platform.OS === 'web' ? ' Close any other Noeting tabs, then retry.' : ''}</Text>
      <Button label="Retry opening storage" onPress={() => {
        if (Platform.OS === 'web') globalThis.location.reload();
        else setStartupAttempt(value => value + 1);
      }} />
    </> : <><ActivityIndicator color={colors.green} /><Text style={styles.muted}>Opening your local notes…</Text></>}
  </View></SafeAreaView>;

  return <SafeAreaView testID="app-shell" style={styles.safe}>
    <View style={styles.body}>
    <Animated.View testID="top-bar" aria-hidden={!barsVisible} pointerEvents={barsVisible ? 'auto' : 'none'}
      style={[styles.header,{transform:[{translateY:chrome.interpolate({inputRange:[0,1],outputRange:[0,-90]})}],opacity:chrome.interpolate({inputRange:[0,1],outputRange:[1,0]})}]}><Brand /></Animated.View>
    <ScrollView ref={scrollView} testID="main-scroll" contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16} onLayout={event => {scrolling.current.height=event.nativeEvent.layout.height;}}
      onContentSizeChange={(_,height) => {
        scrolling.current.content=height;
        restorePendingScroll();
        if(height<=scrolling.current.height+16)setBarsVisible(true);
      }}
      onScroll={event => {
        if (dialog || restoringScroll.current) return;
        const metrics=scrolling.current;
        const maximum=Math.max(0,event.nativeEvent.contentSize.height-event.nativeEvent.layoutMeasurement.height);
        const y=Math.max(0,Math.min(maximum,event.nativeEvent.contentOffset.y));
        const delta=y-metrics.y; metrics.y=y;
        if(y<=12||maximum<=16){setBarsVisible(true);metrics.travel=0;return;}
        if(Math.abs(delta)<0.5)return;
        const direction=Math.sign(delta);
        if(direction!==metrics.direction){metrics.travel=0;metrics.direction=direction;}
        metrics.travel+=Math.abs(delta);
        if(metrics.travel>=18){setBarsVisible(direction<0);metrics.travel=0;}
      }}>
      {error && <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={styles.error}>{error}</Text>
        <Button label="Refresh saved items" disabled={busy} onPress={() => void mutate(async () => undefined)} />
      </View>}
      {visitedScreens.current.has('today') && <View testID="screen-today" onLayout={() => {if(screen==='today')requestAnimationFrame(restorePendingScroll);}} style={[styles.screenContent,screen !== 'today' && styles.hiddenScreen]}>

        <Text style={styles.eyebrow}>TODAY</Text>
        <Text accessibilityRole="header" style={styles.title}>Make room for what matters</Text>
        <Text style={styles.subtitle}>Your tasks and a little time to think.</Text>
        <View testID="daily-summary" accessibilityLabel="Daily summary" style={styles.summary}>
          <Text accessibilityRole="header" style={styles.panelTitle}>Daily summary</Text>
          <Text style={styles.muted}>{pending.length} open · {completed.length} completed · {visibleEntries.length} saved entries</Text>
          <Text style={styles.localStatus}>Your current saved records · No account needed</Text>
        </View>
        <View style={styles.panel}>
          <View style={styles.panelHeader}><Text accessibilityRole="header" style={styles.panelTitle}>Tasks</Text>
            <IconButton name="plus" label="Add task" disabled={busy} onPress={() => startCapture('task')} />
          </View>
          <Text style={styles.pinCount}>{pinnedCount} pinned</Text>
          {pending.length===0?<Text style={styles.empty}>No pending tasks</Text>:pending.map(task=><View key={task.id} testID={`task-${task.id}`} style={[styles.task,task.pinned&&styles.pinnedTask]}>
            <View style={styles.taskTopRow}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Complete ${task.title}`} disabled={busy} accessibilityState={{disabled:busy}} onPress={()=>void mutate(repo=>repo.completeTask(task.id))}
                delayLongPress={300} onLongPress={()=>openTools(entriesById.get(task.entryId)!)} style={({pressed})=>[styles.completeTarget,pressed&&styles.pressed]}><View style={styles.checkbox} /></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Open entry: ${task.title}`} {...accessibleTools(entriesById.get(task.entryId)!)} onPress={()=>showEntry(entriesById.get(task.entryId)!)}
                onLongPress={()=>openTools(entriesById.get(task.entryId)!)} delayLongPress={300} disabled={busy} style={[styles.taskBody,styles.pendingTaskBody]}><Text style={styles.taskTitle}>{task.title}</Text></Pressable>
            </View>
            <View style={styles.entryFooter}>{taskDetails(task)}{taskPinControls(task)}</View>
          </View>)}
        </View>
        <View testID="today-thinking" style={styles.panel}>
          <Text accessibilityRole="header" style={styles.panelTitle}>Today note</Text>
          <Text style={styles.muted}>One note you chose to think about.</Text>
          {chosen ? <View style={styles.thinking}>
            <View style={styles.panelHeader}><Text style={[styles.eyebrow,{flex:1}]}>{entryLabel(chosen).toUpperCase()}</Text><View style={styles.cornerActions}>
              <IconButton name="edit" label={`Edit ${entryLabel(chosen).toLowerCase()}: ${chosen.text}`} disabled={busy} onPress={()=>startEdit(chosen)} />
              <IconButton name="remove" label={`Remove ${entryLabel(chosen).toLowerCase()}: ${chosen.text}`} disabled={busy} onPress={()=>void removeEntry(chosen)} />
              <IconButton name="plus" label={`Linked actions: ${chosen.text}`} disabled={busy} onPress={()=>openLinkedActions(chosen)} />
            </View></View>
            {entryBody(chosen,false,true)}
            <View style={styles.entryFooter}><Button label="Change" compact ghost disabled={busy} onPress={()=>{draftKey.current=null;lastBack.current=0;setDialog('choose');}} />{todayPin(chosen)}</View>
          </View> : <>
            <Text style={styles.muted}>{notes.length ? 'Choose a saved note when you want to reflect.' : 'Capture a note to make reflection available.'}</Text>
            <Button label="Choose a note" disabled={busy || !notes.length} onPress={() => {draftKey.current=null;lastBack.current=0;setDialog('choose');}} />
          </>}
        </View>
      </View>}
      {visitedScreens.current.has('library') && <View testID="screen-library" onLayout={() => {if(screen==='library')requestAnimationFrame(restorePendingScroll);}} style={[styles.screenContent,screen !== 'library' && styles.hiddenScreen]}>

        <Text style={styles.eyebrow}>LIBRARY</Text>
        <Text accessibilityRole="header" style={styles.title}>Your saved words</Text>
        <Text style={styles.subtitle}>Find a thought or revisit a task. Your original words stay intact.</Text>
        <TextInput accessibilityLabel="Search saved entries" value={query} onChangeText={setQuery}
          placeholder="Search your words" placeholderTextColor={colors.muted} style={styles.searchInput} autoCorrect={false} />
        <View accessibilityRole="radiogroup" accessibilityLabel="Library type" style={styles.types}>
          {(['all', 'note', 'task'] as const).map(value => <Pressable key={value} accessibilityRole="radio"
            accessibilityLabel={value === 'all' ? 'All' : value === 'note' ? 'Notes' : 'Tasks'} aria-checked={filter === value}
            accessibilityState={{ checked: filter === value }} onPress={() => {setFilter(value);if(value==='note')setNoteFilter('all');}}
            style={[styles.type, filter === value && styles.selectedType]}>
            <Text style={styles.buttonText}>{value === 'all' ? 'All' : value === 'note' ? 'Notes' : 'Tasks'}</Text>
          </Pressable>)}
        </View>
        {filter==='note' && <View accessibilityRole="radiogroup" accessibilityLabel="Note type" style={styles.types}>
          {(['all','reflection','creation'] as const).map(value=><Pressable key={value} accessibilityRole="radio" accessibilityLabel={value==='all'?'All notes':value==='reflection'?'Reflections':'Creations'} aria-checked={noteFilter===value}
            accessibilityState={{checked:noteFilter===value}} onPress={()=>setNoteFilter(value)} style={[styles.type,noteFilter===value&&styles.selectedType]}><Text style={styles.buttonText}>{value==='all'?'All notes':value==='reflection'?'Reflections':'Creations'}</Text></Pressable>)}
        </View>}
        <Text style={styles.localStatus}>{libraryEntries.length} of {visibleEntries.length} saved entries · Newest first</Text>
        {libraryEntries.length === 0 ? <Text style={styles.empty}>
          {visibleEntries.length === 0 ? 'No saved entries yet. Capture a thought when one appears.' : 'No entries match your search and filters.'}
        </Text> : libraryEntries.map(entry=>entryCard(entry))}
      </View>}
      {visitedScreens.current.has('review') && <View testID="screen-review" onLayout={() => {if(screen==='review')requestAnimationFrame(restorePendingScroll);}} style={[styles.screenContent,screen !== 'review' && styles.hiddenScreen]}>
        <Text style={styles.eyebrow}>REVIEW</Text>
        <Text accessibilityRole="header" style={styles.title}>Review what actually happened</Text>
        <Text style={styles.subtitle}>Completed tasks and linked thinking, from your saved records.</Text>
        <View testID="task-review" style={styles.panel}>
          <Text accessibilityRole="header" style={styles.panelTitle}>Task review</Text>
          <Text style={styles.muted}>{completed.length} completed</Text>
          {completed.length ? completed.map(task => <View key={task.id} style={styles.reviewTask}><View style={styles.taskBody}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open entry: ${task.title}`} disabled={busy} onPress={()=>showEntry(entriesById.get(task.entryId)!)}><Text style={styles.taskTitle}>{task.title}</Text></Pressable><Text style={styles.muted}>Completed {new Date(task.completedAt!).toLocaleString()}</Text></View>
            <IconButton name="reopen" label={`Reopen ${task.title}`} disabled={busy} onPress={()=>{setToast(null);void mutate(repo=>repo.reopenTask(task.id));}} />
            <IconButton name="remove" label={`Remove completed task: ${task.title}`} disabled={busy} onPress={() => void removeEntry(entriesById.get(task.entryId)!)} />
          </View>) : <Text style={styles.muted}>No completed tasks yet.</Text>}
        </View>
        <Text accessibilityRole="header" style={styles.panelTitle}>Linked thinking</Text>
        <Text style={styles.muted}>New interpretations never overwrite their sources.</Text>
        {linked.length ? linked.map(entry=>entryCard(entry)) : <Text style={styles.empty}>No linked reflections or creations yet. Begin one from Library or Today.</Text>}
      </View>}
      {visitedScreens.current.has('entry') && <View testID="screen-entry" onLayout={()=>{if(screen==='entry')requestAnimationFrame(restorePendingScroll);}} style={[styles.screenContent,screen!=='entry'&&styles.hiddenScreen]}>
        <View style={styles.panelHeader}><IconButton name="back" label="Back to previous view" disabled={busy} onPress={goBack} /><Text accessibilityRole="header" style={styles.panelTitle}>Entry details</Text><View style={{width:44}} /></View>
        {detailEntryId && entriesById.has(detailEntryId) ? <>{entryCard(entriesById.get(detailEntryId)!,true)}{linkedGroups(entriesById.get(detailEntryId)!)}</>:<Text style={styles.empty}>Entry unavailable.</Text>}
      </View>}
      {visitedScreens.current.has('settings') && <View testID="screen-settings" onLayout={() => {if(screen==='settings')requestAnimationFrame(restorePendingScroll);}} style={[styles.screenContent,screen!=='settings'&&styles.hiddenScreen]}>
        <Text style={styles.eyebrow}>SETTINGS</Text>
        <Text accessibilityRole="header" style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Make Noeting feel at home.</Text>
        <View style={styles.panel}>
          <Text accessibilityRole="header" style={styles.panelTitle}>Appearance</Text>
          <Text style={styles.muted}>Choose a theme. Your preference is saved on this device.</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Theme" style={styles.screenContent}>
            {([['light','Light','A soft paper background.'],['dark','Dark','Quiet dark surfaces and warm text.'],['system','Same as system','Follows your device appearance.']] as const).map(([value,label,description])=><Pressable key={value}
              accessibilityRole="radio" accessibilityLabel={label} aria-checked={preference===value}
              accessibilityState={{checked:preference===value,disabled:themeSaving}} disabled={themeSaving}
              onPress={()=>void changeTheme(value as ThemePreference)}
              style={({pressed})=>[styles.themeChoice,preference===value&&styles.selectedType,pressed&&styles.pressed]}>
              <View style={styles.taskBody}><Text style={styles.taskTitle}>{label}</Text><Text style={styles.muted}>{description}</Text></View>
              <View style={[styles.themeRadio,preference===value&&styles.themeRadioSelected]}>{preference===value&&<View style={styles.themeRadioDot}/>}</View>
            </Pressable>)}
          </View>
          <Text accessibilityLiveRegion="polite" style={styles.captureHint}>{themeSaving?'Saving…':`Current appearance: ${dark?'Dark':'Light'}`}</Text>
          {themeError&&<Text accessibilityRole="alert" style={styles.error}>{themeError}</Text>}
        </View>
      </View>}
    </ScrollView>
    <Animated.View testID="bottom-bar" accessibilityRole="tablist" accessibilityLabel="Views" aria-hidden={!barsVisible}
      pointerEvents={barsVisible ? 'auto' : 'none'}
      style={[styles.bottomBar,{transform:[{translateY:chrome.interpolate({inputRange:[0,1],outputRange:[0,110]})}],opacity:chrome.interpolate({inputRange:[0,1],outputRange:[1,0]})}]}>
      <View style={styles.navGroup}>{navigation('today')}{navigation('library')}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="Capture" disabled={busy} accessibilityState={{disabled:busy}}
        onPress={() => startCapture('note')} style={({pressed})=>[styles.capturePlus,busy&&styles.disabled,pressed&&styles.pressed]}>
        <Text accessible={false} style={styles.plusText}>+</Text>
      </Pressable>
      <View style={styles.navGroup}>{navigation('review')}{navigation('settings')}</View>
    </Animated.View>
    {toast && <View testID="undo-message" style={styles.toast} {...(toast.removal ? undoGesture.panHandlers : {})}>
      {toast.removal ? <Pressable accessibilityRole="button" accessibilityLabel="Undo" disabled={busy}
        accessibilityState={{disabled:busy}} style={styles.undoTarget} onPress={() => {
          const current=toast;
          void mutate(repo => repo.restoreEntry(current.removal!)).then(ok => {if(ok)setToast(value=>value===current?null:value);});
        }}><Text style={styles.buttonText}>Undo</Text></Pressable> : <Text accessibilityRole="alert" style={styles.muted}>{toast.message}</Text>}
    </View>}
    </View>
    <Modal visible={dialog !== null} transparent animationType={dialog === 'toolbox' || dialog === 'actions' ? 'none' : 'fade'} onRequestClose={dismissDialog}>
      <KeyboardAvoidingView testID="dialog-overlay" style={[styles.overlay,(dialog === 'toolbox' || dialog === 'actions') && styles.sheetOverlay]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable testID="dialog-backdrop" accessibilityRole="button" accessibilityLabel="Dismiss dialog" disabled={busy}
          onPress={dismissDialog} style={styles.backdrop} />
        {((dialog === 'toolbox' && target) || (dialog==='actions' && source)) ? <Animated.View testID={dialog==='actions'?'linked-actions-motion':'toolbox-motion'} style={[styles.sheetMotion,{transform:[{translateY:sheetMotion.interpolate({inputRange:[0,1],outputRange:[0,280]})}]}]}><SafeAreaView edges={['bottom']} accessibilityViewIsModal role="dialog" aria-modal style={styles.sheet}>
          {dialog==='actions'?(['reflection','creation','task'] as const).map(action=><Pressable key={action} accessibilityRole="button" accessibilityLabel={action==='reflection'?'Reflect':action==='creation'?'Create':'New task'} disabled={busy} accessibilityState={{disabled:busy}} style={({pressed})=>[styles.toolRow,pressed&&styles.pressed]}
            onPress={()=>{if(action==='task')startDerived(source!);else startLinked(source!,action);}}><Text style={styles.toolText}>{action==='reflection'?'Reflect':action==='creation'?'Create':'New task'}</Text></Pressable>):(['copy','edit','remove'] as const).map(action => <Pressable key={action} accessibilityRole="button"
            accessibilityLabel={action === 'copy' ? 'Copy' : action === 'edit' ? 'Edit' : 'Remove'} disabled={busy}
            accessibilityState={{disabled:busy}} style={({pressed})=>[styles.toolRow,busy&&styles.disabled,pressed&&styles.pressed]}
            onPress={()=>{if(action==='copy')void copyEntry(target!);else if(action==='edit')startEdit(target!);else void removeEntry(target!);}}>
            <Icon name={action} /><Text style={[styles.toolText,action==='remove'&&styles.removeText]}>{action === 'copy' ? 'Copy' : action === 'edit' ? 'Edit' : 'Remove'}</Text>
          </Pressable>)}
          {(captureError || error) && <Text accessibilityRole="alert" style={styles.error}>{captureError || error}</Text>}
        </SafeAreaView></Animated.View> : <View accessibilityViewIsModal style={styles.dialog} role="dialog" aria-modal>
          <ScrollView contentContainerStyle={styles.dialogContent} keyboardShouldPersistTaps="handled">
            <View style={styles.panelHeader}><Text accessibilityRole="header" style={styles.panelTitle}>
              {dialog === 'reminder' ? 'Schedule a pin' : dialog === 'derive' ? `New task from ${source?.kind ?? 'entry'}` : dialog === 'edit' ? 'Edit entry' : dialog === 'choose' ? 'One note for Today' : dialog === 'linked' ? thinkingKind === 'reflection' ? 'Add reflection' : 'Add creation' : 'Capture'}
            </Text><IconButton name="close" label={dialog === 'capture' ? 'Close capture' : 'Close dialog'} disabled={busy} onPress={dismissDialog} /></View>
            {dialog === 'reminder' && reminderTask ? <>
              <Text style={styles.originalText}>{reminderTask.title}</Text>
              <Text style={styles.muted}>Choose a local date and 24-hour time. The task pins while Noeting is open, or when you next open it. No notification is sent.</Text>
              <Text style={styles.muted}>Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</Text>
              <TextInput accessibilityLabel="Pin date" value={reminderDate} onChangeText={setReminderDate} editable={!busy} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={styles.searchInput} />
              <TextInput accessibilityLabel="Pin time" value={reminderTime} onChangeText={setReminderTime} editable={!busy} placeholder="HH:mm" placeholderTextColor={colors.muted} style={styles.searchInput} />
              {captureError && <Text accessibilityRole="alert" style={styles.error}>{captureError}</Text>}
              <Button label="Save scheduled pin" primary disabled={busy} onPress={()=>void saveReminder()} />
              {pinSchedules.some(r=>r.taskId===reminderTask.id && r.status==='waiting') && <Button label="Remove scheduled pin" disabled={busy} onPress={()=>void saveReminder(true)} />}
            </> : dialog === 'choose' ? <>
              <Text style={styles.muted}>New notes become your Today note. You can also choose a saved note.</Text>
              {[...notes].reverse().map((entry, index) => <View key={entry.id} style={styles.source}>
                <Text selectable style={styles.originalText}>{entry.text}</Text>
                <Button label="Select" accessibilityLabel={`Select note ${index + 1}`} disabled={busy} onPress={() => void selectNote(entry)} />
              </View>)}
            </> : <>
              {dialog === 'derive' && source ? <>
                <View style={styles.source}><Text style={styles.eyebrow}>{source?.kind==='task'?'SOURCE TASK · READ ONLY':'SOURCE NOTE · READ ONLY'}</Text><Text selectable style={styles.originalText}>{source.text}</Text></View>
                <Text style={styles.muted}>Write the action you intend to take. Its source stays unchanged.</Text>
              </> : dialog === 'linked' && source ? <>
                <View style={styles.source}><Text style={styles.eyebrow}>ORIGINAL · READ ONLY</Text><Text selectable style={styles.originalText}>{source.originalText}</Text></View>
                <Text style={styles.muted}>{thinkingKind === 'reflection' ? 'What changed in your thinking?' : 'What can you make from this?'}</Text>
              </> : dialog === 'edit' ? <Text style={styles.muted}>Update the words shown in the app.</Text> : <>
                <Text style={styles.muted}>Keep the thought.</Text>
                <View accessibilityRole="radiogroup" accessibilityLabel="Capture type" style={styles.types}>
                  {(['note', 'task'] as Kind[]).map(value => <Pressable key={value} accessibilityRole="radio"
                    accessibilityLabel={value === 'note' ? 'Note' : 'Task'} aria-checked={kind === value}
                    accessibilityState={{ checked: kind === value, disabled: busy }} disabled={busy}
                    onPress={() => {rememberDraft();loadDraft(`capture:${value}`);setKind(value);}}
                    style={[styles.type, kind === value && styles.selectedType, busy && styles.disabled]}>
                    <Text style={styles.buttonText}>{value === 'note' ? 'Note' : 'Task'}</Text>
                  </Pressable>)}
                </View>
              </>}
              <TextInput accessibilityLabel={dialog === 'derive' ? 'New task text' : dialog === 'edit' ? 'Edit entry text' : dialog === 'linked' ? 'Linked entry text' : 'Capture text'} multiline autoFocus editable={!busy} value={text}
                onChangeText={value => { setText(value); setCaptureError(null); }}
                placeholder={dialog === 'linked' ? 'Write a new linked entry…' : kind === 'note' ? 'What did you notice?' : 'What do you intend to do?'}
                placeholderTextColor={colors.muted} style={styles.input} textAlignVertical="top" />
              <Text style={styles.captureHint}>{dialog === 'derive' ? 'Save creates a separate task linked to its source.' : dialog === 'edit' ? 'Your first capture stays intact.' : dialog === 'linked' ? 'Save a separate entry. Your original words stay unchanged.' : kind === 'note' ? 'Saving makes this your Today note. No task will be created.' : 'Saving creates one task linked to your original words.'}</Text>
              {captureError && <Text accessibilityRole="alert" style={styles.error}>{captureError}</Text>}
              <Button label="Save" primary disabled={busy || !text.trim()} onPress={() => void save()} />
            </>}
          </ScrollView>
        </View>}
      </KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}

export default function App() { return <SafeAreaProvider><ThemeProvider><Noeting /></ThemeProvider></SafeAreaProvider>; }

function createStyles(colors:Palette) {return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  body: {flex:1},
  themeChoice: {flexDirection:'row',alignItems:'center',gap:12,minHeight:76,padding:14,borderRadius:12,borderWidth:1,borderColor:colors.line},
  themeRadio: {width:22,height:22,borderRadius:11,borderWidth:1.5,borderColor:colors.muted,alignItems:'center',justifyContent:'center'},
  themeRadioSelected: {borderColor:colors.green},
  themeRadioDot: {width:10,height:10,borderRadius:5,backgroundColor:colors.green},
  screenContent: {gap:16},
  hiddenScreen: {display:'none'},
  sheetMotion: {width:'100%',maxWidth:560},
  controlIcon: {width:22,height:22},
  iconTarget: {width:44,height:44,alignItems:'center',justifyContent:'center'},
  arrowGlyph: {fontSize:28,lineHeight:32,fontWeight:'400'},
  clockFace: {position:'absolute',left:1,top:1,width:20,height:20,borderRadius:10,borderWidth:1.5},
  clockVertical: {position:'absolute',left:10.25,top:5,width:1.5,height:6,borderRadius:1},
  clockHorizontal: {position:'absolute',left:10.25,top:10.25,width:5.5,height:1.5,borderRadius:1},
  returnCurve: {position:'absolute',left:4,top:4,width:15,height:14,borderTopWidth:1.6,borderRightWidth:1.6,borderBottomWidth:1.6,borderTopRightRadius:7,borderBottomRightRadius:7},
  returnHead: {position:'absolute',left:1,width:6,height:1.6,borderRadius:1},
  checkShort: {position:'absolute',left:4,top:10,width:6,height:1.8,transform:[{rotate:'45deg'}]},
  checkLong: {position:'absolute',left:7,top:8,width:11,height:1.8,transform:[{rotate:'-45deg'}]},
  entryHeading: {flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:4},
  entryFooter: {flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',gap:8},
  entryBody: {gap:10,minHeight:44,paddingVertical:4},
  edgeControls: {flexDirection:'row',alignItems:'center'},
  cornerActions: {flexDirection:'row',alignItems:'center'},
  taskTopRow: {flexDirection:'row',alignItems:'flex-start'},
  closeGlyph: {width:22,height:22,alignItems:'center',justifyContent:'center'},
  plusLine: {backgroundColor:colors.green},
  closeLine: {position:'absolute',width:20,height:1.8,backgroundColor:colors.muted,borderRadius:1},
  bottomBar: {position:'absolute',bottom:10,left:20,right:20,zIndex:2,flexDirection:'row',alignItems:'center',height:66,paddingHorizontal:8,backgroundColor:colors.white,borderWidth:1,borderColor:colors.line,borderRadius:24},
  navGroup: {flex:1,flexDirection:'row',justifyContent:'space-evenly',alignItems:'center'},
  navItem: {width:44,height:44,borderRadius:16,alignItems:'center',justifyContent:'center'},
  navActive: {backgroundColor:colors.selected},
  inactiveIcon: {opacity:0.6},
  capturePlus: {width:52,height:52,borderRadius:26,backgroundColor:colors.accentFill,alignItems:'center',justifyContent:'center'},
  plusText: {fontSize:32,lineHeight:38,color:colors.onAccent,fontWeight:'400',includeFontPadding:false},
  toast: {position:'absolute',bottom:86,alignSelf:'center',zIndex:3,backgroundColor:colors.white,borderWidth:1,borderColor:colors.line,borderRadius:22,paddingHorizontal:18,paddingVertical:0},
  undoTarget: {minHeight:44,minWidth:44,alignItems:'center',justifyContent:'center'},
  reviewTask: {flexDirection:'row',alignItems:'flex-start',gap:8},
  sheetOverlay: {justifyContent:'flex-end',padding:0},
  backdrop: {position:'absolute',top:0,bottom:0,left:0,right:0},
  sheet: {width:'100%',maxWidth:560,backgroundColor:colors.white,borderTopLeftRadius:24,borderTopRightRadius:24,paddingTop:8,paddingHorizontal:20},
  toolRow: {minHeight:58,flexDirection:'row',alignItems:'center',gap:16,paddingHorizontal:10},
  toolText: {fontSize:16,color:colors.ink},
  removeText: {color:colors.danger},
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 20 },
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingTop: 92, paddingBottom: 108, gap: 16 },
  header: { position:'absolute',top:0,left:0,right:0,zIndex:2,alignItems:'center',justifyContent:'center',backgroundColor:colors.paper,borderBottomWidth:1,borderColor:colors.line,paddingVertical:14 },
  brand: { fontSize: 27, fontWeight: '800', color: colors.ink, letterSpacing: -1.2 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandSymbol: { width: 36, height: 36 },
  eyebrow: { fontSize: 11, letterSpacing: 1.7, fontWeight: '700', color: colors.muted },
  title: { fontSize: 34, lineHeight: 39, fontWeight: '700', color: colors.ink, letterSpacing: -1.1 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  localStatus: { color: colors.muted, fontSize: 12, marginBottom: 6 },
  panel: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 18, gap: 12 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  panelTitle: { color: colors.ink, fontSize: 23, fontWeight: '600', letterSpacing: -0.5 },
  button: { minHeight: 44, paddingHorizontal: 15, paddingVertical: 11, borderRadius: 11, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 14, fontWeight: '600', color: colors.green },
  compactButton: { paddingHorizontal: 12, paddingVertical: 8 },
  compactButtonText: { fontSize: 12, fontWeight: '500' },
  ghostButton: { borderColor: 'transparent', backgroundColor: 'transparent' },
  primary: { backgroundColor: colors.accentFill, borderColor: colors.accentFill },
  primaryText: { color: colors.onAccent },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  pinCount: { fontSize: 12, color: colors.muted },
  empty: { color: colors.muted, paddingVertical: 24, textAlign: 'center' },
  task: { flexDirection: 'column', borderTopWidth: 1, borderColor: colors.line, paddingVertical: 13, borderRadius: 12 },
  pinnedTask: { backgroundColor: colors.pinned, paddingRight: 10 },
  completeTarget: { width: 44, minHeight: 44, alignItems: 'center', paddingTop: 10.5 },
  checkbox: { height: 23, width: 23, borderRadius: 7, borderWidth: 1, borderColor: colors.checkbox, backgroundColor: colors.white },
  taskBody: { flex: 1, minWidth:0, justifyContent: 'center', minHeight: 44 },
  pendingTaskBody: { justifyContent: 'flex-start', paddingVertical: 10.5 },
  taskTitle: { color: colors.ink, fontSize: 16, lineHeight: 23, fontWeight: '500', includeFontPadding: false },
  taskActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 560, maxHeight: '95%', backgroundColor: colors.white, borderRadius: 20 },
  dialogContent: { padding: 20, gap: 15 },
  types: { flexDirection: 'row', flexWrap:'wrap', gap: 10 },
  type: { flexGrow: 1, minWidth: 90, minHeight: 44, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 11 },
  selectedType: { borderColor: colors.green, backgroundColor: colors.selected },
  selectedTypeText: { color: colors.ink },
  input: { minHeight: 160, maxHeight: 250, borderWidth: 1, borderColor: colors.inputLine, borderRadius: 12, padding: 14, fontSize: 17, lineHeight: 25, color: colors.ink },
  searchInput: { minHeight: 48, borderWidth: 1, borderColor: colors.inputLine, borderRadius: 12, padding: 14, fontSize: 16, color: colors.ink, backgroundColor: colors.white },
  originalText: { color: colors.ink, fontSize: 17, lineHeight: 25 },
  captureHint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  summary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16, gap: 6 },
  source: { padding: 14, borderLeftWidth: 3, borderColor: colors.sourceLine, backgroundColor: colors.source, borderRadius: 10, gap: 7 },
  thinking: { padding: 16, backgroundColor: colors.quote, borderWidth: 1, borderColor: colors.quoteLine, borderRadius: 12, gap: 12 },
  quote: { color: colors.ink, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: 20, lineHeight: 30, letterSpacing: -0.2 },
  pinButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  pinGlyph: { width: 22, height: 22 },
  error: { color: colors.danger, backgroundColor: colors.error, padding: 12, borderRadius: 10, fontSize: 14, lineHeight: 20 },
});}
