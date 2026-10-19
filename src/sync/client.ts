import { tailscaleOrigin } from './origin';
import { SyncError } from './errors';
import { withSyncSession, type SyncSession, type SessionOptions } from './session';
import type { Repository } from '../data/repository';
import type { Outcome } from './store';
import { type Operation,type Event,type Change } from './schema';
export type RequestControl={signal?:AbortSignal;timeoutMs?:number};
export type RPC=(action:string,input:Record<string,unknown>,control?:RequestControl)=>Promise<any>;
const CHUNK=160_000;
export function httpsRPC(address:string,token:string,transport:{fetch?:typeof globalThis.fetch;signal?:AbortSignal}={}):RPC{
 const origin=tailscaleOrigin(address);
 if(!/^[\x21-\x7e]{32,512}$/.test(token))throw new SyncError('auth','Enter the PC pairing secret (32+ characters).');
 return async(action,input,control={})=>{
  const controller=new AbortController();const signal=control.signal??transport.signal;
  const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
  const timer=setTimeout(abort,Math.min(20000,control.timeoutMs??20000));
  try{
   const response=await (transport.fetch??globalThis.fetch)(`${origin}/api/sync/v2/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({protocol:2,...input}),signal:controller.signal,redirect:'error',credentials:'omit'});
   if(response.redirected||response.status>=300&&response.status<400||(response.url&&new URL(response.url).origin!==origin))throw new SyncError('policy','Sync redirects are prohibited; verify private Tailscale Serve.');
   if(!response.ok){let detail='';try{detail=String((await response.json()).error??'');}catch{}
    if(response.status===401||response.status===403||/revoked|secret rejected/i.test(detail))throw new SyncError('auth','Sync requires authentication. Reauthorize the paired phone.');
    if(/identity|different phone|another library|unrelated library|library.*mismatch/i.test(detail))throw new SyncError('identity','PC or library identity changed. Reauthorize explicitly; local data is unchanged.');
    throw new SyncError('offline','The paired PC could not complete sync; changes remain saved locally.');
   }
   return await response.json();
  }catch(error){if(error instanceof SyncError)throw error;if(signal?.aborted)throw new SyncError('cancelled','Sync cancelled; changes remain saved locally.');throw new SyncError('offline','Waiting for Tailscale / PC. Connection unavailable; changes saved locally.');}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 };
}
type Progress={descriptor:string;next_part:number;payload:string};
async function progress(session:SyncSession|undefined,id:string,descriptor:string):Promise<Progress>{
 if(!session)return {descriptor,next_part:0,payload:''};
 return session.db(s=>s.transaction(async()=>{
  const [row]=await s.db.all<Progress>('SELECT descriptor,next_part,payload FROM sync_transfer_progress WHERE id=?',[id]);
  if(row&&row.descriptor!==descriptor)throw new SyncError('identity','Transfer identity changed; existing progress is retained.');
  if(!row)await s.db.run('INSERT INTO sync_transfer_progress(id,descriptor) VALUES(?,?)',[id,descriptor]);return row??{descriptor,next_part:0,payload:''};
 }));
}
async function advance(session:SyncSession|undefined,id:string,next:number,text?:string){if(session)await session.db(s=>s.transaction(()=>s.db.run('UPDATE sync_transfer_progress SET next_part=?,payload=payload||? WHERE id=?',[next,text??'',id])));}
async function clearProgress(session:SyncSession,...ids:string[]){await session.db(s=>s.transaction(async()=>{for(const id of ids)await s.db.run('DELETE FROM sync_transfer_progress WHERE id=?',[id]);}));}
async function upload(session:SyncSession,rpc:RPC,identity:Record<string,unknown>,operation:Operation,action:string,extra:Record<string,unknown>={}){
 const raw=JSON.stringify(operation),parts=Math.ceil(raw.length/CHUNK),transfer=operation.id;
 if(parts>500)throw new SyncError('policy','This transaction exceeds the development transfer limit; it remains saved locally.');
 const key=`${action}:${transfer}`,saved=await progress(session,key,JSON.stringify({action,transfer,parts}));
 for(let part=saved.next_part;part<parts;part++){await rpc('stage',{...identity,transfer,part,text:raw.slice(part*CHUNK,(part+1)*CHUNK)});await advance(session,key,part+1);}
 const result=await rpc(action,{...identity,transfer,parts,...extra});
 return result.outcomeId?readPaged(rpc,'outcome',identity,result.outcomeId,result.parts,session):result;
}
export async function readPaged(rpc:RPC,action:string,identity:Record<string,unknown>,id:string,parts:number,session?:SyncSession){
 if(!Number.isSafeInteger(parts)||parts<1||parts>1000)throw new SyncError('policy','Invalid response page count.');
 const key=`${action}:${id}`,descriptor=JSON.stringify({action,identity,id,parts});const saved=await progress(session,key,descriptor);let raw=saved.payload;
 for(let part=saved.next_part;part<parts;part++){const page=await rpc(action,{...identity,id,part});if(typeof page.text!=='string'||page.text.length>CHUNK)throw new SyncError('policy','Invalid response page.');raw+=page.text;await advance(session,key,part+1,page.text);}
 return JSON.parse(raw);
}
async function download(session:SyncSession,rpc:RPC,identity:Record<string,unknown>,descriptor:{revision:number;parts:number;id:string}):Promise<Event>{
 if(!Number.isSafeInteger(descriptor.parts)||descriptor.parts<1||descriptor.parts>500)throw new SyncError('policy','Invalid remote page count.');
 const event=await readPaged(rpc,'event',{...identity,revision:descriptor.revision},descriptor.id,descriptor.parts,session) as Event;
 if(event.revision!==descriptor.revision||event.operation.id!==descriptor.id)throw new SyncError('identity','Remote event identity mismatch.');return event;
}
async function synchronize(session:SyncSession,baseRPC:RPC,initialize:boolean){
 const rpc:RPC=(action,input)=>session.rpc(baseRPC,action,input);
 let local=await session.db(s=>s.identity());
 if(session.options.requirePaired&&(!local.peer_id||!local.library_id))throw new SyncError('identity','Pair explicitly before enabling automatic sync.');
 const pair=await rpc('pair',{device:local.device_id,library:local.library_id});
 if(typeof pair.device!=='string'||!pair.device||local.peer_id&&local.peer_id!==pair.device)throw new SyncError('identity','PC identity changed. Reauthorize explicitly; local library retained.');
 if(local.library_id&&pair.library!==local.library_id)throw new SyncError('identity','PC library identity changed. Reauthorize explicitly; local library retained.');
 if(!local.library_id){
  const saved=await session.db(s=>s.beginBootstrap());
  if(!initialize&&!pair.library)throw new SyncError('identity','PC is empty. Choose Initialize empty PC from Android once.');
  if(!pair.empty&&!pair.library)throw new SyncError('identity','PC contains an unrelated library. It cannot be replaced.');
  if(pair.library&&pair.library!==local.device_id)throw new SyncError('identity','PC belongs to another library.');
  const result=await upload(session,rpc,{device:local.device_id,library:pair.library??local.library_id},saved.operation,'bootstrap',{initialize:true,initialLibrary:local.device_id});
  await session.db(s=>s.finishBootstrap({revision:result.revision,operation:saved.operation},result.library,result.device,saved.captured));
  await clearProgress(session,`bootstrap:${saved.operation.id}`);local=await session.db(s=>s.identity());
 }
 const identity={device:local.device_id,library:local.library_id};
 let pushed=0,pulled=0,incomplete=false;
 while(pushed<(session.options.maxOperations??2000)){
  const [op]=await session.db(s=>s.pending(1));if(!op)break;
  const result=await upload(session,rpc,identity,op,'push') as Outcome;
  await session.db(s=>s.recordOutcome(result));await clearProgress(session,`push:${op.id}`,`outcome:${op.id}`);pushed++;
 }
 incomplete=(await session.db(s=>s.pending(1))).length>0;
 const maxEvents=session.options.maxEvents??2000;
 while(pulled<maxEvents){
  const {events}=await rpc('pull',{...identity,after:(await session.db(s=>s.identity())).cursor});
  if(!Array.isArray(events)||events.length>100)throw new SyncError('policy','Invalid history page.');
  for(const descriptor of events){if(pulled>=maxEvents){incomplete=true;break;}
   const event=await download(session,rpc,identity,descriptor);await session.replay(event);await clearProgress(session,`event:${event.operation.id}`);pulled++;
  }
  if(events.length<100)break;
 }
 if(pulled>=maxEvents)incomplete=true;
 await rpc('ack',{...identity,cursor:(await session.db(s=>s.identity())).cursor});
 if(!incomplete)await session.db(s=>s.markSuccess());
 return {...await session.db(s=>s.status()),incomplete};
}
export function syncNow(repo:Repository,rpc:RPC,initialize=false,options:SessionOptions={}){return withSyncSession(repo,options,session=>synchronize(session,rpc,initialize));}
async function resolveWithin(session:SyncSession,baseRPC:RPC,conflictId:string,choice:'android'|'pc'){
 const rpc:RPC=(action,input)=>session.rpc(baseRPC,action,input),local=await session.db(s=>s.identity()),identity={device:local.device_id,library:local.library_id};
 const closure=await session.db(s=>s.resolutionClosure(conflictId)),current:Change[]=[];
 for(let index=0;index<closure.current.length;index+=100){const result=await rpc('current',{...identity,records:closure.current.slice(index,index+100).map(c=>({table:c.table,id:c.id}))});const data=await readPaged(rpc,'read-page',identity,result.readId,result.parts,session);current.push(...data.records);await rpc('release-read',{...identity,id:result.readId});await clearProgress(session,`read-page:${result.readId}`);}
 const changes=current.map(c=>({...c,value:choice==='android'?closure.current.find(r=>r.table===c.table&&r.id===c.id)!.value:c.value}));
 if(changes.some(c=>c.value===null&&c.table!=='note_folders'))throw new SyncError('policy','PC has no corresponding structural record. Preserve Android and correct dependencies.');
 const [row]=await session.db(s=>s.db.all<{id:string}>('SELECT lower(hex(randomblob(16))) AS id'));
 const operation:Operation={protocol:2,id:row.id,origin:local.device_id,resolves:conflictId,resolvedOperations:closure.ids,changes};
 const result=await upload(session,rpc,identity,operation,'resolve') as Outcome;
 if('conflict' in result){await session.db(s=>s.recordOutcome(result));throw new SyncError('drafts','PC changed again. Both versions are retained; retry resolution.');}
 const release=await session.options.prepareReplay?.();
 try{await session.db(s=>s.finishResolution(result.event,closure.ids,conflictId,closure.current,()=>session.options.assertReplay?.(s)??Promise.resolve()));}finally{release?.();}
 await clearProgress(session,`resolve:${operation.id}`,`outcome:${operation.id}`);
 return synchronize(session,baseRPC,false);
}
export function resolveConflict(repo:Repository,rpc:RPC,conflictId:string,choice:'android'|'pc',options:SessionOptions={}){return withSyncSession(repo,options,s=>resolveWithin(s,rpc,conflictId,choice));}
export function keepBoth(repo:Repository,rpc:RPC,conflictId:string,options:SessionOptions={}){return withSyncSession(repo,options,async session=>{
 const note=await session.db(async store=>{const closure=await store.resolutionClosure(conflictId),entries=closure.current.filter(c=>c.table==='entries');
 if(entries.length!==1||entries[0].value?.kind!=='note'||entries[0].value.removed_at!==null||closure.current.some(c=>!['entries','note_organization'].includes(c.table)))throw new SyncError('policy','Keep both is available only for a standalone active Note text conflict.');
 if((await store.records()).some(c=>['thinking_links','entry_sources','task_sources'].includes(c.table)&&c.id===entries[0].id))throw new SyncError('policy','Choose a version to preserve the source relationship.');return entries[0].value!;});
 await repo.saveCapture({requestId:`conflict-copy-${conflictId}`,kind:'note',text:String(note.edited_text??note.original_text)});
 return resolveWithin(session,rpc,conflictId,'pc');
});}
