import type {Repository,Snapshot} from '../data/repository';
import {openRepository} from '../data/sqlite';
import {SyncConfiguration} from './configuration';
import {credentialVault} from './credentialVault';
import {AutomaticSync,ForegroundSync} from './automatic';
import {BackgroundRegistration} from './backgroundRegistration';
import {backgroundDriver,appSignals,readDraft} from './nativeAdapters';
import {syncFetch} from './fetchTransport';
import {httpsRPC,syncNow,resolveConflict,keepBoth} from './client';
import {DraftGate,ForegroundPresence,checkPersistedDrafts} from './draftSafety';
import {SyncError,safeReason} from './errors';
import {tailscaleOrigin} from './origin';
export async function headlessDependencies(){const repo=await openRepository();return {repo,configuration:new SyncConfiguration(repo,credentialVault),readDraft,rpc:(origin:string,token:string)=>httpsRPC(origin,token,{fetch:syncFetch})};}
export async function reconcileHeadlessRegistration(){const {configuration}=await headlessDependencies();await new BackgroundRegistration(configuration,backgroundDriver).reconcile();}
export class SyncRuntime {
 readonly configuration:SyncConfiguration;readonly gate=new DraftGate();readonly presence:ForegroundPresence;
 readonly automatic:AutomaticSync;readonly foreground:ForegroundSync;readonly registration:BackgroundRegistration;
 running=false;backgroundMessage='';private active=false;private disposed=false;private cleanups:Array<()=>void>=[];private heartbeat?:ReturnType<typeof setInterval>;
 constructor(readonly repo:Repository,readonly updated:()=>Promise<void>){
  this.configuration=new SyncConfiguration(repo,credentialVault);this.presence=new ForegroundPresence(repo);
  this.automatic=new AutomaticSync({repo,configuration:this.configuration,readDraft,rpc:(origin,token)=>httpsRPC(origin,token,{fetch:syncFetch}),gate:this.gate,onActivity:running=>{this.running=running;void this.emit();},onUpdated:()=>this.emit()});
  this.foreground=new ForegroundSync(this.automatic);this.registration=new BackgroundRegistration(this.configuration,backgroundDriver);
 }
 private async emit(){if(!this.disposed)await this.updated().catch(()=>undefined);}
 async start(){
  this.active=appSignals.active();await this.presence.active();if(this.disposed)return;await this.emit();if(this.disposed)return;
  this.cleanups.push(this.repo.subscribeCommitted(()=>this.foreground.trigger('local')));
  this.cleanups.push(appSignals.network(()=>this.foreground.trigger('network')));
  this.cleanups.push(appSignals.lifecycle(active=>{void this.lifecycle(active);}));
  this.heartbeat=setInterval(()=>{if(this.active)void this.presence.active().catch(()=>undefined);},20000);
  this.foreground.setActive(this.active);void this.reconcile();
 }
 private async lifecycle(active:boolean){
  if(this.disposed)return;this.active=active;
  if(active){try{await this.presence.active();if(this.disposed)return;await this.emit();if(this.disposed)return;this.foreground.setActive(true);await this.reconcile();}catch{/* Local startup can be retried without a network fallback. */}}
  else{this.foreground.setActive(false);await this.presence.inactive().catch(()=>undefined);}
 }
 async reconcile(){try{this.backgroundMessage=await this.registration.reconcile();}catch{this.backgroundMessage='Android background registration needs retry; local editing and manual sync remain available.';}if(!this.disposed)await this.foreground.refresh().catch(()=>undefined);await this.emit();}
 async navigate(action:()=>void,refresh:(snapshot:Snapshot)=>void){
  await this.gate.waitForReplay();this.gate.editing=true;
  // Register foreground ownership and read current committed data before mounting
  // an editor, including when a headless replay was already finishing.
  await this.presence.active();refresh(await this.repo.readSnapshot());action();
 }
 async savePairing(address:string,token:string){
  this.foreground.stop();await this.configuration.setEnabled(false);await this.reconcile();
  const settings=await this.configuration.save(address,token,true,async(origin,secret,identity)=>httpsRPC(origin,secret,{fetch:syncFetch})('pair',{device:identity.device_id,library:identity.library_id}));await this.emit();return settings;
 }
 async setAutomatic(enabled:boolean){
  if(!enabled)this.foreground.stop();await this.configuration.setEnabled(enabled);await this.reconcile();
  if(enabled){this.foreground.setActive(this.active);await this.foreground.refresh();this.foreground.trigger('launch',0);}await this.emit();
 }
 async disconnect(){this.foreground.stop();try{await this.configuration.disconnect();}finally{await this.reconcile();}}
 async setPollSeconds(seconds:number){if(!Number.isInteger(seconds)||seconds<15||seconds>300)throw new SyncError('policy','Choose a foreground interval from 15 to 300 seconds.');await this.repo.sync(s=>s.transaction(()=>s.db.run('UPDATE sync_auto_settings SET poll_ms=? WHERE id=1',[seconds*1000])));await this.foreground.refresh();await this.emit();}
 async manual(address:string,token:string,initialize=false,conflictId?:string,choice?:'android'|'pc'|'both'){
  const settings=await this.configuration.load(),origin=tailscaleOrigin(address||settings.origin||'');
  if(settings.origin&&origin!==settings.origin)throw new SyncError('policy','The approved PC origin is pinned. Disconnect explicitly before changing it.');
  const secret=token||(await this.configuration.credential(settings)).token;
  const rpc=httpsRPC(origin,secret,{fetch:syncFetch});this.running=true;await this.emit();
  const generation=settings.generation;
  try{
   await this.repo.sync(s=>s.transaction(()=>s.db.run("UPDATE sync_auto_settings SET last_attempt=?,last_reason='Synchronizing…' WHERE id=1",[new Date().toISOString()])));
   const options={prepareReplay:async()=>{const release=await this.gate.beginReplay();try{await checkPersistedDrafts(this.repo,readDraft);return release;}catch(error){release();throw error;}},assertReplay:async()=>{if(this.gate.editing)throw new SyncError('drafts','Sync paused: an editor is open.');}};
   if(conflictId&&choice==='both')await keepBoth(this.repo,rpc,conflictId,options);
   else if(conflictId&&(choice==='android'||choice==='pc'))await resolveConflict(this.repo,rpc,conflictId,choice,options);
   else await syncNow(this.repo,rpc,initialize,options);
   await this.repo.sync(s=>s.transaction(()=>s.db.run("UPDATE sync_auto_settings SET failures=0,retry_after=0,last_reason='Last synced successfully.' WHERE id=1")));
  }catch(error){if(error instanceof SyncError&&['auth','identity'].includes(error.code)&&settings.credential_key)await this.configuration.requireAttention(safeReason(error),generation);throw error;}
  finally{this.running=false;await this.reconcile();await this.emit();}
 }
 stop(){this.disposed=true;this.foreground.stop();for(const cleanup of this.cleanups.splice(0))cleanup();if(this.heartbeat)clearInterval(this.heartbeat);void this.presence.inactive().catch(()=>undefined);}
}
