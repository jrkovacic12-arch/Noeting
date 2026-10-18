# Noeting — Roadmap and Work Plan

> **Status:** Working plan, not a committed schedule. Checked work items distinguish implemented changes, user-reported acceptance and independently verified evidence.
>
> **Current phase:** Version 0.10.3/code 20/schema v10 is merged through PRs #8 and #9. The user reports successful completion of all nine native N1–N9 checks, while detailed case/device records were not provided. Exact status and next action belong to `06_CURRENT_STATE.md`.

## AI assistant integration — staged research and implementation (2026-10-18)

1. **Foundation in review:** exact, bounded, opt-in scoped local retrieval with source identity and tests. This does **not** yet put an AI assistant in the application.
2. **Reading and retrieval:** propose a quiet user-invoked "Ask notes" affordance in the existing Notes view, with local results, explicit evidence links and no new primary tab. Keep default capture/reading unchanged; verify human usability.
3. **Categorization:** AI suggests one or more user-overridable labels for selected Notes; no automatic filing, source edits or new required taxonomy. Persist only approved results after a separate schema/decision review.
4. **Recommendations:** offer a small bounded list of potential links, follow-ups or Task candidates from selected Notes/Tasks, each with reasons/citations and Accept/Dismiss; preserve user ownership of priorities/commitments.
5. **Model and hosting decision:** compare on-device vs optional hosted reasoning, quality/latency/cost, security, consent and offline fallback. No embedded API secret, blanket library upload, background agent or account requirement.
6. **Acceptance:** scope denial, removed-record exclusion, exact citations, prompt-injection resilience, request errors, offline operation, no silent writes and real-device UX. Production release is a separate gate.

**Current evidence caveat:** the latest merged `main` CI (run 39109000383) failed on the existing draft-storage browser test timeout, despite earlier green PR-head CI. Investigate independently before calling the base fully green.

## Proposed development checkpoint after 0.10.3 — 2026-10-18

**Evidence review, not a new feature commitment:** The current 0.10.3 baseline offers quick Notes/Tasks capture, scoped retrieval, folders, Note links, inline edits, child completion and contextual recovery. Existing real-SQLite/browser coverage tests these interactions. This source review did **not** include new users or longitudinal usability observations; real-life friction remains unmeasured.

**Small reliability candidate:** If obsolete `noeting.editor-draft.v1` contains malformed JSON, `useDraft` currently fails the entire draft startup process even when the authoritative v2 dictionary is valid. Preserve v2 recovery independently, keep invalid v1 bytes for inspection, and exercise the case with a real browser SQLite regression. Do not weaken failed-v2 or failed-migration recovery.

**Dependency stage:** CI previously reported 22 advisories (15 high, 7 moderate). A nonblocking per-package `npm audit --json` inventory is a suitable first step, but severity totals do not establish exploitability. Classify direct/transitive, runtime/build-only, reachability, and compatible remediation before changing any package. If audit service is unavailable, report it instead of declaring the dependency set safe.

**Next milestone proposal:** Validate targeted reliability fix and audit visibility in a dedicated PR; review real-workflow observations on disposable data next; then choose one user-evidenced UX improvement. The report is not permission to introduce AI/accounts/sync, reinstate superseded navigation, publish a new APK, or claim production readiness. This section is a proposal; the exact current action belongs to `06_CURRENT_STATE.md`.

## Reliability maintenance and acceptance gates

- [x] Optional startup preferences, serialized/coalesced draft persistence, historical SQL extraction and reproducible performance procedure (PR #8).
- [x] PR/main CI workflow and local equivalent. Actual executions, failures and corrections are recorded only in `06_CURRENT_STATE.md`; an earlier public-push blocker is no longer active.
- [x] Stabilize the demonstrated restart/dismissal test race without relaxing persistence assertions; verify repeated focused runs and the full suite.
- [x] **User-reported Android acceptance completed:** all N1–N9 cases successfully completed on 0.10.3 per explicit user confirmation (2026-10-18). Device-specific logs, OS/IME and per-subcase measurements were not supplied; the completion is self-reported rather than independently verified.
- [x] **Test-data loss posture clarified:** all present contents are disposable test data and possible loss is acceptable for this phase. D-018 continues to defer backup/export/restore; P-008 is not the next work item and remains unaccepted.
- [ ] **Release-specific evidence (only if release is pursued):** evaluate production signing, dependency risk, supported device targets and appropriate regression scope separately; the test APK and test-phase acceptance are not a production-release authorization.

Do not merge, release or publish a new APK from this maintenance task without explicit authorization. Current artifact identity and evidence remain in `06_CURRENT_STATE.md`.

## Suggested next development flow — proposal only (2026-10-18)

This is **not an accepted implementation decision**. No feature, package upgrade, release, account, agent or backup work is authorized by documenting the sequence.

1. **Security/dependency triage:** Investigate the 22 advisories already reported in CI (7 moderate, 15 high). Classify direct/transitive and development/runtime dependencies, evaluate production reachability and fixes compatible with Expo/React Native. Make targeted updates only if warranted, then rerun established automated checks.
2. **Real-workflow evaluation with disposable data:** Exercise capture → retrieve/edit → link → act/complete, search/folders and interrupted drafts on the accepted 0.10.3 test build. Record actual usability friction, omissions and failures rather than adding assumed capabilities. N1–N9 user-reported completion need not be repeated merely to satisfy this documentation update.
3. **One evidence-based, narrow improvement:** Choose the most consequential observed usability/reliability problem, write a measurable acceptance case, implement one small PR preserving historical records/relationships and no-AI/two-tab boundaries, and verify with existing TypeScript/SQLite/browser/export tests plus native regression appropriate to the changed behavior.
4. **Reassess the next milestone:** Keep using disposable data until durability, threat model and release requirements are deliberately decided. Treat production signing/release readiness separately. Evaluate narrowly permissioned agent assistance only after core UX evidence; AI, accounts, cloud sync and P-008 offline recovery remain outside the authorized present scope.

## Historical PR #6 post-merge validation gate — 0.10.2

The following preserves PR #6-era instructions; use `07_V1_WORKFLOW_DRAFT.md` for the current protocol and `06_CURRENT_STATE.md` for status/action.

1. Install the matching 0.10.2/code 19 ARM64 test APK **over a compatible populated installation without uninstalling**; record device, Android version, signer and whether prior entries/migrations remain intact.
2. Verify folder creation, selection, Edit, Pin/Unpin, deletion confirmation, Notes preservation, quick-bar ordering, scoped search and recovery of drafts whose folder was removed.
3. Test native keyboard/IME, Enter and child focus, Back/modal dismissal, touch hold versus scroll, autosave/retry/Undo, synchronized Task completion, offline force-stop/reboot, and legacy notification cleanup.
4. Record pass/fail/not-run outcomes and device/build evidence in `06_CURRENT_STATE.md`. Browser, SQLite and static APK checks are not substitutes for phone acceptance. Merge does not establish release readiness.
5. Keep local-data risk explicit: SQLite/drafts are unencrypted and export/restore is deferred under D-018. Revisit portability only through a separate accepted decision.

## Historical merged folder implementation — D-027

1. Keep the quick bar All → pinned/other user folders → Uncategorized and add the header folder icon.
2. Add the dedicated Folders screen, selection-mode Pin/Unpin/Delete/Edit, protected system buckets, counts and confirmation.
3. Verify additive v10 migration/retry, transactional bulk failures, persistence and affected browser flows; publish a matching 0.10.2/code 19 ARM64 test APK on the same PR #6.
4. Native acceptance remains pending **after merge**, before any release-readiness claim. Current evidence and sole next action: `06_CURRENT_STATE.md`.

## Historical PR #6 refinement — D-026

1. Implement additive v9 Note folders/organization and atomic pin/move/remove/recovery, preserving populated v6/v7/v8 records and source boundaries.
2. Implement contextual draft migration, inline autosave/retry, Enter-driven child creation, immediate overlay scrims and content-sized sheets.
3. Implement grouped/collapsible task lists, child search and transactionally synchronized parent/child completion; retain one-level and orphan safeguards.
4. Verify migrations/rollback, real storage failure recovery, selection/folder/pin workflows, responsive themes and large lists; build fresh 0.10.1/code 18 ARM64 APK and verify signer/download identity.
5. Finalize the same PR #6 as ready for review under the user’s latest instruction. Native keyboard/IME/Back/scroll gestures, offline reboot and in-place upgrade are **blocking unverified acceptance**, not implied by browser/static checks. Sole current status/next action: `06_CURRENT_STATE.md`.

## Historical PR #6 refinement — D-025

1. Add and verify preservation-first v8 hierarchy, Note-only new source links and independent Subtask operations; preserve v6/v7 legacy links as roots.
2. Replace full-screen Task details with a compact expandable sheet; refine full-screen Note writing, menus, Note-linked entries and read-only task-source navigation.
3. Verify durable draft dismissal, parent/child search, independent completion/removal/Undo, accessible modal isolation, responsive/system-theme behavior and failure recovery.
4. Run TypeScript, real-SQLite and browser checks, exports and available Android build/static validation. Record unavailable native/runtime coverage rather than inferring it from web checks.
5. Update the existing draft PR #6 head, description and a newly versioned verified test APK; keep draft pending independent native/device acceptance. Current status and sole next action live in `06_CURRENT_STATE.md`.

## Historical D-024 minimal M1 refactor — implementation stages


1. **Implemented and SQLite-tested — Preserve data first:** baseline existing 0.7.1/schema v6 with snapshots, repeatable tests, and migrations for existing Note/Task/Reflection/Creation relationships. Avoid destructive database reset; test upgrade from populated v6.
2. **Implemented and SQLite/browser-tested — Domain linking:** support independently authored linked Notes or Tasks from either Note or Task, keeping immutable originals, source snapshots and idempotent saves. Preserve all legacy link reads; add schema only if necessary.
3. **Implemented and browser-tested — Navigation/UI:** replace Today/Library/Review/Settings with Notes and Tasks destinations, both searchable with tab-specific + for standalone capture. Tap cards to open Note/Task details. Place Link note / Link task exclusively in entry detail; support edit/remove and Task Complete/Reopen.
4. **Implemented; native notification cleanup acceptance pending — Retire obsolete interactions safely:** remove Today selection and daily summary UI, Reflection/Creation labels/prompts/filters, pins, scheduled pin forms/timers, redundant list-card actions and old appearance Settings. Prevent silent due-pin execution, retaining only legacy OS notification cleanup where needed.
5. **Automated checks complete; native/device gate pending — Verify and document:** typecheck, real SQLite migration and rollback tests, browser workflows, native Android focused tests for Back/keyboard/list/search/links/offline durability; verify no silent task mutations and no lost historical entries. User-device acceptance and remaining data-loss risk should be recorded separately in `06_CURRENT_STATE.md`.

**Acceptance gate:** only two primary destinations; standalone + obeys current tab; links created only in entry details; historical reflection/creation content preserved as Notes; source provenance remains available; complete/reopen still works; offline persistence and rollback proven. No AI, account or sync. See [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md). Earlier phase and completed-milestone sections below are **historical**, not instructions to re-add their superseded UI features.

## Minimal product and later agent research (D-023)

The accepted product is a minimal independent mobile app; Xiaomi Notes is only a UX reference. Apply D-024 above while retaining historical data/provenance guarantees, with no AI in V1. Investigate real-life use before adding more UI. Later, separately approved research may test scoped read-only, source-grounded retrieval and bounded, explainable priority suggestions; only validated value could justify permissioned actions or optional import adapters. See [D-023](05_DECISIONS.md) for policy and [03_ARCHITECTURE.md](03_ARCHITECTURE.md) for technical boundaries. This section is not authorization to implement an agent, sync or Xiaomi integration. D-018 still defers export/backup/restore.

**Historical plan note:** Phase 0/1 checkboxes and earlier M1/M2 details below preserve previously implemented and later removed 0.7.1-era work, not a competing current product specification. Use the post-merge gate above and current behavior in `02_PRODUCT.md`.

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

**M1 validation plan (emulator smoke checks passed; physical-device gate pending):** Follow the implemented behavior/persistence contracts in [02_PRODUCT.md](02_PRODUCT.md) and [03_ARCHITECTURE.md](03_ARCHITECTURE.md). Check exact multiline/whitespace text; Note creates no Task; direct Task creates exactly one linked Pending Task; injected write failure rolls back and keeps the input; rapid/repeated Save and retry do not duplicate records; completion and historical three-pin limits are tested against the *old* M1 contract; D-020 replaced that limit with unlimited pins. Automated real-SQLite checks and native Android 9 emulator capture/pin/completion/offline relaunch/reboot checks passed. The user subsequently chose a simulated phone for this run; physical Android acceptance, native rapid-save and injected-write-failure tests remain open. Record automated and physical-device evidence separately in `06_CURRENT_STATE.md`; host SQLite/browser checks and emulator evidence must remain distinct from physical-device acceptance.

**M2 — Remaining core workflows (V1 target, not M1):** Library search/filter/edit/delete, optional Today note, deliberate Reflect/Create linked entries, Review, and deterministic daily overview.

- [x] Read-only Library retrieval, literal case-insensitive search, All/Notes/Tasks filters, exact original text and task status, with real-storage browser regression tests.
- [x] Prototype-based Today note with Reflect/Create/Change, basic Review, and deterministic visible summary card; source text remains unchanged.
- [x] Remove explicit stop functionality and Library combined reset control; move compact pin toggles to the right edge (D-012).
- [x] Basic Library edit/removal, Review removal and linked edit/removal under D-014; automated migration/workflow checks passed, phone acceptance remains pending.
- [x] Reopen and Note-derived Tasks implemented under D-017/D-019; O-008 resolved for this relationship. Broader Review enhancements remain separate.

Physical-device acceptance remains open. On 2026-10-13 the user requested continued development, then simulated-phone testing; actual native emulator outcomes are maintained in `06_CURRENT_STATE.md`.

**Recommended M2 implementation sequence (proposal, not a change to D-010 or a new milestone approval):**
1. **Read before extending:** surface saved Notes in Library, then search/filter offline. Proposed check: a captured multiline Note can be found verbatim after a full app restart; no note is silently converted into a Task.
2. **Link before deriving:** decide O-008 and migration/deletion semantics, then implement separately authored Reflect/Create entries and Review. Consider deliberate Note-to-Task conversion only after an accepted linkage model exists; S6–S7 remain research scenarios, not automatic extra V1 requirements. Proposed check: source text and links survive restart; dismissing a task proposal creates no task.
3. **Complete accepted M2 surfaces:** optional Today note, deterministic daily overview, and deliberate edit/delete behaviors. Proposed check: summaries use existing records only; edits and deletions follow reviewed provenance/recovery rules and do not silently destroy linked source content.

These are suggested ordering and test conditions, **not passed tests or finalized acceptance criteria**. M1's physical-device gate remains separately tracked; the current validation venue follows the user's subsequent request for a simulated phone. Historical M3 scope was superseded: D-020 replaced OS reminders with scheduled pins and D-018 moved readable export/restore to the account phase. Continue migration and security checks; explicitly track data-loss risk from unavailable recovery.

**M3 — V1 operational reliability (revised by D-018/D-020):** test scheduled-pin foreground/launch/resume behavior (not OS notifications), migration resilience, offline restart durability, privacy/security and realistic-phone usability. Readable export/backup/restore is deferred to the account phase. Distinct deadlines and priority ranks remain unresolved, not implemented requirements.

### Approved development course — 2026-10-15 (D-019; source implemented, validation in current state)

1. **Reopen completed Tasks:** implement accepted D-017 behavior with focused repository/UI checks for persistence, duplicate activation, write failure and cross-tab consistency.
2. **Note-derived Tasks:** review P-007/O-008 before additive migration and implementation. Verify linked-source preservation, independent edits/removal and atomic retry behavior.
3. **Retrieval improvements (item 4):** retain All/Notes/Tasks and add distinct Reflection/Creation filters; improve two-way source navigation, without requiring new categories or broad organization features.
4. **Optional local reminders (item 2):** one explicitly selected date/time per Task; no automatic scheduling. Design permission, scheduled/error status, edit/cancel, completion/removal cancellation, reboot and timezone behavior before implementation. Reopen must not silently recreate a past reminder. Verify actual Android delivery separately from browser logic.
5. **Focused phone usability (item 5):** check the final build with long notes, larger system text, keyboard/forms/navigation, and a realistic library; record device/OS/build and observed results. Use focused checks at each preceding slice and bounded emulator troubleshooting.

Items 2/4/5 from the user's requested list are included above. The user approved this course with “proceed.” Code exists for steps 1–4; step 5 requires focused automated checks and separately recorded phone acceptance. D-018 defers backup/export/restore to the later account phase; earlier M3/export references describe the prior scope. Accounts/cloud sync and AI are not part of this course.

### Approved refinement — 0.6.0 (D-020)

- [x] Replace notification scheduling with durable scheduled pins; unlimited pins ordered newest first, with already-pinned stability and overdue catch-up.
- [x] Add icon-only scheduled pin/New task/Reopen actions, nested Notes filters and pressable original previews.
- [x] Keep Note cards compact with linked counts and a separate entry screen for actions/source/grouped links; preserve Back/list state.
- [x] Verify schema-v4 upgrade/failure rollback, scheduled-pin timing/order/cancellation and focused browser workflows. Actual evidence belongs in current state.
- [ ] Confirm legacy-notification cleanup and revised visuals/navigation on a physical phone. Older notification-delivery tasks are superseded by D-020; no background pin execution while closed is promised.

### Approved refinement — 0.7.0 (D-021)

- [x] Replace expand with card-body entry navigation; top-right + opens Reflect/Create/New task on all entry types.
- [x] Extend independent derived Tasks to Task sources with atomic migration and immutable source snapshots.
- [x] Add completion checkboxes to Library, Task details and linked Task groups, using existing no-Undo Reopen rules.
- [x] Align clock/pin at the Task right edge, draw a matching left U-turn arrow, and use bottom-right pins for Today-note selection.
- [x] Verify schema-v5 rollback/recovery, Task-source independence and focused interaction/layout workflows; evidence is maintained in current state.
- [x] Build and statically verify the updated ARM64 APK.
- [x] Publish the verified APK after explicit user approval and confirm the fetched checksum.
- [ ] Collect physical-phone acceptance.

### Task card refinement — 0.7.1 (D-022)

- [x] Remove Today per-task +, completed-Task + on all other screens and redundant Task source buttons.
- [x] Verify three focused source navigation/completion workflows and type checking; evidence belongs in current state.
- [x] Build and statically verify the 0.7.1/code 14 ARM64 APK.
- [x] Publish after explicit approval and confirm the downloaded checksum.
- [x] User reported testing the 0.7.1 APK and approved PR #4 merge; specific device/OS/scenario evidence remains unspecified.

### Historical V1 target features (implemented earlier; superseded by D-024)

- [x] Implement fast capture with SQLite-backed local entries; physical-device acceptance remains pending.
- [x] Add basic read-only Library search/filtering using Note/Task types; richer category semantics remain open.
- [x] Add explicit Tasks with Pending/Completed and Reopen, editable words and unlimited manual/scheduled pinning; separate priority ranks and deadlines remain open design decisions.
- [x] Add Today tasks, a chosen note with Reflect/Create, and a summary card; no explicit-stop UI.
- [x] Add user-set scheduled pins with foreground/open catch-up under D-020; physical-phone acceptance remains pending.
- [x] Offer a deterministic current-record summary card; AI remains outside V1.
- [ ] Demonstrate data preservation across restarts and ordinary offline use.

### Exit criteria

A user can capture an idea or task, pin chosen pending tasks manually or at a selected future time (without OS notification), revisit linked thinking, review completed work and leave the app. Separate priority ranks and due-date alerts are not yet supported. Privacy/data behaviors are inspectable.

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
- **Historical verification gap (as of early M1):** Physical-phone/ARM64 runtime and usability, Android 15 app compatibility, native rapid-save/failed-save injection and security acceptance were not established. Notification delivery was superseded by scheduled pins (D-020); export/restore was deferred (D-018), and AI remains outside V1. For current evidence see `06_CURRENT_STATE.md`.

For the **single authoritative next action**, see [06_CURRENT_STATE.md](06_CURRENT_STATE.md). This roadmap tracks milestones and candidate work, not session handoff instructions.
