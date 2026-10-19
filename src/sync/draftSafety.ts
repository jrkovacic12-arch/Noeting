import type { Repository,Snapshot } from '../data/repository';
import type { SyncStore } from './store';
import {SyncError} from './errors';
export const DRAFT_KEY='noeting.editor-drafts.v2';
export const LEGACY_DRAFT_KEY='noeting.editor-draft.v1';
export type DraftReader=(key:string)=>Promise<string|null>;
/** Inspect recovery storage without deleting or treating it as committed data. */
export function inspectDrafts(raw:string|null,legacy:string|null,snapshot:Snapshot){
 const entries=new Map(snapshot.entries.map(e=>[e.id,e.text]));let drafts:unknown;
 try{drafts=raw?JSON.parse(raw):{};}catch{throw new SyncError('drafts','Sync paused: recovery drafts could not be read safely.');}
 if(!drafts||typeof drafts!=='object'||Array.isArray(drafts))throw new SyncError('drafts','Sync paused: recovery drafts require attention.');
 const values=Object.values(drafts);
 if(legacy){try{const value=JSON.parse(legacy);if(value&&typeof value==='object')values.push(value);}catch{if(!raw)throw new SyncError('drafts','Sync paused: legacy recovery draft needs attention.');}}
 for(const value of values){if(!value||typeof value!=='object')throw new SyncError('drafts','Sync paused: recovery drafts require attention.');
  const d=value as {editEntryId?:unknown;text?:unknown};
  if(d.editEntryId!==undefined&&(typeof d.editEntryId!=='string'||typeof d.text!=='string'||entries.get(d.editEntryId)!==d.text))throw new SyncError('drafts','Sync paused: unsaved editor changes. Save or retry the retained edit.');
 }
}
export async function checkPersistedDrafts(repo:Repository,read:DraftReader){
 const snapshot=await repo.readSnapshot();const [raw,legacy]=await Promise.all([read(DRAFT_KEY),read(LEGACY_DRAFT_KEY)]);inspectDrafts(raw,legacy,snapshot);
}
/** Foreground navigation waits for the short apply barrier. New editors cannot
 * mount on stale data while a previously started incoming replay is committing. */
export class DraftGate {
 editing=false;private applying=false;private waiters:Array<()=>void>=[];
 async waitForReplay(){while(this.applying)await new Promise<void>(resolve=>this.waiters.push(resolve));}
 async beginReplay(){if(this.editing||this.applying)throw new SyncError('drafts','Sync paused: an editor is open. Committed uploads remain safe.');this.applying=true;
  return ()=>{this.applying=false;for(const wake of this.waiters.splice(0))wake();};
 }
}
export class ForegroundPresence {
 private owner:string|null=null;
 constructor(readonly repo:Repository,readonly now=Date.now){}
 async active(){await this.repo.sync(s=>s.transaction(async()=>{
  if(!this.owner)this.owner=(await s.db.all<{id:string}>('SELECT lower(hex(randomblob(16))) AS id'))[0].id;
  await s.db.run('UPDATE sync_foreground_presence SET owner=?,expires_at=? WHERE id=1',[this.owner,this.now()+60000]);
 }));}
 async inactive(){const owner=this.owner;await this.repo.sync(s=>s.transaction(()=>s.db.run('UPDATE sync_foreground_presence SET expires_at=? WHERE id=1 AND owner=?',[this.now()+30000,owner])));}
}
export async function assertBackgroundIdle(store:SyncStore,now=Date.now()){
 const [row]=await store.db.all<{expires_at:number}>('SELECT expires_at FROM sync_foreground_presence WHERE id=1');
 if(row.expires_at>now&&row.expires_at<=now+60000)throw new SyncError('drafts','Foreground editor coordination is active; background sync deferred.');
}
