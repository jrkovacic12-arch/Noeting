import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  createRepository,
  SCHEMA_VERSION,
  type SQLiteDriver,
} from "../src/data/repository";

function sqliteDriver(database: DatabaseSync): SQLiteDriver {
  return {
    async exec(sql) {
      database.exec(sql);
    },
    async run(sql, parameters = []) {
      const result = database.prepare(sql).run(...parameters);
      return { changes: Number(result.changes) };
    },
    async all<T>(sql: string, parameters = []) {
      return database.prepare(sql).all(...parameters) as T[];
    },
  };
}

test("real SQLite data, exact text, completion and pins survive closing and reopening the file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "noeting-sqlite-"));
  const filename = join(directory, "noeting.db");
  let database = new DatabaseSync(filename);
  try {
    const repository = createRepository(sqliteDriver(database));
    await repository.initialize();
    const originalText = "  A thought\nwith a second line. 🌿  ";
    const note = await repository.saveCapture({
      requestId: "note-1",
      kind: "note",
      text: originalText,
    });
    assert.equal(note.taskId, null);
    const task = await repository.saveCapture({
      requestId: "task-1",
      kind: "task",
      text: "  Pay the bill  ",
    });
    const secondTask = await repository.saveCapture({
      requestId: "task-2",
      kind: "task",
      text: "Take a walk",
    });
    assert.ok(task.taskId);
    assert.ok(secondTask.taskId);
    await repository.setPinned(task.taskId, true);
    await repository.completeTask(task.taskId);
    await repository.setPinned(secondTask.taskId, true);
    const before = await repository.readSnapshot();
    database.close();

    // This new connection has no cache or application state from the first instance.
    database = new DatabaseSync(filename);
    const reopened = createRepository(sqliteDriver(database));
    const after = await reopened.readSnapshot();
    assert.deepEqual(after, before);
    assert.equal(after.entries[0].originalText, originalText);
    assert.equal(after.entries[1].originalText, "  Pay the bill  ");
    assert.equal(after.tasks[0].title, "Pay the bill");
    assert.equal(after.tasks[0].status, "completed");
    assert.equal(after.tasks[0].pinned, false);
    assert.ok(after.tasks[0].completedAt);
    assert.equal(after.tasks[1].pinned, true);
    assert.equal(after.tasks[1].status, "pending");
    assert.equal(after.tasks[1].completedAt, null);
    assert.deepEqual(
      await reopened.saveCapture({
        requestId: "task-1",
        kind: "task",
        text: "  Pay the bill  ",
      }),
      task,
    );
    assert.deepEqual(await reopened.readSnapshot(), after);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("capture is idempotent for concurrent retries and rejects changed request content", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    const repository = createRepository(sqliteDriver(database));
    const input = {
      requestId: "same-request",
      kind: "task" as const,
      text: "  Buy groceries\n  ",
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => repository.saveCapture(input)),
    );
    assert.ok(
      results.every(
        (result) =>
          result.entryId === results[0].entryId &&
          result.taskId === results[0].taskId,
      ),
    );
    assert.equal((await repository.readSnapshot()).entries.length, 1);
    assert.equal((await repository.readSnapshot()).tasks.length, 1);
    await assert.rejects(
      repository.saveCapture({ ...input, text: input.text.trim() }),
      /different content/,
    );
    await assert.rejects(
      repository.saveCapture({ ...input, kind: "note" }),
      /different content/,
    );
    assert.equal((await repository.readSnapshot()).tasks.length, 1);
    // Identical text in a distinct deliberate capture remains a distinct record.
    await repository.saveCapture({ ...input, requestId: "different-request" });
    assert.equal((await repository.readSnapshot()).tasks.length, 2);
  } finally {
    database.close();
  }
});

test("failed linked-task insert rolls back the entry and the same request can safely retry", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    const repository = createRepository(sqliteDriver(database));
    await repository.initialize();
    database.exec(
      "CREATE TRIGGER simulate_task_failure BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'Injected write failure'); END;",
    );
    const input = {
      requestId: "retry-after-failure",
      kind: "task" as const,
      text: "Keep my input",
    };
    await assert.rejects(
      repository.saveCapture(input),
      /Injected write failure/,
    );
    assert.deepEqual(await repository.readSnapshot(), {
      entries: [],
      tasks: [],
      chosenEntryId: null,
      folders: [],
    });
    database.exec("DROP TRIGGER simulate_task_failure;");
    const saved = await repository.saveCapture(input);
    assert.equal(saved.entryId, "entry_retry-after-failure");
    assert.equal(saved.taskId, "task_retry-after-failure");
    const state = await repository.readSnapshot();
    assert.equal(state.entries.length, 1);
    assert.equal(state.tasks.length, 1);
    assert.equal(state.tasks[0].entryId, state.entries[0].id);
  } finally {
    database.close();
  }
});

test("concurrent pinning is unlimited, completion clears a pin and repeated completion is stable", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    const repository = createRepository(sqliteDriver(database));
    const captures = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        repository.saveCapture({
          requestId: `pin-${index}`,
          kind: "task",
          text: `Task ${index}`,
        }),
      ),
    );
    const ids = captures.map((capture) => capture.taskId!);
    const pins = await Promise.allSettled(
      ids.map((id) => repository.setPinned(id, true)),
    );
    assert.equal(
      pins.filter((result) => result.status === "fulfilled").length,
      5,
    );
    assert.equal(
      pins.filter((result) => result.status === "rejected").length,
      0,
    );
    assert.equal(
      (await repository.readSnapshot()).tasks.filter((task) => task.pinned)
        .length,
      5,
    );
    await repository.setPinned(ids[0], true);
    await repository.completeTask(ids[0]);
    const completedAt = (await repository.readSnapshot()).tasks[0].completedAt;
    await repository.completeTask(ids[0]);
    assert.equal(
      (await repository.readSnapshot()).tasks[0].completedAt,
      completedAt,
    );
    await assert.rejects(repository.setPinned(ids[0], true), /pending tasks/);
    await repository.setPinned(ids[3], true);
    await repository.setPinned(ids[1], false);
    await repository.setPinned(ids[4], true);
    assert.equal(
      (await repository.readSnapshot()).tasks.filter((task) => task.pinned)
        .length,
      3,
    );
  } finally {
    database.close();
  }
});

test("a failed commit rejects the save, rolls back its records and leaves the queue usable", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    const base = sqliteDriver(database);
    let failCommit = false;
    const repository = createRepository({
      ...base,
      async exec(sql) {
        if (failCommit && sql === "COMMIT;") {
          failCommit = false;
          throw new Error("Injected commit failure");
        }
        await base.exec(sql);
      },
    });
    await repository.initialize();
    failCommit = true;
    const input = {
      requestId: "commit-retry",
      kind: "task" as const,
      text: "Persist both records",
    };
    await assert.rejects(
      repository.saveCapture(input),
      /Injected commit failure/,
    );
    assert.deepEqual(await repository.readSnapshot(), {
      entries: [],
      tasks: [],
      chosenEntryId: null,
      folders: [],
    });
    await repository.saveCapture(input);
    const after = await repository.readSnapshot();
    assert.equal(after.entries.length, 1);
    assert.equal(after.tasks.length, 1);
  } finally {
    database.close();
  }
});

test("migration initialization is repeatable and refuses newer databases without rewriting them", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    const driver = sqliteDriver(database);
    const repository = createRepository(driver);
    await Promise.all([
      repository.initialize(),
      repository.initialize(),
      repository.readSnapshot(),
      createRepository(driver).initialize(),
    ]);
    await repository.saveCapture({
      requestId: "existing",
      kind: "note",
      text: "Preserve me",
    });
    await createRepository(driver).initialize();
    assert.equal(
      database.prepare("PRAGMA user_version").get()!.user_version,
      SCHEMA_VERSION,
    );
    assert.equal(
      (await repository.readSnapshot()).entries[0].originalText,
      "Preserve me",
    );

    database.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1};`);
    await assert.rejects(
      createRepository(driver).initialize(),
      /newer Noeting version/,
    );
    assert.equal(
      database.prepare("PRAGMA user_version").get()!.user_version,
      SCHEMA_VERSION + 1,
    );
    assert.equal(
      database.prepare("SELECT original_text FROM entries").get()!
        .original_text,
      "Preserve me",
    );
  } finally {
    database.close();
  }
});

test("a migration failure rolls back all schema changes and can retry after its cause is removed", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    const driver = sqliteDriver(database);
    const repository = createRepository(driver);
    // An unexpected existing table forces the initial migration to fail partway through.
    database.exec("CREATE TABLE tasks(existing_user_value TEXT);");
    await assert.rejects(repository.initialize(), /tasks already exists/);
    assert.equal(
      database.prepare("PRAGMA user_version").get()!.user_version,
      0,
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS total FROM sqlite_master WHERE name = 'entries'",
        )
        .get()!.total,
      0,
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS total FROM sqlite_master WHERE name = 'tasks'",
        )
        .get()!.total,
      1,
    );
    database.exec("DROP TABLE tasks;");
    await repository.initialize();
    assert.deepEqual(await repository.readSnapshot(), {
      entries: [],
      tasks: [],
      chosenEntryId: null,
      folders: [],
    });
  } finally {
    database.close();
  }
});

test("local workflow does not call fetch and rejects empty captures or missing tasks", async () => {
  const database = new DatabaseSync(":memory:");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Network must not be used by local capture.");
  };
  try {
    const repository = createRepository(sqliteDriver(database));
    await assert.rejects(
      repository.saveCapture({ requestId: "", kind: "note", text: "Hello" }),
      /request ID/,
    );
    await assert.rejects(
      repository.saveCapture({
        requestId: "empty",
        kind: "task",
        text: " \n ",
      }),
      /Write something/,
    );
    await repository.saveCapture({
      requestId: "offline",
      kind: "note",
      text: "Works locally",
    });
    assert.equal((await repository.readSnapshot()).entries.length, 1);
    assert.equal((await repository.readSnapshot()).tasks.length, 0);
    await assert.rejects(repository.setPinned("missing", true), /not found/);
    await assert.rejects(repository.completeTask("missing"), /not found/);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

async function seedV1(database: DatabaseSync) {
  database.exec(
    await readFile(
      new URL("./fixtures/schema-v1.sql", import.meta.url),
      "utf8",
    ),
  );
  const insert = database.prepare(
    "INSERT INTO entries(id,capture_request_id,kind,original_text,created_at) VALUES (?,?,?,?,?)",
  );
  insert.run(
    "old-note",
    "old-note-request",
    "note",
    "  Original\nthought 🌿  ",
    "2026-10-12T12:00:00Z",
  );
  insert.run(
    "old-task",
    "old-task-request",
    "task",
    "  Prior task  ",
    "2026-10-12T12:01:00Z",
  );
  insert.run(
    "old-completed",
    "old-completed-request",
    "task",
    "Completed task",
    "2026-10-12T12:02:00Z",
  );
  database.exec(
    "INSERT INTO tasks VALUES ('task-old','old-task','Prior task','pending',1,'2026-10-12T12:01:00Z',NULL);",
  );
  database.exec(
    "INSERT INTO tasks VALUES ('task-done','old-completed','Completed task','completed',0,'2026-10-12T12:02:00Z','2026-10-12T13:00:00Z');",
  );
}

test("v1 phone data upgrades intact and Today selection / linked thinking survive reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "noeting-upgrade-"));
  const filename = join(directory, "noeting.db");
  let database = new DatabaseSync(filename);
  try {
    await seedV1(database);
    const oldEntries = database
      .prepare("SELECT * FROM entries ORDER BY rowid")
      .all();
    const oldTasks = database
      .prepare("SELECT * FROM tasks ORDER BY rowid")
      .all();
    const repository = createRepository(sqliteDriver(database));
    await repository.initialize();
    assert.deepEqual(
      database
        .prepare(
          "SELECT id,capture_request_id,kind,original_text,created_at FROM entries ORDER BY rowid",
        )
        .all(),
      oldEntries,
    );
    assert.deepEqual(
      database
        .prepare(
          "SELECT id,entry_id,title,status,pinned,created_at,completed_at FROM tasks ORDER BY rowid",
        )
        .all(),
      oldTasks,
    );
    await repository.chooseTodayNote("old-note");
    await repository.saveLinked({
      requestId: "reflect",
      sourceEntryId: "old-note",
      kind: "reflection",
      text: "  A new interpretation\nunchanged source.  ",
    });
    await repository.saveLinked({
      requestId: "create",
      sourceEntryId: "old-note",
      kind: "creation",
      text: "An independently authored creation",
    });
    const before = await repository.readSnapshot();
    assert.equal(before.chosenEntryId, "old-note");
    assert.equal(before.tasks.length, 2);
    assert.equal(before.entries[0].originalText, "  Original\nthought 🌿  ");
    assert.equal(before.entries[3].thinkingKind, "reflection");
    assert.equal(before.entries[4].thinkingKind, "creation");
    assert.equal(before.entries[3].sourceEntryId, "old-note");
    database.close();
    database = new DatabaseSync(filename);
    assert.deepEqual(
      await createRepository(sqliteDriver(database)).readSnapshot(),
      before,
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(
      database.prepare("PRAGMA integrity_check").get()!.integrity_check,
      "ok",
    );
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("v1 to v2 failure rolls back additive changes and preserves every legacy record", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    await seedV1(database);
    const before = database
      .prepare("SELECT * FROM entries ORDER BY rowid")
      .all();
    database.exec("CREATE TABLE today_selection(existing_user_value TEXT);");
    const repository = createRepository(sqliteDriver(database));
    await assert.rejects(
      repository.initialize(),
      /today_selection already exists/,
    );
    assert.equal(
      database.prepare("PRAGMA user_version").get()!.user_version,
      1,
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE name='thinking_links'",
        )
        .get()!.n,
      0,
    );
    assert.deepEqual(
      database.prepare("SELECT * FROM entries ORDER BY rowid").all(),
      before,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) AS n FROM tasks").get()!.n,
      2,
    );
    database.exec("DROP TABLE today_selection;");
    await repository.initialize();
    assert.equal(
      database.prepare("PRAGMA user_version").get()!.user_version,
      SCHEMA_VERSION,
    );
  } finally {
    database.close();
  }
});

test("linked saves are atomic and retry idempotent; changed source/text/type is rejected", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    const repo = createRepository(sqliteDriver(database));
    const source = await repo.saveCapture({
      requestId: "source",
      kind: "note",
      text: "Source words",
    });
    const other = await repo.saveCapture({
      requestId: "other",
      kind: "note",
      text: "Other source",
    });
    const input = {
      requestId: "linked-retry",
      sourceEntryId: source.entryId,
      kind: "reflection" as const,
      text: "  Linked text\n  ",
    };
    database.exec(
      "CREATE TRIGGER fail_link BEFORE INSERT ON thinking_links BEGIN SELECT RAISE(ABORT,'Injected linked failure'); END;",
    );
    await assert.rejects(repo.saveLinked(input), /Injected linked failure/);
    assert.equal((await repo.readSnapshot()).entries.length, 2);
    database.exec("DROP TRIGGER fail_link;");
    const results = await Promise.all(
      Array.from({ length: 8 }, () => repo.saveLinked(input)),
    );
    assert.ok(results.every((r) => r.entryId === results[0].entryId));
    assert.equal((await repo.readSnapshot()).entries.length, 3);
    await assert.rejects(
      repo.saveLinked({ ...input, text: "Changed" }),
      /different content or source/,
    );
    await assert.rejects(
      repo.saveLinked({ ...input, sourceEntryId: other.entryId }),
      /different content or source/,
    );
    await assert.rejects(
      repo.saveLinked({ ...input, kind: "creation" }),
      /different content or source/,
    );
    await assert.rejects(
      repo.saveLinked({
        ...input,
        requestId: "missing",
        sourceEntryId: "absent",
      }),
      /not found/,
    );
    assert.equal((await repo.readSnapshot()).tasks.length, 0);
    assert.equal(
      (await repo.readSnapshot()).entries[0].originalText,
      "Source words",
    );
    await assert.rejects(repo.chooseTodayNote("absent"), /saved note/);
    const task = await repo.saveCapture({
      requestId: "task",
      kind: "task",
      text: "A task",
    });
    await assert.rejects(repo.chooseTodayNote(task.entryId), /saved note/);
    assert.equal((await repo.readSnapshot()).chosenEntryId, null);
  } finally {
    database.close();
  }
});

test("standalone captures never select Today or change a legacy selection", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const repo = createRepository(sqliteDriver(db));
    const first = await repo.saveCapture({
      requestId: "first",
      kind: "note",
      text: "First",
    });
    assert.equal((await repo.readSnapshot()).chosenEntryId, null);
    await repo.chooseTodayNote(first.entryId); // Simulate an existing historical selection.
    db.exec(
      "CREATE TRIGGER fail_selection BEFORE INSERT ON today_selection BEGIN SELECT RAISE(ABORT,'Must not select'); END;",
    );
    await repo.saveCapture({
      requestId: "second",
      kind: "note",
      text: "Second",
    });
    await repo.saveCapture({ requestId: "third", kind: "task", text: "Third" });
    assert.equal((await repo.readSnapshot()).chosenEntryId, first.entryId);
  } finally {
    db.close();
  }
});

test("schema v2 upgrades preserve captured text, task states, links and Today selection", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      await readFile(
        new URL("./fixtures/schema-v2.sql", import.meta.url),
        "utf8",
      ),
    );
    db.exec(
      "INSERT INTO entries VALUES ('n','req-n','note','  Source 🌿  ','2026-10-12'); INSERT INTO entries VALUES ('t','req-t','task','Task original','2026-10-12'); INSERT INTO entries VALUES ('r','req-r','note','Reflection original','2026-10-13'); INSERT INTO tasks VALUES ('task-t','t','Task original','pending',1,'2026-10-12',NULL); INSERT INTO thinking_links VALUES ('r','n','reflection'); INSERT INTO today_selection VALUES (1,'n');",
    );
    const old = db.prepare("SELECT * FROM entries ORDER BY rowid").all();
    const tasks = db.prepare("SELECT * FROM tasks").all();
    const repo = createRepository(sqliteDriver(db));
    const snapshot = await repo.readSnapshot();
    assert.deepEqual(
      db
        .prepare(
          "SELECT id,capture_request_id,kind,original_text,created_at FROM entries ORDER BY rowid",
        )
        .all(),
      old,
    );
    assert.deepEqual(
      db
        .prepare(
          "SELECT id,entry_id,title,status,pinned,created_at,completed_at FROM tasks",
        )
        .all(),
      tasks,
    );
    assert.equal(snapshot.chosenEntryId, "n");
    assert.equal(snapshot.entries[2].sourceEntryId, "n");
    assert.equal(snapshot.entries[0].text, "  Source 🌿  ");
    assert.equal(snapshot.entries[0].removed, false);
    assert.equal(
      db.prepare("PRAGMA user_version").get()!.user_version,
      SCHEMA_VERSION,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("schema v3 migration failure rolls back new columns and retries without changing v2 records", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      await readFile(
        new URL("./fixtures/schema-v2.sql", import.meta.url),
        "utf8",
      ),
    );
    db.exec(
      "INSERT INTO entries VALUES ('n','req','note','Preserve me','2026-10-12'); ALTER TABLE entries ADD COLUMN removed_at TEXT;",
    );
    const before = db.prepare("SELECT * FROM entries").all();
    const repo = createRepository(sqliteDriver(db));
    await assert.rejects(repo.initialize(), /duplicate column/);
    assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 2);
    assert.deepEqual(
      db
        .prepare("SELECT * FROM entries")
        .all()
        .map((row) => {
          const { removed_pin_at, removed_pin_order, ...old } = row;
          return Object.assign(Object.create(null), old);
        }),
      before,
    );
    assert.equal(
      db
        .prepare("PRAGMA table_info(entries)")
        .all()
        .some((row) => row.name === "edited_text"),
      false,
    );
    db.exec("ALTER TABLE entries DROP COLUMN removed_at;");
    await repo.initialize();
    assert.equal(
      (await repo.readSnapshot()).entries[0].originalText,
      "Preserve me",
    );
  } finally {
    db.close();
  }
});

test("editing a task updates both surfaces atomically while preserving first capture, timestamps and source", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const repo = createRepository(sqliteDriver(db));
    const task = await repo.saveCapture({
      requestId: "edit-task",
      kind: "task",
      text: "  Original task  ",
    });
    const legacy = await repo.saveCapture({
      requestId: "edit-linked",
      kind: "note",
      text: "A reflection",
    });
    db.prepare("INSERT INTO thinking_links VALUES(?,?,'reflection')").run(
      legacy.entryId,
      task.entryId,
    ); // Historical relationship, not a permitted new write.
    const before = (await repo.readSnapshot()).entries[0];
    db.exec(
      "CREATE TRIGGER fail_edit BEFORE UPDATE OF title ON tasks BEGIN SELECT RAISE(ABORT,'Task edit failed'); END;",
    );
    await assert.rejects(
      repo.editEntry(task.entryId, "New task"),
      /Task edit failed/,
    );
    assert.equal((await repo.readSnapshot()).entries[0].text, before.text);
    db.exec("DROP TRIGGER fail_edit;");
    await repo.editEntry(task.entryId, "  New task\n🌿  ");
    const snapshot = await repo.readSnapshot();
    assert.equal(snapshot.entries[0].text, "  New task\n🌿  ");
    assert.equal(snapshot.tasks[0].title, "New task\n🌿");
    assert.equal(snapshot.entries[0].originalText, before.originalText);
    assert.equal(snapshot.entries[0].createdAt, before.createdAt);
    assert.equal(snapshot.entries[1].sourceEntryId, task.entryId);
    await assert.rejects(
      repo.editEntry(task.entryId, " \n "),
      /Write something/,
    );
  } finally {
    db.close();
  }
});

test("removal keeps provenance, clears selection and pin, and durable Undo does not override newer choices", async () => {
  const dir = await mkdtemp(join(tmpdir(), "noeting-undo-"));
  const file = join(dir, "db.sqlite");
  let db = new DatabaseSync(file);
  try {
    let repo = createRepository(sqliteDriver(db));
    const source = await repo.saveCapture({
      requestId: "remove-source",
      kind: "note",
      text: "Source",
    });
    const linked = await repo.saveLinked({
      requestId: "remove-reflection",
      sourceEntryId: source.entryId,
      kind: "reflection",
      text: "Keep reflection",
    });
    await repo.chooseTodayNote(source.entryId);
    const receipt = await repo.removeEntry(source.entryId);
    assert.deepEqual(await repo.removeEntry(source.entryId), receipt);
    const removed = await repo.readSnapshot();
    assert.equal(removed.chosenEntryId, null);
    assert.equal(
      removed.entries.find((e) => e.id === source.entryId)!.removed,
      true,
    );
    assert.equal(
      removed.entries.find((e) => e.id === linked.entryId)!.removed,
      false,
    );
    await assert.rejects(repo.editEntry(source.entryId, "Oops"), /not found/);
    await assert.rejects(repo.chooseTodayNote(source.entryId), /saved note/);
    db.close();
    db = new DatabaseSync(file);
    repo = createRepository(sqliteDriver(db));
    const newer = await repo.saveCapture({
      requestId: "remove-newer",
      kind: "note",
      text: "Newer",
    });
    await repo.chooseTodayNote(newer.entryId);
    await repo.restoreEntry(receipt);
    await repo.restoreEntry(receipt);
    assert.equal((await repo.readSnapshot()).chosenEntryId, newer.entryId);
    await repo.removeEntry(source.entryId);
    await assert.rejects(repo.restoreEntry(receipt), /no longer/);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(
      db.prepare("PRAGMA integrity_check").get()!.integrity_check,
      "ok",
    );
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("removing and restoring a pinned task retains its position without a pin limit", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const repo = createRepository(sqliteDriver(db));
    const captures = [];
    for (let i = 0; i < 4; i++)
      captures.push(
        await repo.saveCapture({
          requestId: "slot-" + i,
          kind: "task",
          text: "Task " + i,
        }),
      );
    for (let i = 0; i < 3; i++) await repo.setPinned(captures[i].taskId!, true);
    const receipt = await repo.removeEntry(captures[0].entryId);
    assert.equal((await repo.readSnapshot()).tasks.length, 3);
    await assert.rejects(repo.completeTask(captures[0].taskId!), /not found/);
    await repo.setPinned(captures[3].taskId!, true);
    await repo.restoreEntry(receipt);
    const snapshot = await repo.readSnapshot();
    assert.equal(snapshot.tasks.length, 4);
    assert.equal(snapshot.tasks.filter((t) => t.pinned).length, 4);
    assert.equal(snapshot.tasks[0].status, "pending");
    assert.equal(snapshot.tasks[0].pinned, true);
  } finally {
    db.close();
  }
});

test("failed removal rolls back hidden state, pin and Today selection and Undo can retry", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const repo = createRepository(sqliteDriver(db));
    const note = await repo.saveCapture({
      requestId: "remove-fail",
      kind: "note",
      text: "Keep selected",
    });
    await repo.chooseTodayNote(note.entryId);
    const before = await repo.readSnapshot();
    db.exec(
      "CREATE TRIGGER fail_remove BEFORE DELETE ON today_selection BEGIN SELECT RAISE(ABORT,'Remove failed'); END;",
    );
    await assert.rejects(repo.removeEntry(note.entryId), /Remove failed/);
    assert.deepEqual(await repo.readSnapshot(), before);
    db.exec("DROP TRIGGER fail_remove;");
    const receipt = await repo.removeEntry(note.entryId);
    db.exec(
      "CREATE TRIGGER fail_restore BEFORE UPDATE OF removed_at ON entries WHEN NEW.removed_at IS NULL BEGIN SELECT RAISE(ABORT,'Restore failed'); END;",
    );
    await assert.rejects(repo.restoreEntry(receipt), /Restore failed/);
    assert.equal((await repo.readSnapshot()).entries[0].removed, true);
    db.exec("DROP TRIGGER fail_restore;");
    await repo.restoreEntry(receipt);
    assert.equal((await repo.readSnapshot()).chosenEntryId, note.entryId);
  } finally {
    db.close();
  }
});

test("reopen preserves identity, words and links, clears completion and never repins", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const repo = createRepository(sqliteDriver(db));
    const source = await repo.saveCapture({
      requestId: "reopen-source",
      kind: "note",
      text: "Source",
    });
    const task = await repo.saveDerivedTask({
      requestId: "reopen",
      sourceEntryId: source.entryId,
      text: "Do this",
    });
    await repo.setPinned(task.taskId!, true);
    await repo.setScheduledPin(
      task.taskId!,
      new Date(Date.now() + 3600000).toISOString(),
    );
    await repo.completeTask(task.taskId!);
    const before = (await repo.readSnapshot()).tasks[0];
    assert.ok(before.completedAt);
    db.exec(
      "CREATE TRIGGER fail_reopen BEFORE UPDATE ON tasks WHEN NEW.status='pending' BEGIN SELECT RAISE(ABORT,'reopen failure'); END",
    );
    await assert.rejects(repo.reopenTask(task.taskId!), /reopen failure/);
    assert.deepEqual((await repo.readSnapshot()).tasks[0], before);
    db.exec("DROP TRIGGER fail_reopen");
    await Promise.all([
      repo.reopenTask(task.taskId!),
      repo.reopenTask(task.taskId!),
    ]);
    const snapshot = await createRepository(sqliteDriver(db)).readSnapshot();
    assert.deepEqual(snapshot.tasks[0], {
      ...before,
      status: "pending",
      pinned: false,
      completedAt: null,
    });
    assert.equal(snapshot.entries[1].taskSourceId, source.entryId);
    assert.equal((await repo.readScheduledPins())[0].dueAt, null);
  } finally {
    db.close();
  }
});

test("derived tasks preserve source-at-creation, retry safely and remain independent after edit/removal", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const repo = createRepository(sqliteDriver(db));
    const source = await repo.saveCapture({
      requestId: "source",
      kind: "note",
      text: "  Original 🌿\n ",
    });
    await repo.editEntry(source.entryId, "  Edited source\n  ");
    const input = {
      requestId: "derived",
      sourceEntryId: source.entryId,
      text: "First action",
    };
    const results = await Promise.all(
      Array.from({ length: 6 }, () => repo.saveDerivedTask(input)),
    );
    assert.ok(results.every((r) => r.taskId === results[0].taskId));
    await assert.rejects(
      repo.saveDerivedTask({ ...input, text: "Changed retry" }),
      /different content/,
    );
    await assert.rejects(
      repo.saveDerivedTask({ ...input, sourceEntryId: "missing" }),
      /different content/,
    );
    const second = await repo.saveDerivedTask({
      ...input,
      requestId: "second",
    });
    await repo.editEntry(source.entryId, "Later source");
    await repo.editEntry(results[0].entryId, "Independent task edit");
    await repo.removeEntry(source.entryId);
    const snapshot = await repo.readSnapshot();
    assert.equal(snapshot.tasks.length, 2);
    assert.equal(snapshot.chosenEntryId, null);
    assert.equal(snapshot.entries[0].originalText, "  Original 🌿\n ");
    assert.equal(snapshot.entries[1].taskSourceText, "  Edited source\n  ");
    assert.equal(snapshot.entries[1].taskSourceId, source.entryId);
    assert.equal(snapshot.tasks[0].title, "Independent task edit");
    await assert.rejects(
      repo.saveDerivedTask({ ...input, requestId: "removed-source" }),
      /not found/,
    );
    await repo.removeEntry(results[0].entryId);
    assert.equal((await repo.readSnapshot()).entries[0].text, "Later source");
    await assert.rejects(
      repo.saveDerivedTask({
        requestId: "task-source",
        sourceEntryId: second.entryId,
        text: "Child task",
      }),
      /Only Notes/,
    );
    // A retry after source removal still resolves the original committed task.
    assert.deepEqual(await repo.saveDerivedTask(input), results[0]);
  } finally {
    db.close();
  }
});

test("derived task link failure rolls back entry and task, then retries with one selection-preserving save", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const repo = createRepository(sqliteDriver(db));
    const source = await repo.saveCapture({
      requestId: "s",
      kind: "note",
      text: "Source",
    });
    const input = {
      requestId: "fail",
      sourceEntryId: source.entryId,
      text: "Task",
    };
    const before = await repo.readSnapshot();
    db.exec(
      "CREATE TRIGGER fail_source BEFORE INSERT ON task_sources BEGIN SELECT RAISE(ABORT,'source failure'); END",
    );
    await assert.rejects(repo.saveDerivedTask(input), /source failure/);
    assert.deepEqual(await repo.readSnapshot(), before);
    db.exec("DROP TRIGGER fail_source");
    await repo.saveDerivedTask(input);
    assert.equal((await repo.readSnapshot()).chosenEntryId, null);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("schema v3 to v4 preserves all historical rows and rolls back an interrupted migration", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      await readFile(
        new URL("./fixtures/schema-v3.sql", import.meta.url),
        "utf8",
      ),
    );
    db.exec(
      "INSERT INTO entries(id,capture_request_id,kind,original_text,created_at,edited_text) VALUES ('s','s','note','Original','2026-10-15','Edited'); INSERT INTO entries(id,capture_request_id,kind,original_text,created_at) VALUES ('t','t','task','Task','2026-10-15'); INSERT INTO tasks VALUES ('task','t','Task','completed',0,'2026-10-15','2026-10-15'); INSERT INTO today_selection VALUES(1,'s');",
    );
    const before = db.prepare("SELECT * FROM entries").all(),
      tasks = db.prepare("SELECT * FROM tasks").all();
    const driver = sqliteDriver(db);
    let fail = true;
    const repo = createRepository({
      ...driver,
      exec: async (sql) => {
        if (fail && sql.includes("CREATE TABLE task_sources")) {
          db.exec("CREATE TABLE interrupted(id TEXT)");
          throw new Error("migration failure");
        }
        await driver.exec(sql);
      },
    });
    await assert.rejects(repo.initialize(), /migration failure/);
    assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 3);
    assert.equal(
      db
        .prepare("SELECT name FROM sqlite_master WHERE name='interrupted'")
        .get(),
      undefined,
    );
    assert.deepEqual(
      db
        .prepare("SELECT * FROM entries")
        .all()
        .map((row) => {
          const { removed_pin_at, removed_pin_order, ...old } = row;
          return Object.assign(Object.create(null), old);
        }),
      before,
    );
    fail = false;
    await repo.initialize();
    assert.deepEqual(
      db
        .prepare("SELECT * FROM entries")
        .all()
        .map((row) => {
          const { removed_pin_at, removed_pin_order, ...old } = row;
          return Object.assign(Object.create(null), old);
        }),
      before,
    );
    assert.deepEqual(
      db
        .prepare(
          "SELECT id,entry_id,title,status,pinned,created_at,completed_at FROM tasks",
        )
        .all(),
      tasks,
    );
    assert.equal((await repo.readSnapshot()).chosenEntryId, "s");
    assert.equal(
      db.prepare("PRAGMA user_version").get()!.user_version,
      SCHEMA_VERSION,
    );
  } finally {
    db.close();
  }
});

test("v4 migration preserves source data and pins, converts outstanding reminders and clears notification intent atomically", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      await readFile(
        new URL("./fixtures/schema-v4.sql", import.meta.url),
        "utf8",
      ),
    );
    db.exec(
      "INSERT INTO entries(id,capture_request_id,kind,original_text,created_at) VALUES ('n','n','note','Source','2026-10-15T00:00:00Z'),('t','t','task','Task','2026-10-15T00:00:01Z'),('done','done','task','Past','2026-10-15T00:00:02Z'); INSERT INTO tasks VALUES ('task','t','Task','pending',1,'2026-10-15T00:00:01Z',NULL),('past','done','Past','pending',0,'2026-10-15T00:00:02Z',NULL); INSERT INTO task_sources VALUES('t','n','Source'); INSERT INTO reminders VALUES('task','2035-01-01T12:00:00Z',1,'denied','denied'),('past','2020-01-01T12:00:00Z',1,'elapsed',NULL);",
    );
    const driver = sqliteDriver(db);
    let fail = true;
    const repo = createRepository({
      ...driver,
      exec: async (sql) => {
        if (fail && sql.includes("CREATE TABLE scheduled_pins")) {
          db.exec("ALTER TABLE tasks ADD COLUMN temporary_failure TEXT");
          throw Error("injected migration");
        }
        await driver.exec(sql);
      },
    });
    await assert.rejects(repo.initialize(), /injected migration/);
    assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 4);
    assert.equal(
      db.prepare("SELECT status FROM reminders WHERE task_id='task'").get()!
        .status,
      "denied",
    );
    assert.equal(
      db
        .prepare("PRAGMA table_info(tasks)")
        .all()
        .some((r) => r.name === "temporary_failure"),
      false,
    );
    fail = false;
    await repo.initialize();
    const snap = await repo.readSnapshot();
    assert.equal(snap.entries[1].taskSourceId, "n");
    assert.equal(snap.tasks[0].pinned, true);
    assert.equal(snap.tasks[0].pinnedAt, "2026-10-15T00:00:01Z");
    assert.deepEqual(await repo.readScheduledPins(), [
      { taskId: "task", dueAt: "2035-01-01T12:00:00Z", status: "cancelled" },
    ]);
    assert.equal(
      db.prepare("SELECT status FROM reminders WHERE task_id='task'").get()!
        .status,
      "cancelled",
    );
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'tasks_pin_limit%'",
        )
        .get()!.n,
      0,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("retired due-pin calls never mutate tasks, including across restart", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    let repo = createRepository(sqliteDriver(db));
    const task = await repo.saveCapture({
      requestId: "old-schedule",
      kind: "task",
      text: "Leave alone",
    });
    await repo.setScheduledPin(task.taskId!, "2099-01-01T00:00:00Z");
    const before = await repo.readSnapshot();
    repo = createRepository(sqliteDriver(db));
    await repo.applyDuePins("2100-01-01T00:00:00Z");
    assert.deepEqual(await repo.readSnapshot(), before);
  } finally {
    db.close();
  }
});

test("historical task-to-task source links survive and are not converted to subtasks", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      await readFile(
        new URL("./fixtures/schema-v6-populated.sql", import.meta.url),
        "utf8",
      ),
    );
    const repo = createRepository(sqliteDriver(db));
    const before = await repo.readSnapshot();
    const child = before.entries.find(
      (e) => e.id === "entry_derived:legacy-task-child",
    )!;
    assert.equal(child.sourceEntryId, "entry_legacy-task");
    assert.equal(
      before.tasks.find((t) => t.entryId === child.id)!.parentTaskId,
      null,
    );
    await repo.completeTask("task_legacy-task");
    await repo.removeEntry("entry_legacy-task");
    await repo.completeTask("task_derived:legacy-task-child");
    await repo.reopenTask("task_derived:legacy-task-child");
    const after = await createRepository(sqliteDriver(db)).readSnapshot();
    assert.equal(
      after.entries.find((e) => e.id === child.id)!.sourceText,
      "Original task",
    );
    assert.equal(
      after.tasks.find((t) => t.entryId === child.id)!.status,
      "pending",
    );
    assert.equal(
      after.tasks.find((t) => t.entryId === child.id)!.parentTaskId,
      null,
    );
  } finally {
    db.close();
  }
});

test("v5 migration changes source validation atomically while preserving existing data", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      await readFile(
        new URL("./fixtures/schema-v5.sql", import.meta.url),
        "utf8",
      ),
    );
    db.exec(
      "INSERT INTO entries(id,capture_request_id,kind,original_text,created_at) VALUES ('p','p','task','Parent','2026-10-15'); INSERT INTO tasks(id,entry_id,title,status,pinned,created_at,completed_at) VALUES('p','p','Parent','pending',0,'2026-10-15',NULL)",
    );
    const driver = sqliteDriver(db);
    let fail = true;
    const repo = createRepository({
      ...driver,
      exec: async (sql) => {
        if (fail && sql.includes("DROP TRIGGER task_sources_require_kinds")) {
          db.exec("DROP TRIGGER task_sources_require_kinds");
          throw Error("migration failed");
        }
        await driver.exec(sql);
      },
    });
    await assert.rejects(repo.initialize(), /migration failed/);
    assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 5);
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE name='task_sources_require_kinds'",
        )
        .get()!.n,
      1,
    );
    fail = false;
    await repo.initialize();
    await assert.rejects(
      repo.saveDerivedTask({
        requestId: "c",
        sourceEntryId: "p",
        text: "Child",
      }),
      /Only Notes/,
    );
    assert.equal((await repo.readSnapshot()).tasks.length, 1);
    assert.equal(
      db.prepare("PRAGMA user_version").get()!.user_version,
      SCHEMA_VERSION,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("populated v6 upgrade preserves all historical tables and parks schedules atomically", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      await readFile(
        new URL("./fixtures/schema-v6-populated.sql", import.meta.url),
        "utf8",
      ),
    );
    const tables = [
      "entries",
      "tasks",
      "thinking_links",
      "task_sources",
      "today_selection",
      "reminders",
    ];
    const original = tables.map((table) =>
      db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    );
    const schedules = db.prepare("SELECT * FROM scheduled_pins").all();
    const driver = sqliteDriver(db);
    let fail = true;
    const repo = createRepository({
      ...driver,
      async exec(sql) {
        await driver.exec(sql);
        if (fail && sql.includes("CREATE TABLE entry_sources"))
          throw Error("Migration interrupted");
      },
    });
    await assert.rejects(repo.initialize(), /Migration interrupted/);
    assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 6);
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS n FROM sqlite_master WHERE name='entry_sources'",
        )
        .get()!.n,
      0,
    );
    assert.deepEqual(
      db.prepare("SELECT * FROM scheduled_pins").all(),
      schedules,
    );
    fail = false;
    const snapshot = await repo.readSnapshot();
    tables.forEach((table, i) =>
      assert.deepEqual(
        db
          .prepare(`SELECT * FROM ${table} ORDER BY rowid`)
          .all()
          .map((row) => {
            const { parent_task_id, ...old } = row;
            return Object.assign(Object.create(null), old);
          }),
        original[i],
        table,
      ),
    );
    assert.equal(snapshot.entries.length, 6);
    assert.equal(
      snapshot.entries.filter((e) => e.thinkingKind !== null).length,
      2,
    );
    assert.equal(
      snapshot.entries.find((e) => e.id === "entry_legacy-note")!.text,
      "Edited legacy note",
    );
    assert.equal(
      snapshot.entries.find((e) => e.id === "entry_legacy-note")!.removed,
      true,
    );
    assert.equal(
      snapshot.entries.find((e) => e.id === "entry_derived:legacy-derived")!
        .sourceText,
      "Edited legacy note",
    );
    assert.equal(
      snapshot.tasks.find((t) => t.id === "task_derived:legacy-derived")!
        .status,
      "completed",
    );
    assert.deepEqual(
      db.prepare("SELECT * FROM scheduled_pins").all(),
      schedules.map((row) =>
        Object.assign(Object.create(null), row, { status: "cancelled" }),
      ),
    );
    await repo.applyDuePins("2100-01-01T00:00:00Z");
    assert.deepEqual(await repo.readSnapshot(), snapshot);
    assert.deepEqual(
      await createRepository(sqliteDriver(db)).readSnapshot(),
      snapshot,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("Note-to-Note and Note-to-Task links preserve independent words and source snapshots through reopen", async () => {
  const dir = await mkdtemp(join(tmpdir(), "noeting-links-")),
    file = join(dir, "db.sqlite");
  let db = new DatabaseSync(file);
  try {
    let repo = createRepository(sqliteDriver(db));
    for (const sourceKind of ["note"] as const) {
      const source = await repo.saveCapture({
        requestId: `parent-${sourceKind}`,
        kind: sourceKind,
        text: `Original ${sourceKind}`,
      });
      await repo.editEntry(source.entryId, `Edited ${sourceKind}`);
      for (const kind of ["note", "task"] as const) {
        const input = {
          requestId: `${sourceKind}-${kind}`,
          sourceEntryId: source.entryId,
          kind,
          text: `  Independent ${kind}\n🌿  `,
        };
        const results = await Promise.all(
          Array.from({ length: 4 }, () => repo.saveLinkedEntry(input)),
        );
        assert.ok(
          results.every((result) => result.entryId === results[0].entryId),
        );
        await assert.rejects(
          repo.saveLinkedEntry({ ...input, text: "Changed" }),
          /different content or source/,
        );
        await assert.rejects(
          repo.saveLinkedEntry({
            ...input,
            kind: kind === "note" ? "task" : "note",
          }),
          /different content or source/,
        );
        await assert.rejects(
          repo.saveLinkedEntry({ ...input, sourceEntryId: "absent" }),
          /different content or source/,
        );
        const child = (await repo.readSnapshot()).entries.find(
          (e) => e.id === results[0].entryId,
        )!;
        assert.equal(child.sourceText, `Edited ${sourceKind}`);
        assert.equal(child.sourceEntryId, source.entryId);
        assert.equal(child.thinkingKind, null);
        await repo.editEntry(child.id, "Child edited");
        if (results[0].taskId) {
          await repo.completeTask(results[0].taskId!);
          await repo.reopenTask(results[0].taskId!);
        }
        assert.deepEqual(await repo.saveLinkedEntry(input), results[0]);
      }
      if (source.taskId) await repo.completeTask(source.taskId);
      await repo.editEntry(source.entryId, "Later parent");
      await repo.removeEntry(source.entryId);
      const children = (await repo.readSnapshot()).entries.filter(
        (e) => e.sourceEntryId === source.entryId,
      );
      assert.equal(children.length, 2);
      assert.ok(
        children.every(
          (e) => !e.removed && e.sourceText === `Edited ${sourceKind}`,
        ),
      );
      const childTask = (await repo.readSnapshot()).tasks.find(
        (t) => t.entryId === children.find((e) => e.kind === "task")!.id,
      )!;
      assert.equal(childTask.status, "pending");
      await assert.rejects(
        repo.saveLinkedEntry({
          requestId: `removed-${sourceKind}`,
          sourceEntryId: source.entryId,
          kind: "note",
          text: "No",
        }),
        /not found/,
      );
      const retry = await repo.saveLinkedEntry({
        requestId: `${sourceKind}-note`,
        sourceEntryId: source.entryId,
        kind: "note",
        text: "  Independent note\n🌿  ",
      });
      assert.equal(retry.entryId, children.find((e) => e.kind === "note")!.id);
    }
    const before = await repo.readSnapshot();
    db.close();
    db = new DatabaseSync(file);
    repo = createRepository(sqliteDriver(db));
    assert.deepEqual(await repo.readSnapshot(), before);
    assert.equal(before.entries.length, 3);
    assert.equal(before.chosenEntryId, null);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("generic linked saves roll back source, entry and task together and retry without duplicates", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const repo = createRepository(sqliteDriver(db));
    const parent = await repo.saveCapture({
      requestId: "source",
      kind: "note",
      text: "Parent",
    });
    const before = await repo.readSnapshot();
    db.exec(
      "CREATE TRIGGER fail_generic BEFORE INSERT ON entry_sources BEGIN SELECT RAISE(ABORT,'Link failed'); END;",
    );
    for (const kind of ["note", "task"] as const)
      await assert.rejects(
        repo.saveLinkedEntry({
          requestId: kind,
          sourceEntryId: parent.entryId,
          kind,
          text: "Keep my words",
        }),
        /Link failed/,
      );
    assert.deepEqual(await repo.readSnapshot(), before);
    db.exec("DROP TRIGGER fail_generic");
    for (const kind of ["note", "task"] as const) {
      const input = {
        requestId: kind,
        sourceEntryId: parent.entryId,
        kind,
        text: "Keep my words",
      };
      const saved = await repo.saveLinkedEntry(input);
      assert.deepEqual(await repo.saveLinkedEntry(input), saved);
      // A standalone request must not accidentally claim a linked record.
      await assert.rejects(
        repo.saveCapture({
          requestId: `entry-link:${kind}`,
          kind,
          text: input.text,
        }),
        /linked entry/,
      );
    }
    assert.equal((await repo.readSnapshot()).entries.length, 3);
    assert.equal((await repo.readSnapshot()).tasks.length, 1);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("new Task-originating links are rejected by every repository write path without changing data", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const repo = createRepository(sqliteDriver(db));
    const source = await repo.saveCapture({
      requestId: "task-source",
      kind: "task",
      text: "No generic children",
    });
    const before = await repo.readSnapshot();
    for (const kind of ["note", "task"] as const)
      await assert.rejects(
        repo.saveLinkedEntry({
          requestId: kind,
          sourceEntryId: source.entryId,
          kind,
          text: "Forbidden",
        }),
        /Only Notes/,
      );
    await assert.rejects(
      repo.saveDerivedTask({
        requestId: "old-derived",
        sourceEntryId: source.entryId,
        text: "Forbidden",
      }),
      /Only Notes/,
    );
    await assert.rejects(
      repo.saveLinked({
        requestId: "old-thinking",
        sourceEntryId: source.entryId,
        kind: "reflection",
        text: "Forbidden",
      }),
      /Only Notes/,
    );
    assert.deepEqual(await repo.readSnapshot(), before);
  } finally {
    db.close();
  }
});

test("populated v7-to-v8 upgrade preserves every old column and legacy pointer; interrupted migration rolls back", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      await readFile(
        new URL("./fixtures/schema-v7-populated.sql", import.meta.url),
        "utf8",
      ),
    );
    const tables = [
      "entries",
      "tasks",
      "thinking_links",
      "task_sources",
      "entry_sources",
      "today_selection",
      "reminders",
      "scheduled_pins",
    ];
    const before = tables.map((table) =>
      db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    );
    const driver = sqliteDriver(db);
    let fail = true;
    const repo = createRepository({
      ...driver,
      async exec(sql) {
        await driver.exec(sql);
        if (fail && sql.includes("ALTER TABLE tasks ADD COLUMN parent_task_id"))
          throw Error("v8 interrupted");
      },
    });
    await assert.rejects(repo.initialize(), /v8 interrupted/);
    assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 7);
    assert.equal(
      db
        .prepare("PRAGMA table_info(tasks)")
        .all()
        .some((row) => row.name === "parent_task_id"),
      false,
    );
    fail = false;
    const snapshot = await repo.readSnapshot();
    tables.forEach((table, i) => {
      const actual = db
        .prepare(`SELECT * FROM ${table} ORDER BY rowid`)
        .all()
        .map((row) => {
          const { parent_task_id, ...old } = row;
          return Object.assign(Object.create(null), old);
        });
      assert.deepEqual(actual, before[i], table);
    });
    assert.ok(snapshot.tasks.every((task) => task.parentTaskId === null));
    assert.equal(
      snapshot.entries.find(
        (entry) => entry.id === "entry_entry-link:v7-task-note",
      )!.sourceEntryId,
      "entry_entry-link:v7-note-task",
    );
    assert.equal(
      snapshot.entries.find(
        (entry) => entry.id === "entry_entry-link:v7-note-task",
      )!.sourceText,
      "V7 note edited",
    );
    assert.deepEqual(
      await createRepository(sqliteDriver(db)).readSnapshot(),
      snapshot,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("subtask save is atomic, retry-safe and isolated from every source-link table", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const repo = createRepository(sqliteDriver(db));
    const parent = await repo.saveCapture({
      requestId: "parent",
      kind: "task",
      text: "Parent",
    });
    const other = await repo.saveCapture({
      requestId: "other",
      kind: "task",
      text: "Other",
    });
    const input = {
      requestId: "child",
      parentTaskId: parent.taskId!,
      text: "  Child original\n🌿  ",
    };
    const before = await repo.readSnapshot();
    db.exec(
      "CREATE TRIGGER fail_subtask BEFORE INSERT ON tasks WHEN NEW.parent_task_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'subtask interrupted'); END;",
    );
    await assert.rejects(repo.saveSubtask(input), /subtask interrupted/);
    assert.deepEqual(await repo.readSnapshot(), before);
    db.exec("DROP TRIGGER fail_subtask");
    const results = await Promise.all(
      Array.from({ length: 8 }, () => repo.saveSubtask(input)),
    );
    assert.ok(results.every((result) => result.taskId === results[0].taskId));
    await assert.rejects(
      repo.saveSubtask({ ...input, text: "Changed" }),
      /different content or parent/,
    );
    await assert.rejects(
      repo.saveSubtask({ ...input, parentTaskId: other.taskId! }),
      /different content or parent/,
    );
    await assert.rejects(
      repo.saveCapture({
        requestId: "subtask:child",
        kind: "task",
        text: input.text,
      }),
      /Subtask/,
    );
    await assert.rejects(
      repo.saveCapture({
        requestId: "subtask:child",
        kind: "note",
        text: input.text,
      }),
      /different content/,
    );
    const snapshot = await repo.readSnapshot();
    assert.equal(snapshot.tasks.length, 3);
    const child = snapshot.tasks.find((task) => task.id === results[0].taskId)!;
    assert.equal(child.parentTaskId, parent.taskId);
    assert.equal(child.parentText, "Parent");
    for (const table of ["entry_sources", "task_sources", "thinking_links"])
      assert.equal(
        db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n,
        0,
      );
    await repo.removeEntry(parent.entryId);
    assert.deepEqual(await repo.saveSubtask(input), results[0]);
  } finally {
    db.close();
  }
});

test("one-level Task ownership rejects missing, removed, cross-kind, self and recursive parents", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const repo = createRepository(sqliteDriver(db));
    const note = await repo.saveCapture({
      requestId: "note",
      kind: "note",
      text: "Note",
    });
    const parent = await repo.saveCapture({
      requestId: "root",
      kind: "task",
      text: "Root",
    });
    const other = await repo.saveCapture({
      requestId: "other",
      kind: "task",
      text: "Other root",
    });
    const child = await repo.saveSubtask({
      requestId: "child",
      parentTaskId: parent.taskId!,
      text: "Child",
    });
    for (const invalid of ["absent", note.entryId, child.taskId!])
      await assert.rejects(
        repo.saveSubtask({
          requestId: invalid,
          parentTaskId: invalid,
          text: "No",
        }),
        /top-level Task parent/,
      );
    assert.throws(
      () =>
        db
          .prepare("UPDATE tasks SET parent_task_id=? WHERE id=?")
          .run(parent.taskId, parent.taskId),
      /top-level Task parent/,
    );
    assert.throws(
      () =>
        db
          .prepare("UPDATE tasks SET parent_task_id=? WHERE id=?")
          .run(child.taskId, other.taskId),
      /top-level Task parent/,
    );
    assert.throws(
      () =>
        db
          .prepare("UPDATE tasks SET parent_task_id=? WHERE id=?")
          .run(other.taskId, parent.taskId),
      /top-level Task parent/,
    );
    assert.throws(
      () =>
        db
          .prepare("UPDATE tasks SET entry_id=? WHERE id=?")
          .run(note.entryId, child.taskId),
      /Task entry/,
    );
    await repo.removeEntry(parent.entryId);
    await assert.rejects(
      repo.saveSubtask({
        requestId: "removed",
        parentTaskId: parent.taskId!,
        text: "No",
      }),
      /top-level Task parent/,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("Note-linked Task and its Subtasks survive restart, synchronized state, parent removal and Undo", async () => {
  const dir = await mkdtemp(join(tmpdir(), "noeting-subtasks-")),
    file = join(dir, "db.sqlite");
  let db = new DatabaseSync(file);
  try {
    let repo = createRepository(sqliteDriver(db));
    const note = await repo.saveCapture({
      requestId: "note",
      kind: "note",
      text: "Note original",
    });
    const parent = await repo.saveLinkedEntry({
      requestId: "root",
      kind: "task",
      sourceEntryId: note.entryId,
      text: "Build prototype",
    });
    const a = await repo.saveSubtask({
      requestId: "a",
      parentTaskId: parent.taskId!,
      text: "Paper sketch",
    });
    const b = await repo.saveSubtask({
      requestId: "b",
      parentTaskId: parent.taskId!,
      text: "Write code",
    });
    await repo.completeTask(a.taskId!);
    await repo.editEntry(b.entryId, "Implement offline");
    await repo.completeTask(parent.taskId!);
    await repo.editEntry(note.entryId, "Later note");
    await repo.removeEntry(note.entryId);
    const before = await repo.readSnapshot();
    assert.equal(
      before.tasks.find((t) => t.id === b.taskId)!.status,
      "completed",
    );
    const removedParent = await repo.removeEntry(parent.entryId);
    let snapshot = await repo.readSnapshot();
    assert.equal(snapshot.tasks.length, 2);
    assert.ok(snapshot.tasks.every((t) => t.parentRemoved));
    const { visibleEntries } = await import("../src/data/selectors");
    assert.equal(visibleEntries(snapshot, "task", "").length, 2);
    assert.equal(visibleEntries(snapshot, "task", "offline")[0].id, b.entryId);
    await repo.editEntry(b.entryId, "Still editable");
    await repo.reopenTask(a.taskId!);
    await repo.restoreEntry(removedParent);
    const removedChild = await repo.removeEntry(a.entryId);
    await repo.restoreEntry(removedChild);
    snapshot = await repo.readSnapshot();
    assert.equal(visibleEntries(snapshot, "task", "").length, 1);
    assert.equal(
      snapshot.tasks.find((t) => t.id === parent.taskId)!.status,
      "pending",
    );
    assert.equal(
      snapshot.tasks.find((t) => t.id === a.taskId)!.status,
      "pending",
    );
    assert.equal(
      snapshot.entries.find((e) => e.id === parent.entryId)!.sourceText,
      "Note original",
    );
    assert.equal(
      snapshot.tasks.find((t) => t.id === parent.taskId)!.parentTaskId,
      null,
    );
    db.close();
    db = new DatabaseSync(file);
    repo = createRepository(sqliteDriver(db));
    assert.deepEqual(await repo.readSnapshot(), snapshot);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

for (const version of [6, 7, 8])
  test(`v${version} to v9 interruption preserves legacy columns and retry adds Note-only organization`, async () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(
        await readFile(
          join(
            process.cwd(),
            `tests/fixtures/schema-v${version}-populated.sql`,
          ),
          "utf8",
        ),
      );
      const tables = [
        "entries",
        "tasks",
        "thinking_links",
        "task_sources",
        ...(version >= 7 ? ["entry_sources"] : []),
      ];
      const old = new Map(
        tables.map((t) => [
          t,
          db
            .prepare(
              `SELECT * FROM ${t} ORDER BY id`.replace(
                "ORDER BY id",
                t.includes("sources") || t === "thinking_links"
                  ? "ORDER BY entry_id"
                  : "ORDER BY id",
              ),
            )
            .all(),
        ]),
      );
      const base = sqliteDriver(db);
      let failed = false;
      const repo = createRepository({
        ...base,
        async exec(sql) {
          if (sql.includes("CREATE TABLE note_folders") && !failed) {
            failed = true;
            await base.exec(sql.split("CREATE INDEX note_organization")[0]);
            throw Error("migration interrupted");
          }
          await base.exec(sql);
        },
      });
      await assert.rejects(repo.initialize(), /interrupted/);
      assert.equal(
        db.prepare("PRAGMA user_version").get()!.user_version,
        version,
      );
      assert.equal(
        db
          .prepare("SELECT name FROM sqlite_master WHERE name='note_folders'")
          .get(),
        undefined,
      );
      await repo.initialize();
      assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 9);
      for (const [table, rows] of old) {
        const cols = Object.keys(rows[0] ?? {});
        if (cols.length)
          assert.deepEqual(
            db
              .prepare(
                `SELECT ${cols.join(",")} FROM ${table} ORDER BY ${table.includes("sources") || table === "thinking_links" ? "entry_id" : "id"}`,
              )
              .all(),
            rows,
          );
      }
      const task = (await repo.readSnapshot()).tasks[0];
      if (task)
        assert.throws(
          () =>
            db
              .prepare("INSERT INTO note_organization(entry_id) VALUES (?)")
              .run(task.entryId),
          /Only Notes/,
        );
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      db.close();
    }
  });

test("folders, scoped ordering, Note pins, bulk move/remove/recovery and failures are atomic and durable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "noeting-organization-"));
  const path = join(dir, "db");
  let db = new DatabaseSync(path);
  try {
    let r = createRepository(sqliteDriver(db));
    const a = await r.saveCapture({
      kind: "note",
      text: "Alpha exact 🌿\n  words ",
      requestId: "a",
    });
    const b = await r.saveLinkedEntry({
      kind: "note",
      text: "Beta",
      sourceEntryId: a.entryId,
      requestId: "b",
    });
    const c = await r.saveCapture({
      kind: "note",
      text: "Gamma",
      requestId: "c",
    });
    const t = await r.saveCapture({
      kind: "task",
      text: "Legacy Task",
      requestId: "t",
    });
    await r.setPinned(t.taskId!, true);
    await r.createFolder("f", "  Ideas  ");
    await r.createFolder("f", "Ideas");
    await assert.rejects(r.createFolder("collision", "IDEAS"));
    await assert.rejects(r.renameFolder("f", "  "));
    await r.createFolder("g", "Work");
    await assert.rejects(r.renameFolder("g", "ideas"));
    await r.renameFolder("f", "Thoughts");
    await r.organizeNotes([a.entryId], { pinned: true, folderId: "f" });
    const pinned = (await r.readSnapshot()).entries.find(
      (e) => e.id === a.entryId,
    )!.notePinnedAt;
    await r.organizeNotes([a.entryId, b.entryId], { pinned: true });
    await r.organizeNotes([a.entryId, b.entryId], { folderId: "f" });
    await r.editEntry(a.entryId, "Alpha edited");
    let snap = await r.readSnapshot();
    assert.equal(
      snap.entries.find((e) => e.id === a.entryId)!.notePinnedAt,
      pinned,
    );
    assert.equal(
      snap.entries.find((e) => e.id === a.entryId)!.originalText,
      "Alpha exact 🌿\n  words ",
    );
    assert.equal(snap.tasks[0].pinned, true);
    const { visibleEntries } = await import("../src/data/selectors");
    assert.deepEqual(
      visibleEntries(snap, "note", "Beta", "f").map((e) => e.id),
      [b.entryId],
    );
    assert.equal(visibleEntries(snap, "note", "Alpha", "unfiled").length, 0);
    assert.equal(visibleEntries(snap, "note", "")[2].id, c.entryId);
    const before = await r.readSnapshot();
    db.exec(
      `CREATE TRIGGER fail_org BEFORE UPDATE ON note_organization WHEN NEW.entry_id='${b.entryId}' BEGIN SELECT RAISE(ABORT,'bulk failed'); END;`,
    );
    await assert.rejects(
      r.organizeNotes([a.entryId, b.entryId], { pinned: false, folderId: "g" }),
      /bulk failed/,
    );
    assert.deepEqual(await r.readSnapshot(), before);
    db.exec("DROP TRIGGER fail_org");
    await r.organizeNotes([a.entryId, b.entryId], { pinned: false });
    assert.ok(
      (await r.readSnapshot()).entries
        .filter((e) => e.kind === "note")
        .every((e) => !e.notePinnedAt),
    );
    await r.organizeNotes([a.entryId, b.entryId], { pinned: true });
    db.exec(
      `CREATE TRIGGER fail_remove BEFORE UPDATE OF removed_at ON entries WHEN NEW.id='${b.entryId}' BEGIN SELECT RAISE(ABORT,'remove failed'); END;`,
    );
    const preRemove = await r.readSnapshot();
    await assert.rejects(
      r.removeNotes([a.entryId, b.entryId]),
      /remove failed/,
    );
    assert.deepEqual(await r.readSnapshot(), preRemove);
    db.exec("DROP TRIGGER fail_remove");
    const receipts = await r.removeNotes([a.entryId, b.entryId]);
    assert.equal(
      visibleEntries(await r.readSnapshot(), "note", "", "all", true).length,
      2,
    );
    db.exec(
      `CREATE TRIGGER fail_restore BEFORE UPDATE OF removed_at ON entries WHEN NEW.id='${b.entryId}' BEGIN SELECT RAISE(ABORT,'restore failed'); END;`,
    );
    await assert.rejects(r.restoreNotes(receipts));
    assert.equal(
      visibleEntries(await r.readSnapshot(), "note", "", "all", true).length,
      2,
    );
    db.exec("DROP TRIGGER fail_restore");
    await r.restoreNotes(receipts);
    await r.restoreNotes(receipts);
    await assert.rejects(
      r.organizeNotes([a.entryId, t.entryId], { pinned: false }),
    );
    await r.removeFolder("f");
    snap = await r.readSnapshot();
    assert.ok(
      snap.entries.filter((e) => e.kind === "note").every((e) => !e.folderId),
    );
    assert.equal(
      snap.entries.find((e) => e.id === b.entryId)!.sourceEntryId,
      a.entryId,
    );
    assert.ok(snap.entries.find((e) => e.id === a.entryId)!.notePinnedAt);
    db.close();
    db = new DatabaseSync(path);
    r = createRepository(sqliteDriver(db));
    assert.deepEqual(await r.readSnapshot(), snap);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("capture and linked Notes stay in their chosen folder, atomically across retries", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const r = createRepository(sqliteDriver(db));
    await r.createFolder("work", "Work");
    const note = await r.saveCapture({
      kind: "note", text: "Folder capture", requestId: "folder-capture", folderId: "work",
    });
    const linked = await r.saveLinkedEntry({
      kind: "note", text: "Folder child", requestId: "folder-child",
      sourceEntryId: note.entryId, folderId: "work",
    });
    let snapshot = await r.readSnapshot();
    assert.equal(snapshot.entries.find((e) => e.id === note.entryId)?.folderId, "work");
    assert.equal(snapshot.entries.find((e) => e.id === linked.entryId)?.folderId, "work");
    assert.deepEqual(
      await r.saveCapture({
        kind: "note", text: "Folder capture", requestId: "folder-capture", folderId: "work",
      }),
      note,
    );
    await assert.rejects(
      r.saveCapture({
        kind: "note", text: "Invalid destination", requestId: "invalid-folder", folderId: "missing",
      }),
    );
    await assert.rejects(
      r.saveLinkedEntry({
        kind: "note", text: "Invalid linked destination", requestId: "invalid-link",
        sourceEntryId: note.entryId, folderId: "missing",
      }),
    );
    await assert.rejects(
      r.saveCapture({
        kind: "task", text: "No task folders", requestId: "invalid-task", folderId: "work",
      }),
    );
    snapshot = await r.readSnapshot();
    assert.equal(snapshot.entries.length, 2);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    await r.removeFolder("work");
    assert.equal((await r.readSnapshot()).entries.filter((e) => e.folderId).length, 0);
  } finally {
    db.close();
  }
});

for (const count of [1, 2, 3])
  test(`${count} children: synchronized completion, timestamp stability, removal/restore, retries and halfway rollback`, async () => {
    const db = new DatabaseSync(":memory:");
    try {
      const r = createRepository(sqliteDriver(db));
      const parent = await r.saveCapture({
        kind: "task",
        text: "Parent",
        requestId: "p",
      });
      const kids = [];
      for (let i = 0; i < count; i++)
        kids.push(
          await r.saveSubtask({
            parentTaskId: parent.taskId!,
            text: "Child " + i,
            requestId: "c" + i,
          }),
        );
      const status = async (id: string) =>
        (await r.readSnapshot()).tasks.find((t) => t.id === id)!;
      for (let i = 0; i < count; i++) {
        await r.completeTask(kids[i].taskId!);
        assert.equal(
          (await status(parent.taskId!)).status,
          i === count - 1 ? "completed" : "pending",
        );
      }
      const firstAt = (await status(kids[0].taskId!)).completedAt;
      await r.completeTask(parent.taskId!);
      assert.equal((await status(kids[0].taskId!)).completedAt, firstAt);
      await r.reopenTask(kids[0].taskId!);
      assert.equal((await status(parent.taskId!)).status, "pending");
      await r.completeTask(parent.taskId!);
      assert.ok(
        (await r.readSnapshot()).tasks.every((t) => t.status === "completed"),
      );
      await r.reopenTask(parent.taskId!);
      assert.ok(
        (await r.readSnapshot()).tasks.every((t) => t.status === "pending"),
      );
      const before = await r.readSnapshot();
      db.exec(
        `CREATE TRIGGER fail_transition BEFORE UPDATE OF status ON tasks WHEN NEW.id='${kids[0].taskId}' BEGIN SELECT RAISE(ABORT,'transition interrupted'); END;`,
      );
      await assert.rejects(r.completeTask(parent.taskId!), /interrupted/);
      assert.deepEqual(await r.readSnapshot(), before);
      db.exec("DROP TRIGGER fail_transition");
      await Promise.all([
        r.completeTask(parent.taskId!),
        r.completeTask(parent.taskId!),
      ]);
      const extra = await r.saveSubtask({
        parentTaskId: parent.taskId!,
        text: "Extra",
        requestId: "extra",
      });
      assert.equal((await status(parent.taskId!)).status, "pending");
      const receipt = await r.removeEntry(extra.entryId);
      assert.equal((await status(parent.taskId!)).status, "completed");
      await r.restoreEntry(receipt);
      assert.equal((await status(parent.taskId!)).status, "pending");
      const removedParent = await r.removeEntry(parent.entryId);
      const oldParent = db
        .prepare("SELECT status,completed_at FROM tasks WHERE id=?")
        .get(parent.taskId!);
      await r.completeTask(extra.taskId!);
      assert.deepEqual(
        db
          .prepare("SELECT status,completed_at FROM tasks WHERE id=?")
          .get(parent.taskId!),
        oldParent,
      );
      await r.restoreEntry(removedParent);
      assert.equal((await status(parent.taskId!)).status, "completed");
      const all = [...kids, extra];
      for (const child of all) await r.removeEntry(child.entryId);
      assert.equal((await status(parent.taskId!)).status, "completed");
      await r.reopenTask(parent.taskId!);
      assert.equal((await status(parent.taskId!)).status, "pending");
    } finally {
      db.close();
    }
  });

test("large snapshot groups child search once and sorts pins deterministically without row reads", async () => {
  const { indexSnapshot, visibleEntries, matchingChildren } = await import(
    "../src/data/selectors"
  );
  const entries: any[] = [];
  const tasks: any[] = [];
  for (let i = 0; i < 3000; i++) {
    entries.push({
      id: "n" + i,
      kind: "note",
      text: "Note " + i,
      removed: false,
      createdAt: "2026-01-01",
      notePinnedAt: i % 5 === 0 ? "2026-02-01" : null,
    });
    if (i < 1000) {
      entries.push(
        {
          id: "p" + i,
          kind: "task",
          text: "Parent " + i,
          removed: false,
          createdAt: "2026-01-01",
        },
        {
          id: "c" + i,
          kind: "task",
          text: "needle " + i,
          removed: false,
          createdAt: "2026-01-01",
        },
      );
      tasks.push(
        {
          id: "pt" + i,
          entryId: "p" + i,
          title: "Parent " + i,
          parentTaskId: null,
          status: "pending",
        },
        {
          id: "ct" + i,
          entryId: "c" + i,
          title: "needle " + i,
          parentTaskId: "pt" + i,
          status: "pending",
        },
      );
    }
  }
  const snapshot = { entries, tasks, chosenEntryId: null };
  const indexed = indexSnapshot(snapshot);
  assert.equal(indexed.children.size, 1000);
  const found = visibleEntries(snapshot, "task", "needle 999");
  assert.equal(found.length, 1);
  assert.equal(found[0].id, "p999");
  assert.equal(
    matchingChildren(found[0], indexed.children.get("pt999")!, "needle 999")
      .length,
    1,
  );
  const notes = visibleEntries(snapshot, "note", "");
  assert.equal(notes.length, 3000);
  assert.ok(notes.slice(0, 600).every((e) => e.notePinnedAt));
  assert.deepEqual(
    notes.map((e) => e.id),
    visibleEntries(snapshot, "note", "").map((e) => e.id),
  );
});
