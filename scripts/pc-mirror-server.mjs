// PC-only, Node 24+. Start behind a trusted HTTPS reverse proxy or Tailscale Serve.
// A paired token is required for writing AND reading. No remote DB writes.
import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";

const host = process.env.NOETING_HOST ?? "127.0.0.1";
const port = Number(process.env.NOETING_PORT ?? "8787");
const token = process.env.NOETING_SYNC_TOKEN ?? "";
const directory = process.env.NOETING_MIRROR_DIR ?? "./work/noeting-mirror";
const maxBytes = 2_000_000;
if (!/^[\w.-]+$/.test(host) || host !== "127.0.0.1" ||
    !Number.isInteger(port) || port < 1024 || port > 65535 || token.length < 32)
  throw new Error("Configure localhost-only NOETING_HOST, NOETING_PORT and NOETING_SYNC_TOKEN (>=32 chars).");

function allowed(auth) {
  if (typeof auth !== "string" || !auth.startsWith("Bearer ")) return false;
  const candidate = Buffer.from(auth.slice(7), "utf8");
  const expected = Buffer.from(token, "utf8");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
function respond(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
function valid(payload) {
  if (!payload || payload.protocol !== 1 || !Array.isArray(payload.entries) ||
      !Array.isArray(payload.tasks) || !Array.isArray(payload.folders) ||
      !/^[a-f0-9-]{36}$/i.test(payload.deviceId ?? "") ||
      !Number.isFinite(Date.parse(payload.generatedAt ?? "")) ||
      payload.entries.length > 10000 || payload.tasks.length > 20000 ||
      payload.folders.length > 2000) return false;
  const entries = new Set();
  for (const e of payload.entries) {
    if (!e || typeof e.id !== "string" || entries.has(e.id) ||
        !["note","task"].includes(e.kind) || e.removed !== false ||
        typeof e.originalText !== "string" || typeof e.text !== "string" ||
        e.text.length > 100000 || e.originalText.length > 100000) return false;
    entries.add(e.id);
  }
  for (const t of payload.tasks) if (!t || !entries.has(t.entryId) ||
      !["pending", "completed"].includes(t.status)) return false;
  return true;
}
const file = join(directory, "current.json");
const server = createServer(async (req, res) => {
  if (req.url !== "/api/sync/mirror" || !["GET","POST"].includes(req.method ?? ""))
    return respond(res, 404, { error: "Not found" });
  if (!allowed(req.headers.authorization)) return respond(res, 401, { error: "Unauthorized" });
  if (req.method === "GET") {
    try { return respond(res, 200, JSON.parse(await readFile(file, "utf8"))); }
    catch (e) { return respond(res, e.code === "ENOENT" ? 404 : 500, { error: "Preview unavailable" }); }
  }
  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) return respond(res, 413, { error: "Too large" });
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const payload = JSON.parse(raw);
    if (!valid(payload)) return respond(res, 400, { error: "Invalid mirror" });
    await mkdir(directory, { recursive: true, mode: 0o700 });
    let previous;
    try { previous = JSON.parse(await readFile(file, "utf8")); }
    catch (e) { if (e.code !== "ENOENT") throw e; }
    if (previous && previous.deviceId !== payload.deviceId)
      return respond(res, 409, { error: "Paired source device changed" });
    if (previous && Date.parse(previous.generatedAt) > Date.parse(payload.generatedAt))
      return respond(res, 409, { error: "Stale mirror" });
    const temp = join(directory, `incoming-${process.pid}-${Date.now()}.json`);
    await writeFile(temp, raw, { flag: "wx", mode: 0o600 });
    await rename(temp, file);
    return respond(res, 200, { ok: true, entries: payload.entries.length, tasks: payload.tasks.length });
  } catch {
    return respond(res, 400, { error: "Invalid payload or storage error" });
  }
});
server.listen(port, host, () => console.log(`Noeting mirror receiver listening on localhost:${port}`));
