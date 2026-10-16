import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Entry, Task } from '../data/repository';
import { Button, Check, IconButton } from './controls';
import { useStyles } from './styles';
export function NoteDetail({entry,source,children,tasks,onBack,onOpen,onEdit,onRemove,onLink,onToggle,busy,readOnly=false}:{entry:Entry;source?:Entry;children:Entry[];tasks:Map<string,Task>;onBack:()=>void;onOpen:(id:string)=>void;onEdit:()=>void;onRemove:()=>void;onLink:(kind:Entry['kind'])=>void;onToggle:(task:Task)=>void;busy:boolean;readOnly?:boolean}) {
  const {styles}=useStyles();
  const [menu,setMenu]=useState<'more'|'link'|null>(null);
  const [original,setOriginal]=useState(false);
  const [copyError,setCopyError]=useState(false);
  const editable=!entry.removed&&!readOnly;
  async function copy(){try{await Clipboard.setStringAsync(entry.text);setMenu(null);setCopyError(false);}catch{setCopyError(true);}}
  return <View style={styles.grow}>
    <View style={styles.noteToolbar}><IconButton name="back" label="Back" onPress={onBack}/><View style={styles.grow}/>
      {editable&&<><IconButton name="edit" label="Edit note" onPress={onEdit} disabled={busy}/><IconButton name="link" label="Add linked entry" onPress={()=>setMenu(menu==='link'?null:'link')} disabled={busy}/></>}
      <IconButton name="more" label="More note actions" onPress={()=>setMenu(menu==='more'?null:'more')} disabled={busy}/>
    </View>
    {menu&&<View style={styles.menu}>
      {menu==='link'?<><Button quiet label="New linked note" onPress={()=>{setMenu(null);onLink('note');}}/><Button quiet label="New linked task" onPress={()=>{setMenu(null);onLink('task');}}/></>:<>
        <Button quiet label="Copy" onPress={()=>void copy()}/>
        {entry.text!==entry.originalText&&<Button quiet label="View original capture" onPress={()=>{setOriginal(value=>!value);setMenu(null);}}/>}
        {editable&&<Button quiet label="Remove note" danger onPress={onRemove}/>}</>}
    </View>}
    <ScrollView contentContainerStyle={styles.noteContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.meta}>{new Date(entry.createdAt).toLocaleString()}{entry.removed?' · Removed':readOnly?' · Read only':''}</Text>
      <Text selectable style={styles.noteBody}>{entry.text}</Text>
      {copyError&&<Text accessibilityRole="alert" style={styles.error}>Could not copy. Try again.</Text>}
      {original&&<View style={styles.linkSection}><Text style={styles.section}>Original capture</Text><Text selectable style={styles.quoteText}>{entry.originalText}</Text></View>}
      {(source||children.length>0)&&<View style={styles.linkSection}><Text style={styles.section}>Linked entries</Text>
        {source&&<Pressable accessibilityRole="button" accessibilityLabel={source.kind==='note'?'From note':'Read-only legacy source'} onPress={()=>onOpen(source.id)} style={styles.linkRow}>
          <Text style={styles.meta}>{source.kind==='note'?'From note':'Legacy source · Task'}{source.removed?' · Removed':''}</Text>
          <Text numberOfLines={3} style={styles.linkText}>{entry.sourceText??source.originalText}</Text>
        </Pressable>}
        {(['note','task'] as const).map(kind=>{const matches=children.filter(child=>child.kind===kind);return matches.length>0&&<View key={kind} style={{gap:4,marginTop:12}}><Text style={styles.section}>{kind==='note'?'Linked notes':'Linked tasks'}</Text>{matches.map(child=>{const task=tasks.get(child.id);return <View key={child.id} style={styles.linkTaskRow}>
          {task&&<Check checked={task.status==='completed'} label={`${task.status==='completed'?'Reopen':'Complete'} task: ${child.text}`} disabled={busy||readOnly} onPress={()=>onToggle(task)}/>}
          <Pressable accessibilityRole="button" accessibilityLabel={`Open linked ${kind}: ${child.text}`} onPress={()=>onOpen(child.id)} style={styles.linkPreview}><Text numberOfLines={2} style={[styles.linkText,task?.status==='completed'&&styles.completed]}>{child.text}</Text></Pressable>
        </View>;})}</View>;})}
      </View>}
    </ScrollView>
  </View>;
}
