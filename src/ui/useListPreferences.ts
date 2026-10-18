import { useEffect, useRef, useState } from "react";
import Storage from "expo-sqlite/kv-store";
import type { EntryKind } from "../data/repository";

/** Optional saved navigation context; database/draft recovery stays in App. */
export function useListPreferences(enabled: boolean) {
  const [tab, setTab] = useState<EntryKind>("note");
  const [queries, setQueries] = useState({ note: "", task: "" });
  const [folder, setFolder] = useState("all");
  const [preferencesReady, setPreferencesReady] = useState(false);
  const preferenceQueue = useRef(Promise.resolve());
  const [preferenceWarning, setPreferenceWarning] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    Storage.getItem("noeting.list-context.v1")
      .then((raw) => {
        if (!active || !raw) return;
        const p: unknown = JSON.parse(raw);
        if (!p || typeof p !== "object" || Array.isArray(p))
          throw new Error("Invalid list preferences");
        const saved = p as { tab?: unknown; folder?: unknown; queries?: { note?: unknown; task?: unknown } };
        if ((saved.tab !== "note" && saved.tab !== "task") ||
          typeof saved.folder !== "string" ||
          typeof saved.queries?.note !== "string" || typeof saved.queries?.task !== "string")
          throw new Error("Invalid list preferences");
        setTab(saved.tab);
        setFolder(saved.folder);
        setQueries({ note: saved.queries.note, task: saved.queries.task });
      })
      .catch(() => {
        if (active) setPreferenceWarning("Could not restore list preferences. Using defaults.");
      })
      .finally(() => {
        if (active) setPreferencesReady(true);
      });
    return () => { active = false; };
  }, [enabled]);
  useEffect(() => {
    if (!preferencesReady) return;
    const raw = JSON.stringify({ tab, queries, folder });
    preferenceQueue.current = preferenceQueue.current
      .then(async () => {
        await Storage.setItem("noeting.list-context.v1", raw);
        setPreferenceWarning((warning) => warning === "Could not keep list preferences." ? null : warning);
      })
      .catch(() => setPreferenceWarning("Could not keep list preferences."));
  }, [tab, queries, folder, preferencesReady]);
  return { tab, setTab, queries, setQueries, folder, setFolder, preferencesReady, preferenceWarning };
}
