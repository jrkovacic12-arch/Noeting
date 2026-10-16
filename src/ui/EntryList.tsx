import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { Entry, EntryKind, Task } from '../data/repository';
import { useStyles } from './styles';
export function EntryList({kind,entries,tasks,query,onQuery,onOpen,onAdd,onToggle,busy}:{kind:EntryKind;entries:Entry[];tasks:Map<string,Task>;query:string;onQuery:(q:string)=>void;onOpen:(id:string)=>void;onAdd:()=>void;onToggle:(task:Task)=>void;busy:boolean}){
  const {styles,colors}=useStyles();
  const title=kind==='note'?'Notes':'Tasks';
  return <View style={styles.grow}>
    <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>{title}</Text><Text style={styles.eyebrow}>noeting.</Text></View>
    <TextInput accessibilityLabel={`Search ${title.toLowerCase()}`} placeholder="Search" placeholderTextColor={colors.muted} value={query} onChangeText={onQuery} style={styles.search} clearButtonMode="while-editing" returnKeyType="search"/>
    <FlatList data={entries} keyExtractor={entry=>entry.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} testID="entry-list"
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>{query.trim()?'No matches':kind==='note'?'A little space to think':'One thing at a time'}</Text><Text style={styles.hint}>{query.trim()?'Try another search.':kind==='note'?'Tap + to write your first note.':'Tap + to add a task.'}</Text></View>}
      renderItem={({item})=>{const task=tasks.get(item.id);return <View style={[styles.card,styles.row]}>
        {task&&<Pressable accessibilityRole="checkbox" accessibilityLabel={`${task.status==='completed'?'Reopen':'Complete'} task: ${item.text}`} aria-checked={task.status==='completed'} accessibilityState={{checked:task.status==='completed',disabled:busy}} disabled={busy} onPress={()=>onToggle(task)} hitSlop={8} style={[styles.checkbox,task.status==='completed'&&styles.checked]}><Text style={styles.tick}>{task.status==='completed'?'✓':''}</Text></Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${kind}: ${item.text}`} onPress={()=>onOpen(item.id)} style={styles.grow}>
          <Text numberOfLines={4} style={[styles.cardText,task?.status==='completed'&&styles.completed]}>{item.text}</Text>
          <Text style={[styles.meta,{marginTop:12}]}>{new Date(item.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</Text>
        </Pressable>
      </View>;}}/>
    <Pressable accessibilityRole="button" accessibilityLabel={`Add ${kind}`} onPress={onAdd} disabled={busy} style={({pressed})=>[styles.fab,pressed&&styles.pressed,busy&&styles.disabled]}><Text accessible={false} style={styles.plus}>+</Text></Pressable>
  </View>;
}
