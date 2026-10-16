import { useRef, useState, type ReactNode } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import type { Entry, EntryKind, NoteFolder, Task } from "../data/repository";
import { matchingChildren } from "../data/selectors";
import { Button, Check, IconButton } from "./controls";
import { useStyles } from "./styles";
export function EntryList({
  kind,
  entries,
  tasks,
  children,
  entryMap,
  query,
  onQuery,
  onOpen,
  onAdd,
  onToggle,
  busy,
  folders,
  folder,
  onFolder,
  onNewFolder,
  onFolderOptions,
  selection,
  onSelect,
  onClear,
  onBulk,
  onMore,
  recent = false,
  onRestore,
  onBack,
}: {
  kind: EntryKind;
  entries: Entry[];
  tasks: Map<string, Task>;
  children: Map<string, Task[]>;
  entryMap: Map<string, Entry>;
  query: string;
  onQuery: (q: string) => void;
  onOpen: (id: string, highlight?: string) => void;
  onAdd: () => void;
  onToggle: (task: Task) => void;
  busy: boolean;
  folders: NoteFolder[];
  folder: string;
  onFolder: (id: string) => void;
  onNewFolder: () => void;
  onFolderOptions: (id: string) => void;
  selection: Set<string>;
  onSelect: (id: string) => void;
  onClear: () => void;
  onBulk: (action: "pin" | "unpin" | "move" | "remove") => void;
  onMore: () => void;
  recent?: boolean;
  onRestore: (entry: Entry) => void;
  onBack: () => void;
}) {
  const { styles, colors } = useStyles();
  const { width, fontScale } = useWindowDimensions();
  const title = recent
    ? "Recently deleted"
    : kind === "note"
      ? "Notes"
      : "Tasks";
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState(false);
  const longPressed = useRef<string | null>(null);
  const cancelled = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const columns = kind === "note" && width >= 400 && fontScale <= 1.15 ? 2 : 1;
  function toggleGroup(id: string) {
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function taskRow(
    entry: Entry,
    child = false,
    highlight = false,
    accessory?: ReactNode,
  ) {
    const task = tasks.get(entry.id);
    if (!task) return null;
    return (
      <View
        key={entry.id}
        style={[
          styles.row,
          child && { marginLeft: 28 },
          highlight && styles.highlight,
        ]}
      >
        <Check
          checked={task.status === "completed"}
          label={`${task.status === "completed" ? "Reopen" : "Complete"} ${child ? "subtask" : "task"}: ${entry.text}`}
          disabled={busy}
          onPress={() => onToggle(task)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${child ? "subtask" : "task"}: ${entry.text}`}
          onPress={() =>
            onOpen(
              child && !task.parentRemoved ? task.parentEntryId! : entry.id,
              child ? task.id : undefined,
            )
          }
          style={[styles.grow, { minHeight: 44, justifyContent: "center" }]}
        >
          <Text
            numberOfLines={2}
            style={[
              styles.cardText,
              task.status === "completed" && styles.completed,
            ]}
          >
            {entry.text}
          </Text>
          {task.parentRemoved && (
            <Text style={styles.meta}>Parent removed</Text>
          )}
        </Pressable>
        {accessory}
      </View>
    );
  }
  function group(entry: Entry) {
    const task = tasks.get(entry.id)!;
    const all = children.get(task.id) ?? [];
    const matches = matchingChildren(entry, all, query);
    const expanded = !!query.trim() || !collapsed.has(task.id);
    return (
      <View
        key={entry.id}
        style={[styles.card, styles.taskCard, { marginBottom: 8 }]}
      >
        {taskRow(
          entry,
          false,
          false,
          all.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              aria-expanded={expanded}
              accessibilityState={{ expanded }}
              accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${entry.text}: ${all.filter((c) => c.status === "completed").length}/${all.length}`}
              onPress={() => toggleGroup(task.id)}
              style={{
                minWidth: 44,
                minHeight: 44,
                paddingHorizontal: 4,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={styles.meta}>
                {all.filter((c) => c.status === "completed").length}/
                {all.length} {expanded ? "−" : "+"}
              </Text>
            </Pressable>
          ) : null,
        )}
        {expanded &&
          matches.map((child) => {
            const childEntry = entryMap.get(child.entryId);
            return (
              childEntry &&
              taskRow(
                childEntry,
                true,
                !!query.trim() &&
                  child.title
                    .toLocaleLowerCase()
                    .includes(query.trim().toLocaleLowerCase()),
              )
            );
          })}
      </View>
    );
  }
  const pending =
    kind === "task"
      ? entries.filter((e) => tasks.get(e.id)?.status !== "completed")
      : entries;
  const done =
    kind === "task"
      ? entries.filter((e) => tasks.get(e.id)?.status === "completed")
      : [];
  return (
    <View style={styles.grow}>
      <View style={styles.header}>
        {recent && (
          <IconButton name="back" label="Back to notes" onPress={onBack} />
        )}
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <View style={styles.grow} />
        {kind === "note" && !recent && (
          <IconButton name="more" label="More notes options" onPress={onMore} />
        )}
      </View>
      <TextInput
        accessibilityLabel={`Search ${title.toLowerCase()}`}
        placeholder="Search"
        placeholderTextColor={colors.muted}
        value={query}
        onChangeText={onQuery}
        style={styles.search}
        clearButtonMode="while-editing"
        returnKeyType="search"
      />
      {!!query && (
        <Button quiet label="Clear search" onPress={() => onQuery("")} />
      )}
      {kind === "note" && !recent && (
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              gap: 4,
              paddingBottom: 8,
            }}
            testID="folder-strip"
          >
            {[
              { id: "all", name: "All" },
              { id: "unfiled", name: "Unfiled" },
              ...folders,
            ].map((f) => (
              <Pressable
                key={f.id}
                accessibilityRole="button"
                accessibilityLabel={`Folder: ${f.name}`}
                aria-pressed={folder === f.id}
                accessibilityState={{ selected: folder === f.id }}
                onPress={() => onFolder(f.id)}
                onLongPress={() => {
                  if (f.id !== "all" && f.id !== "unfiled")
                    onFolderOptions(f.id);
                }}
                delayLongPress={300}
                style={[
                  styles.button,
                  folder === f.id && styles.accent,
                  { paddingHorizontal: 12 },
                ]}
              >
                <Text
                  style={[
                    styles.buttonText,
                    folder === f.id && styles.accentText,
                  ]}
                >
                  {f.name}
                </Text>
              </Pressable>
            ))}
            <Button quiet label="New folder" onPress={onNewFolder} />
            {folder !== "all" && folder !== "unfiled" && (
              <IconButton
                name="more"
                label="Folder options"
                onPress={() => onFolderOptions(folder)}
              />
            )}
          </ScrollView>
        </View>
      )}
      {selection.size > 0 && (
        <View
          style={[
            styles.toolbar,
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 5,
              backgroundColor: colors.paper,
              paddingHorizontal: 8,
              borderBottomWidth: 1,
              borderColor: colors.line,
            },
          ]}
        >
          <Text accessibilityLiveRegion="polite" style={styles.meta}>
            {selection.size} selected
          </Text>
          {(["pin", "unpin", "move", "remove"] as const).map((a) => (
            <Button
              key={a}
              quiet
              label={a[0].toUpperCase() + a.slice(1)}
              onPress={() => onBulk(a)}
              disabled={busy}
            />
          ))}
          <IconButton
            name="close"
            label="Close selection"
            onPress={onClear}
            disabled={busy}
          />
        </View>
      )}
      {kind === "note" ? (
        <FlatList
          key={columns}
          numColumns={columns}
          data={entries}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          columnWrapperStyle={columns === 2 ? { gap: 10 } : undefined}
          testID="entry-list"
          onScrollBeginDrag={() => {
            cancelled.current = true;
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {query
                  ? "No matches"
                  : recent
                    ? "Nothing removed"
                    : "A little space to think"}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.card,
                {
                  flex: 1,
                  maxWidth: columns === 2 ? "49%" : "100%",
                  minHeight: 128,
                  borderWidth: 1,
                  borderColor: selection.has(item.id)
                    ? colors.accentFill
                    : "transparent",
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open note: ${item.text}`}
                aria-pressed={selection.has(item.id)}
                accessibilityState={{ selected: selection.has(item.id) }}
                disabled={busy}
                onPressIn={(event) => {
                  cancelled.current = false;
                  longPressed.current = null;
                  origin.current = {
                    x: event.nativeEvent.pageX,
                    y: event.nativeEvent.pageY,
                  };
                }}
                onTouchMove={(event) => {
                  if (
                    Math.abs(event.nativeEvent.pageX - origin.current.x) > 8 ||
                    Math.abs(event.nativeEvent.pageY - origin.current.y) > 8
                  )
                    cancelled.current = true;
                }}
                delayLongPress={300}
                onLongPress={() => {
                  if (!recent && !cancelled.current) {
                    longPressed.current = item.id;
                    onSelect(item.id);
                  }
                }}
                onPress={() => {
                  if (cancelled.current) return;
                  if (longPressed.current === item.id) {
                    longPressed.current = null;
                    return;
                  }
                  if (selection.size) onSelect(item.id);
                  else onOpen(item.id);
                }}
                style={{ minHeight: 94, gap: 6 }}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.cardText, { fontWeight: "600" }]}
                >
                  {item.text.split("\n")[0] || "Note"}
                </Text>
                <Text
                  numberOfLines={2}
                  style={[styles.quoteText, { fontSize: 14, lineHeight: 20 }]}
                >
                  {item.text.split("\n").slice(1).join("\n")}
                </Text>
                <Text style={[styles.meta, { marginTop: "auto" }]}>
                  {item.notePinnedAt ? "Pinned · " : ""}
                  {new Date(
                    item.lastEditedAt ?? item.createdAt,
                  ).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
              </Pressable>
              {recent && (
                <Button
                  quiet
                  label={`Restore: ${item.text}`}
                  onPress={() => onRestore(item)}
                  disabled={busy}
                />
              )}
            </View>
          )}
        />
      ) : (
        <FlatList
          data={pending}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          testID="entry-list"
          renderItem={({ item }) => group(item)}
          ListEmptyComponent={
            !done.length ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>
                  {query ? "No matches" : "One thing at a time"}
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            done.length ? (
              <>
                <Button
                  quiet
                  label={`Completed (${done.length})`}
                  onPress={() => setCompleted((v) => !v)}
                />
                {(completed || !!query.trim()) && done.map(group)}
              </>
            ) : null
          }
        />
      )}
      {!recent && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add ${kind}`}
          onPress={onAdd}
          disabled={busy}
          style={({ pressed }) => [
            styles.fab,
            pressed && styles.pressed,
            busy && styles.disabled,
          ]}
        >
          <Text accessible={false} style={styles.plus}>
            +
          </Text>
        </Pressable>
      )}
    </View>
  );
}
