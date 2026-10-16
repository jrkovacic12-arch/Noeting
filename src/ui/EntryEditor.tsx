import { KeyboardAvoidingView, Modal, Platform, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { EntryKind } from '../data/repository';
import { Button } from './controls';
import { useStyles } from './styles';
export type EditorDraft={kind:EntryKind;text:string;requestId:string;sourceEntryId?:string;editEntryId?:string};
export function EntryEditor({draft,onChange,onClose,onSave,busy,error}:{draft:EditorDraft;onChange:(text:string)=>void;onClose:()=>void;onSave:()=>void;busy:boolean;error:string|null}){
  const {styles,colors}=useStyles();
  const title=`${draft.editEntryId?'Edit':draft.sourceEntryId?'Link':'New'} ${draft.kind}`;
  return <Modal visible animationType="slide" onRequestClose={()=>{if(!busy)onClose();}}>
    <SafeAreaView style={styles.editor}><KeyboardAvoidingView style={styles.grow} behavior={Platform.OS==='ios'?'padding':undefined}>
      <View style={styles.toolbar}><Button label="Cancel" onPress={onClose} disabled={busy}/><Text accessibilityRole="header" style={[styles.cardText,styles.grow]}>{title}</Text><Button label={busy?'Saving…':'Save'} onPress={onSave} disabled={busy||!draft.text.trim()} accent/></View>
      {error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <TextInput autoFocus multiline accessibilityLabel={draft.kind==='note'?'Note text':'Task text'} placeholder={draft.kind==='note'?'Start writing…':'What needs doing?'} placeholderTextColor={colors.muted} value={draft.text} onChangeText={onChange} editable={!busy} style={styles.input}/>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}
