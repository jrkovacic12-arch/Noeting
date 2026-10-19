import {useEffect,useRef,useState} from 'react';
import type {Repository} from '../data/repository';
import {SyncRuntime} from '../sync/runtime';
export function useSyncRuntime(repo:Repository|null,updated:()=>Promise<void>){
 const callback=useRef(updated);callback.current=updated;
 const [runtime,setRuntime]=useState<SyncRuntime|null>(null),[ready,setReady]=useState(false),[issue,setIssue]=useState<string|null>(null),[attempt,bump]=useState(0);
 useEffect(()=>{if(!repo)return;let active=true;setReady(false);const service=new SyncRuntime(repo,()=>callback.current());setRuntime(service);
 void service.start().then(()=>{if(active){setReady(true);setIssue(null);}}).catch(()=>{if(active)setIssue('Could not coordinate local synchronization storage. Retry opening the app.');});
 return ()=>{active=false;service.stop();};
 },[repo,attempt]);
 return {runtime,ready,issue,retry:()=>bump(x=>x+1)};
}
