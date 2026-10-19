import type {Repository} from '../data/repository';
import {SyncConfiguration,type AutoSettings} from './configuration';
import {syncNow,type RPC} from './client';
import {SyncError,safeReason} from './errors';
import {checkPersistedDrafts,assertBackgroundIdle,type DraftReader,type DraftGate} from './draftSafety';
export type Trigger='launch'|'resume'|'network'|'local'|'poll'|'retry'|'background';
export type AttemptResult={kind:'disabled'|'waiting'|'success'|'deferred'|'attention'|'cancelled';settings:AutoSettings};
export type AutoDependencies={repo:Repository;configuration:SyncConfiguration;readDraft:DraftReader;rpc:(origin:string,token:string)=>RPC;now?:()=>number;random?:()=>number;gate?:DraftGate;onActivity?:(running:boolean)=>void;onUpdated?:()=>Promise<void>};
/** One bounded attempt. Timers and OS workers both call this same headless-safe
 * function; no navigation, React state, HTTP retries or bootstrap are hidden here. */
export class AutomaticSync {
 readonly now:()=>number;readonly random:()=>number;
 constructor(readonly dependencies:AutoDependencies){this.now=dependencies.now??Date.now;this.random=dependencies.random??Math.random;}
 private async status(generation:number,reason:string,fields:{failures?:number;retry?:number}={}){
  await this.dependencies.repo.sync(s=>s.transaction(()=>s.db.run('UPDATE sync_auto_settings SET last_reason=?,failures=COALESCE(?,failures),retry_after=COALESCE(?,retry_after) WHERE id=1 AND generation=?',[reason,fields.failures??null,fields.retry??null,generation])));
 }
 async attempt(source:Trigger,signal?:AbortSignal):Promise<AttemptResult>{
  const {repo,configuration,gate}=this.dependencies;let settings=await configuration.load();
  const result=async(kind:AttemptResult['kind'])=>({kind,settings:await configuration.load()});
  if(!settings.enabled)return result('disabled');if(settings.auth_required)return result('attention');if(settings.retry_after>this.now())return result('waiting');
  if(signal?.aborted)return result('cancelled');
  const generation=settings.generation;
  this.dependencies.onActivity?.(true);
  try{
   if(source==='background')await repo.sync(s=>assertBackgroundIdle(s,this.now()));
   const credential=await configuration.credential(settings);
   await repo.sync(s=>s.transaction(()=>s.db.run("UPDATE sync_auto_settings SET last_attempt=?,last_reason='Synchronizing…' WHERE id=1 AND generation=?",[new Date(this.now()).toISOString(),generation])));
   const rpc=this.dependencies.rpc(credential.origin,credential.token);
   const status=await syncNow(repo,rpc,false,{
    automaticGeneration:generation,requirePaired:true,now:this.now,signal,
    maxDurationMs:source==='background'?25000:45000,maxOperations:source==='background'?5:50,maxEvents:source==='background'?10:100,
    prepareReplay:async()=>{
     const release=source==='background'?()=>{}:await gate?.beginReplay()??(()=>{});
     try{await checkPersistedDrafts(repo,this.dependencies.readDraft);return release;}catch(error){release();throw error;}
    },
    assertReplay:source==='background'?store=>assertBackgroundIdle(store,this.now()):async()=>{if(gate?.editing)throw new SyncError('drafts','Sync paused: unsaved editor changes.');},
   });
   await this.status(generation,status.conflicts?'Conflicts need review.':status.incomplete?'More changes remain; synchronization will resume.':'Last synced successfully.',{failures:0,retry:status.incomplete?this.now()+3000:0});
   return result(status.incomplete?'deferred':'success');
  }catch(error){
   if(error instanceof SyncError&&(error.code==='auth'||error.code==='identity')){await configuration.requireAttention(safeReason(error),generation);return result('attention');}
   if(error instanceof SyncError&&error.code==='cancelled')return result('cancelled');
   if(error instanceof SyncError&&['drafts','busy','budget'].includes(error.code)){
    await this.status(generation,safeReason(error),{retry:error.code==='budget'?this.now()+3000:0});return result('deferred');
   }
   settings=await configuration.load();const failures=Math.min(settings.failures+1,16);
   const delay=Math.round(Math.min(15*60_000,15000*2**Math.min(failures-1,6))*(.8+.4*this.random()));
   await this.status(generation,error instanceof SyncError?error.message:'Connection unavailable; changes saved locally.',{failures,retry:this.now()+delay});return result('waiting');
  }finally{this.dependencies.onActivity?.(false);try{await this.dependencies.onUpdated?.();}catch{/* Status refresh may retry later. */}}
 }
}
export type TimerDriver={set(work:()=>void,ms:number):unknown;clear(id:unknown):void};
const realTimers:TimerDriver={set:(work,ms)=>setTimeout(work,ms),clear:id=>clearTimeout(id as ReturnType<typeof setTimeout>)};
/** Single coalescing foreground scheduler. Database leases additionally serialize
 * it with manual sync and separate native headless contexts. */
export class ForegroundSync {
 private active=false;private stopped=false;private eligible=false;private running=false;private queued=false;
 private debounce:unknown;private poll:unknown;private retry:unknown;private abort?:AbortController;
 constructor(readonly automatic:AutomaticSync,readonly timers:TimerDriver=realTimers){}
 private clear(name:'debounce'|'poll'|'retry'){if(this[name]!==undefined){this.timers.clear(this[name]);this[name]=undefined;}}
 async refresh(){
  const settings=await this.automatic.dependencies.configuration.load();
  if(!this.active||this.stopped||!settings.enabled||settings.auth_required){this.eligible=false;this.cancelTimers();this.abort?.abort();return;}
  this.eligible=true;
  if(this.poll===undefined)this.poll=this.timers.set(()=>{this.poll=undefined;this.trigger('poll',0);void this.refresh().catch(()=>undefined);},Math.max(15000,Math.min(settings.poll_ms,300000)));
 }
 setActive(active:boolean){this.active=active;if(!active){this.eligible=false;this.cancelTimers();this.abort?.abort();return;}this.stopped=false;void this.refresh().then(()=>this.trigger('resume',0)).catch(()=>undefined);}
 trigger(source:Trigger,delay=source==='local'||source==='network'?3000:0){
  if(!this.active||this.stopped||!this.eligible)return;
  if(this.running){this.queued=true;return;}
  this.clear('debounce');this.debounce=this.timers.set(()=>{this.debounce=undefined;void this.run(source);},delay);
 }
 private async run(source:Trigger){
  if(!this.active||this.stopped||this.running)return;this.running=true;this.abort=new AbortController();
  try{const result=await this.automatic.attempt(source,this.abort.signal);
   if(this.active&&!this.stopped&&result.settings.enabled&&!result.settings.auth_required&&result.settings.retry_after>this.automatic.now()){
    this.clear('retry');this.retry=this.timers.set(()=>{this.retry=undefined;this.trigger('retry',0);},result.settings.retry_after-this.automatic.now());
   }
  }catch{/* Storage/startup errors are retried on a later foreground signal. */}finally{this.running=false;this.abort=undefined;if(this.queued){this.queued=false;this.trigger('local');}void this.refresh().catch(()=>undefined);}
 }
 private cancelTimers(){this.clear('debounce');this.clear('poll');this.clear('retry');this.queued=false;}
 stop(){this.stopped=true;this.eligible=false;this.cancelTimers();this.abort?.abort();}
}
