# Noeting — Roadmap and Work Plan

> **Status:** Working plan, not a committed schedule. Checked work items identify source implementation; device acceptance remains a separate gate.
>
> **Current phase:** Capture/Today/Library/Review plus basic edit/removal implemented; native Android 9 emulator checks passed; physical-device acceptance pending.

## 1. Already done (documented evidence)

- [x] Wrote the original attention-first Noeting concept (see `archive/noeting-original.md`).
- [x] Tested Obsidian personally for notes, thoughts, plans, to-dos, and later review (self-report).
- [x] Identified needs for categories, daily summaries, priorities, reminders, and AI assistance.
- [x] Established long-term personal-agent ambition and a preference for Noeting as an independent, privacy-first direction.
- [x] Organized seven core Markdown files for continuity; a separate V1 workflow draft was added later (2026-10-11).

These are **discovery/documentation milestones**, not proof of a working product.

## 2. Phase 0 — Validate workflow and lock the smallest MVP (REMAINING VALIDATION)

### Tasks

- [ ] Map the current real-life capture → task → review routine with representative examples.
- [ ] Define category semantics; distinguish source provenance, notes, experiments, tasks, and creations. **Draft candidates recorded; not validated.**
- [ ] Define the task lifecycle: inbox, acceptance, priority, due date, completion/deferment. **Draft state rules recorded; not accepted.**
- [x] Draft illustrative Capture/Today/reminder/creation scenarios and low-fidelity sketches in [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md); automated wireframe checks passed, but real-life testing is pending.
- [x] Keep V1 deterministic with no AI (D-010); any AI usefulness experiment is later research.
- [ ] Define V1 local storage, backup, logs, and notification privacy boundaries; cloud inference policy belongs to later AI research.
- [x] Select the V1 platform and stack (React Native + Expo + TypeScript + SQLite; D-011).
- [x] Agree on the first-app high-level feature scope and **no AI in V1** (D-010).
- [ ] Finalize detailed V1 acceptance criteria and unresolved task/reminder/security semantics; only the M1 test gate below is specified.
- [ ] Record structured per-scenario/device usability observations. The user reported testing the updated prototype and that it worked as intended; this is unstructured self-report, not a completed S1–S4 record.
- [ ] Probe voluntary thinking → action and action → reflection handoffs (S6–S7 in `07_V1_WORKFLOW_DRAFT.md`) without assuming that the current wireframe implements them; test whether each loop remains useful on its own.

### Exit criteria

A concise V1 specification exists with at least one complete flow from capture to a reviewed/managed task, local-data privacy boundaries, a finite Today experience, and a test plan. Accepted basic Reflect/Create flows belong to M2; proposed cross-loop handoffs and later AI permissions remain separate research and do not block M1. No untested assumption is called “validated.”

## 3. Phase 1 — First working local application (M1 SOURCE IMPLEMENTED; DEVICE ACCEPTANCE PENDING)

### Staged implementation for Codex

**M1 — Offline Capture → Today foundation (first milestone)**

- [x] Initialize Expo + React Native + TypeScript project, a single Today/Capture modal flow, and a reproducible local run/test setup; resolved tool/SDK versions are recorded in `03_ARCHITECTURE.md`.
- [x] Implement the Expo SQLite adapter with schema v1 migrations and initial `entries`/`tasks` data model; actual device runtime remains unverified (`reminders` later when needed).
- [x] Implement Capture Note / Task with exact original-text preservation, immediate close after successful save, and explicit failure handling.
- [x] Saving Task directly atomically creates one linked, pending Task; saving Note creates no Task; no invented deadlines.
- [x] Implement minimal Today: one Tasks list, complete task, pin/unpin maximum three, show each task only once, with explicit stop functionality subsequently removed by D-012.
- [x] Produce the standalone ARM64 Android test APK and pass static verification; artifact identity and evidence are maintained in `06_CURRENT_STATE.md`.
- [ ] Verify saved data survives full app termination/relaunch and works offline; include automated unit/integration checks and real-device smoke tests.

**M1 exit gate:** Captures and task state survive restart offline; no duplicate tasks; atomically linked writes; no save-success UI on failed persistence; no backend, AI, or sign-in.

**M1 validation plan (emulator smoke checks passed; physical-device gate pending):** Follow the implemented behavior/persistence contracts in [02_PRODUCT.md](02_PRODUCT.md) and [03_ARCHITECTURE.md](03_ARCHITECTURE.md). Check exact multiline/whitespace text; Note creates no Task; direct Task creates exactly one linked Pending Task; injected write failure rolls back and keeps the input; rapid/repeated Save and retry do not duplicate records; completion and up to three pending pins persist across restart and pin limits survive concurrent attempts. Automated real-SQLite checks and native Android 9 emulator capture/pin/completion/offline relaunch/reboot checks passed. The user subsequently chose a simulated phone for this run; physical Android acceptance, native rapid-save and injected-write-failure tests remain open. Record automated and physical-device evidence separately in `06_CURRENT_STATE.md`; host SQLite/browser checks and emulator evidence must remain distinct from physical-device acceptance.

**M2 — Remaining core workflows (V1 target, not M1):** Library search/filter/edit/delete, optional Today note, deliberate Reflect/Create linked entries, Review, and deterministic daily overview.

- [x] Read-only Library retrieval, literal case-insensitive search, All/Notes/Tasks filters, exact original text and task status, with real-storage browser regression tests.
- [x] Prototype-based Today note with Reflect/Create/Change, basic Review, and deterministic visible summary card; source text remains unchanged.
- [x] Remove explicit stop functionality and Library combined reset control; move compact pin toggles to the right edge (D-012).
- [x] Basic Library edit/removal, Review removal and linked edit/removal under D-014; automated migration/workflow checks passed, phone acceptance remains pending.
- [ ] Advanced Review and Note-derived Tasks still require separate scope/O-008.

Physical-device acceptance remains open. On 2026-10-13 the user requested continued development, then simulated-phone testing; actual native emulator outcomes are maintained in `06_CURRENT_STATE.md`.

**Recommended M2 implementation sequence (proposal, not a change to D-010 or a new milestone approval):**
1. **Read before extending:** surface saved Notes in Library, then search/filter offline. Proposed check: a captured multiline Note can be found verbatim after a full app restart; no note is silently converted into a Task.
2. **Link before deriving:** decide O-008 and migration/deletion semantics, then implement separately authored Reflect/Create entries and Review. Consider deliberate Note-to-Task conversion only after an accepted linkage model exists; S6–S7 remain research scenarios, not automatic extra V1 requirements. Proposed check: source text and links survive restart; dismissing a task proposal creates no task.
3. **Complete accepted M2 surfaces:** optional Today note, deterministic daily overview, and deliberate edit/delete behaviors. Proposed check: summaries use existing records only; edits and deletions follow reviewed provenance/recovery rules and do not silently destroy linked source content.

These are suggested ordering and test conditions, **not passed tests or finalized acceptance criteria**. M1's physical-device gate remains separately tracked; the current validation venue follows the user's subsequent request for a simulated phone. M3 retains OS reminders, readable export/restore, migrations, and security checks; determine the recovery prerequisite for destructive deletion before shipping that behavior.

**M3 — V1 operational reliability:** user-set due/reminder scheduling with permission/error states and device notification tests; readable export/backup and restore validation, database migrations, and privacy/security checks. Final V1 acceptance remains open until tested.

### V1 target features (accepted scope, unordered outside M1)

- [x] Implement fast capture with SQLite-backed local entries; physical-device acceptance remains pending.
- [x] Add basic read-only Library search/filtering using Note/Task types; richer category semantics remain open.
- [ ] Add explicit tasks with editable status, priority, and optional deadline.
- [x] Add Today tasks, a chosen note with Reflect/Create, and a summary card; no explicit-stop UI.
- [ ] Add user-set reminders using reliable platform scheduling.
- [x] Offer a deterministic current-record summary card; AI remains outside V1.
- [ ] Demonstrate data preservation across restarts and ordinary offline use.

### Exit criteria

A user can capture an idea or task, clarify it, choose priorities, get a reminder for an explicitly scheduled commitment, review the day, and leave the app. Privacy/data behaviors are inspectable.

**Scope note:** High-level Phase 1 V1 features are accepted (D-010); the M1 source slice is implemented. Remaining V1 features and detailed physical-device acceptance are pending.

## 4. Phase 2 — Focused AI assistance (PROPOSED)

- [ ] Add a replaceable AI interface with explicit local/cloud data policy.
- [ ] Test classification suggestions without altering original notes.
- [ ] Test task extraction with user confirmation.
- [ ] Test bounded daily summaries and priority suggestions; cite underlying entries inside the app where practical.
- [ ] Measure classification mistakes, hallucinated deadlines, usability, and privacy trade-offs.
- [ ] Support turning AI assistance off without breaking core task/capture workflows.

### Exit criteria

AI is demonstrably useful, correctable, scoped, and optional; it cannot silently invent or execute commitments.

**Research boundary:** A later, separately chosen AI experiment may test categorization, but it must not expand the accepted no-AI V1 or block M1 delivery.

## 5. Phase 3 — Enhanced reflection, connections, and original creation (PROPOSED)

Basic Review and deliberate linked Reflect/Create entries are already accepted for V1 M2. This later phase explores enhancements beyond those basic flows:

- [ ] Resurface old thoughts for spaced **reflection** rather than memorization.
- [ ] Evaluate richer links involving tasks, experiments, sources, and creations beyond the basic source-entry relationship.
- [ ] Evaluate richer synthesis tools for essays, principles, decisions, projects, or other outputs.
- [ ] Evaluate whether users spend less time organizing and more time thinking/doing.

### Exit criteria

Noeting serves both original thinking and task execution without becoming a content-consumption surface.

## 6. Phase 4 — Controlled personal-agent capabilities (LATER)

- [ ] Define capability-specific tools and permissions.
- [ ] Implement approval, action logs, and safe error/recovery behavior.
- [ ] Evaluate integrations with calendar, email, or other chosen systems.
- [ ] Add contextual retrieval/memory with transparent scope.
- [ ] Consider desktop and optional encrypted sync as separate platform workstreams.

### Exit criteria

The agent acts only within declared permissions, can explain what it did, and can be interrupted or disabled. Autonomy should increase only after safety and value are demonstrated.

## 7. Scope controls

Explicitly **defer** until a concrete need justifies them: complex graph organization, plugin marketplace, infinite suggestions, engagement mechanics, universal integrations, generalized agent autonomy, and distributed sync.

A **prototype** helps test a workflow; a **product** requires reliability, security, and usability work not yet scoped.

## 8. Milestone history (evidence, not current instructions)

- **2026-10-11 — Draft recorded:** [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md) describes four requested sample scenarios plus an optional linked-creation scenario, low-fidelity screen sketches, and unexecuted acceptance tests.
- **2026-10-12 — Research wireframe produced:** A standalone interactive Capture → Today HTML artifact supports core screen interactions. Eighteen simulated-browser checks passed (details and limitations in `07_V1_WORKFLOW_DRAFT.md`); this is not real-world usability validation or a production app.
- **2026-10-12 — Minimal wireframe revision:** User approved Note/Task Capture, + Add task on Today, removing the Think Skip control, and Tasks terminology. The revised standalone prototype passed 33 simulated-browser interaction checks; details in `07_V1_WORKFLOW_DRAFT.md`.
- **2026-10-12 — V1.2 layout revision:** User requested and approved a single Capture entry point and a unified Tasks panel with up to three pinned tasks. The HTML prototype passed 48 simulated-browser checks; see `07_V1_WORKFLOW_DRAFT.md`.
- **2026-10-12 — Wording and feedback:** User requested four shorter action labels, then reported testing the updated prototype and that it worked as intended; device and scenario details not supplied. Prototype reported 53 simulated Chromium checks (see `07_V1_WORKFLOW_DRAFT.md`).
- **2026-10-12 — Implementation direction:** User approved first-app feature scope and React Native + Expo + TypeScript + SQLite, and elected to use Codex. M1 is now the next build milestone; **no native project or product code created yet**.
- **2026-10-13 — M1 source implemented:** Initialized the mobile project, schema v1 SQLite repository, Note/Task Capture, one pending task list with completion/pins, recoverable failures, with explicit stop functionality subsequently removed by D-012. Typecheck, eight real-SQLite repository tests, and all-platform JavaScript exports passed; actual evidence and commands are in `06_CURRENT_STATE.md`. No native APK or physical-device gate is claimed.
- **2026-10-13 — Read-only Library and simulated-phone checks:** Implemented retrieval/search/filter/status without a schema change; seven real-storage browser tests passed. Native Android 9 x86_64 emulator checks passed for Capture, pins/completion, Library, exact SQLite text and offline relaunch/full reboot. This was a staged run after harness corrections; see `06_CURRENT_STATE.md`.
- **Not yet verified:** Physical-phone/ARM64 runtime and usability, Android 15 app compatibility, native rapid-save/failed-save injection, notification delivery, export/restore, security acceptance, or any AI integration.

For the **single authoritative next action**, see [06_CURRENT_STATE.md](06_CURRENT_STATE.md). This roadmap tracks milestones and candidate work, not session handoff instructions.
