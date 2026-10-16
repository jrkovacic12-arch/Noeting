import { useEffect, useRef, useState } from "react";
import Storage from "expo-sqlite/kv-store";
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
  const values = useRef<Record<string, EditorDraft>>({});
  const [revision, bump] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const queue = useRef(Promise.resolve());
  const stored = useRef(true);
  const persist = () => {
    const raw = JSON.stringify(values.current);
    queue.current = queue.current
      .then(async () => {
        await Storage.setItem(key, raw);
        stored.current = true;
        setError(null);
      })
      .catch(() => {
        stored.current = false;
        setError("Unsaved draft. Retry before leaving.");
      });
  };
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
      values.current = next;
      await Storage.setItem(key, JSON.stringify(next)); // old key retained as migration backup; v2 is authoritative
      if (old) await Storage.removeItem("noeting.editor-draft.v1");
      bump((v) => v + 1);
      setReady(true);
    })().catch(() => {
      if (active) setError("Could not load drafts. Retry opening the app.");
    });
    return () => {
      active = false;
    };
  }, [enabled, loadAttempt]);
  function get(context: string) {
    return values.current[context] ?? null;
  }
  function put(context: string, next: EditorDraft | null) {
    if (next) values.current = { ...values.current, [context]: next };
    else {
      const copy = { ...values.current };
      delete copy[context];
      values.current = copy;
    }
    bump((v) => v + 1);
    persist();
  }
  async function flush() {
    await queue.current;
    if (!stored.current) {
      persist();
      await queue.current;
    }
    return stored.current;
  }
  return {
    get,
    put,
    flush,
    ready,
    error,
    revision,
    retry: () => setLoadAttempt((v) => v + 1),
  };
}
export type DraftStore = ReturnType<typeof useDraft>;
