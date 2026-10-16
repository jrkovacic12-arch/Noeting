import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Clipboard from "expo-clipboard";
import {
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Entry, Task } from "../data/repository";
import type { DraftStore } from "./useDraft";
import { InlineEditor } from "./InlineEditor";
import { Popover, type Anchor } from "./Popover";
import { Button, Check, IconButton } from "./controls";
import { useStyles } from "./styles";
export function TaskSheet({
  entry,
  task,
  source,
  children,
  entries,
  onClose,
  onBack,
  onOpen,
  onSource,
  onSave,
  onRemove,
  onAdd,
  onToggle,
  busy,
  readOnly = false,
  highlightTaskId,
  notice,
  error,
  drafts,
  focusChild = false,
}: {
  entry: Entry;
  task?: Task;
  source?: Entry;
  children: Task[];
  entries: Map<string, Entry>;
  onClose: () => void;
  onBack?: () => void;
  onOpen: (id: string) => void;
  onSource: (id: string) => void;
  onSave: (id: string, text: string) => Promise<void>;
  onRemove: (id: string) => void;
  onAdd: (parentId: string, text: string, requestId: string) => Promise<void>;
  onToggle: (task: Task) => void;
  busy: boolean;
  readOnly?: boolean;
  highlightTaskId?: string;
  notice?: ReactNode;
  error?: string | null;
  drafts: DraftStore;
  focusChild?: boolean;
}) {
  const { styles, colors } = useStyles();
  const [menu, setMenu] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<Anchor>();
  const more = useRef<View>(null);
  const [original, setOriginal] = useState<Entry | null>(null);
  const [localError, setLocalError] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);
  const composing = useRef(false);
  const context = `child:${task?.id}`;
  const restored = drafts.get(context);
  const [text, setText] = useState(restored?.text ?? "");
  const current = useRef(text);
  const request = useRef(restored?.requestId ?? randomUUID());
  const pendingCommit = useRef<Promise<boolean> | null>(null);
  const focusAfterSave = useRef(false);
  const [adding, setAdding] = useState(false);
  const [focusPending, setFocusPending] = useState(false);
  useEffect(() => {
    if (!adding && focusPending) {
      setFocusPending(false);
      input.current?.focus();
    }
  }, [adding, focusPending]);
  const editable = !entry.removed && !readOnly && !!task;
  useEffect(() => {
    if (focusChild) input.current?.focus();
  }, [focusChild]);
  function change(value: string) {
    current.current = value;
    setText(value);
    drafts.put(context, {
      kind: "task",
      text: value,
      requestId: request.current,
      parentTaskId: task?.id,
    });
  }
  function commit(focus = false): Promise<boolean> {
    if (composing.current) return Promise.resolve(false);
    // Web/native input adapters may deliver blur before submit. Keep Enter's
    // focus intent even when blur has already started the same commit.
    if (focus && current.current.trim()) focusAfterSave.current = true;
    if (pendingCommit.current) return pendingCommit.current;
    if (!task || !current.current.trim()) return Promise.resolve(true);
    setAdding(true);
    const value = current.current;
    const id = request.current;
    const operation = (async () => {
      try {
        if (!(await drafts.flush())) throw new Error("Draft storage failed.");
        await onAdd(task.id, value, id);
        request.current = randomUUID();
        if (current.current === value) {
          current.current = "";
          setText("");
          drafts.put(context, null);
        } else {
          drafts.put(context, {
            kind: "task",
            text: current.current,
            requestId: request.current,
            parentTaskId: task.id,
          });
        }
        setLocalError(false);
        if (focusAfterSave.current) setFocusPending(true);
        return true;
      } catch {
        setLocalError(true);
        return false;
      } finally {
        focusAfterSave.current = false;
        setAdding(false);
      }
    })();
    pendingCommit.current = operation;
    void operation.finally(() => {
      if (pendingCommit.current === operation) pendingCommit.current = null;
    });
    return operation;
  }
  const selected = menu === "root" ? entry : entries.get(menu ?? "");
  function options(id: string, view?: View | null) {
    if (view)
      view.measureInWindow((x, y, width, height) => {
        setAnchor({ x, y, width, height });
        setMenu(id);
      });
    else {
      setAnchor(undefined);
      setMenu(id);
    }
  }
  return (
    <>
      <View
        style={styles.grow}
        aria-hidden={!!menu}
        accessibilityElementsHidden={!!menu}
        importantForAccessibility={menu ? "no-hide-descendants" : "auto"}
      >
        <View style={styles.noteToolbar}>
          {onBack && (
            <IconButton name="back" label="Back to task" onPress={onBack} />
          )}
          <View style={styles.grow} />
          <View ref={more} collapsable={false}>
            <IconButton
              name="more"
              label="More task actions"
              onPress={() => options("root", more.current)}
              disabled={busy}
            />
          </View>
          <IconButton
            name="close"
            label="Close task"
            onPress={() => {
              void commit().then((saved) => {
                if (saved) onClose();
              });
            }}
            disabled={busy}
          />
        </View>
        <ScrollView
          ref={scroll}
          contentContainerStyle={[styles.taskContent, { gap: 4 }]}
          keyboardShouldPersistTaps="handled"
        >
          {task?.parentTaskId && (
            <Button
              quiet
              label={
                task.parentRemoved
                  ? "Parent removed"
                  : `Under: ${task.parentText}`
              }
              onPress={() => {
                if (task.parentEntryId) onOpen(task.parentEntryId);
              }}
            />
          )}
          <View style={styles.row}>
            {task && (
              <Check
                checked={task.status === "completed"}
                label={
                  task.status === "completed" ? "Reopen task" : "Complete task"
                }
                disabled={busy || !editable}
                onPress={() => onToggle(task)}
              />
            )}
            {editable ? (
              <InlineEditor
                entry={entry}
                drafts={drafts}
                onSave={onSave}
                onSubmit={() => input.current?.focus()}
              />
            ) : (
              <Text selectable style={[styles.taskBody, styles.grow]}>
                {entry.text}
              </Text>
            )}
          </View>
          {entry.removed && (
            <Text style={styles.meta}>Removed · Read only</Text>
          )}
          {readOnly && <Text style={styles.meta}>Read only</Text>}
          {(error || localError || drafts.error) && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error ?? drafts.error ?? "Unsaved. Your words are still here."}
            </Text>
          )}
          {drafts.error && (
            <Button
              quiet
              label="Retry draft storage"
              onPress={() => void drafts.flush()}
            />
          )}
          {children.map((child) => {
            const childEntry = entries.get(child.entryId);
            if (!childEntry) return null;
            return (
              <View
                key={child.id}
                testID={`subtask-${child.id}`}
                onLayout={(event) => {
                  if (child.id === highlightTaskId) {
                    const y = event.nativeEvent.layout.y;
                    requestAnimationFrame(() =>
                      scroll.current?.scrollTo({
                        y: Math.max(0, y - 60),
                        animated: false,
                      }),
                    );
                  }
                }}
                style={[
                  styles.row,
                  { marginLeft: 28 },
                  child.id === highlightTaskId && styles.highlight,
                ]}
              >
                <Check
                  checked={child.status === "completed"}
                  label={`${child.status === "completed" ? "Reopen" : "Complete"} subtask: ${childEntry.text}`}
                  onPress={() => onToggle(child)}
                  disabled={busy || readOnly}
                />
                {editable ? (
                  <InlineEditor
                    entry={childEntry}
                    drafts={drafts}
                    onSave={onSave}
                    onSubmit={() => input.current?.focus()}
                  />
                ) : (
                  <Text style={styles.linkText}>{childEntry.text}</Text>
                )}
                {editable && (
                  <ChildOptions
                    label={childEntry.text}
                    onPress={(view) => options(childEntry.id, view)}
                  />
                )}
              </View>
            );
          })}
          {editable && !task?.parentTaskId && (
            <View style={[styles.row, { marginLeft: 72 }]}>
              <TextInput
                ref={input}
                accessibilityLabel="Next step"
                placeholder="Next step…"
                placeholderTextColor={colors.muted}
                value={text}
                onChangeText={change}
                editable={!adding}
                style={[styles.linkText, styles.grow, { minHeight: 44 }]}
                returnKeyType="next"
                submitBehavior="submit"
                // RN web 0.21 still uses this prop and otherwise schedules a
                // deferred blur after our successful commit restores focus.
                blurOnSubmit={false}
                onSubmitEditing={(event) => {
                  if (!(event.nativeEvent as any).isComposing)
                    void commit(true);
                }}
                onBlur={() => void commit()}
                {...({
                  onCompositionStart: () => {
                    composing.current = true;
                  },
                  onCompositionEnd: () => {
                    composing.current = false;
                  },
                } as any)}
              />
              {localError && (
                <Button
                  quiet
                  label="Retry next step"
                  onPress={() => void commit(true)}
                />
              )}
            </View>
          )}
          {source && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                source.kind === "note"
                  ? "View source Note"
                  : "View legacy source"
              }
              onPress={() => onSource(source.id)}
              style={styles.sourceRow}
            >
              <Text style={styles.meta}>
                {source.kind === "note"
                  ? "Linked from"
                  : "Legacy source · Task"}
                {source.removed ? " · Removed" : ""}
              </Text>
              <Text numberOfLines={2} style={styles.quoteText}>
                {entry.sourceText ?? source.originalText}
              </Text>
            </Pressable>
          )}
          {original && (
            <View style={styles.linkSection}>
              <Text style={styles.section}>Original capture</Text>
              <Text selectable style={styles.quoteText}>
                {original.originalText}
              </Text>
            </View>
          )}
        </ScrollView>
        {notice}
      </View>
      {menu && (
        <Popover anchor={anchor} onClose={() => setMenu(null)}>
          <Button
            quiet
            label="Copy"
            onPress={() => {
              void Clipboard.setStringAsync(selected?.text ?? "")
                .then(() => setMenu(null))
                .catch(() => setLocalError(true));
            }}
          />
          {selected?.text !== selected?.originalText && (
            <Button
              quiet
              label="View original capture"
              onPress={() => {
                setOriginal(selected ?? null);
                setMenu(null);
              }}
            />
          )}
          {editable && (
            <Button
              quiet
              danger
              label={menu === "root" ? "Remove task" : "Remove subtask"}
              onPress={() => {
                onRemove(selected!.id);
                setMenu(null);
              }}
            />
          )}
        </Popover>
      )}
    </>
  );
}

function ChildOptions({
  label,
  onPress,
}: {
  label: string;
  onPress: (view: View | null) => void;
}) {
  const ref = useRef<View>(null);
  return (
    <View ref={ref} collapsable={false}>
      <IconButton
        name="more"
        label={`Options for ${label}`}
        onPress={() => onPress(ref.current)}
      />
    </View>
  );
}
