import { useEffect, useMemo, useRef } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import type { Entry, NoteFolder } from "../data/repository";
import { Button, IconButton } from "./controls";
import { useStyles } from "./styles";

export function FolderScreen({ folders, entries, folder, selection, selecting, busy, onBack, onSelect, onChoose, onManage, onAction, onNew }: {
  folders: NoteFolder[]; entries: Entry[]; folder: string; selection: Set<string>;
  selecting: boolean; busy: boolean; onBack: () => void; onSelect: (id: string) => void;
  onChoose: (id: string) => void; onManage: () => void; onNew: () => void;
  onAction: (action: "pin" | "unpin" | "edit" | "delete") => void;
}) {
  const { styles, colors } = useStyles();
  const held = useRef<string | null>(null);
  const cancelled = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const entry of entries) if (entry.kind === "note" && !entry.removed) {
      result.set("all", (result.get("all") ?? 0) + 1);
      const key = entry.folderId ?? "unfiled";
      result.set(key, (result.get(key) ?? 0) + 1);
    }
    return result;
  }, [entries]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = (event: KeyboardEvent) => {
      // Popover owns Escape while a name/confirmation dialog is open.
      if (event.key === "Escape" && !document.querySelector('[role="dialog"]')) {
        event.preventDefault(); onBack();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onBack]);
  const rows = [{ id: "all", name: "All", pinnedAt: null }, ...folders,
    { id: "unfiled", name: "Uncategorized", pinnedAt: null }];
  const allPinned = selection.size > 0 && folders.filter((f) => selection.has(f.id)).every((f) => !!f.pinnedAt);
  return <View style={styles.grow}>
    <View style={[styles.header, { minHeight: 68 }]}>
      <IconButton name={selecting ? "close" : "back"} label={selecting ? "Close folder selection" : "Back to notes"} onPress={onBack} disabled={busy} />
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[styles.title, { flex: 1, textAlign: "center", fontSize: 25, fontWeight: "500" }]}>
        {selecting ? `${selection.size} selected` : "Folders"}
      </Text>
      {selecting ? <View style={{ width: 44 }} /> : <IconButton name="trash" label="Select folders to delete" onPress={onManage} disabled={busy || !folders.length} />}
    </View>
    <FlatList
      data={rows} keyExtractor={(item) => item.id} testID="folder-list"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 12 }}
      onScrollBeginDrag={() => { cancelled.current = true; }}
      renderItem={({ item }) => {
        const custom = item.id !== "all" && item.id !== "unfiled";
        const checked = selecting ? selection.has(item.id) : folder === item.id;
        return <Pressable accessibilityRole="button" accessibilityLabel={`Folder: ${item.name}`}
          accessibilityValue={{ text: `${counts.get(item.id) ?? 0} notes${item.pinnedAt ? ", pinned" : ""}` }}
          accessibilityHint={custom ? "Long press to select folders for Pin, Delete or Edit" : undefined}
          accessibilityState={{ selected: checked, disabled: busy || (selecting && !custom) }} aria-pressed={checked}
          disabled={busy || (selecting && !custom)}
          onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === "longpress" && custom) onSelect(item.id); }}
          accessibilityActions={custom ? [{ name: "longpress", label: "Select folder" }] : []}
          onPressIn={(event) => { held.current = null; cancelled.current = false; origin.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }; }}
          onTouchMove={(event) => { if (Math.abs(event.nativeEvent.pageX - origin.current.x) > 8 || Math.abs(event.nativeEvent.pageY - origin.current.y) > 8) cancelled.current = true; }}
          delayLongPress={300}
          onLongPress={() => { if (custom && !cancelled.current) { held.current = item.id; onSelect(item.id); } }}
          onPress={() => {
            if (cancelled.current) return;
            if (held.current === item.id) { held.current = null; return; }
            if (selecting) { if (custom) onSelect(item.id); } else onChoose(item.id);
          }}
          style={({ pressed }) => [{ backgroundColor: colors.white, borderRadius: 22, minHeight: 78, padding: 18, flexDirection: "row", alignItems: "center", gap: 12 }, selecting && !custom && styles.disabled, pressed && styles.pressed]}>
          <Text accessible={false} style={{ width: 24, fontSize: 23, color: colors.accent }}>{checked ? "✓" : ""}</Text>
          <View style={styles.grow}>
            <Text style={[styles.cardText, { fontSize: 20 }]}>{item.name}</Text>
            {!!item.pinnedAt && <Text style={styles.meta}>Pinned</Text>}
          </View>
          <Text accessibilityLabel={`${counts.get(item.id) ?? 0} notes`} style={[styles.meta, { fontSize: 15 }]}>{counts.get(item.id) ?? 0}</Text>
        </Pressable>;
      }}
      ListFooterComponent={!selecting ? <Pressable accessibilityRole="button" accessibilityLabel="New folder" disabled={busy} onPress={onNew}
        style={({ pressed }) => [{ marginTop: 12, minHeight: 100, borderRadius: 22, backgroundColor: colors.white, alignItems: "center", justifyContent: "center", gap: 6 }, pressed && styles.pressed]}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accentFill, alignItems: "center", justifyContent: "center" }}><Text accessible={false} style={{ color: colors.onAccent, fontSize: 26, lineHeight: 30 }}>+</Text></View>
        <Text style={styles.cardText}>New folder</Text>
      </Pressable> : null}
    />
    {selecting && <ScrollView horizontal accessibilityLabel="Folder selection actions" showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, borderTopWidth: 1, borderColor: colors.line }} contentContainerStyle={{ padding: 12, gap: 12, flexGrow: 1, justifyContent: "space-around" }}>
      <Button quiet label={allPinned ? "Unpin" : "Pin"} disabled={busy || !selection.size} onPress={() => onAction(allPinned ? "unpin" : "pin")} />
      <Button quiet danger label="Delete" disabled={busy || !selection.size} onPress={() => onAction("delete")} />
      <Button quiet label="Edit" disabled={busy || selection.size !== 1} onPress={() => onAction("edit")} />
    </ScrollView>}
  </View>;
}
