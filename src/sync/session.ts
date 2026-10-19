import type { Repository } from "../data/repository";
import type { SyncStore } from "./store";
import type { Event } from "./schema";
import type { RPC } from "./client";
import { readSettings } from "./configuration";
import { SyncError } from "./errors";
const TTL = 120_000;
export type SessionOptions = {
  automaticGeneration?: number;
  requirePaired?: boolean;
  onPaired?: (identity: {
    device_id: string;
    peer_id: string | null;
    library_id: string | null;
  }) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
  maxDurationMs?: number;
  maxOperations?: number;
  maxEvents?: number;
  prepareReplay?: (event?: Event) => Promise<() => void>;
  assertReplay?: (store: SyncStore) => Promise<void>;
};
type Lease = { owner: string; epoch: number; expires_at: number };
/** The mutex is held only by db(). Every writer rechecks the fencing token in
 * its BEGIN IMMEDIATE transaction, including after a slow/late HTTP response. */
export class SyncSession {
  readonly now: () => number;
  readonly started: number;
  readonly deadline: number;
  private timer: ReturnType<typeof setTimeout>;
  private readonly controller = new AbortController();
  private readonly externalAbort: () => void;
  constructor(
    readonly repo: Repository,
    readonly lease: Lease,
    readonly options: SessionOptions,
  ) {
    this.now = options.now ?? Date.now;
    this.started = this.now();
    this.deadline = this.started + (options.maxDurationMs ?? 120_000);
    this.timer = setTimeout(
      () => this.controller.abort(),
      options.maxDurationMs ?? 120_000,
    );
    this.externalAbort = () => this.controller.abort();
    options.signal?.addEventListener("abort", this.externalAbort, {
      once: true,
    });
  }
  checkBudget() {
    if (this.options.signal?.aborted)
      throw new SyncError(
        "cancelled",
        "Sync cancelled; committed changes remain saved.",
      );
    if (this.now() >= this.deadline || this.controller.signal.aborted)
      throw new SyncError(
        "budget",
        "More changes remain; sync will resume on a later attempt.",
      );
  }
  private async fence(store: SyncStore) {
    const [lease] = await store.db.all<Lease>(
      "SELECT owner,epoch,expires_at FROM sync_session_lease WHERE id=1",
    );
    const now = this.now();
    if (
      lease.owner !== this.lease.owner ||
      lease.epoch !== this.lease.epoch ||
      lease.expires_at <= now ||
      lease.expires_at > now + TTL
    )
      throw new SyncError(
        "busy",
        "Sync session ownership expired; retry safely.",
      );
    if (this.options.automaticGeneration !== undefined) {
      const settings = await readSettings(store);
      if (
        !settings.enabled ||
        settings.auth_required ||
        settings.generation !== this.options.automaticGeneration
      )
        throw new SyncError(
          "cancelled",
          "Automatic sync was disabled or reauthorized.",
        );
    }
    await store.db.run(
      "UPDATE sync_session_lease SET expires_at=? WHERE id=1 AND owner=? AND epoch=?",
      [now + TTL, this.lease.owner, this.lease.epoch],
    );
  }
  db<T>(work: (store: SyncStore) => Promise<T>): Promise<T> {
    return this.repo.sync(async (store) => {
      store.beforeTransaction = () => this.fence(store);
      await store.transaction(async () => undefined);
      return work(store);
    });
  }
  async rpc(rpc: RPC, action: string, input: Record<string, unknown>) {
    this.checkBudget();
    await this.db(async () => undefined);
    this.checkBudget();
    try {
      const result = await rpc(action, input, {
        signal: this.controller.signal,
        timeoutMs: Math.max(1, Math.min(20_000, this.deadline - this.now())),
      });
      await this.db(async () => undefined);
      return result;
    } catch (error) {
      this.checkBudget();
      throw error;
    }
  }
  async replay(event: Event) {
    const release = await this.options.prepareReplay?.(event);
    try {
      await this.db((store) =>
        store.replay(
          event,
          () => this.options.assertReplay?.(store) ?? Promise.resolve(),
        ),
      );
    } finally {
      release?.();
    }
  }
  async finish() {
    clearTimeout(this.timer);
    this.options.signal?.removeEventListener("abort", this.externalAbort);
    await this.repo.sync((store) =>
      store.transaction(() =>
        store.db.run(
          "UPDATE sync_session_lease SET owner=NULL,expires_at=0 WHERE id=1 AND owner=? AND epoch=?",
          [this.lease.owner, this.lease.epoch],
        ),
      ),
    );
  }
}
export async function withSyncSession<T>(
  repo: Repository,
  options: SessionOptions,
  work: (session: SyncSession) => Promise<T>,
) {
  const now = (options.now ?? Date.now)();
  const lease = await repo.sync((store) =>
    store.transaction(async () => {
      const [existing] = await store.db.all<Lease>(
        "SELECT owner,epoch,expires_at FROM sync_session_lease WHERE id=1",
      );
      if (
        existing.owner &&
        existing.expires_at > now &&
        existing.expires_at <= now + TTL
      )
        throw new SyncError(
          "busy",
          "Another synchronization session is running.",
        );
      const [random] = await store.db.all<{ id: string }>(
        "SELECT lower(hex(randomblob(16))) AS id",
      );
      const lease = {
        owner: random.id,
        epoch: existing.epoch + 1,
        expires_at: now + TTL,
      };
      await store.db.run(
        "UPDATE sync_session_lease SET owner=?,epoch=?,expires_at=? WHERE id=1",
        [lease.owner, lease.epoch, lease.expires_at],
      );
      return lease;
    }),
  );
  const session = new SyncSession(repo, lease, options);
  try {
    return await work(session);
  } finally {
    await session.finish();
  }
}
