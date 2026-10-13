# Noeting — Roadmap and Work Plan

> **Status:** Working plan, not a committed schedule. Checked work items identify source implementation; device acceptance remains a separate gate.
>
> **Current phase:** M1 source implemented with automated repository evidence; physical native-device gate pending.

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
- [x] Implement minimal Today: one Tasks list, complete task, pin/unpin maximum three, show each task only once, and a deliberate stop.
- [ ] Verify saved data survives full app termination/relaunch and works offline; include automated unit/integration checks and real-device smoke tests.

**M1 exit gate:** Captures and task state survive restart offline; no duplicate tasks; atomically linked writes; no save-success UI on failed persistence; no backend, AI, or sign-in.

**M1 validation plan (physical-device gate pending):** Follow the implemented behavior/persistence contracts in [02_PRODUCT.md](02_PRODUCT.md) and [03_ARCHITECTURE.md](03_ARCHITECTURE.md). Check exact multiline/whitespace text; Note creates no Task; direct Task creates exactly one linked Pending Task; injected write failure rolls back and keeps the input; rapid/repeated Save and retry do not duplicate records; completion and up to three pending pins persist across restart and pin limits survive concurrent attempts. Automated real-SQLite checks passed; run the actual Expo native runtime plus full termination/relaunch in airplane mode on the first physical Android device (user-confirmed target). Record automated and physical-device evidence separately in `06_CURRENT_STATE.md`; host SQLite and browser checks cannot pass the native gate.

**M2 — Remaining core workflows (V1 target, not M1):** Library search/filter/edit/delete, optional Today note, deliberate Reflect/Create linked entries, Review, and deterministic daily overview.

**M3 — V1 operational reliability:** user-set due/reminder scheduling with permission/error states and device notification tests; readable export/backup and restore validation, database migrations, and privacy/security checks. Final V1 acceptance remains open until tested.

### V1 target features (accepted scope, unordered outside M1)

- [x] Implement fast capture with SQLite-backed local entries and a deliberate exit; physical-device acceptance remains pending.
- [ ] Add lightweight categories and basic search/filtering.
- [ ] Add explicit tasks with editable status, priority, and optional deadline.
- [ ] Add a finite Today view of selected tasks and reflection items.
- [ ] Add user-set reminders using reliable platform scheduling.
- [ ] Offer a basic deterministic daily overview; AI is outside V1.
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
- **2026-10-13 — M1 source implemented:** Initialized the mobile project, schema v1 SQLite repository, Note/Task Capture, one pending task list with completion/pins, recoverable failures, and a deliberate stop. Typecheck, eight real-SQLite repository tests, and all-platform JavaScript exports passed; actual evidence and commands are in `06_CURRENT_STATE.md`. No native APK or physical-device gate is claimed.
- **Not yet verified:** Structured device usability results, actual native runtime and offline restart, notification delivery, export/restore, security acceptance, or any AI integration.

For the **single authoritative next action**, see [06_CURRENT_STATE.md](06_CURRENT_STATE.md). This roadmap tracks milestones and candidate work, not session handoff instructions.
