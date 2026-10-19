import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createRepository, type SQLiteDriver } from "../src/data/repository";
import {
  migrationV1,
  migrationV2,
  migrationV3,
  migrationV4,
  migrationV5,
  migrationV6,
  migrationV7,
  migrationV8,
  migrationV9,
  migrationV10,
} from "../src/data/migrations";
import type { Operation } from "../src/sync/schema";
import { replica } from "./syncFixtures";
test("v10 migration preserves removed parent, provenance, pins and hidden Task persistence", async () => {
  const p = replica();
  for (const sql of [
    migrationV1,
    migrationV2,
    migrationV3,
    migrationV4,
    migrationV5,
    migrationV6,
    migrationV7,
    migrationV8,
    migrationV9,
    migrationV10,
  ])
    p.db.exec(sql);
  p.db.exec(
    "PRAGMA user_version=10; INSERT INTO entries(id,capture_request_id,kind,original_text,created_at) VALUES('n','r','note','original','2026-01-01'); INSERT INTO note_folders VALUES('f','Folder','folder','2026-01-01','2026-01-02'); INSERT INTO note_organization VALUES('n','f','2026-01-03',NULL);",
  );
  await p.repo.initialize();
  assert.equal(p.db.prepare("PRAGMA user_version").get()!.user_version, 11);
  assert.equal(
    (await p.repo.readSnapshot()).entries[0].originalText,
    "original",
  );
  assert.equal(
    (await p.repo.sync((s) => s.records())).find(
      (r) => r.table === "note_folders",
    )!.value!.pinned_at,
    "2026-01-02",
  );
  p.db.close();
});
test("every local commit journals atomically, failed bulk rollback leaves no event, retries are no-ops", async () => {
  const p = replica();
  const n = await p.repo.saveCapture({
    requestId: "n",
    kind: "note",
    text: "original",
  });
  const events = await p.repo.sync((s) => s.pending());
  assert.equal(events.length, 1);
  assert.equal(events[0].changes[0].value!.original_text, "original");
  await p.repo.saveCapture({ requestId: "n", kind: "note", text: "original" });
  assert.equal((await p.repo.sync((s) => s.pending())).length, 1);
  p.db.exec(
    "CREATE TRIGGER fail_journal BEFORE INSERT ON sync_v2_outbox BEGIN SELECT RAISE(ABORT,'disk fault'); END;",
  );
  await assert.rejects(p.repo.editEntry(n.entryId, "lost?"), /disk fault/);
  assert.equal((await p.repo.readSnapshot()).entries[0].text, "original");
  assert.equal(
    p.db.prepare("SELECT count(*) n FROM sync_v2_dirty").get()!.n,
    0,
  );
  p.db.exec("DROP TRIGGER fail_journal;");
  await assert.rejects(
    p.repo.organizeNotes([n.entryId, "missing"], { pinned: true }),
  );
  assert.equal((await p.repo.sync((s) => s.pending())).length, 1);
  p.db.close();
});
test("full fidelity bootstrap includes removed Tasks, frozen sources and folder deletion tombstones", async () => {
  const a = replica(),
    b = replica();
  const note = await a.repo.saveCapture({
    requestId: "note",
    kind: "note",
    text: "source",
  });
  const parent = await a.repo.saveLinkedEntry({
    requestId: "task",
    kind: "task",
    text: "do",
    sourceEntryId: note.entryId,
  });
  await a.repo.saveSubtask({
    requestId: "child",
    parentTaskId: parent.taskId!,
    text: "step",
  });
  await a.repo.removeEntry(parent.entryId);
  await a.repo.removeEntry(note.entryId);
  await a.repo.createFolder("folder", "Folder");
  await a.repo.removeFolder("folder");
  const records = await a.repo.sync((s) => s.records());
  const origin = await a.repo.sync(async (s) => (await s.identity()).device_id);
  const op: Operation = {
    protocol: 2,
    id: "bootstrap",
    origin,
    changes: records.map((r) => ({ ...r, base: 0, previous: null })),
  };
  await b.repo.sync((s) => s.bootstrap(op, "library", origin));
  assert.deepEqual(await b.repo.sync((s) => s.records()), records);
  assert.equal((await b.repo.sync((s) => s.pending())).length, 0);
  assert.equal((await b.repo.readSnapshot()).tasks.length, 1); // only active child in display
  a.db.close();
  b.db.close();
});
test("server accepts once, rejects stale and immutable changes, preserves conflict values", async () => {
  const p = replica();
  const n = await p.repo.saveCapture({
    requestId: "n",
    kind: "note",
    text: "original",
  });
  await p.repo.sync((s) => s.publishLocal());
  const [base] = await p.repo.sync((s) =>
    s.current([{ table: "entries", id: n.entryId, value: null }]),
  );
  const origin = "a".repeat(32);
  const op: Operation = {
    protocol: 2,
    id: "edit-a",
    origin,
    changes: [{ ...base, value: { ...base.value!, edited_text: "phone" } }],
  };
  const first = await p.repo.sync((s) => s.accept(op));
  assert.ok("event" in first);
  assert.deepEqual(await p.repo.sync((s) => s.accept(op)), first);
  const stale = {
    ...op,
    id: "edit-b",
    changes: [{ ...base, value: { ...base.value!, edited_text: "PC" } }],
  };
  const rejected = await p.repo.sync((s) => s.accept(stale));
  assert.ok("conflict" in rejected);
  assert.equal((await p.repo.readSnapshot()).entries[0].text, "phone");
  const current = await p.repo.sync((s) => s.current(op.changes));
  const bad = {
    ...op,
    id: "tamper",
    changes: current.map((c) => ({
      ...c,
      value: { ...c.value!, original_text: "tampered" },
    })),
  };
  assert.ok("conflict" in (await p.repo.sync((s) => s.accept(bad))));
  assert.equal(
    (await p.repo.readSnapshot()).entries[0].originalText,
    "original",
  );
  p.db.close();
});
test("remote storage failure rolls back domain, seen-operation and cursor together", async () => {
  const p = replica();
  const n = await p.repo.saveCapture({
    requestId: "n",
    kind: "note",
    text: "local",
  });
  await p.repo.sync((s) => s.publishLocal());
  const current = await p.repo.sync((s) =>
    s.current([{ table: "entries", id: n.entryId, value: null }]),
  );
  const op: Operation = {
    protocol: 2,
    id: "remote-edit",
    origin: "b".repeat(32),
    changes: current.map((c) => ({
      ...c,
      value: { ...c.value!, edited_text: "remote" },
    })),
  };
  const run = p.driver.run;
  let fail = true;
  p.driver.run = async (sql, values) => {
    if (fail && sql.startsWith("INSERT INTO entries")) {
      fail = false;
      throw Error("storage interruption");
    }
    return run(sql, values);
  };
  await assert.rejects(
    p.repo.sync((s) => s.replay({ revision: 1, operation: op })),
    /storage interruption/,
  );
  assert.equal((await p.repo.sync((s) => s.identity())).cursor, 0);
  assert.equal((await p.repo.readSnapshot()).entries[0].text, "local");
  await p.repo.sync((s) => s.replay({ revision: 1, operation: op }));
  assert.equal((await p.repo.readSnapshot()).entries[0].text, "remote");
  assert.equal((await p.repo.sync((s) => s.pending())).length, 0);
  p.db.close();
});
test("stale PC editor save rolls back every affected record and journal event", async () => {
  const p = replica();
  const n = await p.repo.saveCapture({
    requestId: "n",
    kind: "note",
    text: "initial",
  });
  const expected = await p.repo.sync(async (s) => s.current(await s.records()));
  await p.repo.editEntry(n.entryId, "incoming");
  const before = await p.repo.sync((s) => s.pending());
  await assert.rejects(
    p.repo.checked(expected, (r) => r.editEntry(n.entryId, "stale editor")),
    /changed while/,
  );
  assert.equal((await p.repo.readSnapshot()).entries[0].text, "incoming");
  assert.deepEqual(await p.repo.sync((s) => s.pending()), before);
  p.db.close();
});
