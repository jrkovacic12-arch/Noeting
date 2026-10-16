PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE entries (
    id TEXT PRIMARY KEY NOT NULL,
    capture_request_id TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('note', 'task')),
    original_text TEXT NOT NULL CHECK (length(original_text) > 0),
    created_at TEXT NOT NULL
  , edited_text TEXT CHECK (edited_text IS NULL OR length(trim(edited_text)) > 0), removed_at TEXT, removal_version INTEGER NOT NULL DEFAULT 0, removed_pinned INTEGER NOT NULL DEFAULT 0, removed_selected INTEGER NOT NULL DEFAULT 0, removed_pin_at TEXT, removed_pin_order INTEGER NOT NULL DEFAULT 0);
INSERT INTO "entries" VALUES('entry_legacy-note','legacy-note','note','  Original note
kept exactly.  ','2026-10-16T02:38:25.925Z','Edited legacy note','2026-10-16T02:38:25.971Z',1,0,1,NULL,0);
INSERT INTO "entries" VALUES('entry_legacy-task','legacy-task','task','Original task','2026-10-16T02:38:25.942Z',NULL,NULL,0,0,0,NULL,0);
INSERT INTO "entries" VALUES('entry_linked:legacy-reflection','linked:legacy-reflection','note','A reflection kept as a note','2026-10-16T02:38:25.946Z',NULL,NULL,0,0,0,NULL,0);
INSERT INTO "entries" VALUES('entry_linked:legacy-creation','linked:legacy-creation','note','A creation kept as a note','2026-10-16T02:38:25.949Z',NULL,NULL,0,0,0,NULL,0);
INSERT INTO "entries" VALUES('entry_derived:legacy-derived','derived:legacy-derived','task','Independent child task','2026-10-16T02:38:25.956Z',NULL,NULL,0,0,0,NULL,0);
INSERT INTO "entries" VALUES('entry_derived:legacy-task-child','derived:legacy-task-child','task','Task from task','2026-10-16T02:38:25.960Z',NULL,NULL,0,0,0,NULL,0);
INSERT INTO "entries" VALUES('entry_v7-note','v7-note','note','V7 note original','2026-10-16T03:27:39.428Z','V7 note edited',NULL,0,0,0,NULL,0);
INSERT INTO "entries" VALUES('entry_entry-link:v7-note-task','entry-link:v7-note-task','task','V7 note-linked task','2026-10-16T03:27:39.443Z',NULL,NULL,0,0,0,NULL,0);
INSERT INTO "entries" VALUES('entry_entry-link:v7-note-note','entry-link:v7-note-note','note','V7 linked note','2026-10-16T03:27:39.449Z',NULL,NULL,0,0,0,NULL,0);
INSERT INTO "entries" VALUES('entry_entry-link:v7-task-note','entry-link:v7-task-note','note','V7 legacy task-sourced note','2026-10-16T03:27:39.456Z',NULL,NULL,0,0,0,NULL,0);
INSERT INTO "entries" VALUES('entry_entry-link:v7-task-task','entry-link:v7-task-task','task','V7 legacy task-sourced task','2026-10-16T03:27:39.463Z',NULL,NULL,0,0,0,NULL,0);
CREATE TABLE entry_sources (
    entry_id TEXT PRIMARY KEY NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    source_entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    source_text TEXT NOT NULL,
    CHECK (entry_id <> source_entry_id)
  );
INSERT INTO "entry_sources" VALUES('entry_entry-link:v7-note-task','entry_v7-note','V7 note edited');
INSERT INTO "entry_sources" VALUES('entry_entry-link:v7-note-note','entry_v7-note','V7 note edited');
INSERT INTO "entry_sources" VALUES('entry_entry-link:v7-task-note','entry_entry-link:v7-note-task','V7 note-linked task');
INSERT INTO "entry_sources" VALUES('entry_entry-link:v7-task-task','entry_entry-link:v7-note-task','V7 note-linked task');
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
INSERT INTO "scheduled_pins" VALUES('task_legacy-task','2099-01-01T00:00:00.000Z','cancelled');
CREATE TABLE task_sources (
    entry_id TEXT PRIMARY KEY NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    source_entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    source_text TEXT NOT NULL,
    CHECK (entry_id <> source_entry_id)
  );
INSERT INTO "task_sources" VALUES('entry_derived:legacy-derived','entry_legacy-note','Edited legacy note');
INSERT INTO "task_sources" VALUES('entry_derived:legacy-task-child','entry_legacy-task','Original task');
CREATE TABLE tasks (
    id TEXT PRIMARY KEY NOT NULL,
    entry_id TEXT NOT NULL UNIQUE REFERENCES entries(id) ON DELETE RESTRICT,
    title TEXT NOT NULL CHECK (length(title) > 0),
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    created_at TEXT NOT NULL,
    completed_at TEXT, pinned_at TEXT, pin_order INTEGER NOT NULL DEFAULT 0,
    CHECK (status = 'pending' OR pinned = 0),
    CHECK (
      (status = 'pending' AND completed_at IS NULL) OR
      (status = 'completed' AND completed_at IS NOT NULL)
    )
  );
INSERT INTO "tasks" VALUES('task_legacy-task','entry_legacy-task','Original task','pending',0,'2026-10-16T02:38:25.942Z',NULL,NULL,0);
INSERT INTO "tasks" VALUES('task_derived:legacy-derived','entry_derived:legacy-derived','Independent child task','completed',0,'2026-10-16T02:38:25.956Z','2026-10-16T02:38:25.963Z',NULL,0);
INSERT INTO "tasks" VALUES('task_derived:legacy-task-child','entry_derived:legacy-task-child','Task from task','pending',0,'2026-10-16T02:38:25.960Z',NULL,NULL,0);
INSERT INTO "tasks" VALUES('task_entry-link:v7-note-task','entry_entry-link:v7-note-task','V7 note-linked task','completed',0,'2026-10-16T03:27:39.443Z','2026-10-16T03:27:39.468Z',NULL,0);
INSERT INTO "tasks" VALUES('task_entry-link:v7-task-task','entry_entry-link:v7-task-task','V7 legacy task-sourced task','pending',0,'2026-10-16T03:27:39.463Z',NULL,NULL,0);
CREATE TABLE thinking_links (
    entry_id TEXT PRIMARY KEY NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    source_entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
    thinking_kind TEXT NOT NULL CHECK (thinking_kind IN ('reflection', 'creation')),
    CHECK (entry_id <> source_entry_id)
  );
INSERT INTO "thinking_links" VALUES('entry_linked:legacy-reflection','entry_legacy-note','reflection');
INSERT INTO "thinking_links" VALUES('entry_linked:legacy-creation','entry_legacy-task','creation');
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
COMMIT;
PRAGMA user_version=7;
PRAGMA foreign_keys=ON;
