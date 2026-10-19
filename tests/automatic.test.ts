import assert from 'node:assert/strict';import {test} from 'node:test';
import {replica} from './syncFixtures';import {harness} from './syncHttpFixtures';
import {SyncConfiguration,type CredentialVault} from '../src/sync/configuration';
import {AutomaticSync,ForegroundSync,type TimerDriver,type Trigger} from '../src/sync/automatic';
import {syncNow,type RPC} from '../src/sync/client';import {ForegroundPresence,DRAFT_KEY} from '../src/sync/draftSafety';
const origin='https://pc.tailnet.ts.net',token='automatic-test-credential-'.repeat(2);
class Clock implements TimerDriver{
 now=1000;next=1;tasks=new Map<number,{at:number;work:()=>void}>();set(work:()=>void,ms:number){const id=this.next++;this.tasks.set(id,{at:this.now+ms,work});return id;}clear(id:unknown){this.tasks.delete(Number(id));}
 async settle(){for(let i=0;i<80;i++)await Promise.resolve();}
 async tick(ms:number){const target=this.now+ms;for(;;){const [id,task]=[...this.tasks].sort((a,b)=>a[1].at-b[1].at).find(([,t])=>t.at<=target)??[];if(!task||id===undefined)break;this.now=task.at;this.tasks.delete(id);task.work();await this.settle();}this.now=target;await this.settle();}
}
function scheduler(){const clock=new Clock(),sources:Trigger[]=[];const settings:any={enabled:0,auth_required:0,retry_after:0,poll_ms:60000};const automatic={now:()=>clock.now,dependencies:{configuration:{load:async()=>({...settings})}},attempt:async(source:Trigger)=>{sources.push(source);return {kind:'success',settings:{...settings}};}} as unknown as AutomaticSync;return {clock,sources,settings,foreground:new ForegroundSync(automatic,clock)};}
test('off schedules no transfers; rapid committed edits and network events coalesce; polling stops in background',async()=>{
 const x=scheduler();x.foreground.setActive(true);await x.clock.settle();await x.clock.tick(120000);assert.equal(x.sources.length,0);assert.equal(x.clock.tasks.size,0);
 x.settings.enabled=1;await x.foreground.refresh();x.foreground.trigger('launch',0);await x.clock.tick(0);assert.deepEqual(x.sources,['launch']);
 for(let i=0;i<5;i++){x.foreground.trigger('local');await x.clock.tick(400);}await x.clock.tick(2599);assert.equal(x.sources.length,1);await x.clock.tick(1);assert.equal(x.sources.length,2);
 x.foreground.trigger('network');x.foreground.trigger('network');await x.clock.tick(3000);assert.equal(x.sources.at(-1),'network');
 await x.clock.tick(60000);assert.ok(x.sources.includes('poll'));x.foreground.setActive(false);const count=x.sources.length;await x.clock.tick(120000);assert.equal(x.sources.length,count);assert.equal(x.clock.tasks.size,0);
 x.foreground.setActive(true);await x.clock.settle();await x.clock.tick(0);assert.equal(x.sources.at(-1),'resume');x.foreground.stop();
});
async function environment(){const a=replica(),h=await harness();await syncNow(a.repo,h.rpc,true);const secrets=new Map<string,string>();const vault:CredentialVault={available:async()=>true,get:async k=>secrets.get(k)??null,set:async(k,v)=>{secrets.set(k,v);},remove:async k=>{secrets.delete(k);}};
 const configuration=new SyncConfiguration(a.repo,vault);await configuration.save(origin,token,true,async(_o,_t,i)=>h.rpc('pair',{device:i.device_id,library:i.library_id}));await configuration.setEnabled(true);return {a,h,configuration,secrets,vault};}
test('automatic attempt creates Android Notes, pulls PC edits and preserves Tasks, folders, removal, restore and frozen links',async()=>{
 const x=await environment();try{
 const n=await x.a.repo.saveCapture({requestId:'n',kind:'note',text:'phone original'});const task=await x.a.repo.saveLinkedEntry({requestId:'t',kind:'task',text:'task',sourceEntryId:n.entryId});await x.a.repo.saveSubtask({requestId:'c',parentTaskId:task.taskId!,text:'child'});await x.a.repo.completeTask(task.taskId!);await x.a.repo.createFolder('f','Folder');await x.a.repo.organizeNotes([n.entryId],{folderId:'f',pinned:true});
 const automatic=new AutomaticSync({repo:x.a.repo,configuration:x.configuration,readDraft:async()=>null,rpc:()=>x.h.rpc});assert.equal((await automatic.attempt('local')).kind,'success');
 await x.h.pc.repository.saveCapture({requestId:'pc',kind:'note',text:'PC note'});const removal=await x.h.pc.repository.removeEntry(n.entryId);await x.h.pc.repository.restoreEntry(removal);await automatic.attempt('poll');
 assert.deepEqual(await x.a.repo.sync(s=>s.records()),await x.h.pc.repository.sync(s=>s.records()));assert.ok((await x.a.repo.readSnapshot()).tasks.every(t=>t.status==='completed'));
 }finally{await x.h.close();x.a.db.close();}
});
test('offline failures back off with bounded jitter; network signals do not prove VPN access; auth stops repeated attempts',async()=>{
 const x=await environment();try{let now=1000,calls=0;let mode='offline';const rpc:RPC=async(action,input)=>{calls++;if(mode==='offline')throw Error('unreachable');if(mode==='auth')throw new (await import('../src/sync/errors')).SyncError('auth','Sync requires authentication.');return x.h.rpc(action,input);};
 const automatic=new AutomaticSync({repo:x.a.repo,configuration:x.configuration,readDraft:async()=>null,rpc:()=>rpc,now:()=>now,random:()=>.5});
 await automatic.attempt('network');assert.equal(calls,1);assert.equal((await x.configuration.load()).retry_after,16000);await automatic.attempt('network');assert.equal(calls,1);
 now=16000;await automatic.attempt('poll');assert.equal((await x.configuration.load()).retry_after,46000);assert.equal(calls,2);
 now=46000;mode='auth';await automatic.attempt('resume');assert.equal((await x.configuration.load()).auth_required,1);await automatic.attempt('network');assert.equal(calls,3);
 }finally{await x.h.close();x.a.db.close();}
});
test('old scheduled attempts and callbacks cannot revive off/disconnected credentials; persisted drafts defer PC replay',async()=>{
 const x=await environment();try{const n=await x.a.repo.saveCapture({requestId:'n',kind:'note',text:'first'});let calls=0;let raw:string|null=null;
 const automatic=new AutomaticSync({repo:x.a.repo,configuration:x.configuration,readDraft:async key=>key===DRAFT_KEY?raw:null,rpc:()=>async(action,input)=>{calls++;return x.h.rpc(action,input);}});
 await automatic.attempt('local');await x.h.pc.repository.editEntry(n.entryId,'PC');raw=JSON.stringify({edit:{editEntryId:n.entryId,text:'unsaved words'}});assert.equal((await automatic.attempt('background')).kind,'deferred');assert.equal((await x.a.repo.readSnapshot()).entries[0].text,'first');
 raw=null;await automatic.attempt('background');assert.equal((await x.a.repo.readSnapshot()).entries[0].text,'PC');
 await x.configuration.setEnabled(false);const before=calls;await automatic.attempt('background');assert.equal(calls,before);await x.configuration.disconnect();await automatic.attempt('resume');assert.equal(calls,before);
 }finally{await x.h.close();x.a.db.close();}
});
test('headless attempt opens the same durable library without UI and respects a live foreground presence',async()=>{
 const x=await environment();try{let calls=0,now=1000;const presence=new ForegroundPresence(x.a.repo,()=>now);await presence.active();
 const automatic=new AutomaticSync({repo:x.a.repo,configuration:x.configuration,readDraft:async()=>null,rpc:()=>async(action,input)=>{calls++;return x.h.rpc(action,input);},now:()=>now});
 assert.equal((await automatic.attempt('background')).kind,'deferred');assert.equal(calls,0);now+=60001;assert.equal((await automatic.attempt('background')).kind,'success');assert.ok(calls>0);
 }finally{await x.h.close();x.a.db.close();}
});
