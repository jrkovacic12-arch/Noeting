import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { replica } from "./syncFixtures";
import { harness } from "./syncHttpFixtures";
import { syncNow } from "../src/sync/client";
import {
  SyncConfiguration,
  type CredentialVault,
} from "../src/sync/configuration";
import {
  BackgroundRegistration,
  BACKGROUND_SYNC_TASK,
  type BackgroundDriver,
} from "../src/sync/backgroundRegistration";
import {
  defineAutomaticTask,
  type GlobalTaskAdapter,
} from "../src/sync/headless";
async function setup(filename?: string) {
  const a = replica(filename),
    h = await harness();
  await syncNow(a.repo, h.rpc, true);
  const values = new Map<string, string>();
  const vault: CredentialVault = {
    available: async () => true,
    get: async (key) => values.get(key) ?? null,
    set: async (key, v) => {
      values.set(key, v);
    },
    remove: async (key) => {
      values.delete(key);
    },
  };
  const configuration = new SyncConfiguration(a.repo, vault);
  await configuration.save(
    "https://pc.tailnet.ts.net",
    "background-test-secret-".repeat(2),
    true,
    async (_o, _t, i) =>
      h.rpc("pair", { device: i.device_id, library: i.library_id }),
  );
  return { a, h, vault, configuration };
}
function worker() {
  let registered = false,
    registers = 0,
    unregisters = 0;
  const driver: BackgroundDriver = {
    available: async () => true,
    registered: async () => registered,
    register: async (minutes) => {
      assert.equal(minutes, 15);
      registers++;
      registered = true;
    },
    unregister: async () => {
      unregisters++;
      registered = false;
    },
  };
  return {
    driver,
    get registered() {
      return registered;
    },
    get registers() {
      return registers;
    },
    get unregisters() {
      return unregisters;
    },
  };
}
test("enabling registers one named 15-minute worker; repeated initialization and disconnect reconcile safely", async () => {
  const x = await setup(),
    w = worker(),
    registration = new BackgroundRegistration(x.configuration, w.driver);
  try {
    await registration.reconcile();
    assert.equal(w.registers, 0);
    await x.configuration.setEnabled(true);
    await Promise.all([registration.reconcile(), registration.reconcile()]);
    assert.equal(w.registers, 1);
    assert.ok(w.registered);
    await x.configuration.setEnabled(false);
    await registration.reconcile();
    assert.equal(w.unregisters, 1);
    await x.configuration.disconnect();
    await registration.reconcile();
    assert.equal(w.registers, 1);
  } finally {
    await x.h.close();
    x.a.db.close();
  }
});
test("a registration already in flight cannot revive a disabled automatic-sync setting", async () => {
  const x = await setup(),
    w = worker();
  let release!: () => void, entered!: () => void;
  const ready = new Promise<void>((r) => {
      entered = r;
    }),
    wait = new Promise<void>((r) => {
      release = r;
    });
  const register = w.driver.register;
  w.driver.register = async (minutes) => {
    entered();
    await wait;
    await register(minutes);
  };
  try {
    await x.configuration.setEnabled(true);
    const registration = new BackgroundRegistration(x.configuration, w.driver);
    const flight = registration.reconcile();
    await ready;
    await x.configuration.setEnabled(false);
    release();
    await flight;
    assert.equal(w.registered, false);
  } finally {
    release?.();
    await x.h.close();
    x.a.db.close();
  }
});
test("module-scope TaskManager adapter executes a real HTTP sync from a freshly opened SQLite library without React", async () => {
  const dir = await mkdtemp(join(tmpdir(), "headless-")),
    file = join(dir, "phone.sqlite");
  const x = await setup(file);
  const handlers = new Map<
    string,
    (body: { error?: unknown }) => Promise<number>
  >();
  let definitions = 0,
    opens = 0,
    calls = 0;
  const connections: Array<ReturnType<typeof replica>> = [];
  const manager: GlobalTaskAdapter = {
    isTaskDefined: (name) => handlers.has(name),
    defineTask: (name, handler) => {
      definitions++;
      handlers.set(name, handler);
    },
  };
  try {
    await x.configuration.setEnabled(true);
    await x.h.pc.repository.saveCapture({
      requestId: "pc",
      kind: "note",
      text: "headless PC content",
    });
    const factory = async () => {
      opens++;
      const opened = replica(file);
      connections.push(opened);
      return {
        repo: opened.repo,
        configuration: new SyncConfiguration(opened.repo, x.vault),
        readDraft: async () => null,
        rpc: () => async (action: string, input: Record<string, unknown>) => {
          calls++;
          return x.h.rpc(action, input);
        },
      };
    };
    defineAutomaticTask(manager, BACKGROUND_SYNC_TASK, factory, {
      success: 1,
      failed: 2,
    });
    defineAutomaticTask(manager, BACKGROUND_SYNC_TASK, factory, {
      success: 1,
      failed: 2,
    });
    assert.equal(definitions, 1);
    assert.equal(await handlers.get(BACKGROUND_SYNC_TASK)!({}), 1);
    assert.equal(opens, 1);
    assert.equal(
      (await x.a.repo.readSnapshot()).entries[0].text,
      "headless PC content",
    );
    await x.configuration.setEnabled(false);
    const before = calls;
    assert.equal(await handlers.get(BACKGROUND_SYNC_TASK)!({}), 1);
    assert.equal(calls, before);
    assert.equal(
      await handlers.get(BACKGROUND_SYNC_TASK)!({
        error: { code: "cancelled" },
      }),
      2,
    );
    assert.equal(opens, 2);
  } finally {
    for (const connection of connections) connection.db.close();
    await x.h.close();
    x.a.db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("restricted background platform does not register or silently replace foreground behavior", async () => {
  const x = await setup(),
    w = worker();
  try {
    await x.configuration.setEnabled(true);
    w.driver.available = async () => false;
    const message = await new BackgroundRegistration(
      x.configuration,
      w.driver,
    ).reconcile();
    assert.match(message, /unavailable/);
    assert.equal(w.registers, 0);
    assert.equal((await x.configuration.load()).enabled, 1);
  } finally {
    await x.h.close();
    x.a.db.close();
  }
});

test("native expiration cancels headless work before transfer and cleans its listener", async () => {
  const x = await setup();
  let abort!: () => void,
    removed = 0,
    requests = 0;
  const handlers = new Map<
    string,
    (body: { error?: unknown }) => Promise<number>
  >();
  const adapter: GlobalTaskAdapter = {
    isTaskDefined: (name) => handlers.has(name),
    defineTask: (name, handler) => {
      handlers.set(name, handler);
    },
  };
  try {
    await x.configuration.setEnabled(true);
    defineAutomaticTask(
      adapter,
      BACKGROUND_SYNC_TASK,
      async () => {
        abort();
        return {
          repo: x.a.repo,
          configuration: x.configuration,
          readDraft: async () => null,
          rpc: () => async (action, input) => {
            requests++;
            return x.h.rpc(action, input);
          },
        };
      },
      {
        success: 1,
        failed: 2,
        onExpiration: (callback) => {
          abort = callback;
          return {
            remove: () => {
              removed++;
            },
          };
        },
      },
    );
    assert.equal(await handlers.get(BACKGROUND_SYNC_TASK)!({}), 1);
    assert.equal(requests, 0);
    assert.equal(removed, 1);
  } finally {
    await x.h.close();
    x.a.db.close();
  }
});
