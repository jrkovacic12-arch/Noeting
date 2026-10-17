import { useEffect, useRef, useState } from "react";
import {
  AppState,
  Text,
  TextInput,
  View,
  type TextInput as Input,
} from "react-native";
import type { Entry } from "../data/repository";
import type { DraftStore } from "./useDraft";
import { Button } from "./controls";
import { useStyles } from "./styles";
export function InlineEditor({
  entry,
  drafts,
  onSave,
  multiline = false,
  onSubmit,
  inputRef,
}: {
  entry: Entry;
  drafts: DraftStore;
  onSave: (id: string, text: string) => Promise<void>;
  multiline?: boolean;
  onSubmit?: () => void;
  inputRef?: React.RefObject<Input | null>;
}) {
  const { styles, colors } = useStyles();
  const context = `edit:${entry.id}`;
  const [text, setText] = useState(
    () => drafts.get(context)?.text ?? entry.text,
  );
  const [state, setState] = useState<"saved" | "unsaved" | "saving" | "failed">(
    drafts.get(context) ? "unsaved" : "saved",
  );
  const current = useRef(text);
  const saved = useRef(entry.text);
  const mounted = useRef(true);
  const flight = useRef<Promise<void> | null>(null);
  const composing = useRef(false);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  async function flush() {
    if (flight.current) {
      await flight.current;
      return;
    }
    const value = current.current;
    if (value === saved.current) {
      if (drafts.get(context)) drafts.put(context, null);
      if (mounted.current) setState("saved");
      return;
    }
    if (!value.trim()) {
      if (mounted.current) setState("failed");
      return;
    }
    if (mounted.current) setState("saving");
    let succeeded = false;
    flight.current = (async () => {
      try {
        if (!(await drafts.flush())) throw new Error("Draft storage failed.");
        await saveRef.current(entry.id, value);
        saved.current = value;
        succeeded = true;
        if (current.current === value) {
          if (drafts.get(context)?.text === value) drafts.put(context, null);
          if (mounted.current) setState("saved");
        }
      } catch {
        if (mounted.current) setState("failed");
      }
    })();
    await flight.current;
    flight.current = null;
    if (succeeded && current.current !== saved.current) await flush();
  }
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    if (current.current === saved.current && drafts.get(context)) {
      drafts.put(context, null);
      setState("saved");
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") void flushRef.current();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      void flushRef.current();
    };
  }, []);
  useEffect(() => {
    if (text === saved.current) {
      void flushRef.current();
      return;
    }
    const timer = setTimeout(() => {
      if (!composing.current) void flushRef.current();
    }, 500);
    return () => clearTimeout(timer);
  }, [text]);
  function change(value: string) {
    current.current = value;
    setText(value);
    setState("unsaved");
    drafts.put(context, {
      kind: entry.kind,
      text: value,
      requestId: `edit-${entry.id}`,
      editEntryId: entry.id,
    });
  }
  return (
    <View style={styles.grow}>
      <TextInput
        ref={inputRef}
        accessibilityLabel={
          multiline ? "Note body" : `Task text: ${entry.text}`
        }
        multiline={multiline}
        value={text}
        onChangeText={change}
        onBlur={() => void flush()}
        onSubmitEditing={(event) => {
          if (!(event.nativeEvent as any).isComposing && !composing.current) {
            void flush();
            onSubmit?.();
          }
        }}
        submitBehavior={multiline ? "newline" : "submit"}
        {...({
          onCompositionStart: () => {
            composing.current = true;
          },
          onCompositionEnd: () => {
            composing.current = false;
            void flush();
          },
        } as any)}
        placeholderTextColor={colors.muted}
        style={
          multiline
            ? [
                styles.noteBody,
                { minHeight: 240, textAlignVertical: "top", padding: 0 },
              ]
            : [
                styles.linkText,
                { minHeight: 44, paddingVertical: 8, paddingHorizontal: 0 },
              ]
        }
      />
      {state !== "saved" && (
        <View style={styles.row}>
          <Text accessibilityLiveRegion="polite" style={styles.meta}>
            {state === "saving" ? "Saving…" : "Unsaved"}
          </Text>
          {state === "failed" && (
            <Button quiet label="Retry save" onPress={() => void flush()} />
          )}
        </View>
      )}
    </View>
  );
}
