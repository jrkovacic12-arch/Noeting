export type EntryKind = 'note' | 'task';
export type ThinkingKind = 'reflection' | 'creation';

export interface Entry {
  id: string;
  kind: EntryKind;
  originalText: string;
  text: string;
  removed: boolean;
  createdAt: string;
  thinkingKind: ThinkingKind | null;
  sourceEntryId: string | null;
}

export interface Task {
  id: string;
  entryId: string;
  title: string;
  status: 'pending' | 'completed';
  pinned: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface Snapshot {
  entries: Entry[];
  tasks: Task[];
  chosenEntryId: string | null;
}

export interface LinkedInput {
  requestId: string;
  sourceEntryId: string;
  kind: ThinkingKind;
  text: string;
}

export interface CaptureInput {
  requestId: string;
  kind: EntryKind;
  text: string;
}

export interface CaptureResult {
  entryId: string;
  taskId: string | null;
}

export interface Removal {
  entryId: string;
  version: number;
  pinned: boolean;
  selected: boolean;
}

export interface Repository {
  initialize(): Promise<void>;
  readSnapshot(): Promise<Snapshot>;
  saveCapture(input: CaptureInput): Promise<CaptureResult>;
  setPinned(id: string, pinned: boolean): Promise<void>;
  completeTask(id: string): Promise<void>;
  saveLinked(input: LinkedInput): Promise<CaptureResult>;
  chooseTodayNote(id: string): Promise<void>;
  editEntry(id: string, text: string): Promise<void>;
  removeEntry(id: string): Promise<Removal>;
  restoreEntry(removal: Removal): Promise<void>;
}

export type SQLiteValue = string | number | null;

/** The same repository logic runs against Expo SQLite and a real SQLite test database. */
export interface SQLiteDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, parameters?: SQLiteValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, parameters?: SQLiteValue[]): Promise<T[]>;
}

export const SCHEMA_VERSION = 3;

type EntryRow = {
  id: string;
  kind: EntryKind;
  original_text: string;
  edited_text?: string | null;
  removed_at?: string | null;
  removal_version?: number;
  removed_pinned?: number;
  removed_selected?: number;
  created_at: string;
  thinking_kind?: ThinkingKind | null;
  source_entry_id?: string | null;
};

type TaskRow = {
  id: string;
  entry_id: string;
  title: string;
  status: 'pending' | 'completed';
  pinned: number;
  created_at: string;
  completed_at: string | null;
};

class Mutex {
  private tail: Promise<void> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

// Sharing a driver must also share its queue: two repositories may not interleave transactions.
const driverMutexes = new WeakMap<SQLiteDriver, Mutex>();

const migrationV1 = `
  CREATE TABLE entries (
    id TEXT PRIMARY KEY NOT NULL,
    capture_request_id TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('note', 'task')),
    original_text TEXT NOT NULL CHECK (length(original_text) > 0),
    created_at TEXT NOT NULL
  );

  CREATE TABLE tasks (
    id TEXT PRIMARY KEY NOT NULL,
    entry_id TEXT NOT NULL UNIQUE REFERENCES entries(id) ON DELETE RESTRICT,
    title TEXT NOT NULL CHECK (length(title) > 0),
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    created_at TEXT NOT NULL,
    completed_at TEXT,
    CHECK (status = 'pending' OR pinned = 0),
    CHECK (
      (status = 'pending' AND completed_at IS NULL) OR
      (status = 'completed' AND completed_at IS NOT NULL)
    )
  );

  CREATE INDEX tasks_status_pinned ON tasks(status, pinned);

  CREATE TRIGGER tasks_require_task_entry
  BEFORE INSERT ON tasks
  WHEN (SELECT kind FROM entries WHERE id = NEW.entry_id) <> 'task'
  BEGIN
    SELECT RAISE(ABORT, 'A directly captured task must link to a task entry.');
  END;

  CREATE TRIGGER tasks_pin_limit_insert
  BEFORE INSERT ON tasks
  WHEN NEW.pinned = 1 AND (SELECT COUNT(*) FROM tasks WHERE pinned = 1) >= 3
  BEGIN
    SELECT RAISE(ABORT, 'Only three tasks can be pinned.');
  END;

  CREATE TRIGGER tasks_pin_limit_update
  BEFORE UPDATE OF pinned ON tasks
  WHEN NEW.pinned = 1 AND OLD.pinned = 0
    AND (SELECT COUNT(*) FROM tasks WHERE pinned = 1) >= 3
  BEGIN
    SELECT RAISE(ABORT, 'Only three tasks can be pinned.');
  END;
`;

const migrationV2 = `
  CREATE TABLE thinking_links (
    entry_id TEXT PRIMARY KEY NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    source_entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    thinking_kind TEXT NOT NULL CHECK (thinking_kind IN ('reflection', 'creation')),
    CHECK (entry_id <> source_entry_id)
  );
  CREATE INDEX thinking_links_source ON thinking_links(source_entry_id);
  CREATE TRIGGER thinking_links_require_note BEFORE INSERT ON thinking_links
  WHEN (SELECT kind FROM entries WHERE id = NEW.entry_id) <> 'note'
  BEGIN SELECT RAISE(ABORT, 'Linked thinking must be a note entry.'); END;
  CREATE TABLE today_selection (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE RESTRICT
  );
`;

const migrationV3 = `
  ALTER TABLE entries ADD COLUMN edited_text TEXT CHECK (edited_text IS NULL OR length(trim(edited_text)) > 0);
  ALTER TABLE entries ADD COLUMN removed_at TEXT;
  ALTER TABLE entries ADD COLUMN removal_version INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE entries ADD COLUMN removed_pinned INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE entries ADD COLUMN removed_selected INTEGER NOT NULL DEFAULT 0;
`;

class SQLiteRepository implements Repository {
  private readonly mutex: Mutex;
  private initialized = false;

  constructor(private readonly db: SQLiteDriver) {
    let mutex = driverMutexes.get(db);
    if (!mutex) {
      mutex = new Mutex();
      driverMutexes.set(db, mutex);
    }
    this.mutex = mutex;
  }

  initialize(): Promise<void> {
    return this.mutex.run(() => this.initializeLocked());
  }

  readSnapshot(): Promise<Snapshot> {
    return this.mutex.run(async () => {
      await this.initializeLocked();
      return this.transaction(async () => {
        const entries = await this.db.all<EntryRow>(
          `SELECT e.*, l.thinking_kind, l.source_entry_id
           FROM entries e LEFT JOIN thinking_links l ON l.entry_id = e.id ORDER BY e.created_at, e.rowid`,
        );
        const tasks = await this.db.all<TaskRow>(
          'SELECT t.* FROM tasks t JOIN entries e ON e.id = t.entry_id WHERE e.removed_at IS NULL ORDER BY t.created_at, t.rowid',
        );
        const [selection] = await this.db.all<{ entry_id: string }>('SELECT entry_id FROM today_selection WHERE id = 1');
        return {
          chosenEntryId: selection?.entry_id ?? null,
          entries: entries.map((row) => ({
            id: row.id,
            kind: row.kind,
            originalText: row.original_text,
            text: row.edited_text ?? row.original_text,
            removed: row.removed_at != null,
            createdAt: row.created_at,
            thinkingKind: row.thinking_kind ?? null,
            sourceEntryId: row.source_entry_id ?? null,
          })),
          tasks: tasks.map((row) => ({
            id: row.id,
            entryId: row.entry_id,
            title: row.title,
            status: row.status,
            pinned: row.pinned === 1,
            createdAt: row.created_at,
            completedAt: row.completed_at,
          })),
        };
      });
    });
  }

  saveCapture(input: CaptureInput): Promise<CaptureResult> {
    return this.mutex.run(async () => {
      if (typeof input.requestId !== 'string' || !input.requestId.trim()) {
        throw new Error('Capture needs a stable request ID.');
      }
      if (input.kind !== 'note' && input.kind !== 'task') {
        throw new Error('Choose Note or Task.');
      }
      if (typeof input.text !== 'string' || !input.text.trim()) {
        throw new Error('Write something before saving.');
      }
      await this.initializeLocked();
      return this.transaction(async () => {
        const [existing] = await this.db.all<EntryRow>(
          'SELECT id, kind, original_text, created_at FROM entries WHERE capture_request_id = ?',
          [input.requestId],
        );
        if (existing) {
          const linked = await this.db.all('SELECT entry_id FROM thinking_links WHERE entry_id = ?', [existing.id]);
          if (linked.length) throw new Error('This request belongs to a linked entry.');
          if (existing.kind !== input.kind || existing.original_text !== input.text) {
            throw new Error('This capture request was already saved with different content.');
          }
          const [task] = await this.db.all<{ id: string }>(
            'SELECT id FROM tasks WHERE entry_id = ?',
            [existing.id],
          );
          if (existing.kind === 'task' && !task) {
            throw new Error('The saved capture is missing its linked task.');
          }
          return { entryId: existing.id, taskId: task?.id ?? null };
        }

        const entryId = `entry_${input.requestId}`;
        const taskId = input.kind === 'task' ? `task_${input.requestId}` : null;
        const createdAt = new Date().toISOString();
        await this.db.run(
          'INSERT INTO entries(id, capture_request_id, kind, original_text, created_at) VALUES (?, ?, ?, ?, ?)',
          [entryId, input.requestId, input.kind, input.text, createdAt],
        );
        if (taskId) {
          await this.db.run(
            "INSERT INTO tasks(id, entry_id, title, status, pinned, created_at, completed_at) VALUES (?, ?, ?, 'pending', 0, ?, NULL)",
            [taskId, entryId, input.text.trim(), createdAt],
          );
        }
        if (input.kind === 'note') {
          await this.db.run('INSERT INTO today_selection(id, entry_id) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET entry_id = excluded.entry_id', [entryId]);
        }
        return { entryId, taskId };
      });
    });
  }

  setPinned(id: string, pinned: boolean): Promise<void> {
    return this.mutex.run(async () => {
      if (typeof pinned !== 'boolean') {
        throw new Error('Pin state must be true or false.');
      }
      await this.initializeLocked();
      await this.transaction(async () => {
        const [task] = await this.db.all<TaskRow>('SELECT t.* FROM tasks t JOIN entries e ON e.id = t.entry_id WHERE t.id = ? AND e.removed_at IS NULL', [id]);
        if (!task) throw new Error('Task was not found.');
        if (task.status !== 'pending') throw new Error('Only pending tasks can be pinned.');
        if (pinned && task.pinned !== 1) {
          const [count] = await this.db.all<{ total: number }>(
            'SELECT COUNT(*) AS total FROM tasks WHERE pinned = 1',
          );
          if (count.total >= 3) throw new Error('Only three tasks can be pinned.');
        }
        await this.db.run('UPDATE tasks SET pinned = ? WHERE id = ?', [pinned ? 1 : 0, id]);
      });
    });
  }

  completeTask(id: string): Promise<void> {
    return this.mutex.run(async () => {
      await this.initializeLocked();
      await this.transaction(async () => {
        const [task] = await this.db.all<TaskRow>('SELECT t.* FROM tasks t JOIN entries e ON e.id = t.entry_id WHERE t.id = ? AND e.removed_at IS NULL', [id]);
        if (!task) throw new Error('Task was not found.');
        if (task.status === 'completed') return;
        await this.db.run(
          "UPDATE tasks SET status = 'completed', pinned = 0, completed_at = ? WHERE id = ?",
          [new Date().toISOString(), id],
        );
      });
    });
  }

  saveLinked(input: LinkedInput): Promise<CaptureResult> {
    return this.mutex.run(async () => {
      if (typeof input.requestId !== 'string' || !input.requestId.trim()) throw new Error('A linked entry needs a stable request ID.');
      if (!['reflection', 'creation'].includes(input.kind)) throw new Error('Choose Reflection or Creation.');
      if (typeof input.text !== 'string' || !input.text.trim()) throw new Error('Write something before saving.');
      await this.initializeLocked();
      return this.transaction(async () => {
        const request = `linked:${input.requestId}`;
        const [existing] = await this.db.all<EntryRow>(
          `SELECT e.*, l.thinking_kind, l.source_entry_id FROM entries e
           LEFT JOIN thinking_links l ON l.entry_id = e.id WHERE e.capture_request_id = ?`, [request],
        );
        if (existing) {
          if (existing.kind !== 'note' || existing.original_text !== input.text || existing.thinking_kind !== input.kind || existing.source_entry_id !== input.sourceEntryId) {
            throw new Error('This linked request was already saved with different content or source.');
          }
          return { entryId: existing.id, taskId: null };
        }
        const [source] = await this.db.all('SELECT id FROM entries WHERE id = ? AND removed_at IS NULL', [input.sourceEntryId]);
        if (!source) throw new Error('Source entry was not found.');
        const entryId = `entry_${request}`;
        await this.db.run("INSERT INTO entries(id, capture_request_id, kind, original_text, created_at) VALUES (?, ?, 'note', ?, ?)",
          [entryId, request, input.text, new Date().toISOString()]);
        await this.db.run('INSERT INTO thinking_links(entry_id, source_entry_id, thinking_kind) VALUES (?, ?, ?)',
          [entryId, input.sourceEntryId, input.kind]);
        return { entryId, taskId: null };
      });
    });
  }

  chooseTodayNote(id: string): Promise<void> {
    return this.mutex.run(async () => {
      await this.initializeLocked();
      await this.transaction(async () => {
        const [entry] = await this.db.all<{ kind: EntryKind }>('SELECT kind FROM entries WHERE id = ? AND removed_at IS NULL', [id]);
        if (!entry || entry.kind !== 'note') throw new Error('Choose a saved note.');
        await this.db.run('INSERT INTO today_selection(id, entry_id) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET entry_id = excluded.entry_id', [id]);
      });
    });
  }

  editEntry(id: string, text: string): Promise<void> {
    return this.mutex.run(async () => {
      if (typeof text !== 'string' || !text.trim()) throw new Error('Write something before saving.');
      await this.initializeLocked();
      await this.transaction(async () => {
        const [entry] = await this.db.all('SELECT id FROM entries WHERE id = ? AND removed_at IS NULL', [id]);
        if (!entry) throw new Error('Entry was not found.');
        await this.db.run('UPDATE entries SET edited_text = ? WHERE id = ?', [text, id]);
        await this.db.run('UPDATE tasks SET title = ? WHERE entry_id = ?', [text.trim(), id]);
      });
    });
  }

  removeEntry(id: string): Promise<Removal> {
    return this.mutex.run(async () => {
      await this.initializeLocked();
      return this.transaction(async () => {
        const [entry] = await this.db.all<EntryRow>('SELECT * FROM entries WHERE id = ?', [id]);
        if (!entry) throw new Error('Entry was not found.');
        if (entry.removed_at != null) return {entryId:id, version:entry.removal_version!, pinned:entry.removed_pinned === 1, selected:entry.removed_selected === 1};
        const [task] = await this.db.all<TaskRow>('SELECT * FROM tasks WHERE entry_id = ?', [id]);
        const [selection] = await this.db.all<{entry_id:string}>('SELECT entry_id FROM today_selection WHERE id = 1');
        const removal = {entryId:id, version:entry.removal_version! + 1, pinned:task?.pinned === 1, selected:selection?.entry_id === id};
        await this.db.run('UPDATE entries SET removed_at = ?, removal_version = ?, removed_pinned = ?, removed_selected = ? WHERE id = ?',
          [new Date().toISOString(), removal.version, Number(removal.pinned), Number(removal.selected), id]);
        await this.db.run('UPDATE tasks SET pinned = 0 WHERE entry_id = ?', [id]);
        await this.db.run('DELETE FROM today_selection WHERE entry_id = ?', [id]);
        return removal;
      });
    });
  }

  restoreEntry(removal: Removal): Promise<void> {
    return this.mutex.run(async () => {
      await this.initializeLocked();
      await this.transaction(async () => {
        const [entry] = await this.db.all<EntryRow>('SELECT * FROM entries WHERE id = ?', [removal.entryId]);
        if (!entry || entry.removal_version !== removal.version) throw new Error('This removal can no longer be undone.');
        if (entry.removed_at == null) return;
        await this.db.run('UPDATE entries SET removed_at = NULL WHERE id = ?', [entry.id]);
        const [count] = await this.db.all<{total:number}>('SELECT COUNT(*) AS total FROM tasks WHERE pinned = 1');
        if (entry.removed_pinned === 1 && count.total < 3) await this.db.run("UPDATE tasks SET pinned = 1 WHERE entry_id = ? AND status = 'pending'", [entry.id]);
        if (entry.removed_selected === 1) await this.db.run('INSERT OR IGNORE INTO today_selection(id, entry_id) VALUES (1, ?)', [entry.id]);
      });
    });
  }

  private async initializeLocked(): Promise<void> {
    if (this.initialized) return;
    // PRAGMA foreign_keys must be set outside the migration transaction.
    await this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    const [foreignKeys] = await this.db.all<{ foreign_keys: number }>('PRAGMA foreign_keys');
    if (foreignKeys.foreign_keys !== 1) {
      throw new Error('The database could not enable foreign-key protection.');
    }
    await this.transaction(async () => {
      const [version] = await this.db.all<{ user_version: number }>('PRAGMA user_version');
      if (version.user_version > SCHEMA_VERSION) {
        throw new Error('This database was created by a newer Noeting version. Update the app to open it.');
      }
      if (version.user_version === 0) {
        await this.db.exec(migrationV1);
      }
      if (version.user_version < 2) {
        await this.db.exec(migrationV2);

      }
      if (version.user_version < 3) await this.db.exec(migrationV3);
      if (version.user_version < SCHEMA_VERSION) await this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    });
    this.initialized = true;
  }

  private async transaction<T>(operation: () => Promise<T>): Promise<T> {
    await this.db.exec('BEGIN IMMEDIATE;');
    try {
      const result = await operation();
      await this.db.exec('COMMIT;');
      return result;
    } catch (error) {
      try {
        await this.db.exec('ROLLBACK;');
      } catch {
        // Preserve the failure that caused the write or commit to fail.
      }
      throw error;
    }
  }
}

export function createRepository(driver: SQLiteDriver): Repository {
  return new SQLiteRepository(driver);
}
