import { Keyboard, KeyboardAvoidingView, Modal, Platform, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { EntryKind } from '../data/repository';
import { Button } from './controls';
import { useStyles } from './styles';
export type EditorDraft={kind:EntryKind;text:string;requestId:string;sourceEntryId?:string;sourcePreview?:string;parentTaskId?:string;parentPreview?:string;editEntryId?:string};
export function EditorBody({draft,onChange,onCancel,onSave,busy,error}:{draft:EditorDraft;onChange:(text:string)=>void;onCancel:()=>void;onSave:()=>void;busy:boolean;error:string|null}) {
  const {styles,colors}=useStyles();
  const name=draft.parentTaskId?'Subtask':draft.kind==='note'?'Note':'Task';
  return <>
    <View style={styles.toolbar}><Button quiet label="Cancel" onPress={onCancel} disabled={busy}/><Text accessibilityRole="header" style={[styles.cardText,styles.grow]}>{draft.editEntryId?'Edit':draft.sourceEntryId?'New linked':'New'} {name.toLowerCase()}</Text><Button quiet label={busy?'Saving…':'Save'} onPress={onSave} disabled={busy||!draft.text.trim()} accent/></View>
    {draft.sourceEntryId&&<Text numberOfLines={2} style={styles.editorContext}>Linked from: {draft.sourcePreview}</Text>}
    {draft.parentTaskId&&<Text numberOfLines={2} style={styles.editorContext}>Under: {draft.parentPreview}</Text>}
    {error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <TextInput autoFocus multiline accessibilityLabel={`${name} text`} placeholder={draft.kind==='note'?'Start writing…':'What needs doing?'} placeholderTextColor={colors.muted} value={draft.text} onChangeText={onChange} editable={!busy} style={styles.input}/>
  </>;
}
export function NoteEditor(props:Parameters<typeof EditorBody>[0]&{onDismiss:()=>void}) {
  const {styles}=useStyles();
  return <Modal visible animationType="slide" onRequestClose={()=>{if(Keyboard.isVisible())Keyboard.dismiss();else if(!props.busy)props.onDismiss();}}>
    <SafeAreaView style={styles.editor}><KeyboardAvoidingView style={styles.grow} behavior={Platform.OS==='ios'?'padding':'height'}><EditorBody {...props}/></KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}
