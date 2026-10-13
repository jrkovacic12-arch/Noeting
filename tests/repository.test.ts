import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createRepository, SCHEMA_VERSION, type SQLiteDriver } from '../src/data/repository';

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

test('real SQLite data, exact text, completion and pins survive closing and reopening the file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'noeting-sqlite-'));
  const filename = join(directory, 'noeting.db');
  let database = new DatabaseSync(filename);
  try {
    const repository = createRepository(sqliteDriver(database));
    await repository.initialize();
    const originalText = '  A thought\nwith a second line. 🌿  ';
    const note = await repository.saveCapture({ requestId: 'note-1', kind: 'note', text: originalText });
    assert.equal(note.taskId, null);
    const task = await repository.saveCapture({ requestId: 'task-1', kind: 'task', text: '  Pay the bill  ' });
    const secondTask = await repository.saveCapture({ requestId: 'task-2', kind: 'task', text: 'Take a walk' });
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
    assert.equal(after.entries[1].originalText, '  Pay the bill  ');
    assert.equal(after.tasks[0].title, 'Pay the bill');
    assert.equal(after.tasks[0].status, 'completed');
    assert.equal(after.tasks[0].pinned, false);
    assert.ok(after.tasks[0].completedAt);
    assert.equal(after.tasks[1].pinned, true);
    assert.equal(after.tasks[1].status, 'pending');
    assert.equal(after.tasks[1].completedAt, null);
    assert.deepEqual(
      await reopened.saveCapture({ requestId: 'task-1', kind: 'task', text: '  Pay the bill  ' }),
      task,
    );
    assert.deepEqual(await reopened.readSnapshot(), after);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('capture is idempotent for concurrent retries and rejects changed request content', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    const repository = createRepository(sqliteDriver(database));
    const input = { requestId: 'same-request', kind: 'task' as const, text: '  Buy groceries\n  ' };
    const results = await Promise.all(Array.from({ length: 8 }, () => repository.saveCapture(input)));
    assert.ok(results.every((result) => result.entryId === results[0].entryId && result.taskId === results[0].taskId));
    assert.equal((await repository.readSnapshot()).entries.length, 1);
    assert.equal((await repository.readSnapshot()).tasks.length, 1);
    await assert.rejects(repository.saveCapture({ ...input, text: input.text.trim() }), /different content/);
    await assert.rejects(repository.saveCapture({ ...input, kind: 'note' }), /different content/);
    assert.equal((await repository.readSnapshot()).tasks.length, 1);
    // Identical text in a distinct deliberate capture remains a distinct record.
    await repository.saveCapture({ ...input, requestId: 'different-request' });
    assert.equal((await repository.readSnapshot()).tasks.length, 2);
  } finally {
    database.close();
  }
});

test('failed linked-task insert rolls back the entry and the same request can safely retry', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    const repository = createRepository(sqliteDriver(database));
    await repository.initialize();
    database.exec("CREATE TRIGGER simulate_task_failure BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'Injected write failure'); END;");
    const input = { requestId: 'retry-after-failure', kind: 'task' as const, text: 'Keep my input' };
    await assert.rejects(repository.saveCapture(input), /Injected write failure/);
    assert.deepEqual(await repository.readSnapshot(), { entries: [], tasks: [] });
    database.exec('DROP TRIGGER simulate_task_failure;');
    const saved = await repository.saveCapture(input);
    assert.equal(saved.entryId, 'entry_retry-after-failure');
    assert.equal(saved.taskId, 'task_retry-after-failure');
    const state = await repository.readSnapshot();
    assert.equal(state.entries.length, 1);
    assert.equal(state.tasks.length, 1);
    assert.equal(state.tasks[0].entryId, state.entries[0].id);
  } finally {
    database.close();
  }
});

test('concurrent pinning preserves the cap, completion clears a pin and repeated completion is stable', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    const repository = createRepository(sqliteDriver(database));
    const captures = await Promise.all(Array.from({ length: 5 }, (_, index) => repository.saveCapture({
      requestId: `pin-${index}`, kind: 'task', text: `Task ${index}`,
    })));
    const ids = captures.map((capture) => capture.taskId!);
    const pins = await Promise.allSettled(ids.map((id) => repository.setPinned(id, true)));
    assert.equal(pins.filter((result) => result.status === 'fulfilled').length, 3);
    assert.equal(pins.filter((result) => result.status === 'rejected').length, 2);
    assert.equal((await repository.readSnapshot()).tasks.filter((task) => task.pinned).length, 3);
    // Database protection also rejects writes that bypass the repository.
    assert.throws(() => database.prepare('UPDATE tasks SET pinned = 1 WHERE id = ?').run(ids[3]), /three tasks/);
    await repository.setPinned(ids[0], true);
    await repository.completeTask(ids[0]);
    const completedAt = (await repository.readSnapshot()).tasks[0].completedAt;
    await repository.completeTask(ids[0]);
    assert.equal((await repository.readSnapshot()).tasks[0].completedAt, completedAt);
    await assert.rejects(repository.setPinned(ids[0], true), /pending tasks/);
    await repository.setPinned(ids[3], true);
    await repository.setPinned(ids[1], false);
    await repository.setPinned(ids[4], true);
    assert.equal((await repository.readSnapshot()).tasks.filter((task) => task.pinned).length, 3);
  } finally {
    database.close();
  }
});

test('a failed commit rejects the save, rolls back its records and leaves the queue usable', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    const base = sqliteDriver(database);
    let failCommit = false;
    const repository = createRepository({
      ...base,
      async exec(sql) {
        if (failCommit && sql === 'COMMIT;') {
          failCommit = false;
          throw new Error('Injected commit failure');
        }
        await base.exec(sql);
      },
    });
    await repository.initialize();
    failCommit = true;
    const input = { requestId: 'commit-retry', kind: 'task' as const, text: 'Persist both records' };
    await assert.rejects(repository.saveCapture(input), /Injected commit failure/);
    assert.deepEqual(await repository.readSnapshot(), { entries: [], tasks: [] });
    await repository.saveCapture(input);
    const after = await repository.readSnapshot();
    assert.equal(after.entries.length, 1);
    assert.equal(after.tasks.length, 1);
  } finally {
    database.close();
  }
});

test('migration initialization is repeatable and refuses newer databases without rewriting them', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    const driver = sqliteDriver(database);
    const repository = createRepository(driver);
    await Promise.all([
      repository.initialize(),
      repository.initialize(),
      repository.readSnapshot(),
      createRepository(driver).initialize(),
    ]);
    await repository.saveCapture({ requestId: 'existing', kind: 'note', text: 'Preserve me' });
    await createRepository(driver).initialize();
    assert.equal(database.prepare('PRAGMA user_version').get()!.user_version, SCHEMA_VERSION);
    assert.equal((await repository.readSnapshot()).entries[0].originalText, 'Preserve me');

    database.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1};`);
    await assert.rejects(createRepository(driver).initialize(), /newer Noeting version/);
    assert.equal(database.prepare('PRAGMA user_version').get()!.user_version, SCHEMA_VERSION + 1);
    assert.equal(database.prepare('SELECT original_text FROM entries').get()!.original_text, 'Preserve me');
  } finally {
    database.close();
  }
});

test('a migration failure rolls back all schema changes and can retry after its cause is removed', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    const driver = sqliteDriver(database);
    const repository = createRepository(driver);
    // An unexpected existing table forces the initial migration to fail partway through.
    database.exec('CREATE TABLE tasks(existing_user_value TEXT);');
    await assert.rejects(repository.initialize(), /tasks already exists/);
    assert.equal(database.prepare('PRAGMA user_version').get()!.user_version, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE name = 'entries'").get()!.total, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE name = 'tasks'").get()!.total, 1);
    database.exec('DROP TABLE tasks;');
    await repository.initialize();
    assert.deepEqual(await repository.readSnapshot(), { entries: [], tasks: [] });
  } finally {
    database.close();
  }
});

test('local workflow does not call fetch and rejects empty captures or missing tasks', async () => {
  const database = new DatabaseSync(':memory:');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Network must not be used by local capture.'); };
  try {
    const repository = createRepository(sqliteDriver(database));
    await assert.rejects(repository.saveCapture({ requestId: '', kind: 'note', text: 'Hello' }), /request ID/);
    await assert.rejects(repository.saveCapture({ requestId: 'empty', kind: 'task', text: ' \n ' }), /Write something/);
    await repository.saveCapture({ requestId: 'offline', kind: 'note', text: 'Works locally' });
    assert.equal((await repository.readSnapshot()).entries.length, 1);
    assert.equal((await repository.readSnapshot()).tasks.length, 0);
    await assert.rejects(repository.setPinned('missing', true), /not found/);
    await assert.rejects(repository.completeTask('missing'), /not found/);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});
