import type { Repository } from "../data/repository";
import type { SyncStore } from "./store";
import { tailscaleOrigin } from "./origin";
import { SyncError } from "./errors";
export interface CredentialVault {
  available(): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
export type AutoSettings = {
  id: number;
  origin: string | null;
  credential_key: string | null;
  device_id: string | null;
  peer_id: string | null;
  library_id: string | null;
  enabled: number;
  generation: number;
  auth_required: number;
  last_attempt: string | null;
  last_reason: string | null;
  failures: number;
  retry_after: number;
  poll_ms: number;
  cleanup_pending: number;
};
export type SavedCredential = {
  version: 1;
  origin: string;
  device: string;
  peer: string;
  library: string;
  token: string;
};
export async function readSettings(store: SyncStore): Promise<AutoSettings> {
  return (
    await store.db.all<AutoSettings>(
      "SELECT * FROM sync_auto_settings WHERE id=1",
    )
  )[0];
}
const validToken = (value: unknown): value is string =>
  typeof value === "string" && /^[\x21-\x7e]{32,512}$/.test(value);
/** Only nonsecret settings touch SQLite. Vault payloads bind the credential to
 * all paired identities, so restore/invalidation never silently re-pairs. */
export class SyncConfiguration {
  constructor(
    readonly repo: Repository,
    readonly vault: CredentialVault,
  ) {}
  load() {
    return this.repo.sync(readSettings);
  }
  async credential(settings?: AutoSettings): Promise<SavedCredential> {
    settings ??= await this.load();
    if (
      !settings.origin ||
      !settings.credential_key ||
      !(await this.vault.available())
    )
      throw new SyncError(
        "credential",
        "Sync requires protected pairing credentials. Reauthorize in Sync with PC.",
      );
    let value: SavedCredential;
    let raw: string | null;
    try {
      raw = await this.vault.get(settings.credential_key);
    } catch {
      throw new SyncError(
        "credential",
        "Protected credentials cannot be accessed now. Sync will retry after device unlock.",
      );
    }
    if (!raw)
      throw new SyncError(
        "auth",
        "Protected pairing credentials are unavailable. Reauthorize in Sync with PC.",
      );
    try {
      value = JSON.parse(raw);
    } catch {
      throw new SyncError(
        "auth",
        "Protected pairing credentials are invalid. Reauthorize in Sync with PC.",
      );
    }
    const identity = await this.repo.sync((s) => s.identity());
    if (
      value.version !== 1 ||
      !validToken(value.token) ||
      value.origin !== tailscaleOrigin(settings.origin) ||
      value.device !== identity.device_id ||
      value.peer !== identity.peer_id ||
      value.library !== identity.library_id ||
      settings.device_id !== value.device ||
      settings.peer_id !== value.peer ||
      settings.library_id !== value.library
    )
      throw new SyncError(
        "identity",
        "Saved pairing no longer matches this device or library. Reauthorize; local data is unchanged.",
      );
    return value;
  }
  async save(
    address: string,
    token: string,
    consent: boolean,
    probe: (
      origin: string,
      token: string,
      identity: {
        device_id: string;
        peer_id: string | null;
        library_id: string | null;
      },
    ) => Promise<{ device: string; library: string | null }>,
  ) {
    if (!consent)
      throw new SyncError(
        "credential",
        "Explicit consent is required to save pairing credentials securely.",
      );
    const origin = tailscaleOrigin(address);
    const approved = await this.load();
    if (approved.origin && approved.origin !== origin)
      throw new SyncError(
        "policy",
        "The approved PC origin is pinned. Disconnect explicitly before changing it.",
      );
    if (!validToken(token) || !(await this.vault.available()))
      throw new SyncError(
        "credential",
        "Protected credential storage is unavailable on this platform. Manual sync remains available.",
      );
    const identity = await this.repo.sync((s) => s.identity());
    if (!identity.peer_id || !identity.library_id)
      throw new SyncError(
        "identity",
        "Pair and synchronize with the PC before saving automatic-sync credentials.",
      );
    const remote = await probe(origin, token, identity);
    if (
      remote.device !== identity.peer_id ||
      remote.library !== identity.library_id
    )
      throw new SyncError(
        "identity",
        "The approved endpoint does not match the paired PC and library.",
      );
    const credential: SavedCredential = {
      version: 1,
      origin,
      device: identity.device_id,
      peer: identity.peer_id,
      library: identity.library_id,
      token,
    };
    // Reserve a known protected slot before writing it. A crash or failed
    // Keystore write leaves a disabled, cleanable pointer, never an orphan
    // credential. Reauthorization replaces the same slot instead of leaking
    // an old secret if subsequent deletion fails.
    const reserved = await this.repo.sync((s) =>
      s.transaction(async () => {
        const settings = await readSettings(s),
          current = await s.identity();
        if (
          (settings.origin && settings.origin !== origin) ||
          current.device_id !== credential.device ||
          current.peer_id !== credential.peer ||
          current.library_id !== credential.library
        )
          throw new SyncError(
            "identity",
            "Pairing changed while saving credentials. Retry authorization.",
          );
        const [random] = await s.db.all<{ id: string }>(
          "SELECT lower(hex(randomblob(16))) AS id",
        );
        const key = settings.credential_key ?? `noeting.sync.${random.id}`;
        await s.db.run(
          "UPDATE sync_auto_settings SET credential_key=?,enabled=0,generation=generation+1,auth_required=1,cleanup_pending=1,last_reason='Saving protected pairing; automatic sync is off.' WHERE id=1",
          [key],
        );
        return { key, generation: settings.generation + 1 };
      }),
    );
    await this.vault.set(reserved.key, JSON.stringify(credential));
    await this.repo.sync((s) =>
      s.transaction(async () => {
        const settings = await readSettings(s),
          current = await s.identity();
        if (
          settings.generation !== reserved.generation ||
          settings.credential_key !== reserved.key ||
          current.device_id !== credential.device ||
          current.peer_id !== credential.peer ||
          current.library_id !== credential.library
        )
          throw new SyncError(
            "identity",
            "Pairing changed while saving credentials. Retry authorization.",
          );
        await s.db.run(
          "UPDATE sync_auto_settings SET origin=?,device_id=?,peer_id=?,library_id=?,generation=generation+1,auth_required=0,last_reason='Pairing saved securely; automatic sync is off.',failures=0,retry_after=0,cleanup_pending=0 WHERE id=1",
          [origin, credential.device, credential.peer, credential.library],
        );
      }),
    );
    return this.load();
  }
  async setEnabled(enabled: boolean) {
    if (enabled) await this.credential();
    await this.repo.sync((s) =>
      s.transaction(async () => {
        const settings = await readSettings(s);
        if (enabled && settings.auth_required)
          throw new SyncError(
            "auth",
            "Reauthorize and save the current pairing secret before enabling automatic sync.",
          );
        await s.db.run(
          "UPDATE sync_auto_settings SET enabled=?,generation=generation+1,retry_after=0,failures=0,last_reason=? WHERE id=1",
          [
            Number(enabled),
            enabled ? "Automatic sync enabled." : "Automatic sync off.",
          ],
        );
      }),
    );
    return this.load();
  }
  async disconnect() {
    const settings = await this.load();
    // Disable and fence workers before attempting protected-store cleanup.
    await this.repo.sync((s) =>
      s.transaction(() =>
        s.db.run(
          "UPDATE sync_auto_settings SET enabled=0,generation=generation+1,origin=NULL,auth_required=0,retry_after=0,cleanup_pending=1,last_reason='Disconnected; local library preserved.' WHERE id=1",
        ),
      ),
    );
    if (settings.credential_key)
      await this.vault.remove(settings.credential_key);
    await this.repo.sync((s) =>
      s.transaction(() =>
        s.db.run(
          "UPDATE sync_auto_settings SET credential_key=NULL,cleanup_pending=0 WHERE id=1",
        ),
      ),
    );
  }
  async requireAttention(reason: string, generation: number) {
    await this.repo.sync((s) =>
      s.transaction(() =>
        s.db.run(
          "UPDATE sync_auto_settings SET auth_required=1,generation=generation+1,last_reason=? WHERE id=1 AND generation=?",
          [reason, generation],
        ),
      ),
    );
  }
}
