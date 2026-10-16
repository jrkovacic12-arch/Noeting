import type { Entry, Snapshot, Task } from './repository';

/** One snapshot supplies lists, counts, hierarchy and source context without per-row queries. */
export function indexSnapshot(snapshot: Snapshot) {
  const entries = new Map(snapshot.entries.map(entry => [entry.id, entry]));
  const tasks = new Map(snapshot.tasks.map(task => [task.entryId, task]));
  const children = new Map<string, Task[]>();
  for (const task of snapshot.tasks) {
    if (task.parentTaskId) children.set(task.parentTaskId, [...(children.get(task.parentTaskId) ?? []), task]);
  }
  return { entries, tasks, children };
}
export function visibleEntries(snapshot: Snapshot, kind: Entry['kind'], query: string) {
  const needle = query.trim().toLocaleLowerCase();
  const { tasks } = indexSnapshot(snapshot);
  return snapshot.entries.filter(entry => {
    if (entry.removed || entry.kind !== kind || !entry.text.toLocaleLowerCase().includes(needle)) return false;
    if (kind === 'note') return true;
    const task = tasks.get(entry.id);
    return task && (needle || !task.parentTaskId || task.parentRemoved);
  }).reverse();
}
