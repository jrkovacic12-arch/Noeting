export type SyncErrorCode =
  | "policy"
  | "identity"
  | "auth"
  | "credential"
  | "offline"
  | "drafts"
  | "busy"
  | "budget"
  | "cancelled"
  | "storage";
export class SyncError extends Error {
  constructor(
    readonly code: SyncErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SyncError";
  }
}
export const safeReason = (error: unknown) =>
  error instanceof SyncError
    ? error.message
    : "Sync could not finish; changes remain saved locally.";
