import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
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
    assert.deepEqual(await repository.readSnapshot(), { entries: [], tasks: [], chosenEntryId: null });
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
    assert.deepEqual(await repository.readSnapshot(), { entries: [], tasks: [], chosenEntryId: null });
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
    assert.deepEqual(await repository.readSnapshot(), { entries: [], tasks: [], chosenEntryId: null });
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


async function seedV1(database: DatabaseSync) {
  database.exec(await readFile(new URL('./fixtures/schema-v1.sql', import.meta.url), 'utf8'));
  const insert = database.prepare('INSERT INTO entries(id,capture_request_id,kind,original_text,created_at) VALUES (?,?,?,?,?)');
  insert.run('old-note', 'old-note-request', 'note', '  Original\nthought 🌿  ', '2026-10-12T12:00:00Z');
  insert.run('old-task', 'old-task-request', 'task', '  Prior task  ', '2026-10-12T12:01:00Z');
  insert.run('old-completed', 'old-completed-request', 'task', 'Completed task', '2026-10-12T12:02:00Z');
  database.exec("INSERT INTO tasks VALUES ('task-old','old-task','Prior task','pending',1,'2026-10-12T12:01:00Z',NULL);");
  database.exec("INSERT INTO tasks VALUES ('task-done','old-completed','Completed task','completed',0,'2026-10-12T12:02:00Z','2026-10-12T13:00:00Z');");
}

test('v1 phone data upgrades intact and Today selection / linked thinking survive reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'noeting-upgrade-'));
  const filename = join(directory, 'noeting.db');
  let database = new DatabaseSync(filename);
  try {
    await seedV1(database);
    const oldEntries = database.prepare('SELECT * FROM entries ORDER BY rowid').all();
    const oldTasks = database.prepare('SELECT * FROM tasks ORDER BY rowid').all();
    const repository = createRepository(sqliteDriver(database));
    await repository.initialize();
    assert.deepEqual(database.prepare('SELECT id,capture_request_id,kind,original_text,created_at FROM entries ORDER BY rowid').all(), oldEntries);
    assert.deepEqual(database.prepare('SELECT * FROM tasks ORDER BY rowid').all(), oldTasks);
    await repository.chooseTodayNote('old-note');
    await repository.saveLinked({requestId:'reflect',sourceEntryId:'old-note',kind:'reflection',text:'  A new interpretation\nunchanged source.  '});
    await repository.saveLinked({requestId:'create',sourceEntryId:'old-note',kind:'creation',text:'An independently authored creation'});
    const before = await repository.readSnapshot();
    assert.equal(before.chosenEntryId, 'old-note');
    assert.equal(before.tasks.length, 2);
    assert.equal(before.entries[0].originalText, '  Original\nthought 🌿  ');
    assert.equal(before.entries[3].thinkingKind, 'reflection');
    assert.equal(before.entries[4].thinkingKind, 'creation');
    assert.equal(before.entries[3].sourceEntryId, 'old-note');
    database.close(); database = new DatabaseSync(filename);
    assert.deepEqual(await createRepository(sqliteDriver(database)).readSnapshot(), before);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(database.prepare('PRAGMA integrity_check').get()!.integrity_check, 'ok');
  } finally { database.close(); await rm(directory, {recursive:true,force:true}); }
});

test('v1 to v2 failure rolls back additive changes and preserves every legacy record', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    await seedV1(database);
    const before = database.prepare('SELECT * FROM entries ORDER BY rowid').all();
    database.exec('CREATE TABLE today_selection(existing_user_value TEXT);');
    const repository = createRepository(sqliteDriver(database));
    await assert.rejects(repository.initialize(), /today_selection already exists/);
    assert.equal(database.prepare('PRAGMA user_version').get()!.user_version, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='thinking_links'").get()!.n, 0);
    assert.deepEqual(database.prepare('SELECT * FROM entries ORDER BY rowid').all(), before);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM tasks').get()!.n, 2);
    database.exec('DROP TABLE today_selection;');
    await repository.initialize();
    assert.equal(database.prepare('PRAGMA user_version').get()!.user_version, SCHEMA_VERSION);
  } finally { database.close(); }
});

test('linked saves are atomic and retry idempotent; changed source/text/type is rejected', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    const repo = createRepository(sqliteDriver(database));
    const source = await repo.saveCapture({requestId:'source',kind:'note',text:'Source words'});
    const other = await repo.saveCapture({requestId:'other',kind:'note',text:'Other source'});
    const input = {requestId:'linked-retry',sourceEntryId:source.entryId,kind:'reflection' as const,text:'  Linked text\n  '};
    database.exec("CREATE TRIGGER fail_link BEFORE INSERT ON thinking_links BEGIN SELECT RAISE(ABORT,'Injected linked failure'); END;");
    await assert.rejects(repo.saveLinked(input), /Injected linked failure/);
    assert.equal((await repo.readSnapshot()).entries.length, 2);
    database.exec('DROP TRIGGER fail_link;');
    const results = await Promise.all(Array.from({length:8},()=>repo.saveLinked(input)));
    assert.ok(results.every(r=>r.entryId===results[0].entryId));
    assert.equal((await repo.readSnapshot()).entries.length, 3);
    await assert.rejects(repo.saveLinked({...input,text:'Changed'}), /different content or source/);
    await assert.rejects(repo.saveLinked({...input,sourceEntryId:other.entryId}), /different content or source/);
    await assert.rejects(repo.saveLinked({...input,kind:'creation'}), /different content or source/);
    await assert.rejects(repo.saveLinked({...input,requestId:'missing',sourceEntryId:'absent'}), /not found/);
    assert.equal((await repo.readSnapshot()).tasks.length, 0);
    assert.equal((await repo.readSnapshot()).entries[0].originalText, 'Source words');
    await assert.rejects(repo.chooseTodayNote('absent'), /saved note/);
    const task = await repo.saveCapture({requestId:'task',kind:'task',text:'A task'});
    await assert.rejects(repo.chooseTodayNote(task.entryId), /saved note/);
    assert.equal((await repo.readSnapshot()).chosenEntryId, other.entryId);
  } finally { database.close(); }
});

test('new Note and Today selection commit atomically; linked saves and retries do not steal selection', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    const repo=createRepository(sqliteDriver(db));
    const first=await repo.saveCapture({requestId:'auto-first',kind:'note',text:'First'});
    assert.equal((await repo.readSnapshot()).chosenEntryId,first.entryId);
    db.exec("CREATE TRIGGER fail_selection BEFORE INSERT ON today_selection BEGIN SELECT RAISE(ABORT,'Selection failed'); END;");
    const input={requestId:'auto-second',kind:'note' as const,text:'  Second 🌿\n  '};
    await assert.rejects(repo.saveCapture(input),/Selection failed/);
    assert.equal((await repo.readSnapshot()).entries.length,1);
    assert.equal((await repo.readSnapshot()).chosenEntryId,first.entryId);
    db.exec('DROP TRIGGER fail_selection;');
    const second=await repo.saveCapture(input);
    await repo.saveLinked({requestId:'auto-reflect',sourceEntryId:first.entryId,kind:'reflection',text:'Reflection'});
    await repo.saveCapture({requestId:'auto-first',kind:'note',text:'First'});
    await repo.saveCapture({requestId:'auto-task',kind:'task',text:'Task'});
    assert.equal((await repo.readSnapshot()).chosenEntryId,second.entryId);
  } finally {db.close();}
});

test('schema v2 upgrades preserve captured text, task states, links and Today selection', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(await readFile(new URL('./fixtures/schema-v2.sql',import.meta.url),'utf8'));
    db.exec("INSERT INTO entries VALUES ('n','req-n','note','  Source 🌿  ','2026-10-12'); INSERT INTO entries VALUES ('t','req-t','task','Task original','2026-10-12'); INSERT INTO entries VALUES ('r','req-r','note','Reflection original','2026-10-13'); INSERT INTO tasks VALUES ('task-t','t','Task original','pending',1,'2026-10-12',NULL); INSERT INTO thinking_links VALUES ('r','n','reflection'); INSERT INTO today_selection VALUES (1,'n');");
    const old=db.prepare('SELECT * FROM entries ORDER BY rowid').all();
    const tasks=db.prepare('SELECT * FROM tasks').all();
    const repo=createRepository(sqliteDriver(db)); const snapshot=await repo.readSnapshot();
    assert.deepEqual(db.prepare('SELECT id,capture_request_id,kind,original_text,created_at FROM entries ORDER BY rowid').all(),old);
    assert.deepEqual(db.prepare('SELECT * FROM tasks').all(),tasks);
    assert.equal(snapshot.chosenEntryId,'n'); assert.equal(snapshot.entries[2].sourceEntryId,'n');
    assert.equal(snapshot.entries[0].text,'  Source 🌿  '); assert.equal(snapshot.entries[0].removed,false);
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version,3);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally {db.close();}
});

test('schema v3 migration failure rolls back new columns and retries without changing v2 records', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(await readFile(new URL('./fixtures/schema-v2.sql',import.meta.url),'utf8'));
    db.exec("INSERT INTO entries VALUES ('n','req','note','Preserve me','2026-10-12'); ALTER TABLE entries ADD COLUMN removed_at TEXT;");
    const before=db.prepare('SELECT * FROM entries').all(); const repo=createRepository(sqliteDriver(db));
    await assert.rejects(repo.initialize(),/duplicate column/);
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version,2);
    assert.deepEqual(db.prepare('SELECT * FROM entries').all(),before);
    assert.equal(db.prepare('PRAGMA table_info(entries)').all().some(row=>row.name==='edited_text'),false);
    db.exec('ALTER TABLE entries DROP COLUMN removed_at;');await repo.initialize();
    assert.equal((await repo.readSnapshot()).entries[0].originalText,'Preserve me');
  } finally {db.close();}
});

test('editing a task updates both surfaces atomically while preserving first capture, timestamps and source', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    const repo=createRepository(sqliteDriver(db)); const task=await repo.saveCapture({requestId:'edit-task',kind:'task',text:'  Original task  '});
    await repo.saveLinked({requestId:'edit-linked',sourceEntryId:task.entryId,kind:'reflection',text:'A reflection'});
    const before=(await repo.readSnapshot()).entries[0];
    db.exec("CREATE TRIGGER fail_edit BEFORE UPDATE OF title ON tasks BEGIN SELECT RAISE(ABORT,'Task edit failed'); END;");
    await assert.rejects(repo.editEntry(task.entryId,'New task'),/Task edit failed/);
    assert.equal((await repo.readSnapshot()).entries[0].text,before.text);
    db.exec('DROP TRIGGER fail_edit;'); await repo.editEntry(task.entryId,'  New task\n🌿  ');
    const snapshot=await repo.readSnapshot();
    assert.equal(snapshot.entries[0].text,'  New task\n🌿  ');assert.equal(snapshot.tasks[0].title,'New task\n🌿');
    assert.equal(snapshot.entries[0].originalText,before.originalText);assert.equal(snapshot.entries[0].createdAt,before.createdAt);
    assert.equal(snapshot.entries[1].sourceEntryId,task.entryId);
    await assert.rejects(repo.editEntry(task.entryId,' \n '),/Write something/);
  } finally {db.close();}
});

test('removal keeps provenance, clears selection and pin, and durable Undo does not override newer choices', async () => {
  const dir=await mkdtemp(join(tmpdir(),'noeting-undo-'));const file=join(dir,'db.sqlite');let db=new DatabaseSync(file);
  try {
    let repo=createRepository(sqliteDriver(db));
    const source=await repo.saveCapture({requestId:'remove-source',kind:'note',text:'Source'});
    const linked=await repo.saveLinked({requestId:'remove-reflection',sourceEntryId:source.entryId,kind:'reflection',text:'Keep reflection'});
    const receipt=await repo.removeEntry(source.entryId);
    assert.deepEqual(await repo.removeEntry(source.entryId),receipt);
    const removed=await repo.readSnapshot();assert.equal(removed.chosenEntryId,null);
    assert.equal(removed.entries.find(e=>e.id===source.entryId)!.removed,true);
    assert.equal(removed.entries.find(e=>e.id===linked.entryId)!.removed,false);
    await assert.rejects(repo.editEntry(source.entryId,'Oops'),/not found/);
    await assert.rejects(repo.chooseTodayNote(source.entryId),/saved note/);
    db.close();db=new DatabaseSync(file);repo=createRepository(sqliteDriver(db));
    const newer=await repo.saveCapture({requestId:'remove-newer',kind:'note',text:'Newer'});
    await repo.restoreEntry(receipt);await repo.restoreEntry(receipt);
    assert.equal((await repo.readSnapshot()).chosenEntryId,newer.entryId);
    await repo.removeEntry(source.entryId);await assert.rejects(repo.restoreEntry(receipt),/no longer/);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal(db.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');
  } finally {db.close();await rm(dir,{recursive:true,force:true});}
});

test('removing pinned task releases its slot; Undo retains status without exceeding three pins', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    const repo=createRepository(sqliteDriver(db));const captures=[];
    for(let i=0;i<4;i++) captures.push(await repo.saveCapture({requestId:'slot-'+i,kind:'task',text:'Task '+i}));
    for(let i=0;i<3;i++)await repo.setPinned(captures[i].taskId!,true);
    const receipt=await repo.removeEntry(captures[0].entryId);
    assert.equal((await repo.readSnapshot()).tasks.length,3);
    await assert.rejects(repo.completeTask(captures[0].taskId!),/not found/);
    await repo.setPinned(captures[3].taskId!,true);await repo.restoreEntry(receipt);
    const snapshot=await repo.readSnapshot();assert.equal(snapshot.tasks.length,4);assert.equal(snapshot.tasks.filter(t=>t.pinned).length,3);
    assert.equal(snapshot.tasks[0].status,'pending');assert.equal(snapshot.tasks[0].pinned,false);
  } finally {db.close();}
});

test('failed removal rolls back hidden state, pin and Today selection and Undo can retry', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    const repo=createRepository(sqliteDriver(db));const note=await repo.saveCapture({requestId:'remove-fail',kind:'note',text:'Keep selected'});
    const before=await repo.readSnapshot();
    db.exec("CREATE TRIGGER fail_remove BEFORE DELETE ON today_selection BEGIN SELECT RAISE(ABORT,'Remove failed'); END;");
    await assert.rejects(repo.removeEntry(note.entryId),/Remove failed/);assert.deepEqual(await repo.readSnapshot(),before);
    db.exec('DROP TRIGGER fail_remove;');const receipt=await repo.removeEntry(note.entryId);
    db.exec("CREATE TRIGGER fail_restore BEFORE UPDATE OF removed_at ON entries WHEN NEW.removed_at IS NULL BEGIN SELECT RAISE(ABORT,'Restore failed'); END;");
    await assert.rejects(repo.restoreEntry(receipt),/Restore failed/);assert.equal((await repo.readSnapshot()).entries[0].removed,true);
    db.exec('DROP TRIGGER fail_restore;');await repo.restoreEntry(receipt);assert.equal((await repo.readSnapshot()).chosenEntryId,note.entryId);
  } finally {db.close();}
});
