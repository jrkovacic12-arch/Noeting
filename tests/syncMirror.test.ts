import assert from "node:assert/strict";
import { test } from "node:test";
import { createMirror, validMirror, validDeviceId, publishMirror } from "../src/sync/mirror";
import type { Entry, Snapshot, Task } from "../src/data/repository";

const device = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const note: Entry = { id: "n", kind: "note", originalText: "old", text: "edited", removed: false,
  createdAt: "2026-10-18T00:00:00Z", thinkingKind: null, sourceEntryId: null };
const task: Task = { id: "t", entryId: "t-entry", title: "Do it", status: "pending",
  pinned: false, pinnedAt: null, pinOrder: 0, createdAt: "2026-10-18T00:00:00Z",
  completedAt: null, parentTaskId: null, parentEntryId: null, parentText: null, parentRemoved: false };
const snapshot: Snapshot = { entries: [note, {...note, id:"removed", removed: true},
  {...note, id:"t-entry", kind:"task"}], tasks: [task], folders: [], chosenEntryId: null };

test("manual mirror preserves original/current words and excludes removed entries", () => {
  const mirror = createMirror(snapshot, device, "2026-10-18T01:00:00Z");
  assert.deepEqual(mirror.entries.map(e => e.id), ["n", "t-entry"]);
  assert.equal(mirror.entries[0].originalText, "old");
  assert.equal(mirror.entries[0].text, "edited");
  assert.equal(mirror.tasks[0].entryId, "t-entry");
  assert.ok(validMirror(mirror));
  assert.equal(snapshot.entries.length, 3);
});

test("mirror rejects duplicate IDs, dangling tasks, invalid device and invalid payload", () => {
  assert.ok(validDeviceId(device));
  assert.ok(!validDeviceId("phone"));
  assert.throws(() => createMirror(snapshot, "phone"));
  const ok = createMirror(snapshot, device);
  assert.equal(validMirror({...ok, entries:[ok.entries[0],ok.entries[0]]}), false);
  assert.equal(validMirror({...ok, tasks:[{...task, entryId:"missing"}]}), false);
  assert.equal(validMirror({...ok, protocol:2}), false);
});

test("publisher refuses HTTP, URLs containing credentials, and weak pairing tokens before fetch", async () => {
  const mirror = createMirror(snapshot, device);
  await assert.rejects(publishMirror("http://localhost:8787/", "x".repeat(40), mirror), /HTTPS/);
  await assert.rejects(publishMirror("https://user:password@localhost/", "x".repeat(40), mirror), /HTTPS/);
  await assert.rejects(publishMirror("https://localhost/", "short", mirror), /pairing token/);
});
