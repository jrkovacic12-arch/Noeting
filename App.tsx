import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Keyboard, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { openRepository } from './src/data/sqlite';
import type { EntryKind, Repository, Removal, Snapshot, Task } from './src/data/repository';
import { indexSnapshot, visibleEntries } from './src/data/selectors';
import { clearLegacyNotifications } from './src/notificationDriver';
import { ThemeProvider } from './src/theme';
import { EntryList } from './src/ui/EntryList';
import { NoteDetail } from './src/ui/NoteDetail';
import { TaskSheet } from './src/ui/TaskSheet';
import { Sheet } from './src/ui/Sheet';
import { EditorBody, NoteEditor, type EditorDraft } from './src/ui/EntryEditor';
import { useDraft } from './src/ui/useDraft';
import { Button } from './src/ui/controls';
import { useStyles } from './src/ui/styles';

type TaskRoute={id:string;readOnly?:boolean;highlightTaskId?:string};
type NoteRoute={id:string;readOnly?:boolean;returnTasks?:TaskRoute[]};
function Noeting() {
  const {styles,colors}=useStyles();
  const [repo,setRepo]=useState<Repository|null>(null);
  const [data,setData]=useState<Snapshot>({entries:[],tasks:[],chosenEntryId:null});
  const [tab,setTab]=useState<EntryKind>('note');
  const [queries,setQueries]=useState({note:'',task:''});
  const [notes,setNotes]=useState<NoteRoute[]>([]);
  const [taskRoutes,setTaskRoutes]=useState<TaskRoute[]>([]);
  const drafts=useDraft(!!repo);const {draft,setDraft}=drafts;
  const [editorVisible,setEditorVisible]=useState(false);
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  const [error,setError]=useState<string|null>(null);
  const [editorError,setEditorError]=useState<string|null>(null);
  const [attempt,setAttempt]=useState(0);
  const [removal,setRemoval]=useState<Removal|null>(null);
  const cleanupDone=useRef(false);
  useEffect(()=>{
    let active=true;setError(null);
    openRepository().then(async repository=>{const snapshot=await repository.readSnapshot();if(active){setData(snapshot);setRepo(repository);}})
      .catch(()=>{if(active)setError('Could not open your saved entries. Try again.');});
    return ()=>{active=false;};
  },[attempt]);
  useEffect(()=>{
    async function cleanup(){if(cleanupDone.current)return;try{await clearLegacyNotifications();cleanupDone.current=true;}catch{/* Retry on resume. */}}
    void cleanup();const subscription=AppState.addEventListener('change',state=>{if(state==='active')void cleanup();});
    return ()=>subscription.remove();
  },[]);
  const backNote=useCallback(()=>{
    if(lock.current)return;
    const current=notes[notes.length-1];
    if(current?.returnTasks)setTaskRoutes(current.returnTasks);
    setNotes(previous=>previous.slice(0,-1));
  },[notes]);
  async function hideEditor(){if(lock.current)return;if(Keyboard.isVisible()){Keyboard.dismiss();return;}if(await drafts.flush())setEditorVisible(false);}
  function dismissTask(){if(lock.current)return;if(Keyboard.isVisible()){Keyboard.dismiss();return;}if(editorVisible)void hideEditor();else setTaskRoutes([]);}
  useEffect(()=>{const listener=BackHandler.addEventListener('hardwareBackPress',()=>{
    if(lock.current)return true;
    if(Keyboard.isVisible()){Keyboard.dismiss();return true;}
    if(editorVisible){void hideEditor();return true;}
    if(taskRoutes.length){setTaskRoutes(previous=>previous.slice(0,-1));return true;}
    if(notes.length){backNote();return true;}
    if(tab==='task'){setTab('note');return true;}
    return false;
  });return ()=>listener.remove();},[editorVisible,taskRoutes.length,notes.length,backNote,tab]);
  useEffect(()=>{if(!removal)return;const timer=setTimeout(()=>setRemoval(null),8000);return ()=>clearTimeout(timer);},[removal]);
  const {entries,tasks,children}=useMemo(()=>indexSnapshot(data),[data]);
  const visible=useMemo(()=>visibleEntries(data,tab,queries[tab]),[data,tab,queries]);
  const noteRoute=notes[notes.length-1];const note=entries.get(noteRoute?.id);
  const taskRoute=taskRoutes[taskRoutes.length-1];const taskEntry=entries.get(taskRoute?.id);
  const selectedTask=taskEntry?tasks.get(taskEntry.id):undefined;
  const selectedTaskId=selectedTask?.id??data.tasks.find(task=>task.parentEntryId===taskEntry?.id)?.parentTaskId;
  function beginDraft(next:EditorDraft){setEditorError(null);if(!draft)setDraft(next);setEditorVisible(true);}
  async function action(operation:(repository:Repository)=>Promise<void>) {
    if(!repo||lock.current)return;lock.current=true;setBusy(true);setError(null);
    try{await operation(repo);setData(await repo.readSnapshot());}
    catch{setError('Could not save this change. Please try again.');}
    finally{lock.current=false;setBusy(false);}
  }
  function toggle(task:Task){void action(repository=>task.status==='completed'?repository.reopenTask(task.id):repository.completeTask(task.id));}
  function openEntry(id:string,readOnly=false) {
    const entry=entries.get(id);if(!entry)return;
    if(entry.kind==='note')setNotes(previous=>[...previous,{id,readOnly}]);
    else setTaskRoutes(previous=>[...previous,{id,readOnly}]);
  }
  function openFromList(id:string) {
    const task=tasks.get(id);
    if(queries.task.trim()&&task?.parentTaskId&&!task.parentRemoved&&task.parentEntryId)setTaskRoutes([{id:task.parentEntryId,highlightTaskId:task.id}]);
    else openEntry(id);
  }
  function openSource(id:string) {
    const source=entries.get(id);if(!source)return;
    if(source.kind==='note'){setNotes(previous=>[...previous,{id,readOnly:true,returnTasks:taskRoutes}]);setTaskRoutes([]);}
    else setTaskRoutes(previous=>[...previous,{id,readOnly:true}]);
  }
  async function save() {
    if(!repo||!draft||lock.current)return;lock.current=true;setBusy(true);setEditorError(null);
    try{
      if(draft.editEntryId)await repo.editEntry(draft.editEntryId,draft.text);
      else if(draft.parentTaskId)await repo.saveSubtask({requestId:draft.requestId,parentTaskId:draft.parentTaskId,text:draft.text});
      else if(draft.sourceEntryId)await repo.saveLinkedEntry({...draft,sourceEntryId:draft.sourceEntryId});
      else await repo.saveCapture(draft);
      setData(await repo.readSnapshot());
      if(draft.sourceEntryId&&notes[notes.length-1]?.id!==draft.sourceEntryId)setNotes(previous=>[...previous,{id:draft.sourceEntryId!}]);
      setDraft(null);setEditorVisible(false);
    }catch{setEditorError('Could not save. Your words are still here. Try again.');}
    finally{lock.current=false;setBusy(false);}
  }
  function remove(id:string,kind:EntryKind){void action(async repository=>{
    const removed=await repository.removeEntry(id);setRemoval(removed);
    if(kind==='note')setNotes(previous=>previous.slice(0,-1));else setTaskRoutes(previous=>previous.slice(0,-1));
  });}
  const notice=removal?<View style={styles.notice}><Text style={[styles.cardText,styles.grow]}>Entry removed</Text><Button label="Undo" disabled={busy} onPress={()=>{void action(async repository=>{await repository.restoreEntry(removal);setRemoval(null);});}}/></View>:null;
  const editorProps=draft?{draft,onChange:(text:string)=>setDraft({...draft,text}),onCancel:()=>{if(!lock.current){setDraft(null);setEditorVisible(false);}},onSave:()=>void save(),busy,error:editorError??drafts.error}:null;
  const noteEditor=editorVisible&&draft?.kind==='note';
  const modalVisible=!!noteEditor||!!taskEntry||editorVisible&&draft?.kind==='task';
  return <SafeAreaView style={styles.app}><View style={styles.frame}><View style={styles.grow} aria-hidden={!!modalVisible} accessibilityElementsHidden={!!modalVisible} importantForAccessibility={modalVisible?'no-hide-descendants':'auto'}>
    {!repo||!drafts.ready?<View style={styles.empty}>{error?<><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Button label="Retry" onPress={()=>setAttempt(value=>value+1)}/></>:<ActivityIndicator accessibilityLabel="Loading entries" color={colors.accent}/>}</View>:<>
      {(error||drafts.error)&&<Text accessibilityRole="alert" style={styles.error}>{error??drafts.error}</Text>}
      {note?<NoteDetail key={`${note.id}-${noteRoute.readOnly}`} entry={note} source={entries.get(note.sourceEntryId??'')} children={data.entries.filter(entry=>!entry.removed&&entry.sourceEntryId===note.id)} tasks={tasks} readOnly={noteRoute.readOnly} busy={busy} onBack={backNote}
        onOpen={id=>openEntry(id,noteRoute.readOnly||id===note.sourceEntryId&&entries.get(id)?.kind==='task')} onToggle={toggle}
        onEdit={()=>beginDraft({kind:'note',text:note.text,editEntryId:note.id,requestId:randomUUID()})}
        onRemove={()=>remove(note.id,'note')}
        onLink={kind=>beginDraft({kind,text:'',requestId:randomUUID(),sourceEntryId:note.id,sourcePreview:note.text})}/>:<>
        <EntryList kind={tab} entries={visible} tasks={tasks} children={children} query={queries[tab]} onQuery={query=>setQueries(previous=>({...previous,[tab]:query}))} busy={busy} onOpen={openFromList} onAdd={()=>beginDraft({kind:tab,text:'',requestId:randomUUID()})} onToggle={toggle}/>
        <View accessibilityRole="tablist" style={styles.nav}>{(['note','task'] as const).map(kind=><Pressable key={kind} accessibilityRole="tab" accessibilityLabel={kind==='note'?'Notes':'Tasks'} aria-selected={kind===tab} accessibilityState={{selected:kind===tab}} onPress={()=>setTab(kind)} style={[styles.tab,kind===tab&&styles.tabSelected]}><Text style={[styles.tabText,kind===tab&&styles.tabActive]}>{kind==='note'?'Notes':'Tasks'}</Text></Pressable>)}</View>
      </>}
      {draft&&!editorVisible&&<Button quiet label="Resume draft" onPress={()=>setEditorVisible(true)}/>}{notice}
    </>}
    </View>
    {!noteEditor&&(taskEntry||editorVisible&&draft?.kind==='task')&&<Sheet label={editorVisible&&draft?.parentTaskId?'Subtask':'Task'} onDismiss={dismissTask} onBack={!editorVisible&&taskRoutes.length>1?()=>setTaskRoutes(previous=>previous.slice(0,-1)):undefined}>
      {editorVisible&&editorProps?<EditorBody {...editorProps}/>:taskEntry?<TaskSheet key={taskEntry.id} entry={taskEntry} task={selectedTask} source={entries.get(taskEntry.sourceEntryId??'')} children={children.get(selectedTaskId??'')??[]} entries={entries} readOnly={taskRoute.readOnly} highlightTaskId={taskRoute.highlightTaskId} error={error} notice={<>{draft&&!editorVisible&&<Button quiet label="Resume draft" onPress={()=>setEditorVisible(true)}/>} {notice}</>} busy={busy}
        onClose={dismissTask} onBack={taskRoutes.length>1?()=>setTaskRoutes(previous=>previous.slice(0,-1)):undefined}
        onOpen={id=>openEntry(id,taskRoute.readOnly)} onSource={openSource} onToggle={toggle}
        onEdit={()=>beginDraft({kind:'task',text:taskEntry.text,requestId:randomUUID(),editEntryId:taskEntry.id,parentTaskId:selectedTask?.parentTaskId??undefined,parentPreview:selectedTask?.parentText??undefined})}
        onRemove={()=>remove(taskEntry.id,'task')}
        onAdd={()=>{if(selectedTask)beginDraft({kind:'task',text:'',requestId:randomUUID(),parentTaskId:selectedTask.id,parentPreview:taskEntry.text});}}/>:null}
    </Sheet>}
    {noteEditor&&editorProps&&<NoteEditor {...editorProps} onDismiss={()=>void hideEditor()}/>}
  </View></SafeAreaView>;
}
export default function App(){return <SafeAreaProvider><ThemeProvider><Noeting/></ThemeProvider></SafeAreaProvider>;}
