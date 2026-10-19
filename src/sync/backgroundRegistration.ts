import type {SyncConfiguration} from './configuration';
export const BACKGROUND_SYNC_TASK='noeting.sync.v2.automatic';
export interface BackgroundDriver{available():Promise<boolean>;registered():Promise<boolean>;register(minutes:number):Promise<void>;unregister():Promise<void>}
export class BackgroundRegistration {
 private tail=Promise.resolve();
 constructor(readonly configuration:SyncConfiguration,readonly driver:BackgroundDriver){}
 reconcile():Promise<string>{
  const result=this.tail.then(async()=>{
   const settings=await this.configuration.load();const enabled=!!(settings.enabled&&!settings.auth_required&&settings.origin&&settings.credential_key);
   if(!enabled){if(await this.driver.registered())await this.driver.unregister();return 'Background automatic sync off.';}
   if(!await this.driver.available())return 'Android background scheduling is unavailable; foreground automatic sync remains available.';
   if(!await this.driver.registered())await this.driver.register(15);
   const current=await this.configuration.load();
   if(!current.enabled||current.auth_required||current.generation!==settings.generation){if(await this.driver.registered())await this.driver.unregister();return 'Background configuration changed; registration will be reconciled.';}
   return 'Android background sync requested: at least 15 minutes, with timing controlled by Android.';
  });
  this.tail=result.then(()=>undefined,()=>undefined);return result;
 }
}
