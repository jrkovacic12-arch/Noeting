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

test('concurrent pinning is unlimited, completion clears a pin and repeated completion is stable', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    const repository = createRepository(sqliteDriver(database));
    const captures = await Promise.all(Array.from({ length: 5 }, (_, index) => repository.saveCapture({
      requestId: `pin-${index}`, kind: 'task', text: `Task ${index}`,
    })));
    const ids = captures.map((capture) => capture.taskId!);
    const pins = await Promise.allSettled(ids.map((id) => repository.setPinned(id, true)));
    assert.equal(pins.filter((result) => result.status === 'fulfilled').length, 5);
    assert.equal(pins.filter((result) => result.status === 'rejected').length, 0);
    assert.equal((await repository.readSnapshot()).tasks.filter((task) => task.pinned).length, 5);
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
    assert.deepEqual(database.prepare('SELECT id,entry_id,title,status,pinned,created_at,completed_at FROM tasks ORDER BY rowid').all(), oldTasks);
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
    assert.deepEqual(db.prepare('SELECT id,entry_id,title,status,pinned,created_at,completed_at FROM tasks').all(),tasks);
    assert.equal(snapshot.chosenEntryId,'n'); assert.equal(snapshot.entries[2].sourceEntryId,'n');
    assert.equal(snapshot.entries[0].text,'  Source 🌿  '); assert.equal(snapshot.entries[0].removed,false);
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version,SCHEMA_VERSION);
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
    assert.deepEqual(db.prepare('SELECT * FROM entries').all().map(row=>{const {removed_pin_at,removed_pin_order,...old}=row;return Object.assign(Object.create(null),old);}),before);
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

test('removing and restoring a pinned task retains its position without a pin limit', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    const repo=createRepository(sqliteDriver(db));const captures=[];
    for(let i=0;i<4;i++) captures.push(await repo.saveCapture({requestId:'slot-'+i,kind:'task',text:'Task '+i}));
    for(let i=0;i<3;i++)await repo.setPinned(captures[i].taskId!,true);
    const receipt=await repo.removeEntry(captures[0].entryId);
    assert.equal((await repo.readSnapshot()).tasks.length,3);
    await assert.rejects(repo.completeTask(captures[0].taskId!),/not found/);
    await repo.setPinned(captures[3].taskId!,true);await repo.restoreEntry(receipt);
    const snapshot=await repo.readSnapshot();assert.equal(snapshot.tasks.length,4);assert.equal(snapshot.tasks.filter(t=>t.pinned).length,4);
    assert.equal(snapshot.tasks[0].status,'pending');assert.equal(snapshot.tasks[0].pinned,true);
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

test('reopen preserves identity, words and links, clears completion and never repins', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    const repo=createRepository(sqliteDriver(db));
    const source=await repo.saveCapture({requestId:'reopen-source',kind:'note',text:'Source'});
    const task=await repo.saveDerivedTask({requestId:'reopen',sourceEntryId:source.entryId,text:'Do this'});
    await repo.setPinned(task.taskId!,true);
    await repo.setScheduledPin(task.taskId!,new Date(Date.now()+3600000).toISOString());
    await repo.completeTask(task.taskId!);
    const before=(await repo.readSnapshot()).tasks[0];
    assert.ok(before.completedAt);
    db.exec("CREATE TRIGGER fail_reopen BEFORE UPDATE ON tasks WHEN NEW.status='pending' BEGIN SELECT RAISE(ABORT,'reopen failure'); END");
    await assert.rejects(repo.reopenTask(task.taskId!),/reopen failure/);
    assert.deepEqual((await repo.readSnapshot()).tasks[0],before);
    db.exec('DROP TRIGGER fail_reopen');
    await Promise.all([repo.reopenTask(task.taskId!),repo.reopenTask(task.taskId!)]);
    const snapshot=await createRepository(sqliteDriver(db)).readSnapshot();
    assert.deepEqual(snapshot.tasks[0],{...before,status:'pending',pinned:false,completedAt:null});
    assert.equal(snapshot.entries[1].taskSourceId,source.entryId);
    assert.equal((await repo.readScheduledPins())[0].dueAt,null);
  } finally {db.close();}
});

test('derived tasks preserve source-at-creation, retry safely and remain independent after edit/removal', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    const repo=createRepository(sqliteDriver(db));
    const source=await repo.saveCapture({requestId:'source',kind:'note',text:'  Original 🌿\n '});
    await repo.editEntry(source.entryId,'  Edited source\n  ');
    const input={requestId:'derived',sourceEntryId:source.entryId,text:'First action'};
    const results=await Promise.all(Array.from({length:6},()=>repo.saveDerivedTask(input)));
    assert.ok(results.every(r=>r.taskId===results[0].taskId));
    await assert.rejects(repo.saveDerivedTask({...input,text:'Changed retry'}),/different content/);
    await assert.rejects(repo.saveDerivedTask({...input,sourceEntryId:'missing'}),/different content/);
    const second=await repo.saveDerivedTask({...input,requestId:'second'});
    await repo.editEntry(source.entryId,'Later source');
    await repo.editEntry(results[0].entryId,'Independent task edit');
    await repo.removeEntry(source.entryId);
    const snapshot=await repo.readSnapshot();
    assert.equal(snapshot.tasks.length,2);assert.equal(snapshot.chosenEntryId,null);
    assert.equal(snapshot.entries[0].originalText,'  Original 🌿\n ');
    assert.equal(snapshot.entries[1].taskSourceText,'  Edited source\n  ');
    assert.equal(snapshot.entries[1].taskSourceId,source.entryId);
    assert.equal(snapshot.tasks[0].title,'Independent task edit');
    await assert.rejects(repo.saveDerivedTask({...input,requestId:'removed-source'}),/not found/);
    await repo.removeEntry(results[0].entryId);
    assert.equal((await repo.readSnapshot()).entries[0].text,'Later source');
    const child=await repo.saveDerivedTask({requestId:'task-source',sourceEntryId:second.entryId,text:'Child task'});
    assert.equal((await repo.readSnapshot()).entries.find(e=>e.id===child.entryId)!.taskSourceId,second.entryId);
    // A retry after source removal still resolves the original committed task.
    assert.deepEqual(await repo.saveDerivedTask(input),results[0]);
  } finally {db.close();}
});

test('derived task link failure rolls back entry and task, then retries with one selection-preserving save', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    const repo=createRepository(sqliteDriver(db));
    const source=await repo.saveCapture({requestId:'s',kind:'note',text:'Source'});
    const input={requestId:'fail',sourceEntryId:source.entryId,text:'Task'};
    const before=await repo.readSnapshot();
    db.exec("CREATE TRIGGER fail_source BEFORE INSERT ON task_sources BEGIN SELECT RAISE(ABORT,'source failure'); END");
    await assert.rejects(repo.saveDerivedTask(input),/source failure/);
    assert.deepEqual(await repo.readSnapshot(),before);
    db.exec('DROP TRIGGER fail_source');
    await repo.saveDerivedTask(input);
    assert.equal((await repo.readSnapshot()).chosenEntryId,source.entryId);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally {db.close();}
});

test('schema v3 to v4 preserves all historical rows and rolls back an interrupted migration', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(await readFile(new URL('./fixtures/schema-v3.sql',import.meta.url),'utf8'));
    db.exec("INSERT INTO entries(id,capture_request_id,kind,original_text,created_at,edited_text) VALUES ('s','s','note','Original','2026-10-15','Edited'); INSERT INTO entries(id,capture_request_id,kind,original_text,created_at) VALUES ('t','t','task','Task','2026-10-15'); INSERT INTO tasks VALUES ('task','t','Task','completed',0,'2026-10-15','2026-10-15'); INSERT INTO today_selection VALUES(1,'s');");
    const before=db.prepare('SELECT * FROM entries').all(), tasks=db.prepare('SELECT * FROM tasks').all();
    const driver=sqliteDriver(db);let fail=true;
    const repo=createRepository({...driver,exec:async(sql)=>{if(fail && sql.includes('CREATE TABLE task_sources')){db.exec('CREATE TABLE interrupted(id TEXT)');throw new Error('migration failure');} await driver.exec(sql);}});
    await assert.rejects(repo.initialize(),/migration failure/);
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version,3);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='interrupted'").get(),undefined);
    assert.deepEqual(db.prepare('SELECT * FROM entries').all().map(row=>{const {removed_pin_at,removed_pin_order,...old}=row;return Object.assign(Object.create(null),old);}),before);
    fail=false;await repo.initialize();
    assert.deepEqual(db.prepare('SELECT * FROM entries').all().map(row=>{const {removed_pin_at,removed_pin_order,...old}=row;return Object.assign(Object.create(null),old);}),before);
    assert.deepEqual(db.prepare('SELECT id,entry_id,title,status,pinned,created_at,completed_at FROM tasks').all(),tasks);
    assert.equal((await repo.readSnapshot()).chosenEntryId,'s');
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version,SCHEMA_VERSION);
  } finally {db.close();}
});


import {parseLocalPinTime} from '../src/reminders';

test('v4 migration preserves source data and pins, converts outstanding reminders and clears notification intent atomically',async()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(await readFile(new URL('./fixtures/schema-v4.sql',import.meta.url),'utf8'));
    db.exec("INSERT INTO entries(id,capture_request_id,kind,original_text,created_at) VALUES ('n','n','note','Source','2026-10-15T00:00:00Z'),('t','t','task','Task','2026-10-15T00:00:01Z'),('done','done','task','Past','2026-10-15T00:00:02Z'); INSERT INTO tasks VALUES ('task','t','Task','pending',1,'2026-10-15T00:00:01Z',NULL),('past','done','Past','pending',0,'2026-10-15T00:00:02Z',NULL); INSERT INTO task_sources VALUES('t','n','Source'); INSERT INTO reminders VALUES('task','2035-01-01T12:00:00Z',1,'denied','denied'),('past','2020-01-01T12:00:00Z',1,'elapsed',NULL);");
    const driver=sqliteDriver(db);let fail=true;
    const repo=createRepository({...driver,exec:async(sql)=>{
      if(fail && sql.includes('CREATE TABLE scheduled_pins')){db.exec('ALTER TABLE tasks ADD COLUMN temporary_failure TEXT');throw Error('injected migration');}
      await driver.exec(sql);
    }});
    await assert.rejects(repo.initialize(),/injected migration/);
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version,4);
    assert.equal(db.prepare("SELECT status FROM reminders WHERE task_id='task'").get()!.status,'denied');
    assert.equal(db.prepare('PRAGMA table_info(tasks)').all().some(r=>r.name==='temporary_failure'),false);
    fail=false;await repo.initialize();
    const snap=await repo.readSnapshot();assert.equal(snap.entries[1].taskSourceId,'n');assert.equal(snap.tasks[0].pinned,true);
    assert.equal(snap.tasks[0].pinnedAt,'2026-10-15T00:00:01Z');
    assert.deepEqual(await repo.readScheduledPins(),[{taskId:'task',dueAt:'2035-01-01T12:00:00Z',status:'waiting'}]);
    assert.equal(db.prepare("SELECT status FROM reminders WHERE task_id='task'").get()!.status,'cancelled');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'tasks_pin_limit%'").get()!.n,0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{db.close();}
});

test('scheduled pins apply once when due, catch up after restart and order overdue times below newer manual pins',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'noeting-pins-')),file=join(dir,'db.sqlite');let db=new DatabaseSync(file);
  try{
    let repo=createRepository(sqliteDriver(db));
    const earlier=await repo.saveCapture({requestId:'earlier',kind:'task',text:'Earlier'});
    const later=await repo.saveCapture({requestId:'later',kind:'task',text:'Later'});
    const manual=await repo.saveCapture({requestId:'manual',kind:'task',text:'Manual'});
    const t1=new Date(Date.now()+3600000).toISOString(),t2=new Date(Date.now()+7200000).toISOString();
    await repo.setScheduledPin(earlier.taskId!,t1);await repo.setScheduledPin(later.taskId!,t2);
    await repo.applyDuePins(new Date(Date.parse(t1)-1).toISOString());
    assert.equal((await repo.readSnapshot()).tasks.filter(t=>t.pinned).length,0);
    db.close();db=new DatabaseSync(file);repo=createRepository(sqliteDriver(db));
    await repo.applyDuePins(t2);
    let tasks=(await repo.readSnapshot()).tasks;
    assert.equal(tasks.filter(t=>t.pinned).length,2);assert.equal(tasks[0].pinnedAt,t1);assert.equal(tasks[1].pinnedAt,t2);
    assert.equal((await repo.readScheduledPins()).filter(s=>s.status==='applied').length,2);
    const before=await repo.readSnapshot();await repo.applyDuePins(t2);assert.deepEqual(await repo.readSnapshot(),before);
    await repo.setPinned(manual.taskId!,true);
    // Simulate a newer actual manual pin, then replay a due check. It must stay newest.
    db.prepare('UPDATE tasks SET pinned_at=? WHERE id=?').run(new Date(Date.parse(t2)+1000).toISOString(),manual.taskId!);
    await repo.applyDuePins(t2);tasks=(await repo.readSnapshot()).tasks;
    tasks.sort((a,b)=>(b.pinnedAt??'').localeCompare(a.pinnedAt??'') || b.pinOrder-a.pinOrder);
    assert.equal(tasks[0].id,manual.taskId);assert.equal(tasks[1].id,later.taskId);
  }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('due schedules keep already-pinned order, manual pin order breaks ties, cancellation and completion do not re-pin',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    const repo=createRepository(sqliteDriver(db));
    const a=await repo.saveCapture({requestId:'a',kind:'task',text:'A'}),b=await repo.saveCapture({requestId:'b',kind:'task',text:'B'});
    await repo.setPinned(a.taskId!,true);await repo.setPinned(b.taskId!,true);
    const before=(await repo.readSnapshot()).tasks;assert.ok(before[1].pinOrder>before[0].pinOrder);
    await repo.setPinned(a.taskId!,true);assert.deepEqual((await repo.readSnapshot()).tasks,before);
    const due=new Date(Date.now()+3600000).toISOString();await repo.setScheduledPin(a.taskId!,due);await repo.applyDuePins(due);
    assert.deepEqual((await repo.readSnapshot()).tasks,before);
    await repo.setPinned(a.taskId!,false);await repo.applyDuePins(due);assert.equal((await repo.readSnapshot()).tasks[0].pinned,false);
    await repo.setScheduledPin(a.taskId!,due);await repo.setScheduledPin(a.taskId!,null);await repo.applyDuePins(due);
    assert.equal((await repo.readSnapshot()).tasks[0].pinned,false);
    await repo.setScheduledPin(a.taskId!,due);await repo.completeTask(a.taskId!);await repo.reopenTask(a.taskId!);await repo.applyDuePins(due);
    assert.equal((await repo.readSnapshot()).tasks[0].pinned,false);
    await repo.setScheduledPin(b.taskId!,due);const removal=await repo.removeEntry(b.entryId);await repo.restoreEntry(removal);await repo.setPinned(b.taskId!,false);await repo.applyDuePins(due);
    assert.equal((await repo.readSnapshot()).tasks[1].pinned,false);
  }finally{db.close();}
});

test('scheduled pin application and intent roll back together on failure; changed times and invalid inputs are safe',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    const repo=createRepository(sqliteDriver(db));const task=await repo.saveCapture({requestId:'failure',kind:'task',text:'Task'});
    await assert.rejects(repo.setScheduledPin(task.taskId!,'invalid'),/future/);
    const due=new Date(Date.now()+3600000).toISOString();await repo.setScheduledPin(task.taskId!,due);
    db.exec("CREATE TRIGGER fail_apply BEFORE UPDATE OF status ON scheduled_pins WHEN NEW.status='applied' BEGIN SELECT RAISE(ABORT,'apply failure'); END");
    await assert.rejects(repo.applyDuePins(due),/apply failure/);
    assert.equal((await repo.readSnapshot()).tasks[0].pinned,false);assert.equal((await repo.readScheduledPins())[0].status,'waiting');
    db.exec('DROP TRIGGER fail_apply');
    const changed=new Date(Date.parse(due)+3600000).toISOString();await repo.setScheduledPin(task.taskId!,changed);await repo.applyDuePins(due);
    assert.equal((await repo.readSnapshot()).tasks[0].pinned,false);
    await repo.applyDuePins(changed);assert.equal((await repo.readSnapshot()).tasks[0].pinned,true);
    assert.throws(()=>parseLocalPinTime('2035-02-30','12:00'),/valid/);
    assert.throws(()=>parseLocalPinTime('2035-01-01','24:00'),/valid/);
  }finally{db.close();}
});


test('task-to-task links keep independent completion, pins and immutable source across removal/retry',async()=>{
  const db=new DatabaseSync(':memory:');
  try {
    const repo=createRepository(sqliteDriver(db));
    const parent=await repo.saveCapture({requestId:'parent',kind:'task',text:'  Parent original  '});
    await repo.editEntry(parent.entryId,'Parent edited');
    const input={requestId:'child',sourceEntryId:parent.entryId,text:'Child action'};
    const children=await Promise.all(Array.from({length:5},()=>repo.saveDerivedTask(input)));
    assert.ok(children.every(c=>c.taskId===children[0].taskId));
    const child=children[0];
    await repo.setPinned(child.taskId!,true);
    await repo.completeTask(parent.taskId!);
    let snap=await repo.readSnapshot();
    assert.equal(snap.tasks.find(t=>t.id===child.taskId)!.status,'pending');
    assert.equal(snap.tasks.find(t=>t.id===child.taskId)!.pinned,true);
    await repo.editEntry(parent.entryId,'Later parent');
    await repo.removeEntry(parent.entryId);
    await repo.completeTask(child.taskId!);await repo.reopenTask(child.taskId!);
    snap=await createRepository(sqliteDriver(db)).readSnapshot();
    const entry=snap.entries.find(e=>e.id===child.entryId)!;
    assert.equal(entry.taskSourceText,'Parent edited');assert.equal(entry.taskSourceId,parent.entryId);
    assert.equal(snap.tasks.find(t=>t.id===child.taskId)!.pinned,false);
    assert.deepEqual(await repo.saveDerivedTask(input),child);
    await assert.rejects(repo.saveDerivedTask({...input,requestId:'removed'}),/not found/);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{db.close();}
});

test('v5 migration changes source validation atomically while preserving existing data',async()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(await readFile(new URL('./fixtures/schema-v5.sql',import.meta.url),'utf8'));
    db.exec("INSERT INTO entries(id,capture_request_id,kind,original_text,created_at) VALUES ('p','p','task','Parent','2026-10-15'); INSERT INTO tasks(id,entry_id,title,status,pinned,created_at,completed_at) VALUES('p','p','Parent','pending',0,'2026-10-15',NULL)");
    const driver=sqliteDriver(db);let fail=true;
    const repo=createRepository({...driver,exec:async(sql)=>{
      if(fail && sql.includes('DROP TRIGGER task_sources_require_kinds')){db.exec('DROP TRIGGER task_sources_require_kinds');throw Error('migration failed');}
      await driver.exec(sql);
    }});
    await assert.rejects(repo.initialize(),/migration failed/);
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version,5);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='task_sources_require_kinds'").get()!.n,1);
    fail=false;await repo.initialize();
    await repo.saveDerivedTask({requestId:'c',sourceEntryId:'p',text:'Child'});
    assert.equal((await repo.readSnapshot()).tasks.length,2);
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version,6);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{db.close();}
});
