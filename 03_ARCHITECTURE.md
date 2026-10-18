# Noeting — Architecture, Privacy and Agent Design

> **Current baseline:** React Native + Expo + TypeScript + SQLite, version 0.10.3/code 20/schema v10 (D-024–D-027; PR #8 merged). Verified automated/APK/device evidence and release gates are owned by `06_CURRENT_STATE.md`.
>
> **Principle:** Local-first and user-controlled; verify privacy properties rather than assuming them.

## PC sync — read-only mirror first (2026-10-18)

`src/sync/mirror.ts` builds a deliberately **one-way** opt-in snapshot from a committed repository read, excluding removed entries and bounding the size. It sends current Notes/Tasks/folder metadata, immutable original text and source IDs to the PC over HTTPS using a per-session bearer token; the local draft persistence is flushed first, but unsaved drafts are not mirrored. No source SQLite file is copied. The app does not run background sync, receive remote mutations or embed credentials.

`scripts/pc-mirror-server.mjs` runs only on the PC's `127.0.0.1:8787`, protected by `NOETING_SYNC_TOKEN` (32+ characters). Use a separately configured trusted **HTTPS** access layer such as Tailscale Serve that forwards exclusively to this localhost port. Do not open port 8787 to LAN/public internet. The receiver accepts one device identity, checks request size/schema, rejects older snapshots, and atomically replaces a **read-only preview JSON** in a private work directory. Its raw JSON contains sensitive personal information: secure the PC disk, access token, HTTPS proxy and backups before real data use. The receiver does **not** implement sync reconciliation, complete data backup, or a PC editing interface.

Manual setup for a test-only deployment:
1. On PC run `NOETING_SYNC_TOKEN=<random-32+-char-secret> node scripts/pc-mirror-server.mjs` (quote actual secret safely; avoid sharing it).
2. Configure trusted HTTPS access (e.g. Tailscale Serve to `http://127.0.0.1:8787`); verify the Android device can resolve and trust that HTTPS endpoint.
3. In Notes → More → Sync preview to PC, enter the HTTPS **origin** (trailing slash, no path/username/password) and the pairing token. Tap **Send to PC**. No token is persisted. Optionally retrieve the mirror with an authenticated `GET /api/sync/mirror` via the same HTTPS endpoint.
4. The PC JSON is a preview, **not a restore file**. Do not claim identical records, data durability or conflict handling.

Before two-way sync: immutable device ID and credentials with OS protected storage, DB transaction/outbox for changes, stable per-entity versioned events, deletions/tombstones, conflict preview and offline retry, multiple-client pairing/revocation, encryption/backup decision, real PC editor, and native/CI acceptance tests. The current server is for disposable test data only.

## Current architecture — D-027/D-026, 0.10.3/schema v10

Reliability maintenance (2026-10-18) preserves the same schema and public repository API. Historical migration SQL definitions live in `src/data/migrations.ts`; initialization, version ordering and transaction boundaries remain in `repository.ts`. Saved tab/search/folder context is isolated in `useListPreferences`: optional, shape-checked, cancellable during load and nonblocking on failure. Database/draft startup failures retain their separate retry paths; Back/modal handling remains in App.

`DraftPersistence` owns the existing v2 dictionary's serialized KV writes: a leading write and bounded 50 ms coalescing window reduce amplification; `flush()` immediately drains the latest revision before risky navigation/save. Failure keeps unsaved words in memory and reports failure. Discard only clears an unchanged context after storage confirms deletion, preserving edits to any context made during the write. v1 migration remains in `useDraft`, keeps the old key until v2 write confirmation, and clears the load error after successful retry. This is a short persistence window, not an abrupt Android process-termination guarantee; native acceptance remains separate.

Migration v9 adds `note_folders` and `note_organization` plus indexes/Note-kind triggers. Folder names retain display casing with a normalized case-folded unique key enforced at repository boundaries. Organization references Notes and nullable folders (`ON DELETE SET NULL`), with Note-only pin/edit timestamps. Missing rows mean Uncategorized/unpinned. Removed Notes retain organization; deleting folders also unfiles removed Notes. Legacy tables, columns, task pin metadata, timestamps, originals, edits, soft-removal receipts and source pointers are never reset or reinterpreted.

Migration v10 adds nullable `note_folders.pinned_at` without rewriting existing records. Folder ordering is pinned first (pin timestamp descending), then normalized name and ID. Bulk folder pin/unpin and deletion validate the entire selection and commit atomically under the shared driver mutex; repeat pin retains its timestamp. Folder deletion uses the existing FK `SET NULL`, including removed Notes, and never deletes Note text or Note pins. The UI calls the nullable-folder bucket Uncategorized; the internal `unfiled` scope key remains compatible with saved list context. The Folders screen and quick bar share the same committed snapshot/order; counts are derived in one pass from active Notes, independent of search. Selection and deletion mode are transient; folder scope remains durable.

`organizeNotes`, `removeNotes` and `restoreNotes` validate all requested Notes inside one mutex/BEGIN IMMEDIATE transaction. A failure rolls back every selected row/receipt. Restore validates removal versions. Existing single-entry Task removal/restore retains legacy pin/selection behavior. Note pins are unrestricted and never call legacy `setPinned`.

A shared `transition`/`reconcile` path implements synchronized completion. Root toggles transition all active children in the same transaction; child toggles reconcile the active parent. New child insertion, child removal/restore and parent restore also reconcile transactionally. Unchanged statuses preserve completion timestamps. Completion clears legacy Task pins and scheduled intents; removed parents/children are not silently toggled. Zero active children preserve manual parent status. Migration preserves even historically inconsistent v8 completion exactly; the next relevant action reconciles that group.

Note capture can include `folderId`; folder assignment and the new Note/source rows commit in the same transaction. Invalid folder references roll back capture; committed retries retain their existing organization. Task capture rejects folder assignment. Draft `discard(context)` waits for serialized storage success before deleting the in-memory context or dismissing creation; failed persistence retains visible words. Existing edits and pending child commits stop on draft-storage failure. Pending child close shares the in-flight commit and closes only on success; reverted/matching recovered edits return to Saved without a redundant DB write. Enter focus intent is shared with a blur-started commit and applied once after the input is enabled; the web adapter’s legacy deferred submit blur is disabled. When a retained creation draft outlives its folder, the UI supplies Uncategorized while preserving text/request identity; strict repository FK validation and transaction rollback remain unchanged.

A snapshot includes joined organization/source/parent data and folders, without rendering-time row reads. Linear Map indexing builds children; selectors scope Note search/folders and deterministic pin/edit sorting and group Task search. A synthetic large fixture exercises 3,000 Notes and 1,000 parent-child pairs in selectors; browser large-list evidence is in current state. Full-snapshot memory still grows with backlog; no unmeasured native performance claim.

`noeting.editor-drafts.v2` stores entry/context-keyed drafts: edit entry ID, standalone kind, linked source+kind or child parent ID. Serialized writes retain stable capture identities; v1 is copied into its matching context before removing the legacy key. Successful edits remove only the matching saved value; storage failure retains memory and blocks risky dismissal. DB initialization still precedes KV initialization. Existing editors debounce and flush lifecycle changes; new captures remain explicit. List context has a separate serialized KV key. No encryption/remote storage is introduced.

Popover uses a separate no-animation Modal, immediate scrim, bounded trigger-relative placement and background accessibility isolation. Nested popover Back resolves before keyboard/sheet. Sheet's Modal/scrim does not animate; Animated.View translates only content. Initial height estimates visible content and font scale, caps to usable/keyboard bounds and supports handle expansion/internal scroll. Native IME, Back, keyboard overlap and actual upgrade remain blocking acceptance items until independently executed.

The v10 contract above governs the merged source. Earlier version-specific implementation notes below are historical and do not override the current behavior.

### Data-loss exposure and future offline recovery

D-018 still defers backup/export/restore. There is no supported independent recovery copy: Notes/Tasks, folders, links, removed records and drafts live locally; SQLite/KV storage is unencrypted. Android automatic backup is disabled in configuration/static manifest, with device enforcement unverified. Device loss, uninstall/clear-storage or corruption can therefore lose the only copy. Undo, original captures and draft recovery do not protect against loss of that storage. Test data does not waive preservation/rollback rules.

**Current test-phase risk acceptance (user clarification, 2026-10-18):** The present library contains only disposable test data; its loss is acceptable to the user at this stage. Consequently, an independent backup feature is **not a present requirement**. This is a scope-specific acceptance of the *consequence* of data loss, not a claim that loss cannot occur, that unencrypted storage is secure, or that migration/retry integrity guarantees can be weakened. Reevaluate before meaningful or production data is stored.

P-008 proposes the smallest offline alternative for a future decision: a user-selected versioned local file containing a consistent application-level snapshot, preserving stable IDs, original/current text, provenance snapshots, folders/pins, task relationships/completion and soft-deletion metadata. Whether recovery drafts/request IDs are included must be explicit. A future design must coordinate pending draft writes and repository reads; blindly copying live main/KV database files is not a consistent backup protocol. Validate format/version/checksums and references before any writes, demonstrate recovery in a separate disposable library, and preserve existing data on validation/interruption failures. Restore replacement/merge policy and protection of the sensitive file remain undecided; do not silently add encryption, accounts, sync, new storage architecture or export UI. No implementation occurs without a new accepted decision superseding D-018's timing.

## Historical architecture — D-025, 0.9.0/schema v8

The v8 additive migration adds nullable indexed `tasks.parent_task_id REFERENCES tasks(id) ON DELETE RESTRICT`. Every pre-existing Task remains NULL/root; v6/v7 generic source links are never converted into ownership. All legacy entry/source/link tables, originals, edits, timestamps and completion states remain unchanged by this migration.

`saveSubtask({requestId,parentTaskId,text})` atomically inserts a Task entry and Task row, with no source-link row. Parent validation requires an active Task with no parent. SQLite insert/update triggers additionally reject self-parenting, nesting, reparenting a Task that has children, and a non-Task entry. Retries validate immutable text and parent and resolve existing commits even after parent removal. `saveCapture` cannot claim a Subtask request. No active reparenting operation is exposed.

New `saveLinkedEntry` writes require a non-removed Note source; the same restriction applies to new legacy `saveLinked`/`saveDerivedTask` writes. Existing committed historical request retries still resolve without modifying relationships. New Note-linked Tasks have no parent and preserve source-at-creation text independently of hierarchy. The v7 source-read compatibility path is retained.

Snapshot Task models include parent ID, parent entry/current text and removal state via one joined read. `src/data/selectors.ts` builds child groups and searches current text from one snapshot; unfiltered lists contain roots plus surviving children of removed parents. No N+1 reads. Synthetic real-SQLite/browser benchmarks now cover 3,000 Notes and 1,000 task groups; results and host/device limitations belong to `06_CURRENT_STATE.md`. No measured need for incremental refresh, pagination or a new state framework was found on that host.

`NoteDetail` is a full-screen writing page; `TaskSheet` uses the lightweight shared `Sheet` with an expandable, scrollable body and keyboard-aware bounds. The same sheet hosts Task/Subtask composers. Task-source Notes open read-only; modal backgrounds are hidden from accessibility. Native Back dismisses the keyboard first, then retains editor drafts or returns from a child popup before closing the sheet.

Drafts use the existing local SQLite KV store under a separate key; appearance preferences are untouched. Main DB initialization precedes opening the KV store to avoid Expo web VFS startup races. Serialized draft writes prevent stale keystrokes overwriting newer text or cancellation. Dismissal waits for the draft write, preserves request IDs and offers Resume; failed persistence stays visible. No automatic entry save or network storage is added.

v7 schedule retirement and legacy notification cancellation remain unchanged. Native keyboard/Back, physical upgrade/offline restart and notification cleanup require separate device acceptance; current evidence belongs to `06_CURRENT_STATE.md`.

## Historical 0.8.0 architecture — D-024 (schema v7)


**Implemented:** Additive v7 introduces indexed `entry_sources(entry_id, source_entry_id, source_text)` and `saveLinkedEntry` for all four Note/Task combinations. New children snapshot the source's current words inside the save transaction; retries validate kind, exact original text and source. Links always originate from a new entry, preventing cycles. Snapshot reads unify generic, legacy thinking and task links. Legacy thinking links never stored source-at-creation words; their preview uses immutable source originals, without inventing a historical snapshot.

Waiting schedules are parked as `cancelled` while retaining their saved dates; legacy tables and task metadata remain. `applyDuePins` is an inert compatibility entry point. Capture no longer writes Today selection. The app has no schedule timers/resume activation; resume only retries old OS-notification cancellation. System theme does not read or overwrite the stored appearance preference. Shared list/detail/editor components live in `src/ui/`; `FlatList` virtualizes primary lists. Full snapshots remain memory-resident; large-backlog performance is not benchmarked.

**Preservation constraints:** Maintain React Native/Expo, SQLite, v6 upgrade compatibility and the local/offline repository. Expose only Note, Task and explicit source-link concepts in the new UI. Do not remove or rewrite historical `entries`, `tasks`, `thinking_links`, `task_sources`, `today_selection`, `scheduled_pins` or legacy `reminders` through a destructive migration. Historical Reflection/Creation rows should render as ordinary Notes while retaining original text, legacy `thinking_kind` metadata, source pointers, edits and creation timestamps. Fresh linked Notes must be possible from **either** Note or Task; avoid relying on the old Reflection/Creation-only API: introduce a generic link/save path with additive schema migration only if needed. Maintain source-at-creation provenance and idempotent request IDs. Reject cycles/self-links if the domain requires them, without breaking existing rows.

For obsolete scheduling: remove UI and active due-pin application without deleting saved Tasks. Clear or park unconsumed scheduled pins safely, avoid invisible re-pinning on startup/resume, and retain the minimal old-notification cancellation path until upgrade cleanup is safe. A future release may explicitly clean old schema, but not during this preservation-first refactor. System theme can replace user theme selection without destroying stored appearance preferences.

Preserve original/current words, task complete/reopen semantics, link navigation to removed sources, and atomic rollback/retry. Avoid broad storage rewrites, account work, import/sync and AI. Refactor the monolithic `App.tsx` into two list screens, shared entry details, shared editor and domain services with narrowly scoped changes; use indexed linked lookups and virtualized lists as justified by performance testing. See [02_PRODUCT.md](02_PRODUCT.md) for required behavior and [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md) for acceptance.

## 1. Architectural goals (direction)

- The core note/task application should work offline.
- Local storage should be primary; no mandatory account for single-device use.
- The user should own and be able to export their data in readable forms.
- AI should be replaceable and should receive only necessary data.
- Synchronization, if added, should be optional and protected by encryption before remote transfer.
- Third-party integrations and agent actions should be permission-controlled.
- Do not let distributed synchronization block validation of a useful phone-first experience.

These goals follow the original document and the later conversation about a privacy-focused personal agent. The selected mobile stack now has an M1 source implementation; a statically verified Android test APK exists, while physical-device validation remains pending.

### Selected V1 platform and local persistence

- **Approved:** React Native + Expo + TypeScript; on-device SQLite (D-011). Build Android/iOS-capable mobile UI, with no account or backend required for core use.
- **Resolved M1 versions:** Expo `57.0.28`, React `19.2.3`, React Native `0.86.3`, `expo-sqlite` `57.0.4`, TypeScript `6.0.3`; lockfile installation was checked using Node `24.19.0` and npm `11.9.0`. M1 began with Today and a Capture modal; a subsequent read-only Library tab uses the existing snapshot and schema without a migration. Expo Router, Notifications, and FileSystem/Sharing remain later package candidates.
- **M1 reliability boundary:** versioned SQLite migrations; unique stable entry/task IDs; exact unchanged `original_text`; saving a directly captured Task and its linked Entry atomically; store completed/pinned task state durably; surface failed writes rather than pretending Save succeeded.
- **Implemented M1 schema:** `src/data/repository.ts` defines schema version **2**: existing `entries`/`tasks` plus additive `thinking_links` and `today_selection`; `src/data/sqlite.ts` opens `noeting.db` through Expo SQLite. `reminders`, edit/delete semantics, and backup format remain later design work. Linked Reflect/Create and persistent Today selection are implemented under D-013.
- **Validation:** prove persistence after full restart, offline operation, transaction rollback on failure, and database migration behavior on actual target devices. A local SQLite database does not itself guarantee encryption at rest or a successful backup.
- **HTML prototype:** reference for behavior/copy, **not native React Native components**; never claim it has been migrated.

### Historical M1 persistence contract — 2026-10-13 (superseded by current Notes/Tasks contract)

- Use versioned SQLite migrations with initial `entries` and `tasks` tables. Store immutable `entries.original_text`; a Task references its source Entry. Start with `pending` / `completed` status and durable pin state. Reminders and richer lifecycle fields are outside this first schema.
- Allocate a stable capture request ID once per draft; derive stable Entry and Task IDs from it. Retain the request ID for retries. A uniqueness constraint on capture identity and a single linked Task per direct Task capture make retry idempotent. Retrying an already committed capture returns its existing records rather than creating new ones; changed content under that same request ID is rejected.
- Commit the Entry and its optional Task in one transaction, with a foreign key protecting the link. Roll back all writes on failure. Enforce the three-pending-pin limit and completion/pin update atomically, rather than relying only on disabled UI controls.
- Serialize each capture's save attempts and disable additional Save taps while a write is pending. Show success and discard the draft only after the transaction commits; retain input, type, and IDs on failure. Do not parse note text into dates or deadlines.
- The user confirmed Android as the first physical smoke-test target on 2026-10-13; Android/iOS remains the selected platform direction. Resolved versions are recorded above; physical-device and native-build compatibility remain to be checked.

The user-facing choices are in [02_PRODUCT.md](02_PRODUCT.md). This contract is implemented in source and exercised by real-SQLite repository tests; it does not claim passed device tests or new historical product approval. Actual run/test evidence belongs in [06_CURRENT_STATE.md](06_CURRENT_STATE.md).

**Historical M1 security/delivery notes (current risk is described above):** SQLite is plain and unencrypted. `app.json` sets Android `allowBackup: false` as a protective M1 default; the merged APK manifest now verifies this value, but backup exclusion on a device remains untested. iOS OS-backup behavior, encryption, export/restore, and broader local threat-model checks remain unresolved. App icons use the user-supplied Noeting symbol in `assets/brand/source/`; `com.noeting.app` remains a development identifier requiring review before distribution.

### Historical Android test build — 2026-10-13

- Expo Continuous Native Generation created the local `android/` project from `app.json` and the locked packages. `android/` and `ios/` stay ignored; preserve local native edits and deliberately regenerate when configuration changes. `npm run android` / `npm run ios` now use Expo native run commands rather than merely opening the development server.
- Prepared Linux tools outside the checkout: Microsoft OpenJDK **17.0.20.1**, Android command-line tools **23.0**, platform-tools **37.0.1**, Android API **36 revision 2**, build-tools **36.0.0** (plus **35.0.0** installed by Android Gradle Plugin), NDK **27.1.12297006**, and CMake **3.22.1 / 3.30.5**. The build uses Gradle **9.3.1**, two workers, ARM64, and CMake 3.22.1. An emulator was subsequently installed and exercised; no physical phone is attached.
- `scripts/setup-java.py` verifies the Microsoft signing-key fingerprint, signed repository metadata, package-index checksum, and pinned package checksum before extraction. `scripts/setup-android-sdk.py` verifies Google SDK archive sizes and checksums and reuses verified tool downloads/installations. Tools default to `/workspace/.jdks` and `/workspace/.android-sdk`; Gradle/Expo state stays in writable workspace caches.
- `scripts/build-android.mjs` orchestrates those helpers and the generated Gradle release build, pins the official Gradle distribution SHA-256, preserves existing native trees, and refuses stale recorded generation inputs. Java 21 alone did not satisfy the project's Java 17 toolchain; the verified Java 17 JDK corrected that prerequisite.
- The vendor JDK did not include the cloud proxy CA. Gradle now uses the maintained system trust store at `/etc/ssl/certs/java/cacerts`, with non-secret proxy routing in its writable cache; TLS and artifact verification remain enabled. No credentials are copied into project files or setup instructions.
- The verified test APK embeds its JavaScript/Hermes bundle, contains `arm64-v8a` libraries, targets Android **7.0+ (API 24)**, and uses the generated development signing key. `scripts/verify-android-apk.py` checks signature, ZIP integrity, embedded bytecode/native libraries (including React Native 0.86's `libhermesvm.so`), ABI/SDK identity, 16 KB ZIP alignment, backup configuration, and blocked permissions. Its manifest parser accepts current `aapt2` namespace/minimum-SDK output and older attribute forms; regression tests guard against false backup checks. Static verification passed; runtime remains untested.
- `app.json` additionally blocks unused M1 permissions `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW`, and `VIBRATE`. The verified merged APK manifest omits those permissions; actual device behavior remains untested. A test APK would not be a store release; signing, branding, identifiers, encryption, and device acceptance remain separate work.

Actual build evidence, artifact identity, and executable build/verification commands are maintained in [06_CURRENT_STATE.md](06_CURRENT_STATE.md). The wrapper and verifier completed successfully end to end. GPG public-key verification uses `--no-autostart` to avoid a private-key agent in managed sandboxes; Gradle and the test runner still require local socket/process access.

**Historical web validation (original M1):** The same UI and repository use Expo SQLite's browser-local WASM storage on web. `scripts/serve-web.mjs` serves the export with cross-origin isolation headers required by that runtime. Use one app tab at a time: Expo SQLite holds exclusive browser file handles. A competing tab shows a startup error; close the owning tab and retry to reload the failed worker without deleting data. Nine real-storage browser tests passed, including exact whitespace/Unicode retrieval, offline filtering, Today selection, linked thinking, Review, restart durability and injected linked-write failure. Explicit stopping was removed under D-012. This is a development-validation target, not evidence of native offline reliability or an independently approved web product.


### Version 0.3.0 edit/removal and selection contract — D-014

- Additive schema v3 adds `edited_text`, removal timestamp/version and prior pin/selection metadata to `entries`; no old captures, Task statuses/timestamps, thinking links or selection rows are rewritten by migration. Current `Entry.text` falls back to immutable `originalText`. Task edits update current entry text and Task title together. Literal search uses current visible words.
- Direct Note insertion and Today selection share one transaction. Existing-request retries do not reselect older notes; Task/linked saves do not choose Today. Failure keeps the prior selection and creates no partial entry.
- Removal is a retained local record, not permanent erasure: hide it in lists/totals, clear selection if applicable and release its pin, while linked thinking and first-source text remain. Snapshots retain removed sources for provenance; visible task snapshots exclude them. Versioned removal receipts make retry idempotent and reject stale Undo.
- Undo offers an eight-second toast. Restore retains text, status and links, restores a pin only if capacity remains, and restores Today selection only when no newer selection exists. There is no Trash/history UI or permanent-purge feature. Atomic failed edits/removals/restores keep the state retryable.
- Expo Clipboard `~57.0.2` writes only the explicitly copied current text; app code does not read the clipboard. Offline storage and privacy/delivery limitations above remain. Eighteen real-SQLite checks, twelve real-storage browser checks and native Android 9 upgrade/clipboard/edit/remove/Undo/offline-relaunch checks passed; exact ABI/native evidence is maintained in `06_CURRENT_STATE.md`.

### Native emulator validation and read-only Library — 2026-10-13

- The Library tab reads schema v2 snapshots and never mutates source entries; deliberate actions create separate linked entries or persist Today selection. Search is literal, case-insensitive substring matching of `originalText`; type filters are All/Notes/Tasks. Entries appear newest first; linked Task status is displayed. Schema v2 adds provenance and selection without changing the Pending/Completed task lifecycle.
- The build wrapper supports one explicit `--abi=x86_64` option for native emulator tests, with the existing `arm64-v8a` default retained. Each ABI has a separate test artifact and is checked by the same static verifier. The ARM64 phone build was subsequently refreshed with Library; its artifact remains separate from the emulator-only x86_64 build; exact artifact identities belong in `06_CURRENT_STATE.md`.
- `tests/android_smoke.py` tests actual native UI and SQLite on an isolated AOSP userdebug emulator. It requires an emulator target, verifies installed artifact identity, and supports explicit synthetic-fixture reset or guarded resume after pin checks. Emulator root ADB is used for protected Android 9 OS broadcasts and read-only inspection of synthetic app data; the application runs under its normal UID.
- Android 9 emulator checks passed through offline force-stop/relaunch and full reboot with unchanged Entries/Tasks and valid SQLite integrity/foreign keys. Software emulation is required on this host; Android 15 system startup failed its watchdog, and Android 9 had a startup System UI ANR. No physical performance, Android 15 compatibility, ARM64 runtime, encryption/backup, native injected-write-failure, or notification-delivery acceptance is implied. Exact observations and test commands belong in `06_CURRENT_STATE.md`.

### Implemented schema v2 — additive upgrade from the phone build's v1

- Keep existing `entries`/`tasks`, IDs, original strings, timestamps, completion and pins unchanged. Create `thinking_links(entry_id, source_entry_id, thinking_kind)` with foreign keys, no self-link and Reflection/Creation type constraints; derived content uses a separate note Entry. Keep the v1 Task-kind-entry trigger intact.
- Create `today_selection(id=1, entry_id)` with a foreign key; repository validation permits non-task entries. Selection persists until explicitly changed, as in the prototype. No implicit date expiry or automatic selection.
- Commit linked Entry and provenance in one serialized transaction. Allocate a stable linked request ID per draft, reject changed source/type/text on retries, and preserve failed-save input. Capture IDs/requests retain their original v1 semantics.
- Migrate v1 to v2 transactionally without rebuilding old tables; set the schema version only after all new objects succeed. A failed migration rolls back new tables/indexes/triggers and leaves v1 data/version unchanged. Higher unknown schemas are refused without clearing data.
- This schema does not resolve Note-derived Tasks (O-008), destructive edits/deletion, export/restore or encryption. All link targets are protected by restrictive foreign keys; there is no destructive UI.

### Historical M2 Note-to-Task linkage investigation (resolved by D-019)

The M1 `tasks_require_task_entry` SQLite trigger permits a Task only when its linked Entry has `kind = 'task'`. Consequently, the proposed action of creating an accepted Task **from an existing Note** cannot simply point `tasks.entry_id` at that Note. It would fail at the database boundary. This is a concrete difference between the M1 schema and the candidate M2 workflow, not a known runtime defect in M1.

**Historical alternatives for O-008 (subsequently resolved by D-019 and schema v4):** (a) create a separate Task-origin Entry while recording an explicit link to the unchanged Note; or (b) revise the relationship and trigger rules to allow an accepted derived Task with auditable provenance. The chosen design must keep source text intact, require explicit acceptance, avoid duplicate accepted tasks on retries, and specify link/deletion behavior. Do not change the existing trigger without a versioned migration and tests.

**Proposed M2/M3 data checkpoints, not accepted implementation commitments:**
- Test migration from existing schema v1 with real saved notes/tasks, including rollback, foreign-key integrity, and refusal of newer schemas.
- Define whether edits are represented as revisions or separate derived content; distinguish editing a Task title from modifying its original captured Entry.
- Define deletion behavior for linked material before enabling irreversible delete. This was the historical M3 plan; D-018 subsequently deferred readable export/backup/restore to the account phase. The local data-loss tradeoff remains to be assessed.
- Specify export content, integrity and restore tests, plus the local threat model. Plain SQLite is not encryption at rest, and Android `allowBackup: false` is not a substitute for a user-controlled backup.

### Schema v4 and local reminders — 0.5.0 (D-017/D-019)

- Migration v4 adds `task_sources(entry_id, source_entry_id, source_text)` with restrictive foreign keys, source index and Note/Task-kind validation; existing rows are not rewritten. It is separate from `thinking_links`. New Task Entry/Task/link commit atomically using `derived:` request identities. Retries check original Task words and source ID; source-at-creation text is stored exactly. Subsequent source edits/removal do not alter Tasks; retained removed records support provenance navigation.
- Reopen updates the same Task to pending, clears completion time and leaves it unpinned. No Undo record is created. Existing removal Undo remains separate.
- `reminders(task_id, due_at, revision, status, error)` stores durable intent. A monotonic revision identifies each OS request (`noeting-reminder:<taskId>:<revision>`), and status updates compare revisions. Completion/removal atomically clears reminder intent; Task-title edits invalidate the old revision. Restore/Reopen never reinstate scheduling.
- `src/reminders.ts` serializes reconciliation: enumerate Noeting OS requests, cancel obsolete IDs first, inspect permission, schedule missing future requests, and save scheduled/denied/error/elapsed/cancelled state. A failed cancellation rejects the pass and produces a global retryable error. SQLite and the OS cannot share a transaction: persisted intent plus idempotent reconciliation recovers after interruption; a stopped app cannot cancel an old OS request until code runs again. Elapsed times are never replayed, and delivery is never inferred from scheduling.
- `src/notificationDriver.native.ts` uses Expo Notifications 57.0.23 for on-device one-shot DATE triggers and a private Android channel. No push token registration or cloud service is used. Notification permission is requested only on deliberate Save/Retry; startup only checks. The SDK boot/package-replaced receiver restores persisted schedules. On Android 12+, the SDK falls back to inexact alarms when exact access is absent; no exact-alarm permission is added. Force-stop, OEM battery rules, DND and channel restrictions can prevent/delay delivery. No native delivery or reboot pass is implied by source or browser tests.
- The web adapter explicitly reports unsupported native scheduling. Local time input is validated without date rollover, then stored as a UTC instant; timezone changes preserve that instant. No repeating reminders or separate Task due-date semantics are introduced.
- Earlier open linkage/M3-export descriptions above are historical; D-019 resolves the chosen linkage and D-018 defers backup/export/restore to accounts. SQLite remains unencrypted; this slice adds no sync or account service.

### Schema v5 and entry navigation — 0.6.0 (D-020)

- Add `tasks.pinned_at` and `pin_order` and retained removal-pin metadata on `entries`; drop both cap triggers. Existing pinned Tasks get creation-time/row-order fallback metadata without altering their original Task/source fields. Manual pin transitions get the current instant and a monotonically increasing order; already-pinned retries do not reorder. Removal Undo restores prior pin metadata; completed/removed Tasks clear active pin timestamps.
- `scheduled_pins(task_id,due_at,status)` replaces notification intent. Migration imports outstanding active reminders, excludes consumed/cancelled rows, then cancels legacy DB intent. `applyDuePins` commits pin/status changes together; already-pinned Tasks consume the schedule without reordering. Apply batches chronologically and preserve scheduled instants so overdue catch-up respects newer manual pins. Completion/removal atomically cancels schedules. Later edits do not change the chosen pin time.
- A bounded JS timeout applies the next due pin while the app is running, defers briefly during saves, and re-arms for distant deadlines. Startup/foreground also applies due work. No background service, cloud processing, permission request or new OS notification scheduling occurs. Browser and native clients share the same local semantics; process suspension/closure defers application until resume/open.
- Native Expo Notifications remains solely for migration cleanup: enumerate and cancel old `noeting-reminder:` identifiers on first launch. Failed cleanup exposes a retryable error; it does not stop local captures or pin changes. The existing native module/config remains to support those old installations, but permission/scheduling code has been removed. Native version-only metadata was synchronized without regenerating unchanged resources or changing the signing key.
- Entry details is an application screen rather than a Modal. Navigation history stores entry ID and scroll position as well as screen; nested source/child visits restore correctly. Main list bodies remain retained; Note filters/query remain in place. Entry forms/toolbox remain Modals with existing draft behavior. Plain cards only show linked counts; full grouping is limited to the chosen detail screen.
- V4 notification architecture above is historical and superseded by D-020. Native OS cleanup and phone visual/system-font acceptance still require device evidence.

### Schema v6 and linked-action controls — 0.7.0 (D-021)

- Migration v6 replaces `task_sources_require_kinds` transactionally: the child must remain a Task-kind entry; its source may be a Note or Task. Existing restrictive foreign keys, one-source-per-child key and source snapshot remain. No existing rows change. Migration failure restores the v5 trigger/version and can retry.
- Task-source saves use the existing atomic/idempotent Entry/Task/link transaction and reject missing/removed sources. A committed retry remains resolvable after source removal. Completion/pins/scheduled intent belong to each Task independently, with no cascading operations.
- Top-right action menus reuse the existing linked/derived forms and draft identities. Checkbox controls invoke the same repository complete/reopen methods on Library, full entry and linked children. Removed-source Task checkboxes are disabled. Card body Pressables exclude icon controls; selectable text and long-press suppression avoid navigation during selection. Native text-selection gestures still need device acceptance.
- Clock and left U-turn icons use drawn strokes; right-side clock/pin controls and bottom-right Today selection keep 44-point hit targets. No new native dependencies, permissions or services; version metadata changes preserve generated native resources and the development signer.

### Task card refinement — 0.7.1 (D-022)

- UI-only update: omit per-task + in Today and for completed Tasks in Review, Library, full entry and linked groups. Pending Tasks retain linked actions in Library/entry screens. Remove duplicate source buttons; existing full-entry original-preview navigation retains access to Note/Task sources, including removed records. Schema v6 and persistence contracts are unchanged.

## 2. Proposed layered design

```text
User interface
  Capture · Today · Library · Review (Create is a linked action)
         |
Application domain
  Entries · Tasks · Scheduled pins · Search
         |
Later optional AI/agent services (not in V1)
  Classify · Extract suggestions · Summarize · Prioritize
  Structured requests · Permissions · Logs · Approval
         |
Local persistence          Replaceable AI runtime
  Entries/tasks/files      Local model (if feasible)
  Optional search index    Optional explicitly enabled cloud model
         |
Future adapters (optional)
  Import/export · Calendar · Email · Desktop · Encrypted sync
```

**Diagram status:** Conceptual separation of implemented local functionality from optional agent services; the agent, integrations and extra data structures do not exist in V1.

**Boundary:** Any future AI model proposes interpretations or actions. Deterministic application code validates permissions, changes to tasks, scheduled pins and persistent state.

### Agent ownership and integration boundary (D-023)

Any future agent must remain a replaceable, separately authorized consumer of narrowly scoped read-only entry/task/provenance data before write-capable tools are considered. Retrieval must retain source references; application code, not model output, enforces write permissions and transaction correctness. Xiaomi Notes has no assumed vault API or sync adapter. These are *proposed technical constraints*, not an implemented service. [D-023](05_DECISIONS.md) owns the decision and [04_ROADMAP.md](04_ROADMAP.md) owns the research sequence. V1 adds no agent runtime, backend or permissions; D-018's backup/export deferral is unchanged.

## 3. Preliminary data model (candidate, not schema commitment)

The original note proposed a small `Entry` and `Source` model. Task management and agent ambitions motivate *candidate* additions:

```text
Entry
  id
  type                # e.g., thought, observation, question, idea,
                      # source_note, experiment, reflection, creation
  original_text
  created_at
  updated_at
  source_id?          # provenance, not the same as category
  status?             # optional; exact semantics TBD
  next_review_at?

Source
  id
  title
  type                # book, person, web, work, life, etc.
  reference?

Task
  id
  title
  description?
  status
  priority?           # user-confirmed
  due_at?             # only if explicitly provided/accepted
  remind_at?
  related_entry_id?
  project_id?

Project
  id
  title
  status

AgentAction               # later or as soon as AI can mutate state
  id
  proposed_action
  scope
  approval_status
  execution_status
  created_at
```

**Optional cross-loop linking (candidate, not a schema change):** A reflection/experiment/creation may reference its originating Entry, and a later reflection may reference a completed Task or the Task's related Entry. Existing optional relationships are a starting point; only introduce a generic typed link if real workflows show that a single reference is insufficient. Links express provenance, **not** automatic conversion, scheduling, or a required lifecycle. Preserve original text, accepted task state, and independently authored outcomes.

Additional relationships, scheduling records, summary provenance, and versioning may become necessary. Do not prematurely construct a large knowledge graph. Keep original captures separate from generated interpretations and accepted tasks.

## 4. AI responsibilities and boundaries

| Operation | Proposed AI role | Deterministic application responsibility |
| --- | --- | --- |
| Categorize note | Suggest type and confidence/rationale if needed | Preserve original, allow correction |
| Extract task | Draft structured task candidate | Require acceptance; validate fields |
| Daily brief | Summarize selected, authorized records | Select scope, show source basis, store only if allowed |
| Prioritization | Suggest limited priorities with reasons | User confirms; no invented due dates |
| Reminder | Optionally help word a message | OS/app scheduler delivers at set time |
| Review/create | Find links, contradictions, synthesis on request | Protect original notes and user decisions |
| External action (later) | Plan a requested action | Check permission, confirm where required, log result |

**Proposal status:** Opt-in background AI and permissioned suggestions remain under evaluation; see [P-001/P-004](05_DECISIONS.md). The table above describes *technical responsibilities*, not user approval of a particular AI configuration.

## 5. Privacy/security requirements to design and test

**Data minimization**
- Identify the exact data sent to each model, tool, and integration.
- Treat note contents as private; do not default to uploading an entire vault.
- Local inference reduces cloud exposure but does not eliminate local security risks.

**Storage and secrets**
- Establish a threat model before choosing encryption-at-rest measures.
- Protect integration tokens and encryption keys using appropriate platform facilities.
- Consider local backups, notification previews, search indexes, temporary files, and error logs; these can leak data too.

**Permissions and auditability**
- Separate read/search, task mutation, calendar modification, communication, and external execution permissions.
- Apply least privilege; untrusted source content and model outputs must not become instructions to execute actions.
- Record consequential agent actions and their approval/execution outcomes.
- Design a way to inspect and reverse safe changes where feasible.

**Cloud and sync (future)**
- Cloud AI is an **optional design possibility**, not an accepted provider or privacy guarantee.
- Decide if cloud processing is allowed, which records can be sent, and what explicit consent looks like.
- If sync is added, encrypt before remote transmission and determine key recovery/conflict handling separately.

## 6. Reliable reminders are not an LLM capability

A language model may interpret “remind me to…” or draft context. Actual timing and delivery must be implemented with deterministic scheduling and the host platform's notification mechanisms. Delivery guarantees depend on OS permissions/background restrictions and require device testing.

Do not treat a note's vague future language as a scheduled commitment. Store user-accepted times and time zones deliberately.

## 7. Possible later AI deployment modes (unselected; outside V1)

- **No AI:** manual categorization and deterministic summaries for validating the interaction model.
- **On-device AI:** stronger local data control, but device performance, model quality, battery, and size need tests.
- **Optional cloud AI:** potentially greater model capability with network/privacy trade-offs and explicit disclosure.
- **Hybrid:** selective routing under clear policy; additional complexity.

V1 uses no AI. Any later AI experiment can evaluate these modes without making a model adapter or provider selection a prerequisite for M1.

## 8. Platform and delivery sequence

The **original source** sketched this platform order: phone-only → desktop using the same model → manual import/export → optional automatic encrypted sync. Later discussion also proposed **feature maturity** stages: information management → contextual intelligence → assistant integrations → agent actions.

These are **two different axes** (platform rollout vs. intelligence/capability maturity), not a single agreed version numbering scheme. Exact versions and ordering remain open. Portability is a goal from the start even if a full import/export UI comes later.

## 9. Historical architecture investigations (unresolved proposals; not current authorization)

The authoritative **decision register and status** lives in [05_DECISIONS.md](05_DECISIONS.md), particularly O-001, O-002, O-004, O-005, O-006, and O-008. The technical work needed to inform those decisions includes:

- Historical investigation list: stack selected (D-011), migrations, platform notifications, offline search and local export. Current scope excludes new notifications and D-018 defers export; consult the active contract and P-008 before any new work.
- Define local threat scenarios, key protection, backup/log leakage, and meaningful export formats.
- For later AI experiments, determine mode (on-device/cloud/hybrid), data exposure/consent, and optional background processing; these do not block the no-AI V1.
- For later agent actions, specify least-privilege permissions, approval records, and audit/rollback behavior.

The V1 interaction examples and tests are in [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md). The mobile stack is accepted under D-011; these unresolved design investigations do not prove an implementation or finalize package versions and detailed schema.

### Historical session navigation and draft handling — 0.3.1 (superseded by D-026)

No schema migration is needed. Capture drafts are keyed by note/task type, linked drafts by source/type, and edit drafts by entry ID, in process memory only. Reopening restores text and stable capture request identity; successful Save clears that draft. Removing an entry clears its edit draft. Restarting the app process discards unsaved drafts; backgrounding can retain them. Back and backdrop dismissal share the write lock. Android modal Back is handled by `onRequestClose`; screen Back restores the recorded visit and scroll offset after the destination ScrollView reports its content layout. Today alone arms a two-second exit window; navigation and dialog activation/dismissal reset it. An OS toast carries the first-Back hint separately from the Undo control. Swipe/timeout dismissal only removes the Undo UI, leaving the soft-removal receipt semantics unchanged.

### Screen retention and toolbox motion — 0.3.3

Back uses synchronous visit-history state, with no database read or two-second delay outside Today. Previously, changing the ScrollView key and conditionally rendering one screen rebuilt Library native views on return; this is a plausible contributor to the reported lag, not a profiled phone diagnosis. Keep the shared ScrollView and lazily mount visited screen bodies, hiding inactive bodies with display:none. All retained bodies read the same snapshot, so edits/removals remain synchronized. Restore saved offsets after destination content layout, with an active-body layout fallback for equal-height transitions. Screen changes dismiss the keyboard so hidden Library inputs do not keep it over Review. Retention trades some memory for less native view creation; larger libraries may later require list virtualization.

The toolbox uses a transparent Modal with animationType:none. Its dim overlay is stationary from opening; only the sheet translates upward over 180 ms using the native driver on Android/iOS. Forms retain their fade. Backdrop/Back dismissal and write locks are unchanged.

### Appearance preferences — 0.4.0

`src/theme.tsx` owns light/dark semantic palettes, live `useColorScheme` resolution and ThemeProvider. Expo SQLite KV storage keeps `noeting.appearance` in its own `ExpoSQLiteStorage` database; capture schema remains v3. Wait for the initial preference read before mounting the main app to avoid showing the wrong app palette; a read failure falls back to system and reports an error in Settings. Serialize writes, preview immediately and roll back on failure. No account, network or note mutation is involved. `expo-system-ui` plus automatic userInterfaceStyle enables Android system appearance changes; the provider also colors the native root and status bar. Native prebuild is required for the new module/config. The OS launch background can precede the saved JavaScript override; native launch acceptance is pending.
