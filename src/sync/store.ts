import type { SQLiteDriver } from '../data/repository';
import { applyRecords, readRecords, validateOperation, equal, SyncValidationError } from './records';
import { type Operation, type RecordValue, type Change, type Event, keyOf, PAGE_SIZE } from './schema';
export type Identity = {device_id:string;library_id:string|null;peer_id:string|null;cursor:number;last_success:string|null};
export type Conflict = {operation:Operation;current:Change[];reason:string};
export type Outcome = {event:Event} | {conflict:Conflict};
type Version={revision:number;operation_id:string|null};
/** Call only while holding Repository.sync's shared driver mutex. Every public
 * mutation below owns a SQLite transaction; no HTTP awaits occur inside one. */
export class SyncStore {
 constructor(readonly db:SQLiteDriver){}
 async transaction<T>(work:()=>Promise<T>):Promise<T>{
  await this.db.exec('BEGIN IMMEDIATE;');
  try{const r=await work();await this.db.exec('COMMIT;');return r;}
  catch(e){await this.db.exec('ROLLBACK;');throw e;}
 }
 async identity(){return (await this.db.all<Identity>('SELECT * FROM sync_v2_identity WHERE id=1'))[0];}
 async records(){return readRecords(this.db);}
 async pending(){return (await this.db.all<{payload:string}>("SELECT payload FROM sync_v2_outbox WHERE state='pending' ORDER BY rowid")).map(r=>JSON.parse(r.payload) as Operation);}
 async conflicts(){return (await this.db.all<{payload:string}>("SELECT payload FROM sync_v2_conflicts WHERE state='open' ORDER BY rowid")).map(r=>JSON.parse(r.payload) as Conflict);}
 async status(){const i=await this.identity();return {...i,pending:(await this.pending()).length,conflicts:(await this.conflicts()).length};}
 async version(r:RecordValue):Promise<Version>{return (await this.db.all<Version>('SELECT revision,operation_id FROM sync_v2_versions WHERE table_name=? AND entity_id=?',[r.table,r.id]))[0]??{revision:0,operation_id:null};}
 async current(changes:RecordValue[]):Promise<Change[]>{
  const values=new Map((await this.records()).map(r=>[keyOf(r),r.value]));const result:Change[]=[];
  for(const c of changes){const v=await this.version(c);result.push({table:c.table,id:c.id,value:values.get(keyOf(c))??null,base:v.revision,previous:v.operation_id});}
  return result;
 }
 async setVersions(event:Event,onlyOwn=false){
  for(const c of event.operation.changes){
   if(onlyOwn&&(await this.version(c)).operation_id!==event.operation.id)continue;
   await this.db.run('INSERT INTO sync_v2_versions VALUES(?,?,?,?,?) ON CONFLICT(table_name,entity_id) DO UPDATE SET revision=excluded.revision,operation_id=excluded.operation_id,tombstone=excluded.tombstone',[c.table,c.id,event.revision,event.operation.id,Number(c.value===null)]);
  }
 }
 private async append(operation:Operation):Promise<Event>{
  await this.db.run('INSERT INTO sync_v2_history(operation_id,payload) VALUES(?,?)',[operation.id,JSON.stringify(operation)]);
  const [row]=await this.db.all<{revision:number}>('SELECT revision FROM sync_v2_history WHERE operation_id=?',[operation.id]);
  const event={revision:row.revision,operation};
  await this.db.run('INSERT INTO sync_v2_seen(id,outcome) VALUES(?,?)',[operation.id,JSON.stringify({event})]);
  return event;
 }
 async publishLocal(){
  return this.transaction(async()=>{
   for(const op of await this.pending()){
    const event=await this.append(op); await this.setVersions(event,true);
    await this.db.run("UPDATE sync_v2_outbox SET state='accepted' WHERE id=?",[op.id]);
   }
  });
 }
 async bind(peer:string,library:string|null){
  return this.transaction(async()=>{
   const i=await this.identity();
   if((i.peer_id!==null&&i.peer_id!==peer)||(i.library_id!==null&&i.library_id!==library)) throw new Error('This device is paired to a different library.');
   await this.db.run('UPDATE sync_v2_identity SET peer_id=?,library_id=? WHERE id=1',[peer,library]);
  });
 }
 async bootstrap(operation:Operation,library:string,peer:string){
  validateOperation(operation,true);
  return this.transaction(async()=>{
   const i=await this.identity();
   if(i.library_id!==null){
    const [seen]=await this.db.all<{outcome:string}>('SELECT outcome FROM sync_v2_seen WHERE id=?',[operation.id]);
    if(i.library_id===library&&i.peer_id===peer&&seen){const outcome=JSON.parse(seen.outcome) as {event:Event};if(!equal(outcome.event.operation,operation))throw new Error('Bootstrap identity reused.');return outcome.event;}
    throw new Error('PC already has a synchronized library. It cannot be replaced.');
   }
   if((await this.records()).length) throw new Error('PC contains an unrelated library; initialization refused.');
   if(operation.changes.some(c=>c.base!==0||c.previous!==null))throw new Error('Invalid bootstrap bases.');
   await applyRecords(this.db,operation.changes,true);
   const event=await this.append(operation);await this.setVersions(event);
   await this.db.run('UPDATE sync_v2_identity SET library_id=?,peer_id=? WHERE id=1',[library,peer]);
   return event;
  });
 }
 async beginBootstrap(){
  const [saved]=await this.db.all<{payload:string}>("SELECT payload FROM sync_v2_bootstrap WHERE session='client-initialization'");
  if(saved)return JSON.parse(saved.payload) as {operation:Operation;captured:string[]};
  const identity=await this.identity();
  const operation:Operation={protocol:2,id:`bootstrap-${identity.device_id}`,origin:identity.device_id,changes:(await this.records()).map(r=>({...r,base:0,previous:null}))};
  // Empty libraries use a manifest with no domain rows; bootstrap separately allows it.
  const manifest={operation,captured:(await this.pending()).map(op=>op.id)};
  await this.transaction(()=>this.db.run("INSERT INTO sync_v2_bootstrap VALUES('client-initialization','manifest','1',?)",[JSON.stringify(manifest)]));return manifest;
 }
 async finishBootstrap(event:Event,library:string,peer:string,captured:string[]){
  return this.transaction(async()=>{
   for(const c of event.operation.changes){
    const v=await this.version(c);
    if(v.operation_id===null||captured.includes(v.operation_id))await this.setVersions({...event,operation:{...event.operation,changes:[c]}});
   }
   for(const id of captured)await this.db.run("UPDATE sync_v2_outbox SET state='accepted' WHERE id=?",[id]);
   for(const op of await this.pending()){
    for(const c of op.changes)if((c.previous===null&&event.operation.changes.some(r=>keyOf(r)===keyOf(c)))||(c.previous!==null&&captured.includes(c.previous))){c.previous=event.operation.id;c.base=event.revision;}
    await this.db.run('UPDATE sync_v2_outbox SET payload=? WHERE id=?',[JSON.stringify(op),op.id]);
   }
   await this.db.run('INSERT OR REPLACE INTO sync_v2_seen VALUES(?,?)',[event.operation.id,JSON.stringify({event})]);
   await this.db.run('UPDATE sync_v2_identity SET library_id=?,peer_id=?,cursor=?,last_success=? WHERE id=1',[library,peer,event.revision,new Date().toISOString()]);
  });
 }
 async accept(operation:Operation):Promise<Outcome>{
  validateOperation(operation);
  return this.transaction(async()=>{
   const [seen]=await this.db.all<{outcome:string}>('SELECT outcome FROM sync_v2_seen WHERE id=?',[operation.id]);
   if(seen){const old=JSON.parse(seen.outcome) as Outcome;const op='event'in old?old.event.operation:old.conflict.operation;if(!equal(op,operation))throw new Error('Operation ID reused with different content.');return old;}
   let reason='';
   for(const c of operation.changes){
    const v=await this.version(c);
    if(c.previous!==null?v.operation_id!==c.previous:v.revision!==c.base) reason='Both devices changed a record from an earlier revision.';
   }
   if(operation.resolves){
    const [conflict]=await this.db.all<{state:string}>('SELECT state FROM sync_v2_conflicts WHERE id=?',[operation.resolves]);
    if(!conflict||conflict.state!=='open') throw new Error('Conflict already resolved or unknown.');
   }
   if(!reason){
    // A savepoint isolates graph/SQL validation failures so they are retained as
    // dependency conflicts without partially applying a logical transaction.
    await this.db.exec('SAVEPOINT replay;');
    try{await applyRecords(this.db,operation.changes);await this.db.exec('RELEASE replay;');}
    catch(e){await this.db.exec('ROLLBACK TO replay; RELEASE replay;');if(!domainFailure(e))throw e;reason=e instanceof Error?e.message:'Invalid dependencies.';}
   }
   if(reason){
    const conflict={operation,current:await this.current(operation.changes),reason};
    const outcome={conflict};
    await this.db.run('INSERT INTO sync_v2_conflicts(id,payload) VALUES(?,?)',[operation.id,JSON.stringify(conflict)]);
    await this.db.run('INSERT INTO sync_v2_seen VALUES(?,?)',[operation.id,JSON.stringify(outcome)]);
    return outcome;
   }
   const event=await this.append(operation);await this.setVersions(event);
   if(operation.resolves) await this.db.run("UPDATE sync_v2_conflicts SET state='resolved' WHERE id=?",[operation.resolves]);
   return {event};
  });
 }
 async rememberConflict(conflict:Conflict){
  await this.db.run("INSERT INTO sync_v2_conflicts(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,state='open'",[conflict.operation.id,JSON.stringify(conflict)]);
  await this.db.run("UPDATE sync_v2_outbox SET state='conflict' WHERE id=? AND state='pending'",[conflict.operation.id]);
 }
 async recordOutcome(outcome:Outcome){
  return this.transaction(async()=>{
   if('conflict'in outcome){await this.rememberConflict(outcome.conflict);return;}
   await this.db.run("UPDATE sync_v2_outbox SET state='accepted' WHERE id=?",[outcome.event.operation.id]);
   await this.db.run('INSERT OR REPLACE INTO sync_v2_seen VALUES(?,?)',[outcome.event.operation.id,JSON.stringify(outcome)]);
   await this.setVersions(outcome.event,true);
  });
 }
 async history(after:number){
  return (await this.db.all<{revision:number;payload:string}>('SELECT revision,payload FROM sync_v2_history WHERE revision>? ORDER BY revision LIMIT ?',[after,PAGE_SIZE])).map(r=>({revision:r.revision,operation:JSON.parse(r.payload) as Operation}));
 }
 async replay(event:Event){
  validateOperation(event.operation);
  if(!Number.isSafeInteger(event.revision)||event.revision<1)throw new Error('Invalid remote revision.');
  return this.transaction(async()=>{
   const i=await this.identity();if(event.revision<=i.cursor)return;
   if(event.revision!==i.cursor+1)throw new Error('Remote cursor gap; retry without skipping changes.');
   const [seen]=await this.db.all('SELECT id FROM sync_v2_seen WHERE id=?',[event.operation.id]);
   if(!seen){
    if(event.operation.resolves){
     const [row]=await this.db.all<{payload:string}>("SELECT payload FROM sync_v2_conflicts WHERE id=? AND state='open'",[event.operation.resolves]);
     if(row){
      const conflict=JSON.parse(row.payload) as Conflict;
      const local=await this.current(conflict.operation.changes);
      // PC-side choices may replace the retained version only when it has not
      // changed since conflict capture. A newer phone edit remains a conflict.
      if(local.every(c=>equal(c.value,conflict.operation.changes.find(r=>keyOf(r)===keyOf(c))?.value))){
       await this.db.run("UPDATE sync_v2_outbox SET state='superseded' WHERE id=?",[event.operation.resolves]);
       await this.db.run("UPDATE sync_v2_conflicts SET state='resolved' WHERE id=?",[event.operation.resolves]);
      }
     }
    }
    const pending=await this.db.all<{payload:string}>("SELECT payload FROM sync_v2_outbox WHERE state IN ('pending','conflict')");
    const keys=new Set(event.operation.changes.map(keyOf));
    const overlaps=pending.map(r=>JSON.parse(r.payload) as Operation).filter(op=>op.changes.some(c=>keys.has(keyOf(c))));
    if(overlaps.length){
     for(const op of overlaps) await this.rememberConflict({operation:op,current:await this.remoteCurrent(event,op.changes),reason:'Incoming transaction overlaps retained local changes.'});
    }else{
     await this.db.exec('SAVEPOINT replay;');
     try{await applyRecords(this.db,event.operation.changes);await this.setVersions(event);await this.db.exec('RELEASE replay;');}
     catch(e){
      // Preserve the entire event and cursor atomically as a visible conflict.
      await this.db.exec('ROLLBACK TO replay; RELEASE replay;');
      if(!domainFailure(e))throw e;
      await this.rememberConflict({operation:event.operation,current:await this.current(event.operation.changes),reason:e instanceof Error?e.message:'Incoming dependency conflict.'});
     }
    }
    await this.db.run('INSERT INTO sync_v2_seen VALUES(?,?)',[event.operation.id,JSON.stringify({event})]);
   }
   await this.db.run('UPDATE sync_v2_identity SET cursor=? WHERE id=1',[event.revision]);
  });
 }
 private async remoteCurrent(event:Event,changes:Change[]){
  const current=await this.current(changes);return current.map(c=>{const r=event.operation.changes.find(r=>keyOf(r)===keyOf(c));return r?{...r,base:event.revision,previous:event.operation.id}:c;});
 }
 async resolutionClosure(conflictId:string){
  const [row]=await this.db.all<{payload:string}>("SELECT payload FROM sync_v2_conflicts WHERE id=? AND state='open'",[conflictId]);
  if(!row)throw new Error('Conflict not found.');
  const conflict=JSON.parse(row.payload) as Conflict;
  const keys=new Set(conflict.operation.changes.map(keyOf));
  const pending=(await this.db.all<{id:string;payload:string}>("SELECT id,payload FROM sync_v2_outbox WHERE state IN ('pending','conflict')")).map(r=>({id:r.id,op:JSON.parse(r.payload) as Operation}));
  const ids=new Set<string>();let changed=true;
  while(changed){changed=false;for(const p of pending)if(!ids.has(p.id)&&p.op.changes.some(c=>keys.has(keyOf(c)))){ids.add(p.id);p.op.changes.forEach(c=>keys.add(keyOf(c)));changed=true;}}
  const records=new Map(conflict.operation.changes.map(c=>[keyOf(c),c]));
  for(const p of pending.filter(p=>ids.has(p.id)))for(const c of p.op.changes)records.set(keyOf(c),c);
  return {conflict,ids:[...ids],current:await this.current([...records.values()])};
 }
 async finishResolution(event:Event,ids:string[],conflictId:string){
  return this.transaction(async()=>{
   await applyRecords(this.db,event.operation.changes);
   for(const id of ids)await this.db.run("UPDATE sync_v2_outbox SET state='superseded' WHERE id=?",[id]);
   await this.db.run("UPDATE sync_v2_conflicts SET state='resolved' WHERE id=?",[conflictId]);
   await this.db.run('INSERT OR REPLACE INTO sync_v2_seen VALUES(?,?)',[event.operation.id,JSON.stringify({event})]);
   await this.setVersions(event);
  });
 }
 async markSuccess(){await this.transaction(()=>this.db.run('UPDATE sync_v2_identity SET last_success=? WHERE id=1',[new Date().toISOString()]));}
 async acknowledge(device:string,cursor:number){
  if(!Number.isSafeInteger(cursor)||cursor<0)throw new Error('Invalid cursor.');
  const [r]=await this.db.all<{n:number}>('SELECT COALESCE(MAX(revision),0) AS n FROM sync_v2_history');
  if(cursor>r.n)throw new Error('Acknowledgment exceeds history.');
  await this.transaction(()=>this.db.run('INSERT INTO sync_v2_ack VALUES(?,?) ON CONFLICT(device_id) DO UPDATE SET cursor=MAX(cursor,excluded.cursor)',[device,cursor]));
 }
}

function domainFailure(e:unknown){return e instanceof SyncValidationError || (typeof (e as {errcode?:number})?.errcode==='number'&&((e as {errcode:number}).errcode&255)===19);}
