import type { EditorDraft } from './EntryEditor';
type Drafts = Record<string, EditorDraft>;
const unsaved = 'Unsaved draft. Retry before leaving.';

/** Leading write plus a bounded 50ms window; flush bypasses the window. */
export class DraftPersistence {
  values: Drafts = {};
  error: string | null = null;
  private version = 0;
  private persisted = 0;
  private queue: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private write: (raw: string) => Promise<void>, private changed: () => void) {}

  put(context: string, next: EditorDraft | null) {
    this.values = { ...this.values };
    if (next) this.values[context] = next;
    else delete this.values[context];
    this.version++;
    this.changed();
    if (!this.timer) {
      this.persist();
      this.timer = setTimeout(() => {
        this.timer = null;
        this.persist();
      }, 50);
    }
  }
  private persist() {
    this.queue = this.queue.then(async () => {
      if (this.persisted === this.version) return;
      const version = this.version;
      const raw = JSON.stringify(this.values);
      try {
        await this.write(raw);
        this.persisted = version;
        // An old successful write does not confirm newer words.
        if (this.version === version) this.error = null;
      } catch {
        this.error = unsaved;
      }
      this.changed();
    });
  }
  async flush(): Promise<boolean> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    // Retry once after a failed write, preserving the existing recovery contract.
    for (let failures = 0; failures < 2;) {
      this.persist();
      const queued = this.queue;
      await queued;
      if (this.persisted === this.version && this.queue === queued) return true;
      if (this.error) failures++;
    }
    return false;
  }
  async discard(context: string): Promise<boolean> {
    let success = false;
    const operation = this.queue.then(async () => {
      const original = this.values[context];
      const version = this.version;
      const next = { ...this.values };
      delete next[context];
      try {
        await this.write(JSON.stringify(next));
        // Never erase a second edit arriving while the deletion is in flight.
        if (this.values[context] !== original) {
          this.error = 'Draft changed. Retry Cancel.';
          return;
        }
        this.values = { ...this.values };
        delete this.values[context];
        this.version++;
        if (version + 1 === this.version) this.persisted = this.version;
        this.error = null;
        success = true;
      } catch {
        this.persisted = -1;
        this.error = 'Could not discard draft. Retry before leaving.';
      } finally {
        this.changed();
      }
    });
    this.queue = operation;
    await operation;
    // Persist any edits to other contexts made during the deletion.
    if (success && this.persisted !== this.version) await this.flush();
    return success;
  }
}
