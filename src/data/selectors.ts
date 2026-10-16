import type { Entry, Snapshot, Task } from "./repository";
/** Lists use one snapshot, never per-row database reads. */
export function indexSnapshot(snapshot: Snapshot) {
  const entries = new Map(snapshot.entries.map((e) => [e.id, e]));
  const tasks = new Map(snapshot.tasks.map((t) => [t.entryId, t]));
  const children = new Map<string, Task[]>();
  for (const task of snapshot.tasks)
    if (task.parentTaskId) {
      let group = children.get(task.parentTaskId);
      if (!group) {
        group = [];
        children.set(task.parentTaskId, group);
      }
      group.push(task);
    }
  return { entries, tasks, children };
}
export function visibleEntries(
  snapshot: Snapshot,
  kind: Entry["kind"],
  query: string,
  folder = "all",
  removed = false,
) {
  const needle = query.trim().toLocaleLowerCase();
  const { tasks, children } = indexSnapshot(snapshot);
  return snapshot.entries
    .filter((e) => {
      if (e.removed !== removed || e.kind !== kind) return false;
      if (kind === "note")
        return (
          (folder === "all" || folder === "unfiled"
            ? !e.folderId || folder === "all"
            : e.folderId === folder) &&
          e.text.toLocaleLowerCase().includes(needle)
        );
      const task = tasks.get(e.id);
      if (!task || (task.parentTaskId && !task.parentRemoved)) return false;
      return (
        e.text.toLocaleLowerCase().includes(needle) ||
        (children.get(task.id) ?? []).some((c) =>
          c.title.toLocaleLowerCase().includes(needle),
        )
      );
    })
    .sort((a, b) =>
      kind === "note"
        ? Number(!!b.notePinnedAt) - Number(!!a.notePinnedAt) ||
          (a.notePinnedAt && b.notePinnedAt
            ? b.notePinnedAt.localeCompare(a.notePinnedAt)
            : (b.lastEditedAt ?? b.createdAt).localeCompare(
                a.lastEditedAt ?? a.createdAt,
              )) ||
          a.id.localeCompare(b.id)
        : b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    );
}
export function matchingChildren(
  parent: Entry,
  children: Task[],
  query: string,
) {
  const q = query.trim().toLocaleLowerCase();
  return !q || parent.text.toLocaleLowerCase().includes(q)
    ? children
    : children.filter((c) => c.title.toLocaleLowerCase().includes(q));
}
