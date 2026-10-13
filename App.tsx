import { StatusBar } from 'expo-status-bar';
import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { openRepository } from './src/data/sqlite';
import type { Entry, Repository, Task } from './src/data/repository';

const colors = { paper: '#F6F7F2', ink: '#20312B', muted: '#65766E', green: '#28644F', line: '#DCE4DC', white: '#FFFFFF' };
type Kind = Entry['kind'];

function Button({ label, onPress, disabled = false, primary = false, accessibilityLabel }: {
  label: string; onPress: () => void; disabled?: boolean; primary?: boolean; accessibilityLabel?: string;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, primary && styles.primary, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <Text style={[styles.buttonText, primary && styles.primaryText]}>{label}</Text>
  </Pressable>;
}

function Noeting() {
  const [repository, setRepository] = useState<Repository | null>(null);
  const [snapshot, setSnapshot] = useState<{ entries: Entry[]; tasks: Task[] }>({ entries: [], tasks: [] });
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [startupError, setStartupError] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('note');
  const [text, setText] = useState('');
  const requestId = useRef('');
  const busyLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let active = true;
    setStartupError(false);
    (async () => {
      try {
        const repo = await openRepository();
        const data = await repo.readSnapshot();
        if (active) { setSnapshot(data); setRepository(repo); }
      } catch { if (active) setStartupError(true); }
    })();
    return () => { active = false; };
  }, [startupAttempt]);

  const pending = snapshot.tasks.filter(task => task.status === 'pending')
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const pinnedCount = pending.filter(task => task.pinned).length;
  const noteCount = snapshot.entries.filter(entry => entry.kind === 'note').length;

  function startCapture(nextKind: Kind) {
    if (busyLock.current || !repository) return;
    requestId.current = randomUUID();
    setKind(nextKind); setText(''); setCaptureError(null); setCaptureOpen(true);
  }

  async function saveCapture() {
    if (!repository || busyLock.current || !text.trim()) return;
    busyLock.current = true; setBusy(true); setCaptureError(null);
    try {
      await repository.saveCapture({ requestId: requestId.current, kind, text });
      setCaptureOpen(false); setText('');
      try { setSnapshot(await repository.readSnapshot()); }
      catch { setError('Your capture was saved, but the list could not refresh. Please refresh tasks.'); }
    } catch {
      setCaptureError('Could not confirm the save. Your text is still here. Please try again.');
    } finally { busyLock.current = false; setBusy(false); }
  }

  async function updateTask(action: (repo: Repository) => Promise<void>) {
    if (!repository || busyLock.current) return;
    busyLock.current = true; setBusy(true); setError(null);
    try {
      await action(repository);
      try { setSnapshot(await repository.readSnapshot()); }
      catch { setError('Your task was updated, but the list could not refresh. Please refresh tasks.'); }
    }
    catch { setError('Could not update the task. Please try again.'); }
    finally { busyLock.current = false; setBusy(false); }
  }

  if (!repository) return <SafeAreaView style={styles.safe}><View style={styles.loading}>
    <Text style={styles.brand}>noeting.</Text>
    {startupError ? <>
      <Text accessibilityRole="alert" style={styles.error}>Could not open local storage. Your data has not been cleared.
        {Platform.OS === 'web' ? ' Close any other Noeting tabs, then retry.' : ''}</Text>
      <Button label="Retry opening storage" onPress={() => {
        // A failed Expo SQLite web worker needs a new page after a storage lock is released.
        if (Platform.OS === 'web') globalThis.location.reload();
        else setStartupAttempt(value => value + 1);
      }} />
    </> : <><ActivityIndicator color={colors.green} /><Text style={styles.muted}>Opening your local notes…</Text></>}
  </View></SafeAreaView>;

  return <SafeAreaView style={styles.safe}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.header}><Text style={styles.brand}>noeting.</Text>
        {!paused && <Button label="Capture" primary disabled={busy} onPress={() => startCapture('note')} />}
      </View>
      {paused ? <View style={styles.stop}>
        <Text accessibilityRole="header" style={styles.title}>Enough for today.</Text>
        <Text style={styles.muted}>Your notes and tasks are saved locally. Return when you choose.</Text>
        <Button label="Return to Today" onPress={() => setPaused(false)} />
      </View> : <>
        <Text style={styles.eyebrow}>TODAY</Text>
        <Text accessibilityRole="header" style={styles.title}>Make room for what matters</Text>
        <Text style={styles.subtitle}>Capture a thought. Choose a task. Then return to your day.</Text>
        <Text style={styles.localStatus}>{noteCount} {noteCount === 1 ? 'note' : 'notes'} saved locally · No account needed</Text>
        {error && <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          <Button label="Refresh tasks" disabled={busy} onPress={() => void updateTask(async () => undefined)} />
        </View>}
        <View style={styles.panel}>
          <View style={styles.panelHeader}><Text accessibilityRole="header" style={styles.panelTitle}>Tasks</Text>
            <Button label="+ Add task" disabled={busy} onPress={() => startCapture('task')} />
          </View>
          <Text style={styles.muted}>Pin up to three tasks to keep them at the top.</Text>
          <Text style={styles.pinCount}>{pinnedCount} / 3 pinned</Text>
          {pending.length === 0 ? <Text style={styles.empty}>No pending tasks</Text> : pending.map(task => <View key={task.id}
            testID={`task-${task.id}`} style={[styles.task, task.pinned && styles.pinnedTask]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Complete ${task.title}`} disabled={busy}
              accessibilityState={{ disabled: busy }} onPress={() => void updateTask(repo => repo.completeTask(task.id))}
              style={({ pressed }) => [styles.completeTarget, pressed && styles.pressed]}>
              <View style={styles.checkbox} />
            </Pressable>
            <View style={styles.taskBody}>
              <Text style={styles.taskTitle}>{task.title}</Text>
              <View style={styles.taskActions}><Button label={task.pinned ? 'Unpin' : 'Pin'}
                accessibilityLabel={`${task.pinned ? 'Unpin' : 'Pin'} ${task.title}`}
                disabled={busy || (!task.pinned && pinnedCount >= 3)}
                onPress={() => void updateTask(repo => repo.setPinned(task.id, !task.pinned))} /></View>
            </View>
          </View>)}
        </View>
        <View style={styles.stop}>
          <Text style={styles.eyebrow}>DELIBERATE STOP</Text>
          <Text accessibilityRole="header" style={styles.panelTitle}>Enough for today.</Text>
          <Text style={styles.muted}>Leave when you have what you need.</Text>
          <Button label="Finish session" disabled={busy} onPress={() => setPaused(true)} />
        </View>
      </>}
    </ScrollView>
    <Modal visible={captureOpen} transparent animationType="fade" onRequestClose={() => { if (!busyLock.current) setCaptureOpen(false); }}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View accessibilityViewIsModal style={styles.dialog} role="dialog" aria-modal>
          <ScrollView contentContainerStyle={styles.dialogContent} keyboardShouldPersistTaps="handled">
          <View style={styles.panelHeader}><Text accessibilityRole="header" style={styles.panelTitle}>Capture</Text>
            <Button label="Close capture" disabled={busy} onPress={() => setCaptureOpen(false)} />
          </View>
          <Text style={styles.muted}>Keep the thought, then return.</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Capture type" style={styles.types}>
            {(['note', 'task'] as Kind[]).map(value => <Pressable key={value} accessibilityRole="radio"
              accessibilityLabel={value === 'note' ? 'Note' : 'Task'} aria-checked={kind === value}
              accessibilityState={{ checked: kind === value, disabled: busy }}
              disabled={busy} onPress={() => { setKind(value); setCaptureError(null); }}
              style={[styles.type, kind === value && styles.selectedType, busy && styles.disabled]}>
              <Text style={[styles.buttonText, kind === value && styles.selectedTypeText]}>{value === 'note' ? 'Note' : 'Task'}</Text>
            </Pressable>)}
          </View>
          <TextInput accessibilityLabel="Capture text" multiline autoFocus editable={!busy} value={text}
            onChangeText={value => { setText(value); setCaptureError(null); }} placeholder={kind === 'note' ? 'What did you notice?' : 'What do you intend to do?'}
            placeholderTextColor={colors.muted} style={styles.input} textAlignVertical="top" />
          <Text style={styles.captureHint}>{kind === 'note' ? 'A note stays a note. No task will be created.' : 'Saving creates one task linked to your original words.'}</Text>
          {captureError && <Text accessibilityRole="alert" style={styles.error}>{captureError}</Text>}
          <Button label={busy ? 'Saving…' : 'Save & close'} primary disabled={busy || !text.trim()} onPress={() => void saveCapture()} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}

export default function App() { return <SafeAreaProvider><Noeting /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 20 },
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 48, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line, paddingBottom: 20, marginBottom: 20 },
  brand: { fontSize: 27, fontWeight: '800', color: colors.ink, letterSpacing: -1.2 },
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
  primary: { backgroundColor: colors.green, borderColor: colors.green },
  primaryText: { color: colors.white },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  pinCount: { fontSize: 12, color: colors.muted },
  empty: { color: colors.muted, paddingVertical: 24, textAlign: 'center' },
  task: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.line, paddingVertical: 13, borderRadius: 12 },
  pinnedTask: { backgroundColor: '#F2F7F2', paddingRight: 10 },
  completeTarget: { width: 44, minHeight: 44, alignItems: 'center', paddingTop: 3 },
  checkbox: { height: 23, width: 23, borderRadius: 7, borderWidth: 1, borderColor: '#97B39F', backgroundColor: colors.white },
  taskBody: { flex: 1, gap: 10 },
  taskTitle: { color: colors.ink, fontSize: 16, lineHeight: 23, fontWeight: '500' },
  taskActions: { flexDirection: 'row' },
  stop: { borderWidth: 1, borderColor: '#D5E5D9', backgroundColor: '#EDF4EE', borderRadius: 20, padding: 20, gap: 15, alignItems: 'flex-start', marginTop: 8 },
  overlay: { flex: 1, backgroundColor: '#10231B66', justifyContent: 'center', alignItems: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 560, maxHeight: '95%', backgroundColor: colors.white, borderRadius: 20 },
  dialogContent: { padding: 20, gap: 15 },
  types: { flexDirection: 'row', gap: 10 },
  type: { flex: 1, minHeight: 44, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 11 },
  selectedType: { borderColor: colors.green, backgroundColor: '#EDF4EE' },
  selectedTypeText: { color: colors.ink },
  input: { minHeight: 160, maxHeight: 250, borderWidth: 1, borderColor: '#AABDB0', borderRadius: 12, padding: 14, fontSize: 17, lineHeight: 25, color: colors.ink },
  captureHint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  error: { color: '#923C32', backgroundColor: '#FFF1ED', padding: 12, borderRadius: 10, fontSize: 14, lineHeight: 20 },
});
