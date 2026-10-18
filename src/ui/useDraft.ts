import { useEffect, useRef, useState } from "react";
import Storage from "expo-sqlite/kv-store";
import { DraftPersistence } from "./draftPersistence";
import type { EditorDraft } from "./EntryEditor";
export const draftContext = (d: EditorDraft) =>
  d.editEntryId
    ? `edit:${d.editEntryId}`
    : d.parentTaskId
      ? `child:${d.parentTaskId}`
      : d.sourceEntryId
        ? `link:${d.sourceEntryId}:${d.kind}`
        : `new:${d.kind}`;
const key = "noeting.editor-drafts.v2";
export function useDraft(enabled: boolean) {
  const [revision, bump] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const persistence = useRef<DraftPersistence | null>(null);
  if (!persistence.current) persistence.current = new DraftPersistence(
    (raw) => Storage.setItem(key, raw),
    () => { bump((v) => v + 1); setError(persistence.current!.error); },
  );
  const store = persistence.current;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    (async () => {
      const raw = await Storage.getItem(key);
      const next = raw ? JSON.parse(raw) : {};
      const old = await Storage.getItem("noeting.editor-draft.v1");
      if (old) {
        const d = JSON.parse(old) as EditorDraft;
        if (d.kind && typeof d.text === "string" && d.requestId) {
          const context = draftContext(d);
          if (!next[context]) next[context] = d;
        }
      }
      if (!active) return;
      store.values = next;
      await Storage.setItem(key, JSON.stringify(next)); // old key retained as migration backup; v2 is authoritative
      if (old) await Storage.removeItem("noeting.editor-draft.v1");
      if (!active) return;
      bump((v) => v + 1);
      setError(null);
      setReady(true);
    })().catch(() => {
      if (active) setError("Could not load drafts. Retry opening the app.");
    });
    return () => {
      active = false;
    };
  }, [enabled, loadAttempt]);
  function get(context: string) { return store.values[context] ?? null; }
  function put(context: string, next: EditorDraft | null) { store.put(context, next); }
  function flush() { return store.flush(); }
  function discard(context: string) { return store.discard(context); }
  return {
    get,
    put,
    flush,
    discard,
    ready,
    error,
    revision,
    retry: () => setLoadAttempt((v) => v + 1),
  };
}
export type DraftStore = ReturnType<typeof useDraft>;
