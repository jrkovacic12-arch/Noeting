export type EntryKind = 'note' | 'task';

export interface Entry {
  id: string;
  kind: EntryKind;
  originalText: string;
  createdAt: string;
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

export interface Repository {
  initialize(): Promise<void>;
  readSnapshot(): Promise<Snapshot>;
  saveCapture(input: CaptureInput): Promise<CaptureResult>;
  setPinned(id: string, pinned: boolean): Promise<void>;
  completeTask(id: string): Promise<void>;
}

export type SQLiteValue = string | number | null;

/** The same repository logic runs against Expo SQLite and a real SQLite test database. */
export interface SQLiteDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, parameters?: SQLiteValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, parameters?: SQLiteValue[]): Promise<T[]>;
}

export const SCHEMA_VERSION = 1;

type EntryRow = {
  id: string;
  kind: EntryKind;
  original_text: string;
  created_at: string;
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
          'SELECT id, kind, original_text, created_at FROM entries ORDER BY created_at, rowid',
        );
        const tasks = await this.db.all<TaskRow>(
          'SELECT id, entry_id, title, status, pinned, created_at, completed_at FROM tasks ORDER BY created_at, rowid',
        );
        return {
          entries: entries.map((row) => ({
            id: row.id,
            kind: row.kind,
            originalText: row.original_text,
            createdAt: row.created_at,
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
        const [task] = await this.db.all<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
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
        const [task] = await this.db.all<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
        if (!task) throw new Error('Task was not found.');
        if (task.status === 'completed') return;
        await this.db.run(
          "UPDATE tasks SET status = 'completed', pinned = 0, completed_at = ? WHERE id = ?",
          [new Date().toISOString(), id],
        );
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
        await this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
      }
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
