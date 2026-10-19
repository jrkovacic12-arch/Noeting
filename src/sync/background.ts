import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import {Platform} from 'react-native';
import {defineAutomaticTask} from './headless';
import {BACKGROUND_SYNC_TASK} from './backgroundRegistration';
// Module/global scope: task execution never requires a mounted App component.
defineAutomaticTask(TaskManager,BACKGROUND_SYNC_TASK,async()=>{
 const runtime=await import('./runtime');return runtime.headlessDependencies();
},{success:BackgroundTask.BackgroundTaskResult.Success,failed:BackgroundTask.BackgroundTaskResult.Failed,
 onExpiration:Platform.OS==='ios'?abort=>BackgroundTask.addExpirationListener(abort):undefined,
 after:async()=>{const runtime=await import('./runtime');await runtime.reconcileHeadlessRegistration();},
});
