import { randomUUID } from "expo-crypto";
import { useEffect, useMemo, useRef, useState } from "react";
import Storage from "expo-sqlite/kv-store";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { openRepository } from "./src/data/sqlite";
import type {
  Entry,
  EntryKind,
  Repository,
  Removal,
  Snapshot,
  Task,
} from "./src/data/repository";
import { indexSnapshot, visibleEntries } from "./src/data/selectors";
import { clearLegacyNotifications } from "./src/notificationDriver";
import { ThemeProvider } from "./src/theme";
import { FolderScreen } from "./src/ui/FolderScreen";
import { EntryList } from "./src/ui/EntryList";
import { NoteDetail } from "./src/ui/NoteDetail";
import { TaskSheet } from "./src/ui/TaskSheet";
import { Sheet } from "./src/ui/Sheet";
import { EditorBody, NoteEditor, type EditorDraft } from "./src/ui/EntryEditor";
import { draftContext, useDraft } from "./src/ui/useDraft";
import { Popover } from "./src/ui/Popover";
import { Button } from "./src/ui/controls";
import { useStyles } from "./src/ui/styles";
type TaskRoute = {
  id: string;
  readOnly?: boolean;
  highlightTaskId?: string;
  focusChild?: boolean;
};
type NoteRoute = { id: string; readOnly?: boolean; returnTasks?: TaskRoute[] };
function Noeting() {
  const { styles, colors } = useStyles();
  const [repo, setRepo] = useState<Repository | null>(null);
  const [data, setData] = useState<Snapshot>({
    entries: [],
    tasks: [],
    chosenEntryId: null,
  });
  const [tab, setTab] = useState<EntryKind>("note");
  const [queries, setQueries] = useState({ note: "", task: "" });
  const [folder, setFolder] = useState("all");
  const [preferencesReady, setPreferencesReady] = useState(false);
  const preferenceQueue = useRef(Promise.resolve());
  const [notes, setNotes] = useState<NoteRoute[]>([]);
  const [taskRoutes, setTaskRoutes] = useState<TaskRoute[]>([]);
  const drafts = useDraft(!!repo);
  const [editorContext, setEditorContext] = useState<string | null>(null);
  const draft = editorContext ? drafts.get(editorContext) : null;
  const [busy, setBusy] = useState(false);
  const operations = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [cancellingDraft, setCancellingDraft] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [removal, setRemoval] = useState<Removal[] | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [foldersScreen, setFoldersScreen] = useState(false);
  const [folderSelection, setFolderSelection] = useState<Set<string>>(new Set());
  const [selectingFolders, setSelectingFolders] = useState(false);
  const [recent, setRecent] = useState(false);
  const [recentQuery, setRecentQuery] = useState("");
  const [menu, setMenu] = useState<
    "notes" | "new-folder" | "delete-folders" | "rename" | "move" | null
  >(null);
  const [folderTarget, setFolderTarget] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [menuError, setMenuError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setError(null);
    openRepository()
      .then(async (r) => {
        const snapshot = await r.readSnapshot();
        if (active) {
          setData(snapshot);
          setRepo(r);
        }
      })
      .catch(() => {
        if (active) setError("Could not open your saved entries. Try again.");
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    let done = false;
    async function cleanup() {
      if (done) return;
      try {
        await clearLegacyNotifications();
        done = true;
      } catch {
        /* retry on resume */
      }
    }
    void cleanup();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void cleanup();
      else void drafts.flush();
    });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!drafts.ready) return;
    Storage.getItem("noeting.list-context.v1")
      .then((raw) => {
        if (raw) {
          const p = JSON.parse(raw);
          if (p.tab === "note" || p.tab === "task") setTab(p.tab);
          if (typeof p.folder === "string") setFolder(p.folder);
          if (
            typeof p.queries?.note === "string" &&
            typeof p.queries?.task === "string"
          )
            setQueries(p.queries);
        }
        setPreferencesReady(true);
      })
      .catch(() => setError("Could not restore list preferences."));
  }, [drafts.ready]);
  useEffect(() => {
    if (!preferencesReady) return;
    const raw = JSON.stringify({ tab, queries, folder });
    preferenceQueue.current = preferenceQueue.current
      .then(() => Storage.setItem("noeting.list-context.v1", raw))
      .catch(() => setError("Could not keep list preferences."));
  }, [tab, queries, folder, preferencesReady]);
  useEffect(() => {
    if (
      preferencesReady &&
      folder !== "all" &&
      folder !== "unfiled" &&
      !data.folders?.some((f) => f.id === folder)
    )
      setFolder("unfiled");
  }, [data.folders, folder, preferencesReady]);
  useEffect(() => {
    if (!removal) return;
    const timer = setTimeout(() => setRemoval(null), 8000);
    return () => clearTimeout(timer);
  }, [removal]);
  const { entries, tasks, children } = useMemo(
    () => indexSnapshot(data),
    [data],
  );
  const visible = useMemo(
    () =>
      visibleEntries(
        data,
        tab,
        recent ? recentQuery : queries[tab],
        recent ? "all" : folder,
        recent,
      ),
    [data, tab, queries, folder, recent, recentQuery],
  );
  const noteRoute = notes[notes.length - 1];
  const note = entries.get(noteRoute?.id);
  const taskRoute = taskRoutes[taskRoutes.length - 1];
  const taskEntry = entries.get(taskRoute?.id);
  const selectedTask = taskEntry ? tasks.get(taskEntry.id) : undefined;
  const selectedChildren = children.get(selectedTask?.id ?? "") ?? [];
  async function safeNavigate(action: () => void) {
    if (operations.current || cancellingDraft) return;
    if (await drafts.flush()) action();
    else setError("Unsaved draft. Retry before leaving.");
  }
  function backNote() {
    void safeNavigate(() => {
      const current = notes[notes.length - 1];
      if (current?.returnTasks) setTaskRoutes(current.returnTasks);
      setNotes((p) => p.slice(0, -1));
    });
  }
  function hideEditor() {
    if (Keyboard.isVisible()) {
      Keyboard.dismiss();
      return;
    }
    void safeNavigate(() => setEditorContext(null));
  }
  function dismissTask() {
    if (Keyboard.isVisible()) {
      Keyboard.dismiss();
      return;
    }
    void safeNavigate(() => {
      if (editorContext) setEditorContext(null);
      else setTaskRoutes((p) => p.slice(0, -1));
    });
  }
  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (menu) {
        setMenu(null);
        return true;
      }
      if (operations.current) return true;
      if (Keyboard.isVisible()) {
        Keyboard.dismiss();
        return true;
      }
      if (editorContext) {
        hideEditor();
        return true;
      }
      if (taskRoutes.length) {
        dismissTask();
        return true;
      }
      if (notes.length) {
        backNote();
        return true;
      }
      if (foldersScreen) {
        backFolders();
        return true;
      }
      if (selection.size) {
        setSelection(new Set());
        return true;
      }
      if (recent) {
        setRecent(false);
        return true;
      }
      if (tab === "task") {
        setTab("note");
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [menu, editorContext, taskRoutes, notes, selection, recent, tab, foldersScreen, selectingFolders]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !menu &&
        !taskRoutes.length &&
        !editorContext &&
        !notes.length &&
        selection.size
      ) {
        event.preventDefault();
        setSelection(new Set());
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [menu, taskRoutes.length, editorContext, notes.length, selection]);
  async function mutate<T>(
    operation: (r: Repository) => Promise<T>,
  ): Promise<T> {
    if (!repo) throw new Error("Not ready");
    operations.current++;
    setBusy(true);
    setError(null);
    try {
      const value = await operation(repo);
      setData(await repo.readSnapshot());
      return value;
    } catch (e) {
      setError("Could not save this change. Please try again.");
      throw e;
    } finally {
      operations.current--;
      setBusy(operations.current > 0);
    }
  }
  function run(operation: (r: Repository) => Promise<unknown>) {
    void mutate(operation).catch(() => {});
  }
  const saveEdit = (id: string, text: string) =>
    mutate((r) => r.editEntry(id, text));
  function toggle(task: Task) {
    run((r) =>
      task.status === "completed"
        ? r.reopenTask(task.id)
        : r.completeTask(task.id),
    );
  }
  function openEntry(id: string, readOnly = false, highlightTaskId?: string) {
    void safeNavigate(() => {
      const e = entries.get(id);
      if (!e) return;
      if (e.kind === "note") setNotes((p) => [...p, { id, readOnly }]);
      else setTaskRoutes((p) => [...p, { id, readOnly, highlightTaskId }]);
    });
  }
  function openSource(id: string) {
    void safeNavigate(() => {
      const e = entries.get(id);
      if (!e) return;
      if (e.kind === "note") {
        setNotes((p) => [
          ...p,
          { id, readOnly: true, returnTasks: taskRoutes },
        ]);
        setTaskRoutes([]);
      } else setTaskRoutes((p) => [...p, { id, readOnly: true }]);
    });
  }
  function beginDraft(next: EditorDraft) {
    void safeNavigate(() => {
      const context = draftContext(next);
      if (!drafts.get(context)) drafts.put(context, next);
      setEditorError(null);
      setEditorContext(context);
    });
  }
  async function save() {
    if (!draft || !editorContext || busy) return;
    const context = editorContext;
    setEditorError(null);
    try {
      if (!(await drafts.flush())) throw new Error("Draft storage failed.");
      // A retained creation draft can outlive its folder. Keep its words and
      // request identity, and follow folder deletion's Unfiled behavior.
      const capture =
        draft.kind === "note" &&
        draft.folderId &&
        !data.folders?.some((folder) => folder.id === draft.folderId)
          ? { ...draft, folderId: null }
          : draft;
      const result = await mutate((r) =>
        capture.sourceEntryId
          ? r.saveLinkedEntry({
              ...capture,
              sourceEntryId: capture.sourceEntryId,
            })
          : r.saveCapture(capture),
      );
      if (!(await drafts.discard(context)))
        throw new Error("Could not clear saved draft.");
      setEditorContext(null);
      if (draft.kind === "task")
        setTaskRoutes((p) => [...p, { id: result.entryId, focusChild: true }]);
      else setNotes((p) => [...p, { id: result.entryId }]);
    } catch {
      setEditorError("Unsaved. Your words are still here. Try again.");
    }
  }
  function remove(id: string, kind: EntryKind) {
    run(async (r) => {
      const receipts =
        kind === "note" ? await r.removeNotes([id]) : [await r.removeEntry(id)];
      setRemoval(receipts);
      if (kind === "note") setNotes((p) => p.slice(0, -1));
      else if (id === taskEntry?.id) setTaskRoutes((p) => p.slice(0, -1));
    });
  }
  function bulk(action: "pin" | "unpin" | "move" | "remove") {
    if (action === "move") {
      setMenuError(null);
      setMenu("move");
      return;
    }
    run(async (r) => {
      if (action === "remove") setRemoval(await r.removeNotes([...selection]));
      else await r.organizeNotes([...selection], { pinned: action === "pin" });
      setSelection(new Set());
    });
  }
  function restore(e: Entry) {
    run((r) =>
      r.restoreNotes([
        {
          entryId: e.id,
          version: e.removalVersion ?? 0,
          pinned: false,
          selected: false,
        },
      ]),
    );
  }
  const notice = removal ? (
    <View style={styles.notice}>
      <Text style={[styles.cardText, styles.grow]}>
        {removal.length === 1
          ? "Entry removed"
          : `${removal.length} notes removed`}
      </Text>
      <Button
        label="Undo"
        disabled={busy}
        onPress={() =>
          run(async (r) => {
            if (removal.every((x) => entries.get(x.entryId)?.kind === "note"))
              await r.restoreNotes(removal);
            else await r.restoreEntry(removal[0]);
            setRemoval(null);
          })
        }
      />
    </View>
  ) : null;
  const editorProps = draft
    ? {
        draft,
        onChange: (text: string) =>
          drafts.put(editorContext!, { ...draft, text }),
        onCancel: () => {
          if (busy || cancellingDraft) return;
          setCancellingDraft(true);
          const context = editorContext!;
          void drafts
            .discard(context)
            .then((discarded) => {
              if (discarded) {
                setEditorContext(null);
                setEditorError(null);
              } else {
                setEditorError("Could not discard draft. Retry Cancel.");
              }
            })
            .finally(() => setCancellingDraft(false));
        },
        onSave: () => void save(),
        busy: busy || cancellingDraft,
        error: editorError ?? drafts.error,
      }
    : null;
  const noteEditor = !!editorContext && draft?.kind === "note";
  const modalVisible =
    noteEditor ||
    !!taskEntry ||
    (!!editorContext && draft?.kind === "task") ||
    !!menu;
  function backFolders() {
    if (busy) return;
    if (selectingFolders) {
      setSelectingFolders(false);
      setFolderSelection(new Set());
    } else setFoldersScreen(false);
  }
  function folderAction(action: "pin" | "unpin" | "edit" | "delete") {
    if (!folderSelection.size || busy) return;
    if (action === "edit") {
      if (folderSelection.size !== 1) return;
      const id = [...folderSelection][0];
      setFolderTarget(id);
      setFolderName(data.folders?.find((f) => f.id === id)?.name ?? "");
      setMenuError(null);
      setMenu("rename");
    } else if (action === "delete") setMenu("delete-folders");
    else run(async (r) => {
      await r.pinFolders([...folderSelection], action === "pin");
      setFolderSelection(new Set());
      setSelectingFolders(false);
    });
  }
  async function folderSave() {
    if (busy) return;
    try {
      await mutate((r) =>
        menu === "rename"
          ? r.renameFolder(folderTarget!, folderName)
          : r.createFolder(folderTarget!, folderName),
      );
      if (menu === "new-folder") setFolder(folderTarget!);
      setMenu(null);
    } catch {
      setMenuError(
        "Folder name must be nonempty and unique. Try another name.",
      );
    }
  }
  return (
    <SafeAreaView style={styles.app}>
      <View style={styles.frame}>
        <View
          style={styles.grow}
          aria-hidden={!!modalVisible}
          accessibilityElementsHidden={!!modalVisible}
          importantForAccessibility={
            modalVisible ? "no-hide-descendants" : "auto"
          }
        >
          {!repo || !drafts.ready || !preferencesReady ? (
            <View style={styles.empty}>
              {error || drafts.error ? (
                <>
                  <Text accessibilityRole="alert" style={styles.error}>
                    {error ?? drafts.error}
                  </Text>
                  <Button
                    label="Retry"
                    onPress={() => {
                      drafts.retry();
                      setAttempt((v) => v + 1);
                    }}
                  />
                </>
              ) : (
                <ActivityIndicator
                  accessibilityLabel="Loading entries"
                  color={colors.accent}
                />
              )}
            </View>
          ) : (
            <>
              {(error || drafts.error) && (
                <Text accessibilityRole="alert" style={styles.error}>
                  {error ?? drafts.error}
                </Text>
              )}
              {drafts.error && (
                <Button
                  quiet
                  label="Retry draft storage"
                  onPress={() => void drafts.flush()}
                />
              )}
              {note ? (
                <NoteDetail
                  key={`${note.id}-${noteRoute.readOnly}`}
                  entry={note}
                  source={entries.get(note.sourceEntryId ?? "")}
                  children={data.entries.filter(
                    (e) => !e.removed && e.sourceEntryId === note.id,
                  )}
                  tasks={tasks}
                  readOnly={noteRoute.readOnly}
                  busy={busy}
                  onBack={backNote}
                  drafts={drafts}
                  onSave={saveEdit}
                  onOpen={(id) =>
                    openEntry(
                      id,
                      noteRoute.readOnly || id === note.sourceEntryId,
                    )
                  }
                  onToggle={toggle}
                  onRemove={() => remove(note.id, "note")}
                  onLink={(kind) =>
                    beginDraft({
                      kind,
                      text: "",
                      requestId: randomUUID(),
                      sourceEntryId: note.id,
                      sourcePreview: note.text,
                      folderId: kind === "note" ? note.folderId : undefined,
                    })
                  }
                />
              ) : foldersScreen ? (
                <FolderScreen
                  folders={data.folders ?? []} entries={data.entries} folder={folder}
                  selection={folderSelection} selecting={selectingFolders} busy={busy}
                  onBack={backFolders}
                  onSelect={(id) => {
                    setSelectingFolders(true);
                    setFolderSelection((old) => {
                      const next = new Set(old);
                      if (next.has(id)) next.delete(id); else next.add(id);
                      return next;
                    });
                  }}
                  onChoose={(id) => { setFolder(id); setFoldersScreen(false); }}
                  onManage={() => setSelectingFolders(true)}
                  onAction={folderAction}
                  onNew={() => {
                    setFolderTarget(randomUUID()); setFolderName("");
                    setMenuError(null); setMenu("new-folder");
                  }}
                />
              ) : (
                <>
                  <EntryList
                    kind={tab}
                    entries={visible}
                    tasks={tasks}
                    children={children}
                    entryMap={entries}
                    query={recent ? recentQuery : queries[tab]}
                    onQuery={(q) => {
                      setSelection(new Set());
                      if (recent) setRecentQuery(q);
                      else setQueries((p) => ({ ...p, [tab]: q }));
                    }}
                    busy={busy}
                    onOpen={(id, highlight) => openEntry(id, false, highlight)}
                    onAdd={() =>
                      beginDraft({
                        kind: tab,
                        text: "",
                        requestId: randomUUID(),
                        folderId:
                          tab === "note" &&
                          folder !== "all" &&
                          folder !== "unfiled"
                            ? folder
                            : null,
                      })
                    }
                    onToggle={toggle}
                    folders={data.folders ?? []}
                    folder={folder}
                    onFolder={(id) => {
                      setSelection(new Set());
                      setFolder(id);
                    }}
                    onFolders={() => void safeNavigate(() => {
                      setSelection(new Set()); setFoldersScreen(true);
                      setFolderSelection(new Set()); setSelectingFolders(false);
                    })}
                    selection={selection}
                    onSelect={(id) =>
                      setSelection((old) => {
                        const next = new Set(old);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                    onClear={() => setSelection(new Set())}
                    onBulk={bulk}
                    onMore={() => setMenu("notes")}
                    recent={recent}
                    onRestore={restore}
                    onBack={() => setRecent(false)}
                  />
                  <View accessibilityRole="tablist" style={styles.nav}>
                    {(["note", "task"] as const).map((kind) => (
                      <Pressable
                        key={kind}
                        accessibilityRole="tab"
                        accessibilityLabel={kind === "note" ? "Notes" : "Tasks"}
                        aria-selected={kind === tab}
                        accessibilityState={{ selected: kind === tab }}
                        onPress={() => {
                          setSelection(new Set());
                          setRecent(false);
                          setTab(kind);
                        }}
                        style={[styles.tab, kind === tab && styles.tabSelected]}
                      >
                        <Text
                          style={[
                            styles.tabText,
                            kind === tab && styles.tabActive,
                          ]}
                        >
                          {kind === "note" ? "Notes" : "Tasks"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
              {notice}
            </>
          )}
        </View>
        {!noteEditor &&
          (taskEntry || (editorContext && draft?.kind === "task")) && (
            <Sheet
              label="Task"
              contentHeight={
                editorContext
                  ? 220
                  : 210 +
                    selectedChildren.length * 54 +
                    Number(!!taskEntry?.sourceEntryId) * 90 +
                    Number(!!notice) * 70 +
                    Number(!!error) * 50
              }
              onDismiss={dismissTask}
              onBack={
                !editorContext && taskRoutes.length > 1
                  ? () =>
                      void safeNavigate(() =>
                        setTaskRoutes((p) => p.slice(0, -1)),
                      )
                  : undefined
              }
            >
              {editorContext && editorProps ? (
                <EditorBody {...editorProps} />
              ) : taskEntry ? (
                <TaskSheet
                  key={`${taskEntry.id}-${taskRoute.readOnly}`}
                  entry={taskEntry}
                  task={selectedTask}
                  source={entries.get(taskEntry.sourceEntryId ?? "")}
                  children={selectedChildren}
                  entries={entries}
                  readOnly={taskRoute.readOnly}
                  highlightTaskId={taskRoute.highlightTaskId}
                  focusChild={taskRoute.focusChild}
                  error={error}
                  notice={notice}
                  busy={busy}
                  drafts={drafts}
                  onSave={saveEdit}
                  onClose={dismissTask}
                  onBack={
                    taskRoutes.length > 1
                      ? () =>
                          void safeNavigate(() =>
                            setTaskRoutes((p) => p.slice(0, -1)),
                          )
                      : undefined
                  }
                  onOpen={(id) => openEntry(id, taskRoute.readOnly)}
                  onSource={openSource}
                  onToggle={toggle}
                  onRemove={(id) => remove(id, "task")}
                  onAdd={async (parentId, text, requestId) => {
                    await mutate((r) =>
                      r.saveSubtask({
                        parentTaskId: parentId,
                        text,
                        requestId,
                      }),
                    );
                  }}
                />
              ) : null}
            </Sheet>
          )}
        {noteEditor && editorProps && (
          <NoteEditor {...editorProps} onDismiss={hideEditor} />
        )}
        {menu && (
          <Popover onClose={() => setMenu(null)}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {menu === "notes" ? (
                <Button
                  quiet
                  label="Recently deleted"
                  onPress={() => {
                    setMenu(null);
                    setSelection(new Set());
                    setRecentQuery("");
                    setRecent(true);
                  }}
                />
              ) : menu === "delete-folders" ? (
                <>
                  <Text accessibilityRole="header" style={styles.cardText}>Delete {folderSelection.size} {folderSelection.size === 1 ? "folder" : "folders"}?</Text>
                  <Text style={styles.hint}>Your notes will move to Uncategorized. No notes will be deleted.</Text>
                  <Button label="Cancel" disabled={busy} onPress={() => setMenu(null)} />
                  <Button label="Delete folders" danger disabled={busy} onPress={() => run(async (r) => {
                    await r.removeFolders([...folderSelection]);
                    if (folderSelection.has(folder)) setFolder("unfiled");
                    setFolderSelection(new Set()); setSelectingFolders(false); setMenu(null);
                  })} />
                </>
              ) : menu === "move" ? (
                <>
                  {[{ id: null, name: "Uncategorized" }, ...(data.folders ?? [])].map(
                    (f) => (
                      <Button
                        key={f.id ?? "unfiled"}
                        quiet
                        label={`Move to ${f.name}`}
                        disabled={busy}
                        onPress={() =>
                          run(async (r) => {
                            await r.organizeNotes([...selection], {
                              folderId: f.id,
                            });
                            setSelection(new Set());
                            setMenu(null);
                          })
                        }
                      />
                    ),
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.section}>
                    {menu === "rename" ? "Rename folder" : "New folder"}
                  </Text>
                  <TextInput
                    autoFocus
                    accessibilityLabel="Folder name"
                    value={folderName}
                    onChangeText={setFolderName}
                    style={[styles.search, { marginHorizontal: 0 }]}
                    returnKeyType="done"
                    onSubmitEditing={() => void folderSave()}
                  />
                  <Button
                    label="Save folder"
                    disabled={busy || !folderName.trim()}
                    onPress={() => void folderSave()}
                  />
                </>
              )}
              {(menuError || error) && (
                <Text accessibilityRole="alert" style={styles.error}>
                  {menuError ?? error}
                </Text>
              )}
            </ScrollView>
          </Popover>
        )}
      </View>
    </SafeAreaView>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Noeting />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
