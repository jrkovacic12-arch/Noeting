-- Frozen schema shipped in the 0.1.0 phone APK.

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

PRAGMA user_version = 1;


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

PRAGMA user_version = 2;

ALTER TABLE entries ADD COLUMN edited_text TEXT CHECK (edited_text IS NULL OR length(trim(edited_text)) > 0);
ALTER TABLE entries ADD COLUMN removed_at TEXT;
ALTER TABLE entries ADD COLUMN removal_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entries ADD COLUMN removed_pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entries ADD COLUMN removed_selected INTEGER NOT NULL DEFAULT 0;
PRAGMA user_version = 3;

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

PRAGMA user_version=4;
