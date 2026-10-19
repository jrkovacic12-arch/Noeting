import {AutomaticSync,type AutoDependencies,type AttemptResult} from './automatic';
export interface GlobalTaskAdapter {
 isTaskDefined(name:string):boolean;
 defineTask(name:string,handler:(body:{error?:unknown})=>Promise<number>):void;
}
/** Pure entry adapter used by the native module-scope definition and native
 * adapter tests. Its dependency factory opens storage independently of React. */
export function defineAutomaticTask(adapter:GlobalTaskAdapter,name:string,factory:()=>Promise<AutoDependencies>,options:{success:number;failed:number;onExpiration?:(abort:()=>void)=>{remove():void};after?:()=>Promise<void>}){
 if(adapter.isTaskDefined(name))return;
 adapter.defineTask(name,async body=>{
  if(body.error)return options.failed;
  const controller=new AbortController();let expiration:{remove():void}|undefined;
  try{expiration=options.onExpiration?.(()=>controller.abort());const dependencies=await factory();const result:AttemptResult=await new AutomaticSync(dependencies).attempt('background',controller.signal);return result.kind==='waiting'?options.failed:options.success;}
  catch{return options.failed;}
  finally{expiration?.remove();await options.after?.().catch(()=>undefined);}
 });
}
