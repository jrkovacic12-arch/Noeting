# Noeting — Documentation Change Log (started 2026-10-11)

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
