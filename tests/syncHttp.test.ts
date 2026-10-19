import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPCServer, openPC } from "../src/sync/server";
import {
  syncNow,
  resolveConflict,
  readPaged,
  keepBoth,
  type RPC,
} from "../src/sync/client";
import { replica } from "./syncFixtures";
import type { Operation } from "../src/sync/schema";
const pcSecret = "test-only-pc-admin-".repeat(3);
const secret = "test-only-secret-".repeat(3);
async function harness(filename?: string) {
  const pc = filename
    ? await openPC(filename)
    : { repository: replica().repo, close: () => {} };
  const server = createPCServer(pc.repository, secret, undefined, pcSecret);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const rpc: RPC = async (action, input) => {
    if (action === "edit" && !input.expected)
      input = {
        ...input,
        expected: await pc.repository.sync(async (s) =>
          s.current(await s.records()),
        ),
      };
    const response = await fetch(`${address}/api/sync/v2/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${["pc", "edit", "revoke", "allow", "pc-resolve"].includes(action) ? pcSecret : secret}`,
      },
      body: JSON.stringify({ protocol: 2, ...input }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  };
  return {
    pc,
    server,
    address,
    rpc,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      pc.close();
    },
  };
}
test("HTTP two-way Notes, Tasks, folders, pins, removed records, provenance and repeated sync", async () => {
  const a = replica(),
    h = await harness();
  try {
    const source = await a.repo.saveCapture({
      requestId: "source",
      kind: "note",
      text: "source original",
    });
    const n = await a.repo.saveLinkedEntry({
      requestId: "note",
      kind: "note",
      text: "phone original",
      sourceEntryId: source.entryId,
    });
    await a.repo.createFolder("f", "Folder");
    await a.repo.organizeNotes([n.entryId], { folderId: "f", pinned: true });
    const parent = await a.repo.saveCapture({
      requestId: "parent",
      kind: "task",
      text: "parent",
    });
    const child = await a.repo.saveSubtask({
      requestId: "child",
      parentTaskId: parent.taskId!,
      text: "child",
    });
    const removed = await a.repo.removeEntry(source.entryId);
    await syncNow(a.repo, h.rpc, true);
    assert.deepEqual(
      await a.repo.sync((s) => s.records()),
      await h.pc.repository.sync((s) => s.records()),
    );
    await h.rpc("edit", {
      command: "capture",
      args: { requestId: "pc-note", kind: "note", text: "PC original" },
    });
    await h.rpc("edit", {
      command: "text",
      args: { id: child.entryId, text: "PC Task edit" },
    });
    await h.rpc("edit", { command: "complete", args: { id: child.taskId } });
    await h.rpc("edit", { command: "deleteFolder", args: { id: "f" } });
    await h.rpc("edit", { command: "restore", args: removed });
    await syncNow(a.repo, h.rpc);
    assert.deepEqual(
      await a.repo.sync((s) => s.records()),
      await h.pc.repository.sync((s) => s.records()),
    );
    const snapshot = await a.repo.readSnapshot();
    assert.equal(
      snapshot.entries.find((e) => e.id === n.entryId)!.folderId,
      null,
    );
    assert.ok(snapshot.entries.find((e) => e.id === n.entryId)!.notePinnedAt);
    assert.equal(
      snapshot.tasks.find((t) => t.id === parent.taskId)!.status,
      "completed",
    );
    assert.equal(
      snapshot.entries.find((e) => e.id === child.entryId)!.originalText,
      "child",
    );
    await a.repo.reopenTask(parent.taskId!);
    await syncNow(a.repo, h.rpc);
    assert.ok(
      (await h.pc.repository.readSnapshot()).tasks.every(
        (t) => t.status === "pending",
      ),
    );
    const before = await h.pc.repository.sync((s) => s.history(0));
    await syncNow(a.repo, h.rpc);
    assert.deepEqual(await h.pc.repository.sync((s) => s.history(0)), before);
  } finally {
    await h.close();
    a.db.close();
  }
});
test("HTTP concurrent edits and edit/delete retain both values; explicit resolution converges", async () => {
  const a = replica(),
    h = await harness();
  try {
    const n = await a.repo.saveCapture({
      requestId: "n",
      kind: "note",
      text: "original",
    });
    await syncNow(a.repo, h.rpc, true);
    await a.repo.editEntry(n.entryId, "Android offline");
    await h.pc.repository.editEntry(n.entryId, "PC offline");
    const status = await syncNow(a.repo, h.rpc);
    assert.equal(status.conflicts, 1);
    assert.equal(
      (await a.repo.readSnapshot()).entries[0].text,
      "Android offline",
    );
    assert.equal(
      (await h.pc.repository.readSnapshot()).entries[0].text,
      "PC offline",
    );
    const [conflict] = await a.repo.sync((s) => s.conflicts());
    await resolveConflict(a.repo, h.rpc, conflict.operation.id, "android");
    assert.equal(
      (await h.pc.repository.readSnapshot()).entries[0].text,
      "Android offline",
    );
    assert.deepEqual(
      await a.repo.sync((s) => s.records()),
      await h.pc.repository.sync((s) => s.records()),
    );
    await a.repo.editEntry(n.entryId, "phone after resolution");
    await h.pc.repository.removeEntry(n.entryId);
    await syncNow(a.repo, h.rpc);
    const [deletion] = await a.repo.sync((s) => s.conflicts());
    await resolveConflict(a.repo, h.rpc, deletion.operation.id, "pc");
    assert.ok((await a.repo.readSnapshot()).entries[0].removed);
    assert.equal((await a.repo.sync((s) => s.conflicts())).length, 0);
  } finally {
    await h.close();
    a.db.close();
  }
});
test("HTTP interrupted pull, bootstrap response loss, durable restart and retries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "noeting-sync-"));
  const a = replica(join(dir, "phone.sqlite"));
  let h = await harness(join(dir, "pc.sqlite"));
  try {
    const n = await a.repo.saveCapture({
      requestId: "n",
      kind: "note",
      text: "initial",
    });
    let fail = true;
    const interrupted: RPC = async (action, input) => {
      const result = await h.rpc(action, input);
      if (action === "bootstrap" && fail) {
        fail = false;
        throw new Error("response lost");
      }
      return result;
    };
    await assert.rejects(syncNow(a.repo, interrupted, true), /response lost/);
    await a.repo.editEntry(n.entryId, "saved after lost response");
    await syncNow(a.repo, h.rpc);
    assert.equal(
      (await h.pc.repository.readSnapshot()).entries[0].text,
      "saved after lost response",
    );
    await h.pc.repository.editEntry(n.entryId, "remote after restart");
    await h.close();
    h = await harness(join(dir, "pc.sqlite"));
    const cursor = await a.repo.sync(async (s) => (await s.identity()).cursor);
    const failEvent: RPC = async (action, input) => {
      if (action === "event") throw new Error("network half");
      return h.rpc(action, input);
    };
    await assert.rejects(syncNow(a.repo, failEvent), /network half/);
    assert.equal((await a.repo.sync((s) => s.identity())).cursor, cursor);
    await syncNow(a.repo, h.rpc);
    assert.equal(
      (await a.repo.readSnapshot()).entries[0].text,
      "remote after restart",
    );
  } finally {
    await h.close();
    a.db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("HTTP rejects unauthorized, CSRF, malformed, identity changes and stale concurrent uploads without mutation", async () => {
  const a = replica(),
    h = await harness();
  try {
    const n = await a.repo.saveCapture({
      requestId: "n",
      kind: "note",
      text: "original",
    });
    await syncNow(a.repo, h.rpc, true);
    for (const headers of [
      {},
      { Authorization: `Bearer ${secret}`, Origin: "https://attacker.example" },
    ] as Record<string, string>[]) {
      const r = await fetch(`${h.address}/api/sync/v2/pc`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: '{"protocol":2}',
      });
      assert.ok([401, 403].includes(r.status));
    }
    const malformed = await fetch(`${h.address}/api/sync/v2/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: "invalid",
    });
    assert.equal(malformed.status, 400);
    const identity = await a.repo.sync((s) => s.identity());
    const base = await h.pc.repository.sync((s) =>
      s.current([{ table: "entries", id: n.entryId, value: null }]),
    );
    const submit = async (id: string) => {
      const op: Operation = {
        protocol: 2,
        id,
        origin: identity.device_id,
        changes: base.map((c) => ({
          ...c,
          value: { ...c.value!, edited_text: id },
        })),
      };
      const info = { device: identity.device_id, library: identity.library_id };
      await h.rpc("stage", {
        ...info,
        transfer: id,
        part: 0,
        text: JSON.stringify(op),
      });
      const outcome = await h.rpc("push", { ...info, transfer: id, parts: 1 });
      return readPaged(
        h.rpc,
        "outcome",
        info,
        outcome.outcomeId,
        outcome.parts,
      );
    };
    const results = await Promise.all([submit("a"), submit("b")]);
    assert.equal(results.filter((r) => r.event).length, 1);
    assert.equal(results.filter((r) => r.conflict).length, 1);
    await assert.rejects(
      h.rpc("pair", { device: "b".repeat(32), library: identity.library_id }),
      /different phone/,
    );
    const noPC = await fetch(`${h.address}/api/sync/v2/pc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ protocol: 2 }),
    });
    assert.equal(noPC.status, 403);
    await h.rpc("revoke", {});
    await assert.rejects(syncNow(a.repo, h.rpc), /revoked/);
    await assert.rejects(
      h.rpc("outcome", {
        device: identity.device_id,
        library: identity.library_id,
        id: "a",
        part: 0,
      }),
      /revoked/,
    );
  } finally {
    await h.close();
    a.db.close();
  }
});
test("HTTP large bootstrap and 100-event history pages remain bounded", async () => {
  const a = replica(),
    h = await harness();
  try {
    // A >2MB library must travel through many bounded pages, including a removed source.
    for (let i = 0; i < 120; i++)
      await a.repo.saveCapture({
        requestId: `n${i}`,
        kind: "note",
        text: `${i} ` + "words ".repeat(3500),
      });
    let pages = 0;
    const bounded: RPC = async (action, input) => {
      assert.ok(Buffer.byteLength(JSON.stringify(input)) < 1_000_000);
      if (action === "stage") pages++;
      return h.rpc(action, input);
    };
    await syncNow(a.repo, bounded, true);
    assert.ok(pages > 10);
    for (let i = 0; i < 105; i++)
      await h.pc.repository.editEntry(`entry_n${i}`, `PC edit ${i}`);
    await syncNow(a.repo, h.rpc);
    assert.deepEqual(
      await a.repo.sync((s) => s.records()),
      await h.pc.repository.sync((s) => s.records()),
    );
  } finally {
    await h.close();
    a.db.close();
  }
});
test("multiple offline edits resolve as one connected choice, including a PC-side resolution", async () => {
  const a = replica(),
    h = await harness();
  try {
    const n = await a.repo.saveCapture({
      requestId: "n",
      kind: "note",
      text: "first",
    });
    await syncNow(a.repo, h.rpc, true);
    await a.repo.editEntry(n.entryId, "phone second");
    await a.repo.editEntry(n.entryId, "phone third");
    await h.pc.repository.editEntry(n.entryId, "PC second");
    await syncNow(a.repo, h.rpc);
    assert.equal((await a.repo.sync((s) => s.conflicts())).length, 2);
    const [conflict] = await a.repo.sync((s) => s.conflicts());
    await resolveConflict(a.repo, h.rpc, conflict.operation.id, "android");
    assert.equal((await a.repo.sync((s) => s.conflicts())).length, 0);
    assert.equal((await h.pc.repository.sync((s) => s.conflicts())).length, 0);
    assert.equal(
      (await h.pc.repository.readSnapshot()).entries[0].text,
      "phone third",
    );
    await a.repo.editEntry(n.entryId, "next phone");
    await h.pc.repository.editEntry(n.entryId, "next PC");
    await syncNow(a.repo, h.rpc);
    const [next] = await h.pc.repository.sync((s) => s.conflicts());
    await h.rpc("pc-resolve", { id: next.operation.id, choice: "pc" });
    await syncNow(a.repo, h.rpc);
    assert.equal((await a.repo.readSnapshot()).entries[0].text, "next PC");
    assert.equal((await a.repo.sync((s) => s.conflicts())).length, 0);
  } finally {
    await h.close();
    a.db.close();
  }
});
test("incoming dependency conflicts from unique folder names remain explicitly resolvable", async () => {
  const a = replica(),
    h = await harness();
  try {
    await syncNow(a.repo, h.rpc, true);
    await a.repo.createFolder("phone-folder", "Same name");
    await h.pc.repository.createFolder("pc-folder", "Same name");
    await syncNow(a.repo, h.rpc);
    const conflicts = await a.repo.sync((s) => s.conflicts());
    assert.equal(conflicts.length, 2);
    const phone = conflicts.find((c) =>
      c.operation.changes.some((r) => r.id === "phone-folder"),
    )!;
    await resolveConflict(a.repo, h.rpc, phone.operation.id, "pc");
    const incoming = (await a.repo.sync((s) => s.conflicts())).find((c) =>
      c.operation.changes.some((r) => r.id === "pc-folder"),
    )!;
    await resolveConflict(a.repo, h.rpc, incoming.operation.id, "pc");
    assert.equal((await a.repo.sync((s) => s.conflicts())).length, 0);
    assert.deepEqual(
      await a.repo.sync((s) => s.records()),
      await h.pc.repository.sync((s) => s.records()),
    );
  } finally {
    await h.close();
    a.db.close();
  }
});

test("standalone Note keep-both preserves both captures and conflict journals survive reopen", async () => {
  const dir = await mkdtemp(join(tmpdir(), "noeting-conflict-"));
  let a = replica(join(dir, "phone.sqlite"));
  let h = await harness(join(dir, "pc.sqlite"));
  try {
    const n = await a.repo.saveCapture({
      requestId: "n",
      kind: "note",
      text: "original",
    });
    await syncNow(a.repo, h.rpc, true);
    await a.repo.editEntry(n.entryId, "Android copy");
    await h.pc.repository.editEntry(n.entryId, "PC copy");
    await syncNow(a.repo, h.rpc);
    a.db.close();
    a = replica(join(dir, "phone.sqlite"));
    await h.close();
    h = await harness(join(dir, "pc.sqlite"));
    const [conflict] = await a.repo.sync((s) => s.conflicts());
    assert.ok(conflict);
    assert.equal((await h.pc.repository.sync((s) => s.conflicts())).length, 1);
    await keepBoth(a.repo, h.rpc, conflict.operation.id);
    const notes = (await a.repo.readSnapshot()).entries;
    assert.equal(notes.length, 2);
    assert.equal(
      notes.find((e) => e.id === n.entryId)!.originalText,
      "original",
    );
    assert.equal(notes.find((e) => e.id === n.entryId)!.text, "PC copy");
    assert.equal(notes.find((e) => e.id !== n.entryId)!.text, "Android copy");
    assert.deepEqual(
      await a.repo.sync((s) => s.records()),
      await h.pc.repository.sync((s) => s.records()),
    );
  } finally {
    await h.close();
    a.db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
