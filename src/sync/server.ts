// Node 24+, localhost only. Trusted HTTPS forwarding is configured separately.
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { DatabaseSync } from "node:sqlite";
import { timingSafeEqual } from "node:crypto";
import { mkdir, chmod, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import {
  createRepository,
  type Repository,
  type SQLiteDriver,
} from "../data/repository";
import {
  type Change,
  type Operation,
  type Event,
  MAX_BODY,
  PAGE_SIZE,
} from "./schema";
import { SyncStore } from "./store";
const CHUNK = 160_000,
  MAX_TRANSFER = 64_000_000;
const deviceId = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{32}$/.test(v);
const safeId = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
export async function openPC(filename: string) {
  await mkdir(dirname(resolve(filename)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  await chmod(filename, 0o600);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;",
  );
  const driver: SQLiteDriver = {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, p = []) {
      return { changes: Number(db.prepare(sql).run(...p).changes) };
    },
    async all<T>(sql: string, p = []) {
      return db.prepare(sql).all(...p) as T[];
    },
  };
  const repository = createRepository(driver);
  await repository.initialize();
  return { repository, close: () => db.close() };
}
function sameSecret(auth: unknown, token: string) {
  if (typeof auth !== "string") return false;
  const a = Buffer.from(auth),
    b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("Request too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function createPCServer(
  repository: Repository,
  token: string,
  publicOrigin?: string,
  pcToken?: string,
) {
  if (!/^[\x21-\x7e]{32,512}$/.test(token))
    throw new Error(
      "Supply a temporary 32+ character secret through NOETING_SYNC_TOKEN.",
    );
  if (!pcToken || !/^[\x21-\x7e]{32,512}$/.test(pcToken) || pcToken === token)
    throw new Error(
      "Set a separate 32+ character NOETING_PC_TOKEN for PC administration.",
    );
  if (
    publicOrigin &&
    (new URL(publicOrigin).origin !== publicOrigin ||
      !publicOrigin.startsWith("https://"))
  )
    throw new Error("NOETING_PUBLIC_ORIGIN must be an HTTPS origin.");
  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    try {
      const path = req.url ?? "";
      if (req.method === "GET" && ["/", "/pc.js", "/pc.css"].includes(path)) {
        const file = path === "/" ? "pc.html" : path.slice(1);
        res.writeHead(200, {
          "Content-Type": file.endsWith(".js")
            ? "text/javascript"
            : file.endsWith(".css")
              ? "text/css"
              : "text/html; charset=utf-8",
        });
        res.end(await readFile(resolve(__dirname, "pc", file)));
        return;
      }
      if (req.method !== "POST" || !path.startsWith("/api/sync/v2/"))
        return send(res, 404, { error: "Not found." });
      // No cookies or CORS. Other websites cannot use the temporary bearer secret.
      const origin = req.headers.origin;
      if (
        origin &&
        origin !== publicOrigin &&
        origin !==
          `http://127.0.0.1:${(req.socket.address() as { port: number }).port}`
      )
        return send(res, 403, { error: "Origin rejected." });
      const isPC = sameSecret(req.headers.authorization, pcToken);
      if (!isPC && !sameSecret(req.headers.authorization, token))
        return send(res, 401, { error: "Pairing secret rejected or revoked." });
      if (req.headers["content-type"] !== "application/json")
        return send(res, 415, { error: "Use application/json." });
      const input = await body(req);
      if (!input || input.protocol !== 2)
        return send(res, 400, { error: "Unsupported protocol." });
      const action = path.slice("/api/sync/v2/".length);
      const pcActions = ["pc", "edit", "revoke", "allow", "pc-resolve"];
      if (pcActions.includes(action) && !isPC)
        return send(res, 403, {
          error: "Use the separate PC administration secret.",
        });
      if (isPC && !pcActions.includes(action) && action !== "outcome")
        return send(res, 403, {
          error: "Use the phone pairing secret for synchronization.",
        });
      // PC mutations call the very same repository methods as Android. They are
      // serialized with protocol writes by the shared driver mutex.
      if (action === "edit") {
        if (!(await repository.sync((s) => s.identity())).library_id)
          throw new Error(
            "Initialize this empty PC from Android before editing.",
          );
        if (!Array.isArray(input.expected))
          throw new Error("Reload the PC library before editing.");
        await repository.checked(input.expected, (repo) =>
          edit(repo, input.command, input.args),
        );
        await repository.sync((s) => s.publishLocal());
        return send(res, 200, { ok: true });
      }
      const result = await repository.sync(async (store) => {
        const identity = await store.identity();
        if (!isPC) {
          if (!deviceId(input.device))
            throw new Error("Invalid stable device identity.");
          const [pair] = await store.db.all<{ revoked: number }>(
            "SELECT revoked FROM sync_v2_pairing WHERE device_id=?",
            [input.device],
          );
          if (pair?.revoked)
            throw new Error("This device was revoked on the PC.");
          if (identity.peer_id && identity.peer_id !== input.device)
            throw new Error("A different phone is already paired.");
          if (action === "outcome" && identity.library_id !== input.library)
            throw new Error("Library identity mismatch.");
        }
        await store.publishLocal();
        if (action === "pc")
          return {
            snapshot: await readPC(store),
            versions: await store.current(await store.records()),
            status: await store.status(),
            conflicts: await store.conflicts(),
          };
        if (action === "revoke") {
          await store.transaction(() =>
            store.db.run(
              "INSERT INTO sync_v2_pairing VALUES(?,1) ON CONFLICT(device_id) DO UPDATE SET revoked=1",
              [identity.peer_id ?? "none"],
            ),
          );
          return { ok: true };
        }
        if (action === "allow") {
          await store.transaction(() =>
            store.db.exec("UPDATE sync_v2_pairing SET revoked=0;"),
          );
          return { ok: true };
        }
        if (action === "outcome") {
          if (
            !safeId(input.id) ||
            !Number.isSafeInteger(input.part) ||
            input.part < 0
          )
            throw new Error("Invalid outcome page.");
          const [row] = await store.db.all<{ outcome: string }>(
            "SELECT outcome FROM sync_v2_seen WHERE id=?",
            [input.id],
          );
          if (!row || input.part >= Math.ceil(row.outcome.length / CHUNK))
            throw new Error("Outcome page unavailable.");
          return {
            text: row.outcome.slice(
              input.part * CHUNK,
              (input.part + 1) * CHUNK,
            ),
          };
        }
        if (action === "pc-resolve") {
          const conflicts = await store.conflicts();
          const conflict = conflicts.find((c) => c.operation.id === input.id);
          if (!conflict || !["android", "pc"].includes(input.choice))
            throw new Error("Choose a pending conflict and version.");
          const closure = await store.resolutionClosure(input.id);
          const current = closure.current;
          const changes = current.map((c) => ({
            ...c,
            value:
              input.choice === "android"
                ? closure.proposed.find(
                    (r) => r.table === c.table && r.id === c.id,
                  )!.value
                : c.value,
          }));
          if (
            changes.some((c) => c.value === null && c.table !== "note_folders")
          )
            throw new Error(
              "Keep Android to preserve structural records absent from PC.",
            );
          const [id] = await store.db.all<{ id: string }>(
            "SELECT lower(hex(randomblob(16))) AS id",
          );
          const outcome = await store.accept({
            protocol: 2,
            id: id.id,
            origin: identity.device_id,
            resolves: input.id,
            resolvedOperations: closure.ids,
            changes,
          });
          return {
            outcomeId: id.id,
            parts: Math.ceil(JSON.stringify(outcome).length / CHUNK),
          };
        }
        if (!deviceId(input.device))
          throw new Error("Invalid stable device identity.");
        const [pair] = await store.db.all<{ revoked: number }>(
          "SELECT revoked FROM sync_v2_pairing WHERE device_id=?",
          [input.device],
        );
        if (pair?.revoked)
          throw new Error("This device was revoked on the PC.");
        if (action === "pair") {
          if (identity.peer_id && identity.peer_id !== input.device)
            throw new Error("A different phone is already paired.");
          if (
            input.library !== identity.library_id &&
            identity.library_id !== null &&
            !(
              input.library === null &&
              identity.peer_id === input.device &&
              identity.library_id === input.device
            )
          )
            throw new Error(
              "Unrelated library; automatic replacement refused.",
            );
          await store.transaction(() =>
            store.db.run("INSERT OR IGNORE INTO sync_v2_pairing VALUES(?,0)", [
              input.device,
            ]),
          );
          return {
            device: identity.device_id,
            library: identity.library_id,
            empty: (await store.records()).length === 0,
          };
        }
        if (
          identity.library_id &&
          (identity.peer_id !== input.device ||
            identity.library_id !== input.library)
        )
          throw new Error("Library or paired device mismatch.");
        if (action === "stage") {
          if (
            !safeId(input.transfer) ||
            !Number.isSafeInteger(input.part) ||
            input.part < 0 ||
            input.part >= 500 ||
            typeof input.text !== "string" ||
            input.text.length > CHUNK
          )
            throw new Error("Invalid transfer page.");
          await store.transaction(async () => {
            const [old] = await store.db.all<{ text: string }>(
              "SELECT text FROM sync_v2_transfers WHERE transfer_id=? AND device_id=? AND part=?",
              [input.transfer, input.device, input.part],
            );
            if (old && old.text !== input.text)
              throw new Error("Transfer page changed.");
            const [size] = await store.db.all<{ n: number }>(
              "SELECT COALESCE(SUM(length(text)),0) AS n FROM sync_v2_transfers",
            );
            if (!old && size.n + input.text.length > MAX_TRANSFER)
              throw new Error(
                "Staging storage limit reached; clear abandoned transfers on PC.",
              );
            await store.db.run(
              "INSERT OR IGNORE INTO sync_v2_transfers VALUES(?,?,?,?)",
              [input.transfer, input.device, input.part, input.text],
            );
          });
          return { ok: true };
        }
        if (
          action === "bootstrap" ||
          action === "push" ||
          action === "resolve"
        ) {
          if (
            !safeId(input.transfer) ||
            !Number.isSafeInteger(input.parts) ||
            input.parts < 1 ||
            input.parts > 500
          )
            throw new Error("Invalid transfer.");
          const parts = await store.db.all<{ part: number; text: string }>(
            "SELECT part,text FROM sync_v2_transfers WHERE transfer_id=? AND device_id=? ORDER BY part",
            [input.transfer, input.device],
          );
          if (
            parts.length !== input.parts ||
            parts.some((p, i) => p.part !== i)
          )
            throw new Error("Transfer incomplete; resend the same pages.");
          const operation = JSON.parse(
            parts.map((p) => p.text).join(""),
          ) as Operation;
          if (operation.origin !== input.device)
            throw new Error("Operation origin does not match paired identity.");
          if (action === "bootstrap") {
            if (input.initialize !== true || !safeId(input.initialLibrary))
              throw new Error("Confirm Android initializes the empty PC.");
            const event = await store.bootstrap(
              operation,
              input.initialLibrary,
              input.device,
            );
            // Return a descriptor rather than a full-library response.
            await store.transaction(() =>
              store.db.run(
                "DELETE FROM sync_v2_transfers WHERE transfer_id=? AND device_id=?",
                [input.transfer, input.device],
              ),
            );
            return {
              revision: event.revision,
              library: input.initialLibrary,
              device: identity.device_id,
            };
          }
          if (!identity.library_id)
            throw new Error("Initialize the empty PC before pushing changes.");
          if (action === "resolve" && !operation.resolves)
            throw new Error("Missing explicit resolution.");
          const outcome = await store.accept(operation);
          await store.transaction(() =>
            store.db.run(
              "DELETE FROM sync_v2_transfers WHERE transfer_id=? AND device_id=?",
              [input.transfer, input.device],
            ),
          );
          return {
            outcomeId: operation.id,
            parts: Math.ceil(JSON.stringify(outcome).length / CHUNK),
          };
        }
        if (!identity.library_id)
          throw new Error("The PC library is not initialized.");
        if (action === "pull") {
          if (!Number.isSafeInteger(input.after) || input.after < 0)
            throw new Error("Invalid cursor.");
          return {
            events: (await store.history(input.after)).map((event) => ({
              revision: event.revision,
              id: event.operation.id,
              parts: Math.ceil(JSON.stringify(event).length / CHUNK),
            })),
          };
        }
        if (action === "event") {
          if (
            !Number.isSafeInteger(input.revision) ||
            !Number.isSafeInteger(input.part) ||
            input.part < 0
          )
            throw new Error("Invalid event page.");
          const [r] = await store.db.all<{ revision: number; payload: string }>(
            "SELECT revision,payload FROM sync_v2_history WHERE revision=?",
            [input.revision],
          );
          if (!r) throw new Error("Unknown event.");
          const raw = JSON.stringify({
            revision: r.revision,
            operation: JSON.parse(r.payload),
          });
          if (input.part >= Math.ceil(raw.length / CHUNK))
            throw new Error("Unknown event page.");
          return {
            text: raw.slice(input.part * CHUNK, (input.part + 1) * CHUNK),
          };
        }
        if (action === "ack") {
          await store.acknowledge(input.device, input.cursor);
          return { ok: true };
        }
        if (action === "current") {
          if (
            !Array.isArray(input.records) ||
            input.records.length > 100000 ||
            input.records.some(
              (r: Change) =>
                !r || typeof r.table !== "string" || typeof r.id !== "string",
            )
          )
            throw new Error("Invalid resolution records.");
          const payload = JSON.stringify({
            records: await store.current(input.records),
          });
          const [id] = await store.db.all<{ id: string }>(
            "SELECT lower(hex(randomblob(16))) AS id",
          );
          await store.transaction(async () => {
            await store.db.run("DELETE FROM sync_v2_reads WHERE device_id=?", [
              input.device,
            ]);
            await store.db.run("INSERT INTO sync_v2_reads VALUES(?,?,?)", [
              id.id,
              input.device,
              payload,
            ]);
          });
          return { readId: id.id, parts: Math.ceil(payload.length / CHUNK) };
        }
        if (action === "read-page" || action === "release-read") {
          if (!safeId(input.id)) throw new Error("Invalid read identity.");
          if (action === "release-read") {
            await store.transaction(() =>
              store.db.run(
                "DELETE FROM sync_v2_reads WHERE id=? AND device_id=?",
                [input.id, input.device],
              ),
            );
            return { ok: true };
          }
          const [row] = await store.db.all<{ payload: string }>(
            "SELECT payload FROM sync_v2_reads WHERE id=? AND device_id=?",
            [input.id, input.device],
          );
          if (
            !row ||
            !Number.isSafeInteger(input.part) ||
            input.part < 0 ||
            input.part >= Math.ceil(row.payload.length / CHUNK)
          )
            throw new Error("Read snapshot expired; retry resolution.");
          return {
            text: row.payload.slice(
              input.part * CHUNK,
              (input.part + 1) * CHUNK,
            ),
          };
        }
        throw new Error("Unknown v2 action.");
      });
      send(res, 200, result);
    } catch (error) {
      send(res, 400, {
        error: error instanceof Error ? error.message : "Request failed.",
      });
    }
  });
}
async function readPC(store: SyncStore) {
  return store.records();
}
async function edit(repo: Repository, command: string, args: any) {
  if (!args || typeof args !== "object") throw new Error("Invalid command.");
  switch (command) {
    case "capture":
      return repo.saveCapture(args);
    case "linked":
      return repo.saveLinkedEntry(args);
    case "child":
      return repo.saveSubtask(args);
    case "text":
      return repo.editEntry(args.id, args.text);
    case "complete":
      return repo.completeTask(args.id);
    case "reopen":
      return repo.reopenTask(args.id);
    case "remove":
      return repo.removeEntry(args.id);
    case "restore":
      return repo.restoreEntry(args);
    case "folder":
      return repo.createFolder(args.id, args.name);
    case "rename":
      return repo.renameFolder(args.id, args.name);
    case "deleteFolder":
      return repo.removeFolder(args.id);
    case "organize":
      return repo.organizeNotes(args.ids, args.change);
    case "pinFolders":
      return repo.pinFolders(args.ids, args.pinned);
    default:
      throw new Error("Unsupported domain command.");
  }
}
