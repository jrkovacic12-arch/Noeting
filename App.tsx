import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { openRepository } from './src/data/sqlite';
import type { EntryKind, Repository, Removal, Snapshot, Task } from './src/data/repository';
import { clearLegacyNotifications } from './src/notificationDriver';
import { ThemeProvider } from './src/theme';
import { EntryList } from './src/ui/EntryList';
import { EntryDetail } from './src/ui/EntryDetail';
import { EntryEditor, type EditorDraft } from './src/ui/EntryEditor';
import { Button } from './src/ui/controls';
import { useStyles } from './src/ui/styles';

function Noeting(){
  const {styles,colors}=useStyles();
  const [repo,setRepo]=useState<Repository|null>(null);
  const [data,setData]=useState<Snapshot>({entries:[],tasks:[],chosenEntryId:null});
  const [tab,setTab]=useState<EntryKind>('note');
  const [queries,setQueries]=useState({note:'',task:''});
  const [stack,setStack]=useState<string[]>([]);
  const [draft,setDraft]=useState<EditorDraft|null>(null);
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  const [error,setError]=useState<string|null>(null);
  const [editorError,setEditorError]=useState<string|null>(null);
  const [attempt,setAttempt]=useState(0);
  const [removal,setRemoval]=useState<Removal|null>(null);
  const cleanupDone=useRef(false);
  useEffect(()=>{
    let active=true;
    setError(null);
    openRepository().then(async repository=>{
      const snapshot=await repository.readSnapshot();
      if(active){setData(snapshot);setRepo(repository);}
    }).catch(()=>{if(active)setError('Could not open your saved entries. Try again.');});
    return ()=>{active=false;};
  },[attempt]);
  useEffect(()=>{
    // Cleanup is safe to retry on resume. It never requests permission or schedules work.
    async function cleanup(){if(cleanupDone.current)return;try{await clearLegacyNotifications();cleanupDone.current=true;}catch{/* Retry on the next resume. */}}
    void cleanup();
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')void cleanup();});
    return ()=>subscription.remove();
  },[]);
  const back=useCallback(()=>{if(lock.current)return;setStack(previous=>previous.slice(0,-1));},[]);
  useEffect(()=>{const listener=BackHandler.addEventListener('hardwareBackPress',()=>{
    if(lock.current)return true;
    if(draft){setDraft(null);return true;}
    if(stack.length){back();return true;}
    return false;
  });return ()=>listener.remove();},[draft,stack.length,back]);
  useEffect(()=>{if(!removal)return;const timer=setTimeout(()=>setRemoval(null),8000);return ()=>clearTimeout(timer);},[removal]);
  const entries=useMemo(()=>new Map(data.entries.map(entry=>[entry.id,entry])),[data.entries]);
  const tasks=useMemo(()=>new Map(data.tasks.map(task=>[task.entryId,task])),[data.tasks]);
  const selected=entries.get(stack[stack.length-1]);
  const visible=useMemo(()=>data.entries.filter(entry=>!entry.removed&&entry.kind===tab&&entry.text.toLocaleLowerCase().includes(queries[tab].trim().toLocaleLowerCase())).reverse(),[data.entries,tab,queries]);
  function editDraft(next:EditorDraft){setEditorError(null);setDraft(next);}
  async function action(operation:(repository:Repository)=>Promise<void>){
    if(!repo||lock.current)return;
    lock.current=true;setBusy(true);setError(null);
    try{await operation(repo);setData(await repo.readSnapshot());}
    catch{setError('Could not save this change. Please try again.');}
    finally{lock.current=false;setBusy(false);}
  }
  function toggle(task:Task){void action(repository=>task.status==='completed'?repository.reopenTask(task.id):repository.completeTask(task.id));}
  async function save(){
    if(!repo||!draft||lock.current)return;
    lock.current=true;setBusy(true);setEditorError(null);
    try{
      if(draft.editEntryId)await repo.editEntry(draft.editEntryId,draft.text);
      else if(draft.sourceEntryId)await repo.saveLinkedEntry({...draft,sourceEntryId:draft.sourceEntryId});
      else await repo.saveCapture(draft);
      setData(await repo.readSnapshot());setDraft(null);
    }catch{setEditorError('Could not save. Your words are still here. Try again.');}
    finally{lock.current=false;setBusy(false);}
  }
  return <SafeAreaView style={styles.app}><View style={styles.frame}>
    {!repo?<View style={styles.empty}>{error?<><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Button label="Retry" onPress={()=>setAttempt(value=>value+1)}/></>:<ActivityIndicator accessibilityLabel="Loading entries" color={colors.accent}/>}</View>:<>
      {error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {selected?<EntryDetail entry={selected} task={tasks.get(selected.id)} source={entries.get(selected.sourceEntryId??'')}
        children={data.entries.filter(entry=>!entry.removed&&entry.sourceEntryId===selected.id)} busy={busy} onBack={back}
        onOpen={id=>setStack(previous=>[...previous,id])}
        onToggle={()=>{const task=tasks.get(selected.id);if(task)toggle(task);}}
        onEdit={()=>editDraft({kind:selected.kind,text:selected.text,editEntryId:selected.id,requestId:randomUUID()})}
        onRemove={()=>{void action(async repository=>{const removed=await repository.removeEntry(selected.id);setRemoval(removed);setStack(previous=>previous.slice(0,-1));});}}
        onLink={kind=>editDraft({kind,text:'',requestId:randomUUID(),sourceEntryId:selected.id})}/>:<>
        <EntryList kind={tab} entries={visible} tasks={tasks} query={queries[tab]} onQuery={query=>setQueries(previous=>({...previous,[tab]:query}))} busy={busy}
          onOpen={id=>setStack([id])} onAdd={()=>editDraft({kind:tab,text:'',requestId:randomUUID()})} onToggle={toggle}/>
        <View accessibilityRole="tablist" style={styles.nav}>{(['note','task'] as const).map(kind=><Pressable key={kind} accessibilityRole="tab" accessibilityLabel={kind==='note'?'Notes':'Tasks'} aria-selected={kind===tab} accessibilityState={{selected:kind===tab}} onPress={()=>setTab(kind)} style={[styles.tab,kind===tab&&styles.tabSelected]}><Text style={[styles.tabText,kind===tab&&styles.tabActive]}>{kind==='note'?'Notes':'Tasks'}</Text></Pressable>)}</View>
      </>}
      {removal&&<View style={styles.notice}><Text style={[styles.cardText,styles.grow]}>Entry removed</Text><Button label="Undo" disabled={busy} onPress={()=>{void action(async repository=>{await repository.restoreEntry(removal);setRemoval(null);});}}/></View>}
    </>}
    {draft&&<EntryEditor draft={draft} onChange={text=>setDraft(previous=>previous?{...previous,text}:null)} onClose={()=>setDraft(null)} onSave={()=>void save()} busy={busy} error={editorError}/>}
  </View></SafeAreaView>;
}
export default function App(){return <SafeAreaProvider><ThemeProvider><Noeting/></ThemeProvider></SafeAreaProvider>;}
