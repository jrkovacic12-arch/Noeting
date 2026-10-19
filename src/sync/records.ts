import type { SQLiteDriver } from "../data/repository";
import {
  columns,
  tables,
  primaryKey,
  keyOf,
  type Table,
  type Row,
  type RecordValue,
  type Change,
  type Operation,
} from "./schema";

export class SyncValidationError extends Error {}
export async function readRecords(db: SQLiteDriver): Promise<RecordValue[]> {
  const result: RecordValue[] = [];
  for (const table of tables)
    for (const value of await db.all<Row>(
      `SELECT ${columns[table].join(",")} FROM ${table} ORDER BY ${primaryKey(table)}`,
    ))
      result.push({ table, id: String(value[primaryKey(table)]), value });
  // Physical folder removal is an explicit tombstone, never absence inference.
  for (const r of await db.all<{ table_name: Table; entity_id: string }>(
    "SELECT table_name,entity_id FROM sync_v2_versions WHERE tombstone=1",
  ))
    if (!result.some((v) => v.table === r.table_name && v.id === r.entity_id))
      result.push({ table: r.table_name, id: r.entity_id, value: null });
  return result;
}
export const equal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  )
    return false;
  const x = a as Record<string, unknown>,
    y = b as Record<string, unknown>;
  return (
    Object.keys(x).length === Object.keys(y).length &&
    Object.keys(x).every((k) => equal(x[k], y[k]))
  );
};
const id = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 512 &&
  !/[\u0000-\u001f]/.test(v);
const integer = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
export function validateOperation(
  v: unknown,
  allowEmpty = false,
): asserts v is Operation {
  const o = v as Operation;
  if (
    !o ||
    o.protocol !== 2 ||
    !id(o.id) ||
    !/^[a-f0-9]{32}$/.test(o.origin) ||
    !Array.isArray(o.changes) ||
    (!allowEmpty && !o.changes.length) ||
    o.changes.length > 100000 ||
    (o.resolves !== undefined && !id(o.resolves))
  )
    throw new SyncValidationError("Unsupported or malformed v2 operation.");
  if (
    o.resolvedOperations !== undefined &&
    (!o.resolves ||
      !Array.isArray(o.resolvedOperations) ||
      o.resolvedOperations.length > 100000 ||
      o.resolvedOperations.some((r) => !id(r)))
  )
    throw new SyncValidationError("Invalid conflict resolution scope.");
  const seen = new Set<string>();
  for (const r of o.changes) {
    if (
      !r ||
      !tables.includes(r.table) ||
      !id(r.id) ||
      !integer(r.base) ||
      !(r.previous === null || id(r.previous)) ||
      seen.has(keyOf(r))
    )
      throw new SyncValidationError("Invalid record revision or identity.");
    seen.add(keyOf(r));
    if (r.value === null) {
      if (r.table !== "note_folders")
        throw new SyncValidationError(
          "Only folders can be physically removed.",
        );
      continue;
    }
    const cs = columns[r.table];
    if (
      typeof r.value !== "object" ||
      Array.isArray(r.value) ||
      Object.keys(r.value).length !== cs.length ||
      cs.some(
        (c) =>
          !(c in r.value!) ||
          !["string", "number", "object"].includes(typeof r.value![c]) ||
          (typeof r.value![c] === "object" && r.value![c] !== null),
      ) ||
      r.value[primaryKey(r.table)] !== r.id
    )
      throw new SyncValidationError("Invalid canonical record columns.");
    for (const [name, value] of Object.entries(r.value))
      if (
        (name.endsWith("_at") || name === "removed_pin_at") &&
        value !== null &&
        (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
      )
        throw new SyncValidationError("Invalid stored date.");
    if (
      Object.values(r.value).some(
        (x) => typeof x === "number" && !Number.isSafeInteger(x),
      )
    )
      throw new SyncValidationError("Invalid numeric value.");
  }
}
const frozen: Partial<Record<Table, readonly string[]>> = {
  entries: ["id", "capture_request_id", "kind", "original_text", "created_at"],
  tasks: ["id", "entry_id", "created_at", "parent_task_id"],
  thinking_links: columns.thinking_links,
  task_sources: columns.task_sources,
  entry_sources: columns.entry_sources,
  note_folders: ["id", "created_at"],
};
/** Validate the proposed full graph before replaying anything. SQLite remains the final constraint boundary. */
export function validateGraph(
  current: RecordValue[],
  changes: RecordValue[],
  bootstrap = false,
) {
  const old = new Map(current.map((r) => [keyOf(r), r]));
  const next = new Map(old);
  for (const r of changes) {
    const before = old.get(keyOf(r));
    if (
      before?.value &&
      r.value &&
      (frozen[r.table] ?? []).some((c) => before.value![c] !== r.value![c])
    )
      throw new SyncValidationError("Immutable capture or provenance changed.");
    if (before?.value === null && r.value && r.table === "note_folders")
      throw new SyncValidationError(
        "Removed folder identities cannot be reused.",
      );
    next.set(keyOf(r), r);
  }
  const rows = (t: Table) =>
    [...next.values()]
      .filter((r) => r.table === t && r.value)
      .map((r) => r.value!);
  const entries = new Map(rows("entries").map((e) => [e.id, e]));
  const tasks = new Map(rows("tasks").map((t) => [t.id, t]));
  const folders = new Map(rows("note_folders").map((f) => [f.id, f]));
  const requests = new Set();
  for (const e of entries.values()) {
    if (
      !id(e.capture_request_id) ||
      requests.has(e.capture_request_id) ||
      !["note", "task"].includes(String(e.kind)) ||
      typeof e.original_text !== "string" ||
      !e.original_text.length ||
      !(
        e.edited_text === null ||
        (typeof e.edited_text === "string" && e.edited_text.trim())
      ) ||
      !integer(e.removal_version) ||
      ![0, 1].includes(Number(e.removed_pinned)) ||
      ![0, 1].includes(Number(e.removed_selected))
    )
      throw new SyncValidationError("Invalid Entry.");
    requests.add(e.capture_request_id);
    if (
      e.kind === "task" &&
      ![...tasks.values()].some((t) => t.entry_id === e.id)
    )
      throw new SyncValidationError("Task Entry missing persistence state.");
  }
  const names = new Set();
  for (const f of folders.values()) {
    if (
      typeof f.name !== "string" ||
      !f.name.trim() ||
      f.name !== f.name.trim() ||
      f.name_key !== f.name.normalize("NFKC").toLocaleLowerCase("en-US") ||
      names.has(f.name_key)
    )
      throw new SyncValidationError("Folder names must be unique.");
    names.add(f.name_key);
  }
  const taskEntries = new Set();
  for (const t of tasks.values()) {
    const e = entries.get(t.entry_id);
    const parent = tasks.get(t.parent_task_id);
    if (
      !e ||
      e.kind !== "task" ||
      taskEntries.has(t.entry_id) ||
      t.title !== String(e.edited_text ?? e.original_text).trim() ||
      !["pending", "completed"].includes(String(t.status)) ||
      ![0, 1].includes(Number(t.pinned)) ||
      !integer(t.pin_order) ||
      (t.status === "completed"
        ? t.completed_at === null || t.pinned !== 0
        : t.completed_at !== null) ||
      (t.parent_task_id !== null &&
        (!parent ||
          parent.parent_task_id !== null ||
          t.parent_task_id === t.id))
    )
      throw new SyncValidationError("Invalid Task state or ownership.");
    taskEntries.add(t.entry_id);
  }
  for (const table of [
    "thinking_links",
    "task_sources",
    "entry_sources",
  ] as const)
    for (const r of rows(table)) {
      const e = entries.get(r.entry_id),
        s = entries.get(r.source_entry_id);
      if (
        !e ||
        !s ||
        e.id === s.id ||
        (table === "thinking_links" &&
          (e.kind !== "note" ||
            !["reflection", "creation"].includes(String(r.thinking_kind)))) ||
        (table === "task_sources" && e.kind !== "task") ||
        (table !== "thinking_links" && typeof r.source_text !== "string")
      )
        throw new SyncValidationError("Invalid source relationship.");
      if (
        !bootstrap &&
        !old.has(keyOf({ table, id: String(r.entry_id) })) &&
        s.kind !== "note"
      )
        throw new SyncValidationError("New sources must be Notes.");
    }
  for (const r of rows("note_organization"))
    if (
      entries.get(r.entry_id)?.kind !== "note" ||
      (r.folder_id !== null && !folders.has(r.folder_id))
    )
      throw new SyncValidationError("Invalid Note organization.");
  for (const table of ["reminders", "scheduled_pins"] as const)
    for (const r of rows(table))
      if (!tasks.has(r.task_id))
        throw new SyncValidationError("Missing Task for historical metadata.");
  // Check changed completion groups; untouched legacy groups are preserved exactly.
  if (!bootstrap)
    for (const t of tasks.values()) {
      if (
        t.parent_task_id !== null ||
        entries.get(t.entry_id)?.removed_at !== null
      )
        continue;
      const children = [...tasks.values()].filter(
        (c) =>
          c.parent_task_id === t.id &&
          entries.get(c.entry_id)?.removed_at === null,
      );
      const relevant = changes.some((c) => {
        const previous = old.get(keyOf(c))?.value;
        if (
          c.table === "tasks" &&
          (c.id === t.id ||
            [...tasks.values()].some(
              (k) => k.parent_task_id === t.id && k.id === c.id,
            ))
        )
          return (
            !previous ||
            previous.status !== c.value?.status ||
            previous.parent_task_id !== c.value?.parent_task_id
          );
        return (
          c.table === "entries" &&
          (c.id === t.entry_id ||
            [...tasks.values()].some(
              (k) => k.parent_task_id === t.id && k.entry_id === c.id,
            )) &&
          previous?.removed_at !== c.value?.removed_at
        );
      });
      if (
        relevant &&
        children.length &&
        (t.status === "completed") !==
          children.every((c) => c.status === "completed")
      )
        throw new SyncValidationError(
          "Task group needs explicit conflict resolution.",
        );
    }
}

export async function applyRecords(
  db: SQLiteDriver,
  changes: RecordValue[],
  bootstrap = false,
) {
  const current = await readRecords(db);
  validateGraph(current, changes, bootstrap);
  await db.exec(
    "UPDATE sync_v2_runtime SET replaying=1 WHERE id=1; PRAGMA defer_foreign_keys=ON;",
  );
  // Install all dependencies before relationship rows; FK checks occur at commit.
  const order: Table[] = [
    "note_folders",
    "entries",
    "tasks",
    "thinking_links",
    "task_sources",
    "entry_sources",
    "note_organization",
    "reminders",
    "scheduled_pins",
  ];
  for (const table of order) {
    const selected = changes.filter(
      (c) => c.table === table && c.value !== null,
    );
    if (table === "tasks")
      selected.sort(
        (a, b) =>
          Number(a.value!.parent_task_id !== null) -
          Number(b.value!.parent_task_id !== null),
      );
    for (const r of selected) {
      const cs = columns[table];
      await db.run(
        `INSERT INTO ${table}(${cs.join(",")}) VALUES(${cs.map(() => "?").join(",")}) ON CONFLICT(${primaryKey(table)}) DO UPDATE SET ${cs
          .slice(1)
          .map((c) => `${c}=excluded.${c}`)
          .join(",")}`,
        cs.map((c) => r.value![c]),
      );
    }
  }
  for (const r of changes.filter((c) => c.value === null))
    await db.run(`DELETE FROM ${r.table} WHERE ${primaryKey(r.table)}=?`, [
      r.id,
    ]);
  await db.exec("UPDATE sync_v2_runtime SET replaying=0 WHERE id=1;");
}
export async function journal(
  db: SQLiteDriver,
  expected?: Map<string, { base: number; previous: string | null }>,
) {
  // One database read and one set-based version write, including large bulk
  // actions. Per-row worker round trips would stall Expo SQLite on big libraries.
  const query =
    tables
      .map(
        (
          table,
        ) => `SELECT d.table_name,d.entity_id,d.before_json,v.revision,v.operation_id,
 CASE WHEN r.${primaryKey(table)} IS NULL THEN NULL ELSE json_object(${columns[table].map((c) => `'${c}',r.${c}`).join(",")}) END AS after_json
 FROM sync_v2_dirty d LEFT JOIN ${table} r ON r.${primaryKey(table)}=d.entity_id
 LEFT JOIN sync_v2_versions v ON v.table_name=d.table_name AND v.entity_id=d.entity_id
 WHERE d.table_name='${table}'`,
      )
      .join(" UNION ALL ") + " ORDER BY 1,2";
  const dirty = await db.all<{
    table_name: Table;
    entity_id: string;
    before_json: string | null;
    after_json: string | null;
    revision: number | null;
    operation_id: string | null;
  }>(query);
  if (!dirty.length) return;
  const changes: Change[] = [];
  for (const d of dirty) {
    const value: Row | null = d.after_json ? JSON.parse(d.after_json) : null;
    if (equal(d.before_json ? JSON.parse(d.before_json) : null, value))
      continue;
    const e = expected?.get(keyOf({ table: d.table_name, id: d.entity_id }));
    if (
      expected &&
      ((e?.base ?? 0) !== (d.revision ?? 0) ||
        (e?.previous ?? null) !== (d.operation_id ?? null))
    )
      throw new SyncValidationError(
        "This record changed while the PC editor was open. Your text is retained; reload and compare before saving.",
      );
    changes.push({
      table: d.table_name,
      id: d.entity_id,
      value,
      base: d.revision ?? 0,
      previous: d.operation_id ?? null,
    });
  }
  if (changes.length) {
    const [identity] = await db.all<{ device_id: string }>(
      "SELECT device_id FROM sync_v2_identity WHERE id=1",
    );
    const [row] = await db.all<{ id: string }>(
      "SELECT lower(hex(randomblob(16))) AS id",
    );
    const op: Operation = {
      protocol: 2,
      id: row.id,
      origin: identity.device_id,
      changes,
    };
    await db.run(
      "INSERT INTO sync_v2_outbox(id,payload,state) VALUES(?,?,'pending')",
      [op.id, JSON.stringify(op)],
    );
    await db.run(
      `INSERT INTO sync_v2_versions(table_name,entity_id,revision,operation_id,tombstone)
 SELECT json_extract(value,'$.table'),json_extract(value,'$.id'),0,?,json_extract(value,'$.value') IS NULL
 FROM json_each(?) WHERE 1 ON CONFLICT(table_name,entity_id) DO UPDATE SET operation_id=excluded.operation_id,tombstone=excluded.tombstone`,
      [op.id, JSON.stringify(changes)],
    );
  }
  await db.exec("DELETE FROM sync_v2_dirty;");
  return changes.length;
}
