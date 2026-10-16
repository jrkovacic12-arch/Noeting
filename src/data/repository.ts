export type EntryKind = "note" | "task";
export type ThinkingKind = "reflection" | "creation";

export interface Entry {
  id: string;
  kind: EntryKind;
  originalText: string;
  text: string;
  removed: boolean;
  folderId?: string | null;
  notePinnedAt?: string | null;
  lastEditedAt?: string | null;
  removalVersion?: number;
  createdAt: string;
  thinkingKind: ThinkingKind | null;
  sourceEntryId: string | null;
  sourceText?: string | null;
  taskSourceId?: string | null;
  taskSourceText?: string | null;
}

export interface Task {
  id: string;
  entryId: string;
  title: string;
  status: "pending" | "completed";
  pinned: boolean;
  pinnedAt: string | null;
  pinOrder: number;
  createdAt: string;
  completedAt: string | null;
  parentTaskId: string | null;
  parentEntryId: string | null;
  parentText: string | null;
  parentRemoved: boolean;
}

export interface NoteFolder {
  id: string;
  name: string;
  createdAt: string;
}

export interface Snapshot {
  folders?: NoteFolder[];
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
  folderId?: string | null;
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
  createFolder(id: string, name: string): Promise<void>;
  renameFolder(id: string, name: string): Promise<void>;
  removeFolder(id: string): Promise<void>;
  organizeNotes(
    ids: string[],
    change: { pinned?: boolean; folderId?: string | null },
  ): Promise<void>;
  removeNotes(ids: string[]): Promise<Removal[]>;
  restoreNotes(receipts: Removal[]): Promise<void>;
  initialize(): Promise<void>;
  readSnapshot(): Promise<Snapshot>;
  saveCapture(input: CaptureInput): Promise<CaptureResult>;
  saveLinkedEntry(
    input: CaptureInput & { sourceEntryId: string },
  ): Promise<CaptureResult>;
  saveSubtask(input: {
    requestId: string;
    parentTaskId: string;
    text: string;
  }): Promise<CaptureResult>;
  setPinned(id: string, pinned: boolean): Promise<void>;
  completeTask(id: string): Promise<void>;
  reopenTask(id: string): Promise<void>;
  saveDerivedTask(input: Omit<LinkedInput, "kind">): Promise<CaptureResult>;
  setScheduledPin(taskId: string, dueAt: string | null): Promise<void>;
  readScheduledPins(): Promise<PinSchedule[]>;
  applyDuePins(now?: string): Promise<void>;
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

export interface PinSchedule {
  taskId: string;
  dueAt: string | null;
  status: "waiting" | "applied" | "cancelled";
}

export const SCHEMA_VERSION = 9;

type EntryRow = {
  id: string;
  kind: EntryKind;
  original_text: string;
  edited_text?: string | null;
  removed_at?: string | null;
  removal_version?: number;
  removed_pinned?: number;
  removed_selected?: number;
  removed_pin_at?: string | null;
  removed_pin_order?: number;
  created_at: string;
  folder_id?: string | null;
  note_pinned_at?: string | null;
  last_edited_at?: string | null;
  thinking_kind?: ThinkingKind | null;
  source_entry_id?: string | null;
  source_text?: string | null;
  task_source_id?: string | null;
  task_source_text?: string | null;
};

type TaskRow = {
  id: string;
  entry_id: string;
  title: string;
  status: "pending" | "completed";
  pinned: number;
  pinned_at: string | null;
  pin_order: number;
  created_at: string;
  completed_at: string | null;
  parent_task_id: string | null;
  parent_entry_id: string | null;
  parent_text: string | null;
  parent_removed_at: string | null;
};

class Mutex {
  private tail: Promise<void> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
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

const migrationV4 = `
  CREATE TABLE task_sources (
    entry_id TEXT PRIMARY KEY NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    source_entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    source_text TEXT NOT NULL,
    CHECK (entry_id <> source_entry_id)
  );
  CREATE INDEX task_sources_source ON task_sources(source_entry_id);
  CREATE TRIGGER task_sources_require_kinds BEFORE INSERT ON task_sources
  WHEN (SELECT kind FROM entries WHERE id = NEW.entry_id) <> 'task'
    OR (SELECT kind FROM entries WHERE id = NEW.source_entry_id) <> 'note'
  BEGIN SELECT RAISE(ABORT, 'A derived task needs a task entry and a note source.'); END;
  CREATE TABLE reminders (
    task_id TEXT PRIMARY KEY NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
    due_at TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL CHECK(status IN ('pending','scheduled','denied','error','elapsed','cancelled')),
    error TEXT
  );
`;

const migrationV5 = `
  DROP TRIGGER tasks_pin_limit_insert;
  DROP TRIGGER tasks_pin_limit_update;
  ALTER TABLE tasks ADD COLUMN pinned_at TEXT;
  ALTER TABLE tasks ADD COLUMN pin_order INTEGER NOT NULL DEFAULT 0;
  UPDATE tasks SET pinned_at=created_at,pin_order=rowid WHERE pinned=1;
  ALTER TABLE entries ADD COLUMN removed_pin_at TEXT;
  ALTER TABLE entries ADD COLUMN removed_pin_order INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE scheduled_pins (
    task_id TEXT PRIMARY KEY NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
    due_at TEXT,
    status TEXT NOT NULL CHECK(status IN ('waiting','applied','cancelled'))
  );
  INSERT INTO scheduled_pins(task_id,due_at,status)
    SELECT r.task_id,r.due_at,'waiting' FROM reminders r
    JOIN tasks t ON t.id=r.task_id JOIN entries e ON e.id=t.entry_id
    WHERE r.due_at IS NOT NULL AND r.status NOT IN ('cancelled','elapsed')
      AND t.status='pending' AND e.removed_at IS NULL;
  UPDATE reminders SET due_at=NULL,status='cancelled',revision=revision+1,error=NULL;
`;

const migrationV6 = `
  DROP TRIGGER task_sources_require_kinds;
  CREATE TRIGGER task_sources_require_kinds BEFORE INSERT ON task_sources
  WHEN (SELECT kind FROM entries WHERE id=NEW.entry_id) <> 'task'
  BEGIN SELECT RAISE(ABORT, 'A derived task needs a task entry.'); END;
`;

// Add generic links without changing legacy classifications or provenance.
const migrationV7 = `
  CREATE TABLE entry_sources (
    entry_id TEXT PRIMARY KEY NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    source_entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    source_text TEXT NOT NULL,
    CHECK (entry_id <> source_entry_id)
  );
  CREATE INDEX entry_sources_source ON entry_sources(source_entry_id);
  UPDATE scheduled_pins SET status='cancelled' WHERE status='waiting';
`;

// Existing tasks stay roots. Legacy contextual links never imply ownership.
const migrationV8 = `
  ALTER TABLE tasks ADD COLUMN parent_task_id TEXT REFERENCES tasks(id) ON DELETE RESTRICT;
  CREATE INDEX tasks_parent ON tasks(parent_task_id);
  CREATE TRIGGER subtasks_validate_insert BEFORE INSERT ON tasks
  WHEN NEW.parent_task_id IS NOT NULL
  BEGIN
    SELECT CASE WHEN NEW.parent_task_id=NEW.id OR NOT EXISTS (
      SELECT 1 FROM tasks p JOIN entries e ON e.id=p.entry_id
      WHERE p.id=NEW.parent_task_id AND p.parent_task_id IS NULL
        AND e.kind='task' AND e.removed_at IS NULL
    ) THEN RAISE(ABORT,'Choose an existing top-level Task parent.') END;
  END;
  CREATE TRIGGER subtasks_validate_update BEFORE UPDATE OF parent_task_id,entry_id ON tasks
  BEGIN
    SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM entries WHERE id=NEW.entry_id AND kind='task')
      THEN RAISE(ABORT,'A Task needs a Task entry.') END;
    SELECT CASE WHEN NEW.parent_task_id IS NOT NULL AND (
      NEW.parent_task_id=NEW.id OR EXISTS(SELECT 1 FROM tasks WHERE parent_task_id=NEW.id) OR NOT EXISTS (
        SELECT 1 FROM tasks p JOIN entries e ON e.id=p.entry_id
        WHERE p.id=NEW.parent_task_id AND p.parent_task_id IS NULL
          AND e.kind='task' AND e.removed_at IS NULL
      )
    ) THEN RAISE(ABORT,'Choose an existing top-level Task parent.') END;
  END;
`;

const migrationV9 = `
  CREATE TABLE note_folders(id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL CHECK(length(trim(name))>0), name_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
  CREATE TABLE note_organization(entry_id TEXT PRIMARY KEY NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    folder_id TEXT REFERENCES note_folders(id) ON DELETE SET NULL, pinned_at TEXT, last_edited_at TEXT);
  CREATE INDEX note_organization_folder_pin ON note_organization(folder_id,pinned_at);
  CREATE TRIGGER organization_note_insert BEFORE INSERT ON note_organization
    WHEN (SELECT kind FROM entries WHERE id=NEW.entry_id)<>'note'
    BEGIN SELECT RAISE(ABORT,'Only Notes have organization.'); END;
  CREATE TRIGGER organization_note_update BEFORE UPDATE OF entry_id ON note_organization
    WHEN (SELECT kind FROM entries WHERE id=NEW.entry_id)<>'note'
    BEGIN SELECT RAISE(ABORT,'Only Notes have organization.'); END;
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
          `SELECT e.*, o.folder_id,o.pinned_at AS note_pinned_at,o.last_edited_at,l.thinking_kind,
             COALESCE(g.source_entry_id,l.source_entry_id,s.source_entry_id) AS source_entry_id,
             COALESCE(g.source_text,s.source_text,original.original_text) AS source_text,
             s.source_entry_id AS task_source_id, s.source_text AS task_source_text
           FROM entries e LEFT JOIN note_organization o ON o.entry_id=e.id LEFT JOIN thinking_links l ON l.entry_id = e.id
           LEFT JOIN task_sources s ON s.entry_id = e.id
           LEFT JOIN entry_sources g ON g.entry_id = e.id
           LEFT JOIN entries original ON original.id = l.source_entry_id ORDER BY e.created_at, e.rowid`,
        );
        const tasks = await this.db.all<TaskRow>(
          `SELECT t.*,p.entry_id AS parent_entry_id,COALESCE(pe.edited_text,pe.original_text) AS parent_text,
            pe.removed_at AS parent_removed_at FROM tasks t JOIN entries e ON e.id=t.entry_id
           LEFT JOIN tasks p ON p.id=t.parent_task_id LEFT JOIN entries pe ON pe.id=p.entry_id
           WHERE e.removed_at IS NULL ORDER BY t.created_at,t.rowid`,
        );
        const [selection] = await this.db.all<{ entry_id: string }>(
          "SELECT entry_id FROM today_selection WHERE id = 1",
        );
        return {
          folders: (
            await this.db.all<{ id: string; name: string; created_at: string }>(
              "SELECT * FROM note_folders ORDER BY name_key,id",
            )
          ).map((row) => ({
            id: row.id,
            name: row.name,
            createdAt: row.created_at,
          })),
          chosenEntryId: selection?.entry_id ?? null,
          entries: entries.map((row) => ({
            id: row.id,
            kind: row.kind,
            originalText: row.original_text,
            text: row.edited_text ?? row.original_text,
            removed: row.removed_at != null,
            createdAt: row.created_at,
            folderId: row.folder_id ?? null,
            notePinnedAt: row.note_pinned_at ?? null,
            lastEditedAt: row.last_edited_at ?? null,
            removalVersion: row.removal_version ?? 0,
            thinkingKind: row.thinking_kind ?? null,
            sourceEntryId: row.source_entry_id ?? null,
            sourceText: row.source_text ?? null,
            taskSourceId: row.task_source_id ?? null,
            taskSourceText: row.task_source_text ?? null,
          })),
          tasks: tasks.map((row) => ({
            id: row.id,
            entryId: row.entry_id,
            title: row.title,
            status: row.status,
            pinned: row.pinned === 1,
            pinnedAt: row.pinned_at,
            pinOrder: row.pin_order,
            createdAt: row.created_at,
            completedAt: row.completed_at,
            parentTaskId: row.parent_task_id ?? null,
            parentEntryId: row.parent_entry_id ?? null,
            parentText: row.parent_text ?? null,
            parentRemoved: row.parent_removed_at != null,
          })),
        };
      });
    });
  }

  saveCapture(input: CaptureInput): Promise<CaptureResult> {
    return this.mutex.run(async () => {
      if (typeof input.requestId !== "string" || !input.requestId.trim()) {
        throw new Error("Capture needs a stable request ID.");
      }
      if (input.kind !== "note" && input.kind !== "task") {
        throw new Error("Choose Note or Task.");
      }
      if (typeof input.text !== "string" || !input.text.trim()) {
        throw new Error("Write something before saving.");
      }
      if (input.kind === "task" && input.folderId != null)
        throw new Error("Only Notes can belong to folders.");
      await this.initializeLocked();
      return this.transaction(async () => {
        const [existing] = await this.db.all<EntryRow>(
          "SELECT id, kind, original_text, created_at FROM entries WHERE capture_request_id = ?",
          [input.requestId],
        );
        if (existing) {
          const linked = await this.db.all(
            "SELECT entry_id FROM thinking_links WHERE entry_id = ? UNION ALL SELECT entry_id FROM entry_sources WHERE entry_id = ?",
            [existing.id, existing.id],
          );
          if (linked.length)
            throw new Error("This request belongs to a linked entry.");
          const derived = await this.db.all(
            "SELECT entry_id FROM task_sources WHERE entry_id = ?",
            [existing.id],
          );
          if (derived.length)
            throw new Error("This request belongs to a derived task.");
          if (
            existing.kind !== input.kind ||
            existing.original_text !== input.text
          ) {
            throw new Error(
              "This capture request was already saved with different content.",
            );
          }
          const [task] = await this.db.all<{
            id: string;
            parent_task_id: string | null;
          }>("SELECT id,parent_task_id FROM tasks WHERE entry_id = ?", [
            existing.id,
          ]);
          if (existing.kind === "task" && !task) {
            throw new Error("The saved capture is missing its linked task.");
          }
          if (task?.parent_task_id)
            throw new Error("This request belongs to a Subtask.");
          return { entryId: existing.id, taskId: task?.id ?? null };
        }

        const entryId = `entry_${input.requestId}`;
        const taskId = input.kind === "task" ? `task_${input.requestId}` : null;
        const createdAt = new Date().toISOString();
        await this.db.run(
          "INSERT INTO entries(id, capture_request_id, kind, original_text, created_at) VALUES (?, ?, ?, ?, ?)",
          [entryId, input.requestId, input.kind, input.text, createdAt],
        );
        if (taskId) {
          await this.db.run(
            "INSERT INTO tasks(id, entry_id, title, status, pinned, created_at, completed_at) VALUES (?, ?, ?, 'pending', 0, ?, NULL)",
            [taskId, entryId, input.text.trim(), createdAt],
          );
        }
        if (input.folderId != null)
          await this.db.run(
            "INSERT INTO note_organization(entry_id,folder_id) VALUES (?,?)",
            [entryId, input.folderId],
          );
        return { entryId, taskId };
      });
    });
  }

  setPinned(id: string, pinned: boolean): Promise<void> {
    return this.mutex.run(async () => {
      if (typeof pinned !== "boolean") {
        throw new Error("Pin state must be true or false.");
      }
      await this.initializeLocked();
      await this.transaction(async () => {
        const [task] = await this.db.all<TaskRow>(
          "SELECT t.* FROM tasks t JOIN entries e ON e.id = t.entry_id WHERE t.id = ? AND e.removed_at IS NULL",
          [id],
        );
        if (!task) throw new Error("Task was not found.");
        if (task.status !== "pending")
          throw new Error("Only pending tasks can be pinned.");
        if (pinned === (task.pinned === 1)) return;
        const [order] = await this.db.all<{ next: number }>(
          "SELECT COALESCE(MAX(pin_order),0)+1 AS next FROM tasks",
        );
        await this.db.run(
          "UPDATE tasks SET pinned=?,pinned_at=?,pin_order=? WHERE id=?",
          [
            Number(pinned),
            pinned ? new Date().toISOString() : null,
            pinned ? order.next : task.pin_order,
            id,
          ],
        );
      });
    });
  }

  private async transition(id: string, status: Task["status"]): Promise<void> {
    const [task] = await this.db.all<TaskRow>(
      "SELECT * FROM tasks WHERE id=?",
      [id],
    );
    if (!task || task.status === status) return;
    await this.db.run(
      "UPDATE tasks SET status=?,completed_at=?,pinned=0,pinned_at=NULL WHERE id=?",
      [status, status === "completed" ? new Date().toISOString() : null, id],
    );
    if (status === "completed")
      await this.db.run(
        "UPDATE scheduled_pins SET due_at=NULL,status='cancelled' WHERE task_id=?",
        [id],
      );
  }
  private async reconcile(parentId: string | null): Promise<void> {
    if (!parentId) return;
    const [parent] = await this.db.all(
      "SELECT t.id FROM tasks t JOIN entries e ON e.id=t.entry_id WHERE t.id=? AND e.removed_at IS NULL",
      [parentId],
    );
    if (!parent) return;
    const rows = await this.db.all<TaskRow>(
      "SELECT t.* FROM tasks t JOIN entries e ON e.id=t.entry_id WHERE t.parent_task_id=? AND e.removed_at IS NULL",
      [parentId],
    );
    if (rows.length)
      await this.transition(
        parentId,
        rows.every((t) => t.status === "completed") ? "completed" : "pending",
      );
  }
  private changeStatus(id: string, status: Task["status"]): Promise<void> {
    return this.mutex.run(async () => {
      await this.initializeLocked();
      await this.transaction(async () => {
        const [task] = await this.db.all<TaskRow>(
          "SELECT t.* FROM tasks t JOIN entries e ON e.id=t.entry_id WHERE t.id=? AND e.removed_at IS NULL",
          [id],
        );
        if (!task) throw new Error("Task was not found.");
        await this.transition(id, status);
        if (task.parent_task_id) await this.reconcile(task.parent_task_id);
        else {
          const children = await this.db.all<{ id: string }>(
            "SELECT t.id FROM tasks t JOIN entries e ON e.id=t.entry_id WHERE t.parent_task_id=? AND e.removed_at IS NULL",
            [id],
          );
          for (const child of children) await this.transition(child.id, status);
        }
      });
    });
  }
  completeTask(id: string) {
    return this.changeStatus(id, "completed");
  }
  reopenTask(id: string) {
    return this.changeStatus(id, "pending");
  }

  saveDerivedTask(input: Omit<LinkedInput, "kind">): Promise<CaptureResult> {
    return this.mutex.run(async () => {
      if (typeof input.requestId !== "string" || !input.requestId.trim())
        throw new Error("A task needs a stable request ID.");
      if (typeof input.text !== "string" || !input.text.trim())
        throw new Error("Write something before saving.");
      await this.initializeLocked();
      return this.transaction(async () => {
        const request = `derived:${input.requestId}`;
        const [existing] = await this.db.all<EntryRow>(
          `SELECT e.*, s.source_entry_id FROM entries e LEFT JOIN task_sources s ON s.entry_id = e.id WHERE e.capture_request_id = ?`,
          [request],
        );
        if (existing) {
          if (
            existing.kind !== "task" ||
            existing.original_text !== input.text ||
            existing.source_entry_id !== input.sourceEntryId
          )
            throw new Error(
              "This task request was already saved with different content or source.",
            );
          const [task] = await this.db.all<{ id: string }>(
            "SELECT id FROM tasks WHERE entry_id = ?",
            [existing.id],
          );
          if (!task) throw new Error("The saved task is missing.");
          return { entryId: existing.id, taskId: task.id };
        }
        const [source] = await this.db.all<EntryRow>(
          "SELECT * FROM entries WHERE id = ? AND removed_at IS NULL",
          [input.sourceEntryId],
        );
        if (!source) throw new Error("Source entry was not found.");
        if (source.kind !== "note")
          throw new Error("Only Notes can create linked entries.");
        const entryId = `entry_${request}`,
          taskId = `task_${request}`,
          createdAt = new Date().toISOString();
        await this.db.run(
          "INSERT INTO entries(id,capture_request_id,kind,original_text,created_at) VALUES (?,?,'task',?,?)",
          [entryId, request, input.text, createdAt],
        );
        await this.db.run(
          "INSERT INTO tasks(id,entry_id,title,status,pinned,created_at,completed_at) VALUES (?,?,?,'pending',0,?,NULL)",
          [taskId, entryId, input.text.trim(), createdAt],
        );
        await this.db.run(
          "INSERT INTO task_sources(entry_id,source_entry_id,source_text) VALUES (?,?,?)",
          [entryId, source.id, source.edited_text ?? source.original_text],
        );
        return { entryId, taskId };
      });
    });
  }

  saveSubtask(input: {
    requestId: string;
    parentTaskId: string;
    text: string;
  }): Promise<CaptureResult> {
    return this.mutex.run(async () => {
      if (typeof input.requestId !== "string" || !input.requestId.trim())
        throw new Error("A Subtask needs a stable request ID.");
      if (typeof input.text !== "string" || !input.text.trim())
        throw new Error("Write something before saving.");
      await this.initializeLocked();
      return this.transaction(async () => {
        const request = `subtask:${input.requestId}`;
        const [existing] = await this.db.all<
          EntryRow & { task_id: string; parent_task_id: string }
        >(
          `SELECT e.*,t.id AS task_id,t.parent_task_id FROM entries e LEFT JOIN tasks t ON t.entry_id=e.id WHERE e.capture_request_id=?`,
          [request],
        );
        if (existing) {
          if (
            existing.kind !== "task" ||
            !existing.task_id ||
            existing.original_text !== input.text ||
            existing.parent_task_id !== input.parentTaskId
          )
            throw new Error(
              "This Subtask request was already saved with different content or parent.",
            );
          return { entryId: existing.id, taskId: existing.task_id };
        }
        const [parent] = await this.db.all<{ id: string }>(
          `SELECT t.id FROM tasks t JOIN entries e ON e.id=t.entry_id
           WHERE t.id=? AND t.parent_task_id IS NULL AND e.kind='task' AND e.removed_at IS NULL`,
          [input.parentTaskId],
        );
        if (!parent)
          throw new Error("Choose an existing top-level Task parent.");
        const entryId = `entry_${request}`,
          taskId = `task_${request}`,
          createdAt = new Date().toISOString();
        await this.db.run(
          "INSERT INTO entries(id,capture_request_id,kind,original_text,created_at) VALUES (?,?,'task',?,?)",
          [entryId, request, input.text, createdAt],
        );
        await this.db.run(
          "INSERT INTO tasks(id,entry_id,title,status,pinned,created_at,completed_at,parent_task_id) VALUES (?,?,?,'pending',0,?,NULL,?)",
          [taskId, entryId, input.text.trim(), createdAt, parent.id],
        );
        await this.reconcile(parent.id);
        return { entryId, taskId };
      });
    });
  }

  setScheduledPin(taskId: string, dueAt: string | null): Promise<void> {
    return this.mutex.run(async () => {
      if (
        dueAt !== null &&
        (!Number.isFinite(Date.parse(dueAt)) || Date.parse(dueAt) <= Date.now())
      )
        throw new Error("Choose a future pin time.");
      await this.initializeLocked();
      await this.transaction(async () => {
        const [task] = await this.db.all<TaskRow>(
          "SELECT t.* FROM tasks t JOIN entries e ON e.id=t.entry_id WHERE t.id=? AND e.removed_at IS NULL",
          [taskId],
        );
        if (!task || task.status !== "pending")
          throw new Error("Choose a pending task.");
        await this.db.run(
          `INSERT INTO scheduled_pins(task_id,due_at,status) VALUES (?,?,?)
          ON CONFLICT(task_id) DO UPDATE SET due_at=excluded.due_at,status=excluded.status`,
          [
            taskId,
            dueAt === null ? null : new Date(dueAt).toISOString(),
            dueAt === null ? "cancelled" : "waiting",
          ],
        );
      });
    });
  }

  readScheduledPins(): Promise<PinSchedule[]> {
    return this.mutex.run(async () => {
      await this.initializeLocked();
      const rows = await this.db.all<{
        task_id: string;
        due_at: string | null;
        status: PinSchedule["status"];
      }>("SELECT * FROM scheduled_pins");
      return rows.map((row) => ({
        taskId: row.task_id,
        dueAt: row.due_at,
        status: row.status,
      }));
    });
  }

  /** Retained for upgrade callers; scheduling is retired in the minimal app. */
  async applyDuePins(_now?: string): Promise<void> {
    await this.initialize();
  }

  saveLinkedEntry(
    input: CaptureInput & { sourceEntryId: string },
  ): Promise<CaptureResult> {
    return this.mutex.run(async () => {
      if (typeof input.requestId !== "string" || !input.requestId.trim())
        throw new Error("A linked entry needs a stable request ID.");
      if (input.kind !== "note" && input.kind !== "task")
        throw new Error("Choose Note or Task.");
      if (typeof input.text !== "string" || !input.text.trim())
        throw new Error("Write something before saving.");
      await this.initializeLocked();
      return this.transaction(async () => {
        const request = `entry-link:${input.requestId}`;
        const [existing] = await this.db.all<EntryRow>(
          `SELECT e.*,s.source_entry_id FROM entries e LEFT JOIN entry_sources s ON s.entry_id=e.id WHERE e.capture_request_id=?`,
          [request],
        );
        if (existing) {
          if (
            existing.kind !== input.kind ||
            existing.original_text !== input.text ||
            existing.source_entry_id !== input.sourceEntryId
          )
            throw new Error(
              "This request was already saved with different content or source.",
            );
          const [task] = await this.db.all<{ id: string }>(
            "SELECT id FROM tasks WHERE entry_id=?",
            [existing.id],
          );
          if (input.kind === "task" && !task)
            throw new Error("The saved task is missing.");
          return { entryId: existing.id, taskId: task?.id ?? null };
        }
        const [source] = await this.db.all<EntryRow>(
          "SELECT * FROM entries WHERE id=? AND removed_at IS NULL",
          [input.sourceEntryId],
        );
        if (!source) throw new Error("Source entry was not found.");
        if (source.kind !== "note")
          throw new Error("Only Notes can create linked entries.");
        // Every link points from a new entry to an existing source, so cycles cannot form.
        const entryId = `entry_${request}`,
          taskId = input.kind === "task" ? `task_${request}` : null;
        const createdAt = new Date().toISOString();
        await this.db.run(
          "INSERT INTO entries(id,capture_request_id,kind,original_text,created_at) VALUES (?,?,?,?,?)",
          [entryId, request, input.kind, input.text, createdAt],
        );
        if (taskId)
          await this.db.run(
            "INSERT INTO tasks(id,entry_id,title,status,pinned,created_at,completed_at) VALUES (?,?,?,'pending',0,?,NULL)",
            [taskId, entryId, input.text.trim(), createdAt],
          );
        await this.db.run(
          "INSERT INTO entry_sources(entry_id,source_entry_id,source_text) VALUES (?,?,?)",
          [entryId, source.id, source.edited_text ?? source.original_text],
        );
        if (input.kind === "note" && input.folderId != null)
          await this.db.run(
            "INSERT INTO note_organization(entry_id,folder_id) VALUES (?,?)",
            [entryId, input.folderId],
          );
        return { entryId, taskId };
      });
    });
  }

  saveLinked(input: LinkedInput): Promise<CaptureResult> {
    return this.mutex.run(async () => {
      if (typeof input.requestId !== "string" || !input.requestId.trim())
        throw new Error("A linked entry needs a stable request ID.");
      if (!["reflection", "creation"].includes(input.kind))
        throw new Error("Choose Reflection or Creation.");
      if (typeof input.text !== "string" || !input.text.trim())
        throw new Error("Write something before saving.");
      await this.initializeLocked();
      return this.transaction(async () => {
        const request = `linked:${input.requestId}`;
        const [existing] = await this.db.all<EntryRow>(
          `SELECT e.*, l.thinking_kind, l.source_entry_id FROM entries e
           LEFT JOIN thinking_links l ON l.entry_id = e.id WHERE e.capture_request_id = ?`,
          [request],
        );
        if (existing) {
          if (
            existing.kind !== "note" ||
            existing.original_text !== input.text ||
            existing.thinking_kind !== input.kind ||
            existing.source_entry_id !== input.sourceEntryId
          ) {
            throw new Error(
              "This linked request was already saved with different content or source.",
            );
          }
          return { entryId: existing.id, taskId: null };
        }
        const [source] = await this.db.all<{ id: string; kind: EntryKind }>(
          "SELECT id,kind FROM entries WHERE id = ? AND removed_at IS NULL",
          [input.sourceEntryId],
        );
        if (!source) throw new Error("Source entry was not found.");
        if (source.kind !== "note")
          throw new Error("Only Notes can create linked entries.");
        const entryId = `entry_${request}`;
        await this.db.run(
          "INSERT INTO entries(id, capture_request_id, kind, original_text, created_at) VALUES (?, ?, 'note', ?, ?)",
          [entryId, request, input.text, new Date().toISOString()],
        );
        await this.db.run(
          "INSERT INTO thinking_links(entry_id, source_entry_id, thinking_kind) VALUES (?, ?, ?)",
          [entryId, input.sourceEntryId, input.kind],
        );
        return { entryId, taskId: null };
      });
    });
  }

  chooseTodayNote(id: string): Promise<void> {
    return this.mutex.run(async () => {
      await this.initializeLocked();
      await this.transaction(async () => {
        const [entry] = await this.db.all<{ kind: EntryKind }>(
          "SELECT kind FROM entries WHERE id = ? AND removed_at IS NULL",
          [id],
        );
        if (!entry || entry.kind !== "note")
          throw new Error("Choose a saved note.");
        await this.db.run(
          "INSERT INTO today_selection(id, entry_id) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET entry_id = excluded.entry_id",
          [id],
        );
      });
    });
  }

  editEntry(id: string, text: string): Promise<void> {
    return this.mutex.run(async () => {
      if (typeof text !== "string" || !text.trim())
        throw new Error("Write something before saving.");
      await this.initializeLocked();
      await this.transaction(async () => {
        const [entry] = await this.db.all<{
          kind: EntryKind;
          edited_text: string | null;
          original_text: string;
        }>("SELECT * FROM entries WHERE id = ? AND removed_at IS NULL", [id]);
        if (!entry) throw new Error("Entry was not found.");
        if ((entry.edited_text ?? entry.original_text) === text) return;
        await this.db.run("UPDATE entries SET edited_text = ? WHERE id = ?", [
          text,
          id,
        ]);
        if (entry.kind === "note")
          await this.db.run(
            "INSERT INTO note_organization(entry_id,last_edited_at) VALUES (?,?) ON CONFLICT(entry_id) DO UPDATE SET last_edited_at=excluded.last_edited_at",
            [id, new Date().toISOString()],
          );
        await this.db.run("UPDATE tasks SET title = ? WHERE entry_id = ?", [
          text.trim(),
          id,
        ]);
      });
    });
  }

  removeEntry(id: string): Promise<Removal> {
    return this.mutex.run(async () => {
      await this.initializeLocked();
      return this.transaction(async () => {
        const [entry] = await this.db.all<EntryRow>(
          "SELECT * FROM entries WHERE id = ?",
          [id],
        );
        if (!entry) throw new Error("Entry was not found.");
        if (entry.removed_at != null)
          return {
            entryId: id,
            version: entry.removal_version!,
            pinned: entry.removed_pinned === 1,
            selected: entry.removed_selected === 1,
          };
        const [task] = await this.db.all<TaskRow>(
          "SELECT * FROM tasks WHERE entry_id = ?",
          [id],
        );
        const [selection] = await this.db.all<{ entry_id: string }>(
          "SELECT entry_id FROM today_selection WHERE id = 1",
        );
        const removal = {
          entryId: id,
          version: entry.removal_version! + 1,
          pinned: task?.pinned === 1,
          selected: selection?.entry_id === id,
        };
        await this.db.run(
          "UPDATE entries SET removed_at = ?, removal_version = ?, removed_pinned = ?, removed_selected = ?, removed_pin_at = ?, removed_pin_order = ? WHERE id = ?",
          [
            new Date().toISOString(),
            removal.version,
            Number(removal.pinned),
            Number(removal.selected),
            task?.pinned_at ?? null,
            task?.pin_order ?? 0,
            id,
          ],
        );
        await this.db.run(
          "UPDATE tasks SET pinned = 0, pinned_at = NULL WHERE entry_id = ?",
          [id],
        );
        await this.db.run(
          "UPDATE scheduled_pins SET due_at=NULL,status='cancelled' WHERE task_id IN (SELECT id FROM tasks WHERE entry_id=?)",
          [id],
        );
        await this.db.run("DELETE FROM today_selection WHERE entry_id = ?", [
          id,
        ]);
        if (task?.parent_task_id) await this.reconcile(task.parent_task_id);
        return removal;
      });
    });
  }

  restoreEntry(removal: Removal): Promise<void> {
    return this.mutex.run(async () => {
      await this.initializeLocked();
      await this.transaction(async () => {
        const [entry] = await this.db.all<EntryRow>(
          "SELECT * FROM entries WHERE id = ?",
          [removal.entryId],
        );
        if (!entry || entry.removal_version !== removal.version)
          throw new Error("This removal can no longer be undone.");
        if (entry.removed_at == null) return;
        await this.db.run("UPDATE entries SET removed_at = NULL WHERE id = ?", [
          entry.id,
        ]);
        if (entry.removed_pinned === 1) {
          const [order] = await this.db.all<{ next: number }>(
            "SELECT COALESCE(MAX(pin_order),0)+1 AS next FROM tasks",
          );
          await this.db.run(
            "UPDATE tasks SET pinned=1,pinned_at=?,pin_order=? WHERE entry_id=? AND status='pending'",
            [
              entry.removed_pin_at ?? new Date().toISOString(),
              entry.removed_pin_order || order.next,
              entry.id,
            ],
          );
        }
        const [task] = await this.db.all<TaskRow>(
          "SELECT * FROM tasks WHERE entry_id=?",
          [entry.id],
        );
        if (task) await this.reconcile(task.parent_task_id ?? task.id);
        if (entry.removed_selected === 1)
          await this.db.run(
            "INSERT OR IGNORE INTO today_selection(id, entry_id) VALUES (1, ?)",
            [entry.id],
          );
      });
    });
  }

  private folderName(name: string) {
    if (typeof name !== "string" || !name.trim())
      throw new Error("Enter a folder name.");
    const display = name.trim();
    return {
      display,
      key: display.normalize("NFKC").toLocaleLowerCase("en-US"),
    };
  }
  createFolder(id: string, name: string): Promise<void> {
    return this.mutex.run(async () => {
      await this.initializeLocked();
      const n = this.folderName(name);
      if (!id.trim()) throw new Error("Missing folder ID.");
      await this.transaction(async () => {
        const [old] = await this.db.all<{ name_key: string }>(
          "SELECT name_key FROM note_folders WHERE id=?",
          [id],
        );
        if (old) {
          if (old.name_key !== n.key)
            throw new Error("Folder request changed.");
          return;
        }
        await this.db.run(
          "INSERT INTO note_folders(id,name,name_key,created_at) VALUES (?,?,?,?)",
          [id, n.display, n.key, new Date().toISOString()],
        );
      });
    });
  }
  renameFolder(id: string, name: string): Promise<void> {
    return this.mutex.run(async () => {
      await this.initializeLocked();
      const n = this.folderName(name);
      await this.transaction(async () => {
        const result = await this.db.run(
          "UPDATE note_folders SET name=?,name_key=? WHERE id=?",
          [n.display, n.key, id],
        );
        if (!result.changes) throw new Error("Folder not found.");
      });
    });
  }
  removeFolder(id: string): Promise<void> {
    return this.mutex.run(async () => {
      await this.initializeLocked();
      await this.transaction(async () => {
        await this.db.run("DELETE FROM note_folders WHERE id=?", [id]);
      });
    });
  }
  private async validateNotes(ids: string[], active = true) {
    const unique = [...new Set(ids)].sort();
    if (!unique.length) throw new Error("Select Notes.");
    for (const id of unique) {
      const [e] = await this.db.all<{
        kind: EntryKind;
        removed_at: string | null;
      }>("SELECT kind,removed_at FROM entries WHERE id=?", [id]);
      if (!e || e.kind !== "note" || (active && e.removed_at !== null))
        throw new Error("Choose active Notes.");
    }
    return unique;
  }
  organizeNotes(
    ids: string[],
    change: { pinned?: boolean; folderId?: string | null },
  ): Promise<void> {
    return this.mutex.run(async () => {
      await this.initializeLocked();
      await this.transaction(async () => {
        const selected = await this.validateNotes(ids);
        if (change.pinned !== undefined && typeof change.pinned !== "boolean")
          throw new Error("Invalid pin state.");
        if (change.folderId != null) {
          const [f] = await this.db.all(
            "SELECT id FROM note_folders WHERE id=?",
            [change.folderId],
          );
          if (!f) throw new Error("Folder not found.");
        }
        const now = new Date().toISOString();
        for (const id of selected) {
          await this.db.run(
            "INSERT OR IGNORE INTO note_organization(entry_id) VALUES (?)",
            [id],
          );
          if (change.pinned !== undefined)
            await this.db.run(
              "UPDATE note_organization SET pinned_at=CASE WHEN ?=1 THEN COALESCE(pinned_at,?) ELSE NULL END WHERE entry_id=?",
              [Number(change.pinned), now, id],
            );
          if ("folderId" in change)
            await this.db.run(
              "UPDATE note_organization SET folder_id=? WHERE entry_id=?",
              [change.folderId ?? null, id],
            );
        }
      });
    });
  }
  removeNotes(ids: string[]): Promise<Removal[]> {
    return this.mutex.run(async () => {
      await this.initializeLocked();
      return this.transaction(async () => {
        const selected = await this.validateNotes(ids);
        const receipts: Removal[] = [];
        for (const id of selected) {
          const [e] = await this.db.all<EntryRow>(
            "SELECT * FROM entries WHERE id=?",
            [id],
          );
          const [chosen] = await this.db.all<{ entry_id: string }>(
            "SELECT entry_id FROM today_selection WHERE id=1",
          );
          const receipt = {
            entryId: id,
            version: (e.removal_version ?? 0) + 1,
            pinned: false,
            selected: chosen?.entry_id === id,
          };
          await this.db.run(
            "UPDATE entries SET removed_at=?,removal_version=?,removed_pinned=0,removed_selected=? WHERE id=?",
            [
              new Date().toISOString(),
              receipt.version,
              Number(receipt.selected),
              id,
            ],
          );
          await this.db.run("DELETE FROM today_selection WHERE entry_id=?", [
            id,
          ]);
          receipts.push(receipt);
        }
        return receipts;
      });
    });
  }
  restoreNotes(receipts: Removal[]): Promise<void> {
    return this.mutex.run(async () => {
      await this.initializeLocked();
      await this.transaction(async () => {
        await this.validateNotes(
          receipts.map((r) => r.entryId),
          false,
        );
        for (const r of receipts) {
          const [e] = await this.db.all<EntryRow>(
            "SELECT * FROM entries WHERE id=?",
            [r.entryId],
          );
          if (e.removal_version !== r.version)
            throw new Error("Removal changed.");
          await this.db.run("UPDATE entries SET removed_at=NULL WHERE id=?", [
            r.entryId,
          ]);
          if (e.removed_selected === 1)
            await this.db.run(
              "INSERT OR IGNORE INTO today_selection(id,entry_id) VALUES (1,?)",
              [r.entryId],
            );
        }
      });
    });
  }

  private async initializeLocked(): Promise<void> {
    if (this.initialized) return;
    // PRAGMA foreign_keys must be set outside the migration transaction.
    await this.db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    const [foreignKeys] = await this.db.all<{ foreign_keys: number }>(
      "PRAGMA foreign_keys",
    );
    if (foreignKeys.foreign_keys !== 1) {
      throw new Error("The database could not enable foreign-key protection.");
    }
    await this.transaction(async () => {
      const [version] = await this.db.all<{ user_version: number }>(
        "PRAGMA user_version",
      );
      if (version.user_version > SCHEMA_VERSION) {
        throw new Error(
          "This database was created by a newer Noeting version. Update the app to open it.",
        );
      }
      if (version.user_version === 0) {
        await this.db.exec(migrationV1);
      }
      if (version.user_version < 2) {
        await this.db.exec(migrationV2);
      }
      if (version.user_version < 3) await this.db.exec(migrationV3);
      if (version.user_version < 4) await this.db.exec(migrationV4);
      if (version.user_version < 5) await this.db.exec(migrationV5);
      if (version.user_version < 6) await this.db.exec(migrationV6);
      if (version.user_version < 7) await this.db.exec(migrationV7);
      if (version.user_version < 8) await this.db.exec(migrationV8);
      if (version.user_version < 9) await this.db.exec(migrationV9);
      if (version.user_version < SCHEMA_VERSION)
        await this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    });
    this.initialized = true;
  }

  private async transaction<T>(operation: () => Promise<T>): Promise<T> {
    await this.db.exec("BEGIN IMMEDIATE;");
    try {
      const result = await operation();
      await this.db.exec("COMMIT;");
      return result;
    } catch (error) {
      try {
        await this.db.exec("ROLLBACK;");
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
