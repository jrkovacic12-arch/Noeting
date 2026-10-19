import type { Entry, NoteFolder, Snapshot, Task } from "../data/repository";

/** Deliberately a read-only PC mirror, not a two-way sync or recovery file. */
export const MIRROR_PROTOCOL = 1;
export const MIRROR_MAX_BYTES = 2_000_000;
export type MirrorPayload = {
  protocol: 1;
  deviceId: string;
  generatedAt: string;
  entries: Entry[];
  tasks: Task[];
  folders: NoteFolder[];
};

export const validDeviceId = (id: string): boolean =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);

export function createMirror(snapshot: Snapshot, deviceId: string, generatedAt = new Date().toISOString()): MirrorPayload {
  if (!validDeviceId(deviceId)) throw new Error("Invalid device identity.");
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("Invalid snapshot date.");
  // Exclude removed content; removed-entry tombstones/reconciliation are for a
  // later full sync protocol, not this opt-in read-only PC viewing mirror.
  const entries = snapshot.entries.filter((entry) => !entry.removed).map((entry) => ({ ...entry }));
  const active = new Set(entries.map((entry) => entry.id));
  return {
    protocol: MIRROR_PROTOCOL,
    deviceId,
    generatedAt,
    entries,
    tasks: snapshot.tasks.filter((task) => active.has(task.entryId)).map((task) => ({ ...task })),
    folders: (snapshot.folders ?? []).map((folder) => ({ ...folder })),
  };
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Runtime validation on the PC, where all phone-provided JSON is untrusted. */
export function validMirror(value: unknown): value is MirrorPayload {
  if (!record(value) || value.protocol !== MIRROR_PROTOCOL ||
      typeof value.deviceId !== "string" || !validDeviceId(value.deviceId) ||
      typeof value.generatedAt !== "string" ||
      !Number.isFinite(Date.parse(value.generatedAt)) ||
      !Array.isArray(value.entries) || value.entries.length > 10000 ||
      !Array.isArray(value.tasks) || value.tasks.length > 20000 ||
      !Array.isArray(value.folders) || value.folders.length > 2000) return false;
  const entryIds = new Set<string>();
  for (const item of value.entries) {
    if (!record(item) || typeof item.id !== "string" || !item.id || entryIds.has(item.id) ||
        (item.kind !== "note" && item.kind !== "task") ||
        typeof item.text !== "string" || typeof item.originalText !== "string" ||
        item.text.length > 100000 || item.originalText.length > 100000 ||
        item.removed !== false || typeof item.createdAt !== "string") return false;
    entryIds.add(item.id);
  }
  const taskIds = new Set<string>();
  for (const task of value.tasks) {
    if (!record(task) || typeof task.id !== "string" || !task.id || taskIds.has(task.id) ||
        typeof task.entryId !== "string" || !entryIds.has(task.entryId) ||
        (task.status !== "pending" && task.status !== "completed") ||
        typeof task.title !== "string" || task.title.length > 100000) return false;
    taskIds.add(task.id);
  }
  const folderIds = new Set<string>();
  for (const folder of value.folders) {
    if (!record(folder) || typeof folder.id !== "string" || !folder.id ||
        folderIds.has(folder.id) || typeof folder.name !== "string" || folder.name.length > 200) return false;
    folderIds.add(folder.id);
  }
  return true;
}

/**
 * Manual, explicitly requested transmission. Never allow plaintext remote HTTP
 * or a URL with embedded credentials. The session token is not persisted.
 */
export async function publishMirror(baseUrl: string, token: string, payload: MirrorPayload): Promise<void> {
  let url: URL;
  try { url = new URL(baseUrl.trim()); }
  catch { throw new Error("Enter a valid HTTPS PC address."); }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.search || url.hash || url.pathname !== "/") {
    throw new Error("Use the HTTPS PC origin only, without paths or credentials.");
  }
  if (token.length < 32) throw new Error("Enter the PC's pairing token (at least 32 characters).");
  const raw = JSON.stringify(payload);
  if (!validMirror(payload) || new TextEncoder().encode(raw).length > MIRROR_MAX_BYTES)
    throw new Error("Sync preview exceeds the safe size or has invalid data.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${url.origin}/api/sync/mirror`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: raw,
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error("PC pairing token was rejected.");
      if (response.status === 409) throw new Error("PC has a newer preview; retry with a fresh snapshot.");
      throw new Error(`PC mirror failed (HTTP ${response.status}).`);
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error("PC did not respond within 15 seconds.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
