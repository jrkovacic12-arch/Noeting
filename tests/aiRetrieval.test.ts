import assert from "node:assert/strict";
import { test } from "node:test";
import { hasOnlyAllowedCitations, selectAIContext } from "../src/ai/retrieval";
import type { Entry, Snapshot } from "../src/data/repository";

function entry(id: string, text: string, options: Partial<Entry> = {}): Entry {
  return {
    id,
    kind: "note",
    originalText: text,
    text,
    removed: false,
    createdAt: "2026-10-18T00:00:00Z",
    thinkingKind: null,
    sourceEntryId: null,
    ...options,
  };
}
const snapshot = (...entries: Entry[]): Snapshot => ({
  entries, tasks: [], chosenEntryId: null,
});

test("AI context never searches without explicit allowed IDs", () => {
  const data = snapshot(entry("private", "Private project commitment"));
  assert.deepEqual(selectAIContext(data, { query: "project", allowedEntryIds: [] }), []);
  assert.deepEqual(selectAIContext(data, { query: "project", allowedEntryIds: ["different"] }), []);
});

test("context excludes removed entries and respects the selected scope", () => {
  const data = snapshot(
    entry("selected", "Project planning notes"),
    entry("outside", "Project confidential notes"),
    entry("removed", "Project deleted notes", { removed: true }),
  );
  const result = selectAIContext(data, {
    query: "project",
    allowedEntryIds: ["selected", "removed"],
  });
  assert.deepEqual(result.map((source) => source.entryId), ["selected"]);
  assert.equal(result[0].excerpt, "Project planning notes");
});

test("matches multiple words, returns exact bounded excerpts and source offsets", () => {
  const text = "A".repeat(240) + " Research ideas and possible tasks.";
  const data = snapshot(
    entry("a", text, { createdAt: "2026-10-18T10:00:00Z" }),
    entry("b", "Unrelated text"),
    entry("c", "Research task", { kind: "task" }),
  );
  const before = JSON.stringify(data);
  const result = selectAIContext(data, {
    query: "research tasks",
    allowedEntryIds: ["a", "b", "c"],
    maxTotalChars: 70,
    maxCharsPerEntry: 50,
  });
  assert.equal(result[0].entryId, "a");
  assert.ok(result.some((source) => source.kind === "task"));
  assert.ok(result.every((source) => {
    const record = data.entries.find((item) => item.id === source.entryId)!;
    return source.excerpt === record.text.slice(source.start, source.end);
  }));
  assert.ok(result.reduce((total, item) => total + item.excerpt.length, 0) <= 70);
  assert.equal(JSON.stringify(data), before);
});

test("zero matches do not leak arbitrary notes; explicit reading can use an empty query", () => {
  const data = snapshot(entry("a", "First note"), entry("b", "Second note"));
  assert.deepEqual(selectAIContext(data, {
    query: "nonmatching",
    allowedEntryIds: ["a", "b"],
  }), []);
  assert.deepEqual(selectAIContext(data, {
    query: "",
    allowedEntryIds: ["b"],
  }).map((source) => source.entryId), ["b"]);
});

test("citations can reference only selected original entry IDs", () => {
  const sources = selectAIContext(snapshot(entry("a", "Reading notes")), {
    query: "reading",
    allowedEntryIds: ["a"],
  });
  assert.equal(hasOnlyAllowedCitations(["a"], sources), true);
  assert.equal(hasOnlyAllowedCitations(["a", "invented"], sources), false);
});
