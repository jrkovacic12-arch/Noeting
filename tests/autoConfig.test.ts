import assert from "node:assert/strict";
import { test } from "node:test";
import { replica } from "./syncFixtures";
import {
  SyncConfiguration,
  type CredentialVault,
} from "../src/sync/configuration";
import { tailscaleOrigin } from "../src/sync/origin";
const origin = "https://pc.tailnet.ts.net",
  token = "protected-test-only-secret-".repeat(2);
export function memoryVault() {
  const values = new Map<string, string>();
  const vault: CredentialVault = {
    available: async () => true,
    get: async (k) => values.get(k) ?? null,
    set: async (k, v) => {
      values.set(k, v);
    },
    remove: async (k) => {
      values.delete(k);
    },
  };
  return { values, vault };
}
async function setup() {
  const p = replica();
  await p.repo.initialize();
  await p.repo.sync((s) => s.bind("b".repeat(32), "library"));
  const v = memoryVault();
  const c = new SyncConfiguration(p.repo, v.vault);
  const probe = async () => ({ device: "b".repeat(32), library: "library" });
  return { ...p, ...v, c, probe };
}
test("only exact canonical Tailscale Serve HTTPS origins are accepted", () => {
  assert.equal(tailscaleOrigin(origin + "/"), origin);
  for (const invalid of [
    "https://pc.example/",
    "http://pc.tailnet.ts.net/",
    "https://100.70.1.2/",
    "https://192.168.1.1/",
    "https://pc.tailnet.ts.net:443/",
    "https://pc.tailnet.ts.net/path",
    "https://pc.tailnet.ts.net/?x=1",
    "https://user:secret@pc.tailnet.ts.net/",
    "https://pc.tailnet.ts.net/#x",
    "https://pc.tailnet.ts.net.evil.example/",
    "https://PC.tailnet.ts.net/",
    "https://pc.tailnet.ts.net/%2e",
    " https://pc.tailnet.ts.net/",
  ])
    assert.throws(() => tailscaleOrigin(invalid));
});
test("explicit consent and authenticated matching PC identity precede secure save", async () => {
  const p = await setup();
  try {
    await assert.rejects(p.c.save(origin, token, false, p.probe), /consent/);
    assert.equal(p.values.size, 0);
    await assert.rejects(
      p.c.save(origin, token, true, async () => ({
        device: "c".repeat(32),
        library: "library",
      })),
      /does not match/,
    );
    assert.equal(p.values.size, 0);
    await p.c.save(origin, token, true, p.probe);
    assert.equal(p.values.size, 1);
    assert.equal((await p.c.load()).enabled, 0);
    assert.equal((await p.c.credential()).token, token);
    const dump = p.db.prepare("SELECT * FROM sync_auto_settings").get();
    assert.ok(!JSON.stringify(dump).includes(token));
    assert.equal((await p.c.load()).origin, origin);
    await p.c.setEnabled(true);
    assert.equal((await p.c.load()).enabled, 1);
  } finally {
    p.db.close();
  }
});
test("missing or invalidated credentials and unrelated restored identities do not re-pair", async () => {
  const p = await setup();
  try {
    await p.c.save(origin, token, true, p.probe);
    const before = await p.repo.sync((s) => s.identity());
    p.values.clear();
    await assert.rejects(p.c.setEnabled(true), /unavailable/);
    assert.deepEqual(await p.repo.sync((s) => s.identity()), before);
    assert.equal((await p.c.load()).enabled, 0);
    await p.c.save(origin, token, true, p.probe);
    await p.repo.sync((s) =>
      s.db.run("UPDATE sync_auto_settings SET peer_id=?", ["different"]),
    );
    await assert.rejects(p.c.credential(), /no longer matches/);
  } finally {
    p.db.close();
  }
});
test("off and disconnect fence old workers, delete protected credential and retain domain/history/identity", async () => {
  const p = await setup();
  try {
    await p.repo.saveCapture({ requestId: "n", kind: "note", text: "keep" });
    await p.c.save(origin, token, true, p.probe);
    await p.c.setEnabled(true);
    const old = await p.c.load();
    const identity = await p.repo.sync((s) => s.identity());
    await p.c.setEnabled(false);
    assert.ok((await p.c.load()).generation > old.generation);
    assert.equal(p.values.size, 1);
    await p.c.disconnect();
    assert.equal(p.values.size, 0);
    assert.equal((await p.c.load()).origin, null);
    assert.equal((await p.repo.readSnapshot()).entries[0].text, "keep");
    assert.deepEqual(await p.repo.sync((s) => s.identity()), identity);
    assert.equal((await p.repo.sync((s) => s.pending())).length, 1);
  } finally {
    p.db.close();
  }
});
test("secure-store deletion failure leaves sync disabled and allows cleanup retry", async () => {
  const p = await setup();
  try {
    await p.c.save(origin, token, true, p.probe);
    let fail = true;
    const remove = p.vault.remove;
    p.vault.remove = async (key) => {
      if (fail) throw Error("keystore locked");
      return remove(key);
    };
    await assert.rejects(p.c.disconnect());
    const settings = await p.c.load();
    assert.equal(settings.enabled, 0);
    assert.equal(settings.origin, null);
    assert.equal(settings.cleanup_pending, 1);
    fail = false;
    await p.c.disconnect();
    assert.equal(p.values.size, 0);
  } finally {
    p.db.close();
  }
});

test("reauthorization replaces one protected slot and disconnect removes the rotated secret", async () => {
  const p = await setup();
  try {
    await p.c.save(origin, token, true, p.probe);
    const key = (await p.c.load()).credential_key;
    const rotated = "rotated-protected-test-secret-".repeat(2);
    await p.c.save(origin, rotated, true, p.probe);
    assert.equal((await p.c.load()).credential_key, key);
    assert.equal(p.values.size, 1);
    assert.equal((await p.c.credential()).token, rotated);
    await p.c.disconnect();
    assert.equal(p.values.size, 0);
  } finally {
    p.db.close();
  }
});
test("a failed protected write retains a disabled cleanable pointer across configuration restart", async () => {
  const p = await setup();
  try {
    p.c.vault.set = async () => {
      throw Error("Keystore inaccessible");
    };
    await assert.rejects(p.c.save(origin, token, true, p.probe), /Keystore/);
    const settings = await p.c.load();
    assert.equal(settings.enabled, 0);
    assert.equal(settings.auth_required, 1);
    assert.equal(settings.cleanup_pending, 1);
    assert.ok(settings.credential_key);
    await new SyncConfiguration(p.repo, p.c.vault).disconnect();
    assert.equal((await p.c.load()).credential_key, null);
  } finally {
    p.db.close();
  }
});
