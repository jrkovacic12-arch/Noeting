import { useEffect, useRef, useState } from 'react';
import Storage from 'expo-sqlite/kv-store';
import type { EditorDraft } from './EntryEditor';
const key='noeting.editor-draft.v1';
export function useDraft(enabled:boolean) {
  const [draft,setDraftState]=useState<EditorDraft|null>(null);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const queue=useRef(Promise.resolve());
  const stored=useRef(true);
  useEffect(()=>{
    if(!enabled)return; // Expo web VFS initialization must finish before opening the draft store.
    let active=true;
    Storage.getItem(key).then(raw=>{
      if(!raw||!active)return;
      const value=JSON.parse(raw) as EditorDraft;
      if((value.kind==='note'||value.kind==='task')&&typeof value.text==='string'&&typeof value.requestId==='string')setDraftState(value);
    }).catch(()=>{if(active)setError('Could not load your draft. Saved entries are still available.');}).finally(()=>{if(active)setReady(true);});
    return ()=>{active=false;};
  },[enabled]);
  function setDraft(next:EditorDraft|null) {
    setDraftState(next);
    // Serialize writes so a slow older keystroke can never replace a newer draft or deletion.
    queue.current=queue.current.then(async()=>{
      if(next)await Storage.setItem(key,JSON.stringify(next));else await Storage.removeItem(key);
      stored.current=true;setError(null);
    }).catch(()=>{stored.current=false;setError('Could not keep this draft for later. Please save it before leaving.');});
  }
  async function flush(){await queue.current;return stored.current;}
  return {draft,setDraft,ready,error,flush};
}
