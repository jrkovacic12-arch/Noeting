# Noeting — Documentation Change Log (started 2026-10-11)

## 2026-10-18 — Manual read-only PC mirror sync foundation

- User prioritized PC–phone synchronization ahead of PC-hosted Ollama/AI. Introduce explicit Notes-menu manual transfer of active Notes/Tasks/folders to a localhost-only paired PC receiver over a separately configured trusted HTTPS endpoint.
- Add transport validation, size cap, per-device identity, temporary token input, protected PC mirror file and unit tests; no automatic push, PC editing, conflict resolution, remote-to-phone writes or migration.
- Call out that the preview omits removed records/drafts and is not a backup/restore mechanism. True bidirectional sync, pairing/revocation, full tombstones and PC editor remain future stages.
- Main's pre-existing draft-storage browser timeout is not declared fixed by this work.

## 2026-10-18 — Post-PR #9 status, native acceptance and test-data scope (documentation only)

- Align current source and CI with merged PR #9 (`dfdb642`), successful main run `39099547696`; retire stale pending-merge/failed-CI instructions without deleting dated historical evidence.
- Record the user's explicit confirmation that **all N1–N9 Android acceptance cases were fully completed successfully** on the 0.10.3 APK. Distinguish reported passes from unavailable device/test-specific artifacts; no independent native test was executed as part of this documentation change.
- Record the user's explicit acceptance of possible loss of **disposable test data** during current development. Keep D-018's account-phase backup deferral and P-008's unaccepted status; security/durability requirements must be reconsidered when storing valuable data.
- Add an unapproved next-development sequence: dependency advisory triage, observed workflow evaluation using test data, one narrow evidence-based change, and separate release/agent decisions. No runtime, package, migration, APK, merge or release changes.

## 2026-10-17 — Post-merge documentation alignment (documentation only)

- Record PR #6 merge into `main` (`519c16cf75c5fa9d43a8f96244ca1ae7ef30d5c2`). The previously documented native-before-merge gate is not shown as passed or explicitly waived; current native/device acceptance remains pending. Merge does not prove release readiness.
- Clarify 0.10.2/schema v10 as the current Notes/Tasks contract; label earlier 0.7.1 Today/Review/scheduled-pin behavior and prototype examples historical, preserving old migration and test records.
- Document the post-merge phone acceptance gate in the roadmap and keep `06_CURRENT_STATE.md` the sole owner of status, outcomes and next action. Local SQLite/drafts remain unencrypted; export/restore remains deferred under D-018. No source code or runtime tests were changed or executed by these documentation edits.

## 2026-10-17 — Folder screen and retained quick bar

- D-027 records the user-approved folder screen, multi-selection, persistent folder pins and All/user folders/Uncategorized quick-bar order. Additive schema v10 preserves existing Notes. Implementation is 0.10.2/code 19; verification and APK identity belong to `06_CURRENT_STATE.md`.


## 2026-10-16 — PR #6 finalization and 0.10.1 test build

- Review the ten newer PR fixes, retain atomic folder capture and durable draft cancellation/recovery, and correct reverted-edit status plus next-child focus after saving.
- Correct cancellation/keyboard test assumptions and complete the current automated checks; publish a matching versioned test APK with signer/download identity verified.
- Finalize the same PR #6 as ready for review under the user's latest instruction. No merge or native-device pass is claimed; exact commands, evidence and remaining acceptance live in `06_CURRENT_STATE.md`.

## 2026-10-16 — 0.10.0 PR #6 inline UX and Note organization

- Record D-026 from the supplied refinement; supersede D-025 UI/independent completion while preserving its provenance/history boundaries.
- Add v9 Note folders, separate Note pins, atomic bulk organization/removal/recovery and synchronized parent/child completion.
- Replace Edit/Resume with contextual draft recovery and inline autosave; add anchored overlays, compact sheets, Enter-driven child creation and grouped Tasks.
- Update the same draft PR #6 with new verification/APK evidence; native/device acceptance remains blocking. Exact results/identity are maintained in `06_CURRENT_STATE.md`.

## 2026-10-16 — 0.9.0 PR #6 Notes/Task-sheet redesign

- Record D-025 from the user's supplied redesign: full-screen writing-first Notes, compact Task/Subtask sheets, Note→Note/Note→Task creation only from Note detail, and read-only Task-source provenance.
- Add schema v8 one-level task ownership, independent state/removal/Undo and subtask-aware search. Preserve all legacy v6/v7 source data and keep pre-existing Tasks as roots.
- Retain drafts across safe dismissal/restart with serialized local persistence; isolate modal accessibility and sequence database initialization.
- Update existing draft PR #6 and its current product/architecture/acceptance records. TypeScript, SQLite, browser, exports and fresh 0.9.0/code 16 ARM64 build/static checks pass; new APK download bytes match the verified checksum. Delivery identity and device gaps live in `06_CURRENT_STATE.md`; earlier APKs remain historical.

## 2026-10-16 — 0.8.0 minimal Notes/Tasks implementation

- Implement D-024 with two searchable tabs, shared entry details/editor, intentional links, edit/remove/Undo and Complete/Reopen. Remove Today/Review/pin/classification/Settings surfaces; use system theme.
- Add schema v7 generic source snapshots, preserve populated v6 data, park schedules and stop due-pin effects. Keep legacy notification cleanup.
- Record automated verification and delivery limits in `06_CURRENT_STATE.md`; no AI, accounts, sync or export/restore added.
- Following explicit publication approval, open draft PR #6 and upload the verified 0.8.0/code 15 ARM64 APK on a separate download branch; fetched bytes match the verified checksum. Main remains unchanged.

## 2026-10-16 — D-024 minimalist Notes/Tasks refactor direction

- Approve future M1 target of Notes and Tasks tabs with per-tab search/+ and dedicated entry detail; link a new Note or Task exclusively from an entry-detail screen.
- Reserve Reflection and Creation for philosophy, not types/actions/filters. Preserve all historical content and relationships during the future Codex refactor; remove Today/Review/schedules/summary/Settings UI rather than deleting storage history.
- Record migration safeguards, staged development and future acceptance scenarios in existing authoritative files. Documentation only; app remains 0.7.1/schema v6 and no new runtime tests were run.

## 2026-10-16 — PR #5 documentation consistency review

- Consolidate D-023 decision details and cross-reference them instead of restating the same agent proposal in each document.
- Mark outdated M1 limitations and earlier reminder/linkage proposals as historical; align current-facing requirements with schema v6 and D-020 scheduled pins/unlimited pinning.
- Clarify the remaining gaps: separate deadlines/ranked priorities, real-device acceptance, security and local data recovery risk (export/restore remains deferred by D-018). No application code, schema, or runtime test results changed.

## 2026-10-15 — Product-direction documentation update after PR #4

- Record D-023: continue Noeting as an independent minimal notes/thinking/action interface informed by Xiaomi Notes' simple UX, rather than emulate Obsidian feature breadth. A replaceable permissioned agent layer remains a later product direction, not V1.
- Reconcile this direction with merged 0.7.1 (PR #4): preserve D-017 Reopen, D-018's account-phase export/backup/restore deferral, and D-019–D-022 linked Tasks/scheduled pins and navigation. Proposed later read-only agent experiments are not implemented or authorized by these docs.
- Update vision, product, architecture, roadmap, decisions and current-state context. Documentation-only; application source, schema, verification evidence and founding archive are unchanged.

## 2026-10-15 — 0.7.1 Task card simplification

- Implement D-022: remove per-task + on Today and completed-Task + in Review/Library/entry screens; remove redundant Task source buttons while preserving original-preview navigation.
- No database change. Focused verification and APK status are recorded in `06_CURRENT_STATE.md`.
- At the user’s request, published the verified 0.7.1 APK and confirmed its downloaded checksum; opened [PR #4](https://github.com/jrkovacic12-arch/Noeting/pull/4) for the accumulated approved source changes. The user subsequently reported testing the APK and explicitly authorized merging PR #4; device/scenario details were not supplied.

## 2026-10-15 — 0.7.0 entry actions and completion

- Implemented the approved D-021 card-body navigation, three-choice + menus, independent Task-source links, completion checkboxes and refined pin/clock/Reopen placement/icons.
- Schema v6 preserves existing records while allowing Task sources. Verification and APK delivery evidence live in `06_CURRENT_STATE.md`; device acceptance remains separate.
- Following explicit user upload approval, published the verified 0.7.0 APK on its separate GitHub download branch and confirmed the downloaded checksum.

## 0.6.0 — 2026-10-15

- Record D-020 and replace notifications with unlimited, newest-first scheduled pins; preserve existing pin positions when schedules arrive and cancel legacy notifications on first launch.
- Add compact clock/+/U-turn actions, nested Notes filters, pressable source previews, linked-count metadata and a separate entry screen with grouped links and Back restoration.
- Schema v5 upgrades preserve prior content/source links and migrate outstanding reminder intent. Current validation/build/publication evidence lives only in `06_CURRENT_STATE.md`.
- TypeScript, 26 data tests, all 23 browser workflows, web export and ARM64 build/static verification passed. Following explicit user upload approval, published only the verified 0.6.0 APK on its separate public download branch and confirmed the fetched checksum. Source review/merge and physical-phone acceptance remain separate.

## 0.5.0 — 2026-10-15

- User approved the proposed local development course (D-019). Implement Reopen without Undo/confirmation, independent source-linked Tasks, distinct Reflection/Creation filters and readable source navigation.
- Add schema v4 and optional local reminders with durable intent, revision-based scheduling, retryable permission/errors and cancellation on completion/removal. Source, scheduling and validation details live in the authoritative product/architecture/current-state records.
- Accounts/sync and backup/export/restore remain deferred. Build/device evidence is recorded only in current state.
- 0.5.0 TypeScript, 27 data/reminder tests, 21 browser workflows, final web export, ARM64 build and static verification passed. Public APK publication initially required explicit approval after automatic review blocked it; the user then instructed “upload the verified APK.” Published the verified APK on its separate public download branch and confirmed the fetched checksum. Main/source publication and phone acceptance remain separate; details live in current state.

## Development decisions and proposed course — 2026-10-15

- Record accepted Reopen behavior (D-017) and deferral of backup/export/restore to accounts (D-018).
- Propose Note-to-Task relationship P-007 and add reminders, retrieval improvements and focused phone usability to the proposed course in `04_ROADMAP.md`.
- Update the exact next action to await user approval. Documentation only; no implementation or test results claimed.

## Phone testing and merge approval — 2026-10-15

- User reports testing the PR-version APK on their phone and explicitly requests merging PR #3. Record this as user-reported acceptance for merge; model/OS and per-feature outcomes were not supplied. Proposed next slices remain subject to user choice; see `06_CURRENT_STATE.md`.

## 0.4.0 — 2026-10-15

- Add Settings with local Light/Dark/Same as system selection and a semantic dark palette across the app. D-016 records the accepted scope.
- Add Expo system appearance support, SQLite-backed preferences, live device theme updates and failed-save rollback.
- Correct two dependency lockfile version labels to match their existing resolved tarballs, and ignore Python validation caches.
- Finalize the accumulated app/branding/navigation work for a PR; current validation and review state are maintained in `06_CURRENT_STATE.md`.

## 0.3.3 — 2026-10-14

- Reduce potential Review-to-Library Back lag by retaining the ScrollView and visited screen bodies rather than recreating Library cards on return. Phone performance confirmation is pending.
- Make the toolbox dim backdrop immediate and stationary; animate only the sheet upward.
- Verification and APK delivery evidence are maintained in `06_CURRENT_STATE.md`.

## 0.3.2 — 2026-10-14

- Replace Add task text with a borderless plus icon and an accessible 44-point target.
- Record the user-approved lesson on bounded simulator troubleshooting and focused verification in `00_START_HERE.md`.
- TypeScript, focused task-capture browser workflow and ARM64 APK checks passed. No new native runtime pass claimed. Updated APK published and fetched checksum verified; current link is maintained in `06_CURRENT_STATE.md`.

## 0.3.1 — 2026-10-14

- Implement D-015: three-row bottom tools, backdrop dismissal/session drafts, Save labels, 300 ms long press, previous-screen Back with layout-aware scroll restoration, Today-only double-back exit and a centered swipeable Undo control.
- TypeScript, 18 SQLite checks and 14 browser workflows passed; both signed ABI APK verifiers passed. Android upgrade/Back/forms/sheet/clipboard behavior verified across partial runs on the same final APK. Full native edit/Undo/relaunch suite blocked by accessibility automation; physical acceptance remains pending.
- Phone APK published on a separate download branch under existing approval, with main unchanged and fetched checksum verified. Current link/evidence are maintained in `06_CURRENT_STATE.md`.

## Scope and evidence

Reconciled eight supplied Markdown files. This was **editorial maintenance only**: no prototype was built, no usability tests were run, and no proposals were upgraded to accepted V1 requirements. At the initial cleanup, the referenced authentic original was unavailable and was **not** recreated. It was subsequently provided and has now been added unchanged (see update below).

## Changes by file

| File | Corrections |
| --- | --- |
| `00_START_HERE.md` | Added the eighth document to the index; defined one owner per topic; removed the duplicated next-step narrative; linked to the handoff and missing-archive notice. |
| `01_VISION.md` | Preserved the foundational philosophy; shortened repeated AI-policy discussion; clearly marked the absent original source. |
| `02_PRODUCT.md` | Consolidated candidate workflow requirements; pointed detailed scenarios and pass/fail tests to `07`; made candidate task states and taxonomy clear as unvalidated; reduced repeated decision/question lists. |
| `03_ARCHITECTURE.md` | Kept technical-enforcement responsibilities here; removed repeated first-milestone/AI-policy paragraphs; referenced the canonical decision register. |
| `04_ROADMAP.md` | Replaced the stale “write workflow specification” next-action section with dated milestone history; kept remaining work items unverified. |
| `05_DECISIONS.md` | Moved P-004 alongside other proposals; preserved its **Proposed** status and the historical D-006 decision; clarified that user allowance to request permission does not approve particular features. |
| `06_CURRENT_STATE.md` | Removed duplicated history, outdated next actions, and repeated guardrails; recorded the sole exact next action and factual implementation/validation status. |
| `07_V1_WORKFLOW_DRAFT.md` | Retained illustrative scenarios and unexecuted acceptance tests; replaced repeated global data/AI/privacy rules with references to `02`/`03`/`05`; removed a competing next-action section. |
| `archive/README.md` | New notice explaining that the original archival file is not included. |

## Source restoration and workflow clarification (2026-10-11)

The authentic founding note was subsequently supplied as `noeting-original.md` and copied byte-for-byte to `archive/noeting-original.md`, without reconstruction or rewriting.

Changes made for this update:
- `archive/noeting-original.md`: added the authentic source unchanged.
- `archive/README.md`: replaced the missing-source notice with a short provenance/preservation note.
- `00_START_HERE.md`: linked the source from the index and read order; removed the missing-source warning.
- `01_VISION.md`: linked to the now-available authentic source.
- `05_DECISIONS.md`: replaced D-001's missing-source pointer with a direct link to the original; decision status unchanged.
- `06_CURRENT_STATE.md`: recorded the source restoration; clarified the exact wireframe test conditions.
- `07_V1_WORKFLOW_DRAFT.md`: specified immediate Capture closure on Save, deferred/deliberate task clarification, and a finite Today path for reflection/experiments/creation alongside tasks; tests remain unexecuted.
- Changelog: recorded this update, preserving the earlier cleanup history.

No changes were needed to `02_PRODUCT.md`, `03_ARCHITECTURE.md`, or `04_ROADMAP.md`. No prototype, user testing, or new accepted decision is implied.

## 2026-10-12 — Wireframe iteration and handoff maintenance

- Created the interactive Capture → Today prototype, then simplified it with the user's explicit approval. `02_PRODUCT.md` and `05_DECISIONS.md` record the prototype-only choices; `07_V1_WORKFLOW_DRAFT.md` records test evidence and limitations; `04_ROADMAP.md` tracks the milestone.
- Recorded 33 simulated-browser interaction checks for the revised prototype; real-phone feedback, actual persistence, and notification delivery remain unverified.
- Updated `00_START_HERE.md` with concise-response and permission-for-longer-response preferences, mandatory reuse of existing Markdown files unless otherwise authorized, nonredundancy rules, and ZIP resumption instructions.
- Updated `06_CURRENT_STATE.md` to reflect planned phone testing and the sole next action. Replaced a separate `README_NEXT_SESSION.md` in the handoff ZIP with references to existing project files.
- Reconciled stale test descriptions and clarified the distinction between prototype evidence and product implementation; updated the entry-point document index and handoff protocol. This log is historical only; refer to `06_CURRENT_STATE.md` for current status and next action.

**Scope:** Documentation and prototype work only; no structured phone testing, production implementation, or final MVP approval is claimed.

## 2026-10-12 — V1.2 interface consolidation

- Following user approval, removed duplicate Capture entry points, the separate priorities panel, repeated summary blocks, empty-date labels, and redundant Capture dialog controls. Tasks are shown once, pinned tasks first (three-pin limit); test utilities are collapsed.
- Recorded prototype-only D-008 in `05_DECISIONS.md`; aligned navigation/Today behavior in `02_PRODUCT.md`, scenarios and **48 simulated-browser checks** in `07_V1_WORKFLOW_DRAFT.md`, milestone in `04_ROADMAP.md`, and next test in `06_CURRENT_STATE.md`.
- Replaced V1.1 test/screenshots with V1.2 artifacts. No new Markdown documents, production code, or unsupported device-validation claims.

## 2026-10-12 — Documentation policy and changelog naming

- Updated `00_START_HERE.md`: session handoffs and ZIP packaging require an explicit user request; routine project edits do not trigger handoffs.
- Renamed `CHANGELOG_2026-10-11.md` to `CHANGELOG.md` so subsequent entries use one continuous history file. Updated its links in `00_START_HERE.md` and `06_CURRENT_STATE.md`.
- No product behavior, test results, or handoff package changed in this documentation-only update.

## 2026-10-12 — Thinking/action connections documented for evaluation

- Clarified in `01_VISION.md` that Thinking and Action are independently useful and may inform one another without mandatory conversion or productivity pressure.
- Added voluntary handoff candidates in `02_PRODUCT.md`, illustrative S6–S7 scenarios and pending checks in `07_V1_WORKFLOW_DRAFT.md`, and proposed decision P-005 in `05_DECISIONS.md`.
- Added Phase 0 validation work in `04_ROADMAP.md`, a non-binding relationship note in `03_ARCHITECTURE.md`, and reconciled `06_CURRENT_STATE.md` to the already documented V1.2 evidence of 48 simulated checks; its exact next action remains unchanged.
- **Documentation only:** No wireframe modification, real-device validation, production feature, V1 approval, or new technical decision is implied. Original founding note and `00_START_HERE.md` remain unchanged.

## 2026-10-12 — Action label simplification after reported testing

- Replaced prototype action labels **Develop into creation → Create**, **Add reflection → Reflect**, **Choose for Today → Today note**, and **Make task → New task** in the applicable Library and Today views. Interaction behavior remains unchanged.
- Recorded the prototype-only approval in `05_DECISIONS.md` (D-009), updated the illustrative scenarios in `07_V1_WORKFLOW_DRAFT.md`, and aligned the Playwright checks and current-state evidence.
- The user reported testing but supplied no device or structured S1–S4 outcomes. No phone or production capability is claimed as validated.

## 2026-10-12 — Codex implementation handoff and approved mobile stack

- Recorded the user's self-report that the relabeled prototype **worked as intended** in `07_V1_WORKFLOW_DRAFT.md` without asserting a phone/device, S1–S4 completion, offline durability, or notification delivery.
- Recorded accepted **V1 high-level scope (D-010)** and **React Native + Expo + TypeScript + on-device SQLite (D-011)** in `05_DECISIONS.md`. Adjusted the open-decision register without declaring detailed requirements finalized.
- Updated `02_PRODUCT.md` for the staged V1 feature boundary, `03_ARCHITECTURE.md` for the selected stack and reliability constraints, `04_ROADMAP.md` for the M1 Capture → Today first build, and `06_CURRENT_STATE.md` for the sole exact Codex next action.
- Corrected the handoff index to avoid linking to the archival README that was not supplied; the authentic original is preserved unchanged under `archive/noeting-original.md` in the ZIP. No extra Markdown document was created.
- **No native app, production persistence, reminder delivery, device validation, or AI capability was implemented in this handoff.** The HTML prototype/test script and reference screenshots are carried forward unchanged.

## 2026-10-13 — M1 implementation preparation after documentation review

- User authorized proceeding with the recommended M1 build and documentation cleanup. Imported the supplied project handoff into the existing repository; the authentic archive remains unchanged.
- Reconciled stale AI/scope/stack language with D-010/D-011. Distinguished accepted M2 basic Review/Reflect/Create flows from proposed later enhancements.
- Added proposed M1 behavior and persistence contracts in `02_PRODUCT.md` / `03_ARCHITECTURE.md`, pending native/device checks in `04_ROADMAP.md`, and P-006 in `05_DECISIONS.md`. Android is the default first physical target; exact SDK/device evidence remains pending.
- **Preparation only:** This entry does not claim a completed native implementation, passed native tests, physical-device validation, or the M1 exit gate. Actual run/test evidence belongs in `06_CURRENT_STATE.md` when available.

## 2026-10-13 — M1 source implementation and cloud validation

- Implemented the React Native/Expo first slice, schema v1 SQLite repository, direct Note/Task Capture, one pending Tasks list, persisted completion/pins, failure draft retention, and deliberate stop. Saved Notes are count-only until M2 Library.
- Recorded actual resolved stack versions/security limits in `03_ARCHITECTURE.md`, implementation choices under P-006, source-complete roadmap items, reproducible run/check commands and evidence in `06_CURRENT_STATE.md`, and the pending device checklist in `07_V1_WORKFLOW_DRAFT.md`.
- Lockfile installation, TypeScript checking, eight real-SQLite repository tests, and Android/iOS/web JavaScript exports passed. Five UI tests passed against actual web SQLite storage, including full browser restart, loaded-app offline capture, lock-contention recovery, and real failed-write draft retention/retry; native physical-device checks remain unrun. No APK, native device pass, security guarantee, or completed M1 gate is implied.
- Android `allowBackup: false` is a protective configuration default; plain SQLite/iOS backup policy and placeholder development branding/IDs remain disclosed limitations. The founding archive is unchanged.

- Confirmed Android as the first physical smoke-test target after the user replied; actual phone checks remain pending. Exercised the complete install script and headless Metro startup, with a current native manifest/development-bundle request verified after dependency refresh.
- Saved tested reusable installation and service-start instructions in the environment draft; publication remains pending user review/save and publish.

## 2026-10-13 — Android build preparation and dependency-network blocker

- Generated the ignored Android native project and prepared verified Microsoft Java 17 / Google Android SDK tools. Corrected the Java 17 prerequisite and the vendor JDK's missing proxy CA using the maintained system Java trust store; TLS, signature, and checksum verification remain enabled.
- Added native Android build/static-verification helpers and npm commands; recorded toolchain/configuration limits in `03_ARCHITECTURE.md`, actual build progress and the sole next action in `06_CURRENT_STATE.md`, and the pending ARM64 Android installation/offline checklist in `07_V1_WORKFLOW_DRAFT.md`. Blocked unused M1 Android permissions in source configuration; merged-manifest validation remains pending.
- Gradle reached plugin/configuration work but Maven Central's React Native release AAR redirected to `repo.reactnative.dev`, which initially returned HTTP 403. The required host addition is now active and the exact artifact URL returns HTTP 200; resumed full compilation remains pending.
- Eight real-SQLite checks passed again; the prior five browser passes remain prior evidence rather than a rerun. **No APK was produced, no Android runtime or phone test was run, and the native M1 gate remains open.** The original archive is unchanged.

- Exercised the complete native-prerequisite install script successfully and passed `npm run prepare:android`; saved the updated install/start instructions alongside the specific `repo.reactnative.dev` network addition. Full APK compilation/static validation and physical-device acceptance remain pending.

## 2026-10-13 — Public README and documentation-only M2 clarification

- Added a public-facing `README.md` describing the vision, implemented M1 boundary, local verification commands, known privacy/recovery limits, and links to authoritative project documents.
- Corrected stale Android dependency-blocker wording in `06_CURRENT_STATE.md` and the M1 checklist reference. **The sole exact next action is unchanged:** attempt the Android test build, verify the artifact, then run device checks; no compilation, APK, or device success is claimed.
- Documented the M1 schema's Task-kind-entry constraint versus proposed Note-derived Tasks in `03_ARCHITECTURE.md`; opened O-008 in `05_DECISIONS.md` without choosing a schema or promoting research into an accepted decision.
- Clarified M1's count-only Notes UI and candidate M2 source-preserving workflows in `02_PRODUCT.md`; proposed a sequenced M2 plan and unexecuted scenarios in `04_ROADMAP.md` and `07_V1_WORKFLOW_DRAFT.md`.
- No code, schema, tests, configuration, milestone-completion claims, founding philosophy, or accepted V1 scope changed. All M2 checks remain proposed and unrun.


## 2026-10-13 — Standalone Android APK and static verification

- Completed the M1 ARM64 Android build and static APK verification end to end. Artifact identity, checks, and the no-attached-device result are recorded in `06_CURRENT_STATE.md`; the next action is physical-device acceptance before M2.
- Fixed sandbox-safe GPG public-key verification without relaxing signature/checksum validation. Corrected the verifier's Hermes library name and current `aapt2` SDK/namespace parsing; five regression tests passed. TypeScript and all eight SQLite tests passed again.
- Updated architecture, README, roadmap, and the static portion of the device checklist. Native launch, offline force-stop/relaunch, phone reboot, and the physical M1 exit gate remain unrun. No feature/schema or founding-source changes.


## 2026-10-13 — Read-only Library and native simulated-phone validation

- Added Library retrieval/search/type filters, original words, task status and deliberate stopping without changing schema v1. TypeScript, eight SQLite tests, seven real-storage browser tests and five verifier regression tests passed.
- Followed the user's simulated-phone testing instruction: added x86_64 build support and an isolated AOSP native smoke harness. Android 9 native capture/pins/completion, offline relaunch, Library, SQLite integrity/exact text and full reboot persistence passed in a staged run; the Android 15 system startup failed before app launch.
- Recorded artifact/device evidence and remaining physical/native-failure-path limits in `06_CURRENT_STATE.md`; updated product, architecture, roadmap and workflow evidence. Physical acceptance remains open; the original source and schema are unchanged.


## 2026-10-13 — Updated ARM64 APK for phone testing

- Rebuilt the current Library-enabled source as the ARM64 phone APK at the user's request; native compilation and all static checks passed. Artifact identity and delivery status are maintained in `06_CURRENT_STATE.md`.
- Physical-phone acceptance remains pending. Public upload has not occurred; the public repository's download route awaits the user's approval because direct chat attachment is unavailable on this host.

- After explicit user approval, uploaded the phone-test APK on a separate public GitHub download branch and verified its downloaded bytes against the local SHA-256. The main branch is unchanged; link and artifact identity are maintained in `06_CURRENT_STATE.md`.


## 2026-10-13 — Version 0.2.0 approved phone UX and thinking workflows

- Recorded D-012/D-013: remove all stop functionality, use right-edge pin icons, add prototype-based Today note/Reflect/Create/Review and a visible summary card, remove Library's combined reset control. Updated current vision/design while preserving the founding archive.
- Implemented additive schema v2, stable atomic linked-entry saves and persistent Today selection. Eleven SQLite tests, nine real-storage browser tests, five verifier tests and 54 HTML simulated checks passed.
- Both 0.2.0 native ABI builds/static checks passed with version code 2 and preserved signer. Twenty-five Android 9 emulator assertions passed for non-destructive upgrade, all new workflows, source preservation and offline full reboot; physical-phone acceptance remains pending. Exact evidence/artifact identity lives in `06_CURRENT_STATE.md`.

- Published only the 0.2.0 ARM64 test APK through the previously approved public download branch and verified the fetched bytes against its SHA-256; main remains unchanged.

## 2026-10-13 — Version 0.2.1 phone styling refinement

- Replaced the stacked pin glyph with crisp transparent density assets from the prototype silhouette; removed its button border/backplate. Filled green and muted outline states retain accessible labels and a 44-point touch target. No runtime dependency added.
- Aligned completion boxes to the first task text line for single-line and wrapped titles. Today note now uses platform serif typography, curly quotation marks, a warm outlined card, compact Reflect/Create and text-only Change. Original saved text and schema v2 are unchanged.
- TypeScript, nine real-storage browser workflow tests and 54 prototype checks passed. Three phone widths (360/390/430) passed measured alignment, borderless target and overflow checks; screenshot reviewed. Android runtime evidence from 0.2.0 remains historical; this cosmetic update requires phone visual acceptance. Artifact validation/download identity is maintained in `06_CURRENT_STATE.md`.

- ARM64 0.2.1/code 3 compilation and static checks passed with the unchanged signer; x86_64 runtime evidence/artifact remains 0.2.0.

- Published the verified 0.2.1 APK on a separate approved public download branch; fetched download SHA-256 matches. Main remains unchanged.

## 2026-10-14 — Version 0.2.2 clean launcher and startup

- Preserved the existing clean blue foreground logo, removed the adaptive icon's template grid background, and selected the clean foreground for fallback icon/favicon. No image redesign or new runtime dependency.
- Added a persistent Expo config plugin selecting a plain paper launch background, suppressing the Android 12+ animated startup icon and removing template grid drawables/references. It survives native regeneration; the existing development signer is retained.
- Generated native resource checks passed: clean icon preview reviewed, no grid drawable/reference, expected launch-theme values and exact signer file match. App/data source is unchanged; no browser/repository or native runtime tests were rerun for this configuration-only update. Build/download evidence is maintained in `06_CURRENT_STATE.md`.

- ARM64 0.2.2/code 4 build and static verifier passed with the existing signer. Compiled startup-theme, flat-background and absent-grid resource checks passed; device cold-launch visual acceptance is pending.

- Published the verified 0.2.2 phone APK on a separate approved public download branch and checked the fetched SHA-256; main remains unchanged.

## 2026-10-14 — Version 0.2.3 supplied Noeting branding

- Added all four supplied SVG/EPS files byte-for-byte in `assets/brand/source/`. EPS files are stored as originals, not executed; raster assets are derived from the symbol SVG.
- Replaced the starter blue icon with the supplied symbol on the paper background, including adaptive foreground/monochrome, fallback icon and favicon. Added the same symbol beside the app name in header/loading states. Preserved source colors/proportions and the plain startup theme.
- Reproducible asset authoring: `scripts/render-brand-assets.py`; Inkscape/Pillow are authoring tools only. Four original-byte comparisons, adaptive safe-circle inclusion, monochrome silhouette and TypeScript passed. Data/schema and task/thinking workflows are unchanged. Latest build/preview/download evidence lives in `06_CURRENT_STATE.md`.

- Web export passed; header symbol and Capture fit at 320/360/430 pixels with no page overflow. Capture opens correctly and the screenshot was reviewed. No broad workflow tests were repeated for this branding change.

- ARM64 0.2.3/code 5 compilation and APK verification passed with the preserved signer. Exact artifact identity is recorded in `06_CURRENT_STATE.md`; physical symbol appearance remains to be checked.

- Published only the 0.2.3 APK on a separate approved public download branch; verified fetched SHA-256 against the local build. Main remains unchanged.

## 2026-10-14 — Version 0.3.0 approved management and navigation

- Recorded D-014 and implemented schema v3 preserving first captures, old Task state/timestamps, links and prior selection. Atomic direct-Note selection, consistent task edits, retained removal, pin/selection release and versioned Undo.
- Added X form closers, Review/Library edit/removal icons, Today Task/note Copy/Edit/Remove tools via long-press and accessible activation. Centered branding and bottom icon navigation with centered + follow scrolling direction with top/short-page/tab-reset behavior. Added supported Expo Clipboard writes.
- TypeScript, eighteen SQLite tests and twelve real-storage browser tests passed, including frozen schema-v2 upgrade, migration rollback, edit/remove failures, retry/stale Undo, source preservation, clipboard/gestures, restart and scrolling. The first browser run used an obsolete manual-selection/ARIA-false expectation; corrected tests reflect approved behavior and DOM omission of false attributes. Exact build/native/download evidence is maintained in `06_CURRENT_STATE.md`.

- Both ABI builds/static verifiers and 23 Android 9 native assertions passed: preserved v2→v3 upgrade, clipboard, edit/remove/Undo, source/legacy data and offline relaunch. Native harness uses settled field-value waits and measured transient Undo touches; details/artifacts live in `06_CURRENT_STATE.md`.

- Published only the verified 0.3.0 phone APK on a separate approved public download branch; fetched SHA-256 matches the local ARM64 artifact. Main remains unchanged.

### 2026-10-18 — Startup preference recovery

Optional list preferences fall back safely after read/parse/shape failures; nonblocking warnings replace the stranded startup path. Failure-injection and restart coverage added; evidence belongs to `06_CURRENT_STATE.md`. No native version/schema change.

### 2026-10-18 — CI and draft persistence

Added PR/main quality gates and portable browser harness. Measured and reduced redundant draft KV writes with a bounded leading/trailing schedule and immediate flush barrier; fixed concurrent-edit discard loss and cleared recovered migration errors. Execution evidence and publication blocker: `06_CURRENT_STATE.md`.

### 2026-10-18 — Performance evidence

Added reproducible synthetic real-SQLite/browser benchmarks at 3,000 Notes and 1,000 task groups. Measurements do not justify repository/selector infrastructure changes on this host; Android performance remains unverified.

### 2026-10-18 — Incremental module cleanup

Extracted optional saved navigation preferences from App and all ten historical SQL definitions from repository operations. SQL text/order, schema v10, native version and Back/modal behavior are unchanged; regression evidence belongs to `06_CURRENT_STATE.md`.

### 2026-10-18 — Final local reliability validation

Fresh install, TypeScript, 52 SQLite/draft tests, all 25 browser scenarios and Android/iOS/web exports pass on source `2af8873`. Public publication/Actions execution and native-device acceptance remain unverified; exact evidence and next action are in `06_CURRENT_STATE.md`.

### 2026-10-18 — Requested Android test build

The user requested a downloadable APK after authorizing public branch publication. Bump release metadata to 0.10.3/code 20 to distinguish the reliability build from the earlier 0.10.2 APK; no dependency or schema change. Preserve the existing signing key when regenerating ignored native configuration. Verification and download status belong to `06_CURRENT_STATE.md`.

### 2026-10-18 — First Actions run feedback

The first real CI run passed 52 tests and 24/25 browser scenarios. Corrected the write-count harness to await Task composer dismissal (and thus its KV flush barrier) before restarting Chromium; the prior race could interrupt pending persistence. Runtime/source behavior is unchanged.

### 2026-10-18 — CI persistence assertions

The second Actions run passed the corrected write-count case and exposed two older harness races. Autosave recovery now waits through Saving before leaving; preference-restart coverage waits for the real SQLite KV value before closing Chromium. Assertions and product persistence guarantees are retained; no runtime code changes.

### 2026-10-18 — Confirmed CI and verified 0.10.3 ARM64 build

Published draft PR #8, corrected three CI test wait races, and confirmed passing Actions. ARM64 0.10.3/code 20 compilation/static signature/source checks pass. Public APK upload remains blocked pending explicit binary-publication approval. Native acceptance remains pending; evidence and next action: `06_CURRENT_STATE.md`.

### 2026-10-18 — Approved APK publication completed

The user explicitly approved the public APK-only branch. Published the verified 0.10.3 ARM64 test APK and independently fetched its size/SHA-256, matching the verified local binary. Download/evidence and remaining native gate: `06_CURRENT_STATE.md`.

### 2026-10-18 — Merged-main CI and documentation stabilization

Reproduced the draft-restoration CI failure with delayed real KV writes and corrected the test to await flush-confirmed sheet dismissal before restarting; retained exact restoration assertions and runtime behavior. Aligned PR #8/version/history references, refined native acceptance procedures and added a NOT RUN evidence register. D-018 remains accepted; P-008 documents an unaccepted offline recovery alternative. Validation, risks and next action are owned by `06_CURRENT_STATE.md`; no new APK or release.

Local validation and actual draft-PR CI pass on the stabilization changes; run identity and remaining native/data-security gates are recorded only in `06_CURRENT_STATE.md`.

Recorded the passing CI install’s existing, untriaged dependency advisory counts in `06_CURRENT_STATE.md`; no dependency/security fix or acceptance claim is implied.

### 2026-10-18 — User-reported 0.10.3 APK test success

Recorded the user's successful APK test report in `06_CURRENT_STATE.md`, keeping unspecified native subcases and security/data limitations explicit. Rechecked PR #9 mergeability and passing source-head CI; no runtime, APK or release change.
