import { useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Entry, Task } from "../data/repository";
import type { DraftStore } from "./useDraft";
import { InlineEditor } from "./InlineEditor";
import { Popover, type Anchor } from "./Popover";
import { Button, Check, IconButton } from "./controls";
import { useStyles } from "./styles";
export function NoteDetail({
  entry,
  source,
  children,
  tasks,
  onBack,
  onOpen,
  onSave,
  onRemove,
  onLink,
  onToggle,
  busy,
  readOnly = false,
  drafts,
}: {
  entry: Entry;
  source?: Entry;
  children: Entry[];
  tasks: Map<string, Task>;
  onBack: () => void;
  onOpen: (id: string) => void;
  onSave: (id: string, text: string) => Promise<void>;
  onRemove: () => void;
  onLink: (kind: Entry["kind"]) => void;
  onToggle: (task: Task) => void;
  busy: boolean;
  readOnly?: boolean;
  drafts: DraftStore;
}) {
  const { styles } = useStyles();
  const [menu, setMenu] = useState<"more" | "link" | "connections" | null>(
    null,
  );
  const [anchor, setAnchor] = useState<Anchor>();
  const more = useRef<View>(null);
  const link = useRef<View>(null);
  const [original, setOriginal] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const editable = !entry.removed && !readOnly;
  function show(kind: "more" | "link") {
    (kind === "more" ? more : link).current?.measureInWindow(
      (x, y, width, height) => {
        setAnchor({ x, y, width, height });
        setMenu(kind);
      },
    );
  }
  async function copy() {
    try {
      await Clipboard.setStringAsync(entry.text);
      setMenu(null);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <View style={styles.grow}>
      <View
        style={styles.grow}
        aria-hidden={!!menu}
        accessibilityElementsHidden={!!menu}
        importantForAccessibility={menu ? "no-hide-descendants" : "auto"}
      >
        <View style={styles.noteToolbar}>
          <IconButton name="back" label="Back" onPress={onBack} />
          <View style={styles.grow} />
          {editable && (
            <View ref={link} collapsable={false}>
              <IconButton
                name="link"
                label="Add linked entry"
                onPress={() => show("link")}
                disabled={busy}
              />
            </View>
          )}
          <View ref={more} collapsable={false}>
            <IconButton
              name="more"
              label="More note actions"
              onPress={() => show("more")}
              disabled={busy}
            />
          </View>
        </View>
        <ScrollView
          contentContainerStyle={styles.noteContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.meta}>
            {new Date(entry.createdAt).toLocaleString()}
            {entry.removed ? " · Removed" : readOnly ? " · Read only" : ""}
          </Text>
          {editable ? (
            <InlineEditor
              entry={entry}
              drafts={drafts}
              onSave={onSave}
              multiline
            />
          ) : (
            <Text selectable style={styles.noteBody}>
              {entry.text}
            </Text>
          )}
          {copyError && (
            <Text accessibilityRole="alert" style={styles.error}>
              Could not copy. Try again.
            </Text>
          )}
          {original && (
            <View style={styles.linkSection}>
              <Text style={styles.section}>Original capture</Text>
              <Text selectable style={styles.quoteText}>
                {entry.originalText}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
      {menu && (
        <Popover anchor={anchor} onClose={() => setMenu(null)}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {menu === "link" ? (
              <>
                <Button
                  quiet
                  label="New linked note"
                  onPress={() => {
                    setMenu(null);
                    onLink("note");
                  }}
                />
                <Button
                  quiet
                  label="New linked task"
                  onPress={() => {
                    setMenu(null);
                    onLink("task");
                  }}
                />
              </>
            ) : menu === "more" ? (
              <>
                <Button quiet label="Copy" onPress={() => void copy()} />
                {entry.text !== entry.originalText && (
                  <Button
                    quiet
                    label="View original capture"
                    onPress={() => {
                      setOriginal((v) => !v);
                      setMenu(null);
                    }}
                  />
                )}
                {(source || children.length > 0) && (
                  <Button
                    quiet
                    label={`Connections (${children.length + Number(!!source)})`}
                    onPress={() => setMenu("connections")}
                  />
                )}{" "}
                {editable && (
                  <Button
                    quiet
                    label="Remove note"
                    danger
                    onPress={() => {
                      setMenu(null);
                      onRemove();
                    }}
                  />
                )}
              </>
            ) : (
              <>
                <Text style={styles.section}>Connections</Text>
                {source && (
                  <Button
                    quiet
                    label={`Source ${source.kind}: ${entry.sourceText ?? source.originalText}${source.removed ? " · Removed" : ""}`}
                    onPress={() => {
                      setMenu(null);
                      onOpen(source.id);
                    }}
                  />
                )}
                {children.map((child) => (
                  <View key={child.id} style={styles.row}>
                    {tasks.get(child.id) && (
                      <Check
                        checked={tasks.get(child.id)!.status === "completed"}
                        label={`Complete linked task: ${child.text}`}
                        disabled={busy || readOnly}
                        onPress={() => onToggle(tasks.get(child.id)!)}
                      />
                    )}
                    <Button
                      quiet
                      label={`Open linked ${child.kind}: ${child.text}`}
                      onPress={() => {
                        setMenu(null);
                        onOpen(child.id);
                      }}
                    />
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </Popover>
      )}
    </View>
  );
}
