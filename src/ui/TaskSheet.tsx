import { useRef, useState, type ReactNode } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Entry, Task } from '../data/repository';
import { Button, Check, IconButton } from './controls';
import { useStyles } from './styles';
export function TaskSheet({entry,task,source,children,entries,onClose,onBack,onOpen,onSource,onEdit,onRemove,onAdd,onToggle,busy,readOnly=false,highlightTaskId,notice,error}:{entry:Entry;task?:Task;source?:Entry;children:Task[];entries:Map<string,Entry>;onClose:()=>void;onBack?:()=>void;onOpen:(entryId:string)=>void;onSource:(id:string)=>void;onEdit:()=>void;onRemove:()=>void;onAdd:()=>void;onToggle:(task:Task)=>void;busy:boolean;readOnly?:boolean;highlightTaskId?:string;notice?:ReactNode;error?:string|null}) {
  const {styles}=useStyles();
  const [more,setMore]=useState(false);
  const [original,setOriginal]=useState(false);
  const [copyError,setCopyError]=useState(false);
  const scroll=useRef<ScrollView>(null);
  const sectionY=useRef(0);
  const editable=!entry.removed&&!readOnly&&!!task;
  async function copy(){try{await Clipboard.setStringAsync(entry.text);setMore(false);setCopyError(false);}catch{setCopyError(true);}}
  return <>
    <View style={styles.noteToolbar}>{onBack?<IconButton name="back" label="Back to task" onPress={onBack}/>:<View style={styles.grow}/>}
      <View style={styles.grow}/>{editable&&<IconButton name="edit" label={task?.parentTaskId?'Edit subtask':'Edit task'} onPress={onEdit} disabled={busy}/>}
      <IconButton name="more" label="More task actions" onPress={()=>setMore(value=>!value)} disabled={busy}/><IconButton name="close" label="Close task" onPress={onClose} disabled={busy}/>
    </View>
    {more&&<View style={styles.menu}><Button quiet label="Copy" onPress={()=>void copy()}/>{entry.text!==entry.originalText&&<Button quiet label="View original capture" onPress={()=>{setOriginal(value=>!value);setMore(false);}}/>}{editable&&<Button quiet label={task?.parentTaskId?'Remove subtask':'Remove task'} danger onPress={onRemove}/>}</View>}
    <ScrollView ref={scroll} contentContainerStyle={styles.taskContent} keyboardShouldPersistTaps="handled">
      {task?.parentTaskId&&<Button quiet label={task.parentRemoved?'Parent removed':`Under: ${task.parentText}`} onPress={()=>{if(task.parentEntryId)onOpen(task.parentEntryId);}}/>}
      <View style={styles.row}>{task&&<Check checked={task.status==='completed'} label={task.status==='completed'?'Reopen task':'Complete task'} disabled={busy||!editable} onPress={()=>onToggle(task)}/>}<Text selectable accessibilityRole="header" style={[styles.taskBody,styles.grow]}>{entry.text}</Text></View>
      <Text style={styles.meta}>{new Date(entry.createdAt).toLocaleString()}{entry.removed?' · Removed':readOnly?' · Read only':''}</Text>
      {(error||copyError)&&<Text accessibilityRole="alert" style={styles.error}>{error??'Could not copy. Try again.'}</Text>}
      {source&&<Pressable accessibilityRole="button" accessibilityLabel={source.kind==='note'?'View source Note':'View legacy source'} onPress={()=>onSource(source.id)} style={styles.sourceRow}>
        <Text style={styles.section}>{source.kind==='note'?'Linked from':'Legacy source · Task'}{source.removed?' · Removed':''}</Text><Text numberOfLines={3} style={styles.quoteText}>{entry.sourceText??source.originalText}</Text>
      </Pressable>}
      {original&&<View style={styles.linkSection}><Text style={styles.section}>Original capture</Text><Text selectable style={styles.quoteText}>{entry.originalText}</Text></View>}
      {(!task?.parentTaskId||children.length>0)&&<View onLayout={event=>{sectionY.current=event.nativeEvent.layout.y;}} style={styles.subtaskSection}>
        <Text style={styles.section}>Subtasks</Text>{children.map(child=>{const childEntry=entries.get(child.entryId);if(!childEntry)return null;return <View key={child.id} testID={`subtask-${child.id}`} onLayout={event=>{if(child.id===highlightTaskId){const y=event.nativeEvent.layout.y;requestAnimationFrame(()=>scroll.current?.scrollTo({y:sectionY.current+y,animated:false}));}}} style={[styles.linkTaskRow,child.id===highlightTaskId&&styles.highlight]}>
          <Check checked={child.status==='completed'} label={`${child.status==='completed'?'Reopen':'Complete'} subtask: ${childEntry.text}`} onPress={()=>onToggle(child)} disabled={busy||readOnly}/>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open subtask: ${childEntry.text}`} onPress={()=>onOpen(child.entryId)} style={styles.linkPreview}><Text style={[styles.linkText,child.status==='completed'&&styles.completed]}>{childEntry.text}</Text></Pressable>
        </View>;})}
        {editable&&!task?.parentTaskId&&<Button quiet label="Add subtask" onPress={onAdd} disabled={busy}/>}
      </View>}
    </ScrollView>
    {notice}
  </>;
}
