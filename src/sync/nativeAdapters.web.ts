import Storage from "expo-sqlite/kv-store";
import type { BackgroundDriver } from "./backgroundRegistration";
export const backgroundDriver: BackgroundDriver = {
  available: async () => false,
  registered: async () => false,
  register: async () => {},
  unregister: async () => {},
};
export const appSignals = {
  headlessCoordination: false,
  active: () =>
    typeof document === "undefined" || document.visibilityState !== "hidden",
  lifecycle: (callback: (active: boolean) => void) => {
    const listener = () => callback(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
  network: (callback: () => void) => {
    window.addEventListener("online", callback);
    window.addEventListener("offline", callback);
    return () => {
      window.removeEventListener("online", callback);
      window.removeEventListener("offline", callback);
    };
  },
};
export const readDraft = (key: string) => Storage.getItem(key);
