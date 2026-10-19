import type { Repository } from "../data/repository";
import type { SyncStore, Outcome } from "./store";
import { type Operation, type Event, type Change } from "./schema";
export type RPC = (
  action: string,
  input: Record<string, unknown>,
) => Promise<any>;
const CHUNK = 160_000;
export function httpsRPC(address: string, token: string): RPC {
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    throw new Error("Enter the PC HTTPS origin.");
  }
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use the trusted PC HTTPS origin without paths or credentials.",
    );
  if (!/^[\x21-\x7e]{32,512}$/.test(token))
    throw new Error("Enter the temporary PC pairing secret (32+ characters).");
  return async (action, input) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${url.origin}/api/sync/v2/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ protocol: 2, ...input }),
        signal: controller.signal,
        redirect: "error",
        credentials: "omit",
      });
      if (!response.ok) {
        let message = "";
        try {
          message = (await response.json()).error;
        } catch {}
        throw new Error(
          response.status === 401
            ? "PC secret rejected or revoked. Re-pair with the current secret."
            : message || `PC returned HTTP ${response.status}.`,
        );
      }
      return response.json();
    } catch (e) {
      if (controller.signal.aborted)
        throw new Error(
          "PC did not respond. Local changes remain saved; retry Sync now.",
        );
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };
}
async function upload(
  rpc: RPC,
  identity: Record<string, unknown>,
  operation: Operation,
  action: string,
  extra: Record<string, unknown> = {},
) {
  const raw = JSON.stringify(operation);
  const transfer = operation.id;
  const parts = Math.ceil(raw.length / CHUNK);
  if (parts > 500)
    throw new Error(
      "This transaction exceeds the development transfer limit; it remains saved locally.",
    );
  for (let part = 0; part < parts; part++)
    await rpc("stage", {
      ...identity,
      transfer,
      part,
      text: raw.slice(part * CHUNK, (part + 1) * CHUNK),
    });
  const result = await rpc(action, { ...identity, transfer, parts, ...extra });
  return result.outcomeId
    ? readPaged(rpc, "outcome", identity, result.outcomeId, result.parts)
    : result;
}
export async function readPaged(
  rpc: RPC,
  action: string,
  identity: Record<string, unknown>,
  id: string,
  parts: number,
) {
  if (!Number.isSafeInteger(parts) || parts < 1 || parts > 1000)
    throw new Error("Invalid response page count.");
  let raw = "";
  for (let part = 0; part < parts; part++) {
    const page = await rpc(action, { ...identity, id, part });
    if (typeof page.text !== "string" || page.text.length > CHUNK)
      throw new Error("Invalid response page.");
    raw += page.text;
  }
  return JSON.parse(raw);
}
async function download(
  rpc: RPC,
  identity: Record<string, unknown>,
  descriptor: { revision: number; parts: number; id: string },
): Promise<Event> {
  if (
    !Number.isSafeInteger(descriptor.parts) ||
    descriptor.parts < 1 ||
    descriptor.parts > 500
  )
    throw new Error("Invalid remote page count.");
  let raw = "";
  for (let part = 0; part < descriptor.parts; part++) {
    const page = await rpc("event", {
      ...identity,
      revision: descriptor.revision,
      part,
    });
    if (typeof page.text !== "string" || page.text.length > CHUNK)
      throw new Error("Invalid event page.");
    raw += page.text;
  }
  const event = JSON.parse(raw) as Event;
  if (
    event.revision !== descriptor.revision ||
    event.operation.id !== descriptor.id
  )
    throw new Error("Remote event identity mismatch.");
  return event;
}
async function synchronize(store: SyncStore, rpc: RPC, initialize: boolean) {
  let local = await store.identity();
  const pair = await rpc("pair", {
    device: local.device_id,
    library: local.library_id,
  });
  if (local.peer_id && local.peer_id !== pair.device)
    throw new Error(
      "PC identity changed. Existing library retained; investigate before pairing.",
    );
  if (!local.library_id) {
    const saved = await store.beginBootstrap();
    if (!initialize && !pair.library)
      throw new Error(
        "PC is empty. Choose Initialize empty PC from Android once.",
      );
    if (!pair.empty && !pair.library)
      throw new Error(
        "PC contains an unrelated library. It cannot be replaced.",
      );
    if (pair.library && pair.library !== local.device_id)
      throw new Error("PC belongs to another library.");
    const result = await upload(
      rpc,
      { device: local.device_id, library: pair.library ?? local.library_id },
      saved.operation,
      "bootstrap",
      { initialize: true, initialLibrary: local.device_id },
    );
    await store.finishBootstrap(
      { revision: result.revision, operation: saved.operation },
      result.library,
      result.device,
      saved.captured,
    );
    local = await store.identity();
  }
  if (pair.library && pair.library !== local.library_id)
    throw new Error("Libraries do not match.");
  const identity = { device: local.device_id, library: local.library_id };
  // Push before pull. The PC rejects stale bases rather than replacing pending
  // local versions. Unrelated outbox transactions continue after a conflict.
  for (const op of await store.pending())
    await store.recordOutcome(
      (await upload(rpc, identity, op, "push")) as Outcome,
    );
  for (;;) {
    const { events } = await rpc("pull", {
      ...identity,
      after: (await store.identity()).cursor,
    });
    if (!Array.isArray(events) || events.length > 100)
      throw new Error("Invalid history page.");
    for (const descriptor of events)
      await store.replay(await download(rpc, identity, descriptor));
    if (events.length < 100) break;
  }
  await rpc("ack", { ...identity, cursor: (await store.identity()).cursor });
  await store.markSuccess();
  return store.status();
}
/** Caller must guard locally retained inline-edit drafts before entering this
 * session. The repository mutex excludes commits until transfer/replay finishes. */
export function syncNow(repo: Repository, rpc: RPC, initialize = false) {
  return repo.sync((store) => synchronize(store, rpc, initialize));
}
export async function resolveConflict(
  repo: Repository,
  rpc: RPC,
  conflictId: string,
  choice: "android" | "pc",
) {
  return repo.sync(async (store) => {
    const local = await store.identity();
    const identity = { device: local.device_id, library: local.library_id };
    const closure = await store.resolutionClosure(conflictId);
    const current: Change[] = [];
    for (let index = 0; index < closure.current.length; index += 100) {
      const result = await rpc("current", {
        ...identity,
        records: closure.current
          .slice(index, index + 100)
          .map((c) => ({ table: c.table, id: c.id })),
      });
      const data = await readPaged(
        rpc,
        "read-page",
        identity,
        result.readId,
        result.parts,
      );
      current.push(...data.records);
      await rpc("release-read", { ...identity, id: result.readId });
    }
    const changes = current.map((c) => ({
      ...c,
      value:
        choice === "android"
          ? closure.current.find((r) => r.table === c.table && r.id === c.id)!
              .value
          : c.value,
    }));
    if (changes.some((c) => c.value === null && c.table !== "note_folders"))
      throw new Error(
        "PC has no corresponding record. Keep Android to preserve these structural records.",
      );
    const [row] = await store.db.all<{ id: string }>(
      "SELECT lower(hex(randomblob(16))) AS id",
    );
    const operation: Operation = {
      protocol: 2,
      id: row.id,
      origin: local.device_id,
      resolves: conflictId,
      resolvedOperations: closure.ids,
      changes,
    };
    const result = (await upload(
      rpc,
      identity,
      operation,
      "resolve",
    )) as Outcome;
    if ("conflict" in result) {
      await store.recordOutcome(result);
      throw new Error(
        "PC changed again. Both versions are retained; retry resolution.",
      );
    }
    await store.finishResolution(result.event, closure.ids, conflictId);
    return synchronize(store, rpc, false);
  });
}

/** Keep both creates a new capture; it never rewrites the old original/provenance. */
export async function keepBoth(repo: Repository, rpc: RPC, conflictId: string) {
  const note = await repo.sync(async (store) => {
    const closure = await store.resolutionClosure(conflictId);
    const entries = closure.current.filter((c) => c.table === "entries");
    if (
      entries.length !== 1 ||
      entries[0].value?.kind !== "note" ||
      entries[0].value.removed_at !== null ||
      closure.current.some(
        (c) => !["entries", "note_organization"].includes(c.table),
      )
    )
      throw new Error(
        "Keep both is available only for a standalone active Note text conflict.",
      );
    const all = await store.records();
    if (
      all.some(
        (c) =>
          ["thinking_links", "entry_sources", "task_sources"].includes(
            c.table,
          ) && c.id === entries[0].id,
      )
    )
      throw new Error(
        "Choose a version to preserve this Note’s source relationship.",
      );
    return entries[0].value!;
  });
  await repo.saveCapture({
    requestId: `conflict-copy-${conflictId}`,
    kind: "note",
    text: String(note.edited_text ?? note.original_text),
  });
  return resolveConflict(repo, rpc, conflictId, "pc");
}
