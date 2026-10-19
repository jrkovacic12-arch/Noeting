import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {replica} from './syncFixtures';import {harness} from './syncHttpFixtures';
import {syncNow,httpsRPC,type RPC} from '../src/sync/client';
import {withSyncSession} from '../src/sync/session';
import {checkPersistedDrafts,DraftGate,DRAFT_KEY} from '../src/sync/draftSafety';
const latch=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};};
test('slow actual HTTP session never holds repository mutex; interleaved local edits converge', {timeout:10000},async()=>{
 const a=replica(),h=await harness(),entered=latch(),release=latch();try{
 const n=await a.repo.saveCapture({requestId:'n',kind:'note',text:'first'});await syncNow(a.repo,h.rpc,true);await a.repo.editEntry(n.entryId,'second');let stopped=false;
 const slow:RPC=async(action,input,control)=>{if(action==='stage'&&!stopped){stopped=true;entered.resolve();await release.promise;}return h.rpc(action,input,control);};
 const flight=syncNow(a.repo,slow);await entered.promise;
 // This must complete while the remote request is deliberately still blocked.
 await a.repo.editEntry(n.entryId,'third during upload');await a.repo.saveCapture({requestId:'another',kind:'note',text:'offline capture stays responsive'});
 await assert.rejects(syncNow(a.repo,h.rpc),/Another synchronization/);release.resolve();await flight;
 assert.equal((await h.pc.repository.readSnapshot()).entries.find(e=>e.id===n.entryId)!.text,'third during upload');assert.deepEqual(await a.repo.sync(s=>s.records()),await h.pc.repository.sync(s=>s.records()));
 }finally{release.resolve();await h.close();a.db.close();}
});
test('transactional lease spans independent SQLite connections and expired owners are fenced',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lease-'));const a=replica(join(dir,'library.sqlite')),b=replica(join(dir,'library.sqlite'));let now=100;const entered=latch(),release=latch();
 try{await a.repo.initialize();await b.repo.initialize();let firstSession:any;
 const first=withSyncSession(a.repo,{now:()=>now},async s=>{firstSession=s;entered.resolve();await release.promise;return s.db(store=>store.identity());});await entered.promise;
 await assert.rejects(withSyncSession(b.repo,{now:()=>now},async()=>undefined),/Another synchronization/);
 now+=120001;
 await withSyncSession(b.repo,{now:()=>now},async second=>{
  await assert.rejects(firstSession.db((s:any)=>s.identity()),/ownership expired/);release.resolve();await assert.rejects(first,/ownership expired/);
  assert.equal((await second.db(s=>s.db.all<{owner:string}>('SELECT owner FROM sync_session_lease')))[0].owner,second.lease.owner);
 });
 assert.equal(a.db.prepare('SELECT owner FROM sync_session_lease').get()!.owner,null);
 }finally{release.resolve();a.db.close();b.db.close();await rm(dir,{recursive:true,force:true});}
});
test('headless persisted draft inspection defers incoming replay without advancing cursor or losing the event',async()=>{
 const a=replica(),h=await harness();try{const n=await a.repo.saveCapture({requestId:'n',kind:'note',text:'first'});await syncNow(a.repo,h.rpc,true);await h.pc.repository.editEntry(n.entryId,'PC version');
 let raw:string|null=JSON.stringify({[`edit:${n.entryId}`]:{kind:'note',text:'unsaved Android words',editEntryId:n.entryId,requestId:'draft'}});const read=async(key:string)=>key===DRAFT_KEY?raw:null;
 const cursor=(await a.repo.sync(s=>s.identity())).cursor;
 await assert.rejects(syncNow(a.repo,h.rpc,false,{prepareReplay:async()=>{await checkPersistedDrafts(a.repo,read);return ()=>{};}}),/unsaved editor/);
 assert.equal((await a.repo.sync(s=>s.identity())).cursor,cursor);assert.equal((await a.repo.readSnapshot()).entries[0].text,'first');assert.ok(a.db.prepare('SELECT count(*) n FROM sync_transfer_progress').get()!.n);
 raw=null;await syncNow(a.repo,h.rpc,false,{prepareReplay:async()=>{await checkPersistedDrafts(a.repo,read);return ()=>{};}});assert.equal((await a.repo.readSnapshot()).entries[0].text,'PC version');
 }finally{await h.close();a.db.close();}
});
test('small background budgets persist upload pages and continue the same operation after a later run',async()=>{
 const a=replica(),h=await harness();try{await syncNow(a.repo,h.rpc,true);await a.repo.saveCapture({requestId:'large',kind:'note',text:'x'.repeat(250000)});
 let now=1000,interrupt=true;const pages:number[]=[];const rpc:RPC=async(action,input,control)=>{const result=await h.rpc(action,input,control);if(action==='stage'){pages.push(Number(input.part));if(interrupt){interrupt=false;now+=1001;}}return result;};
 await assert.rejects(syncNow(a.repo,rpc,false,{now:()=>now,maxDurationMs:1000,maxOperations:1}),/later attempt/);
 assert.equal((await a.repo.sync(s=>s.pending())).length,1);assert.equal(a.db.prepare('SELECT MAX(next_part) n FROM sync_transfer_progress').get()!.n,1);
 await syncNow(a.repo,rpc,false,{now:()=>now,maxDurationMs:1000,maxOperations:1});assert.equal(pages.filter(p=>p===0).length,1);assert.equal((await h.pc.repository.readSnapshot()).entries.length,1);
 }finally{await h.close();a.db.close();}
});
test('bounded sessions leave remaining outbox work durable for subsequent executions',async()=>{
 const a=replica(),h=await harness();try{await syncNow(a.repo,h.rpc,true);for(let i=0;i<3;i++)await a.repo.saveCapture({requestId:`n${i}`,kind:'note',text:`note ${i}`});
 const first=await syncNow(a.repo,h.rpc,false,{maxOperations:1,maxEvents:2});assert.ok(first.incomplete);assert.equal(first.pending,2);
 await syncNow(a.repo,h.rpc);assert.equal((await h.pc.repository.readSnapshot()).entries.length,3);
 }finally{await h.close();a.db.close();}
});
test('invalid identity, unavailable Tailscale and TLS/redirect errors never fall back or upload content',async()=>{
 const a=replica();await a.repo.initialize();await a.repo.sync(s=>s.bind('b'.repeat(32),'library'));let calls:string[]=[];
 try{await a.repo.saveCapture({requestId:'n',kind:'note',text:'private words'});
 await assert.rejects(syncNow(a.repo,async action=>{calls.push(action);return {device:'c'.repeat(32),library:'library'};}),/identity changed/);assert.deepEqual(calls,['pair']);
 calls=[];const transport:typeof fetch=async(url,init)=>{calls.push(String(url));assert.equal(init?.redirect,'error');throw Error('certificate failure');};
 await assert.rejects(syncNow(a.repo,httpsRPC('https://pc.tailnet.ts.net/','x'.repeat(40),{fetch:transport})),/Waiting for Tailscale/);assert.equal(calls.length,1);assert.ok(!calls[0].includes('private words'));
 await assert.rejects(httpsRPC('https://pc.tailnet.ts.net/','x'.repeat(40),{fetch:async()=>({status:302,redirected:false,url:'https://pc.tailnet.ts.net/'} as Response)})('pair',{}),/redirects are prohibited/);
 }finally{a.db.close();}
});
test('foreground editor/navigation barrier and journal notifications exclude drafts, failed writes and remote replay',async()=>{
 const gate=new DraftGate();gate.editing=true;await assert.rejects(gate.beginReplay(),/editor is open/);gate.editing=false;const release=await gate.beginReplay();let passed=false;const navigation=gate.waitForReplay().then(()=>{passed=true;});await Promise.resolve();assert.equal(passed,false);release();await navigation;assert.ok(passed);
 const a=replica();let commits=0;const unsubscribe=a.repo.subscribeCommitted(()=>{commits++;});try{const n=await a.repo.saveCapture({requestId:'n',kind:'note',text:'first'});assert.equal(commits,1);await a.repo.saveCapture({requestId:'n',kind:'note',text:'first'});assert.equal(commits,1);
 a.db.exec("CREATE TRIGGER fail BEFORE INSERT ON sync_v2_outbox BEGIN SELECT RAISE(ABORT,'disk fault'); END;");await assert.rejects(a.repo.editEntry(n.entryId,'failed'));assert.equal(commits,1);
 }finally{unsubscribe();a.db.close();}
});
