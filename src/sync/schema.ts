/** Canonical persisted columns only. Display joins, navigation and drafts are excluded. */
export const columns = {
  entries: [
    "id",
    "capture_request_id",
    "kind",
    "original_text",
    "created_at",
    "edited_text",
    "removed_at",
    "removal_version",
    "removed_pinned",
    "removed_selected",
    "removed_pin_at",
    "removed_pin_order",
  ],
  tasks: [
    "id",
    "entry_id",
    "title",
    "status",
    "pinned",
    "created_at",
    "completed_at",
    "pinned_at",
    "pin_order",
    "parent_task_id",
  ],
  thinking_links: ["entry_id", "source_entry_id", "thinking_kind"],
  task_sources: ["entry_id", "source_entry_id", "source_text"],
  entry_sources: ["entry_id", "source_entry_id", "source_text"],
  note_folders: ["id", "name", "name_key", "created_at", "pinned_at"],
  note_organization: ["entry_id", "folder_id", "pinned_at", "last_edited_at"],
  reminders: ["task_id", "due_at", "revision", "status", "error"],
  scheduled_pins: ["task_id", "due_at", "status"],
} as const;
export type Table = keyof typeof columns;
export type Row = Record<string, string | number | null>;
export type RecordValue = { table: Table; id: string; value: Row | null };
export type Change = RecordValue & { base: number; previous: string | null };
export type Operation = {
  protocol: 2;
  id: string;
  origin: string;
  changes: Change[];
  resolves?: string;
  resolvedOperations?: string[];
};
export type Event = { revision: number; operation: Operation };
export const tables = Object.keys(columns) as Table[];
export const keyOf = (r: { table: string; id: string }) => `${r.table}:${r.id}`;
export const primaryKey = (table: Table) => columns[table][0];
export const MAX_BODY = 1_000_000;
export const PAGE_SIZE = 100;
// Random identity comes from SQLite randomblob, not clocks or UI request identities.
export const randomIdSQL = "lower(hex(randomblob(16)))";

export const migrationV11 = `
CREATE TABLE sync_v2_identity (id INTEGER PRIMARY KEY CHECK(id=1), device_id TEXT NOT NULL UNIQUE, library_id TEXT, peer_id TEXT, cursor INTEGER NOT NULL DEFAULT 0, last_success TEXT);
INSERT INTO sync_v2_identity(id,device_id) VALUES(1,${randomIdSQL});
CREATE TABLE sync_v2_versions (table_name TEXT NOT NULL, entity_id TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, operation_id TEXT, tombstone INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(table_name,entity_id));
CREATE TABLE sync_v2_outbox (id TEXT PRIMARY KEY, payload TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','conflict','superseded','accepted')));
CREATE TABLE sync_v2_seen (id TEXT PRIMARY KEY, outcome TEXT NOT NULL);
CREATE TABLE sync_v2_history (revision INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL);
CREATE TABLE sync_v2_conflicts (id TEXT PRIMARY KEY, payload TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','resolved')));
CREATE TABLE sync_v2_dirty (table_name TEXT NOT NULL, entity_id TEXT NOT NULL, before_json TEXT, PRIMARY KEY(table_name,entity_id));
CREATE TABLE sync_v2_bootstrap (session TEXT NOT NULL, table_name TEXT NOT NULL, entity_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(session,table_name,entity_id));
CREATE TABLE sync_v2_transfers (transfer_id TEXT NOT NULL, device_id TEXT NOT NULL, part INTEGER NOT NULL, text TEXT NOT NULL, PRIMARY KEY(transfer_id,device_id,part));
CREATE TABLE sync_v2_pairing (device_id TEXT PRIMARY KEY, revoked INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_v2_reads (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, payload TEXT NOT NULL);
CREATE TABLE sync_v2_ack (device_id TEXT PRIMARY KEY, cursor INTEGER NOT NULL);
CREATE TABLE sync_v2_runtime (id INTEGER PRIMARY KEY CHECK(id=1), replaying INTEGER NOT NULL DEFAULT 0);
INSERT INTO sync_v2_runtime VALUES(1,0);
${tables
  .map((table) =>
    ["INSERT", "UPDATE", "DELETE"]
      .map((action) => {
        const ref = action === "INSERT" ? "NEW" : "OLD";
        const before =
          action === "INSERT"
            ? "NULL"
            : `json_object(${columns[table].map((c) => `'${c}',OLD.${c}`).join(",")})`;
        return `CREATE TRIGGER sync_v2_${table}_${action.toLowerCase()} BEFORE ${action} ON ${table}
 WHEN (SELECT replaying FROM sync_v2_runtime WHERE id=1)=0 AND NOT EXISTS(SELECT 1 FROM sync_v2_dirty WHERE table_name='${table}' AND entity_id=${ref}.${primaryKey(table)}) BEGIN
 INSERT INTO sync_v2_dirty VALUES('${table}',${ref}.${primaryKey(table)},${before}); END;`;
      })
      .join("\n"),
  )
  .join("\n")}
-- Replay validates the complete graph before writes. This exception admits stored
-- historical Subtasks whose parent is removed; ordinary local writes retain v8 checks.
DROP TRIGGER subtasks_validate_insert;
CREATE TRIGGER subtasks_validate_insert BEFORE INSERT ON tasks
WHEN NEW.parent_task_id IS NOT NULL AND (SELECT replaying FROM sync_v2_runtime WHERE id=1)=0
BEGIN
 SELECT CASE WHEN NEW.parent_task_id=NEW.id OR NOT EXISTS (
 SELECT 1 FROM tasks p JOIN entries e ON e.id=p.entry_id WHERE p.id=NEW.parent_task_id
 AND p.parent_task_id IS NULL AND e.kind='task' AND e.removed_at IS NULL)
 THEN RAISE(ABORT,'Choose an existing top-level Task parent.') END;
END;
DROP TRIGGER subtasks_validate_update;
CREATE TRIGGER subtasks_validate_update BEFORE UPDATE OF parent_task_id,entry_id ON tasks
WHEN (SELECT replaying FROM sync_v2_runtime WHERE id=1)=0
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM entries WHERE id=NEW.entry_id AND kind='task')
 THEN RAISE(ABORT,'A Task needs a Task entry.') END;
 SELECT CASE WHEN NEW.parent_task_id IS NOT NULL AND (NEW.parent_task_id=NEW.id
 OR EXISTS(SELECT 1 FROM tasks WHERE parent_task_id=NEW.id) OR NOT EXISTS (
 SELECT 1 FROM tasks p JOIN entries e ON e.id=p.entry_id WHERE p.id=NEW.parent_task_id
 AND p.parent_task_id IS NULL AND e.kind='task' AND e.removed_at IS NULL))
 THEN RAISE(ABORT,'Choose an existing top-level Task parent.') END;
END;
`;
