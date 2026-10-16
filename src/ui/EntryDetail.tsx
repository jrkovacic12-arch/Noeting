import { ScrollView, Text, View } from 'react-native';
import type { Entry, Task } from '../data/repository';
import { Button } from './controls';
import { useStyles } from './styles';
export function EntryDetail({entry,task,source,children,onBack,onOpen,onEdit,onRemove,onLink,onToggle,busy}:{entry:Entry;task?:Task;source?:Entry;children:Entry[];onBack:()=>void;onOpen:(id:string)=>void;onEdit:()=>void;onRemove:()=>void;onLink:(kind:Entry['kind'])=>void;onToggle:()=>void;busy:boolean}){
  const {styles}=useStyles();
  return <View style={styles.grow}>
    <View style={styles.toolbar}><Button label="Back" onPress={onBack}/><View style={styles.grow}/>{!entry.removed&&<><Button label="Edit" onPress={onEdit} disabled={busy}/><Button label="Remove" onPress={onRemove} disabled={busy} danger/></>}</View>
    <ScrollView contentContainerStyle={styles.detail} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={styles.section}>{entry.kind==='note'?'Note':'Task'}{entry.removed?' · Removed':''}</Text>
      <Text selectable style={styles.body}>{entry.text}</Text>
      <Text style={styles.meta}>{new Date(entry.createdAt).toLocaleString()}</Text>
      {task&&!entry.removed&&<Button label={task.status==='completed'?'Reopen task':'Complete task'} onPress={onToggle} disabled={busy}/>}
      {entry.sourceEntryId&&<View><Text style={styles.section}>Source</Text><View style={styles.quote}>
        <Text selectable style={styles.quoteText}>{entry.sourceText??source?.originalText??'Source unavailable'}</Text>
        {source&&<Button label={source.removed?'Open removed source':'Open source'} onPress={()=>onOpen(source.id)} disabled={busy}/>}
      </View></View>}
      {entry.text!==entry.originalText&&<View><Text style={styles.section}>Original capture</Text><Text selectable style={styles.quoteText}>{entry.originalText}</Text></View>}
      {children.length>0&&<View><Text style={styles.section}>Linked entries</Text>{children.map(child=><View key={child.id} style={{marginBottom:8}}><Button label={`${child.kind==='note'?'Note':'Task'}: ${child.text}`} onPress={()=>onOpen(child.id)} disabled={busy}/></View>)}</View>}
      {!entry.removed&&<View style={[styles.row,{flexWrap:'wrap'}]}><Button label="Link note" onPress={()=>onLink('note')} disabled={busy}/><Button label="Link task" onPress={()=>onLink('task')} disabled={busy}/></View>}
    </ScrollView>
  </View>;
}
