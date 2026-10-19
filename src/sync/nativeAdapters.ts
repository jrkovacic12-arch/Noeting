import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import NetInfo from "@react-native-community/netinfo";
import { AppState, Platform } from "react-native";
import Storage from "expo-sqlite/kv-store";
import type { BackgroundDriver } from "./backgroundRegistration";
import { BACKGROUND_SYNC_TASK } from "./backgroundRegistration";
export const backgroundDriver: BackgroundDriver = {
  available: async () =>
    Platform.OS === "android" &&
    (await TaskManager.isAvailableAsync()) &&
    (await BackgroundTask.getStatusAsync()) ===
      BackgroundTask.BackgroundTaskStatus.Available,
  registered: () => TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK),
  register: (minutes) =>
    BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: Math.max(15, minutes),
    }),
  unregister: () => BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK),
};
export const appSignals = {
  headlessCoordination: Platform.OS === "android",
  active: () => AppState.currentState === "active",
  lifecycle: (callback: (active: boolean) => void) => {
    const subscription = AppState.addEventListener("change", (state) =>
      callback(state === "active"),
    );
    return () => subscription.remove();
  },
  // Any event is only a hint to probe the pinned authenticated HTTPS endpoint.
  network: (callback: () => void) => NetInfo.addEventListener(() => callback()),
};
export const readDraft = (key: string) => Storage.getItem(key);
