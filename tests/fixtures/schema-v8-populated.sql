PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE entries (
    id TEXT PRIMARY KEY NOT NULL,
    capture_request_id TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('note', 'task')),
    original_text TEXT NOT NULL CHECK (length(original_text) > 0),
    created_at TEXT NOT NULL
  , edited_text TEXT CHECK (edited_text IS NULL OR length(trim(edited_text)) > 0), removed_at TEXT, removal_version INTEGER NOT NULL DEFAULT 0, removed_pinned INTEGER NOT NULL DEFAULT 0, removed_selected INTEGER NOT NULL DEFAULT 0, removed_pin_at TEXT, removed_pin_order INTEGER NOT NULL DEFAULT 0);
INSERT INTO "entries" VALUES('entry_v8-note','v8-note','note',' Original 🌿
Second line ','2026-10-16T10:11:27.806Z','Edited 🌿',NULL,0,0,0,NULL,0);
INSERT INTO "entries" VALUES('entry_entry-link:v8-parent','entry-link:v8-parent','task','Parent','2026-10-16T10:11:27.816Z',NULL,NULL,0,0,0,NULL,0);
INSERT INTO "entries" VALUES('entry_subtask:v8-a','subtask:v8-a','task','Child A','2026-10-16T10:11:27.821Z',NULL,NULL,0,0,0,NULL,0);
INSERT INTO "entries" VALUES('entry_subtask:v8-b','subtask:v8-b','task','Child B','2026-10-16T10:11:27.824Z',NULL,NULL,0,0,0,NULL,0);
INSERT INTO "entries" VALUES('entry_v8-removed','v8-removed','note','Removed','2026-10-16T10:11:27.834Z',NULL,'2026-10-16T10:11:27.838Z',1,0,0,NULL,0);
CREATE TABLE entry_sources (
    entry_id TEXT PRIMARY KEY NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    source_entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    source_text TEXT NOT NULL,
    CHECK (entry_id <> source_entry_id)
  );
INSERT INTO "entry_sources" VALUES('entry_entry-link:v8-parent','entry_v8-note','Edited 🌿');
CREATE TABLE reminders (
    task_id TEXT PRIMARY KEY NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
    due_at TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL CHECK(status IN ('pending','scheduled','denied','error','elapsed','cancelled')),
    error TEXT
  );
CREATE TABLE scheduled_pins (
    task_id TEXT PRIMARY KEY NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
    due_at TEXT,
    status TEXT NOT NULL CHECK(status IN ('waiting','applied','cancelled'))
  );
CREATE TABLE task_sources (
    entry_id TEXT PRIMARY KEY NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    source_entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    source_text TEXT NOT NULL,
    CHECK (entry_id <> source_entry_id)
  );
CREATE TABLE tasks (
    id TEXT PRIMARY KEY NOT NULL,
    entry_id TEXT NOT NULL UNIQUE REFERENCES entries(id) ON DELETE RESTRICT,
    title TEXT NOT NULL CHECK (length(title) > 0),
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    created_at TEXT NOT NULL,
    completed_at TEXT, pinned_at TEXT, pin_order INTEGER NOT NULL DEFAULT 0, parent_task_id TEXT REFERENCES tasks(id) ON DELETE RESTRICT,
    CHECK (status = 'pending' OR pinned = 0),
    CHECK (
      (status = 'pending' AND completed_at IS NULL) OR
      (status = 'completed' AND completed_at IS NOT NULL)
    )
  );
INSERT INTO "tasks" VALUES('task_entry-link:v8-parent','entry_entry-link:v8-parent','Parent','pending',1,'2026-10-16T10:11:27.816Z',NULL,'2026-10-16T10:11:27.831Z',1,NULL);
INSERT INTO "tasks" VALUES('task_subtask:v8-a','entry_subtask:v8-a','Child A','completed',0,'2026-10-16T10:11:27.821Z','2026-10-16T10:11:27.828Z',NULL,0,'task_entry-link:v8-parent');
INSERT INTO "tasks" VALUES('task_subtask:v8-b','entry_subtask:v8-b','Child B','pending',0,'2026-10-16T10:11:27.824Z',NULL,NULL,0,'task_entry-link:v8-parent');
CREATE TABLE thinking_links (
    entry_id TEXT PRIMARY KEY NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    source_entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    thinking_kind TEXT NOT NULL CHECK (thinking_kind IN ('reflection', 'creation')),
    CHECK (entry_id <> source_entry_id)
  );
CREATE TABLE today_selection (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE RESTRICT
  );
CREATE INDEX tasks_status_pinned ON tasks(status, pinned);
CREATE TRIGGER tasks_require_task_entry
  BEFORE INSERT ON tasks
  WHEN (SELECT kind FROM entries WHERE id = NEW.entry_id) <> 'task'
  BEGIN
    SELECT RAISE(ABORT, 'A directly captured task must link to a task entry.');
  END;
CREATE INDEX thinking_links_source ON thinking_links(source_entry_id);
CREATE TRIGGER thinking_links_require_note BEFORE INSERT ON thinking_links
  WHEN (SELECT kind FROM entries WHERE id = NEW.entry_id) <> 'note'
  BEGIN SELECT RAISE(ABORT, 'Linked thinking must be a note entry.'); END;
CREATE INDEX task_sources_source ON task_sources(source_entry_id);
CREATE TRIGGER task_sources_require_kinds BEFORE INSERT ON task_sources
  WHEN (SELECT kind FROM entries WHERE id=NEW.entry_id) <> 'task'
  BEGIN SELECT RAISE(ABORT, 'A derived task needs a task entry.'); END;
CREATE INDEX entry_sources_source ON entry_sources(source_entry_id);
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
COMMIT;
PRAGMA user_version=8;
PRAGMA foreign_keys=ON;
