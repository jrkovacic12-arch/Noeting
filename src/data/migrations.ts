// Historical SQL is preserved verbatim; initialization/transactions remain in repository.ts.
export const migrationV1 = `
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

export const migrationV2 = `
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

export const migrationV3 = `
  ALTER TABLE entries ADD COLUMN edited_text TEXT CHECK (edited_text IS NULL OR length(trim(edited_text)) > 0);
  ALTER TABLE entries ADD COLUMN removed_at TEXT;
  ALTER TABLE entries ADD COLUMN removal_version INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE entries ADD COLUMN removed_pinned INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE entries ADD COLUMN removed_selected INTEGER NOT NULL DEFAULT 0;
`;

export const migrationV4 = `
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

export const migrationV5 = `
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

export const migrationV6 = `
  DROP TRIGGER task_sources_require_kinds;
  CREATE TRIGGER task_sources_require_kinds BEFORE INSERT ON task_sources
  WHEN (SELECT kind FROM entries WHERE id=NEW.entry_id) <> 'task'
  BEGIN SELECT RAISE(ABORT, 'A derived task needs a task entry.'); END;
`;

// Add generic links without changing legacy classifications or provenance.
export const migrationV7 = `
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
export const migrationV8 = `
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

export const migrationV9 = `
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

export const migrationV10 = `ALTER TABLE note_folders ADD COLUMN pinned_at TEXT;`;

// v11 generates canonical change-tracking triggers from the versioned sync schema.
export { migrationV11 } from "../sync/schema";

// Orchestration metadata only. v11 canonical records/protocol/journal stay intact.
export const migrationV12 = `
CREATE TABLE sync_auto_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), origin TEXT, credential_key TEXT,
 device_id TEXT, peer_id TEXT, library_id TEXT,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 generation INTEGER NOT NULL DEFAULT 0, auth_required INTEGER NOT NULL DEFAULT 0,
 last_attempt TEXT, last_reason TEXT, failures INTEGER NOT NULL DEFAULT 0,
 retry_after INTEGER NOT NULL DEFAULT 0, poll_ms INTEGER NOT NULL DEFAULT 60000,
 cleanup_pending INTEGER NOT NULL DEFAULT 0
);
INSERT INTO sync_auto_settings(id) VALUES(1);
CREATE TABLE sync_session_lease (
 id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT, epoch INTEGER NOT NULL DEFAULT 0,
 expires_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO sync_session_lease(id) VALUES(1);
CREATE TABLE sync_foreground_presence (
 id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT, expires_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO sync_foreground_presence(id) VALUES(1);
CREATE TABLE sync_transfer_progress (
 id TEXT PRIMARY KEY, descriptor TEXT NOT NULL, next_part INTEGER NOT NULL DEFAULT 0,
 payload TEXT NOT NULL DEFAULT ''
);
`;
